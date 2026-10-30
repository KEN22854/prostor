import { describe, expect, it } from 'vitest';
import { buildPath, buildShape } from './element-factory';
import { touchesRect } from './hit-test';

const base = { userId: 'u', zIndex: 'a0' };
const box = (minX: number, minY: number, maxX: number, maxY: number) => ({
  minX,
  minY,
  maxX,
  maxY,
});

describe('touchesRect — точное выделение рамкой', () => {
  // Диагональ из (0, 0) в (100, 100): габариты — весь квадрат, но пустой угол не её
  const diagonal = buildPath({
    ...base,
    absolutePoints: [0, 0, 100, 100],
    stroke: '#000',
    strokeWidth: 4,
    tool: 'pen',
  });

  it('росчерк не выделяется рамкой в пустом углу его габаритов', () => {
    expect(touchesRect(diagonal, box(70, 0, 100, 30))).toBe(false);
  });

  it('росчерк не выделяется, если рамка остановилась рядом', () => {
    expect(touchesRect(diagonal, box(-30, 50, 40, 80))).toBe(false);
  });

  it('росчерк выделяется, как только рамка его коснулась', () => {
    expect(touchesRect(diagonal, box(40, 0, 60, 52))).toBe(true);
  });

  const ellipse = buildShape({
    ...base,
    x: 0,
    y: 0,
    shape: 'ellipse',
    width: 100,
    height: 100,
    fill: '#fff',
    stroke: '#000',
  });

  it('эллипс не выделяется рамкой в углу его габаритов', () => {
    expect(touchesRect(ellipse, box(-20, -20, 12, 12))).toBe(false);
    expect(touchesRect(ellipse, box(-20, -20, 20, 20))).toBe(true);
  });

  it('повёрнутый прямоугольник — по настоящему контуру', () => {
    // Квадрат 100×100, повёрнутый на 45° вокруг (0, 0): ромб с вершинами (0,0), (70.7,70.7), (0,141.4), (-70.7,70.7)
    const rotated = {
      ...buildShape({
        ...base,
        x: 0,
        y: 0,
        shape: 'rect',
        width: 100,
        height: 100,
        fill: '#fff',
        stroke: '#000',
      }),
      rotation: 45,
    };
    expect(touchesRect(rotated, box(40, 0, 70, 20))).toBe(false);
    expect(touchesRect(rotated, box(40, 0, 70, 60))).toBe(true);
  });
});
