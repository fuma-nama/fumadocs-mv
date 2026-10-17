import { FONTS, glyphs, rectP, line } from '../../engine/draw2d';
import { clamp, ease, seg } from '../../engine/anim';
import { drawDot } from '../_shared/moon';
import { P } from './pal';
import { T, TYPING, steps1, steps2, montage } from './timeline';
import { drawChrome, drawIcon, drawTaskbar, zoomRects, pixel, rect, type Rect } from './desk';
import { deskAt, ICONS, TERM_PAD, TERM_ORIGIN, chromeScale, type Desk, type Figure, type View } from './state';
import { CELL_H, CELL_W, LAYOUTS, PARTS, type Row, type TermState } from './term';
import { plates, pageBoxes, PW, PH, type Plate } from './plates';

export const layoutAt = deskAt;

/** Apply the 2D desktop camera to a context. */
export function applyView(c: CanvasRenderingContext2D, v: View) {
  c.setTransform(v.s, 0, 0, v.s, v.qx - v.s * v.cx, v.qy - v.s * v.cy);
}

// ── page window content ─────────────────────────────────────────────────────
/** A crop of the plate in plate CSS px (16:9): the "camera" inside a window. */
type Crop = [x: number, y: number, w: number, h: number];
const FULL_CROP: Crop = [0, 0, PW, PH];
const lerpCrop = (a: Crop, b: Crop, k: number): Crop => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];

function drawPlate(c: CanvasRenderingContext2D, p: Plate, r: Rect, filter?: string, crop: Crop = FULL_CROP) {
  c.save();
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  if (filter) c.filter = filter;
  const zoom = r.w / crop[2]; // window px per plate css px
  const src = zoom >= 0.9 ? p.src : zoom >= 0.45 ? p.mid : p.small;
  const k = src.width / PW;
  const exact = src === p.small && crop === FULL_CROP && Math.abs(r.w - PW / 2) < 0.5;
  c.drawImage(src, crop[0] * k, crop[1] * k, crop[2] * k, crop[3] * k, exact ? Math.round(r.x) : r.x, exact ? Math.round(r.y) : r.y, r.w, r.h);
  c.restore();
}

/** Plate css point → window px for a crop. */
const toWin = (r: Rect, crop: Crop, x: number, y: number) => ({ x: r.x + ((x - crop[0]) * r.w) / crop[2], y: r.y + ((y - crop[1]) * r.h) / crop[3] });

/** Re-render wipe: `b` revealed above the head moving down. */
function drawWipe(c: CanvasRenderingContext2D, a: Plate, b: Plate, r: Rect, k: number, o: { filterB?: string; head?: 'line' | 'print'; crop?: Crop } = {}) {
  const crop = o.crop ?? FULL_CROP;
  if (k < 1) drawPlate(c, a, r, undefined, crop);
  if (k <= 0) return;
  const y = r.y + r.h * k;
  c.save();
  if (k < 1) {
    c.beginPath();
    c.rect(r.x, r.y, r.w, y - r.y);
    c.clip();
  }
  drawPlate(c, b, r, o.filterB, crop);
  c.restore();
  if (k >= 1) return;
  if (o.head === 'print') {
    // print head: a 6 px orange bar with a soft trail + the carriage riding the left edge
    const yy = Math.round(y);
    const g = c.createLinearGradient(0, yy - 28, 0, yy);
    g.addColorStop(0, 'rgba(250,128,35,0)');
    g.addColorStop(1, 'rgba(250,128,35,0.35)');
    c.fillStyle = g;
    c.fillRect(Math.round(r.x), yy - 28, Math.round(r.w), 28);
    c.fillStyle = P.ORANGE;
    c.fillRect(Math.round(r.x), yy - 3, Math.round(r.w), 6);
    c.fillStyle = P.INK;
    c.fillRect(Math.round(r.x) + 6, yy - 14, 34, 28);
    c.fillStyle = P.ORANGE;
    c.fillRect(Math.round(r.x) + 11, yy - 9, 24, 18);
  } else {
    c.fillStyle = P.ORANGE;
    c.fillRect(Math.round(r.x), Math.round(y) - 1, Math.round(r.w), 2);
  }
}

function lastStep(t: number, steps: [number, number][], start: number) {
  let idx = start;
  let prev = start;
  let ts = -1;
  for (const [st, i] of steps)
    if (st <= t + 1e-9) {
      prev = idx;
      idx = i;
      ts = st;
    }
  return { idx, prev, ts };
}

