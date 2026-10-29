'use client';

import {
  ArrowUpRight,
  ChartColumn,
  Images,
  Link2,
  Table2,
  Eraser,
  FileUp,
  Frame,
  Grid3x3,
  Hand,
  Image as ImageIcon,
  Magnet,
  MessageCircle,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Pencil,
  Settings2,
  Sparkles,
  StickyNote,
  Zap,
  Type,
} from 'lucide-react';
import Link from 'next/link';
import { Fragment, type ComponentType, type ReactNode } from 'react';
import { DEFAULT_PINNED_TOOLS, SHAPE_KINDS } from '@prostor/shared';
import { ShapeGlyph, shapeIcon } from '@/components/canvas/shape-glyph';
import { SHAPE_LABELS } from '@/lib/canvas/shape-paths';
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

const SHAPES = SHAPE_KINDS.map((kind) => ({ kind, label: SHAPE_LABELS[kind] }));

const PEN_WIDTHS = [2, 4, 8, 14] as const;

interface PaletteEntry {
  id: string;
  /** Инструмент холста — чтобы подсветить «…», когда выбран спрятанный */
  tool?: CanvasTool;
  node: ReactNode;
}

interface ToolButtonProps {
  tool: CanvasTool;
  icon: ComponentType<{ className?: string }>;
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
          className={cn(
            'relative size-9 rounded-xl transition-all duration-200 hover:scale-105',
            active &&
              'bg-brand-gradient shadow-glow hover:bg-brand-gradient text-white hover:text-white',
          )}
          aria-label={label}
          aria-pressed={active}
          onClick={() => (onSelect ? onSelect() : setTool(tool))}
          onDoubleClick={() => setTool(tool, true)}
          data-tool={tool}
        >
          <Icon key={active ? 'on' : 'off'} className={active ? 'animate-pop' : undefined} />
          {locked ? (
            <span
              className="absolute bottom-1 right-1 size-1.5 animate-pop rounded-full bg-white"
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
  /** Кнопка аудио (загрузка и запись) */
  audio?: ReactNode;
  /** Диаграмма из данных */
  onAddChart?: () => void;
  /** Библиотека фигур (блок-схемы, UML, ER, сеть) */
  shapeLibrary?: ReactNode;
  /** Закреплённые инструменты из профиля; без них — набор по умолчанию */
  pinned?: readonly string[];
  /** Показать ссылку «Настроить панель» (только вошедшим) */
  canCustomize?: boolean;
}

export function ToolPalette({
  onPickImage,
  onGenerateImage,
  onImportPdf,
  onAddLink,
  stickers,
  onOpenFeed,
  audio,
  shapeLibrary,
  onAddChart,
  pinned: pinnedIds = DEFAULT_PINNED_TOOLS,
  canCustomize = false,
}: ToolPaletteProps) {
  const t = useT();
  const options = useCanvasStore((s) => s.toolOptions);
  const setOptions = useCanvasStore((s) => s.setToolOptions);
  const setTool = useCanvasStore((s) => s.setTool);
  const snapToGrid = useCanvasStore((s) => s.snapToGrid);
  const snapToObjects = useCanvasStore((s) => s.snapToObjects);
  const setSnap = useCanvasStore((s) => s.setSnap);
  const currentTool = useCanvasStore((s) => s.tool);
  const ShapeIcon = shapeIcon(options.shapeKind);

  const iconButton = (label: string, icon: ReactNode, onClick: () => void, tip?: ReactNode) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-xl transition-transform duration-200 hover:scale-105"
          aria-label={label}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{tip ?? label}</TooltipContent>
    </Tooltip>
  );

  // Все инструменты по порядку; закреплённые видны всегда, остальные — под «…»
  const entries: PaletteEntry[] = [
    {
      id: 'select',
      tool: 'select',
      node: <ToolButton tool="select" icon={MousePointer2} label={t('Выделение')} hotkey="V" />,
    },
    {
      id: 'hand',
      tool: 'hand',
      node: <ToolButton tool="hand" icon={Hand} label={t('Рука')} hotkey="H" />,
    },
    {
      id: 'sticky',
      tool: 'sticky',
      node: (
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
      ),
    },
    {
      id: 'shape',
      tool: 'shape',
      node: (
        <ToolWithOptions tool="shape" icon={ShapeIcon} label={t('Фигура')} hotkey="R / O">
          <Section title={t('Фигура')}>
            <div className="grid grid-cols-8 gap-1">
              {SHAPES.map(({ kind, label }) => (
                <Button
                  key={kind}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'size-8 rounded-lg',
                    options.shapeKind === kind && 'bg-accent text-primary',
                  )}
                  aria-label={t(label)}
                  title={t(label)}
                  onClick={() => {
                    setOptions({ shapeKind: kind });
                    setTool('shape');
                  }}
                >
                  <ShapeGlyph kind={kind} />
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
      ),
    },
    ...(shapeLibrary ? [{ id: 'shapes', node: shapeLibrary }] : []),
    {
      id: 'arrow',
      tool: 'arrow',
      node: (
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
      ),
    },
    {
      id: 'line',
      tool: 'line',
      node: <ToolButton tool="line" icon={Minus} label={t('Линия')} hotkey="L" />,
    },
    {
      id: 'text',
      tool: 'text',
      node: <ToolButton tool="text" icon={Type} label={t('Текст')} hotkey="T" />,
    },
    ...(onAddChart
      ? [
          {
            id: 'chart',
            node: iconButton(
              t('Диаграмма'),
              <ChartColumn />,
              onAddChart,
              t('Диаграмма из данных: вставьте таблицу или CSV'),
            ),
          },
        ]
      : []),
    {
      id: 'table',
      tool: 'table',
      node: <ToolButton tool="table" icon={Table2} label={t('Таблица')} hotkey="B" />,
    },
    {
      id: 'pen',
      tool: 'pen',
      node: (
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
      ),
    },
    {
      id: 'frame',
      tool: 'frame',
      node: <ToolButton tool="frame" icon={Frame} label={t('Фрейм')} hotkey="F" />,
    },
    {
      id: 'comment',
      tool: 'comment',
      node: <ToolButton tool="comment" icon={MessageCircle} label={t('Комментарий')} hotkey="C" />,
    },
    {
      id: 'laser',
      tool: 'laser',
      node: <ToolButton tool="laser" icon={Zap} label={t('Лазерная указка')} hotkey="K" />,
    },
    {
      id: 'eraser',
      tool: 'eraser',
      node: (
        <ToolButton tool="eraser" icon={Eraser} label={t('Ластик (стирает росчерки)')} hotkey="E" />
      ),
    },
    {
      id: 'image',
      node: (
        <ToolButton
          tool="image"
          icon={ImageIcon}
          label={t('Изображение')}
          hotkey="I"
          onSelect={onPickImage}
        />
      ),
    },
    {
      id: 'pdf',
      node: iconButton(
        t('Импорт PDF'),
        <FileUp />,
        onImportPdf,
        t('Импорт PDF: страницы — фреймами (или перетащите файл на доску)'),
      ),
    },
    ...(stickers ? [{ id: 'stickers', node: stickers }] : []),
    ...(audio ? [{ id: 'audio', node: audio }] : []),
    ...(onOpenFeed
      ? [
          {
            id: 'feed',
            node: iconButton(
              t('Лента картинок'),
              <Images />,
              onOpenFeed,
              t('Лента картинок: поиск и вдохновение'),
            ),
          },
        ]
      : []),
    ...(onAddLink
      ? [
          {
            id: 'link',
            node: iconButton(
              t('Ссылка или видео'),
              <Link2 />,
              onAddLink,
              t('Ссылка, YouTube, Figma, Google Docs (или просто вставьте ссылку Ctrl+V)'),
            ),
          },
        ]
      : []),
    ...(onGenerateImage
      ? [
          {
            id: 'ai-image',
            node: iconButton(
              t('Сгенерировать изображение'),
              <Sparkles className="text-primary" />,
              onGenerateImage,
              t('Сгенерировать изображение (ИИ)'),
            ),
          },
        ]
      : []),
  ];

  const pinned = entries.filter((e) => pinnedIds.includes(e.id));
  const more = entries.filter((e) => !pinnedIds.includes(e.id));
  // Выбран инструмент из «…» — подсвечиваем саму кнопку «…»
  const moreActive = more.some((e) => e.tool !== undefined && e.tool === currentTool);

  return (
    <div
      className="floating-panel absolute left-3 top-1/2 z-10 flex max-h-[calc(100%-1.5rem)] -translate-y-1/2 animate-appear flex-col gap-0.5 overflow-y-auto p-1 [scrollbar-width:none]"
      role="toolbar"
      aria-label={t('Инструменты')}
      aria-orientation="vertical"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {pinned.map((e, i) => (
        <Fragment key={e.id}>
          {i === 2 ? <span className="mx-1.5 my-0.5 h-px bg-border" aria-hidden /> : null}
          {e.node}
        </Fragment>
      ))}

      <span className="mx-1.5 my-0.5 h-px bg-border" aria-hidden />
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'size-9 rounded-xl transition-all duration-200 hover:scale-105 data-[state=open]:bg-accent data-[state=open]:text-primary',
                  moreActive && 'bg-brand-gradient shadow-glow text-white hover:text-white',
                )}
                aria-label={t('Ещё инструменты')}
              >
                <MoreHorizontal />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{t('Ещё инструменты')}</TooltipContent>
        </Tooltip>
        <PopoverContent
          side="right"
          align="end"
          className="w-auto space-y-3 p-3"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Section title={t('Ещё инструменты')}>
            <div className="grid grid-cols-4 gap-1">
              {more.map((e) => (
                <Fragment key={e.id}>{e.node}</Fragment>
              ))}
            </div>
          </Section>
          <Section title={t('Привязка')}>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-8 rounded-lg', snapToObjects && 'bg-accent text-primary')}
                aria-pressed={snapToObjects}
                onClick={() => setSnap({ snapToObjects: !snapToObjects })}
                title={t('Привязка к объектам (Alt — временно выключить)')}
              >
                <Magnet /> {t('К объектам')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-8 rounded-lg', snapToGrid && 'bg-accent text-primary')}
                aria-pressed={snapToGrid}
                onClick={() => setSnap({ snapToGrid: !snapToGrid })}
                title={t('Привязка к сетке')}
              >
                <Grid3x3 /> {t('К сетке')}
              </Button>
            </div>
          </Section>
          {canCustomize ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
            >
              <Link href="/settings#toolbar" target="_blank">
                <Settings2 /> {t('Настроить панель…')}
              </Link>
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
