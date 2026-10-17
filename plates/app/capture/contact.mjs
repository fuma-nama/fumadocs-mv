// contact sheet: node capture/contact.mjs <out.png> <cols> <cellWidth> <img...>
// alpha images are shown over a checkerboard. Labels = path relative to plates/out.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { OUT } from './lib.mjs';

const [, , outFile, cols = '3', cell = '480', ...imgs] = process.argv;
const items = imgs.map((p) => {
  const abs = path.resolve(p);
  const data = fs.readFileSync(abs).toString('base64');
  return { label: path.relative(OUT, abs), src: `data:image/png;base64,${data}` };
});
const html = `<!doctype html><html><head><style>
body { margin: 0; padding: 12px; background: #888; font: 12px/1.3 ui-monospace, monospace; color: #fff; }
.grid { display: grid; grid-template-columns: repeat(${cols}, ${cell}px); gap: 12px; }
.c { background-color: #fff; background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%); background-size: 16px 16px; background-position: 0 0, 0 8px, 8px -8px, -8px 0; }
img { display: block; width: 100%; }
.l { padding: 3px 0 0; word-break: break-all; }
</style></head><body><div class="grid">${items.map((i) => `<div><div class="c"><img src="${i.src}"></div><div class="l">${i.label}</div></div>`).join('')}</div></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +cols * (+cell + 12) + 12, height: 400 } });
await page.setContent(html);
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
await page.screenshot({ path: outFile, fullPage: true });
await browser.close();
console.log(outFile);
