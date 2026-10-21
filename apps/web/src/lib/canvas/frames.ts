import type { BoardElement, Bounds, FrameElement } from '@prostor/shared';
import { boundsOf } from '@/lib/canvas/read-element';

/**
 * Принадлежность к фрейму определяется центром элемента: объект, наполовину
 * вылезший за рамку, остаётся во фрейме (как в Miro/FigJam), а перенесённый
 * центром наружу — выходит из него. Вложенных фреймов нет.
 */
export function centerOf(b: Bounds): { x: number; y: number } {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

export function frameContains(frame: FrameElement, point: { x: number; y: number }): boolean {
  // Повёрнутые фреймы на практике не встречаются — проверяем по габаритам
  const b = boundsOf(frame);
  return point.x >= b.minX && point.x <= b.maxX && point.y >= b.minY && point.y <= b.maxY;
}

/**
 * Фрейм для элемента: верхний (по zIndex) фрейм, содержащий его центр.
 * candidates — элементы из R-tree в точке центра, уже отсортированные.
 */
export function frameFor(
  el: BoardElement,
  candidates: readonly BoardElement[],
): FrameElement | null {
  if (el.type === 'frame') return null;
  const center = centerOf(boundsOf(el));
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i];
    if (c?.type === 'frame' && c.id !== el.id && frameContains(c, center)) return c;
  }
  return null;
}

/** Фреймы отрисовываются под всеми объектами, между собой — по zIndex */
export function compareRenderOrder(a: BoardElement, b: BoardElement): number {
  const fa = a.type === 'frame' ? 0 : 1;
  const fb = b.type === 'frame' ? 0 : 1;
  if (fa !== fb) return fa - fb;
  return a.zIndex < b.zIndex ? -1 : a.zIndex > b.zIndex ? 1 : 0;
}

/** «Фрейм N» — следующий свободный номер */
export function nextFrameTitle(existing: Iterable<BoardElement>): string {
  let max = 0;
  for (const el of existing) {
    if (el.type !== 'frame') continue;
    const m = /^Фрейм (\d+)$/.exec(el.title);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Фрейм ${max + 1}`;
}

/** Порядок фреймов для навигации и презентации: presentationOrder, затем слева-направо, сверху-вниз */
export function sortFrames(frames: FrameElement[]): FrameElement[] {
  return frames.sort((a, b) => {
    const oa = a.presentationOrder ?? Number.MAX_SAFE_INTEGER;
    const ob = b.presentationOrder ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    // «Строки» фреймов: близкие по вертикали считаем одним рядом
    if (Math.abs(a.y - b.y) > Math.min(a.height, b.height) / 2) return a.y - b.y;
    return a.x - b.x;
  });
}
