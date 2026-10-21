import { z } from 'zod';
import { SNAPSHOT } from '@prostor/shared';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WS_PORT: z.coerce.number().int().positive().default(1234),
  WS_HOST: z.string().default('0.0.0.0'),
  WS_JWT_SECRET: z.string().min(32),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  /** Разрешённые Origin для upgrade (через запятую). Пусто — любые (только dev). */
  WS_ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  /** Уникальное имя инстанса — чтобы игнорировать свои же сообщения в Redis Pub/Sub */
  WS_INSTANCE_ID: z.string().default(() => `ws-${process.pid}-${Date.now().toString(36)}`),
  /** Debounce записи актуального состояния в BoardDocument */
  WS_PERSIST_DEBOUNCE_MS: z.coerce.number().int().min(100).default(2_000),
  WS_PERSIST_MAX_WAIT_MS: z.coerce.number().int().min(1_000).default(10_000),
  /** Debounce снапшота истории версий (BoardSnapshot) */
  WS_SNAPSHOT_DEBOUNCE_MS: z.coerce.number().int().min(1_000).default(SNAPSHOT.debounceMs),
  WS_SNAPSHOT_MAX_WAIT_MS: z.coerce.number().int().min(1_000).default(SNAPSHOT.maxWaitMs),
  /** Сколько держать комнату в памяти после ухода последнего клиента (быстрый reload) */
  WS_ROOM_GRACE_MS: z.coerce.number().int().min(0).default(10_000),
});

export type WsEnv = z.infer<typeof envSchema>;

export function loadEnv(): WsEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Некорректные переменные окружения ws-server:\n${issues}`);
  }
  return parsed.data;
}
