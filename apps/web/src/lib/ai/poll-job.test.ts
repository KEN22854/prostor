import { describe, expect, it, vi } from 'vitest';
import type { AiJobDto } from '@prostor/shared';
import { ApiClientError } from '@/lib/fetcher';
import { pollAiJob } from './poll-job';

function job(status: AiJobDto['status'], progress: number): AiJobDto {
  return { id: 'j', type: 'REMOVE_BG', status, progress, error: null, result: null, createdAt: '' };
}

const fastSleep = async () => undefined;

describe('pollAiJob', () => {
  it('опрашивает до завершения и сообщает прогресс', async () => {
    const states = [
      job('QUEUED', 0),
      job('RUNNING', 40),
      job('RUNNING', 80),
      job('SUCCEEDED', 100),
    ];
    const onUpdate = vi.fn();
    const result = await pollAiJob('j', {
      fetchJob: async () => states.shift() ?? job('FAILED', 0),
      onUpdate,
      sleep: fastSleep,
    });
    expect(result.status).toBe('SUCCEEDED');
    expect(onUpdate.mock.calls.map(([j]) => (j as AiJobDto).progress)).toEqual([0, 40, 80, 100]);
  });

  it('переживает временные сетевые ошибки', async () => {
    let calls = 0;
    const result = await pollAiJob('j', {
      fetchJob: async () => {
        calls++;
        if (calls < 3) throw new ApiClientError(0, 'network_error', 'offline');
        return job('FAILED', 10);
      },
      sleep: fastSleep,
    });
    expect(result.status).toBe('FAILED');
    expect(calls).toBe(3);
  });

  it('404 прерывает ожидание сразу', async () => {
    await expect(
      pollAiJob('j', {
        fetchJob: async () => {
          throw new ApiClientError(404, 'not_found', 'нет');
        },
        sleep: fastSleep,
      }),
    ).rejects.toThrow('нет');
  });

  it('отмена через AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      pollAiJob('j', {
        fetchJob: async () => job('RUNNING', 1),
        signal: controller.signal,
        sleep: fastSleep,
      }),
    ).rejects.toThrow('Aborted');
  });
});
