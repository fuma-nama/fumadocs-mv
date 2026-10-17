import { clamp, ease, hash, hold, lerp } from '../../engine/anim';
import type { Frame } from '../../engine/engine';
import { audio } from '../../engine/audio';
import { sparkle, text, textArc } from '../../engine/draw2d';
import { C } from '../_shared/palette';
import { HERO_TOC, mixColor } from './toc-geometry';
import { BEAT, glideDurs, landLag, rollEase, T_D, T_END, transitionedVar, type TargetD } from './timeline';
import { circleLiftOff, DIVE_END } from './shotC';
import { drawRing, N_HEAD, RING, ringGlyphs, sectorMid } from './ring';
import { MONO } from './hud';
import type { ArcGlow } from './dither';

/**
 * Shot D — michishirube, the magic circle (35.2–38.4, rendered to 39.2 for B3).
 * The POPOVER's progress circle (open → primary) becomes a compass of signposts; it fills to
 * 100 % at 37.6 and leaves only ring + dot + heading ring for LAYOUT.
 */
export const T_FULL = T_D + 6 * BEAT; // 37.6 bar 24 b3 — 100 %
const T_CLEAR = T_FULL + 0.7; // 38.3 only ring + dot + headings remain
/** snare-roll hits that strip the furniture layer by layer: ticks, numbers, inner rings, centre, guides */
const SHED = [37.8, 38.0, 38.1, 38.2, 38.3];

/**
 * The fill: nine steps ARRIVING on drum hits (timing.json) — snare 35.6 · kick 35.8 · snare 35.9 ·
 * kick 36.2 · snare 36.4 · kick 36.8 · snare 37.2 · kick 37.4 · snare 37.6 = 100 % (B3, F♯7).
 */
const ARR_D = [35.6, 35.8, 35.9, 36.2, 36.4, 36.8, 37.2, 37.4, 37.6];
const START_I = 9; // C's sweep ends on Minimap (index 9), arriving on the 34.8 snare
const STEPS: { t: number; i: number; dur: number; arr: number }[] = (() => {
  const durs = glideDurs(ARR_D, 0.3, 34.8);
  return ARR_D.map((h, k) => ({ t: h - durs[k] + landLag(durs[k]), i: START_I + 1 + k, dur: durs[k], arr: h }));
})();

export function progressD(t: number): number {
  const tg: TargetD[] = STEPS.map((s) => ({ t: s.t, v: (s.i + 1) / N_HEAD, dur: s.dur }));
  // in-out: the arc head decelerates into each sector boundary on the hit
  return Math.min(1, transitionedVar(t, (START_I + 1) / N_HEAD, tg, ease.inOutCubic));
}

/** index of the current (latest reached) heading and when it was reached */
/** the heading the dot has reached (it rolls in on the arrival hit) */
function currentAt(t: number): { i: number; since: number; roll: number } {
  let i = START_I, at = T_D - 1, roll = 0.32;
  for (let k = 0; k < STEPS.length; k++) {
    const s = STEPS[k];
    if (s.arr > t) break;
    i = s.i;
    at = s.arr;
    // the roll-in never outlasts the gap to the next arrival (no half-faded titles on fast steps)
    roll = Math.min(0.32, (STEPS[k + 1]?.arr ?? T_END) - s.arr);
  }
  return { i, since: t - at, roll };
}

export interface RingPose {
  cx: number;
  cy: number;
  r: number;
  /** 0 during the dive → 1 settled */
  settle: number;
}

/** shared-element lift-off: the open popover's circle grows from its cell to the centre */
/** slow push-in on the circle while it fills, landing exactly on R 300 at 37.6 (B3) */
function pushZ(t: number): number {
  const u = clamp((t - DIVE_END) / (T_FULL - DIVE_END));
  return t >= DIVE_END ? lerp(0.955, 1, 0.5 - 0.5 * Math.cos(Math.PI * u)) : 1;
}

/** strength of the arc's glow pass: builds with the lift-off, flares on 100 %, exactly 0 from 38.1 (B3) */
export function glowAt(t: number): number {
  const sm = (x: number) => {
    const k = clamp(x);
    return k * k * (3 - 2 * k);
  };
  const on = sm((t - (T_D + 0.1)) / 0.45) * (0.85 + 0.25 * audio.pulse('kick', t, 0.14));
  const flare = t >= T_FULL ? 1.6 * Math.exp(-(t - T_FULL) / 0.16) : 0;
  return (on + flare) * (1 - sm((t - (T_FULL + 0.15)) / 0.35));
}

