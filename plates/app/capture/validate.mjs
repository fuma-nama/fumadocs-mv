// QA: every file referenced by out/manifest.json exists; PNG sizes match `size` where given.
// node capture/validate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { OUT } from './lib.mjs';

const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
let files = 0;
const missing = [];
const sizeErrors = [];
function pngSize(file) {
  const b = Buffer.alloc(24);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, b, 0, 24, 0);
  fs.closeSync(fd);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
function walk(v, ctx) {
  if (typeof v === 'string') {
    if (/\.(png|json|jsonl)$/.test(v) && !v.includes(' ') && !v.startsWith('http')) {
      const pattern = v.includes('%04d');
      const f = path.join(OUT, pattern ? v.replace('%04d', '0000') : v);
      files++;
      if (!fs.existsSync(f)) missing.push(`${ctx}: ${v}`);
    }
    return;
  }
  if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${ctx}[${i}]`));
  if (v && typeof v === 'object') {
    if (typeof v.path === 'string' && v.path.endsWith('.png') && Array.isArray(v.size) && fs.existsSync(path.join(OUT, v.path))) {
      const [w, h] = pngSize(path.join(OUT, v.path));
      if (w !== v.size[0] || h !== v.size[1]) sizeErrors.push(`${ctx}: ${v.path} is ${w}x${h}, manifest says ${v.size}`);
    }
    for (const [k, x] of Object.entries(v)) {
      if (['text', 'href', 'alt', 'src', 'label', 'value', 'title', 'url'].includes(k)) continue;
      walk(x, `${ctx}.${k}`);
    }
  }
}
walk(manifest, 'manifest');
console.log(`${files} file references checked, ${missing.length} missing, ${sizeErrors.length} size mismatches`);
for (const m of missing.slice(0, 30)) console.log('MISSING', m);
for (const s of sizeErrors.slice(0, 30)) console.log('SIZE', s);
process.exit(missing.length || sizeErrors.length ? 1 : 0);
