'use client';

import {
  ArrowUpRight,
  Images,
  Link2,
  Table2,
  Circle,
  Diamond,
  Eraser,
  FileUp,
  Frame,
  Grid3x3,
  Hand,
  Image as ImageIcon,
  Magnet,
  MessageCircle,
  Minus,
  MousePointer2,
  Pencil,
  Sparkles,
  Square,
  Star,
  StickyNote,
  Zap,
  Triangle,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ShapeElement } from '@prostor/shared';
import { ColorSwatches } from '@/components/canvas/color-swatches';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  FILL_COLORS,
  STICKY_COLORS,
  STROKE_COLORS,
  useCanvasStore,
  type CanvasTool,
} from '@/stores/canvas-store';
import { useT } from '@/lib/i18n/client';

const SHAPES: Array<{ kind: ShapeElement['shape']; icon: LucideIcon; label: string }> = [
  { kind: 'rect', icon: Square, label: 'Прямоугольник' },
  { kind: 'roundRect', icon: Square, label: 'Скруглённый' },
  { kind: 'ellipse', icon: Circle, label: 'Эллипс' },
  { kind: 'triangle', icon: Triangle, label: 'Треугольник' },
  { kind: 'diamond', icon: Diamond, label: 'Ромб' },
  { kind: 'star', icon: Star, label: 'Звезда' },
];

const PEN_WIDTHS = [2, 4, 8, 14] as const;

interface ToolButtonProps {
  tool: CanvasTool;
  icon: LucideIcon;
  label: string;
  hotkey: string;
  onSelect?: () => void;
}

/**
 * Кнопка инструмента. Двойной клик «закрепляет» инструмент:
 * после создания объекта он не сбрасывается на «выделение».
 */
