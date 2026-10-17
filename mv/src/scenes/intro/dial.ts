import { C } from '../_shared/palette';
import { ease, clamp, hash, hold } from '../../engine/anim';
import { setFont, measure, type TextOpts } from '../../engine/draw2d';
import type { Projector } from './proj';
import type { Cues } from './cues';
import { CHAPTERS, PAGES, R0, R1, R2, R3, RN, RT, DEG, TEXT_RING, chapterAngle, polar, arc, partial, type V3 } from './world';

export { RN };

/** Line weights / sizes, tuned so the structure still reads at 1/4 size (phone). */
const ST = {
  main: 2, // trunk + chapter ring (+ a soft glow pass)
  branch: 1.6,
  hand: 3,
  construct: 1.25,
  dial: 1.75,
  tick: 1.5,
  tickMajor: 2,
  labelPage: 0.32, // world units, Geist Mono (≥ 13 px on screen at the widest framing)
  labelChapter: 0.32,
  number: 0.42,
} as const;

const TAU = Math.PI * 2;
/** motion starts this early so it settles on the cue (2 frames) */
const LEAD = 2 / 60;
const W_ = (a: number) => `rgba(250,250,247,${a.toFixed(3)})`;
const O_ = (a: number) => `rgba(250,128,35,${a.toFixed(3)})`;
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

// ── the dot's choreography ────────────────────────────────────────────────────
export interface DotState {
  /** world position on the floor */
  p: V3;
  r: number;
  th: number;
  /** caret → dot morph: 0 = block caret at the root, 1 = dot */
  morph: number;
  /** speed (world units/s) for trails */
  speed: number;
}

/** Chapter angles unwrapped so the dot only ever moves clockwise. */
const A = (k: number) => chapterAngle(0) + 45 * DEG * k; // k may exceed 7

export interface Ping {
  t: number;
  p: V3;
  size: number;
  /** motif note (orange) vs clock event (white) */
  note: boolean;
}

export interface Timeline {
  m: number[]; // motif onsets (10)
  ticks: number[];
  /** a floor ping for every 8th-note event of bars 1–4 */
  pings: Ping[];
}

export function timeline(cues: Cues): Timeline {
  const m = cues.motif.map((x) => x.t);
  const T: Timeline = { m, ticks: cues.ticks, pings: [] };
  const pings: Ping[] = [];
  // bar 1: each clock tick stamps a calibration mark
  cues.ticks.filter((x) => x > 0.01 && x < m[0] - 0.01).forEach((tk, i) => pings.push({ t: tk, p: polar(R1, A(i + 1)), size: 0.5, note: false }));
  // motif notes: where the dot lands
  m.forEach((tm, i) => {
    const tp = tm + (i === 0 ? 0.04 : 0); // the stretch lands a touch later than a hop
    pings.push({ t: tp, p: dotState(tp + 0.1, T).p, size: i === 4 ? 1.4 : i >= 5 ? 0.7 : 1, note: true });
  });
  // the held A5 sweep passes 06, 07, 08 on the ticks
  for (let k = 5; k <= 7; k++) pings.push({ t: chapterLit(k, T), p: polar(R1, A(k)), size: 0.55, note: false });
  // bar 3: each tick sprouts a chapter
  for (let k = 0; k < 8; k++) pings.push({ t: m[4] + 0.8 + 0.2 * k, p: polar(R1, A(k)), size: 0.6, note: false });
  // the dot lands home at the end of the held E6's fall
  pings.push({ t: m[9] + 0.52, p: [0, 0, 0], size: 0.8, note: false });
  T.pings = pings;
  return T;
}

