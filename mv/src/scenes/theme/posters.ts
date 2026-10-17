import * as THREE from 'three';
import type { Frame } from '../../engine/engine';
import { at } from '../../engine/time';
import { clamp, ease, lerp, seg, hold, hash } from '../../engine/anim';
import { boxLabel, text, measure, rect, line, crosshair, sparkle, textArc } from '../../engine/draw2d';
import { C } from '../_shared/palette';
import { drawDot, drawMoon } from '../_shared/moon';
import { swatch, NAME, pretty, luminance, type Swatch, type ThemeId } from '../_shared/theme-tokens';
import { POSTER_EVENTS, chipPos, togglePos, CHIP_ORDER, PICKER, TOGGLE_Y } from './timeline';
import { renderTrack, flipTurns, type Pose, type Track } from './repaint';
import { stage } from './stage';
import { plateBoxes, PW, PH } from './plates';
import { BAND_FRAME, bandTint, FOOT_Y } from './bands';

const W = 1920;
const H = 1080;
const T0 = at(33); // 51.2

// ── burst ───────────────────────────────────────────────────────────────────
/**
 * Burst discs after the orange dot: the 12 theme primaries. The 9 coloured presets are wide
 * bands; neutral / black / shadcn are honestly ink or paper, so they become the thin separators.
 * Launch frame n (after the impact) sets the rhythm: thin = 1 frame after the previous.
 */
const BURST: { id: ThemeId; mode: 'light' | 'dark'; n: number }[] = [
  { id: 'ruby', mode: 'light', n: 1.0 },
  { id: 'neutral', mode: 'light', n: 2.6 },
  { id: 'vitepress', mode: 'light', n: 3.4 },
  { id: 'dusk', mode: 'light', n: 5.0 },
  { id: 'black', mode: 'dark', n: 6.6 },
  { id: 'emerald', mode: 'light', n: 7.4 },
  { id: 'ocean', mode: 'light', n: 9.0 },
  { id: 'shadcn', mode: 'light', n: 10.6 },
  { id: 'catppuccin', mode: 'light', n: 11.4 },
  { id: 'solar', mode: 'light', n: 13.0 },
  { id: 'aspen', mode: 'light', n: 14.6 },
];
/** the first state's world (purple) arrives last */
const FINAL_N = 16.2;
const DISC_R = 1460;
interface Disc {
  x: number;
  y: number;
  r: number;
}
/** growth time (frames) per disc 0..12 — uneven, so the bands never form a regular target */
const DISC_DUR = [24, 19, 31, 22, 35, 20, 28, 18, 32, 23, 29, 21, 22];
/** each colour floods out from a centre that drifts along its own direction (golden-angle spread) */
const discDir = (i: number) => i * 2.39996 + 0.7;
const discEcc = (i: number) => (0.09 + 0.15 * hash(i, 7)) * (i === 12 ? 0.6 : 1);
/** frames since the impact */
const nOf = (t: number) => (t - T0) * 60;
/** disc i (0 = orange dot, 1..11 colours, 12 = state-1 world) at frame n, or null before launch */
function burstDisc(i: number, n: number): Disc | null {
  const cx = W / 2;
  const cy = H / 2;
  if (i === 0) {
    // the dot: r 38 on the impact frame (B4), concentric
    const r = n < 0 ? 7 : 38 + (DISC_R - 38) * ease.outExpo(clamp(n / DISC_DUR[0]));
    return { x: cx, y: cy, r };
  }
  const n0 = i === 12 ? FINAL_N : BURST[i - 1].n;
  if (n < n0) return null;
  const r = 10 + (DISC_R - 10) * ease.outExpo(clamp((n - n0) / DISC_DUR[i]));
  const e = discEcc(i) * r;
  return { x: cx + Math.cos(discDir(i)) * e, y: cy + Math.sin(discDir(i)) * e, r };
}
export const BURST_END = T0 + (FINAL_N + 13) / 60; // last disc covers the frame

// ── card pose ───────────────────────────────────────────────────────────────
const POSTER_POSE: Pose = { x: 70, y: -36, z: 0, s: 0.7, rx: 0.05, ry: -0.2, rz: -0.028 };

