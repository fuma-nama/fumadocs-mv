import { clamp, type Ease } from '../../engine/anim';
import { at, BEAT } from '../../engine/time';
import { LANDING_INDEX, type TocLayout } from './toc-geometry';

export { at, BEAT };
export const EIGHTH = BEAT / 2;
export const SIXTEENTH = BEAT / 4;

/** Section bounds. */
export const T0 = at(17); // 25.6
export const T_B = at(19); // 28.8 city
export const T_C = at(21); // 32.0 specimens
export const T_D = at(23); // 35.2 magic circle
export const T_END = at(25); // 38.4

/** CSS cubic-bezier timing function. */
export function cssBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(u) - x;
      if (Math.abs(e) < 1e-6) break;
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    // bisection fallback
    if (Math.abs(sx(u) - x) > 1e-4) {
      let lo = 0, hi = 1;
      u = x;
      for (let i = 0; i < 30; i++) {
        if (sx(u) < x) lo = u;
        else hi = u;
        u = (lo + hi) / 2;
      }
    }
    return sy(u);
  };
}

/** Tailwind's default transition timing (cubic-bezier(0.4, 0, 0.2, 1)). */
export const cssEase = cssBezier(0.4, 0, 0.2, 1);
/** Spacious roll-in / dialog ease (cubic-bezier(0.22, 1, 0.36, 1)). */
export const rollEase = cssBezier(0.22, 1, 0.36, 1);
/** Tailwind v4 `ease-out` (cubic-bezier(0, 0, 0.2, 1)) — block.tsx's clip-path transition. */
export const cssEaseOut = cssBezier(0, 0, 0.2, 1);

export interface Target {
  t: number;
  v: number;
}

/**
 * Value of a CSS-transitioned property at time t: each target change restarts a transition
 * from the current (possibly mid-flight) value. Pure function of t.
 */
export function transitioned(t: number, v0: number, targets: Target[], dur: number, e: Ease = cssEase): number {
  let from = v0;
  let to = v0;
  let t0 = Number.NEGATIVE_INFINITY;
  for (const x of targets) {
    if (x.t > t) break;
    const cur = t0 === Number.NEGATIVE_INFINITY ? to : from + (to - from) * e(clamp((x.t - t0) / dur));
    from = cur;
    to = x.v;
    t0 = x.t;
  }
  if (t0 === Number.NEGATIVE_INFINITY) return v0;
  return from + (to - from) * e(clamp((t - t0) / dur));
}

/** An active-range change of the TOC (indices inclusive). */
export interface RangeEvent {
  t: number;
  start: number;
  end: number;
  /** optional per-event transition durations (default: the TocTiming's) */
  dot?: number;
  clip?: number;
  /** optional per-event easing for the dot + clip transitions */
  ease?: Ease;
}

/**
 * Inch-worm schedule: the head (range end) advances on `heads[k]`, the tail (range start)
 * catches up one 8th later. Starts from [i0, i0].
 */
export function crawl(i0: number, heads: number[], tailDelay = EIGHTH): RangeEvent[] {
  const ev: RangeEvent[] = [];
  let i = i0;
  for (const t of heads) {
    ev.push({ t, start: i, end: i + 1 });
    ev.push({ t: t + tailDelay, start: i + 1, end: i + 1 });
    i++;
  }
  return ev;
}

export interface TocState {
  trackTop: number;
  trackBottom: number;
  dotDist: number;
  textActive: Float32Array;
  /** discrete range at t (for HUD) */
  start: number;
  end: number;
  /** progress of the latest head glide 0..1 (1 = settled) */
  glide: number;
  /** time of the latest head change */
  headT: number;
}

export interface TocTiming {
  clip: number; // clip-path transition (s)
  dot: number; // offset-distance transition (s)
  text: number; // transition-colors (s)
  ease?: Ease;
}

export const UI_TIMING: TocTiming = { clip: 0.15, dot: 0.15, text: 0.15 };

