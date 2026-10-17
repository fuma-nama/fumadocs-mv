import * as THREE from 'three';
import type { Engine, Frame } from '../../engine/engine';
import { clamp, ease, lerp, mulberry32 } from '../../engine/anim';
import { FONTS } from '../../engine/draw2d';
import { render3D, toonMat } from '../../engine/three-kit';
import { ditherTex, TRI_NOISE } from './dither';
import { C } from '../_shared/palette';
import { baselineRatio, LAYOUT_HERO, pointOn, tangentOn, TOC_LIGHT, type TocLayout } from './toc-geometry';
import { ARR_A, cameraA, EV_A, stateA, TM_A } from './shotA';
import { BEAT, cssEase, hops, T_B, T_C, tocStateAt, transitioned, type RangeEvent, type Target } from './timeline';

/**
 * Shot B — the city of headings (28.8–32.0). The page from A becomes the ground of a night city:
 * world = css · K (one TOC row = 1 unit), X = css x, Z = css y (page-down = +Z), Y up.
 */
const L: TocLayout = LAYOUT_HERO;
const ROWS = L.rows;
export const K = 1 / 32;
const FOV = 30;
const F_PX = 540 / Math.tan(((FOV / 2) * Math.PI) / 180); // focal length in px (H = 1080)

// ── schedule ────────────────────────────────────────────────────────────────
const A_LAST = EV_A[EV_A.length - 1].end; // 11 (Themes)
/**
 * The flight: the dot ARRIVES at one sign per drum hit (timing.json) — snare 29.2 · kick 29.8 ·
 * snare 30.0 · kick 30.4 · snare 30.8 · kick 31.0 · kick 31.4 → rows 12 … 18 (Showcase). Each sign
 * flashes and fires its pillar on the arrival.
 */
export const HEADS_B = [29.2, 29.8, 30.0, 30.4, 30.8, 31.0, 31.4];
// the flight decelerates into each sign (in-out), landing on the hit
const EV_B: RangeEvent[] = [...EV_A, ...hops(A_LAST, HEADS_B, 0.36, ARR_A[ARR_A.length - 1], 0.08, 0.3, ease.inOutCubic)];
/** arrival time at row i (B's rows) */
const arrivalB = (i: number) => HEADS_B[i - A_LAST - 1];
const T_RISE = T_B + BEAT; // 29.2 snare: monoliths rise
const T_CRANE = T_C - 0.55; // 31.45 crane back up to top-down
const T_REWIND = T_C - 0.4; // 31.6 thumb zips back to "Reading" (TOC click → scroll to top)
const T_REW_END = T_C; // lands on the 32.0 kick (C's first frame)
const rewEase = ease.inOutCubic;

export function stateB(t: number) {
  // A's timing until its last head, then longer, flowing glides for the flight
  if (t < T_B) return stateA(t);
  return tocStateAt(t, L, 3, EV_B, TM_A);
}

/** thumb arc length in B (with the closing rewind to "Reading") */
function dotDistB(t: number): number {
  if (t < T_REWIND) return stateB(t).dotDist;
  const d0 = stateB(T_REWIND).dotDist;
  return lerp(d0, L.lens[0][1], rewEase(clamp((t - T_REWIND) / (T_REW_END - T_REWIND))));
}

/** when the rewinding thumb passes row i (its monolith sinks then) */
const SINK_AT: number[] = (() => {
  const d0 = L.lens[ROWS.length - 1][1];
  const d1 = L.lens[0][1];
  return ROWS.map((r) => {
    const f = clamp((d0 - L.lens[r.i][1]) / (d0 - d1));
    let lo = 0, hi = 1;
    for (let k = 0; k < 40; k++) {
      const m = (lo + hi) / 2;
      if (rewEase(m) < f) lo = m;
      else hi = m;
    }
    // the wave runs slightly ahead of the thumb and is done before the downbeat
    return Math.min(T_REWIND + lo * (T_REW_END - T_REWIND) - 0.05, T_C - 0.2);
  });
})();

/** the page is flat and dark again, ready for C's NORMAL panel */
function endFlatAt(t: number) {
  return ease.inOutCubic(clamp((t - T_REWIND) / (T_C - T_REWIND)));
}

/** night 0 (paper day) → 1 */
export function nightAt(t: number) {
  return ease.inOutCubic(clamp((t - (T_B + 0.05)) / 0.5));
}
/**
 * The page lamp: high above (and up-page of) the guide at 28.8 — uniform light, exactly A's page —
 * it sinks into the dot until 29.2 (the pool of light contracts with real cosθ/r² falloff while the
 * camera tilts), then goes out as the guide's own light takes over.
 */
function lampAt(t: number, dx: number, dz: number, out: THREE.Vector3): number {
  // ease-out in log height: the pool forms as soon as the tilt starts (uniform on the 28.8 frame)
  const u = clamp((t - (T_B + 0.02)) / 0.4);
  const k = 1 - (1 - u) * (1 - u);
  const h = Math.exp(lerp(Math.log(200), Math.log(0.3), k));
  out.set(dx, h, dz - LAMP_OFF * h);
  const o = clamp((t - (T_B + 0.26)) / 0.18);
  return 1 - o * o * (3 - 2 * o);
}
/** the lamp's light warms toward the guide's orange as it sinks into the dot */
function lampWarm(t: number) {
  const o = clamp((t - (T_B + 0.2)) / 0.2);
  return o * o * (3 - 2 * o);
}
const lampPos = new THREE.Vector3();
const tmpV = new THREE.Vector3();
/** background tone under the lyric column in the last rendered B frame */
export let toneB: 'light' | 'dark' = 'light';
function lampE(px: number, pz: number, I: number): number {
  const r = Math.hypot(lampPos.x - px, lampPos.y, lampPos.z - pz);
  return clamp(Math.pow(lampPos.y / r, 3) / LAMP_E0) * I;
}

