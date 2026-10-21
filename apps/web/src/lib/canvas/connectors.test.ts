import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  DEFAULT_POLICY,
  LOCAL_ORIGIN,
  Y_KEYS,
  type BoardElement,
  type LineElement,
} from '@prostor/shared';
import { BoardActions } from './board-actions';
import { cloneForPaste } from './clipboard';
import {
  anchorAt,
  borderPoint,
  curvedPoints,
  elbowPoints,
  lineEnds,
  midpointOf,
  routeLine,
} from './connectors';
import { buildLine, buildShape, insertElements } from './element-factory';
import { ElementStore } from './element-store';

const shape = (id: string, x: number, y: number, extra: Partial<BoardElement> = {}) =>
  ({
    ...buildShape({
      x,
      y,
      width: 100,
      height: 50,
      shape: 'rect',
      fill: '#fff',
      stroke: '#000',
      userId: 'me',
      zIndex: `a${id}`,
    }),
    id,
    ...extra,
  }) as BoardElement;

const arrow = (extra: Partial<LineElement> = {}): LineElement => ({
  ...buildLine({
    type: 'arrow',
    x: 0,
    y: 0,
    dx: 10,
    dy: 0,
    stroke: '#000',
    strokeWidth: 2,
    userId: 'me',
    zIndex: 'b0',
  }),
  id: 'L',
  ...extra,
});

describe('геометрия коннекторов', () => {
  it('точка на границе прямоугольника по лучу из центра (+ зазор)', () => {
    const box = shape('A', 0, 0);
    expect(borderPoint(box, { x: 500, y: 25 }, 0)).toEqual({ x: 100, y: 25 });
    expect(borderPoint(box, { x: 50, y: -300 }, 4)).toEqual({ x: 50, y: -4 });
  });

  it('эллипс: точка на эллипсе, а не на углу bbox', () => {
    const ellipse = shape('E', 0, 0, { shape: 'ellipse', width: 100, height: 100 } as never);
    const p = borderPoint(ellipse, { x: 1000, y: 1000 }, 0);
    expect(Math.hypot(p.x - 50, p.y - 50)).toBeCloseTo(50);
  });

  it('повёрнутый объект: граница считается в его системе координат', () => {
    const rotated = shape('R', 100, 0, { rotation: 90 });
    // После поворота на 90° вокруг (100,0) объект занимает x∈[50,100], y∈[0,100]
    const p = borderPoint(rotated, { x: 75, y: 500 }, 0);
    expect(p.x).toBeCloseTo(75);
    expect(p.y).toBeCloseTo(100);
  });

  it('отпущен у середины стороны — привязка к стороне, иначе auto', () => {
    const box = shape('A', 0, 0);
    expect(anchorAt(box, { x: 98, y: 26 }, 5)).toBe('right');
    expect(anchorAt(box, { x: 20, y: 20 }, 5)).toBe('auto');
  });

  it('ломаная: только горизонтальные и вертикальные отрезки', () => {
    const pts = elbowPoints({ x: 0, y: 0 }, 'right', { x: 200, y: 100 }, 'left');
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 200, y: 100 });
  });

  it('кривая: три точки, середина смещена в сторону', () => {
    const pts = curvedPoints({ x: 0, y: 0 }, { x: 200, y: 0 });
    expect(pts).toHaveLength(3);
    expect(pts[1]!.x).toBeCloseTo(100);
    expect(Math.abs(pts[1]!.y)).toBeGreaterThan(10);
  });

  it('стрелка между двумя объектами садится на их границы', () => {
    const a = shape('A', 0, 0);
    const b = shape('B', 300, 0);
    const line = arrow({
      startBinding: { elementId: 'A', anchor: 'auto' },
      endBinding: { elementId: 'B', anchor: 'auto' },
    });
    const g = routeLine(line, (id) => ({ A: a, B: b })[id])!;
    const ends = lineEnds({ ...line, ...g });
    expect(ends.start).toEqual({ x: 104, y: 25 });
    expect(ends.end).toEqual({ x: 296, y: 25 });
  });

  it('середина ломаной по длине — место подписи', () => {
    expect(midpointOf([0, 0, 100, 0, 100, 100])).toEqual({ x: 100, y: 0 });
  });
});

