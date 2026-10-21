'use client';

import { Group, Rect, Text } from 'react-konva';
import type { FrameElement } from '@prostor/shared';

/**
 * Фрейм: фон + заголовок над рамкой. Заголовок рисуется всегда
 * (даже при низкой детализации) — это главный ориентир на отдалённой доске.
 */
export function FrameShape({ element: el }: { element: FrameElement }) {
  return (
    <Group
      x={el.x}
      y={el.y}
      rotation={el.rotation}
      opacity={el.opacity}
      id={el.id}
      name="element frame"
    >
      <Text
        y={-26}
        width={el.width}
        text={el.title}
        fontSize={16}
        fontStyle="bold"
        fill="#64748b"
        wrap="none"
        ellipsis
        listening={false}
        perfectDrawEnabled={false}
      />
      <Rect
        width={el.width}
        height={el.height}
        fill={el.fill}
        stroke="rgba(100,116,139,0.35)"
        strokeWidth={1}
        strokeScaleEnabled={false}
        cornerRadius={6}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
      />
    </Group>
  );
}
