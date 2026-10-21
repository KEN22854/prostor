import 'server-only';
import { env } from '@/lib/env';
import { readyRedis } from '@/lib/redis';

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Через сколько секунд окно сбросится */
  retryAfter: number;
}

/**
 * Fixed-window rate limit в Redis (INCR + PEXPIRE в одной транзакции).
 * Для защиты логина/регистрации от перебора этого достаточно;
 * sliding window здесь избыточен.
 *
 * Если Redis недоступен — пропускаем запрос (fail-open) и пишем в лог:
 * падение Redis не должно блокировать вход всем пользователям.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const redisKey = `rl:${key}`;
  limit = Math.ceil(limit * env().RATE_LIMIT_MULTIPLIER);
  try {
    const result = await (
      await readyRedis()
    )
      .multi()
      .incr(redisKey)
      .pexpire(redisKey, windowSec * 1000, 'NX')
      .pttl(redisKey)
      .exec();
    const count = Number(result?.[0]?.[1] ?? 0);
    const ttlMs = Number(result?.[2]?.[1] ?? windowSec * 1000);
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfter: Math.max(1, Math.ceil(ttlMs / 1000)),
    };
  } catch (error: unknown) {
    console.error('[rate-limit] redis unavailable, failing open', error);
    return { ok: true, remaining: limit, retryAfter: 0 };
  }
}

/** IP клиента из заголовков прокси (первый адрес в X-Forwarded-For) */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return headers.get('x-real-ip') ?? 'unknown';
}
