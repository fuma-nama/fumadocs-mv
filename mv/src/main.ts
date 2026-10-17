import { Engine } from './engine/engine';
import { loadFonts } from './engine/draw2d';
import { DURATION, FPS, gridPos, SECTIONS, sectionAt } from './engine/time';
import { stream as streamFrames } from './engine/stream';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'preview';
const W = Number(params.get('w') ?? 1920);
const H = Number(params.get('h') ?? 1080);
const only = params.get('only')?.split(',').filter(Boolean);

const canvas = document.getElementById('out') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
if (mode === 'render') document.body.classList.add('render');

const engine = new Engine(canvas, W, H, FPS);
const totalFrames = Math.round(DURATION * FPS);

const ready = (async () => {
  const { registry, boundaries } = await import('./scenes');
  await Promise.all([loadFonts(), engine.audio.load()]);
  engine.only = only;
  engine.configure(registry, boundaries);
  if (params.get('overlay') !== '0') {
    try {
      const m = await import('./overlay');
      await m.setup?.(engine);
      engine.overlay = m.default;
    } catch (err) {
      console.error('[overlay] failed to load', err);
    }
  }
})();

async function still(t: number, type: 'png' | 'jpeg' = 'png', quality = 0.92) {
  await ready;
  await engine.renderFrame(Math.round(t * FPS));
  return canvas.toDataURL(`image/${type}`, quality);
}

/** Contact sheet of several times; labels show time and bar.beat. */
async function sheet(times: number[], cols = 4, cellW = 480, label = true) {
  await ready;
  const cellH = Math.round((cellW * H) / W);
  const rows = Math.ceil(times.length / cols);
  const pad = label ? 22 : 0;
  const sc = document.createElement('canvas');
  sc.width = cols * cellW;
  sc.height = rows * (cellH + pad);
  const c = sc.getContext('2d')!;
  c.fillStyle = '#222';
  c.fillRect(0, 0, sc.width, sc.height);
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    await engine.renderFrame(Math.round(t * FPS));
    const x = (i % cols) * cellW;
    const y = Math.floor(i / cols) * (cellH + pad);
    c.drawImage(canvas, x, y + pad, cellW, cellH);
    if (label) {
      const g = gridPos(t);
      c.fillStyle = '#ddd';
      c.font = '13px ui-monospace, monospace';
      c.fillText(`${t.toFixed(3)}s  bar ${g.bar}.${g.beat}  ${sectionAt(t).id}`, x + 6, y + 15);
    }
  }
  return sc.toDataURL('image/jpeg', 0.9);
}

async function stream(from: number, to: number, url: string) {
  await ready;
  return streamFrames(engine, from, to, url);
}

(window as any).__mv = {
  ready, still, sheet, stream, W, H, fps: FPS, engine, duration: DURATION, totalFrames,
};

// ── interactive preview ─────────────────────────────────────────────────────
if (mode === 'preview') {
  const audioEl = new Audio('/music/readme.wav');
  let playing = false;
  let t = Number(params.get('t') ?? 0);
  let busy = false;
  let last = performance.now();
  const draw = async () => {
    if (busy) return;
    busy = true;
    await engine.renderFrame(Math.round(t * FPS));
    const g = gridPos(t);
    hud.textContent = `${t.toFixed(2)}s  bar ${g.bar}.${g.beat}  ${sectionAt(t).name}  ${playing ? '▶' : '⏸'}  [space] play  [←/→] beat  [⇧←/→] bar  [1-9] section`;
    busy = false;
  };
  const loop = async () => {
    const now = performance.now();
    if (playing) {
      t = audioEl.duration && !audioEl.paused ? audioEl.currentTime : t + (now - last) / 1000;
      if (t >= DURATION) playing = false;
    }
    last = now;
    await draw();
    requestAnimationFrame(loop);
  };
  ready.then(() => requestAnimationFrame(loop));
  addEventListener('keydown', (ev) => {
    const beat = 0.4;
    if (ev.code === 'Space') {
      playing = !playing;
      if (playing) {
        audioEl.currentTime = t;
        audioEl.play().catch(() => {});
      } else audioEl.pause();
    } else if (ev.code === 'ArrowRight') t += ev.shiftKey ? beat * 4 : beat;
    else if (ev.code === 'ArrowLeft') t = Math.max(0, t - (ev.shiftKey ? beat * 4 : beat));
    else if (/^Digit[1-9]$/.test(ev.code)) {
      const s = SECTIONS[Number(ev.code.slice(5)) - 1];
      if (s) t = s.start;
    }
    if (playing && ev.code.startsWith('Arrow')) audioEl.currentTime = t;
  });
}
