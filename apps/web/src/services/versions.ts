import 'server-only';
import * as Y from 'yjs';
import { prisma } from '@prostor/db';
import { LIMITS, Y_KEYS, type BoardVersionDto, type SnapshotReasonValue } from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { rateLimit } from '@/lib/rate-limit';
import type { SessionUser } from '@/lib/session';
import { audit } from '@/services/audit';
import { requireBoardAccess } from '@/services/boards';

const MAX_LIST = 200;

interface RequestMeta {
  ip: string;
  userAgent: string | null;
}

/** История доступна редакторам: в старых версиях может быть удалённое, и откат — правка */
export async function listVersions(user: SessionUser, boardId: string): Promise<BoardVersionDto[]> {
  await requireBoardAccess(boardId, user.id, 'edit');
  const rows = await prisma.boardSnapshot.findMany({
    where: { boardId },
    orderBy: { createdAt: 'desc' },
    take: MAX_LIST,
    select: {
      id: true,
      createdAt: true,
      reason: true,
      label: true,
      objectCount: true,
      sizeBytes: true,
      authorIds: true,
      createdBy: { select: { name: true, email: true } },
    },
  });
  const authorIds = Array.from(new Set(rows.flatMap((r) => r.authorIds)));
  const authors = authorIds.length
    ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nameOf = new Map(authors.map((a) => [a.id, a.name ?? a.email]));
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    reason: r.reason,
    label: r.label,
    objectCount: r.objectCount,
    sizeBytes: r.sizeBytes,
    createdByName: r.createdBy ? (r.createdBy.name ?? r.createdBy.email) : null,
    authorNames: r.authorIds.map((id) => nameOf.get(id)).filter((n): n is string => Boolean(n)),
  }));
}

export async function getVersionState(user: SessionUser, boardId: string, versionId: string): Promise<Uint8Array> {
  await requireBoardAccess(boardId, user.id, 'edit');
  const row = await prisma.boardSnapshot.findFirst({
    where: { id: versionId, boardId },
    select: { state: true },
  });
  if (!row) throw new ApiError(404, 'not_found', 'Версия не найдена');
  return row.state;
}

/**
 * Ручная версия (и «перед восстановлением»).
 *
 * Состояние присылает клиент: у него полный документ, а BoardDocument на сервере
 * отстаёт на debounce WS-сервера. Клиентское состояние сливается с сохранённым
 * (CRDT-мерж), поэтому версия не потеряет то, чего нет у клиента. Редактор и так
 * может менять доску — подменить чужие правки задним числом этим нельзя.
 */
export async function createVersion(
  user: SessionUser,
  boardId: string,
  input: { update: Uint8Array; label?: string; reason: Extract<SnapshotReasonValue, 'MANUAL' | 'PRE_RESTORE'> },
  meta: RequestMeta,
): Promise<{ id: string }> {
  await requireBoardAccess(boardId, user.id, 'edit');
  const limit = await rateLimit(`versions:user:${user.id}`, 60, 60 * 60);
  if (!limit.ok) throw new ApiError(429, 'rate_limited', 'Слишком много версий подряд. Попробуйте позже');
  if (input.update.byteLength === 0 || input.update.byteLength > LIMITS.maxYjsUpdateBytes) {
    throw new ApiError(400, 'invalid_state', 'Некорректное состояние доски');
  }

  const stored = await prisma.boardDocument.findUnique({ where: { boardId }, select: { state: true } });
  const doc = new Y.Doc();
  try {
    if (stored) Y.applyUpdate(doc, stored.state);
    Y.applyUpdate(doc, input.update);
  } catch {
    doc.destroy();
    throw new ApiError(400, 'invalid_state', 'Некорректное состояние доски');
  }
  const state = new Uint8Array(Y.encodeStateAsUpdate(doc));
  const objectCount = doc.getMap(Y_KEYS.elements).size;
  doc.destroy();

  const snapshot = await prisma.boardSnapshot.create({
    data: {
      boardId,
      state,
      reason: input.reason,
      label: input.label || null,
      createdById: user.id,
      authorIds: [user.id],
      objectCount,
      sizeBytes: state.byteLength,
    },
    select: { id: true },
  });
  if (input.reason === 'MANUAL') {
    await audit({ action: 'board.version_create', actorId: user.id, boardId, targetId: snapshot.id, ...meta });
  }
  return snapshot;
}

/** Откат применяет клиент (как обычную правку — с undo); здесь проверка прав и аудит */
export async function recordRestore(user: SessionUser, boardId: string, versionId: string, meta: RequestMeta): Promise<void> {
  await requireBoardAccess(boardId, user.id, 'edit');
  const exists = await prisma.boardSnapshot.count({ where: { id: versionId, boardId } });
  if (!exists) throw new ApiError(404, 'not_found', 'Версия не найдена');
  await audit({ action: 'board.version_restore', actorId: user.id, boardId, targetType: 'snapshot', targetId: versionId, ...meta });
}
