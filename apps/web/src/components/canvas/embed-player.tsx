'use client';

import { ExternalLink, X } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import type { EmbedElement } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { EMBED_CARD } from '@/lib/canvas/element-factory';
import type { ElementStore } from '@/lib/canvas/element-store';
import { worldToScreen } from '@/lib/canvas/viewport';
import { useCanvasStore } from '@/stores/canvas-store';
import { useT } from '@/lib/i18n/client';

/**
 * Живой плеер/просмотрщик поверх карточки (iframe нельзя нарисовать в canvas).
 * Открыт не больше одного — десятки iframe на доске съели бы память и сеть.
 * Двигается и масштабируется вместе с камерой; Esc или ✕ — закрыть.
 */
export function EmbedPlayer({ store }: { store: ElementStore }) {
  const t = useT();
  const id = useCanvasStore((s) => s.playingEmbedId);
  const camera = useCanvasStore((s) => s.camera);
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  const el = id ? (store.get(id) as EmbedElement | undefined) : undefined;
  const valid = Boolean(el && el.type === 'embed' && el.embedUrl);

  useEffect(() => {
    if (id && !valid) useCanvasStore.getState().setPlayingEmbed(null);
  }, [id, valid]);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useCanvasStore.getState().setPlayingEmbed(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  if (!el || !valid || !el.embedUrl) return null;
  const origin = worldToScreen(camera, { x: el.x, y: el.y });
  const mediaHeight = Math.max(160, el.height - EMBED_CARD.textHeight);

  return (
    <div
      className="absolute left-0 top-0 z-20 origin-top-left"
      style={{
        transform: `translate(${origin.x}px, ${origin.y}px) rotate(${el.rotation}deg) scale(${camera.zoom})`,
        width: el.width,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      data-testid="embed-player"
    >
      <div className="overflow-hidden rounded-[10px] border bg-black shadow-xl">
        <iframe
          src={el.embedUrl}
          title={el.title}
          width={el.width}
          height={mediaHeight}
          className="block"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
        />
        <div className="flex items-center gap-1 bg-background px-2 py-1">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{el.title}</span>
          <Button variant="ghost" size="icon" className="size-7" asChild>
            <a
              href={el.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('Открыть в новой вкладке')}
            >
              <ExternalLink />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t('Закрыть плеер')}
            onClick={() => useCanvasStore.getState().setPlayingEmbed(null)}
          >
            <X />
          </Button>
        </div>
      </div>
    </div>
  );
}
