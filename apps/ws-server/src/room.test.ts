import { EventEmitter } from 'node:events';
import * as encoding from 'lib0/encoding';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { DEFAULT_POLICY, WS_MESSAGE, type BoardRole } from '@prostor/shared';
import type { AuthenticatedConn } from './auth';
import type { WsEnv } from './env';
import type { PubSub } from './pubsub';
import { Room } from './room';

// БД не нужна: проверяем синхронизацию между инстансами и права
vi.mock('./persistence', () => ({
  DB_ORIGIN: Symbol('db'),
  loadDocument: vi.fn(async () => undefined),
  storeDocument: vi.fn(async () => undefined),
  createSnapshot: vi.fn(async () => 'snap'),
  logBlockedDeletion: vi.fn(async () => undefined),
}));

/** In-memory замена Redis Pub/Sub: доставка асинхронная, как в реальности */
class FakeBus {
  private readonly handlers = new Map<string, Set<(m: Buffer) => void>>();

  client(): PubSub {
    const own = new Map<string, (m: Buffer) => void>();
    return {
      subscribe: async (channel: string, handler: (m: Buffer) => void) => {
        own.set(channel, handler);
        if (!this.handlers.has(channel)) this.handlers.set(channel, new Set());
        this.handlers.get(channel)?.add(handler);
      },
      unsubscribe: async (channel: string) => {
        const h = own.get(channel);
        if (h) this.handlers.get(channel)?.delete(h);
      },
      publish: (channel: string, message: Buffer | string) => {
        const buf = typeof message === 'string' ? Buffer.from(message) : message;
        for (const h of this.handlers.get(channel) ?? []) queueMicrotask(() => h(buf));
      },
      tryLock: async () => true,
      close: async () => undefined,
    } as unknown as PubSub;
  }
}

class FakeSocket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  sent: Uint8Array[] = [];
  send(data: Uint8Array, cb?: (err?: Error) => void) {
    this.sent.push(data);
    cb?.();
  }
  close() {
    this.readyState = 3;
    this.emit('close');
  }
  terminate() {
    this.close();
  }
}

function env(instance: string): WsEnv {
  return {
    NODE_ENV: 'test',
    WS_PORT: 0,
    WS_HOST: '127.0.0.1',
    WS_JWT_SECRET: 'x'.repeat(32),
    DATABASE_URL: 'postgresql://localhost/test',
    REDIS_URL: 'redis://localhost',
    WS_ALLOWED_ORIGINS: [],
    WS_INSTANCE_ID: instance,
    WS_PERSIST_DEBOUNCE_MS: 60_000,
    WS_PERSIST_MAX_WAIT_MS: 60_000,
    WS_SNAPSHOT_DEBOUNCE_MS: 60_000,
    WS_SNAPSHOT_MAX_WAIT_MS: 60_000,
    WS_ROOM_GRACE_MS: 60_000,
  };
}

function auth(role: BoardRole, userId = `user-${role}`): AuthenticatedConn {
  return {
    boardId: 'board1234',
    userId,
    name: userId,
    color: '#000',
    role,
    policy: DEFAULT_POLICY,
    anonymous: false,
    canWrite: role === 'OWNER' || role === 'EDITOR',
  };
}

/** Клиентский апдейт «добавлен элемент id» в формате y-websocket */
function updateMessage(id: string): Uint8Array {
  const clientDoc = new Y.Doc();
  const el = new Y.Map<unknown>();
  el.set('type', 'sticky');
  clientDoc.getMap('elements').set(id, el);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, WS_MESSAGE.sync);
  syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(clientDoc));
  return encoding.toUint8Array(encoder);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function makeRoom(bus: FakeBus, instance: string): Promise<Room> {
  const room = new Room('board1234', {
    env: env(instance),
    pubsub: bus.client(),
    onClosed: () => undefined,
  });
  await room.init();
  await flush();
  return room;
}

