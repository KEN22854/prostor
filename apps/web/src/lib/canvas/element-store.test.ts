import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { ElementStore } from './element-store';
import { toYMap } from './element-factory';

function sticky(id: string, x: number, y: number, zIndex: string): Record<string, unknown> {
  return {
    id,
    type: 'sticky',
    x,
    y,
    width: 100,
    height: 100,
    rotation: 0,
    zIndex,
    text: id,
    fill: '#ff0',
  };
}

function setup() {
  const doc = new Y.Doc();
  const elements = doc.getMap<unknown>('elements');
  return { doc, elements };
}

describe('ElementStore', () => {
  it('загружает существующие элементы и находит их по области', () => {
    const { elements } = setup();
    elements.set('a', toYMap(sticky('a', 0, 0, 'a1')));
    elements.set('b', toYMap(sticky('b', 5000, 5000, 'a0')));
    const store = new ElementStore(elements);

    expect(store.size).toBe(2);
    expect(store.query({ minX: -10, minY: -10, maxX: 200, maxY: 200 }).map((e) => e.id)).toEqual([
      'a',
    ]);
    expect(store.extent()).toEqual({ minX: 0, minY: 0, maxX: 5100, maxY: 5100 });
  });

  it('сортирует результат по zIndex (fractional index)', () => {
    const { elements } = setup();
    elements.set('top', toYMap(sticky('top', 0, 0, 'a2')));
    elements.set('bottom', toYMap(sticky('bottom', 10, 10, 'a0')));
    elements.set('middle', toYMap(sticky('middle', 20, 20, 'a1')));
    const store = new ElementStore(elements);
    expect(store.query({ minX: 0, minY: 0, maxX: 500, maxY: 500 }).map((e) => e.id)).toEqual([
      'bottom',
      'middle',
      'top',
    ]);
  });

  it('точечно обновляет изменённый элемент, не трогая ссылки остальных', () => {
    const { doc, elements } = setup();
    elements.set('a', toYMap(sticky('a', 0, 0, 'a0')));
    elements.set('b', toYMap(sticky('b', 300, 0, 'a1')));
    const store = new ElementStore(elements);
    const listener = vi.fn();
    store.subscribe(listener);

    const beforeA = store.get('a');
    const beforeB = store.get('b');
    doc.transact(() => {
      (elements.get('a') as Y.Map<unknown>).set('x', 1000);
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get('a')).not.toBe(beforeA);
    expect(store.get('a')?.x).toBe(1000);
    expect(store.get('b')).toBe(beforeB);
    // R-tree переехал вместе с элементом
    expect(store.query({ minX: 950, minY: -10, maxX: 1200, maxY: 200 }).map((e) => e.id)).toEqual([
      'a',
    ]);
  });

  it('удаление и скрытие убирают элемент из выборки', () => {
    const { elements } = setup();
    elements.set('a', toYMap(sticky('a', 0, 0, 'a0')));
    elements.set('b', toYMap(sticky('b', 0, 0, 'a1')));
    const store = new ElementStore(elements);
    elements.delete('a');
    (elements.get('b') as Y.Map<unknown>).set('hidden', true);
    expect(store.query({ minX: -1, minY: -1, maxX: 200, maxY: 200 })).toEqual([]);
    expect(store.size).toBe(1);
  });

  it('пропускает элементы неизвестного типа', () => {
    const { elements } = setup();
    elements.set('x', toYMap({ type: 'unknown', x: 0, y: 0 }));
    expect(new ElementStore(elements).size).toBe(0);
  });

  it('габариты линии считаются по точкам', () => {
    const { elements } = setup();
    elements.set(
      'l',
      toYMap({
        type: 'line',
        x: 100,
        y: 100,
        width: 0,
        height: 0,
        zIndex: 'a0',
        points: [0, 0, 300, 50],
        strokeWidth: 4,
      }),
    );
    const store = new ElementStore(elements);
    expect(store.query({ minX: 350, minY: 120, maxX: 420, maxY: 160 }).map((e) => e.id)).toEqual([
      'l',
    ]);
  });
});
