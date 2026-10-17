import * as THREE from 'three';
import type { Rect } from './page';

/** World units = css px of the page. The page group's origin is the viewport's top-left corner. */

const TO_LIN = /* glsl */ `
vec3 toLin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float hashD(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
/** triangular dither of ±amp sRGB levels, applied before the 8-bit resolve (kills banding) */
vec3 dither8(vec3 lin, float amp){ vec2 p = gl_FragCoord.xy; float n = hashD(p) + hashD(p + 19.19) - 1.0; return toLin(toSrgb(lin) + n * amp / 255.0); }
`;

/** Shared cast-shadow maps of the page-turn sheet (world xy → uv via `rect`). */
export const SHADOW = {
  sharp: { value: null as THREE.Texture | null },
  soft: { value: null as THREE.Texture | null },
  rect: { value: new THREE.Vector4(-1700, -760, 3400, 1520) },
  amt: { value: 0 },
};

const SHADOW_GLSL = /* glsl */ `
uniform sampler2D shSharp; uniform sampler2D shSoft; uniform vec4 shRect; uniform float shAmt;
float sheetShadow(vec2 w){
  if (shAmt <= 0.0) return 0.0;
  vec2 u = (w - shRect.xy) / shRect.zw;
  if (u.x < 0.0 || u.y < 0.0 || u.x > 1.0 || u.y > 1.0) return 0.0;
  vec4 a = texture2D(shSharp, u); vec4 b = texture2D(shSoft, u);
  float h = b.a > 0.001 ? b.r / b.a : 0.0;
  return mix(a.a, b.a, smoothstep(0.02, 0.35, h)) * shAmt;
}
`;

/**
 * Unlit UI material: samples a raw-sRGB premultiplied texture inside `uvRect`, outputs linear
 * premultiplied colour (render3D converts back), so UI pixels come out exactly as captured.
 * clip: visible window in plane-local uv (0..1, v down). Receives the sheet's cast shadow.
 */
