'use client';

import { ArrowDown, ArrowUp, Frame, Play } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { startPresentation } from '@/components/canvas/presentation-mode';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { BoardActions } from '@/lib/canvas/board-actions';
import type { ElementStore } from '@/lib/canvas/element-store';
import { sortFrames } from '@/lib/canvas/frames';
import { boundsOf } from '@/lib/canvas/read-element';
import { fitBounds } from '@/lib/canvas/viewport';
import { useCanvasStore } from '@/stores/canvas-store';

const noop = () => () => undefined;
const zero = () => 0;

/**
 * Список фреймов доски — он же порядок слайдов презентации.
 * Клик — показать фрейм целиком и выделить; стрелки — переставить слайд;
 * «Показать» — режим презентации с первого слайда.
 */
export function FramesPanel({
  store,
  actions,
}: {
  store: ElementStore | null;
  actions: BoardActions | null;
}) {
  const [open, setOpen] = useState(false);
  // Подписка только пока список открыт: правки доски не перерисовывают закрытую кнопку
  useSyncExternalStore(open && store ? store.subscribe : noop, store?.getVersion ?? zero, zero);
  const frames = store ? sortFrames(store.frames()) : [];
  if (!store || (frames.length === 0 && !open)) return null;
  const canReorder = Boolean(actions?.canEdit);

  const goTo = (id: string) => {
    const frame = store.get(id);
    if (!frame) return;
    const { size, setCamera, select } = useCanvasStore.getState();
    // Отступ сверху учитывает заголовок фрейма над рамкой
    setCamera(fitBounds(boundsOf(frame), size, 72, 4));
    select([id]);
    setOpen(false);
  };

  /** Перестановка: порядок презентации получают все фреймы — он становится явным */
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (!actions || target < 0 || target >= frames.length) return;
    const order = frames.map((f) => f.id);
    const [moved] = order.splice(index, 1);
    if (moved) order.splice(target, 0, moved);
    actions.update(new Map(order.map((id, i) => [id, { presentationOrder: i }])));
  };

  const present = () => {
    setOpen(false);
    if (!startPresentation(store)) toast.info('Добавьте фреймы — каждый станет слайдом');
  };

  return (
    <div
      className="absolute right-3 top-3 z-10 flex gap-1"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Button
        variant="outline"
        size="sm"
        className="bg-background/95 shadow-md backdrop-blur"
        onClick={present}
        data-testid="start-presentation"
      >
        <Play /> Показать
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="bg-background/95 shadow-md backdrop-blur">
            <Frame /> Фреймы <span className="text-xs text-muted-foreground">{frames.length}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-1" onPointerDown={(e) => e.stopPropagation()}>
          <ul className="max-h-80 overflow-y-auto" aria-label="Фреймы доски">
            {frames.map((f, i) => (
              <li key={f.id} className="group flex items-center gap-1 rounded hover:bg-muted">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
                  onClick={() => goTo(f.id)}
                >
                  <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                  <span className="truncate">{f.title || 'Без названия'}</span>
                </button>
                {canReorder ? (
                  <span className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Слайд ${i + 1} выше`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Слайд ${i + 1} ниже`}
                      disabled={i === frames.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
