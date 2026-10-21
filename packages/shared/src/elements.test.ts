import { describe, expect, it } from 'vitest';
import { boardElementSchema, elementBounds } from './elements';

const base = {
  id: 'el1',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  zIndex: 'a0',
  createdBy: 'u1',
  createdAt: 0,
  updatedAt: 0,
};

describe('boardElementSchema', () => {
  it('валидирует стикер и проставляет дефолты', () => {
    const el = boardElementSchema.parse({ ...base, type: 'sticky', text: 'Hi', fill: '#fde68a' });
    expect(el.type).toBe('sticky');
    expect(el.rotation).toBe(0);
    expect(el.locked).toBe(false);
  });

  it('отклоняет нечётное число координат у пути', () => {
    const r = boardElementSchema.safeParse({
      ...base,
      type: 'path',
      points: [0, 0, 1],
      stroke: '#000',
      strokeWidth: 2,
    });
    expect(r.success).toBe(false);
  });

  it('принимает generic-элементы (kanban и т.п.)', () => {
    const r = boardElementSchema.safeParse({ ...base, type: 'kanban', data: { columns: [] } });
    expect(r.success).toBe(true);
  });

  it('отклоняет неизвестный тип', () => {
    expect(boardElementSchema.safeParse({ ...base, type: 'nope' }).success).toBe(false);
  });
});

describe('elementBounds', () => {
  it('без поворота совпадает с прямоугольником', () => {
    expect(elementBounds({ x: 0, y: 0, width: 10, height: 20, rotation: 0 })).toEqual({
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 20,
    });
  });

  it('поворот на 90° вокруг (x, y)', () => {
    const b = elementBounds({ x: 0, y: 0, width: 10, height: 20, rotation: 90 });
    expect(b.minX).toBeCloseTo(-20);
    expect(b.maxX).toBeCloseTo(0);
    expect(b.minY).toBeCloseTo(0);
    expect(b.maxY).toBeCloseTo(10);
  });
});
