import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DebouncedTask } from './debounce';

describe('DebouncedTask', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('схлопывает частые вызовы в один', async () => {
    const task = vi.fn(async () => undefined);
    const d = new DebouncedTask(task, 100, 1_000);
    d.schedule();
    d.schedule();
    d.schedule();
    await vi.advanceTimersByTimeAsync(150);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('maxWait гарантирует запуск при непрерывных вызовах', async () => {
    const task = vi.fn(async () => undefined);
    const d = new DebouncedTask(task, 100, 300);
    for (let i = 0; i < 10; i++) {
      d.schedule();
      await vi.advanceTimersByTimeAsync(50);
    }
    // 500 мс непрерывных вызовов при maxWait 300 — минимум один запуск
    expect(task.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('flush во время выполнения запускает задачу ещё раз', async () => {
    let resolveFirst: () => void = () => undefined;
    const task = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((r) => (resolveFirst = r)))
      .mockImplementation(async () => undefined);
    const d = new DebouncedTask(task, 100, 1_000);
    const first = d.flush();
    const second = d.flush();
    resolveFirst();
    await Promise.all([first, second]);
    expect(task).toHaveBeenCalledTimes(2);
  });
});
