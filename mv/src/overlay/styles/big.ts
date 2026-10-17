/**
 * CHORUS / FINAL — big bold gothic. The line is previewed as thin ghost outlines; each glyph
 * fills and pops on its mora with an accent offset shadow (colour-aware: the theme / site key
 * colour). FINAL adds an accent glow and pages long lines at the largest rest.
 * SUBTITLE — compact one-row karaoke with inline English (under a scene's giant type).
 */
import { ease, hash, lerp, seg } from '../../engine/anim';
import { audio } from '../../engine/audio';
import { drawGlyph, typeset, type FontSpec, type TypesetOpts } from '../jp';
import type { LineTiming } from '../timing';
import { accentCtx, english, englishWidth, EN_FONT, isMonoColor, lineWindow, moraIndex, plateRect, revealT, rgba, scaled, textAt, withHalo, type RenderOpts } from './common';

interface BigCfg {
  font: FontSpec;
  latin: FontSpec;
  ruby: FontSpec;
  base: [number, number];
  enDy: number;
  enSize: number;
  glow: number;
  pages: boolean;
  offset: number;
  /** max backing alpha on cluttered ground */
  plateMax: number;
}

const CHORUS: BigCfg = {
  font: { role: 'jpKaku', weight: 900, size: 76 },
  latin: { role: 'display', weight: 900, size: 76, stretch: 'semi-condensed' },
  ruby: { role: 'jpKaku', weight: 700, size: 24 },
  base: [960, 985],
  enDy: 40,
  enSize: 16.5,
  glow: 0,
  pages: false,
  offset: 5,
  plateMax: 0.5,
};

const FINAL: BigCfg = {
  font: { role: 'jpKaku', weight: 900, size: 98 },
  latin: { role: 'display', weight: 900, size: 98, stretch: 'semi-condensed' },
  ruby: { role: 'jpKaku', weight: 700, size: 30 },
  base: [960, 952],
  enDy: 50,
  enSize: 19,
  glow: 28,
  pages: true,
  offset: 6,
  plateMax: 0.78,
};

