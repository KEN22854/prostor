'use client';

import { Type, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { boardFontsMap, readBoardFonts } from '@/hooks/use-board-fonts';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { canvasFont } from '@/lib/canvas/fonts';
import { BUILTIN_FONTS, FALLBACK_FONTS, type FontCatalogEntry } from '@/lib/fonts/catalog';
import { loadFont, loadFontPreview } from '@/lib/fonts/loader';
import { apiRequest } from '@/lib/fetcher';
import { useLocale, useT } from '@/lib/i18n/client';
import { cn, errorMessage } from '@/lib/utils';

const PAGE = 40;

let catalogCache: Promise<FontCatalogEntry[]> | null = null;
function fetchCatalog(): Promise<FontCatalogEntry[]> {
  catalogCache ??= apiRequest<{ fonts: FontCatalogEntry[] }>('/api/fonts/catalog')
    .then((r) => r.fonts)
    .catch(() => {
      catalogCache = null;
      return FALLBACK_FONTS;
    });
  return catalogCache;
}

const CATEGORY_LABEL: Record<FontCatalogEntry['c'], string> = {
  sans: 'Без засечек',
  serif: 'С засечками',
  display: 'Декоративный',
  hand: 'Рукописный',
  mono: 'Моноширинный',
};

interface FontPickerProps {
  ids: string[];
  value: string;
  boardId: string;
  doc: Y.Doc | null;
  actions: BoardActions;
}

/**
 * Шрифт выделенных объектов: все шрифты Google Fonts (поиск, фильтр по
 * кириллице), шрифты доски и загрузка своего шрифта (TTF/OTF/WOFF/WOFF2).
 */
export function FontPicker({ ids, value, boardId, doc, actions }: FontPickerProps) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cyrOnly, setCyrOnly] = useState(locale === 'ru');
  const [limit, setLimit] = useState(PAGE);
  const [catalog, setCatalog] = useState<FontCatalogEntry[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !catalog) void fetchCatalog().then(setCatalog);
  }, [open, catalog]);
  useEffect(() => setLimit(PAGE), [query, cyrOnly]);

  const boardFonts = open ? readBoardFonts(doc) : new Map<string, string>();
  const q = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      (catalog ?? []).filter((f) => (!cyrOnly || f.cy) && (!q || f.f.toLowerCase().includes(q))),
    [catalog, cyrOnly, q],
  );
  const shown = results.slice(0, limit);

  // Превью названий: подгружаем только видимые строки (по нескольку символов каждая)
  useEffect(() => {
    if (open) for (const f of shown) loadFontPreview(f.f);
  }, [open, shown]);

  const apply = async (family: string, assetId?: string) => {
    setOpen(false);
    await loadFont(family, assetId);
    actions.setStyle(ids, { fontFamily: family });
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set('file', file);
      const res = await fetch(`/api/boards/${boardId}/fonts`, { method: 'POST', body: form });
      const body = (await res.json()) as {
        assetId?: string;
        family?: string;
        error?: { message: string };
      };
      if (!res.ok || !body.assetId || !body.family)
        throw new Error(body.error?.message ?? t('Не удалось загрузить шрифт'));
      if (doc) doc.transact(() => boardFontsMap(doc).set(body.family!, body.assetId!));
      await apply(body.family, body.assetId);
      toast.success(t('Шрифт «{family}» добавлен на доску', { family: body.family }));
    } catch (error: unknown) {
      toast.error(errorMessage(error, t('Не удалось загрузить шрифт')));
    } finally {
      setUploading(false);
    }
  };

  const row = (family: string, note: string | null, assetId?: string) => (
    <li key={`${assetId ? 'board' : 'g'}:${family}`}>
      <button
        type="button"
        className={cn(
          'flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-muted',
          family === value && 'bg-accent',
        )}
        onClick={() => void apply(family, assetId)}
      >
        <span className="truncate text-base" style={{ fontFamily: canvasFont(family) }}>
          {family}
        </span>
        {note ? <span className="shrink-0 text-xs text-muted-foreground">{note}</span> : null}
      </button>
    </li>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 max-w-36 gap-1 px-2"
          aria-label={t('Шрифт')}
        >
          <Type />
          <span className="truncate" style={{ fontFamily: canvasFont(value) }}>
            {value}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="space-y-2">
          <Input
            value={query}
            placeholder={t('Поиск среди {n} шрифтов', { n: catalog?.length ?? '…' })}
            aria-label={t('Поиск шрифта')}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <div className="flex items-center justify-between gap-2 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="size-3.5"
                checked={cyrOnly}
                onChange={(e) => setCyrOnly(e.target.checked)}
              />
              {t('Только с кириллицей')}
            </label>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-3.5" /> {uploading ? t('Загрузка…') : t('Свой шрифт')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void upload(file);
              }}
            />
          </div>
          <ul className="max-h-80 overflow-y-auto" aria-label={t('Шрифты')}>
            {boardFonts.size > 0 && !q ? (
              <>
                <li className="px-2 pt-1 text-xs font-medium text-muted-foreground">
                  {t('Шрифты доски')}
                </li>
                {Array.from(boardFonts, ([family, id]) => row(family, null, id))}
              </>
            ) : null}
            {!q ? (
              <>
                <li className="px-2 pt-2 text-xs font-medium text-muted-foreground">
                  {t('Основные')}
                </li>
                {BUILTIN_FONTS.map((f) => row(f, null))}
                <li className="px-2 pt-2 text-xs font-medium text-muted-foreground">
                  Google Fonts
                </li>
              </>
            ) : null}
            {catalog === null ? (
              <li className="px-2 py-2 text-sm text-muted-foreground">{t('Загрузка…')}</li>
            ) : shown.length === 0 ? (
              <li className="px-2 py-2 text-sm text-muted-foreground">{t('Ничего не найдено')}</li>
            ) : (
              shown.map((f) => row(f.f, t(CATEGORY_LABEL[f.c])))
            )}
            {results.length > limit ? (
              <li>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setLimit((l) => l + PAGE)}
                >
                  {t('Показать ещё')} ({results.length - limit})
                </Button>
              </li>
            ) : null}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
