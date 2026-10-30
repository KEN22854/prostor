/**
 * Пороги уровня детализации (LOD) по масштабу.
 *
 *  zoom ≥ REDUCED  — полная детализация: отдельные Konva-ноды с текстом;
 *  LOD ≤ zoom < REDUCED — ноды без текста;
 *  zoom < LOD      — один Konva.Shape рисует все элементы за один проход
 *                    рендером мини-карты (формы, контуры, текст, пока читается):
 *                    10 000 нод → 1 draw call.
 *
 * Пороги совпадают: промежуточный уровень без текста стирал надписи, пока они
 * ещё читались, поэтому от полной детализации сразу переходим к LOD-рендеру.
 */
export const DETAIL_ZOOM = {
  reduced: 0.3,
  lod: 0.3,
} as const;

export type DetailLevel = 'full' | 'reduced' | 'lod';

export function detailLevel(zoom: number): DetailLevel {
  if (zoom < DETAIL_ZOOM.lod) return 'lod';
  if (zoom < DETAIL_ZOOM.reduced) return 'reduced';
  return 'full';
}

/** Пересчитываем выборку видимых элементов, если зум изменился сильнее, чем в N раз */
export const REQUERY_ZOOM_FACTOR = 1.5;

/** Частота отправки своего курсора в awareness (мс) — 20 Гц достаточно, сглаживание на приёме */
export const CURSOR_SEND_INTERVAL_MS = 50;
export const VIEWPORT_SEND_INTERVAL_MS = 250;

/** Цвет «по умолчанию» для мини-карты и LOD, если у элемента нет заливки */
export const NEUTRAL_FILL = '#94a3b8';
