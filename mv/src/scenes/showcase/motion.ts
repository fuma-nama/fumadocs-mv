import * as THREE from 'three';
import type { Gfx } from '../../engine/gfx';
import { applyCam, type CamState } from './rig';

/**
 * Camera motion blur (180° shutter) for the 3D city: the image flow between t ∓ 1/240 s
 * (half a frame) is fitted as a zoom about a point plus a translation, then applied as a radial
 * and a directional blur. Small far windows streak like a real camera instead of strobing.
 */
const camA = new THREE.PerspectiveCamera(55, 16 / 9, 1, 9000);
const camB = new THREE.PerspectiveCamera(55, 16 / 9, 1, 9000);
const ray = new THREE.Raycaster();
const v = new THREE.Vector3();
const ndc = new THREE.Vector2();

export interface Flow {
  /** zoom rate over the shutter (fractional scale change) */
  s: number;
  /** focus of expansion in uv (0..1, y up) */
  c: [number, number];
  /** residual translation over the shutter, in uv (y up) */
  tx: number;
  ty: number;
}

/** Fit the image flow of the camera move around time t; `depth(dir)` gives a world distance per view ray. */
export function cameraFlow(camAt: (t: number) => CamState, t: number, depth: (o: THREE.Vector3, d: THREE.Vector3) => number, shutter = 1 / 120): Flow {
  applyCam(camA, camAt(t - shutter / 2));
  applyCam(camB, camAt(t + shutter / 2));
  const pts: [number, number, number, number][] = [];
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      ndc.set(-0.8 + (1.6 * gx) / 4, -0.7 + (1.4 * gy) / 2);
      ray.setFromCamera(ndc, camA);
      const d = depth(ray.ray.origin, ray.ray.direction);
      v.copy(ray.ray.direction).multiplyScalar(d).add(ray.ray.origin).project(camB);
      if (v.z > 1) continue;
      // uv (0..1, y up) before → after
      pts.push([ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5, v.x * 0.5 + 0.5, v.y * 0.5 + 0.5]);
    }
  }
  if (pts.length < 4) return { s: 0, c: [0.5, 0.5], tx: 0, ty: 0 };
  // least squares: after - before = T + s * (before - 0.5)  (aspect-correct: x scaled by 16/9)
  const A = 16 / 9;
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sfx = 0;
  let sfy = 0;
  let sxx = 0;
  let sxf = 0;
  for (const [bx, by, ax, ay] of pts) {
    const px = (bx - 0.5) * A;
    const py = by - 0.5;
    const fx = (ax - bx) * A;
    const fy = ay - by;
    n += 1;
    sx += px;
    sy += py;
    sfx += fx;
    sfy += fy;
    sxx += px * px + py * py;
    sxf += px * fx + py * fy;
  }
  const mx = sx / n;
  const my = sy / n;
  const varp = sxx / n - (mx * mx + my * my);
  const s = varp > 1e-9 ? (sxf / n - (mx * sfx + my * sfy) / n) / varp : 0;
  const tx = sfx / n - s * mx;
  const ty = sfy / n - s * my;
  // translation-free part: zoom about the focus of expansion c = -T / s (if the zoom dominates)
  if (Math.abs(s) > 1e-5) {
    const cx = 0.5 + -tx / s / A;
    const cy = 0.5 + -ty / s;
    if (cx > -0.5 && cx < 1.5 && cy > -0.5 && cy < 1.5) return { s, c: [cx, cy], tx: 0, ty: 0 };
    return { s, c: [0.5, 0.5], tx: tx / A, ty };
  }
  return { s: 0, c: [0.5, 0.5], tx: tx / A, ty };
}

/** Apply a fitted flow as radial + directional blur (skipped when sub-pixel). */
export function applyFlow(g: Gfx, tex: THREE.Texture, f: Flow, key: string, gain = 1): THREE.Texture {
  let out = tex;
  // radial: displacement at the frame corner ≈ |s| × 0.7 of the diagonal (in uv)
  if (Math.abs(f.s) * gain * 0.7 * 1100 > 1.2) out = g.motionBlur(out, { amount: Math.min(0.08, Math.abs(f.s) * gain), center: f.c }, `${key}:r`);
  const len = Math.hypot(f.tx * 1920, f.ty * 1080) * gain;
  if (len > 1.2) out = g.motionBlur(out, { amount: gain, dir: [Math.max(-0.05, Math.min(0.05, f.tx)), Math.max(-0.05, Math.min(0.05, f.ty))] }, `${key}:d`);
  return out;
}
