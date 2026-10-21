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

/** Элементы, пересекающие рамку выделения (по габаритам) */
export function elementsInRect(candidates: readonly BoardElement[], rect: Bounds): BoardElement[] {
  return candidates.filter((el) => intersects(boundsOf(el), rect));
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
