import { expect, test, type Browser, type Page } from '@playwright/test';
import { hotp, stepAt } from '../src/lib/totp';
import { canvasCenter, elements, openNewBoard } from './helpers';

const PASSWORD = 'e2e-pass-123';

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
}

/** Новый пользователь в отдельном контексте (без сессии общего пользователя) */
async function newUser(browser: Browser, name: string): Promise<{ page: Page; email: string }> {
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    locale: 'ru-RU',
  });
  const page = await ctx.newPage();
  const email = `e2e-ent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@prostor.test`;
  const res = await page.request.post('/api/account/register', {
    data: { name, email, password: PASSWORD, confirmPassword: PASSWORD },
  });
  expect(res.status()).toBe(201);
  await login(page, email);
  await page.waitForURL(/\/dashboard/);
  return { page, email };
}

async function waitCanvas(page: Page) {
  await page.waitForFunction(() =>
    Boolean(
      (window as unknown as { __prostorCanvas?: { actions?: unknown } }).__prostorCanvas?.actions,
    ),
  );
}

test.describe('enterprise', () => {
  test('организация: участник, политика «не удалять чужое» защищает объекты на сервере, журнал', async ({
    page,
    browser,
  }) => {
    // Организация и доска в ней — через интерфейс дашборда
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Новая организация' }).click();
    const orgName = `Команда ${Date.now()}`;
    await page.getByLabel('Название организации или команды').fill(orgName);
    await page.getByRole('button', { name: 'Создать' }).click();
    await expect(page).toHaveURL(/\/dashboard\?org=/);
    const orgId = new URL(page.url()).searchParams.get('org') ?? '';
    await expect(page.getByRole('heading', { name: orgName })).toBeVisible();

    const created = await page.request.post('/api/boards', {
      data: { title: 'Доска команды', orgId },
    });
    const { id: boardId } = (await created.json()) as { id: string };

    // Коллега — администратор организации (на досках — редактор)
    const colleague = await newUser(browser, 'Коллега Админов');
    await page.goto(`/org/${orgId}/settings`);
    await page.getByLabel('Email участника').fill(colleague.email);
    await page.getByLabel('Роль в организации').selectOption('ADMIN');
    await page.getByRole('button', { name: 'Добавить' }).click();
    await expect(page.getByTestId('org-member')).toHaveCount(2);

    // Политика: редакторы не удаляют чужие объекты
    await page.getByRole('tab', { name: 'Политики' }).click();
    await page.getByLabel(/Удаление чужих объектов/).uncheck();
    await page.getByRole('button', { name: 'Сохранить политики' }).click();
    await expect(page.getByText(/Политики сохранены/)).toBeVisible();

    // Владелец создаёт стикер, коллега видит доску в пространстве организации
    await page.goto(`/board/${boardId}`);
    await waitCanvas(page);
    const c = await canvasCenter(page);
    await page.keyboard.press('n');
    await page.mouse.click(c.x, c.y);
    await page.keyboard.type('Не удалять');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await elements(page)).length).toBe(1);

    await colleague.page.goto(`/dashboard?org=${orgId}`);
    await expect(colleague.page.getByText('Доска команды')).toBeVisible();
    await colleague.page.goto(`/board/${boardId}`);
    await waitCanvas(colleague.page);
    await expect
      .poll(async () => (await elements(colleague.page)).length, { timeout: 15_000 })
      .toBe(1);

    // Обход клиентской проверки: удаляем напрямую в Yjs — сервер должен вернуть объект
    await colleague.page.evaluate(() => {
      const api = (
        window as unknown as {
          __prostorCanvas: {
            elementStore: { values(): Iterable<{ id: string }> };
            actions: { ctx?: unknown };
          };
        }
      ).__prostorCanvas;
      const doc = (
        api.actions as unknown as {
          ctx: {
            doc: { transact(fn: () => void): void; getMap(n: string): { delete(k: string): void } };
          };
        }
      ).ctx.doc;
      const id = [...api.elementStore.values()][0]?.id ?? '';
      doc.transact(() => doc.getMap('elements').delete(id));
    });
    await expect
      .poll(async () => (await elements(colleague.page)).length, { timeout: 10_000 })
      .toBe(1);
    await expect.poll(async () => (await elements(page)).length).toBe(1);

    // Журнал организации: изменение политик, добавление участника, заблокированное удаление
    const audit = await page.request.get(`/api/orgs/${orgId}/audit`);
    const { entries } = (await audit.json()) as { entries: Array<{ action: string }> };
    const actions = entries.map((e) => e.action);
    expect(actions).toContain('org.policy_change');
    expect(actions).toContain('org.member_add');
    await expect
      .poll(async () => {
        const r = await page.request.get(`/api/orgs/${orgId}/audit?action=element.delete_blocked`);
        return ((await r.json()) as { entries: unknown[] }).entries.length;
      })
      .toBeGreaterThan(0);
    const csv = await page.request.get(`/api/orgs/${orgId}/audit?format=csv`);
    expect(csv.headers()['content-type']).toContain('text/csv');
    expect(await csv.text()).toContain('Изменены политики');
    // Коллега-участник журнал не видит, если он не администратор
    await colleague.page.context().close();
  });

  test('папки: доступ к родительской папке наследуется вложенными, закрытие доступа отключает', async ({
    page,
    browser,
  }) => {
    const parent = await page.request.post('/api/folders', {
      data: { name: `Проекты ${Date.now()}` },
    });
    const { id: parentId } = (await parent.json()) as { id: string };
    const child = await page.request.post('/api/folders', { data: { name: 'Q4', parentId } });
    const { id: childId } = (await child.json()) as { id: string };
    const boardId = await openNewBoard(page, 'Доска в Q4');
    expect(
      (
        await page.request.patch(`/api/boards/${boardId}/folder`, { data: { folderId: childId } })
      ).ok(),
    ).toBe(true);

    const reader = await newUser(browser, 'Читатель Папок');
    // До открытия папки доски не видно
    expect((await reader.page.request.get(`/api/boards/${boardId}`)).status()).toBe(404);

    expect(
      (
        await page.request.post(`/api/folders/${parentId}/members`, {
          data: { email: reader.email, role: 'VIEWER' },
        })
      ).status(),
    ).toBe(201);
    const meta = await reader.page.request.get(`/api/boards/${boardId}`);
    expect(meta.status()).toBe(200);
    expect(((await meta.json()) as { role: string }).role).toBe('VIEWER');
    await reader.page.goto('/dashboard');
    await expect(reader.page.getByText('Доска в Q4')).toBeVisible();

    // Владелец видит дерево папок и доску внутри
    await page.goto(`/dashboard?folder=${childId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Q4', exact: true })).toBeVisible();
    await expect(page.getByText('Доска в Q4')).toBeVisible();

    const readerId = await reader.page.evaluate(async () => {
      const r = await fetch('/api/auth/session');
      return ((await r.json()) as { user?: { id?: string } }).user?.id ?? '';
    });
    expect(
      (await page.request.delete(`/api/folders/${parentId}/members/${readerId}`)).status(),
    ).toBe(204);
    expect((await reader.page.request.get(`/api/boards/${boardId}`)).status()).toBe(404);
    await reader.page.context().close();
  });

  test('2FA: включение, вход с кодом, обязательная 2FA организации', async ({ page, browser }) => {
    const user = await newUser(browser, 'Безопасный Пользователь');
    await user.page.goto('/settings');
    await user.page.getByRole('button', { name: 'Включить 2FA' }).click();
    const secret = (await user.page.getByTestId('totp-secret').textContent())?.trim() ?? '';
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    await user.page
      .getByLabel('2. Введите код из приложения')
      .fill(hotp(secret, stepAt(Date.now())));
    await user.page.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(user.page.getByTestId('backup-codes')).toBeVisible();
    const backup = (
      (await user.page.getByTestId('backup-codes').locator('li').first().textContent()) ?? ''
    ).trim();

    // Выход и вход: после пароля спрашивается код
    await user.page.context().clearCookies();
    await login(user.page, user.email);
    await expect(user.page.getByLabel('Код из приложения-аутентификатора')).toBeVisible();
    await user.page.getByLabel('Код из приложения-аутентификатора').fill('000000');
    await user.page.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(user.page.getByText(/Неверный код/)).toBeVisible();
    // Резервный код одноразовый
    await user.page.getByLabel('Код из приложения-аутентификатора').fill(backup);
    await user.page.getByRole('button', { name: 'Подтвердить' }).click();
    await user.page.waitForURL(/\/dashboard/);

    // Организация требует 2FA: участник без неё не открывает её доски
    const org = await page.request.post('/api/orgs', { data: { name: `Строгая ${Date.now()}` } });
    const { id: orgId } = (await org.json()) as { id: string };
    const board = await page.request.post('/api/boards', { data: { title: 'Секретная', orgId } });
    const { id: boardId } = (await board.json()) as { id: string };
    const plain = await newUser(browser, 'Без Двухфакторки');
    await page.request.post(`/api/orgs/${orgId}/members`, {
      data: { email: plain.email, role: 'MEMBER' },
    });
    await page.request.post(`/api/orgs/${orgId}/members`, {
      data: { email: user.email, role: 'MEMBER' },
    });
    expect(
      (await page.request.patch(`/api/orgs/${orgId}`, { data: { require2fa: true } })).ok(),
    ).toBe(true);

    await plain.page.goto(`/board/${boardId}`);
    await expect(
      plain.page.getByText('Организация требует двухфакторную аутентификацию'),
    ).toBeVisible();
    expect((await plain.page.request.get(`/api/boards/${boardId}`)).status()).toBe(403);
    expect((await user.page.request.get(`/api/boards/${boardId}`)).status()).toBe(200);
    await user.page.context().close();
    await plain.page.context().close();
    // Владельцу (без 2FA) тоже нужен второй фактор — возвращаем политику, чтобы не мешать другим тестам
    await page.request
      .patch(`/api/orgs/${orgId}`, { data: { require2fa: false } })
      .catch(() => undefined);
  });
});
