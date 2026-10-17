import * as THREE from 'three';
import { clamp, ease, lerp, seg } from '../../engine/anim';
import { boxLabel, crosshair, FONTS, glyphs, line, measure, rect, rectP, setFont, text } from '../../engine/draw2d';
import { ringGlyphs } from '../toc/ring';
import { HERO_TOC, LAYOUT_HERO, tracePath } from '../toc/toc-geometry';
import { HERO_ACTIVE, HERO_TOC_ORIGIN } from './herotoc';
import { C } from '../_shared/palette';
import { drawDot } from '../_shared/moon';
import { drawPreCell, drawBoxWord, lyricLine } from '../../overlay/lyrics';
import { project } from './cam';
import { LAYOUTS, ORDER, VH, VW } from './layouts';
import { T, nameReel } from './timeline';
import { FRAME_SY, S0, local, type World } from './world';
import * as THREE_NS from 'three';

type Ctx = CanvasRenderingContext2D;

// ── B3: the heading ring (TOC section) and its unroll into the "On this page" column ──────

const LIST_SIZE = 14; // text-sm, viewport px
const LIST_FG = '#FAFAFA';
const LIST_MUTED = '#8f8f95';

/** Screen position of viewport px (x, y) of frame 0 under the current camera (set per frame). */
let fv: (x: number, y: number) => [number, number] = (x, y) => [960 + (x - VW / 2) * S0, FRAME_SY + (y - VH / 2) * S0];
let fvScale = S0;

export function setFrame0(cam: THREE.Camera, M: THREE.Matrix4) {
  fv = (x, y) => {
    const p = project(cam, ...local(M, x, y, 0));
    return [p[0], p[1]];
  };
  const a = fv(0, 450);
  const b = fv(1440, 450);
  fvScale = Math.hypot(b[0] - a[0], b[1] - a[1]) / 1440;
}

/** B3: the TOC section's heading ring unrolls into the first wireframe's "On this page" column. */
export function drawUnroll(c: Ctx, t: number, vis: number) {
  if (vis <= 0) return;
  const gl = ringGlyphs(c);
  const S = fvScale;
  const [ox, oy] = fv(HERO_TOC_ORIGIN[0], HERO_TOC_ORIGIN[1]);
  const rows = LAYOUT_HERO.rows;
  // glyph centre offsets of each heading at the list size
  const offs = HERO_TOC.map((h) => glyphs(c, h.title, { font: 'ui', size: LIST_SIZE, weight: 400 }).glyphs.map((g) => g.x + g.w / 2));
  const seen = new Map<number, number>();
  c.save();
  c.globalAlpha = vis;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const base = c.getTransform();
  for (const g of gl) {
    const j = seen.get(g.i) ?? 0;
    seen.set(g.i, j + 1);
    const ti = T.start + 0.05 + 0.016 * g.i;
    const k = seg(t, ti, ti + 0.34, ease.inOutCubic);
    const row = rows[g.i];
    const bx = ox + (row.textX + (offs[g.i][j] ?? 0)) * S;
    const by = oy + (row.top + 10) * S;
    const x = lerp(g.x, bx, k) + Math.sin(k * Math.PI) * 26;
    const y = lerp(g.y, by, k);
    const rot = Math.atan2(Math.sin(g.rot), Math.cos(g.rot)) * (1 - k);
    const size = lerp(g.size, LIST_SIZE * S, k);
    const active = g.i >= HERO_ACTIVE[0] && g.i <= HERO_ACTIVE[1];
    c.font = `400 ${size}px ${FONTS.ui}`;
    c.letterSpacing = '0px';
    c.fillStyle = k < 0.999 ? C.PAPER : active ? LIST_FG : LIST_MUTED;
    c.setTransform(base);
    c.translate(x, y);
    c.rotate(rot);
    c.fillText(g.ch, 0, 0);
  }
  c.restore();
  // the TOC line draws on as the headings land; the active path (Layouts › Docs) in orange
  const rail = seg(t, T.start + 0.3, T.b25_3 + 0.1, ease.inOutCubic) * vis;
  if (rail > 0) {
    const L = LAYOUT_HERO;
    c.save();
    c.lineWidth = Math.max(1, S * 1.2);
    c.strokeStyle = '#4a4a50';
    c.beginPath();
    tracePath(c, L, S, ox, oy, 0, L.length * rail);
    c.stroke();
    const a0 = L.lens[HERO_ACTIVE[0]][0];
    const a1 = L.lens[HERO_ACTIVE[1]][1];
    const aOn = Math.min(a1, L.length * rail);
    if (aOn > a0) {
      c.strokeStyle = C.ORANGE;
      c.lineWidth = Math.max(1.5, S * 1.8);
      c.beginPath();
      tracePath(c, L, S, ox, oy, a0, aOn);
      c.stroke();
    }
    c.restore();
  }
}

