import { clamp, ease, lerp } from '../../engine/anim';
import type { Frame } from '../../engine/engine';
import { FONTS, text } from '../../engine/draw2d';
import { C } from '../_shared/palette';
import { baselineRatio, drawTocDefault, HERO_TOC, LAYOUT_CLERK, LAYOUT_HERO, mixColor, pointOn, TOC_DARK, type TocLayout } from './toc-geometry';
import { BEAT, cssEase, cssEaseOut, hops, rollEase, T_C, T_D, tocStateAt, transitioned, type Target, type TocTiming } from './timeline';
import { BLOCK_ROW, DARK, drawBlock, drawGlass, drawPopoverBar, drawRollTrigger, glassPitch } from './variants';
import { boxWord, hair, MONO, regMark } from './hud';

/** Shot C — specimens (32.0–35.2): every TOC style on one spec sheet, all synced to one sweep. */
const N = HERO_TOC.length;
/**
 * The shared sweep: nine hops ARRIVING on drum hits (timing.json) — bar 21: snare 2 · kick 2& ·
 * kick 3& · snare 4 | bar 22: kick 1 · snare 2 · kick 2& · kick 3& · snare 4 → Reading … Minimap.
 */
export const ARR_C = [32.4, 32.6, 33.0, 33.2, 33.6, 34.0, 34.2, 34.6, 34.8];
export const HEADS_C = ARR_C;
export const EV_C = hops(0, ARR_C, 0.15, T_C);
/** panel reveals = solos, on hits: kick 32.0 · snare 32.4 · kick 33.0 · snare 33.2 · kick 33.6 · snare 34.0 */
const REVEAL = [32.0, 32.4, 33.0, 33.2, 33.6, 34.0];
/** the Glass minimap expands (150 ms) onto the 33.6 kick */
const GLASS_OPEN = 33.6 - 0.15;
const TM_C: TocTiming = { clip: 0.15, dot: 0.15, text: 0.15, ease: cssEase };

/** list rows share one pitch on screen (sheet px) so the active row is one horizontal band */
export const PITCH = 56;
export const S_LIST = PITCH / 32; // normal / clerk: 1.75
const S_BLOCK = PITCH / BLOCK_ROW; // 2.0
const S_GLASS = PITCH / 24; // 2.333 (expanded)

export interface Cell {
  id: string;
  n: string;
  label: string;
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
  reveal: number;
}
const TOP = 252;
const LIST_H = 560;
export const CELLS: Cell[] = [
  { id: 'normal', n: '01', label: 'NORMAL', file: 'toc/default.tsx', x: 96, y: TOP, w: 356, h: LIST_H, reveal: REVEAL[0] },
  { id: 'clerk', n: '02', label: 'CLERK', file: 'toc/clerk.tsx', x: 468, y: TOP, w: 356, h: LIST_H, reveal: REVEAL[1] },
  { id: 'block', n: '03', label: 'BLOCK', file: 'toc/block.tsx', x: 840, y: TOP, w: 356, h: LIST_H, reveal: REVEAL[2] },
  { id: 'glass', n: '04', label: 'MINIMAP', file: 'glass · toc.tsx', x: 1212, y: TOP, w: 356, h: LIST_H, reveal: REVEAL[3] },
  { id: 'popover', n: '05', label: 'POPOVER', file: 'docs · mobile', x: 96, y: 828, w: 728, h: 172, reveal: REVEAL[4] },
  { id: 'roll', n: '06', label: 'ROLL-IN', file: 'spacious · header', x: 840, y: 828, w: 728, h: 172, reveal: REVEAL[5] },
];
const HEAD_H = 44;
/** first list row's text top inside a list cell (sheet px) */
const ROW0 = TOP + HEAD_H + 22;
/** NORMAL's TOC origin on the sheet */
export const NORMAL_O = { x: 96 + 22, y: ROW0 };

