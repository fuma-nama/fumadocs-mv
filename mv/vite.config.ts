import { defineConfig } from 'vite';

export default defineConfig({
  // hmr off: many agents save files while headless renders run; reloads would abort them
  server: { port: 5180, strictPort: false, fs: { strict: false }, hmr: false },
  preview: { port: 5181 },
});
