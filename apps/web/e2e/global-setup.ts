import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';
import { Redis } from 'ioredis';

/** Сессия общего тестового пользователя для тестов холста (см. playwright.config.ts) */
export const STORAGE_STATE = 'e2e/.auth/user.json';

/**
 * Сбрасывает счётчики rate-limit перед прогоном: e2e-тесты много раз
 * регистрируются и входят с одного IP и иначе упираются в лимиты
 * (регистрация — 10 в час), которые в проде как раз и должны срабатывать.
 */
async function resetRateLimits(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'rl:*', 'COUNT', 500);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  } catch (error: unknown) {
    console.warn(
      '[e2e] не удалось сбросить rate-limit в Redis — тесты могут упереться в лимиты',
      error,
    );
  } finally {
    redis.disconnect();
  }
}

/**
 * Один пользователь на весь прогон вместо регистрации в каждом тесте:
 * быстрее и не упирается в лимит регистраций с одного IP.
 */
async function createSharedUser(baseURL: string): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  const email = `e2e-shared-${Date.now()}@prostor.test`;
  await page.goto('/register');
  await page.getByLabel('Имя').fill('E2E Тестер');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('e2e-pass-123');
  await page.getByLabel('Повторите пароль').fill('e2e-pass-123');
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 60_000 });
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
  await browser.close();
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  await resetRateLimits();
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3000';
  await createSharedUser(baseURL);
}
