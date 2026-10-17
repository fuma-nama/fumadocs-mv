import * as THREE from 'three';
import type { Engine } from '../../engine/engine';
import { LAYOUTS, type LayoutId } from './layouts';
import { assetUrl } from '../../engine/url';

/**
 * Real-UI captures of each layout, as a texture + the UV rect of its 1440×900 viewport.
 * Uses /plates/layouts/<id>.png (1440×900 @2x, plates agent) when present, else the
 * assets/ref-ui stand-ins (window screenshots: cropped to the viewport, cover-fit to 1.6).
 */
export interface Plate {
  tex: THREE.Texture;
  /** u0, v0, u1, v1 (three.js uv: v up) */
  uv: [number, number, number, number];
}

const STANDIN: Partial<Record<LayoutId, { file: string; inner: [number, number, number, number] }>> = {
  docs: { file: 'docs', inner: [131, 95, 3019, 1944] },
  notebook: { file: 'notebook-nav-mode', inner: [65, 47, 1386, 871] },
  flux: { file: 'flux', inner: [131, 95, 2597, 1690] },
  glass: { file: 'glass', inner: [131, 95, 2927, 2042] },
  spacious: { file: 'spacious', inner: [108, 108, 2968, 2079] },
  home: { file: 'home', inner: [131, 95, 3019, 1944] },
};

export const plates = new Map<LayoutId, Plate>();

async function exists(url: string) {
  try {
    const r = await fetch(assetUrl(url), { method: 'HEAD' });
    return r.ok && (r.headers.get('content-type') ?? '').startsWith('image');
  } catch {
    return false;
  }
}

export async function loadPlates(e: Engine) {
  const ids = Object.keys(LAYOUTS) as LayoutId[];
  await Promise.all(
    ids.map(async (id) => {
      const real = `/plates/layouts/${LAYOUTS[id].geo}.png`;
      if (await exists(real)) {
        const tex = await e.assets.texture(real, { srgb: true });
        plates.set(id, { tex, uv: [0, 0, 1, 1] });
        return;
      }
      const s = STANDIN[id];
      if (!s) return;
      const tex = await e.assets.texture(`/assets/ref-ui/${s.file}.png`, { srgb: true });
      const img = tex.image as { width: number; height: number };
      let [x0, y0, x1, y1] = s.inner;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w / h < 1.6) y1 = y0 + w / 1.6;
      else {
        const nw = h * 1.6;
        x0 += (w - nw) / 2;
        x1 = x0 + nw;
      }
      plates.set(id, { tex, uv: [x0 / img.width, 1 - y1 / img.height, x1 / img.width, 1 - y0 / img.height] });
    }),
  );
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
uniform sampler2D map; uniform vec4 uvr; uniform vec4 rr; uniform float alpha; uniform float alphaLo; uniform vec2 yr; uniform float scan; uniform float flick; uniform float seed; uniform float mask;
varying vec2 vUv;
float h(float x){ return fract(sin(x * 91.7 + seed * 13.1) * 43758.5453); }
void main(){
  float y = 1.0 - vUv.y;
  // flicker: a few rows jump sideways for the first frames of a projection
  float row = floor(y * 40.0);
  float jog = (h(row) - 0.5) * 0.012 * flick * step(0.7, h(row + 7.0));
  vec2 uv = vec2(mix(uvr.x, uvr.z, clamp(vUv.x + jog, 0.0, 1.0)), mix(uvr.y, uvr.w, vUv.y));
  vec3 c = texture2D(map, uv).rgb * 1.08;
  // rounded-rect mask in destination px
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * rr.xy;
  vec2 q = abs(p - rr.xy * 0.5) - (rr.xy * 0.5 - vec2(rr.z));
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr.z;
  float inside = 1.0 - smoothstep(-0.75, 0.75, sd);
  // the scan line runs in frame space (shared by all pieces of a capture)
  float fy = yr.x + y * yr.y;
  float line = scan > 0.0005 && scan < 0.9995 ? exp(-abs(fy - scan) * 90.0) : 0.0;
  float sl = 0.95 + 0.05 * sin(gl_FragCoord.y * 1.6);
  float fl = 1.0 - flick * 0.5 * step(0.5, h(floor(seed * 7.0) + row * 0.1));
  vec3 col = c * sl * fl + vec3(1.0, 0.42, 0.08) * line * 1.4;
  // revealed above the scan line, dim below it
  float above = scan > 0.0005 ? 1.0 - smoothstep(scan - 0.006, scan + 0.006, fy) : 1.0;
  float vis = inside;
  float a = mix(alphaLo, alpha, above) * inside;
  // glow pass: an opaque black occluder so the skeleton under the capture doesn't glow through
  if (mask > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, a); return; }
  gl_FragColor = vec4(col, a);
}`;

export function projMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: null },
      uvr: { value: new THREE.Vector4(0, 0, 1, 1) },
      alpha: { value: 1 },
      alphaLo: { value: 1 },
      yr: { value: new THREE.Vector2(0, 1) },
      scan: { value: 1 },
      flick: { value: 0 },
      seed: { value: 0 },
      mask: { value: 0 },
      rr: { value: new THREE.Vector4(1, 1, 0, 0) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}
