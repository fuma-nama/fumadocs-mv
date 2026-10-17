import { loadFonts } from '../src/engine/draw2d';
import { Engine } from '../src/engine/engine';
import { explore } from '../src/engine/explore';
import { stream } from '../src/engine/stream';
import { DURATION, FPS } from '../src/engine/time';
import { assetUrl, setAssetMap } from '../src/engine/url';
import assetMap from './asset-map.json';
import overlay, { setup as setupOverlay } from '../src/overlay';
import { boundaries, registry } from '../src/scenes';
import { app } from './ui/app';
import * as explorer from './ui/explorer';
import { el } from './ui/film';
import * as inspector from './ui/inspector';
import * as timeline from './ui/timeline';
import * as viewport from './ui/viewport';

setAssetMap(assetMap);

const params = new URLSearchParams(location.search);
const renderMode = params.get('mode') === 'render';
const H = Number(params.get('h') ?? params.get('q') ?? (renderMode || !matchMedia('(pointer: coarse)').matches ? 1080 : 720));
const W = Number(params.get('w') ?? Math.round((H * 16) / 9));

const body = document.body;
const status = el('status');
const start = el<HTMLButtonElement>('start');
const note = el('note');

function fail(message: string) {
  body.dataset.state = 'error';
  status.textContent = 'Error';
  note.textContent = message;
  start.hidden = true;
}

let engine: Engine;
try {
  engine = new Engine(el<HTMLCanvasElement>('out'), W, H);
} catch {
  fail("This page draws the film live with WebGL 2, which your browser doesn't support.");
  throw new Error('WebGL 2 unavailable');
}

const steps = registry.length + (renderMode ? 2 : 3);
let done = 0;
const step = () => (status.textContent = `Loading ${Math.round((++done / steps) * 100)}%`);

const music = renderMode
  ? undefined
  : fetch(assetUrl('/music/readme.wav'))
      .then((r) => r.arrayBuffer())
      .then((b) => new OfflineAudioContext(2, 1, 48000).decodeAudioData(b))
      .then((buffer) => {
        step();
        return buffer;
      });

const ready = (async () => {
  await Promise.all([loadFonts(), engine.audio.load()]);
  step();
  engine.configure(registry, boundaries);
  await setupOverlay(engine);
  engine.overlay = overlay;
  await engine.preload(step);
  // first frame of every scene, so shaders and textures exist before playback
  for (const s of registry) await engine.renderFrame(Math.round(s.start * FPS) + 1);
  await engine.renderFrame(0);
  step();
})();

if (renderMode) {
  body.classList.add('render');
  (window as unknown as { __mv: unknown }).__mv = {
    ready,
    engine,
    W,
    H,
    fps: FPS,
    duration: DURATION,
    totalFrames: Math.round(DURATION * FPS),
    stream: (from: number, to: number, url: string) => ready.then(() => stream(engine, from, to, url)),
  };
} else {
  workspace();
}

