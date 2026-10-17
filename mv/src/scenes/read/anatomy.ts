import * as THREE from 'three';
import { ease, seg, clamp } from '../../engine/anim';
import { at } from '../../engine/time';
import { C } from '../_shared/palette';
import type { LayerId, Rect } from './page';
import type { Stage } from './stage';
import { quadOutline, leader, labelBlock } from './annot';
import { text, boxLabel } from '../../engine/draw2d';
import { project } from './world';

/**
 * S2 · anatomy (bars 11–12): an exploded-view diagram of the real page. On the bar-11 downbeat
 * every part leaves the empty layout frame along its own direction — sidebar to the left, TOC to
 * the right, search up and toward the viewer, the article up, the breadcrumb above it. Each part
 * is cropped to its own element (opaque, real pixels, a subtle glass rim). On its beat the named
 * part pulls out further, brightens and gets the orange scan line while the others dim; on the
 * bar-13 downbeat they slam back into the exact page.
 */

export interface Part {
  id: string;
  num: string;
  label: string;
  jp: string;
  meta: string;
  /** hit it is named on */
  t: number;
  layers: LayerId[];
  /** element bounds (page css) */
  rect: Rect;
  /** explode offset at full explosion (page css: x right, y toward the viewer, z up) */
  dir: { x: number; y: number; z: number };
  /** label block: screen anchor and which side of it the block sits */
  label2d: { x: number; y: number; side: -1 | 1 };
}

/** parts land on the groove's hits (kick 1 · 2& · 3&, snare 2 · 4), not a metronome */
export const PARTS: Part[] = [
  { id: 'layout', num: '00', label: 'DOCS LAYOUT', jp: 'レイアウト', meta: 'sidebar 268 · main · toc 268', t: at(11, 1), layers: ['background'], rect: { x: 0, y: 0, w: 1440, h: 810 }, dir: { x: 0, y: 0, z: 0 }, label2d: { x: 545, y: 800, side: -1 } },
  { id: 'sidebar', num: '01', label: 'SIDEBAR', jp: 'ページツリー', meta: '#nd-sidebar · page tree', t: at(11, 2), layers: ['sidebar.bg', 'sidebar.header', 'sidebar.tree', 'sidebar.footer'], rect: { x: 0, y: 0, w: 268, h: 810 }, dir: { x: -320, y: 0, z: 160 }, label2d: { x: 545, y: 500, side: -1 } },
  { id: 'search', num: '02', label: 'SEARCH', jp: '検索 ⌘K', meta: '<SearchDialog /> · orama', t: at(11, 3.5), layers: ['sidebar.search'], rect: { x: 15, y: 58, w: 236, h: 36 }, dir: { x: -150, y: 60, z: 460 }, label2d: { x: 545, y: 350, side: -1 } },
  { id: 'breadcrumb', num: '03', label: 'BREADCRUMB', jp: 'パンくず', meta: 'Getting Started › Introduction', t: at(11, 4), layers: ['breadcrumb'], rect: { x: 302, y: 56, w: 206, h: 20 }, dir: { x: 40, y: -60, z: 380 }, label2d: { x: 545, y: 200, side: -1 } },
  { id: 'article', num: '04', label: 'ARTICLE', jp: '本文', meta: 'content/docs/introduction.mdx', t: at(12, 1), layers: ['article.body', 'page.header'], rect: { x: 270, y: 0, w: 900, h: 810 }, dir: { x: 0, y: 0, z: 160 }, label2d: { x: 545, y: 650, side: -1 } },
  { id: 'toc', num: '05', label: 'TOC', jp: '目次', meta: '#nd-toc · normal', t: at(12, 2), layers: ['toc'], rect: { x: 1172, y: 0, w: 268, h: 810 }, dir: { x: 320, y: 0, z: 160 }, label2d: { x: 1450, y: 905, side: 1 } },
];

const PART_OF = new Map<LayerId, Part>();
for (const p of PARTS) for (const l of p.layers) PART_OF.set(l, p);
export const partOf = (l: LayerId) => PART_OF.get(l)!;

/** explosion amount 0..1: out on bar 11, slam back to 0 exactly on the bar-13 downbeat */
export function explodeAmount(t: number): number {
  const T0 = at(11);
  const T1 = at(13);
  if (t < T0 - 0.12 || t >= T1) return 0;
  const out = ease.outExpo(seg(t, T0 - 0.12, T0 + 0.5));
  const back = 1 - ease.inExpo(seg(t, T1 - 0.28, T1));
  return out * back;
}

/** the part being named (most recent hit), until the full diagram holds */
export function currentPart(t: number): Part | undefined {
  let cur: Part | undefined;
  for (const p of PARTS) if (t >= p.t) cur = p;
  return t < at(12, 3) ? cur : undefined;
}

