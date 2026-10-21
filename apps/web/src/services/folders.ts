import 'server-only';
import { prisma, resolveBoardAccess, resolveFolderAccess, type Prisma } from '@prostor/db';
import {
  hasRole,
  type AssignableRole,
  type BoardRole,
  type CreateFolderInput,
  type FolderDto,
  type FolderMemberDto,
} from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { publishControl } from '@/lib/realtime';
import type { SessionUser } from '@/lib/session';
import { audit } from '@/services/audit';
import { requireOrgRole } from '@/services/orgs';

const MAX_DEPTH = 8;
const MAX_FOLDERS = 1_000;

async function requireFolder(folderId: string, userId: string, required: BoardRole) {
  const access = await resolveFolderAccess(prisma, folderId, userId);
  if (!access) throw new ApiError(404, 'not_found', 'Папка не найдена');
  if (!hasRole(access.role, required)) throw new ApiError(403, 'forbidden', 'Недостаточно прав на папку');
  return access;
}

/** Права на доски поддерева поменялись — WS пересчитывает роли открытых подключений */
async function notifySubtree(path: string): Promise<void> {
  const boards = await prisma.board.findMany({
    where: { deletedAt: null, folder: { path: { startsWith: path } } },
    select: { id: true },
    take: 5_000,
  });
  await Promise.all(boards.map((b) => publishControl({ type: 'access-changed', boardId: b.id })));
}

/**
 * Папки рабочего пространства: личные (свои и расшаренные мне) или организации.
 * Роль считается для каждой папки (с наследованием) — дерево небольшое.
 */
export async function listFolders(user: SessionUser, orgId: string | null): Promise<FolderDto[]> {
  let where: Prisma.FolderWhereInput;
  if (orgId) {
    await requireOrgRole(orgId, user.id);
    where = { orgId, deletedAt: null };
  } else {
    // Личные папки и те, что мне открыли (вместе с их поддеревьями)
    const shared = await prisma.folderMember.findMany({
      where: { userId: user.id, folder: { deletedAt: null, orgId: null } },
      select: { folder: { select: { path: true } } },
    });
    where = {
      orgId: null,
      deletedAt: null,
      OR: [{ ownerId: user.id }, ...shared.map((s) => ({ path: { startsWith: s.folder.path } }))],
    };
  }
  const folders = await prisma.folder.findMany({
    where,
    orderBy: { name: 'asc' },
    take: MAX_FOLDERS,
    select: {
      id: true,
      name: true,
      parentId: true,
      orgId: true,
      path: true,
      _count: { select: { boards: { where: { deletedAt: null } } } },
    },
  });
  const result: FolderDto[] = [];
  for (const f of folders) {
    const access = await resolveFolderAccess(prisma, f.id, user.id);
    if (!access) continue;
    result.push({ id: f.id, name: f.name, parentId: f.parentId, orgId: f.orgId, path: f.path, role: access.role, boardCount: f._count.boards });
  }
  return result;
}

export async function createFolder(user: SessionUser, input: Required<CreateFolderInput>): Promise<FolderDto> {
  let orgId = input.orgId;
  let parentPath = '/';
  if (input.parentId) {
    const parent = await requireFolder(input.parentId, user.id, 'EDITOR');
    if (parent.path.split('/').filter(Boolean).length >= MAX_DEPTH) {
      throw new ApiError(400, 'too_deep', `Не больше ${MAX_DEPTH} уровней вложенности`);
    }
    orgId = parent.orgId;
    parentPath = parent.path;
  } else if (orgId) {
    await requireOrgRole(orgId, user.id);
  }
  // Путь включает id самой папки — создаём, затем дописываем путь (id генерирует Prisma)
  const folder = await prisma.$transaction(async (tx) => {
    const created = await tx.folder.create({
      data: { name: input.name, ownerId: user.id, orgId, parentId: input.parentId },
      select: { id: true },
    });
    return tx.folder.update({
      where: { id: created.id },
      data: { path: `${parentPath}${created.id}/` },
      select: { id: true, name: true, parentId: true, orgId: true, path: true },
    });
  });
  await audit({ action: 'folder.create', actorId: user.id, orgId, targetType: 'folder', targetId: folder.id, metadata: { name: input.name } });
  return { ...folder, role: 'OWNER', boardCount: 0 };
}

