import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { WebSocket } from 'ws';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import type { SnapshotReason } from '@prostor/db';
import {
  REDIS_CHANNELS,
  WS_MESSAGE,
  can,
  type BoardRole,
  type WsServerEvent,
} from '@prostor/shared';
import type { AuthenticatedConn } from './auth';
import { DebouncedTask } from './debounce';
import type { WsEnv } from './env';
import { findForbiddenDeletions, restoreElements } from './delete-guard';
import {
  DB_ORIGIN,
  createSnapshot,
  loadDocument,
  logBlockedDeletion,
  storeDocument,
} from './persistence';
import {
  RELAY,
  SYNC_STEP1,
  decodeRelay,
  encodeRelay,
  encodeServerEvent,
  sanitizeAwarenessUpdate,
  type RelayKind,
} from './protocol';
import type { PubSub } from './pubsub';

/** Origin апдейтов, пришедших от других инстансов через Redis — их не ретранслируем обратно */
const REDIS_ORIGIN = Symbol('redis');
/** Компенсирующая транзакция защиты от удаления — рассылается всем, включая автора */
const GUARD_ORIGIN = Symbol('delete-guard');

/** Медленный клиент, у которого скопилось столько неотправленных байт, отключается */
const MAX_BUFFERED_BYTES = 16 * 1024 * 1024;

export interface Conn {
  ws: WebSocket;
  auth: AuthenticatedConn;
  /** Awareness clientID, которыми владеет это соединение */
  clientIds: Set<number>;
  isAlive: boolean;
}

export interface RoomDeps {
  env: WsEnv;
  pubsub: PubSub;
  /** Вызывается, когда комната полностью закрыта и выгружена из памяти */
  onClosed: (room: Room) => void;
  /** Автоснимок версии сохранён — событие «доска изменена» для вебхуков */
  onSnapshot?: (boardId: string, authorIds: string[], objectCount: number) => void;
}

/**
 * Комната = один Yjs-документ доски в памяти инстанса + подключённые клиенты.
 *
 * Потоки данных:
 *   клиент ──sync/awareness──► Room ──► остальные клиенты этого инстанса
 *                               └─────► Redis ──► Room на других инстансах
 *   Room ──debounce 2 c──► BoardDocument (актуальное состояние)
 *   Room ──debounce 30 c──► BoardSnapshot (история версий)
 */
export class Room {
  readonly doc = new Y.Doc({ gc: true });
  readonly awareness: awarenessProtocol.Awareness;
  readonly conns = new Map<WebSocket, Conn>();

  private readonly channel: string;
  private readonly persistTask: DebouncedTask;
  private readonly snapshotTask: DebouncedTask;
  private changedSinceSnapshot = false;
  private readonly editorsSinceSnapshot = new Set<string>();
  private graceTimer: NodeJS.Timeout | null = null;
  private closingPromise: Promise<void> | null = null;

  constructor(
    readonly boardId: string,
    private readonly deps: RoomDeps,
  ) {
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    // У сервера нет собственного присутствия на доске
    this.awareness.setLocalState(null);
    this.channel = REDIS_CHANNELS.room(boardId);
    const { env } = deps;
    this.persistTask = new DebouncedTask(
      () => this.persist(),
      env.WS_PERSIST_DEBOUNCE_MS,
      env.WS_PERSIST_MAX_WAIT_MS,
    );
    this.snapshotTask = new DebouncedTask(
      () => this.snapshot('AUTO'),
      env.WS_SNAPSHOT_DEBOUNCE_MS,
      env.WS_SNAPSHOT_MAX_WAIT_MS,
    );
  }

  get closing(): boolean {
    return this.closingPromise !== null;
  }

  /** Промис завершения закрытия (для RoomManager: дождаться и создать комнату заново) */
  whenClosed(): Promise<void> {
    return this.closingPromise ?? Promise.resolve();
  }

  async init(): Promise<void> {
    await loadDocument(this.boardId, this.doc);
    this.doc.on('update', this.onDocUpdate);
    this.awareness.on('update', this.onAwarenessUpdate);
    // Подписка не блокирует подключение клиентов: при недоступном Redis комната
    // работает в пределах инстанса, а ioredis подпишется после восстановления связи.
    void this.deps.pubsub
      .subscribe(this.channel, (buf) => this.onRelay(buf))
      .then(() => {
        // Подписались после загрузки из БД: всё, что другие инстансы ещё не сохранили
        // (или прислали между загрузкой и подпиской), запрашиваем явно.
        this.relay(RELAY.syncRequest, Y.encodeStateVector(this.doc));
        this.relay(RELAY.awarenessRequest, new Uint8Array());
      })
      .catch((error: unknown) => console.error(`[room ${this.boardId}] subscribe failed`, error));
  }

