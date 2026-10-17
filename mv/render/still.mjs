// Render still frames: node render/still.mjs --t 12.8 [--t2 ...] --out dir|file.png [--w 1920 --h 1080] [--only intro,read]
import fs from 'node:fs';
import path from 'node:path';
import { devServer, launch, openPage, parseArgs, dataUrlToBuffer } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const times = (args.t ?? '0').split(',').map(Number);
const out = args.out ?? 'still.png';
const server = await devServer();
const browser = await launch();
try {
  const page = await openPage(browser, server.url, { w: Number(args.w ?? 1920), h: Number(args.h ?? 1080), only: args.only });
  for (const t of times) {
    const t0 = Date.now();
    const d = await page.evaluate((t) => window.__mv.still(t, 'png'), t);
    const file = times.length === 1 && out.endsWith('.png') ? out : path.join(out, `still_${t.toFixed(3)}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, dataUrlToBuffer(d));
    console.log(`${file}  (${Date.now() - t0} ms)`);
  }
} finally {
  await browser.close();
  await server.close();
}
