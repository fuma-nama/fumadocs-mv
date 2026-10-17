import type * as THREE from 'three';
import type { Frame } from '../../engine/engine';
import { at } from '../../engine/time';
import { ease, seg } from '../../engine/anim';
import { C } from '../_shared/palette';
import { drawDot } from '../_shared/moon';
import { ORDER, swatch, mix, type Mode, type ThemeId, type Swatch } from '../_shared/theme-tokens';
import { plate, PW, PH } from './plates';

/**
 * S4 · WORLD (bar 35): the full-bleed page splits into 12 vertical bands, each the same aligned
 * page in another preset: one page painted in 12 colours, with a giant 色 painted band by band.
 * Snares roll the bands light ↔ dark with paint rollers in a wave (no squashed UI); beat 3 rolls
 * the themes one band to the right, landing on the beat.
 */
const W = 1920;
const H = 1080;
const N = 12;
const BW = W / N;
const T = at(35); // 54.4

/**
 * Band framing: the page zoomed 1.48× anchored at its top-left, so its TOC column is off-frame
 * and the top-right corner (overlay credits, 54.4–57.6) only holds the article header's empty
 * right side. The poster push-in (54.0–54.4) and the montage start land on exactly this.
 */
export const BAND_FRAME = { s: 1.48, x: (PW * 1.48) / 2 - W / 2, y: -((PH * 1.48) / 2 - H / 2) };

export const COLLAPSE_TO: [ThemeId, Mode] = ['dusk', 'light'];
/** frame-exact switch to the montage (frame 3370 = 56.1667) */
export const BANDS_END = at(36) + 10 / 60;
function collapseQ(t: number, x: number) {
  const t0 = at(36) - 0.085 + (x / W) * 0.1;
  return seg(t, t0, t0 + 0.07, ease.inOutCubic);
}

/** theme roll by one band, landing on 35.3 */
function roll(t: number) {
  return ease.inOutCubic(seg(t, at(35, 3) - 0.16, at(35, 3) + 0.02));
}

/** paint rollers on the snares: r1 rolls light → dark downward (35.2), r2 dark → light upward (35.4) */
function rollers(t: number, x: number) {
  const u = x / W;
  const r1 = seg(t, at(35, 2) - 0.14 + u * 0.14, at(35, 2) + u * 0.14, ease.inOutCubic);
  const r2 = seg(t, at(35, 4) - 0.14 + (1 - u) * 0.14, at(35, 4) + (1 - u) * 0.14, ease.inOutCubic);
  return { r1, r2 };
}

/** vertical regions of a band (mode per region) and the roller edge, if rolling */
function regions(t: number, x: number): { modes: { mode: Mode; y0: number; y1: number }[]; edge?: { y: number; mode: Mode } } {
  const { r1, r2 } = rollers(t, x);
  if (r2 > 0) {
    if (r2 >= 1) return { modes: [{ mode: 'light', y0: 0, y1: H }] };
    const y = H * (1 - r2);
    return { modes: [{ mode: 'dark', y0: 0, y1: y }, { mode: 'light', y0: y, y1: H }], edge: { y, mode: 'light' } };
  }
  if (r1 > 0) {
    if (r1 >= 1) return { modes: [{ mode: 'dark', y0: 0, y1: H }] };
    const y = H * r1;
    return { modes: [{ mode: 'dark', y0: 0, y1: y }, { mode: 'light', y0: y, y1: H }], edge: { y, mode: 'dark' } };
  }
  return { modes: [{ mode: 'light', y0: 0, y1: H }] };
}

/** band k opens (centre-out) from the previous full-bleed page */
function openQ(t: number, k: number) {
  const d = Math.abs(k + 0.5 - N / 2); // 0.5 … 5.5
  const t0 = T + (d - 0.5) * (1 / 60) * 1.6;
  return seg(t, t0, t0 + 0.09, ease.outCubic);
}

/** an undistorted slice of the plate at the band framing */
function drawSlice(c: CanvasRenderingContext2D, id: ThemeId, mode: Mode, x0: number, x1: number) {
  if (x1 - x0 < 0.5) return;
  // the full-res plate: at the 1.48× band framing it is minified 0.74×, where plain bilinear is
  // crisp and fast
  const src = plate(id, mode).band;
  const k = BAND_FRAME.s;
  const sxs = src.width / PW;
  c.drawImage(src, (x0 / k) * sxs, 0, ((x1 - x0) / k) * sxs, (H / k) * sxs, x0, 0, x1 - x0, H);
}

