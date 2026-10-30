'use client';

import { useEffect, type RefObject } from 'react';

const LONG_PRESS_MS = 550;
const TAP_MS = 300;
const MOVE_TOLERANCE = 10;

/** iOS не присылает contextmenu на долгое нажатие — там его эмулируем */
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Жесты холста на тач-экранах (поверх pinch-зума и пана двумя пальцами):
 *  - долгое нажатие одним пальцем — контекстное меню (на iOS — эмуляция);
 *  - короткое касание двумя пальцами — отменить, тремя — повторить.
 */
export function useTouchGestures(
  containerRef: RefObject<HTMLElement | null>,
  { onUndo, onRedo }: { onUndo: () => void; onRedo: () => void },
): void {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const touches = new Map<number, { x: number; y: number }>();
    let started = 0;
    let maxFingers = 0;
    let moved = false;
    let longPress: ReturnType<typeof setTimeout> | null = null;
    const emulateMenu = isIOS();

    const clearLongPress = () => {
      if (longPress) clearTimeout(longPress);
      longPress = null;
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (touches.size === 0) {
        started = performance.now();
        maxFingers = 0;
        moved = false;
      }
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      maxFingers = Math.max(maxFingers, touches.size);
      clearLongPress();
      if (touches.size === 1 && emulateMenu) {
        const { clientX, clientY } = e;
        const target = e.target as Element;
        longPress = setTimeout(() => {
          longPress = null;
          if (moved || touches.size !== 1) return;
          target.dispatchEvent(
            new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY }),
          );
        }, LONG_PRESS_MS);
      }
    };

    const move = (e: PointerEvent) => {
      const start = touches.get(e.pointerId);
      if (!start) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE) {
        moved = true;
        clearLongPress();
      }
    };

    const up = (e: PointerEvent) => {
      if (!touches.delete(e.pointerId)) return;
      clearLongPress();
      if (touches.size > 0) return;
      // Все пальцы подняты: короткое неподвижное касание несколькими — жест
      if (moved || performance.now() - started > TAP_MS) return;
      if (maxFingers === 2) onUndo();
      else if (maxFingers === 3) onRedo();
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      clearLongPress();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [containerRef, onUndo, onRedo]);
}
