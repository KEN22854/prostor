'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import type { EmbedPreview } from '@prostor/shared';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { buildEmbed, nextZIndex } from '@/lib/canvas/element-factory';
import type { Point } from '@/lib/canvas/viewport';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';

interface EmbedInsertDeps {
  boardId: string;
  doc: Y.Doc | null;
  actions: BoardActions | null;
  userId: string | null;
}

/** Ссылка → карточка на доске (превью собирает сервер), центр карточки — в точке at */
export function useEmbedInsert({ boardId, doc, actions, userId }: EmbedInsertDeps) {
  return useCallback(
    async (url: string, at: Point) => {
      if (!doc || !actions?.canEdit || !userId) return;
      const toastId = toast.loading('Загружаем превью ссылки…');
      try {
        const preview = await apiRequest<EmbedPreview>(`/api/boards/${boardId}/embeds`, {
          method: 'POST',
          body: { url },
        });
        const draft = buildEmbed({ x: 0, y: 0, userId, zIndex: nextZIndex(doc), preview });
        const el = { ...draft, x: at.x - draft.width / 2, y: at.y - draft.height / 2 };
        const ids = actions.create([el]);
        useCanvasStore.getState().select(ids);
        toast.dismiss(toastId);
      } catch (error: unknown) {
        toast.error(errorMessage(error, 'Не удалось добавить ссылку'), { id: toastId });
      }
    },
    [boardId, doc, actions, userId],
  );
}
