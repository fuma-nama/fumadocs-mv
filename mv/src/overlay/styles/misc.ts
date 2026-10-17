/**
 * CHANT — pixel kana stamped in orange inverse-video blocks (retro-OS selection), limited
 * animation on twos; the repeat hits harder (bigger, echo outline).
 * OUTRO — soft centred serif, focus-in per mora. PLAIN — fallback subtitle. ENGLISH — translation only.
 */
import { clamp, ease, hold, seg } from '../../engine/anim';
import { drawGlyph, fontStr, metrics, typeset, type FontSpec, type TypesetOpts } from '../jp';
import type { LineTiming } from '../timing';
import { drawBoxWord } from './pre';
import { english, englishWidth, EN_FONT, INK, isMonoColor, lineWindow, ORANGE, PAPER, plateRect, revealT, rgba, scaled, withHalo, type RenderOpts } from './common';

export function drawChant(c: CanvasRenderingContext2D, L: LineTiming, t: number, o: RenderOpts) {
  const W = lineWindow(L);
  if (t < W.a || t >= W.b) return;
  const k = o.scale ?? 1;
  const pal = o.pal;
  const cc = o.cc ?? c;
  const blockCol = isMonoColor(pal.accent) ? ORANGE : pal.accent;
  const again = L.take > 0;
  const B = Math.round((again ? 124 : 112) * k);
  const gap = Math.round(8 * k);
  const wgap = Math.round(44 * k);
  const items: { ch: string; t: number; phrase: number }[] = [];
  for (const s of L.segs) {
    if (s.kind === 'space' || s.kind === 'punct') continue;
    if (s.kind === 'ruby') s.rubyMorae!.forEach((mo, j) => items.push({ ch: mo, t: L.morae[s.morae[0] + j].t, phrase: s.phrase }));
    else items.push({ ch: s.text, t: L.morae[s.morae[0]].t, phrase: s.phrase });
  }
  const nP = new Set(items.map((x) => x.phrase)).size;
  const total = items.length * B + (items.length - 1) * gap + (wgap - gap) * (nP - 1);
  const [cx, cy] = o.anchor ?? [960, 892];
  let x = Math.round(cx - total / 2);
  // DotGothic16 is drawn on a 16 px grid: keep the size a multiple of 16 so its pixels stay square
  const font: FontSpec = { role: 'pixel', weight: 400, size: Math.max(16, Math.round((B * 0.74) / 16) * 16) };
  // exit: blocks collapse left → right, the last one closing exactly at the window end
  const outStart = W.b - 0.12 - 0.02 * (items.length - 1) - 1 / 60 - (again ? 0 : 0.06);
  cc.save();
  cc.globalAlpha *= o.alpha ?? 1;
  items.forEach((it, i) => {
    if (i > 0 && it.phrase !== items[i - 1].phrase) x += wgap - gap;
    const bx = x;
    x += B + gap;
    // stamps land exactly on the onset frame; their own animation steps on twos (24 fps) from there
    if (t < it.t - 1e-6) return;
    const age = hold(Math.max(0, t - it.t), 24);
    const s = age < 1 / 24 ? 1.18 : age < 2 / 24 ? 1.06 : 1;
    const oe = clamp((t - outStart - i * 0.02) / 0.12);
    if (oe >= 1) return;
    const hgt = B * s * (1 - oe);
    const wdt = B * s;
    const bxc = bx + B / 2;
    const flash = age < 1 / 24;
    cc.fillStyle = flash ? (pal.tone === 'dark' ? PAPER : INK) : blockCol;
    cc.fillRect(Math.round(bxc - wdt / 2), Math.round(cy - hgt / 2), Math.round(wdt), Math.round(hgt));
    if (again && !flash) {
      cc.strokeStyle = blockCol;
      cc.lineWidth = 2;
      cc.strokeRect(Math.round(bxc - wdt / 2 + 10 * k) + 0.5, Math.round(cy - hgt / 2 - 10 * k) + 0.5, Math.round(wdt) - 1, Math.round(hgt) - 1);
    }
    if (hgt > B * 0.5) {
      const m = metrics(font, it.ch);
      cc.save();
      cc.beginPath();
      cc.rect(bxc - wdt / 2, cy - hgt / 2, wdt, hgt);
      cc.clip();
      cc.font = fontStr(font);
      cc.textAlign = 'left';
      cc.textBaseline = 'alphabetic';
      cc.fillStyle = flash ? blockCol : INK;
      cc.translate(Math.round(bxc), Math.round(cy));
      cc.scale(s, s);
      cc.fillText(it.ch, Math.round(-m.adv / 2), Math.round((m.emA - m.emD) / 2));
      cc.restore();
    }
  });
  cc.restore();
  const lp = seg(t, L.t0, L.t0 + 0.3);
  if (lp > 0) {
    c.save();
    c.globalAlpha *= o.alpha ?? 1;
    withHalo(c, pal.bg, o.halo ?? 0, 8);
    drawBoxWord(c, L.english, cx, cy + B / 2 + 40 * k, { size: 13 * k, color: pal.ink, alpha: 1 - seg(t, outStart, outStart + 0.12), p: lp });
    c.restore();
    c.shadowColor = 'transparent';
  }
}

// ── OUTRO ───────────────────────────────────────────────────────────────────

