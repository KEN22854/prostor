'use client';

import type Konva from 'konva';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Layer, Rect, Stage } from 'react-konva';
import { ElementNode } from '@/components/canvas/element-node';
import { compareRenderOrder } from '@/lib/canvas/frames';
import type { ExportPage } from '@/lib/export/export-pages';
import { PreloadedImagesContext, preloadImages } from '@/lib/export/preloaded-images';

interface ExportStageProps {
  page: ExportPage;
  background: string | null;
  onReady: (stage: Konva.Stage) => void;
}

/** Сколько нод монтировать за раз: commit React не прерывается, поэтому режем сами */
const MOUNT_CHUNK = 800;

/**
 * Невидимый Stage со всеми элементами страницы — те же компоненты, что на холсте,
 * поэтому экспорт выглядит ровно как доска. Виртуализации и LOD здесь нет.
 * Ноды монтируются порциями по кадрам: на доске в 10 000 объектов интерфейс
 * не замирает на секунду, пока создаются Konva-ноды.
 */
function ExportStage({ page, background, onReady }: ExportStageProps) {
  const ref = useRef<Konva.Stage>(null);
  const { bounds: b } = page;
  const width = Math.ceil(b.maxX - b.minX);
  const height = Math.ceil(b.maxY - b.minY);
  const elements = useMemo(() => [...page.elements].sort(compareRenderOrder), [page.elements]);
  const [mounted, setMounted] = useState(Math.min(MOUNT_CHUNK, elements.length));

  useEffect(() => {
    if (mounted < elements.length) {
      // setTimeout, а не rAF: во вкладке в фоне rAF замирает и экспорт бы «висел»
      const timer = setTimeout(() => setMounted((n) => Math.min(n + MOUNT_CHUNK, elements.length)), 0);
      return () => clearTimeout(timer);
    }
    if (ref.current) onReady(ref.current);
    return undefined;
  }, [mounted, elements.length, onReady]);

  return (
    <Stage ref={ref} width={width} height={height}>
      <Layer
        x={-b.minX}
        y={-b.minY}
        listening={false}
        {...(page.clip ? { clipX: b.minX, clipY: b.minY, clipWidth: width, clipHeight: height } : {})}
      >
        {background ? <Rect x={b.minX} y={b.minY} width={width} height={height} fill={background} /> : null}
        {elements.slice(0, mounted).map((el) => (
          <ElementNode key={el.id} element={el} detail="full" />
        ))}
      </Layer>
    </Stage>
  );
}

/** Рендер страницы в canvas с заданным масштабом (pixelRatio) */
export async function renderPageToCanvas(
  page: ExportPage,
  opts: { scale: number; background: string | null },
): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  const images = await preloadImages(page.elements);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    const stage = await new Promise<Konva.Stage>((resolve) => {
      root.render(
        <PreloadedImagesContext.Provider value={images}>
          <ExportStage page={page} background={opts.background} onReady={resolve} />
        </PreloadedImagesContext.Provider>,
      );
    });
    // toCanvas рисует сцену заново синхронно — ждать batchDraw не нужно
    return stage.toCanvas({ pixelRatio: opts.scale });
  } finally {
    root.unmount();
    host.remove();
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Не удалось создать изображение'))), type, quality);
  });
}