export function posterPose(t: number): Pose {
  const p = { ...POSTER_POSE };
  // slow continuous drift 51.6 → 54.0 (one shot, repainted)
  const d = seg(t, at(33, 2), at(34, 4), ease.linear);
  p.ry = lerp(-0.25, -0.11, d);
  p.rx = lerp(0.06, 0.03, d);
  p.rz = lerp(-0.014, -0.006, d);
  p.x = lerp(66, 40, d);
  p.y = lerp(30, 22, d);
  p.s = lerp(0.7, 0.735, d);
  // fly-in from the dot (51.33 → 51.6)
  const fi = seg(t, T0 + 8 / 60, at(33, 2), ease.outCubic);
  const fs = seg(t, T0 + 8 / 60, at(33, 2), (x) => ease.outBack(x, 1.4));
  p.s = lerp(0.05, p.s, fs);
  p.x = lerp(0, p.x, fi);
  p.y = lerp(0, p.y, fi);
  p.ry = lerp(-1.15, p.ry, ease.outQuart(fi));
  p.rz = lerp(0.5, p.rz, fi);
  // push into the page 54.0 → 54.4: squares to the lens and lands on the band framing
  const pu = seg(t, at(34, 4) + 0.04, at(35), ease.inOutCubic);
  p.x = lerp(p.x, BAND_FRAME.x, pu);
  p.y = lerp(p.y, BAND_FRAME.y, pu);
  p.rx = lerp(p.rx, 0, pu);
  p.ry = lerp(p.ry, 0, pu);
  p.rz = lerp(p.rz, 0, pu);
  p.s = lerp(p.s, BAND_FRAME.s, pu);
  // light/dark flips
  const ft = flipTurns(t, POSTER_EVENTS);
  p.ry += Math.PI * ft;
  // edge-on, the card's near edge swings toward the lens: ease it back a touch
  p.s *= 1 - 0.09 * Math.sin(Math.PI * (ft % 1));
  // kick punch (every beat in the chorus)
  const kick = f_kick(t);
  p.s *= 1 + 0.008 * kick * (1 - pu);
  return p;
}

let kickFn: (t: number) => number = () => 0;
const f_kick = (t: number) => kickFn(t);

// ── 2D pieces ───────────────────────────────────────────────────────────────
function fitSize(c: CanvasRenderingContext2D, s: string, maxW: number, size: number) {
  const w = measure(c, s, { font: 'display', size, weight: 900, stretch: 'extra-condensed', tracking: -0.01 });
  return w > maxW ? (size * maxW) / w : size;
}

/** Giant theme name: vertical, reading upward along the left edge (behind the page). */
export function drawName(c: CanvasRenderingContext2D, sw: Swatch, bar34: number) {
  const a = 1 - bar34;
  if (a <= 0) return;
  const name = NAME[sw.id];
  const o = { font: 'display' as const, weight: 900, stretch: 'extra-condensed' as CanvasFontStretch, tracking: -0.005 };
  const size = Math.min(340, fitSize(c, name, 760, 340));
  const cap = size * 0.7;
  const bx = 70 + cap; // baseline x (glyph tops point left)
  const by = 862; // text starts at the bottom, runs up
  c.save();
  c.globalAlpha = a;
  // slide out to the left as the picker takes the column (bar 34)
  c.translate(-bar34 * 260, 0);
  c.translate(bx, by);
  c.rotate(-Math.PI / 2);
  text(c, name, 0, 0, { ...o, size, color: sw.ink });
  c.restore();
  // index + mode, on the baseline side
  c.save();
  c.globalAlpha = a;
  const lx = bx + 26 - bar34 * 260;
  text(c, String(sw.index).padStart(2, '0'), lx, 860, { font: 'mono', size: 15, weight: 500, color: sw.ink });
  text(c, '/12', lx + 22, 860, { font: 'mono', size: 15, color: sw.ink, alpha: 0.6 });
  c.restore();
}

