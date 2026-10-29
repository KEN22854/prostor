'use client';

import type Konva from 'konva';
import { useMemo } from 'react';
import { Group, Rect, Shape } from 'react-konva';
import type { ChartElement } from '@prostor/shared';
import type { DetailLevel } from '@/lib/canvas/constants';
import { canvasFont } from '@/lib/canvas/fonts';
import { chartScene, drawChartScene } from '@/lib/charts/scene';

/**
 * Диаграмма: карточка-фон и одна Konva.Shape, рисующая примитивы раскладки.
 * Раскладка пересчитывается только при смене данных или размера.
 */
export function ChartShape({
  element: el,
  detail,
}: {
  element: ChartElement;
  detail: DetailLevel;
}) {
  const scene = useMemo(
    () => chartScene(el, el.width, el.height),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- данные диаграммы, без позиции
    [
      el.chartType,
      el.title,
      el.labels,
      el.series,
      el.showLegend,
      el.showValues,
      el.width,
      el.height,
    ],
  );
  const family = canvasFont('Inter');
  const sceneFunc = (ctx: Konva.Context) => {
    drawChartScene(ctx._context, scene, { text: detail === 'full', family });
  };
  return (
    <Group x={el.x} y={el.y} rotation={el.rotation} opacity={el.opacity} id={el.id} name="element">
      <Rect
        width={el.width}
        height={el.height}
        fill={el.fill}
        stroke="#e2e8f0"
        strokeWidth={1}
        cornerRadius={14}
        strokeScaleEnabled={false}
        perfectDrawEnabled={false}
      />
      {detail !== 'lod' ? (
        <Shape
          width={el.width}
          height={el.height}
          sceneFunc={sceneFunc}
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : null}
    </Group>
  );
}
