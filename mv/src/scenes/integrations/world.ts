import { clamp, hash, TAU } from '../../engine/anim';
import { setFont } from '../../engine/draw2d';
import { apply, type Cam, matAngle } from './cam';
import { R, STATIONS } from './k';

const W = 1920, H = 1080;

/** Screen-space view of the ring system for this frame. */
export interface View {
  m: DOMMatrix; // world → screen
  cx: number; // core on screen
  cy: number;
  s: number;
  /** canvas angle of world angle θ */
  sa: (theta: number) => number;
  /** visible world-angle range [lo, hi] (lo < hi), or null = full circle */
  vis: [number, number] | null;
}

export function makeView(m: DOMMatrix, cam: Cam): View {
  const [cx, cy] = apply(m, 0, 0);
  const off = matAngle(m); // screen angle of world +x
  const sa = (th: number) => off - th;
  let vis: [number, number] | null = null;
  const inside = cx > -50 && cx < W + 50 && cy > -50 && cy < H + 50;
  if (!inside) {
    // world angles of the screen corners as seen from the core
    const inv = m.inverse();
    const mid = Math.atan2(...(([x, y]) => [y, x] as [number, number])(apply(inv, W / 2, H / 2)));
    let lo = Infinity, hi = -Infinity;
    for (const [px, py] of [[-40, -40], [W + 40, -40], [W + 40, H + 40], [-40, H + 40]]) {
      const [wx, wy] = apply(inv, px, py);
      let a = Math.atan2(wy, wx);
      while (a - mid > Math.PI) a -= TAU;
      while (a - mid < -Math.PI) a += TAU;
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
    }
    vis = [lo, hi];
  }
  return { m, cx, cy, s: cam.s, sa, vis };
}

function arcRange(v: View, a0: number, a1: number): [number, number] | null {
  // intersect world-angle interval [a0, a1] (a0 < a1) with v.vis
  if (!v.vis) return [a0, a1];
  const [lo, hi] = v.vis;
  // shift a0/a1 by 2π so they overlap the visible window if possible
  for (const k of [-2, -1, 0, 1, 2]) {
    const b0 = a0 + k * TAU, b1 = a1 + k * TAU;
    const x0 = Math.max(b0, lo), x1 = Math.min(b1, hi);
    if (x1 > x0) return [x0, x1];
  }
  return null;
}

/** Stroke a world-space circle arc (radius r world units) between world angles a0 < a1. */
export function worldArc(c: CanvasRenderingContext2D, v: View, r: number, a0: number, a1: number) {
  const rr = arcRange(v, a0, a1);
  if (!rr) return false;
  c.beginPath();
  c.arc(v.cx, v.cy, Math.max(0.1, r * v.s), v.sa(rr[0]), v.sa(rr[1]), true);
  return true;
}

/** Iterate a periodic set of world angles (step) inside the visible range. */
function* angles(v: View, step: number, phase = 0, a0 = -Math.PI, a1 = Math.PI) {
  const lo = v.vis ? v.vis[0] : a0;
  const hi = v.vis ? v.vis[1] : a1;
  const i0 = Math.ceil((lo - phase) / step), i1 = Math.floor((hi - phase) / step);
  for (let i = i0; i <= i1; i++) yield { a: phase + i * step, i };
}

export const polar = (v: View, a: number, r: number): [number, number] => {
  const s = v.sa(a);
  return [v.cx + Math.cos(s) * r * v.s, v.cy + Math.sin(s) * r * v.s];
};

// ── background ───────────────────────────────────────────────────────────────

const D2R = Math.PI / 180;
/** World-angle span of each station's sky sector (OpenAPI's reaches back over the launch point). */
const SECTORS: [number, number][] = [
  [135 * D2R, 249 * D2R],
  [45 * D2R, 135 * D2R],
  [-45 * D2R, 45 * D2R],
  [225 * D2R, 315 * D2R],
];

function sectorPath(c: CanvasRenderingContext2D, v: View, k: number): boolean {
  const rr = arcRange(v, SECTORS[k][0], SECTORS[k][1]);
  if (!rr) return false;
  c.moveTo(v.cx + Math.cos(v.sa(rr[0])) * R * v.s, v.cy + Math.sin(v.sa(rr[0])) * R * v.s);
  c.arc(v.cx, v.cy, R * v.s, v.sa(rr[0]), v.sa(rr[1]), true);
  c.arc(v.cx, v.cy, (R + 5200) * v.s, v.sa(rr[1]), v.sa(rr[0]), false);
  c.closePath();
  return true;
}

