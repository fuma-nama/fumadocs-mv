import { measure, type TextOpts } from '../../engine/draw2d';
import type { Engine } from '../../engine/engine';

/**
 * Wireframe geometry of each layout, generated from the real captures' element boxes
 * (/plates/layouts/<id>.boxes.json, 1440×900 viewport, CSS px). Every element has a stable
 * key so any layout morphs into any other: the same logo, search box, sidebar rows, h1, TOC
 * items… slide from where they are in one layout to where they are in the next.
 */

export type GroupKey = 'surface' | 'navbar' | 'tabs' | 'sidebar' | 'page' | 'main' | 'toc' | 'pills' | 'panel' | 'hero' | 'overlay';

export interface El {
  key: string;
  /** panel = group slab (fill + outline); box = rounded rect outline (+fill); bar = text line (x left, y centre, w length, h thickness); dot = filled disc; ring = circle outline; poly = path */
  k: 'panel' | 'box' | 'bar' | 'dot' | 'ring' | 'poly';
  g: GroupKey;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  /** brightness 0..1 */
  tone: number;
  /** orange accent 0..1 */
  acc: number;
  /** fill strength 0..1 (box/panel) */
  fill: number;
  /** panel: elevation of the slab's back face, slab thickness, translucency, outline strength, separator sides */
  z?: number;
  t?: number;
  glass?: number;
  edge?: number;
  sep?: [number, number, number, number];
  /** poly points (absolute), fixed count */
  pts?: number[];
  /** poly: drawn fraction from the start (active TOC segment) */
  on?: number;
}

export interface LayoutGeo {
  id: string;
  els: El[];
  /** guide-dot rest position */
  dot: [number, number];
}

type R = [number, number, number, number];
type Box = { css: R; r?: number; text?: string; [k: string]: unknown };

const HI = 0.92;
const MID = 0.6;
const LO = 0.36;
const DIM = 0.24;

let mctx: CanvasRenderingContext2D | null = null;
function tw(text: string, size: number, weight = 400, font: TextOpts['font'] = 'ui'): number {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d')!;
  return measure(mctx, text, { font, size, weight });
}

/** Greedy word wrap → line widths. */
function wrap(text: string, maxW: number, size: number, weight = 400): number[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: number[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (tw(next, size, weight) > maxW && line) {
      out.push(tw(line, size, weight));
      line = w;
    } else line = next;
  }
  if (line) out.push(tw(line, size, weight));
  return out;
}

/** Parse an SVG path (M/L/C, absolute) into a polyline. */
function parsePath(d: string, ox: number, oy: number): number[] {
  const tok = d.replace(/([MLC])/g, ' $1 ').trim().split(/[\s,]+/);
  const pts: number[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let cmd = 'M';
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    if (/^[MLC]$/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M' || cmd === 'L') {
      cx = num();
      cy = num();
      pts.push(ox + cx, oy + cy);
    } else if (cmd === 'C') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
      for (let s = 1; s <= 8; s++) {
        const u = s / 8;
        const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, e = u ** 3;
        pts.push(ox + a * cx + b * x1 + c * x2 + e * x, oy + a * cy + b * y1 + c * y2 + e * y);
      }
      cx = x;
      cy = y;
    } else i++;
  }
  return pts;
}

