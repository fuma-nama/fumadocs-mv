import { clamp, ease, lerp, seg, TAU } from '../../engine/anim';
import { brackets, measure, text } from '../../engine/draw2d';
import { bt, fr, KEY, ringLocalY, T } from './k';
import { docsPage, type Block } from './page';
import { hasSanityPlates, plates } from './plates';
import { Route } from './route';
import type { StationCtx, StationImpl } from './station';
import { backlight, calloutIcon, card, chevronDown, FD, mono, rr, screenGlass, SYN, toks, ui } from './ui';
import { hexA } from './world';

const K = KEY.sanity;
/** linework / labels over the lit rose field */
const A = '#0A0A0B';
const b = (n: number) => bt(T.san, n);

const S = { x: 96, y: 180, w: 640, h: 650 }; // studio
const LIVE = { x: 808, y: 470 };
const PV = { x: 880, y: 180, w: 940, h: 650 }; // preview (1:1 with the page plate, css x 520 →)
const TITLE = 'Sanity';
const tType = b(2);
const CPS = 0.034;
const typed = (t: number) => (t < tType ? 0 : clamp(Math.floor((t - tType) / CPS) + 1, 0, TITLE.length));

/** Portable Text rows of the document = the real page's blocks (plates: integrations/sanity/blocks). */
interface PT {
  kind: string;
  badge: string;
  label: string;
  chip: string;
  /** css bbox in the page plate */
  css: [number, number, number, number];
  /** lands on the chop hits */
  hit: number;
}
const HITS = [84.0, 84.3, 84.6, 84.8, 85.0, 85.2, 85.8, 85.9].map(fr);
const PTS: PT[] = [
  { kind: 'p', badge: '¶', label: 'Write in Sanity Studio, publish with Fumadocs…', chip: '_type: "block", style: "normal"', css: [542, 265, 836, 56], hit: HITS[0] },
  { kind: 'h2', badge: 'H2', label: 'Content Source', chip: '_type: "block", style: "h2"', css: [542, 369, 836, 32], hit: HITS[1] },
  { kind: 'p', badge: '¶', label: 'Create a source from your Sanity client…', chip: '_type: "block", style: "normal"', css: [542, 425, 836, 28], hit: HITS[2] },
  { kind: 'code', badge: '</>', label: 'lib/source.ts', chip: '_type: "code", language: "ts"', css: [542, 473, 836, 216.5], hit: HITS[3] },
  { kind: 'callout', badge: 'i', label: 'Callout · Live preview', chip: '_type: "callout", type: "info"', css: [542, 705.5, 836, 74.6], hit: HITS[4] },
  { kind: 'h2', badge: 'H2', label: 'Blocks', chip: '_type: "block", style: "h2"', css: [542, 828, 836, 32], hit: HITS[5] },
  { kind: 'p', badge: '¶', label: 'Headings, paragraphs, code and callouts…', chip: '_type: "block", style: "normal"', css: [542, 884, 836, 28], hit: HITS[6] },
  { kind: 'cards', badge: '▦', label: 'Cards · 2 cards', chip: '_type: "cards"', css: [542, 932, 836, 116], hit: HITS[7] },
];
const FLY = 0.2;

// preview scroll: keep the newest block in view (monotonic targets, eased per arrival)
const VIEW_TOP = 26, VIEW_H = PV.h;
const TARGETS = (() => {
  let m = 0;
  return PTS.map((p) => (m = Math.max(m, p.css[1] + p.css[3] + 24 - (VIEW_TOP + VIEW_H))));
})();
function scrollAt(t: number) {
  let s = 0, prev = 0;
  PTS.forEach((p, i) => {
    s += (TARGETS[i] - prev) * ease.inOutCubic(seg(t, p.hit - FLY, p.hit + 0.05));
    prev = TARGETS[i];
  });
  return s;
}
const pvX = (x: number) => PV.x + (x - 520);
const pvY = (y: number, sc: number) => PV.y + (y - VIEW_TOP - sc);

const tIn = T.san - 0.02, tOut = 86.12;
const xe = LIVE.x, xx = LIVE.x + 40;
const route = new Route([
  { t0: tIn, t1: T.san + 0.08, pts: [[xe, ringLocalY(xe)], [LIVE.x, LIVE.y]], e: ease.outCubic },
  { t0: tOut - 0.12, t1: tOut, pts: [[LIVE.x, LIVE.y], [LIVE.x, 720], [xx, 760], [xx, ringLocalY(xx)]], e: ease.inCubic },
]);