function dotPolar(t: number, T: Timeline): { r: number; th: number; morph: number } {
  const m = T.m;
  const L = LEAD; // every move starts 2 frames early and settles on its note / tick
  // bar 1: the caret at the root
  if (t < m[0] - L) return { r: 0, th: A(0), morph: 0 };
  // 1.6 stretch to node 01
  if (t < m[1] - L) {
    const k = ease.outExpo(seg(t, m[0] - L, m[0] + 0.12));
    return { r: R1 * k, th: A(0), morph: clamp((t - m[0] + L) / 0.1) };
  }
  // 1.8 / 2.0 / 2.1 hops along R1 to 02, 03, 04
  for (let i = 1; i <= 3; i++) {
    if (t < m[i + 1] - L) {
      const k = ease.outExpo(seg(t, m[i] - L, m[i] + 0.1));
      return { r: R1, th: A(i - 1) + 45 * DEG * k, morph: 1 };
    }
  }
  // 2.4 hop to 05, then sweep at clock pace round to 01 at 3.2
  const sweepEnd = m[4] + 0.8;
  if (t < sweepEnd) {
    const line = A(4) + (Math.max(0, t - m[4]) / 0.8) * 180 * DEG;
    const deficit = 45 * DEG * (1 - ease.outExpo(seg(t, m[4] - L, m[4] + 0.1)));
    return { r: R1, th: line - deficit, morph: 1 };
  }
  // bar 3: quartz ticks 01 → 08
  if (t < m[5] - L) {
    let th = A(8);
    for (let i = 1; i <= 7; i++) {
      const tk = sweepEnd + 0.2 * i - L;
      if (t >= tk) th = A(8) + 45 * DEG * (i - 1 + ease.outBack(seg(t, tk, tk + 0.1), 1.1));
    }
    return { r: R1, th, morph: 1 };
  }
  // bar 4: climb at 12 o'clock on the rising notes
  const top = A(16);
  if (t < m[6] - L) {
    const a = ease.outExpo(seg(t, m[5] - L, m[5] + 0.08));
    const b = ease.outExpo(seg(t, m[5] - L + 0.03, m[5] + 0.13));
    return { r: R1 + (R2 - R1) * b, th: A(15) + 45 * DEG * a, morph: 1 };
  }
  const steps: [number, number, number][] = [
    [m[6], R2, R3],
    [m[7], R3, RN],
    [m[8], RN, RT],
  ];
  for (let i = 0; i < steps.length; i++) {
    const [ts, r0, r1] = steps[i];
    const next = i + 1 < steps.length ? steps[i + 1][0] : m[9];
    if (t < next - L) return { r: r0 + (r1 - r0) * ease.outExpo(seg(t, ts - L, ts + 0.08)), th: top, morph: 1 };
  }
  // 5.6 held E6: fall home
  const k = ease.inOutCubic(seg(t, m[9] - L, m[9] + 0.5));
  return { r: RT * (1 - k), th: top, morph: 1 };
}

export function dotState(t: number, T: Timeline): DotState {
  const s = dotPolar(t, T);
  const s2 = dotPolar(t - 1 / 120, T);
  const p = polar(s.r, s.th);
  const q = polar(s2.r, s2.th);
  return { p, r: s.r, th: s.th, morph: s.morph, speed: Math.hypot(p[0] - q[0], p[2] - q[2]) * 120 };
}

// ── helpers ───────────────────────────────────────────────────────────────────
function strokeWorld(c: CanvasRenderingContext2D, P: Projector, pts: V3[], color: string, lw = 1, closed = false) {
  if (pts.length < 2) return;
  c.beginPath();
  P.pathPolyline(c, pts, closed);
  c.lineWidth = lw;
  c.strokeStyle = color;
  c.stroke();
}

/** Stroke a world polyline in chunks with per-chunk alpha from depth fog. */
function strokeFog(c: CanvasRenderingContext2D, P: Projector, pts: V3[], alpha: number, fog: (d: number) => number, rgb = '250,250,247', lw = 1, chunk = 6) {
  for (let i = 0; i < pts.length - 1; i += chunk) {
    const part = pts.slice(i, Math.min(pts.length, i + chunk + 1));
    const mid = part[Math.floor(part.length / 2)];
    const d = P.project(mid[0], mid[1], mid[2]).d;
    const a = alpha * fog(d);
    if (a <= 0.004) continue;
    c.beginPath();
    P.pathPolyline(c, part);
    c.lineWidth = lw;
    c.strokeStyle = `rgba(${rgb},${a.toFixed(3)})`;
    c.stroke();
  }
}