/**
 * The solo tour: on each beat one panel solos (brightens, its label grows and fills) while the
 * others dim to 40 % — NORMAL → CLERK → BLOCK → MINIMAP → POPOVER → ROLL-IN, then all together on
 * 34.4, then POPOVER again as the thumb leaps into its circle (34.8).
 */
const SOLO: { t: number; id: string | null }[] = [
  { t: REVEAL[0], id: 'normal' },
  { t: REVEAL[1], id: 'clerk' },
  { t: REVEAL[2], id: 'block' },
  { t: REVEAL[3], id: 'glass' },
  { t: REVEAL[4], id: 'popover' },
  { t: REVEAL[5], id: 'roll' },
  { t: 34.6, id: null },
  { t: T_D - BEAT, id: 'popover' },
];
const DIM = 0.3;

/** start time of the solo this panel is currently in (−∞ if none) */
function soloStartAt(id: string, t: number): number {
  let st = Number.NEGATIVE_INFINITY;
  for (let k = 0; k < SOLO.length; k++) {
    const s = SOLO[k];
    if (s.t > t) break;
    st = s.id === id ? s.t : Number.NEGATIVE_INFINITY;
  }
  return st;
}

/** panel brightness 0.4..1 (CSS-like transitions: 120 ms up, 250 ms down) */
function brightAt(id: string, t: number): number {
  let from = 1, to = 1, t0 = Number.NEGATIVE_INFINITY, dur = 0.2;
  for (const s of SOLO) {
    if (s.t > t) break;
    const v = s.id === null || s.id === id ? 1 : DIM;
    const cur = t0 === Number.NEGATIVE_INFINITY ? to : from + (to - from) * cssEase(clamp((s.t - t0) / dur));
    from = cur;
    to = v;
    t0 = s.t;
    dur = v > cur ? 0.12 : 0.25;
  }
  return t0 === Number.NEGATIVE_INFINITY ? 1 : from + (to - from) * cssEase(clamp((t - t0) / dur));
}

/** solo emphasis 0..1 (label growth with a small overshoot, quicker release) */
function soloAt(id: string, t: number): number {
  let v = 0;
  for (let k = 0; k < SOLO.length; k++) {
    const s = SOLO[k];
    if (s.id !== id || t < s.t) continue;
    const end = SOLO[k + 1]?.t ?? Number.POSITIVE_INFINITY;
    v = Math.max(v, ease.outBack(clamp((t - s.t) / 0.28), 2) * (1 - cssEase(clamp((t - end) / 0.22))));
  }
  return v;
}

/** the camera leans a little toward the soloing panel (outExpo on each beat) */
function leanAt(t: number): [number, number] {
  const centre = (id: string | null): [number, number] => {
    const c = CELLS.find((x) => x.id === id);
    return c ? [(c.x + c.w / 2 - 832) * 0.16, (c.y + c.h / 2 - 626) * 0.16] : [0, 0];
  };
  let fx = 0, fy = 0, tx = 0, ty = 0, t0 = Number.NEGATIVE_INFINITY;
  for (const s of SOLO) {
    if (s.t > t) break;
    if (t0 > Number.NEGATIVE_INFINITY) {
      const k = ease.outExpo(clamp((s.t - t0) / 0.4));
      fx += (tx - fx) * k;
      fy += (ty - fy) * k;
    }
    [tx, ty] = centre(s.id);
    t0 = s.t;
  }
  if (t0 === Number.NEGATIVE_INFINITY) return [0, 0];
  const k = ease.outExpo(clamp((t - t0) / 0.4));
  return [fx + (tx - fx) * k, fy + (ty - fy) * k];
}

/** Camera: sheet → screen = centre + Z·(p − focus). */
export interface CamC {
  Z: number;
  fx: number;
  fy: number;
  sx: number;
  sy: number;
  rot: number;
}
export const C_START = { Z: 2.4, sx: 760, sy: 420 };

