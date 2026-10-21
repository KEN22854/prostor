import { expect, test, type Browser, type Page } from '@playwright/test';
import { canvasCenter, openNewBoard } from './helpers';

/**
 * Комментарии и уведомления. Письма проверяются через Mailpit — web для этого
 * прогона запущен с коротким NOTIFICATION_EMAIL_DELAY_MS (npm run start:e2e).
 * Если стенд с боевой задержкой — задайте её тесту той же переменной, проверка письма пропустится.
 */
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const PASSWORD = 'e2e-pass-123';

async function inviteSecondUser(owner: Page, browser: Browser, boardId: string, name: string): Promise<Page> {
  const link = await owner.request.post(`/api/boards/${boardId}/invites`, { data: { role: 'EDITOR', ttl: '1d' } });
  const { url } = (await link.json()) as { url: string };
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: 'ru-RU' });
  const page = await context.newPage();
  const email = `e2e-comments-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@prostor.test`;
  expect((await page.request.post('/api/account/register', { data: { name, email, password: PASSWORD, confirmPassword: PASSWORD } })).status()).toBe(201);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL(/\/dashboard$/);
  const join = await page.request.post(`/api/boards/${boardId}/join`, { data: { token: new URL(url).searchParams.get('token') } });
  expect(join.ok()).toBe(true);
  await page.goto(`/board/${boardId}`);
  await page.waitForFunction(() => Boolean((window as unknown as { __prostorCanvas?: { actions?: unknown } }).__prostorCanvas?.actions));
  return page;
}

test.describe('комментарии', () => {
  test('упоминание, пин в реальном времени, уведомление, ответ, письмо и «решено»', async ({ page, browser }) => {
    const title = `Обсуждение ${Date.now()}`;
    const boardId = await openNewBoard(page, title);
    const guest = await inviteSecondUser(page, browser, boardId, 'Иван Коллегин');

    // Стикер и комментарий к нему с упоминанием
    const c = await canvasCenter(page);
    await page.keyboard.press('n');
    await page.mouse.click(c.x, c.y);
    await page.keyboard.type('Идея');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('c');
    await page.mouse.click(c.x, c.y);
    const draft = page.getByTestId('comment-draft').getByRole('textbox');
    await expect(draft).toBeFocused();
    await draft.pressSequentially('Посмотри, @Ива');
    await page.getByRole('option', { name: /Иван Коллегин/ }).click();
    await draft.press('Enter');
    await expect(page.getByTestId('thread-card')).toContainText('Посмотри, @Иван Коллегин');
    await expect(page.getByTestId('comment-pin')).toHaveCount(1);

    // У коллеги пин появляется без перезагрузки, в колокольчике — уведомление
    await expect(guest.getByTestId('comment-pin')).toHaveCount(1, { timeout: 10_000 });
    await guest.reload();
    await expect(guest.getByTestId('unread-count')).toHaveText('1', { timeout: 10_000 });
    await guest.getByRole('button', { name: /Уведомления/ }).click();
    await guest.getByRole('button', { name: /упомянул\(а\) вас/ }).click();
    const guestCard = guest.getByTestId('thread-card');
    await expect(guestCard).toContainText('Посмотри');
    await guestCard.getByRole('textbox', { name: 'Ответить…' }).fill('Готово, посмотрел');
    await guestCard.getByRole('textbox', { name: 'Ответить…' }).press('Enter');

    // Ответ приходит автору в открытый тред и в уведомления
    await expect(page.getByTestId('thread-card')).toContainText('Готово, посмотрел', { timeout: 10_000 });
    await expect(page.getByTestId('comment-pin')).toContainText('2');
    await page.reload();
    await page.waitForFunction(() => Boolean((window as unknown as { __prostorCanvas?: { actions?: unknown } }).__prostorCanvas?.actions));
    await expect(page.getByTestId('unread-count')).toHaveText('1', { timeout: 10_000 });

    // Автор не прочитал ответ — уходит письмо (если dev-сервер запущен с короткой задержкой)
    // start:e2e запускает web с задержкой писем 3 с; для чужого стенда — через переменную
    const delay = Number(process.env.NOTIFICATION_EMAIL_DELAY_MS ?? 3_000);
    if (delay <= 10_000) {
      await expect
        .poll(
          async () => {
            const res = await page.request.get(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`subject:"${title}"`)}`);
            const data = (await res.json()) as { messages?: Array<{ Subject: string }> };
            return data.messages?.map((m) => m.Subject) ?? [];
          },
          { timeout: 30_000 },
        )
        .toContain(`Новый ответ на доске «${title}»`);
    }

    // «Решено» — пин скрыт, обсуждение во вкладке «Решённые»
    await page.getByTestId('comment-pin').click();
    await page.getByTestId('thread-card').getByRole('button', { name: 'Решено' }).click();
    await expect(page.getByTestId('comment-pin')).toHaveCount(0);
    await page.getByRole('button', { name: 'Обсуждения' }).click();
    await page.getByRole('tab', { name: /Решённые \(1\)/ }).click();
    await expect(page.getByTestId('comments-list')).toContainText('Посмотри, @Иван Коллегин');
    await guest.context().close();
  });

  test('читатель комментирует, но не правит доску; аноним не может комментировать', async ({ page, browser }) => {
    const boardId = await openNewBoard(page, 'Комментарии читателя');
    const link = await page.request.post(`/api/boards/${boardId}/invites`, { data: { role: 'VIEWER', ttl: '1d' } });
    const { url } = (await link.json()) as { url: string };
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const viewer = await ctx.newPage();
    const email = `e2e-viewer-${Date.now()}@prostor.test`;
    await viewer.request.post('/api/account/register', { data: { name: 'Читатель', email, password: PASSWORD, confirmPassword: PASSWORD } });
    await viewer.goto('/login');
    await viewer.getByLabel('Email').fill(email);
    await viewer.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
    await viewer.getByRole('button', { name: 'Войти' }).click();
    await viewer.waitForURL(/\/dashboard$/);
    await viewer.request.post(`/api/boards/${boardId}/join`, { data: { token: new URL(url).searchParams.get('token') } });

    const created = await viewer.request.post(`/api/boards/${boardId}/comments`, { data: { body: 'Вопрос читателя', x: 10, y: 20 } });
    expect(created.status()).toBe(201);
    await viewer.goto(`/board/${boardId}`);
    await expect(viewer.getByRole('button', { name: 'Комментарий' })).toBeVisible();
    await expect(viewer.getByTestId('comment-pin')).toHaveCount(1);

    // Публичная доска: аноним видит обсуждения, но писать не может
    await page.request.patch(`/api/boards/${boardId}/visibility`, { data: { visibility: 'PUBLIC_READ' } });
    const anon = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
    const list = await anon.request.get(`/api/boards/${boardId}/comments`);
    expect(((await list.json()) as { threads: unknown[] }).threads).toHaveLength(1);
    const denied = await anon.request.post(`/api/boards/${boardId}/comments`, { data: { body: 'спам', x: 0, y: 0 } });
    expect(denied.status()).toBe(401);
    await ctx.close();
    await anon.context().close();
  });
});
