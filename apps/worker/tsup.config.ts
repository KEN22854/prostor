import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // См. apps/ws-server/tsup.config.ts: node_modules — внешние, workspaces — в бандл
  skipNodeModulesBundle: true,
  noExternal: [/^@prostor\//],
});
