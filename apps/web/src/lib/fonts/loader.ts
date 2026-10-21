import { isBuiltinFont } from '@/lib/fonts/catalog';

/**
 * Загрузка шрифтов в браузере.
 * Google Fonts — через наш прокси (/api/fonts/css), свои шрифты доски —
 * FontFace из ассета. Canvas рисует текст только уже загруженным шрифтом,
 * поэтому после загрузки холст перерисовывается (fontEpoch).
 */

const loaded = new Set<string>();
const pending = new Map<string, Promise<boolean>>();
const linked = new Set<string>();

function addStylesheet(href: string): void {
  if (linked.has(href)) return;
  linked.add(href);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

export function fontCssUrl(
  family: string,
  weights: readonly number[] = [400, 700],
  text?: string,
): string {
  const params = new URLSearchParams({ family, weights: weights.join(',') });
  if (text) params.set('text', text);
  return `/api/fonts/css?${params.toString()}`;
}

/**
 * Загрузить семейство. customAssetId — свой шрифт доски.
 * true — шрифт появился сейчас (нужна перерисовка), false — уже был или не загрузился.
 */
export function loadFont(family: string, customAssetId?: string): Promise<boolean> {
  if (isBuiltinFont(family) || loaded.has(family)) return Promise.resolve(false);
  const existing = pending.get(family);
  if (existing) return existing;
  const task = (async () => {
    try {
      if (customAssetId) {
        const face = new FontFace(family, `url(/api/assets/${customAssetId})`);
        await face.load();
        document.fonts.add(face);
      } else {
        addStylesheet(fontCssUrl(family));
        await Promise.all([
          document.fonts.load(`16px "${family}"`),
          document.fonts.load(`bold 16px "${family}"`),
        ]);
      }
      loaded.add(family);
      return true;
    } catch {
      return false;
    } finally {
      pending.delete(family);
    }
  })();
  pending.set(family, task);
  return task;
}

/** Превью названия в меню шрифтов: только буквы названия — килобайты, а не весь шрифт */
export function loadFontPreview(family: string): void {
  if (isBuiltinFont(family) || loaded.has(family)) return;
  addStylesheet(fontCssUrl(family, [400], family));
}
