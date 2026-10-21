import * as Y from 'yjs';
import { prisma, type SnapshotReason } from '@prostor/db';
import { SNAPSHOT } from '@prostor/shared';
import { computeDocStats } from './doc-stats';

/**
 * Prisma (Bytes) ждёт Uint8Array<ArrayBuffer>, а Yjs возвращает Uint8Array<ArrayBufferLike>
 * (TS 5.7+ различает их). Копия в новый ArrayBuffer устраняет несовместимость.
 */
function toBytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(data);
}

/** Origin для апдейтов, загруженных из БД, — они не должны помечать документ «грязным» */
export const DB_ORIGIN = Symbol('db');

export async function loadDocument(boardId: string, doc: Y.Doc): Promise<void> {
  const row = await prisma.boardDocument.findUnique({
    where: { boardId },
    select: { state: true },
  });
  if (row) Y.applyUpdate(doc, row.state, DB_ORIGIN);
}

/**
 * Сохраняет актуальное состояние в BoardDocument.
 *
 * Несколько инстансов WS могут держать одну комнату. Чтобы запись одного
 * не затёрла изменения другого, которые ещё не дошли через Redis, строка
 * блокируется (SELECT … FOR UPDATE), её состояние вливается в наш документ
 * (CRDT-мерж идемпотентен), и записывается уже объединённое состояние.
 */
export async function storeDocument(boardId: string, doc: Y.Doc): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ state: Uint8Array }>>`
      SELECT "state" FROM "BoardDocument" WHERE "boardId" = ${boardId} FOR UPDATE`;
    const current = rows[0];
    if (current) Y.applyUpdate(doc, current.state, DB_ORIGIN);

    const state = toBytes(Y.encodeStateAsUpdate(doc));
    await tx.boardDocument.upsert({
      where: { boardId },
      create: { boardId, state, sizeBytes: state.byteLength, version: 1 },
      update: { state, sizeBytes: state.byteLength, version: { increment: 1 } },
    });
  });
}

export interface SnapshotInput {
  boardId: string;
  doc: Y.Doc;
  reason: SnapshotReason;
  authorIds: string[];
}

/** Снапшот в историю версий + обновление статистики доски для дашборда/поиска */
export async function createSnapshot({
  boardId,
  doc,
  reason,
  authorIds,
}: SnapshotInput): Promise<string> {
  const state = toBytes(Y.encodeStateAsUpdate(doc));
  const stats = computeDocStats(doc);

  const [snapshot] = await prisma.$transaction([
    prisma.boardSnapshot.create({
      data: {
        boardId,
        state,
        reason,
        authorIds,
        objectCount: stats.objectCount,
        sizeBytes: state.byteLength,
      },
      select: { id: true },
    }),
    prisma.board.update({
      where: { id: boardId },
      data: {
        contentText: stats.contentText,
        objectCount: stats.objectCount,
        lastActivityAt: new Date(),
      },
    }),
  ]);

  await pruneAutoSnapshots(boardId);
  return snapshot.id;
}

/**
 * Хранить все AUTO-снапшоты бессмысленно (доска, которую правят неделю,
 * дала бы тысячи версий). Оставляем последние SNAPSHOT.keepAuto;
 * MANUAL, PRE_RESTORE и прочие не трогаем.
 */
async function pruneAutoSnapshots(boardId: string): Promise<void> {
  const stale = await prisma.boardSnapshot.findMany({
    where: { boardId, reason: 'AUTO' },
    orderBy: { createdAt: 'desc' },
    skip: SNAPSHOT.keepAuto,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.boardSnapshot.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }
}

/** Аудит: сервер вернул объекты, которые пользователь удалил без права */
export async function logBlockedDeletion(
  boardId: string,
  userId: string,
  keys: string[],
): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        action: 'element.delete_blocked',
        boardId,
        actorId: userId.startsWith('anon') ? null : userId,
        metadata: { count: keys.length, elementIds: keys.slice(0, 50) },
      },
    })
    .catch((error: unknown) => console.error('[audit] blocked deletion log failed', error));
}
