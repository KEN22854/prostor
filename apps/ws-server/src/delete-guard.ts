import * as Y from 'yjs';
import { Y_KEYS } from '@prostor/shared';

/**
 * Серверная защита от удаления чужих (и заблокированных) объектов.
 *
 * Отбросить апдейт клиента нельзя: CRDT разойдётся, а следующие правки этого
 * клиента, зависящие от отброшенных операций, навсегда застрянут на сервере.
 * Поэтому апдейт принимается, а удалённые без права элементы сразу
 * возвращаются компенсирующей серверной транзакцией — все клиенты (и автор)
 * получают обычный апдейт и сходятся к одному состоянию.
 */
export interface GuardedElement {
  key: string;
  /** Глубокая копия элемента до удаления (с вложенными типами, напр. текстом) */
  clone: Y.Map<unknown>;
}

export interface GuardRules {
  userId: string;
  /** Политика организации разрешает удалять чужие объекты */
  canDeleteOthers: boolean;
}

/**
 * Какие элементы доски удалит update (по его delete set) и какие из них
 * удалять нельзя. Вызывается ДО применения апдейта — пока элементы живы.
 */
export function findForbiddenDeletions(doc: Y.Doc, update: Uint8Array, rules: GuardRules): GuardedElement[] {
  let ds: { clients: Map<number, Array<{ clock: number; len: number }>> };
  try {
    ds = Y.decodeUpdate(update).ds as unknown as typeof ds;
  } catch {
    return [];
  }
  if (ds.clients.size === 0) return [];
  const elements = doc.getMap<unknown>(Y_KEYS.elements);
  const result: GuardedElement[] = [];
  const store = (doc as unknown as { store: Parameters<typeof Y.getItem>[0] }).store;
  const stateVector = Y.decodeStateVector(Y.encodeStateVector(doc));

  for (const [client, ranges] of ds.clients) {
    const known = stateVector.get(client) ?? 0;
    for (const range of ranges) {
      let clock = range.clock;
      const end = Math.min(range.clock + range.len, known);
      while (clock < end) {
        let item: ReturnType<typeof Y.getItem>;
        try {
          item = Y.getItem(store, { client, clock });
        } catch {
          break;
        }
        const length = Math.max(1, item.length);
        clock = item.id.clock + length;
        if (!(item instanceof Y.Item) || item.deleted) continue;
        // Удаление записи верхнего уровня карты elements = удаление объекта доски
        if (item.parent !== (elements as unknown) || typeof item.parentSub !== 'string') continue;
        const value = item.content.getContent()[0];
        if (!(value instanceof Y.Map)) continue;
        const el = value as Y.Map<unknown>;
        const createdBy = el.get('createdBy');
        const locked = el.get('locked') === true;
        const foreign = typeof createdBy === 'string' && createdBy !== rules.userId;
        if (locked || (foreign && !rules.canDeleteOthers)) {
          result.push({ key: item.parentSub, clone: el.clone() });
        }
      }
    }
  }
  return result;
}

/** Вернуть защищённые элементы (после применения апдейта), одной транзакцией */
export function restoreElements(doc: Y.Doc, guarded: readonly GuardedElement[], origin: unknown): number {
  if (guarded.length === 0) return 0;
  const elements = doc.getMap<unknown>(Y_KEYS.elements);
  let restored = 0;
  doc.transact(() => {
    for (const g of guarded) {
      // Ключ мог быть занят заново (замена объекта) — тогда не трогаем
      if (elements.has(g.key)) continue;
      elements.set(g.key, g.clone);
      restored++;
    }
  }, origin);
  return restored;
}
