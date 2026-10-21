import 'server-only';
import { randomUUID } from 'node:crypto';
import * as Y from 'yjs';
import {
  prisma,
  resolveBoardAccess,
  resolveFolderAccess,
  type BoardAccess,
  type Prisma,
} from '@prostor/db';
import {
  can,
  colorForUser,
  hasRole,
  type BoardAction,
  type BoardListItem,
  type BoardRole,
  type BoardTemplateKey,
  type CreateBoardInput,
  type ListBoardsQuery,
  type UpdateBoardInput,
  type WsTokenResponse,
  boardRoomName,
  createBoardSchema,
} from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { insertElements } from '@/lib/canvas/element-factory';
import { buildTemplate } from '@/lib/templates/board-templates';
import { env } from '@/lib/env';
import { publishControl } from '@/lib/realtime';
import type { SessionUser } from '@/lib/session';
import { signWsToken } from '@/lib/ws-token';
import { audit } from '@/services/audit';
import { orgRequires2faFor, requireOrgRole } from '@/services/orgs';

const MAX_LIST = 200;

/**
 * Проверка доступа к доске для API.
 * Нет доступа → 404 (а не 403), чтобы не раскрывать существование чужих досок.
 */
export async function requireBoardAccess(
  boardId: string,
  userId: string | null,
  action: BoardAction,
): Promise<BoardAccess> {
  const access = await resolveBoardAccess(prisma, boardId, userId);
  if (!access) throw new ApiError(404, 'not_found', 'Доска не найдена');
  if (!can(access.role, action, access.policy)) {
    throw new ApiError(403, 'forbidden', 'Недостаточно прав для этого действия');
  }
  // Организация требует 2FA: без неё участник не работает с её досками (публичное чтение анонимом — можно)
  if (await orgRequires2faFor(access.orgId, userId)) {
    throw new ApiError(
      403,
      'two_factor_required',
      'Организация требует двухфакторную аутентификацию. Включите её в настройках аккаунта',
    );
  }
  return access;
}

/**
 * Доски, к которым у пользователя есть доступ — те же правила, что в resolveBoardAccess:
 * владелец, участник, папка или любой её предок (доступ наследуется вниз по дереву),
 * видимость «организация», а администраторам организации — все её доски.
 */
async function accessibleBoardsWhere(userId: string): Promise<Prisma.BoardWhereInput> {
  const [sharedFolders, adminOrgs] = await Promise.all([
    prisma.folderMember.findMany({
      where: { userId, folder: { deletedAt: null } },
      select: { folder: { select: { path: true } } },
    }),
    prisma.orgMember.findMany({
      where: { userId, role: { in: ['OWNER', 'ADMIN'] } },
      select: { orgId: true },
    }),
  ]);
  return {
    deletedAt: null,
    OR: [
      { ownerId: userId },
      { members: { some: { userId } } },
      ...sharedFolders.map((f) => ({ folder: { path: { startsWith: f.folder.path } } })),
      { visibility: 'ORGANIZATION', org: { members: { some: { userId } } } },
      ...(adminOrgs.length > 0 ? [{ orgId: { in: adminOrgs.map((o) => o.orgId) } }] : []),
    ],
  };
}

