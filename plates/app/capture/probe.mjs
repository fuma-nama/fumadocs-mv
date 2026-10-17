// print a DOM outline of the layout skeleton: node capture/probe.mjs <path> [w] [h] [mode] [depth]
import { chromium } from 'playwright';

const [, , path = '/docs/getting-started/introduction', w = '1440', h = '810', mode = 'light', depth = '6'] = process.argv;
const base = process.env.PLATES_URL ?? 'http://localhost:5310';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, colorScheme: mode });
await ctx.addInitScript((m) => localStorage.setItem('theme', m), mode);
const page = await ctx.newPage();
await page.goto(base + path, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const out = await page.evaluate((maxDepth) => {
  const lines = [];
  function walk(el, d) {
    if (d > maxDepth) return;
    const r = el.getBoundingClientRect();
    const id = el.id ? '#' + el.id : '';
    const data = [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}${a.value ? '=' + a.value.slice(0, 20) : ''}]`).join('');
    const cls = typeof el.className === 'string' ? el.className.slice(0, 90) : '';
    lines.push(`${'  '.repeat(d)}${el.tagName.toLowerCase()}${id}${data} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}  .${cls}`);
    for (const c of el.children) walk(c, d + 1);
  }
  walk(document.body, 0);
  return lines.join('\n');
}, +depth);
console.log(out);
await browser.close();
