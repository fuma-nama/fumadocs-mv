import { defineConfig } from 'vite';

// The film as a static Vite app: `pnpm build:web` writes web/dist, deployable under any path.
// web/public holds the converted assets the film loads (`pnpm assets:web` regenerates them).
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  server: { port: 5182, fs: { strict: false }, hmr: false },
  preview: { port: 5183 },
  build: { outDir: 'dist', emptyOutDir: true, assetsDir: '_app' },
});
