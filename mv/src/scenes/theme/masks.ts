import { clamp, ease } from '../../engine/anim';

/**
 * Repaint masks as vector paths, so the same gesture can fill the world, clip the type and
 * (rasterised into a mask layer) drive the page shader: one wipe repaints everything.
 */
export interface StripeOpts {
  /** stripe direction in degrees (screen, y down); −60 = "/" leaning */
  angle?: number;
  /** stripe period in px */
  period?: number;
  /** +1 sweeps along +normal (left→right for "/"), −1 reverse */
  dir?: number;
  /** stagger across the frame (0 = all stripes together, 1 = strictly sequential) */
  spread?: number;
  W?: number;
  H?: number;
}

interface Stripe {
  s0: number;
  s1: number;
  q: number;
}

function stripes(p: number, o: StripeOpts) {
  const W = o.W ?? 1920;
  const H = o.H ?? 1080;
  const a = ((o.angle ?? -60) * Math.PI) / 180;
  const d: [number, number] = [Math.cos(a), Math.sin(a)];
  const n: [number, number] = [-d[1], d[0]];
  const proj = (x: number, y: number) => x * n[0] + y * n[1];
  const ss = [proj(0, 0), proj(W, 0), proj(0, H), proj(W, H)];
  const smin = Math.min(...ss) - 2;
  const smax = Math.max(...ss) + 2;
  const P = o.period ?? 120;
  const spread = o.spread ?? 0.6;
  const dir = o.dir ?? 1;
  const out: Stripe[] = [];
  const N = Math.ceil((smax - smin) / P);
  for (let k = 0; k < N; k++) {
    const sk = smin + k * P;
    const u = (k + 0.5) / N;
    const uu = dir > 0 ? u : 1 - u;
    const q = clamp(p * (1 + spread) - spread * uu);
    const w = P * ease.outCubic(q);
    if (w <= 0.01) continue;
    // stripes grow toward the sweep direction
    if (dir > 0) out.push({ s0: sk, s1: Math.min(sk + w + (q >= 1 ? 0.75 : 0), sk + P + 0.75), q });
    else out.push({ s0: Math.max(sk + P - w - (q >= 1 ? 0.75 : 0), sk - 0.75), s1: sk + P, q });
  }
  const L = W + H;
  const cx = W / 2;
  const cy = H / 2;
  const c0 = proj(cx, cy);
  return { out, d, n, L, cx, cy, c0, dir };
}

export function stripePath(c: CanvasRenderingContext2D, p: number, o: StripeOpts = {}) {
  if (p <= 0) return;
  const { out, d, n, L, cx, cy, c0 } = stripes(p, o);
  for (const s of out) {
    const a = s.s0 - c0;
    const b = s.s1 - c0;
    const x0 = cx + n[0] * a;
    const y0 = cy + n[1] * a;
    const x1 = cx + n[0] * b;
    const y1 = cy + n[1] * b;
    c.moveTo(x0 - d[0] * L, y0 - d[1] * L);
    c.lineTo(x0 + d[0] * L, y0 + d[1] * L);
    c.lineTo(x1 + d[0] * L, y1 + d[1] * L);
    c.lineTo(x1 - d[0] * L, y1 - d[1] * L);
    c.closePath();
  }
}

/** Thin ink lines on the moving edges of growing stripes. */
export function stripeEdges(c: CanvasRenderingContext2D, p: number, o: StripeOpts, color: string, lw = 2) {
  if (p <= 0 || p >= 1) return;
  const { out, d, n, L, cx, cy, c0, dir } = stripes(p, o);
  c.beginPath();
  for (const s of out) {
    if (s.q >= 1) continue;
    const e = (dir > 0 ? s.s1 : s.s0) - c0;
    const x = cx + n[0] * e;
    const y = cy + n[1] * e;
    c.moveTo(x - d[0] * L, y - d[1] * L);
    c.lineTo(x + d[0] * L, y + d[1] * L);
  }
  c.lineWidth = lw;
  c.strokeStyle = color;
  c.stroke();
}

export function irisRadius(p: number, origin: [number, number], W = 1920, H = 1080) {
  const R = Math.max(Math.hypot(origin[0], origin[1]), Math.hypot(W - origin[0], origin[1]), Math.hypot(origin[0], H - origin[1]), Math.hypot(W - origin[0], H - origin[1])) + 4;
  return R * ease.outQuart(clamp(p));
}

export function irisPath(c: CanvasRenderingContext2D, p: number, origin: [number, number]) {
  if (p <= 0) return;
  const r = irisRadius(p, origin);
  c.moveTo(origin[0] + r, origin[1]);
  c.arc(origin[0], origin[1], r, 0, Math.PI * 2);
}

/** Add the full-frame rect then the mask; clip('evenodd') of this = outside the mask. */
export function invertPath(c: CanvasRenderingContext2D, W = 1920, H = 1080) {
  c.moveTo(-10, -10);
  c.lineTo(W + 10, -10);
  c.lineTo(W + 10, H + 10);
  c.lineTo(-10, H + 10);
  c.closePath();
}
