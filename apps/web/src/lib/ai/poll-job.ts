import { TERMINAL_AI_STATUSES, type AiJobDto } from '@prostor/shared';
import { ApiClientError, apiRequest } from '@/lib/fetcher';

export interface PollOptions {
  onUpdate?: (job: AiJobDto) => void;
  signal?: AbortSignal;
  /** Подмена запроса в тестах */
  fetchJob?: (id: string, signal?: AbortSignal) => Promise<AiJobDto>;
  /** Сколько ждать завершения в целом (по умолчанию 10 минут) */
  timeoutMs?: number;
  /** Пауза между запросами: быстрые первые секунды, затем реже */
  interval?: (attempt: number) => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const defaultInterval = (attempt: number) => (attempt < 10 ? 800 : attempt < 40 ? 1_500 : 3_000);

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

const defaultFetch = (id: string, signal?: AbortSignal) =>
  apiRequest<AiJobDto>(`/api/ai/jobs/${id}`, { signal });

/**
 * Опрос статуса ИИ-задачи до завершения (polling).
 * Временные сетевые ошибки не прерывают ожидание — пользователь мог
 * на секунду потерять Wi-Fi, а задача продолжает выполняться на сервере.
 */
export async function pollAiJob(id: string, opts: PollOptions = {}): Promise<AiJobDto> {
  const fetchJob = opts.fetchJob ?? defaultFetch;
  const interval = opts.interval ?? defaultInterval;
  const sleep = opts.sleep ?? defaultSleep;
  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
  let networkErrors = 0;

  for (let attempt = 0; ; attempt++) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const job = await fetchJob(id, opts.signal);
      networkErrors = 0;
      opts.onUpdate?.(job);
      if (TERMINAL_AI_STATUSES.has(job.status)) return job;
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      // 4xx (кроме 429) — задача недоступна, ждать бессмысленно
      if (
        error instanceof ApiClientError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      )
        throw error;
      if (++networkErrors > 20) throw error;
    }
    if (Date.now() > deadline)
      throw new ApiClientError(408, 'timeout', 'Задача выполняется слишком долго');
    await sleep(interval(attempt), opts.signal);
  }
}