// ── scene graph ─────────────────────────────────────────────────────────────
interface Mono {
  i: number;
  mesh: THREE.Mesh;
  face: THREE.Mesh;
  faceMat: THREE.MeshBasicMaterial;
  h: number;
  w: number;
  ground: THREE.Mesh;
  groundMat: THREE.MeshBasicMaterial;
}

let scene3: THREE.Scene;
let cam: THREE.PerspectiveCamera;
let groundMat: THREE.ShaderMaterial;
let railMat: THREE.ShaderMaterial;
let dotMesh: THREE.Mesh;
let dotMat: THREE.MeshBasicMaterial;
let glow: THREE.Sprite;
let glowMat: THREE.ShaderMaterial;
let point: THREE.PointLight;
let amb: THREE.AmbientLight;
let moon: THREE.DirectionalLight;
let monos: Mono[] = [];
let city: THREE.InstancedMesh;
let cityData: { x: number; z: number; w: number; d: number; h: number; delay: number }[] = [];
let monoMat: THREE.MeshToonMaterial;
let fog: THREE.Fog;

const TEX_R = 8; // texture px per css px for heading text

function headingTexture(title: string): { tex: THREE.CanvasTexture; wCss: number } {
  const cv = document.createElement('canvas');
  const c = cv.getContext('2d')!;
  const size = 14 * TEX_R;
  c.font = `400 ${size}px ${FONTS.ui}`;
  const wCss = c.measureText(title).width / TEX_R;
  cv.width = Math.ceil((wCss + 4) * TEX_R);
  cv.height = 20 * TEX_R;
  c.font = `400 ${size}px ${FONTS.ui}`;
  c.fillStyle = '#ffffff';
  c.textBaseline = 'alphabetic';
  c.fillText(title, 0, baselineRatio(c) * size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.premultiplyAlpha = false;
  return { tex, wCss };
}

const lin = (hex: string) => new THREE.Color(hex);

/** lamp z-offset ratio (up-page of the guide) and the irradiance at the guide, for normalising */
const LAMP_OFF = 0.58;
const LAMP_E0 = Math.pow(1 / Math.sqrt(1 + LAMP_OFF * LAMP_OFF), 3);

/** shared GLSL: irradiance of the page lamp at world position p (1 = paper white) */
const LAMP_GLSL = /* glsl */ `
  uniform vec3 uLamp; uniform float uLampI; uniform float uE0;
  float lampE(vec3 p){
    vec3 toL = uLamp - p;
    float r = max(length(toL), 1e-4);
    return clamp(pow(max(uLamp.y, 1e-4) / r, 3.0) / uE0, 0.0, 1.0) * uLampI;
  }`;

function lampUniforms() {
  return { uLamp: { value: new THREE.Vector3(0, 200, 0) }, uLampI: { value: 1 }, uE0: { value: LAMP_E0 } };
}

function buildGround() {
  groundMat = new THREE.ShaderMaterial({
    uniforms: {
      ...lampUniforms(),
      uCam: { value: new THREE.Vector3() },
      uPings: { value: Array.from({ length: 3 }, () => new THREE.Vector4()) },
      uSheen: { value: 0 },
      uSkyL: { value: new THREE.Vector3(0, 0.866, -0.5) },
      uLampCol: { value: lin(TOC_LIGHT.bg) },
      uDot: { value: new THREE.Vector2() },
      uPaper: { value: lin(TOC_LIGHT.bg) },
      uInk: { value: lin(C.INK) },
      uGrid: { value: 0 },
      uGridS: { value: 0.25 },
      uOrange: { value: lin(C.ORANGE) },
      uPool: { value: 0 },
      uFogCol: { value: lin(C.INK) },
      uFogNear: { value: 10 },
      uFogFar: { value: 40 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW; varying float vDepth;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCam; uniform float uSheen; uniform vec3 uSkyL; uniform vec3 uLampCol; uniform vec2 uDot; uniform vec3 uPaper; uniform vec3 uInk; uniform float uGrid; uniform float uGridS;
      uniform vec3 uOrange; uniform float uPool; uniform vec3 uFogCol; uniform float uFogNear; uniform float uFogFar;
      uniform vec4 uPings[3]; // xz centre, radius, strength
      varying vec3 vW; varying float vDepth;
      ${LAMP_GLSL}
      ${TRI_NOISE}
      void main(){
        float d = length(vW.xz - uDot);
        // the page is a lit surface: a lamp above (slightly up-page of) the guide, cosθ/r² falloff;
        // as it sinks into the dot the pool of light contracts and the far floor falls into darkness
        float E = lampE(vW);
        vec3 col = mix(uInk, uLampCol, E);
        // satin paper: the reflection of a high sky light (60°, opposite the camera) — invisible
        // top-down, a sheen band sweeps down the page as the camera pitches through 60°
        vec3 V = normalize(uCam - vW);
        vec3 Rv = reflect(-uSkyL, vec3(0.0, 1.0, 0.0));
        col += vec3(1.0, 0.985, 0.95) * pow(max(dot(Rv, V), 0.0), 36.0) * uSheen * E;
        // technical dot grid (8 css px), ink on the lit paper
        vec2 g = abs(fract(vW.xz / uGridS + 0.5) - 0.5) * uGridS;
        float dotm = 1.0 - smoothstep(0.004, 0.012, length(g));
        col = mix(col, uInk, dotm * uGrid * 0.07 * E);
        // warm pool of light around the guide
        col += uOrange * uPool * exp(-d * d / 2.2) * 0.14;
        // ping rings where the guide lit a sign
        for (int i = 0; i < 3; i++) {
          vec4 pg = uPings[i];
          if (pg.w <= 0.0) continue;
          float dr = length(vW.xz - pg.xy) - pg.z;
          col += uOrange * pg.w * exp(-dr * dr / (0.06 * 0.06 + pg.z * pg.z * 0.004)) * 0.9;
        }
        float f = smoothstep(uFogNear, uFogFar, vDepth);
        col = mix(col, uFogCol, f);
        // dither in sRGB before the 8-bit resolve (the pools are long, dark gradients)
        vec3 sr = pow(max(col, 0.0), vec3(1.0 / 2.2));
        sr += triNoise(gl_FragCoord.xy) * 2.0 / 255.0;
        col = pow(max(sr, 0.0), vec3(2.2));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
  g.rotation.x = -Math.PI / 2;
  // the ground takes part in the line pass so monolith silhouettes against it keep their lines
  g.renderOrder = 0;
  scene3.add(g);
}

function buildRail() {
  // ribbon along the TOC path: centre + side * normal * width/2 (width in world units via uniform)
  const p = L.pts;
  const n = p.length / 3;
  const pos: number[] = [], nrm: number[] = [], side: number[] = [], dist: number[] = [], ycss: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], l = p[i * 3 + 2];
    const [tx, ty] = tangentOn(p, l);
    for (const s of [-1, 1]) {
      pos.push(x * K, 0.003, y * K);
      nrm.push(-ty, tx); // normal in (x, z)
      side.push(s);
      dist.push(l);
      ycss.push(y);
    }
    if (i < n - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aNrm', new THREE.Float32BufferAttribute(nrm, 2));
  geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  geo.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
  geo.setAttribute('aY', new THREE.Float32BufferAttribute(ycss, 1));
  geo.setIndex(idx);
  railMat = new THREE.ShaderMaterial({
    uniforms: {
      uW: { value: K },
      uWGlow: { value: 0 },
      ...lampUniforms(),
      uRail: { value: lin('#e1e1e1') },
      uRailLit: { value: lin('#e1e1e1') },
      uRailA: { value: 1 },
      uActive: { value: lin(C.ORANGE) },
      uTop: { value: 0 },
      uBottom: { value: 0 },
      uTrailFrom: { value: 0 },
      uDotD: { value: 0 },
      uTrail: { value: 0 },
      uFogCol: { value: lin(C.INK) },
      uFogNear: { value: 10 },
      uFogFar: { value: 40 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec2 aNrm; attribute float aSide; attribute float aDist; attribute float aY;
      uniform float uW; varying float vDist; varying float vY; varying float vSide; varying float vDepth; varying vec3 vW;
      void main(){
        vec3 p = position + vec3(aNrm.x, 0.0, aNrm.y) * aSide * uW * 0.5;
        vDist = aDist; vY = aY; vSide = aSide;
        vW = (modelMatrix * vec4(p, 1.0)).xyz;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uRail; uniform vec3 uRailLit; uniform float uRailA; uniform vec3 uActive; uniform float uTop; uniform float uBottom;
      uniform float uTrailFrom; uniform float uDotD; uniform float uTrail; uniform float uWGlow;
      uniform vec3 uFogCol; uniform float uFogNear; uniform float uFogFar;
      varying float vDist; varying float vY; varying float vSide; varying float vDepth; varying vec3 vW;
      ${LAMP_GLSL}
      void main(){
        float act = step(uTop, vY) * step(vY, uBottom);
        float trail = uTrail * step(uTrailFrom, vDist) * step(vDist, uDotD) * (0.35 + 0.65 * exp(-(uDotD - vDist) / 60.0));
        float core = 1.0 - smoothstep(0.55, 1.0, abs(vSide)) * uWGlow; // soft edges when the avenue widens
        vec3 col = mix(uRail, uRailLit, lampE(vW)); float a = uRailA;
        float lit = max(act, trail);
        col = mix(col, uActive, lit);
        a = mix(a, 1.0, lit);
        float f = smoothstep(uFogNear, uFogFar, vDepth);
        col = mix(col, uFogCol, f);
        gl_FragColor = vec4(col, a * core);
      }`,
  });
  const m = new THREE.Mesh(geo, railMat);
  m.renderOrder = 2; // coplanar with the ground: no lines of its own
  scene3.add(m);
}

function buildMonos() {
  monoMat = toonMat('#1c1c22', { steps: 3 });
  monos = ROWS.map((r) => {
    const { tex, wCss } = headingTexture(r.title);
    const h = r.depth <= 2 ? 1.55 : r.depth === 3 ? 1.15 : 0.85;
    const w = (wCss + 10) * K;
    const thick = 0.22;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, thick), monoMat);
    const cx = (r.textX - 4) * K + w / 2;
    const cz = (r.top + 10) * K; // centred on the text box
    mesh.position.set(cx, -h / 2 - 0.02, cz);
    scene3.add(mesh);
    // face text near the top of the front face (+Z, facing the camera)
    const tw = (tex.image as HTMLCanvasElement).width / TEX_R * K;
    const th = 20 * K;
    const faceMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, color: lin('#3a3a42') });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), faceMat);
    face.position.set(-w / 2 + 4 * K + tw / 2, h / 2 - 0.16 - th / 2, thick / 2 + 0.004);
    mesh.add(face); // coplanar with the face: no lines
    // the flat heading on the page (exactly A's text)
    const groundMat2 = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, color: lin(TOC_LIGHT.muted) });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), groundMat2);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(r.textX * K + tw / 2, 0.004, (r.top + 10) * K);
    ground.renderOrder = 3;
    scene3.add(ground);
    return { i: r.i, mesh, face, faceMat, h, w, ground, groundMat: groundMat2 };
  });
}

function buildCity() {
  const rnd = mulberry32(1907);
  cityData = [];
  const zMin = -14, zMax = 34;
  for (let side = 0; side < 2; side++) {
    for (let row = 0; row < 7; row++) {
      let z = zMin + rnd() * 1.5;
      while (z < zMax) {
        const w = 0.9 + rnd() * 2.2;
        const d = 0.22 + rnd() * 0.25;
        const h = 1.4 + rnd() * rnd() * 5 + row * 0.7;
        // left side stays clear of the drone's corridor (camera x ≈ −3 … 0)
        const xBase = side === 0 ? -5.2 - row * 2.6 : 7.4 + row * 2.6;
        const x = xBase + (rnd() - 0.5) * 1.2;
        const dist = Math.abs(side === 0 ? xBase : xBase - 5);
        cityData.push({ x, z: z + d / 2, w, d, h, delay: dist * 0.03 + rnd() * 0.12 });
        z += d + 0.5 + rnd() * 1.6;
      }
    }
  }
  const mat = toonMat('#ffffff', { steps: 3 });
  // the background blocks are documents too: faint text lines on their faces (world-space rows
  // broken into words, varied per block), antialiased with fwidth and faded out before they alias
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLineCol = { value: new THREE.Color('#2a2a30') };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCityW; varying vec3 vCityN; varying float vInst;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 cw = vec4(transformed, 1.0);
        vec3 cn = objectNormal;
        #ifdef USE_INSTANCING
          cw = instanceMatrix * cw;
          cn = mat3(instanceMatrix) * cn;
        #endif
        vCityW = (modelMatrix * cw).xyz;
        vCityN = normalize(mat3(modelMatrix) * cn);
        vInst = float(gl_InstanceID);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uLineCol; varying vec3 vCityW; varying vec3 vCityN; varying float vInst;
        float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float cityLines(){
          float face = smoothstep(0.6, 0.9, abs(vCityN.z));
          float row = 0.15 + 0.03 * h1(vInst);
          float y = vCityW.y / row + h1(vInst + 3.0);
          float fy = fract(y);
          float aa = fwidth(y) * 1.2;
          float line = smoothstep(0.3 - aa, 0.3, fy) * (1.0 - smoothstep(0.44, 0.44 + aa, fy));
          float seg = floor(vCityW.x / 0.33 + h1(floor(y) + vInst) * 7.0);
          float on = step(0.32, h2(vec2(floor(y) + vInst * 13.0, seg)));
          float para = step(0.12, h1(floor(y / 6.0) + vInst * 5.0)); // paragraph gaps
          float fade = 1.0 - smoothstep(0.22, 0.45, aa);
          return face * line * on * para * fade;
        }`,
      )
      .replace('#include <opaque_fragment>', 'outgoingLight += uLineCol * cityLines();\n#include <opaque_fragment>');
  };
  city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, cityData.length);
  // per-block tone variation (depth cue)
  const tone = new THREE.Color();
  const rv = mulberry32(42);
  for (let i = 0; i < cityData.length; i++) {
    const v = 0.075 + rv() * 0.035;
    tone.setRGB(v, v, v * 1.12);
    city.setColorAt(i, tone);
  }
  scene3.add(city);
}

// ── grounding: soft contact shadows + shadows cast away from the guide light ────────────────
let shadowGeo: THREE.BufferGeometry;
let shadowMat: THREE.ShaderMaterial;
const SHADOW_LEN = 4.5;
let contact: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];

function buildShadows() {
  const n = ROWS.length;
  shadowGeo = new THREE.BufferGeometry();
  shadowGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 12), 3));
  shadowGeo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(n * 12).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  shadowGeo.setAttribute('aU', new THREE.Float32BufferAttribute(new Float32Array(n * 4), 1));
  shadowGeo.setAttribute('aA', new THREE.Float32BufferAttribute(new Float32Array(n * 4), 1));
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  shadowGeo.setIndex(idx);
  shadowMat = new THREE.ShaderMaterial({
    uniforms: { uDot: { value: new THREE.Vector2() }, uK: { value: 0 } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aU; attribute float aA; varying float vU; varying float vA; varying vec3 vW;
      void main(){ vU = aU; vA = aA; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec2 uDot; uniform float uK; varying float vU; varying float vA; varying vec3 vW;
      void main(){
        // a shadow removes the guide's light: strongest inside its pool, fading along its length
        float d = length(vW.xz - uDot);
        float lit = exp(-d * d / 2.2);
        float a = vA * pow(1.0 - clamp(vU, 0.0, 1.0), 1.6) * (0.25 + 0.75 * lit) * uK;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a * 0.8);
      }`,
  });
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.renderOrder = 1;
  m.frustumCulled = false;
  scene3.add(m);
  // contact shadow texture: a soft dark footprint
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 96;
  const c2 = cv.getContext('2d')!;
  c2.filter = 'blur(14px)';
  c2.fillStyle = '#000';
  c2.fillRect(34, 34, 188, 28);
  const tex = new THREE.CanvasTexture(cv);
  contact = monos.map((mo) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, depthWrite: false, opacity: 0 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set((mo.w + 0.5) * (256 / 188), (0.22 + 0.34) * (96 / 28), 1);
    mesh.position.set(mo.mesh.position.x, 0.002, mo.mesh.position.z);
    mesh.renderOrder = 1;
    scene3.add(mesh);
    return { mesh, mat };
  });
}

function updateShadows(t: number, dx: number, dz: number, k: number) {
  const pos = shadowGeo.getAttribute('position') as THREE.BufferAttribute;
  const au = shadowGeo.getAttribute('aU') as THREE.BufferAttribute;
  const aa = shadowGeo.getAttribute('aA') as THREE.BufferAttribute;
  for (const mo of monos) {
    const rise = riseAt(mo.i, t);
    const x0 = mo.mesh.position.x - mo.w / 2, x1 = mo.mesh.position.x + mo.w / 2, z = mo.mesh.position.z;
    const corners: [number, number][] = [[x0, z], [x1, z]];
    const far = corners.map(([x, zz]) => {
      const vx = x - dx, vz = zz - dz;
      const l = Math.hypot(vx, vz) || 1;
      return [x + (vx / l) * SHADOW_LEN, zz + (vz / l) * SHADOW_LEN] as [number, number];
    });
    const quad = [corners[0], corners[1], far[1], far[0]];
    for (let q = 0; q < 4; q++) {
      const v = mo.i * 4 + q;
      pos.setXYZ(v, quad[q][0], 0.003, quad[q][1]);
      au.setX(v, q < 2 ? 0 : 1);
      aa.setX(v, rise);
    }
    const ct = contact[mo.i];
    ct.mat.opacity = 0.55 * rise * k;
  }
  pos.needsUpdate = true;
  au.needsUpdate = true;
  aa.needsUpdate = true;
  shadowMat.uniforms.uDot.value.set(dx, dz);
  shadowMat.uniforms.uK.value = k;
}

export function setupB(e: Engine) {
  scene3 = new THREE.Scene();
  fog = new THREE.Fog(lin(C.INK), 10, 40);
  scene3.fog = fog;
  cam = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.05, 300);
  amb = new THREE.AmbientLight(0xffffff, 1);
  scene3.add(amb);
  moon = new THREE.DirectionalLight(lin('#9aa0b8'), 0.0);
  moon.position.set(-4, 8, 6);
  scene3.add(moon);
  point = new THREE.PointLight(lin(C.ORANGE), 0, 7, 1.4);
  scene3.add(point);
  buildGround();
  buildRail();
  buildMonos();
  buildShadows();
  buildCity();
  dotMat = new THREE.MeshBasicMaterial({ color: lin(C.ORANGE), toneMapped: false });
  dotMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), dotMat);
  dotMesh.userData.noEdges = true;
  scene3.add(dotMesh);
  // the guide's halo: analytic falloff in float + dither (no 8-bit gradient steps when magnified)
  glowMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // a Sprite (the edge pass skips sprites): billboard in the vertex shader
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; varying vec2 vUv;
      ${TRI_NOISE}
      void main(){
        float r = length(vUv - 0.5) * 2.0;
        // warm core → orange halo → long faint tail (matches the old gradient stops)
        // profile of the old gradient (0.7 core · 0.45 @0.18 · 0.11 @0.5 · 0 @1), smooth in float
        float a = 0.42 * exp(-r * r / 0.03) + 0.3 * exp(-r * r / 0.14) + 0.09 * exp(-r * r / 0.45);
        a *= 1.0 - smoothstep(0.7, 1.0, r);
        vec3 col = mix(vec3(0.98, 0.50, 0.14), vec3(0.98, 0.55, 0.22), exp(-r * r / 0.02)) * a * uOpacity;
        col += triNoise(gl_FragCoord.xy) * 1.5 / 255.0 * step(0.001, a * uOpacity);
        gl_FragColor = vec4(max(col, 0.0), 1.0);
      }`,
  });
  glow = new THREE.Sprite(glowMat as unknown as THREE.SpriteMaterial);
  glow.frustumCulled = false;
  glow.renderOrder = 4;
  scene3.add(glow);
  buildBeams();
  // link shot B's programs now, not on its first frame (≈ 15 ms); into a target, as render3D
  // draws them: compiling for the canvas would link sRGB-output variants nothing uses
  e.renderer.setRenderTarget(e.gfx.rt('toc:city'));
  e.renderer.compile(scene3, cam);
  e.renderer.setRenderTarget(null);
}

// ── signpost lights: a pillar of light + a ground ping when the guide passes a heading ──
// Both stay out of the line-art pass (an edge-pass marker leaves a faint outline at its border):
// pillars are Y-axis billboard Sprites (sprites are skipped by the line pass), and the ping rings
// are drawn analytically by the ground shader (occluded correctly, dithered with the floor).
interface Beam {
  i: number;
  t: number;
  pillar: THREE.Sprite;
  pillarMat: THREE.ShaderMaterial;
}
let beams: Beam[] = [];
const MAX_PINGS = 3;

function buildBeams() {
  beams = HEADS_B.map((t, k) => {
    const i = A_LAST + 1 + k;
    const pillarMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uCol: { value: lin(C.ORANGE) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          // cylindrical billboard: upright, turned toward the camera around world Y
          vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float w = length(modelMatrix[0].xyz), h = length(modelMatrix[1].xyz);
          vec3 toCam = cameraPosition - c; toCam.y = 0.0;
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(toCam + vec3(1e-5, 0.0, 0.0))));
          vec3 p = c + right * position.x * w + vec3(0.0, 1.0, 0.0) * (position.y + 0.5) * h;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform vec3 uCol; varying vec2 vUv;
        ${TRI_NOISE}
        void main(){
          float x = (vUv.x - 0.5) * 2.0;
          float a = exp(-x * x / 0.18) * mix(1.0, 0.0, smoothstep(0.0, 1.0, vUv.y)) * (0.6 + 0.4 * (1.0 - smoothstep(0.0, 0.25, vUv.y)));
          vec3 col = uCol * a * uOpacity + triNoise(gl_FragCoord.xy) * 1.2 / 255.0 * step(0.002, a * uOpacity);
          gl_FragColor = vec4(max(col, 0.0), 1.0);
        }`,
    });
    const pillar = new THREE.Sprite(pillarMat as unknown as THREE.SpriteMaterial);
    pillar.frustumCulled = false;
    pillar.visible = false;
    scene3.add(pillar);
    return { i, t, pillar, pillarMat };
  });
}

// ── camera ──────────────────────────────────────────────────────────────────
interface Orbit {
  /** look-at target (world) */
  tx: number;
  ty: number;
  tz: number;
  /** distance, elevation (rad, π/2 = top-down), azimuth (rad, 0 = camera on the +Z side) */
  d: number;
  el: number;
  az: number;
  roll: number;
  /** lens shift in px (target appears at centre + shift) */
  sx: number;
  sy: number;
}

function applyOrbit(o: Orbit) {
  const ce = Math.cos(o.el), se = Math.sin(o.el);
  const ca = Math.cos(o.az), sa = Math.sin(o.az);
  cam.position.set(o.tx + o.d * sa * ce, o.ty + o.d * se, o.tz + o.d * ca * ce);
  cam.up.set(-sa * se, ce, -ca * se);
  cam.lookAt(o.tx, o.ty, o.tz);
  if (o.roll) cam.rotateZ(o.roll);
  // lens shift: setViewOffset moves the frustum; a target shown at (960 + sx, 540 + sy)
  cam.setViewOffset(1920, 1080, -o.sx, -o.sy, 1920, 1080);
  cam.updateProjectionMatrix();
}

/** The top-down orbit that reproduces A's 2D camera exactly at time t. */
function orbitFromA(t: number): Orbit {
  const a = cameraA(t);
  // dot as the target (it becomes the orbit pivot)
  const st = stateA(t);
  const [dx, dy] = pointOn(L.pts, st.dotDist);
  const sxp = a.ox + a.S * dx, syp = a.oy + a.S * dy; // dot on screen
  // the dot is A's rotation pivot, so the dutch maps to a roll about the optical axis through it
  const sxr = a.ax + (sxp - a.ax), syr = a.ay + (syp - a.ay);
  return { tx: dx * K, ty: 0, tz: dy * K, d: (F_PX * K) / a.S, el: Math.PI / 2, az: 0, roll: a.rot, sx: sxr - 960, sy: syr - 540 };
}

function lerpOrbit(a: Orbit, b: Orbit, k: number): Orbit {
  return {
    tx: lerp(a.tx, b.tx, k), ty: lerp(a.ty, b.ty, k), tz: lerp(a.tz, b.tz, k),
    d: Math.exp(lerp(Math.log(a.d), Math.log(b.d), k)), el: lerp(a.el, b.el, k), az: lerp(a.az, b.az, k), roll: lerp(a.roll, b.roll, k),
    sx: lerp(a.sx, b.sx, k), sy: lerp(a.sy, b.sy, k),
  };
}

/** drone pose following the guide (world position of the dot) */
function droneAt(dx: number, dz: number, t: number): Orbit {
  // the drone slowly swings round toward the signs' faces and sinks closer across bars 19–20
  const u = clamp((t - (T_B + 0.6)) / (T_CRANE - (T_B + 0.6)));
  const s = 0.5 - 0.5 * Math.cos(Math.PI * u);
  return {
    tx: dx + lerp(1.1, 1.35, s),
    ty: 0.3,
    tz: dz - 0.6,
    d: lerp(9.5, 8.6, s),
    el: lerp(0.74, 0.64, s),
    az: lerp(-0.44, -0.33, s),
    roll: lerp(-0.035, 0.025, s),
    sx: 0,
    sy: 60,
  };
}

export interface BPose {
  orbit: Orbit;
  dot: [number, number, number];
  dist: number;
}

/** End-of-B top-down pose = C's first frame (NORMAL at S 1.75 under C's zoom 2.4, thumb at (760, 420)). */
export const B_END = { S: 4.2, x: 760, y: 420 };

function poseB(t: number): BPose {
  const dist = dotDistB(t);
  const [cx, cy] = pointOn(L.pts, dist);
  const hover = 0.26 * ease.inOutCubic(clamp((t - (T_B + 0.15)) / 0.5)) * (1 - ease.inOutCubic(clamp((t - T_CRANE) / 0.5)));
  const dot: [number, number, number] = [cx * K, hover, cy * K];
  // A's 2D camera keeps moving (follow + pull-back settle) while the tilt takes over
  const follow = orbitFromA(Math.min(t, T_B + 0.5));
  const drone = droneAt(dot[0], dot[2], t);
  let o: Orbit;
  if (t < T_CRANE) {
    // the tilt kicks off on the bar-19 downbeat (snap), settles into the drone
    const k = ease.outCubic(clamp((t - T_B) / 1.0));
    o = lerpOrbit(follow, drone, k);
  } else {
    const end: Orbit = { tx: dot[0], ty: 0, tz: dot[2], d: (F_PX * K) / B_END.S, el: Math.PI / 2, az: 0, roll: 0, sx: B_END.x - 960, sy: B_END.y - 540 };
    const k = ease.inOutCubic(clamp((t - T_CRANE) / (T_C - T_CRANE)));
    o = lerpOrbit(drone, end, k);
  }
  return { orbit: o, dot, dist };
}

// ── per-frame ───────────────────────────────────────────────────────────────
function riseAt(i: number, t: number): number {
  const delay = Math.abs(i - A_LAST) * 0.035;
  const up = ease.outBack(clamp((t - T_RISE - delay) / 0.42), 1.2);
  const down = ease.inCubic(clamp((t - SINK_AT[i]) / 0.14));
  return Math.max(0, up * (1 - down));
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

export function renderB(f: Frame): THREE.Texture {
  const t = f.t;
  const g = f.e.gfx;
  const night = nightAt(t);
  const pose = poseB(t);
  applyOrbit(pose.orbit);
  const st = stateB(t);
  const flat = endFlatAt(t);
  if (t >= T_REWIND) {
    // rewinding: the row under the thumb is the active one (fast scroll to the top)
    let i = 0;
    for (let k = 0; k < ROWS.length; k++) if (L.lens[k][0] <= pose.dist + 0.5) i = k;
    st.trackTop = ROWS[i].top;
    st.trackBottom = ROWS[i].bottom;
    st.textActive.fill(0);
    st.textActive[i] = 1;
  }
  const [dx, dy, dz] = pose.dot;
  // lights & fog (the world beyond the page lamp is dark from the start)
  const ink = lin(C.INK);
  const lampI = lampAt(t, dx, dz, lampPos);
  const fogCol = lin('#16161b').lerp(ink, flat);
  fog.color.copy(fogCol);
  fog.near = lerp(60, 7, night);
  fog.far = lerp(140, 34, night);
  amb.intensity = lerp(1.0, 0.07, night);
  moon.intensity = lerp(0, 0.35, night) * (1 - flat);
  point.intensity = lerp(0, 9, night) * (1 - flat);
  point.position.set(dx, dy + 0.35, dz + 0.15);

  // ground
  const gu = groundMat.uniforms;
  gu.uLamp.value.copy(lampPos);
  gu.uLampI.value = lampI;
  gu.uCam.value.copy(cam.position);
  gu.uSheen.value = 0.3 * lampI;
  // the sky light sits opposite the camera's azimuth so its reflection crosses the frame
  {
    const az = pose.orbit.az;
    gu.uSkyL.value.set(-Math.sin(az) * 0.5, 0.866, -Math.cos(az) * 0.5).normalize();
  }
  gu.uLampCol.value.copy(lin(TOC_LIGHT.bg).lerp(lin('#d9894a'), lampWarm(t)));
  gu.uDot.value.set(dx, dz);
  gu.uGrid.value = 1 - night;
  gu.uPool.value = night * (1 - flat);
  gu.uFogCol.value.copy(fogCol);
  gu.uFogNear.value = fog.near;
  gu.uFogFar.value = fog.far;

  // rail / avenue
  const ru = railMat.uniforms;
  const widen = ease.inOutCubic(clamp((t - (T_B + 0.2)) / 0.6)) * (1 - ease.inOutCubic(clamp((t - T_CRANE) / 0.45)));
  ru.uW.value = K * lerp(1, 2.6, widen);
  ru.uWGlow.value = widen * 0.6;
  // lamp-lit rail (fd-foreground/10 over the paper) → night hairline → C's rail over INK
  ru.uLamp.value.copy(lampPos);
  ru.uLampI.value = lampI;
  ru.uRailLit.value.copy(lin('#dedede'));
  ru.uRail.value.copy(lin('#5a5a62').lerp(lin('#212122'), flat));
  ru.uRailA.value = 1;
  ru.uTop.value = st.trackTop;
  ru.uBottom.value = st.trackBottom;
  ru.uTrail.value = night * (1 - clamp(flat * 3));
  ru.uTrailFrom.value = L.lens[3][0];
  ru.uDotD.value = pose.dist;
  ru.uFogCol.value.copy(fogCol);
  ru.uFogNear.value = fog.near;
  ru.uFogFar.value = fog.far;

  // the guide
  const r0 = 2 * K;
  const r = r0 * lerp(lerp(1, 2.2, night), 1, flat);
  dotMesh.position.set(dx, dy + (dy > 0 ? 0 : 0.004), dz);
  dotMesh.scale.setScalar(r);
  // the halo is a camera-facing sprite: slide it toward the camera along the view ray (same screen
  // position and size) so it never cuts into the floor with a straight edge
  {
    const gs = lerp(0.2, 2.6, night);
    tmpV.set(dx, dy + 0.02, dz).sub(cam.position);
    const dist = tmpV.length();
    const pull = Math.min(gs * 0.9, dist * 0.5);
    tmpV.multiplyScalar(1 - pull / dist).add(cam.position);
    glow.position.copy(tmpV);
    glow.scale.setScalar(gs * (dist - pull) / dist);
  }
  glowMat.uniforms.uOpacity.value = night * (1 - flat);

  // monoliths + flat headings
  const muted = lin(TOC_LIGHT.muted), orange = lin(C.ORANGE), dim = lin('#3a3a42'), lit = lin('#f4f1e8');
  for (const m of monos) {
    const k = riseAt(m.i, t);
    // rest well below the page (no z-fighting with the ground when nearly sunk)
    m.mesh.visible = k > 0.03;
    m.mesh.position.y = -m.h / 2 - 0.2 + (m.h + 0.2) * k;
    // lit once the guide has reached it (rows before Themes were read in A / READ)
    const litT: Target[] = [];
    const arr = m.i > A_LAST ? arrivalB(m.i) : undefined;
    const litV = m.i <= A_LAST ? 1 : transitioned(t, 0, arr !== undefined ? [...litT, { t: arr, v: 1 }] : litT, 0.3, cssEase);
    const act = st.textActive[m.i];
    const pass = arr !== undefined ? t - arr : -1;
    const flash = pass >= 0 && t < T_REWIND ? Math.exp(-pass / 0.16) : 0;
    m.faceMat.color.copy(dim).lerp(lit, litV).lerp(orange, act * 0.85).lerp(lin('#ffffff'), flash);
    // flat heading: A's colours by day, fading as its monolith rises
    // lamp-lit page text; C's muted text: rgba(179,179,179,.8) over INK ≈ #919191
    const fl = dim.clone().lerp(muted, lampE(m.ground.position.x, m.ground.position.z, lampI)).lerp(lin('#919191'), flat).lerp(orange, act);
    m.groundMat.color.copy(fl);
    m.groundMat.opacity = 1 - clamp(k * 1.4);
    m.ground.visible = m.groundMat.opacity > 0.002;
  }

  updateShadows(t, dx, dz, night * (1 - flat));
  // the overlay's lyric column (x ≈ 1700–1830): light or dark background under it?
  {
    let lum = 0;
    for (const sy of [300, 540, 780]) {
      tmpV.set(1765 / 960 - 1, 1 - sy / 540, 0.5).unproject(cam).sub(cam.position);
      const k = tmpV.y < -1e-6 ? -cam.position.y / tmpV.y : 1e6;
      const gx = cam.position.x + tmpV.x * k, gz = cam.position.z + tmpV.z * k;
      lum += k < 1e5 ? lampE(gx, gz, lampI) : 0;
    }
    toneB = lum / 3 > 0.45 ? 'light' : 'dark';
  }

  // signpost lights
  const pings = gu.uPings.value as THREE.Vector4[];
  for (const p of pings) p.set(0, 0, 0, 0);
  let np = 0;
  for (const b of beams) {
    const age = t - b.t;
    const on = age >= 0 && age < 0.6 && t < T_REWIND;
    b.pillar.visible = on;
    if (!on) continue;
    const m = monos[b.i];
    const x = m.mesh.position.x - m.w / 2 + 0.12;
    const z = m.mesh.position.z;
    const grow = ease.outExpo(clamp(age / 0.12));
    const fade = Math.exp(-Math.max(0, age - 0.05) / 0.16) * (1 - clamp((age - 0.45) / 0.15));
    const h = 7.5 * grow;
    b.pillar.scale.set(0.165 * (0.75 + 0.9 * (1 - fade)), h, 1);
    b.pillar.position.set(x, 0, z);
    b.pillarMat.uniforms.uOpacity.value = fade;
    if (np < MAX_PINGS) {
      const rr = lerp(0.3, 2.2, ease.outCubic(clamp(age / 0.6)));
      pings[np++].set(x, z + 0.1, rr * 0.5 * 0.85, (1 - clamp(age / 0.6)) * 0.8);
    }
  }

  // city
  for (let i = 0; i < cityData.length; i++) {
    const c = cityData[i];
    const up = ease.outCubic(clamp((t - (T_B + 0.5) - c.delay) / 0.7));
    const down = ease.inCubic(clamp((t - T_CRANE - c.delay * 0.4) / 0.3));
    const k = up * (1 - down);
    const h = Math.max(0.001, c.h * k);
    tmpP.set(c.x, h / 2 - 0.01, c.z);
    tmpS.set(c.w, h, c.d);
    tmpM.compose(tmpP, tmpQ, tmpS);
    city.setMatrixAt(i, tmpM);
  }
  city.instanceMatrix.needsUpdate = true;

  const edgeCol = new THREE.Color('#50505c');
  const tex3d = render3D(g, scene3, cam, {
    key: 'toc:city',
    ss: 2,
    clear: null,
    edges: { color: '#' + edgeCol.getHexString(), width: 1.3, opacity: 0.9 * night * (1 - flat) },
  });

  // sky behind (fog colour toward the horizon)
  const sky = f.e.layer('toc:sky');
  const sc = sky.begin();
  const top = mixHexes(mixHexes(TOC_LIGHT.bg, '#060607', night), C.INK, flat);
  const hor = mixHexes(mixHexes(TOC_LIGHT.bg, '#121216', night), C.INK, flat);
  const grd = sc.createLinearGradient(0, 0, 0, f.H);
  grd.addColorStop(0, top);
  grd.addColorStop(0.55, hor);
  grd.addColorStop(1, hor);
  sc.fillStyle = grd;
  sc.fillRect(0, 0, f.W, f.H);
  const comp = g.compose(g.rt('toc:bcomp'), null, [{ tex: sky.end() }, { tex: tex3d }]);
  // the rewind whip: vertical streak while the camera races back up the page
  const wu = clamp((t - T_REWIND) / (T_REW_END - T_REWIND));
  let outTex = comp;
  if (wu > 0 && wu < 1) outTex = g.motionBlur(comp, { amount: 0.05 * Math.sin(Math.PI * wu) ** 2, dir: [0, 1] }, 'toc:bmb');
  const bl = night * (1 - flat);
  if (bl <= 0.02) return outTex;
  // the bloom chain is 8-bit: dither its soft tails so they don't contour
  return ditherTex(g, g.bloom(outTex, { threshold: 0.62, strength: 0.75 * bl, radius: 22 }, 'toc:bbloom'), 'toc:bdither', 1.5);
}

function mixHexes(a: string, b: string, k: number): string {
  const ca = new THREE.Color().setStyle(a, THREE.NoColorSpace as THREE.ColorSpace);
  const cb = new THREE.Color().setStyle(b, THREE.NoColorSpace as THREE.ColorSpace);
  ca.lerp(cb, k);
  return `rgb(${Math.round(ca.r * 255)},${Math.round(ca.g * 255)},${Math.round(ca.b * 255)})`;
}

export { T_CRANE, T_REWIND };