/** Evaluate the default-TOC state (clip range, thumb, text colours) at time t. */
export function tocStateAt(t: number, L: TocLayout, i0: number, ev: RangeEvent[], tm: TocTiming = UI_TIMING): TocState {
  const rows = L.rows;
  const e = tm.ease ?? cssEase;
  const topT: TargetD[] = [];
  const botT: TargetD[] = [];
  const dotT: TargetD[] = [];
  let prev = { start: i0, end: i0, isUp: false };
  let start = i0, end = i0, headT = Number.NEGATIVE_INFINITY;
  // like CSS, a transition only (re)starts when the value actually changes
  const push = (arr: TargetD[], t: number, v: number, dur: number, xe?: Ease) => {
    const last = arr.length ? arr[arr.length - 1].v : Number.NaN;
    if (v !== last) arr.push({ t, v, dur, e: xe });
  };
  for (const x of ev) {
    push(topT, x.t, rows[x.start].top, x.clip ?? tm.clip, x.ease);
    push(botT, x.t, rows[x.end].bottom, x.clip ?? tm.clip, x.ease);
    const isUp = prev.start > x.start || prev.end > x.end || (prev.start === x.start && prev.end === x.end && prev.isUp);
    push(dotT, x.t, isUp ? L.lens[x.start][0] : L.lens[x.end][1], x.dot ?? tm.dot, x.ease);
    if (x.t <= t) {
      if (x.end !== end || x.start !== start) {
        if (x.end !== end) headT = x.t;
      }
      start = x.start;
      end = x.end;
    }
    prev = { start: x.start, end: x.end, isUp };
  }
  const textActive = new Float32Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const tg: Target[] = [];
    for (const x of ev) tg.push({ t: x.t, v: i >= x.start && i <= x.end ? 1 : 0 });
    textActive[i] = transitioned(t, i === i0 ? 1 : 0, tg, tm.text, e);
  }
  return {
    trackTop: transitionedVar(t, rows[i0].top, topT, e),
    trackBottom: transitionedVar(t, rows[i0].bottom, botT, e),
    dotDist: transitionedVar(t, L.lens[i0][1], dotT, e),
    textActive,
    start,
    end,
    glide: headT === Number.NEGATIVE_INFINITY ? 1 : clamp((t - headT) / (ev.find((x) => x.t === headT)?.dot ?? tm.dot)),
    headT,
  };
}

/** Sum of eased steps: y(t) = Σ Δ_k · ease((t − t_k) / dur). */
export function steps(t: number, keys: { t: number; d: number }[], dur: number, e: Ease): number {
  let v = 0;
  for (const k of keys) {
    if (t <= k.t) continue;
    v += k.d * e(clamp((t - k.t) / dur));
  }
  return v;
}

export const LANDING = LANDING_INDEX;

export interface TargetD extends Target {
  /** transition duration for this change */
  dur: number;
  /** easing for this change (default: the caller's) */
  e?: Ease;
}

/** Like `transitioned`, with a duration per target. */
export function transitionedVar(t: number, v0: number, targets: TargetD[], e: Ease = cssEase): number {
  let from = v0;
  let to = v0;
  let t0 = Number.NEGATIVE_INFINITY;
  let dur = 1;
  let ee = e;
  for (const x of targets) {
    if (x.t > t) break;
    const cur = t0 === Number.NEGATIVE_INFINITY ? to : from + (to - from) * ee(clamp((x.t - t0) / dur));
    from = cur;
    to = x.v;
    t0 = x.t;
    dur = x.dur;
    ee = x.e ?? e;
  }
  if (t0 === Number.NEGATIVE_INFINITY) return v0;
  return from + (to - from) * ee(clamp((t - t0) / dur));
}

/** glide length for hops arriving at `arrivals`: as long as maxDur, never longer than 85 % of the gap */
export function glideDurs(arrivals: number[], maxDur: number, prevArrival: number): number[] {
  let prev = prevArrival;
  return arrivals.map((h) => {
    const d = Math.min(maxDur, (h - prev) * 0.85);
    prev = h;
    return d;
  });
}

/**
 * Inch-worm hops that ARRIVE on the given hit times (the glide anticipates the hit and settles on
 * it); the range tail follows `tailLag` after each arrival. Starts from [i0, i0].
 */
/** the eased tail is sub-pixel for its last frame(s): end each glide just after its hit */
export const LAND_LAG = 1 / 60;
export const landLag = (dur: number) => (dur >= 0.25 ? 2 / 60 : 1 / 60);

export function hops(i0: number, arrivals: number[], maxDur: number, prevArrival: number, tailLag = 0.06, tailDur = 0.15, headEase?: Ease): RangeEvent[] {
  const durs = glideDurs(arrivals, maxDur, prevArrival);
  const raw: { t: number; head: boolean; i: number; dur: number }[] = [];
  arrivals.forEach((h, k) => {
    raw.push({ t: h - durs[k] + landLag(durs[k]), head: true, i: i0 + k + 1, dur: durs[k] });
    raw.push({ t: h + tailLag, head: false, i: i0 + k + 1, dur: tailDur });
  });
  raw.sort((a, b) => a.t - b.t || (a.head ? -1 : 1));
  let start = i0, end = i0;
  return raw.map((r) => {
    if (r.head) end = Math.max(end, r.i);
    else start = Math.max(start, r.i);
    return { t: r.t, start, end: Math.max(start, end), dot: r.dur, clip: r.dur, ease: r.head ? headEase : undefined };
  });
}
