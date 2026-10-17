import * as THREE from 'three';
import { hash, hold } from '../../engine/anim';
import { sparkle } from '../../engine/draw2d';
import type { Gfx } from '../../engine/gfx';

/** Fixed star directions (unit vectors, elevation 2°–70°), deterministic. */
const STARS: { d: THREE.Vector3; mag: number; seed: number }[] = [];
for (let i = 0; i < 420; i++) {
  const az = hash(i, 1) * Math.PI * 2;
  const el = (2 + Math.pow(hash(i, 2), 1.4) * 68) * (Math.PI / 180);
  STARS.push({
    d: new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)),
    mag: Math.pow(hash(i, 3), 3),
    seed: hash(i, 4),
  });
}

const v = new THREE.Vector3();

/** Screen-space horizon line (two points) for the camera, or null if not visible. */
export function horizon(cam: THREE.PerspectiveCamera, W: number, H: number) {
  const yaw = cam.rotation.y;
  const pts: [number, number][] = [];
  for (const a of [0.6, -0.6]) {
    v.set(-Math.sin(yaw + a), 0, -Math.cos(yaw + a)).multiplyScalar(1e5).add(cam.position);
    v.y = cam.position.y; // same height → direction of elevation 0
    v.project(cam);
    pts.push([(v.x * 0.5 + 0.5) * W, (0.5 - v.y * 0.5) * H]);
  }
  return pts;
}

/** A radial glow: alpha a at the centre, a·0.35 at 35 % of r, 0 at r (same profile as `glow`). */
export interface Glow {
  x: number;
  y: number;
  r: number;
  color: [number, number, number];
  a: number;
}

export interface SkyParams {
  /** base fill (sRGB 0–255), or null for a transparent base (glows only) */
  base: [number, number, number] | null;
  /** haze strength 0..1 (0 = none) */
  haze: number;
  /** horizon midpoint and the screen-space up-normal (px, y down) */
  mx: number;
  my: number;
  nx: number;
  ny: number;
  /** distances (px) of the haze stops at 0°, 2°, 6°, 14°, 45° and of the warm band end (2.5°) */
  stops: number[];
  band: number;
  glows: Glow[];
}

/** Haze geometry for the camera: horizon line + stop distances at fixed elevation angles. */
export function skyParams(cam: THREE.PerspectiveCamera, W: number, H: number, haze: number, base: [number, number, number] | null, glows: Glow[] = []): SkyParams {
  const [[x0, y0], [x1, y1]] = horizon(cam, W, H);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const fpx = H / 2 / Math.tan((cam.fov * Math.PI) / 360);
  const pitch = cam.rotation.x;
  const stop = (deg: number) => Math.max(1e-3, fpx * (Math.tan((deg * Math.PI) / 180 - pitch) + Math.tan(pitch)));
  return {
    base,
    haze,
    mx: (x0 + x1) / 2,
    my: (y0 + y1) / 2,
    nx: dy / len,
    ny: -dx / len,
    stops: [0, stop(2), stop(6), stop(14), stop(45)],
    band: stop(2.5),
    glows,
  };
}

const MAX_GLOWS = 4;
const SKY_FRAG = /* glsl */ `
uniform vec2 res; uniform float frame;
uniform vec4 base;                 // rgb 0..1, a = 1 (opaque) or 0 (transparent)
uniform float haze; uniform vec2 h0; uniform vec2 hn; uniform float hs[5]; uniform float hband;
uniform vec4 gpos[${MAX_GLOWS}];   // x, y, r, a
uniform vec3 gcol[${MAX_GLOWS}];
uniform int ng;
vec4 over(vec4 top, vec4 bot){ return top + bot * (1.0 - top.a); }   // premultiplied
vec4 pm(vec3 c, float a){ return vec4(c * a, a); }
void main(){
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * res;   // canvas px, y down
  vec4 col = base.a > 0.5 ? vec4(base.rgb, 1.0) : vec4(0.0);
  if (haze > 0.0) {
    float d = dot(p - h0, hn);
    // haze stops (unpremultiplied rgba), interpolated linearly like a canvas gradient
    vec4 c0 = vec4(52.0, 40.0, 96.0, 255.0 * 0.6) / 255.0;
    vec4 c1 = vec4(38.0, 30.0, 74.0, 255.0 * 0.42) / 255.0;
    vec4 c2 = vec4(24.0, 20.0, 50.0, 255.0 * 0.24) / 255.0;
    vec4 c3 = vec4(22.0, 18.0, 44.0, 255.0 * 0.3) / 255.0;
    vec4 c4 = vec4(10.0, 10.0, 11.0, 0.0) / 255.0;
    vec4 c;
    if (d <= hs[1]) c = mix(c0, c1, clamp(d / hs[1], 0.0, 1.0));
    else if (d <= hs[2]) c = mix(c1, c2, (d - hs[1]) / max(hs[2] - hs[1], 1e-3));
    else if (d <= hs[3]) c = mix(c2, c3, (d - hs[2]) / max(hs[3] - hs[2], 1e-3));
    else c = mix(c3, c4, clamp((d - hs[3]) / max(hs[4] - hs[3], 1e-3), 0.0, 1.0));
    col = over(pm(c.rgb, c.a * haze), col);
    float b = 0.1 * haze * (1.0 - clamp(d / max(hband, 1e-3), 0.0, 1.0));
    col = over(pm(vec3(250.0, 128.0, 35.0) / 255.0, b), col);
  }
  for (int i = 0; i < ${MAX_GLOWS}; i++) {
    if (i >= ng) break;
    float r = length(p - gpos[i].xy) / max(gpos[i].z, 1e-3);
    float a = gpos[i].w;
    float k = r < 0.35 ? mix(1.0, 0.35, r / 0.35) : mix(0.35, 0.0, clamp((r - 0.35) / 0.65, 0.0, 1.0));
    col = over(pm(gcol[i], a * k), col);
  }
  // TPDF dither of ±1 LSB before the 8-bit write: the gradients carry no quantisation steps
  float n = hash12(p + vec2(frame * 7.3, frame * 3.1)) + hash12(p * 1.37 + vec2(frame * 1.9, 11.0)) - 1.0;
  col.rgb += n / 255.0 * (col.a > 0.0 ? 1.0 : 0.0);
  outColor = vec4(clamp(col.rgb, 0.0, col.a), col.a);
}`;

