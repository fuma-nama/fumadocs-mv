// Record the characters each font file renders in a playthrough of every frame into web/glyphs.json,
// which build-assets.mjs subsets the fonts to. Re-run after changing drawn text: node web/record-glyphs.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { launch } from '../render/lib.mjs';

const web = import.meta.dirname;
const server = await createServer({ configFile: path.join(web, 'vite.config.ts'), logLevel: 'error', server: { port: 0 } });
await server.listen();
const browser = await launch();
const page = await browser.newPage();
await page.addInitScript(() => {
  const faces = (window.__faces = []);
  const text = (window.__text = {});
  const Face = FontFace;
  window.FontFace = function (family, src, desc) {
    faces.push({ family, file: src.slice(4, -1), weight: String(desc.weight ?? 400) });
    return new Face(family, src, desc);
  };
  for (const k of ['fillText', 'strokeText', 'measureText']) {
    const f = CanvasRenderingContext2D.prototype[k];
    CanvasRenderingContext2D.prototype[k] = function (s, ...a) {
      (text[this.font] ??= new Set()).add(String(s));
      return f.call(this, s, ...a);
    };
  }
});
await page.goto(`${server.resolvedUrls.local[0]}?mode=render`);
await page.waitForFunction(() => window.__mv);
const n = await page.evaluate(() => window.__mv.ready.then(() => window.__mv.totalFrames));
for (let a = 0; a < n; a += 600) {
  await page.evaluate(async ([a, b]) => {
    for (let i = a; i < b; i++) await window.__mv.engine.renderFrame(i);
  }, [a, Math.min(n, a + 600)]);
}
const { faces, text } = await page.evaluate(() => {
  const text = {};
  for (const [font, set] of Object.entries(window.__text)) text[font] = [...set].join('');
  return { faces: window.__faces, text };
});
await browser.close();
await server.close();

const files = faces.map((f) => path.join(web, '../public', f.file));
const code = 'import sys, json\nfrom fontTools.ttLib import TTFont\nprint(json.dumps([list(TTFont(f).getBestCmap()) for f in sys.argv[1:]]))';
const cmaps = JSON.parse(execFileSync('uvx', ['--from', 'fonttools[woff]==4.66.1', 'python', '-c', code, ...files], { encoding: 'utf8' }));
const families = {};
for (let i = 0; i < faces.length; i++) {
  const [lo, hi = lo] = faces[i].weight.split(' ').map(Number);
  (families[faces[i].family] ??= []).push({ file: faces[i].file, lo, hi, cmap: new Set(cmaps[i]) });
}

// CSS font matching by weight: below 400 lighter first, above 500 heavier first, 400–500 up to 500 first
function face(list, w) {
  const rank = (f) => {
    if (f.lo <= w && w <= f.hi) return 0;
    const up = f.lo > w;
    const d = up ? f.lo - w : w - f.hi;
    if (w < 400) return up ? 2000 + d : d;
    if (w > 500 || (up && f.lo <= 500)) return up ? d : 2000 + d;
    return up ? 4000 + d : 2000 + d;
  };
  let best = list[0];
  for (const f of list) if (rank(f) < rank(best)) best = f;
  return best;
}

// each character goes to the first face in the stack that has it, as the browser picks it
const out = {};
for (const [font, chars] of Object.entries(text)) {
  const [, pre, stack] = font.match(/^(.*?)\s*\d[\d.]*px\s+(.*)$/);
  const w = pre.includes('bold') ? 700 : Number(pre.match(/\d+/)?.[0] ?? 400);
  for (const ch of new Set(chars)) {
    for (const family of stack.split(',')) {
      const list = families[family.trim().replace(/^"|"$/g, '')];
      if (!list) break;
      const f = face(list, w);
      if (!f.cmap.has(ch.codePointAt(0))) continue;
      (out[f.file] ??= new Set()).add(ch);
      break;
    }
  }
}
const glyphs = {};
for (const f of Object.keys(out).sort()) glyphs[f] = [...out[f]].sort().join('');
fs.writeFileSync(path.join(web, 'glyphs.json'), JSON.stringify(glyphs, null, 2) + '\n');
