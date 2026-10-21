'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { tableCellKey, type TableElement } from '@prostor/shared';
import type { BoardActions } from '@/lib/canvas/board-actions';
import type { ElementStore } from '@/lib/canvas/element-store';
import { canvasFont } from '@/lib/canvas/fonts';
import { TABLE_CELL_PADDING, cellRect, cellText, insertRow } from '@/lib/canvas/table';
import { worldToScreen } from '@/lib/canvas/viewport';
import { useCanvasStore } from '@/stores/canvas-store';

/**
 * Редактор ячейки таблицы — textarea поверх ячейки, повёрнутая и
 * масштабированная вместе с таблицей. Пишется в Yjs при уходе из ячейки
 * (Tab, Enter, клик мимо), а не на каждую букву — один шаг отмены на правку.
 * Tab / Shift+Tab — соседняя ячейка (Tab в последней добавляет строку),
 * Enter — ячейка ниже, Shift+Enter — перенос строки, Esc — отмена.
 */
export function TableCellEditor({
  store,
  actions,
}: {
  store: ElementStore;
  actions: BoardActions;
}) {
  const cell = useCanvasStore((s) => s.editingCell);
  const camera = useCanvasStore((s) => s.camera);
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  const table = cell ? (store.get(cell.id) as TableElement | undefined) : undefined;
  const valid = Boolean(
    table && table.type === 'table' && cell && cell.row < table.rows && cell.col < table.cols,
  );

  // Таблицу удалили или сжали, пока шла правка — закрываем редактор
  useEffect(() => {
    if (cell && !valid) useCanvasStore.getState().setEditingCell(null);
  }, [cell, valid]);

  if (!cell || !table || !valid) return null;
  return (
    <CellInput
      key={`${cell.id}:${cell.row}:${cell.col}`}
      table={table}
      row={cell.row}
      col={cell.col}
      zoom={camera.zoom}
      origin={worldToScreen(camera, { x: table.x, y: table.y })}
      actions={actions}
    />
  );
}

function CellInput({
  table,
  row,
  col,
  zoom,
  origin,
  actions,
}: {
  table: TableElement;
  row: number;
  col: number;
  zoom: number;
  origin: { x: number; y: number };
  actions: BoardActions;
}) {
  const initial = cellText(table, row, col);
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    const text = value.slice(0, 2000);
    if (text !== initial) {
      actions.update(new Map([[table.id, { [tableCellKey(row, col)]: text || undefined }]]));
    }
  };

  const moveTo = (r: number, c: number) => {
    commit();
    useCanvasStore.getState().setEditingCell({ id: table.id, row: r, col: c });
  };

  const rect = cellRect(table, row, col);

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-20 origin-top-left"
      style={{ transform: `translate(${origin.x}px, ${origin.y}px) rotate(${table.rotation}deg)` }}
    >
      <textarea
        ref={ref}
        aria-label={`Ячейка ${row + 1}, ${col + 1}`}
        className="pointer-events-auto absolute resize-none overflow-hidden border-2 border-primary bg-white outline-none"
        style={{
          left: rect.x * zoom,
          top: rect.y * zoom,
          width: rect.width * zoom,
          height: rect.height * zoom,
          padding: TABLE_CELL_PADDING * zoom,
          fontSize: table.fontSize * zoom,
          lineHeight: 1.2,
          fontFamily: canvasFont('Inter'),
          fontWeight: table.headerRow && row === 0 ? 700 : 400,
          color: table.color,
        }}
        value={value}
        maxLength={2000}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          commit();
          const s = useCanvasStore.getState();
          if (
            s.editingCell?.id === table.id &&
            s.editingCell.row === row &&
            s.editingCell.col === col
          ) {
            s.setEditingCell(null);
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            done.current = true;
            useCanvasStore.getState().setEditingCell(null);
            return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            const index = row * table.cols + col + (e.shiftKey ? -1 : 1);
            if (index < 0) return;
            if (index >= table.rows * table.cols) {
              // Tab в последней ячейке — новая строка, как в таблицах документов
              commit();
              const patch = insertRow(table, table.rows);
              if (patch) actions.update(new Map([[table.id, patch]]));
              useCanvasStore.getState().setEditingCell({ id: table.id, row: table.rows, col: 0 });
              return;
            }
            moveTo(Math.floor(index / table.cols), index % table.cols);
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (row + 1 < table.rows) moveTo(row + 1, col);
            else {
              commit();
              useCanvasStore.getState().setEditingCell(null);
            }
          }
        }}
      />
    </div>
  );
}
