// Mux the rendered picture with the soundtrack and encode delivery files.
// node render/master.mjs --video ../out/mv.mov --audio ../music/out/readme.wav --out ../out/README-fumadocs-mv
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const video = path.resolve(args.video ?? '../out/mv.mov');
const audio = path.resolve(args.audio ?? '../music/out/readme.wav');
const base = path.resolve(args.out ?? '../out/README-fumadocs-mv');
const hasAudio = fs.existsSync(audio);

const run = (a) => new Promise((res, rej) => {
  console.log('ffmpeg', a.join(' '));
  spawn('ffmpeg', ['-y', '-loglevel', 'error', '-stats', ...a], { stdio: 'inherit' }).on('close', (c) => (c ? rej(new Error('ffmpeg failed')) : res()));
});

const aIn = hasAudio ? ['-i', audio] : [];
const aMap = hasAudio ? ['-map', '0:v:0', '-map', '1:a:0', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000'] : ['-map', '0:v:0'];
// H.264 delivery (universal), tuned for flat graphics and fine lines
await run(['-i', video, ...aIn, ...aMap, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-shortest', base + '.mp4']);
// share copy: fits social upload limits (X: 512 MB) at near-master quality
await run(['-i', video, ...aIn, ...aMap, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-maxrate', '28M', '-bufsize', '56M', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-shortest', base + '-share.mp4']);
// small preview for quick review
await run(['-i', video, ...aIn, ...aMap, '-vf', 'scale=960:-2', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-shortest', base + '-preview.mp4']);
console.log('done:', base + '.mp4', base + '-share.mp4', base + '-preview.mp4', hasAudio ? '(with audio)' : '(no audio yet)');
