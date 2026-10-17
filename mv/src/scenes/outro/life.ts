import { clamp, ease, hash, seg, fract } from '../../engine/anim';
import { setFont, type TextOpts } from '../../engine/draw2d';
import { C } from '../_shared/palette';

type Ctx = CanvasRenderingContext2D;

/**
 * A sheen of light crossing a line of text: the text is re-filled with a slanted gradient band
 * (transparent → colour → transparent) travelling left → right between x0 and x1.
 */
export function sheen(c: Ctx, str: string, x: number, y: number, o: TextOpts, p: number, x0: number, x1: number, color: string, strength = 1, band = 160) {
  if (p <= 0 || p >= 1) return;
  const bx = x0 - band + (x1 - x0 + 2 * band) * ease.inOutQuad(p);
  const a = strength * Math.sin(Math.PI * p);
  c.save();
  setFont(c, o);
  // slanted band: the gradient axis leans 18° from horizontal
  const dx = Math.cos(0.31) * band;
  const dy = Math.sin(0.31) * band;
  const g = c.createLinearGradient(bx - dx, y - dy, bx + dx, y + dy);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(0.5, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g;
  c.fillText(str, x, y);
  c.restore();
}

/** Clock playhead on the title card's top ruler: one step per tick (8ths), x 120 → 1800. */
export function drawPlayhead(c: Ctx, t: number, t0: number, t1: number, alpha: number) {
  if (t < t0 - 0.2 || alpha <= 0) return;
  const step = 0.2;
  const n = Math.round((t1 - t0) / step); // 15 steps, 16 ticks
  // limited animation: each step starts 2 frames early and settles on its tick (tiny overshoot)
  const lead = 0.035;
  const k = clamp(Math.floor((t + lead - t0) / step + 1e-6), 0, n);
  const into = t + lead - (t0 + k * step);
  const prev = Math.max(0, k - 1);
  const p = k === 0 ? 1 : ease.outBack(clamp(into / 0.05), 2.2);
  const xAt = (i: number) => 120 + ((1800 - 120) * i) / n;
  const x = Math.round(xAt(prev) + (xAt(k) - xAt(prev)) * p) + 0.5;
  const a = alpha * seg(t, t0 - 0.2, t0);
  c.save();
  c.globalAlpha = a;
  c.strokeStyle = C.ORANGE;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x, 30);
  c.lineTo(x, 48);
  c.stroke();
  c.fillStyle = C.ORANGE;
  c.fillRect(x - 2.5, 26, 5, 5);
  // the ruler behind the playhead is "read"
  c.globalAlpha = a * 0.35;
  c.fillRect(120, 47, x - 120, 1);
  c.restore();
}

/**
 * Faint dust drifting up through the night air (deterministic). With `light`, motes near the
 * moon catch its glow (warmer and brighter on the lit, bottom-right side).
 */
export function drawDust(c: Ctx, t: number, alpha: number, light?: { x: number; y: number; r: number; k: number }, count = 46) {
  if (alpha <= 0) return;
  c.save();
  for (let i = 0; i < count; i++) {
    const sp = 6 + 16 * hash(i, 2);
    const x0 = hash(i, 1) * 1920;
    const y = 1080 - fract(hash(i, 3) + (t * sp) / 1080) * 1080;
    const x = x0 + Math.sin(t * (0.3 + hash(i, 4)) + i) * 12;
    const tw = 0.55 + 0.45 * Math.sin(t * (1.5 + 2 * hash(i, 5)) + i * 1.7);
    let r = 0.6 + 1.1 * hash(i, 6);
    let a = (0.06 + 0.16 * hash(i, 7)) * tw;
    let col: string = hash(i, 8) > 0.85 ? C.SUN : C.PAPER;
    if (light && light.k > 0) {
      const dx = x - light.x;
      const dy = y - light.y;
      const d = Math.hypot(dx, dy);
      const near = clamp(1 - (d - light.r) / (0.9 * light.r)) * (d > light.r - 2 ? 1 : 0);
      const lit = clamp(((dx + dy) / Math.SQRT2 / Math.max(1, d)) * 0.9 + 0.35);
      const glow = near * lit * light.k;
      if (glow > 0.05) {
        col = glow > 0.5 ? C.SUN : C.ORANGE;
        a = Math.min(1, a + 0.55 * glow);
        r += 0.8 * glow;
      }
    }
    c.globalAlpha = alpha * a;
    c.fillStyle = col;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** A soft arc of light sliding along a circle's rim (angles in radians, canvas convention). */
export function drawRimLight(c: Ctx, x: number, y: number, r: number, a: number, span: number, alpha: number, lw = 2.2) {
  if (alpha <= 0.002) return;
  c.save();
  const n = 24;
  for (let k = 0; k < n; k++) {
    const u0 = k / n;
    const u1 = (k + 1) / n;
    const w = Math.sin(Math.PI * (u0 + u1) / 2) ** 2; // bright centre, soft ends
    c.beginPath();
    c.arc(x, y, r, a - span / 2 + span * u0, a - span / 2 + span * u1 + 0.002);
    c.strokeStyle = C.SUN;
    c.globalAlpha = alpha * w;
    c.lineWidth = lw * (0.5 + 0.5 * w);
    c.shadowColor = C.ORANGE;
    c.shadowBlur = 10;
    c.stroke();
  }
  c.restore();
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a)})`;
}