/** Square node (screen-space size) at a world point. */
function node(c: CanvasRenderingContext2D, P: Projector, p: V3, size: number, fill: string | null, stroke: string | null, lw = 1) {
  const s = P.project(p[0], p[1], p[2]);
  if (!s.ok) return;
  const h = size / 2;
  const x = Math.round(s.x - h) + (size % 2 ? 0.5 : 0);
  const y = Math.round(s.y - h) + (size % 2 ? 0.5 : 0);
  if (fill) {
    c.fillStyle = fill;
    c.fillRect(Math.round(s.x - h), Math.round(s.y - h), size, size);
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.strokeRect(x + 0.5 - (size % 2 ? 0.5 : 0), y + 0.5 - (size % 2 ? 0.5 : 0), size - 1, size - 1);
  }
}

const F = 64; // local glyph px for floor text

/**
 * Text lying on the floor along a straight line from p in direction `dir` (unit, xz), glyph up
 * = `up`. size = cap-ish height in world units. Returns nothing; respects `n` visible chars.
 */
function floorText(c: CanvasRenderingContext2D, P: Projector, str: string, p: V3, dir: V3, up: V3, size: number, o: { color: string; n?: number; font?: TextOpts['font']; weight?: number; tracking?: number; align?: 'left' | 'right' | 'center' }) {
  const to: TextOpts = { font: o.font ?? 'mono', size: F, weight: o.weight ?? 500, tracking: o.tracking ?? 0 };
  c.save();
  setFont(c, to);
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  const chars = [...str];
  const total = measure(c, str, to);
  let x0 = 0;
  if (o.align === 'right') x0 = -total;
  else if (o.align === 'center') x0 = -total / 2;
  const n = Math.min(chars.length, o.n ?? chars.length);
  let adv = x0;
  const k = size / F;
  c.fillStyle = o.color;
  for (let i = 0; i < n; i++) {
    const ch = chars[i];
    const w = c.measureText(ch).width; // includes letterSpacing
    const cx = adv + w / 2;
    const q: V3 = [p[0] + dir[0] * cx * k, 0, p[2] + dir[2] * cx * k];
    if (ch !== ' ' && P.floorTransform(c, q, dir, up, size, F)) c.fillText(ch, -w / 2, 0);
    adv += w;
  }
  c.restore();
}


/** Radial label on the floor from radius r0 at angle th, running outward (sign 1) or inward
 * (−1); flipped so it always reads left→right (or downward when vertical). */
function radialLabel(c: CanvasRenderingContext2D, P: Projector, str: string, th: number, r0: number, sign: number, size: number, color: string, n: number, sideOffset = 0, weight = 500) {
  const out: V3 = [Math.cos(th), 0, Math.sin(th)];
  let dir: V3 = [out[0] * sign, 0, out[2] * sign];
  let align: 'left' | 'right' = 'left';
  if (dir[0] < -0.02 || (Math.abs(dir[0]) <= 0.02 && dir[2] < 0)) {
    dir = [-dir[0], 0, -dir[2]];
    align = 'right';
  }
  const up: V3 = [dir[2], 0, -dir[0]];
  const side: V3 = [-Math.sin(th), 0, Math.cos(th)];
  const start: V3 = [out[0] * r0 + side[0] * sideOffset, 0, out[2] * r0 + side[2] * sideOffset];
  floorText(c, P, str, start, dir, up, size, { color, n, align, font: 'mono', weight });
}

/** Glyphs on a circle (clockwise from angle a0), upright for a reader outside looking in. */
function ringText(c: CanvasRenderingContext2D, P: Projector, str: string, r: number, a0: number, size: number, o: { color: string; n?: number; font?: TextOpts['font']; tracking?: number; fog?: (d: number) => number; alpha?: number }) {
  const to: TextOpts = { font: o.font ?? 'wide', size: F, weight: 400, tracking: o.tracking ?? 0 };
  c.save();
  setFont(c, to);
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  const k = size / F;
  let s = 0;
  const chars = [...str];
  const n = Math.min(chars.length, o.n ?? chars.length);
  for (let i = 0; i < n; i++) {
    const ch = chars[i];
    const w = c.measureText(ch).width; // includes letterSpacing
    const a = a0 + ((s + w / 2) * k) / r;
    s += w;
    if (ch === ' ') continue;
    const p = polar(r, a);
    const tx: V3 = [-Math.sin(a), 0, Math.cos(a)]; // clockwise tangent
    const up: V3 = [Math.cos(a), 0, Math.sin(a)]; // outward = glyph up
    if (o.fog) {
      const d = P.project(p[0], 0, p[2]).d;
      c.globalAlpha = (o.alpha ?? 1) * o.fog(d);
      if (c.globalAlpha < 0.01) continue;
    }
    if (P.floorTransform(c, p, tx, up, size, F)) c.fillText(ch, 0, 0);
  }
  c.restore();
}