function pageTitle(t: number) {
  if (t >= T.enter1 && t < T.enter2) return `${LAYOUTS[lastStep(t, steps1(), 0).idx][0]} — preview`;
  if (t >= T.enter2 && t < T.enter3) return `slot · ${PARTS[lastStep(t, steps2(), 0).idx][0]}`;
  if (t >= T.montage) return 'Themes — my-docs · yours';
  return 'Themes — my-docs';
}

function drawPageContent(c: CanvasRenderingContext2D, t: number, r: Rect, mode: 'page' | 'montage') {
  const page = plates.get('page');
  if (!page) return;
  if (mode === 'montage') return drawMontage(c, t, r, page);
  if (t >= T.enter1 && t < T.enter2) {
    const s = lastStep(t, steps1(), 0);
    const a = plates.get(LAYOUTS[s.prev][2]) ?? page;
    const b = plates.get(LAYOUTS[s.idx][2]) ?? page;
    drawWipe(c, a, b, r, s.ts < 0 ? 1 : clamp((t - s.ts) / 0.07));
    return;
  }
  if (t >= T.enter2 && t < T.enter3) return drawSlots(c, t, r, page);
  drawPlate(c, page, r);
}

// ── prompt 2: the slot under the cursor, framed by a camera inside the preview ──
const SLOT_FILE: Record<string, string> = {
  all: '@/layouts/docs · 14 files',
  min: 'layouts/docs-min',
  breadcrumb: 'layouts/docs/page/slots/breadcrumb.tsx',
  container: 'layouts/docs/page/slots/container.tsx',
  footer: 'layouts/docs/page/slots/footer.tsx',
  toc: 'layouts/docs/page/slots/toc.tsx',
  'layout-container': 'layouts/docs/slots/container.tsx',
  header: 'layouts/docs/slots/header.tsx',
  sidebar: 'layouts/docs/slots/sidebar.tsx',
};

function fitCrop(b: [number, number, number, number], minW: number, padW = 1.25, padH = 1.15): Crop {
  const cx = b[0] + b[2] / 2;
  const cy = b[1] + b[3] / 2;
  const w = Math.min(PW, Math.max(b[2] * padW, b[3] * padH * (16 / 9), minW));
  const h = (w * 9) / 16;
  return [clamp(cx - w / 2, 0, PW - w), clamp(cy - h / 2, 0, PH - h), w, h];
}

function slotCrop(slot: string): Crop {
  if (slot === 'breadcrumb' && pageBoxes.breadcrumb) return fitCrop(pageBoxes.breadcrumb, 440);
  if (slot === 'toc' && pageBoxes.toc) return fitCrop(pageBoxes.toc, 520);
  if (slot === 'footer') return [330, 448.75, 802, 451.25];
  return FULL_CROP;
}

function drawSlots(c: CanvasRenderingContext2D, t: number, r: Rect, page: Plate) {
  const s = lastStep(t, steps2(), 0);
  const slot = PARTS[s.idx][2];
  const k = s.ts < 0 ? 1 : ease.outCubic(clamp((t - s.ts) / 0.1));
  const crop = lerpCrop(slotCrop(PARTS[s.prev][2]), slotCrop(slot), s.ts < 0 ? 1 : k);
  const minimal = 'grayscale(1) contrast(0.55) brightness(1.5)';
  if (slot === 'min') drawWipe(c, page, page, r, k, { filterB: minimal, crop });
  else drawPlate(c, page, r, undefined, crop);

  const box = (b: [number, number, number, number], i: number, label: string, size: number, dashed = false, sub?: string, below = false) => {
    const p0 = toWin(r, crop, b[0], b[1]);
    const p1 = toWin(r, crop, b[0] + b[2], b[1] + b[3]);
    const x0 = Math.round(Math.max(r.x + 3, p0.x)) + 0.5;
    const y0 = Math.round(Math.max(r.y + 3, p0.y)) + 0.5;
    const x1 = Math.round(Math.min(r.x + r.w - 3, p1.x)) - 0.5;
    const y1 = Math.round(Math.min(r.y + r.h - 3, p1.y)) - 0.5;
    c.save();
    if (dashed) c.setLineDash([10, 6]);
    rectP(c, x0, y0, x1 - x0, y1 - y0, clamp(k * 1.25 - i * 0.06), 3, P.ORANGE);
    c.restore();
    if (k > 0.35) {
      // small boxes: tag above (or below when there's no room), so the outlined element stays readable
      const th = Math.round(size * 1.3) + (sub ? Math.round(size * 0.72 * 1.45) : 0);
      const small = y1 - y0 < 90;
      const ty = below ? y1 + 6 : small ? (y0 - th - 6 >= r.y + 4 ? y0 - th - 6 : y1 + 6) : y0 + 6;
      tag(c, label, x0 + (small ? -1 : 6), ty, { size, sub, clip: r });
    }
  };

  const B = (n: string) => pageBoxes[n];
  if (slot === 'all') {
    // every part at once, small tags; the hero tag says what "All" installs
    const parts: [string, string][] = [['sidebar', 'sidebar'], ['toc', 'toc'], ['breadcrumb', 'breadcrumb'], ['container', 'container']];
    parts.forEach(([n, l], i) => B(n) && box(B(n)!, i, l, 16));
  } else if (slot === 'min') {
    // no box: the whole page drops to bare structure
  } else if (slot === 'footer') {
    box([350, 850, 900, 46], 0, 'SLOT · footer', 32, true, '↓ below the fold · ' + SLOT_FILE.footer);
  } else if (slot === 'header') {
    box([0, 0, PW, 56], 0, 'SLOT · header', 32, true, 'mobile nav · ' + SLOT_FILE.header, true);
  } else if (slot === 'layout-container') {
    box([4, 4, PW - 8, PH - 8], 0, 'SLOT · container', 32, false, SLOT_FILE['layout-container']);
  } else if (B(slot)) {
    box(B(slot)!, 0, `SLOT · ${slot}`, 32, false, SLOT_FILE[slot]);
  }
  // hero caption (top-left) for the whole-layout choices
  if ((slot === 'all' || slot === 'min') && k > 0.2) tag(c, slot === 'all' ? 'ALL · the entire layout' : 'MINIMAL · build your own UI', r.x + 12, r.y + 12, { size: 32, sub: SLOT_FILE[slot], clip: r });
}

