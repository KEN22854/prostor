import { describe, expect, it } from 'vitest';
import type { BoardElement } from '@prostor/shared';
import { patchFromTransform } from './transform-commit';

const base = {
  id: 'a',
  x: 0,
  y: 0,
  rotation: 0,
  zIndex: 'a0',
  locked: false,
  hidden: false,
  opacity: 1,
  createdBy: 'u',
  createdAt: 0,
  updatedAt: 0,
};

describe('patchFromTransform', () => {
  it('масштаб фигуры переходит в width/height, обводка не масштабируется', () => {
    const el = {
      ...base,
      type: 'shape',
      shape: 'rect',
      width: 100,
      height: 50,
    } as unknown as BoardElement;
    expect(patchFromTransform(el, { x: 10, y: 20, rotation: 45, scaleX: 2, scaleY: 3 })).toEqual({
      x: 10,
      y: 20,
      rotation: 45,
      width: 200,
      height: 150,
    });
  });

  it('у линии масштабируются точки', () => {
    const el = {
      ...base,
      type: 'arrow',
      width: 100,
      height: 0,
      points: [0, 0, 100, 40],
    } as unknown as BoardElement;
    const patch = patchFromTransform(el, { x: 0, y: 0, rotation: 0, scaleX: 2, scaleY: 0.5 });
    expect(patch.points).toEqual([0, 0, 200, 20]);
  });

  it('текст: боковая ручка — ширина, угловая — размер шрифта', () => {
    const el = {
      ...base,
      type: 'text',
      width: 200,
      height: 26,
      fontSize: 20,
      text: 'x',
    } as unknown as BoardElement;
    expect(
      patchFromTransform(el, { x: 0, y: 0, rotation: 0, scaleX: 1.5, scaleY: 1 }).fontSize,
    ).toBeUndefined();
    expect(patchFromTransform(el, { x: 0, y: 0, rotation: 0, scaleX: 2, scaleY: 2 }).fontSize).toBe(
      40,
    );
  });

  it('размер не меньше минимума', () => {
    const el = { ...base, type: 'sticky', width: 100, height: 100 } as unknown as BoardElement;
    const patch = patchFromTransform(el, { x: 0, y: 0, rotation: 0, scaleX: 0.01, scaleY: 0.01 });
    expect(patch.width).toBe(8);
    expect(patch.height).toBe(8);
  });
});
