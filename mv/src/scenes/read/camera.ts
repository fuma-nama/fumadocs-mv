import { ease, seg } from '../../engine/anim';
import { at } from '../../engine/time';
import { T } from './timeline';
import { inOutSine } from './open';
import { lerpPose, type CamPose } from './world';
import type { PageModel } from './page';
import { diveSO, poseFromSO } from './dive';
import { F_IN, F_SWAP, H1_ANCHOR, SWAP_SCALE } from './forest';

/** One continuous camera through the whole section (world units = css px of the page). */

export const FOV = 28;
/** distance at which the 1440×810 sheet (z = 5) exactly fills the frame */
export const D0 = 405 / Math.tan(((FOV / 2) * Math.PI) / 180) + 5;

const FRONT: CamPose = { tx: 0, ty: 0, tz: 0, dist: D0, el: 90, az: 0, roll: 0, fov: FOV };
const BACK: CamPose = { tx: -60, ty: -10, tz: 0, dist: D0 * 1.4, el: 84, az: -2, roll: 0, fov: FOV };
const SPREAD: CamPose = { tx: -600, ty: -40, tz: 0, dist: D0 * 1.95, el: 71, az: -4, roll: -0.5, fov: FOV };
const SETTLE: CamPose = { tx: -50, ty: -95, tz: 0, dist: D0 * 1.34, el: 66, az: -8, roll: -1.1, fov: FOV };
const ISO: CamPose = { tx: -500, ty: 95, tz: 200, dist: 6050, el: 50, az: -14, roll: 0, fov: 18 };
const ISO_END: CamPose = { tx: -510, ty: 85, tz: 200, dist: 5800, el: 54, az: -19, roll: 0, fov: 18 };

/**
 * forest in/out (forest.ts is its own world). In: after the slam the camera dives into the
 * article's text, rolling 90° so its lines stand up as the trunks it crossfades into. Out: the
 * walker's push into the title card ends on the giant word "Introduction"; the page camera takes
 * over on exactly that framing (the real H1, frontal, 11 px per css px) and pulls back to ⌘K.
 */
const F_PAGE = 540 / Math.tan(((FOV / 2) * Math.PI) / 180);
const DIVE: CamPose = { tx: 0, ty: 405 - 454, tz: 0, dist: 150, el: 90, az: 0, roll: -90, fov: FOV };
const H1_FRONT: CamPose = { tx: H1_ANCHOR.x - 720, ty: 405 - H1_ANCHOR.y, tz: 2, dist: F_PAGE / SWAP_SCALE, el: 90, az: 0, roll: 0, fov: FOV };

/** a camera pose from an eye and a target (both page-local css, y down, z up) */
export function lookPose(eye: { x: number; y: number; z: number }, tgt: { x: number; y: number; z: number }, fov: number, roll = 0): CamPose {
  const ex = eye.x - 720, ey = 405 - eye.y, gx = tgt.x - 720, gy = 405 - tgt.y;
  const dx = ex - gx, dy = ey - gy, dz = eye.z - tgt.z;
  const dist = Math.hypot(dx, dy, dz);
  return { tx: gx, ty: gy, tz: tgt.z, dist, el: (Math.asin(dz / dist) * 180) / Math.PI, az: (Math.atan2(dx, -dy) * 180) / Math.PI, roll, fov };
}

/** ⌘K: tight on the sidebar's search trigger for the key presses, then on the dialog */
const KEYS: CamPose = { tx: -440, ty: 150, tz: 0, dist: D0 * 0.8, el: 72, az: -9, roll: -1.4, fov: FOV };
const KEYS_B: CamPose = { tx: -420, ty: 140, tz: 0, dist: D0 * 0.74, el: 73, az: -8, roll: -1.1, fov: FOV };
const DIALOG_A: CamPose = { tx: 10, ty: 30, tz: 0, dist: D0 * 1.0, el: 79, az: -4, roll: -0.5, fov: FOV };
const DIALOG_B: CamPose = { tx: 0, ty: 52, tz: 0, dist: D0 * 0.9, el: 81, az: -3, roll: -0.3, fov: FOV };

/** dive start scale (whole viewport in frame, frontal) */
export const DIVE_S0 = 1.22;
/** z of the vector TOC plane (page-local) */
export const TOC_Z = 1.5;

/**
 * The pull-back out of the forest as a stepped whip on the 16ths: the real H1 holds crisp on the
 * 21.8 kick (with a slight push), then two fast steps that each land on a hit and hold —
 * 21.9 (typewriter clack) halfway out, 22.0 (snare) on the search trigger as the keycaps pop.
 * Returns the blend 0..1 from H1_FRONT to KEYS (distance interpolates geometrically).
 */
export const WHIP_STEPS: [number, number, number][] = [
  // [start, land, blend at landing]
  [F_SWAP + 0.033, F_SWAP + 0.1, 0.5],
  [F_SWAP + 0.133, F_SWAP + 0.2, 1],
];
export function whipOut(t: number): number {
  let k = -0.012 * seg(t, F_SWAP, WHIP_STEPS[0][0], ease.outQuad); // the hold pushes in a touch
  let from = k;
  for (const [a, b, to] of WHIP_STEPS) {
    if (t < a) return k;
    k = from + (to - from) * ease.outQuart(seg(t, a, b));
    from = to;
  }
  return k;
}

export function camAt(t: number, m?: PageModel): CamPose {
  let p = lerpPose(FRONT, BACK, seg(t, T.lift, T.open + 0.05, ease.inOutCubic));
  p = lerpPose(p, SPREAD, seg(t, T.open, 15.15, ease.inOutCubic));
  p = lerpPose(p, SETTLE, seg(t, 15.05, 15.95, ease.inOutCubic));
  if (t < 15.88) return p;
  // whip into the axonometric diagram on the bar-11 downbeat, then a slow orbit
  p = lerpPose(p, lerpPose(ISO, ISO_END, seg(t, T.anatomy, T.forest, inOutSine)), seg(t, 15.88, T.anatomy + 0.3, ease.whip));
  if (t < T.forest) return p;
  // dive into the article's text with a 90° roll (its lines become the forest's trunks)
  p = lerpPose(p, DIVE, seg(t, T.forest, F_IN + 0.02, ease.inQuart));
  if (t < F_SWAP) return p;
  // out of the forest on the real H1, then pull back to the sidebar's search trigger for ⌘K
  p = lerpPose(H1_FRONT, lerpPose(KEYS, KEYS_B, seg(t, T.search, at(15, 2), inOutSine)), whipOut(t));
  // K on the snare opens the dialog: pan across to it
  p = lerpPose(p, lerpPose(DIALOG_A, DIALOG_B, seg(t, at(15, 2), T.enter, inOutSine)), seg(t, at(15, 2) - 0.02, at(15, 2) + 0.36, ease.inOutCubic));
  if (t < T.enter || !m) return p;
  // Enter: turn frontal while the page scrolls, then dive into the thumb (lands at rest on 25.6)
  const so = diveSO(t, m, DIVE_S0);
  return lerpPose(p, poseFromSO(so.S, so.ox, so.oy, m, FOV, TOC_Z), seg(t, T.enter, T.enter + 0.7, ease.inOutCubic));
}