/** Split a take into display pages at the largest rest between phrases. */
function pagesOf(L: LineTiming): [number, number][] {
  const nP = L.segs.reduce((m, s) => Math.max(m, s.phrase), 0) + 1;
  if (nP < 2) return [[0, nP - 1]];
  let best = -1;
  let bestGap = 0.3;
  for (let p = 1; p < nP; p++) {
    const first = L.segs.find((s) => s.phrase === p && s.morae[1] > s.morae[0]);
    if (!first) continue;
    const k = first.morae[0];
    const gap = L.morae[k].t - L.morae[k - 1].end;
    if (gap > bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  if (best < 0) best = Math.ceil(nP / 2);
  return [[0, best - 1], [best, nP - 1]];
}

function drawBig(c: CanvasRenderingContext2D, L: LineTiming, t: number, o: RenderOpts, cfg: BigCfg) {
  const W = lineWindow(L);
  if (t < W.a || t >= W.b) return;
  const k = o.scale ?? 1;
  const pal = o.pal;
  const halo = o.halo ?? 0;
  const [ac, acol] = accentCtx(c, o);
  const accentIsMono = isMonoColor(o.pal.accent);
  const opts: TypesetOpts = scaled({ font: cfg.font, latin: cfg.latin, tsume: 0.5, tracking: 0, space: 0.42, ruby: { font: cfg.ruby, gap: 4 } }, k);
  const pages = cfg.pages ? pagesOf(L) : [[0, 99] as [number, number]];
  const pageStart = pages.map(([p0]) => {
    const s = L.segs.find((x) => x.phrase === p0 && x.morae[1] > x.morae[0]);
    return s ? L.morae[s.morae[0]].t : L.t0;
  });
  // page p+1's ghost appears 0.2 s before its first onset; page p has left 0.06 s before that
  let pi = 0;
  for (let i = 0; i < pages.length; i++) if (t >= pageStart[i] - 0.36) pi = i;
  const [bx, by] = o.anchor ?? cfg.base;
  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  ac.save();
  if (ac !== c) ac.globalAlpha *= o.alpha ?? 1;
  // singing level (lead stem RMS), lightly smoothed over ±3 frames
  const voice = cfg.glow > 0 ? Math.min(1, (audio.env('lead', t - 0.05) + audio.env('lead', t) + audio.env('lead', t + 0.05)) / 3) : 0;
  // a 1 % pump on every kick (chorus energy), about the line's baseline centre
  const pump = 1 + 0.011 * audio.pulse('kick', t, 0.11);
  for (const x of ac === c ? [c] : [c, ac]) {
    x.translate(bx, by);
    x.scale(pump, pump);
    x.translate(-bx, -by);
  }
  for (let p = Math.max(0, pi - 1); p <= pi; p++) {
    const ts = typeset(L, opts, pages[p]);
    const ox = bx - ts.width / 2;
    const oy = by;
    const last = p === pages.length - 1;
    const inT = p === 0 ? W.a : pageStart[p] - 0.2;
    const outT = last ? W.b - 0.26 : pageStart[p + 1] - 0.4;
    const outDur = last ? 0.18 : 0.1;
    const outStag = last ? 0.08 : 0.04;
    if (t >= outT + outStag + outDur + 0.02) continue;
    {
      // backing strip behind this page (clutter only), sized to the page + the English line
      const pa = seg(t, p === 0 ? inT : inT - 0.2, inT + 0.05, ease.outCubic) * (1 - seg(t, last ? outT : outT + 0.2, last ? outT + 0.2 : outT + 0.4, ease.inCubic));
      const enW = englishWidth(L, EN_FONT(cfg.enSize * k, 600), 0.18);
      const half = Math.max(ts.width, enW) / 2 + 30 * k;
      const top = oy - ts.ascent - (4 + cfg.ruby.size) * k - 14 * k;
      plateRect(o.pc, bx - half, top, bx + half, oy + cfg.enDy * k + 12 * k, (o.plate ?? 0) * cfg.plateMax * pa, 14, 12, o.plateColor);
    }
    for (const g of ts.glyphs) {
      const tr = revealT(L, g);
      const order = g.cx / Math.max(1, ts.width);
      const ghostIn = seg(t, inT + order * 0.12, inT + order * 0.12 + 0.2, ease.outCubic);
      const go = seg(t, outT + order * outStag, outT + order * outStag + outDur, ease.inCubic);
      // the fill hits ON the onset frame (≈50 %), full one frame later — even on the line's first frame
      const lit = seg(t, tr - 0.02, tr + 0.02);
      const a = Math.max(ghostIn, lit) * (1 - go);
      // the unsung outline preview steps back on cluttered ground (it scribbles over busy tiles)
      const ghostA = 1 - 0.75 * (o.plate ?? 0);
      if (a <= 0.002) continue;
      const pop = seg(t, tr, tr + 0.26);
      const jit = lit > 0 ? (hash(g.cx, L.take, 4.2) * 2 - 1) * 0.07 * (1 - ease.outCubic(pop)) : 0;
      const sc = lit > 0 ? 1 + (1 - ease.outBack(pop, 2)) * 0.32 : 1;
      const dy = -go * 10 * k + (1 - ghostIn) * 8 * k - (lit > 0 ? (1 - ease.outExpo(pop)) * 8 * k : 0);
      if (lit < 1) {
        withHalo(c, pal.bg, halo * 0.6, 8);
        drawGlyph(c, g, ox, oy, { stroke: rgba(pal.ink, 0.5), lw: 1.4, alpha: ghostIn * (1 - go) * (1 - lit) * ghostA, dy });
      }
      if (lit > 0) {
        const off = cfg.offset * k * (0.6 + 0.4 * ease.outCubic(pop));
        if (!accentIsMono) {
          // accent offset block shadow (+ glow for FINAL) on the colour layer, under the fill
          ac.shadowColor = 'transparent';
          drawGlyph(ac, g, ox, oy, { fill: acol, alpha: a * lit, dx: off, dy: dy + off, scale: sc, rot: jit });
          if (cfg.glow > 0) {
            // the glow breathes with the real singing level (lead envelope), plus a kick on each pop
            ac.shadowColor = rgba(acol, 0.5 + 0.38 * voice);
            ac.shadowBlur = cfg.glow * k * (0.62 + 0.5 * voice + 0.8 * (1 - ease.outCubic(pop)));
            drawGlyph(ac, g, ox, oy, { fill: acol, alpha: a * lit, dy, scale: sc, rot: jit });
            ac.shadowColor = 'transparent';
          }
        }
        withHalo(c, pal.bg, halo, 10);
        drawGlyph(c, g, ox, oy, { fill: pal.ink, alpha: a * lit, dy, scale: sc, rot: jit });
      }
    }
    for (const r of ts.ruby) {
      const m = L.morae[r.mora];
      const order = r.cx / Math.max(1, ts.width);
      const ghostIn = seg(t, inT + order * 0.12, inT + order * 0.12 + 0.2, ease.outCubic);
      const go = seg(t, outT + order * outStag, outT + order * outStag + outDur, ease.inCubic);
      const lit = seg(t, m.t - 0.02, m.t + 0.02);
      withHalo(c, pal.bg, halo, 6);
      drawGlyph(c, r, ox, oy, { fill: rgba(pal.ink, 0.45 + 0.55 * lit), alpha: ghostIn * (1 - go), dy: -go * 10 * k - (lit > 0 ? (1 - ease.outExpo(seg(t, m.t, m.t + 0.25))) * 5 * k : 0) });
    }
  }
  const ea = seg(t, W.a + 0.05, W.a + 0.5, ease.outCubic) * (1 - seg(t, W.b - 0.26, W.b, ease.inCubic));
  if (ea > 0) {
    withHalo(c, pal.bg, halo, 8);
    english(c, L, bx, by + cfg.enDy * k, cfg.enSize * k, rgba(pal.ink, 0.82), ea, 'center', { font: EN_FONT(cfg.enSize * k, 600), tracking: 0.18 });
  }
  ac.restore();
  c.restore();
  c.shadowColor = 'transparent';
}

export const drawChorus = (c: CanvasRenderingContext2D, L: LineTiming, t: number, o: RenderOpts) => drawBig(c, L, t, o, CHORUS);
export const drawFinal = (c: CanvasRenderingContext2D, L: LineTiming, t: number, o: RenderOpts) => drawBig(c, L, t, o, FINAL);

// ── SUBTITLE ────────────────────────────────────────────────────────────────

const SUB: TypesetOpts = {
  font: { role: 'jpKaku', weight: 700, size: 44 },
  latin: { role: 'display', weight: 800, size: 44, stretch: 'semi-condensed' },
  tsume: 0.5,
  tracking: 0.02,
  space: 0.45,
  ruby: { font: { role: 'jpKaku', weight: 700, size: 16 }, gap: 3 },
};

export function drawSubtitle(c: CanvasRenderingContext2D, L: LineTiming, t: number, o: RenderOpts) {
  const W = lineWindow(L);
  if (t < W.a || t >= W.b) return;
  const k = o.scale ?? 1;
  const pal = o.pal;
  const halo = o.halo ?? 0;
  const [ac, acol] = accentCtx(c, o);
  const ts = typeset(L, scaled(SUB, k));
  const enFont = EN_FONT(15.5 * k, 600);
  const enW = englishWidth(L, enFont, 0.16);
  const sep = 34 * k;
  const total = ts.width + sep + enW;
  const [cx, by] = o.anchor ?? [960, 1010];
  const ox = Math.round(cx - total / 2);
  const inA = seg(t, W.a, W.a + 0.3, ease.outCubic);
  const outA = seg(t, W.b - 0.28, W.b, ease.inCubic);
  const A = inA * (1 - outA) * (o.alpha ?? 1);
  // a sung glyph is fully there on its onset frame, even while the row is still fading in
  const lit0 = seg(t, L.t0 - 0.02, L.t0 + 0.02);
  if (Math.max(A, lit0 * (1 - outA)) <= 0.002) return;
  const dy = (1 - inA) * 10 * k + outA * 6 * k;
  plateRect(o.pc, ox - 20 * k, by - ts.ascent - 22 * k, ox + total + 20 * k, by + 22 * k, (o.plate ?? 0) * 0.78 * A, 10, 8, o.plateColor);
  c.save();
  withHalo(c, pal.bg, halo, 10);
  const base = c.globalAlpha;
  const outK = (1 - outA) * (o.alpha ?? 1);
  for (const g of ts.glyphs) {
    const lit = seg(t, revealT(L, g) - 0.02, revealT(L, g) + 0.04);
    c.globalAlpha = base * Math.max(A, lit * outK);
    drawGlyph(c, g, ox, by, { fill: rgba(pal.ink, 0.42 + 0.58 * lit), dy: dy * (1 - lit) });
  }
  for (const r of ts.ruby) {
    const m = L.morae[r.mora];
    const lit = seg(t, m.t - 0.02, m.t + 0.04);
    c.globalAlpha = base * Math.max(A, lit * outK);
    drawGlyph(c, r, ox, by, { fill: rgba(pal.ink, 0.4 + 0.6 * lit), dy: dy * (1 - lit) });
  }
  c.globalAlpha = base * A;
  // karaoke underline in the accent colour, wiping through the current mora
  const idx = moraIndex(L, t);
  if (idx >= 0) {
    const m = L.morae[idx];
    const box = ts.segs.find((s) => s.seg === m.seg)!;
    const [i, n] = m.part;
    const xa = box.a0 + ((box.a1 - box.a0) * i) / n;
    const xb = box.a0 + ((box.a1 - box.a0) * (i + 1)) / n;
    const ux = lerp(xa, xb, seg(t, m.t, m.t + Math.min(0.12, m.end - m.t), ease.outCubic));
    ac.save();
    ac.globalAlpha *= Math.max(A, lit0 * outK);
    ac.fillStyle = acol;
    ac.fillRect(ox, by + 10 * k, ux, 3 * k);
    ac.restore();
  }
  c.fillStyle = rgba(pal.ink, 0.35);
  c.fillRect(Math.round(ox + ts.width + sep / 2), by - 26 * k + dy, 1, 30 * k);
  textAt(c, L.english, ox + ts.width + sep, by - 4 * k + dy, enFont, { color: rgba(pal.ink, 0.8), tracking: 0.16, upper: true });
  c.restore();
  c.shadowColor = 'transparent';
}