/** Orange label chip (pixel font) with an optional INK sub-line (mono). */
function tag(c: CanvasRenderingContext2D, label: string, x: number, y: number, o: { size?: number; sub?: string; subSize?: number; clip?: Rect; subColor?: string } = {}) {
  const size = o.size ?? 16;
  const h = Math.round(size * 1.3);
  c.save();
  c.font = `400 ${size}px ${FONTS.pixel}`;
  c.letterSpacing = '0px';
  const tw = Math.ceil(c.measureText(label).width) + Math.round(size * 0.8);
  let subW = 0;
  const subSize = o.subSize ?? Math.max(13, Math.round(size * 0.7));
  if (o.sub) {
    c.font = `500 ${subSize}px ${FONTS.code}`;
    subW = Math.ceil(c.measureText(o.sub).width) + Math.round(subSize * 0.8);
  }
  const W = Math.max(tw, subW);
  const tx = Math.round(o.clip ? Math.max(o.clip.x + 4, Math.min(x, o.clip.x + o.clip.w - W - 4)) : x);
  const ty = Math.round(o.clip ? Math.min(y, o.clip.y + o.clip.h - h - (o.sub ? Math.round(subSize * 1.45) : 0) - 4) : y);
  c.fillStyle = P.ORANGE;
  c.fillRect(tx, ty, tw, h);
  pixel(c, label, tx + Math.round(size * 0.4), ty + h / 2, { size, color: P.INK });
  if (o.sub) {
    const sh = Math.round(subSize * 1.45);
    c.fillStyle = P.INK;
    c.fillRect(tx, ty + h, subW, sh);
    c.font = `500 ${subSize}px ${FONTS.code}`;
    c.fillStyle = o.subColor ?? P.WHITE;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillText(o.sub, tx + Math.round(subSize * 0.4), ty + h + sh / 2 + 1);
  }
  c.restore();
}

// ── bar 47: "make it yours", one region at a time ────────────────────────────
interface Beat {
  /** cut to the region (before state) */
  pre: number;
  /** the print head sweeps on the hit */
  hit: number;
  from: string;
  to: string;
  crop: Crop;
  n: string;
  label: string;
  src: string;
  what: string;
  /** caption docked bottom-left or bottom-right, away from the change */
  cap: 'l' | 'r';
  /** BEFORE/AFTER chip corner and extra vertical offset (e.g. below the banner) */
  chip: ['l' | 'r', 't' | 'b', number];
}

