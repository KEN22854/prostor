'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { clampZoom, type Camera } from '@/lib/canvas/viewport';
import { useCanvasStore } from '@/stores/canvas-store';

const key = (boardId: string) => `prostor:camera:${boardId}`;

function readCamera(boardId: string): Camera | null {
  try {
    const raw = localStorage.getItem(key(boardId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { x, y, zoom } = parsed as Record<string, unknown>;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof zoom !== 'number') return null;
    if (![x, y, zoom].every(Number.isFinite)) return null;
    return { x, y, zoom: clampZoom(zoom) };
  } catch {
    // Приватный режим / запрет хранилища — просто начинаем с начала
    return null;
  }
}

/**
 * Запоминает положение камеры для доски в localStorage (только для этого
 * браузера — удобство, а не данные доски).
 *
 * restored: null — ещё не проверяли; true — камера восстановлена;
 * false — сохранённой нет, холст сам покажет всё содержимое.
 */
export function useCameraPersistence(boardId: string): boolean | null {
  const [restored, setRestored] = useState<boolean | null>(null);

  // layout-эффект: камера выставляется до первой отрисовки — без «прыжка»
  useLayoutEffect(() => {
    const store = useCanvasStore.getState();
    store.reset();
    const saved = readCamera(boardId);
    if (saved) store.setCamera(saved);
    setRestored(saved !== null);
  }, [boardId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useCanvasStore.subscribe((state, prev) => {
      if (state.camera === prev.camera) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          localStorage.setItem(key(boardId), JSON.stringify(state.camera));
        } catch {
          // Квота или запрет — не критично
        }
      }, 300);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [boardId]);

  return restored;
}
