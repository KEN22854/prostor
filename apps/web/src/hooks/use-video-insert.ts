'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { buildVideo, nextZIndex, VIDEO_WIDTH } from '@/lib/canvas/element-factory';
import { uploadImage } from '@/lib/canvas/image-upload';
import type { Point } from '@/lib/canvas/viewport';
import { useT } from '@/lib/i18n/client';
import { errorMessage } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';

interface VideoInsertDeps {
  boardId: string;
  doc: Y.Doc | null;
  actions: BoardActions | null;
  userId: string | null;
}

interface VideoProbe {
  width: number;
  height: number;
  durationMs?: number;
  poster: Blob | null;
}

/**
 * Пропорции, длительность и кадр-обложка — прямо в браузере, без обработки
 * на сервере. У записей MediaRecorder длительности в метаданных нет —
 * её передают снаружи.
 */
export function probeVideo(blob: Blob): Promise<VideoProbe> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    let settled = false;
    const done = (poster: Blob | null) => {
      if (settled) return;
      settled = true;
      const duration = Number.isFinite(video.duration)
        ? Math.round(video.duration * 1000)
        : undefined;
      resolve({
        width: video.videoWidth || 16,
        height: video.videoHeight || 9,
        durationMs: duration,
        poster,
      });
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
    };
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadeddata = () => {
      const t = Number.isFinite(video.duration) ? Math.min(1, video.duration / 10) : 0.1;
      video.currentTime = t;
    };
    video.onseeked = () => {
      const scale = Math.min(1, 960 / (video.videoWidth || 960));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((video.videoWidth || 960) * scale));
      canvas.height = Math.max(1, Math.round((video.videoHeight || 540) * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return done(null);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => done(b), 'image/jpeg', 0.85);
    };
    video.onerror = () => done(null);
    setTimeout(() => done(null), 15_000);
    video.src = url;
  });
}

/** Видео на доску: обложка + файл, карточка в точке at */
export function useVideoInsert({ boardId, doc, actions, userId }: VideoInsertDeps) {
  const t = useT();
  return useCallback(
    async (file: Blob, at: Point, opts: { title?: string; durationMs?: number } = {}) => {
      if (!doc || !actions?.canEdit || !userId) return;
      const toastId = toast.loading(t('Загружаем видео…'));
      try {
        const probe = await probeVideo(file);
        const poster = probe.poster
          ? await uploadImage(
              boardId,
              new File([probe.poster], 'poster.jpg', { type: 'image/jpeg' }),
            ).catch(() => null)
          : null;
        const form = new FormData();
        form.set('file', file, file instanceof File ? file.name : 'recording.webm');
        if (opts.title) form.set('title', opts.title);
        const res = await fetch(`/api/boards/${boardId}/video`, { method: 'POST', body: form });
        const body = (await res.json()) as {
          assetId?: string;
          mimeType?: string;
          title?: string;
          error?: { message: string };
        };
        if (!res.ok || !body.assetId)
          throw new Error(body.error?.message ?? t('Не удалось загрузить видео'));
        const width = VIDEO_WIDTH;
        const height = Math.round(Math.min(1.6, Math.max(0.4, probe.height / probe.width)) * width);
        const el = buildVideo({
          x: at.x - width / 2,
          y: at.y - height / 2,
          width,
          height,
          userId,
          zIndex: nextZIndex(doc),
          assetId: body.assetId,
          title: body.title ?? t('Видео'),
          mimeType: body.mimeType ?? 'video/mp4',
          durationMs: opts.durationMs ?? probe.durationMs,
          posterAssetId: poster?.id,
        });
        useCanvasStore.getState().select(actions.create([el]));
        toast.dismiss(toastId);
      } catch (error: unknown) {
        toast.error(errorMessage(error, t('Не удалось загрузить видео')), { id: toastId });
      }
    },
    [boardId, doc, actions, userId, t],
  );
}
