import { FONTS } from '../../engine/draw2d';

/**
 * Fumadocs' default ("normal") TOC, rebuilt from packages/base-ui/src/components/toc/default.tsx.
 * Coordinates are css px in the TOCItems container: x from its left edge (the rail SVG origin),
 * y from the first item's top (first item is pt-0, so its text box starts at y = 0).
 *
 *   items        Geist 14/20, py-1.5 (first pt-0, last pb-0) → text box of item i = [32i, 32i + 20]
 *   line x       getLineOffset(depth) + 0.5 → 8.5 (h2) / 16.5 (h3) / 24.5 (h4+)
 *   text x       getItemOffset(depth)       → 20 / 32 / 44
 *   path d       M x0 top0 L x0 bottom0, then per item `C ux top-4, x ub+4, x top L x bottom`
 *   rail         the same curve stroked in foreground/10 (per-item SVGs that abut exactly)
 *   active path  `d` in primary, clipped to [top(first active), bottom(last active)]
 *   thumb        4 px primary dot on offset-path `d`, offset-distance = itemLineLengths (incl. the
 *                source's 1 px `l++` search), transitions 150 ms
 *
 * Shared with READ (B2 handoff): `drawTocDefault` renders TOC's opening frame exactly.
 */

export interface TocItem {
  title: string;
  depth: number;
  id: string;
}

/** The hero page shared with READ and plates (the film's own table of contents). */
export const HERO_TOC: TocItem[] = [
  { title: 'Reading', depth: 2, id: 'reading' },
  { title: 'Search', depth: 3, id: 'search' },
  { title: 'Code Blocks', depth: 3, id: 'code-blocks' },
  { title: 'Table of Contents', depth: 2, id: 'table-of-contents' },
  { title: 'Layouts', depth: 2, id: 'layouts' },
  { title: 'Docs', depth: 3, id: 'docs' },
  { title: 'Notebook', depth: 3, id: 'notebook' },
  { title: 'Flux', depth: 3, id: 'flux' },
  { title: 'Glass', depth: 3, id: 'glass' },
  { title: 'Minimap', depth: 4, id: 'minimap' },
  { title: 'Spacious', depth: 3, id: 'spacious' },
  { title: 'Themes', depth: 2, id: 'themes' },
  { title: 'Make it yours', depth: 2, id: 'make-it-yours' },
  { title: 'Integrations', depth: 2, id: 'integrations' },
  { title: 'OpenAPI', depth: 3, id: 'openapi' },
  { title: 'Obsidian', depth: 3, id: 'obsidian' },
  { title: 'Sanity', depth: 3, id: 'sanity' },
  { title: 'Story', depth: 3, id: 'story' },
  { title: 'Showcase', depth: 2, id: 'showcase' },
];

/** Index of "Table of Contents" — the active item at the READ → TOC handoff (25.6 s). */
export const LANDING_INDEX = 3;

const BASE = 8;
export const lineOffset = (depth: number) => (depth <= 2 ? BASE : depth === 3 ? 8 + BASE : 16 + BASE);
export const itemOffset = (depth: number) => (depth <= 2 ? 12 + BASE : depth === 3 ? 24 + BASE : 36 + BASE);
/** clerk.tsx: getLineOffset 8 / 20 / 32 */
export const clerkLineOffset = (depth: number) => (depth <= 2 ? BASE : depth === 3 ? 12 + BASE : 24 + BASE);

export interface TocRow extends TocItem {
  i: number;
  /** text box (css px) */
  top: number;
  bottom: number;
  /** element box (offsetTop / offsetTop + clientHeight) */
  elTop: number;
  elBottom: number;
  /** rail / path x (incl. the +0.5) */
  x: number;
  /** text start x */
  textX: number;
}

export type PathSeg =
  | { k: 'L'; x0: number; y0: number; x1: number; y1: number }
  | { k: 'C'; x0: number; y0: number; c1x: number; c1y: number; c2x: number; c2y: number; x1: number; y1: number };

export interface TocLayout {
  rows: TocRow[];
  segs: PathSeg[];
  /** dense polyline of `d` with cumulative arc length */
  pts: Float64Array; // x, y, l triples
  length: number;
  /** itemLineLengths: [offset-distance at text top, at text bottom] per item (source algorithm) */
  lens: [number, number][];
  /** svg width/height (w = max(x + 8), h = last bottom) */
  width: number;
  height: number;
}

