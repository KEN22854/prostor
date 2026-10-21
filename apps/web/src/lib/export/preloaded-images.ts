'use client';

import { createContext } from 'react';
import { assetUrl, type BoardElement } from '@prostor/shared';

/**
 * Картинки, загруженные заранее для экспорта. Офлайн-Stage рисуется один раз
 * и сразу снимается в canvas — ждать, пока каждая ImageShape догрузит файл
 * через use-image, нельзя, поэтому ImageShape берёт готовый HTMLImageElement отсюда.
 */
export const PreloadedImagesContext = createContext<ReadonlyMap<string, HTMLImageElement>>(
  new Map(),
);

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Ассеты, которые рисуются при экспорте: картинки и превью карточек ссылок */
function imageAssetIds(elements: readonly BoardElement[]): string[] {
  const ids: string[] = [];
  for (const el of elements) {
    if (el.type === 'image' && 'assetId' in el) ids.push(el.assetId);
    if (el.type === 'embed' && el.imageAssetId) ids.push(el.imageAssetId);
  }
  return ids;
}

export async function preloadImages(
  elements: readonly BoardElement[],
): Promise<Map<string, HTMLImageElement>> {
  const ids = new Set<string>();
  for (const id of imageAssetIds(elements)) ids.add(id);
  const entries = await Promise.all(
    Array.from(ids).map(async (id) => [id, await loadImage(assetUrl(id))] as const),
  );
  const map = new Map<string, HTMLImageElement>();
  for (const [id, img] of entries) if (img) map.set(id, img);
  return map;
}

/** data: URL для SVG (внешние ссылки в SVG-файле не откроются без входа в Простор) */
export async function imagesAsDataUrls(
  elements: readonly BoardElement[],
): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const id of imageAssetIds(elements)) ids.add(id);
  const map = new Map<string, string>();
  await Promise.all(
    Array.from(ids).map(async (id) => {
      try {
        const res = await fetch(assetUrl(id));
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        map.set(id, dataUrl);
      } catch {
        // Картинка недоступна — в SVG будет плейсхолдер
      }
    }),
  );
  return map;
}
