/**
 * Debounce с верхней границей ожидания: при непрерывном редактировании
 * обычный debounce не сработал бы никогда, а maxWait гарантирует запись
 * хотя бы раз в maxWaitMs.
 */
export class DebouncedTask {
  private timer: NodeJS.Timeout | null = null;
  private firstScheduledAt: number | null = null;
  private running: Promise<void> | null = null;
  private rerun = false;

  constructor(
    private readonly task: () => Promise<void>,
    private readonly waitMs: number,
    private readonly maxWaitMs: number,
  ) {}

  schedule(): void {
    const now = Date.now();
    this.firstScheduledAt ??= now;
    const elapsed = now - this.firstScheduledAt;
    const delay = Math.max(0, Math.min(this.waitMs, this.maxWaitMs - elapsed));
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  get pending(): boolean {
    return this.timer !== null;
  }

  /**
   * Выполнить немедленно. Если задача уже идёт — дождаться её и выполнить
   * ещё раз, чтобы не потерять изменения, пришедшие во время записи.
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.firstScheduledAt = null;
    if (this.running) {
      this.rerun = true;
      await this.running;
      return;
    }
    this.running = (async () => {
      do {
        this.rerun = false;
        await this.task();
      } while (this.rerun);
    })();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.firstScheduledAt = null;
  }
}
