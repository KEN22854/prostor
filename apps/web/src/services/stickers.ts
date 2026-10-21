import 'server-only';
import type { UploadedAsset } from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { readyRedis } from '@/lib/redis';
import { rateLimit } from '@/lib/rate-limit';
import { safeFetch } from '@/lib/safe-fetch';
import type { SessionUser } from '@/lib/session';
import { STICKER_PREFIXES, isStickerId, stickerQuery } from '@/lib/stickers';
import { storeBoardImage } from '@/services/assets';
import { requireBoardAccess } from '@/services/boards';

/**
 * Стикеры из открытых наборов эмодзи через Iconify API.
 *
 * Iconify ограничивает частоту запросов, поэтому SVG не качаются по одному:
 * данные иконок приходят пакетом (/набор.json?icons=a,b,c — до 100 за раз),
 * SVG собирается здесь и кэшируется в Redis на месяц.
 */

const API = 'https://api.iconify.design';
const SEARCH_TTL = 24 * 3600;
const SVG_TTL = 30 * 24 * 3600;
const BATCH = 100;

/** Поиск стикеров: id вида набор:имя; русский запрос переводится словарём */
export async function searchStickers(
  raw: string,
  prefix: string | null,
  limit: number,
): Promise<string[]> {
  const query = stickerQuery(raw);
  if (!query) return [];
  const prefixes =
    prefix && STICKER_PREFIXES.has(prefix) ? prefix : [...STICKER_PREFIXES].join(',');
  const url = new URL('/search', API);
  url.searchParams.set('query', query);
  url.searchParams.set('prefixes', prefixes);
  url.searchParams.set('limit', String(Math.min(Math.max(limit, 32), 999)));
  const key = `stickers:search:${url.search}`;
  const redis = await readyRedis().catch(() => null);
  const cached = await redis?.get(key).catch(() => null);
  if (cached) return JSON.parse(cached) as string[];

  const res = await safeFetch(url.toString(), {
    maxBytes: 1024 * 1024,
    timeoutMs: 10_000,
    accept: 'application/json',
  });
  if (res.status !== 200)
    throw new ApiError(502, 'stickers_unavailable', 'Библиотека стикеров сейчас недоступна');
  const icons = (
    (JSON.parse(new TextDecoder().decode(res.body)) as { icons?: string[] }).icons ?? []
  ).filter(isStickerId);
  await redis?.set(key, JSON.stringify(icons), 'EX', SEARCH_TTL).catch(() => undefined);
  return icons;
}

interface IconData {
  body: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}

interface IconSet {
  width?: number;
  height?: number;
  icons?: Record<string, IconData>;
  aliases?: Record<string, { parent: string } & Partial<IconData>>;
}

/** SVG из данных Iconify (без скриптов: тело иконки — фигуры и градиенты) */
export function iconToSvg(icon: IconData, set: IconSet): string | null {
  if (/<script|\son\w+=|javascript:/i.test(icon.body)) return null;
  const w = icon.width ?? set.width ?? 16;
  const h = icon.height ?? set.height ?? 16;
  const l = icon.left ?? 0;
  const t = icon.top ?? 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${l} ${t} ${w} ${h}" width="${w}" height="${h}">${icon.body}</svg>`;
}

/** SVG нескольких стикеров: из кэша, остальное — пакетами по набору */
export async function stickerSvgs(ids: string[]): Promise<Record<string, string>> {
  const valid = [...new Set(ids.filter(isStickerId))];
  const result: Record<string, string> = {};
  if (valid.length === 0) return result;
  const redis = await readyRedis().catch(() => null);
  const cached =
    (await redis?.mget(valid.map((id) => `stickers:svg:${id}`)).catch(() => null)) ?? [];
  const missing = new Map<string, string[]>();
  valid.forEach((id, i) => {
    const svg = cached[i];
    if (svg) {
      result[id] = svg;
      return;
    }
    const [prefix, name] = id.split(':') as [string, string];
    missing.set(prefix, [...(missing.get(prefix) ?? []), name]);
  });

  for (const [prefix, names] of missing) {
    for (let i = 0; i < names.length; i += BATCH) {
      const chunk = names.slice(i, i + BATCH);
      const res = await safeFetch(`${API}/${prefix}.json?icons=${chunk.join(',')}`, {
        maxBytes: 4 * 1024 * 1024,
        timeoutMs: 15_000,
        accept: 'application/json',
      });
      if (res.status !== 200) continue;
      const set = JSON.parse(new TextDecoder().decode(res.body)) as IconSet;
      const pipeline = redis?.pipeline();
      for (const name of chunk) {
        const alias = set.aliases?.[name];
        const icon = set.icons?.[name] ?? (alias ? set.icons?.[alias.parent] : undefined);
        const svg = icon ? iconToSvg({ ...icon, ...(alias ?? {}), body: icon.body }, set) : null;
        if (!svg) continue;
        result[`${prefix}:${name}`] = svg;
        pipeline?.set(`stickers:svg:${prefix}:${name}`, svg, 'EX', SVG_TTL);
      }
      await pipeline?.exec().catch(() => undefined);
    }
  }
  return result;
}

export async function stickerSvg(id: string): Promise<string | null> {
  return (await stickerSvgs([id]))[id] ?? null;
}

/** Размер по viewBox (×512 по большей стороне — растр чёткий и при увеличении) */
export function svgSize(svg: string): { width: number; height: number } {
  const viewBox = /viewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/.exec(svg);
  const width = Number(viewBox?.[1] ?? 128);
  const height = Number(viewBox?.[2] ?? 128);
  const scale = 512 / Math.max(width, height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Стикер на доску: SVG сохраняется ассетом доски (экспорт и офлайн работают как с картинкой) */
export async function addStickerToBoard(
  user: SessionUser,
  boardId: string,
  id: string,
): Promise<UploadedAsset> {
  await requireBoardAccess(boardId, user.id, 'edit');
  const limit = await rateLimit(`stickers:${user.id}`, 200, 10 * 60);
  if (!limit.ok)
    throw new ApiError(429, 'rate_limited', 'Слишком много стикеров подряд. Подождите');
  const svg = await stickerSvg(id);
  if (!svg) throw new ApiError(404, 'sticker_not_found', 'Стикер не найден');
  return storeBoardImage(
    user.id,
    boardId,
    new TextEncoder().encode(svg),
    'image/svg+xml',
    svgSize(svg),
  );
}