const slam = (t: number) => ease.outExpo(clamp((t - (T.san - 0.06)) / 0.2));

// ── studio (a crafted structured-content editor; generic, no product chrome) ────────
const SX0 = S.x + 76; // content column x
const SFW = S.w - 76 - 24; // content column width
/** Portable Text rows inside the editor: [y (local), height] — each block rendered as itself. */
const ROW_H: Record<string, number> = { p: 26, h2: 32, code: 40, callout: 40, cards: 38 };
const ED = { y: S.y + 288, toolbar: 34 }; // editor box top, toolbar height
const ROWS: { y: number; h: number }[] = (() => {
  let y = ED.y + ED.toolbar + 10;
  return PTS.map((pt) => {
    const h = ROW_H[pt.kind];
    const r = { y, h };
    y += h + 4;
    return r;
  });
})();
const ED_H = ROWS[ROWS.length - 1].y + ROWS[ROWS.length - 1].h + 10 - ED.y;
/** where a block's chip leaves the studio */
const rowOut = (i: number): [number, number] => [S.x + S.w - 30, ROWS[i].y + ROWS[i].h / 2];

function railIcon(c: CanvasRenderingContext2D, kind: number, x: number, y: number, col: string) {
  c.save();
  c.strokeStyle = col;
  c.lineWidth = 1.6;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.beginPath();
  if (kind === 0) {
    // documents (stack)
    c.roundRect(x + 4, y + 2, 12, 15, 2);
    c.moveTo(x + 7, y + 7);
    c.lineTo(x + 13, y + 7);
    c.moveTo(x + 7, y + 11);
    c.lineTo(x + 13, y + 11);
  } else if (kind === 1) {
    // image
    c.roundRect(x + 2, y + 3, 16, 13, 2);
    c.moveTo(x + 4, y + 14);
    c.lineTo(x + 9, y + 9);
    c.lineTo(x + 12, y + 12);
    c.lineTo(x + 14, y + 10);
    c.lineTo(x + 17, y + 13);
  } else if (kind === 2) {
    // search
    c.arc(x + 9, y + 9, 5.5, 0, TAU);
    c.moveTo(x + 13, y + 13);
    c.lineTo(x + 17, y + 17);
  } else {
    // settings (sliders)
    for (let i = 0; i < 3; i++) {
      c.moveTo(x + 3, y + 5 + i * 5);
      c.lineTo(x + 17, y + 5 + i * 5);
    }
  }
  c.stroke();
  if (kind === 3) {
    c.fillStyle = col;
    for (const [dx, dy] of [[7, 5], [13, 10], [6, 15]]) {
      c.beginPath();
      c.arc(x + dx, y + dy, 2, 0, TAU);
      c.fill();
    }
  }
  c.restore();
}

function toolGlyph(c: CanvasRenderingContext2D, g: string, x: number, y: number, col: string) {
  if (g === 'link') {
    c.save();
    c.strokeStyle = col;
    c.lineWidth = 1.5;
    c.beginPath();
    c.roundRect(x, y - 6, 9, 6, 3);
    c.roundRect(x + 5, y - 2, 9, 6, 3);
    c.stroke();
    c.restore();
    return 14;
  }
  if (g === 'ul') {
    c.save();
    c.fillStyle = col;
    for (let i = 0; i < 3; i++) {
      c.fillRect(x, y - 7 + i * 5, 2, 2);
      c.fillRect(x + 4, y - 7 + i * 5, 10, 1.5);
    }
    c.restore();
    return 14;
  }
  return ui(c, g, x, y, g === 'B' ? 14 : 13.5, { weight: g === 'B' ? 700 : 400, italic: g === 'I', color: col });
}

