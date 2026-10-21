'use client';

import { useEffect } from 'react';
import { reloadComments } from '@/lib/comments-api';
import type { BoardConnection } from '@/lib/yjs/board-connection';
import { useCommentsStore } from '@/stores/comments-store';

/**
 * Загрузка комментариев доски и обновление по событию WS-сервера.
 * Пачку событий (кто-то быстро ответил несколько раз) склеиваем в один запрос.
 */
export function useCommentsSync(boardId: string, connection: BoardConnection | null): void {
  useEffect(() => {
    useCommentsStore.getState().reset();
    useCommentsStore.setState({ boardId });
    void reloadComments(boardId).catch(() => undefined);
    // ?thread=… — переход из уведомления или письма
    const thread = new URLSearchParams(window.location.search).get('thread');
    if (thread) useCommentsStore.getState().openThread(thread);
    return () => useCommentsStore.getState().reset();
  }, [boardId]);

  useEffect(() => {
    if (!connection) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = connection.subscribeComments(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void reloadComments(boardId).catch(() => undefined), 150);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [boardId, connection]);
}
