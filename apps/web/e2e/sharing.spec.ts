import { expect, test, type Browser, type Page } from '@playwright/test';
import { openNewBoard } from './helpers';

/**
 * Шаринг: владелец — общий пользователь из global-setup (storageState),
 * приглашённые — отдельные браузерные контексты с чистыми cookie.
 */
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const PASSWORD = 'e2e-pass-123';

function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@prostor.test`;
}

/** Контекст без сессии общего пользователя */
async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: 'ru-RU' });
  return context.newPage();
}

/** Регистрация через API + вход через форму (cookie сессии в контексте страницы) */
async function signUp(page: Page, email: string, name: string, callbackUrl = '/dashboard'): Promise<void> {
  const res = await page.request.post('/api/account/register', {
    data: { name, email, password: PASSWORD, confirmPassword: PASSWORD },
  });
  expect(res.status()).toBe(201);
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Войти' }).click();
  const target = new URL(callbackUrl, 'http://localhost').pathname;
  await page.waitForURL((url) => url.pathname === target);
}

function joinPath(url: string): string {
  const u = new URL(url);
  return u.pathname + u.search;
}

async function createLink(page: Page, boardId: string, role: 'EDITOR' | 'VIEWER'): Promise<{ id: string; url: string }> {
  const res = await page.request.post(`/api/boards/${boardId}/invites`, { data: { role, ttl: '1d' } });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; url: string };
}

async function waitSynced(page: Page): Promise<void> {
  await expect(page.getByRole('status')).toContainText('Сохранено', { timeout: 20_000 });
}

test.describe('совместный доступ', () => {
  test('ссылка-приглашение: создание в диалоге, принятие, понижение роли в реальном времени', async ({ page, browser }) => {
    const boardId = await openNewBoard(page, 'Шаринг по ссылке');

    // Владелец создаёт ссылку через ShareDialog
    await page.getByRole('button', { name: 'Поделиться' }).click();
    await page.getByRole('tab', { name: 'Ссылки' }).click();
    await page.getByLabel('Роль').selectOption('EDITOR');
    await page.getByRole('button', { name: 'Создать ссылку' }).click();
    const url = await page.getByTestId('created-invite-url').inputValue();
    expect(url).toContain(`/board/${boardId}/join?token=`);
    await expect(page.getByTestId('invite-list')).toContainText('Редактор');
    await page.keyboard.press('Escape');

    // Гость без аккаунта видит приглашение и предложение войти
    const guest = await freshPage(browser);
    await guest.goto(joinPath(url));
    await expect(guest.getByText('Доска «Шаринг по ссылке»')).toBeVisible();
    await expect(guest.getByRole('link', { name: 'У меня есть аккаунт' })).toBeVisible();

    // Регистрируется, возвращается по callbackUrl и принимает
    await signUp(guest, uniqueEmail('link'), 'Редактор Ссылкин', joinPath(url));
    await guest.getByRole('button', { name: 'Присоединиться к доске' }).click();
    await expect(guest).toHaveURL(new RegExp(`/board/${boardId}$`));
    await waitSynced(guest);
    await expect(guest.getByText('Только просмотр')).toHaveCount(0);

    // Владелец видит нового участника и понижает до читателя
    await page.getByRole('button', { name: 'Поделиться' }).click();
    await page.getByRole('tab', { name: /Участники/ }).click();
    await expect(page.getByTestId('member-row')).toHaveCount(2);
    await page.getByLabel('Роль Редактор Ссылкин').selectOption('VIEWER');
    await expect(page.getByText('Роль изменена: Читатель')).toBeVisible();

    // WS-сервер перепроверил доступ — у гостя без перезагрузки режим просмотра
    await expect(guest.getByText('Только просмотр')).toBeVisible({ timeout: 10_000 });

    // Удаление участника отключает его от доски
    await page.getByRole('button', { name: 'Удалить Редактор Ссылкин' }).click();
    await expect(page.getByTestId('member-row')).toHaveCount(1);
    await expect(guest.getByText(/нет доступа|не найдена/i)).toBeVisible({ timeout: 10_000 });
    await guest.context().close();
  });

  test('приглашение по email через Mailpit', async ({ page, browser }) => {
    const boardId = await openNewBoard(page, 'Шаринг по почте');
    const email = uniqueEmail('mail');

    await page.getByRole('button', { name: 'Поделиться' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Роль').selectOption('VIEWER');
    await page.getByLabel('Сообщение (необязательно)').fill('Посмотри до пятницы');
    await page.getByRole('button', { name: 'Пригласить' }).click();
    await expect(page.getByText('Приглашение отправлено')).toBeVisible({ timeout: 15_000 });

    let inviteUrl: string | undefined;
    await expect
      .poll(async () => {
        const res = await page.request.get(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
        const data = (await res.json()) as { messages?: Array<{ ID: string }> };
        const id = data.messages?.[0]?.ID;
        if (!id) return false;
        const msg = (await (await page.request.get(`${MAILPIT_URL}/api/v1/message/${id}`)).json()) as { Text: string };
        expect(msg.Text).toContain('Посмотри до пятницы');
        inviteUrl = /https?:\/\/\S+\/join\?token=[\w-]+/.exec(msg.Text)?.[0];
        return Boolean(inviteUrl);
      }, { timeout: 15_000 })
      .toBe(true);

    // Чужой аккаунт приглашение по email принять не может
    const stranger = await freshPage(browser);
    await signUp(stranger, uniqueEmail('stranger'), 'Посторонний');
    await stranger.goto(joinPath(inviteUrl ?? ''));
    await expect(stranger.getByText(/отправлено на другой email/)).toBeVisible();
    await stranger.context().close();

    const invitee = await freshPage(browser);
    await signUp(invitee, email, 'Читатель Почтин');
    await invitee.goto(joinPath(inviteUrl ?? ''));
    await invitee.getByRole('button', { name: 'Присоединиться к доске' }).click();
    await expect(invitee).toHaveURL(new RegExp(`/board/${boardId}$`));
    await waitSynced(invitee);
    await expect(invitee.getByText('Только просмотр')).toBeVisible();

    // Читатель не может приглашать других
    const forbidden = await invitee.request.post(`/api/boards/${boardId}/invites`, { data: { role: 'VIEWER' } });
    expect(forbidden.status()).toBe(403);

    await invitee.context().close();
  });

  test('отозванная ссылка недействительна', async ({ page, browser }) => {
    const boardId = await openNewBoard(page, 'Отзыв ссылки');
    const link = await createLink(page, boardId, 'EDITOR');
    const revoke = await page.request.delete(`/api/boards/${boardId}/invites/${link.id}`);
    expect(revoke.status()).toBe(204);

    const guest = await freshPage(browser);
    await signUp(guest, uniqueEmail('revoked'), 'Опоздавший');
    await guest.goto(joinPath(link.url));
    await expect(guest.getByText('Приглашение отозвано')).toBeVisible();
    const accept = await guest.request.post(`/api/boards/${boardId}/join`, {
      data: { token: new URL(link.url).searchParams.get('token') },
    });
    expect(accept.ok()).toBe(false);
    await guest.context().close();
  });

  test('публичная доска открывается без входа, после закрытия — нет', async ({ page, browser }) => {
    const boardId = await openNewBoard(page, 'Публичная доска');
    const pub = await page.request.patch(`/api/boards/${boardId}/visibility`, { data: { visibility: 'PUBLIC_READ' } });
    expect(pub.ok()).toBe(true);

    const anon = await freshPage(browser);
    await anon.goto(`/board/${boardId}`);
    await waitSynced(anon);
    await expect(anon.getByText('Только просмотр')).toBeVisible();
    await expect(anon.getByRole('button', { name: 'Поделиться' })).toHaveCount(0);

    // Закрыли доступ — анонимное подключение разорвано
    const priv = await page.request.patch(`/api/boards/${boardId}/visibility`, { data: { visibility: 'PRIVATE' } });
    expect(priv.ok()).toBe(true);
    await expect(anon.getByText(/нет доступа|не найдена/i)).toBeVisible({ timeout: 10_000 });
    await anon.goto(`/board/${boardId}`);
    await expect(anon).toHaveURL(/\/login\?callbackUrl=/);
    await anon.context().close();
  });

  test('настройки доски и аккаунта', async ({ page }) => {
    const boardId = await openNewBoard(page, 'Настраиваемая');
    await page.goto(`/board/${boardId}/settings`);
    await page.getByLabel('Название', { exact: true }).fill('Переименованная');
    await page.getByLabel('Описание').fill('Описание из e2e');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText('Сохранено')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Переименованная/ })).toBeVisible();
    await expect(page.getByTestId('member-row')).toHaveCount(1);

    await page.getByLabel('Название доски').fill('Переименованная');
    await page.getByRole('button', { name: 'Удалить доску' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const gone = await page.request.get(`/api/boards/${boardId}`);
    expect(gone.status()).toBe(404);

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Настройки аккаунта' })).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveValue(/e2e-shared-/);
  });

  test('смена пароля сохраняет текущую сессию', async ({ browser }) => {
    const user = await freshPage(browser);
    const email = uniqueEmail('pwd');
    await signUp(user, email, 'Меняю Пароль');
    await user.goto('/settings');
    await user.getByLabel('Текущий пароль').fill('wrong-pass-999');
    await user.getByLabel('Новый пароль').fill('new-pass-456');
    await user.getByLabel('Повторите пароль').fill('new-pass-456');
    await user.getByRole('button', { name: 'Сменить пароль' }).click();
    await expect(user.getByText('Неверный текущий пароль')).toBeVisible();

    await user.getByLabel('Текущий пароль').fill(PASSWORD);
    await user.getByRole('button', { name: 'Сменить пароль' }).click();
    await expect(user.getByText(/Пароль изменён/)).toBeVisible({ timeout: 15_000 });
    await user.goto('/dashboard');
    await expect(user).toHaveURL(/\/dashboard$/);
    await user.context().close();
  });
});
