import type { BoardElement, Bounds, FrameElement } from '@prostor/shared';
import type { ElementStore } from '@/lib/canvas/element-store';
import { sortFrames } from '@/lib/canvas/frames';
import { boundsOf } from '@/lib/canvas/read-element';

/** Что экспортируем */
export type ExportScope =
  | { kind: 'board' }
  | { kind: 'selection'; ids: readonly string[] }
  | { kind: 'frame'; id: string }
  /** Все фреймы — по странице PDF на фрейм (порядок презентации) */
  | { kind: 'frames' };

export interface ExportPage {
  name: string;
  elements: BoardElement[];
  bounds: Bounds;
  /** Фрейм-страница обрезается по рамке, как слайд */
  clip: boolean;
}

const PADDING = 32;
/** Заголовок фрейма рисуется над рамкой */
const FRAME_TITLE_SPACE = 30;

function boundsOfAll(elements: readonly BoardElement[]): Bounds | null {
  let result: Bounds | null = null;
  for (const el of elements) {
    const b = boundsOf(el);
    const top = el.type === 'frame' ? b.minY - FRAME_TITLE_SPACE : b.minY;
    result = result
      ? {
          minX: Math.min(result.minX, b.minX),
          minY: Math.min(result.minY, top),
          maxX: Math.max(result.maxX, b.maxX),
          maxY: Math.max(result.maxY, b.maxY),
        }
      : { minX: b.minX, minY: top, maxX: b.maxX, maxY: b.maxY };
  }
  return result;
}

function padded(b: Bounds): Bounds {
  return {
    minX: b.minX - PADDING,
    minY: b.minY - PADDING,
    maxX: b.maxX + PADDING,
    maxY: b.maxY + PADDING,
  };
}

function framePage(store: ElementStore, frame: FrameElement): ExportPage {
  const bounds = boundsOf(frame);
  // Всё, что видно в области фрейма (включая объекты поверх него не из его содержимого)
  return { name: frame.title || 'Фрейм', elements: store.query(bounds), bounds, clip: true };
}

export function collectPages(
  store: ElementStore,
  scope: ExportScope,
  boardTitle: string,
  expand: (ids: readonly string[]) => string[],
): ExportPage[] {
  switch (scope.kind) {
    case 'board': {
      const elements = Array.from(store.values()).filter((el) => !el.hidden);
      const b = boundsOfAll(elements);
      return b ? [{ name: boardTitle, elements, bounds: padded(b), clip: false }] : [];
    }
    case 'selection': {
      const elements = expand(scope.ids)
        .map((id) => store.get(id))
        .filter((el): el is BoardElement => el !== undefined && !el.hidden);
      const b = boundsOfAll(elements);
      return b
        ? [{ name: `${boardTitle} — выделение`, elements, bounds: padded(b), clip: false }]
        : [];
    }
    case 'frame': {
      const frame = store.get(scope.id);
      return frame?.type === 'frame' ? [framePage(store, frame as FrameElement)] : [];
    }
    case 'frames':
      return sortFrames(store.frames()).map((f) => framePage(store, f));
  }
}

/**
 * Браузеры не создают canvas больше ~16k по стороне и ~268 Мп по площади
 * (Safari — меньше). Уменьшаем масштаб, чтобы огромная доска всё же выгрузилась.
 */
export function safeScale(bounds: Bounds, requested: number): number {
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const MAX_SIDE = 16_000;
  const MAX_AREA = 120_000_000;
  return Math.max(
    0.05,
    Math.min(requested, MAX_SIDE / w, MAX_SIDE / h, Math.sqrt(MAX_AREA / (w * h))),
  );
}

/** Имя файла без запрещённых в Windows/macOS символов */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'Доска').slice(0, 120);
}
