'use client';

import { Copy, ExternalLink, Loader2, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FEED_DRAG_TYPE } from '@/hooks/use-feed-insert';
import { visibleBounds, type Point } from '@/lib/canvas/viewport';
import { apiRequest } from '@/lib/fetcher';
import { useT } from '@/lib/i18n/client';
import { FEED_TOPICS, type FeedImage, type FeedPage } from '@/lib/image-feed';
import { cn, errorMessage } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';

/** Скопировать картинку в буфер обмена как PNG (через наш адрес — без CORS) */
async function copyImage(img: FeedImage): Promise<void> {
  const res = await fetch(`/api/images/proxy?url=${encodeURIComponent(img.full)}`);
  if (!res.ok) throw new Error('download');
  const blob = await res.blob();
  let png = blob;
  if (blob.type !== 'image/png') {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/png'),
    );
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

interface ImageFeedPanelProps {
  onClose: () => void;
  onInsert: (img: FeedImage, at: Point) => Promise<void>;
  canEdit: boolean;
}

/**
 * Лента картинок справа (в духе Pinterest): поиск по-русски и по-английски,
 * подборки, бесконечная прокрутка в две колонки. Картинку можно добавить
 * на доску (кнопкой или перетаскиванием), скопировать в буфер или открыть
 * источник. Изображения свободные (Wikimedia Commons, Pexels) — автор и
 * лицензия сохраняются в подписи картинки на доске.
 */
export function ImageFeedPanel({ onClose, onInsert, canEdit }: ImageFeedPanelProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState(FEED_TOPICS[0]!.query);
  const [items, setItems] = useState<FeedImage[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const search = query.trim() || topic;
  const searchRef = useRef(search);

  const load = useCallback(
    async (cursor: string | null) => {
      const q = searchRef.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({ q });
        if (cursor) params.set('cursor', cursor);
        const page = await apiRequest<FeedPage>(`/api/images/search?${params.toString()}`);
        if (searchRef.current !== q) return; // запрос сменился, пока грузили
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          return [...prev, ...page.items.filter((i) => !seen.has(i.id))];
        });
        setNext(page.next);
        setDone(!page.next);
      } catch (error: unknown) {
        toast.error(errorMessage(error, t('Лента картинок сейчас недоступна')));
        setDone(true);
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  // Новый запрос — лента с начала (с задержкой на ввод)
  useEffect(() => {
    searchRef.current = search;
    setItems([]);
    setNext(null);
    setDone(false);
    const timer = setTimeout(() => void load(null), 350);
    return () => clearTimeout(timer);
  }, [search, load]);

  // Бесконечная прокрутка: дошли до низа — следующая страница
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loading && next && !done) void load(next);
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [next, loading, done, load]);

  const centerOfScreen = (): Point => {
    const { camera, size } = useCanvasStore.getState();
    const v = visibleBounds(camera, size);
    return { x: (v.minX + v.maxX) / 2, y: (v.minY + v.maxY) / 2 };
  };

  // Две колонки с балансом по высоте — классическая «плитка» без разрывов
  const columns: FeedImage[][] = [[], []];
  const heights = [0, 0];
  for (const item of items) {
    const col = heights[0]! <= heights[1]! ? 0 : 1;
    columns[col]!.push(item);
    heights[col]! += item.thumbHeight / item.thumbWidth;
  }

  return (
    <aside
      className="absolute bottom-3 right-3 top-14 z-20 flex w-[min(24rem,calc(100%-5rem))] flex-col rounded-xl border bg-background/95 shadow-xl backdrop-blur"
      aria-label={t('Лента картинок')}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      data-testid="image-feed"
    >
      <div className="space-y-2 border-b p-2">
        <div className="flex items-center gap-1">
          <Search className="ml-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            placeholder={t('Найти картинки: горы, кот, интерьер…')}
            aria-label={t('Поиск картинок')}
            className="h-8 border-0 shadow-none focus-visible:ring-0"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t('Закрыть ленту')}
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {FEED_TOPICS.map((tp) => (
            <Button
              key={tp.query}
              size="sm"
              variant={!query.trim() && topic === tp.query ? 'secondary' : 'ghost'}
              className="h-6 px-2 text-xs"
              onClick={() => {
                setQuery('');
                setTopic(tp.query);
              }}
            >
              {t(tp.label)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex gap-2">
          {columns.map((col, ci) => (
            <div key={ci} className="flex min-w-0 flex-1 flex-col gap-2">
              {col.map((img) => (
                <figure
                  key={img.id}
                  className="group relative overflow-hidden rounded-lg bg-muted"
                  draggable={canEdit}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(FEED_DRAG_TYPE, JSON.stringify(img));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- внешние миниатюры, оптимизатор Next не нужен */}
                  <img
                    src={img.thumb}
                    alt={img.title}
                    loading="lazy"
                    className="block w-full"
                    style={{ aspectRatio: `${img.thumbWidth} / ${img.thumbHeight}` }}
                  />
                  <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-[11px] leading-tight text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="line-clamp-2">{img.title}</span>
                    <span className="block truncate opacity-80">
                      {[img.author, img.license].filter(Boolean).join(' · ')}
                    </span>
                  </figcaption>
                  <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    {canEdit ? (
                      <Button
                        size="icon"
                        className="size-7"
                        aria-label={t('На доску')}
                        title={t('На доску')}
                        onClick={() => void onInsert(img, centerOfScreen())}
                      >
                        <Plus />
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="secondary"
                      className="size-7"
                      aria-label={t('Копировать картинку')}
                      title={t('Копировать картинку')}
                      onClick={() =>
                        void copyImage(img)
                          .then(() =>
                            toast.success(
                              t('Картинка скопирована — вставьте её куда угодно (Ctrl+V)'),
                            ),
                          )
                          .catch(() => toast.error(t('Не удалось скопировать картинку')))
                      }
                    >
                      <Copy />
                    </Button>
                    <Button size="icon" variant="secondary" className="size-7" asChild>
                      <a
                        href={img.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('Источник')}
                        title={t('Источник')}
                      >
                        <ExternalLink />
                      </a>
                    </Button>
                  </div>
                </figure>
              ))}
            </div>
          ))}
        </div>
        <div
          ref={sentinel}
          className={cn('flex justify-center py-4', done && items.length > 0 && 'hidden')}
        >
          {loading ? (
            <Loader2
              className="size-5 animate-spin text-muted-foreground"
              aria-label={t('Загрузка…')}
            />
          ) : !loading && items.length === 0 && done ? (
            <p className="text-sm text-muted-foreground">{t('Ничего не найдено')}</p>
          ) : null}
        </div>
      </div>
      <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        {t(
          'Свободные изображения Wikimedia Commons и Pexels. Автор и лицензия сохраняются в подписи картинки.',
        )}
      </p>
    </aside>
  );
}