const ROW = 32;
const LINE = 20;
const CUBIC_STEPS = 64;

/** Layout of the default TOC for `items` (pure; cache the result). */
export function layoutDefault(
  items: TocItem[] = HERO_TOC,
  lineX: (depth: number) => number = (d) => lineOffset(d) + 0.5,
  textX: (depth: number) => number = itemOffset,
  join: 'bezier' | 'straight' = 'bezier',
): TocLayout {
  const n = items.length;
  const rows: TocRow[] = items.map((it, i) => {
    const top = i * ROW;
    const elTop = i === 0 ? 0 : top - 6;
    const elBottom = i === n - 1 ? top + LINE : top + LINE + 6;
    return { ...it, i, top, bottom: top + LINE, elTop, elBottom, x: lineX(it.depth), textX: textX(it.depth) };
  });
  const segs: PathSeg[] = [];
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    if (i > 0) {
      const u = rows[i - 1];
      if (join === 'bezier') segs.push({ k: 'C', x0: u.x, y0: u.bottom, c1x: u.x, c1y: r.top - 4, c2x: r.x, c2y: u.bottom + 4, x1: r.x, y1: r.top });
      // clerk: `L ux ub x top` — a straight diagonal (or vertical) join
      else segs.push({ k: 'L', x0: u.x, y0: u.bottom, x1: r.x, y1: r.top });
    }
    segs.push({ k: 'L', x0: r.x, y0: r.top, x1: r.x, y1: r.bottom });
  }
  const pts = flatten(segs);
  const length = pts[pts.length - 1];
  // itemLineLengths, exactly as the source computes them (including the integer `l++` search)
  const lens: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const { top, bottom } = rows[i];
    let l = i > 0 ? lens[i - 1][1] + (top - rows[i - 1].bottom) : top;
    while (l < length && pointOn(pts, l)[1] < top) l++;
    lens.push([l, l + bottom - top]);
  }
  let width = 0;
  for (const r of rows) width = Math.max(width, r.x + 8);
  return { rows, segs, pts, length, lens, width, height: rows.length ? rows[n - 1].bottom : 0 };
}

function cubicAt(s: Extract<PathSeg, { k: 'C' }>, t: number): [number, number] {
  const m = 1 - t;
  const a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t;
  return [a * s.x0 + b * s.c1x + c * s.c2x + d * s.x1, a * s.y0 + b * s.c1y + c * s.c2y + d * s.y1];
}

function flatten(segs: PathSeg[]): Float64Array {
  const out: number[] = [];
  let l = 0;
  let px = NaN, py = NaN;
  const push = (x: number, y: number) => {
    if (!Number.isNaN(px)) l += Math.hypot(x - px, y - py);
    out.push(x, y, l);
    px = x;
    py = y;
  };
  for (const s of segs) {
    if (Number.isNaN(px)) push(s.x0, s.y0);
    if (s.k === 'L') push(s.x1, s.y1);
    else for (let k = 1; k <= CUBIC_STEPS; k++) push(...cubicAt(s, k / CUBIC_STEPS));
  }
  return Float64Array.from(out);
}

/** Point on a flattened path at arc length d (like SVGPathElement.getPointAtLength). */
export function pointOn(pts: Float64Array, d: number): [number, number] {
  const n = pts.length / 3;
  if (d <= 0) return [pts[0], pts[1]];
  if (d >= pts[(n - 1) * 3 + 2]) return [pts[(n - 1) * 3], pts[(n - 1) * 3 + 1]];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid * 3 + 2] <= d) lo = mid;
    else hi = mid;
  }
  const al = pts[lo * 3 + 2], bl = pts[hi * 3 + 2];
  const k = (d - al) / Math.max(1e-9, bl - al);
  return [pts[lo * 3] + (pts[hi * 3] - pts[lo * 3]) * k, pts[lo * 3 + 1] + (pts[hi * 3 + 1] - pts[lo * 3 + 1]) * k];
}

/** Unit tangent of the path at arc length d. */
export function tangentOn(pts: Float64Array, d: number): [number, number] {
  const a = pointOn(pts, d - 0.25);
  const b = pointOn(pts, d + 0.25);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}

