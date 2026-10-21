import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '@prostor/db';
import { QUEUES, type WebhookQueuePayload } from '@prostor/shared';

/**
 * События досок для вебхуков из WS-сервера: «доска изменена» — после
 * автоснимка версии (не чаще WS_SNAPSHOT_DEBOUNCE_MS), а не на каждый апдейт.
 * Рассылку подписчикам делает worker.
 */
export class BoardEvents {
  private queue: Queue<WebhookQueuePayload> | null = null;

  constructor(private readonly redisUrl: string) {}

  private get q(): Queue<WebhookQueuePayload> {
    if (!this.queue) {
      const connection = new Redis(this.redisUrl, { maxRetriesPerRequest: null });
      connection.on('error', (error: Error) => console.error('[board-events]', error.message));
      this.queue = new Queue<WebhookQueuePayload>(QUEUES.webhooks, {
        connection,
        defaultJobOptions: {
          attempts: 3,
          removeOnComplete: { count: 1_000 },
          removeOnFail: { count: 1_000 },
        },
      });
    }
    return this.queue;
  }

  async boardUpdated(boardId: string, authorIds: string[], objectCount: number): Promise<void> {
    try {
      const subscribed = await prisma.webhook.findFirst({
        where: {
          active: true,
          events: { has: 'board.updated' },
          OR: [{ boardId }, { boardId: null }],
        },
        select: { id: true },
      });
      if (!subscribed) return;
      await this.q.add('event', {
        kind: 'event',
        event: 'board.updated',
        boardId,
        actorId: authorIds[0] ?? null,
        data: { editors: authorIds, objectCount },
        occurredAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      console.error('[board-events] enqueue failed', error);
    }
  }

  async close(): Promise<void> {
    await this.queue?.close();
  }
}
