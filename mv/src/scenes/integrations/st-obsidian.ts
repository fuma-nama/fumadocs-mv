import type * as THREE from 'three';
import type { Gfx } from '../../engine/gfx';
import { clamp, ease, lerp, seg, TAU } from '../../engine/anim';
import { brackets, measure, text } from '../../engine/draw2d';
import { apply, matAngle, matScale } from './cam';
import { renderCrystal } from './crystal';
import { bt, KEY, ORANGE, ringLocalY, T } from './k';
import { docsPage, type Block } from './page';
import { hasObsidianPlates, plates } from './plates';
import { Route } from './route';
import type { StationCtx, StationImpl } from './station';
import { backlight, callout, card, FD, fileIcon, mono, rr, screenGlass, ui } from './ui';
import { hexA } from './world';

const K = KEY.obsidian;
/** linework / labels over the lit violet field */
const A = '#0A0A0B';
const b = (n: number) => bt(T.obs, n);

type Rect = { x: number; y: number; w: number; h: number };
const CR = { x: 610, y: 488, size: 172 }; // crystal centre / half-height
interface Note {
  name: string;
  r: Rect;
  lines: string[];
  t: number; // eject time
}
/** The official example vault (examples/obsidian/public/vault), excerpts verbatim. */
const NOTES: Note[] = [
  {
    name: 'Welcome.md',
    r: { x: 24, y: 188, w: 440, h: 262 },
    lines: ['This is your new _vault_. ^64b2bc', 'Make a note of something, [[create a link]], …', '[[./hello world.md]]', '> [!warning] Hello World [[Welcome]] fssdf', '![[Xmas.png]]', '## Introduction!!'],
    t: b(2),
  },
  { name: 'create a link.md', r: { x: 806, y: 206, w: 250, h: 104 }, lines: ['(empty note)'], t: b(2.5) },
  { name: 'hello world.md', r: { x: 40, y: 606, w: 410, h: 132 }, lines: ['title: Hello World', 'hi [[Welcome]] [[Welcome#Introduction!!]]'], t: b(3) - 0.1 },
  { name: 'Folder/Nested Page.md', r: { x: 790, y: 624, w: 270, h: 104 }, lines: ['[[Welcome]]'], t: b(3) - 0.05 },
];
const IMG: Rect = { x: 846, y: 410, w: 160, h: 108 };
const IMG_T = b(2.5) + 0.06;
const CALLOUT_LINE = 3;

const LH = 30, FS = 13.5;
const lineY = (n: Note, i: number) => n.r.y + 64 + i * LH;

/** Wikilink edges, fired on 8ths: [from note, line, token, to, time] */
const EDGES: { from: number; line: number; tok: string; to: number | 'img'; t: number }[] = [
  { from: 0, line: 1, tok: '[[create a link]]', to: 1, t: b(3) },
  { from: 0, line: 4, tok: '![[Xmas.png]]', to: 'img', t: b(3.5) - 0.05 },
  { from: 0, line: 2, tok: '[[./hello world.md]]', to: 2, t: b(4) - 0.1 },
  { from: 2, line: 1, tok: '[[Welcome]]', to: 0, t: b(4) + 0.05 },
  { from: 3, line: 0, tok: '[[Welcome]]', to: 0, t: b(4.5) - 0.02 },
];
const tFlip = b(5), tMorph = b(6), tSide = b(7);
/** callout conversion: wipe 0 → WIPE in place, then slide SLIDE0 → SLIDE1 (s after tFlip) */
const WIPE = 0.1, SLIDE0 = 0.1, SLIDE1 = 0.26;
const tIn = T.obs - 0.02, tOut = 82.9;
const xe = CR.x, xx = 1858;

