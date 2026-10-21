'use client';

import { Hand, Maximize, MessageCircle, Minus, MousePointer2, Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ZOOM_STEP } from '@/hooks/use-canvas-navigation';
import { zoomAt } from '@/lib/canvas/viewport';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';
import { useT } from '@/lib/i18n/client';

function zoomCenter(factor: number | ((zoom: number) => number)) {
  const { size, setCamera } = useCanvasStore.getState();
  setCamera((cam) =>
    zoomAt(
      cam,
      { x: size.width / 2, y: size.height / 2 },
      typeof factor === 'function' ? factor(cam.zoom) : cam.zoom * factor,
    ),
  );
}

interface ZoomControlsProps {
  onFit: () => void;
  /** Инструмент «Комментарий» для читателей (у редакторов он в панели инструментов) */
  showCommentTool?: boolean;
  /** «Выделение / рука» — для читателей; у редакторов они в панели инструментов */
  showNavTools?: boolean;
}

/** Панель масштаба и инструмента навигации (выделение / рука) */
export function ZoomControls({
  onFit,
  showNavTools = false,
  showCommentTool = false,
}: ZoomControlsProps) {
  const t = useT();
  // Округлённый процент как селектор: панорамирование не перерисовывает панель
  const percent = useCanvasStore((s) => Math.round(s.camera.zoom * 100));
  const tool = useCanvasStore((s) => s.tool);
  const setTool = useCanvasStore((s) => s.setTool);

  return (
    <div
      className="absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-md backdrop-blur"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {showNavTools ? (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn('size-8', tool === 'select' && 'bg-accent text-accent-foreground')}
                onClick={() => setTool('select')}
                aria-label={t('Выделение')}
                aria-pressed={tool === 'select'}
              >
                <MousePointer2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('Выделение (V)')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn('size-8', tool === 'hand' && 'bg-accent text-accent-foreground')}
                onClick={() => setTool('hand')}
                aria-label={t('Рука')}
                aria-pressed={tool === 'hand'}
              >
                <Hand />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('Рука (H или зажатый пробел)')}</TooltipContent>
          </Tooltip>
          {showCommentTool ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('size-8', tool === 'comment' && 'bg-accent text-accent-foreground')}
                  onClick={() => setTool('comment')}
                  aria-label={t('Комментарий')}
                  aria-pressed={tool === 'comment'}
                >
                  <MessageCircle />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('Комментарий (C)')}</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn('size-8', tool === 'laser' && 'bg-accent text-accent-foreground')}
                onClick={() => setTool('laser')}
                aria-label={t('Лазерная указка')}
                aria-pressed={tool === 'laser'}
              >
                <Zap />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('Лазерная указка (K)')}</TooltipContent>
          </Tooltip>

          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        </>
      ) : null}

      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => zoomCenter(1 / ZOOM_STEP)}
        aria-label={t('Уменьшить')}
      >
        <Minus />
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => zoomCenter(() => 1)}
            className="w-12 rounded px-1 py-1 text-center text-xs font-medium tabular-nums hover:bg-accent"
            aria-label={`Масштаб ${percent}%, сбросить до 100%`}
            data-testid="zoom-percent"
          >
            {percent}%
          </button>
        </TooltipTrigger>
        <TooltipContent>100% (Ctrl+0)</TooltipContent>
      </Tooltip>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => zoomCenter(ZOOM_STEP)}
        aria-label={t('Увеличить')}
      >
        <Plus />
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onFit}
            aria-label={t('Показать всё')}
          >
            <Maximize />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('Показать всё (Shift+1)')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
