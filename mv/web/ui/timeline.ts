import { audio } from '../../src/engine/audio';
import { at, BAR, BEAT, DURATION, FPS, gridPos } from '../../src/engine/time';
import { lyricLines, slotOf } from '../../src/overlay/state';
import { registry } from '../../src/scenes';
import { app } from './app';
import { CHAPTERS, clockText, el, p2, put, timecode } from './film';

const LAST = Math.round(DURATION * FPS) - 1;
const lanes = el('lanes');
const head = el('playhead');
const ruler = el<HTMLCanvasElement>('ruler');
const wave = el<HTMLCanvasElement>('wave');
const readout = [el('t-time'), el('t-frame'), el('t-bar')];
let width = 0;
let headX = -1;
let current = -1;

function clip(lane: string, a: number, b: number, label: string, title: string) {
  const c = document.createElement('div');
  c.className = 'clip';
  c.style.left = `${(a / DURATION) * 100}%`;
  c.style.width = `${((b - a) / DURATION) * 100}%`;
  c.textContent = label;
  c.title = title;
  el(lane).append(c);
  return c;
}

const sceneClips = registry.map((s, k) => clip('scene-clips', s.start, s.end, `${p2(k)} ${CHAPTERS[s.id]}`, `${CHAPTERS[s.id]} · ${clockText(s.start)}-${clockText(s.end)}`));

/** Ruler and audio, redrawn when the lanes resize. */
function draw() {
  width = lanes.clientWidth;
  headX = -1;
  const dpr = devicePixelRatio;
  for (const c of [ruler, wave]) {
    c.width = Math.round(c.clientWidth * dpr);
    c.height = Math.round(c.clientHeight * dpr);
  }
  let g = ruler.getContext('2d')!;
  let { width: w, height: h } = ruler;
  const px = w / DURATION;
  g.fillStyle = 'rgba(238, 236, 228, 0.4)';
  g.font = `${10 * dpr}px 'Geist Mono'`;
  let every = 1;
  while (every * BAR * px < 26 * dpr) every *= 2;
  for (let b = 1; at(b) < DURATION; b++) {
    const x = Math.round(at(b) * px);
    const major = (b - 1) % every === 0;
    g.fillRect(x, major ? 0 : h * 0.5, dpr, h);
    if (major) g.fillText(String(b), x + 3 * dpr, 9 * dpr);
    if (BEAT * px >= 5 * dpr) for (let k = 1; k < 4; k++) g.fillRect(Math.round(x + k * BEAT * px), h * 0.8, dpr, h);
  }
  g = wave.getContext('2d')!;
  ({ width: w, height: h } = wave);
  const master = audio.curves.master;
  const per = (DURATION * audio.envFps) / w;
  g.fillStyle = 'rgba(238, 236, 228, 0.3)';
  for (let x = 0; master && x < w; x++) {
    let m = 0;
    for (let i = Math.floor(x * per); i < (x + 1) * per; i++) m = Math.max(m, master[i] ?? 0);
    const y = Math.max(dpr / 2, m * (h / 2 - dpr));
    g.fillRect(x, h / 2 - y, 1, 2 * y);
  }
  g.fillStyle = 'rgba(238, 236, 228, 0.65)';
  for (const t of audio.cue('kick')) g.fillRect(Math.round((t / DURATION) * w), h - 3 * dpr, dpr, 3 * dpr);
}

/** Lyric clips and the drawn tracks, once the timing has loaded. */
export function build() {
  const lines = lyricLines();
  for (let i = 0; i < lines.length; i++) {
    const [a, b] = slotOf(lines, i);
    clip('lyric-clips', a, b, lines[i].id, `${lines[i].text} · ${lines[i].english}`);
  }
  new ResizeObserver(draw).observe(lanes);
}

/** Every frame: moves only when the playhead changes device pixel. */
export function playhead(t: number) {
  const x = Math.round((t / DURATION) * width * devicePixelRatio) / devicePixelRatio;
  if (x === headX) return;
  headX = x;
  head.style.transform = `translateX(${x}px)`;
}

/** The panels' rate: time readout and the current scene clip. */
export function update(f: number) {
  const g = gridPos(f / FPS);
  put(readout[0], timecode(f));
  put(readout[1], `F ${f}`);
  put(readout[2], `${p2(g.bar)} · ${g.beat}`);
  const k = sceneAt(f / FPS);
  if (k === current) return;
  sceneClips[current]?.classList.remove('on');
  sceneClips[k].classList.add('on');
  current = k;
}

const sceneAt = (t: number) => Math.max(0, registry.findLastIndex((s) => t >= s.start));
const seekFrame = (f: number) => app.seek((Math.min(Math.max(f, 0), LAST) + 0.5) / FPS);
const stop = () => app.playing && app.toggle();

export function stepFrames(n: number) {
  stop();
  seekFrame(Math.floor(app.time() * FPS) + n);
}

export function stepBeats(n: number) {
  stop();
  const per = BEAT * FPS;
  const b = Math.floor(app.time() * FPS) / per;
  seekFrame((n > 0 ? Math.floor(b) + n : Math.ceil(b) + n) * per);
}

export function stepScenes(n: number) {
  const t = app.time();
  const k = sceneAt(t);
  // back from inside a scene goes to its start first, like a track skip
  const to = n < 0 && t - registry[k].start > 0.5 ? k : k + n;
  if (registry[to]) app.seek(registry[to].start);
}

// scrub anywhere on the lanes; playback resumes when the drag ends
let left = 0;
let resume = false;
const scrub = (e: PointerEvent) => app.seek(Math.min(Math.max((e.clientX - left) / width, 0), 1) * DURATION);
lanes.addEventListener('pointerdown', (e) => {
  if (!app.ready) return;
  lanes.setPointerCapture(e.pointerId);
  left = lanes.getBoundingClientRect().left;
  resume = app.playing;
  stop();
  scrub(e);
});
lanes.addEventListener('pointermove', (e) => lanes.hasPointerCapture(e.pointerId) && scrub(e));
lanes.addEventListener('pointerup', () => resume && app.toggle());

for (const [id, fn] of [
  ['prev-scene', () => stepScenes(-1)],
  ['prev-beat', () => stepBeats(-1)],
  ['prev-frame', () => stepFrames(-1)],
  ['toggle', () => app.toggle()],
  ['next-frame', () => stepFrames(1)],
  ['next-beat', () => stepBeats(1)],
  ['next-scene', () => stepScenes(1)],
] as const)
  el(id).addEventListener('click', () => app.ready && fn());
