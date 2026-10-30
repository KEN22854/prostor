import { describe, expect, it } from 'vitest';
import { erasePath, eraserStamps, pathPiece } from './erase';

/** Горизонтальный росчерк от (100, 100) до (300, 100) */
const line = {
  x: 100,
  y: 100,
  rotation: 0,
  points: [0, 0, 200, 0],
  strokeWidth: 4,
  width: 200,
  height: 0,
};

describe('erasePath', () => {
  it('не трогает росчерк, до которого ластик не дотянулся', () => {
    expect(erasePath(line, [{ x: 200, y: 150 }], 10)).toBeNull();
  });

  it('разрезает росчерк посередине на два куска', () => {
    const pieces = erasePath(line, [{ x: 200, y: 100 }], 10);
    expect(pieces).toHaveLength(2);
    const [left, right] = pieces!;
    // Левый кусок кончается до ластика с учётом полутолщины линии (10 + 2)
    expect(left![0]).toBe(0);
    expect(left![left!.length - 2]).toBeLessThan(100 - 12);
    expect(right![0]).toBeGreaterThan(100 + 12);
    expect(right![right!.length - 2]).toBe(200);
  });

  it('стирает конец росчерка — остаётся один кусок', () => {
    const pieces = erasePath(line, [{ x: 300, y: 100 }], 10);
    expect(pieces).toHaveLength(1);
    expect(pieces![0]![0]).toBe(0);
  });

  it('целиком накрытый росчерк — пустой список кусков', () => {
    const short = { ...line, points: [0, 0, 6, 0] };
    expect(erasePath(short, [{ x: 103, y: 100 }], 20)).toEqual([]);
  });

  it('учитывает поворот росчерка', () => {
    // Повёрнут на 90°: идёт от (100, 100) вниз до (100, 300)
    const rotated = { ...line, rotation: 90 };
    expect(erasePath(rotated, [{ x: 200, y: 100 }], 10)).toBeNull();
    expect(erasePath(rotated, [{ x: 100, y: 200 }], 10)).toHaveLength(2);
  });
});

describe('eraserStamps', () => {
  it('ставит отпечатки не реже чем через пол-ластика', () => {
    const stamps = eraserStamps({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(stamps.at(-1)).toEqual({ x: 100, y: 0 });
    for (let i = 1; i < stamps.length; i++)
      expect(stamps[i]!.x - stamps[i - 1]!.x).toBeLessThanOrEqual(5 + 1e-9);
  });
});

describe('pathPiece', () => {
  it('переносит начало координат куска в его левый верхний угол', () => {
    const piece = pathPiece(line, [120, 0, 200, 0], 'new');
    expect(piece).toMatchObject({ id: 'new', x: 220, y: 100, width: 80, points: [0, 0, 80, 0] });
  });

  it('с поворотом смещает начало вдоль повёрнутой оси', () => {
    const piece = pathPiece({ ...line, rotation: 90 }, [120, 0, 200, 0], 'new');
    expect(piece.x).toBeCloseTo(100);
    expect(piece.y).toBeCloseTo(220);
  });
});
