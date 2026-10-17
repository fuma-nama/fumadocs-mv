/** Rounded-rect outlines and small vector helpers (page px, y down). */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

export const lerpBox = (a: Box, b: Box, t: number): Box => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  w: a.w + (b.w - a.w) * t,
  h: a.h + (b.h - a.h) * t,
  r: a.r + (b.r - a.r) * t,
});

/**
 * Closed outline of a rounded rect, clockwise on screen, starting at the top-centre.
 * Constant point count for a given n (4·(n+1) + 2), so outlines morph point-to-point; a square
 * with r = w/2 is an exact circle.
 */
export function rrOutline(b: Box, n: number, out: number[] = []): number[] {
  out.length = 0;
  const r = Math.max(0, Math.min(b.r, b.w / 2, b.h / 2));
  const { x, y, w, h } = b;
  out.push(x + w / 2, y);
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  out.push(x + w / 2, y);
  return out;
}

/** Cumulative lengths of a polyline given as flat xy. */
export function polyLengths(p: number[]): number[] {
  const L = [0];
  for (let i = 2; i < p.length; i += 2) L.push(L[L.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
  return L;
}

/**
 * Sub-polyline between arc-length fractions [f0, f1] (f in 0..1 of the total length; f1 may wrap
 * past 1 for closed loops). Calls emit(ax, ay, bx, by) per piece.
 */
export function polyRange(p: number[], f0: number, f1: number, emit: (ax: number, ay: number, bx: number, by: number) => void, closed = true) {
  const L = polyLengths(p);
  const total = L[L.length - 1];
  if (total <= 0 || f1 <= f0) return;
  const pieces: [number, number][] = [];
  if (closed && f1 > 1) {
    pieces.push([f0 * total, total], [0, (f1 - 1) * total]);
  } else pieces.push([Math.max(0, f0) * total, Math.min(1, f1) * total]);
  for (const [s0, s1] of pieces) {
    if (s1 <= s0) continue;
    for (let i = 1; i < L.length; i++) {
      const a = L[i - 1];
      const b = L[i];
      if (b <= s0 || a >= s1) continue;
      const k0 = b > a ? Math.max(0, (s0 - a) / (b - a)) : 0;
      const k1 = b > a ? Math.min(1, (s1 - a) / (b - a)) : 1;
      const ax = p[2 * i - 2], ay = p[2 * i - 1], bx = p[2 * i], by = p[2 * i + 1];
      emit(ax + (bx - ax) * k0, ay + (by - ay) * k0, ax + (bx - ax) * k1, ay + (by - ay) * k1);
    }
  }
}
