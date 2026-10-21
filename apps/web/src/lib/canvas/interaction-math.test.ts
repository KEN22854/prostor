import { describe, expect, it } from 'vitest';
import type { BoardElement } from '@prostor/shared';
import { hitElement, topmostAt } from './hit-test';
import { simplifyPoints } from './simplify';
import { computeSnap, snapPointToGrid } from './snapping';

const base = {
  rotation: 0,
  zIndex: 'a0',
  locked: false,
  hidden: false,
  opacity: 1,
  createdBy: 'u',
  createdAt: 0,
  updatedAt: 0,
};

function rect(
  id: string,
  x: number,
  y: number,
  w = 100,
  h = 100,
  extra: Record<string, unknown> = {},
): BoardElement {
  return {
    ...base,
    id,
    type: 'shape',
    shape: 'rect',
    x,
    y,
    width: w,
    height: h,
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 1,
    ...extra,
  } as unknown as BoardElement;
}

describe('hit-test', () => {
  it('прямоугольник с допуском', () => {
    const el = rect('a', 0, 0);
    expect(hitElement(el, { x: 50, y: 50 }, 0)).toBe(true);
    expect(hitElement(el, { x: 103, y: 50 }, 0)).toBe(false);
    expect(hitElement(el, { x: 103, y: 50 }, 4)).toBe(true);
  });

  it('учитывает поворот вокруг левого верхнего угла', () => {
    const el = rect('a', 0, 0, 100, 20, { rotation: 90 });
    // После поворота на 90° прямоугольник занимает x ∈ [-20, 0], y ∈ [0, 100]
    expect(hitElement(el, { x: -10, y: 50 }, 0)).toBe(true);
    expect(hitElement(el, { x: 50, y: 10 }, 0)).toBe(false);
  });

  it('эллипс — не попадание в угол bbox', () => {
    const el = rect('e', 0, 0, 100, 100, { shape: 'ellipse' });
    expect(hitElement(el, { x: 50, y: 50 }, 0)).toBe(true);
    expect(hitElement(el, { x: 3, y: 3 }, 0)).toBe(false);
  });

  it('линия — по расстоянию до отрезка', () => {
    const line = {
      ...base,
      id: 'l',
      type: 'line',
      x: 0,
      y: 0,
      width: 100,
      height: 0,
      points: [0, 0, 100, 0],
      stroke: '#000',
      strokeWidth: 2,
    } as unknown as BoardElement;
    expect(hitElement(line, { x: 50, y: 4 }, 4)).toBe(true);
    expect(hitElement(line, { x: 50, y: 20 }, 4)).toBe(false);
  });

  it('фрейм ловится за рамку, но не за середину', () => {
    const frame = {
      ...base,
      id: 'f',
      type: 'frame',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      title: 'F',
      fill: '#fff',
    } as unknown as BoardElement;
    expect(hitElement(frame, { x: 200, y: 150 }, 2)).toBe(false);
    expect(hitElement(frame, { x: 2, y: 150 }, 2)).toBe(true);
  });

  it('topmostAt возвращает верхний из перекрывающихся', () => {
    const bottom = rect('bottom', 0, 0);
    const top = rect('top', 50, 50);
    expect(topmostAt([bottom, top], { x: 60, y: 60 }, 0)?.id).toBe('top');
    expect(topmostAt([bottom, top], { x: 10, y: 10 }, 0)?.id).toBe('bottom');
    expect(topmostAt([bottom, top], { x: 500, y: 500 }, 0)).toBeNull();
  });
});

describe('snapping', () => {
  const other = { minX: 200, minY: 0, maxX: 300, maxY: 100 };

  it('прилипает левым краем к правому краю соседа и рисует направляющую', () => {
    const moving = { minX: 297, minY: 150, maxX: 397, maxY: 250 };
    const r = computeSnap(moving, [other], { threshold: 6, toObjects: true, gridSize: null });
    expect(r.dx).toBe(3);
    expect(r.guides[0]).toMatchObject({ x1: 300, x2: 300 });
  });

  it('центр к центру', () => {
    const moving = { minX: 0, minY: 48, maxX: 100, maxY: 148 };
    // центр по y: 98 → центр соседа 50? нет; верх 48 → верх 0? нет; верх 48 → центр 50 — да
    const r = computeSnap(moving, [other], { threshold: 6, toObjects: true, gridSize: null });
    expect(r.dy).toBe(2);
  });

  it('вне порога — к сетке', () => {
    const moving = { minX: 33, minY: 47, maxX: 133, maxY: 147 };
    const r = computeSnap(moving, [], { threshold: 6, toObjects: true, gridSize: 20 });
    expect(r).toMatchObject({ dx: 7, dy: -7 });
  });

  it('без сетки и соседей — без поправки', () => {
    const r = computeSnap({ minX: 33, minY: 47, maxX: 133, maxY: 147 }, [], {
      threshold: 6,
      toObjects: true,
      gridSize: null,
    });
    expect(r).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('snapPointToGrid', () => {
    expect(snapPointToGrid(29, 31, 20)).toEqual({ x: 20, y: 40 });
    expect(snapPointToGrid(29, 31, null)).toEqual({ x: 29, y: 31 });
  });
});

describe('simplifyPoints', () => {
  it('убирает точки на прямой', () => {
    const pts = [];
    for (let i = 0; i <= 100; i++) pts.push(i, 0);
    expect(simplifyPoints(pts, 0.5)).toEqual([0, 0, 100, 0]);
  });

  it('сохраняет излом', () => {
    const pts = [0, 0, 50, 0, 50, 50, 100, 50];
    expect(simplifyPoints([0, 0, 25, 0, 50, 0, 50, 25, 50, 50, 75, 50, 100, 50], 0.5)).toEqual(pts);
  });

  it('короткие росчерки без изменений', () => {
    expect(simplifyPoints([1, 2], 1)).toEqual([1, 2]);
    expect(simplifyPoints([1, 2, 3, 4], 1)).toEqual([1, 2, 3, 4]);
  });
});
