import type { BindingAnchor, BoardElement, LineElement, LineRouting } from '@prostor/shared';
import type { Point } from '@/lib/canvas/viewport';

/**
 * Стрелки и линии, привязанные к объектам (коннекторы).
 *
 * Конец линии с binding не хранит «своё» положение: оно вычисляется из
 * объекта, к которому привязан, — точка на его границе по направлению к
 * другому концу (anchor 'auto') или середина стороны (top/right/bottom/left).
 * Результат пересчёта записывается в обычные поля линии (x, y, points),
 * поэтому рендер, hit-test, экспорт и коллеги без пересчёта видят готовую
 * геометрию. Пересчитывает тот, кто двигает объект (BoardActions).
 */

/** Зазор между концом стрелки и границей объекта, мировые единицы */
export const CONNECTOR_GAP = 4;
/** Отступ ломаной от объекта перед первым поворотом */
const ELBOW_STUB = 24;

/** Объекты, к которым можно привязать линию */
const BINDABLE: ReadonlySet<BoardElement['type']> = new Set([
  'sticky',
  'text',
  'shape',
  'image',
  'frame',
  'table',
  'mindmapNode',
  'document',
  'icon',
]);

export function isBindable(el: BoardElement): boolean {
  return BINDABLE.has(el.type) && !('points' in el);
}

type Side = 'top' | 'right' | 'bottom' | 'left';