/** POPOVER cell's progress circle on the sheet (bar S 1.82, circle css (25, 20) r 7.5). */
export const POP_S = 1.82;
export const POP_BAR = { x: 96 + (728 - 390 * POP_S) / 2, y: 828 + 44 + (172 - 44 - 40 * POP_S) / 2 };
export const POP_CIRCLE = { x: POP_BAR.x + 25 * POP_S, y: POP_BAR.y + 20 * POP_S, r: 7.5 * POP_S };
/** the dive lands with the circle at (960, 540), radius 300 */
export const DIVE_END = T_D + 0.42;

export function cameraC(t: number): CamC {
  const base = cameraSheet(Math.min(t, T_D));
  if (t <= T_D) return base;
  // the sheet only leans in a little and racks out of focus; the circle itself lifts off (shotD)
  const k = ease.inCubic(clamp((t - T_D) / (DIVE_END - T_D)));
  const cs = Math.cos(base.rot), sn = Math.sin(base.rot);
  const dx = POP_CIRCLE.x - base.fx, dy = POP_CIRCLE.y - base.fy;
  // keep the circle's sheet point fixed on screen while scaling (zoom about it)
  const px = base.sx + base.Z * (cs * dx - sn * dy), py = base.sy + base.Z * (sn * dx + cs * dy);
  return { Z: base.Z * (1 + 0.6 * k), fx: POP_CIRCLE.x, fy: POP_CIRCLE.y, sx: px, sy: py, rot: base.rot };
}

/** the circle's screen pose at the start of the dive (where it lifts off) */
export function circleLiftOff() {
  const b = cameraSheet(T_D);
  const cs = Math.cos(b.rot), sn = Math.sin(b.rot);
  const dx = POP_CIRCLE.x - b.fx, dy = POP_CIRCLE.y - b.fy;
  return { x: b.sx + b.Z * (cs * dx - sn * dy), y: b.sy + b.Z * (sn * dx + cs * dy), r: POP_CIRCLE.r * b.Z };
}

function cameraSheet(t: number): CamC {
  // dot of NORMAL at "Reading" (start of the sweep) is the focus at 32.0
  const d0 = pointOn(LAYOUT_HERO.pts, LAYOUT_HERO.lens[0][1]);
  const f0 = { x: NORMAL_O.x + d0[0] * S_LIST, y: NORMAL_O.y + d0[1] * S_LIST };
  const full = { x: 832, y: 626, Z: 1.0, sx: 900, sy: 572 };
  // stepped pull-back: one step per beat while the cells switch on
  const stepsZ = [2.4, 1.85, 1.5, 1.27, 1.12, 1.03, 1.0];
  // one pull-back step per panel reveal (on its hit); the first leaves B's landing smoothly
  // (out-cubic), later ones punch (out-expo)
  let k = -1;
  for (let i = 0; i < REVEAL.length; i++) if (t >= REVEAL[i]) k = i;
  let Z = stepsZ[0];
  if (k >= 0) {
    const ph = (k === 0 ? ease.outCubic : ease.outExpo)(clamp((t - REVEAL[k]) / (k === 0 ? 0.4 : 0.32)));
    Z = lerp(stepsZ[k], stepsZ[k + 1], ph);
  }
  // the focus / screen anchor glide from the dot to the sheet centre as Z shrinks
  const m = clamp((stepsZ[0] - Z) / (stepsZ[0] - 1.0));
  const mm = ease.inOutCubic(m);
  const [lx, ly] = leanAt(t);
  const fx = lerp(f0.x, full.x, mm) + lx, fy = lerp(f0.y, full.y, mm) + ly;
  let sx = lerp(C_START.sx, full.sx, mm);
  let sy = lerp(C_START.sy, full.sy, mm);
  // keep the panels below the top-left staff credit (overlay: y 84–150) — headers at y ≥ 172
  sy = Math.max(sy, 172 - Z * (TOP - fy));
  // slow push toward POPOVER (the next stop) anchored at the sheet's top-right: the top edge stays
  // under the credit line and the right edge clear of the lyric column
  const sm = (x: number) => {
    const k = clamp(x);
    return k * k * (3 - 2 * k);
  };
  const kp = 1 + 0.045 * sm((t - (T_C + 5.5 * BEAT)) / (T_D - (T_C + 5.5 * BEAT)));
  const AX = 1560, AY = 182;
  sx = AX + kp * (sx - AX);
  sy = AY + kp * (sy - AY);
  Z *= kp;
  return { Z, fx, fy, sx, sy, rot: -0.012 * sm((t - T_C) / (T_D - T_C)) };
}

