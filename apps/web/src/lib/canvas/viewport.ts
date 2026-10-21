import { CANVAS, type Bounds } from '@prostor/shared';

/**
 * Камера холста.
 * (x, y) — мировая точка, которая находится в левом верхнем углу экрана;
 * zoom — масштаб (1 = 100%).
 *
 *   screen = (world − camera) × zoom
 *   world  = screen / zoom + camera
 *
 * Konva Stage получает scale = zoom и position = (−x·zoom, −y·zoom).
 */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

export function clampZoom(zoom: number): number {
  return Math.min(CANVAS.maxZoom, Math.max(CANVAS.minZoom, zoom));
}

export function screenToWorld(camera: Camera, point: Point): Point {
  return { x: point.x / camera.zoom + camera.x, y: point.y / camera.zoom + camera.y };
}

export function worldToScreen(camera: Camera, point: Point): Point {
  return { x: (point.x - camera.x) * camera.zoom, y: (point.y - camera.y) * camera.zoom };
}

/** Зум с фиксированной точкой под курсором/пальцами: она остаётся на месте экрана */
export function zoomAt(camera: Camera, screenPoint: Point, nextZoom: number): Camera {
  const zoom = clampZoom(nextZoom);
  const anchor = screenToWorld(camera, screenPoint);
  return { x: anchor.x - screenPoint.x / zoom, y: anchor.y - screenPoint.y / zoom, zoom };
}

/** Сдвиг камеры на вектор в экранных пикселях (перетаскивание холста) */
export function panBy(camera: Camera, dxScreen: number, dyScreen: number): Camera {
  return { ...camera, x: camera.x - dxScreen / camera.zoom, y: camera.y - dyScreen / camera.zoom };
}

/** Видимая область в мировых координатах */
export function visibleBounds(camera: Camera, size: Size): Bounds {
  return {
    minX: camera.x,
    minY: camera.y,
    maxX: camera.x + size.width / camera.zoom,
    maxY: camera.y + size.height / camera.zoom,
  };
}

/** Расширение области на долю её размера с каждой стороны (буфер виртуализации) */
export function expandBounds(bounds: Bounds, ratio: number): Bounds {
  const w = (bounds.maxX - bounds.minX) * ratio;
  const h = (bounds.maxY - bounds.minY) * ratio;
  return {
    minX: bounds.minX - w,
    minY: bounds.minY - h,
    maxX: bounds.maxX + w,
    maxY: bounds.maxY + h,
  };
}

export function containsBounds(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.minY >= outer.minY &&
    inner.maxX <= outer.maxX &&
    inner.maxY <= outer.maxY
  );
}

export function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Камера, при которой bounds целиком помещаются в экран с отступом */
export function fitBounds(bounds: Bounds, size: Size, padding = 64, maxZoom = 1): Camera {
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const zoom = clampZoom(
    Math.min(maxZoom, (size.width - padding * 2) / w, (size.height - padding * 2) / h),
  );
  return {
    zoom,
    x: bounds.minX - (size.width / zoom - w) / 2,
    y: bounds.minY - (size.height / zoom - h) / 2,
  };
}

/** Камера с центром в мировой точке при текущем zoom */
export function centerOn(camera: Camera, size: Size, world: Point): Camera {
  return {
    ...camera,
    x: world.x - size.width / 2 / camera.zoom,
    y: world.y - size.height / 2 / camera.zoom,
  };
}

/**
 * Шаг точечной сетки в мировых единицах: кратен CANVAS.gridSize и подбирается
 * так, чтобы на экране точки были не чаще ~16 px — иначе при отдалении
 * сетка превращается в серую заливку.
 */
export function gridStep(zoom: number, minScreenStep = 16): number {
  let step: number = CANVAS.gridSize;
  while (step * zoom < minScreenStep) step *= 2;
  return step;
}