/** the arc glow's geometry + strength at t (rendered analytically, dithered — see dither.ts) */
export function glowParams(t: number): ArcGlow {
  const { cx, cy, r } = ringPose(t);
  const z = pushZ(t);
  const p = progressD(t);
  const a = -Math.PI / 2 + Math.PI * 2 * Math.min(p, 1);
  return { cx, cy, r: r * z, p, dx: cx + Math.cos(a) * r * z, dy: cy + Math.sin(a) * r * z, k: glowAt(t) };
}

export function ringPose(t: number): RingPose {
  if (t >= DIVE_END) return { cx: RING.cx, cy: RING.cy, r: RING.R, settle: 1 };
  const a = circleLiftOff();
  const u = clamp((t - T_D) / (DIVE_END - T_D));
  const kp = ease.outCubic(u); // position: leaves its cell on the downbeat
  const kr = ease.inOutCubic(u); // radius (log space)
  return {
    cx: lerp(a.x, RING.cx, kp),
    cy: lerp(a.y, RING.cy, kp),
    r: Math.exp(lerp(Math.log(a.r), Math.log(RING.R), kr)),
    settle: u,
  };
}

const GREY = C.GREY;
const PAPER = C.PAPER;
const ORANGE = C.ORANGE;

export function drawD(f: Frame, c: CanvasRenderingContext2D, o: { overlayOnly?: boolean } = {}) {
  const t = f.t;
  const W = f.W, H = f.H;
  const pose = ringPose(t);
  const { cx, cy, r } = pose;
  const settled = t >= DIVE_END;
  if (!o.overlayOnly) {
    c.fillStyle = C.INK;
    c.fillRect(0, 0, W, H);
  }
  // a slow push-in on the circle while it fills, landing exactly on R 300 at 37.6 (B3)
  c.save();
  if (settled) {
    const z = pushZ(t);
    c.translate(cx, cy);
    c.scale(z, z);
    c.translate(-cx, -cy);
  }
  const p = progressD(t);
  const cur = currentAt(t);
  const build = clamp((t - (DIVE_END - 0.12)) / 0.5); // circle furniture draws on
  // the circle sheds its scaffolding on the bar-24 snare roll (37.8 · 38.0 · 38.1 · 38.2 · 38.3)
  const shed = (k: number) => 1 - ease.outCubic(clamp((t - SHED[k]) / 0.09));
  const furn = ease.outCubic(build);
  const fTicks = furn * shed(0), fNums = furn * shed(1), fInner = furn * shed(2), fCentre = furn * shed(3), fGuides = furn * shed(4);

  // ── outer furniture: compass crosshairs, tracked text ring, numbered sectors, ticks ──
  if (furn > 0.001 && settled) {
    c.save();
    // faint concentric guides
    c.strokeStyle = PAPER;
    c.lineWidth = 1;
    for (const [rr, a, f] of [[r + 136, 0.07, fGuides], [r + 160, 0.05, fGuides], [r - 70, 0.08, fInner]] as const) {
      c.globalAlpha = a * f;
      c.beginPath();
      c.arc(cx, cy, rr, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
    // dashed ring counter-rotating inside
    c.save();
    c.globalAlpha = 0.28 * fInner;
    c.strokeStyle = PAPER;
    c.setLineDash([2, 7]);
    c.lineDashOffset = -(t - T_D) * 18;
    c.beginPath();
    c.arc(cx, cy, r - 46, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    // ticks: 19 sector boundaries (major) + 3 minor per sector, retracting on clear
    c.save();
    c.strokeStyle = PAPER;
    c.lineWidth = 1;
    for (let k = 0; k < N_HEAD * 4; k++) {
      const a = -Math.PI / 2 + (k / (N_HEAD * 4)) * Math.PI * 2;
      const major = k % 4 === 0;
      const len = (major ? 12 : 5) * fTicks;
      const r0 = r + 24;
      c.globalAlpha = (major ? 0.55 : 0.25) * fTicks;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
      c.stroke();
    }
    c.restore();
    // each fill step clicks the boundary tick it reaches (orange, longer, decaying)
    c.save();
    c.strokeStyle = ORANGE;
    c.lineWidth = 2;
    for (const st of STEPS) {
      const age = t - st.arr;
      if (age < 0 || age > 0.35) continue;
      const a = -Math.PI / 2 + ((st.i + 1) / N_HEAD) * Math.PI * 2;
      const k = Math.exp(-age / 0.1);
      const r0 = r + 20, r1 = r + 20 + 26 * k;
      c.globalAlpha = k * fTicks;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      c.stroke();
    }
    c.restore();
    // numbered cells inside the ring
    c.save();
    for (let i = 0; i < N_HEAD; i++) {
      const a = sectorMid(i);
      const reached = p >= (i + 1) / N_HEAD - 1e-4;
      text(c, String(i + 1).padStart(2, '0'), cx + Math.cos(a) * (r - 24), cy + Math.sin(a) * (r - 24) + 4, { ...MONO(11, reached ? PAPER : GREY, { alpha: fNums * (reached ? 0.8 : 0.45) }), align: 'center' });
    }
    c.restore();
    // outer text ring (tracked, slow) + sparkles twinkling on 12 fps — the magic-circle texture
    textArc(c, 'ON THIS PAGE · TABLE OF CONTENTS · NAVIGATE · 19 HEADINGS · ', cx, cy, r + 182, -Math.PI / 2 + (t - T_D) * 0.05, { font: 'wide', size: 10, tracking: 0.5, color: PAPER, alpha: 0.22 * fGuides });
    textArc(c, 'ON THIS PAGE · TABLE OF CONTENTS · NAVIGATE · 19 HEADINGS · ', cx, cy, r + 182, Math.PI / 2 + (t - T_D) * 0.05, { font: 'wide', size: 10, tracking: 0.5, color: PAPER, alpha: 0.22 * fGuides });
    {
      const th = hold(t, 12);
      for (let k = 0; k < 7; k++) {
        const ph = hash(k, 3) * 2;
        const life = ((th - T_D + ph) % 1.6) / 1.6;
        const tw = Math.sin(Math.PI * life);
        const ang = hash(k, 7) * Math.PI * 2 + Math.floor((th - T_D + ph) / 1.6) * 1.3;
        const rr = r + 140 + hash(k, 11) * 70;
        sparkle(c, cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, 3 + 7 * tw, `rgba(238,236,228,${(0.55 * tw * fGuides).toFixed(3)})`);
      }
    }

  }

  // ── heading ring (signposts) ──
  if (settled || build > 0) {
    const gl = ringGlyphs(c);
    const sweep = settled ? ease.inOutCubic(clamp((t - (DIVE_END - 0.05)) / 0.55)) : 0;
    drawRing(
      c,
      gl,
      (i) => {
        const reached = p >= (i + 1) / N_HEAD - 1e-4;
        if (!reached) return 'rgba(124,124,132,1)';
        const fresh = i === cur.i && t < T_FULL + 0.05 ? 1 - clamp((cur.since - 0.25) / 0.35) : 0;
        return mixColor(PAPER, ORANGE, fresh);
      },
      (i) => {
        // wipe on clockwise from 12 o'clock
        const k = clamp((sweep * (N_HEAD + 3) - i) / 3);
        return k * (p >= (i + 1) / N_HEAD - 1e-4 ? 1 : 0.62);
      },
    );
  }

  // ── progress ring: track + arc (round caps), the open popover's circle ──
  const lw = 3;
  c.save();
  c.lineWidth = lerp(lw * 0.6, 1, pose.settle);
  c.strokeStyle = mixColor('rgba(250,128,35,0.25)', 'rgba(124,124,132,0.5)', pose.settle);
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = Math.min(lw, 3) || 3;
  c.lineWidth = lerp(2.73, 3, pose.settle);
  c.strokeStyle = ORANGE;
  c.lineCap = p >= 0.9999 ? 'butt' : 'round';
  c.beginPath();
  if (p >= 0.9999) c.arc(cx, cy, r, 0, Math.PI * 2);
  else c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
  c.stroke();
  c.restore();
  // completion shock ring
  if (t >= T_FULL && t < T_FULL + 0.6) {
    const k = (t - T_FULL) / 0.6;
    c.save();
    c.globalAlpha = (1 - k) * 0.55;
    c.strokeStyle = ORANGE;
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx, cy, r + ease.outExpo(k) * 120, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  // ── the guide rides the arc head ──
  {
    const a = -Math.PI / 2 + Math.PI * 2 * Math.min(p, 1);
    const dx = cx + Math.cos(a) * r, dy = cy + Math.sin(a) * r;
    const glow = settled ? 1 - clamp((t - (T_FULL + 0.2)) / 0.3) : pose.settle;
    c.save();
    if (glow > 0.01) {
      c.shadowColor = ORANGE;
      c.shadowBlur = 18 * glow * Math.hypot(c.getTransform().a, c.getTransform().b); // device px
    }
    c.fillStyle = ORANGE;
    c.beginPath();
    c.arc(dx, dy, lerp(3.5, 7, pose.settle), 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  // ── centre: ON THIS PAGE · rolling current heading · % tag ──
  if (settled && fCentre > 0.001) {
    const ca = fCentre;
    text(c, 'ON THIS PAGE', cx, cy - 86, { font: 'wide', size: 13, tracking: 0.42, color: GREY, align: 'center', alpha: ca });
    const title = HERO_TOC[cur.i].title;
    const k = rollEase(clamp(cur.since / cur.roll));
    const out = 1 - fCentre;
    // on fast steps the roll starts from a floor so the title doesn't strobe to black
    const floor = cur.roll < 0.2 ? 0.4 : 0;
    drawRollTitle(c, title, cx, cy, (1 - k) * 0.6 * 64 - out * 48, (1 - k) * 3, (floor + (1 - floor) * k) * fCentre);
    const pct = `${(p * 100).toFixed(4)}%`;
    c.save();
    c.globalAlpha = ca;
    c.font = '400 15px "Geist Mono"';
    const tw = c.measureText(pct).width + 18;
    c.strokeStyle = 'rgba(238,236,228,0.5)';
    c.lineWidth = 1;
    c.strokeRect(Math.round(cx - tw / 2) + 0.5, Math.round(cy + 66) + 0.5, Math.round(tw), 24);
    c.restore();
    text(c, pct, cx, cy + 83, { ...MONO(15, p >= 0.9999 ? ORANGE : PAPER, { alpha: ca }), align: 'center' });
  }
  c.restore();
}

export { T_END, T_CLEAR };

// ── the centre title's roll-in window: a soft mask instead of a hard clip (no glyph cut mid-stroke)
let titleCv: HTMLCanvasElement | null = null;
const TW = 1100, TH = 240;
function drawRollTitle(c: CanvasRenderingContext2D, title: string, cx: number, cy: number, dy: number, blur: number, alpha: number) {
  if (alpha <= 0.001) return;
  const m = c.getTransform();
  const sc = Math.max(1, Math.round(Math.hypot(m.a, m.b)));
  if (!titleCv || titleCv.width !== TW * sc) {
    titleCv = document.createElement('canvas');
    titleCv.width = TW * sc;
    titleCv.height = TH * sc;
  }
  const t2 = titleCv.getContext('2d')!;
  t2.setTransform(1, 0, 0, 1, 0, 0);
  t2.globalCompositeOperation = 'source-over';
  t2.clearRect(0, 0, titleCv.width, titleCv.height);
  t2.setTransform(sc, 0, 0, sc, 0, 0);
  // baseline at cy + 20 → TH/2 + 20 in the window (window top = cy − TH/2)
  if (blur > 0.3) t2.filter = `blur(${(blur * sc).toFixed(2)}px)`;
  text(t2, title, TW / 2, TH / 2 + 20 + dy, { font: 'ui', size: 64, weight: 400, color: PAPER, align: 'center' });
  t2.filter = 'none';
  // soft window: opaque over the glyph band [cy − 34, cy + 38], fading out 16 px beyond
  t2.setTransform(1, 0, 0, 1, 0, 0);
  t2.globalCompositeOperation = 'destination-in';
  const g = t2.createLinearGradient(0, 0, 0, titleCv.height);
  const y = (v: number) => (TH / 2 + v) / TH;
  g.addColorStop(y(-50), 'rgba(0,0,0,0)');
  g.addColorStop(y(-34), 'rgba(0,0,0,1)');
  g.addColorStop(y(38), 'rgba(0,0,0,1)');
  g.addColorStop(y(54), 'rgba(0,0,0,0)');
  t2.fillStyle = g;
  t2.fillRect(0, 0, titleCv.width, titleCv.height);
  t2.globalCompositeOperation = 'source-over';
  c.save();
  c.globalAlpha *= alpha;
  c.drawImage(titleCv, cx - TW / 2, cy - TH / 2, TW, TH);
  c.restore();
}
