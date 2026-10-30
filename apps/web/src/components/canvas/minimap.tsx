'use client';

import { Map as MapIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Bounds } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { compareRenderOrder } from '@/lib/canvas/frames';
import { drawMinimapElement, MinimapImages } from '@/lib/canvas/minimap-render';
import type { ElementStore } from '@/lib/canvas/element-store';
import { centerOn, unionBounds, visibleBounds } from '@/lib/canvas/viewport';
import { useCanvasStore } from '@/stores/canvas-store';
import { useT } from '@/lib/i18n/client';

const WIDTH = 232;
const HEIGHT = 150;
const PAD = 8;

interface Mapping {
  scale: number;
  offsetX: number;
  offsetY: number;
  world: Bounds;
}

function mappingFor(world: Bounds): Mapping {
  const w = Math.max(1, world.maxX - world.minX);
  const h = Math.max(1, world.maxY - world.minY);
  const scale = Math.min((WIDTH - PAD * 2) / w, (HEIGHT - PAD * 2) / h);
  return {
    scale,
    offsetX: PAD + (WIDTH - PAD * 2 - w * scale) / 2,
    offsetY: PAD + (HEIGHT - PAD * 2 - h * scale) / 2,
    world,
  };
}

/**
 * Мини-карта на обычном <canvas> (не Konva): рисуется целиком раз в кадр,
 * только когда что-то изменилось. Даже 10 000 прямоугольников через fillRect
 * — доли миллисекунды. Клик/перетаскивание — переход к точке доски.
 */
export function Minimap({ store }: { store: ElementStore | null }) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mappingRef = useRef<Mapping | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Картинка догрузилась — перерисовать содержимое
    const images = new MinimapImages(() => {
      imagesVersion++;
      schedule();
    });

    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Содержимое доски — в отдельный холст: перерисовывается только когда меняется
    // доска или масштаб карты; при панорамировании просто копируется
    const content = document.createElement('canvas');
    content.width = canvas.width;
    content.height = canvas.height;
    const cctx = content.getContext('2d');
    let contentKey = '';
    let storeVersion = -1;
    let imagesVersion = 0;

    let frame = 0;
    const draw = () => {
      frame = 0;
      const { camera, size } = useCanvasStore.getState();
      const view = visibleBounds(camera, size);
      const world = unionBounds(store?.extent() ?? null, view) ?? view;
      const m = mappingFor(world);
      mappingRef.current = m;

      const key = [m.scale, m.offsetX, m.offsetY, world.minX, world.minY]
        .map((v) => v.toFixed(3))
        .join(':');
      const version = store?.getVersion() ?? 0;
      if (cctx && (key !== contentKey || version !== storeVersion || imagesVersion > 0)) {
        contentKey = key;
        storeVersion = version;
        imagesVersion = 0;
        cctx.setTransform(1, 0, 0, 1, 0, 0);
        cctx.clearRect(0, 0, content.width, content.height);
        cctx.setTransform(
          dpr * m.scale,
          0,
          0,
          dpr * m.scale,
          dpr * (m.offsetX - world.minX * m.scale),
          dpr * (m.offsetY - world.minY * m.scale),
        );
        // Порядок как на холсте: фреймы снизу, дальше по zIndex
        const elements = store ? [...store.values()].sort(compareRenderOrder) : [];
        for (const el of elements) drawMinimapElement(cctx, el, m.scale, images);
      }

      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.drawImage(content, 0, 0, WIDTH, HEIGHT);

      // Затемняем всё вне видимой области — так рамка «окна» читается сразу
      const vx = m.offsetX + (view.minX - world.minX) * m.scale;
      const vy = m.offsetY + (view.minY - world.minY) * m.scale;
      const vw = (view.maxX - view.minX) * m.scale;
      const vh = (view.maxY - view.minY) * m.scale;
      const styles = getComputedStyle(canvas);
      const primary = styles.getPropertyValue('--primary').trim() || '265 72% 62%';
      ctx.fillStyle = `hsl(${primary} / 0.07)`;
      ctx.beginPath();
      ctx.rect(0, 0, WIDTH, HEIGHT);
      ctx.rect(vx, vy, vw, vh);
      ctx.fill('evenodd');
      ctx.strokeStyle = `hsl(${primary})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(vx, vy, vw, vh, 3);
      ctx.stroke();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    schedule();
    const unsubStore = store?.subscribe(schedule);
    const unsubCamera = useCanvasStore.subscribe((s, p) => {
      if (s.camera !== p.camera || s.size !== p.size) schedule();
    });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      unsubStore?.();
      unsubCamera();
    };
  }, [store, open]);

  // Клик и перетаскивание: центрируем камеру в соответствующей точке доски
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open) return;
    let dragging = false;

    const moveTo = (e: PointerEvent) => {
      const m = mappingRef.current;
      if (!m) return;
      const rect = canvas.getBoundingClientRect();
      const world = {
        x: m.world.minX + (e.clientX - rect.left - m.offsetX) / m.scale,
        y: m.world.minY + (e.clientY - rect.top - m.offsetY) / m.scale,
      };
      const { size } = useCanvasStore.getState();
      useCanvasStore.getState().setCamera((cam) => centerOn(cam, size, world));
    };
    const down = (e: PointerEvent) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      moveTo(e);
    };
    const move = (e: PointerEvent) => {
      if (dragging) moveTo(e);
    };
    const up = (e: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
  }, [open]);

  if (!open) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="absolute bottom-4 right-4 hidden bg-background shadow-sm sm:inline-flex"
        onClick={() => setOpen(true)}
        aria-label={t('Показать мини-карту')}
      >
        <MapIcon />
      </Button>
    );
  }

  return (
    <div className="floating-panel absolute bottom-4 right-4 hidden overflow-hidden duration-300 animate-in fade-in-0 zoom-in-95 sm:block">
      <canvas
        ref={canvasRef}
        style={{ width: WIDTH, height: HEIGHT }}
        className="block cursor-pointer touch-none bg-canvas"
        aria-label={t('Мини-карта доски')}
        data-testid="minimap"
      />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={t('Скрыть мини-карту')}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
