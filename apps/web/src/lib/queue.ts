import 'server-only';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  QUEUES,
  type AiQueuePayload,
  type EmailQueuePayload,
  type WebhookQueuePayload,
} from '@prostor/shared';
import { env } from '@/lib/env';

/**
 * Очередь ИИ-задач (продюсер). Отдельное соединение с Redis: у BullMQ свои
 * требования к настройкам (maxRetriesPerRequest: null), а общий клиент web
 * намеренно быстро отказывает при недоступности Redis (rate-limit).
 */
const globalForQueue = globalThis as unknown as { __aiQueue?: Queue<AiQueuePayload> };

export function aiQueue(): Queue<AiQueuePayload> {
  if (!globalForQueue.__aiQueue) {
    const connection = new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });
    connection.on('error', (error: Error) => console.error('[queue]', error.message));
    globalForQueue.__aiQueue = new Queue<AiQueuePayload>(QUEUES.ai, {
      connection,
      defaultJobOptions: {
        // Сбой сети до провайдера — повторяем; ошибки валидации worker помечает как окончательные
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 24 * 3600, count: 1_000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }
  return globalForQueue.__aiQueue;
}

const globalForEmail = globalThis as unknown as { __emailQueue?: Queue<EmailQueuePayload> };

/** Очередь писем-уведомлений (упоминания, ответы); отправляет worker */
export function emailQueue(): Queue<EmailQueuePayload> {
  if (!globalForEmail.__emailQueue) {
    const connection = new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });
    connection.on('error', (error: Error) => console.error('[queue]', error.message));
    globalForEmail.__emailQueue = new Queue<EmailQueuePayload>(QUEUES.email, {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 24 * 3600, count: 5_000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }
  return globalForEmail.__emailQueue;
}

const globalForWebhooks = globalThis as unknown as {
  __webhookQueue?: Queue<WebhookQueuePayload>;
};

/** Очередь вебхуков: события досок (worker рассылает подписчикам и доставляет с повторами) */
export function webhookQueue(): Queue<WebhookQueuePayload> {
  if (!globalForWebhooks.__webhookQueue) {
    const connection = new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });
    connection.on('error', (error: Error) => console.error('[queue]', error.message));
    globalForWebhooks.__webhookQueue = new Queue<WebhookQueuePayload>(QUEUES.webhooks, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 24 * 3600, count: 5_000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }
  return globalForWebhooks.__webhookQueue;
}
