'use client';

import type Konva from 'konva';
import type { Context } from 'konva/lib/Context';
import { memo, useCallback, useMemo, useRef } from 'react';
import { Shape } from 'react-konva';
import type { BoardElement } from '@prostor/shared';
import { drawMinimapElement, MinimapImages } from '@/lib/canvas/minimap-render';
import { useCanvasStore } from '@/stores/canvas-store';

/**
 * Режим сильного отдаления: все видимые элементы рисуются ОДНИМ Konva.Shape
 * в одном sceneFunc. Вместо 10 000 нод (каждая — отдельный draw с
 * save/transform/restore) — один проход по массиву.
 *
 * Рисует тот же рендер, что и мини-карта: настоящие формы с контурами, линии
 * со стрелками, картинки, диаграммы и текст буквами, пока он читается, — при
 * отдалении доска не превращается в набор цветных прямоугольников.
 *
 * Слой неинтерактивный (listening=false): попадания считает свой hit-test.
 */
export const LodShape = memo(function LodShape({ elements }: { elements: BoardElement[] }) {
  const shapeRef = useRef<Konva.Shape>(null);
  // Картинка догрузилась — перерисовать слой
  const images = useMemo(
    () => new MinimapImages(() => shapeRef.current?.getLayer()?.batchDraw()),
    [],
  );

  const sceneFunc = useCallback(
    (ctx: Context) => {
      const native = ctx._context;
      const { zoom } = useCanvasStore.getState().camera;
      for (const el of elements) drawMinimapElement(native, el, zoom, images);
    },
    [elements, images],
  );

  return (
    <Shape ref={shapeRef} sceneFunc={sceneFunc} listening={false} perfectDrawEnabled={false} />
  );
});
