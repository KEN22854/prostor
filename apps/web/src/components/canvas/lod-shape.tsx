'use client';

import type { Context } from 'konva/lib/Context';
import { memo, useCallback } from 'react';
import { Shape } from 'react-konva';
import type { BoardElement } from '@prostor/shared';
import { NEUTRAL_FILL } from '@/lib/canvas/constants';

function fillOf(el: BoardElement): string {
  if ('fill' in el && typeof el.fill === 'string') return el.fill;
  if ('stroke' in el && typeof el.stroke === 'string') return el.stroke;
  if (el.type === 'text') return 'rgba(100,116,139,0.35)';
  return NEUTRAL_FILL;
}

/**
 * Режим сильного отдаления: все видимые элементы рисуются ОДНИМ Konva.Shape
 * в одном sceneFunc. Вместо 10 000 нод (каждая — отдельный draw с
 * save/transform/restore) — один проход по массиву с fillRect.
 * Поворот и текст опускаются: на таком масштабе элемент — несколько пикселей.
 *
 * Слой неинтерактивный (listening=false): выделять объекты на таком
 * масштабе всё равно бессмысленно.
 */
export const LodShape = memo(function LodShape({ elements }: { elements: BoardElement[] }) {
  const sceneFunc = useCallback(
    (ctx: Context) => {
      for (const el of elements) {
        if ('points' in el && Array.isArray(el.points) && el.points.length >= 4) {
          ctx.beginPath();
          ctx.moveTo(el.x + (el.points[0] ?? 0), el.y + (el.points[1] ?? 0));
          for (let i = 2; i + 1 < el.points.length; i += 2) {
            ctx.lineTo(el.x + (el.points[i] ?? 0), el.y + (el.points[i + 1] ?? 0));
          }
          ctx.setAttr('strokeStyle', fillOf(el));
          ctx.setAttr(
            'lineWidth',
            'strokeWidth' in el && typeof el.strokeWidth === 'number' ? el.strokeWidth : 2,
          );
          ctx.stroke();
          continue;
        }
        ctx.setAttr('fillStyle', fillOf(el));
        ctx.setAttr('globalAlpha', el.type === 'frame' ? 0.5 : el.opacity);
        ctx.fillRect(el.x, el.y, el.width, el.height);
      }
      ctx.setAttr('globalAlpha', 1);
    },
    [elements],
  );

  return <Shape sceneFunc={sceneFunc} listening={false} perfectDrawEnabled={false} />;
});
