import { z } from 'zod';

function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  WORKER_CONCURRENCY_AI: z.coerce.number().int().min(1).max(32).default(2),
  WORKER_CONCURRENCY_DEFAULT: z.coerce.number().int().min(1).max(64).default(4),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  AI_PROVIDER_REMOVE_BG: z.enum(['local', 'replicate', 'disabled']).default('local'),
  AI_PROVIDER_IMAGE: z.enum(['replicate', 'mock', 'disabled']).default('disabled'),
  REMBG_URL: optional(z.string().url()),
  /** Модель rembg: u2net (универсальная), isnet-general-use (точнее), u2net_human_seg (люди) */
  REMBG_MODEL: z.string().default('isnet-general-use'),
  REPLICATE_API_TOKEN: optional(z.string().min(1)),
  /** owner/name для официальных моделей или owner/name:version для пользовательских */
  REPLICATE_MODEL_REMOVE_BG: z.string().default('men1scus/birefnet'),
  REPLICATE_MODEL_IMAGE: z.string().default('black-forest-labs/flux-schnell'),
  /** Таймаут одного обращения к провайдеру, мс */
  AI_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(5_000).default(180_000),

  /** Письма-уведомления (упоминания, ответы). Без SMTP_URL письма не отправляются */
  SMTP_URL: optional(z.string().min(1)),
  EMAIL_FROM: z.string().default('Простор <no-reply@prostor.local>'),
  /** Публичный адрес web — для ссылок в письмах */
  APP_URL: z.string().url().default('http://localhost:3000'),
});

export type WorkerEnv = z.infer<typeof envSchema>;

export function loadEnv(): WorkerEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Некорректные переменные окружения worker:\n${issues}`);
  }
  return parsed.data;
}