const IMPORT = { x0: 92, y: 158, size: 50, pre: "@import 'fumadocs-ui/css/" };
/** slot rect of the preset name in the big import line */
function importSlot(c: CanvasRenderingContext2D, id: string) {
  const o = { font: 'code' as const, size: IMPORT.size, weight: 500 };
  const x = IMPORT.x0 + measure(c, IMPORT.pre, o);
  const w = measure(c, id, o);
  return { x: x - 6, y: IMPORT.y - IMPORT.size * 0.86, w: w + 12, h: IMPORT.size * 1.12 };
}

/** screen position of a point given in plate CSS px on the visible face of the poster card */
function platePoint(cssX: number, cssY: number): [number, number] {
  const g = stage.card.group;
  g.updateMatrixWorld();
  const back = Math.cos(g.rotation.y) * Math.cos(g.rotation.x) < 0;
  const v = new THREE.Vector3((back ? -1 : 1) * (cssX - PW / 2), PH / 2 - cssY, 0).applyMatrix4(g.matrixWorld).project(stage.cam);
  return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H];
}

/** P1PE leader: the big import slot → the real preset token on the page (bar 34) */
function drawImportLeader(c: CanvasRenderingContext2D, sw: Swatch, t: number, a: number, typedFrom: number) {
  const pb = plateBoxes.get(`${sw.id}-${sw.mode}`)?.presetName?.css;
  if (!pb || a <= 0) return;
  const k = ease.outCubic(seg(t, typedFrom + 0.04, typedFrom + 0.26));
  if (k <= 0) return;
  const slot = importSlot(c, sw.id);
  const p0 = platePoint(pb[0] - 3, pb[1] - 3);
  const p1 = platePoint(pb[0] + pb[2] + 3, pb[1] - 3);
  const p2 = platePoint(pb[0] + pb[2] + 3, pb[1] + pb[3] + 3);
  const p3 = platePoint(pb[0] - 3, pb[1] + pb[3] + 3);
  const ax = slot.x + slot.w / 2;
  const ay = slot.y + slot.h + 6;
  const bx = (p0[0] + p1[0]) / 2;
  const by = Math.min(p0[1], p1[1]) - 4;
  c.save();
  c.globalAlpha = a;
  c.strokeStyle = C.ORANGE;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(ax, ay);
  c.lineTo(lerp(ax, bx, k), lerp(ay, by, k));
  c.stroke();
  if (k > 0.8) {
    c.beginPath();
    c.moveTo(p0[0], p0[1]);
    c.lineTo(p1[0], p1[1]);
    c.lineTo(p2[0], p2[1]);
    c.lineTo(p3[0], p3[1]);
    c.closePath();
    c.lineWidth = 2;
    c.strokeStyle = C.ORANGE;
    c.stroke();
  }
  c.beginPath();
  c.arc(ax, ay, 3.5, 0, Math.PI * 2);
  c.fillStyle = C.ORANGE;
  c.fill();
  c.restore();
}

/** The real one-line switch, big (bar 34): @import 'fumadocs-ui/css/<name>.css'; */
function drawImport(c: CanvasRenderingContext2D, sw: Swatch, t: number, a: number, typedFrom: number) {
  if (a <= 0) return;
  c.save();
  c.globalAlpha = a;
  const size = IMPORT.size;
  const o = { font: 'code' as const, size, weight: 500, color: sw.ink };
  const x0 = IMPORT.x0;
  const y = IMPORT.y;
  const pre = IMPORT.pre;
  const name = sw.id;
  // retype the slot on 16ths after each pick
  const n = Math.max(0, Math.min(name.length, Math.floor((t - typedFrom) / 0.05) + 1));
  const shown = name.slice(0, n);
  let x = x0;
  x += text(c, pre, x, y, { ...o, alpha: 0.72 });
  const wName = measure(c, name, o);
  // slot: underline + highlight block
  rect(c, x - 6, y - size * 0.86, wName + 12, size * 1.12, { fill: sw.ink });
  text(c, shown, x, y, { ...o, color: sw.world });
  if (n < name.length || Math.floor(t * 5) % 2 === 0) rect(c, x + measure(c, shown, o) + 2, y - size * 0.76, 4, size * 0.92, { fill: sw.world });
  x += wName;
  text(c, ".css';", x, y, { ...o, alpha: 0.72 });
  text(c, 'app/global.css', x0 + 2, y - 58, { font: 'mono', size: 15, color: sw.ink, alpha: 0.7 });
  c.restore();
}