/** the band's flat colour: its background with some of its primary (the "world" swatch) */
export const bandTint = (sw: Swatch) => mix(sw.bg, sw.primary, sw.mode === 'dark' ? 0.34 : 0.22);
/** lyric-safe footer: the page gives way to flat band colour below this line */
export const FOOT_Y = 846;

function footer(c: CanvasRenderingContext2D, sw: Swatch, x0: number, x1: number) {
  c.fillStyle = bandTint(sw);
  c.fillRect(x0, FOOT_Y, x1 - x0, H - FOOT_Y);
  c.fillStyle = sw.primary;
  c.fillRect(x0, FOOT_Y, x1 - x0, 2);
}

/** a band region in a theme: the page stepped back under the band tint, flat footer */
function drawRegion(c: CanvasRenderingContext2D, sw: Swatch, x0: number, x1: number, y0: number, y1: number) {
  c.save();
  c.beginPath();
  c.rect(x0, y0, x1 - x0, y1 - y0);
  c.clip();
  drawSlice(c, sw.id, sw.mode, x0, x1);
  c.globalAlpha = 0.62;
  c.fillStyle = bandTint(sw);
  c.fillRect(x0, 0, x1 - x0, H);
  c.globalAlpha = 1;
  footer(c, sw, x0, x1);
  c.restore();
}