/** extra pull-out (0..1) of a part while it is the named one */
export function partFocus(p: Part, t: number): number {
  const next = PARTS.find((q) => q.t > p.t)?.t ?? at(12, 3);
  const inn = ease.outBack(clamp((t - p.t) / 0.32), 1.6);
  const out = seg(t, next, next + 0.3, ease.inOutCubic);
  return t < p.t ? 0 : inn * (1 - out);
}

/** visibility weight: the named part 1, the others dim to 0.7 (no part named: all 1) */
export function partWeight(p: Part, t: number): number {
  const cur = currentPart(t);
  // the empty layout frame is the ground of the diagram: it never dims
  if (!cur || p === cur || cur.id === 'layout' || p.id === 'layout') return 1;
  return 1 - 0.3 * seg(t, cur.t, cur.t + 0.16, ease.outCubic);
}

/** "brightens": a short lift on the named part's hit */
export const partFlash = (p: Part, t: number) => (t >= p.t ? Math.exp(-(t - p.t) / 0.16) * 0.22 : 0);

export interface Offset {
  x: number;
  y: number;
  z: number;
  /** magnification about the part's centre (detail callout for small parts) */
  s: number;
}

/** small parts are magnified like a detail callout while exploded (and more when named) */
const MAGNIFY: Record<string, number> = { search: 1.45, breadcrumb: 1.6 };

/** offset (page css) of a part at time t: its explode direction + the named part pulled further */
export function partOffset(p: Part, t: number, kick = 0): Offset {
  if (p.id === 'layout') return { x: 0, y: 0, z: 0, s: 1 };
  const k = explodeAmount(t);
  const f = partFocus(p, t) * k;
  const d = p.dir;
  const n = Math.hypot(d.x, d.y, d.z) || 1;
  const pull = 70;
  return {
    x: d.x * k + (d.x / n) * pull * f,
    y: d.y * k + (d.y / n) * pull * f,
    z: d.z * k + ((d.z / n) * pull + 26) * f - kick * 8 * k,
    s: 1 + ((MAGNIFY[p.id] ?? 1) - 1) * k + 0.25 * f * (MAGNIFY[p.id] ? 1 : 0),
  };
}

/** a point of a part (page css) after its explode offset and magnification */
export function partPoint(p: Part, o: Offset, x: number, y: number): [number, number] {
  const cx = p.rect.x + p.rect.w / 2, cy = p.rect.y + p.rect.h / 2;
  return [cx + (x - cx) * o.s + o.x, cy + (y - cy) * o.s + o.y];
}

/** offset of every layer at time t */
export function explodeAt(t: number, kick = 0): Record<LayerId, Offset> {
  const out = {} as Record<LayerId, Offset>;
  for (const p of PARTS) {
    const o = partOffset(p, t, kick);
    for (const l of p.layers) out[l] = o;
  }
  return out;
}

/** real layout facts for the % tags (share of the 1440×810 viewport) */
const PCT: Record<string, number> = {
  layout: 100,
  sidebar: (268 / 1440) * 100,
  search: ((236 * 36) / (1440 * 810)) * 100,
  breadcrumb: ((206 * 20) / (1440 * 810)) * 100,
  article: (900 / 1440) * 100,
  toc: (268 / 1440) * 100,
};
/** legend scale: sized to read on a phone (label ≈ 25 px Michroma) */
const LEGEND_K = 1.45;
/** left edge of the legend table (aligned with the boxed READ) */
const LEGEND_LEFT = 74;
/** where each leader hits its part (page css, on the element) */
const ANCHOR: Record<string, [number, number]> = {
  layout: [0, 810],
  sidebar: [30, 300],
  search: [24, 76],
  breadcrumb: [306, 66],
  article: [312, 300],
  toc: [1200, 760],
};

