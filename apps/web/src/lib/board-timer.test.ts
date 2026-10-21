import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  addTime,
  formatClock,
  pauseTimer,
  readTimer,
  remainingMs,
  resumeTimer,
  startTimer,
  stopTimer,
} from './board-timer';

describe('таймер доски', () => {
  it('запуск, пауза, продолжение, +время, стоп — и синхронизация между участниками', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.on('update', (u: Uint8Array) => Y.applyUpdate(b, u));

    startTimer(a, 5 * 60_000, 'Анна', 1_000);
    expect(remainingMs(readTimer(b)!, 61_000)).toBe(4 * 60_000);

    pauseTimer(a, 61_000);
    expect(readTimer(b)?.status).toBe('paused');
    // На паузе время не идёт
    expect(remainingMs(readTimer(b)!, 999_999)).toBe(4 * 60_000);

    addTime(a, 60_000, 100_000);
    resumeTimer(a, 100_000);
    expect(remainingMs(readTimer(b)!, 100_000)).toBe(5 * 60_000);
    expect(remainingMs(readTimer(b)!, 10_000_000)).toBe(0);

    stopTimer(a);
    expect(readTimer(b)).toBeNull();
  });

  it('формат mm:ss с округлением вверх', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(125_000)).toBe('2:05');
  });
});