describe('Room', () => {
  it('изменение редактора доходит до комнаты на другом инстансе через Pub/Sub', async () => {
    const bus = new FakeBus();
    const a = await makeRoom(bus, 'ws-a');
    const b = await makeRoom(bus, 'ws-b');

    const conn = a.addConn(new FakeSocket() as unknown as WebSocket, auth('EDITOR'));
    a.handleMessage(conn, updateMessage('el-1'));
    await flush();

    expect(a.doc.getMap('elements').has('el-1')).toBe(true);
    expect(b.doc.getMap('elements').has('el-1')).toBe(true);
  });

  it('изменения от VIEWER отбрасываются', async () => {
    const bus = new FakeBus();
    const room = await makeRoom(bus, 'ws-a');
    const conn = room.addConn(new FakeSocket() as unknown as WebSocket, auth('VIEWER'));
    room.handleMessage(conn, updateMessage('hack'));
    await flush();
    expect(room.doc.getMap('elements').size).toBe(0);
  });

  it('новый инстанс догоняет несохранённые изменения через syncRequest', async () => {
    const bus = new FakeBus();
    const a = await makeRoom(bus, 'ws-a');
    const conn = a.addConn(new FakeSocket() as unknown as WebSocket, auth('EDITOR'));
    a.handleMessage(conn, updateMessage('before-b'));
    await flush();

    // B поднимается позже; в «БД» (мок) ничего нет — состояние приходит от A
    const b = await makeRoom(bus, 'ws-b');
    await flush();
    expect(b.doc.getMap('elements').has('before-b')).toBe(true);
  });

  it('апдейт рассылается другим клиентам, но не автору', async () => {
    const bus = new FakeBus();
    const room = await makeRoom(bus, 'ws-a');
    const authorWs = new FakeSocket();
    const otherWs = new FakeSocket();
    const author = room.addConn(authorWs as unknown as WebSocket, auth('EDITOR', 'u1'));
    room.addConn(otherWs as unknown as WebSocket, auth('VIEWER', 'u2'));
    const authorBefore = authorWs.sent.length;
    const otherBefore = otherWs.sent.length;

    room.handleMessage(author, updateMessage('x'));
    expect(authorWs.sent.length).toBe(authorBefore);
    expect(otherWs.sent.length).toBe(otherBefore + 1);
  });

  it('понижение роли до VIEWER сразу запрещает запись', async () => {
    const bus = new FakeBus();
    const room = await makeRoom(bus, 'ws-a');
    const conn = room.addConn(new FakeSocket() as unknown as WebSocket, auth('EDITOR', 'u1'));
    room.applyRoleChange('u1', 'VIEWER');
    room.handleMessage(conn, updateMessage('after-demote'));
    expect(room.doc.getMap('elements').size).toBe(0);
  });

  it('revalidate: понижает роль, отключает лишившихся доступа, резолвит каждого пользователя один раз', async () => {
    const bus = new FakeBus();
    const room = await makeRoom(bus, 'ws-a');
    const demotedWs = new FakeSocket();
    const removedWs = new FakeSocket();
    const demoted = room.addConn(demotedWs as unknown as WebSocket, auth('EDITOR', 'u1'));
    room.addConn(new FakeSocket() as unknown as WebSocket, auth('EDITOR', 'u1')); // вторая вкладка
    room.addConn(removedWs as unknown as WebSocket, auth('EDITOR', 'u2'));

    const resolve = vi.fn(async (userId: string | null) =>
      userId === 'u1' ? { role: 'VIEWER' as const, policy: DEFAULT_POLICY } : null,
    );
    await room.revalidate(resolve);

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(removedWs.readyState).toBe(3);
    expect(demotedWs.readyState).toBe(1);
    expect(demoted.auth.role).toBe('VIEWER');
    room.handleMessage(demoted, updateMessage('after-revalidate'));
    expect(room.doc.getMap('elements').size).toBe(0);
  });
});

describe('Room: защита от удаления чужих объектов', () => {
  it('редактор без права deleteOthers не может удалить чужой объект — сервер возвращает его всем', async () => {
    const bus = new FakeBus();
    const room = await makeRoom(bus, 'ws-a');
    room.doc.transact(() => {
      const el = new Y.Map<unknown>();
      el.set('type', 'sticky');
      el.set('createdBy', 'someone-else');
      room.doc.getMap('elements').set('foreign', el);
    });
    const authorWs = new FakeSocket();
    const conn = room.addConn(authorWs as unknown as WebSocket, {
      ...auth('EDITOR', 'u1'),
      policy: { ...DEFAULT_POLICY, allowDeleteOthers: false },
    });

    // Клиент с тем же состоянием удаляет элемент и шлёт апдейт
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(room.doc));
    const before = Y.encodeStateVector(client);
    client.getMap('elements').delete('foreign');
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, WS_MESSAGE.sync);
    syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(client, before));
    const sentBefore = authorWs.sent.length;
    room.handleMessage(conn, encoding.toUint8Array(encoder));

    expect(room.doc.getMap('elements').has('foreign')).toBe(true);
    // Автор получил компенсирующий апдейт (восстановление)
    expect(authorWs.sent.length).toBeGreaterThan(sentBefore);
  });
});
