'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import type { AiJobDto, ImageElement } from '@prostor/shared';
import { useAiJob } from '@/hooks/use-ai-job';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { buildImage, nextZIndex } from '@/lib/canvas/element-factory';
import type { ElementStore } from '@/lib/canvas/element-store';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';
import { useAiStore } from '@/stores/ai-store';
import { useCanvasStore } from '@/stores/canvas-store';
import type * as Y from 'yjs';

interface RemoveBgDeps {
  boardId: string;
  doc: Y.Doc | null;
  store: ElementStore | null;
  actions: BoardActions | null;
  userId: string | null;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/**
 * «Убрать фон» у изображения на доске.
 *
 * Результат — новый ассет; в элементе меняется assetId (один шаг undo
 * возвращает исходную картинку — она не удаляется). Если пока шла обработка
 * коллега заменил или удалил картинку, результат кладётся рядом, а не поверх
 * чужой правки.
 */
export function useRemoveBg({ boardId, doc, store, actions, userId }: RemoveBgDeps) {
  const runJob = useAiJob();

  return useCallback(
    async (elementId: string) => {
      const el = store?.get(elementId);
      if (!el || el.type !== 'image' || !actions?.canEdit || !doc || !userId) return;
      const image = el as ImageElement;
      const key = `remove-bg:${elementId}`;
      const ai = useAiStore.getState();
      if (ai.tasks[key]) return; // уже обрабатывается
      ai.start({ key, label: 'Удаляем фон', progress: 0, elementId });

      try {
        const job = await runJob(
          () =>
            apiRequest<AiJobDto>('/api/ai/remove-bg', {
              method: 'POST',
              body: { boardId, assetId: image.assetId },
            }),
          (j) => useAiStore.getState().progress(key, j.progress),
        );
        if (job.status !== 'SUCCEEDED' || !job.result) {
          toast.error(job.error ?? 'Не удалось удалить фон');
          return;
        }
        const { assetId, width, height } = job.result;
        const current = store?.get(elementId);
        if (current?.type === 'image' && (current as ImageElement).assetId === image.assetId) {
          actions.update(
            new Map([[elementId, { assetId, naturalWidth: width, naturalHeight: height }]]),
          );
          toast.success('Фон удалён');
        } else {
          const copy = buildImage({
            x: image.x + image.width + 24,
            y: image.y,
            width: image.width,
            height: image.height,
            naturalWidth: width,
            naturalHeight: height,
            assetId,
            alt: image.alt,
            userId,
            zIndex: nextZIndex(doc),
          });
          useCanvasStore.getState().select(actions.create([copy]));
          toast.success('Изображение изменилось во время обработки — результат добавлен рядом');
        }
      } catch (error: unknown) {
        if (!isAbort(error)) toast.error(errorMessage(error, 'Не удалось удалить фон'));
      } finally {
        useAiStore.getState().finish(key);
      }
    },
    [boardId, doc, store, actions, userId, runJob],
  );
}