function setup() {
  const doc = new Y.Doc();
  const store = new ElementStore(doc.getMap(Y_KEYS.elements));
  const undo = new Y.UndoManager(doc.getMap(Y_KEYS.elements), {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
  });
  const actions = new BoardActions({
    doc,
    store,
    userId: 'me',
    role: 'EDITOR',
    policy: DEFAULT_POLICY,
    undoManager: undo,
  });
  doc.transact(() => insertElements(doc, [shape('A', 0, 0), shape('B', 300, 0)]), 'setup');
  return { doc, store, undo, actions };
}

describe('привязанные стрелки в BoardActions', () => {
  it('созданная с привязками стрелка сразу садится на границы', () => {
    const { store, actions } = setup();
    actions.create([
      arrow({
        startBinding: { elementId: 'A', anchor: 'auto' },
        endBinding: { elementId: 'B', anchor: 'auto' },
      }),
    ]);
    const ends = lineEnds(store.get('L') as LineElement);
    expect(ends.start.x).toBe(104);
    expect(ends.end.x).toBe(296);
  });

  it('стрелка едет за перемещаемым объектом, тем же шагом отмены', () => {
    const { store, actions, undo } = setup();
    actions.create([
      arrow({
        startBinding: { elementId: 'A', anchor: 'auto' },
        endBinding: { elementId: 'B', anchor: 'auto' },
      }),
    ]);
    undo.stopCapturing();
    actions.beginGesture();
    actions.moveFrom(actions.movable(['B']), 0, 200, true);
    const moved = lineEnds(store.get('L') as LineElement);
    expect(moved.start.y).toBeGreaterThan(25); // начало «смотрит» вниз, на новое место B
    // Конец — у верхней границы B (луч к A выходит через неё) с зазором вдоль луча
    expect(moved.end.x).toBeGreaterThan(300);
    expect(moved.end.y).toBeGreaterThan(195);
    expect(moved.end.y).toBeLessThan(200);
    undo.stopCapturing();
    undo.undo();
    const back = lineEnds(store.get('L') as LineElement);
    expect(back.end).toEqual({ x: 296, y: 25 });
    expect(store.get('B')).toMatchObject({ y: 0 });
  });

  it('изменение размера объекта тоже пересчитывает стрелку', () => {
    const { store, actions } = setup();
    actions.create([arrow({ endBinding: { elementId: 'B', anchor: 'left' } })]);
    actions.update(new Map([['B', { height: 200 }]]));
    expect(lineEnds(store.get('L') as LineElement).end).toEqual({ x: 296, y: 100 });
  });

  it('перенесённая отдельно стрелка отрывается от оставшихся объектов', () => {
    const { store, actions } = setup();
    actions.create([
      arrow({
        startBinding: { elementId: 'A', anchor: 'auto' },
        endBinding: { elementId: 'B', anchor: 'auto' },
      }),
    ]);
    actions.moveFrom(actions.movable(['L']), 0, 300, true);
    actions.detachMoved(['L']);
    const line = store.get('L') as LineElement;
    expect(line.startBinding).toBeUndefined();
    expect(line.endBinding).toBeUndefined();
    expect(lineEnds(line).start.y).toBeCloseTo(325);
  });

  it('копия стрелки без объектов — без привязок, вместе с объектом — к копии', () => {
    const line = arrow({ startBinding: { elementId: 'A', anchor: 'auto' } });
    const [alone] = cloneForPaste([line], { dx: 0, dy: 0, userId: 'me', maxZ: 'a0' });
    expect((alone as LineElement).startBinding).toBeUndefined();
    const copies = cloneForPaste([shape('A', 0, 0), line], {
      dx: 0,
      dy: 0,
      userId: 'me',
      maxZ: 'a0',
    });
    const copyA = copies.find((c) => c.type === 'shape')!;
    const copyL = copies.find((c) => c.type === 'arrow') as LineElement;
    expect(copyL.startBinding?.elementId).toBe(copyA.id);
  });
});

describe('смена маршрута', () => {
  it('ломаная после правки routing — точки поворотов', () => {
    const { store, actions } = setup();
    actions.create([
      arrow({
        startBinding: { elementId: 'A', anchor: 'auto' },
        endBinding: { elementId: 'B', anchor: 'auto' },
      }),
    ]);
    actions.moveFrom(actions.movable(['B']), 0, 300, true);
    actions.update(new Map([['L', { routing: 'elbow' }]]));
    expect((store.get('L') as LineElement).points.length).toBeGreaterThan(4);
  });
});
