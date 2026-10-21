'use client';

import { Ellipse, Group, Line, Rect, Star, Text } from 'react-konva';
import { isRichFormatted, type ShapeElement } from '@prostor/shared';
import { RichText } from '@/components/canvas/shapes/rich-text';
import type { DetailLevel } from '@/lib/canvas/constants';
import { canvasFont } from '@/lib/canvas/fonts';

interface BasicShapeProps {
  element: ShapeElement;
  detail: DetailLevel;
  hideText?: boolean;
}

function Outline({ el }: { el: ShapeElement }) {
  const common = {
    fill: el.fill,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth,
    perfectDrawEnabled: false,
    shadowForStrokeEnabled: false,
    // Обводка не утолщается при трансформации группы (resize в итерации 4b)
    strokeScaleEnabled: false,
  };
  const w = el.width;
  const h = el.height;
  switch (el.shape) {
    case 'rect':
      return <Rect width={w} height={h} {...common} />;
    case 'roundRect':
      return <Rect width={w} height={h} cornerRadius={Math.min(w, h) * 0.15} {...common} />;
    case 'ellipse':
      return <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} {...common} />;
    case 'triangle':
      return <Line points={[w / 2, 0, w, h, 0, h]} closed {...common} />;
    case 'diamond':
      return <Line points={[w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]} closed {...common} />;
    case 'star':
      return (
        <Star
          x={w / 2}
          y={h / 2}
          numPoints={5}
          innerRadius={Math.min(w, h) / 4}
          outerRadius={Math.min(w, h) / 2}
          {...common}
        />
      );
  }
}

/** Геометрическая фигура с подписью по центру */
export function BasicShape({ element: el, detail, hideText = false }: BasicShapeProps) {
  return (
    <Group x={el.x} y={el.y} rotation={el.rotation} opacity={el.opacity} id={el.id} name="element">
      <Outline el={el} />
      {detail === 'full' && el.text && !hideText && isRichFormatted(el.rich) && el.rich ? (
        <RichText
          paragraphs={el.rich}
          x={8}
          y={8}
          width={Math.max(0, el.width - 16)}
          height={Math.max(0, el.height - 16)}
          fontSize={el.fontSize}
          fontFamily={el.fontFamily}
          bold={el.fontWeight === 'bold'}
          italic={el.fontStyle === 'italic'}
          color={el.textColor}
          align="center"
          verticalAlign="middle"
        />
      ) : detail === 'full' && el.text && !hideText ? (
        <Text
          width={el.width}
          height={el.height}
          padding={8}
          text={el.text}
          fontFamily={canvasFont(el.fontFamily)}
          fontSize={el.fontSize}
          fill={el.textColor}
          align="center"
          verticalAlign="middle"
          wrap="word"
          ellipsis
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : null}
    </Group>
  );
}
