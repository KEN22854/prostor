'use client';

import { useEffect } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import type { Camera } from '@/lib/canvas/viewport';
import {
  cameraForViewport,
  closeEnough,
  findFollowTarget,
  findPresenter,
  lerpCamera,
} from '@/lib/presence/follow';
import { useCanvasStore } from '@/stores/canvas-store';

/** Доля пути к цели за кадр: ~150 мс до совпадения, без рывков между апдейтами (4/с) */
const FOLLOW_EASE = 0.25;

/**
 * Follow-mode: камера повторяет viewport выбранного участника.
 *
 * - Ручное движение камеры (колесо, перетаскивание, «показать всё») выключает
 *   следование — как в Miro: пользователь «отвоевал» камеру.
 * - Если кто-то «позвал всех за собой» (awareness.presenting), включаемся
 *   автоматически; отказ от конкретного показа запоминается до следующего.
 * - В awareness публикуем, за кем следуем: ведущий видит число зрителей.
 */
export function useFollow(awareness: Awareness | null, selfId: string | undefined): void {
  useEffect(() => {
    if (!awareness) return;
    let target: Camera | null = null;
    let frame = 0;
    let applying = false;
    /** Показ, от которого пользователь отказался (since) — заново не втягиваем */
    let dismissedSince = 0;
    let presenterSince = 0;

    const tick = () => {
      frame = 0;
      const { camera, setCamera, follow } = useCanvasStore.getState();
      if (!target || !follow) return;
      const next = closeEnough(camera, target) ? target : lerpCamera(camera, target, FOLLOW_EASE);
      applying = true;
      setCamera(next);
      applying = false;
      if (next !== target) frame = requestAnimationFrame(tick);
    };

    const update = () => {
      const { follow, size, setFollow } = useCanvasStore.getState();

      // Автоследование за ведущим показа
      const presenter = findPresenter(awareness, selfId);
      if (
        presenter &&
        presenter.since !== dismissedSince &&
        (!follow || follow.auto) &&
        follow?.userId !== presenter.user.id
      ) {
        presenterSince = presenter.since;
        setFollow({
          userId: presenter.user.id,
          name: presenter.user.name,
          color: presenter.user.color,
          auto: true,
        });
        return;
      }
      if (!presenter && follow?.auto) {
        setFollow(null);
        return;
      }

      if (!follow || size.width === 0) return;
      const found = findFollowTarget(awareness, follow.userId);
      if (!found) {
        // Ведущий ушёл с доски
        setFollow(null);
        return;
      }
      target = cameraForViewport(found.viewport, size);
      if (!frame) frame = requestAnimationFrame(tick);
    };

    awareness.on('change', update);
    const unsubscribe = useCanvasStore.subscribe((s, p) => {
      if (s.follow !== p.follow) {
        awareness.setLocalStateField('following', s.follow?.userId ?? null);
        if (!s.follow && p.follow?.auto) dismissedSince = presenterSince;
        target = null;
        update();
        return;
      }
      // Камеру сдвинул сам пользователь — выходим из следования
      if (s.follow && s.camera !== p.camera && !applying) {
        if (s.follow.auto) dismissedSince = presenterSince;
        s.setFollow(null);
      }
    });
    update();

    return () => {
      awareness.off('change', update);
      unsubscribe();
      cancelAnimationFrame(frame);
      useCanvasStore.getState().setFollow(null);
    };
  }, [awareness, selfId]);
}