/** Circumference length of a string at a world size (for wrapping the text ring). */
function ringLen(c: CanvasRenderingContext2D, str: string, size: number, tracking: number, font: TextOpts['font'] = 'wide') {
  return (measure(c, str, { font, size: F, tracking }) * size) / F;
}

// ── the frame ─────────────────────────────────────────────────────────────────
export interface DialFrame {
  t: number;
  P: Projector;
  T: Timeline;
  cues: Cues;
  /** depth fog factor (1 near … 0 far) */
  fog: (d: number) => number;
  /** global dial brightness (dims in the 3D phase) */
  bright: number;
  /** 0..1 labels visibility (page labels fade in the crane) */
  labels: number;
  /** draw the dot (false once the moon has taken over) */
  dot: boolean;
  /** chapter path labels + index numbers visibility (default 1) */
  chapterLabels?: number;
}

let ringStr = '';
let ringSize = 0.27;

/**
 * Floor layer: everything that lies on the floor (lines, rings, ticks, numbers, text ring,
 * nodes, labels, pings). Drawn under the 3D objects.
 */
export function drawFloor(c: CanvasRenderingContext2D, D: DialFrame) {
  const { t, P, T, fog } = D;
  const m = T.m;
  const B = D.bright;
  c.lineCap = 'butt';
  c.lineJoin = 'round';
  const dot = dotState(t, T);

  // bar 1 · clock hand + calibration marks + construction ring
  const handSteps = T.ticks.filter((x) => x > 0.01 && x < m[0] - 0.01);
  let handK = 0;
  for (const tk of handSteps) if (t >= tk - LEAD) handK += ease.outBack(seg(t, tk - LEAD, tk + 0.06), 1.4);
  if (t >= m[0] - LEAD) handK = handSteps.length + 1;
  const handTh = A(0) + 45 * DEG * Math.min(handK, 8);
  const marksN = t >= m[0] ? 8 : 1 + handSteps.filter((x) => t >= x).length;
  const markA = clamp(seg(t, 0.02, 0.3)) * B * (D.chapterLabels ?? 1);
  // construction ring R1 (dashed) traced by the hand during bar 1
  if (t < m[0] + 1.6) {
    const reach = t >= m[0] ? TAU : (Math.min(handK, 8) / 8) * TAU;
    const a = 0.5 * markA * (1 - seg(t, m[0] + 0.6, m[0] + 1.6));
    if (a > 0.005 && reach > 0.01) {
      c.save();
      c.setLineDash([4, 6]);
      strokeWorld(c, P, arc(R1, A(0), A(0) + reach), W_(a), ST.construct);
      c.restore();
    }
  }
  // R0 construction ring (dashed, slowly turning)
  {
    const a = 0.28 * seg(t, 0.4, 0.8) * B;
    if (a > 0.005) {
      c.save();
      c.setLineDash([3, 7]);
      c.lineDashOffset = -t * 6;
      strokeFog(c, P, arc(R0, 0, TAU), a, fog, '250,250,247', ST.construct, 12);
      c.restore();
    }
  }
  // hand (bar 1 only; merges into the trunk at 1.6)
  if (t < m[0] + 0.05) {
    const a = 0.85 * seg(t, 0.05, 0.25) * B;
    const p0 = polar(0.45, handTh);
    const p1 = polar(R1 - 0.34, handTh);
    strokeWorld(c, P, [p0, p1], W_(a), ST.hand);
    const tip = P.project(p1[0], 0, p1[2]);
    if (tip.ok) {
      c.fillStyle = W_(a);
      c.beginPath();
      c.arc(tip.x, tip.y, 6, 0, TAU);
      c.fill();
    }
  }
  // bar 2 · trunk + ring 1 drawn by the dot
  if (t >= m[0] - LEAD) {
    const lineA = 0.95 * B;
    // trunk: root → node 01 (and later the 12 o'clock axis up to the dot's highest reach)
    const trunkTop = t < m[5] ? Math.min(dot.r, R1) : Math.max(R1, climbReach(t, T));
    const trunk = [polar(0.3, A(0)), polar(trunkTop, A(0))];
    // ring 1
    let ringTo: number;
    if (t < m[1] - LEAD) ringTo = A(0);
    else if (t < m[4] + 0.8) ringTo = dot.th;
    else ringTo = A(8);
    const ring = ringTo > A(0) + 0.001 ? arc(R1, A(0), ringTo) : [];
    for (const [lw, k] of [[6, 0.1], [ST.main, 1]] as const) {
      strokeFog(c, P, trunk, lineA * k, fog, '250,250,247', lw, 1);
      if (ring.length) strokeFog(c, P, ring, lineA * k, fog, '250,250,247', lw, 4);
    }
  }

  // bar 3 · branches sprout on the ticks
  const sweepEnd = m[4] + 0.8;
  for (const pg of PAGES) {
    const ts = sweepEnd + 0.2 * pg.chapter;
    if (t < ts) continue;
    const L = pg.cum[pg.cum.length - 1];
    const g = 1 - (1 - seg(t, ts, ts + 0.42)) ** 3;
    const pts = partial(pg.path, pg.cum, L * g);
    strokeFog(c, P, pts, 0.85 * B, fog, '250,250,247', ST.branch, 6);
    if (g >= 0.999) {
      const end = pg.path[pg.path.length - 1];
      const ta = ts + 0.42;
      const flash = 1 - seg(t, ta, ta + 0.25);
      const pr = P.project(end[0], 0, end[2]);
      const fa = fog(pr.d) * B;
      node(c, P, end, 7, W_(fa * (0.75 + 0.25 * flash)), null);
      if (flash > 0.01) node(c, P, end, 7 + Math.round(10 * (1 - flash)), null, W_(fa * 0.8 * flash), 1.5);
      // radial file-name label (types on in 16ths), flipped on the left half to stay readable
      if (D.labels > 0.01) {
        const nch = Math.floor((t - ta) * 34);
        const glitch = blipGlitch(t, D.cues.blips, pg.chapter * 7 + pg.name.length);
        radialLabel(c, P, glitch ? scramble(pg.name, t) : pg.name, pg.angle, R2 + 0.3, 1, ST.labelPage, W_(0.85 * fa * D.labels), nch);
      }
    } else if (pts.length) {
      // growing tip
      const tip = pts[pts.length - 1];
      node(c, P, tip, 5, W_(B), null);
    }
  }

  // chapter cells: numbered P1PE cells stamped by the bar-1 clock hand, lit by the dot in bar 2
  const cl = D.chapterLabels ?? 1;
  for (let k = 0; k < marksN; k++) {
    const p = polar(R1, A(k));
    const pr = P.project(p[0], 0, p[2]);
    if (!pr.ok) continue;
    const appear = k === 0 ? 0 : (handSteps[k - 1] ?? 0) - LEAD;
    const pop = ease.outBack(seg(t, appear, appear + 0.12), 1.6);
    const lit = chapterLit(k, T);
    const on = t >= lit;
    const fa = fog(pr.d) * B * cl;
    if (fa * pop <= 0.01) continue;
    const flash = on ? 1 - seg(t, lit, lit + 0.3) : 0;
    const w = Math.round(32 * (0.6 + 0.4 * pop));
    const h = Math.round(22 * (0.6 + 0.4 * pop));
    const x0 = Math.round(pr.x - w / 2) + 0.5;
    const y0 = Math.round(pr.y - h / 2) + 0.5;
    c.save();
    c.globalAlpha = Math.min(1, fa * pop);
    c.fillStyle = on ? C.WHITE : C.INK;
    c.fillRect(x0, y0, w, h);
    c.lineWidth = 1.5;
    c.strokeStyle = C.WHITE;
    c.strokeRect(x0, y0, w, h);
    if (flash > 0) {
      const g = 6 + 10 * (1 - flash);
      c.globalAlpha = Math.min(1, fa) * flash;
      c.strokeRect(x0 - g, y0 - g, w + 2 * g, h + 2 * g);
      c.globalAlpha = Math.min(1, fa * pop);
    }
    setFont(c, { font: 'mono', size: 14, weight: 700 });
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = on ? C.INK : C.WHITE;
    c.fillText(String(k + 1).padStart(2, '0'), Math.round(pr.x), Math.round(pr.y) + 1);
    c.restore();
    if (on && cl > 0.01) {
      const nch = Math.floor((t - lit) * 40);
      radialLabel(c, P, CHAPTERS[k].path, A(k), R1 - 0.5, -1, ST.labelChapter, W_(0.95 * fog(pr.d) * B * cl), nch, k === 0 || k === 4 ? 0.34 : 0, 600);
    }
  }

  // pings: every 8th-note event in bars 1–4 leaves a ring on the floor
  for (const pg of T.pings) {
    const age = t - pg.t;
    if (age < 0 || age > 1.0) continue;
    pingFloor(c, P, pg.p, age, pg.size, pg.note, B, fog);
  }

  // root node (README.mdx) after the stretch
  if (t >= m[0] - LEAD && D.dot) {
    const root: V3 = [0, 0, 0];
    node(c, P, root, 7, W_(B), null);
    node(c, P, root, 15, null, W_(0.55 * B), 1.5);
  }

  // bar 4 · rings snap on with the climb
  drawOuterRings(c, D);
}

