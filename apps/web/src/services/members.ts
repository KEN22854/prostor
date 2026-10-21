import 'server-only';
import { prisma } from '@prostor/db';
import {
  grantableRoles,
  hasRole,
  type AssignableRole,
  type BoardMemberDto,
  type BoardVisibilityValue,
  type SharingStateDto,
} from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { publishControl } from '@/lib/realtime';
import type { SessionUser } from '@/lib/session';
import { audit } from '@/services/audit';
import { requireBoardAccess } from '@/services/boards';
import { listActiveInvites } from '@/services/invites';

/** Состояние доступа к доске для ShareDialog и страницы настроек */
export async function getSharingState(
  user: SessionUser,
  boardId: string,
): Promise<SharingStateDto> {
  const access = await requireBoardAccess(boardId, user.id, 'view');
  const [board, members] = await Promise.all([
    prisma.board.findUniqueOrThrow({
      where: { id: boardId },
      select: { visibility: true, orgId: true, org: { select: { allowPublicBoards: true } } },
    }),
    prisma.boardMember.findMany({
      where: { boardId },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }),
  ]);

  const list: BoardMemberDto[] = members.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    image: m.user.image,
    role: m.userId === access.ownerId ? 'OWNER' : m.role,
    isOwner: m.userId === access.ownerId,
    isYou: m.userId === user.id,
    lastVisitedAt: m.lastVisitedAt?.toISOString() ?? null,
  }));
  // Владелец первым, затем по роли и имени
  const rank = { OWNER: 0, EDITOR: 1, VIEWER: 2, GUEST: 3 } as const;
  list.sort(
    (a, b) =>
      rank[a.role] - rank[b.role] || (a.name ?? a.email).localeCompare(b.name ?? b.email, 'ru'),
  );

  const canShare = hasRole(access.role, 'EDITOR');
  return {
    boardId,
    title: access.title,
    visibility: board.visibility,
    inOrganization: board.orgId !== null,
    publicAllowed: board.org?.allowPublicBoards ?? true,
    yourRole: access.role,
    grantableRoles: grantableRoles(access.role),
    canManage: access.role === 'OWNER',
    members: list,
    invites: canShare ? await listActiveInvites(boardId) : [],
  };
}

/** Смена роли участника — только владелец; роль владельца не меняется */
export async function updateMemberRole(
  user: SessionUser,
  boardId: string,
  memberId: string,
  role: AssignableRole,
): Promise<void> {
  const access = await requireBoardAccess(boardId, user.id, 'manage');
  if (memberId === access.ownerId)
    throw new ApiError(400, 'owner_role', 'Роль владельца изменить нельзя');
  const { count } = await prisma.boardMember.updateMany({
    where: { boardId, userId: memberId },
    data: { role },
  });
  if (count === 0) throw new ApiError(404, 'not_found', 'Участник не найден');
  await audit({
    action: 'member.role_change',
    actorId: user.id,
    boardId,
    targetType: 'User',
    targetId: memberId,
    metadata: { role },
  });
  // Подключённый участник сразу получает новые права (VIEWER — без записи)
  await publishControl({ type: 'access-changed', boardId });
}

/**
 * Удаление участника — владелец; любой участник может выйти сам.
 * Если доступ остался через папку/организацию/публичность, WS-сервер это учтёт.
 */
export async function removeMember(
  user: SessionUser,
  boardId: string,
  memberId: string,
): Promise<void> {
  const self = memberId === user.id;
  const access = await requireBoardAccess(boardId, user.id, self ? 'view' : 'manage');
  if (memberId === access.ownerId)
    throw new ApiError(400, 'owner_remove', 'Владельца нельзя удалить с доски');
  const { count } = await prisma.boardMember.deleteMany({ where: { boardId, userId: memberId } });
  if (count === 0) throw new ApiError(404, 'not_found', 'Участник не найден');
  await audit({
    action: 'member.remove',
    actorId: user.id,
    boardId,
    targetType: 'User',
    targetId: memberId,
    metadata: { self },
  });
  await publishControl({ type: 'access-changed', boardId });
}

export async function setVisibility(
  user: SessionUser,
  boardId: string,
  visibility: BoardVisibilityValue,
): Promise<void> {
  await requireBoardAccess(boardId, user.id, 'manage');
  const board = await prisma.board.findUniqueOrThrow({
    where: { id: boardId },
    select: { visibility: true, orgId: true, org: { select: { allowPublicBoards: true } } },
  });
  if (visibility === 'ORGANIZATION' && !board.orgId) {
    throw new ApiError(400, 'no_organization', 'Доска не принадлежит организации');
  }
  if (visibility === 'PUBLIC_READ' && board.org && !board.org.allowPublicBoards) {
    throw new ApiError(403, 'public_disabled', 'Публичные доски запрещены настройками организации');
  }
  if (board.visibility === visibility) return;
  await prisma.board.update({ where: { id: boardId }, data: { visibility } });
  await audit({
    action: 'board.visibility_change',
    actorId: user.id,
    boardId,
    metadata: { from: board.visibility, to: visibility },
  });
  // Приватная доска: анонимные зрители отключаются немедленно
  await publishControl({ type: 'access-changed', boardId });
}
