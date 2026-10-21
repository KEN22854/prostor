import { defineConfig } from 'tsup';

// Workspaces (@prostor/*) поставляются как TS-исходники — вшиваем их в бандл.
// Остальные зависимости (yjs, ws, @prisma/client) — внешние из node_modules:
// yjs обязан быть одним экземпляром, а Prisma нельзя бандлить из-за движка.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Пакеты из node_modules не вшиваем: Prisma и CommonJS-модули ломают ESM-бандл
  // («Dynamic require of "fs" is not supported»). Бандлятся только TS-исходники workspaces.
  skipNodeModulesBundle: true,
  noExternal: [/^@prostor\//],
});
