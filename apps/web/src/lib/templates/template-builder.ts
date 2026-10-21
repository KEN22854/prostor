import { generateKeyBetween } from 'fractional-indexing';
import type { BoardElement, ShapeElement } from '@prostor/shared';
import {
  buildFrame,
  buildLine,
  buildShape,
  buildSticky,
  buildText,
} from '@/lib/canvas/element-factory';

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

/**
 * Построитель содержимого шаблона: выдаёт возрастающие zIndex и
 * связывает элементы с фреймом, в котором они созданы.
 */
export class TemplateBuilder {
  readonly elements: BoardElement[] = [];
  private z: string | null = null;

  constructor(private readonly userId: string) {}

  private nextZ(): string {
    this.z = generateKeyBetween(this.z, null);
    return this.z;
  }

  private push<T extends BoardElement>(el: T, frameId?: string): T {
    const withFrame = frameId ? { ...el, frameId } : el;
    this.elements.push(withFrame);
    return withFrame as T;
  }

  frame(rect: Rect, title: string, fill = '#ffffff'): string {
    const el = buildFrame({ ...rect, title, userId: this.userId, zIndex: this.nextZ() });
    this.push({ ...el, fill });
    return el.id;
  }

  sticky(x: number, y: number, text: string, fill: string, frameId?: string, size = 200): string {
    const el = buildSticky({ x, y, text, fill, userId: this.userId, zIndex: this.nextZ() });
    return this.push({ ...el, width: size, height: size, fontSize: size < 180 ? 16 : 18 }, frameId)
      .id;
  }

  shape(
    rect: Rect,
    shape: ShapeElement['shape'],
    text: string,
    opts: { fill?: string; stroke?: string; fontSize?: number; frameId?: string } = {},
  ): string {
    const el = buildShape({
      ...rect,
      shape,
      fill: opts.fill ?? '#ffffff',
      stroke: opts.stroke ?? '#1f2937',
      userId: this.userId,
      zIndex: this.nextZ(),
    });
    return this.push({ ...el, text, fontSize: opts.fontSize ?? 16 }, opts.frameId).id;
  }

  text(
    x: number,
    y: number,
    text: string,
    opts: {
      fontSize?: number;
      width?: number;
      bold?: boolean;
      color?: string;
      frameId?: string;
    } = {},
  ): string {
    const el = buildText({
      x,
      y,
      text,
      fontSize: opts.fontSize ?? 20,
      color: opts.color,
      userId: this.userId,
      zIndex: this.nextZ(),
    });
    const lines = text.split('\n').length;
    return this.push(
      {
        ...el,
        width: opts.width ?? el.width,
        height: Math.ceil((opts.fontSize ?? 20) * 1.3 * lines),
        fontWeight: opts.bold ? 'bold' : 'normal',
      },
      opts.frameId,
    ).id;
  }

  /**
   * Стрелка; via — промежуточные точки ломаной (ортогональные связи блок-схем).
   * label ставится у середины первого отрезка.
   */
  arrow(
    from: Point,
    to: Point,
    opts: { frameId?: string; label?: string; color?: string; via?: Point[]; labelAt?: Point } = {},
  ): void {
    const el = buildLine({
      type: 'arrow',
      x: from.x,
      y: from.y,
      dx: to.x - from.x,
      dy: to.y - from.y,
      stroke: opts.color ?? '#475569',
      strokeWidth: 2,
      userId: this.userId,
      zIndex: this.nextZ(),
    });
    const route = [from, ...(opts.via ?? []), to];
    const points = route.flatMap((pt) => [pt.x - from.x, pt.y - from.y]);
    const xs = route.map((pt) => pt.x);
    const ys = route.map((pt) => pt.y);
    this.push(
      {
        ...el,
        points,
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      },
      opts.frameId,
    );
    if (opts.label) {
      const next = route[1] ?? to;
      const at = opts.labelAt ?? { x: (from.x + next.x) / 2 + 8, y: (from.y + next.y) / 2 - 22 };
      this.text(at.x, at.y, opts.label, {
        fontSize: 14,
        width: 60,
        color: '#475569',
        frameId: opts.frameId,
      });
    }
  }

  line(
    from: { x: number; y: number },
    to: { x: number; y: number },
    frameId?: string,
    dashed = false,
  ): void {
    const el = buildLine({
      type: 'line',
      x: from.x,
      y: from.y,
      dx: to.x - from.x,
      dy: to.y - from.y,
      stroke: dashed ? '#94a3b8' : '#475569',
      strokeWidth: 2,
      userId: this.userId,
      zIndex: this.nextZ(),
    });
    this.push(el, frameId);
  }
}

/**
 * Точка на границе фигуры в направлении toward (концы радиальных стрелок).
 * Для эллипса — пересечение луча из центра с эллипсом, для прямоугольника — с рамкой.
 */
export function edgeToward(r: Rect, toward: Point, ellipse = false, gap = 6): Point {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  const hw = r.width / 2;
  const hh = r.height / 2;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const t = ellipse
    ? 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2)
    : Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
  const len = Math.hypot(dx, dy);
  const k = t + gap / len;
  return { x: cx + dx * k, y: cy + dy * k };
}

export const rectCenter = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** Точки на сторонах прямоугольника — концы стрелок между фигурами */
export const side = {
  right: (r: Rect) => ({ x: r.x + r.width, y: r.y + r.height / 2 }),
  left: (r: Rect) => ({ x: r.x, y: r.y + r.height / 2 }),
  top: (r: Rect) => ({ x: r.x + r.width / 2, y: r.y }),
  bottom: (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height }),
};