/** paint-sample card height (5 token rows) */
const SWATCH_H = 64 + 5 * (54 + 34) + 40;

/** Paint-sample card with the theme's real tokens. */
function drawSwatchCard(c: CanvasRenderingContext2D, sw: Swatch, x: number, y: number, a: number) {
  if (a <= 0) return;
  const w = 252;
  const rows: [string, string, string][] = [
    ['primary', sw.primary, sw.raw.primary],
    ['background', sw.bg, sw.raw.background],
    ['card', sw.card, sw.raw.card],
    ['foreground', sw.fg, sw.raw.foreground],
    ['border', sw.border, sw.raw.border],
  ];
  const chipH = 54;
  const rowH = chipH + 34;
  const h = SWATCH_H;
  c.save();
  c.globalAlpha = a;
  // flat offset shadow + card
  rect(c, x + 10, y + 10, w, h, { fill: sw.shade });
  rect(c, x, y, w, h, { fill: sw.bg, stroke: sw.fg, lw: 1.5 });
  text(c, String(sw.index).padStart(2, '0'), x + 18, y + 38, { font: 'mono', size: 14, color: sw.muted });
  // the name fits between the index and the mode label (VITEPRESS is the longest)
  const nameO = { font: 'display' as const, size: 30, weight: 800, stretch: 'condensed' as CanvasFontStretch };
  const avail = w - 52 - 18 - measure(c, sw.mode.toUpperCase(), { font: 'wide', size: 10, tracking: 0.25 }) - 14;
  const nw = measure(c, NAME[sw.id], nameO);
  text(c, NAME[sw.id], x + 52, y + 40, { ...nameO, size: nw > avail ? (30 * avail) / nw : 30, color: sw.fg });
  text(c, sw.mode.toUpperCase(), x + w - 18, y + 38, { font: 'wide', size: 10, tracking: 0.25, color: sw.muted, align: 'right' });
  line(c, x, y + 58, x + w, y + 58, 1, sw.border);
  let yy = y + 72;
  for (const [k, hex, raw] of rows) {
    rect(c, x + 16, yy, w - 32, chipH, { fill: hex, stroke: sw.border, lw: 1 });
    // the value printed on the chip, in whichever ink reads on it
    const onChip = luminance(hex) < 0.3 ? '#ffffff' : '#0a0a0b';
    text(c, pretty(raw).replace(/^hsla?/, 'hsl'), x + 24, yy + chipH - 9, { font: 'mono', size: 10.5, color: onChip, alpha: 0.85 });
    text(c, `--color-fd-${k}`, x + 16, yy + chipH + 17, { font: 'mono', size: 11.5, color: sw.fg });
    yy += rowH;
  }
  text(c, `fumadocs-ui/css/${sw.id}.css`, x + 16, y + h - 16, { font: 'mono', size: 11, color: sw.muted });
  c.restore();
}

/** HUD: COLOR tag, mono line, registration marks; ticks on 8ths. */
function drawHud(c: CanvasRenderingContext2D, sw: Swatch, t: number, a: number) {
  if (a <= 0) return;
  c.save();
  c.globalAlpha = a;
  const ink = sw.ink;
  const eighth = Math.floor((t - T0) / 0.2);
  // registration marks
  const marks: [number, number][] = [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]];
  for (const [x, y] of marks) crosshair(c, x, y, 12, 1, ink, 0);
  // tick strip along the top edge, one lit per 8th
  for (let i = 0; i < 16; i++) {
    const x = 1288 + i * 22;
    const on = i === ((eighth % 16) + 16) % 16;
    rect(c, x, 52, 10, on ? 14 : 6, { fill: ink });
  }
  text(c, `${sw.id}.css · ${sw.mode}`, W - 96, 98, { font: 'mono', size: 14, color: ink, align: 'right', alpha: 0.8 });
  c.restore();
}

