import { describe, expect, it } from 'vitest';
import type { ImageElement } from '@prostor/shared';
import { applyCrop, clampCrop, currentCrop, fullImageRect } from './image-crop';

const img = (extra: Partial<ImageElement> = {}) =>
  ({
    id: 'i',
    type: 'image',
    x: 100,
    y: 50,
    width: 400,
    height: 300,
    rotation: 0,
    naturalWidth: 800,
    naturalHeight: 600,
    assetId: 'a',
    zIndex: 'a0',
    ...extra,
  }) as ImageElement;

describe('обрезка изображений', () => {
  it('обрезанная часть остаётся на месте и в том же масштабе', () => {
    const patch = applyCrop(img(), { x: 200, y: 100, width: 400, height: 300 });
    expect(patch).toEqual({
      crop: { x: 200, y: 100, width: 400, height: 300 },
      x: 200,
      y: 100,
      width: 200,
      height: 150,
    });
  });

  it('сброс обрезки возвращает картинку целиком на прежнее место', () => {
    const cropped = img({ ...applyCrop(img(), { x: 200, y: 100, width: 400, height: 300 }) });
    const back = applyCrop(cropped, null);
    expect(back).toEqual({ crop: undefined, x: 100, y: 50, width: 400, height: 300 });
  });

  it('у повёрнутой картинки сдвиг поворачивается вместе с ней', () => {
    const patch = applyCrop(img({ rotation: 90 }), { x: 200, y: 0, width: 600, height: 600 });
    expect(patch.x).toBeCloseTo(100);
    expect(patch.y).toBeCloseTo(150);
  });

  it('полный прямоугольник исходника и ограничение рамки', () => {
    const cropped = img({
      crop: { x: 200, y: 100, width: 400, height: 300 },
      width: 200,
      height: 150,
    });
    expect(fullImageRect(cropped)).toEqual({ x: -100, y: -50, width: 400, height: 300 });
    expect(currentCrop(img())).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(clampCrop({ x: 700, y: -5, width: 300, height: 1 }, 800, 600)).toEqual({
      x: 500,
      y: 0,
      width: 300,
      height: 4,
    });
  });
});
