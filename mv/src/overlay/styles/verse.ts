/**
 * VERSE — restrained mincho, left-aligned; morae appear as they are sung (writing on the page);
 * a dot rides a 1 px rule under the sung text (the Fumadocs TOC indicator: rail + thumb).
 * VERTICAL — 縦組み: one column, phrases indented like TOC depths, a rail on the left with the
 * real TOC join curve, the dot riding it mora by mora; ruby right, English rotated along the rail.
 */
import { clamp, ease, lerp, seg } from '../../engine/anim';
import { drawGlyph, typeset, type Typeset, type TypesetOpts } from '../jp';
import type { LineTiming } from '../timing';
import { accentCtx, english, englishWidth, EN_FONT, lineWindow, plateRect, punch, revealT, rgba, scaled, withHalo, type RenderOpts } from './common';

/** Mora centre along the line (x for horizontal, y for vertical) in line space. */
export function moraPos(ts: Typeset, L: LineTiming, k: number): number {
  const m = L.morae[k];
  if (!m) return 0;
  const box = ts.segs.find((s) => s.seg === m.seg);
  if (!box) return 0;
  const [i, n] = m.part;
  return box.a0 + ((box.a1 - box.a0) * (i + 0.5)) / n;
}

const VERSE: TypesetOpts = {
  font: { role: 'jpSerif', weight: 600, size: 50 },
  tsume: 0.6,
  tracking: 0.02,
  space: 0.42,
  ruby: { font: { role: 'jpSerif', weight: 600, size: 20 }, gap: 4 },
};

/**
 * Dot position: like a karaoke bouncing ball it travels during the tail of the previous mora and
 * LANDS on each mora exactly at its onset (travel ≤ 0.1 s, ≤ half the gap between onsets).
 */
function slide(L: LineTiming, t: number, pos: (i: number) => number, e = ease.inOutCubic) {
  const n = L.morae.length;
  let k = 0;
  while (k < n && L.morae[k].t <= t + 1e-9) k++;
  // k = next mora to land on (n when all have landed)
  if (k >= n) return pos(n - 1);
  const m = L.morae[k];
  const prevT = k > 0 ? L.morae[k - 1].t : m.t - 0.4;
  const d = Math.min(0.1, Math.max(0.04, (m.t - prevT) * 0.5));
  return lerp(pos(k - 1), pos(k), seg(t, m.t - d, m.t, e));
}

