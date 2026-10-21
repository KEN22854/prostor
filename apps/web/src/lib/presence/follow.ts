import type { Awareness } from 'y-protocols/awareness';
import { clampZoom, type Camera, type Size } from '@/lib/canvas/viewport';

export interface RemoteViewport {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
}

export interface RemoteUser {
  clientId: number;
  id: string;
  name: string;
  color: string;
}

/**
 * Камера, показывающая ту же область, что видит ведущий: центр совпадает,
 * а масштаб подбирается так, чтобы его экран целиком поместился в наш
 * (экраны разного размера — у ведущего может быть широкий монитор).
 */
export function cameraForViewport(v: RemoteViewport, size: Size): Camera {
  const worldW = v.width / v.zoom;
  const worldH = v.height / v.zoom;
  const cx = v.x + worldW / 2;
  const cy = v.y + worldH / 2;
  const zoom = clampZoom(Math.min(size.width / Math.max(1, worldW), size.height / Math.max(1, worldH)));
  return { x: cx - size.width / 2 / zoom, y: cy - size.height / 2 / zoom, zoom };
}

/** Плавное приближение камеры к цели (экспоненциальное сглаживание за кадр) */
export function lerpCamera(from: Camera, to: Camera, t: number): Camera {
  // Масштаб интерполируем в логарифме — иначе зум «рывками» на больших перепадах
  const zoom = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * t);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, zoom };
}

export function closeEnough(a: Camera, b: Camera): boolean {
  return Math.abs(a.x - b.x) * a.zoom < 0.5 && Math.abs(a.y - b.y) * a.zoom < 0.5 && Math.abs(a.zoom / b.zoom - 1) < 0.001;
}

function readUser(state: Record<string, unknown>): Omit<RemoteUser, 'clientId'> | null {
  const user = state.user as Record<string, unknown> | undefined;
  if (!user || typeof user.id !== 'string' || typeof user.name !== 'string' || typeof user.color !== 'string') return null;
  return { id: user.id, name: user.name, color: user.color };
}

function readViewport(state: Record<string, unknown>): RemoteViewport | null {
  const v = state.viewport as Record<string, unknown> | null | undefined;
  if (!v) return null;
  const { x, y, zoom, width, height } = v;
  if ([x, y, zoom, width, height].every((n) => typeof n === 'number' && Number.isFinite(n)) && (zoom as number) > 0) {
    return v as unknown as RemoteViewport;
  }
  return null;
}

/**
 * Состояние пользователя для следования. У него может быть несколько вкладок —
 * берём ту, что объявила себя ведущей, иначе любую с viewport.
 */
export function findFollowTarget(awareness: Awareness, userId: string): { user: RemoteUser; viewport: RemoteViewport } | null {
  let fallback: { user: RemoteUser; viewport: RemoteViewport } | null = null;
  for (const [clientId, raw] of awareness.getStates()) {
    if (clientId === awareness.clientID) continue;
    const state = raw as Record<string, unknown>;
    const user = readUser(state);
    const viewport = readViewport(state);
    if (!user || user.id !== userId || !viewport) continue;
    const entry = { user: { ...user, clientId }, viewport };
    if (state.presenting) return entry;
    fallback ??= entry;
  }
  return fallback;
}

/** Кто сейчас «позвал всех за собой» (самый поздний ведущий, не я) */
export function findPresenter(awareness: Awareness, selfId: string | undefined): { user: RemoteUser; since: number } | null {
  let best: { user: RemoteUser; since: number } | null = null;
  for (const [clientId, raw] of awareness.getStates()) {
    const state = raw as Record<string, unknown>;
    const presenting = state.presenting as { since?: unknown } | null | undefined;
    const user = readUser(state);
    if (!presenting || typeof presenting.since !== 'number' || !user || user.id === selfId) continue;
    if (!best || presenting.since > best.since) best = { user: { ...user, clientId }, since: presenting.since };
  }
  return best;
}

/** Сколько человек следят за мной */
export function countFollowers(awareness: Awareness, selfId: string | undefined): number {
  if (!selfId) return 0;
  let n = 0;
  for (const [clientId, raw] of awareness.getStates()) {
    if (clientId === awareness.clientID) continue;
    if ((raw as Record<string, unknown>).following === selfId) n++;
  }
  return n;
}
