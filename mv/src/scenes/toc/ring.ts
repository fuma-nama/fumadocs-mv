import { glyphs, setFont, type TextOpts } from '../../engine/draw2d';
import { HERO_TOC } from './toc-geometry';

/**
 * The magic circle's heading ring (shared with LAYOUT for the B3 unroll).
 * Each heading is centred on its progress sector (19 sectors from 12 o'clock, clockwise) and set
 * tangentially: upper half reads clockwise (glyph tops outward), lower half counter-clockwise
 * (glyph tops inward) so every heading stays upright.
 */
export const RING = {
  cx: 960,
  cy: 540,
  /** progress ring radius (stroke centre) */
  R: 300,
  /** heading glyph-centre radius */
  rText: 410,
  size: 20,
  weight: 400,
  font: 'ui' as const,
} as const;

/** minimum arc gap (px) between neighbouring headings */
const GAP = 16;

/**
 * Heading centre angles: equal progress sectors, relaxed apart where two long neighbours would
 * collide ("Code Blocks" | "Table of Contents"), with a weak pull back to the sector centres.
 */
function headingAngles(c: CanvasRenderingContext2D, r: number, size: number): number[] {
  const w = HERO_TOC.map((h) => glyphs(c, h.title, { font: RING.font, size, weight: RING.weight }).width);
  const n = w.length;
  const a = HERO_TOC.map((_, i) => sectorMid(i));
  const separate = () => {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const d = a[j] - a[i] + (j === 0 ? Math.PI * 2 : 0);
      const need = ((w[i] + w[j]) / 2 + GAP) / r;
      if (d < need) {
        a[i] -= (need - d) / 2;
        a[j] += (need - d) / 2;
      }
    }
  };
  for (let it = 0; it < 240; it++) {
    separate();
    for (let i = 0; i < n; i++) a[i] += (sectorMid(i) - a[i]) * 0.02;
  }
  for (let it = 0; it < 40; it++) separate();
  return a;
}

export const N_HEAD = HERO_TOC.length;
/** sector centre angle (rad, 0 = 3 o'clock, clockwise) of heading i */
export const sectorMid = (i: number) => -Math.PI / 2 + ((i + 0.5) / N_HEAD) * Math.PI * 2;

export interface RingGlyph {
  ch: string;
  /** heading index */
  i: number;
  /** glyph centre on screen */
  x: number;
  y: number;
  /** canvas rotation of the glyph (rad) */
  rot: number;
  size: number;
}

const cache = new Map<string, RingGlyph[]>();

/**
 * Glyph placements of the whole heading ring (static: ω = 0). Glyphs are drawn centred
 * (textAlign 'center', textBaseline 'middle') at (x, y) rotated by rot.
 */
export function ringGlyphs(c: CanvasRenderingContext2D, o: { cx?: number; cy?: number; r?: number; size?: number } = {}): RingGlyph[] {
  const cx = o.cx ?? RING.cx, cy = o.cy ?? RING.cy, r = o.r ?? RING.rText, size = o.size ?? RING.size;
  const key = `${cx}|${cy}|${r}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out: RingGlyph[] = [];
  const to: TextOpts = { font: RING.font, size, weight: RING.weight };
  const ang = headingAngles(c, r, size);
  HERO_TOC.forEach((h, i) => {
    const mid = ang[i];
    const { glyphs: gs, width } = glyphs(c, h.title, to);
    const lower = Math.sin(mid) > 0.02; // below the horizontal: read counter-clockwise
    for (const g of gs) {
      const off = (g.x + g.w / 2 - width / 2) / r; // arc offset from the sector centre
      const a = lower ? mid - off : mid + off;
      out.push({ ch: g.ch, i, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, rot: lower ? a - Math.PI / 2 : a + Math.PI / 2, size });
    }
  });
  cache.set(key, out);
  return out;
}

/** Draw the heading ring; colour per heading index. */
export function drawRing(c: CanvasRenderingContext2D, gl: RingGlyph[], color: (i: number) => string, alpha: (i: number) => number = () => 1) {
  c.save();
  setFont(c, { font: RING.font, size: gl[0]?.size ?? RING.size, weight: RING.weight, align: 'center', baseline: 'middle' });
  const base = c.getTransform();
  const ga = c.globalAlpha;
  for (const g of gl) {
    const a = alpha(g.i);
    if (a <= 0) continue;
    c.globalAlpha = ga * a;
    c.fillStyle = color(g.i);
    c.setTransform(base);
    c.translate(g.x, g.y);
    c.rotate(g.rot);
    c.fillText(g.ch, 0, 0);
  }
  c.restore();
}