export function drawVerse(c: CanvasRenderingContext2D, L: LineTiming, t: number, o: RenderOpts) {
  const W = lineWindow(L);
  if (t < W.a || t >= W.b) return;
  const k = o.scale ?? 1;
  const ts = typeset(L, scaled(VERSE, k));
  const [ox, oy] = o.anchor ?? [128, 968];
  const pal = o.pal;
  const halo = o.halo ?? 0;
  const size = ts.size;
  const out = seg(t, W.b - 0.34, W.b, ease.inCubic);
  const [ac, acol] = accentCtx(c, o);

  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  ac.save();
  ac.globalAlpha *= o.alpha ?? 1;
  // rule: the whole line's track (faint) + the read-so-far part, with the dot at its head
  const ry = oy + Math.round(size * 0.36) + 0.5;
  const x0 = ox - 2;
  const x1 = ox + ts.width + 6;
  const draw = seg(t, W.a, W.a + 0.45, ease.outExpo);
  const retract = seg(t, W.b - 0.34, W.b - 0.04, ease.inOutCubic);
  const px = (i: number) => (i < 0 ? x0 : ox + moraPos(ts, L, i));
  const dotX = slide(L, t, px);
  const ra = lerp(x0, x1, retract);
  const rb = lerp(x0, x1, draw);
  // backing strip (only where the background is cluttered): grows and retracts with the rule
  const rubyTop = oy - ts.ascent - (VERSE.ruby!.gap + VERSE.ruby!.font.size) * k - 4;
  const enW = englishWidth(L, EN_FONT(16.5 * k), 0.16);
  const plateR = lerp(x0, ox + Math.max(ts.width + 6, enW + 4), draw);
  plateRect(o.pc, ra - 22 * k, rubyTop - 12 * k, Math.max(ra, plateR) + 26 * k, ry + 40 * k, (o.plate ?? 0) * 0.62, 12, 10, o.plateColor);
  withHalo(c, pal.bg, halo, 8);
  if (rb > ra) {
    c.fillStyle = rgba(pal.ink, 0.17);
    c.fillRect(ra, ry - 0.5, rb - ra, 1);
  }
  const sx1 = Math.max(ra, Math.min(dotX, rb));
  if (sx1 > ra) {
    c.fillStyle = rgba(pal.ink, 0.66);
    c.fillRect(ra, ry - 0.5, sx1 - ra, 1);
  }
  const dotIn = seg(t, W.a, W.a + 0.22, ease.outBack);
  const dotOut = 1 - seg(t, W.b - 0.2, W.b - 0.02, ease.inCubic);
  const dr = 4 * k * dotIn * dotOut;
  const dx = Math.max(dotX, ra);
  if (dr > 0.2) {
    if (ac !== c) punch(c, dx, ry, dr + 1.5);
    ac.beginPath();
    ac.arc(dx, ry, dr, 0, Math.PI * 2);
    ac.fillStyle = acol;
    ac.fill();
  }

  // glyphs: appear on their mora (writing), leave with a soft upward fade
  for (const g of ts.glyphs) {
    const tr = revealT(L, g);
    const a = seg(t, tr - 0.035, tr + 0.13, ease.outCubic);
    if (a <= 0) continue;
    const order = g.cx / Math.max(1, ts.width);
    const go = seg(t, W.b - 0.34 + order * 0.12, W.b - 0.12 + order * 0.12, ease.inCubic);
    const dy = (1 - seg(t, tr, tr + 0.32, ease.outExpo)) * 10 * k - go * 8 * k;
    const blur = (1 - seg(t, tr, tr + 0.14, ease.outCubic)) * 3;
    if (blur > 0.3) c.filter = `blur(${blur.toFixed(2)}px)`;
    withHalo(c, pal.bg, halo, 10);
    drawGlyph(c, g, ox, oy, { fill: pal.ink, alpha: a * (1 - go), dy });
    c.filter = 'none';
  }
  // ruby: each reading kana appears on its own mora
  for (const r of ts.ruby) {
    const m = L.morae[r.mora];
    const a = seg(t, m.t - 0.035, m.t + 0.11, ease.outCubic);
    if (a <= 0) continue;
    const order = r.cx / Math.max(1, ts.width);
    const go = seg(t, W.b - 0.34 + order * 0.12, W.b - 0.12 + order * 0.12, ease.inCubic);
    const dy = (1 - seg(t, m.t, m.t + 0.3, ease.outExpo)) * 6 * k - go * 8 * k;
    withHalo(c, pal.bg, halo, 6);
    drawGlyph(c, r, ox, oy, { fill: rgba(pal.ink, 0.8), alpha: a * (1 - go), dy });
  }
  // English: wipes in with the line, fades with it
  const ea = seg(t, W.a + 0.1, W.a + 0.6, ease.outCubic) * (1 - out);
  if (ea > 0) {
    const ey = oy + Math.round(size * 0.36) + 27 * k;
    const font = EN_FONT(16.5 * k);
    const ew = englishWidth(L, font, 0.16);
    c.save();
    c.beginPath();
    c.rect(ox - 4, ey - 30 * k, (ew + 10) * seg(t, W.a + 0.1, W.a + 0.8, ease.outExpo), 44 * k);
    c.clip();
    withHalo(c, pal.bg, halo, 6);
    english(c, L, ox, ey, 16.5 * k, rgba(pal.ink, 0.66), ea, 'left', { font, tracking: 0.16 });
    c.restore();
  }
  ac.restore();
  c.restore();
  c.shadowColor = 'transparent';
}

// ── VERTICAL ────────────────────────────────────────────────────────────────

const VERT: TypesetOpts = {
  font: { role: 'jpSerif', weight: 600, size: 48 },
  tsume: 0.5,
  tracking: 0.04,
  space: 0.75,
  vertical: true,
  ruby: { font: { role: 'jpSerif', weight: 600, size: 18 }, gap: 5 },
};

/** TOC depths per phrase (indent right like h2/h3/h4). */
const DEPTHS: Record<string, number[]> = { L3: [0, 1, 2], L4: [0, 1, 0], L14: [0, 1] };

interface RailSeg {
  k: 'L' | 'C';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  c1x?: number;
  c1y?: number;
  c2x?: number;
  c2y?: number;
  l0: number;
  l1: number;
}

function cubicAt(s: RailSeg, u: number) {
  const b0 = (1 - u) ** 3;
  const b1 = 3 * (1 - u) ** 2 * u;
  const b2 = 3 * (1 - u) * u * u;
  const b3 = u ** 3;
  return { x: b0 * s.x0 + b1 * s.c1x! + b2 * s.c2x! + b3 * s.x1, y: b0 * s.y0 + b1 * s.c1y! + b2 * s.c2y! + b3 * s.y1 };
}

