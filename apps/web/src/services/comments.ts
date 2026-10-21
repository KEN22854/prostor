import 'server-only';
import { prisma, resolveBoardAccess, type Prisma } from '@prostor/db';
import {
  can,
  commentPlainText,
  parseMentions,
  type CommentDto,
  type CommentThreadDto,
  type CreateCommentInput,
  type ReactionDto,
} from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { publishControl } from '@/lib/realtime';
import type { SessionUser } from '@/lib/session';
import { requireBoardAccess } from '@/services/boards';
import { notifyAboutComment } from '@/services/notifications';

const MAX_THREADS = 500;
const MAX_MENTIONS = 20;

const commentSelect = {
  id: true,
  boardId: true,
  elementId: true,
  x: true,
  y: true,
  parentId: true,
  authorId: true,
  body: true,
  createdAt: true,
  editedAt: true,
  resolvedAt: true,
  deletedAt: true,
  author: { select: { name: true, email: true } },
  reactions: { select: { emoji: true, userId: true } },
} satisfies Prisma.CommentSelect;

type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

interface Viewer {
  userId: string | null;
  canModerate: boolean;
}

function reactionsOf(row: CommentRow, userId: string | null): ReactionDto[] {
  const byEmoji = new Map<string, ReactionDto>();
  for (const r of row.reactions) {
    const entry = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    entry.count++;
    if (r.userId === userId) entry.mine = true;
    byEmoji.set(r.emoji, entry);
  }
  return Array.from(byEmoji.values());
}

function toDto(row: CommentRow, viewer: Viewer): CommentDto {
  const own = row.authorId === viewer.userId;
  return {
    id: row.id,
    authorId: row.authorId,
    authorName: row.author.name ?? row.author.email,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    reactions: reactionsOf(row, viewer.userId),
    canEdit: own,
    canDelete: own || viewer.canModerate,
  };
}

/** Треды доски с ответами; удалённые комментарии не отдаём */
export async function listThreads(
  boardId: string,
  userId: string | null,
): Promise<CommentThreadDto[]> {
  const access = await requireBoardAccess(boardId, userId, 'view');
  const rows = await prisma.comment.findMany({
    where: { boardId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: MAX_THREADS * 10,
    select: commentSelect,
  });
  const viewer: Viewer = { userId, canModerate: access.role === 'OWNER' };
  const canResolveAny = can(access.role, 'edit', access.policy);
  const threads = new Map<string, CommentThreadDto>();
  for (const row of rows) {
    if (row.parentId) continue;
    threads.set(row.id, {
      ...toDto(row, viewer),
      elementId: row.elementId,
      x: row.x,
      y: row.y,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      canResolve: Boolean(userId) && (canResolveAny || row.authorId === userId),
      replies: [],
    });
  }
  for (const row of rows) {
    if (row.parentId) threads.get(row.parentId)?.replies.push(toDto(row, viewer));
  }
  return Array.from(threads.values()).slice(-MAX_THREADS);
}

async function loadComment(commentId: string): Promise<CommentRow> {
  const row = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    select: commentSelect,
  });
  if (!row) throw new ApiError(404, 'not_found', 'Комментарий не найден');
  return row;
}

/** Упомянуть можно только тех, у кого есть доступ к доске (иначе — утечка содержимого) */
async function validMentions(boardId: string, body: string, actorId: string): Promise<string[]> {
  const ids = parseMentions(body)
    .filter((id) => id !== actorId)
    .slice(0, MAX_MENTIONS);
  const checks = await Promise.all(
    ids.map(async (id) => ((await resolveBoardAccess(prisma, boardId, id)) ? id : null)),
  );
  return checks.filter((id): id is string => id !== null);
}

function changed(boardId: string, threadId: string): Promise<void> {
  return publishControl({ type: 'comments-changed', boardId, threadId });
}

