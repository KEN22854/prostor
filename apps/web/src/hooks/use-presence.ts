'use client';

import { useEffect, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';

export interface PresenceUser {
  id: string;
  name: string;
  color: string;
  /** Пользователь открыл доску в нескольких вкладках — показываем один раз */
  connections: number;
  isSelf: boolean;
}

function readUser(state: unknown): { id: string; name: string; color: string } | null {
  if (typeof state !== 'object' || state === null) return null;
  const user = (state as { user?: unknown }).user;
  if (typeof user !== 'object' || user === null) return null;
  const { id, name, color } = user as Record<string, unknown>;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof color !== 'string') return null;
  return { id, name, color };
}

/**
 * Список присутствующих на доске (по awareness).
 * Подписка на 'change', а не на 'update': 'update' срабатывает на каждое
 * движение курсора (десятки раз в секунду), а список людей меняется редко.
 */
export function usePresence(awareness: Awareness | null): PresenceUser[] {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!awareness) {
      setUsers([]);
      return;
    }
    const compute = () => {
      const selfId = readUser(awareness.getLocalState())?.id;
      const byId = new Map<string, PresenceUser>();
      for (const state of awareness.getStates().values()) {
        const user = readUser(state);
        if (!user) continue;
        const existing = byId.get(user.id);
        if (existing) existing.connections++;
        else byId.set(user.id, { ...user, connections: 1, isSelf: user.id === selfId });
      }
      // Сначала я, затем остальные по имени — стабильный порядок аватаров
      const list = Array.from(byId.values()).sort((a, b) =>
        a.isSelf === b.isSelf ? a.name.localeCompare(b.name, 'ru') : a.isSelf ? -1 : 1,
      );
      setUsers((prev) =>
        prev.length === list.length &&
        prev.every((p, i) => p.id === list[i]?.id && p.connections === list[i]?.connections)
          ? prev
          : list,
      );
    };
    compute();
    awareness.on('change', compute);
    return () => awareness.off('change', compute);
  }, [awareness]);

  return users;
}
