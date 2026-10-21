import { z } from 'zod';

/**
 * Встраивания: ссылка на доске становится карточкой (заголовок, сайт,
 * превью), а у видео и дизайн-сервисов — ещё и живым плеером/просмотрщиком
 * (iframe открывается поверх карточки по двойному клику).
 */

export const EMBED_PROVIDERS = [
  'youtube',
  'vimeo',
  'loom',
  'figma',
  'google',
  'miro',
  'link',
] as const;
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number];

export interface ParsedEmbed {
  provider: EmbedProvider;
  /** Нормализованная исходная ссылка */
  url: string;
  /** Адрес для iframe; null — только карточка (открыть в новой вкладке) */
  embedUrl: string | null;
  /** Превью, известное без запроса к сайту (YouTube) */
  thumbnailUrl: string | null;
  /** Соотношение сторон плеера */
  aspect: number;
}

const YOUTUBE_ID = /^[\w-]{11}$/;

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] ?? null;
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com' && host !== 'music.youtube.com')
    return null;
  if (u.pathname === '/watch') return u.searchParams.get('v');
  const m = /^\/(?:shorts|embed|live|v)\/([\w-]+)/.exec(u.pathname);
  return m?.[1] ?? null;
}

/** Секунды начала из t=1m30s / t=90 / start=90 */
function startSeconds(u: URL): number | null {
  const raw = u.searchParams.get('t') ?? u.searchParams.get('start');
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Разбор ссылки: какой сервис и как его встроить. null — не http(s)-ссылка */
export function parseEmbed(input: string): ParsedEmbed | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  const url = u.toString();
  const host = u.hostname.replace(/^www\./, '');

  const yt = youtubeId(u);
  if (yt && YOUTUBE_ID.test(yt)) {
    const start = startSeconds(u);
    return {
      provider: 'youtube',
      url,
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}${start ? `?start=${start}` : ''}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
      aspect: 16 / 9,
    };
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = /\/(?:video\/)?(\d+)/.exec(u.pathname)?.[1];
    if (id) {
      return {
        provider: 'vimeo',
        url,
        embedUrl: `https://player.vimeo.com/video/${id}`,
        thumbnailUrl: null,
        aspect: 16 / 9,
      };
    }
  }

  if (host === 'loom.com') {
    const id = /^\/(?:share|embed)\/([\da-f]{32})/i.exec(u.pathname)?.[1];
    if (id) {
      return {
        provider: 'loom',
        url,
        embedUrl: `https://www.loom.com/embed/${id}`,
        thumbnailUrl: null,
        aspect: 16 / 9,
      };
    }
  }

  if (host === 'figma.com' && /^\/(file|design|proto|board|slides)\//.test(u.pathname)) {
    return {
      provider: 'figma',
      url,
      embedUrl: `https://www.figma.com/embed?embed_host=prostor&url=${encodeURIComponent(url)}`,
      thumbnailUrl: null,
      aspect: 4 / 3,
    };
  }

  if (host === 'docs.google.com') {
    const m = /^\/(document|spreadsheets|presentation|forms)\/d\/([\w-]+)/.exec(u.pathname);
    if (m) {
      const kind = m[1];
      const tail =
        kind === 'presentation' ? 'embed' : kind === 'forms' ? 'viewform?embedded=true' : 'preview';
      return {
        provider: 'google',
        url,
        embedUrl: `https://docs.google.com/${kind}/d/${m[2]}/${tail}`,
        thumbnailUrl: null,
        aspect: kind === 'presentation' ? 16 / 9 : 3 / 4,
      };
    }
  }

  if (host === 'miro.com') {
    const id = /^\/app\/board\/([^/]+)/.exec(u.pathname)?.[1];
    if (id) {
      return {
        provider: 'miro',
        url,
        embedUrl: `https://miro.com/app/live-embed/${id}/`,
        thumbnailUrl: null,
        aspect: 4 / 3,
      };
    }
  }

  return { provider: 'link', url, embedUrl: null, thumbnailUrl: null, aspect: 1.91 };
}

/** Похожа ли вставленная строка на одну ссылку (вставка текста на доску) */
export function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  return /^https?:\/\/\S+$/i.test(t) && t.length <= 2048;
}

export const embedPreviewRequestSchema = z.object({
  url: z.string().trim().min(1).max(2048),
});

/** Ответ POST /api/boards/:id/embeds */
export interface EmbedPreview {
  provider: EmbedProvider;
  url: string;
  embedUrl: string | null;
  title: string;
  description: string | null;
  siteName: string;
  /** Превью, сохранённое как ассет доски (same-origin — экспорт не ломается) */
  imageAssetId: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  aspect: number;
}