export async function createComment(
  user: SessionUser,
  boardId: string,
  input: CreateCommentInput,
): Promise<{ id: string; threadId: string }> {
  await requireBoardAccess(boardId, user.id, 'comment');
  let threadId: string | null = null;
  if (input.parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: input.parentId, boardId, deletedAt: null },
      select: { id: true, parentId: true },
    });
    if (!parent) throw new ApiError(404, 'not_found', 'Тред не найден');
    // Ответы — только в корень треда (глубина 1)
    threadId = parent.parentId ?? parent.id;
  }
  const mentions = await validMentions(boardId, input.body, user.id);
  const comment = await prisma.comment.create({
    data: {
      boardId,
      authorId: user.id,
      body: input.body,
      mentions,
      parentId: threadId,
      ...(threadId
        ? {}
        : { elementId: input.elementId ?? null, x: input.x ?? null, y: input.y ?? null }),
    },
    select: { id: true },
  });
  const root = threadId ?? comment.id;
  await changed(boardId, root);
  // Уведомления не должны ломать отправку комментария
  await notifyAboutComment({
    boardId,
    threadId: root,
    commentId: comment.id,
    actor: user,
    mentions,
    excerpt: commentPlainText(input.body).slice(0, 300),
    isReply: Boolean(threadId),
  }).catch((error: unknown) => console.error('[comments] notify failed', error));
  return { id: comment.id, threadId: root };
}

export async function updateComment(
  user: SessionUser,
  commentId: string,
  body: string,
): Promise<void> {
  const row = await loadComment(commentId);
  await requireBoardAccess(row.boardId, user.id, 'comment');
  if (row.authorId !== user.id)
    throw new ApiError(403, 'forbidden', 'Можно править только свои комментарии');
  const mentions = await validMentions(row.boardId, body, user.id);
  await prisma.comment.update({
    where: { id: commentId },
    data: { body, mentions, editedAt: new Date() },
  });
  await changed(row.boardId, row.parentId ?? row.id);
}

/** Удаление: автор или владелец доски; удаление корня скрывает весь тред */
export async function deleteComment(user: SessionUser, commentId: string): Promise<void> {
  const row = await loadComment(commentId);
  const access = await requireBoardAccess(row.boardId, user.id, 'view');
  if (row.authorId !== user.id && access.role !== 'OWNER') {
    throw new ApiError(403, 'forbidden', 'Удалять чужие комментарии может только владелец доски');
  }
  const now = new Date();
  await prisma.comment.updateMany({
    where: row.parentId ? { id: row.id } : { OR: [{ id: row.id }, { parentId: row.id }] },
    data: { deletedAt: now },
  });
  await changed(row.boardId, row.parentId ?? row.id);
}

export async function resolveThread(
  user: SessionUser,
  commentId: string,
  resolved: boolean,
): Promise<void> {
  const row = await loadComment(commentId);
  if (row.parentId) throw new ApiError(400, 'not_thread', 'Решённым отмечается тред целиком');
  const access = await requireBoardAccess(row.boardId, user.id, 'comment');
  if (row.authorId !== user.id && !can(access.role, 'edit', access.policy)) {
    throw new ApiError(403, 'forbidden', 'Закрыть тред может автор или редактор');
  }
  await prisma.comment.update({
    where: { id: row.id },
    data: { resolvedAt: resolved ? new Date() : null },
  });
  await changed(row.boardId, row.id);
}

export async function toggleReaction(
  user: SessionUser,
  commentId: string,
  emoji: string,
): Promise<void> {
  const row = await loadComment(commentId);
  await requireBoardAccess(row.boardId, user.id, 'comment');
  const existing = await prisma.reaction.findUnique({
    where: { commentId_userId_emoji: { commentId, userId: user.id, emoji } },
    select: { id: true },
  });
  if (existing) await prisma.reaction.delete({ where: { id: existing.id } });
  else
    await prisma.reaction
      .create({ data: { commentId, userId: user.id, emoji } })
      .catch(() => undefined);
  await changed(row.boardId, row.parentId ?? row.id);
}
