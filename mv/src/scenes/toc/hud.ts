import { clamp } from '../../engine/anim';
import { FONTS, text, measure, type TextOpts } from '../../engine/draw2d';

type Ctx = CanvasRenderingContext2D;

export const MONO = (size: number, color: string, extra: Partial<TextOpts> = {}): TextOpts => ({ font: 'mono', size, color, weight: 400, ...extra });

/** Thin crosshair with a gap and four corner ticks (P1PE reticle). */
export function reticle(c: Ctx, x: number, y: number, r: number, color: string, a = 1, lw = 1) {
  if (a <= 0) return;
  c.save();
  c.globalAlpha *= a;
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.beginPath();
  const g = r * 0.42;
  c.moveTo(x - r, y);
  c.lineTo(x - g, y);
  c.moveTo(x + g, y);
  c.lineTo(x + r, y);
  c.moveTo(x, y - r);
  c.lineTo(x, y - g);
  c.moveTo(x, y + g);
  c.lineTo(x, y + r);
  c.stroke();
  // corner brackets
  const k = r * 0.7, q = r * 0.28;
  c.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    c.moveTo(x + sx * k, y + sy * (k - q));
    c.lineTo(x + sx * k, y + sy * k);
    c.lineTo(x + sx * (k - q), y + sy * k);
  }
  c.stroke();
  c.restore();
}

/** Small square node (filled or hollow). */
export function node(c: Ctx, x: number, y: number, s: number, color: string, filled: boolean, a = 1) {
  if (a <= 0) return;
  c.save();
  c.globalAlpha *= a;
  if (filled) {
    c.fillStyle = color;
    c.fillRect(x - s / 2, y - s / 2, s, s);
  } else {
    c.strokeStyle = color;
    c.lineWidth = 1;
    c.strokeRect(x - s / 2 + 0.5, y - s / 2 + 0.5, s - 1, s - 1);
  }
  c.restore();
}

/** Line drawn on from (x0,y0) by fraction p. Crisp-aligned for axis-parallel lines. */
export function hair(c: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, p = 1, a = 1, lw = 1) {
  if (p <= 0 || a <= 0) return;
  c.save();
  c.globalAlpha *= a;
  // no pixel snapping: these lines ride moving cameras (the 2× supersampled layer keeps them crisp)
  const ax = x0, bx = x1, ay = y0, by = y1;
  c.beginPath();
  c.moveTo(ax, ay);
  c.lineTo(ax + (bx - ax) * clamp(p), ay + (by - ay) * clamp(p));
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.stroke();
  c.restore();
}

/** Text revealed left-to-right by a typewriter fraction p (monospace cells). */
export function typeOn(c: Ctx, str: string, x: number, y: number, o: TextOpts, p: number, align: 'left' | 'right' = 'left') {
  if (p <= 0) return 0;
  const n = Math.max(0, Math.min(str.length, Math.ceil(str.length * clamp(p))));
  const shown = str.slice(0, n);
  const w = measure(c, str, o);
  const x0 = align === 'right' ? x - w : x;
  text(c, shown, x0, y, { ...o, align: 'left' });
  return w;
}

/** Thin boxed tracked label (TACTIC word) with a draw-on: box perimeter then text. */
export function boxWord(
  c: Ctx,
  str: string,
  x: number,
  y: number,
  p: number,
  o: { size?: number; color?: string; track?: number; lw?: number; pad?: number; fill?: string; fillAlpha?: number; textColor?: string } = {},
) {
  if (p <= 0) return;
  const size = o.size ?? 18;
  const color = o.color ?? '#0a0a0b';
  const to: TextOpts = { font: 'wide', size, weight: 400, tracking: o.track ?? 0.42, color: o.textColor ?? color, baseline: 'middle' };
  const tw = measure(c, str, to) - size * (to.tracking ?? 0);
  const padX = o.pad ?? size * 1.1;
  const padY = size * 0.72;
  const bw = tw + padX * 2;
  const bh = size + padY * 2;
  const bx = Math.round(x) + 0.5;
  const by = Math.round(y - bh / 2) + 0.5;
  const pb = clamp(p / 0.6);
  if (o.fill && (o.fillAlpha ?? 1) > 0 && pb > 0) {
    c.save();
    c.globalAlpha *= (o.fillAlpha ?? 1) * pb;
    c.fillStyle = o.fill;
    c.fillRect(bx, by, bw, bh);
    c.restore();
  }
  // perimeter draw-on from the top-left corner, both directions
  c.save();
  c.strokeStyle = color;
  c.lineWidth = o.lw ?? 1;
  c.beginPath();
  const half = (bw + bh) * pb;
  // clockwise: top then right
  let rem = half;
  c.moveTo(bx, by);
  const segA: [number, number][] = [[bx + bw, by], [bx + bw, by + bh]];
  let px = bx, py = by;
  for (const [qx, qy] of segA) {
    const len = Math.hypot(qx - px, qy - py);
    const k = Math.min(1, rem / len);
    c.lineTo(px + (qx - px) * k, py + (qy - py) * k);
    rem -= len;
    if (rem <= 0) break;
    px = qx;
    py = qy;
  }
  // counter-clockwise: left then bottom
  rem = half;
  c.moveTo(bx, by);
  px = bx;
  py = by;
  const segB: [number, number][] = [[bx, by + bh], [bx + bw, by + bh]];
  for (const [qx, qy] of segB) {
    const len = Math.hypot(qx - px, qy - py);
    const k = Math.min(1, rem / len);
    c.lineTo(px + (qx - px) * k, py + (qy - py) * k);
    rem -= len;
    if (rem <= 0) break;
    px = qx;
    py = qy;
  }
  c.stroke();
  c.restore();
  const pt = clamp((p - 0.35) / 0.65);
  if (pt > 0) {
    const chars = [...str];
    const n = Math.ceil(chars.length * pt);
    text(c, chars.slice(0, n).join(''), bx + padX, y + size * 0.04, to);
  }
  return { x: bx, y: by, w: bw, h: bh };
}

/** Registration mark: circle + cross. */
export function regMark(c: Ctx, x: number, y: number, r: number, color: string, a = 1) {
  if (a <= 0) return;
  c.save();
  c.globalAlpha *= a;
  c.strokeStyle = color;
  c.lineWidth = 1;
  c.beginPath();
  c.arc(x, y, r * 0.55, 0, Math.PI * 2);
  c.moveTo(x - r, y);
  c.lineTo(x + r, y);
  c.moveTo(x, y - r);
  c.lineTo(x, y + r);
  c.stroke();
  c.restore();
}

export function fontPx(role: keyof typeof FONTS, size: number, weight = 400) {
  return `${weight} ${size}px ${FONTS[role]}`;
}
