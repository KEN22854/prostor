import { describe, expect, it } from 'vitest';
import { CANVAS } from '@prostor/shared';
import {
  containsBounds,
  expandBounds,
  fitBounds,
  gridStep,
  panBy,
  screenToWorld,
  visibleBounds,
  worldToScreen,
  zoomAt,
} from './viewport';

describe('viewport', () => {
  const cam = { x: 100, y: 50, zoom: 2 };

  it('screen ↔ world — взаимно обратные преобразования', () => {
    const world = screenToWorld(cam, { x: 40, y: 60 });
    expect(world).toEqual({ x: 120, y: 80 });
    expect(worldToScreen(cam, world)).toEqual({ x: 40, y: 60 });
  });

  it('zoomAt оставляет точку под курсором на месте', () => {
    const pointer = { x: 300, y: 200 };
    const before = screenToWorld(cam, pointer);
    const next = zoomAt(cam, pointer, 3.5);
    const after = screenToWorld(next, pointer);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.zoom).toBe(3.5);
  });

  it('zoomAt ограничивает масштаб', () => {
    expect(zoomAt(cam, { x: 0, y: 0 }, 1000).zoom).toBe(CANVAS.maxZoom);
    expect(zoomAt(cam, { x: 0, y: 0 }, 0).zoom).toBe(CANVAS.minZoom);
  });

  it('panBy двигает камеру против направления жеста в мировых единицах', () => {
    expect(panBy(cam, 20, -10)).toEqual({ x: 90, y: 55, zoom: 2 });
  });

  it('видимая область и буфер', () => {
    const vb = visibleBounds(cam, { width: 800, height: 600 });
    expect(vb).toEqual({ minX: 100, minY: 50, maxX: 500, maxY: 350 });
    const buffered = expandBounds(vb, 1);
    expect(buffered).toEqual({ minX: -300, minY: -250, maxX: 900, maxY: 650 });
    expect(containsBounds(buffered, vb)).toBe(true);
    expect(containsBounds(vb, buffered)).toBe(false);
  });

  it('fitBounds вписывает содержимое в экран', () => {
    const size = { width: 1000, height: 800 };
    const content = { minX: 0, minY: 0, maxX: 4000, maxY: 1000 };
    const camera = fitBounds(content, size, 50, 4);
    const vb = visibleBounds(camera, size);
    expect(containsBounds(vb, content)).toBe(true);
    expect(camera.zoom).toBeCloseTo(0.225);
  });

  it('шаг сетки растёт при отдалении, чтобы точки не сливались', () => {
    expect(gridStep(1)).toBe(CANVAS.gridSize);
    expect(gridStep(0.1) * 0.1).toBeGreaterThanOrEqual(16);
  });
});
