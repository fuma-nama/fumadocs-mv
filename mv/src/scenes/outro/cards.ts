import * as THREE from 'three';
import type { Gfx } from '../../engine/gfx';
import { render3D } from '../../engine/three-kit';
import { hash, smoothstep, spring } from '../../engine/anim';
import { C } from '../_shared/palette';
import { MOSAIC, mosaicTiles, type MosaicTile } from '../showcase/contract';
import { T } from './cues';

/**
 * The B8 flip: every mosaic tile becomes a 4.5 px thick card (a physical slab, not a flat plane)
 * that turns over about its vertical axis as a wave travels along the logo's 45° light axis.
 * Front = the showcase frame sampled at the card's own rect (pixel-identical at rest); back = the
 * exact logo gradient at the card's landing position. Lighting is computed from each card's real
 * rotation under a light that sweeps during the turn (diffuse + a specular glint on the back);
 * the edges are opaque two-tone thickness while turning; a turning card casts a soft contact
 * shadow onto its right and lower neighbours (from its tilt, lift and the light direction).
 * World units are screen px (the camera maps z = 0 one-to-one onto the frame).
 */
const W = 1920;
const H = 1080;
const FOV = 22;
const DIST = H / 2 / Math.tan((FOV * Math.PI) / 360);
const DEPTH = 4.5;

/** wave: front crosses the disc (−R → +R along (1,1)/√2) in WAVE s */
const WAVE = 0.56;
const SPRING_HZ = 1.9;
const SPRING_ZETA = 0.7;
const LIFT = 34;
/** seam heal after landing */
const HEAL_DELAY = 0.3;
const HEAL = 0.2;
/** front clip radius (the outer px ring stays under the rim) */
const FRONT_R = MOSAIC.R - 1;

/** the key light sweeps from upper-left toward the top during the turn */
const L0 = new THREE.Vector3(-0.52, 0.16, 0.84).normalize();
const L1 = new THREE.Vector3(-0.1, 0.44, 0.89).normalize();

interface Card extends MosaicTile {
  cx: number;
  cy: number;
  t0: number;
  /** indices of the left / upper neighbours (−1 if none) */
  left: number;
  up: number;
}

const tiles: Card[] = mosaicTiles().map((m) => {
  const cx = m.x + m.w / 2;
  const cy = m.y + m.h / 2;
  const along = (cx - MOSAIC.CX + (cy - MOSAIC.CY)) / Math.SQRT2; // −R … +R
  const jitter = (hash(m.i, m.j, 3) - 0.5) * 0.016;
  return { ...m, cx, cy, t0: T.down + ((along + MOSAIC.R) / (2 * MOSAIC.R)) * WAVE + jitter, left: -1, up: -1 };
});
{
  const at = new Map(tiles.map((c, k) => [`${c.i},${c.j}`, k]));
  for (const c of tiles) {
    c.left = at.get(`${c.i - 1},${c.j}`) ?? -1;
    c.up = at.get(`${c.i},${c.j - 1}`) ?? -1;
  }
}

/** time when the last card has landed and healed */
export const CARDS_DONE = Math.max(...tiles.map((c) => c.t0)) + HEAL_DELAY + HEAL + 0.25;

/** Turn angle 0..π (with a small spring settle past π). */
function turnAngle(t: number, t0: number) {
  return Math.PI * spring(t - t0, SPRING_HZ, SPRING_ZETA);
}

