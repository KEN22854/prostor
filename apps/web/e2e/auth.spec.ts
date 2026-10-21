import { expect, test } from '@playwright/test';

/**
 * Требует запущенной инфраструктуры (Postgres, Redis, Mailpit) и применённых миграций.
 * Mailpit API (http://localhost:8025) используется, чтобы достать ссылку сброса пароля.
 */
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@prostor.test`;
}

test.describe('авторизация', () => {
  test('регистрация → дашборд → выход → вход', async ({ page }) => {
    const email = uniqueEmail();
    const password = 'e2e-pass-123';

    await page.goto('/register');
    await page.getByLabel('Имя').fill('E2E Тестер');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByLabel('Повторите пароль').fill(password);
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Доски' })).toBeVisible();
    await expect(page.getByText('E2E Тестер')).toBeVisible();

    await page.getByRole('button', { name: 'Выйти' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('неверный пароль показывает ошибку', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@prostor.test');
    await page.getByLabel('Пароль', { exact: true }).fill('wrong-pass-1');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByText('Неверный email или пароль')).toBeVisible();
  });

  test('защищённая страница редиректит на вход с callbackUrl', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard/);
  });

  test('восстановление пароля по ссылке из письма', async ({ page, request }) => {
    const email = uniqueEmail();
    const register = await request.post('/api/account/register', {
      data: { name: 'Reset', email, password: 'old-pass-123', confirmPassword: 'old-pass-123' },
    });
    expect(register.status()).toBe(201);

    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Отправить ссылку' }).click();
    // Первый запрос в dev-режиме ждёт компиляции роута — даём запас
    await expect(page.getByRole('status')).toContainText(email, { timeout: 15_000 });

    // Достаём письмо из Mailpit
    let resetUrl: string | undefined;
    await expect
      .poll(async () => {
        const res = await request.get(
          `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        );
        const data = (await res.json()) as { messages?: Array<{ ID: string }> };
        const id = data.messages?.[0]?.ID;
        if (!id) return false;
        const msg = (await (await request.get(`${MAILPIT_URL}/api/v1/message/${id}`)).json()) as {
          Text: string;
        };
        resetUrl = /https?:\/\/\S+\/reset-password\?token=[\w-]+/.exec(msg.Text)?.[0];
        return Boolean(resetUrl);
      })
      .toBe(true);

    await page.goto(new URL(resetUrl ?? '').pathname + new URL(resetUrl ?? '').search);
    await page.getByLabel('Новый пароль').fill('new-pass-456');
    await page.getByLabel('Повторите пароль').fill('new-pass-456');
    await page.getByRole('button', { name: 'Сохранить пароль' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill('new-pass-456');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
