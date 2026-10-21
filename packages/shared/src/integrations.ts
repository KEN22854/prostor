import { z } from 'zod';

/**
 * Интеграции: публичный REST API (персональные ключи) и вебхуки.
 *
 * API: Authorization: Bearer pst_… — ключ действует от имени владельца,
 * с его правами на доски; scope read — чтение, write — создание.
 * Вебхуки: POST JSON на адрес пользователя при событиях досок, заголовки
 * X-Prostor-Event / X-Prostor-Delivery / X-Prostor-Signature (sha256=HMAC тела).
 */

export const API_KEY_PREFIX = 'pst_';
export const API_SCOPES = ['read', 'write'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const WEBHOOK_EVENTS = [
  'board.created',
  'board.updated',
  'board.deleted',
  'element.created',
  'comment.created',
  'comment.resolved',
  'voting.closed',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  'board.created': 'Создана доска',
  'board.updated': 'Доска изменена (не чаще раза в несколько минут)',
  'board.deleted': 'Доска удалена',
  'element.created': 'Объекты добавлены через API',
  'comment.created': 'Новый комментарий',
  'comment.resolved': 'Обсуждение решено',
  'voting.closed': 'Голосование завершено',
};

/** Сколько неудачных доставок подряд выключают вебхук */
export const WEBHOOK_MAX_FAILURES = 15;
export const WEBHOOK_SIGNATURE_HEADER = 'X-Prostor-Signature';

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1, 'Назовите ключ').max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1).max(2).default(['read']),
  /** null — бессрочный */
  expiresInDays: z.number().int().min(1).max(365).nullable().default(null),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export interface ApiKeyDto {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

/** Ответ создания: сам ключ показывается один раз */
export interface CreatedApiKeyDto extends ApiKeyDto {
  key: string;
}

export const createWebhookSchema = z.object({
  url: z
    .string()
    .trim()
    .url('Нужен адрес вида https://…')
    .max(2048)
    .refine((u) => /^https?:\/\//i.test(u), 'Нужен адрес http:// или https://'),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'Выберите хотя бы одно событие'),
  boardId: z.string().max(64).nullable().default(null),
  description: z.string().trim().max(200).nullable().default(null),
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  active: z.boolean().optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
});

export interface WebhookDto {
  id: string;
  url: string;
  events: WebhookEvent[];
  boardId: string | null;
  boardTitle: string | null;
  description: string | null;
  active: boolean;
  lastStatus: number | null;
  lastError: string | null;
  lastDeliveryAt: string | null;
  failureCount: number;
  createdAt: string;
}

export interface CreatedWebhookDto extends WebhookDto {
  /** Секрет подписи — показывается один раз */
  secret: string;
}

/** Тело доставки вебхука */
export interface WebhookPayload {
  id: string;
  event: WebhookEvent | 'ping';
  occurredAt: string;
  board: { id: string; title: string; url: string } | null;
  actor: { id: string; name: string | null } | null;
  data: Record<string, unknown>;
}

/** Задачи очереди вебхуков: событие (разослать подписчикам) и одна доставка */
export type WebhookQueuePayload =
  | {
      kind: 'event';
      event: WebhookEvent;
      boardId: string;
      actorId: string | null;
      data: Record<string, unknown>;
      occurredAt: string;
    }
  | { kind: 'deliver'; webhookId: string; payload: WebhookPayload };

// ─────────────────────────── REST API v1 ───────────────────────────

export const apiCreateBoardSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

/** Упрощённый объект для API: остальные поля заполняет сервер */
export const apiElementInputSchema = z.object({
  type: z.enum(['sticky', 'text', 'shape']),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().finite().positive().max(10_000).optional(),
  height: z.number().finite().positive().max(10_000).optional(),
  text: z.string().max(10_000).default(''),
  /** Цвет стикера/заливки фигуры/текста, #rrggbb */
  color: z
    .string()
    .regex(/^#[\da-f]{6}$/i)
    .optional(),
  shape: z.enum(['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'star']).optional(),
});

export const apiCreateElementsSchema = z.object({
  elements: z.array(apiElementInputSchema).min(1).max(500),
});
export type ApiElementInput = z.infer<typeof apiElementInputSchema>;
