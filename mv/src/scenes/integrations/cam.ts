import { clamp, ease, lerp, n1, track } from '../../engine/anim';
import { punch } from './energy';
import { A_LAUNCH, H0, R, STATIONS, T, YH } from './k';

/**
 * The ride camera. The world is a ring (radius R) around the core at the origin (y up).
 * φ = ring angle under the camera (radial = screen up), h = height of the screen centre above
 * the ring, u = tangential offset, s = zoom, roll = extra screen roll.
 */
export interface Cam {
  phi: number;
  h: number;
  u: number;
  s: number;
  roll: number;
}

/** Critically damped step response (0 → 1), ω in rad/s. */
export function crit(dt: number, w: number) {
  if (dt <= 0) return 0;
  return 1 - (1 + w * dt) * Math.exp(-w * dt);
}

/** Whip progress: anticipation (−5 %) then a hard ease-out; ~0.9 at `land`. */
export function whipP(t: number, start: number, dur: number) {
  const x = clamp((t - start) / dur);
  return ease.whip(x);
}

export const WHIP_DUR = 0.6;
/** whip k: station k → k+1 starts here (so the downbeat lands ~91 % of the way) */
export const whipStart = (k: number) => STATIONS[k + 1].t0 - 0.28;

const A = STATIONS.map((s) => s.a);

/** In-station camera focus keys: [lt, u (px), zoom, dy (px, + = look higher)]. */
type CK = [lt: number, u: number, s: number, dy: number];
const FOCUS: CK[][] = [
  // 01 openapi: wide while the page builds → push on the dialog (URL bar + Send, cURL tab,
  // response header) for Send → 201 → snap wide for the stamp + tab flips
  [[0.3, -40, 1.0, 0], [1.12, 0, 1.0, 0], [1.24, 60, 1.02, 10], [1.45, 600, 1.8, 240], [2.33, 616, 1.82, 240], [2.5, 30, 1.0, 0], [2.92, 110, 1.05, 10]],
  // 02 obsidian: vault push → the raw callout line → track the flip to its page slot → pull back
  [[0, -300, 1.22, 40], [1.28, -300, 1.25, 40], [1.42, -716, 1.85, 203], [1.7, -700, 1.86, 203], [1.86, 529, 1.95, 94], [2.0, 529, 1.97, 94], [2.18, 40, 1.0, 0], [3.2, 60, 1.02, 0]],
  // 03 sanity: wide → push on the preview while blocks land (84.6 / 84.8 / 85.0 / 85.2) → wide
  [[0, -30, 1.0, 0], [1.1, -20, 1.0, 0], [1.27, 360, 1.66, -75], [2.02, 366, 1.68, -75], [2.2, 20, 1.0, 0], [3.2, 40, 1.03, 0]],
  // 04 story: wide (title, b2 pick) → push on the component + type select for b3 → wide
  [[0, -20, 1.0, 0], [0.58, -20, 1.0, 0], [0.72, -145, 1.6, -110], [1.06, -140, 1.62, -110], [1.2, -10, 1.0, 0], [1.6, 0, 1.02, 0], [1.72, -330, 1.62, -60], [2.0, -335, 1.64, -60]],
];

function trackK(keys: CK[], lt: number, j: 1 | 2 | 3) {
  return track(lt, keys.map((k) => [k[0], k[j], ease.inOutCubic] as [number, number, typeof ease.inOutCubic]));
}

/** In-station drift: (u, s, dy) as a function of time since the station's downbeat. */
function drift(k: number, lt: number): [number, number, number] {
  const keys = FOCUS[k];
  const u = trackK(keys, lt, 1) + n1(lt * 0.35, k + 3) * 5;
  const s = trackK(keys, lt, 2) + n1(lt * 0.3, k + 9) * 0.003;
  return [u, s, trackK(keys, lt, 3)];
}