const VERT = /* glsl */ `
attribute vec4 aRect;
attribute vec4 aTurn;
attribute vec4 aShadow;
varying vec2 vUv;
varying vec3 vN;
varying vec4 vRect;
varying vec4 vTurn;
varying vec4 vShadow;
void main() {
  vUv = uv;
  vN = normal;
  vRect = aRect;
  vTurn = aTurn;
  vShadow = aShadow;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uOther;
uniform vec2 uRes;
uniform vec3 uDisc;
uniform float uFrontR;
uniform vec3 uBg;
uniform vec3 uPri;
uniform vec3 uEdge;
uniform vec4 uGrad;
uniform vec3 uClip; // screen-space disc (px, y down) the cards are seen through
uniform vec3 uL;    // key light (world, toward the light)
uniform vec3 uH;    // half vector of light and view
varying vec2 vUv;
varying vec3 vN;
varying vec4 vRect;
varying vec4 vTurn;   // x turn angle, y edge opacity (0 at rest)
varying vec4 vShadow; // contact shadow: left strength, left width px, top strength, top height px
vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() {
  float cs = cos(vTurn.x), sn = sin(vTurn.x);
  // world normal of this fragment's face: the object normal turned about Y
  vec3 nW = vec3(cs * vN.x + sn * vN.z, vN.y, -sn * vN.x + cs * vN.z);
  float dif = max(0.0, dot(nW, uL)) / uL.z; // 1 when facing the camera
  vec4 col;
  if (abs(vN.z) > 0.5) {
    vec2 sp = vec2(vRect.x + vUv.x * vRect.z, vRect.y + (1.0 - vUv.y) * vRect.w);
    // soft contact shadow cast by the turning neighbours (left → right, upper → lower)
    vec2 lp = sp - vRect.xy;
    float sh = max(vShadow.x * (1.0 - smoothstep(vShadow.y - 5.0, vShadow.y + 1.0, lp.x)),
                   vShadow.z * (1.0 - smoothstep(vShadow.w - 4.0, vShadow.w + 1.0, lp.y)));
    if (vN.z > 0.0) {
      // front: the showcase frame at this card's rest position
      float m = clamp(uFrontR - length(sp - uDisc.xy) + 0.5, 0.0, 1.0);
      vec4 o = texture2D(uOther, vec2(sp.x / uRes.x, 1.0 - sp.y / uRes.y));
      vec3 c = o.a > 0.0 ? o.rgb / o.a : vec3(0.0);
      col = vec4(toLin(c) * (0.22 + 0.78 * min(1.0, dif)) * (1.0 - sh), m * o.a);
    } else {
      // back: the logo gradient where it lands (box UVs are already mirrored), with a glint
      float m = clamp(uDisc.z - length(sp - uDisc.xy) + 0.5, 0.0, 1.0);
      vec2 v = uGrad.zw;
      float s = dot(sp - uGrad.xy, v) / dot(v, v);
      vec3 c = toLin(mix(uBg, uPri, clamp((s - 0.45) / 0.55, 0.0, 1.0)));
      float gk = max(0.0, (dot(nW, uH) - uH.z) / (1.0 - uH.z));
      float glint = gk * gk * gk * smoothstep(0.5, 0.75, vTurn.x / 3.14159265);
      c = c * (0.28 + 0.72 * min(1.2, dif)) * (1.0 - sh) + vec3(1.0, 0.86, 0.62) * 0.34 * glint;
      col = vec4(c, m);
    }
  } else {
    // thickness: opaque while the card turns, bright toward the light, dark away from it
    float ex = vN.x < -0.5 ? vRect.x : vRect.x + vRect.z;
    vec2 sp = vec2(abs(vN.x) > 0.5 ? ex : vRect.x + vUv.x * vRect.z, vRect.y + (1.0 - vUv.y) * vRect.w);
    float m = clamp(uDisc.z - length(sp - uDisc.xy) + 0.5, 0.0, 1.0);
    float lit = max(0.0, dot(nW, uL));
    col = vec4(toLin(uEdge) * (0.1 + 0.62 * lit), m * vTurn.y);
  }
  vec2 fp = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  col.a *= clamp(uClip.z - length(fp - uClip.xy) + 0.5, 0.0, 1.0);
  if (col.a <= 0.002) discard;
  gl_FragColor = col;
}`;

function srgb(hex: string) {
  const c = new THREE.Color().setStyle(hex, THREE.NoColorSpace as THREE.ColorSpace);
  return new THREE.Vector3(c.r, c.g, c.b);
}

export class Cards {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(FOV, W / H, 10, DIST * 3);
  private mesh: THREE.InstancedMesh;
  private rect: THREE.InstancedBufferAttribute;
  private turn: THREE.InstancedBufferAttribute;
  private shadow: THREE.InstancedBufferAttribute;
  private mat: THREE.ShaderMaterial;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private yAxis = new THREE.Vector3(0, 1, 0);
  private th = new Float32Array(tiles.length);

  constructor() {
    const n = tiles.length;
    // front face on z = 0 so a card at rest covers exactly its rect
    const geo = new THREE.BoxGeometry(1, 1, DEPTH).translate(0, 0, -DEPTH / 2);
    this.rect = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.turn = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.shadow = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    geo.setAttribute('aRect', this.rect);
    geo.setAttribute('aTurn', this.turn);
    geo.setAttribute('aShadow', this.shadow);
    const { CX, CY, R } = MOSAIC;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      uniforms: {
        uOther: { value: null },
        uRes: { value: new THREE.Vector2(W, H) },
        uDisc: { value: new THREE.Vector3(CX, CY, R) },
        uFrontR: { value: FRONT_R },
        uBg: { value: srgb(C.INK) },
        uPri: { value: srgb(C.ORANGE) },
        uEdge: { value: srgb('#CFC8B9') },
        // drawMoon's gradient: from (x−r, y−r) along 45° for 2r
        uGrad: { value: new THREE.Vector4(CX - R, CY - R, Math.SQRT1_2 * 2 * R, Math.SQRT1_2 * 2 * R) },
        uClip: { value: new THREE.Vector3(CX, CY, R) },
        uL: { value: L0.clone() },
        uH: { value: new THREE.Vector3() },
      },
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.cam.position.set(0, 0, DIST);
    this.cam.lookAt(0, 0, 0);
  }