interface Rotated {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

function toWorld(el: Rotated, lx: number, ly: number): Point {
  const r = el.rotation ?? 0;
  if (r % 360 === 0) return { x: el.x + lx, y: el.y + ly };
  const rad = (r * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: el.x + lx * cos - ly * sin, y: el.y + lx * sin + ly * cos };
}

function toLocalPoint(el: Rotated, p: Point): Point {
  const dx = p.x - el.x;
  const dy = p.y - el.y;
  const r = el.rotation ?? 0;
  if (r % 360 === 0) return { x: dx, y: dy };
  const rad = (-r * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

export function centerPoint(el: Rotated): Point {
  return toWorld(el, el.width / 2, el.height / 2);
}

function isEllipse(el: BoardElement): boolean {
  return el.type === 'shape' && el.shape === 'ellipse';
}

/** Середина стороны с зазором наружу — в мировых координатах */
function sidePoint(el: Rotated, side: Side, gap: number): Point {
  const { width: w, height: h } = el;
  switch (side) {
    case 'top':
      return toWorld(el, w / 2, -gap);
    case 'bottom':
      return toWorld(el, w / 2, h + gap);
    case 'left':
      return toWorld(el, -gap, h / 2);
    case 'right':
      return toWorld(el, w + gap, h / 2);
  }
}

/** Сторона, «смотрящая» на точку (в локальных координатах элемента) */
export function facingSide(el: Rotated, toward: Point): Side {
  const p = toLocalPoint(el, toward);
  const nx = (p.x - el.width / 2) / Math.max(1, el.width / 2);
  const ny = (p.y - el.height / 2) / Math.max(1, el.height / 2);
  if (Math.abs(nx) >= Math.abs(ny)) return nx >= 0 ? 'right' : 'left';
  return ny >= 0 ? 'bottom' : 'top';
}

/**
 * Точка на границе объекта по лучу из его центра к `toward` (+ зазор).
 * Прямоугольник и эллипс считаются точно, с учётом поворота.
 */
export function borderPoint(el: BoardElement, toward: Point, gap = CONNECTOR_GAP): Point {
  const hw = el.width / 2;
  const hh = el.height / 2;
  const local = toLocalPoint(el, toward);
  let dx = local.x - hw;
  let dy = local.y - hh;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) dx = 1; // точка в центре — луч вправо
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;

  let t: number;
  if (isEllipse(el)) {
    t = 1 / Math.sqrt((ux * ux) / Math.max(1e-6, hw * hw) + (uy * uy) / Math.max(1e-6, hh * hh));
  } else {
    const tx = Math.abs(ux) > 1e-9 ? hw / Math.abs(ux) : Infinity;
    const ty = Math.abs(uy) > 1e-9 ? hh / Math.abs(uy) : Infinity;
    t = Math.min(tx, ty);
  }
  t += gap;
  return toWorld(el, hw + ux * t, hh + uy * t);
}

/** Конец линии, привязанный к объекту */
export function anchorPoint(
  el: BoardElement,
  anchor: BindingAnchor,
  toward: Point,
  gap = CONNECTOR_GAP,
): { point: Point; side: Side } {
  if (anchor === 'auto') {
    return { point: borderPoint(el, toward, gap), side: facingSide(el, toward) };
  }
  return { point: sidePoint(el, anchor, gap), side: anchor };
}

/**
 * Какую привязку дать концу, отпущенному над объектом: возле середины
 * стороны (ближе snapRadius) — к этой стороне, иначе 'auto'.
 */
export function anchorAt(el: BoardElement, world: Point, snapRadius: number): BindingAnchor {
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const p = sidePoint(el, side, 0);
    if (Math.hypot(p.x - world.x, p.y - world.y) <= snapRadius) return side;
  }
  return 'auto';
}

/** Точки ломаной между двумя концами: выход по нормали стороны, повороты под 90° */
export function elbowPoints(a: Point, aSide: Side | null, b: Point, bSide: Side | null): Point[] {
  const horizontal = (s: Side | null) => s === 'left' || s === 'right';
  const out = (p: Point, s: Side | null): Point => {
    switch (s) {
      case 'top':
        return { x: p.x, y: p.y - ELBOW_STUB };
      case 'bottom':
        return { x: p.x, y: p.y + ELBOW_STUB };
      case 'left':
        return { x: p.x - ELBOW_STUB, y: p.y };
      case 'right':
        return { x: p.x + ELBOW_STUB, y: p.y };
      default:
        return p;
    }
  };
  const a1 = out(a, aSide);
  const b1 = out(b, bSide);
  // Основное направление: от стороны начала, а без привязки — по большему смещению
  const startHorizontal = aSide ? horizontal(aSide) : Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const endHorizontal = bSide ? horizontal(bSide) : startHorizontal;

  let middle: Point[];
  if (startHorizontal && endHorizontal) {
    const mx = (a1.x + b1.x) / 2;
    middle = [
      { x: mx, y: a1.y },
      { x: mx, y: b1.y },
    ];
  } else if (!startHorizontal && !endHorizontal) {
    const my = (a1.y + b1.y) / 2;
    middle = [
      { x: a1.x, y: my },
      { x: b1.x, y: my },
    ];
  } else if (startHorizontal) {
    middle = [{ x: b1.x, y: a1.y }];
  } else {
    middle = [{ x: a1.x, y: b1.y }];
  }
  return dedupe([a, a1, ...middle, b1, b]);
}

/** Контрольная точка кривой: середина, смещённая перпендикулярно на четверть длины */
export function curvedPoints(a: Point, b: Point): Point[] {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return [a, b];
  const bend = Math.min(160, len * 0.25);
  return [a, { x: mx - (dy / len) * bend, y: my + (dx / len) * bend }, b];
}

function dedupe(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const p of points) {
    const last = result[result.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) result.push(p);
  }
  return result;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Мировые координаты концов линии (без учёта привязок) */
export function lineEnds(line: LineElement): { start: Point; end: Point } {
  const pts = line.points;
  const n = pts.length;
  const local = (x: number, y: number): Point => toWorld(line, x, y);
  return {
    start: local(pts[0] ?? 0, pts[1] ?? 0),
    end: local(pts[n - 2] ?? 0, pts[n - 1] ?? 0),
  };
}

export interface RoutedGeometry {
  x: number;
  y: number;
  points: number[];
  width: number;
  height: number;
  rotation: 0;
}

/**
 * Геометрия линии по привязкам и маршруту. getElement отдаёт актуальные
 * объекты (с учётом ещё не записанных изменений). null — пересчёт не нужен:
 * привязок нет или объекты привязки удалены.
 */
export function routeLine(
  line: LineElement,
  getElement: (id: string) => BoardElement | undefined,
  override?: { start?: Point; end?: Point },
): RoutedGeometry | null {
  const startTarget = line.startBinding ? getElement(line.startBinding.elementId) : undefined;
  const endTarget = line.endBinding ? getElement(line.endBinding.elementId) : undefined;
  const routing: LineRouting = line.routing ?? 'straight';
  if (!startTarget && !endTarget && !override && routing === 'straight') return null;

  const ends = lineEnds(line);
  const freeStart = override?.start ?? ends.start;
  const freeEnd = override?.end ?? ends.end;

  // Куда «смотрит» каждый конец: на центр объекта на другом конце или на свободную точку
  const startToward = endTarget && !override?.end ? centerPoint(endTarget) : freeEnd;
  const endToward = startTarget && !override?.start ? centerPoint(startTarget) : freeStart;

  const s =
    startTarget && line.startBinding && !override?.start
      ? anchorPoint(startTarget, line.startBinding.anchor, startToward)
      : { point: freeStart, side: null };
  const e =
    endTarget && line.endBinding && !override?.end
      ? anchorPoint(endTarget, line.endBinding.anchor, endToward)
      : { point: freeEnd, side: null };

  let world: Point[];
  if (routing === 'elbow') world = elbowPoints(s.point, s.side, e.point, e.side);
  else if (routing === 'curved') world = curvedPoints(s.point, e.point);
  else world = [s.point, e.point];

  const origin = world[0] ?? s.point;
  const points: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of world) {
    const lx = round(p.x - origin.x);
    const ly = round(p.y - origin.y);
    points.push(lx, ly);
    minX = Math.min(minX, lx);
    minY = Math.min(minY, ly);
    maxX = Math.max(maxX, lx);
    maxY = Math.max(maxY, ly);
  }
  return {
    x: round(origin.x),
    y: round(origin.y),
    points,
    width: round(maxX - minX),
    height: round(maxY - minY),
    rotation: 0,
  };
}

/** Изменилась ли геометрия (чтобы не писать в Yjs одинаковое) */
export function sameGeometry(line: LineElement, g: RoutedGeometry): boolean {
  if (Math.abs(line.x - g.x) > 0.01 || Math.abs(line.y - g.y) > 0.01) return false;
  if ((line.rotation ?? 0) !== 0) return false;
  if (line.points.length !== g.points.length) return false;
  return line.points.every((v, i) => Math.abs(v - (g.points[i] ?? 0)) <= 0.01);
}

/** Середина ломаной по длине — место подписи */
export function midpointOf(points: readonly number[]): Point {
  let total = 0;
  for (let i = 0; i + 3 < points.length; i += 2) {
    total += Math.hypot(
      (points[i + 2] ?? 0) - (points[i] ?? 0),
      (points[i + 3] ?? 0) - (points[i + 1] ?? 0),
    );
  }
  let half = total / 2;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const ax = points[i] ?? 0;
    const ay = points[i + 1] ?? 0;
    const bx = points[i + 2] ?? 0;
    const by = points[i + 3] ?? 0;
    const seg = Math.hypot(bx - ax, by - ay);
    if (seg >= half && seg > 0) {
      const t = half / seg;
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
    }
    half -= seg;
  }
  return { x: points[0] ?? 0, y: points[1] ?? 0 };
}