// ── rendered page (plate: css crop [528, 24, 857, 758] at 0.91) ──────────────
const PG: Rect = { x: 1096, y: 150, w: 780, h: 690 };
const KP = 0.91;
const pX = (x: number) => PG.x + (x - 528) * KP;
const pY = (y: number) => PG.y + (y - 24) * KP;
/** final place of the rendered callout (css [542, 326, 836, 46]) */
const CO: Rect = { x: pX(542), y: pY(326), w: 836 * KP, h: 46 * KP };
/** link hops in the rendered page (b7, 8ths) — css centres of create a link, ./hello world.md, Welcome, Test.png */
const HOPS: [number, number][] = [
  [739.33 + 46, 185 + 10.5],
  [542 + 60, 233 + 10.5],
  [662.09 + 30, 340 + 9],
  [609.59 + 32, 443 + 10.5],
].map(([x, y]) => [pX(x), pY(y)] as [number, number]);

function tokenRect(c: CanvasRenderingContext2D, n: Note, line: number, tok: string): Rect {
  const s = n.lines[line];
  const i = s.indexOf(tok);
  const x0 = n.r.x + 18 + measure(c, s.slice(0, i), { font: 'mono', size: FS });
  const w = measure(c, tok, { font: 'mono', size: FS });
  return { x: x0, y: lineY(n, line) - FS, w, h: FS * 1.35 };
}
/** graph node of a note (dot on its edge facing the crystal) */
function nodeOf(i: number | 'img'): [number, number] {
  if (i === 'img') return [IMG.x, IMG.y + IMG.h / 2];
  const r = NOTES[i].r;
  return r.x + r.w / 2 < CR.x ? [r.x + r.w, r.y + r.h / 2] : [r.x, r.y + r.h / 2];
}
// approximate token positions for the packet (char-cell estimate; stable, no measuring needed)
const CW = FS * 0.6;
const tokAt = (n: number, line: number, tok: string): [number, number] => {
  const s = NOTES[n].lines[line];
  const i = s.indexOf(tok);
  return [NOTES[n].r.x + 18 + (i + tok.length / 2) * CW, lineY(NOTES[n], line) + 4];
};
const calloutLineAt: [number, number] = [NOTES[0].r.x + 2, lineY(NOTES[0], CALLOUT_LINE) - 4];

const route = new Route([
  { t0: tIn, t1: T.obs + 0.07, pts: [[xe, ringLocalY(xe)], [CR.x, CR.y + 20]], e: ease.outCubic },
  // out of the vault onto each wikilink as it fires, riding the edge to its target
  { t0: EDGES[0].t - 0.07, t1: EDGES[0].t, pts: [[CR.x, CR.y + 20], tokAt(0, 1, '[[create a link]]')], e: ease.outCubic },
  { t0: EDGES[0].t, t1: EDGES[0].t + 0.13, pts: [tokAt(0, 1, '[[create a link]]'), nodeOf(1)], e: ease.inOutCubic },
  { t0: EDGES[1].t - 0.05, t1: EDGES[1].t, pts: [nodeOf(1), tokAt(0, 4, '![[Xmas.png]]')], e: ease.inOutCubic },
  { t0: EDGES[1].t, t1: EDGES[1].t + 0.12, pts: [tokAt(0, 4, '![[Xmas.png]]'), nodeOf('img')], e: ease.inOutCubic },
  { t0: EDGES[2].t - 0.03, t1: EDGES[2].t, pts: [nodeOf('img'), tokAt(0, 2, '[[./hello world.md]]')], e: ease.inOutCubic },
  { t0: EDGES[2].t, t1: EDGES[2].t + 0.12, pts: [tokAt(0, 2, '[[./hello world.md]]'), nodeOf(2)], e: ease.inOutCubic },
  { t0: EDGES[3].t - 0.03, t1: EDGES[3].t, pts: [nodeOf(2), tokAt(2, 1, '[[Welcome]]')], e: ease.inOutCubic },
  { t0: EDGES[3].t, t1: EDGES[3].t + 0.12, pts: [tokAt(2, 1, '[[Welcome]]'), nodeOf(0)], e: ease.inOutCubic },
  // onto the callout line, then carried with it to its place in the page
  { t0: tFlip - 0.16, t1: tFlip - 0.03, pts: [nodeOf(0), calloutLineAt], e: ease.inOutCubic },
  // rides the render bar across the line, then with the box to its page slot
  { t0: tFlip, t1: tFlip + WIPE, pts: [calloutLineAt, [NOTES[0].r.x + NOTES[0].r.w - 6, calloutLineAt[1]]], e: ease.inOutQuad },
  { t0: tFlip + SLIDE0, t1: tFlip + SLIDE1, pts: [[NOTES[0].r.x + NOTES[0].r.w - 6, calloutLineAt[1]], [CO.x - 22, CO.y + CO.h / 2]], e: ease.inOutCubic },
  // link hops in the rendered page on 8ths
  { t0: tSide - 0.06, t1: tSide, pts: [[CO.x - 22, CO.y + CO.h / 2], HOPS[0]], e: ease.inOutCubic },
  { t0: tSide + 0.04, t1: tSide + 0.1, pts: [HOPS[0], HOPS[1]], e: ease.inOutCubic },
  { t0: tSide + 0.14, t1: tSide + 0.2, pts: [HOPS[1], HOPS[2]], e: ease.inOutCubic },
  { t0: tSide + 0.24, t1: tSide + 0.3, pts: [HOPS[2], HOPS[3]], e: ease.inOutCubic },
  // exit right, down to the ring
  { t0: tOut - 0.14, t1: tOut, pts: [HOPS[3], [HOPS[3][0], PG.y + PG.h + 18], [xx, PG.y + PG.h + 18], [xx, ringLocalY(xx)]], e: ease.inCubic },
]);