export function montageBeats(): Beat[] {
  const m = montage();
  const B = (pre: number, hit: number, from: string, to: string, crop: Crop, n: string, label: string, src: string, what: string, cap: Beat['cap'], chip: Beat['chip']): Beat => ({ pre, hit, from, to, crop, n, label, src, what, cap, chip });
  return [
    B(T.montage, T.montage, 'page', 'page', FULL_CROP, '00', 'EJECTED', '@/layouts/docs', '14 files · same look, now your code', 'l', ['r', 't', 0]),
    B(m[0].t - 0.1, m[0].t, 'page', 'v1', [0, 300, 560, 315], '01', 'SIDEBAR', m[0].src, 'tinted card · pill items · filled active', 'r', ['r', 't', 0]),
    B(m[1].t - 0.1, m[1].t, 'v1', 'v2', [1000, 30, 600, 337.5], '02', 'TOC → CLERK', m[1].src, "style: 'clerk'", 'l', ['l', 't', 0]),
    B(m[2].t - 0.1, m[2].t, 'v2', 'v3', [330, 0, 800, 450], '03', 'BANNER', m[2].src, '<Banner /> above the layout', 'l', ['r', 't', 96]),
    B(m[3].t - 0.1, m[3].t, 'v3', 'v4', [360, 104, 720, 405], '04', 'FONT', m[3].src, 'serif · Source Serif 4', 'r', ['r', 't', 0]),
    B(m[4].t - 0.1, m[4].t, 'v4', 'v5', FULL_CROP, '05', 'COLOURS', m[4].src, "@import 'fumadocs-ui/css/purple.css'", 'l', ['r', 'b', 0]),
  ];
}
const FLICKER: [dt: number, key: string, preset: string][] = [
  [0.1, 'v6', 'emerald'],
  [0.2, 'v7', 'ruby'],
  [0.3, 'v8', 'catppuccin'],
];

function drawMontage(c: CanvasRenderingContext2D, t: number, r: Rect, page: Plate) {
  const beats = montageBeats();
  let i = 0;
  for (let j = 0; j < beats.length; j++) if (t >= beats[j].pre - 1e-9) i = j;
  const b = beats[i];
  const pl = (k: string) => (k === 'page' ? page : plates.get(k) ?? page);
  // a cut lands with a small punch-in settle (no blur: it's a rest)
  const settle = 1 + 0.045 * (1 - ease.outCubic(clamp((t - b.pre) / 0.12)));
  const cw = b.crop[2] / settle;
  const ch = b.crop[3] / settle;
  const crop: Crop = [b.crop[0] + (b.crop[2] - cw) / 2, b.crop[1] + (b.crop[3] - ch) / 2, cw, ch];
  let what = b.what;
  if (i === beats.length - 1 && t >= b.hit) {
    // colour flicker on 16ths after the first preset
    let key = b.to;
    let preset = 'purple';
    let at = b.hit;
    for (const [dt, k, p] of FLICKER)
      if (t >= b.hit + dt) {
        key = k;
        preset = p;
        at = b.hit + dt;
      }
    const fi = FLICKER.findIndex((f) => f[1] === key);
    const prevKey = key === b.to ? b.from : fi > 0 ? FLICKER[fi - 1][1] : b.to;
    const prevPreset = key === b.to ? 'ocean' : fi > 0 ? FLICKER[fi - 1][2] : 'purple';
    const k = clamp((t - at) / 0.05);
    drawWipe(c, pl(prevKey), pl(key), r, k, { head: 'print', crop });
    // the caption follows the page: it flips when the head has crossed half the page
    what = `@import 'fumadocs-ui/css/${k >= 0.5 ? preset : prevPreset}.css'`;
  } else {
    const k = t < b.hit ? 0 : clamp((t - b.hit) / 0.085);
    drawWipe(c, pl(b.from), pl(b.to), r, b.from === b.to ? 1 : k, { head: 'print', crop });
  }
  // labels belong to the full-size window: they leave the moment it starts to minimise
  if (t >= T.speed) return;
  drawCaption(c, t, r, b, what);
  if (b.from !== b.to) drawBeforeAfter(c, t, r, b);
}

/** Caption on a solid panel docked to the window's bottom edge: 48 px pixel label, mono source + change. */
function drawCaption(c: CanvasRenderingContext2D, t: number, r: Rect, b: Beat, what: string) {
  const LABEL = 48;
  const lh = Math.round(LABEL * 1.3);
  c.save();
  c.font = `400 ${LABEL}px ${FONTS.pixel}`;
  const labelW = Math.ceil(c.measureText(`${b.n}  ${b.label}`).width) + Math.round(LABEL * 0.8);
  c.font = `500 26px ${FONTS.code}`;
  const srcW = Math.ceil(c.measureText(b.src).width);
  c.font = `500 24px ${FONTS.code}`;
  const whatW = Math.ceil(c.measureText(what).width);
  const pad = 18;
  const pw = Math.max(labelW, srcW, whatW) + pad * 2 + 6;
  const ph = lh + 92;
  const x0 = Math.round(b.cap === 'l' ? r.x : r.x + r.w - pw);
  const y0 = Math.round(r.y + r.h - ph);
  const pop = ease.outBack(clamp((t - b.pre) / 0.1));
  c.translate(x0, y0 + ph);
  c.scale(1, pop);
  c.translate(-x0, -(y0 + ph));
  c.fillStyle = 'rgba(10,10,11,0.95)';
  c.fillRect(x0, y0, pw, ph);
  c.fillStyle = P.ORANGE;
  c.fillRect(x0, y0, 6, ph);
  tag(c, `${b.n}  ${b.label}`, x0 + 6 + pad - 4, y0 + 14, { size: LABEL });
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.font = `500 26px ${FONTS.code}`;
  c.fillStyle = P.WHITE;
  c.fillText(b.src, x0 + 6 + pad, y0 + 14 + lh + 22);
  c.font = `500 24px ${FONTS.code}`;
  c.fillStyle = P.SKY;
  c.fillText(what, x0 + 6 + pad, y0 + 14 + lh + 56);
  c.restore();
}

