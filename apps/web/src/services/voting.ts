import 'server-only';
import { prisma } from '@prostor/db';
import { can, startVotingSchema, type StartVotingInput, type VotingDto } from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { publishControl } from '@/lib/realtime';
import type { SessionUser } from '@/lib/session';
import { requireBoardAccess } from '@/services/boards';

async function changed(boardId: string): Promise<void> {
  await publishControl({ type: 'voting-changed', boardId });
}

/** Текущее голосование доски: активное или завершённое, чьи итоги ещё не скрыты */
export async function getVoting(boardId: string, userId: string | null): Promise<VotingDto | null> {
  const access = await requireBoardAccess(boardId, userId, 'view');
  const session = await prisma.voteSession.findFirst({
    where: { boardId, closedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      votesPerUser: true,
      endedAt: true,
      createdById: true,
      createdBy: { select: { name: true, email: true } },
    },
  });
  if (!session) return null;

  const [mine, totals, voters] = await Promise.all([
    userId
      ? prisma.vote.groupBy({
          by: ['elementId'],
          where: { sessionId: session.id, userId },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.vote.groupBy({
      by: ['elementId'],
      where: { sessionId: session.id },
      _count: { _all: true },
    }),
    prisma.vote.findMany({
      where: { sessionId: session.id },
      distinct: ['userId'],
      select: { userId: true },
    }),
  ]);
  const myVotes: Record<string, number> = {};
  let used = 0;
  for (const m of mine) {
    myVotes[m.elementId] = m._count._all;
    used += m._count._all;
  }
  const ended = session.endedAt !== null;
  return {
    id: session.id,
    title: session.title,
    votesPerUser: session.votesPerUser,
    status: ended ? 'ended' : 'active',
    createdByName: session.createdBy.name ?? session.createdBy.email,
    canManage:
      Boolean(userId) &&
      (session.createdById === userId || can(access.role, 'edit', access.policy)),
    canVote: Boolean(userId) && !ended && can(access.role, 'vote', access.policy),
    myVotes,
    myRemaining: Math.max(0, session.votesPerUser - used),
    totalVotes: totals.reduce((n, t) => n + t._count._all, 0),
    voters: voters.length,
    results: ended
      ? totals
          .map((t) => ({ elementId: t.elementId, count: t._count._all }))
          .sort((a, b) => b.count - a.count)
      : null,
  };
}

export async function startVoting(
  user: SessionUser,
  boardId: string,
  input: StartVotingInput,
): Promise<{ id: string }> {
  await requireBoardAccess(boardId, user.id, 'edit');
  const data = startVotingSchema.parse(input);
  const session = await prisma.$transaction(async (tx) => {
    // Одно голосование на доску: прежнее (и его итоги) закрываем
    await tx.voteSession.updateMany({
      where: { boardId, closedAt: null },
      data: { closedAt: new Date(), endedAt: new Date() },
    });
    return tx.voteSession.create({
      data: { boardId, title: data.title, votesPerUser: data.votesPerUser, createdById: user.id },
      select: { id: true },
    });
  });
  await changed(boardId);
  return session;
}

async function loadSession(sessionId: string) {
  const session = await prisma.voteSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      boardId: true,
      votesPerUser: true,
      endedAt: true,
      closedAt: true,
      createdById: true,
    },
  });
  if (!session || session.closedAt) throw new ApiError(404, 'not_found', 'Голосование не найдено');
  return session;
}

export async function castVote(
  user: SessionUser,
  sessionId: string,
  elementId: string,
): Promise<void> {
  const session = await loadSession(sessionId);
  await requireBoardAccess(session.boardId, user.id, 'vote');
  if (session.endedAt) throw new ApiError(409, 'voting_ended', 'Голосование уже завершено');
  await prisma.$transaction(async (tx) => {
    // Блокировка строки сессии: два быстрых клика не превысят лимит голосов
    await tx.$queryRaw`SELECT id FROM "VoteSession" WHERE id = ${sessionId} FOR UPDATE`;
    const used = await tx.vote.count({ where: { sessionId, userId: user.id } });
    if (used >= session.votesPerUser) {
      throw new ApiError(
        409,
        'no_votes_left',
        `Голоса закончились: у каждого ${session.votesPerUser}`,
      );
    }
    await tx.vote.create({ data: { sessionId, userId: user.id, elementId } });
  });
  await changed(session.boardId);
}

/** Забрать один свой голос с объекта */
export async function retractVote(
  user: SessionUser,
  sessionId: string,
  elementId: string,
): Promise<void> {
  const session = await loadSession(sessionId);
  await requireBoardAccess(session.boardId, user.id, 'vote');
  if (session.endedAt) throw new ApiError(409, 'voting_ended', 'Голосование уже завершено');
  const vote = await prisma.vote.findFirst({
    where: { sessionId, userId: user.id, elementId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (vote) await prisma.vote.delete({ where: { id: vote.id } });
  await changed(session.boardId);
}

async function requireManager(user: SessionUser, sessionId: string) {
  const session = await loadSession(sessionId);
  const access = await requireBoardAccess(session.boardId, user.id, 'view');
  if (session.createdById !== user.id && !can(access.role, 'edit', access.policy)) {
    throw new ApiError(403, 'forbidden', 'Управлять голосованием может ведущий или редактор');
  }
  return session;
}

export async function endVoting(user: SessionUser, sessionId: string): Promise<void> {
  const session = await requireManager(user, sessionId);
  await prisma.voteSession.update({
    where: { id: sessionId },
    data: { endedAt: session.endedAt ?? new Date() },
  });
  await changed(session.boardId);
}

/** Скрыть итоги (голосование исчезает с доски) */
export async function closeVoting(user: SessionUser, sessionId: string): Promise<void> {
  const session = await requireManager(user, sessionId);
  const now = new Date();
  await prisma.voteSession.update({
    where: { id: sessionId },
    data: { closedAt: now, endedAt: session.endedAt ?? now },
  });
  await changed(session.boardId);
}
