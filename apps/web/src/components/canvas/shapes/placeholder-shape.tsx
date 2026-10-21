'use client';

import { Group, Rect, Text } from 'react-konva';
import type { BoardElement } from '@prostor/shared';
import type { DetailLevel } from '@/lib/canvas/constants';

const LABELS: Partial<Record<BoardElement['type'], string>> = {
  image: 'Изображение',
  table: 'Таблица',
  mindmapNode: 'Узел mind map',
  kanban: 'Канбан',
  document: 'Документ',
  pdf: 'PDF',
  icon: 'Иконка',
  flipCard: 'Флип-карточка',
  timer: 'Таймер',
  vote: 'Голосование',
  bpmn: 'BPMN',
};

/**
 * Заглушка для типов, рендер которых появится в следующих итерациях
 * (изображения — после загрузки ассетов в итерации 5, таблицы/канбан/документы — в 7).
 * Элемент виден, занимает своё место и не ломает доску.
 */
export function PlaceholderShape({
  element: el,
  detail,
}: {
  element: BoardElement;
  detail: DetailLevel;
}) {
  return (
    <Group x={el.x} y={el.y} rotation={el.rotation} opacity={el.opacity} id={el.id} name="element">
      <Rect
        width={el.width}
        height={el.height}
        fill="rgba(148,163,184,0.12)"
        stroke="#94a3b8"
        strokeWidth={1}
        dash={[6, 4]}
        strokeScaleEnabled={false}
        cornerRadius={4}
        perfectDrawEnabled={false}
      />
      {detail === 'full' ? (
        <Text
          width={el.width}
          height={el.height}
          text={LABELS[el.type] ?? el.type}
          fontSize={14}
          fill="#64748b"
          align="center"
          verticalAlign="middle"
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : null}
    </Group>
  );
}