/** S2 overlay: part outlines (the layout frame + guides), scan line, leaders and labels. */
export function drawAnatomy(c: CanvasRenderingContext2D, st: Stage, t: number) {
  const k = explodeAmount(t);
  if (k <= 0.001) return;
  const v = new THREE.Vector3();
  const proj = (x: number, y: number, z: number) => {
    v.set(x, -y, z);
    st.page.localToWorld(v);
    return project(st.cam, v.x, v.y, v.z);
  };
  const cur = currentPart(t);
  const corners = (p: Part, r: Rect, o: Offset, z: number) =>
    [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(([x, y]) => {
      const [px, py] = partPoint(p, o, x, y);
      return proj(px, py, z);
    });
  // the empty layout frame: full outline + dashed column guides
  const base = PARTS[0];
  const bon = seg(t, at(11) - 0.05, at(11) + 0.4, ease.outCubic) * k;
  quadOutline(c, corners(base, base.rect, { x: 0, y: 0, z: 0, s: 1 }, 1), bon, cur === base ? C.ORANGE : 'rgba(10,10,11,0.55)', cur === base ? 1.5 : 1, 8);
  c.save();
  c.setLineDash([4, 5]);
  c.strokeStyle = 'rgba(10,10,11,0.4)';
  c.lineWidth = 1;
  for (const gx of [268, 1172]) {
    const a = proj(gx, 0, 1), b = proj(gx, 810 * bon, 1);
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
  c.restore();
  for (const part of PARTS) {
    const o = partOffset(part, t);
    const z = o.z + 2;
    const on = seg(t, at(11) + 0.04, at(11) + 0.45, ease.outCubic) * k;
    const named = part === cur;
    if (part !== base) {
      const m = 6;
      const r = { x: part.rect.x - m, y: part.rect.y - m, w: part.rect.w + 2 * m, h: part.rect.h + 2 * m };
      quadOutline(c, corners(part, r, o, z), on, named ? C.ORANGE : 'rgba(10,10,11,0.35)', named ? 1.5 : 1, named ? 10 : 0);
    }
    // print-head scan across the named part as it is pulled out
    const sp = seg(t, part.t + 0.02, part.t + 0.34, ease.inOutCubic);
    if (named && sp > 0 && sp < 1) {
      const x = part.rect.x + part.rect.w * sp;
      const [x0, y0] = partPoint(part, o, x, part.rect.y);
      const [x1, y1] = partPoint(part, o, x, part.rect.y + part.rect.h);
      const a0 = proj(x0, y0, z + 1), a1 = proj(x1, y1, z + 1);
      c.save();
      c.strokeStyle = C.ORANGE;
      c.lineWidth = 2;
      c.globalAlpha = Math.sin(sp * Math.PI);
      c.beginPath();
      c.moveTo(a0.x, a0.y);
      c.lineTo(a1.x, a1.y);
      c.stroke();
      c.restore();
    }
    const pon = partOn(part, t);
    if (pon > 0) {
      const [ax, ay] = partPoint(part, o, ...ANCHOR[part.id]);
      const a = proj(ax, ay, z + 2);
      const l = part.label2d;
      const col = named ? C.ORANGE : 'rgba(10,10,11,0.75)';
      leader(c, a, { x: l.x, y: l.y }, seg(t, part.t, part.t + 0.22, ease.outCubic) * (pon > 0.999 ? 1 : pon), col);
      const fadeOut = 1 - seg(t, at(13) - 0.32, at(13) - 0.08, ease.inCubic);
      labelBlock(c, l.x, l.y, { num: part.num, label: part.label, jp: part.jp, meta: part.meta, pct: PCT[part.id] }, seg(t, part.t + 0.08, part.t + 0.4, ease.outCubic), named, l.side, C.INK, fadeOut, LEGEND_K, l.side < 0 ? LEGEND_LEFT : undefined);
    }
  }
}

/** 0..1 presence of a part's annotation (draws on at its beat, clears before the slam). */
export function partOn(p: Part, t: number): number {
  return seg(t, p.t, p.t + 0.28, ease.outCubic) * (1 - seg(t, at(13) - 0.32, at(13) - 0.08, ease.inCubic));
}

/** figure title block (top-left): the section's boxed word + figure caption */
export function drawFigureTitle(c: CanvasRenderingContext2D, t: number) {
  const on = seg(t, at(11), at(11) + 0.35, ease.outCubic) * (1 - seg(t, at(13) - 0.3, at(13) - 0.05, ease.inCubic));
  if (on <= 0) return;
  c.save();
  c.globalAlpha = on;
  const b = boxLabel(c, 'READ', 96, 106, { size: 26, tracking: 0.42, color: C.INK, ticks: true, padX: 22, padY: 13 });
  const x = b.x + b.w + 34;
  text(c, 'FIG.01 — ANATOMY OF A PAGE', x, 100, { font: 'wide', size: 16, tracking: 0.24, color: C.INK });
  text(c, 'fumadocs-ui 16.17.1 · docs layout · 1440×810 @2x · neutral + #FA8023', x, 125, { font: 'mono', size: 13, color: '#5E5E66' });
  c.restore();
}

/** the slam on the bar-13 downbeat: the parts stamp into one page (orange outline + shockwave) */
export function drawSlam(c: CanvasRenderingContext2D, st: Stage, t: number) {
  const T1 = at(13);
  const p = (t - T1) / 0.45;
  if (p < 0 || p >= 1) return;
  const m = st.A.model;
  const v = new THREE.Vector3();
  const proj = (x: number, y: number) => {
    v.set(x, -y, 1);
    st.page.localToWorld(v);
    return project(st.cam, v.x, v.y, v.z);
  };
  const grow = (k: number) => {
    const g = 1 + k;
    const cx = m.vw / 2, cy = m.vh / 2;
    return [[0, 0], [m.vw, 0], [m.vw, m.vh], [0, m.vh]].map(([x, y]) => proj(cx + (x - cx) * g, cy + (y - cy) * g));
  };
  c.save();
  c.globalAlpha = (1 - p) ** 1.5;
  quadOutline(c, grow(0), 1, C.ORANGE, 2);
  c.globalAlpha = (1 - p) ** 2 * 0.8;
  quadOutline(c, grow(0.28 * ease.outExpo(p)), 1, C.ORANGE, 1);
  c.restore();
}
