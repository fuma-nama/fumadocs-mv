import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Reuse a running dev server (MV_URL or :5180) or start a private one. */
export async function devServer() {
  const url = process.env.MV_URL ?? 'http://localhost:5180';
  try {
    const r = await fetch(url + '/src/main.ts', { signal: AbortSignal.timeout(1500) });
    if (r.ok) return { url, close: async () => {} };
  } catch {}
  const server = await createServer({ root, logLevel: 'error', server: { port: 0, strictPort: false } });
  await server.listen();
  const addr = server.httpServer.address();
  return { url: `http://localhost:${addr.port}`, close: () => server.close() };
}

export async function launch() {
  return chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--js-flags=--max-old-space-size=8192'] });
}

/** Open the MV page in render mode and wait until assets are ready. */
export async function openPage(browser, url, { w = 1920, h = 1080, only } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  const q = new URLSearchParams({ mode: 'render', w: String(w), h: String(h) });
  if (only) q.set('only', only);
  await page.goto(`${url}/?${q}`);
  await page.waitForFunction(() => window.__mv);
  await page.evaluate(() => window.__mv.ready);
  return page;
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[k] = v;
    } else out._.push(a);
  }
  return out;
}

export function dataUrlToBuffer(d) {
  return Buffer.from(d.slice(d.indexOf(',') + 1), 'base64');
}
