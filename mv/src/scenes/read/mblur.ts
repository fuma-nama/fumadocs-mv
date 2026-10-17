import * as THREE from 'three';
import type { Gfx } from '../../engine/gfx';
import { applyCam, type CamPose } from './world';

/**
 * Camera motion blur (≈180° shutter): projects a few page points at t ± 1/120 s, fits a
 * similarity transform (scale about a fixed point + translation) and blurs the layer along that
 * motion in ONE pass with a tent-weighted kernel — a box kernel leaves ghost copies of text
 * ("double images"), a tent fades the smear out at both ends. Only kicks in on fast moves.
 */

const FRAG = /* glsl */ `
uniform sampler2D tex; uniform vec2 ctr; uniform float zoom; uniform vec2 dir;
void main(){
  vec4 acc = vec4(0.0); float wsum = 0.0;
  for (int i = 0; i < 33; i++) {
    float k = float(i) / 32.0 - 0.5;
    float w = 1.0 - abs(k) * 1.9;          // tent: centre 1, ends 0.05
    vec2 off = (vUv - ctr) * k * zoom + dir * k;
    acc += texture(tex, vUv - off) * w; wsum += w;
  }
  outColor = acc / wsum;
}`;

/** tent-weighted zoom (about `ctr`, uv) + directional (`dir`, uv) blur in one pass */
export function motionTent(gfx: Gfx, src: THREE.Texture, ctr: [number, number], zoom: number, dir: [number, number], key: string): THREE.Texture {
  if (zoom < 0.002 && Math.hypot(dir[0] * 1920, dir[1] * 1080) < 1.5) return src;
  const out = gfx.rt(key);
  const m = gfx.material('read:mtent', FRAG, { tex: { value: null }, ctr: { value: new THREE.Vector2() }, zoom: { value: 0 }, dir: { value: new THREE.Vector2() } });
  m.uniforms.tex.value = src;
  m.uniforms.ctr.value.set(ctr[0], ctr[1]);
  m.uniforms.zoom.value = zoom;
  m.uniforms.dir.value.set(dir[0], dir[1]);
  gfx.run(m, out);
  return out.texture;
}

/** zoom + translation of the image between two sets of screen points */
function fit(a: [number, number][], b: [number, number][]) {
  const ca = a.reduce((s, p) => [s[0] + p[0] / a.length, s[1] + p[1] / a.length], [0, 0]);
  const cb = b.reduce((s, p) => [s[0] + p[0] / b.length, s[1] + p[1] / b.length], [0, 0]);
  const da = a.reduce((s, p) => s + Math.hypot(p[0] - ca[0], p[1] - ca[1]), 0);
  const db = b.reduce((s, p) => s + Math.hypot(p[0] - cb[0], p[1] - cb[1]), 0);
  const sc = db / Math.max(1e-6, da);
  return { ca, cb, sc };
}

function blurFromFit(gfx: Gfx, tex: THREE.Texture, f: ReturnType<typeof fit>, gain: number, maxZoom: number, key: string) {
  const { ca, cb, sc } = f;
  const zoom = Math.min(maxZoom, Math.abs(sc - 1) * gain);
  let ctr: [number, number] = [0.5, 0.5];
  let dir: [number, number] = [0, 0];
  if (Math.abs(1 - sc) > 1e-4) {
    // fixed point of x' = s(x - ca) + cb  →  x* = (cb - s·ca) / (1 - s); far fixed points ≈ a pan
    const fx = (cb[0] - sc * ca[0]) / (1 - sc);
    const fy = (cb[1] - sc * ca[1]) / (1 - sc);
    ctr = [Math.min(2.5, Math.max(-1.5, fx / 1920)), Math.min(2.5, Math.max(-1.5, 1 - fy / 1080))];
  }
  // the translation not explained by the zoom about the (clamped) centre
  const zx = (ca[0] - ctr[0] * 1920) * (sc - 1), zy = (ca[1] - (1 - ctr[1]) * 1080) * (sc - 1);
  const tx = (cb[0] - ca[0] - zx) * gain, ty = (cb[1] - ca[1] - zy) * gain;
  const len = Math.hypot(tx, ty);
  if (len > 2) {
    const k = Math.min(1, 120 / len);
    dir = [(tx * k) / 1920, (-ty * k) / 1080];
  }
  // (the kernel is symmetric: zoom-ins and zoom-outs blur alike)
  return motionTent(gfx, tex, ctr, zoom, dir, key);
}

const cam = new THREE.PerspectiveCamera(28, 16 / 9, 20, 40000);
const v = new THREE.Vector3();
const SAMPLE: [number, number, number][] = [
  [-600, -320, 0], [600, -320, 0], [600, 320, 0], [-600, 320, 0], [0, 0, 0], [0, 0, 120],
];

function screenPts(p: CamPose): [number, number][] {
  applyCam(cam, p);
  return SAMPLE.map(([x, y, z]) => {
    v.set(x, y, z).project(cam);
    return [(v.x * 0.5 + 0.5) * 1920, (0.5 - v.y * 0.5) * 1080];
  });
}

/** motion blur of a page-camera render (pose function), `gain` ≈ shutter fraction */
export function cameraBlur(gfx: Gfx, tex: THREE.Texture, poseAt: (t: number) => CamPose, t: number, key: string, gain = 1, maxZoom = 0.25): THREE.Texture {
  const e = 1 / 120;
  return blurFromFit(gfx, tex, fit(screenPts(poseAt(t - e / 2)), screenPts(poseAt(t + e / 2))), gain, maxZoom, key);
}

const _p = new THREE.Vector3();
/** motion blur for an arbitrary camera function (samples points 1500 units in front of it) */
export function cameraBlurCam(gfx: Gfx, tex: THREE.Texture, camAt: (t: number) => THREE.Camera, t: number, key: string, gain = 1): THREE.Texture {
  const e = 1 / 120;
  const c0 = camAt(t);
  const pts: THREE.Vector3[] = [];
  for (const [nx, ny] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8], [0, 0]]) {
    _p.set(nx, ny, 0.5).unproject(c0);
    const d = _p.sub(c0.position).normalize();
    pts.push(c0.position.clone().add(d.multiplyScalar(1500)));
  }
  const proj = (c: THREE.Camera) => pts.map((p) => {
    _p.copy(p).project(c);
    return [(_p.x * 0.5 + 0.5) * 1920, (0.5 - _p.y * 0.5) * 1080] as [number, number];
  });
  return blurFromFit(gfx, tex, fit(proj(camAt(t - e / 2)), proj(camAt(t + e / 2))), gain, 0.2, key);
}