function ptRow(c: CanvasRenderingContext2D, i: number, x: number, y: number, w: number) {
  const pt = PTS[i];
  const cy = y + ROW_H[pt.kind] / 2;
  switch (pt.kind) {
    case 'h2':
      ui(c, pt.label, x, cy + 6, 17, { weight: 600 });
      return;
    case 'p':
      ui(c, pt.label, x, cy + 5, 13.5, { color: FD.mutedFg });
      return;
    case 'code': {
      card(c, x, y + 2, w, 36, { r: 7, fill: '#0F0F11' });
      mono(c, 'lib/source.ts', x + 10, y + 16, 10.5, { color: FD.mutedFg });
      toks(c, [['import ', SYN.kw], ['{ createSanitySource } ', SYN.plain], ['from ', SYN.kw], ["'@fumadocs/sanity'", SYN.str]], x + 10, y + 32, 11, 'code');
      return;
    }
    case 'callout': {
      card(c, x, y + 2, w, 36, { r: 8, fill: FD.card });
      rr(c, x + 4, y + 9, 2, 22, 1);
      c.fillStyle = FD.info + '80';
      c.fill();
      calloutIcon(c, 'info', x + 12, y + 11, 16);
      ui(c, 'Live preview', x + 36, y + 20, 12.5, { weight: 500 });
      ui(c, 'Edits show up as you type.', x + 36, y + 33, 11.5, { color: FD.mutedFg });
      mono(c, 'callout · info', x + w - 10, y + 24, 10.5, { color: 'rgba(179,179,179,0.5)', align: 'right' });
      return;
    }
    case 'cards': {
      const cw = (w - 8) / 2;
      for (const [j, title] of ['Structured content', 'Live preview'].entries()) {
        card(c, x + j * (cw + 8), y + 2, cw, 34, { r: 7, fill: FD.card });
        ui(c, title, x + j * (cw + 8) + 10, y + 23, 12, { weight: 500 });
      }
      return;
    }
  }
}

