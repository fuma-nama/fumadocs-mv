// crop a region of a png (device px) to a new png: node capture/crop.mjs <in.png> <out.png> x y w h
import fs from 'node:fs';
import { chromium } from 'playwright';
const [, , inp, outp, x, y, w, h] = process.argv;
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: +w, height: +h } });
const src = `data:image/png;base64,${fs.readFileSync(inp).toString('base64')}`;
await page.setContent(`<body style="margin:0;background:transparent"><div style="width:${w}px;height:${h}px;overflow:hidden;position:relative"><img src="${src}" style="position:absolute;left:${-x}px;top:${-y}px"></div></body>`);
await page.evaluate(() => document.images[0].decode());
await page.screenshot({ path: outp, omitBackground: true });
await b.close();
