'use client';

import { X } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { assetUrl, type VideoElement } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import type { ElementStore } from '@/lib/canvas/element-store';
import { worldToScreen } from '@/lib/canvas/viewport';
import { useT } from '@/lib/i18n/client';
import { useCanvasStore } from '@/stores/canvas-store';

/**
 * Плеер видео прямо поверх карточки на доске: двигается и масштабируется
 * вместе с холстом. Стандартные элементы управления браузера (пауза,
 * перемотка, громкость, скорость, полный экран). Esc или ✕ — закрыть.
 */
export function VideoPlayer({ store }: { store: ElementStore }) {
  const t = useT();
  const id = useCanvasStore((s) => s.playingVideoId);
  const camera = useCanvasStore((s) => s.camera);
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  const el = id ? (store.get(id) as VideoElement | undefined) : undefined;
  const valid = Boolean(el && el.type === 'video');

  useEffect(() => {
    if (id && !valid) useCanvasStore.getState().setPlayingVideo(null);
  }, [id, valid]);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useCanvasStore.getState().setPlayingVideo(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  if (!el || !valid) return null;
  const pos = worldToScreen(camera, { x: el.x, y: el.y });
  const width = el.width * camera.zoom;
  const height = el.height * camera.zoom;

  return (
    <div
      className="shadow-soft-lg absolute z-20 overflow-hidden rounded-[14px] bg-black duration-300 animate-in fade-in-0 zoom-in-95"
      style={{
        left: pos.x,
        top: pos.y,
        width,
        height,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        transformOrigin: '0 0',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      data-testid="video-player"
    >
      <video
        key={el.assetId}
        src={assetUrl(el.assetId)}
        poster={el.posterAssetId ? assetUrl(el.posterAssetId) : undefined}
        controls
        autoPlay
        playsInline
        preload="metadata"
        className="size-full object-contain"
        aria-label={el.title}
      />
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 size-8 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white"
        aria-label={t('Закрыть плеер')}
        onClick={() => useCanvasStore.getState().setPlayingVideo(null)}
      >
        <X />
      </Button>
    </div>
  );
}