function studio(c: CanvasRenderingContext2D, t: number) {
  const p = slam(t);
  c.save();
  c.translate(-(1 - p) * 520, 0);
  backlight(c, S.x, S.y, S.w, S.h, 16);
  card(c, S.x, S.y, S.w, S.h, { r: 16, fill: '#0F0F11' });
  // ── rail ──
  c.fillStyle = FD.border;
  c.fillRect(S.x + 52, S.y + 1, 1, S.h - 2);
  for (let i = 0; i < 4; i++) {
    const iy = S.y + 22 + i * 44;
    if (i === 0) {
      rr(c, S.x + 9, iy - 6, 34, 32, 8);
      c.fillStyle = hexA(K, 0.16);
      c.fill();
      c.fillStyle = K;
      c.fillRect(S.x + 1, iy - 2, 2.5, 24);
    }
    railIcon(c, i, S.x + 16, iy, i === 0 ? K : 'rgba(179,179,179,0.55)');
  }
  // ── document header ──
  const n = typed(t);
  const title = n > 0 ? TITLE.slice(0, n) : 'Untitled';
  ui(c, 'Docs', SX0, S.y + 30, 12, { color: FD.mutedFg });
  ui(c, '›', SX0 + 34, S.y + 30, 12, { color: FD.mutedFg });
  ui(c, title, SX0, S.y + 54, 19, { weight: 600, color: n > 0 ? FD.fg : FD.mutedFg });
  // presence (generic initials)
  for (const [j, [ini, col]] of ([['A', '#7C5CFF'], ['K', '#2B9E8F']] as [string, string][]).entries()) {
    const ax = S.x + S.w - 262 + j * 18, ay = S.y + 38;
    c.beginPath();
    c.arc(ax, ay, 12, 0, TAU);
    c.fillStyle = col;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = '#0F0F11';
    c.stroke();
    ui(c, ini, ax, ay + 4.5, 11, { weight: 600, align: 'center', color: '#FFFFFF' });
  }
  // status pill + publish
  rr(c, S.x + S.w - 220, S.y + 24, 86, 28, 14);
  c.fillStyle = hexA(K, 0.14);
  c.fill();
  c.fillStyle = K;
  c.beginPath();
  c.arc(S.x + S.w - 205, S.y + 38, 4, 0, TAU);
  c.fill();
  ui(c, 'Draft', S.x + S.w - 194, S.y + 43, 12.5, { weight: 500, color: K });
  rr(c, S.x + S.w - 124, S.y + 22, 100, 32, 8);
  c.fillStyle = FD.primary;
  c.fill();
  ui(c, 'Publish', S.x + S.w - 112, S.y + 43, 13, { weight: 500, color: FD.primaryFg });
  mono(c, '⌘P', S.x + S.w - 50, S.y + 43, 11, { color: 'rgba(23,23,23,0.55)' });
  // tabs
  const tabY = S.y + 92;
  let tx = SX0;
  for (const [j, tb] of ['Content', 'Preview', 'History'].entries()) {
    const w = ui(c, tb, tx, tabY, 13, { weight: 500, color: j === 0 ? FD.fg : FD.mutedFg });
    if (j === 0) {
      c.fillStyle = K;
      c.fillRect(tx, tabY + 9, w, 2);
    }
    tx += w + 24;
  }
  c.fillStyle = FD.border;
  c.fillRect(S.x + 53, tabY + 11, S.w - 54, 1);
  // ── fields ──
  const focusT = seg(t, tType - 0.1, tType) * (1 - seg(t, tType + 0.3, tType + 0.4));
  const fy = S.y + 128;
  ui(c, 'Title', SX0, fy, 12.5, { weight: 500 });
  ui(c, 'Shown as the page heading', SX0 + 36, fy, 11.5, { color: 'rgba(179,179,179,0.55)' });
  rr(c, SX0, fy + 9, SFW, 38, 8);
  c.fillStyle = FD.secondary;
  c.fill();
  c.lineWidth = focusT > 0 ? 1.5 : 1;
  c.strokeStyle = focusT > 0 ? hexA(K, 0.9 * focusT) : FD.border;
  c.stroke();
  const tw = ui(c, n > 0 ? TITLE.slice(0, n) : '', SX0 + 12, fy + 34, 16);
  if (focusT > 0 && Math.floor(t * 8) % 2 === 0) {
    c.fillStyle = K;
    c.fillRect(SX0 + 14 + tw, fy + 18, 2, 20);
  }
  mono(c, `${n}/80`, SX0 + SFW - 12, fy + 33, 11, { color: 'rgba(179,179,179,0.5)', align: 'right' });
  const sy = fy + 66;
  ui(c, 'Slug', SX0, sy, 12.5, { weight: 500 });
  rr(c, SX0, sy + 9, SFW - 104, 32, 8);
  c.fillStyle = FD.secondary;
  c.fill();
  c.lineWidth = 1;
  c.strokeStyle = FD.border;
  c.stroke();
  const pw = mono(c, '/docs/', SX0 + 12, sy + 30, 13, { color: 'rgba(179,179,179,0.5)' });
  if (n >= TITLE.length) mono(c, 'sanity', SX0 + 12 + pw, sy + 30, 13);
  rr(c, SX0 + SFW - 94, sy + 9, 94, 32, 8);
  c.fillStyle = FD.secondary;
  c.fill();
  c.stroke();
  ui(c, 'Generate', SX0 + SFW - 80, sy + 30, 12.5, { weight: 500 });
  // ── body: Portable Text editor ──
  ui(c, 'Body', SX0, ED.y - 12, 12.5, { weight: 500 });
  ui(c, 'Portable Text', SX0 + 38, ED.y - 12, 11.5, { color: 'rgba(179,179,179,0.55)' });
  mono(c, `${PTS.length} blocks`, SX0 + SFW, ED.y - 12, 11, { color: 'rgba(179,179,179,0.5)', align: 'right' });
  rr(c, SX0, ED.y, SFW, ED_H, 10);
  c.fillStyle = FD.secondary;
  c.fill();
  c.lineWidth = 1;
  c.strokeStyle = FD.border;
  c.stroke();
  // toolbar
  let gx = SX0 + 12;
  rr(c, gx - 4, ED.y + 6, 78, 22, 6);
  c.fillStyle = 'rgba(255,255,255,0.05)';
  c.fill();
  ui(c, 'Normal', gx + 2, ED.y + 21, 12.5);
  chevronDown(c, gx + 52, ED.y + 9, 14, FD.mutedFg);
  gx += 92;
  for (const g of ['B', 'I', '</>', 'link', 'ul']) gx += toolGlyph(c, g, gx, ED.y + 22, FD.mutedFg) + 18;
  ui(c, '+ Insert', SX0 + SFW - 74, ED.y + 21, 12.5, { color: FD.mutedFg });
  c.fillStyle = FD.border;
  c.fillRect(SX0, ED.y + ED.toolbar, SFW, 1);
  // blocks
  PTS.forEach((pt, i) => {
    const r = ROWS[i];
    const dep = pt.hit - FLY;
    const sent = seg(t, dep - 0.05, dep);
    const hl = sent * (1 - seg(t, pt.hit + 0.15, pt.hit + 0.4));
    if (hl > 0) {
      rr(c, SX0 + 4, r.y - 3, SFW - 8, r.h + 6, 6);
      c.fillStyle = hexA(K, 0.16 * hl);
      c.fill();
      c.fillStyle = hexA(K, hl);
      c.fillRect(SX0 + 4, r.y - 3, 2.5, r.h + 6);
    }
    // gutter: drag handle + type marker
    c.fillStyle = 'rgba(179,179,179,0.35)';
    for (let d = 0; d < 3; d++) {
      c.fillRect(SX0 + 12, r.y + r.h / 2 - 5 + d * 4, 2, 2);
      c.fillRect(SX0 + 16, r.y + r.h / 2 - 5 + d * 4, 2, 2);
    }
    mono(c, pt.badge, SX0 + 38, r.y + r.h / 2 + 4, 10.5, { color: sent > 0 ? K : 'rgba(179,179,179,0.55)', align: 'center' });
    ptRow(c, i, SX0 + 58, r.y, SFW - 58 - 36);
    if (t > pt.hit) mono(c, '✓', SX0 + SFW - 18, r.y + r.h / 2 + 4, 12, { color: K, align: 'center' });
  });
  c.restore();
  c.save();
  c.translate(-(1 - p) * 520, 0);
  screenGlass(c, S.x, S.y, S.w, S.h, 16);
  c.restore();
}

