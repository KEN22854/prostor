import type { Bounds } from '@prostor/shared';
import type { Point } from '@/lib/canvas/viewport';

/** Прямоугольник из двух точек перетаскивания (в любом направлении) */
export function rectFromPoints(a: Point, b: Point): Bounds {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

export function boundsWidth(b: Bounds): number {
  return b.maxX - b.minX;
}

export function boundsHeight(b: Bounds): number {
  return b.maxY - b.minY;
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function translateBounds(b: Bounds, dx: number, dy: number): Bounds {
  return { minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy };
}

/**
 * Точка в локальных координатах элемента, повёрнутого вокруг (originX, originY)
 * на rotation градусов (так вращает Konva: вокруг левого верхнего угла).
 */
export function toLocal(point: Point, originX: number, originY: number, rotation: number): Point {
  const dx = point.x - originX;
  const dy = point.y - originY;
  if (rotation % 360 === 0) return { x: dx, y: dy };
  const rad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/** Квадрат расстояния от точки до отрезка */
export function distanceToSegmentSq(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  let t = len === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + t * dx - p.x;
  const y = a.y + t * dy - p.y;
  return x * x + y * y;
}
