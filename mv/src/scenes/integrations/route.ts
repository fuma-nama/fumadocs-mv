import { clamp, ease, type Ease } from '../../engine/anim';

/** One timed move along a polyline (constant speed along its length, eased in time). */
export interface Leg {
  t0: number;
  t1: number;
  pts: [number, number][];
  e?: Ease;
}

export interface RoutePos {
  x: number;
  y: number;
  /** velocity (units/s) */
  vx: number;
  vy: number;
  /** index of the current leg (-1 before the first) */
  leg: number;
  /** fraction of the current leg */
  f: number;
}

function lens(pts: [number, number][]) {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return out;
}

function along(pts: [number, number][], L: number[], d: number): [number, number] {
  const total = L[L.length - 1];
  if (total <= 0) return pts[0];
  d = clamp(d, 0, total);
  let i = 1;
  while (i < L.length - 1 && L[i] < d) i++;
  const k = (d - L[i - 1]) / Math.max(1e-9, L[i] - L[i - 1]);
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
}

/** A packet route through a station: legs in time order; between legs it rests at the last point. */
export class Route {
  private L: number[][];
  constructor(readonly legs: Leg[]) {
    this.L = legs.map((l) => lens(l.pts));
  }

  pos(t: number): RoutePos {
    const p = this.raw(t);
    const q = this.raw(t - 1 / 240);
    return { ...p, vx: (p.x - q.x) * 240, vy: (p.y - q.y) * 240 };
  }

  private raw(t: number) {
    const legs = this.legs;
    if (t < legs[0].t0) return { x: legs[0].pts[0][0], y: legs[0].pts[0][1], leg: -1, f: 0 };
    let i = 0;
    while (i < legs.length - 1 && t >= legs[i + 1].t0) i++;
    const l = legs[i];
    const f = clamp((t - l.t0) / Math.max(1e-6, l.t1 - l.t0));
    const ef = (l.e ?? ease.inOutCubic)(f);
    const L = this.L[i];
    const [x, y] = along(l.pts, L, ef * L[L.length - 1]);
    return { x, y, leg: i, f };
  }

  /** Stroke the travelled path from the first point up to time t (rounded corners). */
  trace(c: CanvasRenderingContext2D, t: number, radius = 14) {
    const legs = this.legs;
    if (t < legs[0].t0) return false;
    const pts: [number, number][] = [];
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i];
      if (t < l.t0) break;
      const L = this.L[i];
      const f = clamp((t - l.t0) / Math.max(1e-6, l.t1 - l.t0));
      const d = (l.e ?? ease.inOutCubic)(f) * L[L.length - 1];
      for (let j = 0; j < l.pts.length; j++) {
        if (L[j] <= d + 1e-6) pts.push(l.pts[j]);
        else {
          pts.push(along(l.pts, L, d));
          break;
        }
      }
    }
    roundedPolyline(c, pts, radius);
    return pts.length > 1;
  }
}

/** Polyline with arcTo-rounded corners (the TOC line's Bézier-joined look). */
export function roundedPolyline(c: CanvasRenderingContext2D, pts: [number, number][], radius: number) {
  // drop duplicate consecutive points
  const p: [number, number][] = [];
  for (const q of pts) if (!p.length || Math.hypot(q[0] - p[p.length - 1][0], q[1] - p[p.length - 1][1]) > 0.01) p.push(q);
  c.beginPath();
  if (p.length < 2) return;
  c.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1], b = p[i], d = p[i + 1];
    const r = Math.min(radius, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, Math.hypot(d[0] - b[0], d[1] - b[1]) / 2);
    c.arcTo(b[0], b[1], d[0], d[1], r);
  }
  c.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
}
