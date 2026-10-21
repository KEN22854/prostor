import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { LOCAL_ORIGIN, Y_KEYS } from '@prostor/shared';
import { buildSticky, insertElements } from '@/lib/canvas/element-factory';
import { restoreVersion } from './restore-version';

const sticky = (id: string, text: string) => ({
  ...buildSticky({ x: 0, y: 0, fill: '#fde68a', text, userId: 'u', zIndex: `a${id}` }),
  id,
});

describe('restoreVersion', () => {
  it('возвращает состояние версии одной отменяемой транзакцией', () => {
    const live = new Y.Doc();
    insertElements(live, [sticky('a', 'было'), sticky('b', 'удалят')]);
    const version = Y.encodeStateAsUpdate(live);

    const elements = live.getMap<Y.Map<unknown>>(Y_KEYS.elements);
    const mapA = elements.get('a');
    live.transact(() => {
      mapA?.set('text', 'стало');
      elements.delete('b');
      insertElements(live, [sticky('c', 'новый')]);
    });

    const undo = new Y.UndoManager(elements, { trackedOrigins: new Set([LOCAL_ORIGIN]) });
    const stats = restoreVersion(live, version);
    expect(stats).toEqual({ added: 1, removed: 1, changed: 1 });
    expect(elements.get('a')?.get('text')).toBe('было');
    expect(elements.has('b')).toBe(true);
    expect(elements.has('c')).toBe(false);
    // Y.Map элемента «a» тот же — параллельные правки других полей не теряются
    expect(elements.get('a')).toBe(mapA);

    undo.undo();
    expect(elements.get('a')?.get('text')).toBe('стало');
    expect(elements.has('c')).toBe(true);
  });

  it('восстановление дошедшей до коллеги версии сходится у обоих', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.on('update', (u: Uint8Array) => Y.applyUpdate(b, u));
    insertElements(a, [sticky('x', '1')]);
    const version = Y.encodeStateAsUpdate(a);
    a.getMap<Y.Map<unknown>>(Y_KEYS.elements).get('x')?.set('text', '2');
    restoreVersion(a, version);
    expect(b.getMap<Y.Map<unknown>>(Y_KEYS.elements).get('x')?.get('text')).toBe('1');
  });
});

describe('restoreVersion: форматированный текст', () => {
  it('восстанавливает Y.XmlFragment, а не XML-строку', () => {
    const live = new Y.Doc();
    insertElements(live, [{ ...sticky('r', 'x'), rich: [{ runs: [{ text: 'жирно', bold: true }] }] } as never]);
    const version = Y.encodeStateAsUpdate(live);
    const map = live.getMap<Y.Map<unknown>>(Y_KEYS.elements).get('r');
    map?.set('content', new Y.XmlFragment());
    restoreVersion(live, version);
    const content = live.getMap<Y.Map<unknown>>(Y_KEYS.elements).get('r')?.get('content');
    expect(content).toBeInstanceOf(Y.XmlFragment);
    expect((content as Y.XmlFragment).toString()).toContain('жирно');
  });
});
