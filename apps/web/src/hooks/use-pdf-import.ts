'use client';

import { generateNKeysBetween } from 'fractional-indexing';
import { useCallback } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { Y_KEYS } from '@prostor/shared';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { maxZIndex } from '@/lib/canvas/element-factory';
import { boundsOf } from '@/lib/canvas/read-element';
import { fitBounds, type Point } from '@/lib/canvas/viewport';
import { MAX_PDF_PAGES, layoutPdfPages, rasterizePdf } from '@/lib/import/pdf-import';
import { errorMessage } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';

interface PdfImportDeps {
  boardId: string;
  doc: Y.Doc | null;
  actions: BoardActions | null;
  userId: string | null;
}

/** Импорт PDF: прогресс в уведомлении, страницы — фреймами, один шаг отмены */
export function usePdfImport({ boardId, doc, actions, userId }: PdfImportDeps) {
  return useCallback(
    async (file: File, at: Point) => {
      if (!doc || !actions?.canEdit || !userId) return;
      const toastId = toast.loading(`Импорт «${file.name}»…`);
      try {
        const pages = await rasterizePdf(file, boardId, (done, total) =>
          toast.loading(
            `Импорт «${file.name}»: страница ${Math.min(done + 1, total)} из ${total}`,
            { id: toastId },
          ),
        );
        if (pages.length === 0) throw new Error('В PDF нет страниц');
        // По два элемента на страницу (фрейм и картинка) — ключи порядка поверх всех объектов
        const keys = generateNKeysBetween(
          maxZIndex(doc.getMap(Y_KEYS.elements)),
          null,
          pages.length * 2,
        );
        let k = 0;
        const elements = layoutPdfPages(pages, {
          at,
          name: file.name.replace(/\.pdf$/i, ''),
          userId,
          nextZ: () => keys[k++] ?? 'a0',
        });
        const created = actions.create(elements);
        const { size, setCamera, select } = useCanvasStore.getState();
        const frames = elements.filter((e) => e.type === 'frame');
        const bounds = frames.map(boundsOf).reduce((a, b) => ({
          minX: Math.min(a.minX, b.minX),
          minY: Math.min(a.minY, b.minY),
          maxX: Math.max(a.maxX, b.maxX),
          maxY: Math.max(a.maxY, b.maxY),
        }));
        setCamera(fitBounds(bounds, size, 80, 1));
        select(frames.map((f) => f.id));
        toast.success(`Импортировано страниц: ${created.length / 2}`, {
          id: toastId,
          description:
            pages.length === MAX_PDF_PAGES ? `Показаны первые ${MAX_PDF_PAGES} страниц` : undefined,
        });
      } catch (e: unknown) {
        toast.error(errorMessage(e, 'Не удалось импортировать PDF'), { id: toastId });
      }
    },
    [boardId, doc, actions, userId],
  );
}
