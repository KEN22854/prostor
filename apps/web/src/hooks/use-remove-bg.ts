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

/**
 * Результат удаления фона обрезан до объекта: crop — его прямоугольник в
 * пикселях исходника. Сдвигаем и уменьшаем элемент так, чтобы объект остался
 * на том же месте доски (сдвиг поворачиваем вместе с элементом — Konva
 * вращает его вокруг (x, y)).
 */
export function croppedPlacement(
  el: Pick<
    ImageElement,
    'x' | 'y' | 'width' | 'height' | 'rotation' | 'naturalWidth' | 'naturalHeight'
  >,
  crop: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const sx = el.width / el.naturalWidth;
  const sy = el.height / el.naturalHeight;
  const dx = crop.x * sx;
  const dy = crop.y * sy;
  const rad = ((el.rotation ?? 0) * Math.PI) / 180;
  return {
    x: el.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: el.y + dx * Math.sin(rad) + dy * Math.cos(rad),
    width: crop.width * sx,
    height: crop.height * sy,
  };
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
        const { assetId, width, height, crop } = job.result;
        const current = store?.get(elementId);
        if (current?.type === 'image' && (current as ImageElement).assetId === image.assetId) {
          const el = current as ImageElement;
          actions.update(
            new Map([
              [
                elementId,
                {
                  assetId,
                  naturalWidth: width,
                  naturalHeight: height,
                  ...(crop ? croppedPlacement(el, crop) : {}),
                },
              ],
            ]),
          );
          toast.success('Фон удалён');
        } else {
          const size = crop ? croppedPlacement(image, crop) : image;
          const copy = buildImage({
            x: image.x + image.width + 24,
            y: image.y,
            width: size.width,
            height: size.height,
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