export async function updateFolder(user: SessionUser, folderId: string, input: { name?: string; parentId?: string | null }): Promise<void> {
  const folder = await requireFolder(folderId, user.id, input.parentId !== undefined ? 'OWNER' : 'EDITOR');
  if (input.name !== undefined) {
    await prisma.folder.update({ where: { id: folderId }, data: { name: input.name } });
    await audit({ action: 'folder.update', actorId: user.id, orgId: folder.orgId, targetType: 'folder', targetId: folderId, metadata: { name: input.name } });
  }
  if (input.parentId === undefined || input.parentId === folder.parentId) return;

  let newParentPath = '/';
  if (input.parentId) {
    const target = await requireFolder(input.parentId, user.id, 'EDITOR');
    // Нельзя положить папку внутрь самой себя
    if (target.path.startsWith(folder.path)) throw new ApiError(400, 'cycle', 'Нельзя переместить папку внутрь неё самой');
    if (target.orgId !== folder.orgId) throw new ApiError(400, 'cross_org', 'Папки нельзя переносить между организациями');
    newParentPath = target.path;
  }
  const oldPath = folder.path;
  const newPath = `${newParentPath}${folderId}/`;
  // Поддерево переписывается одним UPDATE: материализованный путь — префикс
  await prisma.$transaction([
    prisma.folder.update({ where: { id: folderId }, data: { parentId: input.parentId } }),
    prisma.$executeRaw`UPDATE "Folder" SET "path" = ${newPath} || substring("path" from ${oldPath.length + 1}) WHERE "path" LIKE ${`${oldPath}%`}`,
  ]);
  await audit({ action: 'folder.move', actorId: user.id, orgId: folder.orgId, targetType: 'folder', targetId: folderId, metadata: { from: folder.parentId, to: input.parentId } });
  // Унаследованные права могли смениться у всех досок поддерева
  await notifySubtree(newPath);
}

/** Удаление поддерева; доски не удаляются — переезжают в корень и остаются у владельцев */
export async function deleteFolder(user: SessionUser, folderId: string): Promise<void> {
  const folder = await requireFolder(folderId, user.id, 'OWNER');
  const subtree = await prisma.folder.findMany({ where: { path: { startsWith: folder.path } }, select: { id: true } });
  const ids = subtree.map((f) => f.id);
  await prisma.$transaction([
    prisma.board.updateMany({ where: { folderId: { in: ids } }, data: { folderId: null } }),
    prisma.folder.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } }),
  ]);
  await audit({ action: 'folder.delete', actorId: user.id, orgId: folder.orgId, targetType: 'folder', targetId: folderId, metadata: { name: folder.name, folders: ids.length } });
}

export async function listFolderMembers(user: SessionUser, folderId: string): Promise<FolderMemberDto[]> {
  const folder = await requireFolder(folderId, user.id, 'VIEWER');
  const ancestorIds = folder.path.split('/').filter(Boolean);
  const rows = await prisma.folderMember.findMany({
    where: { folderId: { in: ancestorIds } },
    select: {
      folderId: true,
      role: true,
      folder: { select: { name: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
  return rows.map((r) => ({
    userId: r.user.id,
    name: r.user.name,
    email: r.user.email,
    role: r.role,
    inheritedFrom: r.folderId === folderId ? null : r.folder.name,
  }));
}

export async function addFolderMember(user: SessionUser, folderId: string, email: string, role: AssignableRole): Promise<void> {
  const folder = await requireFolder(folderId, user.id, 'OWNER');
  const target = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!target) throw new ApiError(404, 'user_not_found', 'Пользователь с таким email не зарегистрирован');
  await prisma.folderMember.upsert({
    where: { folderId_userId: { folderId, userId: target.id } },
    create: { folderId, userId: target.id, role },
    update: { role },
  });
  await audit({ action: 'folder.member_add', actorId: user.id, orgId: folder.orgId, targetType: 'folder', targetId: folderId, metadata: { userId: target.id, role } });
  await notifySubtree(folder.path);
}

export async function removeFolderMember(user: SessionUser, folderId: string, userId: string): Promise<void> {
  const folder = await requireFolder(folderId, user.id, userId === user.id ? 'GUEST' : 'OWNER');
  await prisma.folderMember.deleteMany({ where: { folderId, userId } });
  await audit({ action: 'folder.member_remove', actorId: user.id, orgId: folder.orgId, targetType: 'folder', targetId: folderId, metadata: { userId } });
  await notifySubtree(folder.path);
}

/**
 * Перенос доски в папку (или в корень). Меняет унаследованные права, поэтому —
 * только владелец доски и только в папку, где он редактор. Папка организации
 * переводит доску в организацию.
 */
export async function moveBoard(user: SessionUser, boardId: string, folderId: string | null): Promise<void> {
  const access = await resolveBoardAccess(prisma, boardId, user.id);
  if (!access) throw new ApiError(404, 'not_found', 'Доска не найдена');
  if (access.role !== 'OWNER') throw new ApiError(403, 'forbidden', 'Перемещать доску может только владелец');
  let orgId = access.orgId;
  if (folderId) {
    const folder = await requireFolder(folderId, user.id, 'EDITOR');
    if (access.orgId && folder.orgId !== access.orgId) {
      throw new ApiError(400, 'cross_org', 'Доску организации нельзя переместить в папку вне организации');
    }
    orgId = folder.orgId;
  }
  await prisma.board.update({ where: { id: boardId }, data: { folderId, orgId } });
  await audit({ action: 'board.move', actorId: user.id, boardId, orgId, metadata: { folderId } });
  await publishControl({ type: 'access-changed', boardId });
}
