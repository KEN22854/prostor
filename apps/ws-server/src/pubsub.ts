import { Redis } from 'ioredis';

export type BufferHandler = (message: Buffer) => void;

/**
 * Redis Pub/Sub для синхронизации комнат между инстансами WS-сервера.
 * Подписчику нужно отдельное соединение: в режиме subscribe ioredis
 * не может выполнять обычные команды.
 */
export class PubSub {
  readonly pub: Redis;
  private readonly sub: Redis;
  private readonly handlers = new Map<string, BufferHandler>();

  constructor(url: string) {
    this.pub = new Redis(url, { maxRetriesPerRequest: 3 });
    this.sub = new Redis(url, { maxRetriesPerRequest: null });
    for (const client of [this.pub, this.sub]) {
      client.on('error', (error: Error & { code?: string }) =>
        console.error('[redis]', error.message || error.code || error.name),
      );
    }
    // messageBuffer — бинарная версия события message (Yjs-апдейты не UTF-8)
    this.sub.on('messageBuffer', (channel: Buffer, message: Buffer) => {
      this.handlers.get(channel.toString())?.(message);
    });
  }

  /** Оба соединения с Redis установлены */
  get ready(): boolean {
    return this.pub.status === 'ready' && this.sub.status === 'ready';
  }

  async subscribe(channel: string, handler: BufferHandler): Promise<void> {
    this.handlers.set(channel, handler);
    await this.sub.subscribe(channel);
  }

  async unsubscribe(channel: string): Promise<void> {
    this.handlers.delete(channel);
    await this.sub.unsubscribe(channel);
  }

  publish(channel: string, message: Buffer | string): void {
    this.pub.publish(channel, message).catch((error: unknown) => {
      console.error('[redis] publish failed', channel, error);
    });
  }

  /**
   * Распределённая блокировка (SET NX PX) — чтобы снапшот одной доски
   * в одно окно времени писал только один инстанс.
   */
  async tryLock(key: string, ttlMs: number): Promise<boolean> {
    try {
      const result = await this.pub.set(key, '1', 'PX', ttlMs, 'NX');
      return result === 'OK';
    } catch (error: unknown) {
      console.error('[redis] lock failed, proceeding without lock', error);
      return true;
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.sub.quit(), this.pub.quit()]);
  }
}
