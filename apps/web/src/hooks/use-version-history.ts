'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import * as Y from 'yjs';
import type { BoardVersionDto } from '@prostor/shared';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';
import type { BoardConnection } from '@/lib/yjs/board-connection';
import { docFromState, restoreVersion } from '@/lib/yjs/restore-version';
import { useCanvasStore } from '@/stores/canvas-store';

export interface VersionPreview {
  version: BoardVersionDto;
  doc: Y.Doc;
}

async function postState(boardId: string, doc: Y.Doc, params: Record<string, string>): Promise<void> {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/boards/${boardId}/versions?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    // Копия в свежий ArrayBuffer: Blob не принимает Uint8Array<ArrayBufferLike> (TS 5.7+)
    body: new Blob([new Uint8Array(Y.encodeStateAsUpdate(doc))]),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? 'Не удалось сохранить версию');
  }
}

/**
 * Просмотр, ручное сохранение и восстановление версий.
 * В режиме просмотра холст показывает документ версии вместо живого
 * (живое соединение продолжает синхронизироваться в фоне).
 */
export function useVersionHistory(boardId: string, connection: BoardConnection | null) {
  const [preview, setPreview] = useState<VersionPreview | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const close = useCallback(() => {
    setPreview(null);
    useCanvasStore.getState().select([]);
  }, []);

  // Документ предыдущей версии освобождается при смене/закрытии просмотра
  useEffect(() => () => preview?.doc.destroy(), [preview]);

  const open = useCallback(
    async (version: BoardVersionDto) => {
      try {
        const res = await fetch(`/api/boards/${boardId}/versions/${version.id}`);
        if (!res.ok) throw new Error('Не удалось загрузить версию');
        const doc = docFromState(new Uint8Array(await res.arrayBuffer()));
        useCanvasStore.getState().select([]);
        setPreview({ version, doc });
      } catch (e: unknown) {
        toast.error(errorMessage(e, 'Не удалось загрузить версию'));
      }
    },
    [boardId],
  );

  const save = useCallback(
    async (label: string) => {
      if (!connection) return;
      try {
        await postState(boardId, connection.doc, { reason: 'MANUAL', ...(label ? { label } : {}) });
        toast.success('Версия сохранена');
        setRefreshKey((k) => k + 1);
      } catch (e: unknown) {
        toast.error(errorMessage(e, 'Не удалось сохранить версию'));
      }
    },
    [boardId, connection],
  );

  const restore = useCallback(async () => {
    if (!connection || !preview) return;
    try {
      // Сначала фиксируем текущее состояние — восстановление не должно терять историю
      await postState(boardId, connection.doc, { reason: 'PRE_RESTORE' });
      await apiRequest(`/api/boards/${boardId}/versions/${preview.version.id}/restore`, { method: 'POST' });
      connection.undoManager.stopCapturing();
      const stats = restoreVersion(connection.doc, Y.encodeStateAsUpdate(preview.doc));
      connection.undoManager.stopCapturing();
      close();
      setRefreshKey((k) => k + 1);
      toast.success('Версия восстановлена', {
        description: `Добавлено ${stats.added}, удалено ${stats.removed}, изменено ${stats.changed}. Ctrl+Z — отменить.`,
      });
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось восстановить версию'));
    }
  }, [boardId, connection, preview, close]);

  return { preview, open, close, save, restore, refreshKey };
}
