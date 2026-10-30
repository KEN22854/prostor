import type { PathElement } from '@prostor/shared';
import { simplifyPoints } from '@/lib/canvas/simplify';
import type { Point } from '@/lib/canvas/viewport';

/**
 * Ластик «как в Paint»: квадрат стирает только то, что накрыл, и режет росчерк
 * на куски. Росчерк — ломаная (tension лишь сглаживает её при отрисовке),
 * поэтому её достаточно разбить на частые точки и выкинуть накрытые.
 */

type ErasablePath = Pick<PathElement, 'x' | 'y' | 'rotation' | 'points' | 'strokeWidth'>;

/** Отпечатки ластика вдоль пути от a к b — не реже чем через пол-ластика */
export function eraserStamps(a: Point, b: Point, half: number): Point[] {
  const step = Math.max(half / 2, 0.01);
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
  const stamps: Point[] = [];
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    stamps.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return stamps;
}

/**
 * Стирает из росчерка всё, что накрыли квадраты ластика (центры stamps,
 * полусторона half, мировые координаты). null — росчерк не задет; иначе
 * оставшиеся куски в локальных координатах элемента (пустой массив — стёрт целиком).
 */
export function erasePath(
  el: ErasablePath,
  stamps: readonly Point[],
  half: number,
): number[][] | null {
  if (stamps.length === 0 || el.points.length < 2) return null;
  // Круглый кончик линии не должен вылезать из-под ластика
  const reach = half + el.strokeWidth / 2;
  const rad = ((el.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const covered = (lx: number, ly: number) => {
    const wx = el.x + lx * cos - ly * sin;
    const wy = el.y + lx * sin + ly * cos;
    return stamps.some((s) => Math.abs(wx - s.x) <= reach && Math.abs(wy - s.y) <= reach);
  };

  const step = Math.max(Math.min(half / 2, el.strokeWidth), 0.25);
  const pieces: number[][] = [];
  let run: number[] = [];
  let erased = false;
  const visit = (x: number, y: number) => {
    if (covered(x, y)) {
      erased = true;
      if (run.length >= 4) pieces.push(run);
      run = [];
    } else {
      run.push(x, y);
    }
  };

  const pts = el.points;
  visit(pts[0] ?? 0, pts[1] ?? 0);
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const ax = pts[i - 2] ?? 0;
    const ay = pts[i - 1] ?? 0;
    const bx = pts[i] ?? 0;
    const by = pts[i + 1] ?? 0;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) visit(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
  }
  if (!erased) return null;
  if (run.length >= 4) pieces.push(run);
  // Частые точки обратно сводим к вершинам исходной ломаной
  return pieces.map((p) => simplifyPoints(p, 0.3));
}

/** Кусок росчерка как самостоятельный элемент: начало координат — в левом верхнем углу куска */
export function pathPiece<T extends ErasablePath & { width: number; height: number }>(
  el: T,
  local: readonly number[],
  id: string,
): T & { id: string } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < local.length; i += 2) {
    const x = local[i] ?? 0;
    const y = local[i + 1] ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const rad = ((el.rotation ?? 0) * Math.PI) / 180;
  return {
    ...el,
    id,
    x: el.x + minX * Math.cos(rad) - minY * Math.sin(rad),
    y: el.y + minX * Math.sin(rad) + minY * Math.cos(rad),
    width: maxX - minX,
    height: maxY - minY,
    points: local.map((v, i) => Math.round((v - (i % 2 === 0 ? minX : minY)) * 10) / 10),
  };
}
