// Copy the files the film loads (files.txt) into web/.public, converting where the web build ships
// another format, and write web/asset-map.json (public path → shipped path) for the player.
// Files newer than their source are kept; delete web/.public to redo them after changing a setting.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const web = import.meta.dirname;
const pub = path.join(web, '../public');
const out = path.join(web, '.public');
const glyphsFile = path.join(web, 'glyphs.json');
const glyphs = JSON.parse(fs.readFileSync(glyphsFile, 'utf8'));
const SHIP = { '.wav': '.m4a', '.png': '.webp', '.jpg': '.webp', '.ttf': '.woff2' };
let ascii = '';
for (let c = 32; c < 127; c++) ascii += String.fromCharCode(c);
// pyftsubset, keeping variation regions no glyph uses: Chromium on macOS measures a font whose HVAR
// has none differently (JetBrains Mono)
const SUBSET = 'from fontTools.subset import main\nfrom fontTools.ttLib.tables import otTables\notTables.VarStore.prune_regions = lambda *a, **k: None\nmain()';
// photos: at least 55 dB against the originals in every frame of the film
const LOSSY = ['-quiet', '-q', '90', '-m', '6', '-sharp_yuv'];

const map = {};
const jobs = [];
const shipped = new Set();
for (const file of fs.readFileSync(path.join(web, 'files.txt'), 'utf8').split('\n')) {
  if (!file) continue;
  const ext = path.extname(file);
  const ship = SHIP[ext] ? file.slice(0, -ext.length) + SHIP[ext] : file;
  const src = path.join(pub, file);
  const dst = path.join(out, ship);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (ship !== file) map[file] = ship;
  if (ext === '.ttf' && !glyphs[file]) throw new Error(`${file} is not in glyphs.json: run web/record-glyphs.mjs`);
  shipped.add(dst);
  const since = Math.max(fs.statSync(src).mtimeMs, ext === '.ttf' ? fs.statSync(glyphsFile).mtimeMs : 0);
  if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= since) continue;
  if (ext === '.wav') jobs.push(() => run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-c:a', 'aac_at', '-b:a', '256k', dst]));
  // Lossless (-exact keeps the colour under transparent pixels, which texture filtering reads), or lossy
  // where that halves the file, which only the photo-like captures do
  else if (ext === '.png') jobs.push(async () => {
    await run('cwebp', ['-quiet', '-lossless', '-z', '9', '-exact', src, '-o', dst]);
    await run('cwebp', [...LOSSY, '-exact', src, '-o', `${dst}~`]);
    if (fs.statSync(`${dst}~`).size < fs.statSync(dst).size / 2) fs.renameSync(`${dst}~`, dst);
    else fs.rmSync(`${dst}~`);
  });
  else if (ext === '.jpg') jobs.push(() => run('cwebp', [...LOSSY, src, '-o', dst]));
  // The glyphs the film draws (record-glyphs.mjs) plus printable ASCII: the player's text and the intro's
  // random glyphs are ASCII, and Chromium on macOS renders small text differently without a font's Latin
  // letters, or without its glyph names. Axes, metrics, layout features and the name table (OFL notice) stay.
  else if (ext === '.ttf') jobs.push(() => run('uvx', ['--from', 'fonttools[woff]==4.66.1', 'python', '-c', SUBSET, src, `--text=${glyphs[file]}${ascii}`, '--glyph-names', '--name-IDs=*', '--flavor=woff2', `--output-file=${dst}`]));
  else if (ext === '.json') fs.writeFileSync(dst, JSON.stringify(JSON.parse(fs.readFileSync(src, 'utf8'))));
  else fs.copyFileSync(src, dst);
}
await Promise.all(Array.from({ length: Math.ceil(os.availableParallelism() / 2) }, async () => {
  while (jobs.length) await jobs.shift()();
}));
for (const f of fs.readdirSync(out, { recursive: true })) {
  const p = path.join(out, f);
  if (!shipped.has(p) && fs.statSync(p).isFile()) fs.rmSync(p);
}
fs.writeFileSync(path.join(web, 'asset-map.json'), JSON.stringify(map));
