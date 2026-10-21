'use client';

import { Map as MapIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Bounds } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { NEUTRAL_FILL } from '@/lib/canvas/constants';
import type { ElementStore } from '@/lib/canvas/element-store';
import { centerOn, unionBounds, visibleBounds } from '@/lib/canvas/viewport';
import { useCanvasStore } from '@/stores/canvas-store';

const WIDTH = 200;
const HEIGHT = 130;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mappingRef = useRef<Mapping | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let frame = 0;
    const draw = () => {
      frame = 0;
      const { camera, size } = useCanvasStore.getState();
      const view = visibleBounds(camera, size);
      const world = unionBounds(store?.extent() ?? null, view) ?? view;
      const m = mappingFor(world);
      mappingRef.current = m;

      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      store?.forEachBounds((b, el) => {
        // Линии и росчерки — тонкими штрихами: их габарит залитым прямоугольником
        // выглядел бы на мини-карте как большой серый блок
        if ('points' in el && Array.isArray(el.points)) {
          const pts = el.points;
          ctx.strokeStyle =
            'stroke' in el && typeof el.stroke === 'string' ? el.stroke : NEUTRAL_FILL;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i + 1 < pts.length; i += 2) {
            const x = m.offsetX + (el.x + (pts[i] ?? 0) - world.minX) * m.scale;
            const y = m.offsetY + (el.y + (pts[i + 1] ?? 0) - world.minY) * m.scale;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          return;
        }
        ctx.fillStyle = 'fill' in el && typeof el.fill === 'string' ? el.fill : NEUTRAL_FILL;
        ctx.fillRect(
          m.offsetX + (b.minX - world.minX) * m.scale,
          m.offsetY + (b.minY - world.minY) * m.scale,
          Math.max(1, (b.maxX - b.minX) * m.scale),
          Math.max(1, (b.maxY - b.minY) * m.scale),
        );
      });

      const styles = getComputedStyle(canvas);
      ctx.strokeStyle = `hsl(${styles.getPropertyValue('--primary').trim() || '246 70% 56%'})`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        m.offsetX + (view.minX - world.minX) * m.scale,
        m.offsetY + (view.minY - world.minY) * m.scale,
        (view.maxX - view.minX) * m.scale,
        (view.maxY - view.minY) * m.scale,
      );
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
        className="absolute bottom-4 right-4 bg-background shadow-sm"
        onClick={() => setOpen(true)}
        aria-label="Показать мини-карту"
      >
        <MapIcon />
      </Button>
    );
  }

  return (
    <div className="absolute bottom-4 right-4 overflow-hidden rounded-lg border bg-background/95 shadow-md backdrop-blur">
      <canvas
        ref={canvasRef}
        style={{ width: WIDTH, height: HEIGHT }}
        className="block cursor-pointer touch-none"
        aria-label="Мини-карта доски"
        data-testid="minimap"
      />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Скрыть мини-карту"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
