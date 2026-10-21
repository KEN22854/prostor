import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '@prostor/db';
import {
  WEBHOOK_EVENTS,
  createWebhookSchema,
  updateWebhookSchema,
  type CreateWebhookInput,
  type CreatedWebhookDto,
  type WebhookDto,
  type WebhookEvent,
} from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { env } from '@/lib/env';
import { webhookQueue } from '@/lib/queue';
import { rateLimit } from '@/lib/rate-limit';
import { UnsafeUrlError, assertPublicUrl } from '@/lib/safe-fetch';
import type { SessionUser } from '@/lib/session';
import { audit } from '@/services/audit';
import { requireBoardAccess } from '@/services/boards';

const MAX_WEBHOOKS_PER_USER = 25;

type Row = {
  id: string;
  url: string;
  events: string[];
  boardId: string | null;
  description: string | null;
  active: boolean;
  lastStatus: number | null;
  lastError: string | null;
  lastDeliveryAt: Date | null;
  failureCount: number;
  createdAt: Date;
  board: { title: string } | null;
};

function toDto(w: Row): WebhookDto {
  const known = new Set<string>(WEBHOOK_EVENTS);
  return {
    id: w.id,
    url: w.url,
    events: w.events.filter((e): e is WebhookEvent => known.has(e)),
    boardId: w.boardId,
    boardTitle: w.board?.title ?? null,
    description: w.description,
    active: w.active,
    lastStatus: w.lastStatus,
    lastError: w.lastError,
    lastDeliveryAt: w.lastDeliveryAt?.toISOString() ?? null,
    failureCount: w.failureCount,
    createdAt: w.createdAt.toISOString(),
  };
}

const select = {
  id: true,
  url: true,
  events: true,
  boardId: true,
  description: true,
  active: true,
  lastStatus: true,
  lastError: true,
  lastDeliveryAt: true,
  failureCount: true,
  createdAt: true,
  board: { select: { title: true } },
} as const;

export async function listWebhooks(user: SessionUser): Promise<WebhookDto[]> {
  const rows = await prisma.webhook.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select,
  });
  return rows.map(toDto);
}

/** Адрес вебхука: публичный (проверка как у превью ссылок — без SSRF во внутреннюю сеть) */
async function checkUrl(url: string): Promise<void> {
  try {
    await assertPublicUrl(url);
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      throw new ApiError(422, 'unsafe_url', 'Адрес во внутренней сети или с нестандартным портом');
    }
    // Имя не разрешилось (опечатка, сервис ещё не поднят) — допускаем, доставка покажет ошибку
  }
}

export async function createWebhook(
  user: SessionUser,
  input: CreateWebhookInput,
): Promise<CreatedWebhookDto> {
  const data = createWebhookSchema.parse(input);
  if (data.boardId) await requireBoardAccess(data.boardId, user.id, 'view');
  await checkUrl(data.url);
  const count = await prisma.webhook.count({ where: { userId: user.id } });
  if (count >= MAX_WEBHOOKS_PER_USER) {
    throw new ApiError(422, 'too_many', `Не больше ${MAX_WEBHOOKS_PER_USER} вебхуков`);
  }
  const secret = `whsec_${randomBytes(24).toString('base64url')}`;
  const row = await prisma.webhook.create({
    data: {
      userId: user.id,
      url: data.url,
      events: data.events,
      boardId: data.boardId,
      description: data.description,
      secret,
    },
    select,
  });
  await audit({
    action: 'webhook.create',
    actorId: user.id,
    boardId: data.boardId,
    metadata: { url: data.url },
  });
  return { ...toDto(row), secret };
}

async function ownWebhook(user: SessionUser, id: string) {
  const row = await prisma.webhook.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!row) throw new ApiError(404, 'not_found', 'Вебхук не найден');
}

export async function updateWebhook(
  user: SessionUser,
  id: string,
  input: unknown,
): Promise<WebhookDto> {
  const data = updateWebhookSchema.parse(input);
  await ownWebhook(user, id);
  const row = await prisma.webhook.update({
    where: { id },
    // Включили снова — счётчик неудач с нуля
    data: { ...data, ...(data.active ? { failureCount: 0 } : {}) },
    select,
  });
  return toDto(row);
}

export async function deleteWebhook(user: SessionUser, id: string): Promise<void> {
  await ownWebhook(user, id);
  await prisma.webhook.delete({ where: { id } });
  await audit({ action: 'webhook.delete', actorId: user.id, metadata: { webhookId: id } });
}

/** Тестовая доставка (событие ping) — проверить адрес и подпись */
export async function pingWebhook(user: SessionUser, id: string): Promise<void> {
  await ownWebhook(user, id);
  const limit = await rateLimit(`webhook-ping:${user.id}`, 20, 10 * 60);
  if (!limit.ok) throw new ApiError(429, 'rate_limited', 'Слишком много проверок. Подождите');
  await webhookQueue().add(
    'deliver',
    {
      kind: 'deliver',
      webhookId: id,
      payload: {
        id: randomUUID(),
        event: 'ping',
        occurredAt: new Date().toISOString(),
        board: null,
        actor: { id: user.id, name: user.name },
        data: { message: 'Проверка вебхука из Простора' },
      },
    },
    { attempts: 1 },
  );
}

/**
 * Событие доски для вебхуков. Ошибка постановки в очередь не ломает основное
 * действие (комментарий сохранён, даже если Redis недоступен).
 * Подписчиков подбирает worker: проверка прав на момент доставки.
 */
export async function emitWebhookEvent(
  event: WebhookEvent,
  boardId: string,
  actorId: string | null,
  data: Record<string, unknown> = {},
): Promise<void> {
  try {
    // Без подписчиков на это событие — не нагружаем очередь
    const exists = await prisma.webhook.findFirst({
      where: { active: true, events: { has: event }, OR: [{ boardId }, { boardId: null }] },
      select: { id: true },
    });
    if (!exists) return;
    await webhookQueue().add('event', {
      kind: 'event',
      event,
      boardId,
      actorId,
      data,
      occurredAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('[webhooks] emit failed', event, error);
  }
}

/** Публичная ссылка на доску для полезной нагрузки */
export function boardUrl(boardId: string): string {
  return new URL(`/board/${boardId}`, env().APP_URL).toString();
}