  // ─────────────────────────── Соединения ───────────────────────────

  addConn(ws: WebSocket, auth: AuthenticatedConn): Conn {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    const conn: Conn = { ws, auth, clientIds: new Set(), isAlive: true };
    this.conns.set(ws, conn);

    ws.on('pong', () => {
      conn.isAlive = true;
    });
    ws.on('close', () => this.removeConn(ws));

    // Писателям отправляем step1 — «пришли, чего у меня нет» (офлайн-правки клиента).
    // Читателям не отправляем: их правки сервер всё равно отбросит.
    if (auth.canWrite) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, WS_MESSAGE.sync);
      syncProtocol.writeSyncStep1(encoder, this.doc);
      this.send(conn, encoding.toUint8Array(encoder));
    }

    const states = this.awareness.getStates();
    if (states.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, WS_MESSAGE.awareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(states.keys())),
      );
      this.send(conn, encoding.toUint8Array(encoder));
    }
    return conn;
  }

  private removeConn(ws: WebSocket): void {
    const conn = this.conns.get(ws);
    if (!conn) return;
    this.conns.delete(ws);
    if (conn.clientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(this.awareness, Array.from(conn.clientIds), null);
    }
    if (this.conns.size === 0 && !this.closing) {
      // Не выгружаем сразу: перезагрузка вкладки не должна заново читать БД
      this.graceTimer = setTimeout(() => void this.close(), this.deps.env.WS_ROOM_GRACE_MS);
    }
  }

  handleMessage(conn: Conn, data: Uint8Array): void {
    const decoder = decoding.createDecoder(data);
    const type = decoding.readVarUint(decoder);

    switch (type) {
      case WS_MESSAGE.sync: {
        // Ключевая проверка прав: VIEWER/GUEST может только запросить состояние (step1).
        // step2 и update от них молча отбрасываются — офлайн-правки читателя не попадут на доску.
        const syncType = decoding.peekVarUint(decoder);
        if (!conn.auth.canWrite && syncType !== SYNC_STEP1) return;

        // Удаление чужих/заблокированных объектов без права: запоминаем их до применения
        const guarded = syncType === SYNC_STEP1 ? [] : this.guardDeletions(conn, data);

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, WS_MESSAGE.sync);
        // origin = conn: в onDocUpdate не отправляем апдейт обратно автору
        syncProtocol.readSyncMessage(decoder, encoder, this.doc, conn);
        if (encoding.length(encoder) > 1) this.send(conn, encoding.toUint8Array(encoder));

        // …и сразу возвращаем: серверная транзакция уходит всем, включая автора
        const restored = restoreElements(this.doc, guarded, GUARD_ORIGIN);
        if (restored > 0) {
          console.warn(
            `[room ${this.boardId}] restored ${restored} element(s) deleted by ${conn.auth.userId} without permission`,
          );
          void logBlockedDeletion(
            this.boardId,
            conn.auth.userId,
            guarded.map((g) => g.key),
          );
        }
        return;
      }
      case WS_MESSAGE.awareness: {
        const update = decoding.readVarUint8Array(decoder);
        const result = sanitizeAwarenessUpdate(
          update,
          { userId: conn.auth.userId, name: conn.auth.name, color: conn.auth.color },
          conn.clientIds,
          (id) => this.ownerOf(id),
        );
        if (!result.ok) {
          console.warn(
            `[room ${this.boardId}] rejected awareness from ${conn.auth.userId}: ${result.reason}`,
          );
          return;
        }
        for (const id of result.claimed) conn.clientIds.add(id);
        if (result.update)
          awarenessProtocol.applyAwarenessUpdate(this.awareness, result.update, conn);
        return;
      }
      case WS_MESSAGE.queryAwareness: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, WS_MESSAGE.awareness);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(
            this.awareness,
            Array.from(this.awareness.getStates().keys()),
          ),
        );
        this.send(conn, encoding.toUint8Array(encoder));
        return;
      }
      default:
        // auth и неизвестные типы от клиента игнорируем
        return;
    }
  }

  private guardDeletions(conn: Conn, data: Uint8Array) {
    try {
      const d = decoding.createDecoder(data);
      decoding.readVarUint(d); // тип сообщения
      decoding.readVarUint(d); // step2 | update
      const update = decoding.readVarUint8Array(d);
      return findForbiddenDeletions(this.doc, update, {
        userId: conn.auth.userId,
        canDeleteOthers: can(conn.auth.role, 'deleteOthers', conn.auth.policy),
      });
    } catch {
      return [];
    }
  }

  /** Владелец awareness clientID: локальное соединение или (для чужих инстансов) user.id из состояния */
  private ownerOf(clientId: number): string | undefined {
    for (const conn of this.conns.values()) {
      if (conn.clientIds.has(clientId)) return conn.auth.userId;
    }
    const state = this.awareness.getStates().get(clientId) as
      { user?: { id?: unknown } } | undefined;
    return typeof state?.user?.id === 'string' ? state.user.id : undefined;
  }

  // ─────────────────────────── Права ───────────────────────────

  applyRoleChange(userId: string, role: BoardRole | null): void {
    for (const conn of this.conns.values()) {
      if (conn.auth.userId !== userId) continue;
      if (!role) {
        conn.ws.close(4403, 'access revoked');
        continue;
      }
      conn.auth = { ...conn.auth, role, canWrite: can(role, 'edit', conn.auth.policy) };
      this.sendEvent(conn, { type: 'role-changed', role });
    }
  }

  /**
   * Пересчёт прав всех подключений (после смены видимости, ролей, удаления
   * участника). resolve получает userId или null для анонима и возвращает
   * актуальную роль; одинаковые пользователи (несколько вкладок) — один запрос.
   */
  async revalidate(
    resolve: (
      userId: string | null,
    ) => Promise<{ role: BoardRole; policy: Conn['auth']['policy'] } | null>,
  ): Promise<void> {
    const cache = new Map<
      string,
      Promise<{ role: BoardRole; policy: Conn['auth']['policy'] } | null>
    >();
    for (const conn of Array.from(this.conns.values())) {
      const key = conn.auth.anonymous ? '__anonymous__' : conn.auth.userId;
      let pending = cache.get(key);
      if (!pending) {
        pending = resolve(conn.auth.anonymous ? null : conn.auth.userId);
        cache.set(key, pending);
      }
      const access = await pending;
      if (!access) {
        conn.ws.close(4403, 'access revoked');
        continue;
      }
      const canWrite = can(access.role, 'edit', access.policy);
      if (access.role === conn.auth.role && canWrite === conn.auth.canWrite) continue;
      conn.auth = { ...conn.auth, role: access.role, policy: access.policy, canWrite };
      this.sendEvent(conn, { type: 'role-changed', role: access.role });
    }
  }

  closeAll(code: number, reason: string): void {
    for (const conn of this.conns.values()) conn.ws.close(code, reason);
  }

  // ─────────────────────────── Рассылка ───────────────────────────

  private send(conn: Conn, message: Uint8Array): void {
    const { ws } = conn;
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      console.warn(`[room ${this.boardId}] terminating slow client ${conn.auth.userId}`);
      ws.terminate();
      return;
    }
    ws.send(message, (error) => {
      if (error) ws.terminate();
    });
  }

  private sendEvent(conn: Conn, event: WsServerEvent): void {
    this.send(conn, encodeServerEvent(event));
  }

  /** Событие всем клиентам комнаты на этом инстансе (каждый инстанс получает control-событие сам) */
  notify(event: WsServerEvent): void {
    this.broadcastEvent(event);
  }

  private broadcastEvent(event: WsServerEvent): void {
    const message = encodeServerEvent(event);
    for (const conn of this.conns.values()) this.send(conn, message);
  }

  private relay(kind: RelayKind, payload: Uint8Array): void {
    this.deps.pubsub.publish(
      this.channel,
      encodeRelay({ instanceId: this.deps.env.WS_INSTANCE_ID, kind, payload }),
    );
  }

  private readonly onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, WS_MESSAGE.sync);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    for (const conn of this.conns.values()) {
      if (conn !== origin) this.send(conn, message);
    }

    if (origin === DB_ORIGIN) return;
    if (origin !== REDIS_ORIGIN) this.relay(RELAY.update, update);

    this.persistTask.schedule();
    this.changedSinceSnapshot = true;
    if (
      origin !== REDIS_ORIGIN &&
      typeof origin === 'object' &&
      origin !== null &&
      'auth' in origin
    ) {
      this.editorsSinceSnapshot.add((origin as Conn).auth.userId);
    }
    this.snapshotTask.schedule();
  };

  private readonly onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    const changed = added.concat(updated, removed);
    const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, WS_MESSAGE.awareness);
    encoding.writeVarUint8Array(encoder, update);
    const message = encoding.toUint8Array(encoder);
    for (const conn of this.conns.values()) this.send(conn, message);
    if (origin !== REDIS_ORIGIN) this.relay(RELAY.awareness, update);
  };

  private onRelay(buf: Buffer): void {
    const msg = decodeRelay(buf);
    if (!msg || msg.instanceId === this.deps.env.WS_INSTANCE_ID || this.closing) return;
    try {
      switch (msg.kind) {
        case RELAY.update:
          Y.applyUpdate(this.doc, msg.payload, REDIS_ORIGIN);
          break;
        case RELAY.awareness:
          awarenessProtocol.applyAwarenessUpdate(this.awareness, msg.payload, REDIS_ORIGIN);
          break;
        case RELAY.syncRequest:
          this.relay(RELAY.update, Y.encodeStateAsUpdate(this.doc, msg.payload));
          break;
        case RELAY.awarenessRequest: {
          const local = Array.from(this.conns.values()).flatMap((c) => Array.from(c.clientIds));
          if (local.length > 0) {
            this.relay(
              RELAY.awareness,
              awarenessProtocol.encodeAwarenessUpdate(this.awareness, local),
            );
          }
          break;
        }
      }
    } catch (error: unknown) {
      console.error(`[room ${this.boardId}] bad relay message`, error);
    }
  }

  // ─────────────────────────── Персистентность ───────────────────────────

  private async persist(): Promise<void> {
    try {
      await storeDocument(this.boardId, this.doc);
    } catch (error: unknown) {
      console.error(`[room ${this.boardId}] persist failed, will retry`, error);
      if (!this.closing) this.persistTask.schedule();
    }
  }

  private async snapshot(reason: SnapshotReason): Promise<void> {
    if (!this.changedSinceSnapshot) return;
    // Окно блокировки ~ debounce: два инстанса одной комнаты не создадут дубликаты версий
    const lockMs =
      reason === 'AUTO' ? Math.max(5_000, this.deps.env.WS_SNAPSHOT_DEBOUNCE_MS - 1_000) : 5_000;
    const locked = await this.deps.pubsub.tryLock(`prostor:snaplock:${this.boardId}`, lockMs);

    const authors = Array.from(this.editorsSinceSnapshot);
    this.changedSinceSnapshot = false;
    this.editorsSinceSnapshot.clear();
    if (!locked) return;

    try {
      const snapshotId = await createSnapshot({
        boardId: this.boardId,
        doc: this.doc,
        reason,
        authorIds: authors,
      });
      this.broadcastEvent({ type: 'snapshot-saved', snapshotId, at: Date.now() });
      this.deps.onSnapshot?.(this.boardId, authors, this.doc.getMap('elements').size);
    } catch (error: unknown) {
      console.error(`[room ${this.boardId}] snapshot failed`, error);
      this.changedSinceSnapshot = true;
      for (const a of authors) this.editorsSinceSnapshot.add(a);
    }
  }

  /** Выгрузка комнаты: финальная запись, снапшот «последний клиент вышел», отписка */
  close(): Promise<void> {
    this.closingPromise ??= (async () => {
      if (this.graceTimer) clearTimeout(this.graceTimer);
      this.snapshotTask.cancel();
      this.persistTask.cancel();
      try {
        await this.persist();
        await this.snapshot('LAST_CLIENT');
      } finally {
        await this.deps.pubsub.unsubscribe(this.channel).catch(() => undefined);
        this.doc.off('update', this.onDocUpdate);
        this.awareness.off('update', this.onAwarenessUpdate);
        this.awareness.destroy();
        this.doc.destroy();
        this.deps.onClosed(this);
      }
    })();
    return this.closingPromise;
  }
}
