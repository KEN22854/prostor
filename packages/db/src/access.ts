import type { PrismaClient } from '@prisma/client';
import { DEFAULT_POLICY, maxRole, type BoardRole, type OrgPolicy } from '@prostor/shared';

export interface BoardAccess {
  boardId: string;
  role: BoardRole;
  policy: OrgPolicy;
  title: string;
  orgId: string | null;
  ownerId: string;
  visibility: 'PRIVATE' | 'ORGANIZATION' | 'PUBLIC_READ';
}

/** Id всех папок в материализованном пути "/a/b/c/" (сама папка и её предки) */
export function folderPathIds(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/**
 * Эффективная роль пользователя на доске — единая точка правды для
 * REST API (apps/web) и WS-сервера (apps/ws-server).
 *
 * Роль = максимум из:
 *  - владелец доски → OWNER;
 *  - BoardMember.role;
 *  - FolderMember.role на папке доски или любом её предке (наследование);
 *  - участник организации при visibility = ORGANIZATION → VIEWER,
 *    OWNER/ADMIN организации → EDITOR;
 *  - visibility = PUBLIC_READ → VIEWER для всех, включая анонимов.
 *
 * userId = null — анонимный посетитель (публичная ссылка).
 * Возвращает null, если доступа нет или доска удалена.
 */
export async function resolveBoardAccess(
  prisma: PrismaClient,
  boardId: string,
  userId: string | null,
): Promise<BoardAccess | null> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      title: true,
      ownerId: true,
      orgId: true,
      visibility: true,
      deletedAt: true,
      folder: { select: { path: true } },
      org: {
        select: {
          allowExport: true,
          allowCopy: true,
          allowDeleteOthers: true,
          guestCanVote: true,
          guestCanUseTimer: true,
          allowPublicBoards: true,
        },
      },
    },
  });
  if (!board || board.deletedAt) return null;

  const roles: Array<BoardRole | null> = [];

  if (userId) {
    if (board.ownerId === userId) roles.push('OWNER');

    const folderIds = board.folder ? folderPathIds(board.folder.path) : [];
    const [member, folderMembers, orgMember] = await Promise.all([
      prisma.boardMember.findUnique({
        where: { boardId_userId: { boardId, userId } },
        select: { role: true },
      }),
      folderIds.length > 0
        ? prisma.folderMember.findMany({
            where: { userId, folderId: { in: folderIds } },
            select: { role: true },
          })
        : Promise.resolve([]),
      board.orgId
        ? prisma.orgMember.findUnique({
            where: { orgId_userId: { orgId: board.orgId, userId } },
            select: { role: true },
          })
        : Promise.resolve(null),
    ]);

    roles.push(member?.role ?? null);
    for (const fm of folderMembers) roles.push(fm.role);
    if (orgMember) {
      if (orgMember.role === 'OWNER' || orgMember.role === 'ADMIN') roles.push('EDITOR');
      else if (board.visibility === 'ORGANIZATION') roles.push('VIEWER');
    }
  }

  // Организация может запретить публичные доски — тогда ссылка перестаёт работать
  const publicAllowed = board.org?.allowPublicBoards ?? true;
  if (board.visibility === 'PUBLIC_READ' && publicAllowed) roles.push('VIEWER');

  const role = maxRole(...roles);
  if (!role) return null;

  const policy: OrgPolicy = board.org
    ? {
        allowExport: board.org.allowExport,
        allowCopy: board.org.allowCopy,
        allowDeleteOthers: board.org.allowDeleteOthers,
        guestCanVote: board.org.guestCanVote,
        guestCanUseTimer: board.org.guestCanUseTimer,
      }
    : DEFAULT_POLICY;

  return {
    boardId: board.id,
    role,
    policy,
    title: board.title,
    orgId: board.orgId,
    ownerId: board.ownerId,
    visibility: board.visibility,
  };
}

export interface FolderAccess {
  folderId: string;
  role: BoardRole;
  name: string;
  orgId: string | null;
  ownerId: string;
  parentId: string | null;
  path: string;
}

/**
 * Эффективная роль в папке — максимум из:
 *  - владелец папки или любого её предка → OWNER;
 *  - FolderMember на папке или предке (права наследуются вниз по дереву);
 *  - OWNER/ADMIN организации → EDITOR, участник организации → VIEWER
 *    (папки организации видны всем её участникам; доски внутри — по своим правилам).
 */
export async function resolveFolderAccess(
  prisma: PrismaClient,
  folderId: string,
  userId: string,
): Promise<FolderAccess | null> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { id: true, name: true, orgId: true, ownerId: true, parentId: true, path: true, deletedAt: true },
  });
  if (!folder || folder.deletedAt) return null;
  const ids = folderPathIds(folder.path);
  const [ancestors, members, orgMember] = await Promise.all([
    prisma.folder.findMany({ where: { id: { in: ids } }, select: { ownerId: true } }),
    prisma.folderMember.findMany({ where: { userId, folderId: { in: ids } }, select: { role: true } }),
    folder.orgId
      ? prisma.orgMember.findUnique({ where: { orgId_userId: { orgId: folder.orgId, userId } }, select: { role: true } })
      : Promise.resolve(null),
  ]);
  const roles: Array<BoardRole | null> = members.map((m) => m.role);
  if (ancestors.some((a) => a.ownerId === userId)) roles.push('OWNER');
  if (orgMember) roles.push(orgMember.role === 'MEMBER' ? 'VIEWER' : 'EDITOR');
  const role = maxRole(...roles);
  if (!role) return null;
  return {
    folderId: folder.id,
    role,
    name: folder.name,
    orgId: folder.orgId,
    ownerId: folder.ownerId,
    parentId: folder.parentId,
    path: folder.path,
  };
}
