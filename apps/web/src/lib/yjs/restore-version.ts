import * as Y from 'yjs';
import { LOCAL_ORIGIN, Y_KEYS } from '@prostor/shared';
import { toYMap } from '@/lib/canvas/element-factory';
import { fragmentToRich, richToFragment } from '@/lib/rich-text/yjs-convert';

/** Документ версии только для чтения (просмотр) */
export function docFromState(state: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface RestoreStats {
  added: number;
  removed: number;
  changed: number;
}

/**
 * Восстановление версии как обычная правка живого документа.
 *
 * Подменить состояние целиком нельзя: CRDT вольёт обратно всё, что есть у
 * подключённых клиентов. Поэтому считаем разницу и применяем её одной
 * транзакцией с LOCAL_ORIGIN: коллеги получают обычный апдейт, а Ctrl+Z
 * отменяет восстановление целиком. Существующие Y.Map не пересоздаются —
 * меняются только отличающиеся поля, и параллельные правки других полей
 * не теряются.
 */
export function restoreVersion(live: Y.Doc, snapshotState: Uint8Array): RestoreStats {
  const snapshot = docFromState(snapshotState);
  const target = snapshot.getMap<unknown>(Y_KEYS.elements);
  const current = live.getMap<unknown>(Y_KEYS.elements);
  const stats: RestoreStats = { added: 0, removed: 0, changed: 0 };

  live.transact(() => {
    for (const id of Array.from(current.keys())) {
      if (!target.has(id)) {
        current.delete(id);
        stats.removed++;
      }
    }
    for (const [id, value] of target.entries()) {
      if (!(value instanceof Y.Map)) continue;
      const source = value as Y.Map<unknown>;
      const fields = source.toJSON() as Record<string, unknown>;
      // Форматированный текст — Y.XmlFragment: toJSON дал бы XML-строку, переносим абзацами
      delete fields.content;
      const snapContent = source.get('content');
      const snapRich =
        snapContent instanceof Y.XmlFragment ? fragmentToRich(snapContent) : undefined;
      const existing = current.get(id);
      if (!(existing instanceof Y.Map)) {
        current.set(id, toYMap(snapRich ? { ...fields, rich: snapRich } : fields));
        stats.added++;
        continue;
      }
      const map = existing as Y.Map<unknown>;
      let changed = false;
      for (const key of Array.from(map.keys())) {
        if (key !== 'content' && !(key in fields)) {
          map.delete(key);
          changed = true;
        }
      }
      for (const [key, v] of Object.entries(fields)) {
        if (!sameValue(map.get(key), v)) {
          map.set(key, v);
          changed = true;
        }
      }
      const liveContent = map.get('content');
      const liveRich =
        liveContent instanceof Y.XmlFragment ? fragmentToRich(liveContent) : undefined;
      if (!sameValue(liveRich, snapRich)) {
        if (snapRich) map.set('content', richToFragment(snapRich));
        else map.delete('content');
        changed = true;
      }
      if (changed) stats.changed++;
    }
  }, LOCAL_ORIGIN);

  snapshot.destroy();
  return stats;
}
