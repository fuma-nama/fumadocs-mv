import * as THREE from 'three';
import { mulberry32 } from '../../engine/anim';
import { MOON, P_END } from './rig';

/** Avenue half-width (m): facades of the front row stand at |x| ≈ AVE. The moon hangs over the axis. */
export const AVE = 30;
/** Cross street (Shibuya-like crossing) z-range. */
export const CROSS: [number, number] = [-480, -420];

export interface Tower {
  x: number;
  z: number;
  /** footprint along x (w) and z (d) */
  w: number;
  d: number;
  h: number;
  seed: number;
  /** wake delay (s) after the wake start: lights come on in a wave from the horizon toward the camera */
  wake: number;
}

/** A billboard position. */
export interface Slot {
  pos: THREE.Vector3;
  /** rotation about y: 0 = faces +z (toward the camera), ±π/2 = faces ±x */
  rotY: number;
  w: number;
  h: number;
  tower: number;
  kind: 'blade' | 'facade' | 'front' | 'giant';
}

export interface CityLayout {
  towers: Tower[];
  slots: Slot[];
  /** portrait screens scrolling full pages */
  strips: Slot[];
}

/** Street lamps along both kerbs of the avenue: every LAMP_DZ m from LAMP_Z0 down the avenue. */
export const LAMP_X = AVE - 7;
export const LAMP_Z0 = 240;
export const LAMP_DZ = 22;
export const LAMP_N = 81;
export const LAMP_H = 8.5;
/** Lamps switch on in 16ths from the far end toward the camera (s after the wake start). */
export const lampWake = (z: number) => Math.round((0.1 + 0.62 * Math.min(1, Math.max(0, (z + 1520) / 1760))) / 0.1) * 0.1;
/** GLSL twin of lampWake. */
const LAMP_GLSL = `
float lampWake(float z){ return floor((0.1 + 0.62 * clamp((z + 1520.0) / 1760.0, 0.0, 1.0)) / 0.1 + 0.5) * 0.1; }
`;
const lampSkip = (z: number) => z > CROSS[0] - 6 && z < CROSS[1] + 6;

