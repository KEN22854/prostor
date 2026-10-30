import type { BoardElement, Bounds } from '@prostor/shared';
import { distanceToSegmentSq, intersects, toLocal } from '@/lib/canvas/geometry';
import { boundsOf } from '@/lib/canvas/read-element';
import type { Point } from '@/lib/canvas/viewport';

/**
 * Собственный hit-test вместо hit-графа Konva.
 *
 * Konva для попадания рисует каждую ноду второй раз в скрытый canvas — это
 * удваивает стоимость каждого кадра панорамирования. Здесь: R-tree отбирает
 * кандидатов по bbox (O(log n)), затем точная геометрия по типу элемента.
 * Функции чистые — их можно вынести в Web Worker (итерация 9).
 */

function pointsOf(el: BoardElement): number[] | null {
  return 'points' in el && Array.isArray(el.points) ? el.points : null;
}

function strokeOf(el: BoardElement): number {
  return 'strokeWidth' in el && typeof el.strokeWidth === 'number' ? el.strokeWidth : 2;
}

/** Попадает ли точка (мировые координаты) в элемент с допуском tolerance */
export function hitElement(el: BoardElement, p: Point, tolerance: number): boolean {
  const points = pointsOf(el);
  if (points && points.length >= 4) {
    const local = toLocal(p, el.x, el.y, el.rotation);
    const radius = strokeOf(el) / 2 + tolerance;
    const r2 = radius * radius;
    for (let i = 0; i + 3 < points.length; i += 2) {
      const a = { x: points[i] ?? 0, y: points[i + 1] ?? 0 };
      const b = { x: points[i + 2] ?? 0, y: points[i + 3] ?? 0 };
      if (distanceToSegmentSq(local, a, b) <= r2) return true;
    }
    return false;
  }

  const local = toLocal(p, el.x, el.y, el.rotation);
  const inside =
    local.x >= -tolerance &&
    local.y >= -tolerance &&
    local.x <= el.width + tolerance &&
    local.y <= el.height + tolerance;
  if (!inside) return false;

  if (el.type === 'shape' && el.shape === 'ellipse') {
    const rx = el.width / 2 + tolerance;
    const ry = el.height / 2 + tolerance;
    const nx = (local.x - el.width / 2) / rx;
    const ny = (local.y - el.height / 2) / ry;
    return nx * nx + ny * ny <= 1;
  }
  // Фрейм ловим только за рамку и заголовок: иначе клик по пустому месту внутри
  // фрейма выделял бы фрейм вместо рамки выделения.
  if (el.type === 'frame') {
    const edge = 6 + tolerance;
    return (
      local.y < edge || local.x < edge || local.x > el.width - edge || local.y > el.height - edge
    );
  }
  return true;
}

/**
 * Верхний элемент под точкой. candidates — результат запроса к R-tree,
 * уже отсортированный по zIndex (снизу вверх), поэтому идём с конца.
 */
export function topmostAt(
  candidates: readonly BoardElement[],
  p: Point,
  tolerance: number,
): BoardElement | null {
  for (let i = candidates.length - 1; i >= 0; i--) {
    const el = candidates[i];
    if (el && hitElement(el, p, tolerance)) return el;
  }
  // Заголовок фрейма над рамкой
  for (let i = candidates.length - 1; i >= 0; i--) {
    const el = candidates[i];
    if (el?.type === 'frame') {
      const local = toLocal(p, el.x, el.y, el.rotation);
      if (local.y >= -28 && local.y < 0 && local.x >= 0 && local.x <= el.width) return el;
    }
  }
  return null;
}

/** Пересекаются ли выпуклые многоугольники (теорема о разделяющей оси); отрезок — тоже многоугольник */
function convexOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const ax = p.y - q.y;
      const ay = q.x - p.x;
      if (ax === 0 && ay === 0) continue;
      let minA = Infinity;
      let maxA = -Infinity;
      for (const v of a) {
        const d = v.x * ax + v.y * ay;
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      let minB = Infinity;
      let maxB = -Infinity;
      for (const v of b) {
        const d = v.x * ax + v.y * ay;
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

const rectPolygon = (r: Bounds): Point[] => [
  { x: r.minX, y: r.minY },
  { x: r.maxX, y: r.minY },
  { x: r.maxX, y: r.maxY },
  { x: r.minX, y: r.maxY },
];

/** Выпуклый контур элемента в его локальных координатах */
function outlineOf(el: BoardElement): Point[] {
  const w = el.width;
  const h = el.height;
  if (el.type === 'shape') {
    switch (el.shape) {
      case 'ellipse':
        return Array.from({ length: 32 }, (_, i) => {
          const t = (i / 32) * Math.PI * 2;
          return { x: w / 2 + (Math.cos(t) * w) / 2, y: h / 2 + (Math.sin(t) * h) / 2 };
        });
      case 'triangle':
        return [
          { x: w / 2, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ];
      case 'diamond':
        return [
          { x: w / 2, y: 0 },
          { x: w, y: h / 2 },
          { x: w / 2, y: h },
          { x: 0, y: h / 2 },
        ];
      case 'hexagon': {
        const o = Math.min(w * 0.2, h / 2);
        return [
          { x: o, y: 0 },
          { x: w - o, y: 0 },
          { x: w, y: h / 2 },
          { x: w - o, y: h },
          { x: o, y: h },
          { x: 0, y: h / 2 },
        ];
      }
    }
  }
  return rectPolygon({ minX: 0, minY: 0, maxX: w, maxY: h });
}

/**
 * Касается ли рамка выделения самого объекта: линии и росчерки — по их
 * отрезкам с толщиной, фигуры — по настоящему контуру с учётом поворота.
 * Габариты (с запасом на ручки) — только быстрый отсев.
 */
export function touchesRect(el: BoardElement, rect: Bounds): boolean {
  if (!intersects(boundsOf(el), rect)) return false;
  const rad = ((el.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const world = (x: number, y: number): Point => ({
    x: el.x + x * cos - y * sin,
    y: el.y + x * sin + y * cos,
  });

  const points = pointsOf(el);
  if (points && points.length >= 2) {
    const half = strokeOf(el) / 2;
    const area = {
      minX: rect.minX - half,
      minY: rect.minY - half,
      maxX: rect.maxX + half,
      maxY: rect.maxY + half,
    };
    const box = rectPolygon(area);
    let prev = world(points[0] ?? 0, points[1] ?? 0);
    if (points.length < 4) return convexOverlap([prev], box);
    for (let i = 2; i + 1 < points.length; i += 2) {
      const next = world(points[i] ?? 0, points[i + 1] ?? 0);
      if (convexOverlap([prev, next], box)) return true;
      prev = next;
    }
    return false;
  }
  return convexOverlap(
    outlineOf(el).map((p) => world(p.x, p.y)),
    rectPolygon(rect),
  );
}

/** Элементы, которых касается рамка выделения */
export function elementsInRect(candidates: readonly BoardElement[], rect: Bounds): BoardElement[] {
  return candidates.filter((el) => touchesRect(el, rect));
}

/** Область запроса к R-tree для точки */
export function pointQuery(p: Point, tolerance: number): Bounds {
  // Запас сверху на заголовок фрейма, который рисуется над рамкой
  return {
    minX: p.x - tolerance,
    minY: p.y - tolerance,
    maxX: p.x + tolerance,
    maxY: p.y + tolerance + 30,
  };
}
