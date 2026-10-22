'use client';

import { X } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { assetUrl, type AudioElement } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import type { ElementStore } from '@/lib/canvas/element-store';
import { worldToScreen } from '@/lib/canvas/viewport';
import { useT } from '@/lib/i18n/client';
import { useCanvasStore } from '@/stores/canvas-store';

/**
 * Плеер аудио под карточкой (canvas не умеет звук): стандартные элементы
 * управления браузера — пауза, перемотка, громкость, скорость.
 * Играет одно аудио за раз; Esc или ✕ — закрыть.
 */
export function AudioPlayer({ store }: { store: ElementStore }) {
  const t = useT();
  const id = useCanvasStore((s) => s.playingAudioId);
  const camera = useCanvasStore((s) => s.camera);
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  const el = id ? (store.get(id) as AudioElement | undefined) : undefined;
  const valid = Boolean(el && el.type === 'audio');

  useEffect(() => {
    if (id && !valid) useCanvasStore.getState().setPlayingAudio(null);
  }, [id, valid]);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useCanvasStore.getState().setPlayingAudio(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  if (!el || !valid) return null;
  // Под карточкой, по её ширине на экране (не меньше 280 px — иначе кнопки не помещаются)
  const bottom = worldToScreen(camera, { x: el.x, y: el.y + el.height });
  const width = Math.max(280, el.width * camera.zoom);

  return (
    <div
      className="absolute z-20 flex items-center gap-1 rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur"
      style={{ left: bottom.x, top: bottom.y + 6, width }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      data-testid="audio-player"
    >
      <audio
        key={el.assetId}
        src={assetUrl(el.assetId)}
        controls
        autoPlay
        preload="metadata"
        className="h-9 min-w-0 flex-1"
        aria-label={el.title}
      />
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        aria-label={t('Закрыть плеер')}
        onClick={() => useCanvasStore.getState().setPlayingAudio(null)}
      >
        <X />
      </Button>
    </div>
  );
}
