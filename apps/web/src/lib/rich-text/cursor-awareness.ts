import type { Awareness } from 'y-protocols/awareness';

/**
 * Обёртка awareness для yCursorPlugin (y-prosemirror 1.3).
 *
 * Плагин принимает имя поля для курсора (cursorStateField), но читает
 * состояние всегда из поля `cursor` — а у нас `cursor` занят указателем мыши
 * на холсте ({ x, y }), и плагин падал на нём. Адаптер отдаёт плагину
 * состояния, где `cursor` подменён полем `field`, а запись пропускает как есть.
 */
export function textCursorAwareness(awareness: Awareness, field: string): Awareness {
  const remap = (state: Record<string, unknown> | null): Record<string, unknown> | null =>
    state ? { ...state, cursor: state[field] ?? null } : state;

  const adapter = {
    get clientID() {
      return awareness.clientID;
    },
    get doc() {
      return awareness.doc;
    },
    getLocalState: () => remap(awareness.getLocalState()),
    getStates: () => {
      const mapped = new Map<number, Record<string, unknown>>();
      awareness.getStates().forEach((state, id) => {
        const next = remap(state);
        if (next) mapped.set(id, next);
      });
      return mapped;
    },
    setLocalStateField: (key: string, value: unknown) => awareness.setLocalStateField(key, value),
    on: (event: string, cb: (...args: unknown[]) => void) => awareness.on(event as 'change', cb as never),
    off: (event: string, cb: (...args: unknown[]) => void) => awareness.off(event as 'change', cb as never),
  };
  return adapter as unknown as Awareness;
}
