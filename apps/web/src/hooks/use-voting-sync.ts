'use client';

import { useEffect, useRef } from 'react';
import type { BoardConnection } from '@/lib/yjs/board-connection';
import { useCanvasStore } from '@/stores/canvas-store';
import { reloadVoting, useVotingStore } from '@/stores/voting-store';

/**
 * Голосование: загрузка, обновление по событию WS и переключение инструмента —
 * началось голосование, у кого есть право голоса, тот сразу в режиме «голос»;
 * закончилось — обратно к выделению.
 */
export function useVotingSync(boardId: string, connection: BoardConnection | null): void {
  const switchedFor = useRef<string | null>(null);

  useEffect(() => {
    useVotingStore.getState().reset();
    useVotingStore.setState({ boardId });
    void reloadVoting(boardId).catch(() => undefined);
    return () => useVotingStore.getState().reset();
  }, [boardId]);

  useEffect(() => {
    if (!connection) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = connection.subscribeVoting(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void reloadVoting(boardId).catch(() => undefined), 150);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [boardId, connection]);

  useEffect(
    () =>
      useVotingStore.subscribe((s) => {
        const canvas = useCanvasStore.getState();
        const v = s.voting;
        if (v?.status === 'active' && v.canVote && switchedFor.current !== v.id) {
          switchedFor.current = v.id;
          canvas.setTool('vote');
        } else if ((!v || v.status !== 'active') && canvas.tool === 'vote') {
          canvas.setTool('select');
        }
      }),
    [],
  );
}