  /** Render the cards at time t under a camera zoom about the frame centre. */
  render(gfx: Gfx, t: number, other: THREE.Texture | undefined, zoom: number): THREE.Texture {
    const { PX, PY, TW, TH, GAP } = MOSAIC;
    const u = this.mat.uniforms;
    const L = (u.uL.value as THREE.Vector3).copy(L0).lerp(L1, smoothstep(T.down, T.down + 0.9, t)).normalize();
    (u.uH.value as THREE.Vector3).set(L.x, L.y, L.z + 1).normalize();
    // shadow offset on the plane per px of height: shadows fall away from the light (right, down)
    const kx = -L.x / L.z;
    const ky = L.y / L.z;
    for (let k = 0; k < tiles.length; k++) this.th[k] = turnAngle(t, tiles[k].t0);
    for (let k = 0; k < tiles.length; k++) {
      const c = tiles[k];
      const th = this.th[k];
      const heal = smoothstep(c.t0 + HEAL_DELAY, c.t0 + HEAL_DELAY + HEAL, t);
      const w = TW + heal * (PX - TW + 0.6);
      const h = TH + heal * (PY - TH + 0.6);
      const sin = Math.sin(th);
      // lifted toward the camera while turning; once landed, settle back so the back face is on z = 0
      this.p.set(c.cx - W / 2, H / 2 - c.cy, LIFT * Math.max(0, sin) - DEPTH * heal);
      this.q.setFromAxisAngle(this.yAxis, th);
      this.s.set(w, h, 1);
      this.m4.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(k, this.m4);
      this.rect.setXYZW(k, c.cx - w / 2, c.cy - h / 2, w, h);
      // thickness shows during the turn itself (the settle past flat is sub-pixel and stays hidden)
      this.turn.setXYZW(k, th, smoothstep(0.03, 0.16, sin), 0, 0);
      // contact shadows from the left / upper neighbours while they turn
      let sL = 0;
      let wL = 0;
      if (c.left >= 0) {
        const a = this.th[c.left];
        const s = Math.max(0, Math.sin(a));
        if (s > 0.01) {
          const zl = (TW / 2) * Math.sin(a) + LIFT * s; // its left edge (comes forward)
          const zr = -(TW / 2) * Math.sin(a) + LIFT * s; // its right edge
          const reach = Math.max(-(TW / 2) * Math.cos(a) + kx * zl, (TW / 2) * Math.cos(a) + kx * zr);
          wL = reach - (PX - TW / 2); // past this card's left edge
          sL = wL > 0 ? 0.66 * smoothstep(0.03, 0.25, s) : 0;
        }
      }
      let sT = 0;
      let hT = 0;
      if (c.up >= 0) {
        const a = this.th[c.up];
        const s = Math.max(0, Math.sin(a));
        if (s > 0.01) {
          hT = ky * ((TW / 2) * Math.abs(Math.sin(a)) + LIFT * s) - GAP;
          sT = hT > 0 ? 0.55 * smoothstep(0.03, 0.25, s) : 0;
        }
      }
      this.shadow.setXYZW(k, sL, wL, sT, hT);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.rect.needsUpdate = true;
    this.turn.needsUpdate = true;
    this.shadow.needsUpdate = true;
    u.uOther.value = other ?? gfx.clear;
    (u.uClip.value as THREE.Vector3).set(W / 2 + (MOSAIC.CX - W / 2) * zoom, H / 2 + (MOSAIC.CY - H / 2) * zoom, MOSAIC.R * zoom);
    this.cam.zoom = zoom;
    this.cam.updateProjectionMatrix();
    return render3D(gfx, this.scene, this.cam, { key: 'outro:cards', ss: 1, samples: 4, clear: null });
  }
}

/** Static masks (2D canvases) for splitting the showcase frame: tile areas / gaps+rim / outside. */
export function buildMasks() {
  const { CX, CY, R } = MOSAIC;
  const mk = () => {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    return cv;
  };
  // tiles: rect ∩ disc(FRONT_R) — exactly what the card fronts cover at rest
  const tileMask = mk();
  {
    const c = tileMask.getContext('2d')!;
    c.save();
    c.beginPath();
    c.arc(CX, CY, FRONT_R, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#fff';
    for (const t of tiles) c.fillRect(t.x, t.y, t.w, t.h);
    c.restore();
  }
  // inside the disc (incl. rim) minus tiles
  const gapMask = mk();
  {
    const c = gapMask.getContext('2d')!;
    c.beginPath();
    c.arc(CX, CY, R + 2.5, 0, Math.PI * 2);
    c.fillStyle = '#fff';
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.drawImage(tileMask, 0, 0);
  }
  // outside the disc
  const outMask = mk();
  {
    const c = outMask.getContext('2d')!;
    c.fillStyle = '#fff';
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(CX, CY, R + 2.5, 0, Math.PI * 2);
    c.fill();
  }
  const tex = (cv: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(cv);
    t.premultiplyAlpha = true;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  return { tile: tex(tileMask), gap: tex(gapMask), out: tex(outMask), gapCanvas: gapMask };
}
