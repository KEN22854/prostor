'use client';

import { Loader2, Shapes } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import type { UploadedAsset } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { buildImage, nextZIndex } from '@/lib/canvas/element-factory';
import { shapePathData } from '@/lib/canvas/shape-paths';
import {
  LIBRARY_ICON_SIZE,
  SHAPE_LIBRARY,
  buildLibraryElement,
  type LibraryItem,
} from '@/lib/canvas/shape-library';
import { visibleBounds } from '@/lib/canvas/viewport';
import { apiRequest } from '@/lib/fetcher';
import { useT } from '@/lib/i18n/client';
import { cn, errorMessage } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';

interface ShapeLibraryPanelProps {
  boardId: string;
  doc: Y.Doc | null;
  actions: BoardActions;
  userId: string;
}

/** Превью пункта: фигура своим цветом, таблица — сеткой, иконка — SVG */
function Preview({ item, svg }: { item: LibraryItem; svg?: string }) {
  if (item.kind === 'icon') {
    return svg ? (
      <span
        className="flex size-9 items-center justify-center [&_svg]:size-8"
        // SVG из Iconify (через наш сервер) — без скриптов, как у библиотеки стикеров
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    ) : (
      <span className="skeleton size-8 rounded-lg" />
    );
  }
  if (item.kind === 'table') {
    return (
      <span className="flex w-12 flex-col overflow-hidden rounded border border-slate-300 text-[0]">
        {item.cells.map((row, i) => (
          <span
            key={i}
            className="flex h-2.5 border-b border-slate-300 last:border-b-0"
            style={{ background: i === 0 ? item.headerFill : '#ffffff' }}
          >
            {row.map((_, j) => (
              <span key={j} className="flex-1 border-r border-slate-300 last:border-r-0" />
            ))}
          </span>
        ))}
      </span>
    );
  }
  const ratio = item.width / item.height;
  const w = ratio >= 1 ? 40 : 40 * ratio;
  const h = ratio >= 1 ? 40 / ratio : 40;
  return (
    <svg viewBox={`-2 -2 ${w + 4} ${h + 4}`} className="h-9 w-11" aria-hidden>
      <path
        d={shapePathData(item.shape, w, h)}
        fill={item.fill}
        stroke={item.stroke}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Библиотека фигур: блок-схемы, UML, ER-диаграммы, сеть и облака.
 * Клик — объект в центр экрана; дальше его можно править как обычно.
 */
export function ShapeLibraryPanel({ boardId, doc, actions, userId }: ShapeLibraryPanelProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(SHAPE_LIBRARY[0]!.id);
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const current = SHAPE_LIBRARY.find((c) => c.id === category) ?? SHAPE_LIBRARY[0]!;

  // Превью иконок — одним запросом на категорию
  useEffect(() => {
    if (!open) return;
    const ids = current.items.filter((i) => i.kind === 'icon' && !(i.id in svgs)).map((i) => i.id);
    if (ids.length === 0) return;
    let cancelled = false;
    apiRequest<{ svgs: Record<string, string> }>(
      `/api/stickers/batch?ids=${encodeURIComponent(ids.join(','))}`,
    )
      .then((r) => !cancelled && setSvgs((prev) => ({ ...prev, ...r.svgs })))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, current, svgs]);

  const center = () => {
    const { camera, size } = useCanvasStore.getState();
    const v = visibleBounds(camera, size);
    return { x: (v.minX + v.maxX) / 2, y: (v.minY + v.maxY) / 2 };
  };

  const insert = async (item: LibraryItem) => {
    if (!doc) return;
    if (item.kind !== 'icon') {
      const el = buildLibraryElement(item, center(), userId, nextZIndex(doc));
      useCanvasStore.getState().select(actions.create([el]));
      return;
    }
    setAdding(item.id);
    try {
      const asset = await apiRequest<UploadedAsset>(`/api/boards/${boardId}/stickers`, {
        method: 'POST',
        body: { id: item.id },
      });
      const k = LIBRARY_ICON_SIZE / Math.max(asset.width, asset.height);
      const width = Math.round(asset.width * k);
      const height = Math.round(asset.height * k);
      const c = center();
      const el = buildImage({
        x: c.x - width / 2,
        y: c.y - height / 2,
        width,
        height,
        naturalWidth: asset.width,
        naturalHeight: asset.height,
        assetId: asset.id,
        alt: item.label,
        userId,
        zIndex: nextZIndex(doc),
      });
      useCanvasStore.getState().select(actions.create([el]));
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось добавить иконку')));
    } finally {
      setAdding(null);
    }
  };

  // Иконки, которых нет в наборе, не показываем (после загрузки превью)
  const visible = current.items.filter(
    (i) => i.kind !== 'icon' || !(Object.keys(svgs).length > 0) || i.id in svgs,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-xl transition-transform duration-200 hover:scale-105"
              aria-label={t('Библиотека фигур')}
            >
              <Shapes />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">
          {t('Библиотека фигур: блок-схемы, UML, ER, сеть и облака')}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side="right"
        align="start"
        className="w-[22rem] space-y-3 p-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap gap-1">
          {SHAPE_LIBRARY.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs transition-colors',
                c.id === current.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {t(c.label)}
            </button>
          ))}
        </div>
        <div
          key={current.id}
          className="grid max-h-80 animate-appear grid-cols-4 gap-1.5 overflow-y-auto"
        >
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              title={t(item.label)}
              disabled={adding !== null}
              onClick={() => void insert(item)}
              className="lift flex flex-col items-center gap-1 rounded-xl border bg-background p-2 text-center disabled:opacity-60"
            >
              {adding === item.id ? (
                <Loader2 className="size-9 animate-spin text-primary" />
              ) : (
                <Preview item={item} svg={svgs[item.id]} />
              )}
              <span className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                {t(item.label)}
              </span>
            </button>
          ))}
        </div>
        {current.note ? <p className="text-[10px] text-muted-foreground">{current.note}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