/** Highest radius reached by the climb (12 o'clock axis) */
function climbReach(t: number, T: Timeline) {
  const m = T.m;
  if (t < m[5]) return R1;
  if (t >= m[9]) return RT;
  return Math.max(R1, dotPolar(t, T).r);
}

/** time chapter k gets lit by the dot */
export function chapterLit(k: number, T: Timeline) {
  const m = T.m;
  if (k === 0) return m[0] + 0.04;
  if (k <= 4) return m[k];
  return m[4] + 0.2 * (k - 4); // sweep passes 06, 07, 08 on the ticks
}

function pingFloor(c: CanvasRenderingContext2D, P: Projector, p: V3, age: number, big: number, note: boolean, B: number, fog: (d: number) => number) {
  const d = P.project(p[0], 0, p[2]).d;
  const f = fog(d) * B;
  const held = big > 1.2;
  const rgb = note ? '250,128,35' : '250,250,247';
  // a short filled burst on the event itself (the part that still reads at 1/4 size)
  const burst = 1 - clamp(age / 0.14);
  if (burst > 0) {
    const pts: V3[] = [];
    const rb = 0.18 + 0.22 * Math.min(1, big) * ease.outExpo(clamp(age / 0.14));
    for (let i = 0; i <= 32; i++) {
      const th = (i / 32) * TAU;
      pts.push([p[0] + rb * Math.cos(th), 0, p[2] + rb * Math.sin(th)]);
    }
    c.beginPath();
    P.pathPolyline(c, pts, true);
    c.fillStyle = `rgba(${rgb},${(0.85 * burst * burst * f).toFixed(3)})`;
    c.fill();
  }
  for (let j = 0; j < (held ? 2 : 1); j++) {
    const a = age - j * 0.12;
    if (a <= 0) continue;
    const k = ease.outExpo(clamp(a / 0.8));
    const r = 0.18 + 1.35 * big * k;
    const alpha = (note ? 1 : 0.85) * (1 - clamp(a / 0.8)) ** 1.3 * f;
    if (alpha < 0.005) continue;
    const pts: V3[] = [];
    for (let i = 0; i <= 64; i++) {
      const th = (i / 64) * TAU;
      pts.push([p[0] + r * Math.cos(th), 0, p[2] + r * Math.sin(th)]);
    }
    strokeWorld(c, P, pts, j === 0 ? `rgba(${rgb},${alpha.toFixed(3)})` : W_(alpha * 0.6), note ? 3 : 2.5);
  }
}

