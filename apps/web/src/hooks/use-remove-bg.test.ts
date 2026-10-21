import { describe, expect, it } from 'vitest';
import { croppedPlacement } from './use-remove-bg';

describe('croppedPlacement', () => {
  const base = {
    x: 100,
    y: 200,
    width: 840,
    height: 525,
    rotation: 0,
    naturalWidth: 1680,
    naturalHeight: 1050,
  };

  it('сдвигает и уменьшает элемент пропорционально масштабу на доске', () => {
    expect(croppedPlacement(base, { x: 700, y: 160, width: 280, height: 670 })).toEqual({
      x: 450,
      y: 280,
      width: 140,
      height: 335,
    });
  });

  it('у повёрнутого элемента сдвиг поворачивается вместе с ним', () => {
    const r = croppedPlacement(
      { ...base, rotation: 90 },
      { x: 200, y: 0, width: 100, height: 100 },
    );
    expect(r.x).toBeCloseTo(100);
    expect(r.y).toBeCloseTo(300);
  });
});
