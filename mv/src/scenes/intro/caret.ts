import { C } from '../_shared/palette';
import { BEAT } from '../../engine/time';

/**
 * The film's orange block caret — the "dot" that opens (intro, t = 0) and closes (outro, 108.8)
 * the film. Side-effect free: other scenes import this so the caret is identical everywhere.
 */
export const CARET = {
  /** centre at 1080p */
  x: 960,
  y: 540,
  /** block size at 1080p (w = h / 2) */
  w: 18,
  h: 36,
  color: C.ORANGE,
} as const;

/**
 * Block caret centred on (x, y). `h` = height in px (width = h / 2); sharp corners.
 * `glow` scales the soft orange halo (0 = none). Edges snap to whole pixels unless `snap: false`
 * (use false while it moves).
 */
export function drawCaret(
  c: CanvasRenderingContext2D,
  x: number = CARET.x,
  y: number = CARET.y,
  o: { h?: number; w?: number; alpha?: number; glow?: number; color?: string; snap?: boolean } = {},
) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const h = o.h ?? CARET.h;
  const w = o.w ?? h / 2;
  let x0 = x - w / 2;
  let y0 = y - h / 2;
  let x1 = x + w / 2;
  let y1 = y + h / 2;
  if (o.snap !== false) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
  }
  const color = o.color ?? CARET.color;
  const glow = o.glow ?? 1;
  c.save();
  c.globalAlpha *= alpha;
  if (glow > 0) {
    // halo: two soft passes (wide + tight), drawn under the block
    c.shadowColor = color;
    c.shadowOffsetX = 0;
    c.shadowOffsetY = 0;
    c.fillStyle = color;
    c.globalAlpha *= 0.55 * Math.min(1, glow);
    c.shadowBlur = h * 1.1 * glow;
    c.fillRect(x0, y0, x1 - x0, y1 - y0);
    c.shadowBlur = h * 0.35 * glow;
    c.fillRect(x0, y0, x1 - x0, y1 - y0);
    c.globalAlpha /= 0.55 * Math.min(1, glow);
    c.shadowBlur = 0;
    c.shadowColor = 'transparent';
  }
  c.fillStyle = color;
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.restore();
}

/** Power-on flourish timing (s). */
export const POWER_ON = { dur: 0.8 } as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const outExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const inOutQuart = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
const span = (s: number, a: number, b: number) => clamp01((s - a) / (b - a));

/**
 * The power-on flourish around a caret at (x, y) — draws everything except the caret itself:
 * a 1 px hairline crosshair whose heads shoot from the caret to the four frame edges (0–0.14 s)
 * and whose tails follow them out (0.12–0.5 s), leaving 16 px registration ticks at the edge
 * midpoints; a 1 px ring ping (r 24 → ~324 px, 0–0.8 s); a white-hot flash on the caret
 * (first 4 frames). `p` = 0..1 over POWER_ON.dur. `reverse` plays it backwards (the outro's
 * collapse: ring contracts, lines come in from the edges, flash at the end).
 */
export function drawPowerOn(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  p: number,
  o: { reverse?: boolean; W?: number; H?: number; ticks?: boolean; h?: number; color?: string } = {},
) {
  const W = o.W ?? 1920;
  const H = o.H ?? 1080;
  const ch = o.h ?? CARET.h;
  const cw = ch / 2;
  const s = (o.reverse ? 1 - clamp01(p) : clamp01(p)) * POWER_ON.dur; // seconds into the flourish
  const ink = o.color ?? C.WHITE;
  const px = Math.round(x) + 0.5; // crisp 1 px lines
  const py = Math.round(y) + 0.5;
  const head = outExpo(span(s, 0, 0.14));
  const tail = inOutQuart(span(s, 0.12, 0.5));
  c.save();
  c.lineWidth = 1;
  c.lineCap = 'butt';
  // four arms: [dirX, dirY, start offset from centre, distance to the frame edge]
  const arms: [number, number, number, number][] = [
    [1, 0, cw / 2 + 6, W - x],
    [-1, 0, cw / 2 + 6, x],
    [0, 1, ch / 2 + 6, H - y],
    [0, -1, ch / 2 + 6, y],
  ];
  if (head > tail + 1e-4) {
    for (const [dx, dy, a0, len] of arms) {
      const span0 = a0 + (len - a0) * tail;
      const span1 = a0 + (len - a0) * head;
      const g = c.createLinearGradient(px + dx * span0, py + dy * span0, px + dx * span1, py + dy * span1);
      g.addColorStop(0, `rgba(250,250,247,0)`);
      g.addColorStop(1, ink);
      c.strokeStyle = g;
      // soft glow under a crisp 1 px core
      for (const [lw, al] of [[5, 0.16], [1, 0.95]] as const) {
        c.lineWidth = lw;
        c.globalAlpha = al;
        c.beginPath();
        c.moveTo(px + dx * span0, py + dy * span0);
        c.lineTo(px + dx * span1, py + dy * span1);
        c.stroke();
      }
      // spark racing at the head
      if (head < 0.999) {
        c.globalAlpha = 1;
        c.fillStyle = ink;
        c.beginPath();
        c.arc(px + dx * span1, py + dy * span1, 2.2, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.lineWidth = 1;
  }
  // registration ticks where the arms hit the edges
  if (o.ticks !== false) {
    const k = span(s, 0.1, 0.3);
    if (k > 0) {
      c.globalAlpha = 0.5 * k;
      c.strokeStyle = ink;
      c.beginPath();
      c.moveTo(px, 0);
      c.lineTo(px, 16 * k);
      c.moveTo(px, H);
      c.lineTo(px, H - 16 * k);
      c.moveTo(0, py);
      c.lineTo(16 * k, py);
      c.moveTo(W, py);
      c.lineTo(W - 16 * k, py);
      c.stroke();
    }
  }
  // ring ping
  const rp = span(s, 0, POWER_ON.dur);
  if (rp > 0 && rp < 1) {
    c.globalAlpha = 0.75 * (1 - rp) ** 1.6;
    c.strokeStyle = ink;
    c.beginPath();
    c.arc(x, y, 24 + 300 * outExpo(rp), 0, Math.PI * 2);
    c.stroke();
  }
  // white-hot flash on the caret (first 4 frames)
  const fl = 1 - span(s, 0, 4 / 60);
  if (fl > 0) {
    c.globalAlpha = fl;
    c.fillStyle = ink;
    c.fillRect(Math.round(x - cw / 2), Math.round(y - ch / 2), Math.round(cw), Math.round(ch));
  }
  c.restore();
}

/**
 * Beat-locked blink, 0..1. ON for one beat on odd beats (beats 1 and 3 of every bar), OFF on
 * even beats (2 and 4). 2-frame rise, 3-frame fall. `from` = time of an ON onset (default 0,
 * which keeps every caret in the film on the same phase).
 */
export function caretBlink(t: number, from = 0): number {
  const k = Math.floor((t - from) / BEAT + 1e-6);
  const tk = from + k * BEAT;
  const fps = 60;
  if (k % 2 === 0) return Math.min(1, Math.max(0, ((t - tk) * fps + 1) / 2));
  return 1 - Math.min(1, Math.max(0, ((t - tk) * fps + 1) / 3));
}
