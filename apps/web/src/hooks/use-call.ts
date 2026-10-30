'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import { CallManager } from '@/lib/rtc/call-manager';
import type { BoardConnection } from '@/lib/yjs/board-connection';

const noop = () => () => undefined;
const zero = () => 0;

/** Созвон доски: менеджер появляется, когда есть соединение и awareness */
export function useCall(connection: BoardConnection | null, awareness: Awareness | null) {
  const [manager, setManager] = useState<CallManager | null>(null);

  useEffect(() => {
    if (!connection || !awareness) return;
    let cancelled = false;
    let created: CallManager | null = null;
    void fetch('/api/rtc/config')
      .then((r) => r.json() as Promise<{ iceServers: RTCIceServer[] }>)
      .catch(() => ({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }))
      .then(({ iceServers }) => {
        if (cancelled) return;
        created = new CallManager(
          {
            clientId: connection.doc.clientID,
            awareness,
            send: (to, payload) => connection.sendSignal(to, payload),
            subscribe: connection.subscribeSignals,
          },
          iceServers,
        );
        setManager(created);
      });
    return () => {
      cancelled = true;
      created?.destroy();
      setManager(null);
    };
  }, [connection, awareness]);

  // Перерисовка при любом изменении созвона (участники, дорожки, кнопки)
  useSyncExternalStore(manager?.subscribe ?? noop, manager?.getVersion ?? zero, zero);
  return manager;
}
