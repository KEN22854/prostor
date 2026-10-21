'use client';

import { Arrow, Group, Label, Line, Tag, Text } from 'react-konva';
import type { LineElement } from '@prostor/shared';
import { midpointOf } from '@/lib/canvas/connectors';
import { canvasFont } from '@/lib/canvas/fonts';

const LABEL_FONT_SIZE = 14;

/**
 * Линия или стрелка. hitStrokeWidth шире самой линии — тонкую линию
 * иначе почти невозможно выделить мышью (итерация 4b).
 * Кривая — три точки с натяжением (tension), ломаная — точки поворотов.
 * Подпись — плашка в середине линии по длине.
 */
export function LineShape({ element: el }: { element: LineElement }) {
  const curved = el.routing === 'curved';
  const stroke = {
    points: el.points,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth,
    dash: el.dash,
    tension: curved ? 0.5 : 0,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
    hitStrokeWidth: Math.max(12, el.strokeWidth),
    perfectDrawEnabled: false,
    shadowForStrokeEnabled: false,
  };

  const start = el.startArrow === 'arrow';
  const end = el.type === 'arrow' ? el.endArrow !== 'none' : el.endArrow === 'arrow';
  const pointer = Math.max(8, el.strokeWidth * 3);
  const body =
    start || end ? (
      <Arrow
        {...stroke}
        fill={el.stroke}
        pointerAtBeginning={start}
        pointerAtEnding={end}
        pointerLength={pointer}
        pointerWidth={pointer}
      />
    ) : (
      <Line {...stroke} />
    );

  const label = el.label?.trim();
  const mid = label ? midpointOf(el.points) : null;

  return (
    <Group id={el.id} name="element" x={el.x} y={el.y} rotation={el.rotation} opacity={el.opacity}>
      {body}
      {label && mid ? (
        <Label x={mid.x} y={mid.y} listening={false}>
          <Tag
            fill="#ffffff"
            stroke={el.stroke}
            strokeWidth={1}
            cornerRadius={6}
            pointerDirection="none"
            perfectDrawEnabled={false}
          />
          <Text
            text={label}
            fontFamily={canvasFont('Inter')}
            fontSize={LABEL_FONT_SIZE}
            fill="#1f2937"
            padding={6}
            perfectDrawEnabled={false}
            ref={(node) => {
              // Центрируем плашку на точке середины после измерения текста
              const parent = node?.getParent();
              if (node && parent) parent.offset({ x: node.width() / 2, y: node.height() / 2 });
            }}
          />
        </Label>
      ) : null}
    </Group>
  );
}
