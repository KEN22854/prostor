'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { AiJobDto } from '@prostor/shared';
import { pollAiJob } from '@/lib/ai/poll-job';

/**
 * Запуск ИИ-задачи и ожидание результата: POST создаёт задачу (202),
 * затем опрос GET /api/ai/jobs/:id до завершения. При размонтировании
 * (ушли с доски) опрос прекращается; сама задача на сервере доработает.
 */
export function useAiJob() {
  const controllers = useRef(new Set<AbortController>());

  useEffect(() => {
    const active = controllers.current;
    return () => {
      for (const c of active) c.abort();
      active.clear();
    };
  }, []);

  return useCallback(
    async (
      start: () => Promise<AiJobDto>,
      onUpdate: (job: AiJobDto) => void,
    ): Promise<AiJobDto> => {
      const controller = new AbortController();
      controllers.current.add(controller);
      try {
        const created = await start();
        onUpdate(created);
        return await pollAiJob(created.id, { signal: controller.signal, onUpdate });
      } finally {
        controllers.current.delete(controller);
      }
    },
    [],
  );
}