/** Sky / glow gradients in float with dither (no 8-bit banding). Returns an sRGB premultiplied texture. */
export function skyPass(g: Gfx, key: string, P: SkyParams, frame: number): THREE.Texture {
  const out = g.rt(key);
  const m = g.material('showcase:sky', SKY_FRAG, {
    res: { value: new THREE.Vector2() },
    frame: { value: 0 },
    base: { value: new THREE.Vector4() },
    haze: { value: 0 },
    h0: { value: new THREE.Vector2() },
    hn: { value: new THREE.Vector2() },
    hs: { value: [0, 1, 2, 3, 4] },
    hband: { value: 1 },
    gpos: { value: Array.from({ length: MAX_GLOWS }, () => new THREE.Vector4()) },
    gcol: { value: Array.from({ length: MAX_GLOWS }, () => new THREE.Vector3()) },
    ng: { value: 0 },
  });
  const u = m.uniforms;
  u.res.value.set(g.W, g.H);
  u.frame.value = frame % 997;
  if (P.base) u.base.value.set(P.base[0] / 255, P.base[1] / 255, P.base[2] / 255, 1);
  else u.base.value.set(0, 0, 0, 0);
  u.haze.value = P.haze;
  u.h0.value.set(P.mx, P.my);
  u.hn.value.set(P.nx, P.ny);
  u.hs.value = P.stops;
  u.hband.value = P.band;
  const n = Math.min(MAX_GLOWS, P.glows.length);
  for (let i = 0; i < n; i++) {
    const gl = P.glows[i];
    (u.gpos.value[i] as THREE.Vector4).set(gl.x, gl.y, gl.r, gl.a);
    (u.gcol.value[i] as THREE.Vector3).set(gl.color[0] / 255, gl.color[1] / 255, gl.color[2] / 255);
  }
  u.ng.value = n;
  g.run(m, out);
  return out.texture;
}

/** Stars on limited animation (canvas, transparent). */
export function drawStars(c: CanvasRenderingContext2D, cam: THREE.PerspectiveCamera, t: number, W: number, H: number, o: { stars: number }) {
  if (o.stars > 0) {
    const th = hold(t, 12);
    const f = Math.tan((cam.fov * Math.PI) / 360);
    const zoom = Math.min(3, 0.55 / f); // stars grow a little with telephoto
    c.save();
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i];
      v.copy(s.d).multiplyScalar(1e5).add(cam.position).project(cam);
      if (v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) continue;
      const px = (v.x * 0.5 + 0.5) * W;
      const py = (0.5 - v.y * 0.5) * H;
      const tw = 0.65 + 0.35 * Math.sin(th * (3 + s.seed * 5) + s.seed * 40);
      const a = o.stars * (0.25 + 0.75 * s.mag) * tw;
      if (s.mag > 0.82) {
        sparkle(c, px, py, (5 + 7 * s.mag) * tw * Math.min(zoom, 1.6), `rgba(255, 246, 228, ${a})`, 0.16);
      } else {
        const r = (0.6 + 0.9 * s.mag) * Math.min(zoom, 2);
        c.fillStyle = `rgba(235, 232, 255, ${a})`;
        c.fillRect(px - r / 2, py - r / 2, r, r);
      }
    }
    c.restore();
  }
}

/** Soft radial glow (premultiplied-friendly) around a point. */
export function glow(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: [number, number, number], a: number) {
  if (a <= 0.001) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${a})`);
  g.addColorStop(0.35, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${a * 0.35})`);
  g.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
