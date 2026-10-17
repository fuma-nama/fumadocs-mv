import { clamp, lerp } from '../../engine/anim';
import { FONTS } from '../../engine/draw2d';
import { baselineRatio, HERO_TOC, mixColor, type TocItem } from './toc-geometry';

/**
 * The other Fumadocs TOC styles, rebuilt from source + plates geometry (dark neutral, primary ORANGE).
 * All drawers take css coordinates mapped by screen = (ox, oy) + S · css.
 */
export const DARK = {
  bg: '#121212',
  fg: '#ebebeb',
  muted: 'rgba(179,179,179,0.8)',
  primary: '#FA8023',
  border: 'rgba(102,102,102,0.2)',
  header: 'rgba(18,18,18,0.8)',
};
export type VariantColors = typeof DARK;

type Ctx = CanvasRenderingContext2D;

function font(c: Ctx, size: number, weight = 400) {
  c.font = `${weight} ${size}px ${FONTS.ui}`;
  (c as Ctx & { letterSpacing: string }).letterSpacing = '0px';
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
}

// ── block (components/toc/block.tsx) ─────────────────────────────────────────
export const BLOCK_ROW = 28;
export const BLOCK_W = 251;
export const blockPad = (depth: number) => (depth <= 2 ? 8 : depth === 3 ? 20 : 32);

export interface BlockState {
  /** clip inset top / bottom edge of the block (css y) */
  top: number;
  bottom: number;
  textActive: ArrayLike<number>;
}

/** Block TOC: 13/20 text, py-1 rows (28 px), a from-primary/10 gradient block clipped with inset(… round 8px). */
export function drawBlock(c: Ctx, S: number, ox: number, oy: number, st: BlockState, items: TocItem[] = HERO_TOC, col: VariantColors = DARK, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  if (st.bottom > st.top) {
    const g = c.createLinearGradient(ox, 0, ox + BLOCK_W * S, 0);
    g.addColorStop(0, 'rgba(250,128,35,0.10)');
    g.addColorStop(1, 'rgba(250,128,35,0)');
    c.fillStyle = g;
    c.beginPath();
    c.roundRect(ox, oy + st.top * S, BLOCK_W * S, (st.bottom - st.top) * S, Math.min(8 * S, ((st.bottom - st.top) * S) / 2));
    c.fill();
  }
  const size = 13 * S;
  font(c, size);
  const base = baselineRatio(c, FONTS.ui, 400, 13, 20) * 13;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const y = oy + (i * BLOCK_ROW + 4 + base) * S;
    if (y < -size * 2 || y > c.canvas.height + size * 2) continue;
    c.fillStyle = mixColor(col.muted, col.primary, st.textActive[i] ?? 0);
    c.fillText(it.title, ox + blockPad(it.depth) * S, y);
  }
  c.restore();
}

// ── glass minimap (layouts/glass/page/slots/toc.tsx) ────────────────────────
export interface GlassState {
  /** 0 = collapsed ticks (12 px rows), 1 = expanded titles (24 px rows) */
  open: number;
  textActive: ArrayLike<number>;
}
export const glassTickW = (depth: number) => Math.pow(depth, 1.5) * 4;
export const glassPitch = (open: number) => lerp(12, 24, open);

/** Glass TOC panel, right-aligned at screen x = right (css origin = the panel's top-right corner). */
export function drawGlass(c: Ctx, S: number, right: number, oy: number, st: GlassState, items: TocItem[] = HERO_TOC, col: VariantColors = DARK, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  const ga = c.globalAlpha;
  const p = glassPitch(st.open);
  const size = 12 * S;
  font(c, size);
  const base = baselineRatio(c, FONTS.ui, 400, 12, 16) * 12;
  const tickOff = 'rgba(179,179,179,0.4)';
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const top = oy + i * p * S;
    if (top < -40 * S || top > c.canvas.height + 40) continue;
    const a = st.textActive[i] ?? 0;
    const w = lerp(4, glassTickW(it.depth), st.open);
    const h = lerp(4, 1, st.open);
    const cy = top + (p / 2) * S;
    c.fillStyle = mixColor(tickOff, col.primary, a);
    c.beginPath();
    c.roundRect(right - w * S, cy - (h / 2) * S, w * S, h * S, (Math.min(w, h) / 2) * S);
    c.fill();
    if (st.open > 0.01) {
      c.globalAlpha = ga * clamp(st.open);
      c.fillStyle = mixColor(col.muted, col.primary, a);
      c.textAlign = 'right';
      c.fillText(it.title, right - (w + 8) * S, top + ((p - 16) / 2 + base) * S);
      c.textAlign = 'left';
      c.globalAlpha = ga;
    }
  }
  c.restore();
}