// ── drawing ─────────────────────────────────────────────────────────────────

function wiki(c: CanvasRenderingContext2D, s: string, x: number, y: number, hi: (tok: string) => number) {
  const re = /(!?\[\[[^\]]+\]\])/g;
  let cx = x;
  for (const part of s.split(re)) {
    if (!part) continue;
    const isLink = part.startsWith('[[') || part.startsWith('![[');
    const isHead = !isLink && part.startsWith('#');
    const isQuote = !isLink && part.startsWith('>');
    const isMeta = !isLink && part.startsWith('title:');
    const col = isLink ? K : isHead ? FD.fg : isQuote ? '#FE9A00' : isMeta ? '#85E89D' : FD.mutedFg;
    if (isLink) {
      const h = hi(part);
      const w = measure(c, part, { font: 'mono', size: FS });
      if (h > 0) {
        rr(c, cx - 3, y - FS, w + 6, FS * 1.4, 4);
        c.fillStyle = hexA(K, 0.25 * h);
        c.fill();
      }
    }
    cx += text(c, part, cx, y, { font: 'mono', size: FS, weight: isHead ? 600 : 400, color: col });
  }
}

function noteCard(c: CanvasRenderingContext2D, n: Note, t: number, idx: number) {
  // guard on the raw progress: outBack(0) is ~2e-16, not 0
  if (t <= n.t) return;
  const p = seg(t, n.t, n.t + 0.16, ease.outBack);
  const cx = lerp(CR.x, n.r.x + n.r.w / 2, ease.outCubic(clamp(p))), cy = lerp(CR.y, n.r.y + n.r.h / 2, ease.outCubic(clamp(p)));
  const sc = lerp(0.15, 1, p);
  c.save();
  c.translate(cx, cy);
  c.scale(sc, sc);
  c.rotate((1 - clamp(p)) * (idx % 2 ? 0.5 : -0.5));
  c.translate(-(n.r.x + n.r.w / 2), -(n.r.y + n.r.h / 2));
  const r = n.r;
  backlight(c, r.x, r.y, r.w, r.h, 12, 0.8);
  card(c, r.x, r.y, r.w, r.h, { r: 12, fill: FD.card });
  fileIcon(c, r.x + 14, r.y + 13, 16, hexA(K, 0.9));
  mono(c, n.name, r.x + 38, r.y + 27, 13, { color: FD.mutedFg });
  c.fillStyle = FD.border;
  c.fillRect(r.x, r.y + 40, r.w, 1);
  const hi = (tok: string) => {
    let v = 0;
    for (const e of EDGES) if (e.from === idx && e.tok === tok) v = Math.max(v, seg(t, e.t - 0.06, e.t) * (1 - seg(t, e.t + 0.3, e.t + 0.6)));
    return v;
  };
  n.lines.forEach((s, i) => {
    const y = lineY(n, i);
    if (idx === 0 && i === CALLOUT_LINE) {
      // the callout line: highlighted before it lifts, an empty dashed slot after
      const lift = seg(t, tFlip - 0.06, tFlip);
      if (lift > 0) {
        rr(c, r.x + 10, y - FS - 4, r.w - 20, FS * 1.6 + 2, 6);
        c.fillStyle = hexA('#FE9A00', 0.1 + 0.08 * lift);
        c.fill();
        c.setLineDash([4, 4]);
        c.strokeStyle = hexA('#FE9A00', 0.5 * lift);
        c.stroke();
        c.setLineDash([]);
      }
      if (t < tFlip) wiki(c, s, r.x + 18, y, hi);
      return;
    }
    if (s === '(empty note)') ui(c, 'empty note', r.x + 18, y, 13.5, { color: 'rgba(179,179,179,0.4)', italic: true });
    else wiki(c, s, r.x + 18, y, hi);
  });
  screenGlass(c, r.x, r.y, r.w, r.h, 12, 0.8);
  c.restore();
}

