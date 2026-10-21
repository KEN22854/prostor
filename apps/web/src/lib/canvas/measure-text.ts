/**
 * Ширина текста заданным CSS-шрифтом. Один offscreen-контекст на страницу и
 * кеш по (шрифт, текст): раскладка rich-текста меряет одни и те же слова
 * на каждом ре-рендере элемента.
 */
let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();
const MAX_CACHE = 20_000;

export function measureText(text: string, font: string): number {
  const key = `${font}\u0000${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  ctx ??= typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * 8;
  ctx.font = font;
  const width = ctx.measureText(text).width;
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(key, width);
  return width;
}

/** Сброс кеша после загрузки веб-шрифта: до неё мерили запасным */
export function resetMeasureCache(): void {
  cache.clear();
}
