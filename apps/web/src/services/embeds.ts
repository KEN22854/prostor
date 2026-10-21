import 'server-only';
import { imageInfo, parseEmbed, type EmbedPreview, type ParsedEmbed } from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { decodeHtml, parseLinkMeta, type LinkMeta } from '@/lib/link-meta';
import { rateLimit } from '@/lib/rate-limit';
import { UnsafeUrlError, safeFetch } from '@/lib/safe-fetch';
import type { SessionUser } from '@/lib/session';
import { storeBoardImage } from '@/services/assets';
import { requireBoardAccess } from '@/services/boards';

const PAGE_MAX_BYTES = 512 * 1024;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

const PROVIDER_NAMES: Record<string, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  loom: 'Loom',
  figma: 'Figma',
  google: 'Google',
  miro: 'Miro',
};

/** oEmbed видеосервисов: точное название без парсинга страницы */
const OEMBED: Partial<Record<ParsedEmbed['provider'], string>> = {
  youtube: 'https://www.youtube.com/oembed?format=json&url=',
  vimeo: 'https://vimeo.com/api/oembed.json?url=',
  loom: 'https://www.loom.com/v1/oembed?url=',
};

async function oembedMeta(parsed: ParsedEmbed): Promise<LinkMeta | null> {
  const base = OEMBED[parsed.provider];
  if (!base) return null;
  try {
    const res = await safeFetch(base + encodeURIComponent(parsed.url), {
      maxBytes: 64 * 1024,
      timeoutMs: FETCH_TIMEOUT_MS,
      accept: 'application/json',
    });
    if (res.status !== 200) return null;
    const data = JSON.parse(new TextDecoder().decode(res.body)) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return {
      title: str(data.title),
      description: str(data.author_name),
      siteName: str(data.provider_name),
      image: str(data.thumbnail_url),
    };
  } catch {
    return null;
  }
}

async function pageMeta(url: string): Promise<LinkMeta | null> {
  try {
    const res = await safeFetch(url, { maxBytes: PAGE_MAX_BYTES, timeoutMs: FETCH_TIMEOUT_MS });
    if (res.status >= 400 || !/html/i.test(res.contentType)) return null;
    return parseLinkMeta(decodeHtml(res.body, res.contentType), res.url);
  } catch (error) {
    // Внутренний адрес — отказ; недоступный сайт — карточка без метаданных
    if (error instanceof UnsafeUrlError) throw error;
    return null;
  }
}

/** Картинка-превью → ассет доски: тип и размеры по байтам, а не по заголовкам сайта */
async function storePreviewImage(
  userId: string,
  boardId: string,
  imageUrl: string,
): Promise<{ id: string; width: number; height: number } | null> {
  try {
    const res = await safeFetch(imageUrl, {
      maxBytes: IMAGE_MAX_BYTES,
      timeoutMs: FETCH_TIMEOUT_MS,
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
    });
    if (res.status !== 200 || res.body.byteLength >= IMAGE_MAX_BYTES) return null;
    const info = imageInfo(res.body);
    if (!info || info.width < 16 || info.height < 16) return null;
    const asset = await storeBoardImage(userId, boardId, res.body, info.mimeType, {
      width: info.width,
      height: info.height,
    });
    return { id: asset.id, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

/**
 * Превью ссылки для карточки на доске: сервис (плеер), заголовок, описание,
 * сайт и картинка (сохраняется ассетом доски — same-origin для экспорта).
 * Страница недоступна — карточка всё равно создаётся с адресом вместо заголовка.
 */
export async function previewEmbed(
  user: SessionUser,
  boardId: string,
  rawUrl: string,
): Promise<EmbedPreview> {
  await requireBoardAccess(boardId, user.id, 'edit');
  const limit = await rateLimit(`embed:user:${user.id}`, 60, 10 * 60);
  if (!limit.ok)
    throw new ApiError(429, 'rate_limited', 'Слишком много ссылок подряд. Подождите немного');

  const parsed = parseEmbed(rawUrl);
  if (!parsed)
    throw new ApiError(422, 'invalid_url', 'Это не похоже на ссылку (нужен http:// или https://)');

  let meta: LinkMeta | null;
  try {
    meta = (await oembedMeta(parsed)) ?? (await pageMeta(parsed.url));
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      throw new ApiError(422, 'unsafe_url', 'Ссылки на внутренние адреса не поддерживаются');
    }
    throw error;
  }

  const host = new URL(parsed.url).hostname.replace(/^www\./, '');
  const imageUrl = parsed.thumbnailUrl ?? meta?.image ?? null;
  const image = imageUrl ? await storePreviewImage(user.id, boardId, imageUrl) : null;

  return {
    provider: parsed.provider,
    url: parsed.url,
    embedUrl: parsed.embedUrl,
    title: meta?.title ?? host,
    description: meta?.description ?? null,
    siteName: meta?.siteName ?? PROVIDER_NAMES[parsed.provider] ?? host,
    imageAssetId: image?.id ?? null,
    imageWidth: image?.width ?? null,
    imageHeight: image?.height ?? null,
    aspect: parsed.aspect,
  };
}
