import 'server-only';
import type { AiCapabilities } from '@prostor/shared';
import { env } from '@/lib/env';

/**
 * Включённые ИИ-функции по настройкам провайдеров. UI прячет недоступные
 * кнопки, API отвечает 503 — без «тихих» падений задач в worker.
 */
export function aiCapabilities(): AiCapabilities {
  const e = env();
  const removeBg =
    (e.AI_PROVIDER_REMOVE_BG === 'local' && Boolean(e.REMBG_URL)) ||
    (e.AI_PROVIDER_REMOVE_BG === 'replicate' && Boolean(e.REPLICATE_API_TOKEN));
  const generateImage =
    e.AI_PROVIDER_IMAGE === 'mock' ||
    e.AI_PROVIDER_IMAGE === 'pollinations' ||
    (e.AI_PROVIDER_IMAGE === 'replicate' && Boolean(e.REPLICATE_API_TOKEN));
  return { removeBg, generateImage };
}
