// Contact sheet: node render/sheet.mjs --from 12.8 --to 25.6 --step 0.4 [--times a,b,c] --cols 6 --cell 400 --out sheet.jpg [--only id]
import fs from 'node:fs';
import path from 'node:path';
import { devServer, launch, openPage, parseArgs, dataUrlToBuffer } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
let times;
if (args.times) times = args.times.split(',').map(Number);
else {
  const from = Number(args.from ?? 0), to = Number(args.to ?? from + 3.2), step = Number(args.step ?? 0.4);
  times = [];
  for (let t = from; t < to - 1e-9; t += step) times.push(Math.round(t * 1000) / 1000);
}
const out = args.out ?? 'sheet.jpg';
const server = await devServer();
const browser = await launch();
try {
  const page = await openPage(browser, server.url, { w: Number(args.w ?? 1920), h: Number(args.h ?? 1080), only: args.only });
  const t0 = Date.now();
  const d = await page.evaluate(([times, cols, cell]) => window.__mv.sheet(times, cols, cell), [times, Number(args.cols ?? 4), Number(args.cell ?? 480)]);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, dataUrlToBuffer(d));
  console.log(`${out}  ${times.length} frames (${Date.now() - t0} ms)`);
} finally {
  await browser.close();
  await server.close();
}
