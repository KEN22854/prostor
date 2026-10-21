'use client';

import { Arrow, Line } from 'react-konva';
import type { LineElement } from '@prostor/shared';

/**
 * Линия или стрелка. hitStrokeWidth шире самой линии — тонкую линию
 * иначе почти невозможно выделить мышью (итерация 4b).
 */
export function LineShape({ element: el }: { element: LineElement }) {
  const common = {
    x: el.x,
    y: el.y,
    points: el.points,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth,
    dash: el.dash,
    rotation: el.rotation,
    opacity: el.opacity,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
    hitStrokeWidth: Math.max(12, el.strokeWidth),
    id: el.id,
    name: 'element',
    perfectDrawEnabled: false,
    shadowForStrokeEnabled: false,
  };

  const start = el.startArrow === 'arrow';
  const end = el.type === 'arrow' ? el.endArrow !== 'none' : el.endArrow === 'arrow';
  if (start || end) {
    return (
      <Arrow
        {...common}
        fill={el.stroke}
        pointerAtBeginning={start}
        pointerAtEnding={end}
        pointerLength={Math.max(8, el.strokeWidth * 3)}
        pointerWidth={Math.max(8, el.strokeWidth * 3)}
      />
    );
  }
  return <Line {...common} />;
}
