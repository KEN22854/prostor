'use client';

import * as Y from 'yjs';
import { Y_KEYS, type BoardElement, type Bounds } from '@prostor/shared';
import { boundsOf, readElement } from '@/lib/canvas/read-element';
import { safeScale } from '@/lib/export/export-pages';
import { canvasToBlob, renderPageToCanvas } from '@/lib/export/render-raster';

/** Ширина картинки превью: карточка ~320 px, вдвое — для чётких retina-экранов */
const PREVIEW_WIDTH = 720;
/** Пропорции карточки на дашборде */
const ASPECT = 16 / 10;
const PADDING = 24;
const FRAME_TITLE_SPACE = 30;
const CACHE = 'prostor-board-previews-v1';

/** Рамка содержимого, расширенная до пропорций карточки — превью без обрезки */
export function previewBounds(elements: readonly BoardElement[]): Bounds | null {
  let b: Bounds | null = null;
  for (const el of elements) {
    const e = boundsOf(el);
    const top = el.type === 'frame' ? e.minY - FRAME_TITLE_SPACE : e.minY;
    b = b
      ? {
          minX: Math.min(b.minX, e.minX),
          minY: Math.min(b.minY, top),
          maxX: Math.max(b.maxX, e.maxX),
          maxY: Math.max(b.maxY, e.maxY),
        }
      : { ...e, minY: top };
  }
  if (!b) return null;
  let w = b.maxX - b.minX + PADDING * 2;
  let h = b.maxY - b.minY + PADDING * 2;
  if (w / h < ASPECT) w = h * ASPECT;
  else h = w / ASPECT;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { minX: cx - w / 2, minY: cy - h / 2, maxX: cx + w / 2, maxY: cy + h / 2 };
}

const memory = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

/** Рендер по одному: десяток невидимых Konva-сцен разом подвесил бы страницу */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function cached(key: string): Promise<Blob | null> {
  try {
    const hit = await (await caches.open(CACHE)).match(key);
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

async function remember(key: string, blob: Blob): Promise<void> {
  try {
    await (await caches.open(CACHE)).put(key, new Response(blob));
  } catch {
    // Кэш недоступен (приватный режим) — просто нарисуем в следующий раз заново
  }
}

async function render(boardId: string, version: string): Promise<Blob | null> {
  const res = await fetch(`/api/boards/${boardId}/state?v=${encodeURIComponent(version)}`);
  if (!res.ok) return null;
  const doc = new Y.Doc();
  const elements: BoardElement[] = [];
  try {
    const state = new Uint8Array(await res.arrayBuffer());
    if (state.length > 0) Y.applyUpdate(doc, state);
    doc.getMap<unknown>(Y_KEYS.elements).forEach((value, id) => {
      if (!(value instanceof Y.Map)) return;
      const el = readElement(id, value as Y.Map<unknown>);
      if (el && !el.hidden) elements.push(el);
    });
  } finally {
    doc.destroy();
  }
  const bounds = previewBounds(elements);
  if (!bounds) return null;
  const canvas = await renderPageToCanvas(
    { name: '', elements, bounds, clip: true },
    {
      scale: safeScale(bounds, PREVIEW_WIDTH / (bounds.maxX - bounds.minX)),
      background: null,
    },
  );
  return canvasToBlob(canvas, 'image/webp', 0.9);
}

/**
 * Превью доски (object URL) или null для пустой доски. Версия — время последней
 * правки: пока доска не менялась, картинка берётся из кэша браузера.
 */
export function boardPreview(boardId: string, version: string): Promise<string | null> {
  const key = `/board-preview/${boardId}?v=${encodeURIComponent(version)}`;
  let pending = memory.get(key);
  if (!pending) {
    pending = (async () => {
      const blob = (await cached(key)) ?? (await enqueue(() => render(boardId, version)));
      if (!blob) return null;
      void remember(key, blob);
      return URL.createObjectURL(blob);
    })().catch(() => null);
    memory.set(key, pending);
  }
  return pending;
}