function imgTile(c: CanvasRenderingContext2D, t: number) {
  if (t <= IMG_T) return;
  const p = seg(t, IMG_T, IMG_T + 0.16, ease.outBack);
  c.save();
  const cx = lerp(CR.x, IMG.x + IMG.w / 2, clamp(p)), cy = lerp(CR.y, IMG.y + IMG.h / 2, clamp(p));
  c.translate(cx, cy);
  c.scale(p, p);
  c.translate(-(IMG.x + IMG.w / 2), -(IMG.y + IMG.h / 2));
  rr(c, IMG.x, IMG.y, IMG.w, IMG.h, 10);
  c.save();
  c.clip();
  if (plates.obPage) {
    // the vault's real Xmas.png, as the page embeds it (css [542, 548, 836, 492]), cover-cropped
    const sw = 836 * 2, sh = 492 * 2;
    const ar = IMG.w / IMG.h;
    const cw = Math.min(sw, sh * ar), ch = cw / ar;
    c.drawImage(plates.obPage, 542 * 2 + (sw - cw) / 2, 548 * 2 + (sh - ch) / 2, cw, ch, IMG.x, IMG.y, IMG.w, IMG.h);
  } else {
    const g = c.createLinearGradient(IMG.x, IMG.y, IMG.x + IMG.w, IMG.y + IMG.h);
    g.addColorStop(0, '#2C1A5E');
    g.addColorStop(1, '#7E4BD8');
    c.fillStyle = g;
    c.fillRect(IMG.x, IMG.y, IMG.w, IMG.h);
  }
  c.restore();
  c.strokeStyle = FD.border;
  c.lineWidth = 1;
  rr(c, IMG.x, IMG.y, IMG.w, IMG.h, 10);
  c.stroke();
  rr(c, IMG.x + 6, IMG.y + IMG.h - 26, 74, 20, 5);
  c.fillStyle = 'rgba(0,0,0,0.6)';
  c.fill();
  mono(c, 'Xmas.png', IMG.x + 12, IMG.y + IMG.h - 11, 11.5, { color: 'rgba(255,255,255,0.9)' });
  c.restore();
}