// ── the giant 色 ─────────────────────────────────────────────────────────────
/** 色 scale-in: slams in on the downbeat frame (overshoot), breathes, clears before bar 36 */
function glyphK(t: number) {
  return seg(t, T - 1 / 60, T + 0.18, (x) => ease.outBack(x, 2.2)) * (1 - seg(t, at(35, 4) + 0.2, at(36) - 0.02, ease.inCubic));
}
const GX = 900;
const GY = 452;
function glyphFont(c: CanvasRenderingContext2D, k: number, t: number) {
  const size = 720 * (0.6 + 0.4 * k) * (1 + 0.03 * seg(t, T, at(36)));
  // Zen Kaku Gothic New Black: an unmistakable 色 (open ク over 巴) even at phone size
  c.font = `900 ${size}px "Zen Kaku Gothic New", "Noto Sans JP", sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  return size;
}

interface Band {
  x0: number;
  x1: number;
  id: ThemeId;
  open: number;
  down: boolean;
}

export function renderBands(f: Frame, prevId: ThemeId, prevMode: Mode): THREE.Texture {
  const { e, t } = f;
  const L = e.layer('theme:bands');
  const c = L.begin(C.INK);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'low';
  const r = roll(t);
  const prevSw = swatch(prevId, prevMode);

  // band layout (theme i occupies [(i + r)·BW, …) wrapping around the frame)
  const bands: Band[] = [];
  for (let i = 0; i < N + 1; i++) {
    const ti = i % N;
    const x0 = i === N ? (r - 1) * BW : (i + r) * BW;
    const cx0 = Math.max(0, x0);
    const cx1 = Math.min(W, x0 + BW);
    if (cx1 <= cx0) continue;
    const kk = i === N ? N - 1 : ti;
    bands.push({ x0: cx0, x1: cx1, id: ORDER[kk], open: openQ(t, kk), down: kk % 2 === 0 });
  }

  // 1 · pages (stepped back), the previous page where a band has not opened yet
  for (const b of bands) {
    const hh = H * b.open;
    const oy0 = b.down ? 0 : H - hh; // opened span
    const oy1 = b.down ? hh : H;
    if (b.open < 1) {
      c.save();
      c.beginPath();
      c.rect(b.x0, 0, b.x1 - b.x0, H);
      c.clip();
      drawSlice(c, prevId, prevMode, b.x0, b.x1);
      footer(c, prevSw, b.x0, b.x1);
      c.restore();
    }
    if (b.open <= 0) continue;
    const rg = regions(t, (b.x0 + b.x1) / 2);
    for (const m of rg.modes) {
      const y0 = Math.max(m.y0, oy0);
      const y1 = Math.min(m.y1, oy1);
      if (y1 > y0) drawRegion(c, swatch(b.id, m.mode), b.x0, b.x1, y0, y1);
    }
  }
  // 2 · band edges: primary strip + hairline
  for (const b of bands) {
    if (b.open <= 0) continue;
    const sw = swatch(b.id, regions(t, (b.x0 + b.x1) / 2).modes[0].mode);
    c.fillStyle = sw.primary;
    c.fillRect(b.x0, 0, 6, FOOT_Y);
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(Math.round(b.x0) - 0.5, 0, 1, H);
  }

  // 3 · 色: hard shadow once; the per-band colours (each band's primary, per roller region) are
  // painted as rects into a side layer and cut to the glyph in one pass; one outline
  const gk = glyphK(t);
  if (gk > 0) {
    const GL = e.layer('theme:glyph');
    const g = GL.begin();
    for (const b of bands) {
      if (b.open <= 0) continue;
      const hh = H * b.open;
      const oy0 = b.down ? 0 : H - hh;
      const oy1 = b.down ? hh : H;
      for (const m of regions(t, (b.x0 + b.x1) / 2).modes) {
        const y0 = Math.max(m.y0, oy0);
        const y1 = Math.min(m.y1, oy1);
        if (y1 <= y0) continue;
        g.fillStyle = swatch(b.id, m.mode).primary;
        g.fillRect(b.x0, y0, b.x1 - b.x0, y1 - y0);
      }
    }
    g.globalCompositeOperation = 'destination-in';
    glyphFont(g, gk, t);
    g.fillStyle = '#fff';
    g.fillText('色', GX, GY);
    g.globalCompositeOperation = 'source-over';
    c.save();
    const size = glyphFont(c, gk, t);
    c.globalAlpha = Math.min(1, gk * 1.5);
    c.fillStyle = 'rgba(10,10,11,0.5)';
    c.fillText('色', GX + size * 0.022, GY + size * 0.026);
    c.drawImage(GL.canvas, 0, 0);
    c.lineJoin = 'round';
    c.lineWidth = 4;
    c.strokeStyle = C.WHITE;
    c.strokeText('色', GX, GY);
    c.restore();
  }

  // 4 · paint rollers: a bar in the new mode's primary with ink lips, riding the repaint edge
  for (const b of bands) {
    if (b.open < 1) continue;
    const rg = regions(t, (b.x0 + b.x1) / 2);
    if (!rg.edge) continue;
    const sw = swatch(b.id, rg.edge.mode);
    const y = rg.edge.y;
    c.fillStyle = sw.primary;
    c.fillRect(b.x0, y - 12, b.x1 - b.x0, 24);
    c.fillStyle = C.INK;
    c.fillRect(b.x0, y - 13, b.x1 - b.x0, 2);
    c.fillRect(b.x0, y + 11, b.x1 - b.x0, 2);
  }

  // 5 · 56.0: collapse — every band repaints to the montage's first state, left → right
  for (const b of bands) {
    const cq = collapseQ(t, (b.x0 + b.x1) / 2);
    if (cq <= 0) continue;
    c.save();
    c.beginPath();
    c.rect(b.x0, 0, b.x1 - b.x0, H * cq);
    c.clip();
    drawSlice(c, COLLAPSE_TO[0], COLLAPSE_TO[1], b.x0, b.x1);
    c.restore();
    if (cq < 1) {
      c.fillStyle = swatch(COLLAPSE_TO[0], COLLAPSE_TO[1]).primary;
      c.fillRect(b.x0, H * cq - 10, b.x1 - b.x0, 10);
    }
  }

  // the dot arrives at the centre and is the split point (54.4)
  const dk = 1 - seg(t, T, T + 0.12, ease.inCubic);
  if (dk > 0) drawDot(c, W / 2, H / 2, 7 * dk + 0.01, C.ORANGE);
  const centreMode = regions(t, W / 2).modes.at(-1)!.mode;
  f.overlay.tone = centreMode === 'light' ? 'light' : 'dark';
  (f.overlay as { plate?: number }).plate = 0.7;
  // same light vignette as the posters and the montage (no corner-brightness pop at 54.4 / 56.17)
  f.post.vignette = 0.1;
  (f.overlay as { accent?: string }).accent = swatch(ORDER[(((5 - Math.round(r)) % N) + N) % N], centreMode).primary;
  return L.end();
}
