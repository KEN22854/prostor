import { generateKeyBetween } from 'fractional-indexing';
import type { BoardElement, LineElement } from '@prostor/shared';
import { boundsOf } from '@/lib/canvas/read-element';

/**
 * Общее для импорта из других досок: порядок отрисовки по исходному
 * порядку и перенос всего импортированного в центр экрана.
 */
export interface ImportContext {
  userId: string;
  /** Следующий zIndex (поверх всего, по порядку) */
  z: () => string;
}

export interface ImportResult {
  elements: BoardElement[];
  /** Что пропущено и почему — показываем пользователю */
  skipped: number;
}

export function zSequence(after: string | null): () => string {
  let last = after;
  return () => {
    last = generateKeyBetween(last, null);
    return last;
  };
}

/** Сдвинуть всё так, чтобы центр импортированного оказался в точке center */
export function placeAt(
  elements: BoardElement[],
  center: { x: number; y: number },
): BoardElement[] {
  if (elements.length === 0) return elements;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const b = boundsOf(el);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  const dx = center.x - (minX + maxX) / 2;
  const dy = center.y - (minY + maxY) / 2;
  return elements.map((el) => ({ ...el, x: el.x + dx, y: el.y + dy }));
}

/** Повёрнутый вокруг центра прямоугольник → (x, y) левого верхнего угла для поворота вокруг угла */
export function cornerForCenterRotation(
  x: number,
  y: number,
  w: number,
  h: number,
  radians: number,
): { x: number; y: number } {
  if (!radians) return { x, y };
  const cx = x + w / 2;
  const cy = y + h / 2;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: cx + (-w / 2) * cos - (-h / 2) * sin,
    y: cy + (-w / 2) * sin + (-h / 2) * cos,
  };
}

/** Цвет в формате, который понимает доска (#rgb/#rrggbb, transparent) */
export function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim().toLowerCase();
  if (v === 'transparent' || v === 'none') return 'transparent';
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/.test(v)) return v.slice(0, 7);
  return fallback;
}

export function lineGeometry(
  points: Array<[number, number]>,
): Pick<LineElement, 'points' | 'width' | 'height'> {
  const flat: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of points) {
    flat.push(px, py);
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }
  return { points: flat, width: maxX - minX, height: maxY - minY };
}