const OUTRO: TypesetOpts = {
  font: { role: 'jpSerif', weight: 500, size: 54 },
  tsume: 0.45,
  tracking: 0.08,
  space: 0.6,
  ruby: { font: { role: 'jpSerif', weight: 500, size: 20 }, gap: 6 },
};

export function drawOutro(c: CanvasRenderingContext2D, L: LineTiming, t: number, o: RenderOpts) {
  const W = lineWindow(L);
  if (t < W.a || t >= W.b) return;
  const k = o.scale ?? 1;
  const pal = o.pal;
  const ts = typeset(L, scaled(OUTRO, k));
  const [cx, by] = o.anchor ?? [960, 962];
  const ox = cx - ts.width / 2;
  const out = seg(t, W.b - 0.5, W.b, ease.inOutCubic);
  {
    const half = Math.max(ts.width, englishWidth(L, EN_FONT(15 * k), 0.22)) / 2 + 30 * k;
    plateRect(o.pc, cx - half, by - ts.ascent - 34 * k, cx + half, by + 56 * k, (o.plate ?? 0) * 0.55 * seg(t, W.a, W.a + 0.4) * (1 - out), 14, 12, o.plateColor);
  }
  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  for (const g of ts.glyphs) {
    const tr = revealT(L, g);
    const a = seg(t, tr - 0.02, tr + 0.4, ease.outCubic) * (1 - out);
    if (a <= 0) continue;
    const blur = (1 - seg(t, tr, tr + 0.38, ease.outCubic)) * 6 + out * 4;
    if (blur > 0.3) c.filter = `blur(${blur.toFixed(2)}px)`;
    withHalo(c, pal.bg, o.halo ?? 0, 10);
    drawGlyph(c, g, ox, by, { fill: pal.ink, alpha: a });
    c.filter = 'none';
  }
  for (const r of ts.ruby) {
    const m = L.morae[r.mora];
    drawGlyph(c, r, ox, by, { fill: rgba(pal.ink, 0.7), alpha: seg(t, m.t - 0.02, m.t + 0.35, ease.outCubic) * (1 - out) });
  }
  english(c, L, cx, by + 42 * k, 15 * k, rgba(pal.ink, 0.6), seg(t, W.a + 0.2, W.a + 1.0, ease.outCubic) * (1 - out), 'center', { tracking: 0.22 });
  c.restore();
  c.shadowColor = 'transparent';
}

// ── PLAIN / ENGLISH ─────────────────────────────────────────────────────────

const PLAIN: TypesetOpts = {
  font: { role: 'jp', weight: 600, size: 44 },
  latin: { role: 'display', weight: 700, size: 44 },
  tsume: 0.5,
  space: 0.5,
  ruby: { font: { role: 'jp', weight: 600, size: 17 }, gap: 4 },
};

export function drawPlain(c: CanvasRenderingContext2D, L: LineTiming, t: number, o: RenderOpts) {
  const W = lineWindow(L);
  if (t < W.a || t >= W.b) return;
  const k = o.scale ?? 1;
  const pal = o.pal;
  const ts = typeset(L, scaled(PLAIN, k));
  const [cx, by] = o.anchor ?? [960, 972];
  const ox = cx - ts.width / 2;
  const A = seg(t, W.a, W.a + 0.25) * (1 - seg(t, W.b - 0.25, W.b));
  {
    const half = Math.max(ts.width, englishWidth(L, EN_FONT(15 * k), 0.14)) / 2 + 26 * k;
    plateRect(o.pc, cx - half, by - ts.ascent - 30 * k, cx + half, by + 48 * k, (o.plate ?? 0) * 0.62 * A, 12, 10, o.plateColor);
  }
  c.save();
  c.globalAlpha *= (o.alpha ?? 1) * A;
  withHalo(c, pal.bg, o.halo ?? 0, 10);
  for (const g of ts.glyphs) {
    const lit = seg(t, revealT(L, g), revealT(L, g) + 0.08);
    drawGlyph(c, g, ox, by, { fill: rgba(pal.ink, 0.5 + 0.5 * lit) });
  }
  for (const r of ts.ruby) drawGlyph(c, r, ox, by, { fill: rgba(pal.ink, 0.8) });
  english(c, L, cx, by + 36 * k, 15 * k, rgba(pal.ink, 0.75), 1, 'center');
  c.restore();
  c.shadowColor = 'transparent';
}

export function drawEnglishOnly(c: CanvasRenderingContext2D, L: LineTiming, t: number, o: RenderOpts) {
  const W = lineWindow(L);
  if (t < W.a || t >= W.b) return;
  const k = o.scale ?? 1;
  const [cx, by] = o.anchor ?? [960, 1012];
  const A = seg(t, W.a, W.a + 0.3, ease.outCubic) * (1 - seg(t, W.b - 0.25, W.b, ease.inCubic));
  {
    const half = englishWidth(L, EN_FONT(16 * k), 0.18) / 2 + 24 * k;
    plateRect(o.pc, cx - half, by - 26 * k, cx + half, by + 14 * k, (o.plate ?? 0) * 0.62 * A, 10, 8, o.plateColor);
  }
  c.save();
  withHalo(c, o.pal.bg, o.halo ?? 0, 8);
  english(c, L, cx, by, 16 * k, rgba(o.pal.ink, 0.82), (o.alpha ?? 1) * A, 'center', { tracking: 0.18 });
  c.restore();
  c.shadowColor = 'transparent';
}
