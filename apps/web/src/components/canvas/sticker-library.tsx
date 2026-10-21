'use client';

import { Loader2, Smile } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import type { UploadedAsset } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { buildImage, nextZIndex } from '@/lib/canvas/element-factory';
import { visibleBounds } from '@/lib/canvas/viewport';
import { apiRequest } from '@/lib/fetcher';
import { useT } from '@/lib/i18n/client';
import { STICKER_CATEGORIES, STICKER_SETS } from '@/lib/stickers';
import { cn, errorMessage } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';

/** Размер стикера на доске по большей стороне */
const STICKER_SIZE = 160;

interface StickerLibraryProps {
  boardId: string;
  doc: Y.Doc | null;
  actions: BoardActions;
  userId: string;
}

/**
 * Библиотека бесплатных стикеров (~18 000 эмодзи из открытых наборов):
 * поиск по-русски и по-английски, категории, выбор набора. Клик — стикер
 * в центр экрана; он сохраняется картинкой доски (экспорт, офлайн, коллеги).
 */
export function StickerLibrary({ boardId, doc, actions, userId }: StickerLibraryProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(STICKER_CATEGORIES[0]!.query);
  const [set, setSet] = useState<string | null>(null);
  const [icons, setIcons] = useState<string[] | null>(null);
  /** SVG превью пачкой (по одному Iconify ограничивает частоту) */
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const search = query.trim() || category;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIcons(null);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: search, limit: '120' });
      if (set) params.set('set', set);
      apiRequest<{ icons: string[] }>(`/api/stickers/search?${params.toString()}`)
        .then(async (r) => {
          if (cancelled) return;
          setIcons(r.icons);
          const batch = await apiRequest<{ svgs: Record<string, string> }>(
            `/api/stickers/batch?ids=${encodeURIComponent(r.icons.join(','))}`,
          );
          if (!cancelled) setSvgs((prev) => ({ ...prev, ...batch.svgs }));
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setIcons([]);
          toast.error(errorMessage(e, t('Библиотека стикеров сейчас недоступна')));
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, search, set, t]);

  const insert = async (id: string) => {
    if (!doc) return;
    setAdding(id);
    try {
      const asset = await apiRequest<UploadedAsset>(`/api/boards/${boardId}/stickers`, {
        method: 'POST',
        body: { id },
      });
      const k = STICKER_SIZE / Math.max(asset.width, asset.height);
      const width = Math.round(asset.width * k);
      const height = Math.round(asset.height * k);
      const { camera, size } = useCanvasStore.getState();
      const v = visibleBounds(camera, size);
      const el = buildImage({
        x: (v.minX + v.maxX) / 2 - width / 2,
        y: (v.minY + v.maxY) / 2 - height / 2,
        width,
        height,
        naturalWidth: asset.width,
        naturalHeight: asset.height,
        assetId: asset.id,
        alt: id.split(':')[1]?.replace(/-/g, ' '),
        userId,
        zIndex: nextZIndex(doc),
      });
      useCanvasStore.getState().select(actions.create([el]));
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось добавить стикер')));
    } finally {
      setAdding(null);
    }
  };

  const visibleSets = set ? STICKER_SETS.filter((s) => s.prefix === set) : STICKER_SETS;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="size-9" aria-label={t('Стикеры')}>
              <Smile />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{t('Библиотека стикеров')}</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="right"
        align="start"
        className="w-[26rem] p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <Input
            value={query}
            placeholder={t('Поиск: кот, сердце, ракета…')}
            aria-label={t('Поиск стикеров')}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <div className="flex flex-wrap gap-1">
            {STICKER_CATEGORIES.map((c) => (
              <Button
                key={c.query}
                size="sm"
                variant={!query.trim() && category === c.query ? 'secondary' : 'ghost'}
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setQuery('');
                  setCategory(c.query);
                }}
              >
                {t(c.label)}
              </Button>
            ))}
          </div>
          <div
            className="flex flex-wrap gap-1 border-t pt-2"
            role="radiogroup"
            aria-label={t('Набор')}
          >
            <Button
              size="sm"
              variant={set === null ? 'secondary' : 'ghost'}
              className="h-6 px-2 text-xs"
              onClick={() => setSet(null)}
            >
              {t('Все наборы')}
            </Button>
            {STICKER_SETS.map((s) => (
              <Button
                key={s.prefix}
                size="sm"
                variant={set === s.prefix ? 'secondary' : 'ghost'}
                className="h-6 px-2 text-xs"
                onClick={() => setSet(s.prefix)}
              >
                {s.name}
              </Button>
            ))}
          </div>
          <div
            className="grid max-h-72 grid-cols-7 gap-1 overflow-y-auto"
            aria-label={t('Стикеры')}
          >
            {icons === null ? (
              <p className="col-span-7 flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {t('Загрузка…')}
              </p>
            ) : icons.length === 0 ? (
              <p className="col-span-7 py-6 text-center text-sm text-muted-foreground">
                {t('Ничего не найдено — попробуйте другое слово или по-английски')}
              </p>
            ) : (
              icons.map((id) => (
                <button
                  key={id}
                  type="button"
                  title={id.split(':')[1]?.replace(/-/g, ' ')}
                  disabled={adding !== null}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-md p-1 hover:bg-muted disabled:opacity-60',
                    adding === id && 'animate-pulse bg-muted',
                  )}
                  onClick={() => void insert(id)}
                >
                  {svgs[id] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data: SVG, оптимизация next/image не нужна
                    <img
                      src={
                        svgs[id]
                          ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgs[id])}`
                          : undefined
                      }
                      alt=""
                      loading="lazy"
                      className="size-10"
                      draggable={false}
                    />
                  ) : (
                    <span className="size-10 animate-pulse rounded bg-muted" />
                  )}
                </button>
              ))
            )}
          </div>
          <p className="border-t pt-1.5 text-[11px] leading-snug text-muted-foreground">
            {t('Бесплатные наборы:')}{' '}
            {visibleSets.map((s, i) => (
              <span key={s.prefix}>
                {i > 0 ? ', ' : ''}
                <a
                  href={s.licenseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {s.name} ({s.license})
                </a>
              </span>
            ))}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
