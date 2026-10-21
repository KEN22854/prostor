'use client';

import { Sparkles } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import type { ElementStore } from '@/lib/canvas/element-store';
import { worldToScreen } from '@/lib/canvas/viewport';
import { useAiStore } from '@/stores/ai-store';
import { useCanvasStore } from '@/stores/canvas-store';

/**
 * Индикатор выполняющейся ИИ-задачи поверх объекта (или места будущей
 * картинки): мерцающая подложка, подпись и прогресс. HTML-слой, а не Konva —
 * задач единицы, а CSS-анимация не нагружает перерисовку холста.
 */
export function AiProgressOverlay({ store }: { store: ElementStore | null }) {
  const tasks = useAiStore((s) => s.tasks);
  const camera = useCanvasStore((s) => s.camera);
  // Рамка следует за элементом, если его двигают во время обработки
  useSyncExternalStore(
    store?.subscribe ?? (() => () => undefined),
    store?.getVersion ?? (() => 0),
    () => 0,
  );

  const list = Object.values(tasks);
  if (list.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-live="polite">
      {list.map((task) => {
        const b = task.elementId ? store?.boundsOf(task.elementId) : task.bounds;
        if (!b) return null;
        const p = worldToScreen(camera, { x: b.minX, y: b.minY });
        const width = (b.maxX - b.minX) * camera.zoom;
        const height = (b.maxY - b.minY) * camera.zoom;
        return (
          <div
            key={task.key}
            className="absolute flex flex-col items-center justify-center gap-2 overflow-hidden rounded-md border-2 border-primary/60 bg-primary/10"
            style={{ left: p.x, top: p.y, width, height }}
            data-testid="ai-progress"
          >
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-primary/10 via-transparent to-primary/20" />
            <div className="relative flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-xs font-medium shadow">
              <Sparkles className="size-3.5 text-primary" aria-hidden />
              {task.label}… {task.progress}%
            </div>
            <div className="relative h-1 w-2/3 max-w-40 overflow-hidden rounded-full bg-background/80">
              <div
                className="h-full bg-primary transition-[width] duration-500"
                style={{ width: `${task.progress}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