/** `punch: false` = the camera without the chop/downbeat zoom punches (for motion-blur deltas). */
export function camAt(t: number, o: { punch?: boolean } = {}): Cam {
  const pk = o.punch === false ? 1 : punch(t);
  // ── before the drop: launch pose (caret at screen centre on the rail) ──
  if (t < T.drop) return { phi: A_LAUNCH, h: 0, u: 0, s: 1, roll: 0 };

  // ── converge (88.8 → 89.6): pull out to the whole ring, then settle on the core ──
  if (t >= T.reveal) return convergeCam(t);

  // which station segment are we in?
  let k = 0;
  for (let i = 1; i < STATIONS.length; i++) if (t >= whipStart(i - 1)) k = i;

  if (k === 0) {
    // launch ride → OpenAPI (critically damped chase of the packet)
    // hold on the departure sign while the packet fires, then chase (settled by ~77.3, before the scan)
    const c = ease.outExpo(clamp((t - T.drop - 0.18) / 0.36));
    const ch = ease.outExpo(clamp((t - T.drop - 0.2) / 0.4));
    const [du, ds, dy] = drift(0, t - T.drop);
    const phi = lerp(A_LAUNCH, A[0], c);
    return { phi, h: lerp(0, H0 + dy, ch), u: du * ch, s: lerp(1, ds, ch) * pk, roll: 0 };
  }
  // whip from station k-1 to k, then hold at k
  const ws = whipStart(k - 1);
  const w = whipP(t, ws, WHIP_DUR);
  const [uPrev, sPrev, dyPrev] = drift(k - 1, ws - STATIONS[k - 1].t0);
  const [uNow, sNow, dyNow] = drift(k, t - STATIONS[k].t0);
  const settle = clamp((t - ws) / WHIP_DUR);
  const se = ease.inOutCubic(settle);
  const u = lerp(uPrev, uNow, se);
  const s = lerp(sPrev, sNow, se) * pk;
  // a slight crane dip mid-whip sells the speed
  const h = H0 + lerp(dyPrev, dyNow, se) - 60 * Math.sin(Math.PI * clamp(w));
  return { phi: lerp(A[k - 1], A[k], w), h, u, s, roll: 0 };
}

/** zoom of the full-ring reveal */
export const S_REVEAL = 0.2;

function convergeCam(t: number): Cam {
  const [u0, s0, dy0] = drift(3, T.reveal - STATIONS[3].t0);
  // one continuous pull-out: snap reveal of the whole ring on bar 56 b2 (88.4 → 88.7), the outputs
  // land on the fill's 16ths, then in the stop the ring tightens into the moon's rim (R·s = 140 px
  // at 89.5, at rest)
  // zoom out first (outExpo), re-centre on the core a beat behind (inOutCubic): the ring and
  // the stations appear before the core takes the centre (no frames filled by the dark disc)
  const p1 = ease.outExpo(clamp((t - T.reveal) / 0.3));
  const pc = ease.inOutCubic(clamp((t - T.reveal) / 0.34));
  const p2 = ease.inOutCubic(clamp((t - 89.2) / 0.3));
  const sRev = S_REVEAL;
  const sEnd = 140 / R;
  const ls = lerp(Math.log(s0), Math.log(sRev), p1) + (Math.log(sEnd) - Math.log(sRev)) * p2;
  const h = lerp(H0 + dy0, -R, pc);
  const u = lerp(u0, 0, pc);
  // the world keeps turning clockwise, decelerating to rest by 89.583
  const q = clamp((t - T.reveal) / (T.end - 1 / 60 - T.reveal));
  const phi = A[3] - ((64 * Math.PI) / 180) * ease.outCubic(q);
  return { phi, h, u, s: Math.exp(ls), roll: 0 };
}

// ── matrices ─────────────────────────────────────────────────────────────────

/** World (y up) → screen px. */
export function camMatrix(c: Cam, W = 1920, H = 1080): DOMMatrix {
  const ux = Math.cos(c.phi), uy = Math.sin(c.phi);
  const rx = uy, ry = -ux; // clockwise tangent = screen right
  const cx = (R + c.h) * ux + c.u * rx;
  const cy = (R + c.h) * uy + c.u * ry;
  const cr = Math.cos(c.roll), sr = Math.sin(c.roll);
  return new DOMMatrix()
    .translate(W / 2, H / 2)
    .scale(1, -1)
    .multiply(new DOMMatrix([cr, sr, -sr, cr, 0, 0]))
    .scale(c.s, c.s)
    .multiply(new DOMMatrix([rx, ux, ry, uy, 0, 0]))
    .translate(-cx, -cy);
}

/** Station-local px (x right, y down, horizon at YH, settled view = screen) → world. */
export function stationMatrix(a: number): DOMMatrix {
  const ux = Math.cos(a), uy = Math.sin(a);
  const rx = uy, ry = -ux;
  const px = R * ux, py = R * uy;
  return new DOMMatrix([rx, ry, -ux, -uy, px - 960 * rx + YH * ux, py - 960 * ry + YH * uy]);
}

export function apply(m: DOMMatrix, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

/** Screen-space rotation of a world/local frame under matrix m (rad). */
export const matAngle = (m: DOMMatrix) => Math.atan2(m.b, m.a);
export const matScale = (m: DOMMatrix) => Math.hypot(m.a, m.b);
