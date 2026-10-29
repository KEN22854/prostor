'use client';

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  Italic,
  Minus,
  Plus,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { BoardElement } from '@prostor/shared';
import { ColorSwatches } from '@/components/canvas/color-swatches';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/** Цвета текста: тёмный, серый, сиреневый и яркие акценты */
export const TEXT_COLORS = [
  '#1f2937',
  '#6b7280',
  '#8e4ec6',
  '#9b6bdf',
  '#e5484d',
  '#f76b15',
  '#30a46c',
  '#0091ff',
  '#ffffff',
] as const;

const SIZES = [12, 14, 16, 20, 24, 32, 48, 64, 96] as const;

type TextStyled = BoardElement & {
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  align: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  textColor: string;
};

export const isTextStyled = (el: BoardElement): el is TextStyled =>
  'fontSize' in el && 'textColor' in el && 'align' in el;

function Toggle({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('size-8 rounded-lg', active && 'bg-accent text-primary')}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
    >
      <Icon />
    </Button>
  );
}

/**
 * Стиль текста всего объекта: размер, начертание, выравнивание и цвет.
 * Форматирование отдельных слов — в панели над редактором текста.
 */
export function TextStyleControls({
  elements,
  actions,
}: {
  elements: TextStyled[];
  actions: BoardActions;
}) {
  const t = useT();
  const first = elements[0];
  if (!first) return null;
  const ids = elements.map((el) => el.id);
  // У фигур текст всегда по центру — выравнивание только для стикеров и текста
  const alignable = elements.every((el) => el.type !== 'shape');
  const set = (patch: Record<string, unknown>) => actions.setStyle(ids, patch);
  const size = first.fontSize;
  // Текстовый блок растёт по содержимому — высоту меняем пропорционально размеру шрифта
  const setSize = (fontSize: number) =>
    actions.update(
      new Map(
        elements
          .filter((el) => !el.locked)
          .map((el) => [
            el.id,
            el.type === 'text'
              ? { fontSize, height: Math.max(fontSize, (el.height * fontSize) / el.fontSize) }
              : { fontSize },
          ]),
      ),
    );
  const step = (dir: 1 | -1) => {
    const next =
      dir > 0
        ? (SIZES.find((s) => s > size) ?? Math.min(512, size + 16))
        : ([...SIZES].reverse().find((s) => s < size) ?? Math.max(4, size - 2));
    setSize(next);
  };

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 rounded-lg px-2"
              aria-label={t('Стиль текста')}
            >
              <Type />
              <span className="text-xs tabular-nums">{size}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('Стиль текста')}</TooltipContent>
      </Tooltip>
      <PopoverContent
        className="w-64 space-y-3 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('Размер')}</p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-lg"
              aria-label={t('Меньше')}
              onClick={() => step(-1)}
            >
              <Minus />
            </Button>
            <input
              type="number"
              min={4}
              max={512}
              value={size}
              aria-label={t('Размер шрифта')}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 4 && v <= 512) setSize(v);
              }}
              className="h-8 w-16 rounded-lg border bg-background text-center text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-lg"
              aria-label={t('Больше')}
              onClick={() => step(1)}
            >
              <Plus />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-xs tabular-nums transition-colors hover:bg-accent',
                  s === size && 'bg-accent font-medium text-primary',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Toggle
            icon={Bold}
            label={t('Жирный')}
            active={first.fontWeight === 'bold'}
            onClick={() => set({ fontWeight: first.fontWeight === 'bold' ? 'normal' : 'bold' })}
          />
          <Toggle
            icon={Italic}
            label={t('Курсив')}
            active={first.fontStyle === 'italic'}
            onClick={() => set({ fontStyle: first.fontStyle === 'italic' ? 'normal' : 'italic' })}
          />
          {alignable ? (
            <>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
              <Toggle
                icon={AlignLeft}
                label={t('По левому краю')}
                active={first.align === 'left'}
                onClick={() => set({ align: 'left' })}
              />
              <Toggle
                icon={AlignCenter}
                label={t('По центру')}
                active={first.align === 'center'}
                onClick={() => set({ align: 'center' })}
              />
              <Toggle
                icon={AlignRight}
                label={t('По правому краю')}
                active={first.align === 'right'}
                onClick={() => set({ align: 'right' })}
              />
            </>
          ) : null}
        </div>
        {alignable && elements.every((el) => el.type === 'sticky') ? (
          <div className="flex items-center gap-1">
            <Toggle
              icon={AlignVerticalJustifyStart}
              label={t('Сверху')}
              active={first.verticalAlign === 'top'}
              onClick={() => set({ verticalAlign: 'top' })}
            />
            <Toggle
              icon={AlignVerticalJustifyCenter}
              label={t('Посередине')}
              active={first.verticalAlign === 'middle'}
              onClick={() => set({ verticalAlign: 'middle' })}
            />
            <Toggle
              icon={AlignVerticalJustifyEnd}
              label={t('Снизу')}
              active={first.verticalAlign === 'bottom'}
              onClick={() => set({ verticalAlign: 'bottom' })}
            />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('Цвет текста')}</p>
          <ColorSwatches
            colors={TEXT_COLORS}
            value={first.textColor}
            onChange={(textColor) => set({ textColor })}
            label={t('Цвет текста')}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
