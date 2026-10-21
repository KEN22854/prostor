import { expect, test, type Browser, type Page } from '@playwright/test';
import { canvasCenter, elements, openNewBoard, toPage } from './helpers';

/** Вторая вкладка того же пользователя — отдельный клиент awareness/Yjs */
async function secondTab(page: Page, boardId: string): Promise<Page> {
  const tab = await page.context().newPage();
  await tab.goto(`/board/${boardId}`);
  await tab.waitForFunction(() => Boolean((window as unknown as { __prostorCanvas?: { actions?: unknown } }).__prostorCanvas?.actions));
  return tab;
}

async function camera(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  return page.evaluate(() =>
    (window as unknown as { __prostorCanvas: { canvasStore: { getState(): { camera: { x: number; y: number; zoom: number } } } } }).__prostorCanvas.canvasStore.getState().camera,
  );
}

async function newUser(browser: Browser, boardId: string, owner: Page, role: 'EDITOR' | 'VIEWER', name: string): Promise<Page> {
  const link = await owner.request.post(`/api/boards/${boardId}/invites`, { data: { role, ttl: '1d' } });
  const { url } = (await link.json()) as { url: string };
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const email = `e2e-fac-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@prostor.test`;
  await page.request.post('/api/account/register', { data: { name, email, password: 'e2e-pass-123', confirmPassword: 'e2e-pass-123' } });
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('e2e-pass-123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL(/\/dashboard$/);
  await page.request.post(`/api/boards/${boardId}/join`, { data: { token: new URL(url).searchParams.get('token') } });
  await page.goto(`/board/${boardId}`);
  await page.waitForFunction(() => Boolean((window as unknown as { __prostorCanvas?: { actions?: unknown } }).__prostorCanvas?.actions));
  return page;
}

test.describe('фасилитация', () => {
  test('«позвать всех за мной»: камера участника следует за ведущим, ручное движение отключает', async ({ page, browser }) => {
    const boardId = await openNewBoard(page, 'Показ');
    const viewer = await newUser(browser, boardId, page, 'VIEWER', 'Зритель Показов');

    await page.getByTestId('presence-avatar').first().click();
    await page.getByRole('menuitem', { name: 'Позвать всех за мной' }).click();
    await expect(viewer.getByTestId('follow-banner')).toContainText('показывает доску', { timeout: 10_000 });

    // Ведущий уезжает далеко — камера зрителя следом
    await page.evaluate(() =>
      (window as unknown as { __prostorCanvas: { canvasStore: { getState(): { setCamera(c: unknown): void } } } }).__prostorCanvas.canvasStore
        .getState()
        .setCamera({ x: 5000, y: 3000, zoom: 1 }),
    );
    await expect.poll(async () => (await camera(viewer)).x, { timeout: 10_000 }).toBeGreaterThan(4500);

    // Зритель сам двигает холст — следование выключается и больше не включается для этого показа
    const c = await canvasCenter(viewer);
    await viewer.mouse.move(c.x, c.y);
    await viewer.mouse.wheel(0, 300);
    await expect(viewer.getByTestId('follow-banner')).toHaveCount(0);
    await viewer.context().close();
  });

  test('таймер виден всем участникам', async ({ page }) => {
    const boardId = await openNewBoard(page, 'Таймер');
    const tab = await secondTab(page, boardId);
    await page.getByRole('button', { name: 'Таймер' }).click();
    await page.getByRole('button', { name: '5', exact: true }).click();
    await expect(page.getByTestId('board-timer')).toHaveText(/4:5\d|5:00/);
    await expect(tab.getByTestId('board-timer')).toHaveText(/4:5\d|5:00/, { timeout: 10_000 });
    await page.getByTestId('board-timer').click();
    await page.getByRole('button', { name: 'Пауза' }).click();
    await expect(tab.getByRole('button', { name: /на паузе/ })).toBeVisible();
    await page.getByRole('button', { name: 'Остановить таймер' }).click();
    await expect(tab.getByTestId('board-timer')).toHaveCount(0);
    await tab.close();
  });

  test('голосование: лимит голосов, скрытые чужие голоса, итоги', async ({ page, browser }) => {
    const boardId = await openNewBoard(page, 'Голосование');
    const c = await canvasCenter(page);
    for (const dx of [-250, 0, 250]) {
      await page.keyboard.press('n');
      await page.mouse.click(c.x + dx, c.y);
      await page.keyboard.type(`Идея ${dx}`);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
    }
    await expect.poll(async () => (await elements(page)).length).toBe(3);
    const viewer = await newUser(browser, boardId, page, 'VIEWER', 'Голосующий Читатель');

    await page.getByRole('button', { name: 'Голосование' }).click();
    await page.getByLabel('Голосов у каждого').selectOption('2');
    await page.getByRole('button', { name: 'Начать' }).click();
    await expect(page.getByTestId('voting-bar')).toContainText('осталось 2 из 2');
    await expect(viewer.getByTestId('voting-bar')).toContainText('осталось 2 из 2', { timeout: 10_000 });

    // Читатель голосует дважды за одну идею, третий голос не принимается
    const [left, middle] = (await elements(viewer)).sort((a, b) => a.x - b.x);
    const target = await toPage(viewer, (middle?.x ?? 0) + 100, (middle?.y ?? 0) + 100);
    await viewer.mouse.click(target.x, target.y);
    await expect(viewer.getByTestId('voting-bar')).toContainText('осталось 1 из 2');
    await viewer.mouse.click(target.x, target.y);
    await expect(viewer.getByTestId('my-vote')).toHaveText('✓2');
    const other = await toPage(viewer, (left?.x ?? 0) + 100, (left?.y ?? 0) + 100);
    await viewer.mouse.click(other.x, other.y);
    await expect(viewer.getByText(/Голоса закончились/)).toBeVisible();

    // Ведущий не видит чужих голосов до завершения, только количество
    await expect(page.getByTestId('voting-bar')).toContainText('1 участник', { timeout: 10_000 });
    await expect(page.getByTestId('vote-result')).toHaveCount(0);
    await page.getByTestId('voting-bar').getByRole('button', { name: 'Завершить' }).click();
    await expect(page.getByTestId('vote-result')).toHaveText('2');
    await expect(viewer.getByTestId('vote-result')).toHaveText('2', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Скрыть итоги' }).click();
    await expect(viewer.getByTestId('voting-bar')).toHaveCount(0, { timeout: 10_000 });
    await viewer.context().close();
  });

  test('лазерная указка передаётся коллегам через awareness', async ({ page }) => {
    const boardId = await openNewBoard(page, 'Лазер');
    const tab = await secondTab(page, boardId);
    await page.keyboard.press('k');
    const c = await canvasCenter(page);
    await page.mouse.move(c.x - 100, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 100, c.y, { steps: 10 });
    const remoteTrail = await tab.waitForFunction(
      () => {
        // Состояния коллег — в awareness WebSocket-провайдера; ищем непустой след лазера
        const awareness = (
          window as unknown as {
            __prostorCanvas?: { awareness?: { getStates(): Map<number, { laser?: unknown[] }> } | null };
          }
        ).__prostorCanvas?.awareness;
        if (!awareness) return false;
        return [...awareness.getStates().values()].some((s) => Array.isArray(s.laser) && s.laser.length > 2);
      },
      undefined,
      { timeout: 10_000 },
    );
    expect(remoteTrail).toBeTruthy();
    await page.mouse.up();
    await tab.close();
  });

  test('импорт PDF: страницы становятся фреймами с картинками', async ({ page }) => {
    await openNewBoard(page, 'Импорт PDF');
    await page.getByTestId('pdf-input').setInputFiles('e2e/fixtures/sample.pdf');
    await expect(page.getByText('Импортировано страниц: 2')).toBeVisible({ timeout: 30_000 });
    const els = await elements(page);
    expect(els.filter((e) => e.type === 'frame')).toHaveLength(2);
    expect(els.filter((e) => e.type === 'image' && e.assetId)).toHaveLength(2);
    // Вторая страница альбомная — её картинка шире, чем высока
    const landscape = els.filter((e) => e.type === 'image').find((e) => e.width > e.height);
    expect(landscape).toBeDefined();
    // Отмена убирает импорт целиком
    await page.getByTestId('board-canvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await elements(page)).length).toBe(0);
  });
});
