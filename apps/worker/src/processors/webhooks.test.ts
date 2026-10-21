import { createHmac } from 'node:crypto';
import { UnrecoverableError, type Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { WebhookPayload, WebhookQueuePayload } from '@prostor/shared';
import { processWebhookJob, signBody, type WebhookDeps } from './webhooks';

vi.mock('@prostor/db', () => ({
  // Доступ к доске есть у u1, нет у u2
  resolveBoardAccess: vi.fn(async (_p: unknown, _b: string, userId: string) =>
    userId === 'u1' ? { role: 'EDITOR' } : null,
  ),
}));

const payload: WebhookPayload = {
  id: 'd1',
  event: 'comment.created',
  occurredAt: '2026-10-22T00:00:00.000Z',
  board: null,
  actor: null,
  data: { text: 'привет' },
};

function job(data: WebhookQueuePayload): Job<WebhookQueuePayload> {
  return { data, attemptsMade: 0 } as Job<WebhookQueuePayload>;
}

function deps(hook: Record<string, unknown> | null, fetchImpl?: typeof fetch) {
  const update = vi.fn(async () => undefined);
  const addBulk = vi.fn(async () => []);
  const d: WebhookDeps = {
    prisma: {
      webhook: {
        findUnique: vi.fn(async () => hook),
        findMany: vi.fn(async () => [
          { id: 'h1', userId: 'u1' },
          { id: 'h2', userId: 'u2' },
        ]),
        update,
      },
      board: { findUnique: vi.fn(async () => ({ id: 'b1', title: 'Доска' })) },
      user: { findUnique: vi.fn(async () => ({ id: 'u1', name: 'Аня' })) },
    } as unknown as WebhookDeps['prisma'],
    queue: { addBulk } as unknown as WebhookDeps['queue'],
    appUrl: 'https://prostor.example',
    fetch: fetchImpl,
    resolve: async () => ['93.184.216.34'],
  };
  return { d, update, addBulk };
}

const hook = {
  id: 'h1',
  url: 'https://hooks.example.com/x',
  secret: 'whsec_test',
  active: true,
  failureCount: 0,
};

describe('вебхуки', () => {
  it('подпись — HMAC-SHA256 тела в hex', () => {
    const body = '{"a":1}';
    expect(signBody('s', body)).toBe(
      `sha256=${createHmac('sha256', 's').update(body).digest('hex')}`,
    );
  });

  it('событие рассылается только подписчикам с доступом к доске', async () => {
    const { d, addBulk } = deps(null);
    const res = await processWebhookJob(
      job({
        kind: 'event',
        event: 'comment.created',
        boardId: 'b1',
        actorId: 'u1',
        data: {},
        occurredAt: payload.occurredAt,
      }),
      d,
    );
    expect(res).toEqual({ deliveries: 1 });
    const jobs = (
      addBulk.mock.calls[0] as unknown as [
        Array<{ data: { webhookId: string; payload: WebhookPayload } }>,
      ]
    )[0];
    expect(jobs.map((j) => j.data.webhookId)).toEqual(['h1']);
    expect(jobs[0]?.data.payload.board?.url).toBe('https://prostor.example/board/b1');
  });

  it('доставка: подпись в заголовке, статус записывается, счётчик ошибок сбрасывается', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    const { d, update } = deps(hook, fetchMock as unknown as typeof fetch);
    await processWebhookJob(job({ kind: 'deliver', webhookId: 'h1', payload }), d);
    const init = (fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[1];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-prostor-signature']).toBe(signBody('whsec_test', String(init.body)));
    expect(headers['x-prostor-event']).toBe('comment.created');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastStatus: 200, lastError: null, failureCount: 0 }),
      }),
    );
  });

  it('4xx — без повторов; 5xx — повтор; 15-я ошибка подряд выключает вебхук', async () => {
    const r404 = deps(
      hook,
      (async () => new Response('', { status: 404 })) as unknown as typeof fetch,
    );
    await expect(
      processWebhookJob(job({ kind: 'deliver', webhookId: 'h1', payload }), r404.d),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    const r500 = deps(
      { ...hook, failureCount: 14 },
      (async () => new Response('', { status: 500 })) as unknown as typeof fetch,
    );
    const error = await processWebhookJob(
      job({ kind: 'deliver', webhookId: 'h1', payload }),
      r500.d,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnrecoverableError);
    expect(r500.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failureCount: 15, active: false }),
      }),
    );
  });

  it('адрес во внутренней сети не вызывается', async () => {
    const fetchMock = vi.fn();
    const { d } = deps(
      { ...hook, url: 'http://10.0.0.5/hook' },
      fetchMock as unknown as typeof fetch,
    );
    await expect(
      processWebhookJob(job({ kind: 'deliver', webhookId: 'h1', payload }), d),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('выключенный вебхук пропускается, но проверочный ping доставляется', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const { d } = deps({ ...hook, active: false }, fetchMock as unknown as typeof fetch);
    expect(await processWebhookJob(job({ kind: 'deliver', webhookId: 'h1', payload }), d)).toEqual({
      status: 0,
    });
    await processWebhookJob(
      job({ kind: 'deliver', webhookId: 'h1', payload: { ...payload, event: 'ping' } }),
      d,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
