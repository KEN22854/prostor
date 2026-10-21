import * as decoding from 'lib0/decoding';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import {
  LOCAL_ORIGIN,
  WS_CLOSE,
  WS_MESSAGE,
  Y_KEYS,
  wsServerEventSchema,
  type AwarenessState,
  DEFAULT_POLICY,
  type BoardRole,
  type OrgPolicy,
  type WsTokenResponse,
} from '@prostor/shared';
import { ApiClientError, apiRequest } from '@/lib/fetcher';

/**
 * offline    — нет сети или WS-сервер недоступен; правки копятся в IndexedDB
 * connecting — устанавливаем соединение
 * syncing    — соединение есть, обмен состояниями ещё не завершён
 * synced     — всё отправлено и получено
 */
export type ConnectionStatus = 'offline' | 'connecting' | 'syncing' | 'synced';
export type ConnectionError = 'forbidden' | 'not_found' | 'unauthorized';

export interface ConnectionState {
  status: ConnectionStatus;
  /** Локальная копия из IndexedDB загружена — можно рисовать доску до ответа сервера */
  localReady: boolean;
  /** Есть локальные изменения, ещё не подтверждённые синхронизацией с сервером */
  hasPendingChanges: boolean;
  role: BoardRole | null;
  policy: OrgPolicy;
  user: WsTokenResponse['user'] | null;
  error: ConnectionError | null;
  lastSnapshotAt: number | null;
}

/** Токен обновляем заранее, за минуту до истечения */
const TOKEN_REFRESH_LEAD_MS = 60_000;
const RETRY_TOKEN_MS = 5_000;

/**
 * Жизненный цикл совместного документа доски вне React:
 *
 *   Y.Doc ◄──► IndexeddbPersistence   офлайн-копия, мгновенный старт
 *     ▲
 *     └──────► WebsocketProvider      синхронизация и awareness
 *
 * Офлайн «из коробки»: Yjs копит изменения в документе и IndexedDB,
 * при переподключении y-websocket выполняет sync step1/step2 и
 * CRDT сливает обе стороны без конфликтов.
 *
 * React-хук useYjs подписывается через subscribe/getState (useSyncExternalStore).
 */
export class BoardConnection {
  readonly doc = new Y.Doc();
  readonly undoManager: Y.UndoManager;
  provider: WebsocketProvider | null = null;

  private readonly idb: IndexeddbPersistence;
  private state: ConnectionState = {
    status: 'connecting',
    localReady: false,
    hasPendingChanges: false,
    role: null,
    policy: DEFAULT_POLICY,
    user: null,
    error: null,
    lastSnapshotAt: null,
  };
  private readonly listeners = new Set<() => void>();
  /** Подписчики на изменения комментариев (событие WS-сервера comments-changed) */
  private readonly commentListeners = new Set<(threadId: string) => void>();
  private readonly votingListeners = new Set<() => void>();
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(readonly boardId: string) {
    this.idb = new IndexeddbPersistence(`prostor:board:${boardId}`, this.doc);
    void this.idb.whenSynced.then(() => this.setState({ localReady: true }));

    // Undo/redo только своих действий: удалённые апдейты и загрузка из IndexedDB
    // имеют другой origin и в стек не попадают.
    this.undoManager = new Y.UndoManager(
      [this.doc.getMap(Y_KEYS.elements), this.doc.getMap(Y_KEYS.frames)],
      { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 500 },
    );

    this.doc.on('update', this.onDocUpdate);
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    void this.connect();
  }

  // ─────────────── Подписка для React ───────────────

  getState = (): ConnectionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  subscribeComments = (listener: (threadId: string) => void): (() => void) => {
    this.commentListeners.add(listener);
    return () => this.commentListeners.delete(listener);
  };

  subscribeVoting = (listener: () => void): (() => void) => {
    this.votingListeners.add(listener);
    return () => this.votingListeners.delete(listener);
  };

  private setState(patch: Partial<ConnectionState>): void {
    if (this.destroyed) return;
    const next = { ...this.state, ...patch };
    if (patch.status === 'synced') next.hasPendingChanges = false;
    // Новый объект только при реальном изменении — иначе лишние ре-рендеры
    const changed = (Object.keys(next) as Array<keyof ConnectionState>).some(
      (k) => next[k] !== this.state[k],
    );
    if (!changed) return;
    this.state = next;
    for (const l of this.listeners) l();
  }

  // ─────────────── Соединение ───────────────

  private async fetchToken(): Promise<WsTokenResponse | null> {
    try {
      return await apiRequest<WsTokenResponse>(`/api/boards/${this.boardId}/ws-token`, {
        method: 'POST',
      });
    } catch (error: unknown) {
      if (error instanceof ApiClientError) {
        if (error.status === 401) return this.fail('unauthorized');
        if (error.status === 403) return this.fail('forbidden');
        if (error.status === 404) return this.fail('not_found');
      }
      // Сеть / 5xx — работаем офлайн и пробуем позже
      this.setState({ status: 'offline' });
      this.scheduleRefresh(RETRY_TOKEN_MS);
      return null;
    }
  }

