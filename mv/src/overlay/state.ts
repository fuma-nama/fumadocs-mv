import type { Frame, OverlayHints } from '../engine/engine';
import { clamp } from '../engine/anim';
import { at, BEAT } from '../engine/time';
import type { Corner, LyricStyleName } from './data';
import { lineTimings, type LineTiming } from './timing';
import { profile } from './profile';

/** Extra overlay hints (beyond engine OverlayHints). Set via `hints(f).creditCorner = 'tl'` etc. */
export interface OverlayExtra {
  /** corner for the staff credit currently running */
  creditCorner?: Corner;
  /** highlight colour for sung morae (e.g. the current theme primary) */
  accent?: string;
  /** text colour override */
  ink?: string;
  /** 0..1 extra backing (soft plate/halo) behind the lyric; default automatic */
  plate?: number;
  /** 0..1 global lyric opacity multiplier (ramp it for soft hand-offs) */
  lyricAlpha?: number;
  /** size multiplier for the lyric style */
  lyricScale?: number;
}

export type Hints = OverlayHints & OverlayExtra;

/** Typed access to the per-frame overlay hints, including overlay-specific extras. */
export function hints(f: Frame): Hints {
  return f.overlay as Hints;
}

export const PRE_ROLL = 0.35;
export const POST_HOLD = 1.1;

export interface LyricState extends LineTiming {
  /** the query time */
  now: number;
  /** current mora: last one whose onset <= now (-1 before the first onset) */
  index: number;
  /** 0..1 progress through the current mora's note */
  moraProgress: number;
  /** 0..1 progress through the line: (index + moraProgress) / morae */
  progress: number;
  /** 'pre' before the first onset, 'sing' while notes run, 'post' after the last note ended */
  phase: 'pre' | 'sing' | 'post';
  /** the following line take, if any */
  next?: LineTiming;
  /** the previous line take, if any */
  prev?: LineTiming;
}


const EIGHTH = BEAT / 2;
// grid snaps, rounded to 1/2400 s like engine/time at() so they compare equal to frame / 60
const tick = (x: number) => Math.round(x * 2400) / 2400;
const snapDown = (x: number, q: number) => tick(Math.floor(x / q + 1e-6) * q);
const snapNear = (x: number, q: number) => tick(Math.round(x / q) * q);

/** First visible time of a take: the 8th at/before PRE_ROLL ahead of its first onset, never before its bar window. */
const startOf = (L: LineTiming) => Math.max(snapDown(L.t0 - PRE_ROLL, EIGHTH), at(L.barStart));

/**
 * Visible window of a take [a, b): starts on the 8th at/before PRE_ROLL ahead of the first onset
 * (but never before the take's first bar — no lyric leaks into a stop, title impact or hand-off),
 * ends on the beat nearest POST_HOLD after the last note — clipped by the next take's start, the
 * end of the take's bar window and the contract caps. Entrances/exits are timed against it.
 */
export function slotOf(lines: LineTiming[], i: number): [number, number] {
  const L = lines[i];
  const next = lines[i + 1];
  const a = startOf(L);
  let b = snapNear(L.t1 + POST_HOLD, BEAT);
  if (next) b = Math.min(b, startOf(next));
  b = Math.min(b, at(L.barEnd));
  // per-take hard caps from the profile (main: L8 gone at the 50.4 B4 break, L11's repeat by the 76.4 stop)
  const cap = profile().caps[`${L.id}:${L.take}`];
  if (cap !== undefined) b = Math.min(b, cap);
  return [a, Math.max(a + 0.2, b)];
}

/** Line state at time t (with per-mora progress), or null between lines. */
export function stateOf(L: LineTiming, t: number, lines = lineTimings()): LyricState {
  const i = lines.indexOf(L);
  let index = -1;
  for (let k = 0; k < L.morae.length; k++) if (L.morae[k].t <= t + 1e-9) index = k;
  const m = L.morae[index];
  const moraProgress = m ? clamp((t - m.t) / Math.max(0.05, m.end - m.t)) : 0;
  const n = L.morae.length;
  return {
    ...L,
    now: t,
    index,
    moraProgress,
    progress: index < 0 ? 0 : clamp((index + moraProgress) / n),
    phase: t < L.t0 ? 'pre' : t <= L.t1 ? 'sing' : 'post',
    next: lines[i + 1],
    prev: lines[i - 1],
  };
}

/** The lyric line visible at time t (PRE_ROLL before its first note … POST_HOLD after its last), or null. */
export function lyricState(t: number): LyricState | null {
  const lines = lineTimings();
  for (let i = 0; i < lines.length; i++) {
    const [a, b] = slotOf(lines, i);
    if (t >= a && t < b) return stateOf(lines[i], t, lines);
  }
  return null;
}

/** A specific line take with all its timing (e.g. lyricLine('L10'), lyricLine('L11', 1)). */
export function lyricLine(id: string, take = 0): LineTiming | undefined {
  return lineTimings().find((l) => l.id === id && l.take === take);
}

/** All line takes in time order. */
export function lyricLines(): LineTiming[] {
  return lineTimings();
}

/** Characters of a take revealed by time t (for typing machines / flap displays). */
export function sungText(L: LineTiming, t: number): string {
  return L.chars
    .filter((c) => c.t <= t + 1e-9)
    .map((c) => c.ch)
    .join('');
}

/** Per-mora sung amount 0..1 at time t with a quick wipe of `wipe` seconds from each onset. */
export function moraLit(L: LineTiming, k: number, t: number, wipe = 0.08): number {
  const m = L.morae[k];
  if (!m) return 0;
  return clamp((t - m.t) / Math.max(1e-3, Math.min(wipe, m.end - m.t)));
}

export type { LyricStyleName, Corner };
