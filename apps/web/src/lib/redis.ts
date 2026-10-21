import 'server-only';
import { Redis } from 'ioredis';
import { env } from '@/lib/env';

/**
 * Синглтон ioredis для web (rate-limit, публикация событий в WS).
 * Кешируется на globalThis по той же причине, что и Prisma: HMR в dev.
 */
const globalForRedis = globalThis as unknown as { __redis?: Redis };

export function redis(): Redis {
  if (!globalForRedis.__redis) {
    globalForRedis.__redis = new Redis(env().REDIS_URL, {
      // Быстрый отказ вместо бесконечной очереди команд, если Redis недоступен:
      // rate-limit должен деградировать, а не вешать логин.
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    globalForRedis.__redis.on('error', (error: Error) => {
      console.error('[redis]', error.message);
    });
  }
  return globalForRedis.__redis;
}

/**
 * Клиент, дождавшийся подключения (не дольше timeoutMs). Сразу после старта
 * сервера первые команды приходили до установки соединения и при выключенной
 * очереди падали с «Stream isn't writeable» — например, на первом входе.
 */
export async function readyRedis(timeoutMs = 2_000): Promise<Redis> {
  const client = redis();
  if (client.status === 'ready') return client;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(timer);
      client.off('ready', done);
      resolve();
    }
    client.once('ready', done);
  });
  return client;
}