/** BEFORE → AFTER chip (48 px pixel font, readable at phone size); flips on the print-head hit. */
function drawBeforeAfter(c: CanvasRenderingContext2D, t: number, r: Rect, b: Beat) {
  const after = t >= b.hit;
  const label = after ? 'AFTER' : 'BEFORE';
  const SIZE = 48;
  const h = Math.round(SIZE * 1.3);
  c.save();
  c.font = `400 ${SIZE}px ${FONTS.pixel}`;
  const w = Math.ceil(c.measureText(label).width) + 34 + 36;
  const [sx, sy, dy] = b.chip;
  const x = Math.round(sx === 'r' ? r.x + r.w - w - 16 : r.x + 16);
  const y = Math.round((sy === 't' ? r.y + 16 : r.y + r.h - h - 16) + dy);
  // a 2-frame pop when it flips
  const pop = after ? 1 + 0.12 * (1 - clamp((t - b.hit) / 0.05)) : 1;
  c.translate(x + w / 2, y + h / 2);
  c.scale(pop, pop);
  c.translate(-(x + w / 2), -(y + h / 2));
  c.fillStyle = after ? P.ORANGE : '#2B2E36';
  c.fillRect(x, y, w, h);
  if (!after) {
    c.strokeStyle = P.WHITE;
    c.lineWidth = 2;
    c.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  c.fillStyle = after ? P.INK : P.WHITE;
  c.fillRect(x + 18, Math.round(y + h / 2 - 7), 14, 14);
  pixel(c, label, x + 18 + 14 + 16, y + h / 2, { size: SIZE, color: after ? P.INK : P.WHITE });
  c.restore();
}

// ── terminal ────────────────────────────────────────────────────────────────
const VECTOR = new Set([...'│┌└┐┘─◆◇●○❯◻◼']);

function drawSymbol(c: CanvasRenderingContext2D, ch: string, x: number, y: number, color: string) {
  const cx = x + CELL_W / 2;
  const cy = y + CELL_H / 2;
  c.save();
  c.fillStyle = color;
  c.strokeStyle = color;
  c.lineWidth = 1.5;
  switch (ch) {
    case '│':
      c.fillRect(Math.round(cx) - 1, y, 1.5, CELL_H);
      break;
    case '┌':
      c.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 1.5, CELL_H / 2 + 1);
      c.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, CELL_W / 2 + 1, 1.5);
      break;
    case '└':
      c.fillRect(Math.round(cx) - 1, y, 1.5, CELL_H / 2);
      c.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, CELL_W / 2 + 1, 1.5);
      break;
    case '┐':
      c.fillRect(x, Math.round(cy) - 1, CELL_W / 2 + 0.5, 1.5);
      c.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 1.5, CELL_H / 2 + 1);
      break;
    case '┘':
      c.fillRect(x, Math.round(cy) - 1, CELL_W / 2 + 0.5, 1.5);
      c.fillRect(Math.round(cx) - 1, y, 1.5, CELL_H / 2);
      break;
    case '─':
      c.fillRect(x, Math.round(cy) - 1, CELL_W, 1.5);
      break;
    case '◆':
    case '◇': {
      const s = 5.5;
      c.beginPath();
      c.moveTo(cx, cy - s);
      c.lineTo(cx + s, cy);
      c.lineTo(cx, cy + s);
      c.lineTo(cx - s, cy);
      c.closePath();
      if (ch === '◆') c.fill();
      else c.stroke();
      break;
    }
    case '●':
      c.beginPath();
      c.arc(cx, cy, 4.5, 0, Math.PI * 2);
      c.fill();
      break;
    case '○':
      c.beginPath();
      c.arc(cx, cy, 4, 0, Math.PI * 2);
      c.stroke();
      break;
    case '◻':
      c.strokeRect(Math.round(cx - 4.5) + 0.5, Math.round(cy - 4.5) + 0.5, 9, 9);
      break;
    case '◼':
      c.fillRect(Math.round(cx - 5), Math.round(cy - 5), 10, 10);
      break;
    case '❯':
      c.beginPath();
      c.moveTo(cx - 3, cy - 5);
      c.lineTo(cx + 3, cy);
      c.lineTo(cx - 3, cy + 5);
      c.lineWidth = 2;
      c.stroke();
      break;
  }
  c.restore();
}

