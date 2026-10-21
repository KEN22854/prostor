import 'server-only';
import * as encoding from 'lib0/encoding';
import * as Y from 'yjs';
import { prisma } from '@prostor/db';
import { REDIS_CHANNELS } from '@prostor/shared';
import { redis } from '@/lib/redis';

/** Совпадает с RELAY.update в apps/ws-server/src/protocol.ts */
const RELAY_UPDATE = 0;
const API_INSTANCE_ID = 'web-api';
const API_ORIGIN = Symbol('api');

/** Сообщение межинстансового канала комнаты (формат apps/ws-server/src/protocol.ts) */
function encodeRelayUpdate(update: Uint8Array): Buffer {
  const encoder = encoding.createEncoder();
  encoding.writeVarString(encoder, API_INSTANCE_ID);
  encoding.writeVarUint(encoder, RELAY_UPDATE);
  encoding.writeVarUint8Array(encoder, update);
  return Buffer.from(encoding.toUint8Array(encoder));
}

/**
 * Изменение доски со стороны сервера (REST API).
 *
 * 1. Под блокировкой строки BoardDocument (как делает WS-сервер) читаем
 *    состояние, применяем изменение и записываем результат.
 * 2. Тот же Yjs-апдейт публикуем в Redis-канал комнаты: WS-инстансы, у
 *    которых доска открыта, применяют его, и участники видят объекты сразу.
 *    Их следующее сохранение вливает состояние из БД — CRDT-мерж
 *    идемпотентен, ничего не теряется.
 */
export async function changeBoardDocument<T>(
  boardId: string,
  mutate: (doc: Y.Doc) => T,
): Promise<T> {
  const doc = new Y.Doc();
  try {
    const { result, update } = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ state: Uint8Array }>>`
        SELECT "state" FROM "BoardDocument" WHERE "boardId" = ${boardId} FOR UPDATE`;
      if (rows[0]) Y.applyUpdate(doc, rows[0].state);

      const updates: Uint8Array[] = [];
      const onUpdate = (u: Uint8Array) => updates.push(u);
      doc.on('update', onUpdate);
      let value: T;
      doc.transact(() => {
        value = mutate(doc);
      }, API_ORIGIN);
      doc.off('update', onUpdate);

      const state = new Uint8Array(Y.encodeStateAsUpdate(doc));
      await tx.boardDocument.upsert({
        where: { boardId },
        create: { boardId, state, sizeBytes: state.byteLength, version: 1 },
        update: { state, sizeBytes: state.byteLength, version: { increment: 1 } },
      });
      await tx.board.update({ where: { id: boardId }, data: { lastActivityAt: new Date() } });
      return { result: value!, update: updates.length > 0 ? Y.mergeUpdates(updates) : null };
    });
    if (update) {
      await redis()
        .publish(REDIS_CHANNELS.room(boardId), encodeRelayUpdate(update))
        .catch((error: unknown) => console.error('[board-write] relay failed', error));
    }
    return result;
  } finally {
    doc.destroy();
  }
}

/** Текущее сохранённое состояние доски (WS-сервер пишет его с задержкой ~2 с) */
export async function readBoardDocument(boardId: string): Promise<Y.Doc> {
  const doc = new Y.Doc();
  const row = await prisma.boardDocument.findUnique({
    where: { boardId },
    select: { state: true },
  });
  if (row) Y.applyUpdate(doc, row.state);
  return doc;
}
