'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import type { UploadedAsset } from '@prostor/shared';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { buildImage, nextZIndex } from '@/lib/canvas/element-factory';
import type { Point } from '@/lib/canvas/viewport';
import { apiRequest } from '@/lib/fetcher';
import { useT } from '@/lib/i18n/client';
import { attributionOf, type FeedImage } from '@/lib/image-feed';
import { errorMessage } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';

/** MIME перетаскивания картинки из ленты на холст */
export const FEED_DRAG_TYPE = 'application/x-prostor-feed-image';

/** Наибольшая сторона картинки на доске при вставке из ленты */
const FEED_IMAGE_SIZE = 420;

interface FeedInsertDeps {
  boardId: string;
  doc: Y.Doc | null;
  actions: BoardActions | null;
  userId: string | null;
}

/** Картинка из ленты на доску: сервер скачивает её и сохраняет ассетом доски */
export function useFeedInsert({ boardId, doc, actions, userId }: FeedInsertDeps) {
  const t = useT();
  return useCallback(
    async (img: FeedImage, at: Point) => {
      if (!doc || !actions?.canEdit || !userId) return;
      const toastId = toast.loading(t('Добавляем картинку…'));
      try {
        const asset = await apiRequest<UploadedAsset>(`/api/boards/${boardId}/images`, {
          method: 'POST',
          body: { url: img.full },
        });
        const k = Math.min(1, FEED_IMAGE_SIZE / Math.max(asset.width, asset.height));
        const width = Math.round(asset.width * k);
        const height = Math.round(asset.height * k);
        const el = buildImage({
          x: at.x - width / 2,
          y: at.y - height / 2,
          width,
          height,
          naturalWidth: asset.width,
          naturalHeight: asset.height,
          assetId: asset.id,
          alt: img.title,
          userId,
          zIndex: nextZIndex(doc),
        });
        useCanvasStore
          .getState()
          .select(actions.create([{ ...el, attribution: attributionOf(img) }]));
        toast.dismiss(toastId);
      } catch (error: unknown) {
        toast.error(errorMessage(error, t('Не удалось добавить картинку')), { id: toastId });
      }
    },
    [boardId, doc, actions, userId, t],
  );
}