/** The TOC agent's 3 px progress ring is drawn by the wireframe itself (frame outline in its circle state). */

// ── phase A HUD: registration marks, dimensions, ARRANGE ─────────────────────────────

export function drawBuildHud(c: Ctx, t: number, fade: number) {
  if (fade <= 0) return;
  const k = seg(t, T.b25_3, T.b25_3 + 0.25, ease.outCubic) * fade;
  if (k <= 0) return;
  const [x0, y0] = fv(0, 0);
  const [x1, y1] = fv(VW, VH);
  c.save();
  c.globalAlpha = k;
  const col = '#9a9aa2';
  // corner registration crosshairs
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) crosshair(c, x + (x < 960 ? -22 : 22), y + (y < FRAME_SY ? -22 : 22), 9, 1, col);
  // dimension line across the top: 1440
  const dy = y0 - 26;
  line(c, x0, dy, x0 + (x1 - x0) * k, dy, 1, col);
  line(c, x0, dy - 5, x0, dy + 5, 1, col);
  line(c, x1, dy - 5, x1, dy + 5, 1, col);
  text(c, '1440', (x0 + x1) / 2, dy - 8, { font: 'mono', size: 12, color: col, align: 'center' });
  // sidebar 268
  const [sx] = fv(268, 0);
  line(c, sx, dy - 5, sx, dy + 5, 1, C.ORANGE);
  text(c, '268', (x0 + sx) / 2, dy - 8, { font: 'mono', size: 12, color: C.ORANGE, align: 'center' });
  // toc 268
  const [tx] = fv(VW - 268, 0);
  line(c, tx, dy - 5, tx, dy + 5, 1, col);
  text(c, '268', (tx + x1) / 2, dy - 8, { font: 'mono', size: 12, color: col, align: 'center' });
  // height 900 on the right
  const dx = x1 + 26;
  line(c, dx, y0, dx, y0 + (y1 - y0) * k, 1, col);
  line(c, dx - 5, y0, dx + 5, y0, 1, col);
  line(c, dx - 5, y1, dx + 5, y1, 1, col);
  c.save();
  c.translate(dx + 14, (y0 + y1) / 2);
  c.rotate(-Math.PI / 2);
  text(c, '900', 0, 0, { font: 'mono', size: 12, color: col, align: 'center' });
  c.restore();
  c.restore();
}

/** Boxed section word (TACTIC device), top-right: the box draws on, the letters type in. */
export function drawArrange(c: Ctx, t: number) {
  const a = 1 - seg(t, T.arrive - 0.3, T.arrive);
  if (t < T.b25_3 || a <= 0) return;
  const word = 'ARRANGE';
  const size = 16;
  const to = { font: 'wide' as const, size, weight: 400, tracking: 0.3, color: C.WHITE, baseline: 'middle' as const };
  const tw = measure(c, word, to) - size * 0.3;
  const padX = size * 1.2;
  const bw = tw + padX * 2;
  const bh = size * 2.5;
  const xr = 1920 - 84;
  const bx = xr - bw;
  const cy = 92;
  const by = cy - bh / 2;
  const draw = seg(t, T.b25_3, T.b25_3 + 0.22, ease.outCubic);
  const typed = Math.floor(seg(t, T.b25_3 + 0.06, T.b25_3 + 0.3) * word.length + 1e-6);
  c.save();
  c.globalAlpha = a;
  rect(c, bx, by, bw, bh, { fill: 'rgba(10,10,11,0.85)' });
  rectP(c, bx, by, bw, bh, draw, 1, C.WHITE);
  line(c, bx - size * 0.8, cy, bx - size * 0.2, cy, 1, C.WHITE);
  line(c, bx + bw + size * 0.2, cy, bx + bw + size * 0.8, cy, 1, C.WHITE);
  text(c, word.slice(0, typed), bx + padX, cy + size * 0.04, to);
  if (typed < word.length && typed > 0) {
    // block caret riding the typing head
    const cw = measure(c, word.slice(0, typed), to);
    rect(c, bx + padX + cw, cy - size * 0.5, size * 0.6, size, { fill: C.ORANGE });
  }
  const sub = seg(t, T.b25_3 + 0.25, T.b25_3 + 0.4);
  text(c, '04 — LAYOUT', xr, 132, { font: 'mono', size: 12, color: '#8a8a92', tracking: 0.12, align: 'right', alpha: sub });
  text(c, '配置', xr, 156, { font: 'jpKaku', size: 13, weight: 700, color: C.ORANGE, align: 'right', alpha: sub });
  c.restore();
}

