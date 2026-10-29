'use client';

import type Konva from 'konva';
import { useMemo } from 'react';
import { Shape } from 'react-konva';
import type { RichParagraph } from '@prostor/shared';
import { canvasFont } from '@/lib/canvas/fonts';
import { measureText } from '@/lib/canvas/measure-text';
import { layoutRich, type RichLayoutOptions, type RichMarker } from '@/lib/rich-text/layout';

/** Маркер пункта: точка, номер или квадратик чек-листа (с галочкой) */
function drawMarker(
  ctx: Konva.Context,
  marker: RichMarker,
  y: number,
  family: string,
  color: string,
): void {
  const size = marker.size;
  ctx.setAttr('fillStyle', color);
  if (marker.kind === 'bullet') {
    ctx.setAttr('font', `${size}px ${family}`);
    ctx.fillText('•', marker.x + size * 0.15, y);
    return;
  }
  if (marker.kind === 'number') {
    ctx.setAttr('font', `${size}px ${family}`);
    ctx.fillText(marker.label ?? '', marker.x, y);
    return;
  }
  // roundRect есть у нативного контекста, у обёртки Konva — нет
  const c = ctx._context;
  const box = size * 0.7;
  const left = marker.x + size * 0.05;
  const top = y - box / 2;
  c.lineWidth = Math.max(1, size / 12);
  c.beginPath();
  c.roundRect(left, top, box, box, box * 0.22);
  if (!marker.checked) {
    c.strokeStyle = color;
    c.stroke();
    return;
  }
  c.fillStyle = '#9b6bdf';
  c.fill();
  c.strokeStyle = '#ffffff';
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(left + box * 0.22, top + box * 0.52);
  c.lineTo(left + box * 0.43, top + box * 0.72);
  c.lineTo(left + box * 0.78, top + box * 0.3);
  c.stroke();
}

interface RichTextProps {
  paragraphs: readonly RichParagraph[];
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  color: string;
  align: RichLayoutOptions['align'];
  verticalAlign: RichLayoutOptions['verticalAlign'];
  ellipsis?: boolean;
}

/**
 * Форматированный текст на холсте: одна Konva.Shape рисует все строки
 * (fillText по фрагментам + линии подчёркивания/зачёркивания). Раскладка
 * пересчитывается только при изменении текста или размеров элемента.
 */
export function RichText(props: RichTextProps) {
  const family = canvasFont(props.fontFamily);
  const lines = useMemo(
    () =>
      layoutRich(
        props.paragraphs,
        {
          width: props.width,
          height: props.height,
          fontSize: props.fontSize,
          family,
          bold: props.bold,
          italic: props.italic,
          align: props.align,
          verticalAlign: props.verticalAlign,
          ellipsis: props.ellipsis ?? true,
        },
        measureText,
      ),
    [
      props.paragraphs,
      props.width,
      props.height,
      props.fontSize,
      family,
      props.bold,
      props.italic,
      props.align,
      props.verticalAlign,
      props.ellipsis,
    ],
  );

  const sceneFunc = (ctx: Konva.Context) => {
    ctx.setAttr('textBaseline', 'middle');
    // Прозрачность объекта (opacity, анимация появления) Konva уже задала — умножаем на неё
    const alpha = ctx._context.globalAlpha;
    for (const line of lines) {
      ctx.setAttr('globalAlpha', line.dim ? alpha * 0.5 : alpha);
      // Маркер под текстом — сначала фоны всей строки
      for (const seg of line.segments) {
        if (!seg.highlight || !seg.text) continue;
        ctx.setAttr('fillStyle', seg.highlight);
        ctx.fillRect(seg.x - 1, line.y - line.height * 0.55, seg.width + 2, line.height * 1.1);
      }
      if (line.marker) drawMarker(ctx, line.marker, line.y, family, props.color);
      for (const seg of line.segments) {
        const thickness = Math.max(1, seg.size / 15);
        ctx.setAttr('fillStyle', seg.color ?? props.color);
        ctx.setAttr('font', seg.font);
        ctx.fillText(seg.text, seg.x, line.y);
        if (seg.underline) ctx.fillRect(seg.x, line.y + seg.size * 0.38, seg.width, thickness);
        if (seg.strike || line.dim)
          ctx.fillRect(seg.x, line.y - thickness / 2 + seg.size * 0.04, seg.width, thickness);
      }
    }
    ctx.setAttr('globalAlpha', alpha);
  };

  return (
    <Shape
      x={props.x}
      y={props.y}
      width={props.width}
      height={props.height}
      sceneFunc={sceneFunc}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}
