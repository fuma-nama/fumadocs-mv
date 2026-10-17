import { createNoise2D, createNoise3D } from 'simplex-noise';

// ── scalar helpers ──────────────────────────────────────────────────────────
export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => clamp((x - a) / (b - a));
export const remap = (x: number, a: number, b: number, c: number, d: number) => lerp(c, d, invLerp(a, b, x));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = invLerp(a, b, x);
  return t * t * (3 - 2 * t);
};
export const fract = (x: number) => x - Math.floor(x);
export const TAU = Math.PI * 2;

// ── easings (t in 0..1) ─────────────────────────────────────────────────────
export type Ease = (t: number) => number;
const outExpo: Ease = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inQuart: (t: number) => t ** 4,
  outQuart: (t: number) => 1 - (1 - t) ** 4,
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  outQuint: (t: number) => 1 - (1 - t) ** 5,
  inOutQuint: (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2),
  inExpo: (t: number) => (t <= 0 ? 0 : 2 ** (10 * t - 10)),
  outExpo,
  inOutExpo: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
  outCirc: (t: number) => Math.sqrt(1 - (t - 1) ** 2),
  inOutCirc: (t: number) =>
    t < 0.5 ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2 : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2,
  outBack: (t: number, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
  inBack: (t: number, s = 1.70158) => (s + 1) * t ** 3 - s * t * t,
  inOutBack: (t: number, s = 1.70158 * 1.525) =>
    t < 0.5
      ? ((2 * t) ** 2 * ((s + 1) * 2 * t - s)) / 2
      : ((2 * t - 2) ** 2 * ((s + 1) * (t * 2 - 2) + s) + 2) / 2,
  outElastic: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  /** Snappy motion-graphics ease: fast start, long soft landing. */
  snap: (t: number) => 1 - (1 - t) ** 6,
  /** Anticipate-then-shoot, good for whips. */
  whip: (t: number): number => (t < 0.18 ? -0.06 * Math.sin((t / 0.18) * Math.PI) : outExpo((t - 0.18) / 0.82)),
  steps: (n: number) => (t: number) => Math.floor(t * n) / n,
} satisfies Record<string, Ease | ((...a: never[]) => unknown)>;

/** Eased progress of t through [t0, t1], clamped to 0..1. */
export function seg(t: number, t0: number, t1: number, e: Ease = ease.linear): number {
  if (t1 <= t0) return t >= t1 ? 1 : 0;
  return e(clamp((t - t0) / (t1 - t0)));
}

/** In → hold → out window: 0 before tIn, rises over `inDur`, holds, falls over `outDur` ending at tOut. */
export function win(t: number, tIn: number, tOut: number, inDur = 0.2, outDur = 0.2, e: Ease = ease.outCubic) {
  return Math.min(seg(t, tIn, tIn + inDur, e), 1 - seg(t, tOut - outDur, tOut, ease.inCubic));
}

export type Key = [time: number, value: number, e?: Ease];
/** Piecewise keyframe track. Ease on a key applies to the segment ending at that key. */
export function track(t: number, keys: Key[]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      return lerp(v0, v1, seg(t, t0, t1, e ?? ease.inOutCubic));
    }
  }
  return keys[keys.length - 1][1];
}

/** Damped spring step response (0 → 1 with overshoot). freq in Hz, zeta damping ratio. */
export function spring(dt: number, freq = 3, zeta = 0.35): number {
  if (dt <= 0) return 0;
  const w = TAU * freq;
  if (zeta >= 1) return 1 - Math.exp(-w * dt) * (1 + w * dt);
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * dt) * (Math.cos(wd * dt) + ((zeta * w) / wd) * Math.sin(wd * dt));
}

/** Quantize time for limited ("on twos") animation, e.g. hold(t, 12). */
export const hold = (t: number, fps: number) => Math.floor(t * fps + 1e-6) / fps;

/** Exponential decay envelope since the last event time <= t in sorted `times`. */
export function pulse(t: number, times: number[], decay = 0.25): number {
  const last = lastBefore(times, t);
  return last === undefined ? 0 : Math.exp(-(t - last) / decay);
}

/** Largest value in sorted `times` that is <= t (binary search). */
export function lastBefore(times: number[], t: number): number | undefined {
  let lo = 0;
  let hi = times.length - 1;
  let ans: number | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t + 1e-9) {
      ans = times[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Index of the last element whose time <= t, or -1. */
export function indexBefore<T>(items: T[], t: number, get: (x: T) => number): number {
  let lo = 0;
  let hi = items.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (get(items[mid]) <= t + 1e-9) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

// ── deterministic randomness ────────────────────────────────────────────────
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless hash → [0, 1). */
export function hash(...n: number[]): number {
  let h = 2166136261 >>> 0;
  for (const x of n) {
    h ^= Math.floor(x * 1000003) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

const noise2 = createNoise2D(mulberry32(1337));
const noise3 = createNoise3D(mulberry32(7331));
/** Smooth noise in -1..1. */
export const n1 = (x: number, seed = 0) => noise2(x, seed * 17.17);
export const n2 = (x: number, y: number, seed = 0) => noise3(x, y, seed * 17.17);

/** Smooth camera-shake style 2D offset (unit amplitude). */
export function shake(t: number, freq = 8, seed = 0): [number, number] {
  return [n1(t * freq, seed + 1), n1(t * freq, seed + 2)];
}
