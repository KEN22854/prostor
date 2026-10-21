import { expect, test } from '@playwright/test';

test('главная страница открывается', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Начать бесплатно' })).toBeVisible();
});

test('healthcheck отвечает', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: 'ok' });
});