// ── labels ──────────────────────────────────────────────────────────────────────────

const JP: Record<string, string> = { docs: 'ドキュメント', notebook: 'ノートブック', flux: 'フラックス', glass: 'グラス', spacious: 'スペーシャス', home: 'ホーム' };

/** Local screen scale (px per viewport px) of frame placement M at a point. */
function scaleAt(cam: THREE.Camera, M: THREE.Matrix4, x: number, y: number): number {
  const a = local(M, x, y, 0);
  const b = local(M, x + 100, y, 0);
  const pa = project(cam, ...a);
  const pb = project(cam, ...b);
  return Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / 100;
}

/** Number tags under the row frames: fixed readable size, facing camera; the lit one fills orange. */
export function drawRowLabels(c: Ctx, w: World, cam: THREE.Camera) {
  for (const inst of w.insts) {
    const a = w.labels[inst.k] ?? 0;
    if (inst.k > 5 || a <= 0.01) continue;
    const L = LAYOUTS[ORDER[inst.k]];
    const p = project(cam, ...local(inst.M, 0, VH + 40, 0));
    if (p[2] > 1) continue;
    const lit = w.labelFull[inst.k] ?? 0;
    const size = 15;
    c.save();
    c.globalAlpha = a;
    boxLabel(c, `0${L.n}`, p[0], p[1] + 14, {
      size,
      color: lit > 0.5 ? C.WHITE : '#a4a4ac',
      padX: size * 0.75,
      padY: size * 0.55,
      fillBox: lit > 0.02 ? `rgba(250,128,35,${(0.85 * lit).toFixed(3)})` : '#0A0A0BB3',
    });
    c.restore();
  }
}

// ── the big layout name (title block, top-left) ─────────────────────────────────────

const NAME_X = 84;
const NAME_BASE = 248;
const NAME_SIZE = 104;
const NAME_FONT = { font: 'display' as const, size: NAME_SIZE, weight: 800, stretch: 'extra-condensed' as CanvasFontStretch, tracking: 0.005 };

/** Per-letter vertical roll from `from` to `to` inside the line box (split-flap feel). */
function rollWord(c: Ctx, from: string, to: string, x: number, base: number, p0: number, t: number, o: { size: number; stagger: number; dur: number; color: string; clipTop: number; clipBot: number }) {
  const fo = { ...NAME_FONT, size: o.size, color: o.color };
  const ga = from ? glyphs(c, from, fo).glyphs : [];
  const gb = to ? glyphs(c, to, fo).glyphs : [];
  const n = Math.max(ga.length, gb.length);
  const H = o.clipBot - o.clipTop;
  c.save();
  c.beginPath();
  c.rect(x - 12, o.clipTop, 1200, H);
  c.clip();
  setFont(c, { ...fo, align: 'left', baseline: 'alphabetic' });
  c.letterSpacing = '0px';
  c.fillStyle = o.color;
  for (let i = 0; i < n; i++) {
    const p = seg(t, p0 + i * o.stagger, p0 + i * o.stagger + o.dur);
    const A = ga[i];
    const B = gb[i];
    if (A && A.ch === B?.ch && Math.abs(A.x - B.x) < 0.5) {
      c.fillText(A.ch, x + A.x, base);
      continue;
    }
    // old and new letters scroll together one line-height apart (a slot reel): never overlap
    const e = ease.inOutCubic(p);
    if (A && e < 1) c.fillText(A.ch, x + A.x, base - e * H);
    if (B && e > 0) c.fillText(B.ch, x + B.x, base + (1 - e) * H);
  }
  c.restore();
}

