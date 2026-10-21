/**
 * Метаданные страницы для карточки ссылки: Open Graph / Twitter / <title>.
 * Регулярные выражения вместо DOM-парсера: читаем только <head> первых
 * килобайт страницы, а теги meta устроены просто.
 */

export interface LinkMeta {
  title: string | null;
  description: string | null;
  siteName: string | null;
  image: string | null;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  laquo: '«',
  raquo: '»',
  mdash: '—',
  ndash: '–',
  hellip: '…',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function clean(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const text = decodeEntities(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

/** Атрибуты тега в объект (имена — в нижнем регистре) */
function attributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[m[1]!.toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  }
  return attrs;
}

export function parseLinkMeta(html: string, pageUrl: URL): LinkMeta {
  const head = html.slice(0, 300_000);
  const meta = new Map<string, string>();
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(m[0]);
    const key = (a.property ?? a.name ?? '').toLowerCase();
    if (key && a.content !== undefined && !meta.has(key)) meta.set(key, a.content);
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const rawImage = meta.get('og:image') ?? meta.get('og:image:url') ?? meta.get('twitter:image');
  let image: string | null = null;
  if (rawImage) {
    try {
      image = new URL(decodeEntities(rawImage.trim()), pageUrl).toString();
    } catch {
      image = null;
    }
  }
  return {
    title: clean(meta.get('og:title') ?? meta.get('twitter:title') ?? titleTag, 300),
    description: clean(
      meta.get('og:description') ?? meta.get('description') ?? meta.get('twitter:description'),
      500,
    ),
    siteName: clean(meta.get('og:site_name'), 100),
    image,
  };
}

/** Кодировка из Content-Type или <meta charset> (windows-1251 на старых русских сайтах) */
export function decodeHtml(bytes: Uint8Array, contentType: string): string {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType)?.[1];
  const sniff = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(sniff)?.[1];
  const charset = (fromHeader ?? fromMeta ?? 'utf-8').toLowerCase();
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}
