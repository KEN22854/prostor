import { prisma, resolveBoardAccess } from '@prostor/db';
import { WS_CLOSE, type ControlEvent } from '@prostor/shared';
import type { WsEnv } from './env';
import type { PubSub } from './pubsub';
import { Room } from './room';

/**
 * Реестр комнат инстанса. Гарантирует, что на одну доску в процессе
 * существует ровно один Y.Doc, даже если клиенты подключаются одновременно.
 */
export class RoomManager {
  /** Промис, а не Room: параллельные подключения ждут одну и ту же загрузку из БД */
  private readonly rooms = new Map<string, Promise<Room>>();

  constructor(
    private readonly env: WsEnv,
    private readonly pubsub: PubSub,
  ) {}

  async get(boardId: string): Promise<Room> {
    let pending = this.rooms.get(boardId);
    if (!pending) {
      const created = this.create(boardId);
      pending = created;
      this.rooms.set(boardId, created);
      created.catch(() => {
        if (this.rooms.get(boardId) === created) this.rooms.delete(boardId);
      });
    }
    const room = await pending;
    if (room.closing) {
      // Комната выгружается: ждём финальной записи в БД, иначе новая
      // загрузка прочитала бы состояние без последних изменений.
      await room.whenClosed();
      return this.get(boardId);
    }
    return room;
  }

  private async create(boardId: string): Promise<Room> {
    const room = new Room(boardId, {
      env: this.env,
      pubsub: this.pubsub,
      onClosed: (closed) => {
        void this.rooms.get(boardId)?.then((current) => {
          if (current === closed) this.rooms.delete(boardId);
        });
      },
    });
    await room.init();
    return room;
  }

  /** Только уже загруженные комнаты (без создания) */
  private async loaded(boardId: string): Promise<Room | null> {
    const pending = this.rooms.get(boardId);
    if (!pending) return null;
    try {
      return await pending;
    } catch {
      return null;
    }
  }

  async handleControl(event: ControlEvent): Promise<void> {
    const room = await this.loaded(event.boardId);
    if (!room) return;
    switch (event.type) {
      case 'role-changed':
        room.applyRoleChange(event.userId, event.role);
        break;
      case 'board-deleted':
        room.closeAll(WS_CLOSE.notFound, 'board deleted');
        break;
      case 'access-changed':
        await room.revalidate((userId) => resolveBoardAccess(prisma, event.boardId, userId));
        break;
      case 'comments-changed':
        room.notify({ type: 'comments-changed', threadId: event.threadId });
        break;
      case 'voting-changed':
        room.notify({ type: 'voting-changed' });
        break;
      case 'board-restored-version':
        // Восстановление версии (итерация 7) применяется через web → Redis;
        // клиентам достаточно уведомления.
        break;
    }
  }

  async all(): Promise<Room[]> {
    const settled = await Promise.allSettled(this.rooms.values());
    return settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  }

  async stats(): Promise<{ rooms: number; connections: number }> {
    const rooms = await this.all();
    return { rooms: rooms.length, connections: rooms.reduce((n, r) => n + r.conns.size, 0) };
  }

  /** Graceful shutdown: отключить клиентов и сохранить все документы */
  async closeAll(): Promise<void> {
    const rooms = await this.all();
    for (const room of rooms) room.closeAll(WS_CLOSE.serverRestart, 'server restart');
    await Promise.allSettled(rooms.map((room) => room.close()));
  }
}
