import { expect, test, type Page } from '@playwright/test';
import { openNewBoard } from './helpers';

/**
 * Производительность холста на 10 000 объектов в реальном браузере.
 * Пороги рассчитаны на headless Chromium в CI (с запасом); фактические цифры
 * печатаются в отчёт — их удобно сравнивать между версиями.
 */
const N = 10_000;

interface FrameStats {
  p50: number;
  p95: number;
  max: number;
  frames: number;
}

type CanvasApi = {
  __prostorCanvas: {
    generate(count: number): void;
    elementStore: { size: number };
    canvasStore: { getState(): { camera: { x: number; y: number; zoom: number }; setCamera(c: { x: number; y: number; zoom: number }): void } };
  };
};

/** Панорамирование камерой на каждом кадре: интервалы между кадрами (мс) */
function panFrames(page: Page, zoom: number, frames = 120): Promise<FrameStats> {
  return page.evaluate(
    ({ zoom, frames }) =>
      new Promise<FrameStats>((resolve) => {
        const api = (window as unknown as CanvasApi).__prostorCanvas;
        const store = api.canvasStore.getState();
        store.setCamera({ x: 0, y: 0, zoom });
        const deltas: number[] = [];
        let last = performance.now();
        let i = 0;
        const tick = (now: number) => {
          deltas.push(now - last);
          last = now;
          const cam = api.canvasStore.getState().camera;
          // ~1 экран за 40 кадров — пересечение границы буфера виртуализации
          api.canvasStore.getState().setCamera({ ...cam, x: cam.x + 2400 / zoom / 40 });
          if (++i < frames) requestAnimationFrame(tick);
          else {
            const sorted = deltas.slice(5).sort((a, b) => a - b);
            const at = (q: number) => Math.round((sorted[Math.floor(sorted.length * q)] ?? 0) * 10) / 10;
            resolve({ p50: at(0.5), p95: at(0.95), max: at(0.999), frames: sorted.length });
          }
        };
        requestAnimationFrame(tick);
      }),
    { zoom, frames },
  );
}

test.describe('производительность', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test(`${N.toLocaleString('ru')} объектов: генерация, панорамирование, LOD, повторное открытие`, async ({ page }, testInfo) => {
    const boardId = await openNewBoard(page, 'Нагрузка 10k');

    const genStart = Date.now();
    await page.evaluate((n) => (window as unknown as CanvasApi).__prostorCanvas.generate(n), N);
    await page.waitForFunction((n) => (window as unknown as CanvasApi).__prostorCanvas.elementStore.size === n, N);
    const generateMs = Date.now() - genStart;
    // Документ уходит на сервер и сохраняется
    await expect(page.getByRole('status')).toContainText('Сохранено', { timeout: 60_000 });

    const detail = await panFrames(page, 1);
    const lod = await panFrames(page, 0.1);

    const reloadStart = Date.now();
    await page.goto(`/board/${boardId}`);
    await page.waitForFunction((n) => (window as unknown as CanvasApi).__prostorCanvas?.elementStore?.size === n, N, { timeout: 60_000 });
    const reopenMs = Date.now() - reloadStart;

    const report = { generateMs, reopenMs, detail, lod };
    testInfo.annotations.push({ type: 'perf', description: JSON.stringify(report) });
    console.log(`[perf] ${JSON.stringify(report)}`);

    // 60 FPS — 16.7 мс на кадр; в CI допускаем просадки до ~20 FPS по p95
    expect(detail.p95).toBeLessThan(50);
    expect(lod.p95).toBeLessThan(50);
    expect(reopenMs).toBeLessThan(15_000);
  });
});
