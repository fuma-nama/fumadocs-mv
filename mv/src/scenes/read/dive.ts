import { ease, seg, clamp } from '../../engine/anim';
import { at } from '../../engine/time';
import { LAYOUT_HERO, landingState, pointOn, type TocDrawState } from '../toc/toc-geometry';
import type { Heading, PageModel } from './page';
import { cubicBezier, type CamPose } from './world';

/**
 * S5 · scroll + dive (bar 16 → 25.6). Enter on the bar-16 downbeat: the page scrolls to
 * #table-of-contents (real scroll target, 2018 css) while the TOC's active range and thumb follow
 * the real rules (every heading ≥ 90 % visible is active; thumb at the end of the range; CSS
 * transitions 150 ms cubic-bezier(.4,0,.2,1)). The camera turns frontal and dives into the thumb,
 * landing with zero velocity on TOC's contract frame (S 6, O (549, −96)) at 25.6.
 */

export const SCROLL0 = at(16) + 0.05; // 24.05
export const SCROLL1 = at(16) + 0.6; // 24.6
export const LANDING = at(17); // 25.6
const DIVE0 = at(16) + 0.3; // log-zoom starts (camera already turning frontal)

const twEase = cubicBezier(0.4, 0, 0.2, 1);
/** scroll-behavior-like: quick start, long soft landing */
const scrollEase = cubicBezier(0.55, 0, 0.1, 1);

export function scrollAt(t: number, m: PageModel): number {
  return m.targetScroll * scrollEase(seg(t, SCROLL0, SCROLL1));
}

/** real active set for a scroll position (indices into the TOC rows) */
function activeSet(scroll: number, hs: Heading[]): number[] {
  const out: number[] = [];
  hs.forEach((h, i) => {
    if (scroll >= h.range[0] && scroll <= h.range[1]) out.push(i);
  });
  if (!out.length) {
    // fallback: the heading closest to the viewport top
    let best = 0;
    let d = Infinity;
    hs.forEach((h, i) => {
      const dd = Math.abs(h.top - scroll);
      if (dd < d) {
        d = dd;
        best = i;
      }
    });
    out.push(best);
  }
  return out;
}

interface Target {
  top: number;
  bottom: number;
  dot: number;
  active: number[];
}
function targetOf(scroll: number, hs: Heading[]): Target {
  const a = activeSet(scroll, hs);
  const s = a[0], e = a[a.length - 1];
  const L = LAYOUT_HERO;
  return { top: L.rows[s].top, bottom: L.rows[e].bottom, dot: L.lens[e][1], active: a };
}

/**
 * TOC draw state at t during the scroll, simulating the CSS transitions (150 ms) on the clip
 * range and the thumb's offset-distance: each change restarts from the current value.
 */
export function tocScrollState(t: number, m: PageModel): Omit<TocDrawState, 'S' | 'ox' | 'oy'> {
  const hs = m.headings;
  const dt = 1 / 240;
  let cur = targetOf(0, hs);
  let from = { ...cur };
  let shown = { ...cur };
  let tc = -1;
  for (let x = SCROLL0; x <= Math.min(t, SCROLL1 + 0.3) + 1e-9; x += dt) {
    const tg = targetOf(scrollAt(x, m), hs);
    if (tg.top !== cur.top || tg.bottom !== cur.bottom || tg.dot !== cur.dot) {
      from = { ...shown };
      cur = tg;
      tc = x;
    }
    const k = tc < 0 ? 1 : twEase(clamp((x - tc) / 0.15));
    shown = { top: from.top + (cur.top - from.top) * k, bottom: from.bottom + (cur.bottom - from.bottom) * k, dot: from.dot + (cur.dot - from.dot) * k, active: cur.active };
  }
  if (tc >= 0) {
    const k = twEase(clamp((t - tc) / 0.15));
    shown = { top: from.top + (cur.top - from.top) * k, bottom: from.bottom + (cur.bottom - from.bottom) * k, dot: from.dot + (cur.dot - from.dot) * k, active: cur.active };
  }
  const textActive = new Float32Array(LAYOUT_HERO.rows.length);
  for (const i of shown.active) textActive[i] = 1;
  return { trackTop: shown.top, trackBottom: shown.bottom, dotDist: shown.dot, textActive };
}

/**
 * Dive progress 0..1: a smooth push to 55 % (24.3 → 25.2, ends at rest), then four zoom punches
 * on the snare fill's 16ths (25.2, 25.3, 25.4, 25.5), the last one settling at rest on 25.6.
 */
export function diveProgress(t: number): number {
  const FILL = at(16, 4);
  if (t < FILL) {
    const u = seg(t, DIVE0, FILL);
    return 0.55 * (u * u * u * (u * (u * 6 - 15) + 10));
  }
  const x = Math.min(3.999999, (t - FILL) / 0.1);
  const k = Math.floor(x);
  const f = Math.min(1, (t - FILL - k * 0.1) / 0.085);
  const step = 1 - (1 - clamp(f)) ** 4;
  return t >= LANDING ? 1 : 0.55 + 0.45 * ((k + step) / 4);
}

/** screen = O + S · css(TOCItems). Returns the dive transform at t (24.3 → 25.6). */
export function diveSO(t: number, m: PageModel, s0: number): { S: number; ox: number; oy: number } {
  const land = landingState();
  const e = diveProgress(t);
  const S = s0 * Math.pow(land.S / s0, e);
  // the thumb is the anchor: its screen path eases to the contract position while the zoom grows
  const [ox0, oy0] = startO(m, s0);
  const [ax, ay] = pointOn(LAYOUT_HERO.pts, land.dotDist);
  const sx0 = ox0 + ax * s0, sy0 = oy0 + ay * s0;
  const sx1 = land.ox + ax * land.S, sy1 = land.oy + ay * land.S;
  const k = ease.inOutCubic(e);
  const sx = sx0 + (sx1 - sx0) * k, sy = sy0 + (sy1 - sy0) * k;
  return { S, ox: sx - ax * S, oy: sy - ay * S };
}

/** O for the page centred in frame at scale s (frontal view of the whole viewport) */
export function startO(m: PageModel, s: number): [number, number] {
  const [tx, ty] = m.tocOrigin;
  return [960 + (tx - m.vw / 2) * s, 540 + (ty - m.vh / 2) * s];
}

/** frontal camera pose that maps TOCItems css p → screen O + S·p on the vector TOC plane (z) */
export function poseFromSO(S: number, ox: number, oy: number, m: PageModel, fov: number, z: number): CamPose {
  const [tx0, ty0] = m.tocOrigin;
  // TOCItems origin in world (page group at (-vw/2, vh/2))
  const wx = tx0 - m.vw / 2;
  const wy = m.vh / 2 - ty0;
  const tx = wx - (ox - 960) / S;
  const ty = wy + (oy - 540) / S;
  const dist = 540 / (S * Math.tan(((fov / 2) * Math.PI) / 180)) + z;
  return { tx, ty, tz: 0, dist, el: 90, az: 0, roll: 0, fov };
}
