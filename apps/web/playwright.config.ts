import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  // Dev-сервер компилирует роуты по запросу и обслуживает несколько контекстов
  // на тест (шаринг) — при 8+ воркерах ожидания по 5 с начинают «плавать»
  workers: process.env.CI ? 2 : 4,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    locale: 'ru-RU',
  },
  projects: [
    // Регистрация, вход, сброс пароля — с чистой сессией
    {
      name: 'auth',
      testMatch: /(auth|smoke)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Холст и инструменты — под общим пользователем из global-setup
    {
      name: 'board',
      testIgnore: /(auth|smoke)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
    },
  ],
  // Web поднимается сам — production-сборка (build:e2e + start:e2e): dev-сервер с
  // компиляцией по требованию и HMR не выдерживает параллельных многоконтекстных
  // сценариев. WS-сервер и worker запускаются отдельно (npm run dev:ws / dev:worker).
  // В CI — уже запущенный стек (E2E_BASE_URL).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build:e2e && npm run start:e2e',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 300_000,
      },
});