function ToolButton({ tool, icon: Icon, label, hotkey, onSelect }: ToolButtonProps) {
  const active = useCanvasStore((s) => s.tool === tool);
  const locked = useCanvasStore((s) => s.tool === tool && s.toolLocked);
  const setTool = useCanvasStore((s) => s.setTool);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative size-9', active && 'bg-accent text-accent-foreground')}
          aria-label={label}
          aria-pressed={active}
          onClick={() => (onSelect ? onSelect() : setTool(tool))}
          onDoubleClick={() => setTool(tool, true)}
          data-tool={tool}
        >
          <Icon />
          {locked ? (
            <span
              className="absolute bottom-1 right-1 size-1.5 rounded-full bg-primary"
              aria-hidden
            />
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {label} <kbd className="ml-1 opacity-70">{hotkey}</kbd>
      </TooltipContent>
    </Tooltip>
  );
}

/** Инструмент с выпадающими настройками: клик — выбрать, повторный клик — настройки */
function ToolWithOptions({ children, ...props }: ToolButtonProps & { children: ReactNode }) {
  const active = useCanvasStore((s) => s.tool === props.tool);
  const setTool = useCanvasStore((s) => s.setTool);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div>
          <ToolButton {...props} onSelect={() => !active && setTool(props.tool)} />
        </div>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-56 space-y-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

/** Панель инструментов слева (только для редакторов) */
interface ToolPaletteProps {
  onPickImage: () => void;
  /** Генерация изображения по описанию — если включена на сервере */
  onGenerateImage?: () => void;
  onImportPdf: () => void;
  /** Ссылка, видео, Figma — карточка с превью */
  onAddLink?: () => void;
  /** Кнопка библиотеки стикеров (со своим всплывающим окном) */
  stickers?: ReactNode;
  /** Лента картинок (в духе Pinterest) */
  onOpenFeed?: () => void;
}

export function ToolPalette({
  onPickImage,
  onGenerateImage,
  onImportPdf,
  onAddLink,
  stickers,
  onOpenFeed,
}: ToolPaletteProps) {
  const t = useT();
  const options = useCanvasStore((s) => s.toolOptions);
  const setOptions = useCanvasStore((s) => s.setToolOptions);
  const setTool = useCanvasStore((s) => s.setTool);
  const snapToGrid = useCanvasStore((s) => s.snapToGrid);
  const snapToObjects = useCanvasStore((s) => s.snapToObjects);
  const setSnap = useCanvasStore((s) => s.setSnap);
  const ShapeIcon = SHAPES.find((s) => s.kind === options.shapeKind)?.icon ?? Square;

  return (
    <div
      className="absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-0.5 rounded-xl border bg-background/95 p-1 shadow-md backdrop-blur"
      role="toolbar"
      aria-label={t('Инструменты')}
      aria-orientation="vertical"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ToolButton tool="select" icon={MousePointer2} label={t('Выделение')} hotkey="V" />
      <ToolButton tool="hand" icon={Hand} label={t('Рука')} hotkey="H" />
      <span className="mx-1.5 my-0.5 h-px bg-border" aria-hidden />

      <ToolWithOptions tool="sticky" icon={StickyNote} label={t('Стикер')} hotkey="N">
        <Section title={t('Цвет стикера')}>
          <ColorSwatches
            colors={STICKY_COLORS}
            value={options.stickyColor}
            onChange={(c) => setOptions({ stickyColor: c })}
            label={t('Цвет стикера')}
          />
        </Section>
      </ToolWithOptions>

      <ToolWithOptions tool="shape" icon={ShapeIcon} label={t('Фигура')} hotkey="R / O">
        <Section title={t('Фигура')}>
          <div className="grid grid-cols-6 gap-1">
            {SHAPES.map(({ kind, icon: Icon, label }) => (
              <Button
                key={kind}
                variant="ghost"
                size="icon"
                className={cn('size-8', options.shapeKind === kind && 'bg-accent')}
                aria-label={label}
                onClick={() => {
                  setOptions({ shapeKind: kind });
                  setTool('shape');
                }}
              >
                <Icon className={kind === 'roundRect' ? 'rounded' : undefined} />
              </Button>
            ))}
          </div>
        </Section>
        <Section title={t('Заливка')}>
          <ColorSwatches
            colors={FILL_COLORS}
            value={options.shapeFill}
            onChange={(c) => setOptions({ shapeFill: c })}
            label={t('Заливка')}
          />
        </Section>
        <Section title={t('Обводка')}>
          <ColorSwatches
            colors={STROKE_COLORS}
            value={options.strokeColor}
            onChange={(c) => setOptions({ strokeColor: c })}
            label={t('Обводка')}
          />
        </Section>
      </ToolWithOptions>

      <ToolButton tool="line" icon={Minus} label={t('Линия')} hotkey="L" />
      <ToolWithOptions tool="arrow" icon={ArrowUpRight} label={t('Стрелка')} hotkey="A">
        <Section title={t('Маршрут (линии и стрелки)')}>
          <div className="flex gap-1">
            {(
              [
                ['straight', 'Прямая'],
                ['elbow', 'Ломаная'],
                ['curved', 'Кривая'],
              ] as const
            ).map(([routing, label]) => (
              <Button
                key={routing}
                size="sm"
                variant={options.lineRouting === routing ? 'secondary' : 'ghost'}
                className="h-7 px-2 text-xs"
                onClick={() => setOptions({ lineRouting: routing })}
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="mt-1.5 max-w-52 text-xs text-muted-foreground">
            {t(
              'Начните или закончите стрелку на объекте — она привяжется и будет следовать за ним',
            )}
          </p>
        </Section>
        <Section title={t('Цвет')}>
          <ColorSwatches
            colors={STROKE_COLORS}
            value={options.strokeColor}
            onChange={(c) => setOptions({ strokeColor: c })}
            label={t('Цвет стрелки')}
          />
        </Section>
      </ToolWithOptions>
      <ToolButton tool="text" icon={Type} label={t('Текст')} hotkey="T" />
      <ToolButton tool="table" icon={Table2} label={t('Таблица')} hotkey="B" />

      <ToolWithOptions tool="pen" icon={Pencil} label={t('Карандаш')} hotkey="P">
        <Section title={t('Режим')}>
          <div className="flex gap-1">
            {(
              [
                ['pen', 'Ручка'],
                ['marker', 'Маркер'],
                ['highlighter', 'Выделитель'],
              ] as const
            ).map(([mode, label]) => (
              <Button
                key={mode}
                size="sm"
                variant={options.penMode === mode ? 'secondary' : 'ghost'}
                className="h-7 px-2 text-xs"
                onClick={() => setOptions({ penMode: mode })}
              >
                {label}
              </Button>
            ))}
          </div>
        </Section>
        <Section title={t('Цвет')}>
          <ColorSwatches
            colors={STROKE_COLORS}
            value={options.penColor}
            onChange={(c) => setOptions({ penColor: c })}
            label={t('Цвет карандаша')}
          />
        </Section>
        <Section title={t('Толщина')}>
          <div className="flex items-center gap-1">
            {PEN_WIDTHS.map((w) => (
              <Button
                key={w}
                variant="ghost"
                size="icon"
                className={cn('size-8', options.penWidth === w && 'bg-accent')}
                aria-label={`Толщина ${w}`}
                onClick={() => setOptions({ penWidth: w })}
              >
                <span
                  className="rounded-full bg-foreground"
                  style={{ width: w + 2, height: w + 2 }}
                />
              </Button>
            ))}
          </div>
        </Section>
      </ToolWithOptions>

      <ToolButton tool="frame" icon={Frame} label={t('Фрейм')} hotkey="F" />
      <ToolButton tool="comment" icon={MessageCircle} label={t('Комментарий')} hotkey="C" />
      <ToolButton tool="laser" icon={Zap} label={t('Лазерная указка')} hotkey="K" />
      <ToolButton tool="eraser" icon={Eraser} label={t('Ластик (стирает росчерки)')} hotkey="E" />
      <ToolButton
        tool="image"
        icon={ImageIcon}
        label={t('Изображение')}
        hotkey="I"
        onSelect={onPickImage}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={t('Импорт PDF')}
            onClick={onImportPdf}
          >
            <FileUp />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          Импорт PDF: страницы — фреймами (или перетащите файл на доску)
        </TooltipContent>
      </Tooltip>
      {stickers}
      {onOpenFeed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label={t('Лента картинок')}
              onClick={onOpenFeed}
            >
              <Images />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{t('Лента картинок: поиск и вдохновение')}</TooltipContent>
        </Tooltip>
      ) : null}
      {onAddLink ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label={t('Ссылка или видео')}
              onClick={onAddLink}
            >
              <Link2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Ссылка, YouTube, Figma, Google Docs (или просто вставьте ссылку Ctrl+V)
          </TooltipContent>
        </Tooltip>
      ) : null}
      {onGenerateImage ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 text-primary"
              aria-label={t('Сгенерировать изображение')}
              onClick={onGenerateImage}
            >
              <Sparkles />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{t('Сгенерировать изображение (ИИ)')}</TooltipContent>
        </Tooltip>
      ) : null}

      <span className="mx-1.5 my-0.5 h-px bg-border" aria-hidden />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-9', snapToObjects && 'text-primary')}
            aria-label={t('Привязка к объектам')}
            aria-pressed={snapToObjects}
            onClick={() => setSnap({ snapToObjects: !snapToObjects })}
          >
            <Magnet />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {t('Привязка к объектам (Alt — временно выключить)')}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-9', snapToGrid && 'text-primary')}
            aria-label={t('Привязка к сетке')}
            aria-pressed={snapToGrid}
            onClick={() => setSnap({ snapToGrid: !snapToGrid })}
          >
            <Grid3x3 />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{t('Привязка к сетке')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