export function drawVertical(c: CanvasRenderingContext2D, L: LineTiming, t: number, o: RenderOpts) {
  const W = lineWindow(L);
  if (t < W.a || t >= W.b) return;
  const k = o.scale ?? 1;
  const ts = typeset(L, scaled(VERT, k));
  const [ax, ay] = o.anchor ?? [1772, 150];
  const pal = o.pal;
  const halo = o.halo ?? 0;
  const size = ts.size;
  const step = 14 * k;
  const depth = DEPTHS[L.id] ?? [];
  const dxp = (phrase: number) => (depth[phrase] ?? 0) * step;
  const withDot = L.id !== 'L14';
  const [ac, acol] = accentCtx(c, o);

  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  ac.save();
  ac.globalAlpha *= o.alpha ?? 1;
  // phrase extents along y
  const phrases = new Map<number, { y0: number; y1: number }>();
  for (const s of ts.segs) {
    const p = phrases.get(s.phrase) ?? { y0: Infinity, y1: -Infinity };
    p.y0 = Math.min(p.y0, s.a0);
    p.y1 = Math.max(p.y1, s.a1);
    phrases.set(s.phrase, p);
  }
  const ids = [...phrases.keys()].sort((a, b) => a - b);
  const railOff = -size / 2 - 13 * k;
  // rail = the real TOC path: per row `L x bottom`, joins `C ux top−4, x ub+4, x top`
  const segs: RailSeg[] = [];
  let len = 0;
  let prev: { x: number; y: number } | null = null;
  for (const p of ids) {
    const e = phrases.get(p)!;
    const x = Math.round(ax + railOff + dxp(p)) + 0.5;
    const top = ay + e.y0 - 3 * k;
    const bot = ay + e.y1 + 3 * k;
    if (prev) {
      const s: RailSeg = { k: 'C', x0: prev.x, y0: prev.y, c1x: prev.x, c1y: top - 4 * k, c2x: x, c2y: prev.y + 4 * k, x1: x, y1: top, l0: len, l1: 0 };
      // arc length by sampling
      let l = 0;
      let q = cubicAt(s, 0);
      for (let i = 1; i <= 16; i++) {
        const r = cubicAt(s, i / 16);
        l += Math.hypot(r.x - q.x, r.y - q.y);
        q = r;
      }
      s.l1 = len + l;
      segs.push(s);
      len += l;
    }
    segs.push({ k: 'L', x0: x, y0: top, x1: x, y1: bot, l0: len, l1: len + (bot - top) });
    len += bot - top;
    prev = { x, y: bot };
  }
  const pointAt = (d: number) => {
    for (const s of segs) {
      if (d <= s.l1 || s === segs[segs.length - 1]) {
        const u = clamp((d - s.l0) / Math.max(1e-6, s.l1 - s.l0));
        return s.k === 'L' ? { x: s.x0, y: lerp(s.y0, s.y1, u) } : cubicAt(s, u);
      }
    }
    return { x: ax + railOff, y: ay };
  };
  const lenAtY = (y: number) => {
    for (const s of segs) if (s.k === 'L' && y >= s.y0 - 1 && y <= s.y1 + 1) return s.l0 + (y - s.y0);
    return 0;
  };
  const strokeRange = (l0: number, l1: number, lw: number, color: string) => {
    if (l1 <= l0) return;
    c.beginPath();
    let first = true;
    const n = Math.max(2, Math.ceil((l1 - l0) / 4));
    for (let i = 0; i <= n; i++) {
      const p = pointAt(l0 + ((l1 - l0) * i) / n);
      if (first) c.moveTo(p.x, p.y);
      else c.lineTo(p.x, p.y);
      first = false;
    }
    c.lineWidth = lw;
    c.strokeStyle = color;
    c.stroke();
  };
  const draw = seg(t, W.a, W.a + 0.6, ease.outExpo);
  const retract = seg(t, W.b - 0.36, W.b - 0.04, ease.inOutCubic);
  const mlen = (i: number) => (i < 0 ? 0 : lenAtY(ay + moraPos(ts, L, i)));
  const dotL = slide(L, t, mlen);
  const la = len * retract;
  const lb = len * draw;
  {
    const xl = ax + railOff - 19 * k - 16 * k;
    const xr = ax + size / 2 + (VERT.ruby!.gap + VERT.ruby!.font.size) * k + 2 * k + Math.max(0, ...ids.map(dxp));
    plateRect(o.pc, xl - 12 * k, ay + la - 14 * k, xr + 12 * k, ay + Math.max(la, lb) + 14 * k, (o.plate ?? 0) * 0.62, 12, 10, o.plateColor);
  }
  c.lineCap = 'butt';
  c.lineJoin = 'round';
  withHalo(c, pal.bg, halo, 8);
  strokeRange(la, lb, 1, rgba(pal.ink, 0.2));
  strokeRange(la, Math.max(la, Math.min(dotL, lb)), 1.25, rgba(pal.ink, withDot ? 0.78 : 0.5));
  if (withDot) {
    const dotIn = seg(t, W.a, W.a + 0.22, ease.outBack);
    const dotOut = 1 - seg(t, W.b - 0.2, W.b - 0.02, ease.inCubic);
    const r = 3.6 * k * dotIn * dotOut;
    if (r > 0.2) {
      const p = pointAt(Math.max(dotL, la));
      if (ac !== c) punch(c, p.x, p.y, r + 1.5);
      ac.beginPath();
      ac.arc(p.x, p.y, r, 0, Math.PI * 2);
      ac.fillStyle = acol;
      ac.fill();
    }
  } else {
    // a neutral end tick at the rail's end once the line is sung
    const e = seg(t, L.t1 - 0.1, L.t1 + 0.3, ease.outExpo) * (1 - retract);
    if (e > 0) {
      const p = pointAt(len);
      c.fillStyle = rgba(pal.ink, 0.55 * e);
      c.fillRect(p.x - 6 * k * e, p.y - 0.5, 12 * k * e, 1);
    }
  }

  for (const g of ts.glyphs) {
    const tr = revealT(L, g);
    const a = seg(t, tr - 0.035, tr + 0.14, ease.outCubic);
    if (a <= 0) continue;
    const order = g.cy / Math.max(1, ts.width);
    const go = seg(t, W.b - 0.36 + order * 0.14, W.b - 0.12 + order * 0.14, ease.inCubic);
    const dy = -(1 - seg(t, tr, tr + 0.34, ease.outExpo)) * 10 * k + go * 8 * k;
    const blur = (1 - seg(t, tr, tr + 0.15, ease.outCubic)) * 3;
    if (blur > 0.3) c.filter = `blur(${blur.toFixed(2)}px)`;
    withHalo(c, pal.bg, halo, 10);
    drawGlyph(c, g, ax + dxp(g.phrase), ay, { fill: pal.ink, alpha: a * (1 - go), dy });
    c.filter = 'none';
  }
  for (const r of ts.ruby) {
    const m = L.morae[r.mora];
    const a = seg(t, m.t - 0.035, m.t + 0.11, ease.outCubic);
    if (a <= 0) continue;
    const ph = L.segs[r.seg]?.phrase ?? 0;
    const order = r.cy / Math.max(1, ts.width);
    const go = seg(t, W.b - 0.36 + order * 0.14, W.b - 0.12 + order * 0.14, ease.inCubic);
    withHalo(c, pal.bg, halo, 6);
    drawGlyph(c, r, ax + dxp(ph), ay, { fill: rgba(pal.ink, 0.8), alpha: a * (1 - go), dy: -(1 - seg(t, m.t, m.t + 0.3, ease.outExpo)) * 6 * k + go * 8 * k });
  }
  // English: rotated 90° cw (reads downward), left of the rail
  const out = seg(t, W.b - 0.34, W.b, ease.inCubic);
  const ea = seg(t, W.a + 0.1, W.a + 0.6, ease.outCubic) * (1 - out);
  if (ea > 0) {
    c.save();
    const ex = Math.round(ax + railOff - 19 * k);
    c.translate(ex, ay);
    c.rotate(Math.PI / 2);
    const font = EN_FONT(14 * k);
    const ew = englishWidth(L, font, 0.18);
    c.beginPath();
    c.rect(-4, -20 * k, (ew + 10) * seg(t, W.a + 0.1, W.a + 0.9, ease.outExpo), 30 * k);
    c.clip();
    withHalo(c, pal.bg, halo, 6);
    english(c, L, 0, 0, 14 * k, rgba(pal.ink, 0.64), ea, 'left', { font, tracking: 0.18 });
    c.restore();
  }
  ac.restore();
  c.restore();
  c.shadowColor = 'transparent';
}