function stateC(t: number) {
  return tocStateAt(t, LAYOUT_HERO, 0, EV_C, TM_C);
}

/** POPOVER progress value (lastActive + 1) / N with the 150 ms `transition-all` (docs) or 300 ms (Spacious). */
export function popoverProgress(t: number, dur = 0.15): number {
  const tg: Target[] = EV_C.map((x) => ({ t: x.t, v: (x.end + 1) / N }));
  return transitioned(t, 1 / N, tg, dur, cssEase);
}

/** the soloing panel's light pool in screen px (eases panel → panel on each solo hit) */
export function soloSpot(t: number): { x: number; y: number; rx: number; ry: number; k: number } {
  const cam = cameraC(t);
  const toScreen = (x: number, y: number): [number, number] => {
    const cs = Math.cos(cam.rot), sn = Math.sin(cam.rot);
    const dx = x - cam.fx, dy = y - cam.fy;
    return [cam.sx + cam.Z * (cs * dx - sn * dy), cam.sy + cam.Z * (sn * dx + cs * dy)];
  };
  const centre = (id: string | null) => {
    const c = CELLS.find((x) => x.id === id);
    return c ? { x: c.x + c.w / 2, y: c.y + c.h / 2, w: c.w, h: c.h } : { x: 832, y: 626, w: 1500, h: 760 };
  };
  let from = centre(SOLO[0].id), to = from, t0 = SOLO[0].t;
  for (const s of SOLO) {
    if (s.t > t) break;
    const k = ease.outExpo(clamp((s.t - t0) / 0.35));
    from = { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k), w: lerp(from.w, to.w, k), h: lerp(from.h, to.h, k) };
    to = centre(s.id);
    t0 = s.t;
  }
  const k = ease.outExpo(clamp((t - t0) / 0.35));
  const c = { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k), w: lerp(from.w, to.w, k), h: lerp(from.h, to.h, k) };
  const [sx, sy] = toScreen(c.x, c.y);
  const on = clamp((t - T_C) / 0.3) * (1 - clamp((t - T_D) / 0.25));
  return { x: sx, y: sy, rx: c.w * cam.Z * 0.75, ry: c.h * cam.Z * 0.75, k: on };
}

export interface DrawCOpts {
  /** 0..1: the NORMAL thumb leaving its cell (C → D leap) */
  leap?: number;
  /** 0..1: popover opened (circle → primary, chevron up) */
  open?: number;
  /** hide the popover circle (D draws it during the dive) */
  noCircle?: boolean;
  /** transparent background (the caller composites a light pool under the sheet) */
  noBg?: boolean;
}

/** the C → D leap: the NORMAL thumb jumps onto the POPOVER circle's arc head (34.8–35.2) */
export const T_LEAP = T_D - BEAT;
export function leapAt(t: number) {
  return clamp((t - T_LEAP) / BEAT);
}
export function openAt(t: number) {
  // the popover opens (150 ms) onto the 35.0 kick, mid-leap
  return cssEase(clamp((t - (35.0 - 0.15)) / 0.15));
}