const BLOCKS: Block[] = [
  { k: 'h1', text: TITLE },
  { k: 'p', parts: ['Write in Sanity Studio, publish with Fumadocs.'] },
  { k: 'h2', text: 'Content Source' },
  { k: 'p', parts: ['Create a source from your Sanity client.'] },
  { k: 'code', title: 'lib/source.ts', lines: [[['import ', SYN.kw], ['{ createSanitySource } ', SYN.plain], ['from ', SYN.kw], ["'@fumadocs/sanity'", SYN.str]]] },
  { k: 'callout', type: 'info', title: 'Live preview', body: 'Edits in Sanity Studio show up as you type.' },
  { k: 'h2', text: 'Blocks' },
  { k: 'p', parts: ['Headings, paragraphs, code and callouts…'] },
  { k: 'cards', items: [['Structured content', 'Model pages as documents'], ['Live preview', 'See changes instantly']] },
];

/** Real width of the plate's "Sanity" title (css px), measured once from its pixels. */
let titleScale = 0;
function calibrateTitle(c: CanvasRenderingContext2D) {
  const hdr = plates.saHeader!;
  const g = hdr.getContext('2d')!;
  // title row: css y 92–124 within the header crop (crop origin css (520, 26))
  const y0 = (92 - 26) * 2, y1 = (124 - 26) * 2, x0 = (542 - 520) * 2, x1 = (700 - 520) * 2;
  const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let right = 0;
  for (let y = 0; y < y1 - y0; y++)
    for (let x = 0; x < x1 - x0; x++) {
      const i = (y * (x1 - x0) + x) * 4;
      if (d[i + 3] > 128 && d[i] > 128) right = Math.max(right, x);
    }
  const real = (right + 1) / 2; // css px
  titleScale = real > 20 ? real / measure(c, TITLE, { font: 'ui', size: 30, weight: 600 }) : 1;
}

