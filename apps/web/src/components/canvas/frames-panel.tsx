'use client';

import { Frame } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ElementStore } from '@/lib/canvas/element-store';
import { sortFrames } from '@/lib/canvas/frames';
import { boundsOf } from '@/lib/canvas/read-element';
import { fitBounds } from '@/lib/canvas/viewport';
import { useCanvasStore } from '@/stores/canvas-store';

const noop = () => () => undefined;
const zero = () => 0;

/** Список фреймов доски: клик — показать фрейм целиком и выделить его */
export function FramesPanel({ store }: { store: ElementStore | null }) {
  const [open, setOpen] = useState(false);
  // Подписка только пока список открыт: правки доски не перерисовывают закрытую кнопку
  useSyncExternalStore(open && store ? store.subscribe : noop, store?.getVersion ?? zero, zero);
  const frames = store ? sortFrames(store.frames()) : [];
  if (!store || (frames.length === 0 && !open)) return null;

  const goTo = (id: string) => {
    const frame = store.get(id);
    if (!frame) return;
    const { size, setCamera, select } = useCanvasStore.getState();
    // Отступ сверху учитывает заголовок фрейма над рамкой
    setCamera(fitBounds(boundsOf(frame), size, 72, 4));
    select([id]);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="absolute right-3 top-3 z-10 bg-background/95 shadow-md backdrop-blur"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Frame /> Фреймы <span className="text-xs text-muted-foreground">{frames.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1" onPointerDown={(e) => e.stopPropagation()}>
        <ul className="max-h-80 overflow-y-auto" aria-label="Фреймы доски">
          {frames.map((f, i) => (
            <li key={f.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => goTo(f.id)}
              >
                <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                <span className="truncate">{f.title || 'Без названия'}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
