import * as THREE from 'three';
import { DEG } from './world';

/** Keyframes [t, value]; cubic Hermite through them with finite-difference tangents
 * (C1, zero slope at both ends) — no stop-and-go between keys. */
export type SKey = [number, number];
export function spline(t: number, keys: SKey[]): number {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (keys[i + 1][0] < t) i++;
  const [t0, v0] = keys[i];
  const [t1, v1] = keys[i + 1];
  const h = t1 - t0;
  const slope = (j: number) => {
    if (j <= 0 || j >= n - 1) return 0;
    const [ta, va] = keys[j - 1];
    const [tb, vb] = keys[j + 1];
    const [tm, vm] = keys[j];
    // harmonic-style limiter: no overshoot when the neighbours change direction
    const d0 = (vm - va) / (tm - ta);
    const d1 = (vb - vm) / (tb - tm);
    if (d0 * d1 <= 0) return 0;
    return (2 * d0 * d1) / (d0 + d1);
  };
  const m0 = slope(i) * h;
  const m1 = slope(i + 1) * h;
  const s = (t - t0) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * m1;
}

export interface CamState {
  /** look-at target */
  tx: number;
  ty: number;
  tz: number;
  /** distance from target */
  dist: number;
  /** elevation (rad): π/2 = straight down */
  elev: number;
  /** azimuth (rad): camera sits on the side of direction (sin az, 0, cos az) from the target */
  az: number;
  fov: number;
  roll?: number;
}

/** Apply a CamState to a camera (up vector stays continuous through the top-down pose). */
export function applyCam(cam: THREE.PerspectiveCamera, s: CamState) {
  const h = new THREE.Vector3(Math.sin(s.az), 0, Math.cos(s.az));
  const ce = Math.cos(s.elev);
  const se = Math.sin(s.elev);
  cam.position.set(s.tx + s.dist * ce * h.x, s.ty + s.dist * se, s.tz + s.dist * ce * h.z);
  cam.up.set(-se * h.x, ce, -se * h.z);
  cam.lookAt(s.tx, s.ty, s.tz);
  if (s.roll) cam.rotateZ(s.roll);
  if (cam.fov !== s.fov) {
    cam.fov = s.fov;
  }
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}

const FOV = 40;
/** px per world unit on the floor for a top-down camera at distance d */
const topDist = (pxPerUnit: number) => 540 / Math.tan((FOV / 2) * DEG) / pxPerUnit;

/**
 * Bars 1–6 camera, as camera height h and horizontal offset ρ from the look-at target:
 * top-down (looks 2D) pulling back as the dial grows → on the held E6 a spiral dive that
 * swings round to the gap between monoliths 04/05 (az 22.5°) → bar 5 elevated 3/4 view of the
 * temple from outside the ring (long lens) → bar 6 descend and dolly through the gap toward
 * the rising moon.
 */
export const GAP_AZ = 22.5 * DEG;
export function introCam(t: number): CamState {
  const h = spline(t, [
    [0, topDist(84)],
    [1.6, topDist(78)],
    [3.2, topDist(60)],
    [4.8, topDist(48)],
    [5.6, topDist(43)],
    [6.4, 17],
    [7.2, 10.5],
    [8.0, 8.2],
    [8.8, 4.6],
    [9.35, 2.3],
    [9.6, 1.62],
  ]);
  const rho = spline(t, [
    [0, 0],
    [3.2, 0.3],
    [4.8, 0.9],
    [5.6, 1.6],
    [6.4, 8.5],
    [7.2, 12.5],
    [8.0, 13.2],
    [8.8, 9.0],
    [9.35, 3.6],
    [9.6, 1.2],
  ]);
  const ty = spline(t, [
    [0, 0],
    [6.4, 0.2],
    [7.2, 0.6],
    [8.0, 0.8],
    [8.8, 1.1],
    [9.6, 1.55],
  ]);
  const az = spline(t, [
    [0, 4 * DEG],
    [5.6, -1 * DEG],
    [6.8, 17 * DEG],
    [7.6, GAP_AZ],
  ]);
  const fov = spline(t, [
    [5.6, FOV],
    [7.2, 28],
  ]);
  const dy = h - ty;
  return { tx: 0, ty, tz: 0, dist: Math.hypot(rho, dy), elev: Math.atan2(dy, Math.max(rho, 1e-4)), az, fov };
}

/** Depth fog (1 near … 0 far) for the 2D floor layer, shared by every phase. */
export function floorFog(t: number) {
  const near = spline(t, [
    [5.6, 80],
    [6.6, 9],
  ]);
  return (d: number) => Math.min(1, Math.max(0, 1 - (d - near) / 22));
}
