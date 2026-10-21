'use client';

import type Konva from 'konva';
import { useMemo } from 'react';
import { Shape } from 'react-konva';
import type { RichParagraph } from '@prostor/shared';
import { canvasFont } from '@/lib/canvas/fonts';
import { measureText } from '@/lib/canvas/measure-text';
import { layoutRich, type RichLayoutOptions } from '@/lib/rich-text/layout';

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
    [props.paragraphs, props.width, props.height, props.fontSize, family, props.bold, props.italic, props.align, props.verticalAlign, props.ellipsis],
  );

  const sceneFunc = (ctx: Konva.Context) => {
    const size = props.fontSize;
    const thickness = Math.max(1, size / 15);
    ctx.setAttr('fillStyle', props.color);
    ctx.setAttr('textBaseline', 'middle');
    for (const line of lines) {
      if (line.bulletX !== undefined) {
        ctx.setAttr('font', `${size}px ${family}`);
        ctx.fillText('•', line.bulletX + size * 0.15, line.y);
      }
      for (const seg of line.segments) {
        ctx.setAttr('font', seg.font);
        ctx.fillText(seg.text, seg.x, line.y);
        if (seg.underline) ctx.fillRect(seg.x, line.y + size * 0.38, seg.width, thickness);
        if (seg.strike) ctx.fillRect(seg.x, line.y - thickness / 2 + size * 0.04, seg.width, thickness);
      }
    }
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