function drawRow(c: CanvasRenderingContext2D, row: Row, x0: number, y0: number) {
  let col = 0;
  c.textBaseline = 'middle';
  for (const sp of row.spans) {
    const chars = [...sp.s];
    if (sp.chip && chars.length) {
      c.fillStyle = P.CHIP;
      c.fillRect(Math.round(x0 + col * CELL_W - 6), y0 + 2, chars.length * CELL_W + 12, CELL_H - 4);
    }
    c.font = `${sp.b ? 700 : 400} 20px ${FONTS.code}`;
    c.fillStyle = sp.c;
    let run = '';
    let runCol = col;
    const flush = () => {
      if (run) c.fillText(run, x0 + runCol * CELL_W, y0 + CELL_H / 2 + 1);
      run = '';
    };
    for (const ch of chars) {
      if (VECTOR.has(ch) || ch.charCodeAt(0) > 0x7e) {
        flush();
        if (VECTOR.has(ch)) drawSymbol(c, ch, x0 + col * CELL_W, y0, sp.c);
        else c.fillText(ch, x0 + col * CELL_W, y0 + CELL_H / 2 + 1);
        col++;
        runCol = col;
      } else {
        if (!run) runCol = col;
        run += ch;
        col++;
      }
    }
    flush();
  }
}

function drawTerminal(c: CanvasRenderingContext2D, d: Desk) {
  const r = d.term.rect;
  const st: TermState = d.term.state;
  c.fillStyle = P.TERM_BG;
  c.fillRect(r.x, r.y, r.w, r.h);
  if (st.cleared) return;
  c.save();
  c.beginPath();
  c.rect(r.x, r.y, r.w, r.h);
  c.clip();
  c.letterSpacing = '0px';
  c.textAlign = 'left';
  const x0 = r.x + TERM_PAD;
  st.rows.forEach((row, i) => {
    const y = r.y + TERM_PAD + (i - st.scroll) * CELL_H;
    if (y < r.y - CELL_H || y > r.y + r.h) return;
    drawRow(c, row, x0, Math.round(y));
  });
  c.restore();
}

