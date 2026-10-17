import * as THREE from 'three';

/** Moon object in world space (the sky moon and, from the launch, the mosaic disc). */
export const MOON = {
  pos: new THREE.Vector3(-500, 520, -1700),
  radius: 150,
};

export type V3 = [number, number, number];

/** Final camera position (B8 hold): looks straight at the moon, disc R = 300 px. */
export const P_END: V3 = [-5, 150, -120];

/** Camera state: position, yaw/pitch (radians, yaw 0 = looking down −z, + = turn left), roll, vertical fov (deg). */
export interface CamState {
  p: V3;
  yaw: number;
  pitch: number;
  roll: number;
  fov: number;
}

/** Yaw/pitch that put the moon centre at screen pixel (x, y) for a camera at p with this fov. */
export function aimMoon(p: V3, x: number, y: number, fov: number, W = 1920, H = 1080): { yaw: number; pitch: number } {
  const d = new THREE.Vector3(MOON.pos.x - p[0], MOON.pos.y - p[1], MOON.pos.z - p[2]);
  const az = Math.atan2(-d.x, -d.z);
  const el = Math.atan2(d.y, Math.hypot(d.x, d.z));
  const f = Math.tan((fov * Math.PI) / 360);
  // offsets in camera space (exact for x = W/2, y = H/2)
  const oy = Math.atan(((H / 2 - y) / (H / 2)) * f);
  const ox = Math.atan(((x - W / 2) / (H / 2)) * f * Math.cos(oy));
  return { yaw: az + ox, pitch: el - oy };
}

export interface Key {
  t: number;
  s: CamState;
  /** optional explicit velocity (per second) of [px,py,pz,yaw,pitch,roll,fov]; default Catmull-Rom */
  v?: number[];
}

const pack = (s: CamState) => [s.p[0], s.p[1], s.p[2], s.yaw, s.pitch, s.roll, s.fov];

/** Cubic Hermite through time-keyed camera states (C1, Catmull-Rom tangents unless given). */
export function sampleKeys(keys: Key[], t: number): CamState {
  const n = keys.length;
  if (t <= keys[0].t) return keys[0].s;
  if (t >= keys[n - 1].t) return keys[n - 1].s;
  let i = 0;
  while (i < n - 2 && t > keys[i + 1].t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const a = pack(k0.s);
  const b = pack(k1.s);
  const tangent = (j: number) => {
    const k = keys[j];
    if (k.v) return k.v;
    if (j === 0 || j === n - 1) return a.map(() => 0);
    const pa = pack(keys[j - 1].s);
    const pb = pack(keys[j + 1].s);
    const dt = keys[j + 1].t - keys[j - 1].t;
    return pa.map((x, q) => (pb[q] - x) / dt);
  };
  const ma = tangent(i);
  const mb = tangent(i + 1);
  const h = k1.t - k0.t;
  const u = (t - k0.t) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const r = a.map((x, q) => h00 * x + h10 * h * ma[q] + h01 * b[q] + h11 * h * mb[q]);
  return { p: [r[0], r[1], r[2]], yaw: r[3], pitch: r[4], roll: r[5], fov: r[6] };
}

/** Apply a state to a three.js perspective camera. */
export function applyCam(cam: THREE.PerspectiveCamera, s: CamState) {
  cam.position.set(s.p[0], s.p[1], s.p[2]);
  cam.rotation.order = 'YXZ';
  cam.rotation.set(s.pitch, s.yaw, s.roll);
  cam.fov = s.fov;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}

const tmp = new THREE.Vector3();

/** Project a world point to screen px (x right, y down). Returns z<1 for points in front. */
export function project(cam: THREE.PerspectiveCamera, p: THREE.Vector3, W = 1920, H = 1080) {
  tmp.copy(p).project(cam);
  const view = tmp.clone();
  return { x: (view.x * 0.5 + 0.5) * W, y: (0.5 - view.y * 0.5) * H, z: view.z };
}

/**
 * Screen radius (px) of the moon: its angular size mapped at the lens' centre scale, so the moon
 * keeps a constant size wherever it sits in the frame (exact when it is centred).
 */
export function projectedRadius(cam: THREE.PerspectiveCamera, p: THREE.Vector3, r: number, H = 1080) {
  const d = tmp.copy(p).sub(cam.position).length();
  const f = Math.tan((cam.fov * Math.PI) / 360);
  return ((r / Math.max(1e-3, d)) / f) * (H / 2);
}