export function drawBigName(c: Ctx, w: World, t: number) {
  const nm = w.name;
  if (!nm) return;
  const cur = nm.cur;
  const prev = nm.prev;
  const L = LAYOUTS[cur.id];
  const P = prev ? LAYOUTS[prev.id] : undefined;
  const hit = cur.t;
  const D = nameReel(nm.i);
  const out = nm.out;
  const word = out > 0 ? '' : L.name;
  const fromWord = out > 0 ? L.name : P ? (P.name !== L.name ? P.name : L.name) : '';
  // the reel ends exactly on the hit (anticipation); the roll-out starts on the tip-over kick
  const t0 = out > 0 ? T.arch : hit - D;
  const dur = out > 0 ? 0.1 : D;
  const n = Math.max(word.length, fromWord.length, 1);
  const stagger = dur > 0.05 ? Math.min(0.004, (dur * 0.4) / n) : 0;
  const ldur = dur - stagger * (n - 1);
  const top = NAME_BASE - NAME_SIZE * 0.74;
  c.save();
  // index line: 02 / 06 + rule (switches at mid-reel)
  const meta = 1 - out;
  const idx = nm.u >= 0.5 || !P ? L.n : P.n;
  text(c, `0${idx}`, NAME_X, NAME_BASE - NAME_SIZE * 0.86, { font: 'mono', size: 15, color: C.ORANGE, alpha: meta, tracking: 0.08 });
  text(c, '/ 06', NAME_X + 30, NAME_BASE - NAME_SIZE * 0.86, { font: 'mono', size: 15, color: '#7c7c84', alpha: meta, tracking: 0.08 });
  line(c, NAME_X + 84, NAME_BASE - NAME_SIZE * 0.86 - 5, NAME_X + 84 + 120 * meta, NAME_BASE - NAME_SIZE * 0.86 - 5, 1, '#3a3a40');
  // the word
  rollWord(c, fromWord, word, NAME_X, NAME_BASE, t0, t, { size: NAME_SIZE, stagger, dur: ldur, color: C.WHITE, clipTop: top - 10, clipBot: NAME_BASE + 14 });
  // orange underline: stretches from the old word's width to the new one with the reel, flashes on the hit
  const fo = { ...NAME_FONT };
  const wNew = word ? measure(c, word, fo) : 0;
  const wOld = fromWord ? measure(c, fromWord, fo) : 0;
  const k = seg(t, t0, t0 + dur, ease.inOutCubic);
  const uw = lerp(wOld, wNew, k);
  const flash = t >= hit ? Math.exp(-(t - hit) / 0.06) : 0;
  if (uw > 1) rect(c, NAME_X, NAME_BASE + 20, uw, 4 + 3 * flash, { fill: C.ORANGE });
  // import path + katakana scroll with the word
  const sub = seg(t, t0, t0 + dur);
  const subA = out > 0 ? 1 - seg(t, T.arch, T.arch + 0.12) : !P ? seg(t, t0, t0 + dur) : 1;
  if (subA > 0.01) {
    c.save();
    c.beginPath();
    c.rect(NAME_X - 4, NAME_BASE + 30, 700, 70);
    c.clip();
    const showPrev = P && sub < 1 && P.code !== L.code;
    const e = ease.inOutCubic(sub);
    const SD = 62; // scroll distance: the full two-line block
    if (showPrev) {
      text(c, P!.code, NAME_X, NAME_BASE + 56 - e * SD, { font: 'mono', size: 17, color: '#a4a4ac', alpha: subA });
      text(c, P!.jp, NAME_X, NAME_BASE + 84 - e * SD, { font: 'jpKaku', size: 15, weight: 700, color: C.ORANGE, alpha: subA });
    }
    const dy = showPrev ? (1 - e) * SD : 0;
    text(c, L.code, NAME_X, NAME_BASE + 56 + dy, { font: 'mono', size: 17, color: '#a4a4ac', alpha: subA });
    text(c, L.jp, NAME_X, NAME_BASE + 84 + dy, { font: 'jpKaku', size: 15, weight: 700, color: C.ORANGE, alpha: subA });
    c.restore();
  }
  // variant tag (same layout, another UI state): pops beside the word on the hit
  if (cur.tag && out <= 0) {
    const pop = seg(t, hit - 0.05, hit + 0.1, ease.outBack);
    const r = { x: NAME_X + wNew + 22, y: NAME_BASE - 26 };
    c.save();
    c.globalAlpha = Math.min(1, pop * 1.5);
    c.translate(r.x, r.y);
    c.scale(0.8 + 0.2 * pop, 0.8 + 0.2 * pop);
    boxLabel(c, '+ ' + cur.tag, 0, 0, { size: 15, color: C.WHITE, fillBox: 'rgba(250,128,35,0.9)', padX: 13, padY: 9 });
    c.restore();
  }
  c.restore();
}


