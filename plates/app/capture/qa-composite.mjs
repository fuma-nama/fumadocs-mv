// QA: composite layers in order over the first one and diff against a reference frame.
// node capture/qa-composite.mjs <frame.png> <layer1.png> <layer2.png> ...  -> prints diff stats
import fs from 'node:fs';
import { chromium } from 'playwright';

const [, , frame, ...layers] = process.argv;
const toUrl = (p) => `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
const browser = await chromium.launch();
const page = await browser.newPage();
const res = await page.evaluate(
  async ({ frame, layers }) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const ref = await load(frame);
    const w = ref.naturalWidth, h = ref.naturalHeight;
    const a = new OffscreenCanvas(w, h).getContext('2d');
    for (const l of layers) a.drawImage(await load(l), 0, 0);
    const b = new OffscreenCanvas(w, h).getContext('2d');
    b.drawImage(ref, 0, 0);
    const da = a.getImageData(0, 0, w, h).data, db = b.getImageData(0, 0, w, h).data;
    let max = 0, sum = 0, over8 = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d > max) max = d;
      sum += d;
      if (d > 8) over8++;
    }
    return { w, h, max, mean: sum / (w * h), over8 };
  },
  { frame: toUrl(frame), layers: layers.map(toUrl) },
);
console.log(JSON.stringify(res));
await browser.close();