  private fail(error: ConnectionError): null {
    this.provider?.disconnect();
    this.setState({ error, status: 'offline' });
    return null;
  }

  private async connect(): Promise<void> {
    const token = await this.fetchToken();
    if (!token || this.destroyed) return;

    this.setState({ role: token.role, policy: token.policy, user: token.user, error: null });
    this.scheduleRefresh(token.expiresAt - Date.now() - TOKEN_REFRESH_LEAD_MS);

    if (this.provider) {
      // Повторная попытка после офлайна — провайдер уже есть, обновляем токен
      this.provider.params = { token: token.token };
      if (!this.provider.shouldConnect) this.provider.connect();
      return;
    }

    const provider = new WebsocketProvider(token.url, token.room, this.doc, {
      params: { token: token.token },
      maxBackoffTime: 10_000,
      // Между вкладками одного браузера синхронизирует BroadcastChannel — без сервера
      disableBc: false,
    });
    this.provider = provider;

    // Серверные события (WS_MESSAGE.event) — расширение протокола y-websocket
    provider.messageHandlers[WS_MESSAGE.event] = (_encoder, decoder) => this.onServerEvent(decoder);

    provider.on('status', ({ status }) => {
      if (status === 'connected') {
        this.setState({ status: provider.synced ? 'synced' : 'syncing' });
      } else if (status === 'connecting') {
        // Неудачная попытка соединения y-websocket не сообщает событием 'disconnected' —
        // сразу снова шлёт 'connecting'. Если уже были неудачные попытки, сервер недоступен:
        // показываем «Офлайн», а не вечное «Подключение…».
        const unreachable = !navigator.onLine || provider.wsUnsuccessfulReconnects > 0;
        this.setState({ status: unreachable ? 'offline' : 'connecting' });
      } else {
        this.setState({ status: 'offline' });
      }
    });
    provider.on('sync', (synced) => {
      if (provider.wsconnected) this.setState({ status: synced ? 'synced' : 'syncing' });
    });
    provider.on('connection-close', (event) => {
      const code = event?.code;
      if (code === WS_CLOSE.unauthorized) {
        // Токен истёк — y-websocket переподключится сам, к тому моменту params будут свежими
        void this.refreshToken();
      } else if (code === WS_CLOSE.forbidden) {
        this.fail('forbidden');
      } else if (code === WS_CLOSE.notFound) {
        this.fail('not_found');
      }
    });

    const localState: AwarenessState = {
      user: { id: token.user.id, name: token.user.name, color: token.user.color },
      cursor: null,
      selection: [],
      viewport: null,
      laser: null,
      following: null,
      presenting: null,
    };
    provider.awareness.setLocalState(localState);
  }

  private onServerEvent(decoder: decoding.Decoder): void {
    try {
      const parsed = wsServerEventSchema.safeParse(JSON.parse(decoding.readVarString(decoder)));
      if (!parsed.success) return;
      const event = parsed.data;
      if (event.type === 'role-changed') this.setState({ role: event.role });
      if (event.type === 'snapshot-saved') this.setState({ lastSnapshotAt: event.at });
      if (event.type === 'comments-changed') for (const l of this.commentListeners) l(event.threadId);
      if (event.type === 'voting-changed') for (const l of this.votingListeners) l();
    } catch {
      // Неизвестное событие от более новой версии сервера — игнорируем
    }
  }

  private scheduleRefresh(delayMs: number): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refreshToken(), Math.max(1_000, delayMs));
  }

  private async refreshToken(): Promise<void> {
    if (this.destroyed || this.state.error) return;
    if (!this.provider) {
      await this.connect();
      return;
    }
    const token = await this.fetchToken();
    if (!token || this.destroyed) return;
    this.provider.params = { token: token.token };
    this.setState({ role: token.role, policy: token.policy, user: token.user });
    this.scheduleRefresh(token.expiresAt - Date.now() - TOKEN_REFRESH_LEAD_MS);
  }

  // ─────────────── События ───────────────

  private readonly onDocUpdate = (_update: Uint8Array, origin: unknown): void => {
    // Свои изменения, пока нет подтверждённой синхронизации, — «ждут отправки»
    const isRemote = origin === this.provider || origin === this.idb;
    if (!isRemote && this.state.status !== 'synced') this.setState({ hasPendingChanges: true });
  };

  private readonly onOnline = (): void => {
    this.setState({ status: 'connecting' });
    void this.refreshToken();
  };

  private readonly onOffline = (): void => {
    this.setState({ status: 'offline' });
  };

  /**
   * Пакет изменений в одной транзакции: один Yjs-апдейт по сети
   * и один шаг undo вместо десятков.
   */
  transact(fn: () => void): void {
    this.doc.transact(fn, LOCAL_ORIGIN);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    this.doc.off('update', this.onDocUpdate);
    this.provider?.awareness.setLocalState(null);
    this.provider?.destroy();
    void this.idb.destroy();
    this.undoManager.destroy();
    this.doc.destroy();
    this.listeners.clear();
    this.commentListeners.clear();
    this.votingListeners.clear();
  }
}