/** Trace the path `d` (in css px) into the current canvas path, transformed to screen px. */
export function tracePath(c: CanvasRenderingContext2D, L: TocLayout, S: number, ox: number, oy: number, from = 0, to = Infinity) {
  if (from <= 0 && to >= L.length) {
    let first = true;
    for (const s of L.segs) {
      if (first) c.moveTo(ox + s.x0 * S, oy + s.y0 * S);
      first = false;
      if (s.k === 'L') c.lineTo(ox + s.x1 * S, oy + s.y1 * S);
      else c.bezierCurveTo(ox + s.c1x * S, oy + s.c1y * S, ox + s.c2x * S, oy + s.c2y * S, ox + s.x1 * S, oy + s.y1 * S);
    }
    return;
  }
  // partial range along the arc length: use the dense polyline
  const p = L.pts;
  const n = p.length / 3;
  const a = pointOn(p, from);
  c.moveTo(ox + a[0] * S, oy + a[1] * S);
  for (let i = 0; i < n; i++) {
    const l = p[i * 3 + 2];
    if (l <= from) continue;
    if (l >= to) break;
    c.lineTo(ox + p[i * 3] * S, oy + p[i * 3 + 1] * S);
  }
  const b = pointOn(p, Math.min(to, L.length));
  c.lineTo(ox + b[0] * S, oy + b[1] * S);
}

// ── colours (neutral theme, film primary) ────────────────────────────────────
export const TOC_LIGHT = {
  bg: '#f5f5f5', // fd-background hsl(0 0% 96%)
  fg: '#0a0a0a', // fd-foreground hsl(0 0% 3.9%)
  muted: '#737373', // fd-muted-foreground hsl(0 0% 45.1%)
  primary: '#FA8023',
};
export const TOC_DARK = {
  bg: '#121212', // hsl(0 0% 7.04%)
  fg: '#ebebeb', // hsl(0 0% 92%)
  muted: 'rgba(179,179,179,0.8)', // hsla(0 0% 70% / 0.8)
  primary: '#FA8023',
};
export type TocColors = typeof TOC_LIGHT;

// ── text metrics ─────────────────────────────────────────────────────────────
const baselineCache = new Map<string, number>();
/**
 * Baseline offset (fraction of the font size) from the top of a line box, like Chrome's layout at
 * the css size: integer ascent/descent, half-leading floored, baseline = half-leading + ascent
 * (matches the plates: Geist 14/20 → 15, 13/20 → 14).
 */
export function baselineRatio(c: CanvasRenderingContext2D, font = FONTS.ui, weight = 400, size = 14, lineHeight = 20): number {
  const key = `${font}|${weight}|${size}|${lineHeight}`;
  let v = baselineCache.get(key);
  if (v === undefined) {
    c.save();
    c.font = `${weight} ${size}px ${font}`;
    const m = c.measureText('Hg');
    c.restore();
    const asc = Math.round(m.fontBoundingBoxAscent);
    const desc = Math.round(m.fontBoundingBoxDescent);
    v = (Math.floor((lineHeight - (asc + desc)) / 2) + asc) / size;
    baselineCache.set(key, v);
  }
  return v;
}

