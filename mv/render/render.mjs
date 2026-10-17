// Full render: node render/render.mjs --from 0 --to 110.8 --out ../out/mv.mov [--workers 3] [--w 1920 --h 1080] [--codec prores|h264]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { devServer, launch, openPage, parseArgs } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const W = Number(args.w ?? 1920), H = Number(args.h ?? 1080), FPS = 60;
const workers = Number(args.workers ?? 3);
const out = path.resolve(args.out ?? '../out/mv.mov');
const codec = args.codec ?? 'prores';
const segDir = out + '.segments';
fs.mkdirSync(segDir, { recursive: true });

const server = await devServer();
const browser = await launch();
const probe = await openPage(browser, server.url, { w: W, h: H });
const total = await probe.evaluate(() => window.__mv.totalFrames);
await probe.close();
const from = Math.round(Number(args.from ?? 0) * FPS);
const to = Math.min(total, Math.round(Number(args.to ?? total / FPS) * FPS));
const n = to - from;
console.log(`frames ${from}..${to} (${n}) with ${workers} workers`);

const wss = new WebSocketServer({ port: 0, maxPayload: 64 * 1024 * 1024 });
const wsUrl = `ws://localhost:${wss.address().port}`;
const encArgs = codec === 'h264'
  ? ['-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'animation', '-pix_fmt', 'yuv420p']
  : ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0'];

const chunk = Math.ceil(n / workers);
const segs = [];
let done = 0;
const tStart = Date.now();
const jobs = [];
// each worker connects on its own path: pages can connect out of order
const conns = new Map();
wss.on('connection', (ws, req) => conns.get(req.url)?.(ws));

for (let k = 0; k < workers; k++) {
  const a = from + k * chunk, b = Math.min(to, a + chunk);
  if (a >= b) break;
  const seg = path.join(segDir, `seg_${String(k).padStart(2, '0')}.mov`);
  segs.push(seg);
  jobs.push((async () => {
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', '-vf', 'vflip', ...encArgs, seg], { stdio: ['pipe', 'inherit', 'inherit'] });
    const page = await openPage(browser, server.url, { w: W, h: H });
    const conn = new Promise((res) => conns.set(`/${k}`, res));
    const run = page.evaluate(([a, b, u]) => window.__mv.stream(a, b, u), [a, b, `${wsUrl}/${k}`]);
    const ws = await conn;
    ws.on('message', (data) => {
      const buf = Buffer.from(data);
      const ok = ff.stdin.write(buf.subarray(4));
      const ack = () => { ws.send('k'); done++; if (done % 60 === 0) { const el = (Date.now() - tStart) / 1000; console.log(`${done}/${n} frames  ${(done / el).toFixed(2)} fps  eta ${((n - done) / (done / el) / 60).toFixed(1)} min`); } };
      if (ok) ack(); else ff.stdin.once('drain', ack);
    });
    await run;
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    await page.close();
  })());
}
await Promise.all(jobs);
await browser.close();
await server.close();
wss.close();
const list = path.join(segDir, 'list.txt');
fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n'));
await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { stdio: 'inherit' }).on('close', (c) => (c ? rej(new Error('concat failed')) : res())));
console.log(`wrote ${out} in ${((Date.now() - tStart) / 60000).toFixed(1)} min`);
