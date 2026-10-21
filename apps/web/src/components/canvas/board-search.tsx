'use client';

import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ElementStore } from '@/lib/canvas/element-store';
import { isModKey, isTypingTarget } from '@/lib/canvas/keyboard';
import { searchBoard, type SearchHit } from '@/lib/canvas/search';
import { fitBounds } from '@/lib/canvas/viewport';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';
import { useCommentsStore } from '@/stores/comments-store';

const noop = () => () => undefined;
const zero = () => 0;

/** Показать совпадение: камера к объекту (или точке комментария), выделение, открыть тред */
function reveal(store: ElementStore, hit: SearchHit): void {
  const { size, setCamera, select } = useCanvasStore.getState();
  const bounds = hit.elementId ? store.boundsOf(hit.elementId) : null;
  if (bounds) {
    setCamera(fitBounds(bounds, size, 160, 1.5));
  } else if (hit.point) {
    const zoom = 1;
    setCamera({ x: hit.point.x - size.width / 2 / zoom, y: hit.point.y - size.height / 2 / zoom, zoom });
  }
  if (hit.kind === 'comment') {
    select(hit.elementId ? [hit.elementId] : []);
    useCommentsStore.getState().openThread(hit.id);
  } else {
    select([hit.id]);
  }
}

/**
 * Поиск по доске (Ctrl+F): тексты объектов и комментарии. Enter / Shift+Enter —
 * следующее / предыдущее совпадение, Esc — закрыть. Камера переезжает к
 * совпадению, объект выделяется.
 */
export function BoardSearch({ store }: { store: ElementStore | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(0);
  const deferred = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const threads = useCommentsStore((s) => s.threads);
  const version = useSyncExternalStore(
    open && store ? store.subscribe : noop,
    store?.getVersion ?? zero,
    zero,
  );

  const hits = useMemo(
    () => (open && store ? searchBoard(store.values(), threads, deferred) : []),
    // version — пересчёт при правках доски, пока поиск открыт
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, store, threads, deferred, version],
  );

  // Ctrl+F открывает поиск по доске вместо поиска браузера (кроме набора текста)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isModKey(e) && e.code === 'KeyF' && !e.shiftKey && !e.altKey) {
        if (isTypingTarget(e.target) && e.target !== inputRef.current) return;
        if (useCanvasStore.getState().presentation) return;
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.select());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setCurrent(0), [deferred]);

  if (!open || !store) return null;

  const go = (delta: number) => {
    if (hits.length === 0) return;
    const next = (current + delta + hits.length) % hits.length;
    setCurrent(next);
    const hit = hits[next];
    if (hit) reveal(store, hit);
  };
  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <div
      className="absolute left-1/2 top-16 z-20 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border bg-background/95 shadow-lg backdrop-blur"
      role="search"
      onPointerDown={(e) => e.stopPropagation()}
      data-testid="board-search"
    >
      <div className="flex items-center gap-1 p-1">
        <Search className="ml-2 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          autoFocus
          value={query}
          placeholder="Найти на доске"
          aria-label="Найти на доске"
          className="h-8 border-0 shadow-none focus-visible:ring-0"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              go(e.shiftKey ? -1 : 1);
            }
            if (e.key === 'Escape') close();
          }}
        />
        <span className="shrink-0 px-1 text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {deferred.trim() ? `${hits.length > 0 ? current + 1 : 0} из ${hits.length}` : ''}
        </span>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Предыдущее" onClick={() => go(-1)}>
          <ChevronUp />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Следующее" onClick={() => go(1)}>
          <ChevronDown />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Закрыть поиск" onClick={close}>
          <X />
        </Button>
      </div>
      {hits.length > 0 ? (
        <ul className="max-h-72 overflow-y-auto border-t p-1" aria-label="Результаты поиска">
          {hits.slice(0, 100).map((hit, i) => (
            <li key={`${hit.kind}:${hit.id}`}>
              <button
                type="button"
                className={cn(
                  'flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-muted',
                  i === current && 'bg-muted',
                )}
                onClick={() => {
                  setCurrent(i);
                  reveal(store, hit);
                }}
              >
                <span className="text-xs text-muted-foreground">{hit.where}</span>
                <span className="line-clamp-2 text-sm">{hit.snippet}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : deferred.trim() ? (
        <p className="border-t px-3 py-2 text-sm text-muted-foreground">Ничего не найдено</p>
      ) : null}
    </div>
  );
}