export function drawC(f: Frame, c: CanvasRenderingContext2D, o: DrawCOpts = {}) {
  const t = f.t;
  o = { leap: leapAt(t), open: openAt(t), ...o };
  const dive = clamp((t - T_D) / (DIVE_END - T_D));
  const cam = cameraC(t);
  const W = f.W, H = f.H;
  if (!o.noBg) {
    c.fillStyle = C.INK;
    c.fillRect(0, 0, W, H);
  }
  drawKanji(c, t, cam);
  c.save();
  // camera transform: screen = s + Z·R·(p − f)
  c.translate(cam.sx, cam.sy);
  c.rotate(cam.rot);
  c.scale(cam.Z, cam.Z);
  c.translate(-cam.fx, -cam.fy);
  const px = 1 / cam.Z; // one screen pixel in sheet units

  // faint sheet grid + registration marks (P1PE spec sheet)
  const sheetA = clamp((t - (T_C + 0.1)) / 0.5);
  if (sheetA > 0) {
    c.save();
    c.globalAlpha = 0.06 * sheetA;
    c.fillStyle = C.PAPER;
    for (let y = 256; y <= 1024; y += 28) for (let x = 72; x <= 1592; x += 28) c.fillRect(x - px, y - px, 2 * px, 2 * px);
    c.restore();
    for (const [x, y] of [[72, 236], [1592, 236], [72, 1024], [1592, 1024]] as const) regMark(c, x, y, 10 * px, C.PAPER, 0.4 * sheetA);
  }

  const st = stateC(t);
  c.globalAlpha = 1 - ease.inOutCubic(dive);
  for (const cell of CELLS) drawCell(c, cell, t, st, px, o);
  drawSync(c, t, st, px);
  c.globalAlpha = 1;
  c.restore();

  // the leaping thumb (screen space, constant size)
  const lp = o.leap ?? 0;
  if (lp > 0 && t < T_D + 0.02) {
    const map = (x: number, y: number): [number, number] => {
      const cs = Math.cos(cam.rot), sn = Math.sin(cam.rot);
      const dx = x - cam.fx, dy = y - cam.fy;
      return [cam.sx + cam.Z * (cs * dx - sn * dy), cam.sy + cam.Z * (sn * dx + cs * dy)];
    };
    const d = pointOn(LAYOUT_HERO.pts, st.dotDist);
    const a0 = map(NORMAL_O.x + d[0] * S_LIST, NORMAL_O.y + d[1] * S_LIST);
    const ang = -Math.PI / 2 + Math.PI * 2 * popoverProgress(t);
    const a1 = map(POP_CIRCLE.x + Math.cos(ang) * POP_CIRCLE.r, POP_CIRCLE.y + Math.sin(ang) * POP_CIRCLE.r);
    const k = ease.inOutCubic(lp);
    const apex: [number, number] = [lerp(a0[0], a1[0], 0.5) + 90, Math.min(a0[1], a1[1]) - 70];
    const m = 1 - k;
    const x = m * m * a0[0] + 2 * m * k * apex[0] + k * k * a1[0];
    const y = m * m * a0[1] + 2 * m * k * apex[1] + k * k * a1[1];
    c.save();
    c.fillStyle = C.ORANGE;
    c.shadowColor = C.ORANGE;
    c.shadowBlur = 14 * Math.sin(Math.PI * k) * Math.hypot(c.getTransform().a, c.getTransform().b); // device px
    c.beginPath();
    c.arc(x, y, 3.5 * cam.Z * (1 + 0.8 * Math.sin(Math.PI * k)), 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}

function cellIn(cell: Cell, t: number) {
  return clamp((t - cell.reveal) / 0.3);
}

function drawCell(c: CanvasRenderingContext2D, cell: Cell, t: number, st: ReturnType<typeof stateC>, px: number, o: DrawCOpts) {
  const a = cellIn(cell, t);
  const { x, y, w, h } = cell;
  const ga = c.globalAlpha; // the dive fade
  const br = brightAt(cell.id, t);
  const so = soloAt(cell.id, t);
  // the very first cell grows around the already-visible TOC (B → C match): content always on for 01
  const content = cell.id === 'normal' ? 1 : ease.outCubic(a);
  if (a > 0) {
    // panel + frame draw-on
    c.save();
    c.globalAlpha = ga * ease.outCubic(a) * lerp(0.75, 1, br);
    c.fillStyle = DARK.bg;
    c.fillRect(x, y, w, h);
    if (so > 0) {
      c.fillStyle = `rgba(238,236,228,${(0.03 * clamp(so)).toFixed(4)})`;
      c.fillRect(x, y, w, h);
    }
    c.restore();
    const fr = ease.outExpo(a);
    // lock-on on the solo hit: a short frame flash, brackets snapping in from outside
    const age = t - soloStartAt(cell.id, t);
    const flash = age >= 0 && age < 0.4 ? Math.exp(-age / 0.1) : 0;
    const snapOff = age >= 0 && age < 0.3 ? (1 - ease.outBack(clamp(age / 0.22), 2.2)) * 18 : 0;
    c.save();
    c.globalAlpha = ga * br;
    c.strokeStyle = `rgba(238,236,228,${Math.min(1, lerp(0.16, 0.5, clamp(so)) + 0.45 * flash).toFixed(3)})`;
    c.lineWidth = px;
    c.beginPath();
    const per = 2 * (w + h) * fr;
    c.setLineDash([per, 1e5]);
    c.strokeRect(x, y, w, h);
    c.restore();
    // corner brackets (longer and heavier on the soloing panel)
    const L = lerp(12, 20, clamp(so)) * px;
    c.save();
    c.globalAlpha = ga * fr * br;
    c.strokeStyle = C.PAPER;
    c.lineWidth = lerp(1.5, 2.5, clamp(so)) * px;
    c.beginPath();
    for (const [cx0, cy0, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x + w, y + h, -1, -1], [x, y + h, 1, -1]] as const) {
      const cx = cx0 - sx * snapOff, cy = cy0 - sy * snapOff;
      c.moveTo(cx, cy + sy * L);
      c.lineTo(cx, cy);
      c.lineTo(cx + sx * L, cy);
    }
    c.stroke();
    c.restore();
    // header strip: the label grows and fills on solo (PAPER box, INK text)
    c.save();
    c.globalAlpha = ga * br;
    hair(c, x, y + HEAD_H, x + w * fr, y + HEAD_H, 'rgba(238,236,228,0.10)', 1, 1, px);
    text(c, cell.n, x + 16, y + 28, MONO(13, so > 0.5 ? C.PAPER : C.GREY, { alpha: a }));
    // the label types on fast; its solo fill grows with the text (never an empty bar)
    const lp = clamp((t - cell.reveal) / 0.22);
    // the box fills fast (by half the type-on) and the text flips to ink only over a filled box
    const fillK = clamp(so) * clamp((lp - 0.1) / 0.4);
    const inkK = fillK < 0.3 ? 0 : fillK > 0.6 ? 1 : ((fillK - 0.3) / 0.3) ** 2 * (3 - 2 * ((fillK - 0.3) / 0.3));
    boxWord(c, cell.label, x + 46, y + 22, lp, {
      size: 11 + 8 * so,
      color: C.PAPER,
      lw: px,
      track: 0.38,
      fill: C.PAPER,
      fillAlpha: fillK,
      textColor: mixColor(C.PAPER, C.INK, inkK),
    });
    // the file path steps aside while the grown label needs the header (no text over text)
    text(c, cell.file, x + w - 16, y + 28, { ...MONO(12, C.GREY, { alpha: a * 0.8 * (1 - clamp(so * 1.4)) }), align: 'right' });
    c.restore();
  }
  if (content <= 0) return;
  c.save();
  c.beginPath();
  c.rect(x, y + HEAD_H, w, h - HEAD_H);
  c.clip();
  c.globalAlpha = ga * content * br;
  const ox = x + 22;
  const oy = ROW0;
  switch (cell.id) {
    case 'normal':
    case 'clerk': {
      const L: TocLayout = cell.id === 'normal' ? LAYOUT_HERO : LAYOUT_CLERK;
      const s2 = cell.id === 'normal' ? st : tocStateAt(t, L, 0, EV_C, TM_C);
      drawTocDefault(c, L, { S: S_LIST, ox, oy, trackTop: s2.trackTop, trackBottom: s2.trackBottom, dotDist: s2.dotDist, textActive: s2.textActive, dotAlpha: cell.id === 'normal' ? 1 - clamp(o.leap ?? 0) : 0 }, { colors: TOC_DARK, alpha: c.globalAlpha });
      break;
    }
    case 'block': {
      // inset clip-path transition: 300 ms ease-out, rows 28 css
      const top = transitioned(t, 0, EV_C.map((e) => ({ t: e.t, v: e.start * BLOCK_ROW })), 0.3, cssEaseOut);
      const bottom = transitioned(t, BLOCK_ROW, EV_C.map((e) => ({ t: e.t, v: (e.end + 1) * BLOCK_ROW })), 0.3, cssEaseOut);
      // align row centres with the default TOC (text box centre 32i + 10 → 28i + 14)
      drawBlock(c, S_BLOCK, ox, oy + 10 * S_LIST - 14 * S_BLOCK, { top, bottom, textActive: st.textActive });
      break;
    }
    case 'glass': {
      // reveal collapsed (12 px rows), expand to titles one 8th later (row transition 150 ms)
      const open = cssEase(clamp((t - GLASS_OPEN) / 0.15));
      const p = glassPitch(open);
      // scale so the expanded rows land on the shared pitch; centre the collapsed column on it
      // expanded row centre 24i + 12 lands on the default row centre 32i + 10
      void p;
      drawGlass(c, S_GLASS, x + w - 22, oy + 10 * S_LIST - 12 * S_GLASS, { open, textActive: st.textActive });
      break;
    }
    case 'popover': {
      const title = HERO_TOC[st.start]?.title ?? '';
      drawPopoverBar(c, POP_S, POP_BAR.x, POP_BAR.y, { progress: popoverProgress(t), title, open: o.open ?? 0 }, DARK, 1, 390, o.noCircle);
      break;
    }
    case 'roll': {
      // the Spacious page header: breadcrumb + TOCDropdown (layouts/spacious/page/index.tsx):
      // flex gap-1.5, text-sm muted, separators muted/50, the trigger's -mx-1.5 eats the last gap
      const S = S_LIST;
      const bx = x + 34;
      const by = y + HEAD_H + (h - HEAD_H - 32 * S) / 2;
      c.font = `400 ${14 * S}px ${FONTS.ui}`;
      (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
      const yb = by + (6 + baselineRatio(c) * 14) * S;
      let cx = bx;
      for (const [str, col] of [['Getting Started', DARK.muted], ['/', 'rgba(179,179,179,0.4)'], ['Introduction', DARK.muted], ['/', 'rgba(179,179,179,0.4)']] as const) {
        text(c, str, cx, yb, { font: 'ui', size: 14 * S, color: col });
        c.font = `400 ${14 * S}px ${FONTS.ui}`;
        cx += c.measureText(str).width + 6 * S;
      }
      // the topmost active heading rolls in from the scroll direction
      let last = T_C - 10, idx = 0;
      for (const e of EV_C) if (e.t <= t && e.start !== idx) {
        idx = e.start;
        last = e.t;
      }
      drawRollTrigger(c, S, cx - 6 * S, by, { progress: popoverProgress(t, 0.3), title: HERO_TOC[idx].title, since: t - last, dir: 1 }, rollEase);
      break;
    }
  }
  c.restore();
}

export { T_D };

/** the one sweep: a hairline through the head row across the four list panels, with its anchor id */
function drawSync(c: CanvasRenderingContext2D, t: number, st: ReturnType<typeof stateC>, px: number) {
  const on = clamp((t - (T_C + 3 * BEAT + 0.1)) / 0.3) * (1 - clamp((t - (T_D - 0.1)) / 0.2));
  if (on <= 0) return;
  // follow the thumb's glide: row centre of the row the thumb is on
  const d = pointOn(LAYOUT_HERO.pts, st.dotDist);
  const y = ROW0 + d[1] * S_LIST + 2;
  const x0 = CELLS[0].x - 18, x1 = CELLS[3].x + CELLS[3].w + 18;
  c.save();
  c.globalAlpha *= on;
  c.strokeStyle = 'rgba(250,128,35,0.55)';
  c.lineWidth = px;
  c.setLineDash([3 * px, 5 * px]);
  c.beginPath();
  c.moveTo(x0, y);
  c.lineTo(x1, y);
  c.stroke();
  c.setLineDash([]);
  c.strokeStyle = C.ORANGE;
  c.beginPath();
  c.moveTo(x0, y - 5 * px);
  c.lineTo(x0, y + 5 * px);
  c.moveTo(x1, y - 5 * px);
  c.lineTo(x1, y + 5 * px);
  c.stroke();
  const id = '#' + HERO_TOC[Math.max(0, Math.min(N - 1, st.end))].id;
  text(c, id, x0 - 8, y + 4, { ...MONO(11, C.ORANGE), align: 'right' });
  // every head event ticks all four panels at once: a flash on the line + brackets on the row
  let last = -1;
  for (const h of HEADS_C) if (h <= t) last = h;
  const fl = last < 0 ? 0 : Math.exp(-(t - last) / 0.12);
  if (fl > 0.01) {
    c.globalAlpha = on * fl;
    c.strokeStyle = C.ORANGE;
    c.lineWidth = 2 * px;
    c.beginPath();
    c.moveTo(x0, y);
    c.lineTo(x1, y);
    c.stroke();
    c.lineWidth = 1.2 * px;
    // brackets frame the row the head is moving TO
    const tgt = pointOn(LAYOUT_HERO.pts, LAYOUT_HERO.lens[Math.max(0, Math.min(N - 1, st.end))][1]);
    const yt = ROW0 + tgt[1] * S_LIST + 2;
    for (let k = 0; k < 4; k++) {
      const cell = CELLS[k];
      const bx0 = cell.x + 8, bx1 = cell.x + cell.w - 8, by0 = yt - PITCH * 0.62, by1 = yt + 6;
      const L = 9;
      c.beginPath();
      c.moveTo(bx0, by0 + L);
      c.lineTo(bx0, by0);
      c.lineTo(bx0 + L, by0);
      c.moveTo(bx1 - L, by0);
      c.lineTo(bx1, by0);
      c.lineTo(bx1, by0 + L);
      c.moveTo(bx1, by1 - L);
      c.lineTo(bx1, by1);
      c.lineTo(bx1 - L, by1);
      c.moveTo(bx0 + L, by1);
      c.lineTo(bx0, by1);
      c.lineTo(bx0, by1 - L);
      c.stroke();
    }
  }
  c.restore();
}

/** 目次 — the section's one-off giant kanji, an outlined backdrop entering on the sung 「もくじ」 (32.2) */
function drawKanji(c: CanvasRenderingContext2D, t: number, cam: CamC) {
  const tIn = T_C + 0.2;
  const a = ease.outCubic(clamp((t - tIn) / 0.5)) * (1 - clamp((t - (T_D - 0.05)) / 0.3));
  if (a <= 0) return;
  // parallax: the backdrop moves at a fraction of the sheet camera
  const z = 1 + (cam.Z - 1) * 0.25;
  const x = 980 + (cam.sx - 900) * 0.3, y = 610 + (cam.sy - 572) * 0.3;
  c.save();
  c.translate(x, y);
  c.scale(z, z);
  c.font = `400 600px ${FONTS.jpBlack}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  // slam in: slight overshoot of scale and a quick tracking-in of the two glyphs
  const k = ease.outBack(clamp((t - tIn) / 0.35), 1.6);
  const gap = lerp(140, 0, k);
  c.globalAlpha = a;
  c.lineWidth = 1.5;
  c.strokeStyle = 'rgba(238,236,228,0.10)';
  c.strokeText('目', -300 - gap, 0);
  c.strokeText('次', 300 + gap, 0);
  c.restore();
}
