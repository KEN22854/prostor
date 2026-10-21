import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Корневой конфиг: один прогон юнит-тестов по всем workspaces.
// E2E (Playwright) живут в apps/web/e2e и запускаются отдельно.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: r('./apps/web/src/') },
      // `server-only` бросает исключение вне React Server-окружения;
      // в юнит-тестах серверных модулей он не нужен.
      { find: 'server-only', replacement: r('./apps/web/src/test/server-only-stub.ts') },
    ],
  },
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**', 'apps/web/e2e/**'],
    environment: 'node',
  },
});
