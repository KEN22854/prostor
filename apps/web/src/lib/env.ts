import 'server-only';
import { z } from 'zod';
import { NOTIFICATION_EMAIL_DELAY_MS } from '@prostor/shared';

// Серверные переменные окружения, провалидированные zod.
// Парсятся лениво (при первом обращении), чтобы `next build` не падал
// без секретов — они нужны только в рантайме.

/**
 * Пустая строка в .env (`AUTH_GOOGLE_ID=`) означает «не задано»,
 * а не «задано пустым» — иначе отключённый провайдер ломал бы валидацию.
 */
function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
}

const optionalSecret = optional(z.string().min(1));

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url(),
  DEPLOYMENT_MODE: z.enum(['saas', 'onprem']).default('saas'),
  /** false — регистрация только по приглашениям (типично для on-prem) */
  ALLOW_SIGNUP: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  AUTH_SECRET: z.string().min(32),
  AUTH_ENCRYPTION_KEY: z.string().length(64, 'hex, 32 байта'),
  WS_JWT_SECRET: z.string().min(32),
  // Публичный адрес WS-сервера отдаётся клиенту в рантайме (через API ws-token),
  // а не NEXT_PUBLIC_* — иначе адрес «запекается» в образ и on-prem требует пересборки.
  WS_PUBLIC_URL: z.string().url(),

  AUTH_GOOGLE_ID: optionalSecret,
  AUTH_GOOGLE_SECRET: optionalSecret,
  AUTH_GITHUB_ID: optionalSecret,
  AUTH_GITHUB_SECRET: optionalSecret,
  AUTH_YANDEX_ID: optionalSecret,
  AUTH_YANDEX_SECRET: optionalSecret,
  AUTH_VK_ID: optionalSecret,
  AUTH_VK_SECRET: optionalSecret,
  /** Корпоративный SSO по OpenID Connect (Keycloak, ADFS, Azure AD, Okta, Блиц…) */
  AUTH_OIDC_ISSUER: optional(z.string().url()),
  AUTH_OIDC_ID: optionalSecret,
  AUTH_OIDC_SECRET: optionalSecret,
  AUTH_OIDC_NAME: z.string().max(60).default('Корпоративный вход (SSO)'),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  // Адрес S3, доступный из браузера (для presigned URL). В Docker S3_ENDPOINT
  // указывает на внутренний хост minio:9000, недоступный снаружи.
  S3_PUBLIC_ENDPOINT: z.string().url(),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  SMTP_URL: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
  /**
   * Множитель всех лимитов частоты запросов. 1 — боевые значения; e2e-стенд
   * поднимает его, потому что тесты регистрируют и логинят десятки пользователей с одного IP.
   */
  RATE_LIMIT_MULTIPLIER: z.coerce.number().min(1).max(1000).default(1),
  /** Через сколько слать письмо о непрочитанном упоминании/ответе (мс) */
  NOTIFICATION_EMAIL_DELAY_MS: z.coerce.number().int().min(0).max(24 * 3600_000).default(NOTIFICATION_EMAIL_DELAY_MS),

  /** local — контейнер rembg; replicate — облако; disabled — функция скрыта */
  AI_PROVIDER_REMOVE_BG: z.enum(['local', 'replicate', 'disabled']).default('local'),
  /** replicate — Flux/SDXL; mock — локальная заглушка-градиент (dev, e2e, демо без ИИ); disabled */
  AI_PROVIDER_IMAGE: z.enum(['replicate', 'mock', 'disabled']).default('disabled'),
  REMBG_URL: optional(z.string().url()),
  REPLICATE_API_TOKEN: optionalSecret,
  OPENAI_API_KEY: optionalSecret,
  LLM_BASE_URL: optional(z.string().url()),
  LLM_MODEL: optional(z.string()),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Некорректные переменные окружения:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