function drawColorTag(c: CanvasRenderingContext2D, ink: string, t: number) {
  const t1 = T0 + 1 / 60; // first frame after the impact frame (51.2 stays clean, B4)
  if (t < t1) return;
  // hero: boxed COLOR at the centre of the burst, then whipped into its corner tag
  const fly = ease.outExpo(seg(t, T0 + 0.21, T0 + 0.46));
  const pop = seg(t, t1, t1 + 0.07, (x) => ease.outBack(x, 2));
  const size = lerp(46, 15, fly) * lerp(1.25, 1, pop);
  // box centre: frame centre → the tag's centre (left edge 92, y 64)
  const tagW = measure(c, 'COLOR', { font: 'wide', size: 15, tracking: 0.42 }) - 15 * 0.42 + 15 * 2.4;
  const cx = lerp(W / 2, 92 + tagW / 2, fly);
  const cy = lerp(H / 2 - 150, 64, fly);
  const heroInk = C.WHITE;
  const col = fly < 0.5 ? heroInk : ink;
  c.save();
  c.globalAlpha *= Math.min(1, pop * 2);
  boxLabel(c, 'COLOR', cx, cy, { size, tracking: 0.42, color: col, align: 'center', ticks: fly < 0.98, fillBox: fly < 0.5 ? C.INK : undefined, lw: lerp(2, 1.5, fly) });
  c.restore();
  const tp = seg(t, T0 + 0.4, T0 + 0.6);
  if (tp > 0) {
    c.save();
    const x1 = 92 + tagW;
    line(c, x1 + 14, 64, x1 + 14 + 56 * tp, 64, 1, ink);
    text(c, '12 PRESETS × LIGHT / DARK', x1 + 82, 64 + 5, { font: 'mono', size: 13, color: ink, alpha: tp * 0.85 });
    c.restore();
  }
}

