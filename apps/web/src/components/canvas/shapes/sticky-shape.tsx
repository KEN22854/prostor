'use client';

import { Group, Rect, Text } from 'react-konva';
import { isRichFormatted, type StickyElement } from '@prostor/shared';
import { RichText } from '@/components/canvas/shapes/rich-text';
import type { DetailLevel } from '@/lib/canvas/constants';
import { canvasFont } from '@/lib/canvas/fonts';

const PADDING = 14;

interface StickyShapeProps {
  element: StickyElement;
  detail: DetailLevel;
  /** Текст редактируется в HTML-редакторе поверх холста — свой не рисуем */
  hideText?: boolean;
}

/**
 * Стикер. Без теней: shadowBlur на сотнях нод — главный убийца FPS в Canvas2D.
 * Глубину даёт полупрозрачная обводка и «загнутый» нижний край.
 */
export function StickyShape({ element: el, detail, hideText = false }: StickyShapeProps) {
  const showText = detail === 'full' && el.text.length > 0 && !hideText;
  return (
    <Group x={el.x} y={el.y} rotation={el.rotation} opacity={el.opacity} id={el.id} name="element">
      <Rect
        width={el.width}
        height={el.height}
        fill={el.fill}
        cornerRadius={3}
        stroke="rgba(0,0,0,0.08)"
        strokeWidth={1}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
      />
      <Rect
        y={el.height - 6}
        width={el.width}
        height={6}
        fill="rgba(0,0,0,0.06)"
        cornerRadius={[0, 0, 3, 3]}
        listening={false}
        perfectDrawEnabled={false}
      />
      {showText && isRichFormatted(el.rich) && el.rich ? (
        <RichText
          paragraphs={el.rich}
          x={PADDING}
          y={PADDING}
          width={Math.max(0, el.width - PADDING * 2)}
          height={Math.max(0, el.height - PADDING * 2 - (el.authorName ? 16 : 0))}
          fontSize={el.fontSize}
          fontFamily={el.fontFamily}
          bold={el.fontWeight === 'bold'}
          italic={el.fontStyle === 'italic'}
          color={el.textColor}
          align={el.align}
          verticalAlign={el.verticalAlign}
        />
      ) : showText ? (
        <Text
          x={PADDING}
          y={PADDING}
          width={Math.max(0, el.width - PADDING * 2)}
          height={Math.max(0, el.height - PADDING * 2 - (el.authorName ? 16 : 0))}
          text={el.text}
          fontFamily={canvasFont(el.fontFamily)}
          fontSize={el.fontSize}
          fontStyle={`${el.fontStyle === 'italic' ? 'italic ' : ''}${el.fontWeight === 'bold' ? 'bold' : 'normal'}`}
          fill={el.textColor}
          align={el.align}
          verticalAlign={el.verticalAlign}
          wrap="word"
          ellipsis
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : null}
      {showText && el.authorName ? (
        <Text
          x={PADDING}
          y={el.height - PADDING - 12}
          width={Math.max(0, el.width - PADDING * 2)}
          text={el.authorName}
          fontFamily={canvasFont(el.fontFamily)}
          fontSize={11}
          fill="rgba(0,0,0,0.45)"
          ellipsis
          wrap="none"
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : null}
    </Group>
  );
}
