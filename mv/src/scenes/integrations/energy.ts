import type * as THREE from 'three';
import type { Gfx } from '../../engine/gfx';
import { hash } from '../../engine/anim';
import { audio } from '../../engine/audio';
import { fr, INK, STATIONS, T } from './k';

const DOWNBEATS = STATIONS.map((s) => s.t0);
const EPS = 1e-6;
/** Extra accents: 201 Created, the callout flip, the reveal. */
const ACCENTS: [t: number, amp: number][] = [
  [fr(78.8), 7],
  [fr(81.6), 5],
  [T.reveal, 9],
];

function chopTimes(): number[] {
  return audio.timing.events.chops.map((c) => c.t).filter((x) => x >= T.drop - 1e-6 && x < T.end - 0.4);
}

/** Camera zoom punch (multiplier): small on every vocal chop (3-3-2), big on block downbeats. */
export function punch(t: number) {
  let p = 0;
  // EPS: frame times (frame/60) and JSON onsets can differ by an ulp; the hit must land ON its frame
  for (const c of chopTimes()) {
    const dt = t - c;
    if (dt >= -EPS && dt < 0.3) p = Math.max(p, 0.014 * Math.exp(-Math.max(0, dt) / 0.07));
  }
  for (const d of DOWNBEATS) {
    const dt = t - d;
    if (dt >= -EPS && dt < 0.5) p += 0.045 * Math.exp(-Math.max(0, dt) / 0.09);
  }
  return 1 + p;
}

/** Screen shake (px): impulses on chops, downbeats and accents, each a decaying 24 Hz wobble. */
export function shakeAt(t: number): [number, number] {
  let x = 0, y = 0;
  const add = (t0: number, amp: number, decay: number) => {
    if (t - t0 < -EPS) return;
    const dt = Math.max(0, t - t0);
    if (dt > decay * 6) return;
    const a = amp * Math.exp(-dt / decay);
    const ang = hash(t0 * 7.13) * Math.PI * 2;
    const osc = Math.cos(dt * Math.PI * 2 * 24);
    x += Math.cos(ang) * a * osc;
    y += Math.sin(ang) * a * osc;
  };
  for (const c of chopTimes()) add(c, 3.5, 0.05);
  for (const d of DOWNBEATS) add(d, 13, 0.08);
  for (const [a, amp] of ACCENTS) add(a, amp, 0.07);
  return [x, y];
}

/**
 * Block downbeats: a 3-frame colour slam. Frame 0 floods the frame in the key colour with the
 * linework as a negative (the sky lights one frame later), frame 1 a duotone, frame 2 a glow.
 */
export function downbeatSlam(g: Gfx, img: THREE.Texture, t: number): THREE.Texture {
  for (let k = 0; k < STATIONS.length; k++) {
    const i = Math.round((t - DOWNBEATS[k]) * 60);
    if (i < 0 || i > 2) continue;
    const st = STATIONS[k];
    if (i === 0) return g.grade(img, { contrast: 1.4, duo: 1, ink: st.key, paper: INK }, 'integrations:slam');
    if (i === 1) return g.grade(img, { duo: 0.55, ink: INK, paper: st.key }, 'integrations:slam');
    const fill = g.rt('integrations:slamfill');
    g.fill(fill, st.key);
    return g.compose(g.rt('integrations:slam2'), INK, [{ tex: img }, { tex: fill.texture, blend: 'screen', opacity: 0.22 }]);
  }
  return img;
}
