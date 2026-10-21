'use client';

import { Gauge } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LOCAL_ORIGIN } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { clearAllElements, generateTestElements } from '@/lib/canvas/dev-generate';
import type { BoardConnection } from '@/lib/yjs/board-connection';
import { useT } from '@/lib/i18n/client';

/** Счётчик FPS по requestAnimationFrame (обновление раз в 500 мс) */
function useFps(): number {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let start = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      frames++;
      if (now - start >= 500) {
        setFps(Math.round((frames * 1000) / (now - start)));
        frames = 0;
        start = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

interface DevPerfPanelProps {
  connection: BoardConnection;
  userId: string;
}

/**
 * Панель замеров для разработки: генерация N объектов и FPS.
 * Не попадает в production-сборку (рендерится только при NODE_ENV=development).
 */
export function DevPerfPanel({ connection, userId }: DevPerfPanelProps) {
  const t = useT();
  const fps = useFps();
  const [open, setOpen] = useState(false);

  function generate(count: number) {
    const started = performance.now();
    generateTestElements(connection.doc, count, userId, LOCAL_ORIGIN);
    // Время транзакции + синхронного пересчёта ElementStore; рендер — в следующем кадре
    requestAnimationFrame(() => {
      toast.info(
        `${count.toLocaleString('ru')} объектов за ${Math.round(performance.now() - started)} мс`,
      );
    });
  }

  return (
    <div
      className="absolute right-4 top-4 flex flex-col items-end gap-2"
      data-testid="dev-perf-panel"
    >
      <Button
        variant="outline"
        size="sm"
        className="bg-background/95 font-mono"
        onClick={() => setOpen((v) => !v)}
      >
        <Gauge /> <span data-testid="fps">{fps}</span> FPS
      </Button>
      {open ? (
        <div className="flex flex-col gap-1 rounded-lg border bg-background/95 p-2 shadow-md backdrop-blur">
          <Button size="sm" variant="ghost" onClick={() => generate(1_000)}>
            {t('+ 1 000 объектов')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => generate(10_000)}>
            {t('+ 10 000 объектов')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => clearAllElements(connection.doc, LOCAL_ORIGIN)}
          >
            {t('Очистить доску')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
