import { clamp, ease, seg } from '../../engine/anim';
import { audio } from '../../engine/audio';
import { boxLabel, crosshair, line, measure, rect, text } from '../../engine/draw2d';
import { gridPos } from '../../engine/time';
import { STATIONS, T } from './k';
import { hexA } from './world';

const y0Chop = 134;

/** The block title lands in the corner label at t0 + TITLE_LAND (see title.ts). */
export const TITLE_LAND = 0.64;

const CONNECT_BOX = { size: 15, tracking: 0.34 } as const;
/** Where the corner label's station name sits (baseline-left) and its width. */
export function cornerName(c: CanvasRenderingContext2D, k: number) {
  const s = STATIONS[k];
  const bw = measure(c, 'CONNECT', { font: 'wide', size: CONNECT_BOX.size, tracking: CONNECT_BOX.tracking }) - CONNECT_BOX.size * CONNECT_BOX.tracking + CONNECT_BOX.size * 1.2 * 2;
  const x0 = 72 + bw + 22;
  const w1 = measure(c, `${s.n} / 04`, { font: 'mono', size: 14 });
  const x = x0 + w1 + 16;
  const w = measure(c, s.name, { font: 'wide', size: 14, tracking: 0.28 });
  return { x, y: 79, w, size: 14 };
}
const META: Record<string, (t: number) => string> = {
  openapi: (t) => (t >= 78.8 ? 'POST /planets  →  201 Created · 143 ms · 750 B' : t >= 78.4 ? 'POST /planets  →  sending…' : 'openapi.yaml  →  API reference'),
  obsidian: () => 'vault/Welcome.md  →  /obsidian/Welcome',
  sanity: () => 'Portable Text  →  <Heading /> <CodeBlock /> <Callout /> <Cards />',
  story: () => 'defineStory({ Component, args })  →  <WithControl />',
};