function workspace() {
  let buffer: AudioBuffer;
  let ctx: AudioContext | undefined;
  let source: AudioBufferSourceNode | undefined;
  /** film time at `startAt` (ctx time); the film time while paused */
  let offset = 0;
  let startAt = 0;
  // every render call of a frame counts toward its cost; the explorer reads the frame's 3D renders
  const info = engine.renderer.info;
  info.autoReset = false;
  explore.seen = [];

  Promise.all([ready, music])
    .then(([, b]) => {
      buffer = b!;
      app.ready = true;
      body.dataset.state = 'ready';
      start.disabled = false;
      status.textContent = `Ready · ${H}p`;
      note.textContent = `Rendered live in your browser at ${H}p`;
      timeline.build();
      void draw(0);
    })
    .catch(() => fail("The film couldn't load. Reload the page to try again."));

  function clock() {
    if (!ctx || !source) return offset;
    const ts = ctx.getOutputTimestamp();
    const heard = ts.contextTime && ts.performanceTime ? ts.contextTime + (performance.now() - ts.performanceTime) / 1000 : ctx.currentTime - (ctx.outputLatency || 0);
    return Math.max(offset, offset + heard - startAt);
  }

  let want = 0;
  let shown = -1;
  let busy = false;
  /** the shown frame must render again (a viewer mode changed) */
  let stale = false;
  async function draw(t: number) {
    want = Math.min(Math.floor(t * FPS), Math.round(DURATION * FPS) - 1);
    if (busy) return;
    busy = true;
    while (shown !== want || stale) {
      const f = want;
      stale = false;
      await frame(f);
      shown = f;
    }
    busy = false;
  }

  // the last whole frame's cost, so panels never read a frame half rendered
  const cost = { ms: 0, calls: 0, triangles: 0, lines: 0 };
  let rendered = 0;
  async function frame(f: number) {
    explore.calls = 0;
    info.reset();
    const t0 = performance.now();
    await engine.renderFrame(f);
    const dt = performance.now() - t0;
    cost.ms = cost.ms ? cost.ms + (dt - cost.ms) * 0.2 : dt;
    cost.calls = info.render.calls;
    cost.triangles = info.render.triangles;
    cost.lines = info.render.lines;
    rendered++;
    app.frame = f;
    explore.drawn = explore.calls;
    viewport.drawn(explore.drawn);
    if (!source) panels();
  }

  // the panels follow at about 12 Hz while playing, and after every frame while paused
  let panelsAt = 0;
  let fpsAt = 0;
  let fpsFrames = 0;
  let fps = 0;
  function panels() {
    const now = performance.now();
    panelsAt = now;
    if (now - fpsAt >= 500) {
      fps = ((rendered - fpsFrames) * 1000) / (now - fpsAt);
      fpsAt = now;
      fpsFrames = rendered;
    }
    viewport.stats(source ? `${Math.round(fps)} fps · ${H}p` : `${cost.ms.toFixed(1)} ms · ${H}p`);
    inspector.update(app.frame, cost, info.memory.textures, info.programs?.length ?? 0);
    timeline.update(app.frame);
    explorer.update(app.frame / FPS);
    if (source) viewport.probe();
  }

  function live() {
    if (body.dataset.state === 'live') return;
    body.dataset.state = 'live';
    status.textContent = `Live · ${H}p`;
  }

  let raf = 0;
  function play(from = offset) {
    ctx ??= new AudioContext();
    void ctx.resume();
    source?.stop();
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    offset = from >= DURATION ? 0 : from;
    startAt = ctx.currentTime + 0.05;
    source.start(startAt, offset);
    app.playing = true;
    body.toggleAttribute('data-playing', true);
    el('toggle').setAttribute('aria-label', 'Pause');
    live();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function pause() {
    offset = Math.min(clock(), DURATION);
    source?.stop();
    source = undefined;
    app.playing = false;
    body.removeAttribute('data-playing');
    el('toggle').setAttribute('aria-label', 'Play');
    panels();
  }

  function tick() {
    if (!source) return;
    const t = clock();
    if (t >= DURATION) return pause();
    void draw(t);
    timeline.playhead(t);
    if (performance.now() - panelsAt >= 80) panels();
    raf = requestAnimationFrame(tick);
  }

  function seek(t: number) {
    t = Math.min(Math.max(0, t), DURATION);
    live();
    if (source) return play(t);
    offset = t;
    void draw(t);
    timeline.playhead(t);
  }

  app.time = clock;
  app.seek = seek;
  app.toggle = () => (source ? pause() : play());
  app.redraw = () => {
    stale = true;
    void draw(clock());
  };
  app.select = (s, reveal) => {
    app.selection = s;
    explorer.mark(s, reveal);
    viewport.paint();
    inspector.update(app.frame, cost, info.memory.textures, info.programs?.length ?? 0);
  };
  start.addEventListener('click', () => play(0));

  const card = el('card');
  const keys = (on: boolean) => {
    card.hidden = !on;
    el('keys').setAttribute('aria-expanded', String(on));
  };
  el('keys').addEventListener('click', () => keys(!!card.hidden));

  for (const tab of ['explorer', 'inspector'])
    el(`tab-${tab}`).addEventListener('click', () => {
      body.dataset.tab = tab;
      for (const other of ['explorer', 'inspector']) el(`tab-${other}`).setAttribute('aria-selected', String(other === tab));
    });

  addEventListener('keydown', (e) => {
    if (!app.ready || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) return;
    const k = e.key;
    const free = viewport.isFree();
    if (free && e.shiftKey && k.startsWith('Arrow')) viewport.orbitBy(k === 'ArrowLeft' ? -0.1 : k === 'ArrowRight' ? 0.1 : 0, k === 'ArrowUp' ? -0.1 : k === 'ArrowDown' ? 0.1 : 0);
    else if (k === ' ' || k === 'k') app.toggle();
    else if (k === 'ArrowRight' || k === 'ArrowLeft') seek(clock() + (k === 'ArrowRight' ? 5 : -5));
    else if (k === ',' || k === '.') timeline.stepFrames(k === '.' ? 1 : -1);
    else if (k === '[' || k === ']') timeline.stepBeats(k === ']' ? 1 : -1);
    else if (/^[1-9]$/.test(k) && registry[Number(k) - 1]) seek(registry[Number(k) - 1].start);
    else if (k === 'f' && !el('full').hidden) void viewport.toggleFull();
    else if (k === 'c') viewport.setFree(!free);
    else if (k === 'x') viewport.setXray(!explore.xray);
    else if (k === '0') viewport.resetView();
    else if (free && (k === '+' || k === '=' || k === '-')) viewport.zoomBy(k === '-' ? 1.25 : 0.8);
    else if (k === 'i') body.toggleAttribute('data-wide');
    else if (k === '?') keys(!!card.hidden);
    else if (k === 'Escape') card.hidden ? app.select(null) : keys(false);
    else return;
    e.preventDefault();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && source) pause();
  });
}