function previewPlate(c: CanvasRenderingContext2D, t: number) {
  if (!titleScale) calibrateTitle(c);
  const sc = scrollAt(t);
  backlight(c, PV.x, PV.y, PV.w, PV.h, 16);
  card(c, PV.x, PV.y, PV.w, PV.h, { r: 16, fill: FD.bg });
  c.save();
  rr(c, PV.x, PV.y, PV.w, PV.h, 16);
  c.clip();
  // header (breadcrumb, title, description, actions); the title is typed live
  const hdr = plates.saHeader!;
  c.drawImage(hdr, pvX(520), pvY(26, sc), hdr.width / 2, hdr.height / 2);
  const n = typed(t);
  const tw = measure(c, TITLE.slice(0, n), { font: 'ui', size: 30, weight: 600 }) * titleScale - (n > 0 && n < TITLE.length ? 1 : 0);
  c.fillStyle = FD.bg;
  c.fillRect(pvX(542) + (n > 0 ? tw : 0), pvY(86, sc), 120, 44);
  if (n > 0 && t < tType + TITLE.length * CPS + 0.3 && Math.floor(t * 12) % 2 === 0) {
    c.fillStyle = K;
    c.fillRect(pvX(542) + tw + 2, pvY(92, sc), 2.5, 30);
  }
  // blocks land as their chips arrive
  plates.saBlocks.forEach((bl, i) => {
    const pt = PTS[i];
    if (!pt) return;
    const a = seg(t, pt.hit - 0.02, pt.hit + 0.08, ease.outCubic);
    if (a <= 0) return;
    const pad = 4;
    c.save();
    c.globalAlpha *= a;
    c.drawImage(bl.img, pvX(bl.css[0] - pad), pvY(bl.css[1] - pad, sc) + (1 - a) * 12, bl.img.width / 2, bl.img.height / 2);
    c.restore();
    const fl = Math.exp(-Math.max(0, t - pt.hit) / 0.12) * (t >= pt.hit ? 1 : 0);
    if (fl > 0.02) {
      rr(c, pvX(bl.css[0]) - 8, pvY(bl.css[1], sc) - 6, bl.css[2] + 16, bl.css[3] + 12, 10);
      c.fillStyle = hexA(K, 0.16 * fl);
      c.fill();
      c.strokeStyle = hexA(K, 0.7 * fl);
      c.lineWidth = 1.2;
      c.stroke();
    }
  });
  c.restore();
  screenGlass(c, PV.x, PV.y, PV.w, PV.h, 16);
}

function previewVector(c: CanvasRenderingContext2D, t: number) {
  const n = typed(t);
  const blocks: Block[] = BLOCKS.map((bl, i) => (i === 0 ? { k: 'h1', text: TITLE.slice(0, n) } : bl));
  docsPage(c, {
    ...PV,
    key: K,
    k: 0.92,
    blocks,
    reveal: (i) => (i === 0 ? 1 : seg(t, PTS[i - 1].hit - 0.02, PTS[i - 1].hit + 0.1, ease.outCubic)),
  });
}

function preview(c: CanvasRenderingContext2D, t: number) {
  const p = slam(t);
  c.save();
  c.translate((1 - p) * 520, 0);
  if (hasSanityPlates()) previewPlate(c, t);
  else previewVector(c, t);
  text(c, 'PREVIEW', PV.x, PV.y - 18, { font: 'wide', size: 13, tracking: 0.3, color: A });
  text(c, 'localhost:3000/docs/sanity', PV.x + 126, PV.y - 18, { font: 'mono', size: 12, color: hexA(A, 0.75) });
  c.restore();
}

/** Chips fly from the body list through the LIVE relay into the preview. */
function streams(c: CanvasRenderingContext2D, t: number, s: number) {
  PTS.forEach((pt, i) => {
    const p = clamp((t - (pt.hit - FLY)) / FLY);
    if (p <= 0 || p >= 1) return;
    const [x0, y0] = rowOut(i);
    const sc = scrollAt(pt.hit);
    const x1 = pvX(560), y1 = Math.min(PV.y + PV.h - 30, pvY(pt.css[1] + 12, sc));
    const e = ease.inOutCubic(p);
    const qx = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * LIVE.x + e * e * x1;
    const qy = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * (LIVE.y - 60) + e * e * y1;
    c.strokeStyle = hexA(A, 0.7);
    c.lineWidth = 1.8 / s;
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo(LIVE.x, LIVE.y - 60, qx, qy);
    c.stroke();
    const str = `{ ${pt.chip} }`;
    const w = measure(c, str, { font: 'mono', size: 13 });
    rr(c, qx - w / 2 - 10, qy - 15, w + 20, 28, 7);
    c.fillStyle = '#16090C';
    c.fill();
    c.strokeStyle = K;
    c.lineWidth = 1.2 / s;
    c.stroke();
    mono(c, str, qx, qy + 4, 13, { color: K, align: 'center' });
  });
}

