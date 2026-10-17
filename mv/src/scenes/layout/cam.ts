import * as THREE from 'three';

export interface CamKey {
  t: number;
  pos: [number, number, number];
  tgt: [number, number, number];
  fov?: number;
  roll?: number;
  /** zero velocity at this key */
  stop?: boolean;
}

type V3 = [number, number, number];

function hermite(p0: number, p1: number, m0: number, m1: number, u: number, dt: number) {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 * dt + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1 * dt;
}

/** Time-based cubic Hermite through keys (C1 in time); tangents from neighbours, 0 at stops/ends. */
function sample(keys: CamKey[], t: number, get: (k: CamKey) => number[]): number[] {
  if (t <= keys[0].t) return get(keys[0]);
  const last = keys[keys.length - 1];
  if (t >= last.t) return get(last);
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const dt = b.t - a.t;
  const u = (t - a.t) / dt;
  const tan = (j: number): number[] => {
    const k = keys[j];
    if (k.stop || j === 0 || j === keys.length - 1) return get(k).map(() => 0);
    const p = keys[j - 1];
    const n = keys[j + 1];
    const gp = get(p);
    const gn = get(n);
    return gp.map((v, c) => (gn[c] - v) / (n.t - p.t));
  };
  const ga = get(a);
  const gb = get(b);
  const ma = tan(i);
  const mb = tan(i + 1);
  return ga.map((v, c) => hermite(v, gb[c], ma[c], mb[c], u, dt));
}

export function camAt(keys: CamKey[], t: number): { pos: V3; tgt: V3; fov: number; roll: number } {
  const pos = sample(keys, t, (k) => k.pos) as V3;
  const tgt = sample(keys, t, (k) => k.tgt) as V3;
  const [fov, roll] = sample(keys, t, (k) => [k.fov ?? 30, k.roll ?? 0]);
  return { pos, tgt, fov, roll };
}

export function applyCam(c: THREE.PerspectiveCamera, s: { pos: V3; tgt: V3; fov: number; roll: number }, up: V3 = [0, 1, 0]) {
  c.fov = s.fov;
  c.updateProjectionMatrix();
  c.position.set(...s.pos);
  c.up.set(...up);
  c.lookAt(...s.tgt);
  if (s.roll) c.rotateZ(s.roll);
  c.updateMatrixWorld();
}

/** Distance at which a frame of world width `ww` spans `px` screen px (fov in degrees, 1080p). */
export function distFor(ww: number, px: number, fov = 30, H = 1080) {
  const s = px / ww;
  return H / s / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
}

/** World offset that puts the looked-at point at screen y (frontal camera). */
export function yOffFor(ww: number, px: number, sy: number) {
  return (sy - 540) / (px / ww);
}

/** Project a world point to screen px (1920×1080). */
export function project(c: THREE.Camera, x: number, y: number, z: number, W = 1920, H = 1080): [number, number, number] {
  const v = new THREE.Vector3(x, y, z).project(c);
  return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H, v.z];
}
