import 'server-only';
import { readyRedis } from '@/lib/redis';
import { safeFetch } from '@/lib/safe-fetch';
import { FALLBACK_FONTS, type FontCatalogEntry } from '@/lib/fonts/catalog';

/**
 * Google Fonts через наш сервер.
 *
 * Браузер не ходит на fonts.googleapis.com напрямую: в части сетей Google
 * недоступен (а сервер может выходить через OUTBOUND_PROXY), и так участники
 * не передают Google свои IP. Каталог, CSS и файлы шрифтов кэшируются в Redis.
 */

const METADATA_URL = 'https://fonts.google.com/metadata/fonts';
const CSS_URL = 'https://fonts.googleapis.com/css2';
const FILE_HOST = 'https://fonts.gstatic.com';
/** Современный браузер — Google отдаёт woff2 с unicode-range */
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const CATALOG_TTL = 24 * 3600;
const CSS_TTL = 7 * 24 * 3600;
const FILE_TTL = 30 * 24 * 3600;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

let memoryCatalog: { at: number; fonts: FontCatalogEntry[] } | null = null;

const CATEGORY: Record<string, FontCatalogEntry['c']> = {
  'Sans Serif': 'sans',
  Serif: 'serif',
  Display: 'display',
  Handwriting: 'hand',
  Monospace: 'mono',
};

interface RawFamily {
  family: string;
  category: string;
  popularity: number;
  subsets: string[];
  fonts: Record<string, unknown>;
}

/** Каталог: семейство, категория, кириллица, начертания; по популярности */
export async function fontCatalog(): Promise<FontCatalogEntry[]> {
  if (memoryCatalog && Date.now() - memoryCatalog.at < CATALOG_TTL * 1000)
    return memoryCatalog.fonts;
  const redis = await readyRedis().catch(() => null);
  const cached = await redis?.get('fonts:catalog').catch(() => null);
  if (cached) {
    const fonts = JSON.parse(cached) as FontCatalogEntry[];
    memoryCatalog = { at: Date.now(), fonts };
    return fonts;
  }
  try {
    const res = await safeFetch(METADATA_URL, {
      maxBytes: 8 * 1024 * 1024,
      timeoutMs: 20_000,
      accept: 'application/json',
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const text = new TextDecoder().decode(res.body).replace(/^\)\]\}'\s*/, '');
    const list = (JSON.parse(text) as { familyMetadataList: RawFamily[] }).familyMetadataList;
    const fonts: FontCatalogEntry[] = list
      .sort((a, b) => a.popularity - b.popularity)
      .map((f) => ({
        f: f.family,
        c: CATEGORY[f.category] ?? 'display',
        cy: f.subsets.includes('cyrillic'),
        w: [
          ...new Set(
            Object.keys(f.fonts)
              .filter((k) => /^\d+$/.test(k))
              .map(Number),
          ),
        ].sort((a, b) => a - b),
      }));
    memoryCatalog = { at: Date.now(), fonts };
    await redis
      ?.set('fonts:catalog', JSON.stringify(fonts), 'EX', CATALOG_TTL)
      .catch(() => undefined);
    return fonts;
  } catch (error) {
    console.warn('[fonts] каталог Google Fonts недоступен, используется встроенный список', error);
    return FALLBACK_FONTS;
  }
}

/** Безопасное имя семейства (буквы, цифры, пробелы) */
export function validFamily(family: string): boolean {
  return /^[A-Za-z0-9 ]{1,64}$/.test(family);
}

/**
 * CSS @font-face для семейства; ссылки на файлы переписаны на /api/fonts/file.
 * text — только символы подписи (превью в списке шрифтов весит килобайты).
 */
export async function fontCss(
  family: string,
  weights: number[],
  text?: string,
): Promise<string | null> {
  const ws = weights.length > 0 ? weights : [400];
  const url = new URL(CSS_URL);
  url.searchParams.set('family', `${family}:wght@${ws.join(';')}`);
  url.searchParams.set('display', 'swap');
  if (text) url.searchParams.set('text', text);
  const key = `fonts:css:${url.search}`;
  const redis = await readyRedis().catch(() => null);
  const cached = await redis?.get(key).catch(() => null);
  if (cached) return cached;

  let res = await safeFetch(url.toString(), {
    maxBytes: 512 * 1024,
    timeoutMs: 10_000,
    accept: 'text/css',
    userAgent: CHROME_UA,
  });
  if (res.status === 400 && ws.length > 1) {
    // Не все начертания существуют — просим только обычное
    url.searchParams.set('family', `${family}:wght@400`);
    res = await safeFetch(url.toString(), {
      maxBytes: 512 * 1024,
      timeoutMs: 10_000,
      accept: 'text/css',
      userAgent: CHROME_UA,
    });
  }
  if (res.status !== 200) return null;
  const css = new TextDecoder()
    .decode(res.body)
    .replace(
      /url\((https:\/\/fonts\.gstatic\.com)(\/[^)]+)\)/g,
      (_m, _host, path: string) => `url(/api/fonts/file?u=${encodeURIComponent(path)})`,
    );
  await redis?.set(key, css, 'EX', CSS_TTL).catch(() => undefined);
  return css;
}

/** Файл шрифта с fonts.gstatic.com (только пути вида /s/…/….woff2) */
export async function fontFile(path: string): Promise<{ body: Uint8Array; type: string } | null> {
  // /s/…/x.woff2 — полный шрифт; /l/font?kit=… — подмножество символов (превью с text=)
  const whole = /^\/[A-Za-z0-9/_.-]+\.(woff2|woff|ttf|otf)$/.test(path);
  const subset = /^\/l\/font\?[A-Za-z0-9=&%_.-]+$/.test(path);
  if ((!whole && !subset) || path.includes('..')) return null;
  const type =
    subset || path.endsWith('.woff2')
      ? 'font/woff2'
      : path.endsWith('.woff')
        ? 'font/woff'
        : 'font/ttf';
  const key = `fonts:file:${path}`;
  const redis = await readyRedis().catch(() => null);
  const cached = await redis?.getBuffer(key).catch(() => null);
  if (cached) return { body: new Uint8Array(cached), type };
  const res = await safeFetch(FILE_HOST + path, {
    maxBytes: MAX_FILE_BYTES,
    timeoutMs: 15_000,
    accept: '*/*',
  });
  if (res.status !== 200 || res.body.byteLength >= MAX_FILE_BYTES) return null;
  await redis?.set(key, Buffer.from(res.body), 'EX', FILE_TTL).catch(() => undefined);
  return { body: res.body, type };
}