function mixHex(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const pa = parse(a), pb = parse(b);
  const r = pa.map((v, i) => v + (pb[i] - v) * t);
  return `rgba(${Math.round(r[0])},${Math.round(r[1])},${Math.round(r[2])},${r[3].toFixed(4)})`;
}
const parseCache = new Map<string, number[]>();
function parse(col: string): number[] {
  let v = parseCache.get(col);
  if (v) return v;
  if (col.startsWith('#')) {
    const h = col.slice(1);
    const n = parseInt(h.length === 3 ? h.replace(/./g, (x) => x + x) : h.slice(0, 6), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
  } else {
    const m = col.match(/[\d.]+/g)!.map(Number);
    v = [m[0], m[1], m[2], m[3] ?? 1];
  }
  parseCache.set(col, v);
  return v;
}
export const mixColor = mixHex;

// ── drawing ──────────────────────────────────────────────────────────────────
export interface TocDrawState {
  /** screen = (ox, oy) + S · css */
  S: number;
  ox: number;
  oy: number;
  /** clip range of the active path (css y) */
  trackTop: number;
  trackBottom: number;
  /** thumb offset-distance (css px along the path) */
  dotDist: number;
  dotAlpha?: number;
  /** per-item active amount 0..1 (text colour muted → primary) */
  textActive: ArrayLike<number>;
}

export interface TocDrawStyle {
  colors?: TocColors;
  /** fill the whole canvas with colors.bg first */
  fillBg?: boolean;
  /** stroke width multiplier (1 = 1 css px · S) */
  lineScale?: number;
  /** thumb diameter in css px (real: 4) */
  dotSize?: number;
  railAlpha?: number;
  textAlpha?: number;
  /** override text colour for inactive items */
  muted?: string;
  /** skip parts */
  noText?: boolean;
  noRail?: boolean;
  /** opacity multiplier for every part (opt-in: by default the canvas globalAlpha is not inherited) */
  alpha?: number;
}

/**
 * Draw the default TOC exactly like the DOM renders it (pure zoom by S).
 * TOC's B2 opening frame (25.6 s) = drawTocDefault(c, LAYOUT_HERO, landingState(), { fillBg: true }).
 */
export function drawTocDefault(c: CanvasRenderingContext2D, L: TocLayout, st: TocDrawState, style: TocDrawStyle = {}) {
  const col = style.colors ?? TOC_LIGHT;
  const { S, ox, oy } = st;
  const lw = S * (style.lineScale ?? 1);
  const A = style.alpha ?? 1;
  c.save();
  c.globalAlpha = A;
  if (style.fillBg) {
    c.fillStyle = col.bg;
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
  }
  c.lineCap = 'butt';
  c.lineJoin = 'miter';
  // rail: foreground / 10
  if (!style.noRail) {
    c.beginPath();
    tracePath(c, L, S, ox, oy);
    c.globalAlpha = A * (style.railAlpha ?? 0.1);
    c.strokeStyle = col.fg;
    c.lineWidth = lw;
    c.stroke();
    c.globalAlpha = A;
  }
  // active path, clipped vertically to the active range
  if (st.trackBottom > st.trackTop) {
    c.save();
    c.beginPath();
    c.rect(-1e5, oy + st.trackTop * S, 2e5, (st.trackBottom - st.trackTop) * S);
    c.clip();
    c.beginPath();
    tracePath(c, L, S, ox, oy);
    c.strokeStyle = col.primary;
    c.lineWidth = lw;
    c.stroke();
    c.restore();
  }
  // text
  if (!style.noText) {
    const size = 14 * S;
    const base = baselineRatio(c) * size;
    c.font = `400 ${size}px ${FONTS.ui}`;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    const muted = style.muted ?? col.muted;
    const ta = style.textAlpha ?? 1;
    for (const r of L.rows) {
      const y = oy + r.top * S;
      if (y > c.canvas.height + size || y + 20 * S < -size) continue;
      c.globalAlpha = A * ta;
      c.fillStyle = mixHex(muted, col.primary, st.textActive[r.i] ?? 0);
      c.fillText(r.title, ox + r.textX * S, y + base);
    }
    c.globalAlpha = A;
  }
  // thumb dot
  const da = st.dotAlpha ?? 1;
  if (da > 0) {
    const [x, y] = pointOn(L.pts, st.dotDist);
    c.globalAlpha = A * da;
    c.beginPath();
    c.arc(ox + x * S, oy + y * S, ((style.dotSize ?? 4) / 2) * S, 0, Math.PI * 2);
    c.fillStyle = col.primary;
    c.fill();
    c.globalAlpha = A;
  }
  c.restore();
}

/** Layout of the hero TOC (default style). */
export const LAYOUT_HERO = layoutDefault(HERO_TOC);
/** Layout of the hero TOC (clerk style: straight joins, 12 px per depth). */
export const LAYOUT_CLERK = layoutDefault(HERO_TOC, (d) => clerkLineOffset(d) + 0.5, itemOffset, 'straight');

/** B2 contract: TOC's first frame (t = 25.6) — S = 6, O = (549, −96), "Table of Contents" active, dot at (600, 600). */
export function landingState(L: TocLayout = LAYOUT_HERO): TocDrawState {
  const i = LANDING_INDEX;
  const textActive = new Float32Array(L.rows.length);
  textActive[i] = 1;
  return { S: 6, ox: 549, oy: -96, trackTop: L.rows[i].top, trackBottom: L.rows[i].bottom, dotDist: L.lens[i][1], textActive };
}