function drawOuterRings(c: CanvasRenderingContext2D, D: DialFrame) {
  const { t, P, T, fog } = D;
  const m = T.m;
  const B = D.bright;
  const top = A(0);
  // 4.8 → R2 dashed page ring, draws both ways from 12 o'clock
  if (t >= m[5]) {
    const k = ease.outExpo(seg(t, m[5], m[5] + 0.4));
    c.save();
    c.setLineDash([4, 6]);
    strokeFog(c, P, arc(R2, top - Math.PI * k, top + Math.PI * k), 0.45 * B, fog, '250,250,247', 1.5, 6);
    c.restore();
  }
  // 5.0 → R3 dial ring + 60 minor / 12 major ticks
  if (t >= m[6]) {
    const k = ease.outExpo(seg(t, m[6] - 0.01, m[6] + 0.38));
    const dialArc = arc(R3, top - Math.PI * k, top + Math.PI * k);
    strokeFog(c, P, dialArc, 0.08 * B, fog, '250,250,247', 6, 6);
    strokeFog(c, P, dialArc, 0.85 * B, fog, '250,250,247', ST.dial, 6);
    for (let i = 0; i < 60; i++) {
      const th = top + (i / 60) * TAU;
      const dth = Math.abs(((th - top + Math.PI) % TAU) - Math.PI);
      if (dth > Math.PI * k + 1e-6 && !(i === 30 && k > 0.999)) continue;
      const major = i % 5 === 0;
      const len = major ? 0.45 : 0.2;
      const p0 = polar(R3, th);
      const d = P.project(p0[0], 0, p0[2]).d;
      strokeWorld(c, P, [p0, polar(R3 + len, th)], W_((major ? 0.95 : 0.55) * B * fog(d)), major ? ST.tickMajor : ST.tick);
    }
  }
  // 5.2 → numbers 01–12 flip in (flap display), staggered from 12 o'clock both ways
  if (t >= m[7]) {
    for (let i = 1; i <= 12; i++) {
      const th = top + (i / 12) * TAU;
      const steps = Math.min(i, 12 - i);
      const t0 = m[7] - 0.01 + steps * 0.014;
      if (t < t0) continue;
      const settle = t0 + 0.12;
      const label = t < settle ? String(Math.floor(hash(i, hold(t, 30)) * 90 + 10)) : String(i).padStart(2, '0');
      const p = polar(RN, th);
      const tx: V3 = [1, 0, 0];
      const up: V3 = [0, 0, -1];
      const d = P.project(p[0], 0, p[2]).d;
      c.save();
      c.fillStyle = W_(0.9 * B * fog(d));
      setFont(c, { font: 'mono', size: F, weight: 600 });
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (P.floorTransform(c, p, tx, up, ST.number, F)) c.fillText(label, 0, 0);
      c.restore();
    }
  }
  // 5.3 → text ring types round clockwise, then turns slowly
  if (t >= m[8]) {
    if (!ringStr) {
      // one pass of the text wraps the ring exactly: glyph size fitted to the circumference
      ringStr = TEXT_RING;
      ringSize = (TAU * RT) / ringLen(c, TEXT_RING, 1, 0.6);
    }
    const n = Math.floor(ringStr.length * ease.outCubic(seg(t, m[8] - 0.01, m[8] + 0.45)));
    // slow drift; it ticks like a clock on the 8ths from 5.4 and on every 16th from the bar-5 kick
    let rot = -(t - m[8]) * 3.2 * DEG;
    for (const tk of T.ticks) {
      if (tk > t + 1 / 60) break;
      if (tk >= 5.4 - 1e-6 && tk < 6.4 - 1e-6) rot -= 3 * DEG * ease.outExpo(seg(t, tk - 1 / 60, tk + 0.06));
      else if (tk >= 6.4 - 1e-6) rot -= 1.4 * DEG * ease.outExpo(seg(t, tk - 1 / 60, tk + 0.05));
    }
    ringText(c, P, ringStr, RT, top + rot, ringSize, { color: W_(0.78 * B), n, tracking: 0.6, fog, alpha: 1 });
  }
}

// ── screen-space overlay: the dot / caret ────────────────────────────────────
export function blipGlitch(t: number, blips: number[], seed: number) {
  for (const b of blips) if (t >= b && t < b + 0.05 && hash(seed, b) > 0.6) return true;
  return false;
}

const GLYPHS = '01_/.#$%&*+=<>abcdefxyz';
function scramble(s: string, t: number) {
  const k = hold(t, 30);
  return [...s].map((ch, i) => (hash(i, k) > 0.55 ? GLYPHS[Math.floor(hash(i, k, 3) * GLYPHS.length)] : ch)).join('');
}