/** Theme picker (bar 34): 12 logo moons in each theme's colours + the light/dark toggle. */
function drawPicker(c: CanvasRenderingContext2D, sw: Swatch, t: number, a: number, mode: 'light' | 'dark') {
  if (a <= 0) return;
  c.save();
  c.globalAlpha = a;
  const x = PICKER.x;
  const y0 = PICKER.y0;
  const y1 = PICKER.y0 + (CHIP_ORDER.length - 1) * PICKER.step;
  const slide = (1 - seg(t, at(34) - 0.36, at(34) - 0.12, ease.outCubic)) * -200;
  c.translate(slide, 0);
  rect(c, x - 26, y0 - 26, 52, y1 - y0 + 52, { fill: sw.bg, stroke: sw.fg, lw: 1.5, r: 26 });
  CHIP_ORDER.forEach((id, i) => {
    const s = swatch(id, mode);
    const y = y0 + i * PICKER.step;
    const k = seg(t, at(34) - 0.3 + i * 0.012, at(34) - 0.12 + i * 0.012, ease.outBack);
    if (k <= 0) return;
    drawMoon(c, x, y, PICKER.r * k, { bg: s.bg, primary: s.primary, rim: 1.25 });
    if (id === sw.id) {
      c.beginPath();
      c.arc(x, y, PICKER.r + 5, 0, Math.PI * 2);
      c.lineWidth = 2;
      c.strokeStyle = sw.fg;
      c.stroke();
    }
  });
  text(c, 'THEME', x, y0 - 44, { font: 'wide', size: 10, tracking: 0.3, color: sw.ink, align: 'center' });
  // toggle pill (sun | moon), active half filled
  const ty = TOGGLE_Y;
  rect(c, x - 38, ty - 18, 76, 36, { fill: sw.bg, stroke: sw.fg, lw: 1.5, r: 18 });
  const act = togglePos(mode)[0];
  c.beginPath();
  c.arc(act, ty, 13, 0, Math.PI * 2);
  c.fillStyle = sw.fg;
  c.fill();
  const sx = togglePos('light')[0];
  const sunCol = mode === 'light' ? sw.bg : sw.fg;
  c.beginPath();
  c.arc(sx, ty, 4, 0, Math.PI * 2);
  c.lineWidth = 1.6;
  c.strokeStyle = sunCol;
  c.stroke();
  for (let i = 0; i < 8; i++) {
    const an = (i * Math.PI) / 4;
    line(c, sx + Math.cos(an) * 6.5, ty + Math.sin(an) * 6.5, sx + Math.cos(an) * 8.5, ty + Math.sin(an) * 8.5, 1.6, sunCol);
  }
  const mx = togglePos('dark')[0];
  const moonCol = mode === 'dark' ? sw.bg : sw.fg;
  c.save();
  c.beginPath();
  c.arc(mx, ty, 6.5, 0, Math.PI * 2);
  c.fillStyle = moonCol;
  c.fill();
  c.globalCompositeOperation = 'destination-out';
  c.beginPath();
  c.arc(mx + 3.6, ty - 3, 5.4, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.restore();
}

// ── the cursor dot (bar 34) ─────────────────────────────────────────────────
const CLICKS: [number, [number, number]][] = [
  [at(34), chipPos('ruby')],
  [at(34, 2), togglePos('light')],
  [at(34, 3), chipPos('vitepress')],
  [at(34, 4), togglePos('dark')],
];

function cursorAt(t: number): { x: number; y: number; r: number; ring: number; a: number } | null {
  const tIn = at(33, 4) + 0.06;
  if (t < tIn) return null;
  // after the last click it flies to the centre for the band split (54.4)
  const last = CLICKS[CLICKS.length - 1];
  if (t >= last[0]) {
    const p = seg(t, last[0] + 0.12, at(35), ease.inOutCubic);
    const [x0, y0] = last[1];
    const x = lerp(x0, W / 2, p);
    const y = lerp(y0, H / 2, p) - Math.sin(p * Math.PI) * 160;
    return { x, y, r: 8 - 1 * p, ring: clamp(1 - (t - last[0]) / 0.25), a: 1 };
  }
  // born from the page's own TOC thumb (the TOC section's dot), it grows and arcs to the
  // first pick; then arcs between clicks
  const born = tocThumbPoint();
  if (t < CLICKS[0][0] && born) {
    const g = ease.outBack(seg(t, tIn, tIn + 0.08));
    const p = seg(t, tIn + 0.06, CLICKS[0][0], ease.inOutCubic);
    const [x1, y1] = CLICKS[0][1];
    const x = lerp(born[0], x1, p);
    const y = lerp(born[1], y1, p) - Math.sin(p * Math.PI) * 180;
    return { x, y, r: lerp(2.5, 8, g), ring: 0, a: 1 };
  }
  let from: [number, number] = CLICKS[0][1];
  let t0 = CLICKS[0][0] + 0.05;
  for (const [tc, pos] of CLICKS) {
    if (t < tc) {
      const p = seg(t, Math.max(t0, tc - 0.3), tc, ease.inOutCubic);
      const x = lerp(from[0], pos[0], p);
      const y = lerp(from[1], pos[1], p) - Math.sin(p * Math.PI) * 70;
      return { x, y, r: 8, ring: 0, a: 1 };
    }
    from = pos;
    t0 = tc + 0.05;
  }
  return null;
}

/** screen position of the real TOC thumb on the poster card (keyBoxes.tocThumb) */
function tocThumbPoint(): [number, number] | null {
  const b = plateBoxes.get('emerald-dark')?.tocThumb as { rect?: number[]; containerCss?: number[] } | undefined;
  if (!b?.rect || !b.containerCss) return [1500, 230];
  return platePoint(b.containerCss[0] + b.rect[0] + b.rect[2] / 2, b.containerCss[1] + b.rect[1] + b.rect[3] / 2);
}

function drawCursor(c: CanvasRenderingContext2D, t: number) {
  const k = cursorAt(t);
  if (!k) return;
  // click: squash + ring
  let r = k.r;
  for (const [tc] of CLICKS) {
    const d = t - tc;
    if (d >= -0.03 && d < 0.18) r *= 1 - 0.3 * Math.exp(-((d - 0.01) ** 2) / 0.0012);
  }
  for (const [tc, pos] of CLICKS) {
    const d = t - tc;
    if (d >= 0 && d < 0.3) {
      const q = d / 0.3;
      c.beginPath();
      c.arc(pos[0], pos[1], 10 + 34 * ease.outCubic(q), 0, Math.PI * 2);
      c.lineWidth = 2 * (1 - q);
      c.strokeStyle = C.ORANGE;
      c.stroke();
    }
  }
  drawDot(c, k.x, k.y, r, C.ORANGE);
}

// ── track ───────────────────────────────────────────────────────────────────
const SWATCH_X = 1622;
const bar34 = (t: number) => seg(t, at(34) - 0.2, at(34) + 0.05, ease.inOutCubic);
const pushOut = (t: number) => seg(t, at(34, 4) + 0.04, at(35) - 0.04, ease.inCubic);

export const POSTER_TRACK: Track = {
  key: 'posters',
  events: POSTER_EVENTS,
  pose: posterPose,
  cardVisible: (t) => t >= T0 + 8 / 60,
  shadow: (t) => 1 - pushOut(t),
  back(c, s, t) {
    drawName(c, s, bar34(t));
    const ev = POSTER_EVENTS.filter((x) => x.via === 'iris' && x.id === s.id && x.t <= t + 1e-6).pop();
    drawImport(c, s, t, bar34(t) * (1 - pushOut(t)), ev ? ev.t + 0.08 : at(34) + 0.08);
  },
  front(c, s, t) {
    const a = seg(t, at(33, 2) - 0.12, at(33, 2) + 0.05) * (1 - pushOut(t));
    // the paint-sample card repaints with the page flip: a roller passes down it, mid-way on the snare
    const sy = lerp(304, 330, bar34(t));
    const fl = POSTER_EVENTS.find((ev) => ev.via === 'flip' && Math.abs(t - ev.t) < ev.dur / 2);
    if (fl) {
      const q = ease.inOutCubic(clamp((t - (fl.t - fl.dur / 2)) / fl.dur));
      const after = swatch(fl.id, fl.mode);
      const before = swatch(fl.id, fl.mode === 'light' ? 'dark' : 'light');
      const ye = sy - 4 + q * (SWATCH_H + 18);
      for (const [y0, y1, sw] of [[sy - 4, ye, after], [ye, sy + SWATCH_H + 14, before]] as [number, number, Swatch][]) {
        if (y1 <= y0) continue;
        c.save();
        c.beginPath();
        c.rect(SWATCH_X - 4, y0, 270, y1 - y0);
        c.clip();
        drawSwatchCard(c, sw, SWATCH_X, sy, a);
        c.restore();
      }
      if (q > 0 && q < 1) {
        c.save();
        c.globalAlpha = a;
        rect(c, SWATCH_X - 6, ye - 5, 274, 10, { fill: after.primary });
        rect(c, SWATCH_X - 6, ye - 6, 274, 1.5, { fill: C.INK });
        rect(c, SWATCH_X - 6, ye + 4.5, 274, 1.5, { fill: C.INK });
        c.restore();
      }
    } else drawSwatchCard(c, s, SWATCH_X, sy, a);
    drawHud(c, s, t, a);
    drawPicker(c, s, t, bar34(t) * (1 - pushOut(t)), s.mode);
    const ev = POSTER_EVENTS.filter((x) => x.via === 'iris' && x.id === s.id && x.t <= t + 1e-6).pop();
    if (ev) drawImportLeader(c, s, t, bar34(t) * (1 - pushOut(t)), ev.t + 0.08);
  },
  over(c, cur, t) {
    const fa = seg(t, at(35) - 0.15, at(35));
    if (fa > 0) {
      const sw = swatch('vitepress', 'dark');
      c.save();
      c.globalAlpha = fa;
      c.fillStyle = bandTint(sw);
      c.fillRect(0, FOOT_Y, W, H - FOOT_Y);
      c.fillStyle = sw.primary;
      c.fillRect(0, FOOT_Y, W, 2);
      c.restore();
    }
    c.save();
    c.globalAlpha = 1 - pushOut(t);
    drawColorTag(c, t < BURST_END ? C.WHITE : cur.ink, t);
    c.restore();
    drawCursor(c, t);
  },
  special(c, t, drawBack, cur) {
    if (t >= BURST_END) return false;
    drawBurst(c, nOf(t), drawBack, cur);
    return true;
  },
};

export function renderPosters(f: Frame): THREE.Texture {
  kickFn = (tt) => f.e.audio.pulse('kick', tt, 0.09);
  const out = renderTrack(f, POSTER_TRACK);
  if (f.t < BURST_END && nOf(f.t) < 14) f.overlay.tone = 'dark';
  // impact shake, lighter vignette on flat colour fields
  const sh = Math.exp(-Math.max(0, f.t - T0) / 0.12) * (f.t >= T0 ? 1 : 0);
  f.post.shake = [Math.sin(f.t * 93) * 8 * sh, Math.cos(f.t * 71) * 6 * sh];
  f.post.vignette = 0.1;
  return out;
}

// ── burst drawing ───────────────────────────────────────────────────────────
function drawBurst(c: CanvasRenderingContext2D, n: number, drawBack: (c: CanvasRenderingContext2D, s: Swatch) => void, first: Swatch) {
  const cx = W / 2;
  const cy = H / 2;
  c.fillStyle = C.INK;
  c.fillRect(0, 0, W, H);
  // discs: 0 orange, 1..11 colours, 12 = first state's world (+ its type)
  const cols = [C.ORANGE, ...BURST.map((d) => swatch(d.id, d.mode).world)];
  const discs: (Disc | null)[] = [];
  for (let i = 0; i <= 12; i++) discs.push(burstDisc(i, n));
  for (let i = 0; i < 12; i++) {
    const d = discs[i];
    if (!d) continue;
    c.beginPath();
    c.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    c.fillStyle = cols[i];
    c.fill();
    if (i > 0) {
      c.lineWidth = 2;
      c.strokeStyle = C.INK;
      c.stroke();
    }
  }
  const dl = discs[12];
  if (dl) {
    c.save();
    c.beginPath();
    c.arc(dl.x, dl.y, dl.r, 0, Math.PI * 2);
    c.clip();
    drawBack(c, first);
    c.restore();
    c.beginPath();
    c.arc(dl.x, dl.y, dl.r, 0, Math.PI * 2);
    c.lineWidth = 2;
    c.strokeStyle = C.INK;
    c.stroke();
  }
  // band labels (precision texture), each set in its band's thickest part
  for (const i of [1, 3, 6, 9]) {
    const o = discs[i];
    const inner = discs[i + 1];
    if (!o || !inner || o.r > 1300) continue;
    const dx = inner.x - o.x;
    const dy = inner.y - o.y;
    const dd = Math.hypot(dx, dy);
    const thick = o.r - inner.r + dd;
    if (thick < 30) continue;
    const phi = Math.atan2(-dy, -dx);
    const rad = o.r - thick / 2;
    const { id, mode } = BURST[i - 1];
    const s = swatch(id, mode);
    const label = `${String(s.index).padStart(2, '0')} ${NAME[id]} · ${pretty(s.raw.primary)}`;
    const lw = measure(c, label, { font: 'mono', size: 13, tracking: 0.08 });
    textArc(c, label, o.x, o.y, rad, phi - lw / 2 / rad, { font: 'mono', size: 13, color: s.ink, tracking: 0.08 });
  }
  // shock ring
  const sr = n < 0 ? 0 : 70 + 1300 * ease.outExpo(clamp(n / 30));
  const sa = 0.85 * (1 - clamp(n / 16));
  if (sa > 0) {
    c.beginPath();
    c.arc(cx, cy, sr, 0, Math.PI * 2);
    c.lineWidth = 2;
    c.strokeStyle = `rgba(250,250,247,${sa})`;
    c.stroke();
  }
  // four-point sparkles riding the shock ring: positions track the ring every frame, their
  // size twinkles on twos (limited animation)
  if (n >= 0 && n < 16) {
    const nh = hold(n / 60, 30) * 60;
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * Math.PI * 2 + Math.PI / 8 + 0.15 * hash(i, 1);
      const tw = 0.75 + 0.5 * hash(i, Math.floor(nh));
      const sz = (10 + 14 * hash(i, 9)) * (1 - clamp(n / 16)) * (i % 2 ? 0.7 : 1) * tw;
      sparkle(c, cx + Math.cos(an) * sr, cy + Math.sin(an) * sr, sz, C.WHITE);
    }
  }
}
