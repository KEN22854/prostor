import type { Bounds } from '@prostor/shared';

export interface GuideLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: GuideLine[];
}

const xs = (b: Bounds) => [b.minX, (b.minX + b.maxX) / 2, b.maxX] as const;
const ys = (b: Bounds) => [b.minY, (b.minY + b.maxY) / 2, b.maxY] as const;

interface AxisMatch {
  delta: number;
  value: number;
  other: Bounds;
}

/** Ближайшее совпадение края/центра по одной оси в пределах threshold */
function bestMatch(
  moving: readonly number[],
  others: readonly Bounds[],
  pick: (b: Bounds) => readonly number[],
  threshold: number,
): AxisMatch | null {
  let best: AxisMatch | null = null;
  for (const other of others) {
    for (const target of pick(other)) {
      for (const source of moving) {
        const delta = target - source;
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta, value: target, other };
        }
      }
    }
  }
  return best;
}

/**
 * Привязка перемещаемой рамки к краям и центрам соседних объектов,
 * а при отсутствии совпадений — к сетке.
 *
 * threshold — в мировых единицах (вызывающий передаёт 6 px / zoom,
 * чтобы «липкость» на экране не зависела от масштаба).
 * Возвращает поправку (dx, dy) и направляющие для отрисовки.
 */
export function computeSnap(
  moving: Bounds,
  others: readonly Bounds[],
  options: { threshold: number; toObjects: boolean; gridSize: number | null },
): SnapResult {
  const guides: GuideLine[] = [];
  let dx = 0;
  let dy = 0;

  const mx = options.toObjects ? bestMatch(xs(moving), others, xs, options.threshold) : null;
  const my = options.toObjects ? bestMatch(ys(moving), others, ys, options.threshold) : null;

  if (mx) {
    dx = mx.delta;
  } else if (options.gridSize) {
    dx = Math.round(moving.minX / options.gridSize) * options.gridSize - moving.minX;
  }
  if (my) {
    dy = my.delta;
  } else if (options.gridSize) {
    dy = Math.round(moving.minY / options.gridSize) * options.gridSize - moving.minY;
  }

  // Направляющая проходит через оба объекта по всей их общей протяжённости
  if (mx) {
    guides.push({
      x1: mx.value,
      y1: Math.min(moving.minY + dy, mx.other.minY),
      x2: mx.value,
      y2: Math.max(moving.maxY + dy, mx.other.maxY),
    });
  }
  if (my) {
    guides.push({
      x1: Math.min(moving.minX + dx, my.other.minX),
      y1: my.value,
      x2: Math.max(moving.maxX + dx, my.other.maxX),
      y2: my.value,
    });
  }
  return { dx, dy, guides };
}

/** Привязка точки к сетке (создание объектов) */
export function snapPointToGrid(
  x: number,
  y: number,
  gridSize: number | null,
): { x: number; y: number } {
  if (!gridSize) return { x, y };
  return { x: Math.round(x / gridSize) * gridSize, y: Math.round(y / gridSize) * gridSize };
}
