import 'server-only';
import { REDIS_CHANNELS, type ControlEvent } from '@prostor/shared';
import { redis } from '@/lib/redis';

/**
 * Управляющее событие для WS-серверов (смена роли, удаление доски).
 * Ошибка публикации не критична: WS-сервер всё равно перепроверит права
 * при следующем подключении клиента.
 */
export async function publishControl(event: ControlEvent): Promise<void> {
  try {
    await redis().publish(REDIS_CHANNELS.control, JSON.stringify(event));
  } catch (error: unknown) {
    console.error('[realtime] failed to publish control event', event.type, error);
  }
}
