import type * as Y from 'yjs';
import { Y_KEYS } from '@prostor/shared';

/**
 * Таймер ведущего — один на доску, в Yjs (meta.timer): все видят один отсчёт,
 * а при обрыве связи он продолжает идти локально. Время окончания — по часам
 * запустившего; расхождение часов участников в пару секунд для фасилитации
 * несущественно.
 */
export interface BoardTimer {
  status: 'running' | 'paused';
  durationMs: number;
  /** running: момент окончания (Date.now запустившего) */
  endsAt: number | null;
  /** paused: сколько оставалось */
  remainingMs: number | null;
  /** Уникален для каждого запуска — сигнал «время вышло» звучит один раз */
  runId: string;
  startedByName: string;
}

const KEY = 'timer';
const TIMER_ORIGIN = 'timer';

export function readTimer(doc: Y.Doc): BoardTimer | null {
  const raw = doc.getMap<unknown>(Y_KEYS.meta).get(KEY);
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Partial<BoardTimer>;
  if (
    (t.status !== 'running' && t.status !== 'paused') ||
    typeof t.durationMs !== 'number' ||
    typeof t.runId !== 'string'
  )
    return null;
  return {
    status: t.status,
    durationMs: t.durationMs,
    endsAt: typeof t.endsAt === 'number' ? t.endsAt : null,
    remainingMs: typeof t.remainingMs === 'number' ? t.remainingMs : null,
    runId: t.runId,
    startedByName: typeof t.startedByName === 'string' ? t.startedByName : '',
  };
}

export function remainingMs(timer: BoardTimer, now: number): number {
  if (timer.status === 'paused') return Math.max(0, timer.remainingMs ?? 0);
  return Math.max(0, (timer.endsAt ?? now) - now);
}

function write(doc: Y.Doc, timer: BoardTimer | null): void {
  doc.transact(() => {
    const meta = doc.getMap<unknown>(Y_KEYS.meta);
    if (timer) meta.set(KEY, timer);
    else meta.delete(KEY);
  }, TIMER_ORIGIN);
}

export function startTimer(
  doc: Y.Doc,
  durationMs: number,
  startedByName: string,
  now = Date.now(),
): void {
  write(doc, {
    status: 'running',
    durationMs,
    endsAt: now + durationMs,
    remainingMs: null,
    runId: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startedByName,
  });
}

export function pauseTimer(doc: Y.Doc, now = Date.now()): void {
  const t = readTimer(doc);
  if (t?.status === 'running')
    write(doc, { ...t, status: 'paused', remainingMs: remainingMs(t, now), endsAt: null });
}

export function resumeTimer(doc: Y.Doc, now = Date.now()): void {
  const t = readTimer(doc);
  if (t?.status === 'paused')
    write(doc, { ...t, status: 'running', endsAt: now + (t.remainingMs ?? 0), remainingMs: null });
}

export function addTime(doc: Y.Doc, deltaMs: number, now = Date.now()): void {
  const t = readTimer(doc);
  if (!t) return;
  const left = remainingMs(t, now) + deltaMs;
  write(
    doc,
    t.status === 'running'
      ? { ...t, endsAt: now + left, durationMs: t.durationMs + deltaMs }
      : { ...t, remainingMs: left, durationMs: t.durationMs + deltaMs },
  );
}

export function stopTimer(doc: Y.Doc): void {
  write(doc, null);
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
