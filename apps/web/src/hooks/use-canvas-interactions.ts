'use client';

import { useEffect, type RefObject } from 'react';
import { InteractionController, type ControllerDeps } from '@/lib/canvas/interaction-controller';
import { isCanvasTarget } from '@/lib/canvas/keyboard';
import { screenToWorld, type Point } from '@/lib/canvas/viewport';
import { useCanvasStore } from '@/stores/canvas-store';

function relative(el: HTMLElement, e: PointerEvent): Point {
  const rect = el.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/**
 * Подключает InteractionController к DOM-контейнеру холста.
 *
 * Слушатели в bubble-фазе: навигация (Space/средняя кнопка/«рука») стоит в
 * capture-фазе и останавливает событие, так что панорамирование и
 * инструменты не конфликтуют. Второй палец на тач-экране (pinch)
 * отменяет начатое действие.
 */
export function useCanvasInteractions(
  containerRef: RefObject<HTMLElement | null>,
  deps: ControllerDeps | null,
): InteractionController | null {
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !deps) return;
    const controller = new InteractionController(deps);
    const touches = new Set<number>();
    let activePointer: number | null = null;

    const world = (e: PointerEvent) =>
      screenToWorld(useCanvasStore.getState().camera, relative(el, e));

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touches.add(e.pointerId);
        if (touches.size > 1) {
          controller.cancel();
          activePointer = null;
          return;
        }
      }
      if (!isCanvasTarget(e, el)) return; // панели и кнопки поверх холста
      if (useCanvasStore.getState().editingId) return; // клик вне редактора закрывает его (blur)
      if (controller.pointerDown(e, world(e), relative(el, e))) {
        // Без этого следом придёт совместимый mousedown, и браузер переведёт
        // фокус на body: только что открытый редактор текста сразу закроется
        // (blur), а при перетаскивании начнётся выделение текста страницы.
        e.preventDefault();
        activePointer = e.pointerId;
        el.setPointerCapture(e.pointerId);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (activePointer === e.pointerId) controller.pointerMove(e, world(e));
    };
    const onUp = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (activePointer !== e.pointerId) return;
      activePointer = null;
      controller.pointerUp(e, world(e));
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const onCancel = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (activePointer !== e.pointerId) return;
      activePointer = null;
      controller.cancel();
    };
    const onDoubleClick = (e: MouseEvent) => {
      if (e.button !== 0 || !isCanvasTarget(e, el)) return;
      const rect = el.getBoundingClientRect();
      controller.doubleClick(
        screenToWorld(useCanvasStore.getState().camera, {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        }),
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && controller.active) {
        e.stopPropagation();
        controller.cancel();
        activePointer = null;
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('dblclick', onDoubleClick);
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      controller.cancel();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('dblclick', onDoubleClick);
      window.removeEventListener('keydown', onKey, { capture: true });
    };
  }, [containerRef, deps]);

  return null;
}
