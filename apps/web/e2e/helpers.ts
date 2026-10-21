import { expect, type Page } from '@playwright/test';

export interface ElementSummary {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  groupId?: string;
  assetId?: string;
}

/**
 * Новая доска через API под общим пользователем (сессия из global-setup,
 * проект 'board' в playwright.config.ts) и переход на неё.
 */
export async function openNewBoard(page: Page, title = 'E2E доска'): Promise<string> {
  const res = await page.request.post('/api/boards', { data: { title } });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  await page.goto(`/board/${id}`);
  await expect(page.getByTestId('board-canvas').locator('canvas').first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('status')).toContainText('Сохранено', { timeout: 20_000 });
  // dev-хук холста (только в dev-сборке / NEXT_PUBLIC_CANVAS_DEBUG=1)
  // Ждём не только dev-хук, но и BoardActions: до их создания (документ и
  // ElementStore ещё грузятся) горячие клавиши холста игнорируются
  await page.waitForFunction(() =>
    Boolean(
      (window as unknown as { __prostorCanvas?: { actions?: unknown; elementStore?: unknown } })
        .__prostorCanvas?.actions,
    ),
  );
  return id;
}

/** Элементы доски из ElementStore */
export function elements(page: Page): Promise<ElementSummary[]> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __prostorCanvas: { elementStore: { values(): Iterable<Record<string, unknown>> } };
      }
    ).__prostorCanvas;
    return [...api.elementStore.values()].map((e) => ({
      id: String(e.id),
      type: String(e.type),
      x: Number(e.x),
      y: Number(e.y),
      width: Number(e.width),
      height: Number(e.height),
      text: typeof e.text === 'string' ? e.text : undefined,
      groupId: typeof e.groupId === 'string' ? e.groupId : undefined,
      assetId: typeof e.assetId === 'string' ? e.assetId : undefined,
    }));
  });
}

export function selection(page: Page): Promise<string[]> {
  return page.evaluate(() => [
    ...(
      window as unknown as {
        __prostorCanvas: { canvasStore: { getState(): { selection: string[] } } };
      }
    ).__prostorCanvas.canvasStore.getState().selection,
  ]);
}

/** Мировые координаты → координаты страницы (для page.mouse) */
export function toPage(page: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([x, y]) => {
      const api = (
        window as unknown as {
          __prostorCanvas: {
            canvasStore: { getState(): { camera: { x: number; y: number; zoom: number } } };
          };
        }
      ).__prostorCanvas;
      const cam = api.canvasStore.getState().camera;
      const rect = document.querySelector('[data-testid=board-canvas]')?.getBoundingClientRect();
      return {
        x: (x - cam.x) * cam.zoom + (rect?.left ?? 0),
        y: (y - cam.y) * cam.zoom + (rect?.top ?? 0),
      };
    },
    [wx, wy] as const,
  );
}

/** Центр холста в координатах страницы */
export async function canvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId('board-canvas').boundingBox();
  if (!box) throw new Error('canvas has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  opts: { modifiers?: Array<'Shift' | 'Alt'> } = {},
) {
  for (const m of opts.modifiers ?? []) await page.keyboard.down(m);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  for (const m of opts.modifiers ?? []) await page.keyboard.up(m);
}

/** PNG 2×2 — для проверки загрузки изображений */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP4z8DAwAAh/v9nAAAf7wT8BCErpAAAAABJRU5ErkJggg==',
  'base64',
);
