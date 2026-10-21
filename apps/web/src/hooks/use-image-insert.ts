'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { buildImage, nextZIndex } from '@/lib/canvas/element-factory';
import { displaySize, isSupportedImage, uploadImage } from '@/lib/canvas/image-upload';
import type { Point } from '@/lib/canvas/viewport';
import { errorMessage } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';

interface ImageInsertDeps {
  boardId: string;
  doc: Y.Doc | null;
  actions: BoardActions | null;
  userId: string | null;
}

/**
 * Загрузка изображений и их размещение на доске (кнопка, drag&drop, Ctrl+V).
 * Несколько файлов раскладываются «лесенкой» от точки вставки.
 */
export function useImageInsert({ boardId, doc, actions, userId }: ImageInsertDeps) {
  return useCallback(
    async (files: readonly File[], at: Point) => {
      if (!doc || !actions?.canEdit || !userId) return;
      const images = files.filter(isSupportedImage);
      if (images.length === 0) {
        toast.error('Поддерживаются PNG, JPEG, WebP, GIF и SVG');
        return;
      }
      const toastId = toast.loading(
        images.length > 1 ? `Загружаем ${images.length} изображения…` : 'Загружаем изображение…',
      );
      const created: string[] = [];
      let failed = 0;
      for (const [i, file] of images.entries()) {
        try {
          const asset = await uploadImage(boardId, file);
          const size = displaySize(asset.width, asset.height);
          const el = buildImage({
            x: at.x - size.width / 2 + i * 32,
            y: at.y - size.height / 2 + i * 32,
            width: size.width,
            height: size.height,
            naturalWidth: asset.width,
            naturalHeight: asset.height,
            assetId: asset.id,
            alt: file.name,
            userId,
            zIndex: nextZIndex(doc),
          });
          created.push(...actions.create([el]));
        } catch (error: unknown) {
          failed++;
          toast.error(errorMessage(error, `Не удалось загрузить «${file.name}»`));
        }
      }
      if (created.length > 0) {
        toast.success(
          created.length > 1 ? `Добавлено изображений: ${created.length}` : 'Изображение добавлено',
          { id: toastId },
        );
        useCanvasStore.getState().select(created);
      } else {
        toast.dismiss(toastId);
      }
      if (failed === 0 && useCanvasStore.getState().tool === 'image')
        useCanvasStore.getState().setTool('select');
    },
    [boardId, doc, actions, userId],
  );
}