/** Screen-space HUD: boxed CONNECT + block index (flap), beat ticker, metadata, marks. */
export function drawHud(c: CanvasRenderingContext2D, t: number, zoom = 1) {
  const boot = seg(t, T.drop, T.drop + 0.25, ease.outCubic);
  const out = 1 - seg(t, T.reveal, T.reveal + 0.2, ease.inCubic);
  // step back during the hero push-ins so the UI reads clean
  const focus = clamp((zoom - 1.15) / 0.4);
  const a = boot * out * (1 - 0.7 * focus);
  if (a <= 0) return;
  c.save();
  c.globalAlpha = a;
  // block index
  let k = 0;
  for (let i = 0; i < STATIONS.length; i++) if (t >= STATIONS[i].t0 - 0.02) k = i;
  const st = STATIONS[k];
  const box = boxLabel(c, 'CONNECT', 72, 74, { size: 15, tracking: 0.34, color: 'rgba(250,250,247,0.9)', lw: 1 });
  // the previous label flaps out ON the downbeat (the big title owns the name), the new one
  // flaps in as the title collapses into it (title.ts)
  const out0 = seg(t, st.t0 - 0.02, st.t0 + 0.08, ease.inCubic);
  const flip = seg(t, st.t0 + TITLE_LAND - 0.03, st.t0 + TITLE_LAND + 0.09, ease.outCubic);
  const x0 = box.x + box.w + 22;
  c.save();
  c.beginPath();
  c.rect(x0 - 4, box.y - 2, 640, box.h + 4);
  c.clip();
  const drawIdx = (j: number, dy: number, al: number) => {
    const s = STATIONS[j];
    const y = 74 + dy;
    const w1 = text(c, `${s.n} / 04`, x0, y + 5, { font: 'mono', size: 14, color: s.key, alpha: al });
    text(c, s.name, x0 + w1 + 16, y + 5, { font: 'wide', size: 14, tracking: 0.28, color: s.key, alpha: al });
  };
  if (k > 0 && out0 < 1) drawIdx(k - 1, -out0 * 36, 1 - out0);
  if (flip > 0) drawIdx(k, (1 - flip) * 36, flip);
  c.restore();
  // package + jp sub-label (hands over with the corner label)
  const subK = flip > 0 ? k : k - 1;
  const subA = flip > 0 ? flip : 1 - out0;
  if (subK >= 0 && subA > 0) {
    const ss = STATIONS[subK];
    const wsub = text(c, ss.pkg, 74, 120, { font: 'mono', size: 13, color: 'rgba(250,250,247,0.55)', alpha: subA });
    text(c, ss.jp, 74 + wsub + 18, 120, { font: 'jpKaku', size: 13, weight: 700, color: 'rgba(250,250,247,0.42)', alpha: subA });
  }

  // beat ticker (top-right)
  const g = gridPos(t + 1e-4);
  const label = `BAR ${String(g.bar).padStart(2, '0')}`;
  const tw = measure(c, label, { font: 'mono', size: 13 });
  const rx = 1920 - 72;
  for (let i = 0; i < 4; i++) {
    const on = i + 1 <= g.beat;
    const x = rx - (3 - i) * 16 - 10;
    rect(c, x, 64, 10, 10, on ? { fill: i + 1 === g.beat ? st.key : 'rgba(250,250,247,0.7)' } : { stroke: 'rgba(250,250,247,0.4)', lw: 1 });
  }
  text(c, label, rx - 4 * 16 - 14 - tw, 74, { font: 'mono', size: 13, color: 'rgba(250,250,247,0.7)' });
  text(c, 'DROP · 150 BPM', rx, 98, { font: 'mono', size: 11, align: 'right', color: 'rgba(250,250,247,0.38)' });
  // vocal-chop readout: フ マ ド cells light on each chop (P1PE flap display)
  const chops = audio.timing.events.chops;
  let cur = -1, curT = -9;
  for (const ch of chops) if (ch.t <= t + 1e-4 && ch.t > t - 0.6) {
    cur = ['fu', 'ma', 'do'].indexOf(ch.syllable);
    curT = ch.t;
  }
  const cells = ['フ', 'マ', 'ド'];
  for (let i = 0; i < 3; i++) {
    const x = rx - (2 - i) * 28 - 22, y = 118;
    const on = i === cur ? Math.exp(-(t - curT) / 0.16) : 0;
    rect(c, x, y, 22, 22, on > 0.05 ? { fill: hexA(st.key, 0.25 + 0.75 * on) } : { stroke: 'rgba(250,250,247,0.3)', lw: 1 });
    text(c, cells[i], x + 11, y + 16.5, { font: 'pixel', size: 15, align: 'center', color: on > 0.4 ? '#0A0A0B' : 'rgba(250,250,247,0.55)' });
  }
  text(c, 'CHOP', rx - 3 * 28 - 30, y0Chop, { font: 'mono', size: 11, align: 'right', color: 'rgba(250,250,247,0.38)' });

  // metadata line (bottom-left)
  const meta = META[st.id](t);
  const mIn = seg(t, st.t0 + 0.05, st.t0 + 0.3, ease.outCubic);
  const shown = Math.floor(meta.length * mIn);
  text(c, '▸', 72, 1020, { font: 'mono', size: 13, color: st.key });
  text(c, meta.slice(0, shown), 92, 1020, { font: 'mono', size: 13, color: 'rgba(250,250,247,0.6)' });

  // registration marks (bottom-right hides under the credit, bars 53–54)
  const credit = t > T.san - 0.2 && t < T.sto + 0.2;
  crosshair(c, 72, 1000 - 24, 9, 1, 'rgba(250,250,247,0.35)');
  if (!credit) crosshair(c, 1920 - 72, 1000 - 24, 9, 1, 'rgba(250,250,247,0.35)');
  // thin key-colour tick under the box on each beat
  const bp = 1 - clamp((t - (T.drop + Math.floor((t - T.drop) / 0.4) * 0.4)) / 0.18);
  line(c, box.x, box.y + box.h + 6, box.x + box.w * (0.25 + 0.75 * bp), box.y + box.h + 6, 1, hexA(st.key, 0.25 + 0.6 * bp));
  c.restore();
}