// ── dot ─────────────────────────────────────────────────────────────────────────────

export function drawGuideDot(c: Ctx, w: World, cam: THREE.Camera) {
  const d = w.dot;
  if (d.a <= 0) return;
  let x: number;
  let y: number;
  if (d.screen) [x, y] = d.screen;
  else if (d.world) {
    const p = project(cam, ...d.world);
    if (p[2] > 1) return;
    [x, y] = p;
  } else return;
  c.save();
  c.globalAlpha = d.a;
  if (d.halo > 0) {
    const g = c.createRadialGradient(x, y, d.r, x, y, d.r * 5.2);
    g.addColorStop(0, `rgba(250,128,35,${0.22 * d.halo})`);
    g.addColorStop(1, 'rgba(250,128,35,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, d.r * 5.2, 0, Math.PI * 2);
    c.fill();
  }
  drawDot(c, x, y, d.r, C.ORANGE);
  c.restore();
}

/** B4: the final dot (50.4–51.2) — contract in docs/handoffs.md. */
export function drawFinalDot(c: Ctx, t: number) {
  const breathe = 0.5 + 0.5 * Math.sin((t - T.dot) * Math.PI * 2 * 1.25);
  const sq = ease.inQuad(clamp((t - 51.0) / 0.2));
  const r = 7 - 1.5 * sq;
  const haloA = lerp(0.22 - 0.04 * breathe, 0.1, sq);
  const haloR = lerp(36 + 2 * breathe, 22, sq);
  const g = c.createRadialGradient(960, 540, r, 960, 540, haloR);
  g.addColorStop(0, `rgba(250,128,35,${haloA})`);
  g.addColorStop(1, 'rgba(250,128,35,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(960, 540, haloR, 0, Math.PI * 2);
  c.fill();
  drawDot(c, 960, 540, r, C.ORANGE);
}

// ── L8 さあ (scene-drawn, imploding into the dot) ─────────────────────────────────────

export function drawSaa(c: Ctx, t: number) {
  const L = lyricLine('L8');
  const morae = L?.morae ?? [{ kana: 'さ', t: T.collapse }, { kana: 'あ', t: T.a }];
  // both cells ride the ring as it closes, then spiral into the dot
  const implode = seg(t, T.a + 0.12, T.dot - 0.04, ease.inCubic);
  const spin = 1.4 * Math.PI * seg(t, T.a + 0.05, T.dot - 0.04, ease.inQuad);
  morae.forEach((m, i) => {
    const on = m.t;
    if (t < on - 0.03) return;
    const size = 170;
    const hx = i === 0 ? -250 : 250;
    const s = 1 - implode;
    if (s <= 0.01) return;
    c.save();
    c.translate(960, 540);
    c.rotate(spin);
    c.translate(hx * s, 0);
    c.scale(s, s);
    drawPreCell(c, m.kana, 0, 0, size, {
      alpha: 1 - seg(t, T.dot - 0.1, T.dot - 0.03),
      draw: seg(t, on - 0.03, on + 0.13),
      pop: seg(t, on, on + 0.2),
      flash: Math.max(0, 1 - (t - on) / 0.16) * 0.9,
      ticks: 1,
    });
    c.restore();
  });
  const a = seg(t, T.collapse + 0.05, T.collapse + 0.2) * (1 - seg(t, T.a + 0.05, T.a + 0.2));
  if (a > 0.01) drawBoxWord(c, 'NOW', 960, 540 + 170, { size: 13, alpha: a, p: seg(t, T.collapse, T.collapse + 0.3) });
}

/** Motion echoes trailing the contracting ring (crisp, no blur). */
export function drawRingEchoes(c: Ctx, t: number, ringAt: (t: number) => number) {
  const r0 = ringAt(t);
  for (let k = 1; k <= 4; k++) {
    const r = ringAt(t - 0.018 * k);
    if (r - r0 < 3) continue;
    c.save();
    c.globalAlpha = 0.42 / k;
    c.strokeStyle = C.ORANGE;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(960, 540, r, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
}

void THREE_NS;
