'use client';

import type { ReactElement } from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import type { TableElement } from '@prostor/shared';
import type { DetailLevel } from '@/lib/canvas/constants';
import { canvasFont } from '@/lib/canvas/fonts';
import { TABLE_CELL_PADDING, cellText, tableLayout } from '@/lib/canvas/table';

interface TableShapeProps {
  element: TableElement;
  detail: DetailLevel;
  /** Ячейка, открытая в редакторе: её текст рисует поле ввода */
  editingCell?: { row: number; col: number } | null;
}

/**
 * Таблица: фон, заливка строки-заголовка, сетка одной фигурой на все
 * линии (а не Rect на каждую ячейку) и текст ячеек — только при полной
 * детализации, на отдалении остаётся сетка.
 */
export function TableShape({ element: el, detail, editingCell }: TableShapeProps) {
  const { xs, ys } = tableLayout(el);
  const headerHeight = el.headerRow ? (ys[1] ?? 0) : 0;

  // Все линии сетки — сегменты одного Konva.Line нельзя (он соединяет точки), поэтому по линии на границу
  const lines: number[][] = [];
  for (let c = 1; c < el.cols; c++) lines.push([xs[c] ?? 0, 0, xs[c] ?? 0, el.height]);
  for (let r = 1; r < el.rows; r++) lines.push([0, ys[r] ?? 0, el.width, ys[r] ?? 0]);

  const font = canvasFont('Inter');
  const texts: ReactElement[] = [];
  if (detail === 'full') {
    for (let r = 0; r < el.rows; r++) {
      for (let c = 0; c < el.cols; c++) {
        if (editingCell && editingCell.row === r && editingCell.col === c) continue;
        const text = cellText(el, r, c);
        if (!text) continue;
        const x = xs[c] ?? 0;
        const y = ys[r] ?? 0;
        texts.push(
          <Text
            key={`${r}:${c}`}
            x={x}
            y={y}
            width={(xs[c + 1] ?? el.width) - x}
            height={(ys[r + 1] ?? el.height) - y}
            padding={TABLE_CELL_PADDING}
            text={text}
            fontFamily={font}
            fontSize={el.fontSize}
            fontStyle={el.headerRow && r === 0 ? 'bold' : 'normal'}
            fill={el.color}
            verticalAlign="middle"
            wrap="word"
            ellipsis
            listening={false}
            perfectDrawEnabled={false}
          />,
        );
      }
    }
  }

  return (
    <Group x={el.x} y={el.y} rotation={el.rotation} opacity={el.opacity} id={el.id} name="element">
      <Rect
        width={el.width}
        height={el.height}
        fill={el.fill}
        stroke={el.stroke}
        strokeWidth={1}
        strokeScaleEnabled={false}
        perfectDrawEnabled={false}
      />
      {headerHeight > 0 ? (
        <Rect
          width={el.width}
          height={headerHeight}
          fill={el.headerFill}
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : null}
      {lines.map((points, i) => (
        <Line
          key={i}
          points={points}
          stroke={el.stroke}
          strokeWidth={1}
          strokeScaleEnabled={false}
          listening={false}
          perfectDrawEnabled={false}
        />
      ))}
      <Rect
        width={el.width}
        height={el.height}
        stroke={el.stroke}
        strokeWidth={1}
        strokeScaleEnabled={false}
        listening={false}
        perfectDrawEnabled={false}
      />
      {texts}
    </Group>
  );
}
