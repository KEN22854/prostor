import 'server-only';
import { imageInfo, type UploadedAsset } from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { env } from '@/lib/env';
import { FEED_IMAGE_HOSTS, type FeedImage, type FeedPage } from '@/lib/image-feed';
import { readyRedis } from '@/lib/redis';
import { rateLimit } from '@/lib/rate-limit';
import { safeFetch } from '@/lib/safe-fetch';
import type { SessionUser } from '@/lib/session';
import { stickerQuery } from '@/lib/stickers';
import { storeBoardImage } from '@/services/assets';
import { requireBoardAccess } from '@/services/boards';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
/** Wikimedia требует представляться в User-Agent */
const USER_AGENT =
  'ProstorBoard/1.0 (https://github.com/KEN22854/prostor; whiteboard image search)';
const PAGE_SIZE = 40;
const CACHE_TTL = 3600;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function stripHtml(html: string | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, 120) : null;
}

/** Ширина «полной» версии: стандартный размер миниатюр Wikimedia (иначе 429/403) */
function commonsFull(thumb: string, original: string, width: number): string {
  if (width <= 1280) return original;
  return thumb.replace(/\/\d+px-/, '/1280px-');
}

interface CommonsPage {
  pageid: number;
  title: string;
  imageinfo?: Array<{
    url: string;
    thumburl?: string;
    thumbwidth?: number;
    thumbheight?: number;
    width: number;
    height: number;
    mime?: string;
    descriptionurl: string;
    extmetadata?: Record<string, { value?: string }>;
  }>;
}

async function searchCommons(query: string, offset: number): Promise<FeedPage> {
  const url = new URL(COMMONS_API);
  for (const [k, v] of Object.entries({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: String(PAGE_SIZE),
    gsroffset: String(offset),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '480',
    iiextmetadatafilter: 'Artist|LicenseShortName|ObjectName',
  })) {
    url.searchParams.set(k, v);
  }
  const res = await safeFetch(url.toString(), {
    maxBytes: 4 * 1024 * 1024,
    timeoutMs: 15_000,
    accept: 'application/json',
    userAgent: USER_AGENT,
  });
  if (res.status !== 200)
    throw new ApiError(502, 'feed_unavailable', 'Лента картинок сейчас недоступна');
  const data = JSON.parse(new TextDecoder().decode(res.body)) as {
    query?: { pages?: CommonsPage[] };
    continue?: { gsroffset?: number };
  };
  const pages = (data.query?.pages ?? []).sort(
    (a, b) => ((a as { index?: number }).index ?? 0) - ((b as { index?: number }).index ?? 0),
  );
  const items: FeedImage[] = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info?.thumburl || !info.thumbwidth || !info.thumbheight) continue;
    if (info.mime && !/^image\/(jpeg|png|webp|gif)$/.test(info.mime)) continue;
    const meta = info.extmetadata ?? {};
    items.push({
      id: `commons:${p.pageid}`,
      provider: 'commons',
      thumb: info.thumburl,
      thumbWidth: info.thumbwidth,
      thumbHeight: info.thumbheight,
      full: commonsFull(info.thumburl, info.url, info.width),
      width: info.width,
      height: info.height,
      title: stripHtml(meta.ObjectName?.value) ?? p.title.replace(/^File:|\.\w+$/g, ''),
      author: stripHtml(meta.Artist?.value),
      license: stripHtml(meta.LicenseShortName?.value) ?? 'Wikimedia Commons',
      pageUrl: info.descriptionurl,
    });
  }
  return { items, next: data.continue?.gsroffset ? `commons:${data.continue.gsroffset}` : null };
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  alt?: string;
  photographer?: string;
  src: { medium: string; large2x: string };
}