function relay(c: CanvasRenderingContext2D, t: number, s: number) {
  const on = seg(t, T.san + 0.06, T.san + 0.14);
  if (on <= 0) return;
  c.save();
  c.globalAlpha *= on;
  c.setLineDash([5 / s, 7 / s]);
  c.lineDashOffset = -t * 60;
  c.strokeStyle = hexA(A, 0.65);
  c.lineWidth = 1.8 / s;
  c.beginPath();
  c.moveTo(S.x + S.w, LIVE.y);
  c.lineTo(LIVE.x - 16, LIVE.y);
  c.moveTo(LIVE.x + 16, LIVE.y);
  c.lineTo(PV.x, LIVE.y);
  c.stroke();
  c.setLineDash([]);
  const ph = ((t - T.san) % 0.4) / 0.4;
  c.strokeStyle = hexA(A, 0.8 * (1 - ph));
  c.beginPath();
  c.arc(LIVE.x, LIVE.y, 14 + 34 * ease.outCubic(ph), 0, TAU);
  c.stroke();
  // README motif on glass (83.2–84.0): a glint on each bell note
  for (const m of [83.2, 83.4, 83.6, 83.7, 84.0]) {
    const g = clamp((t - m) / 0.25);
    if (g <= 0 || g >= 1) continue;
    const r = 8 + 26 * ease.outCubic(g);
    c.strokeStyle = hexA('#FFFFFF', (1 - g) * 0.95);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(LIVE.x - r, LIVE.y);
    c.lineTo(LIVE.x + r, LIVE.y);
    c.moveTo(LIVE.x, LIVE.y - r);
    c.lineTo(LIVE.x, LIVE.y + r);
    c.stroke();
  }
  text(c, '● LIVE', LIVE.x, LIVE.y - 46, { font: 'mono', size: 14, weight: 700, align: 'center', color: A });
  text(c, 'next-sanity/live', LIVE.x, LIVE.y + 58, { font: 'mono', size: 12, align: 'center', color: hexA(A, 0.75) });
  c.restore();
}

/** b1 accent: TACTIC split bands sweep across as the panels slam together. */
function bands(c: CanvasRenderingContext2D, t: number) {
  const p = clamp((t - (T.san - 0.04)) / 0.3);
  if (p <= 0 || p >= 1) return;
  c.save();
  c.translate(960, 470);
  c.rotate(-0.42);
  const e = ease.outExpo(p);
  for (const [off, h, a] of [[-90, 54, 0.85], [40, 18, 0.6], [110, 36, 0.4]] as [number, number, number][]) {
    const x = lerp(-1800, 1800, e) * (off < 0 ? 1 : -1);
    c.fillStyle = hexA(A, a * (1 - p));
    c.fillRect(x - 1400, off, 2800, h);
  }
  c.restore();
}

function drawAll(c: CanvasRenderingContext2D, x: StationCtx) {
  const t = x.t;
  if (t < T.san - 0.25) {
    c.save();
    c.strokeStyle = hexA(K, 0.16);
    c.lineWidth = 1 / x.s;
    rr(c, S.x, S.y, S.w, S.h, 16);
    c.stroke();
    rr(c, PV.x, PV.y, PV.w, PV.h, 16);
    c.stroke();
    c.restore();
    return;
  }
  bands(c, t);
  studio(c, t);
  preview(c, t);
  relay(c, t, x.s);
  streams(c, t, x.s);
  const a = seg(t, T.san + 0.1, T.san + 0.3);
  if (a > 0) {
    c.save();
    c.globalAlpha *= a;
    text(c, 'STUDIO', S.x, S.y - 18, { font: 'wide', size: 13, tracking: 0.3, color: A });
    text(c, 'structured content · document "docs"', S.x + 112, S.y - 18, { font: 'mono', size: 12, color: hexA(A, 0.75) });
    brackets(c, S.x - 10, S.y - 10, S.w + 20, S.h + 20, 16, 2.4 / x.s, A);
    c.restore();
  }
}

export const sanity: StationImpl = {
  route,
  xe,
  xx,
  tIn,
  tOut,
  out: PV,
  front: drawAll,
  drawOutput(c, x) {
    preview(c, Math.max(x.t, b(8)));
  },
};