export async function listBoards(
  user: SessionUser,
  query: ListBoardsQuery,
): Promise<BoardListItem[]> {
  const and: Prisma.BoardWhereInput[] = [await accessibleBoardsWhere(user.id)];

  if (query.q) {
    // ILIKE по названию и тексту содержимого (Board.contentText обновляет WS-сервер при снапшоте)
    and.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { contentText: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  if (query.filter === 'mine') and.push({ ownerId: user.id });
  if (query.filter === 'shared') and.push({ ownerId: { not: user.id } });
  if (query.filter === 'favorites') and.push({ favorites: { some: { userId: user.id } } });
  if (query.org) and.push({ orgId: query.org });
  if (query.folder) and.push({ folderId: query.folder });

  const orderBy: Prisma.BoardOrderByWithRelationInput =
    query.sort === 'name'
      ? { title: 'asc' }
      : query.sort === 'created'
        ? { createdAt: 'desc' }
        : { lastActivityAt: 'desc' };

  const boards = await prisma.board.findMany({
    where: { AND: and },
    orderBy,
    take: MAX_LIST,
    select: {
      id: true,
      title: true,
      templateKey: true,
      thumbnailKey: true,
      objectCount: true,
      lastActivityAt: true,
      createdAt: true,
      ownerId: true,
      orgId: true,
      folderId: true,
      owner: { select: { id: true, name: true } },
      favorites: { where: { userId: user.id }, select: { userId: true } },
      members: { where: { userId: user.id }, select: { role: true } },
    },
  });

  return boards.map((b) => {
    // Упрощённая роль для UI (точная, с наследованием, — при открытии доски)
    const role: BoardRole = b.ownerId === user.id ? 'OWNER' : (b.members[0]?.role ?? 'VIEWER');
    return {
      id: b.id,
      title: b.title,
      templateKey: b.templateKey,
      // Превью рендерит worker (итерация 7); до этого — заглушка на клиенте
      thumbnailUrl: null,
      objectCount: b.objectCount,
      lastActivityAt: b.lastActivityAt.toISOString(),
      createdAt: b.createdAt.toISOString(),
      owner: { id: b.owner.id, name: b.owner.name },
      isOwner: b.ownerId === user.id,
      isFavorite: b.favorites.length > 0,
      role,
      orgId: b.orgId,
      folderId: b.folderId,
    };
  });
}

export async function createBoard(
  user: SessionUser,
  input: CreateBoardInput,
): Promise<{ id: string }> {
  const data = createBoardSchema.parse(input);
  let orgId: string | null = null;
  if (data.folderId) {
    // Создавать в папке может редактор папки (с учётом наследования); доска попадает в её организацию
    const folder = await resolveFolderAccess(prisma, data.folderId, user.id);
    if (!folder) throw new ApiError(404, 'folder_not_found', 'Папка не найдена');
    if (!hasRole(folder.role, 'EDITOR'))
      throw new ApiError(403, 'forbidden', 'Нет прав создавать доски в этой папке');
    orgId = folder.orgId;
  } else if (data.orgId) {
    await requireOrgRole(data.orgId, user.id);
    orgId = data.orgId;
  }

  const board = await prisma.board.create({
    data: {
      title: data.title,
      templateKey: data.templateKey,
      ownerId: user.id,
      folderId: data.folderId ?? null,
      orgId,
      // Доска организации по умолчанию видна всем её участникам (как пространство команды)
      ...(orgId ? { visibility: 'ORGANIZATION' as const } : {}),
      // Владелец — тоже участник: так «недавние» и lastVisitedAt работают единообразно
      members: { create: { userId: user.id, role: 'OWNER', lastVisitedAt: new Date() } },
    },
    select: { id: true },
  });
  await seedTemplate(board.id, data.templateKey, user.id);
  await audit({
    action: 'board.create',
    actorId: user.id,
    boardId: board.id,
    metadata: { templateKey: data.templateKey },
  });
  return board;
}

export async function updateBoard(
  user: SessionUser,
  boardId: string,
  input: UpdateBoardInput,
): Promise<void> {
  await requireBoardAccess(boardId, user.id, 'edit');
  await prisma.board.update({
    where: { id: boardId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
  });
  await audit({
    action: 'board.update',
    actorId: user.id,
    boardId,
    metadata: { fields: Object.keys(input) },
  });
}

/**
 * Содержимое шаблона записывается в BoardDocument до первого подключения:
 * WS-сервер загрузит его как обычное состояние. Шаблон — обычные элементы,
 * участники сразу могут их править, а Ctrl+Z не «отменяет» шаблон.
 */
async function seedTemplate(
  boardId: string,
  templateKey: BoardTemplateKey,
  userId: string,
): Promise<void> {
  const elements = buildTemplate(templateKey, userId);
  if (elements.length === 0) return;
  const doc = new Y.Doc();
  doc.transact(() => insertElements(doc, elements));
  const state = new Uint8Array(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  await prisma.$transaction([
    prisma.boardDocument.create({
      data: { boardId, state, sizeBytes: state.byteLength, version: 1 },
    }),
    prisma.board.update({ where: { id: boardId }, data: { objectCount: elements.length } }),
  ]);
}

/** Мягкое удаление (корзина). Подключённые клиенты получают 4404 через WS. */
export async function deleteBoard(user: SessionUser, boardId: string): Promise<void> {
  await requireBoardAccess(boardId, user.id, 'manage');
  await prisma.board.update({ where: { id: boardId }, data: { deletedAt: new Date() } });
  await publishControl({ type: 'board-deleted', boardId });
  await audit({ action: 'board.delete', actorId: user.id, boardId });
}

/**
 * Копия доски вместе с содержимым (Yjs-состояние копируется как есть —
 * CRDT-документ самодостаточен). История версий не копируется.
 */
export async function duplicateBoard(user: SessionUser, boardId: string): Promise<{ id: string }> {
  const access = await requireBoardAccess(boardId, user.id, 'copy');
  const source = await prisma.board.findUniqueOrThrow({
    where: { id: boardId },
    select: {
      title: true,
      description: true,
      templateKey: true,
      contentText: true,
      objectCount: true,
      document: true,
    },
  });

  const copy = await prisma.board.create({
    data: {
      title: `${source.title} (копия)`.slice(0, 120),
      description: source.description,
      templateKey: source.templateKey,
      contentText: source.contentText,
      objectCount: source.objectCount,
      ownerId: user.id,
      // Копия чужой доски не попадает в чужую организацию
      orgId: access.ownerId === user.id ? access.orgId : null,
      members: { create: { userId: user.id, role: 'OWNER', lastVisitedAt: new Date() } },
      ...(source.document
        ? {
            document: {
              create: { state: source.document.state, sizeBytes: source.document.sizeBytes },
            },
          }
        : {}),
    },
    select: { id: true },
  });
  await audit({
    action: 'board.duplicate',
    actorId: user.id,
    boardId: copy.id,
    metadata: { sourceId: boardId },
  });
  return copy;
}

export async function setFavorite(
  user: SessionUser,
  boardId: string,
  favorite: boolean,
): Promise<void> {
  await requireBoardAccess(boardId, user.id, 'view');
  if (favorite) {
    await prisma.boardFavorite.upsert({
      where: { userId_boardId: { userId: user.id, boardId } },
      create: { userId: user.id, boardId },
      update: {},
    });
  } else {
    await prisma.boardFavorite.deleteMany({ where: { userId: user.id, boardId } });
  }
}

/** Отметка визита — сортировка «недавние» и список участников */
export async function touchBoardVisit(userId: string, boardId: string): Promise<void> {
  await prisma.boardMember
    .updateMany({ where: { boardId, userId }, data: { lastVisitedAt: new Date() } })
    .catch((error: unknown) => console.error('[boards] touch visit failed', error));
}

/**
 * Токен подключения к WS. Анонимный посетитель публичной доски получает
 * случайный id и имя «Гость» — только чтение.
 */
export async function issueWsToken(
  user: SessionUser | null,
  boardId: string,
): Promise<WsTokenResponse> {
  const access = await requireBoardAccess(boardId, user?.id ?? null, 'view');

  const anonymous = user === null;
  const id = user?.id ?? `anon:${randomUUID()}`;
  const name = user?.name ?? user?.email?.split('@')[0] ?? 'Гость';
  const color = colorForUser(id);

  const { token, expiresAt } = await signWsToken({
    sub: id,
    boardId,
    role: access.role,
    name,
    color,
    anonymous,
  });

  return {
    token,
    url: env().WS_PUBLIC_URL,
    room: boardRoomName(boardId),
    role: access.role,
    policy: access.policy,
    user: { id, name, color, anonymous },
    expiresAt,
  };
}
