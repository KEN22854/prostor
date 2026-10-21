'use client';

import {
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Heading,
  Rows3,
  Columns3,
  type LucideIcon,
} from 'lucide-react';
import type { TableElement } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { BoardActions } from '@/lib/canvas/board-actions';
import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  type TablePatch,
} from '@/lib/canvas/table';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';

function Action({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
  className,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          className={cn('size-8', active && 'bg-accent', className)}
          // Не уводить фокус из редактируемой ячейки до клика
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Строки и столбцы таблицы. Вставка — после ячейки в редакторе (или в конец),
 * удаление — строки/столбца этой ячейки (или последних).
 */
export function TableControls({ table, actions }: { table: TableElement; actions: BoardActions }) {
  const cell = useCanvasStore((s) => (s.editingCell?.id === table.id ? s.editingCell : null));
  const row = cell?.row ?? table.rows - 1;
  const col = cell?.col ?? table.cols - 1;
  const apply = (patch: TablePatch | null) => {
    if (patch) actions.update(new Map([[table.id, patch]]));
  };

  return (
    <>
      <Action
        icon={BetweenHorizontalEnd}
        label="Строка ниже"
        onClick={() => apply(insertRow(table, row + 1))}
      />
      <Action
        icon={BetweenVerticalEnd}
        label="Столбец правее"
        onClick={() => apply(insertColumn(table, col + 1))}
      />
      <Action
        icon={Rows3}
        label="Удалить строку"
        disabled={table.rows <= 1}
        className="text-destructive hover:text-destructive"
        onClick={() => {
          useCanvasStore.getState().setEditingCell(null);
          apply(deleteRow(table, row));
        }}
      />
      <Action
        icon={Columns3}
        label="Удалить столбец"
        disabled={table.cols <= 1}
        className="text-destructive hover:text-destructive"
        onClick={() => {
          useCanvasStore.getState().setEditingCell(null);
          apply(deleteColumn(table, col));
        }}
      />
      <Action
        icon={Heading}
        label="Строка-заголовок"
        active={table.headerRow}
        onClick={() => apply({ headerRow: !table.headerRow })}
      />
    </>
  );
}
