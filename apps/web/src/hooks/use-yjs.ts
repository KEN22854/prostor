'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { DEFAULT_POLICY } from '@prostor/shared';
import { BoardConnection, type ConnectionState } from '@/lib/yjs/board-connection';

const INITIAL: ConnectionState = {
  status: 'connecting',
  localReady: false,
  hasPendingChanges: false,
  role: null,
  policy: DEFAULT_POLICY,
  user: null,
  error: null,
  lastSnapshotAt: null,
};

const noopSubscribe = () => () => undefined;
const getInitial = () => INITIAL;

export interface UseYjsResult extends ConnectionState {
  /** null до монтирования (SSR и первый рендер) */
  connection: BoardConnection | null;
}

/**
 * Подключение к совместному документу доски.
 *
 * Соединение создаётся в эффекте (только в браузере): IndexedDB и WebSocket
 * недоступны при SSR. В React StrictMode эффект выполняется дважды —
 * BoardConnection.destroy() полностью освобождает ресурсы, поэтому
 * лишнее соединение корректно закрывается.
 */
export function useYjs(boardId: string): UseYjsResult {
  const [connection, setConnection] = useState<BoardConnection | null>(null);

  useEffect(() => {
    const conn = new BoardConnection(boardId);
    setConnection(conn);
    return () => {
      conn.destroy();
      setConnection(null);
    };
  }, [boardId]);

  const state = useSyncExternalStore(
    connection?.subscribe ?? noopSubscribe,
    connection?.getState ?? getInitial,
    getInitial,
  );

  return { ...state, connection };
}
