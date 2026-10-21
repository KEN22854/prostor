'use client';

import type * as Y from 'yjs';
import {
  BringToFront,
  Crop,
  Copy,
  Group,
  Lock,
  LockOpen,
  SendToBack,
  Trash2,
  Ungroup,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import type { BoardElement, LineElement, TableElement } from '@prostor/shared';
import { ColorSwatches } from '@/components/canvas/color-swatches';
import { FrameTitleInput } from '@/components/canvas/frame-title-input';
import { FontPicker } from '@/components/canvas/font-picker';
import { LineControls } from '@/components/canvas/line-controls';
import { TableControls } from '@/components/canvas/table-controls';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { BoardActions } from '@/lib/canvas/board-actions';
import type { ElementStore } from '@/lib/canvas/element-store';

import { FILL_COLORS, STICKY_COLORS, STROKE_COLORS, useCanvasStore } from '@/stores/canvas-store';
import { usePlural, useT } from '@/lib/i18n/client';

interface SelectionToolbarProps {
  store: ElementStore;
  actions: BoardActions;
  /** Удаление фона у одиночного изображения (undefined — выключено на сервере) */
  onRemoveBg?: (elementId: string) => void;
  /** Для меню шрифтов: загрузка своего шрифта и шрифты доски */
  boardId: string;
  doc: Y.Doc | null;
}

function IconAction({
  icon: Icon,
  label,
  hotkey,
  onClick,
  destructive,
}: {
  icon: LucideIcon;
  label: string;
  hotkey?: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={destructive ? 'size-8 text-destructive hover:text-destructive' : 'size-8'}
          aria-label={label}
          onClick={onClick}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {hotkey ? <kbd className="ml-1 opacity-70">{hotkey}</kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function ColorButton({
  color,
  label,
  children,
}: {
  color: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={label}>
          <span
            className="size-5 rounded-full border border-black/15"
            style={{ background: color === 'transparent' ? 'transparent' : color }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

const hasFill = (el: BoardElement) =>
  el.type === 'sticky' || el.type === 'shape' || el.type === 'frame' || el.type === 'table';
const hasStroke = (el: BoardElement) =>
  el.type === 'shape' || el.type === 'line' || el.type === 'arrow' || el.type === 'path';

/** Свойства выделения — сверху по центру холста */
export function SelectionToolbar({
  store,
  actions,
  onRemoveBg,
  boardId,
  doc,
}: SelectionToolbarProps) {
  const t = useT();
  const tp = usePlural();
  const selection = useCanvasStore((s) => s.selection);
  const editing = useCanvasStore((s) => s.editingId !== null || s.croppingId !== null);
  const tool = useCanvasStore((s) => s.tool);
  const select = useCanvasStore((s) => s.select);
  // Перерисовка при изменении выделенных элементов (цвет, блокировка, группа)
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);

  if (selection.length === 0 || editing || tool !== 'select') return null;
  const elements = selection
    .map((id) => store.get(id))
    .filter((el): el is BoardElement => el !== undefined);
  if (elements.length === 0) return null;

  const fillable = elements.filter(hasFill);
  const strokable = elements.filter(hasStroke);
  const allSticky = fillable.length > 0 && fillable.every((el) => el.type === 'sticky');
  const firstFill = fillable[0] && 'fill' in fillable[0] ? String(fillable[0].fill) : null;
  const firstStroke = strokable[0] && 'stroke' in strokable[0] ? String(strokable[0].stroke) : null;
  const grouped = elements.some((el) => el.groupId);
  const allLocked = elements.every((el) => el.locked);
  const ids = elements.map((el) => el.id);
  // Объекты с текстом и своим шрифтом (стикеры, текст, фигуры)
  const texty = elements.filter((el) => 'fontFamily' in el && !el.locked);
  const lines = elements.filter(
    (el): el is LineElement => (el.type === 'line' || el.type === 'arrow') && !el.locked,
  );

  return (
    <div
      className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border bg-background/95 p-1 shadow-md backdrop-blur"
      role="toolbar"
      aria-label={t('Свойства выделения')}
      data-testid="selection-toolbar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="px-2 text-xs text-muted-foreground" data-testid="selection-count">
        {elements.length} {tp(elements.length, ['объект', 'объекта', 'объектов'])}
      </span>
      {actions.canEdit ? (
        <>
          {elements.length === 1 && elements[0]?.type === 'frame' && !elements[0].locked ? (
            <FrameTitleInput key={elements[0].id} frame={elements[0]} actions={actions} />
          ) : null}
          {firstFill ? (
            <ColorButton color={firstFill} label={t('Цвет заливки')}>
              <ColorSwatches
                colors={allSticky ? STICKY_COLORS : FILL_COLORS}
                value={firstFill}
                onChange={(fill) => actions.setStyle(ids, { fill })}
                label={t('Цвет заливки')}
              />
            </ColorButton>
          ) : null}
          {firstStroke ? (
            <ColorButton color={firstStroke} label={t('Цвет обводки')}>
              <ColorSwatches
                colors={STROKE_COLORS}
                value={firstStroke}
                onChange={(stroke) => actions.setStyle(ids, { stroke })}
                label={t('Цвет обводки')}
              />
            </ColorButton>
          ) : null}
          {elements.length === 1 && elements[0]?.type === 'table' && !elements[0].locked ? (
            <>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
              <TableControls table={elements[0] as TableElement} actions={actions} />
            </>
          ) : null}
          {texty.length > 0 ? (
            <FontPicker
              ids={texty.map((el) => el.id)}
              value={String((texty[0] as { fontFamily?: string }).fontFamily ?? 'Inter')}
              boardId={boardId}
              doc={doc}
              actions={actions}
            />
          ) : null}
          {lines.length > 0 && lines.length === elements.length ? (
            <>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
              <LineControls lines={lines} actions={actions} />
            </>
          ) : null}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {onRemoveBg &&
          elements.length === 1 &&
          elements[0]?.type === 'image' &&
          !elements[0].locked ? (
            <IconAction
              icon={Wand2}
              label={t('Убрать фон')}
              onClick={() => onRemoveBg(ids[0] ?? '')}
            />
          ) : null}
          {elements.length === 1 && elements[0]?.type === 'image' && !elements[0].locked ? (
            <IconAction
              icon={Crop}
              label={t('Обрезать')}
              hotkey={t('двойной клик')}
              onClick={() => useCanvasStore.getState().setCropping(ids[0] ?? null)}
            />
          ) : null}
          <IconAction
            icon={Copy}
            label={t('Дублировать')}
            hotkey="Ctrl+D"
            onClick={() => {
              const copies = actions.duplicate(ids);
              if (copies.length > 0) select(copies);
              else toast.error(t('Копирование запрещено настройками организации'));
            }}
          />
          {grouped ? (
            <IconAction
              icon={Ungroup}
              label={t('Разгруппировать')}
              hotkey="Ctrl+Shift+G"
              onClick={() => actions.ungroup(ids)}
            />
          ) : elements.length > 1 ? (
            <IconAction
              icon={Group}
              label={t('Сгруппировать')}
              hotkey="Ctrl+G"
              onClick={() => actions.group(ids)}
            />
          ) : null}
          <IconAction
            icon={BringToFront}
            label={t('На передний план')}
            hotkey="Ctrl+]"
            onClick={() => actions.bringToFront(ids)}
          />
          <IconAction
            icon={SendToBack}
            label={t('На задний план')}
            hotkey="Ctrl+["
            onClick={() => actions.sendToBack(ids)}
          />
          <IconAction
            icon={allLocked ? LockOpen : Lock}
            label={allLocked ? t('Разблокировать') : t('Заблокировать')}
            hotkey="Ctrl+Shift+L"
            onClick={() => actions.toggleLock(ids)}
          />
          <IconAction
            icon={Trash2}
            label={t('Удалить')}
            hotkey="Delete"
            destructive
            onClick={() => {
              const { skipped } = actions.delete(ids);
              select([]);
              if (skipped > 0)
                toast.warning(
                  `Пропущено ${skipped}: заблокированы или созданы другими участниками`,
                );
            }}
          />
        </>
      ) : null}
    </div>
  );
}
