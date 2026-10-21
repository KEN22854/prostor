import { describe, expect, it } from 'vitest';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { RELAY, decodeRelay, encodeRelay, sanitizeAwarenessUpdate } from './protocol';

const me = { userId: 'u1', name: 'Анна', color: '#e5484d' };

function awarenessUpdateFor(state: Record<string, unknown>): {
  update: Uint8Array;
  clientId: number;
} {
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(state);
  const update = awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID]);
  awareness.destroy();
  return { update, clientId: doc.clientID };
}

function decodeStates(update: Uint8Array): Map<number, unknown> {
  const awareness = new awarenessProtocol.Awareness(new Y.Doc());
  awareness.setLocalState(null);
  awarenessProtocol.applyAwarenessUpdate(awareness, update, null);
  const states = new Map(awareness.getStates());
  awareness.destroy();
  return states;
}

describe('sanitizeAwarenessUpdate', () => {
  it('подменяет user на данные из JWT и захватывает clientID', () => {
    const { update, clientId } = awarenessUpdateFor({
      user: { id: 'evil', name: 'Директор', color: '#000', avatar: 'https://a/b.png' },
      cursor: { x: 1, y: 2 },
    });
    const result = sanitizeAwarenessUpdate(update, me, new Set(), () => undefined);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.update) throw new Error('expected update');
    expect(result.claimed).toEqual([clientId]);

    const state = decodeStates(result.update).get(clientId) as { user: unknown; cursor: unknown };
    expect(state.user).toEqual({
      id: 'u1',
      name: 'Анна',
      color: '#e5484d',
      avatar: 'https://a/b.png',
    });
    expect(state.cursor).toEqual({ x: 1, y: 2 });
  });

  it('не даёт захватить clientID другого пользователя', () => {
    const { update } = awarenessUpdateFor({ user: { id: 'u1' } });
    const result = sanitizeAwarenessUpdate(update, me, new Set(), () => 'u2');
    expect(result).toEqual({ ok: true, update: null, claimed: [] });
  });

  it('молча отбрасывает чужие состояния, пересланные клиентом', () => {
    const { update } = awarenessUpdateFor({ user: { id: 'u2' } });
    // Соединение уже владеет другим clientID — пересланное состояние не его
    const result = sanitizeAwarenessUpdate(update, me, new Set([42]), () => 'u2');
    expect(result).toEqual({ ok: true, update: null, claimed: [] });
  });

  it('отклоняет мусор', () => {
    expect(sanitizeAwarenessUpdate(new Uint8Array([1, 2]), me, new Set(), () => undefined).ok).toBe(
      false,
    );
  });
});

describe('relay encoding', () => {
  it('кодирует и декодирует сообщение между инстансами', () => {
    const payload = new Uint8Array([1, 2, 3]);
    const decoded = decodeRelay(encodeRelay({ instanceId: 'ws-1', kind: RELAY.update, payload }));
    expect(decoded?.instanceId).toBe('ws-1');
    expect(decoded?.kind).toBe(RELAY.update);
    expect(Array.from(decoded?.payload ?? [])).toEqual([1, 2, 3]);
  });

  it('возвращает null для битых данных', () => {
    expect(decodeRelay(new Uint8Array([255]))).toBeNull();
  });
});