/** Lamp heads: warm points that ignite (with a flare) in a wave toward the camera. */
export function streetLamps() {
  const pos: number[] = [];
  for (let k = 0; k < LAMP_N; k++) {
    const z = LAMP_Z0 - LAMP_DZ * k;
    if (lampSkip(z)) continue;
    for (const side of [-1, 1]) pos.push(side * LAMP_X, LAMP_H, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uWake0: { value: 0 }, uScale: { value: 1000 }, uOut: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uWake0; uniform float uScale; varying float vA;
      ${LAMP_GLSL}
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float since = uTime - uWake0 - lampWake(position.z);
        float on = step(0.0, since);
        float flare = 1.0 + 1.6 * exp(-max(since, 0.0) / 0.12);
        vA = on * flare;
        gl_PointSize = clamp(1.6 * uScale / -mv.z * (0.8 + 0.4 * flare), 3.0, 34.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOut; varying float vA;
      void main(){
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p) * 2.0;
        float core = 1.0 - smoothstep(0.12, 0.34, d);
        float halo = (1.0 - smoothstep(0.0, 1.0, d)) * 0.45;
        float a = (core + halo) * vA * (1.0 - uOut);
        gl_FragColor = vec4(vec3(1.0, 0.82, 0.58) * a, a);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.userData.noEdges = true;
  return { pts, mat };
}

/** Keep a tower's top under the moon's lower edge as seen from `from` (within ±wedge rad of its azimuth). */
function clampSight(x: number, z: number, h: number, half: number, from: readonly number[], wedge: number, margin: number) {
  const md = new THREE.Vector3(MOON.pos.x - from[0], MOON.pos.y - from[1], MOON.pos.z - from[2]);
  const maz = Math.atan2(md.x, -md.z);
  const mel = Math.atan2(md.y, Math.hypot(md.x, md.z));
  const mar = Math.atan(MOON.radius / md.length());
  const dx = x - from[0];
  const dz = from[2] - z;
  const d = Math.hypot(dx, dz) - half;
  if (d < 25 || dz <= 0) return h;
  const az = Math.atan2(dx, dz);
  if (Math.abs(az - maz) > wedge + mar + Math.atan(half / Math.max(d, 1))) return h;
  return Math.max(12, Math.min(h, from[1] + d * Math.tan(mel - mar - margin)));
}

/**
 * `sights`: camera positions (sampled along the scene's camera path) from which the moon must stay
 * in open sky; towers in front of it are lowered under its lower edge.
 */
export function buildLayout(sights: readonly (readonly number[])[], seed = 5701): CityLayout {
  const clampForMoonShot = (x: number, z: number, h: number, half = 0) => {
    for (const p of sights) h = clampSight(x, z, h, half, p, 0.012, 0.012);
    return clampSight(x, z, h, half, P_END, 0.33, 0.0105);
  };
  const r = mulberry32(seed);
  const rr = (a: number, b: number) => a + (b - a) * r();
  const towers: Tower[] = [];
  const slots: Slot[] = [];
  const strips: Slot[] = [];
  const add = (x: number, z: number, w: number, d: number, h: number) => {
    h = clampForMoonShot(x, z, h, Math.max(w, d) * 0.7);
    const dist = Math.hypot(x, z - 120);
    // quantised to 16ths: the city switches on in rhythm
    const wake = Math.round((0.05 + 0.6 * (1 - Math.min(1, dist / 1900)) + r() * 0.08) / 0.1) * 0.1;
    towers.push({ x, z, w, d, h, seed: r() * 1000, wake });
    return towers.length - 1;
  };
  for (const side of [-1, 1]) {
    let z = 260;
    while (z > -1560) {
      const d = rr(22, 42);
      const gap = rr(5, 12);
      if (z > CROSS[0] && z - d < CROSS[1]) {
        z = CROSS[0];
        continue;
      }
      const w = rr(22, 36);
      const zone = z > -350 ? 0 : z > -900 ? 1 : 2;
      const corner = Math.abs(z - CROSS[0]) < 5 || Math.abs(z - d - CROSS[1]) < 40;
      const tall = r() < 0.2;
      const h = corner ? rr(130, 180) : zone === 0 ? (tall ? rr(85, 130) : rr(28, 80)) : zone === 1 ? (tall ? rr(150, 220) : rr(45, 140)) : rr(60, 180);
      const cx = side * (AVE + w / 2 + rr(0, 2));
      const cz = z - d / 2;
      const ti = add(cx, cz, w, d, h);
      const th = towers[ti].h;
      const face = cx - side * (w / 2); // facade plane facing the avenue
      // blade screens: perpendicular to the facade, facing up the avenue (+z), over the sidewalk
      const blades = r() < (z > -300 && z < 140 ? 0.8 : 0.45) ? 2 : 1;
      for (let k = 0; k < blades; k++) {
        const sw = rr(10, 17);
        const sh = sw / 1.6;
        const y = k === 0 ? rr(9, Math.max(10, Math.min(30, th - sh - 4))) : rr(Math.min(th - sh - 6, 34), Math.max(36, th - sh - 4));
        if (y + sh > th - 1.5 || y < 7) continue;
        const zz = cz + d / 2 - 2 - (k ? d * 0.5 : 0);
        slots.push({ pos: new THREE.Vector3(face - side * (sw / 2 + 0.8), y + sh / 2, zz), rotY: 0, w: sw, h: sh, tower: ti, kind: 'blade' });
      }
      // flat facade screens facing the avenue (near the camera path: big LED walls, stacked)
      const near = z > -300 && z < 140;
      if (near || r() < 0.75) {
        const sw = near ? Math.min(d * 0.9, rr(18, 30)) : Math.min(d * 0.85, rr(12, 24));
        const sh = sw / 1.6;
        const y = rr(near ? 7 : 10, Math.max(near ? 8 : 11, Math.min(th - sh - 4, near ? 26 : 70)));
        if (y + sh < th - 2) slots.push({ pos: new THREE.Vector3(face - side * 0.4, y + sh / 2, cz + rr(-0.3, 0.3) * (d - sw)), rotY: -side * (Math.PI / 2), w: sw, h: sh, tower: ti, kind: 'facade' });
        if (near && th > y + sh + 24) {
          const sw2 = Math.min(d * 0.8, rr(14, 22));
          const sh2 = sw2 / 1.6;
          const y2 = rr(y + sh + 4, Math.max(y + sh + 5, th - sh2 - 4));
          if (y2 + sh2 < th - 2) slots.push({ pos: new THREE.Vector3(face - side * 0.4, y2 + sh2 / 2, cz + rr(-0.3, 0.3) * (d - sw2)), rotY: -side * (Math.PI / 2), w: sw2, h: sh2, tower: ti, kind: 'facade' });
        }
      }
      // rooftop billboard facing up the avenue
      if (!corner && r() < 0.3 && th < 120) {
        const sw = Math.min(w * 0.9, rr(18, 28));
        const sh = sw / 1.6;
        const pos = new THREE.Vector3(cx + rr(-0.1, 0.1) * w, th + 3 + sh / 2, cz + rr(-0.2, 0.2) * d);
        // never in front of the moon
        const top = th + 3 + sh;
        if (clampForMoonShot(cx, cz, top, Math.max(w, d) * 0.7) >= top) slots.push({ pos, rotY: 0, w: sw, h: sh, tower: ti, kind: 'giant' });
      }
      // giant screens on the crossing corners, facing up the avenue
      if (corner) {
        const sw = Math.min(w * 0.95, rr(30, 40));
        const sh = sw / 1.6;
        slots.push({ pos: new THREE.Vector3(cx, th - sh / 2 - 8, cz + d / 2 + 0.5), rotY: 0, w: sw, h: sh, tower: ti, kind: 'giant' });
      }
      // a portrait strip on some tall towers
      if (th > 80 && r() < 0.4 && strips.length < 26) {
        const sw = rr(6, 8);
        const sh = sw * 2.4;
        const y = rr(th * 0.35, th - sh - 6);
        strips.push({ pos: new THREE.Vector3(face - side * 0.45, y + sh / 2, cz + d * 0.28 * (r() - 0.5)), rotY: -side * (Math.PI / 2), w: sw, h: sh, tower: ti, kind: 'facade' });
      }
      // second row behind, taller
      if (r() < 0.9) {
        const w2 = rr(22, 36);
        const d2 = rr(22, 36);
        const h2 = r() < 0.35 ? rr(150, 250) : rr(60, 160);
        const cx2 = side * (AVE + w + rr(10, 18) + w2 / 2);
        const ti2 = add(cx2, cz + rr(-8, 8), w2, d2, h2);
        const th2 = towers[ti2].h;
        if (th2 > th + 18 && r() < 0.75) {
          const sw = rr(14, 24);
          const sh = sw / 1.6;
          const y = rr(th + 4, Math.max(th + 5, th2 - sh - 4));
          if (y + sh < th2 - 2) slots.push({ pos: new THREE.Vector3(cx2, y + sh / 2, towers[ti2].z + d2 / 2 + 0.4), rotY: 0, w: sw, h: sh, tower: ti2, kind: 'front' });
        }
      }
      z -= d + gap;
    }
  }
  // outer field (skyline mass)
  for (let i = 0; i < 560; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const x = side * rr(120, 950);
    const z = rr(-1750, 300);
    const w = rr(20, 50);
    const d = rr(20, 50);
    const h = r() < 0.14 ? rr(160, 280) : rr(30, 150);
    const ti = add(x, z, w, d, h);
    if (r() < 0.25 && towers[ti].h > 45) {
      const sw = rr(16, 28);
      const sh = sw / 1.6;
      const y = rr(towers[ti].h * 0.4, towers[ti].h - sh - 3);
      slots.push({ pos: new THREE.Vector3(x, y + sh / 2, z + d / 2 + 0.4), rotY: 0, w: sw, h: sh, tower: ti, kind: 'front' });
    }
  }
  // far skyline beyond the avenue's end; the band under the moon is tall enough to show at the
  // bottom of the final telephoto frame (tops ≈ 4–6° above the final camera's horizon)
  for (let i = 0; i < 160; i++) {
    const x = rr(-900, 700);
    const z = rr(-1720, -1450);
    const under = Math.abs(x + 430) < 330;
    add(x, z, rr(24, 56), rr(24, 56), under ? rr(215, 300) : rr(40, 200));
  }
  return { towers, slots, strips };
}

// ── materials ────────────────────────────────────────────────────────────────

const COMMON = /* glsl */ `
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

export const FOG = '#191530';

/** Towers: ink body, AA window grid (warm/cool, lit floors), shop band, fog, wake wave, lights-out. */
export function towerMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWake0: { value: 0 },
      uOut: { value: 0 },
      uExpose: { value: 1 },
      uBody: { value: new THREE.Color('#08080d') },
      uTop: { value: new THREE.Color('#141226') },
      uFog: { value: new THREE.Color(FOG) },
      uFogNear: { value: 300 },
      uFogFar: { value: 2400 },
      uWarm: { value: new THREE.Color('#ffcf9c') },
      uCool: { value: new THREE.Color('#a8c2ff') },
      uGain: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed; attribute float aWake; attribute float aH;
      varying vec3 vW; varying vec3 vN; varying float vSeed; varying float vWake; varying float vH; varying float vDist;
      void main(){
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vSeed = aSeed; vWake = aWake; vH = aH;
        vec4 mv = viewMatrix * wp;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uWake0; uniform float uOut; uniform float uExpose; uniform vec3 uBody; uniform vec3 uTop; uniform vec3 uFog;
      uniform float uFogNear; uniform float uFogFar; uniform vec3 uWarm; uniform vec3 uCool; uniform float uGain;
      varying vec3 vW; varying vec3 vN; varying float vSeed; varying float vWake; varying float vH; varying float vDist;
      ${COMMON}
      float cover(float x, float lo, float hi, float w){
        w = max(w * 1.25, 1e-4);
        return clamp((min(x + 0.5 * w, hi) - max(x - 0.5 * w, lo)) / w, 0.0, 1.0);
      }
      float box(vec2 f, vec2 lo, vec2 hi, vec2 fw){
        vec2 a = smoothstep(lo - fw, lo + fw, f);
        vec2 b = 1.0 - smoothstep(hi - fw, hi + fw, f);
        return a.x * b.x * a.y * b.y;
      }
      void main(){
        vec3 n = normalize(vN);
        float hy = clamp(vW.y / max(vH, 1.0), 0.0, 1.0);
        // body (ambient) scales with the night exposure; lights (emissive) do not
        vec3 body = mix(uBody, uTop, hy * hy * hy);
        body *= n.z > 0.5 ? 0.85 : (abs(n.x) > 0.5 ? 1.0 : 1.15);
        vec3 light = vec3(0.0);
        float since = uTime - uWake0 - vWake;
        float lights = (1.0 - uOut) * step(0.0, since);
        if (abs(n.y) < 0.5) {
          vec2 fc = abs(n.x) > 0.5 ? vec2(vW.z * sign(n.x), vW.y) : vec2(-vW.x * sign(n.z), vW.y);
          // office windows: small, sparse, a few fully lit floors
          vec2 g = fc / vec2(1.55, 3.1);
          vec2 id = floor(g);
          vec2 f = fract(g);
          vec2 fw = max(fwidth(g), vec2(1e-4));
          // window coverage = the window box integrated over the pixel footprint (box filter):
          // stays stable under motion even when a window is smaller than a pixel
          float win = cover(f.x, 0.3, 0.7, fw.x) * cover(f.y, 0.38, 0.7, fw.y);
          float r = h21(id + vSeed);
          float r2 = h21(id * 1.7 + vSeed * 3.1);
          float fl = h21(vec2(id.y * 1.13, vSeed * 0.37));
          float band = h21(vec2(floor(id.x / 6.0), id.y * 0.7 + vSeed));
          float density = fl > 0.9 ? 0.7 : (band > 0.8 ? 0.35 : 0.04 + 0.14 * h21(vec2(vSeed, 7.0)));
          float pix = max(fw.x, fw.y);
          // once a whole window bay is about a pixel, blend into the bay's average light
          float far = smoothstep(0.35, 0.8, pix);
          // windows switch on in three 16th steps and flare as they do (the waking city reads as a wave)
          float tOn = floor(r2 * 2.99) * 0.1;
          float on = step(r, density) * step(tOn, since);
          float flare = 1.0 + 2.2 * exp(-max(since - tOn, 0.0) / 0.1);
          float tog = step(0.99, h21(id + vec2(floor(uTime * 5.0), vSeed))) * (1.0 - step(0.5, far));
          on = abs(on - tog * step(0.3, since));
          vec3 wc = r2 < 0.7 ? uWarm : (r2 < 0.93 ? uCool : vec3(1.0, 0.6, 0.3));
          wc *= 0.3 + 0.7 * h21(id * 2.3 + vSeed) * h21(id * 0.7 + 3.0);
          float floors = step(5.0, vW.y) * step(vW.y, vH - 2.0);
          float onFrac = (step(0.0, since) + step(0.1, since) + step(0.2, since)) / 3.0;
          float flareFar = 1.0 + 1.8 * exp(-max(since, 0.0) / 0.16);
          float m = mix(win * on * flare, density * 0.16 * onFrac * flareFar, far) * floors;
          vec3 wcFar = mix(wc, uWarm * 0.6, far);
          light += wcFar * m * lights * uGain;
          // roof rim: the facade's top edge catches the sky glow
          float rim = smoothstep(vH - 1.2, vH - 0.1, vW.y);
          body += vec3(0.022, 0.018, 0.04) * rim;
          // street level: dim shop interiors + a thin neon sign strip
          vec2 sg = vec2(fc.x / 6.0, (vW.y - 0.6) / 2.6);
          vec2 sid = floor(sg);
          vec2 sfw = max(fwidth(sg), vec2(1e-4));
          float shop = box(fract(sg), vec2(0.06, 0.0), vec2(0.94, 1.0), sfw) * step(0.0, sg.y) * step(sg.y, 1.0);
          float shopOn = step(0.4, h21(sid + vSeed * 2.0));
          float hue = h21(sid * 3.1 + vSeed);
          vec3 sc = hue < 0.55 ? uWarm : (hue < 0.75 ? vec3(1.0, 0.3, 0.5) : (hue < 0.9 ? vec3(0.3, 0.85, 1.0) : vec3(0.6, 1.0, 0.4)));
          light += uWarm * shop * shopOn * 0.03 * lights * (1.0 - far);
          float sy = vW.y - 3.35;
          float sfwy = max(fwidth(vW.y), 1e-3);
          float strip = (1.0 - smoothstep(0.12 - sfwy, 0.12 + sfwy, abs(sy))) * box(fract(sg), vec2(0.12, -1.0), vec2(0.88, 2.0), sfw);
          light += sc * strip * shopOn * 0.55 * lights * (1.0 - smoothstep(0.1, 0.4, max(sfw.x, sfw.y)));
        } else {
          body = uTop * 0.7;
        }
        float fog = smoothstep(uFogNear, uFogFar, vDist);
        vec3 col = mix(body * uExpose, uFog * uExpose, fog * 0.9) + light * (1.0 - fog * 0.72);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** Instanced towers (unit box, base at y = 0). */
export function towersMesh(layout: CityLayout, mat: THREE.ShaderMaterial) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const n = layout.towers.length;
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const seed = new Float32Array(n);
  const wake = new Float32Array(n);
  const hh = new Float32Array(n);
  const m = new THREE.Matrix4();
  layout.towers.forEach((tw, i) => {
    m.makeScale(tw.w, tw.h, tw.d).setPosition(tw.x, 0, tw.z);
    mesh.setMatrixAt(i, m);
    seed[i] = tw.seed;
    wake[i] = tw.wake;
    hh[i] = tw.h;
  });
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  geo.setAttribute('aWake', new THREE.InstancedBufferAttribute(wake, 1));
  geo.setAttribute('aH', new THREE.InstancedBufferAttribute(hh, 1));
  mesh.frustumCulled = false;
  return mesh;
}

/** Ground: asphalt, lane marks, crossing zebra, warm glow pool along the avenue. */
export function groundMesh() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uFog: { value: new THREE.Color(FOG) },
      uOut: { value: 0 },
      uLights: { value: 0 },
      uExpose: { value: 1 },
      uTime: { value: 0 },
      uWake0: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW; varying float vDist;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mv = viewMatrix * wp; vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFog; uniform float uOut; uniform float uLights; uniform float uExpose; uniform float uTime; uniform float uWake0;
      varying vec3 vW; varying float vDist;
      ${LAMP_GLSL}
      // box-filtered pulse train: on for fract(x) in [d0, 1), filtered over width w (analytic AA)
      float Ip(float x, float d0){ return floor(x) * (1.0 - d0) + max(fract(x) - d0, 0.0); }
      float pulseAA(float x, float d0, float w){ w = max(w, 1e-4); return (Ip(x + 0.5 * w, d0) - Ip(x - 0.5 * w, d0)) / w; }
      void main(){
        vec3 col = vec3(0.004, 0.004, 0.006);
        float ax = abs(vW.x);
        float fwx = max(fwidth(vW.x), 1e-3);
        float fwz = max(fwidth(vW.z), 1e-3);
        float road = 1.0 - smoothstep(${(AVE - 8).toFixed(1)} - fwx, ${(AVE - 8).toFixed(1)} + fwx, ax);
        col = mix(vec3(0.008, 0.008, 0.012), col, road);
        float lit = uLights * (1.0 - uOut);
        float far = smoothstep(1.5, 5.0, fwz);
        // lane lines (dashed) and the centre double line
        float dash = pulseAA(vW.z / 10.0, 0.45, fwz / 10.0 * 1.5);
        float l1 = (1.0 - smoothstep(0.1 - fwx, 0.1 + fwx, abs(ax - 7.5))) * dash;
        float l2 = (1.0 - smoothstep(0.1 - fwx, 0.1 + fwx, abs(ax - 15.0))) * dash;
        float c2 = (1.0 - smoothstep(0.08 - fwx, 0.08 + fwx, abs(ax - 0.35)));
        float marks = (l1 + l2) * 0.5 + c2 * 0.7;
        // zebra crossing at the cross street
        float inCross = step(${CROSS[0].toFixed(1)}, vW.z) * step(vW.z, ${CROSS[1].toFixed(1)});
        float zeb = pulseAA(vW.x / 1.6, 0.5, fwx / 1.6 * 1.5) * (step(${(CROSS[1] - 8).toFixed(1)}, vW.z) + step(vW.z, ${(CROSS[0] + 8).toFixed(1)})) * inCross * road;
        marks = mix(marks, 0.06, far) + zeb * mix(0.55, 0.15, far);
        col += vec3(0.5, 0.5, 0.52) * marks * road * 0.35 * lit;
        // light spill from the facades
        float spill = exp(-max(0.0, ${AVE.toFixed(1)} - ax) / 5.0) * 0.035 + exp(-ax / 12.0) * 0.01;
        col += vec3(1.0, 0.66, 0.45) * spill * lit;
        col *= uExpose;
        // pools of lamplight on the road, igniting with the lamps
        float zk = ${LAMP_Z0.toFixed(1)} - ${LAMP_DZ.toFixed(1)} * clamp(floor((${LAMP_Z0.toFixed(1)} - vW.z) / ${LAMP_DZ.toFixed(1)} + 0.5), 0.0, ${(LAMP_N - 1).toFixed(1)});
        float skip = step(${(CROSS[0] - 6).toFixed(1)}, zk) * step(zk, ${(CROSS[1] + 6).toFixed(1)});
        float dl = abs(ax - ${LAMP_X.toFixed(1)});
        // small pools hugging the kerb: the road itself stays ink with its lane marks
        float pool = exp(-(dl * dl / (2.0 * 2.6 * 2.6) + (vW.z - zk) * (vW.z - zk) / (2.0 * 4.0 * 4.0))) * (1.0 - skip);
        float sinceL = uTime - uWake0 - lampWake(zk);
        float lampOn = step(0.0, sinceL) * (1.0 + 1.4 * exp(-max(sinceL, 0.0) / 0.12)) * (1.0 - uOut);
        vec3 lampCol = vec3(1.0, 0.72, 0.42) * pool * 0.06 * lampOn;
        float fog = smoothstep(260.0, 2400.0, vDist);
        col = mix(col, uFog * uExpose, fog * 0.9) + lampCol * (1.0 - fog * 0.7);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const g = new THREE.PlaneGeometry(6000, 6000);
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.set(0, 0, -800);
  mesh.userData.noEdges = true;
  return mesh;
}

/** Red aviation lights on the tall towers' roofs, blinking on the 8ths (staggered). */
export function aviationLights(layout: CityLayout) {
  const pos: number[] = [];
  const seed: number[] = [];
  layout.towers.forEach((tw, i) => {
    if (tw.h < 95) return;
    const corners = tw.h > 160 ? [[-0.42, -0.42], [0.42, 0.42], [-0.42, 0.42], [0.42, -0.42]] : [[0, 0]];
    for (const [a, b] of corners) {
      pos.push(tw.x + a * tw.w, tw.h + 1.2, tw.z + b * tw.d);
      seed.push((i * 7 + pos.length) % 4);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1000 }, uOn: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime; uniform float uScale; varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float ph = mod(floor(uTime / 0.2 + 0.001) + aSeed, 4.0);
        vA = ph < 0.5 ? 1.0 : 0.16;
        gl_PointSize = clamp(2.4 * uScale / -mv.z, 3.0, 26.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOn; varying float vA;
      void main(){
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p) * 2.0;
        float core = 1.0 - smoothstep(0.15, 0.4, d);
        float halo = (1.0 - smoothstep(0.0, 1.0, d)) * 0.5;
        float a = (core + halo) * vA * uOn;
        gl_FragColor = vec4(vec3(1.0, 0.16, 0.1) * a * 1.6, a);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.userData.noEdges = true;
  return { pts, mat };
}
