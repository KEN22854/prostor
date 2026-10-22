'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { buildAudio, nextZIndex } from '@/lib/canvas/element-factory';
import type { Point } from '@/lib/canvas/viewport';
import { useT } from '@/lib/i18n/client';
import { errorMessage } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';

interface AudioInsertDeps {
  boardId: string;
  doc: Y.Doc | null;
  actions: BoardActions | null;
  userId: string | null;
}

/** Длительность файла по метаданным (у записей MediaRecorder её нет — передаётся снаружи) */
export function readDuration(blob: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    const done = (value: number | undefined) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined);
    audio.onerror = () => done(undefined);
    setTimeout(() => done(undefined), 5_000);
    audio.src = url;
  });
}

/** Аудио на доску: загрузка файла и карточка в точке at */
export function useAudioInsert({ boardId, doc, actions, userId }: AudioInsertDeps) {
  const t = useT();
  return useCallback(
    async (file: Blob, at: Point, opts: { title?: string; durationMs?: number } = {}) => {
      if (!doc || !actions?.canEdit || !userId) return;
      const toastId = toast.loading(t('Загружаем аудио…'));
      try {
        const durationMs = opts.durationMs ?? (await readDuration(file));
        const form = new FormData();
        form.set('file', file, file instanceof File ? file.name : 'recording.webm');
        if (opts.title) form.set('title', opts.title);
        const res = await fetch(`/api/boards/${boardId}/audio`, { method: 'POST', body: form });
        const body = (await res.json()) as {
          assetId?: string;
          mimeType?: string;
          title?: string;
          error?: { message: string };
        };
        if (!res.ok || !body.assetId)
          throw new Error(body.error?.message ?? t('Не удалось загрузить аудио'));
        const draft = buildAudio({
          x: 0,
          y: 0,
          userId,
          zIndex: nextZIndex(doc),
          assetId: body.assetId,
          title: body.title ?? t('Аудио'),
          mimeType: body.mimeType ?? 'audio/mpeg',
          durationMs,
        });
        const el = { ...draft, x: at.x - draft.width / 2, y: at.y - draft.height / 2 };
        useCanvasStore.getState().select(actions.create([el]));
        toast.dismiss(toastId);
      } catch (error: unknown) {
        toast.error(errorMessage(error, t('Не удалось загрузить аудио')), { id: toastId });
      }
    },
    [boardId, doc, actions, userId, t],
  );
}
