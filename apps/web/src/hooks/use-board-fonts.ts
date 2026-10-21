'use client';

import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { Y_KEYS } from '@prostor/shared';
import type { ElementStore } from '@/lib/canvas/element-store';
import { resetMeasureCache } from '@/lib/canvas/measure-text';
import { loadFont } from '@/lib/fonts/loader';

/** Свои шрифты доски в Yjs: meta.fonts — семейство → assetId (видят все участники) */
export function boardFontsMap(doc: Y.Doc): Y.Map<string> {
  const meta = doc.getMap<unknown>(Y_KEYS.meta);
  let fonts = meta.get('fonts');
  if (!(fonts instanceof Y.Map)) {
    fonts = new Y.Map<string>();
    meta.set('fonts', fonts);
  }
  return fonts as Y.Map<string>;
}

export function readBoardFonts(doc: Y.Doc | null): Map<string, string> {
  const fonts = doc?.getMap<unknown>(Y_KEYS.meta).get('fonts');
  return fonts instanceof Y.Map
    ? new Map(Object.entries(fonts.toJSON() as Record<string, string>))
    : new Map();
}

/**
 * Подгружает шрифты, которыми написаны объекты доски, и свои шрифты доски.
 * Возвращает «эпоху»: растёт после каждой загрузки — холст пересоздаёт слой
 * (Konva измеряет текст при создании ноды) и сбрасывает кэш измерений.
 */
export function useBoardFonts(store: ElementStore | null, doc: Y.Doc | null): number {
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Шрифт интерфейса (Inter, display: swap) — первая перерисовка после его загрузки
    void document.fonts?.ready.then(() => {
      if (cancelled) return;
      resetMeasureCache();
      setEpoch((e) => e + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scan = () => {
      const custom = readBoardFonts(doc);
      const families = new Set<string>();
      for (const el of store.values()) {
        const family = (el as { fontFamily?: unknown }).fontFamily;
        if (typeof family === 'string') families.add(family);
      }
      void Promise.all(Array.from(families, (f) => loadFont(f, custom.get(f)))).then((results) => {
        if (cancelled || !results.some(Boolean)) return;
        resetMeasureCache();
        setEpoch((e) => e + 1);
      });
    };
    // Полный проход по объектам — с задержкой, а не на каждую правку
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(scan, 300);
    };
    scan();
    const unsubscribe = store.subscribe(schedule);
    const meta = doc?.getMap(Y_KEYS.meta);
    meta?.observeDeep(schedule);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
      meta?.unobserveDeep(schedule);
    };
  }, [store, doc]);

  return epoch;
}
