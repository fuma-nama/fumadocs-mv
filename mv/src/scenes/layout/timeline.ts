import { at, BEAT } from '../../engine/time';
import { CYCLE, type LayoutId } from './layouts';

/** Snap a time to the 60 fps frame grid so `t >= anchor` is exact on the frame (t = frame / 60). */
const fr = (x: number) => Math.round(x * 60) / 60;

/** Section anchors (s). */
export const T = {
  start: fr(at(25)), // 38.4 square-off
  b25_2: fr(at(25, 2)), // 38.8 partitions
  b25_3: fr(at(25, 3)), // 39.2 content + HUD
  pull: fr(at(25, 4)), // 39.6 pull back → lineup
  b26: fr(at(26)), // 40.0
  arrive: fr(at(26, 4)), // 41.2 camera frontal on HOME
  b27: fr(at(27)), // 41.6 rearrange
  arch: fr(at(29)), // 44.8 architecture
  b30: fr(at(30)),
  b31: fr(at(31)),
  collapse: fr(at(32)), // 49.6 さ
  a: fr(at(32, 2)), // 50.0 あ
  dot: fr(at(32, 3)), // 50.4 black + dot
  end: fr(at(33)), // 51.2
};

export interface MorphKey {
  t: number;
  to: LayoutId;
  /** morph duration (s) */
  dur: number;
  /** same layout, a UI state change (Flux's page-tree overlay): the capture crossfades, no re-lock */
  soft?: boolean;
}

/** Hero frame schedule: starts as HOME (end of the row), rearranges through the others. */
export const HERO_KEYS: MorphKey[] = (() => {
  const keys: MorphKey[] = [{ t: -1e9, to: 'home', dur: 0 }];
  // bars 27–28: one rearrangement per half bar (kicks on 1 and 3), each settling into its real capture
  const seq: [number, LayoutId][] = [
    [at(27), 'notebook'],
    [at(27, 3), 'flux'],
    [at(28), 'glass'],
    [at(28, 3), 'spacious'],
  ];
  for (const [t, id] of seq) keys.push({ t: fr(t), to: id, dur: 0.3 });
  // Flux: the page tree opens as the blurred overlay on the snare (its tree then flies into Glass)
  keys.splice(3, 0, { t: fr(at(27, 4)), to: 'flux-open', dur: 0.22, soft: true });
  // bars 29–31: beats → 8ths → 16ths, cycling through the six and their variants
  let k = CYCLE.indexOf('spacious');
  const push = (t: number, dur: number) => {
    k = (k + 1) % CYCLE.length;
    keys.push({ t, to: CYCLE[k], dur });
  };
  for (let i = 0; i < 4; i++) push(fr(T.arch + i * BEAT), 0.3);
  for (let i = 0; i < 8; i++) push(fr(T.b30 + i * (BEAT / 2)), 0.17);
  for (let i = 0; i < 16; i++) push(fr(T.b31 + i * (BEAT / 4)), 0.09);
  // the last change lands on Docs: the collapse starts from the frame the section began with
  keys[keys.length - 1] = { ...keys[keys.length - 1], to: 'docs' };
  return keys;
})();

/** The big layout name (top-left title block): one key per switch. */
export interface NameKey {
  t: number;
  id: LayoutId;
  /** variant tag shown beside the name (same layout, different UI state) */
  tag?: string;
}

/** Dot hops across the row in bar 26 accelerate with the build: beats, then 8ths. */
export const HOP_T = [fr(at(26)), fr(at(26, 2)), fr(at(26, 3)), fr(at(26, 3.5)), fr(at(26, 4))];

export const NAME_KEYS: NameKey[] = [
  { t: T.b25_2, id: 'docs' },
  { t: HOP_T[0], id: 'notebook' },
  { t: HOP_T[1], id: 'flux' },
  { t: HOP_T[2], id: 'glass' },
  { t: HOP_T[3], id: 'spacious' },
  { t: HOP_T[4], id: 'home' },
  { t: fr(at(27)), id: 'notebook' },
  { t: fr(at(27, 3)), id: 'flux' },
  { t: fr(at(27, 4)), id: 'flux', tag: 'PAGE TREE' },
  { t: fr(at(28)), id: 'glass' },
  { t: fr(at(28, 3)), id: 'spacious' },
];
/** The title block rolls out as the frames tip over into the city. */
export const NAME_OUT = T.arch;

/**
 * Reel duration ending exactly on key i (the flip anticipates the hit and settles on it):
 * a 2-frame snap on the 8th-note roll call, 6 frames on the half-bar switches.
 */
export function nameReel(i: number): number {
  if (i === 0) return 0.12;
  const gap = NAME_KEYS[i].t - NAME_KEYS[i - 1].t;
  return gap < 0.3 ? 2 / 60 : 0.1;
}

/**
 * The city's schedule: the same layouts as the hero, but in bars 29–31 only one change per beat
 * (the hero alone runs on 8ths/16ths), so each beat reads as one wave rolling out of the hero.
 */
export const CITY_KEYS: MorphKey[] = (() => {
  const keys: MorphKey[] = [];
  for (const k of HERO_KEYS) {
    if (k.t < T.arch - 0.01) {
      keys.push(k);
      continue;
    }
    const beat = Math.round((k.t - T.arch) / BEAT);
    if (Math.abs(T.arch + beat * BEAT - k.t) > 0.01) continue; // off-beat change: hero only
    keys.push({ ...k, dur: 0.28 });
  }
  return keys;
})();

/** Layout morph state at t for a schedule (optionally delayed, for waves through a city). */
export function morphAt(keys: MorphKey[], t: number): { from: LayoutId; to: LayoutId; u: number; idx: number } {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].t <= t) i++;
  const k = keys[i];
  const prev = keys[Math.max(0, i - 1)];
  const u = k.dur > 0 ? Math.min(1, (t - k.t) / k.dur) : 1;
  return { from: i === 0 ? k.to : prev.to, to: k.to, u, idx: i };
}