async function searchPexels(query: string, page: number, key: string): Promise<FeedPage> {
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(PAGE_SIZE));
  url.searchParams.set('page', String(page));
  const res = await fetch(url, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new ApiError(502, 'feed_unavailable', 'Лента картинок сейчас недоступна');
  const data = (await res.json()) as { photos: PexelsPhoto[]; next_page?: string };
  const items = data.photos.map<FeedImage>((p) => ({
    id: `pexels:${p.id}`,
    provider: 'pexels',
    thumb: p.src.medium,
    thumbWidth: 350,
    thumbHeight: Math.round((350 * p.height) / p.width),
    full: p.src.large2x,
    width: p.width,
    height: p.height,
    title: p.alt || 'Фото Pexels',
    author: p.photographer ?? null,
    license: 'Pexels License',
    pageUrl: p.url,
  }));
  return { items, next: data.next_page ? `pexels:${page + 1}` : null };
}

/**
 * Поиск картинок. cursor — «провайдер:позиция» из прошлой страницы.
 * С ключом PEXELS_API_KEY первая страница — Pexels (красивые фото), дальше Commons.
 */
export async function searchFeed(query: string, cursor: string | null): Promise<FeedPage> {
  // Commons ищет по английским описаниям заметно лучше: известные русские слова переводим словарём
  const raw = query.trim().slice(0, 100);
  const q = (/[а-яё]/i.test(raw) && stickerQuery(raw)) || raw;
  if (!q) return { items: [], next: null };
  const key = `feed:${q}:${cursor ?? ''}`;
  const redis = await readyRedis().catch(() => null);
  const cached = await redis?.get(key).catch(() => null);
  if (cached) return JSON.parse(cached) as FeedPage;

  const pexelsKey = env().PEXELS_API_KEY;
  const [provider, pos] = (cursor ?? (pexelsKey ? 'pexels:1' : 'commons:0')).split(':') as [
    string,
    string,
  ];
  let page: FeedPage;
  if (provider === 'pexels' && pexelsKey) {
    page = await searchPexels(q, Number(pos) || 1, pexelsKey);
    // Pexels закончился — продолжаем Commons
    if (!page.next) page.next = 'commons:0';
  } else {
    page = await searchCommons(q, Number(pos) || 0);
  }
  await redis?.set(key, JSON.stringify(page), 'EX', CACHE_TTL).catch(() => undefined);
  return page;
}

/** Картинка ленты (только разрешённые хосты), с проверкой формата по байтам */
export async function fetchFeedImage(
  raw: string,
): Promise<{ bytes: Uint8Array; mimeType: string; width: number; height: number }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(422, 'bad_url', 'Некорректная ссылка на картинку');
  }
  if (url.protocol !== 'https:' || !FEED_IMAGE_HOSTS.has(url.hostname)) {
    throw new ApiError(422, 'bad_host', 'Картинки добавляются только из ленты');
  }
  const res = await safeFetch(url.toString(), {
    maxBytes: MAX_IMAGE_BYTES,
    timeoutMs: 30_000,
    accept: 'image/avif,image/webp,image/png,image/jpeg,image/*',
    userAgent: USER_AGENT,
  });
  if (res.status !== 200 || res.body.byteLength >= MAX_IMAGE_BYTES) {
    throw new ApiError(502, 'image_unavailable', 'Не удалось скачать картинку');
  }
  const info = imageInfo(res.body);
  if (!info) throw new ApiError(415, 'unsupported_type', 'Неподдерживаемый формат картинки');
  return { bytes: res.body, ...info };
}

/** Картинка из ленты на доску: скачивается сервером и сохраняется ассетом доски */
export async function importFeedImage(
  user: SessionUser,
  boardId: string,
  url: string,
): Promise<UploadedAsset> {
  await requireBoardAccess(boardId, user.id, 'edit');
  const limit = await rateLimit(`feed-import:${user.id}`, 120, 10 * 60);
  if (!limit.ok)
    throw new ApiError(429, 'rate_limited', 'Слишком много картинок подряд. Подождите');
  const img = await fetchFeedImage(url);
  return storeBoardImage(user.id, boardId, img.bytes, img.mimeType, {
    width: img.width,
    height: img.height,
  });
}
