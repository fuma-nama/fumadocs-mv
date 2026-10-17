// quick look: node capture/shot.mjs <path> <out.png> [w] [h] [mode] [dpr]
import { chromium } from 'playwright';
const [, , path = '/docs/getting-started/introduction', out = 'shot.png', w = '1440', h = '810', mode = 'light', dpr = '1'] = process.argv;
const base = process.env.PLATES_URL ?? 'http://localhost:5310';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr, colorScheme: mode });
await ctx.addInitScript((m) => localStorage.setItem('theme', m), mode);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
await page.goto(base + path, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(async () => {
  for (const img of document.images) img.loading = 'eager';
  await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
});
await page.waitForTimeout(800);
const full = process.env.FULL === '1';
if (full) console.log('height', await page.evaluate(() => document.documentElement.scrollHeight));
await page.screenshot({ path: out, fullPage: full });
await browser.close();
console.log(out);
