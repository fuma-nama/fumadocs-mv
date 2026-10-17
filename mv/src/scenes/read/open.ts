import * as THREE from 'three';
import { ease, seg, track, clamp, lerp, type Ease, type Key } from '../../engine/anim';
import { drawCaret, caretBlink } from '../intro/caret';
import { TITLE } from '../intro/title';
import { LAYOUT_HERO, pointOn } from '../toc/toc-geometry';
import { C } from '../_shared/palette';
import type { CurlParams } from './curl';
import type { Stage } from './stage';
import { T } from './timeline';
import { project } from './world';
import { text, crosshair, boxLabel } from '../../engine/draw2d';
import { at } from '../../engine/time';

/** S1 · open (13.6–16.0): the title page turns like a book cover; the caret becomes the TOC dot. */

export const inOutSine: Ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);

/** caret lands on the TOC thumb (bar 10 beat 3) */
export const LAND = 15.2;

const TURN = 0.75;
export function curlAt(t: number): CurlParams {
  const W = 1440;
  const a = seg(t, T.lift, T.open, ease.inOutQuad); // anticipation: the corner peels
  if (t < T.open) return { theta: 0, s0: W - 150 * a, slope: 0.6, R: 70, phi: 0.95 * a, lift: 0, dx: 0 };
  const p = clamp((t - T.open) / TURN);
  const k = (keys: [number, number][], e: Ease = ease.inOutCubic): number => track(p, keys.map(([x, y]) => [x, y, e] as Key));
  return {
    theta: Math.PI * k([[0, 0], [1, 1]], inOutSine),
    s0: k([[0, W - 150], [0.4, 520], [0.8, 900], [1, W]]),
    slope: k([[0, 0.6], [0.6, 0.1], [1, 0]]),
    R: k([[0, 70], [0.5, 300], [1, 500]]),
    phi: k([[0, 0.95], [0.35, 1.05], [0.68, -0.35], [1, 0]]),
    // the turned cover is pulled away to the left before the bar-11 whip
    lift: 30 * seg(t, 15.5, 15.95, ease.inQuad),
    dx: -1700 * seg(t, 15.5, 15.95, ease.inCubic),
  };
}

/** The real TOC thumb dot position (world) for item `idx` active. */
export function thumbWorld(st: Stage, idx = 0, dx = 0): THREE.Vector3 {
  const [x, y] = pointOn(LAYOUT_HERO.pts, LAYOUT_HERO.lens[idx][1]);
  const [ox, oy] = st.A.model.tocOrigin;
  return st.page.localToWorld(new THREE.Vector3(ox + x + dx, -(oy + y), 1.6));
}

/** Caret handed over from the intro at 14.4: hovers while the page turns, then flies into the TOC dot. */
export function drawFlyingCaret(c: CanvasRenderingContext2D, st: Stage, t: number) {
  if (t < T.open || t >= LAND + 0.02) return;
  const cr = TITLE.caret;
  // the caret's spot on the title sheet (z = 5), in world units (1 css px of the 1440 page = 1920/1440 frame px)
  const k = 1440 / 1920;
  const home = new THREE.Vector3(cr.x * k - 720, 405 - cr.y * k, 5);
  const hover = home.clone().add(new THREE.Vector3(-20, 10, 90 * seg(t, T.open, 14.95, ease.outCubic)));
  const shrink = lerp(1, 0.5, seg(t, T.open, 14.9, ease.outCubic));
  const dot = thumbWorld(st);
  const q = seg(t, 14.95, LAND, ease.inOutCubic);
  const pos = hover.clone().lerp(dot, q);
  pos.z += Math.sin(q * Math.PI) * 120;
  const w = Math.exp(lerp(Math.log(cr.w * k * shrink), Math.log(4), ease.inQuad(q)));
  const h = Math.exp(lerp(Math.log(cr.h * k * shrink), Math.log(4), ease.inCubic(q)));
  const P = project(st.cam, pos.x, pos.y, pos.z);
  const Px = project(st.cam, pos.x + w, pos.y, pos.z);
  const Py = project(st.cam, pos.x, pos.y + h, pos.z);
  const sw = Math.hypot(Px.x - P.x, Px.y - P.y);
  const sh = Math.hypot(Py.x - P.x, Py.y - P.y);
  const alpha = t < T.open + 0.2 ? caretBlink(t) : 1;
  if (q < 0.8) drawCaret(c, P.x, P.y, { h: sh, w: sw, glow: 0.45 * (1 - q), alpha, snap: false });
  else {
    c.save();
    c.fillStyle = C.ORANGE;
    c.beginPath();
    c.roundRect(P.x - sw / 2, P.y - sh / 2, sw, sh, (Math.min(sw, sh) / 2) * clamp((q - 0.8) / 0.2));
    c.fill();
    c.restore();
  }
}

