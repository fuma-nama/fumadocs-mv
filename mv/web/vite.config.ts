import { defineConfig } from 'vite';

// The film as a static site: `pnpm build:web` writes web/dist, deployable under any path.
export default defineConfig(({ command }) => ({
  root: import.meta.dirname,
  base: './',
  // the build ships only what the film loads (web/build-assets.mjs); dev serves the originals
  publicDir: command === 'build' ? '.public' : '../public',
  server: { port: 5182, fs: { strict: false }, hmr: false },
  preview: { port: 5183 },
  build: { outDir: 'dist', emptyOutDir: true, assetsDir: '_app' },
}));
