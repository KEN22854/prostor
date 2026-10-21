'use client';

import { Line } from 'react-konva';
import type { PathElement } from '@prostor/shared';

const TOOL_STYLE: Record<
  PathElement['tool'],
  { opacity: number; composite: GlobalCompositeOperation }
> = {
  pen: { opacity: 1, composite: 'source-over' },
  marker: { opacity: 0.85, composite: 'source-over' },
  // Маркер-выделитель: полупрозрачный и «умножающий», текст под ним остаётся читаемым
  highlighter: { opacity: 0.35, composite: 'multiply' },
};

/** Росчерк карандаша: точки уже упрощены при рисовании (RDP), tension сглаживает углы */
export function PathShape({ element: el }: { element: PathElement }) {
  const style = TOOL_STYLE[el.tool];
  return (
    <Line
      x={el.x}
      y={el.y}
      points={el.points}
      rotation={el.rotation}
      stroke={el.stroke}
      strokeWidth={el.strokeWidth}
      opacity={style.opacity * el.opacity}
      globalCompositeOperation={style.composite}
      tension={0.4}
      lineCap="round"
      lineJoin="round"
      hitStrokeWidth={Math.max(12, el.strokeWidth)}
      id={el.id}
      name="element"
      perfectDrawEnabled={false}
      shadowForStrokeEnabled={false}
    />
  );
}
