'use client';

import { Group, Rect, Text } from 'react-konva';
import { isRichFormatted, type TextElement } from '@prostor/shared';
import { RichText } from '@/components/canvas/shapes/rich-text';
import type { DetailLevel } from '@/lib/canvas/constants';
import { canvasFont } from '@/lib/canvas/fonts';

interface TextShapeProps {
  element: TextElement;
  detail: DetailLevel;
  hideText?: boolean;
}

/** Текстовый блок. При малом масштабе — серые «строки» вместо текста */
export function TextShape({ element: el, detail, hideText = false }: TextShapeProps) {
  if (detail !== 'full' || hideText) {
    return (
      <Rect
        x={el.x}
        y={el.y}
        width={el.width}
        height={Math.min(el.height, el.fontSize * 1.2)}
        rotation={el.rotation}
        fill={el.textColor}
        opacity={hideText ? 0 : 0.25 * el.opacity}
        id={el.id}
        name="element"
        perfectDrawEnabled={false}
      />
    );
  }
  if (isRichFormatted(el.rich) && el.rich) {
    return (
      <Group
        x={el.x}
        y={el.y}
        rotation={el.rotation}
        opacity={el.opacity}
        id={el.id}
        name="element"
      >
        <RichText
          paragraphs={el.rich}
          x={0}
          y={0}
          width={el.width}
          height={el.height}
          fontSize={el.fontSize}
          fontFamily={el.fontFamily}
          bold={el.fontWeight === 'bold'}
          italic={el.fontStyle === 'italic'}
          color={el.textColor}
          align={el.align}
          verticalAlign={el.verticalAlign}
          ellipsis={false}
        />
      </Group>
    );
  }
  return (
    <Text
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rotation={el.rotation}
      opacity={el.opacity}
      text={el.text}
      fontFamily={canvasFont(el.fontFamily)}
      fontSize={el.fontSize}
      fontStyle={`${el.fontStyle === 'italic' ? 'italic ' : ''}${el.fontWeight === 'bold' ? 'bold' : 'normal'}`}
      fill={el.textColor}
      align={el.align}
      verticalAlign={el.verticalAlign}
      wrap="word"
      id={el.id}
      name="element"
      perfectDrawEnabled={false}
    />
  );
}