// ── progress circle (popover bar / Spacious TOCProgress) ────────────────────
export function progressCircle(c: Ctx, cx: number, cy: number, r: number, lw: number, value: number, color: string, trackAlpha = 0.25, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  c.lineWidth = lw;
  c.strokeStyle = color;
  c.globalAlpha *= trackAlpha;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.stroke();
  c.globalAlpha /= trackAlpha;
  const v = clamp(value);
  if (v > 0.0005) {
    c.lineCap = 'round';
    c.beginPath();
    c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v);
    c.stroke();
  }
  c.restore();
}

/** lucide chevron-down (24 viewBox, stroke 2) at (x, y) with size px; flip rotates 180°. */
export function chevron(c: Ctx, x: number, y: number, size: number, color: string, flip = 0, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  c.translate(x + size / 2, y + size / 2);
  c.rotate(Math.PI * flip);
  const k = size / 24;
  c.strokeStyle = color;
  c.lineWidth = 2 * k;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(-6 * k, -3 * k);
  c.lineTo(0, 3 * k);
  c.lineTo(6 * k, -3 * k);
  c.stroke();
  c.restore();
}

// ── mobile popover bar (layouts/docs/page/slots/toc.tsx TOCPopover) ──────────
export const BAR_W = 390;
export const BAR_H = 40;

export interface BarState {
  progress: number;
  title: string;
  /** 0 closed (muted circle) → 1 open (primary circle, chevron up) */
  open: number;
}

/** css origin = the bar's top-left (bar 390×40; circle (16,11) 18 px; title x 44; chevron (356,12) 16 px). */
export function drawPopoverBar(c: Ctx, S: number, ox: number, oy: number, st: BarState, col: VariantColors = DARK, alpha = 1, w = BAR_W, noCircle = false) {
  c.save();
  c.globalAlpha *= alpha;
  c.fillStyle = col.header;
  c.fillRect(ox, oy, w * S, BAR_H * S);
  c.fillStyle = col.border;
  c.fillRect(ox, oy + BAR_H * S, w * S, Math.max(1, S));
  const circ = mixColor(col.muted, col.primary, st.open);
  if (!noCircle) progressCircle(c, ox + 25 * S, oy + 20 * S, 7.5 * S, 1.5 * S, st.progress, circ);
  font(c, 14 * S);
  const base = baselineRatio(c) * 14;
  c.fillStyle = col.muted;
  c.fillText(st.title, ox + 44 * S, oy + (10 + base) * S);
  chevron(c, ox + (w - 34) * S, oy + 12 * S, 16 * S, col.muted, st.open);
  c.restore();
}

// ── Spacious TOC dropdown trigger with the rolling heading ───────────────────
export interface RollState {
  progress: number;
  title: string;
  /** seconds since the heading changed (roll-in 320 ms) */
  since: number;
  /** +1 rolled in from below (moving down the page), −1 from above */
  dir: number;
}

/**
 * css origin = trigger top-left; progress 16 px at (6, 8), heading at x 30 (line box y 6), chevron 14 px after it.
 * `rollEase` = cubic-bezier(0.22, 1, 0.36, 1), 320 ms, from opacity 0 · translateY(0.6em·dir) · blur(2px).
 */
export function drawRollTrigger(c: Ctx, S: number, ox: number, oy: number, st: RollState, ease: (x: number) => number, col: VariantColors = DARK, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  progressCircle(c, ox + 14 * S, oy + 16 * S, 6.5 * S, 1.5 * S, st.progress, col.muted);
  font(c, 14 * S);
  const base = baselineRatio(c) * 14;
  const tw = c.measureText(st.title).width;
  const k = ease(clamp(st.since / 0.32));
  const dy = (1 - k) * 0.6 * 14 * st.dir * S;
  const blur = (1 - k) * 2 * S;
  c.save();
  c.beginPath();
  c.rect(ox + 30 * S - 2 * S, oy, tw + 4 * S, 32 * S); // overflow-hidden span
  c.clip();
  c.globalAlpha *= k;
  const m = c.getTransform();
  const dev = blur * Math.hypot(m.a, m.b); // filter lengths are device pixels
  if (dev > 0.3) c.filter = `blur(${dev.toFixed(2)}px)`;
  c.fillStyle = col.fg;
  c.fillText(st.title, ox + 30 * S, oy + (6 + base) * S + dy);
  c.restore();
  chevron(c, ox + 30 * S + tw + 8 * S, oy + 9 * S, 14 * S, col.muted);
  c.restore();
  return tw / S;
}
