'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SharingStateDto } from '@prostor/shared';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';

/** Участники, приглашения и видимость доски; refresh() после каждого изменения */
export function useSharingState(boardId: string, enabled = true) {
  const [state, setState] = useState<SharingStateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setState(await apiRequest<SharingStateDto>(`/api/boards/${boardId}/sharing`));
      setError(null);
    } catch (e: unknown) {
      setError(errorMessage(e, 'Не удалось загрузить участников'));
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  return { state, error, loading, refresh };
}
