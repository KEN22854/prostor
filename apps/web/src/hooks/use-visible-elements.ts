'use client';

import { startTransition, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CANVAS, type BoardElement, type Bounds } from '@prostor/shared';
import { REQUERY_ZOOM_FACTOR } from '@/lib/canvas/constants';
import type { ElementStore } from '@/lib/canvas/element-store';
import {
  containsBounds,
  expandBounds,
  visibleBounds,
  type Camera,
  type Size,
} from '@/lib/canvas/viewport';
import { useCanvasStore } from '@/stores/canvas-store';

const noopSubscribe = () => () => undefined;
const zero = () => 0;

interface Query {
  bounds: Bounds;
  zoom: number;
}

function queryFor(camera: Camera, size: Size): Query {
  return {
    bounds: expandBounds(visibleBounds(camera, size), CANVAS.viewportBuffer),
    zoom: camera.zoom,
  };
}

/**
 * Виртуализация: элементы во viewport + буфер в один экран с каждой стороны.
 *
 * Гистерезис: выборка (R-tree query + сортировка + ре-рендер React)
 * пересчитывается не на каждом кадре панорамирования, а только когда
 * видимая область выходит за пределы буфера или зум меняется в 1.5+ раза.
 * Пока камера внутри буфера, Konva лишь сдвигает уже созданные ноды.
 */
export function useVisibleElements(store: ElementStore | null): BoardElement[] {
  const version = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getVersion ?? zero,
    zero,
  );
  const [query, setQuery] = useState<Query | null>(null);
  const lastQuery = useRef<Query | null>(null);

  useEffect(() => {
    const update = () => {
      const { camera, size } = useCanvasStore.getState();
      if (size.width === 0 || size.height === 0) return;
      const prev = lastQuery.current;
      if (prev) {
        const ratio = camera.zoom / prev.zoom;
        const zoomStable = ratio < REQUERY_ZOOM_FACTOR && ratio > 1 / REQUERY_ZOOM_FACTOR;
        // Камера внутри буфера — ничего не планируем (так проходит большинство кадров)
        if (zoomStable && containsBounds(prev.bounds, visibleBounds(camera, size))) return;
      }
      const next = queryFor(camera, size);
      lastQuery.current = next;
      // Переходный (низкоприоритетный) рендер: монтирование сотен Konva-нод
      // нарезается React на короткие куски и не блокирует кадры панорамирования.
      // Пока новая выборка готовится, края экрана закрывает буфер в один экран.
      startTransition(() => setQuery(next));
    };
    update();
    return useCanvasStore.subscribe((state, prev) => {
      if (state.camera !== prev.camera || state.size !== prev.size) update();
    });
  }, []);

  return useMemo(
    () => (store && query ? store.query(query.bounds) : []),
    // version — сигнал об изменении данных в store
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, query, version],
  );
}