export function uiMat(tex: THREE.Texture | null, o: { uvRect?: [number, number, number, number]; opacity?: number; side?: THREE.Side; depthWrite?: boolean; depthTest?: boolean } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      uvRect: { value: new THREE.Vector4(...(o.uvRect ?? [0, 0, 1, 1])) },
      opacity: { value: o.opacity ?? 1 },
      tint: { value: new THREE.Vector3(1, 1, 1) },
      clip: { value: new THREE.Vector4(-1e3, -1e3, 1e3, 1e3) },
      shade: { value: 0 },
      flash: { value: 0 },
      flashCol: { value: new THREE.Vector3(0.98, 0.5, 0.137) },
      dim: { value: 0 },
      shSharp: SHADOW.sharp,
      shSoft: SHADOW.soft,
      shRect: SHADOW.rect,
      shAmt: SHADOW.amt,
      recv: { value: 1 },
      smear: { value: 0 },
      sat: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: TO_LIN + SHADOW_GLSL + /* glsl */ `
      uniform sampler2D map; uniform vec4 uvRect; uniform float opacity; uniform vec3 tint; uniform vec4 clip; uniform float shade; uniform float flash; uniform vec3 flashCol; uniform float dim; uniform float recv;
      uniform float smear; uniform float sat;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        vec2 q = vec2(vUv.x, 1.0 - vUv.y);
        if (q.x < clip.x || q.y < clip.y || q.x > clip.z || q.y > clip.w) discard;
        vec2 uv = vec2(mix(uvRect.x, uvRect.z, q.x), 1.0 - mix(uvRect.y, uvRect.w, q.y));
        vec4 c = texture2D(map, uv);
        if (smear > 0.0) {
          // vertical motion blur (scroll): triangle-weighted over ±smear in texture v
          c = vec4(0.0);
          float wsum = 0.0;
          for (int i = 0; i < 24; i++) {
            float k = float(i) / 23.0 - 0.5;
            float w = 1.0 - abs(k) * 1.6;
            c += texture2D(map, uv + vec2(0.0, k * smear)) * w;
            wsum += w;
          }
          c /= wsum;
        }
        if (c.a < 0.002) discard;
        vec3 col = toLin(c.rgb / c.a) * tint;
        col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, sat);
        float l = 1.0 - shade * (1.0 - clamp(dot(normalize(vN), normalize(vec3(0.4, 0.42, 0.82))) / 0.82, 0.0, 1.0));
        col *= l * (1.0 - dim);
        col *= 1.0 - 0.32 * sheetShadow(vW.xy) * recv;
        col = mix(col, flashCol, flash);
        float a = c.a * opacity;
        if (a < 0.002) discard;
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: o.depthWrite ?? true,
    depthTest: o.depthTest ?? true,
    side: o.side ?? THREE.FrontSide,
  });
}

/** A UI plane covering css rect r (page-local coords, y down). */
export function uiPlane(tex: THREE.Texture | null, r: Rect, z = 0, uvRect?: [number, number, number, number]) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h), uiMat(tex, { uvRect }));
  mesh.position.set(r.x + r.w / 2, -(r.y + r.h / 2), z);
  mesh.userData.rect = r;
  mesh.userData.noEdges = true;
  return mesh;
}

/** Desk: cream paper with an anti-aliased technical grid (world xy), fading far away. */
export function deskMat() {
  return new THREE.ShaderMaterial({
    uniforms: {
      // deeper warm desk so the white page pops (the intro card stays PAPER #EEECE4 on it)
      paper: { value: new THREE.Color('#E2DCCE') },
      paper2: { value: new THREE.Color('#F5F5F5') },
      toBg: { value: 0 },
      ink: { value: new THREE.Color('#0A0A0B') },
      minor: { value: 24 },
      major: { value: 120 },
      amt: { value: 1 },
      origin: { value: new THREE.Vector2(0, 0) },
      shSharp: SHADOW.sharp,
      shSoft: SHADOW.soft,
      shRect: SHADOW.rect,
      shAmt: SHADOW.amt,
      pageShadow: { value: new THREE.Vector4(-720, -405, 720, 405) },
      pageShadowAmt: { value: 0.26 },
      pageLift: { value: 0 },
      pool: { value: new THREE.Vector2(0, 0) },
      ditherAmp: { value: 2.5 },
    },
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: TO_LIN + SHADOW_GLSL + /* glsl */ `
      uniform vec3 paper; uniform vec3 paper2; uniform float toBg; uniform vec3 ink; uniform float minor; uniform float major; uniform float amt; uniform vec2 origin;
      uniform vec4 pageShadow; uniform float pageShadowAmt; uniform float pageLift; uniform vec2 pool; uniform float ditherAmp;
      varying vec3 vW;
      float gridLine(vec2 p, float step, float w){ vec2 g = abs(fract(p / step - 0.5) - 0.5) * step; vec2 fw = fwidth(p); vec2 l = 1.0 - smoothstep(vec2(w * 0.5) - fw, vec2(w * 0.5) + fw, g); return max(l.x, l.y) * clamp(1.0 - max(fw.x, fw.y) / (step * 0.25), 0.0, 1.0); }
      float boxShadow(vec2 p, vec4 r, float blur){ vec2 d = max(max(r.xy - p, p - r.zw), 0.0); return 1.0 - smoothstep(0.0, blur, length(d)); }
      void main(){
        vec2 p = vW.xy - origin;
        float a = gridLine(p, minor, 0.9) * 0.045 + gridLine(p, major, 1.1) * 0.075;
        float fade = 1.0 - smoothstep(1400.0, 3800.0, length(p));
        vec3 col = mix(toLin(mix(paper, paper2, toBg)), toLin(ink), a * amt * fade * (1.0 - toBg));
        // a soft pool of light under the page, falling off toward the edges of the desk
        col *= mix(1.05, 0.92, smoothstep(700.0, 3400.0, length(p - pool))) * (1.0 - toBg) + toBg;
        // the page's own soft contact shadow (offset with lift)
        vec2 off = vec2(-0.35, -0.42) * (2.0 + pageLift);
        float ps = boxShadow(p - off, pageShadow, 6.0 + pageLift * 0.9) * pageShadowAmt * (1.0 - toBg);
        col *= 1.0 - ps;
        col *= 1.0 - 0.3 * sheetShadow(vW.xy);
        // the light pool and the soft shadows are wide, smooth gradients: dither them (the 3D pass
        // is supersampled 2×2, so ±2.5 levels here end as ±1.25 after the resolve)
        gl_FragColor = vec4(dither8(col, ditherAmp), 1.0);
      }`,
  });
}

export interface CamPose {
  tx: number;
  ty: number;
  tz: number;
  dist: number;
  /** elevation (deg): 90 = straight down on the page */
  el: number;
  /** azimuth (deg) around the page normal */
  az: number;
  roll: number;
  fov: number;
}

export function applyCam(cam: THREE.PerspectiveCamera, p: CamPose) {
  const el = (p.el * Math.PI) / 180;
  const az = (p.az * Math.PI) / 180;
  const ce = Math.cos(el);
  cam.position.set(p.tx + ce * Math.sin(az) * p.dist, p.ty - ce * Math.cos(az) * p.dist, p.tz + Math.sin(el) * p.dist);
  cam.up.set(-Math.sin(az), Math.cos(az), 0);
  cam.fov = p.fov;
  cam.lookAt(p.tx, p.ty, p.tz);
  if (p.roll) cam.rotateZ((p.roll * Math.PI) / 180);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}

export function lerpPose(a: CamPose, b: CamPose, k: number): CamPose {
  const L = (x: number, y: number) => x + (y - x) * k;
  return { tx: L(a.tx, b.tx), ty: L(a.ty, b.ty), tz: L(a.tz, b.tz), dist: a.dist * Math.pow(b.dist / a.dist, k), el: L(a.el, b.el), az: L(a.az, b.az), roll: L(a.roll, b.roll), fov: L(a.fov, b.fov) };
}

const _v = new THREE.Vector3();
/** Project a world point to frame px (1920×1080). */
export function project(cam: THREE.Camera, x: number, y: number, z: number, W = 1920, H = 1080): { x: number; y: number; z: number } {
  _v.set(x, y, z).project(cam);
  return { x: (_v.x * 0.5 + 0.5) * W, y: (0.5 - _v.y * 0.5) * H, z: _v.z };
}

/** cubic-bezier(x1, y1, x2, y2) easing (CSS), solved by Newton + bisection. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      const d = dx(t);
      if (Math.abs(e) < 1e-6) break;
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    if (Math.abs(sx(t) - x) > 1e-5 || t < 0 || t > 1) {
      t = x;
      for (let i = 0; i < 40; i++) {
        if (sx(t) < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return sy(t);
  };
}
