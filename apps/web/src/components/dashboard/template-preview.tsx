'use client';

import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { Y_KEYS, type BoardElement } from '@prostor/shared';
import { compareRenderOrder } from '@/lib/canvas/frames';
import { drawMinimapElement, MinimapImages } from '@/lib/canvas/minimap-render';
import { boundsOf, readElement } from '@/lib/canvas/read-element';

const W = 240;
const H = 150;

/**
 * Превью своего шаблона: содержимое (Yjs) рисуется в браузере тем же
 * рендером, что и мини-карта, — сервер не хранит отдельных миниатюр.
 */
export function TemplatePreview({ templateId }: { templateId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading');

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let elements: BoardElement[] = [];
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;

    const draw = () => {
      if (cancelled || elements.length === 0) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const el of elements) {
        const b = boundsOf(el);
        minX = Math.min(minX, b.minX);
        minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX);
        maxY = Math.max(maxY, b.maxY);
      }
      const pad = 10;
      const scale = Math.min(
        (W - pad * 2) / (maxX - minX || 1),
        (H - pad * 2) / (maxY - minY || 1),
      );
      const ox = (W - (maxX - minX) * scale) / 2 - minX * scale;
      const oy = (H - (maxY - minY) * scale) / 2 - minY * scale;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
      for (const el of elements) drawMinimapElement(ctx, el, scale, images);
    };
    const images = new MinimapImages(draw);

    void fetch(`/api/templates/${templateId}/state`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buffer) => {
        if (cancelled) return;
        const doc = new Y.Doc();
        Y.applyUpdate(doc, new Uint8Array(buffer));
        const map = doc.getMap<Y.Map<unknown>>(Y_KEYS.elements);
        const list: BoardElement[] = [];
        map.forEach((value, id) => {
          if (!(value instanceof Y.Map)) return;
          const el = readElement(id, value);
          if (el) list.push(el);
        });
        doc.destroy();
        elements = list.sort(compareRenderOrder);
        setState(list.length > 0 ? 'ready' : 'empty');
        draw();
      })
      .catch(() => !cancelled && setState('empty'));
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden bg-canvas">
      {state === 'loading' ? <div className="skeleton absolute inset-0" /> : null}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%' }}
        className={state === 'ready' ? 'animate-appear' : 'opacity-0'}
        aria-hidden
      />
    </div>
  );
}