/** Bézier link from a token to a node, drawn on over 0.13 s; persists. */
function edges(c: CanvasRenderingContext2D, t: number, s: number) {
  c.save();
  c.lineWidth = 1.4 / s;
  for (const e of EDGES) {
    const p = seg(t, e.t, e.t + 0.13, ease.inOutCubic);
    if (p <= 0) continue;
    const tr = tokenRect(c, NOTES[e.from], e.line, e.tok);
    const [x0, y0] = [tr.x + tr.w / 2, tr.y + tr.h];
    const [x1, y1] = nodeOf(e.to);
    const mx = (x0 + x1) / 2, my = Math.max(y0, y1) + 60;
    c.strokeStyle = hexA(A, 0.85);
    c.lineWidth = 2 / s;
    c.beginPath();
    const N = 28;
    for (let i = 0; i <= N * p; i++) {
      const u = i / N;
      const x = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * x1;
      const y = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * my + u * u * y1;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    const ping = clamp((t - e.t - 0.13) / 0.3);
    if (ping > 0 && ping < 1) {
      c.strokeStyle = hexA(A, 1 - ping);
      c.beginPath();
      c.arc(x1, y1, 6 + 30 * ease.outCubic(ping), 0, TAU);
      c.stroke();
    }
  }
  for (let i = 0; i < NOTES.length; i++) {
    if (t < NOTES[i].t + 0.1) continue;
    const [x, y] = nodeOf(i);
    c.fillStyle = A;
    c.beginPath();
    c.arc(x, y, 6, 0, TAU);
    c.fill();
  }
  if (t > IMG_T + 0.1) {
    const [x, y] = nodeOf('img');
    c.fillStyle = A;
    c.beginPath();
    c.arc(x, y, 5, 0, TAU);
    c.fill();
  }
  c.setLineDash([4 / s, 6 / s]);
  c.strokeStyle = hexA(A, 0.45);
  for (let i = 0; i < NOTES.length; i++) {
    const p = seg(t, NOTES[i].t, NOTES[i].t + 0.16);
    if (p <= 0) continue;
    const [x, y] = nodeOf(i);
    c.beginPath();
    c.moveTo(CR.x, CR.y);
    c.lineTo(lerp(CR.x, x, p), lerp(CR.y, y, p));
    c.stroke();
  }
  c.restore();
}

/**
 * b5: the raw callout line lifts off Welcome.md and slides to its page slot (2D: translate +
 * box morph, a lift shadow on the wall). On the way a render bar sweeps across it left → right:
 * behind the bar it is the real rendered callout, ahead of it still the raw markdown.
 */
function calloutFlip(c: CanvasRenderingContext2D, t: number, s: number) {
  if (t < tFlip) return;
  const n = NOTES[0];
  const from: Rect = { x: n.r.x + 10, y: lineY(n, CALLOUT_LINE) - FS - 4, w: n.r.w - 20, h: FS * 1.6 + 2 };
  const fromCy = from.y + from.h / 2;
  // 1) render wipe in place (camera holds on the line), 2) slide to the page slot
  const wipe = seg(t, tFlip, tFlip + WIPE, ease.inOutQuad);
  const p = ease.inOutCubic(seg(t, tFlip + SLIDE0, tFlip + SLIDE1));
  const lift = Math.sin(p * Math.PI);
  // the box: line-width → slot-width, centred on the line → the slot (true-size content, no squash)
  const x = lerp(from.x, CO.x, p);
  const cy = lerp(fromCy, CO.y + CO.h / 2, p) - lift * 60;
  const w = lerp(from.w, CO.w, p);
  const bx = from.x + from.w * wipe; // render bar (only moves during the in-place wipe)
  // lift shadow on the wall
  if (lift > 0.01) {
    c.save();
    rr(c, x + 10 * lift, cy - CO.h / 2 + 22 * lift, w, CO.h, 12 * KP);
    c.fillStyle = `rgba(10,10,11,${0.35 * lift})`;
    c.filter = `blur(${6 + 10 * lift}px)`;
    c.fill();
    c.restore();
  }
  // raw markdown ahead of the bar (stays on the note's line)
  if (wipe < 1) {
    c.save();
    c.beginPath();
    c.rect(bx, from.y - 4, from.x + from.w - bx + 4, from.h + 8);
    c.clip();
    card(c, from.x, from.y, from.w, from.h, { r: 8, fill: '#1A1408', stroke: hexA('#FE9A00', 0.8), lw: 1.2 / s });
    text(c, n.lines[CALLOUT_LINE], from.x + 10, from.y + from.h * 0.68, { font: 'mono', size: FS, color: '#FE9A00' });
    c.restore();
  }
  // the rendered callout behind the bar, at its true size, revealed by the box
  const vis = Math.min(w, (wipe < 1 ? bx : x + w) - x);
  if (vis > 0) {
    const y = cy - CO.h / 2;
    c.save();
    c.beginPath();
    c.rect(x - 2, y - 4, vis + 2, CO.h + 8);
    c.clip();
    backlight(c, x, y, Math.max(vis, 24), CO.h, 12 * KP, 0.9);
    if (plates.obCallout) {
      const m = 2 * KP;
      c.drawImage(plates.obCallout, x - m, y - m, CO.w + m * 2, CO.h + m * 2);
    } else {
      callout(c, x, y, CO.w, 'warning', 'Hello World', '', CO.h / 46);
    }
    c.restore();
    if (wipe >= 1) screenGlass(c, x, y, w, CO.h, 12 * KP, 0.7);
  }
  // the render bar itself
  if (wipe > 0 && wipe < 1) {
    c.save();
    const g = c.createLinearGradient(bx - 30, 0, bx + 4, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.5)');
    c.fillStyle = g;
    c.fillRect(bx - 30, fromCy - CO.h / 2 - 4, 34, CO.h + 8);
    c.fillStyle = '#FFFFFF';
    c.fillRect(bx - 1, fromCy - CO.h / 2 - 8, 2.5, CO.h + 16);
    c.restore();
  }
  // flash where it lands
  const land = clamp((t - tFlip - SLIDE1) / 0.25);
  if (land > 0 && land < 1) {
    c.strokeStyle = hexA('#FFFFFF', 1 - land);
    c.lineWidth = 2 / s;
    rr(c, CO.x - 10 * land, CO.y - 10 * land, CO.w + 20 * land, CO.h + 20 * land, 12 + 6 * land);
    c.stroke();
  }
}

const PAGE_BLOCKS: Block[] = [
  { k: 'h1', text: 'Welcome' },
  { k: 'p', parts: ['This is your new vault.'] },
  { k: 'p', parts: ['Make a note of something, ', { link: 'create a link' }, ', or try ', { link: 'the Importer' }, '!'] },
  { k: 'p', parts: [{ link: './hello world.md' }] },
  { k: 'callout', type: 'warning', title: 'Hello World Welcome fssdf', body: '' },
  { k: 'img', caption: 'Xmas.png', hue: 258 },
];

function page(c: CanvasRenderingContext2D, t: number) {
  const p = seg(t, tMorph, tMorph + 0.24, ease.outCubic);
  if (p <= 0) return;
  // materialise outward from the callout (top + bottom wipes)
  const top = lerp(CO.y, PG.y, p), bot = lerp(CO.y + CO.h, PG.y + PG.h, p);
  backlight(c, PG.x, top, PG.w, bot - top, 16);
  c.save();
  rr(c, PG.x, top, PG.w, bot - top, 16);
  c.clip();
  if (hasObsidianPlates()) {
    rr(c, PG.x, PG.y, PG.w, PG.h, 16);
    c.fillStyle = FD.bg;
    c.fill();
    c.drawImage(plates.obPage!, 528 * 2, 24 * 2, (PG.w / KP) * 2, (PG.h / KP) * 2, PG.x, PG.y, PG.w, PG.h);
  } else {
    docsPage(c, { ...PG, k: 0.9, key: K, toc: { items: ['Introduction!!'], active: 0 }, blocks: PAGE_BLOCKS });
  }
  c.restore();
  screenGlass(c, PG.x, top, PG.w, bot - top, 16);
  // link hops (b7): each link lights as the packet lands on it
  HOPS.forEach(([hx, hy], i) => {
    const th = tSide + i * 0.1;
    const a = seg(t, th - 0.01, th + 0.02) * (1 - seg(t, th + 0.16, th + 0.3));
    if (a <= 0) return;
    rr(c, hx - 50, hy - 13, 100, 24, 6);
    c.fillStyle = hexA(K, 0.22 * a);
    c.fill();
    c.strokeStyle = hexA(K, 0.8 * a);
    c.lineWidth = 1;
    c.stroke();
  });
}

function annotations(c: CanvasRenderingContext2D, t: number, s: number) {
  const a = seg(t, T.obs + 0.05, T.obs + 0.3, ease.outCubic);
  if (a <= 0) return;
  c.save();
  c.globalAlpha *= a;
  text(c, 'VAULT', CR.x - 120, CR.y + 236, { font: 'wide', size: 13, tracking: 0.3, color: A });
  text(c, 'public/vault · 4 notes · 2 files', CR.x - 120, CR.y + 258, { font: 'mono', size: 12, color: hexA(A, 0.75) });
  const pa = seg(t, tMorph + 0.15, tMorph + 0.4);
  if (pa > 0) {
    c.globalAlpha *= pa;
    text(c, 'DOCS', PG.x, PG.y - 18, { font: 'wide', size: 13, tracking: 0.3, color: A });
    text(c, '/obsidian/Welcome', PG.x + 76, PG.y - 18, { font: 'mono', size: 12, color: hexA(A, 0.75) });
    brackets(c, PG.x - 10, PG.y - 10, PG.w + 20, PG.h + 20, 16, 2.4 / s, A);
  }
  c.restore();
  const fa = seg(t, tFlip + 0.12, tFlip + 0.22) * (1 - seg(t, tMorph - 0.02, tMorph + 0.1));
  if (fa > 0) {
    c.save();
    c.globalAlpha *= fa;
    c.strokeStyle = A;
    c.lineWidth = 1.5 / s;
    c.beginPath();
    c.moveTo(CO.x + 120, CO.y);
    c.lineTo(CO.x + 150, CO.y - 34);
    c.lineTo(CO.x + 390, CO.y - 34);
    c.stroke();
    text(c, '> [!warning]  →  <Callout type="warning" />', CO.x + 154, CO.y - 42, { font: 'mono', size: 12.5, weight: 600, color: A });
    c.restore();
  }
}

function drawAll(c: CanvasRenderingContext2D, x: StationCtx) {
  const t = x.t;
  if (t < T.obs - 0.6) {
    c.save();
    c.strokeStyle = hexA(K, 0.2);
    c.lineWidth = 1 / x.s;
    c.beginPath();
    c.moveTo(CR.x, CR.y - CR.size * 1.3);
    c.lineTo(CR.x + CR.size * 0.6, CR.y);
    c.lineTo(CR.x, CR.y + CR.size * 0.9);
    c.lineTo(CR.x - CR.size * 0.6, CR.y);
    c.closePath();
    c.stroke();
    c.restore();
    return;
  }
  edges(c, t, x.s);
  imgTile(c, t);
  NOTES.forEach((n, i) => noteCard(c, n, t, i));
  page(c, t);
  calloutFlip(c, t, x.s);
  annotations(c, t, x.s);
  // laser zap (80.0, "laser zap + glass chord"): the packet fires up into the vault as a beam
  const zp = clamp((t - (T.obs - 1 / 60)) / 0.14);
  if (zp > 0 && zp < 1) {
    const y0 = ringLocalY(CR.x), y1 = CR.y;
    c.save();
    c.lineCap = 'round';
    for (const [w, col, a] of [[18, '#FFFFFF', 0.35], [6, '#F2EDFF', 0.9], [2, '#FFFFFF', 1]] as [number, string, number][]) {
      c.strokeStyle = hexA(col, a * (1 - zp) ** 1.5);
      c.lineWidth = (w * (1 - 0.6 * zp)) / x.s;
      c.beginPath();
      c.moveTo(CR.x, y0);
      c.lineTo(CR.x, y1);
      c.stroke();
    }
    c.restore();
  }
  const ip = clamp((t - T.obs) / 0.45);
  if (ip > 0 && ip < 1) {
    c.strokeStyle = hexA('#FFFFFF', (1 - ip) ** 1.4);
    c.lineWidth = (3 * (1 - ip) + 0.6) / x.s;
    c.beginPath();
    c.arc(CR.x, CR.y, 40 + 520 * ease.outCubic(ip), 0, TAU);
    c.stroke();
  }
  const inside = t > T.obs + 0.07 && t < EDGES[0].t - 0.07;
  if (inside) {
    const g = c.createRadialGradient(CR.x, CR.y + 10, 0, CR.x, CR.y + 10, 90);
    const k = 0.5 + 0.5 * Math.sin((t - T.obs) * 30);
    g.addColorStop(0, hexA(ORANGE, 0.5 + 0.2 * k));
    g.addColorStop(1, hexA(ORANGE, 0));
    c.fillStyle = g;
    c.fillRect(CR.x - 90, CR.y - 80, 180, 180);
  }
}

/** 3D vault crystal in screen space for station→screen matrix m. */
function crystal3D(g: Gfx, x: StationCtx, m: DOMMatrix): THREE.Texture | null {
  const t = x.t;
  if (t < T.obs - 0.05) return null;
  const [sx, sy] = apply(m, CR.x, CR.y);
  const sc = matScale(m);
  if (sx < -500 || sx > 2420 || sy < -500 || sy > 1580) return null;
  const pop = ease.outBack(seg(t, T.obs - 0.05, T.obs + 0.12), 2.2);
  let pulse = 0;
  for (const n of NOTES) pulse = Math.max(pulse, Math.exp(-Math.max(0, t - n.t) / 0.08) * (t >= n.t ? 1 : 0));
  const charge = seg(t, T.obs + 0.07, T.obs + 0.15) * (1 - seg(t, EDGES[0].t - 0.1, EDGES[0].t + 0.2));
  return renderCrystal(g, {
    x: sx,
    y: sy,
    size: CR.size * sc * pop * (1 + 0.06 * pulse),
    roll: matAngle(m),
    spin: t * 1.3,
    tilt: 0.34 + 0.05 * Math.sin(t * 1.7),
    glow: Math.min(0.45, charge * 0.16 + pulse * 0.28 + 0.5 * Math.exp(-Math.max(0, t - T.obs) / 0.08) * (t >= T.obs ? 1 : 0)),
    burst: seg(t, T.obs - 0.02, T.obs + 0.5),
    edge: 1,
    flash: Math.exp(-Math.max(0, t - T.obs) / 0.05) * (t >= T.obs - 0.02 ? 1 : 0),
  });
}

export const obsidian: StationImpl = {
  route,
  xe,
  xx,
  tIn,
  tOut,
  out: PG,
  front: drawAll,
  three: crystal3D,
  hidePacket: (t) => t > T.obs + 0.07 && t < EDGES[0].t - 0.07,
  noTail: (t) => t >= tFlip - 0.02 && t < tFlip + WIPE + 0.02,
  drawOutput(c, x) {
    const t = Math.max(x.t, tMorph + 0.5);
    page(c, t);
    calloutFlip(c, t, 1);
  },
};