/** Which sectors are lit at t (each floods on its block downbeat). */
export function litSectors(t: number) {
  // lights one frame after the downbeat (frame 0 is the colour slam, see energy.ts)
  return STATIONS.map((s) => (t >= s.t0 + 1 / 120 ? 1 : 0));
}

/** Flat saturated sky: each station's quarter floods with its field colour on its downbeat. */
export function drawSky(c: CanvasRenderingContext2D, v: View, t: number, alpha: number) {
  if (alpha <= 0) return;
  const lit = litSectors(t);
  c.save();
  c.globalAlpha = alpha;
  for (let k = 0; k < STATIONS.length; k++) {
    if (!lit[k]) continue;
    c.beginPath();
    if (!sectorPath(c, v, k)) continue;
    c.fillStyle = STATIONS[k].field;
    c.fill();
  }
  c.restore();
}

/** Clip to the lit sky (for INK linework on the fields). Returns false if nothing is lit/visible. */
export function clipLitSky(c: CanvasRenderingContext2D, v: View, t: number) {
  const lit = litSectors(t);
  c.beginPath();
  let any = false;
  for (let k = 0; k < STATIONS.length; k++) if (lit[k] && sectorPath(c, v, k)) any = true;
  if (any) c.clip();
  return any;
}

/** Station glows (key colour light in world space). `amp` per station 0..1. */
export function drawGlows(c: CanvasRenderingContext2D, v: View, amp: number[], stM: DOMMatrix[]) {
  for (let k = 0; k < STATIONS.length; k++) {
    if (amp[k] <= 0.002) continue;
    const m = v.m.multiply(stM[k]);
    const [x, y] = apply(m, 960, 470);
    const rr = 1050 * v.s;
    if (x < -rr || x > W + rr || y < -rr || y > H + rr) continue;
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    // white light behind the station on its lit field (the screens backlight the wall)
    g.addColorStop(0, `rgba(255,255,255,${0.26 * amp[k]})`);
    g.addColorStop(0.5, `rgba(255,255,255,${0.08 * amp[k]})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
}

export function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a, 0, 1).toFixed(4)})`;
}

/** Polar grid in the sky (latitude arcs + meridians) and the clock disc below the ring. */
function gridLines(c: CanvasRenderingContext2D, v: View, ink: boolean, alpha: number) {
  const col = (a: number) => (ink ? `rgba(10,10,11,${a * 2.2 * alpha})` : `rgba(255,255,255,${a * alpha})`);
  c.lineWidth = 1;
  for (let k = 1; k <= 6; k++) {
    const r = R + k * 170;
    c.strokeStyle = col(0.07 - k * 0.008);
    if (worldArc(c, v, r, -Math.PI, Math.PI)) c.stroke();
  }
  c.strokeStyle = col(0.045);
  c.beginPath();
  for (const { a } of angles(v, (6 * Math.PI) / 180, 0)) {
    const [x0, y0] = polar(v, a, R + 30);
    const [x1, y1] = polar(v, a, R + 1100);
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
  }
  c.stroke();
}

/** Polar grid in the sky: white over the dark sky, INK over the lit fields. */
export function drawGrid(c: CanvasRenderingContext2D, v: View, alpha: number, t: number) {
  if (alpha <= 0) return;
  c.save();
  gridLines(c, v, false, alpha);
  c.restore();
  c.save();
  if (clipLitSky(c, v, t)) gridLines(c, v, true, alpha);
  c.restore();
}

/** The clock disc inside the ring: shade, hairlines, ticks, numerals, text ring. */
export function drawDisc(c: CanvasRenderingContext2D, v: View, t: number, alpha: number, keyCol: string) {
  if (alpha <= 0) return;
  c.save();
  // disc shade: slightly lifted ink with a key-tinted rim light
  const r0 = R * v.s;
  const g = c.createRadialGradient(v.cx, v.cy, Math.max(0, r0 - 420 * v.s), v.cx, v.cy, r0);
  g.addColorStop(0, 'rgba(18,18,22,0)');
  g.addColorStop(0.75, `rgba(22,22,27,${0.55 * alpha})`);
  g.addColorStop(1, hexA(keyCol, 0.1 * alpha));
  c.fillStyle = g;
  c.beginPath();
  c.arc(v.cx, v.cy, r0, 0, TAU);
  c.fill();
  // interior clock face (reads in the reveal): concentric rings + hour spokes toward the core
  c.lineWidth = 1;
  c.strokeStyle = `rgba(255,255,255,${0.05 * alpha})`;
  for (let r = R - 560; r > 220; r -= 150) if (worldArc(c, v, r, -Math.PI, Math.PI)) c.stroke();
  c.strokeStyle = `rgba(255,255,255,${0.045 * alpha})`;
  c.beginPath();
  for (const { a } of angles(v, Math.PI / 6, 0)) {
    const [x0, y0] = polar(v, a, R - 440);
    const [x1, y1] = polar(v, a, 240);
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
  }
  c.stroke();
  // hairlines
  for (const [dr, a] of [[34, 0.16], [92, 0.1], [148, 0.08], [260, 0.05], [420, 0.04]] as [number, number][]) {
    c.strokeStyle = `rgba(255,255,255,${a * alpha})`;
    if (worldArc(c, v, R - dr, -Math.PI, Math.PI)) c.stroke();
  }
  // ticks: minor 1.5°, major 7.5°, hour 30°
  const step = (1.5 * Math.PI) / 180;
  const minor = new Path2D(), major = new Path2D();
  for (const { a, i } of angles(v, step, 0)) {
    const isHour = i % 20 === 0, isMajor = i % 5 === 0;
    const len = isHour ? 30 : isMajor ? 16 : 7;
    const [x0, y0] = polar(v, a, R - 3);
    const [x1, y1] = polar(v, a, R - 3 - len);
    const p = isMajor ? major : minor;
    p.moveTo(x0, y0);
    p.lineTo(x1, y1);
  }
  c.strokeStyle = `rgba(255,255,255,${0.22 * alpha})`;
  c.stroke(minor);
  c.strokeStyle = `rgba(255,255,255,${0.5 * alpha})`;
  c.lineWidth = 1.5;
  c.stroke(major);
  // hour numerals 01–12 (12 at the top), upright along the radius
  const fs = 30 * v.s;
  if (fs > 3) {
    setFont(c, { font: 'wide', size: fs, align: 'center', baseline: 'middle', tracking: 0.08 });
    for (const { a } of angles(v, Math.PI / 6, 0)) {
      const hr = Math.round(((Math.PI / 2 - a) / (Math.PI / 6) + 1200)) % 12 || 12;
      const [x, y] = polar(v, a, R - 66);
      c.save();
      c.translate(x, y);
      c.rotate(v.sa(a) + Math.PI / 2);
      const isSt = hr % 3 === 0;
      c.fillStyle = isSt ? `rgba(255,255,255,${0.85 * alpha})` : `rgba(255,255,255,${0.32 * alpha})`;
      c.fillText(String(hr).padStart(2, '0'), 0, 0);
      c.restore();
    }
  }
  // counter-rotating text ring
  drawTextRing(c, v, R - 122, t, alpha);
  c.restore();
}

const RING_TEXT = 'OPENAPI · OBSIDIAN · SANITY · STORY · CONNECT · ';
let ringGlyphs: { ch: string; w: number }[] | null = null;
let ringPeriod = 0;
const RING_FS = 15;

function drawTextRing(c: CanvasRenderingContext2D, v: View, r: number, t: number, alpha: number) {
  const fs = RING_FS * v.s;
  if (fs < 4) return;
  if (!ringGlyphs) {
    setFont(c, { font: 'wide', size: RING_FS, tracking: 0.32 });
    ringGlyphs = [...RING_TEXT].map((ch) => ({ ch, w: c.measureText(ch).width }));
    ringPeriod = ringGlyphs.reduce((s, g) => s + g.w, 0);
  }
  setFont(c, { font: 'wide', size: fs, align: 'center', baseline: 'middle', tracking: 0 });
  c.fillStyle = `rgba(255,255,255,${0.3 * alpha})`;
  const circ = TAU * r;
  const reps = Math.floor(circ / ringPeriod);
  const scale = circ / (reps * ringPeriod); // fit an integer number of repeats
  const rot = t * 0.035; // counter-rotation (rad/s)
  const lo = v.vis ? v.vis[0] : -Math.PI;
  const hi = v.vis ? v.vis[1] : Math.PI;
  for (let rep = 0; rep < reps; rep++) {
    let x = rep * ringPeriod;
    for (const g of ringGlyphs!) {
      // clockwise with reading order (left → right when the ring is the horizon)
      const a = rot - ((x + g.w / 2) * scale) / r;
      x += g.w;
      let aa = a;
      while (aa > hi) aa -= TAU;
      while (aa < lo) aa += TAU;
      if (aa > hi || g.ch === ' ') continue;
      const [px, py] = polar(v, aa, r);
      c.save();
      c.translate(px, py);
      c.rotate(v.sa(aa) + Math.PI / 2);
      c.fillText(g.ch, 0, 0);
      c.restore();
    }
  }
}

/** Rail (full ring, 1 px) + travelled path segments [a0, a1, colour, width]. */
export function drawRail(c: CanvasRenderingContext2D, v: View, segs: [number, number, string][], alpha: number, glow: number) {
  c.save();
  c.lineWidth = 1;
  c.strokeStyle = `rgba(255,255,255,${0.26 * alpha})`;
  if (worldArc(c, v, R, -Math.PI, Math.PI)) c.stroke();
  c.lineCap = 'round';
  for (const [a0, a1, col] of segs) {
    if (a1 - a0 < 1e-5) continue;
    if (!worldArc(c, v, R, a0, a1)) continue;
    if (glow > 0) {
      c.shadowColor = col;
      c.shadowBlur = glow;
    }
    c.lineWidth = 2.2;
    c.strokeStyle = col;
    c.globalAlpha = alpha;
    c.stroke();
    c.shadowBlur = 0;
  }
  c.restore();
}

// ── passing signs (between stations: the next block's name, streaking past in the whips) ──
const SIGNS: { a: number; k: number }[] = [
  { a: (135 * Math.PI) / 180, k: 1 },
  { a: (45 * Math.PI) / 180, k: 2 },
  { a: (-45 * Math.PI) / 180, k: 3 },
];

export function drawPassingSigns(c: CanvasRenderingContext2D, v: View, stationMatrixAt: (a: number) => DOMMatrix, alpha: number, t: number) {
  if (alpha <= 0) return;
  for (const sg of SIGNS) {
    // only while the camera whips past it (k-1 → k)
    const t0 = STATIONS[sg.k].t0;
    const wa = clamp((t - (t0 - 0.36)) / 0.08) * (1 - clamp((t - (t0 + 0.12)) / 0.12));
    if (wa <= 0) continue;
    const m = v.m.multiply(stationMatrixAt(sg.a));
    // cull: the sign's centre must be near the screen
    const cx = m.a * 960 + m.c * 420 + m.e, cy = m.b * 960 + m.d * 420 + m.f;
    if (cx < -1600 || cx > 3520 || cy < -1400 || cy > 2480) continue;
    const st = STATIONS[sg.k];
    c.save();
    c.setTransform(m);
    c.globalAlpha = alpha * wa;
    setFont(c, { font: 'display', size: 400, weight: 900, stretch: 'condensed', align: 'center', baseline: 'middle', tracking: -0.01 });
    c.lineWidth = 5;
    c.strokeStyle = 'rgba(250,250,247,0.9)';
    c.strokeText(st.name, 960, 420);
    c.fillStyle = 'rgba(10,10,11,0.85)';
    c.fillText(st.name, 960, 420);
    setFont(c, { font: 'wide', size: 22, align: 'center', baseline: 'middle', tracking: 0.4 });
    c.fillStyle = st.key;
    c.fillText(`${st.n} — ${st.pkg}`, 960, 690);
    c.restore();
  }
}

// ── dust ─────────────────────────────────────────────────────────────────────
const DUST = Array.from({ length: 900 }, (_, i) => ({
  a: hash(i, 1) * TAU,
  r: R + 40 + hash(i, 2) ** 0.7 * 1250,
  z: 0.75 + hash(i, 3) * 0.55,
  size: 0.6 + hash(i, 4) ** 3 * 2.2,
  tw: hash(i, 5) * TAU,
  al: 0.12 + hash(i, 6) * 0.4,
}));

export function drawDust(c: CanvasRenderingContext2D, v: View, t: number, alpha: number) {
  if (alpha <= 0) return;
  c.save();
  for (const d of DUST) {
    const a = d.a + t * 0.004 * (d.z - 1);
    let [x, y] = polar(v, a, d.r + Math.sin(t * 0.7 + d.tw) * 12);
    // parallax about the screen centre
    x = W / 2 + (x - W / 2) * d.z;
    y = H / 2 + (y - H / 2) * d.z;
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
    const tw = 0.6 + 0.4 * Math.sin(t * 3 + d.tw * 3);
    c.globalAlpha = d.al * tw * alpha;
    c.fillStyle = '#ffffff';
    const sz = d.size * Math.max(0.5, Math.min(1.4, v.s * d.z));
    c.fillRect(x - sz / 2, y - sz / 2, sz, sz);
  }
  c.restore();
}