/** ping ring where the caret lands */
export function drawLandingPing(c: CanvasRenderingContext2D, st: Stage, t: number) {
  const p = seg(t, LAND, LAND + 0.55, ease.outCubic);
  if (p <= 0 || p >= 1) return;
  const d = thumbWorld(st);
  const P = project(st.cam, d.x, d.y, d.z);
  c.save();
  c.strokeStyle = C.ORANGE;
  c.lineWidth = 1.25;
  c.globalAlpha = (1 - p) * 0.9;
  c.beginPath();
  c.arc(P.x, P.y, 3 + 46 * p, 0, Math.PI * 2);
  c.stroke();
  c.globalAlpha = (1 - p) * 0.5;
  c.beginPath();
  c.arc(P.x, P.y, 3 + 22 * ease.outExpo(p), 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

/**
 * P1PE drawing marks on the desk around the settled page (15.4–16.0): registration marks at the
 * corners, dimension lines (1440 / 810 css), file + figure metadata. They draw on toward the bar-11
 * downbeat and clear during the whip into the exploded view.
 */
export function drawDeskMarks(c: CanvasRenderingContext2D, st: Stage, t: number) {
  const on = seg(t, 15.42, 15.95, ease.outCubic) * (1 - seg(t, at(11) - 0.08, at(11) + 0.1, ease.inCubic));
  if (on <= 0) return;
  const m = st.A.model;
  const v = new THREE.Vector3();
  const P = (x: number, y: number) => {
    v.set(x, -y, 0);
    st.page.localToWorld(v);
    return project(st.cam, v.x, v.y, v.z);
  };
  const ink = 'rgba(10,10,11,0.62)';
  c.save();
  c.lineWidth = 1;
  c.strokeStyle = ink;
  c.fillStyle = ink;
  // corner registration marks
  // (no bottom-left mark: that corner sits in the verse lyric band)
  const corners: [number, number, number, number][] = [[0, 0, -1, -1], [m.vw, 0, 1, -1], [m.vw, m.vh, 1, 1]];
  corners.forEach(([x, y, sx, sy], i) => {
    const k = seg(on, i * 0.08, 0.5 + i * 0.08);
    if (k <= 0) return;
    const p = P(x + sx * 26, y + sy * 26);
    c.globalAlpha = k;
    crosshair(c, Math.round(p.x) + 0.5, Math.round(p.y) + 0.5, 9 * k, 1, ink, 0);
    c.beginPath();
    c.arc(p.x, p.y, 5 * k, 0, Math.PI * 2);
    c.stroke();
  });
  c.globalAlpha = 1;
  // dimension lines: top edge (1440) and left edge (810)
  const dim = (a: { x: number; y: number }, b: { x: number; y: number }, label: string, k: number, side: number) => {
    if (k <= 0) return;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const hx = (b.x - a.x) / 2 * k, hy = (b.y - a.y) / 2 * k;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / len * side, ny = (b.x - a.x) / len * side;
    c.beginPath();
    c.moveTo(mx - hx, my - hy);
    c.lineTo(mx + hx, my + hy);
    for (const e of [-1, 1]) {
      const ex = mx + hx * e, ey = my + hy * e;
      c.moveTo(ex - nx * 5, ey - ny * 5);
      c.lineTo(ex + nx * 5, ey + ny * 5);
    }
    c.stroke();
    c.save();
    c.translate(mx + nx * 13, my + ny * 13);
    let ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (ang > Math.PI / 2) ang -= Math.PI;
    if (ang < -Math.PI / 2) ang += Math.PI;
    c.rotate(ang);
    c.globalAlpha = k;
    text(c, label, 0, 4, { font: 'mono', size: 11, align: 'center', color: 'rgba(10,10,11,0.75)' });
    c.restore();
  };
  dim(P(0, -18), P(m.vw, -18), '1440 css · 2880 px', seg(on, 0.1, 0.8), -1);
  dim(P(-18, 0), P(-18, m.vh), '810', seg(on, 0.2, 0.9), 1);
  // metadata under the bottom-right corner
  const br = P(m.vw, m.vh + 44);
  c.globalAlpha = seg(on, 0.4, 1);
  text(c, 'content/docs/getting-started/introduction.mdx', br.x, br.y, { font: 'mono', size: 11, align: 'right', color: 'rgba(10,10,11,0.7)' });
  const tl = P(0, -50);
  boxLabel(c, 'FIG.01', tl.x + 30, tl.y - 4, { size: 11, color: 'rgba(10,10,11,0.8)', padX: 8, padY: 5 });
  c.restore();
}
