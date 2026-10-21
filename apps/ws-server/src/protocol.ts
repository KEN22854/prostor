import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { WS_MESSAGE, type WsServerEvent } from '@prostor/shared';

/** Типы sync-подсообщений y-protocols/sync */
export const SYNC_STEP1 = 0;
export const SYNC_STEP2 = 1;
export const SYNC_UPDATE = 2;

/** Максимальный размер JSON-состояния awareness одного клиента */
export const MAX_AWARENESS_STATE_BYTES = 16 * 1024;

export interface ConnIdentity {
  userId: string;
  name: string;
  color: string;
}

export type SanitizeResult =
  { ok: true; update: Uint8Array | null; claimed: number[] } | { ok: false; reason: string };

/**
 * Проверяет и переписывает awareness-апдейт от клиента.
 *
 * Формат (y-protocols/awareness): varUint count, затем count раз
 * [varUint clientID, varUint clock, varString JSON state | "null"].
 *
 * Клиент y-websocket пересылает серверу ВСЕ изменения своей awareness,
 * включая чужие состояния, полученные от сервера. Поэтому:
 *  - соединение «владеет» clientID, которые прислало первыми (owned);
 *    записи о чужих clientID молча отбрасываются — у сервера они уже есть;
 *  - clientID, которым владеет другой пользователь, захватить нельзя;
 *  - поле user (id/name/color) берётся из JWT, а не из присланного JSON —
 *    иначе можно было бы показаться коллегам под чужим именем;
 *  - ограничен размер состояния.
 */
export function sanitizeAwarenessUpdate(
  update: Uint8Array,
  identity: ConnIdentity,
  owned: ReadonlySet<number>,
  ownerOf: (clientId: number) => string | undefined,
): SanitizeResult {
  try {
    const decoder = decoding.createDecoder(update);
    const count = decoding.readVarUint(decoder);
    if (count > 256) return { ok: false, reason: 'too many clients in update' };

    const entries: Array<{ clientId: number; clock: number; json: string }> = [];
    const claimed: number[] = [];
    for (let i = 0; i < count; i++) {
      const clientId = decoding.readVarUint(decoder);
      const clock = decoding.readVarUint(decoder);
      const json = decoding.readVarString(decoder);

      let accept = owned.has(clientId);
      if (!accept && owned.size === 0 && claimed.length === 0) {
        const owner = ownerOf(clientId);
        if (owner === undefined || owner === identity.userId) {
          accept = true;
          claimed.push(clientId);
        }
      }
      if (!accept) continue;
      if (json.length > MAX_AWARENESS_STATE_BYTES)
        return { ok: false, reason: 'awareness state too large' };

      let state: unknown = JSON.parse(json);
      if (state !== null) {
        if (typeof state !== 'object' || Array.isArray(state)) {
          return { ok: false, reason: 'awareness state must be an object' };
        }
        state = {
          ...(state as Record<string, unknown>),
          user: {
            ...readUser(state),
            id: identity.userId,
            name: identity.name,
            color: identity.color,
          },
        };
      }
      entries.push({ clientId, clock, json: JSON.stringify(state) });
    }

    if (entries.length === 0) return { ok: true, update: null, claimed };
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, entries.length);
    for (const e of entries) {
      encoding.writeVarUint(encoder, e.clientId);
      encoding.writeVarUint(encoder, e.clock);
      encoding.writeVarString(encoder, e.json);
    }
    return { ok: true, update: encoding.toUint8Array(encoder), claimed };
  } catch {
    return { ok: false, reason: 'malformed awareness update' };
  }
}

/** Сохраняем необязательные поля user (например, avatar), но не id/name/color */
function readUser(state: object): Record<string, unknown> {
  const user = (state as { user?: unknown }).user;
  if (typeof user !== 'object' || user === null) return {};
  const { avatar } = user as { avatar?: unknown };
  return typeof avatar === 'string' && avatar.length < 2048 ? { avatar } : {};
}

/** Серверное событие (WS_MESSAGE.event) — JSON внутри varString */
export function encodeServerEvent(event: WsServerEvent): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, WS_MESSAGE.event);
  encoding.writeVarString(encoder, JSON.stringify(event));
  return encoding.toUint8Array(encoder);
}

// ─── Межинстансовый протокол (Redis Pub/Sub) ───

export const RELAY = {
  /** Yjs-апдейт */
  update: 0,
  /** Awareness-апдейт */
  awareness: 1,
  /** «Пришлите, чего у меня нет»: payload — state vector */
  syncRequest: 2,
  /** «Пришлите ваши awareness-состояния» */
  awarenessRequest: 3,
} as const;
export type RelayKind = (typeof RELAY)[keyof typeof RELAY];

export interface RelayMessage {
  instanceId: string;
  kind: RelayKind;
  payload: Uint8Array;
}

export function encodeRelay(msg: RelayMessage): Buffer {
  const encoder = encoding.createEncoder();
  encoding.writeVarString(encoder, msg.instanceId);
  encoding.writeVarUint(encoder, msg.kind);
  encoding.writeVarUint8Array(encoder, msg.payload);
  return Buffer.from(encoding.toUint8Array(encoder));
}

export function decodeRelay(buf: Uint8Array): RelayMessage | null {
  try {
    const decoder = decoding.createDecoder(buf);
    const instanceId = decoding.readVarString(decoder);
    const kind = decoding.readVarUint(decoder);
    const payload = decoding.readVarUint8Array(decoder);
    if (kind > RELAY.awarenessRequest) return null;
    return { instanceId, kind: kind as RelayKind, payload };
  } catch {
    return null;
  }
}
