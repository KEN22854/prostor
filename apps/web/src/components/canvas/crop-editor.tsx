'use client';

import { Check, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { assetUrl, type ImageCrop, type ImageElement } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import type { BoardActions } from '@/lib/canvas/board-actions';
import type { ElementStore } from '@/lib/canvas/element-store';
import {
  applyCrop,
  clampCrop,
  cropScale,
  currentCrop,
  fullImageRect,
} from '@/lib/canvas/image-crop';
import { worldToScreen } from '@/lib/canvas/viewport';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const RATIOS: ReadonlyArray<{ label: string; value: number | null | 'original' }> = [
  { label: 'Свободно', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
  { label: '3:4', value: 3 / 4 },
  { label: 'Исходные', value: 'original' },
];

const HANDLES: Array<{ h: Handle; className: string }> = [
  { h: 'nw', className: '-left-1.5 -top-1.5 cursor-nwse-resize' },
  { h: 'n', className: 'left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize' },
  { h: 'ne', className: '-right-1.5 -top-1.5 cursor-nesw-resize' },
  { h: 'e', className: '-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize' },
  { h: 'se', className: '-bottom-1.5 -right-1.5 cursor-nwse-resize' },
  { h: 's', className: '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize' },
  { h: 'sw', className: '-bottom-1.5 -left-1.5 cursor-nesw-resize' },
  { h: 'w', className: '-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize' },
];

/**
 * Режим обрезки изображения (двойной клик по картинке или «Обрезать»).
 * Поверх холста — вся картинка приглушённо и рамка видимой части: тянуть
 * за ручки — менять кадр, за середину — двигать. Enter — готово, Esc — отмена.
 * Обрезка не портит исходник: «Сбросить» возвращает картинку целиком.
 */
export function CropEditor({ store, actions }: { store: ElementStore; actions: BoardActions }) {
  const id = useCanvasStore((s) => s.croppingId);
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  const el = id ? (store.get(id) as ImageElement | undefined) : undefined;
  const valid = Boolean(el && el.type === 'image' && !el.locked);

  useEffect(() => {
    if (id && !valid) useCanvasStore.getState().setCropping(null);
  }, [id, valid]);

  if (!el || !valid) return null;
  return <CropFrame key={el.id} el={el} actions={actions} />;
}

function CropFrame({ el, actions }: { el: ImageElement; actions: BoardActions }) {
  const t = useT();
  const camera = useCanvasStore((s) => s.camera);
  const [draft, setDraft] = useState<ImageCrop>(() => currentCrop(el));
  const [ratio, setRatio] = useState<number | null>(null);
  const drag = useRef<{ handle: Handle; start: { x: number; y: number }; crop: ImageCrop } | null>(
    null,
  );
  const { sx, sy } = cropScale(el);
  const full = fullImageRect(el);
  const origin = worldToScreen(camera, { x: el.x, y: el.y });
  const rad = ((el.rotation ?? 0) * Math.PI) / 180;

  const close = () => useCanvasStore.getState().setCropping(null);
  const done = () => {
    actions.update(
      new Map([[el.id, applyCrop(el, clampCrop(draft, el.naturalWidth, el.naturalHeight))]]),
    );
    close();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        close();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        done();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  });

  /** Сдвиг указателя на экране → пиксели исходника (учёт зума и поворота) */
  const toNatural = (dxScreen: number, dyScreen: number) => {
    const lx = (dxScreen * Math.cos(-rad) - dyScreen * Math.sin(-rad)) / camera.zoom;
    const ly = (dxScreen * Math.sin(-rad) + dyScreen * Math.cos(-rad)) / camera.zoom;
    return { x: lx / sx, y: ly / sy };
  };

  const setAspect = (value: number | null | 'original') => {
    const target = value === 'original' ? el.naturalWidth / el.naturalHeight : value;
    setRatio(target);
    if (!target) return;
    // Новая пропорция в единицах доски — вписываем в текущий кадр по центру
    setDraft((d) => {
      const w = d.width * sx;
      const h = d.height * sy;
      const nw = Math.min(w, h * target);
      const nh = nw / target;
      const width = nw / sx;
      const height = nh / sy;
      return clampCrop(
        { x: d.x + (d.width - width) / 2, y: d.y + (d.height - height) / 2, width, height },
        el.naturalWidth,
        el.naturalHeight,
      );
    });
  };

  const onPointerDown = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { handle, start: { x: e.clientX, y: e.clientY }, crop: draft };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const delta = toNatural(e.clientX - d.start.x, e.clientY - d.start.y);
    const c = d.crop;
    let { x, y, width, height } = c;
    if (d.handle === 'move') {
      x += delta.x;
      y += delta.y;
    } else {
      if (d.handle.includes('w')) {
        x = Math.min(c.x + c.width - 4, Math.max(0, c.x + delta.x));
        width = c.x + c.width - x;
      }
      if (d.handle.includes('e'))
        width = Math.max(4, Math.min(el.naturalWidth - c.x, c.width + delta.x));
      if (d.handle.includes('n')) {
        y = Math.min(c.y + c.height - 4, Math.max(0, c.y + delta.y));
        height = c.y + c.height - y;
      }
      if (d.handle.includes('s'))
        height = Math.max(4, Math.min(el.naturalHeight - c.y, c.height + delta.y));
      if (ratio) {
        // Пропорция держится по большему изменению; угол/сторона-якорь остаются на месте
        const want = ratio * (sy / sx);
        if (d.handle === 'n' || d.handle === 's') width = height * want;
        else height = width / want;
        if (d.handle.includes('w')) x = c.x + c.width - width;
        if (d.handle.includes('n')) y = c.y + c.height - height;
      }
    }
    setDraft(clampCrop({ x, y, width, height }, el.naturalWidth, el.naturalHeight));
  };

  const box = {
    left: full.x + draft.x * sx,
    top: full.y + draft.y * sy,
    width: draft.width * sx,
    height: draft.height * sy,
  };
  const src = assetUrl(el.assetId);

  return (
    <>
      <div
        className="absolute left-0 top-0 z-20 origin-top-left"
        style={{
          transform: `translate(${origin.x}px, ${origin.y}px) rotate(${el.rotation}deg) scale(${camera.zoom})`,
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        data-testid="crop-editor"
      >
        {/* Вся картинка, приглушённо */}
        {/* eslint-disable-next-line @next/next/no-img-element -- ассет доски, тот же файл, что на холсте */}
        <img
          src={src}
          alt=""
          draggable={false}
          className="pointer-events-none absolute max-w-none select-none opacity-35"
          style={{ left: full.x, top: full.y, width: full.width, height: full.height }}
        />
        {/* Кадр: та же картинка без затемнения, обрезанная рамкой */}
        <div
          className="absolute cursor-move overflow-hidden outline outline-2 outline-primary"
          style={{ ...box, outlineWidth: 2 / camera.zoom }}
          onPointerDown={onPointerDown('move')}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- см. выше */}
          <img
            src={src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none select-none"
            style={{
              left: -draft.x * sx,
              top: -draft.y * sy,
              width: full.width,
              height: full.height,
            }}
          />
          {/* Сетка третей */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, i) => (
              <div
                key={i}
                className="border border-white/40"
                style={{ borderWidth: 0.5 / camera.zoom }}
              />
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute" style={box}>
          {HANDLES.map(({ h, className }) => (
            <span
              key={h}
              className={cn(
                'pointer-events-auto absolute size-3 rounded-sm border-2 border-primary bg-white',
                className,
              )}
              style={{ transform: `scale(${1 / camera.zoom})` }}
              onPointerDown={onPointerDown(h)}
            />
          ))}
        </div>
      </div>

      <div
        className="absolute bottom-16 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-background/95 p-1 text-sm shadow-lg backdrop-blur"
        role="toolbar"
        aria-label={t('Обрезка изображения')}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {RATIOS.map((r) => (
          <Button
            key={r.label}
            size="sm"
            variant={
              (
                r.value === 'original'
                  ? ratio === el.naturalWidth / el.naturalHeight
                  : ratio === r.value
              )
                ? 'secondary'
                : 'ghost'
            }
            className="h-7 px-2 text-xs"
            onClick={() => setAspect(r.value)}
          >
            {t(r.label)}
          </Button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => {
            setRatio(null);
            setDraft({ x: 0, y: 0, width: el.naturalWidth, height: el.naturalHeight });
          }}
        >
          <RotateCcw /> {t('Сбросить')}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={close}>
          <X /> {t('Отмена')}
        </Button>
        <Button size="sm" className="h-7 px-2" onClick={done}>
          <Check /> {t('Готово')}
        </Button>
      </div>
    </>
  );
}
