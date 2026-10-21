'use client';

import { useEffect, type RefObject } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import { CURSOR_SEND_INTERVAL_MS, VIEWPORT_SEND_INTERVAL_MS } from '@/lib/canvas/constants';
import { screenToWorld } from '@/lib/canvas/viewport';
import { useCanvasStore } from '@/stores/canvas-store';

/**
 * Публикует в awareness свой курсор (мировые координаты) и viewport.
 *
 * Троттлинг: курсор — не чаще 20 раз/с, viewport — 4 раза/с. Каждый
 * setLocalStateField отправляет awareness-апдейт всем участникам доски;
 * при 100 пользователях без троттлинга это тысячи сообщений в секунду.
 * Плавность на принимающей стороне обеспечивает интерполяция (CursorsRenderer).
 */
export function usePresenceBroadcast(
  containerRef: RefObject<HTMLElement | null>,
  awareness: Awareness | null,
): void {
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !awareness) return;

    let lastSent = 0;
    let pending: { x: number; y: number } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      lastSent = Date.now();
      awareness.setLocalStateField('cursor', pending);
    };

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const { camera } = useCanvasStore.getState();
      const world = screenToWorld(camera, { x: e.clientX - rect.left, y: e.clientY - rect.top });
      pending = { x: Math.round(world.x * 10) / 10, y: Math.round(world.y * 10) / 10 };
      const wait = CURSOR_SEND_INTERVAL_MS - (Date.now() - lastSent);
      if (wait <= 0) flush();
      else timer ??= setTimeout(flush, wait);
    };

    const onLeave = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      awareness.setLocalStateField('cursor', null);
    };

    let viewportTimer: ReturnType<typeof setTimeout> | null = null;
    const sendViewport = () => {
      viewportTimer = null;
      const { camera, size } = useCanvasStore.getState();
      awareness.setLocalStateField('viewport', { ...camera, ...size });
    };
    const unsubscribe = useCanvasStore.subscribe((s, p) => {
      // Выделение — коллеги видят рамки вокруг того, что я выбрал (не больше 200 id)
      if (s.selection !== p.selection)
        awareness.setLocalStateField('selection', s.selection.slice(0, 200));
      if (s.camera === p.camera && s.size === p.size) return;
      viewportTimer ??= setTimeout(sendViewport, VIEWPORT_SEND_INTERVAL_MS);
    });
    sendViewport();

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      if (timer) clearTimeout(timer);
      if (viewportTimer) clearTimeout(viewportTimer);
      unsubscribe();
    };
  }, [containerRef, awareness]);
}
