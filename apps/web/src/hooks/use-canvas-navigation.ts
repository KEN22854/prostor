'use client';

import { useEffect, type RefObject } from 'react';
import { isCanvasTarget, isModKey, isTypingTarget } from '@/lib/canvas/keyboard';
import { panBy, zoomAt, type Point } from '@/lib/canvas/viewport';
import { useCanvasStore } from '@/stores/canvas-store';

/** Шаг зума кнопками и клавишами */
export const ZOOM_STEP = 1.25;

/** Чувствительность зума колесом: мышь даёт deltaY ≈ 100, тачпад-щипок — 1–10 */
const WHEEL_ZOOM_SPEED = 0.0015;

function relativePoint(el: HTMLElement, clientX: number, clientY: number): Point {
  const rect = el.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/** Колесо в строках/страницах (Firefox, некоторые мыши) → пиксели */
function wheelDelta(e: WheelEvent): { dx: number; dy: number } {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  let dx = e.deltaX * unit;
  let dy = e.deltaY * unit;
  // Shift + колесо мыши — горизонтальная прокрутка
  if (e.shiftKey && dx === 0) {
    dx = dy;
    dy = 0;
  }
  return { dx, dy };
}

/**
 * Навигация по холсту:
 *  - Ctrl/Cmd + колесо, щипок на тачпаде (браузер шлёт wheel c ctrlKey) — зум к курсору;
 *  - колесо / два пальца на тачпаде — панорамирование;
 *  - Space + drag, средняя кнопка, инструмент «рука» — панорамирование;
 *  - два пальца на тач-экране — pinch-zoom + пан;
 *  - Ctrl+= / Ctrl+− / Ctrl+0 — зум; Shift+1 — показать всё (через onFit).
 *
 * Обработчики навешаны на DOM-контейнер нативно: wheel нужен { passive: false },
 * чтобы preventDefault отменил масштабирование всей страницы браузером.
 */
export function useCanvasNavigation(
  containerRef: RefObject<HTMLElement | null>,
  onFit: () => void,
): void {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const store = useCanvasStore;

    // ── Колесо ──
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { dx, dy } = wheelDelta(e);
      if (isModKey(e)) {
        const point = relativePoint(el, e.clientX, e.clientY);
        // Ограничиваем дельту: один «щелчок» колеса не должен менять масштаб в разы
        const factor = Math.exp(
          -Math.max(-100, Math.min(100, dy)) * WHEEL_ZOOM_SPEED * (e.deltaMode === 0 ? 1 : 2),
        );
        store.getState().setCamera((cam) => zoomAt(cam, point, cam.zoom * factor));
      } else {
        store.getState().setCamera((cam) => panBy(cam, -dx, -dy));
      }
    };

    // ── Перетаскивание и pinch ──
    const pointers = new Map<number, Point>();
    let panPointer: number | null = null;
    let last: Point | null = null;
    let pinch: { distance: number; mid: Point } | null = null;

    const pinchState = (): { distance: number; mid: Point } | null => {
      const [a, b] = Array.from(pointers.values());
      if (!a || !b) return null;
      return {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!isCanvasTarget(e, el)) return;
      const point = relativePoint(el, e.clientX, e.clientY);
      if (e.pointerType === 'touch') {
        pointers.set(e.pointerId, point);
        if (pointers.size === 2) {
          // Второй палец: переходим из пана одним пальцем в pinch
          pinch = pinchState();
          panPointer = null;
          e.stopPropagation();
          return;
        }
      }
      const { tool, spacePressed } = store.getState();
      const wantsPan = e.button === 1 || spacePressed || tool === 'hand';
      if (!wantsPan) return;
      e.preventDefault();
      // capture-фаза + stopPropagation: Konva не начнёт выделение рамкой (итерация 4b)
      e.stopPropagation();
      panPointer = e.pointerId;
      last = point;
      el.setPointerCapture(e.pointerId);
      store.getState().setPanning(true);
    };

    const onPointerMove = (e: PointerEvent) => {
      const point = relativePoint(el, e.clientX, e.clientY);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, point);

      if (pinch && pointers.size >= 2) {
        const next = pinchState();
        if (!next || pinch.distance === 0) return;
        const prev = pinch;
        store.getState().setCamera((cam) => {
          const panned = panBy(cam, next.mid.x - prev.mid.x, next.mid.y - prev.mid.y);
          return zoomAt(panned, next.mid, panned.zoom * (next.distance / prev.distance));
        });
        pinch = next;
        return;
      }

      if (panPointer !== e.pointerId || !last) return;
      const dx = point.x - last.x;
      const dy = point.y - last.y;
      last = point;
      store.getState().setCamera((cam) => panBy(cam, dx, dy));
    };

    const endPointer = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (panPointer === e.pointerId) {
        panPointer = null;
        last = null;
        store.getState().setPanning(false);
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      }
    };

    // Средняя кнопка в Windows/Linux включает автопрокрутку — отключаем
    const onAuxClick = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };

    // ── Клавиатура ──
    const zoomCenter = (factor: number) => {
      const { size } = store.getState();
      store
        .getState()
        .setCamera((cam) =>
          zoomAt(cam, { x: size.width / 2, y: size.height / 2 }, cam.zoom * factor),
        );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) store.getState().setSpacePressed(true);
        return;
      }
      if (isModKey(e) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomCenter(ZOOM_STEP);
      } else if (isModKey(e) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        zoomCenter(1 / ZOOM_STEP);
      } else if (isModKey(e) && e.key === '0') {
        e.preventDefault();
        const { camera } = store.getState();
        zoomCenter(1 / camera.zoom);
      } else if (e.shiftKey && e.code === 'Digit1') {
        e.preventDefault();
        onFit();
      }
      // Клавиши инструментов (V, H, N, R…) — в use-board-hotkeys
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') store.getState().setSpacePressed(false);
    };

    // Потеря фокуса окна с зажатым Space — иначе «рука» залипает
    const onBlur = () => store.getState().setSpacePressed(false);

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown, { capture: true });
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endPointer);
    el.addEventListener('pointercancel', endPointer);
    el.addEventListener('auxclick', onAuxClick);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown, { capture: true });
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endPointer);
      el.removeEventListener('pointercancel', endPointer);
      el.removeEventListener('auxclick', onAuxClick);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [containerRef, onFit]);
}
