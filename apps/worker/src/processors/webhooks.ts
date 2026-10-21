import { createHmac, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { UnrecoverableError, type Job, type Queue } from 'bullmq';
import { resolveBoardAccess, type PrismaClient } from '@prostor/db';
import {
  WEBHOOK_MAX_FAILURES,
  WEBHOOK_SIGNATURE_HEADER,
  isInternalHostname,
  isPrivateIp,
  type WebhookPayload,
  type WebhookQueuePayload,
} from '@prostor/shared';

export interface WebhookDeps {
  prisma: PrismaClient;
  queue: Pick<Queue<WebhookQueuePayload>, 'addBulk'>;
  appUrl: string;
  /** Подмена fetch и DNS в тестах */
  fetch?: typeof fetch;
  resolve?: (host: string) => Promise<string[]>;
}

const DELIVERY_TIMEOUT_MS = 10_000;
export const DELIVERY_ATTEMPTS = 5;

/** Подпись тела: sha256=<hex HMAC-SHA256(secret, body)> — как у GitHub */
export function signBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export async function processWebhookJob(
  job: Job<WebhookQueuePayload>,
  deps: WebhookDeps,
): Promise<unknown> {
  const data = job.data;
  if (data.kind === 'event') return fanOut(data, deps);
  return deliver(data.webhookId, data.payload, job, deps);
}

/** Событие → доставка каждому подписчику, у которого есть доступ к доске */
async function fanOut(
  event: Extract<WebhookQueuePayload, { kind: 'event' }>,
  deps: WebhookDeps,
): Promise<{ deliveries: number }> {
  const hooks = await deps.prisma.webhook.findMany({
    where: {
      active: true,
      events: { has: event.event },
      OR: [{ boardId: event.boardId }, { boardId: null }],
    },
    select: { id: true, userId: true },
  });
  if (hooks.length === 0) return { deliveries: 0 };

  const [board, actor] = await Promise.all([
    deps.prisma.board.findUnique({
      where: { id: event.boardId },
      select: { id: true, title: true },
    }),
    event.actorId
      ? deps.prisma.user.findUnique({
          where: { id: event.actorId },
          select: { id: true, name: true },
        })
      : null,
  ]);

  const allowed: string[] = [];
  for (const hook of hooks) {
    // Права проверяются в момент события: отобрали доступ — доставок больше нет.
    // Удалённая доска: событие board.deleted получают те, у кого был доступ (findUnique видит её в корзине).
    const access = await resolveBoardAccess(deps.prisma, event.boardId, hook.userId).catch(
      () => null,
    );
    if (access || event.event === 'board.deleted') allowed.push(hook.id);
  }

  const payload: WebhookPayload = {
    id: randomUUID(),
    event: event.event,
    occurredAt: event.occurredAt,
    board: board
      ? {
          id: board.id,
          title: board.title,
          url: new URL(`/board/${board.id}`, deps.appUrl).toString(),
        }
      : null,
    actor: actor ? { id: actor.id, name: actor.name } : null,
    data: event.data,
  };
  await deps.queue.addBulk(
    allowed.map((webhookId) => ({
      name: 'deliver',
      data: { kind: 'deliver' as const, webhookId, payload },
      opts: { attempts: DELIVERY_ATTEMPTS, backoff: { type: 'exponential', delay: 10_000 } },
    })),
  );
  return { deliveries: allowed.length };
}

/** Адрес получателя — публичный (без SSRF во внутреннюю сеть) */
async function assertPublic(url: URL, deps: WebhookDeps): Promise<void> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new UnrecoverableError('Схема не поддерживается');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isInternalHostname(host)) throw new UnrecoverableError('Внутренний адрес');
  const resolve =
    deps.resolve ?? (async (h: string) => (await lookup(h, { all: true })).map((a) => a.address));
  const addresses = /^[\d.]+$|:/.test(host) ? [host] : await resolve(host);
  if (addresses.length === 0 || addresses.some(isPrivateIp)) {
    throw new UnrecoverableError('Адрес во внутренней сети');
  }
}

async function deliver(
  webhookId: string,
  payload: WebhookPayload,
  job: Job,
  deps: WebhookDeps,
): Promise<{ status: number }> {
  const hook = await deps.prisma.webhook.findUnique({
    where: { id: webhookId },
    select: { id: true, url: true, secret: true, active: true, failureCount: true },
  });
  // Удалён или выключен (кроме проверочного ping) — молча пропускаем
  if (!hook || (!hook.active && payload.event !== 'ping')) return { status: 0 };

  const body = JSON.stringify(payload);
  const record = async (status: number | null, error: string | null) => {
    const failed = error !== null;
    const failures = failed ? hook.failureCount + 1 : 0;
    await deps.prisma.webhook.update({
      where: { id: hook.id },
      data: {
        lastStatus: status,
        lastError: error,
        lastDeliveryAt: new Date(),
        failureCount: failures,
        // Слишком много неудач подряд — выключаем, владелец увидит это в настройках
        ...(failed && failures >= WEBHOOK_MAX_FAILURES ? { active: false } : {}),
      },
    });
  };

  // Исход доставки: статус ответа или ошибка; retry — стоит ли BullMQ повторять
  let status: number | null = null;
  let error: string | null = null;
  let retry = false;
  try {
    const url = new URL(hook.url);
    await assertPublic(url, deps);
    const res = await (deps.fetch ?? fetch)(url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Prostor-Webhooks/1.0',
        'x-prostor-event': payload.event,
        'x-prostor-delivery': payload.id,
        [WEBHOOK_SIGNATURE_HEADER.toLowerCase()]: signBody(hook.secret, body),
      },
      body,
    });
    await res.body?.cancel().catch(() => undefined);
    status = res.status;
    if (res.status < 200 || res.status >= 300) {
      error = `Получатель ответил HTTP ${res.status}`;
      // 4xx (кроме 408/429) — повтор не поможет
      retry = res.status >= 500 || res.status === 408 || res.status === 429;
    }
  } catch (caught: unknown) {
    if (caught instanceof UnrecoverableError) {
      error = caught.message;
    } else {
      retry = true;
      error =
        caught instanceof Error && (caught.name === 'TimeoutError' || caught.name === 'AbortError')
          ? 'Получатель не ответил за 10 секунд'
          : caught instanceof Error
            ? caught.message.slice(0, 300)
            : 'Ошибка доставки';
    }
  }

  await record(status, error);
  if (error) {
    console.warn(`[webhooks] ${hook.id} attempt ${job.attemptsMade + 1}: ${error}`);
    throw retry ? new Error(error) : new UnrecoverableError(error);
  }
  return { status: status ?? 0 };
}
