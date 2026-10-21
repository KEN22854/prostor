import 'server-only';
import { prisma } from '@prostor/db';
import {
  commentNotificationPayloadSchema,
  type CommentNotificationPayload,
  type NotificationDto,
} from '@prostor/shared';
import { env } from '@/lib/env';
import { emailQueue } from '@/lib/queue';
import type { SessionUser } from '@/lib/session';

const MAX_LIST = 50;

interface CommentEvent {
  boardId: string;
  threadId: string;
  commentId: string;
  actor: SessionUser;
  /** Проверенные упоминания (у всех есть доступ к доске) */
  mentions: string[];
  excerpt: string;
  isReply: boolean;
}

/**
 * Уведомления о комментарии: упомянутым — MENTION, участникам треда — COMMENT_REPLY
 * (без дублей и без автора). Письмо уходит отложенно через очередь: если человек
 * прочитал уведомление в приложении за NOTIFICATION_EMAIL_DELAY_MS, письма не будет.
 */
export async function notifyAboutComment(event: CommentEvent): Promise<void> {
  const recipients = new Map<string, 'MENTION' | 'COMMENT_REPLY'>();
  for (const id of event.mentions) recipients.set(id, 'MENTION');
  if (event.isReply) {
    const participants = await prisma.comment.findMany({
      where: { OR: [{ id: event.threadId }, { parentId: event.threadId }], deletedAt: null },
      select: { authorId: true },
      distinct: ['authorId'],
    });
    for (const p of participants) if (!recipients.has(p.authorId)) recipients.set(p.authorId, 'COMMENT_REPLY');
  }
  recipients.delete(event.actor.id);
  if (recipients.size === 0) return;

  const payload: CommentNotificationPayload = {
    boardId: event.boardId,
    threadId: event.threadId,
    commentId: event.commentId,
    actorId: event.actor.id,
    actorName: event.actor.name ?? event.actor.email ?? null,
    excerpt: event.excerpt,
  };
  const created = await prisma.$transaction(
    Array.from(recipients.entries()).map(([userId, type]) =>
      prisma.notification.create({ data: { userId, type, payload }, select: { id: true } }),
    ),
  );
  // Очередь недоступна (Redis упал) — уведомления в приложении всё равно есть
  await Promise.all(
    created.map((n) =>
      emailQueue()
        .add('notification', { kind: 'notification', notificationId: n.id }, { delay: env().NOTIFICATION_EMAIL_DELAY_MS, jobId: `notification-${n.id}` })
        .catch((error: unknown) => console.error('[notifications] enqueue failed', error)),
    ),
  );
}

export async function listNotifications(userId: string): Promise<{ items: NotificationDto[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_LIST,
      select: { id: true, type: true, payload: true, createdAt: true, readAt: true },
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  const boardIds = new Set<string>();
  const parsed = rows.map((r) => {
    const raw = r.payload as Record<string, unknown> | null;
    const comment = commentNotificationPayloadSchema.safeParse(raw);
    const boardId = comment.success ? comment.data.boardId : typeof raw?.boardId === 'string' ? raw.boardId : null;
    if (boardId) boardIds.add(boardId);
    return { row: r, comment: comment.success ? comment.data : null, boardId, raw };
  });
  const boards = await prisma.board.findMany({
    where: { id: { in: Array.from(boardIds) }, deletedAt: null },
    select: { id: true, title: true },
  });
  const titles = new Map(boards.map((b) => [b.id, b.title]));
  return {
    unread,
    items: parsed.map(({ row, comment, boardId, raw }) => ({
      id: row.id,
      type: row.type,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
      boardId,
      boardTitle: boardId ? (titles.get(boardId) ?? null) : null,
      actorName: comment?.actorName ?? (typeof raw?.actorName === 'string' ? raw.actorName : null),
      threadId: comment?.threadId ?? null,
      excerpt: comment?.excerpt ?? null,
    })),
  };
}

/** Отметить прочитанными: конкретные или все */
export async function markRead(userId: string, ids: string[] | null): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
}

/** Открыл тред — уведомления о нём прочитаны */
export async function markThreadRead(userId: string, threadId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null, payload: { path: ['threadId'], equals: threadId } },
    data: { readAt: new Date() },
  });
}