// ── the orange figure ───────────────────────────────────────────────────────
function drawRing(c: CanvasRenderingContext2D, f: Figure) {
  if (f.ring <= 0) return;
  c.save();
  c.globalAlpha *= f.ring;
  c.strokeStyle = P.ORANGE;
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(f.ringX, f.ringY, f.ringR, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

function drawFigure(c: CanvasRenderingContext2D, f: Figure) {
  if (!f.visible || f.kind === 'none') return;
  if (f.smear && f.smear.k > 0 && !f.from) {
    // a one-beat smear from the previous row: lands exactly on the hit, the trail fades in 3 frames
    const s = f.smear;
    const len = Math.hypot(f.x - s.x, f.y - s.y);
    if (len > 1) {
      c.save();
      c.globalAlpha *= 0.55 * s.k;
      c.strokeStyle = P.ORANGE;
      c.lineCap = 'round';
      c.lineWidth = 7 * (0.6 + 0.4 * s.k);
      c.beginPath();
      c.moveTo(f.x + (s.x - f.x) * s.k, f.y + (s.y - f.y) * s.k);
      c.lineTo(f.x, f.y);
      c.stroke();
      c.restore();
    }
  }
  const sq = 1 - 0.28 * f.squash;
  const shape = (kind: Figure['kind']) => {
    switch (kind) {
      case 'dot':
        return { w: 14, h: 14, r: 7 };
      case 'block':
        return { w: CELL_W, h: CELL_H, r: 0 };
      case 'radio':
        return { w: 10, h: 10, r: 5 };
      case 'moon':
        return { w: 12, h: 12, r: 6 };
      default:
        return { w: 0, h: 0, r: 0 };
    }
  };
  const a = shape(f.from ?? f.kind);
  const b = shape(f.kind);
  const k = f.from ? f.morph : 1;
  const w = (a.w + (b.w - a.w) * k) * sq;
  const h = (a.h + (b.h - a.h) * k) * sq;
  const rr = a.r + (b.r - a.r) * k;
  if (f.kind === 'moon' && k > 0.6) {
    drawMoonPhase(c, f.x, f.y, 6, f.frame);
    return;
  }
  if (f.kind === 'dot' && !f.from) {
    drawDot(c, f.x, f.y, 7 * sq);
    return;
  }
  c.fillStyle = P.ORANGE;
  c.beginPath();
  if (rr > 0.5) c.roundRect(f.x - w / 2, f.y - h / 2, w, h, Math.min(rr, w / 2, h / 2));
  else c.rect(Math.round(f.x - w / 2), Math.round(f.y - h / 2), Math.round(w), Math.round(h));
  c.fill();
}

/** Clack spinner frames ◒ ◐ ◓ ◑ as moon phases. */
function drawMoonPhase(c: CanvasRenderingContext2D, x: number, y: number, r: number, frame: number) {
  const ang = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][frame % 4];
  c.save();
  c.strokeStyle = P.ORANGE;
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = P.ORANGE;
  c.beginPath();
  c.arc(x, y, r, ang - Math.PI / 2, ang + Math.PI / 2);
  c.closePath();
  c.fill();
  c.restore();
}

// ── boxed word ──────────────────────────────────────────────────────────────
function drawBoxedWord(c: CanvasRenderingContext2D, t: number) {
  const keys = TYPING.slice(-9);
  const n = keys.filter(([tt]) => tt <= t + 1e-9).length;
  if (n === 0 || t >= T.enter3 + 0.12) return;
  const word = 'CUSTOMIZE';
  const size = 30;
  const gl = glyphs(c, word, { font: 'wide', size, tracking: 0.3 });
  const textW = gl.width - size * 0.3;
  const padX = size * 1.1;
  const padY = size * 0.7;
  const bw = textW + padX * 2;
  const bh = size + padY * 2;
  const cx = 960;
  const cy = 66;
  const x = Math.round(cx - bw / 2) + 0.5;
  const y = Math.round(cy - bh / 2) + 0.5;
  const out = ease.inCubic(seg(t, T.enter3, T.enter3 + 0.12));
  c.save();
  if (out > 0) {
    c.translate(cx, cy);
    c.scale(1 + out * 0.3, 1 - out);
    c.translate(-cx, -cy);
  }
  const lastKey = keys[n - 1][0];
  const pop = 1 - clamp((t - lastKey) / 0.1);
  const enterFlash = n === 9 && t >= T.enter1 ? Math.max(0, 1 - (t - T.enter1) / 0.14) : 0;
  if (enterFlash > 0) {
    c.fillStyle = P.ORANGE;
    c.globalAlpha = enterFlash;
    c.fillRect(x, y, bw, bh);
    c.globalAlpha = 1;
  }
  rectP(c, x, y, bw, bh, n / 9, 1.5, P.INK);
  if (n === 9) {
    const tk = ease.outCubic(seg(t, lastKey, lastKey + 0.12));
    line(c, x - size * 0.9 * tk, cy, x - size * 0.25, cy, 1.5, P.INK);
    line(c, x + bw + size * 0.25, cy, x + bw + size * 0.9 * tk, cy, 1.5, P.INK);
  }
  c.font = `400 ${size}px ${FONTS.wide}`;
  c.letterSpacing = '0px';
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillStyle = P.INK;
  for (let i = 0; i < n; i++) {
    const gph = gl.glyphs[i];
    const lift = i === n - 1 ? pop * 6 : 0;
    c.fillText(gph.ch, x + padX + gph.x, cy + 1 - lift);
  }
  c.restore();
}

// ── desktop ─────────────────────────────────────────────────────────────────
export function drawDesktop(c: CanvasRenderingContext2D, t: number, d: Desk) {
  applyView(c, d.view);
  ICONS.forEach((ic, i) => {
    // icons step off the desktop when the engine takes the stage
    const out = ease.inCubic(seg(t, T.enter3 + i * 0.03, T.enter3 + 0.12 + i * 0.03));
    const k = d.iconsIn[i] * (1 - out);
    if (k <= 0) return;
    c.save();
    c.translate(-out * 60, 0);
    drawIcon(c, ic.kind, ic.x, ic.y, ic.label, { scale: 1, alpha: clamp(k * 2), selected: ic.kind === 'term' ? d.iconSel : 0 });
    c.restore();
  });

  const pg = d.page;
  const drawPage = () => {
  if (pg.visible) {
    const r = pg.rect;
    const maximised = t < T.click;
    if (t >= T.swapPlate) {
      c.save();
      if (t < T.click) c.globalAlpha = seg(t, T.swapPlate, T.click);
      c.beginPath();
      c.rect(r.x, r.y, r.w, r.h);
      c.clip();
      drawPageContent(c, t, r, pg.mode);
      c.restore();
    }
    if (!maximised || d.titleRevealed > 0) {
      // the printed sheet grows its chrome as it lands (73.6)
      const land = pg.mode === 'montage' ? ease.outCubic(seg(t, T.montage, T.montage + 0.1)) : 1;
      drawChrome(c, r, {
        title: pageTitle(t),
        active: t < T.termShown || pg.mode === 'montage',
        over: maximised ? d.titleRevealed : pg.mode === 'montage' ? 1 - land : pg.over,
        shadow: maximised ? 0 : land,
        pressed: pg.pressed ? 'restore' : null,
        restoreGlyph: maximised,
        alpha: land,
      });
    }
  }
  pg.zoom.forEach((r, i) => {
    c.save();
    c.globalAlpha *= 0.85 - 0.25 * i;
    zoomRects(c, [rect(r.x - 2, r.y - 32, r.w + 4, r.h + 34)], P.INK, 1);
    c.restore();
  });
  };

  // terminal window (own transform: full, prompt framing, mini, minimised, restored)
  const drawTerm = () => {
  const xf = d.term.xf;
  if (d.term.visible) {
    c.save();
    c.translate(xf.dx, xf.dy);
    c.scale(xf.s, xf.s);
    c.translate(-TERM_ORIGIN.x, -TERM_ORIGIN.y);
    drawTerminal(c, d);
    if (d.figure.kind !== 'dot' || d.figure.from) {
      // terminal-bound forms of the figure stay inside the screen (the dive comes from outside)
      const inside = d.figure.from !== 'dot';
      c.save();
      if (inside) {
        const r = d.term.rect;
        c.beginPath();
        c.rect(r.x, r.y, r.w, r.h);
        c.clip();
      }
      drawFigure(c, d.figure);
      c.restore();
    }
    c.restore();
    // the chrome lives in desktop space at an integer pixel scale (crisp pixel font and buttons)
    const r = d.term.rect;
    const cr = rect(xf.dx + (r.x - TERM_ORIGIN.x) * xf.s, xf.dy + (r.y - TERM_ORIGIN.y) * xf.s, r.w * xf.s, r.h * xf.s);
    drawChrome(c, cr, { title: 'zsh — my-docs', active: d.page.mode !== 'montage' || t >= T.speed, u: chromeScale(xf.s) });
  }
  if (d.term.zoom.length) zoomRects(c, d.term.zoom, P.INK, 1);
  };

  // bars 43–44: the preview window overlaps the big terminal; otherwise the terminal is on top
  if (pg.onTop) {
    drawTerm();
    drawPage();
  } else {
    drawPage();
    drawTerm();
  }

  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  drawBoxedWord(c, t);
  c.restore();

  // taskbar
  const tabs: { label: string; active?: boolean }[] = [{ label: 'Themes — my-docs', active: (t < T.termShown && t >= T.restoreEnd - 0.1) || (pg.mode === 'montage' && pg.visible) }];
  if (t >= T.termShown) tabs.push({ label: 'zsh — my-docs', active: d.term.visible && pg.mode !== 'montage' });
  if (t >= T.enter3) tabs.push({ label: 'DOCUMENT ENGINE', active: t < T.montage });
  const secs = Math.max(0, Math.floor((t - 60.0) / 0.4));
  const clock = `18:04:${String(secs % 60).padStart(2, '0')}`;
  const build = t >= T.speed ? 100 * ease.inQuad(seg(t, T.speed, T.slam)) : null;
  drawTaskbar(c, t, { y: d.taskbarY, tabs, clock, statusOn: Math.floor(t / 0.2) % 2 === 0, build });

  drawRing(c, d.figure);
  if (d.figure.kind === 'dot' && !d.figure.from) drawFigure(c, d.figure);
  c.setTransform(1, 0, 0, 1, 0, 0);

  // the tape stop: the desktop goes dark around the terminal, so the 76.4 stop only clears text
  const dim = ease.inOutQuad(seg(t, T.slam + 0.05, T.stop - 0.03));
  if (dim > 0) {
    const v = d.view;
    const xf = d.term.xf;
    const r = d.term.rect;
    const X = (x: number) => v.s * (xf.dx + (x - TERM_ORIGIN.x) * xf.s - v.cx) + v.qx;
    const Y = (y: number) => v.s * (xf.dy + (y - TERM_ORIGIN.y) * xf.s - v.cy) + v.qy;
    c.save();
    c.globalAlpha = dim;
    c.fillStyle = P.INK;
    c.beginPath();
    c.rect(0, 0, 1920, 1080);
    c.rect(X(r.x), Y(r.y), X(r.x + r.w) - X(r.x), Y(r.y + r.h) - Y(r.y));
    c.fill('evenodd');
    c.restore();
  }
}