/** Resample a polyline to n points by arc length. */
export function resample(p: number[], n: number): number[] {
  const L = [0];
  for (let i = 2; i < p.length; i += 2) L.push(L[L.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
  const total = L[L.length - 1] || 1;
  const out: number[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = (k / (n - 1)) * total;
    while (j < L.length - 1 && L[j] < s) j++;
    const a = L[j - 1];
    const b = L[j];
    const u = b > a ? (s - a) / (b - a) : 0;
    out.push(p[2 * j - 2] + (p[2 * j] - p[2 * j - 2]) * u, p[2 * j - 1] + (p[2 * j + 1] - p[2 * j - 1]) * u);
  }
  return out;
}

class B {
  els: El[] = [];
  seen = new Map<string, number>();
  key(k: string) {
    const n = this.seen.get(k) ?? 0;
    this.seen.set(k, n + 1);
    return n ? `${k}#${n}` : k;
  }
  panel(key: string, g: GroupKey, r: R, o: Partial<El> = {}) {
    // panels never extend past the 1440×900 viewport (captures report full document heights)
    const x = Math.max(0, r[0]);
    const y = Math.max(0, r[1]);
    const w = Math.min(r[0] + r[2], 1440) - x;
    const h = Math.min(r[1] + r[3], 900) - y;
    this.els.push({ key: this.key(key), k: 'panel', g, x, y, w, h, r: o.r ?? 0, tone: 0.8, acc: 0, fill: 0.6, z: 0, t: 2, glass: 0, edge: 1, ...o });
  }
  box(key: string, g: GroupKey, r: R, rad: number, tone: number, fill = 0, acc = 0) {
    this.els.push({ key: this.key(key), k: 'box', g, x: r[0], y: r[1], w: r[2], h: r[3], r: Math.min(rad, r[2] / 2, r[3] / 2), tone, acc, fill });
  }
  bar(key: string, g: GroupKey, x: number, y: number, w: number, th: number, tone: number, acc = 0) {
    if (w <= 0.5) return;
    this.els.push({ key: this.key(key), k: 'bar', g, x, y, w, h: th, r: 0, tone, acc, fill: 0 });
  }
  dot(key: string, g: GroupKey, x: number, y: number, rad: number, tone: number, acc = 0) {
    this.els.push({ key: this.key(key), k: 'dot', g, x, y, w: 0, h: 0, r: rad, tone, acc, fill: 1 });
  }
  ring(key: string, g: GroupKey, x: number, y: number, rad: number, tone: number, acc = 0) {
    this.els.push({ key: this.key(key), k: 'ring', g, x, y, w: 0, h: 0, r: rad, tone, acc, fill: 0 });
  }
  poly(key: string, g: GroupKey, pts: number[], tone: number, acc = 0, on = 1) {
    this.els.push({ key: this.key(key), k: 'poly', g, x: 0, y: 0, w: 0, h: 0, r: 0, tone, acc, fill: 0, pts, on });
  }
}

const RAIL_N = 72;

// ── shared pieces ───────────────────────────────────────────────────────────

function logo(b: B, g: GroupKey, mark: R | undefined, text: Box | undefined) {
  if (!mark || !text) return;
  b.dot('logo.mark', g, mark[0] + mark[2] / 2, mark[1] + mark[3] / 2, 8.5, HI, 1);
  b.bar('logo.text', g, mark[0] + 27, text.css[1] + text.css[3] / 2, tw('Fumadocs', 15, 600) - 4, 8, HI);
}

function search(b: B, g: GroupKey, s: Box | null | undefined) {
  if (!s) return;
  const [x, y, w, h] = s.css;
  b.box('search', g, s.css, Math.min(s.r ?? 8, h / 2), MID, 0.3);
  b.ring('search.icon', g, x + 16, y + h / 2, 5, LO);
  b.bar('search.text', g, x + 30, y + h / 2, tw('Search', 14), 6, LO);
  const kbd = (s.kbd as Box[] | undefined) ?? [];
  kbd.forEach((k, i) => b.box(`search.kbd${i}`, g, k.css, 5, LO));
  void w;
}

function theme(b: B, g: GroupKey, t: Box | undefined) {
  if (!t) return;
  const [x, y, w, h] = t.css;
  b.box('theme', g, t.css, h / 2, MID, 0.25);
  b.ring('theme.sun', g, x + w * 0.28, y + h / 2, Math.min(6, h * 0.2), LO);
  b.dot('theme.moon', g, x + w * 0.72, y + h / 2, Math.min(6, h * 0.2), HI);
}

function github(b: B, g: GroupKey, gh: Box | undefined) {
  if (!gh) return;
  const [x, y, w, h] = gh.css;
  b.ring('github', g, x + w / 2, y + h / 2, 8, MID);
}

function tabDropdown(b: B, g: GroupKey, t: Box | null | undefined) {
  if (!t) return;
  const [x, y, w, h] = t.css;
  b.box('tabs.dd', g, t.css, t.r ?? 8, MID, 0.3);
  b.box('tabs.dd.icon', g, [x + 10, y + h / 2 - 9, 18, 18], 4, MID);
  b.bar('tabs.dd.text', g, x + 38, y + h / 2, tw((t.text as string) ?? 'Framework', 14, 500), 7, HI);
  b.bar('tabs.dd.chev1', g, x + w - 22, y + h / 2 - 3, 8, 2, LO);
  b.bar('tabs.dd.chev2', g, x + w - 22, y + h / 2 + 3, 8, 2, LO);
}

interface SbItem { css: R; kind: string; depth: number; active: boolean; text: string; icon?: R | null; open?: boolean }

function sidebarItems(b: B, g: GroupKey, items: SbItem[], clipY = 900) {
  let groupGuide: { x: number; y0: number; y1: number } | null = null;
  const flushGuide = () => {
    if (groupGuide && groupGuide.y1 > groupGuide.y0) b.poly('sb.guide', g, resample([groupGuide.x, groupGuide.y0, groupGuide.x, groupGuide.y1], 2), DIM);
    groupGuide = null;
  };
  for (const it of items) {
    const [x, y, w, h] = it.css;
    if (y > clipY - 10) break;
    if (!it.text) continue;
    if (it.text.startsWith('Search')) {
      if (it.kind === 'folder') continue; // the search trigger is drawn by search()
    }
    if (it.kind === 'folder' && it.text === 'Framework' && h >= 38) continue; // the tab menu
    const cy = y + h / 2;
    const k = `sb:${it.text}`;
    if (it.kind === 'separator') {
      flushGuide();
      b.bar(k, g, x + 8, cy, tw(it.text, 14, 500), 6, MID);
      continue;
    }
    if (it.depth > 0) {
      const gx = (it.css[0] < 20 ? x + 10 : x - 4);
      if (!groupGuide) groupGuide = { x: gx, y0: y, y1: y + h };
      else groupGuide.y1 = y + h;
    } else flushGuide();
    if (it.active) b.box(`${k}.hl`, g, it.css, 8, 0.7, 0.75, 1);
    let tx = x + 10;
    if (it.icon) {
      b.box(`${k}.icon`, g, it.icon, 3, it.active ? HI : LO, 0, it.active ? 1 : 0);
      tx = it.icon[0] + it.icon[2] + 9;
    } else if (it.depth > 0 && x < 20) tx = x + 18 + 12 * (it.depth - 1);
    b.bar(k, g, tx, cy, Math.min(tw(it.text, 14, it.active ? 500 : 400), x + w - tx - 26), 6, it.active ? HI : it.kind === 'folder' ? MID : LO, it.active ? 1 : 0);
    if (it.kind === 'folder') b.bar(`${k}.chev`, g, x + w - 20, cy, 6, 2, LO);
  }
  flushGuide();
}

interface Block { kind: string; css: R; text?: string; title?: string; cards?: Box[]; items?: Box[]; list?: R; tabs?: Box[] }

function article(b: B, g: GroupKey, a: { breadcrumb?: Box | null; h1?: Box; description?: Box; actions?: { buttons?: Box[] }; blocks?: Block[] }, clipY = 900) {
  if (a.breadcrumb) {
    const [x, y, , h] = a.breadcrumb.css;
    const w1 = tw('Getting Started', 14);
    b.bar('bc.1', g, x, y + h / 2, w1, 6, LO);
    b.bar('bc.sep', g, x + w1 + 8, y + h / 2, 5, 2, LO);
    b.bar('bc.2', g, x + w1 + 22, y + h / 2, tw('Quick Start', 14, 500), 6, MID, 1);
  }
  if (a.h1) b.bar('h1', g, a.h1.css[0], a.h1.css[1] + a.h1.css[3] / 2, tw('Quick Start', 28, 600) - 4, 18, HI);
  if (a.description) b.bar('desc', g, a.description.css[0], a.description.css[1] + 14, tw('Getting Started with Fumadocs', 18) - 2, 9, MID);
  for (const [i, btn] of (a.actions?.buttons ?? []).entries()) {
    const [x, y, w, h] = btn.css;
    b.box(`act${i}`, g, btn.css, 6, MID, 0.35);
    b.bar(`act${i}.t`, g, x + (i === 0 ? 26 : 9), y + h / 2, w - (i === 0 ? 36 : 28), 5, LO);
  }
  if (a.actions?.buttons?.length) {
    const r0 = a.actions.buttons[0].css;
    const ax = r0[0];
    const ay = r0[1] + 30 + 24;
    const aw = a.h1 ? a.h1.css[2] : 836;
    b.poly('act.rule', g, resample([ax, ay, ax + aw, ay], 2), DIM);
  }
  for (const [i, blk] of (a.blocks ?? []).entries()) {
    const [x, y, w, h] = blk.css;
    if (y > clipY - 8) break;
    const K = `blk${i}`;
    if (blk.kind === 'h2' || blk.kind === 'h3') {
      const size = blk.kind === 'h2' ? 24 : 20;
      b.bar(K, g, x, y + h / 2, tw(blk.text ?? '', size, 600) - 2, blk.kind === 'h2' ? 13 : 11, HI);
    } else if (blk.kind === 'p') {
      const lines = wrap(blk.text ?? '', w, 16);
      lines.forEach((lw, j) => {
        if (y + 14 + j * 28 < clipY) b.bar(`${K}.l${j}`, g, x, y + 14 + j * 28, lw, 7, LO);
      });
    } else if (blk.kind === 'cards') {
      for (const [j, cd] of (blk.cards ?? []).entries()) {
        const [cx, cy, cw, ch] = cd.css;
        if (cy > clipY) continue;
        const C = `${K}.c${j}`;
        b.box(C, g, cd.css, cd.r ?? 12, MID, 0.4);
        b.box(`${C}.i`, g, [cx + 16, cy + 16, 28, 28], 6, MID);
        const title = (cd.title as string) ?? '';
        b.bar(`${C}.t`, g, cx + 16, cy + 62, tw(title, 16, 500), 8, HI);
        const body = ((cd.text as string) ?? '').slice(title.length);
        wrap(body, cw - 32, 14).slice(0, Math.max(1, Math.floor((ch - 84) / 20))).forEach((lw, k) => b.bar(`${C}.l${k}`, g, cx + 16, cy + 86 + k * 20, lw, 5.5, LO));
      }
    } else if (blk.kind === 'callout') {
      b.box(K, g, blk.css, 12, MID, 0.4);
      b.dot(`${K}.i`, g, x + 22, y + 24, 7, MID);
      const title = blk.title ?? '';
      b.bar(`${K}.t`, g, x + 40, y + 24, tw(title, 16, 500), 8, HI);
      b.bar(`${K}.b`, g, x + 40, y + 50, tw((blk.text ?? '').slice(title.length), 16), 7, LO);
    } else if (blk.kind === 'codetabs') {
      b.box(K, g, blk.css, 12, MID, 0.45);
      (blk.tabs ?? []).forEach((tb, j) => b.bar(`${K}.tab${j}`, g, tb.css[0] + 8, tb.css[1] + 16, tb.css[2] - 16, 5, j === 0 ? HI : LO, j === 0 ? 1 : 0));
      b.bar(`${K}.code`, g, x + 16, y + 58, Math.min(w - 32, 260), 6, MID);
    } else if (blk.kind === 'list') {
      for (const [j, li] of (blk.items ?? []).entries()) {
        b.dot(`${K}.b${j}`, g, x + 6, li.css[1] + 14, 2.2, LO);
        b.bar(`${K}.l${j}`, g, li.css[0] + 4, li.css[1] + 14, Math.min(tw((li.text as string) ?? '', 16), li.css[2] - 8), 7, LO);
      }
    }
  }
}

interface TocItem { css: R; text: string; active: boolean; tick?: R }
interface TocGeo { container: R; title?: { rect: R }; items?: { depth: number; active: boolean; textBox: R; rect: R }[]; thumb?: { d?: string; svgClip?: string; dot?: { rect: R }; rect?: R }; block?: { clipPath?: string } }

function toc(b: B, g: GroupKey, t: { box: Box; title?: Box | null; items: TocItem[]; geometry?: TocGeo }, mode: 'normal' | 'block' | 'mini'): [number, number] | null {
  const geo = t.geometry;
  if (mode === 'mini') {
    t.items.forEach((it, i) => {
      if (it.tick) b.dot(`toc:${it.text}`, g, it.tick[0] + 2, it.tick[1] + 2, 2.1, it.active ? HI : LO, it.active ? 1 : 0);
      void i;
    });
    const a = t.items.find((it) => it.active && it.tick);
    return a?.tick ? [a.tick[0] + 2, a.tick[1] + 2] : null;
  }
  if (t.title) {
    const [x, y, , h] = t.title.css;
    const cy = y + h / 2;
    b.bar('toc.ico1', g, x + 1, cy - 4, 11, 2, MID);
    b.bar('toc.ico2', g, x + 1, cy, 11, 2, MID);
    b.bar('toc.ico3', g, x + 1, cy + 4, 7, 2, MID);
    b.bar('toc.title', g, x + 21, cy, tw('On this page', 14), 6, MID);
  }
  if (!geo) return null;
  const [ox, oy] = geo.container;
  let dot: [number, number] | null = null;
  if (mode === 'block' && geo.block?.clipPath) {
    const m = /inset\(0px 0px ([\d.]+)px/.exec(geo.block.clipPath);
    const hh = geo.container[3] - (m ? parseFloat(m[1]) : 0);
    b.box('toc.block', g, [ox, oy, geo.container[2], hh], 8, 0.7, 0.7, 1);
    dot = [ox - 10, oy + 14];
  }
  for (const it of geo.items ?? []) {
    const tb = it.textBox;
    b.bar(`toc:${(it as unknown as { title: string }).title}`, g, ox + tb[0], oy + tb[1] + tb[3] / 2, tb[2], 6, it.active ? HI : LO, 0);
  }
  if (mode === 'normal' && geo.thumb?.d) {
    const pts = parsePath(geo.thumb.d, ox, oy);
    b.poly('toc.rail', g, resample(pts, RAIL_N), LO);
    const m = /100% ([\d.]+)px/.exec(geo.thumb.svgClip ?? '');
    const on = m ? parseFloat(m[1]) : 0;
    const total = geo.thumb.rect?.[3] ?? 1;
    b.poly('toc.thumb', g, resample(pts, RAIL_N), 0.95, 1, Math.min(1, on / total));
    if (geo.thumb.dot) dot = [ox + geo.thumb.dot.rect[0] + geo.thumb.dot.rect[2] / 2, oy + geo.thumb.dot.rect[1] + geo.thumb.dot.rect[3] / 2];
  }
  return dot;
}

// ── per layout ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

function build(id: string, j: Raw): LayoutGeo {
  const b = new B();
  let dot: [number, number] = [720, 450];
  const sb = j.sidebar;
  const art = j.article;
  const one = <T,>(x: T[] | undefined) => (x && x.length ? x[0] : undefined);
  switch (id) {
    case 'docs': {
      b.panel('g:sidebar', 'sidebar', sb.box.css, { fill: 0.85, sep: [0, 1, 0, 0] });
      logo(b, 'sidebar', j.logoMark?.css, j.logo);
      b.box('sb.collapse', 'sidebar', [221, 16, 30, 30], 6, LO);
      search(b, 'sidebar', j.search);
      sidebarItems(b, 'sidebar', sb.items);
      if (sb.footer) {
        b.box('sb.footer', 'sidebar', sb.footer.css, 8, MID, 0.3);
        b.poly('sb.footer.div', 'sidebar', resample([sb.footer.css[0] + 172, sb.footer.css[1] + 6, sb.footer.css[0] + 172, sb.footer.css[1] + 30], 2), DIM);
      }
      github(b, 'sidebar', one(j.github));
      theme(b, 'sidebar', one(j.themeToggles));
      b.panel('g:main', 'main', [268, 0, 904, 900], { fill: 0, edge: 0 });
      article(b, 'main', art);
      b.panel('g:toc', 'toc', j.toc.box.css, { fill: 0, edge: 0 });
      dot = toc(b, 'toc', j.toc, 'normal') ?? dot;
      break;
    }
    case 'notebook':
    case 'notebook-top':
    case 'notebook-navbar': {
      const top = id === 'notebook-top';
      const hb = (j.headerBody?.css as R) ?? (j.header.css as R);
      b.panel('g:navbar', 'navbar', top ? hb : [j.header.css[0], 0, j.header.css[2], 56], { fill: 0.5, sep: [0, 0, 1, 0] });
      if (j.tabs) {
        b.panel('g:tabs', 'tabs', j.tabs.box.css, { fill: 0.5, sep: [0, 0, 1, 0] });
        for (const [i, it] of (j.tabs.items as Box[]).entries()) {
          const [x, y, w] = it.css;
          b.bar(`tab${i}`, 'tabs', x, y + 9, w, 6, (it.active as boolean) ? HI : LO);
          if (it.active) b.poly(`tab${i}.u`, 'tabs', resample([x, j.tabs.box.css[1] + 39, x + w, j.tabs.box.css[1] + 39], 2), 0.95, 1);
        }
      }
      const sg: GroupKey = 'sidebar';
      b.panel('g:sidebar', sg, sb.box.css, top ? { fill: 0, edge: 0, sep: [0, 0.3, 0, 0] } : { fill: 0.85, sep: [0, 1, 0, 0] });
      logo(b, top ? 'navbar' : 'sidebar', j.logoMark?.css, j.logo);
      if (!top) b.box('sb.collapse', 'sidebar', [221, 16, 30, 30], 6, LO);
      search(b, 'navbar', j.search);
      tabDropdown(b, 'sidebar', j.tabDropdown);
      sidebarItems(b, 'sidebar', sb.items);
      github(b, 'navbar', one(j.github));
      theme(b, 'navbar', one(j.themeToggles));
      if (top) b.ring('nav.toggle', 'navbar', 1406, 27.5, 15, MID);
      b.panel('g:main', 'main', j.main.css as R, { fill: 0, edge: 0 });
      article(b, 'main', art);
      b.panel('g:toc', 'toc', j.toc.box.css, { fill: 0, edge: 0 });
      dot = toc(b, 'toc', j.toc, 'normal') ?? dot;
      break;
    }
    case 'flux':
    case 'flux-open': {
      const open = id === 'flux-open';
      b.panel('g:main', 'main', [270, 0, 900, 900], { fill: 0, edge: 0 });
      article(b, 'main', art, 780);
      if (open && sb) {
        // the page tree as a full-screen blurred overlay: a frosted sheet + the tree column
        b.panel('g:overlay', 'overlay', [0, 0, 1440, 900], { z: 18, t: 2, fill: 0.2, glass: 0.55, edge: 0 });
        b.panel('g:sidebar', 'sidebar', sb.box.css, { z: 20, t: 2, fill: 0, edge: 0 });
        sidebarItems(b, 'sidebar', sb.items);
      }
      const f = j.flux;
      b.panel('g:panel', 'panel', f.panel.css, { r: f.panel.r, z: 34, t: 6, fill: 1, glass: 0.2 });
      logo(b, 'panel', j.logoMark?.css, j.logo);
      const tp = f.tocPopover;
      b.box('flux.toc', 'panel', tp.css, tp.r ?? 12, MID, 0.45);
      b.ring('flux.progress', 'panel', f.progress.css[0] + 9, f.progress.css[1] + 9, 8, LO);
      b.bar('flux.toc.t', 'panel', tp.css[0] + 36, tp.css[1] + tp.css[3] / 2, tw((tp.text as string) ?? '', 14), 6, MID);
      b.bar('flux.toc.chev', 'panel', tp.css[0] + tp.css[2] - 22, tp.css[1] + tp.css[3] / 2, 8, 2, LO);
      tabDropdown(b, 'panel', j.tabDropdown);
      github(b, 'panel', one(j.github));
      const si = one(j.searchIcons as Box[]);
      if (si) b.ring('search.icon', 'panel', si.css[0] + 15, si.css[1] + 15, 6, MID);
      b.box('flux.sidebar', 'panel', [813, 842, 22, 22], 5, MID);
      theme(b, 'panel', one(j.themeToggles));
      b.poly('flux.div1', 'panel', resample([733, 840, 733, 866], 2), DIM);
      b.poly('flux.div2', 'panel', resample([774, 840, 774, 866], 2), DIM);
      dot = [f.progress.css[0] + 9, f.progress.css[1] + 9];
      break;
    }
    case 'glass': {
      const gl = j.glass;
      b.panel('g:sidebar', 'sidebar', gl.sidebarCard.css, { r: 16, z: 28, t: 6, fill: 0.9, glass: 0.75 });
      logo(b, 'sidebar', j.logoMark?.css, j.logo);
      github(b, 'sidebar', one(j.github));
      b.box('sb.collapse', 'sidebar', [241, 19, 30, 30], 6, LO);
      tabDropdown(b, 'sidebar', j.tabDropdown);
      sidebarItems(b, 'sidebar', glassItems(sb.items), 884);
      const s = j.search as Box;
      b.panel('g:pills', 'pills', s.css, { r: 20, z: 28, t: 4, fill: 0.8, glass: 0.6 });
      search(b, 'pills', { ...s, r: 20 });
      const th = one(j.themeToggles as Box[]);
      if (th) {
        b.panel('g:pills2', 'pills', th.css, { r: 20, z: 28, t: 4, fill: 0.8, glass: 0.6 });
        theme(b, 'pills', th);
      }
      b.panel('g:main', 'main', [280, 0, 900, 900], { fill: 0, edge: 0 });
      article(b, 'main', art ?? glassArticle(j));
      b.panel('g:toc', 'toc', j.toc.box.css, { fill: 0, edge: 0 });
      dot = toc(b, 'toc', j.toc, 'mini') ?? dot;
      break;
    }
    case 'spacious': {
      const sp = j.spacious;
      b.panel('g:surface', 'surface', sp.surface.css, { fill: 1, edge: 0 });
      b.panel('g:sidebar', 'sidebar', sb.box.css, { fill: 0, edge: 0 });
      logo(b, 'sidebar', j.logoMark?.css, j.logo);
      b.box('sb.collapse', 'sidebar', [224, 20, 32, 32], 6, LO);
      tabDropdown(b, 'sidebar', j.tabDropdown);
      search(b, 'sidebar', j.search);
      sidebarItems(b, 'sidebar', sb.items);
      b.panel('g:page', 'page', sp.panel.css, { r: 16, z: 10, t: 4, fill: 0.1 });
      const bc = sp.breadcrumb;
      b.bar('bc.1', 'page', bc.css[0], bc.css[1] + 10, tw('Getting Started', 14), 6, LO);
      b.bar('bc.sep', 'page', bc.css[0] + tw('Getting Started', 14) + 6, bc.css[1] + 10, 4, 2, LO);
      b.bar('bc.2', 'page', bc.css[0] + tw('Getting Started/', 14) + 4, bc.css[1] + 10, tw('Quick Start', 14), 6, MID);
      for (const [i, it] of (sp.actions.items as Box[]).entries()) {
        if (i === 0) github(b, 'page', it);
        else for (let k = 0; k < 3; k++) b.dot(`sp.opt${k}`, 'page', it.css[0] + 9 + k * 6, it.css[1] + 15, 1.6, MID);
      }
      article(b, 'page', { ...art, breadcrumb: null });
      dot = toc(b, 'page', j.toc, 'block') ?? dot;
      break;
    }
    case 'home': {
      const h = j.home;
      b.panel('g:navbar', 'navbar', h.nav.css, { fill: 0.5, sep: [0, 0, 1, 0] });
      logo(b, 'navbar', j.logoMark?.css, j.logo);
      for (const [i, l] of (h.navLinks as Box[]).entries()) {
        if (i === 0 || !l.text) continue;
        b.bar(`nav.${l.text}`, 'navbar', l.css[0] + 8, l.css[1] + l.css[3] / 2, l.css[2] - 16, 6, MID);
      }
      search(b, 'navbar', j.search);
      theme(b, 'navbar', one(j.themeToggles));
      github(b, 'navbar', one(j.github));
      const bd = h.badge;
      b.box('home.badge', 'hero', bd.css, bd.css[3] / 2, MID, 0.25, 1);
      b.bar('home.badge.t', 'hero', bd.css[0] + 12, bd.css[1] + bd.css[3] / 2, bd.css[2] - 24, 5, MID, 1);
      (h.title.lines as R[]).forEach((ln, i) => b.bar(`home.title${i}`, 'hero', ln[0] + 6, ln[1] + ln[3] / 2 + 4, ln[2] - 12, 38, HI));
      const d = h.description.css as R;
      wrap((h.description.text as string) ?? '', d[2], 18).forEach((lw, i) => b.bar(`home.desc${i}`, 'hero', d[0] + (d[2] - lw) / 2, d[1] + 14 + i * 28, lw, 8, LO));
      for (const [i, c] of (h.ctas as Box[]).entries()) {
        b.box(`home.cta${i}`, 'hero', c.css, c.css[3] / 2, i === 0 ? HI : MID, i === 0 ? 1 : 0.3, 0);
        b.bar(`home.cta${i}.t`, 'hero', c.css[0] + 22, c.css[1] + c.css[3] / 2, c.css[2] - 44, 6, i === 0 ? 0.08 : MID);
      }
      const im = h.image.css as R;
      b.panel('g:hero', 'hero', [im[0], im[1], im[2], 900 - im[1] + 30], { r: 16, z: 4, t: 4, fill: 0.5 });
      b.dot('home.img.logo', 'hero', im[0] + 44, im[1] + 46, 13, HI, 1);
      b.bar('home.img.l0', 'hero', im[0] + 66, im[1] + 46, 150, 20, HI);
      b.bar('home.img.l1', 'hero', im[0] + 30, im[1] + 120, 440, 28, HI);
      b.bar('home.img.l2', 'hero', im[0] + 30, im[1] + 178, 560, 28, HI);
      b.ring('home.img.glow', 'hero', im[0] + im[2] - 220, im[1] + 230, 210, 0.7, 1);
      dot = [h.ctas[0].css[0] + 14, h.ctas[0].css[1] + h.ctas[0].css[3] / 2];
      break;
    }
  }
  return { id, els: b.els, dot };
}

/** Glass sidebar: the capture lists folders only; synthesize the open folders' pages (32 px rows). */
function glassItems(items: SbItem[]): SbItem[] {
  const pages: Record<string, string[]> = {
    'Getting Started': ['Introduction', 'Quick Start', 'What is Fumadocs', 'Comparisons'],
    Layouts: ['Docs Layout', 'Notebook', 'Flux', 'Glass', 'Spacious', 'Home Layout', 'Themes'],
    Components: ['Accordion', 'Banner', 'Code Block', 'Files', 'Steps', 'Tabs', 'Type Table', 'Search'],
  };
  const hasPages = items.some((it) => it.kind === 'page');
  if (hasPages) return items;
  const out: SbItem[] = [];
  for (const it of items) {
    out.push(it);
    const kids = pages[it.text];
    if (it.kind === 'folder' && kids) {
      kids.forEach((p, i) => out.push({ css: [it.css[0], it.css[1] + 32 * (i + 1), it.css[2], 32], kind: 'page', depth: 1, active: p === 'Quick Start', text: p }));
    }
  }
  return out;
}

/** Glass article boxes (missing from the capture): the Docs article shifted into the 900 px main column. */
function glassArticle(j: Raw) {
  void j;
  return null;
}

export const GEO = new Map<string, LayoutGeo>();
export const GEO_IDS = ['docs', 'notebook', 'notebook-top', 'notebook-navbar', 'flux', 'flux-open', 'glass', 'spacious', 'home'] as const;

export async function loadGeo(e: Engine) {
  const raw = new Map<string, Raw>();
  await Promise.all(
    GEO_IDS.map(async (id) => {
      raw.set(id, await e.assets.loadJSON(`/plates/layouts/${id}.boxes.json`));
    }),
  );
  await document.fonts.ready;
  // Glass has no article boxes: reuse the Docs article, moved into Glass's main column (x +2, y +8, 852 wide)
  const docs = raw.get('docs');
  const glass = raw.get('glass');
  if (glass && !glass.article && docs?.article) {
    const shift = (r: R): R => [r[0] + 2, r[1] + 8, Math.min(r[2], 852), r[3]];
    const deep = (o: Raw): Raw => {
      if (Array.isArray(o) && o.length === 4 && o.every((v) => typeof v === 'number')) return shift(o as R);
      if (Array.isArray(o)) return o.map(deep);
      if (o && typeof o === 'object') {
        const out: Raw = {};
        for (const [k, v] of Object.entries(o)) out[k] = k === 'px' ? v : deep(v);
        return out;
      }
      return o;
    };
    glass.article = deep(docs.article);
  }
  for (const [id, j] of raw) GEO.set(id, build(id, j));
}

/** Projection crops per capture: viewport regions that travel with a wireframe panel (by panel key). */
export interface Crop {
  panel: string;
  rect: R;
  /** corner radius of the visible piece (px) */
  r: number;
}

export const CROPS: Record<string, Crop[]> = {
  docs: [
    { panel: 'g:main', rect: [268, 0, 904, 900], r: 0 },
    { panel: 'g:toc', rect: [1172, 0, 268, 900], r: 0 },
    { panel: 'g:sidebar', rect: [0, 0, 268, 900], r: 0 },
  ],
  'notebook-top': [
    { panel: 'g:main', rect: [268, 96, 904, 804], r: 0 },
    { panel: 'g:toc', rect: [1172, 96, 268, 804], r: 0 },
    { panel: 'g:sidebar', rect: [0, 96, 268, 804], r: 0 },
    { panel: 'g:tabs', rect: [0, 56, 1440, 40], r: 0 },
    { panel: 'g:navbar', rect: [0, 0, 1440, 56], r: 0 },
  ],
  notebook: [
    { panel: 'g:main', rect: [268, 56, 904, 844], r: 0 },
    { panel: 'g:toc', rect: [1172, 56, 268, 844], r: 0 },
    { panel: 'g:navbar', rect: [268, 0, 1172, 56], r: 0 },
    { panel: 'g:sidebar', rect: [0, 0, 268, 900], r: 0 },
  ],
  'notebook-navbar': [
    { panel: 'g:main', rect: [268, 96, 904, 804], r: 0 },
    { panel: 'g:toc', rect: [1172, 96, 268, 804], r: 0 },
    { panel: 'g:navbar', rect: [268, 0, 1172, 56], r: 0 },
    { panel: 'g:tabs', rect: [268, 56, 1172, 40], r: 0 },
    { panel: 'g:sidebar', rect: [0, 0, 268, 900], r: 0 },
  ],
  flux: [
    { panel: 'g:main', rect: [0, 0, 1440, 900], r: 0 },
    { panel: 'g:panel', rect: [530, 786, 380, 90], r: 16 },
  ],
  'flux-open': [
    { panel: 'g:main', rect: [0, 0, 1440, 900], r: 0 },
    { panel: 'g:panel', rect: [530, 786, 380, 90], r: 16 },
  ],
  glass: [
    { panel: 'g:main', rect: [280, 0, 1160, 900], r: 0 },
    { panel: 'g:sidebar', rect: [8, 8, 272, 884], r: 16 },
    { panel: 'g:pills', rect: [1158, 8, 200, 40], r: 20 },
    { panel: 'g:pills2', rect: [1366, 8, 66, 40], r: 20 },
  ],
  spacious: [
    { panel: 'g:sidebar', rect: [0, 0, 268, 900], r: 0 },
    { panel: 'g:page', rect: [268, 8, 1164, 884], r: 16 },
  ],
  home: [
    { panel: 'g:hero', rect: [0, 56, 1440, 844], r: 0 },
    { panel: 'g:navbar', rect: [0, 0, 1440, 56], r: 0 },
  ],
};
