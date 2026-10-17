import * as THREE from 'three';
import type { Engine } from '../../engine/engine';
import { clamp, ease, lerp, seg } from '../../engine/anim';
import { LANDING } from './contract';
import { SITES, type SiteInfo } from './sites.gen';
import { NIGHT_GLSL } from './screens';
import { cardCapMaterial, cardShadowMaterial, cardSideMaterial, silhouetteGeometry, slabGeometry } from './objects';
import type { Slot, Tower } from './city';

/** Landed card layout (screen px): fits inside CARD_W × CARD_H, centred at (CARD_CX, CARD_CY). */
export const CARD_W = 940;
export const CARD_H = 588;
export const CARD_CX = 960;
export const CARD_CY = 470;
/** view-space depth of the landed card */
const D = 40;

export type Style = 'hinge' | 'depth' | 'flip' | 'rise' | 'drop' | 'whip' | 'flap' | 'snap' | 'glitch';

export interface CardDef {
  slug: string;
  site: SiteInfo;
  name: string;
  url: string;
  index: number;
  style: Style;
  tLift: number;
  tLand: number;
  tExit: number;
  tGone: number;
  /** pixel size when landed */
  pw: number;
  ph: number;
  accent: string;
  /** where (screen region) the source billboard should be at lift-off */
  region: [number, number, number, number];
  slot?: number;
  /** night exposure of the source billboard at lift-off (the card starts at this gain) */
  dim0: number;
  /** 8th-note card: snappier entrance ease */
  crisp: boolean;
}

/** Hand-picked key colours for the landed cards (label tick, glow, lyric accent). */
const ACCENT: Record<string, string> = {
  evilcharts: '#5B8DEF',
  'shadcn-ui': '#E8E8EA',
  'better-auth': '#E7E5E4',
  zod: '#4E7FD8',
  prisma: '#2CC6C9',
  'better-t-stack': '#9B5CF6',
  arktype: '#8CC8FF',
  turborepo: '#FF3D6E',
  'zen-browser': '#F76F53',
};

const STYLES: Style[] = ['hinge', 'depth', 'flip', 'rise', 'drop', 'whip', 'flap', 'snap', 'glitch'];
const REGIONS: [number, number, number, number][] = [
  [980, 140, 1900, 820], // hinge: a facade screen on the right
  [760, 260, 1160, 640], // depth: far down the avenue
  [80, 200, 760, 760], // flip: left side
  [300, 560, 1600, 1000], // rise: low
  [200, 0, 1700, 330], // drop: high
  [1300, 120, 1920, 900], // whip: right edge
  [500, 150, 1500, 700], // flap
  [0, 100, 700, 900], // snap: left
  [700, 200, 1300, 600], // glitch: centre far
];

export function cardDefs(): CardDef[] {
  return LANDING.map((L, k) => {
    const site = SITES.find((s) => s.slug === L.slug)!;
    const hero = site.hero!;
    const s = Math.min(CARD_W / hero.w, CARD_H / hero.h);
    const eighth = k >= 5;
    const next = LANDING[k + 1]?.t ?? 95.8; // the last card holds until PUBLISH (95.8)
    // 8th-note cards: short, snappy entrances that settle exactly on the 8th; each stays put
    // under the next card until it is covered, then launches away
    const entrance = k === 0 ? 0.42 : eighth ? 0.12 : 0.3;
    const last = k === LANDING.length - 1;
    const tExit = last ? next - 0.06 : eighth ? next + 0.02 : next - 0.12;
    return {
      slug: L.slug,
      site,
      name: L.name,
      url: L.url,
      index: k + 1,
      style: STYLES[k],
      tLift: L.t - entrance,
      tLand: L.t,
      tExit,
      tGone: tExit + (last ? 0.1 : eighth ? 0.12 : 0.16),
      crisp: eighth,
      pw: Math.round(hero.w * s),
      ph: Math.round(hero.h * s),
      accent: ACCENT[L.slug] ?? site.accent,
      region: REGIONS[k],
      dim0: 1,
    };
  });
}

/** Billboard in the city that shows a hero image (the card's source). */
export function heroScreenMaterial(tex: THREE.Texture) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTex: { value: tex }, uTime: { value: 0 }, uBoot: { value: 0 }, uFog: { value: new THREE.Color('#191530') }, uOn: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying float vDist; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform float uTime; uniform float uBoot; uniform vec3 uFog; uniform float uOn;
      varying vec2 vUv; varying float vDist;
      ${NIGHT_GLSL}
      void main(){
        vec2 uv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
        vec3 col = texture2D(uTex, uv).rgb;
        float k = clamp((uTime - uBoot) / 0.16, 0.0, 1.0);
        float half_ = max(smoothstep(0.25, 1.0, k) * 0.5, 0.012);
        float inside = (1.0 - smoothstep(half_ - 0.01, half_ + 0.01, abs(vUv.y - 0.5))) * step(0.001, k);
        col *= mix(1.0, 0.58, smoothstep(0.3, 0.92, dot(col, vec3(0.2126, 0.7152, 0.0722))));
        col *= nightDim(vDist);
        col = mix(vec3(0.005, 0.005, 0.009), col, inside * uOn);
        col = mix(col, uFog, smoothstep(260.0, 2600.0, vDist) * 0.85);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export interface Pose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  w: number;
  h: number;
}

const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Vector3();

/** View-space pose of a world-space slot for the given camera. */
export function slotViewPose(slot: Slot, cam: THREE.Camera, w: number, h: number): Pose {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), slot.rotY);
  tmpM.compose(slot.pos, q, tmpS.set(1, 1, 1));
  tmpM.premultiply(cam.matrixWorldInverse);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  tmpM.decompose(pos, quat, tmpS);
  return { pos, quat, w, h };
}

/**
 * View-space landed pose for a card of pixel size pw × ph at fov. Each newer card lands a little
 * nearer (depth D − 0.3·index) at the same on-screen size, so the deck stacks physically.
 */
export function landedPose(pw: number, ph: number, fov: number, index = 0, cx = CARD_CX, cy = CARD_CY): Pose {
  const z = D - 0.3 * index;
  const k = 540 / (z * Math.tan((fov * Math.PI) / 360));
  return { pos: new THREE.Vector3((cx - 960) / k, (540 - cy) / k, -z), quat: new THREE.Quaternion(), w: pw / k, h: ph / k };
}

/** px per view-space unit at depth D */
export const pxPerUnit = (fov: number) => 540 / (D * Math.tan((fov * Math.PI) / 360));

const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);

function bez(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, u: number) {
  const v = 1 - u;
  return new THREE.Vector3()
    .addScaledVector(a, v * v * v)
    .addScaledVector(b, 3 * v * v * u)
    .addScaledVector(c, 3 * v * u * u)
    .addScaledVector(d, u * u * u);
}

/**
 * Entrance: from the billboard's view pose to the landed pose. Each style shapes the path and
 * adds a rotation flourish that unwinds exactly at landing.
 */
export function entrancePose(style: Style, from: Pose, to: Pose, u: number, crisp = false): Pose {
  const e = style === 'hinge' ? ease.outCubic(u) : crisp ? ease.outQuint(u) : ease.outQuart(u);
  const lift = from.pos.clone();
  let c1: THREE.Vector3;
  let c2: THREE.Vector3;
  const extra = new THREE.Quaternion();
  switch (style) {
    case 'hinge': {
      // swings out of the facade toward the camera like a page opening, then glides to the front
      c1 = from.pos.clone().add(new THREE.Vector3(-to.w * 0.35, 0, 6));
      c2 = to.pos.clone().add(new THREE.Vector3(to.w * 0.25, -to.h * 0.05, -6));
      extra.setFromAxisAngle(AY, (1 - ease.outBack(u, 1.2)) * -0.35);
      break;
    }
    case 'depth':
      c1 = from.pos.clone().lerp(to.pos, 0.35);
      c2 = to.pos.clone().add(new THREE.Vector3(0, 0, -8));
      extra.setFromAxisAngle(AZ, (1 - e) * 0.2);
      break;
    case 'flip':
      c1 = from.pos.clone().add(new THREE.Vector3(4, 4, 8));
      c2 = to.pos.clone().add(new THREE.Vector3(-to.w * 0.3, 0, -4));
      extra.setFromAxisAngle(AY, (1 - e) * Math.PI * 2);
      break;
    case 'rise':
      c1 = from.pos.clone().add(new THREE.Vector3(0, 6, 6));
      c2 = to.pos.clone().add(new THREE.Vector3(0, -to.h * 0.6, -3));
      extra.setFromAxisAngle(AX, (1 - e) * -1.2);
      break;
    case 'drop':
      c1 = from.pos.clone().add(new THREE.Vector3(0, 3, 8));
      c2 = to.pos.clone().add(new THREE.Vector3(0, to.h * 0.7, -2));
      extra.setFromAxisAngle(AZ, (1 - e) * -0.7);
      break;
    case 'whip':
      // a hard lateral whip in from the right edge
      c1 = from.pos.clone().add(new THREE.Vector3(to.w * 0.9, 0, 6));
      c2 = to.pos.clone().add(new THREE.Vector3(to.w * 0.35, 0, 0));
      extra.setFromAxisAngle(AZ, (1 - e) * -0.18);
      break;
    case 'flap':
      // drops into place like a split-flap leaf hinged at its top edge
      c1 = to.pos.clone().lerp(from.pos, 0.5).add(new THREE.Vector3(0, to.h * 0.4, 4));
      c2 = to.pos.clone().add(new THREE.Vector3(0, to.h * 0.12, 0));
      extra.setFromAxisAngle(AX, (1 - ease.outBack(u, 1.4)) * 1.35);
      break;
    case 'snap':
      c1 = from.pos.clone().add(new THREE.Vector3(-to.w * 0.7, 0, 6));
      c2 = to.pos.clone().add(new THREE.Vector3(-to.w * 0.3, 0, 0));
      extra.setFromAxisAngle(AZ, (1 - e) * 0.26);
      break;
    default:
      c1 = from.pos.clone().lerp(to.pos, 0.33);
      c2 = to.pos.clone().lerp(from.pos, 0.2);
      extra.setFromAxisAngle(AY, (1 - e) * 0.5);
  }
  const pos = bez(lift, c1, c2, to.pos, e);
  const quat = from.quat.clone().slerp(to.quat, ease.inOutCubic(clamp(e * 1.15))).multiply(extra);
  return { pos, quat, w: lerp(from.w, to.w, e), h: lerp(from.h, to.h, e) };
}

/** Exit: launch toward the moon (view-space direction), shrinking into the distance. */
export function exitPose(from: Pose, moonDir: THREE.Vector3, u: number): Pose {
  const e = ease.inCubic(u);
  const far = moonDir.clone().multiplyScalar(320);
  const c1 = from.pos.clone().add(new THREE.Vector3(0, 2, 1));
  const c2 = far.clone().lerp(from.pos, 0.4);
  const pos = bez(from.pos, c1, c2, far, e);
  const quat = from.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(AX, -0.5 * e));
  return { pos, quat, w: from.w, h: from.h };
}

/**
 * Cards rendered in view space (camera at the origin, same fov as the city camera). Every card is
 * a real slab (bevelled lit edges, back panel, turn lighting) with its own soft shadow, in its own
 * scene so that cards are dealt over each other (each pass is depth-tested inside the card only).
 */
export class CardStage {
  readonly cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 2000);
  readonly scenes: THREE.Scene[] = [];
  readonly meshes: THREE.Mesh[] = [];
  readonly shadows: THREE.Mesh[] = [];
  private readonly hs: number[] = [];

  constructor(
    readonly defs: CardDef[],
    textures: THREE.Texture[],
  ) {
    defs.forEach((d, i) => {
      const h = d.ph / d.pw;
      this.hs.push(h);
      const scene = new THREE.Scene();
      const m = new THREE.Mesh(slabGeometry(h), [cardCapMaterial(textures[i], h), cardSideMaterial()]);
      m.renderOrder = 2;
      const sh = new THREE.Mesh(silhouetteGeometry(h), cardShadowMaterial(h));
      sh.renderOrder = 1;
      scene.add(sh, m);
      this.scenes.push(scene);
      this.meshes.push(m);
      this.shadows.push(sh);
    });
  }

  caps(i: number) {
    return (this.meshes[i].material as THREE.ShaderMaterial[])[0];
  }

  /** p: view-space pose (w × h in view units). Returns false if hidden. */
  setPose(i: number, p: Pose | null, alpha = 1, shadow = 0.62) {
    const m = this.meshes[i];
    const s = this.shadows[i];
    if (!p) {
      m.visible = false;
      s.visible = false;
      return false;
    }
    const h = this.hs[i];
    m.visible = true;
    m.position.copy(p.pos);
    m.quaternion.copy(p.quat);
    // width-normalised slab: x by width, y so the height matches (squash), thickness ∝ width
    m.scale.set(p.w, p.h / h, p.w);
    const mats = m.material as THREE.ShaderMaterial[];
    mats[0].uniforms.uAlpha.value = alpha;
    mats[1].uniforms.uAlpha.value = alpha;
    s.visible = shadow * alpha > 0.005;
    s.position.copy(m.position);
    s.quaternion.copy(m.quaternion);
    s.scale.copy(m.scale);
    const su = (s.material as THREE.ShaderMaterial).uniforms;
    su.uAlpha.value = shadow * alpha;
    // the shadow falls on a plane just behind the card (where the previous card of the deck lies)
    su.uPlaneZ.value = p.pos.z - Math.max(0.6, 0.04 * Math.abs(p.pos.z));
    return true;
  }
}

export async function loadHeroTextures(e: Engine, defs: CardDef[]) {
  return Promise.all(defs.map((d) => e.assets.texture('/assets/scenes/showcase/' + d.site.hero!.file, { srgb: true })));
}

/** Projected screen bbox of a slot (px), or null if not fully in front of the camera. */
function slotBox(s: Slot, cam: THREE.PerspectiveCamera, aspect: number) {
  const right = new THREE.Vector3(Math.cos(s.rotY), 0, -Math.sin(s.rotY)).multiplyScalar(s.w / 2);
  const up = new THREE.Vector3(0, s.w / aspect / 2, 0);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const v = s.pos.clone().addScaledVector(right, a).addScaledVector(up, b).project(cam);
    if (v.z > 1 || v.z < -1) return null;
    const x = (v.x * 0.5 + 0.5) * 1920;
    const y = (0.5 - v.y * 0.5) * 1080;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** Fraction of 5 sample points of a slot visible from the camera (towers + other billboards occlude). */
function visibleFrac(si: number, slots: Slot[], towers: Tower[], cam: THREE.PerspectiveCamera, aspect: number) {
  const s = slots[si];
  const o = cam.position;
  const right = new THREE.Vector3(Math.cos(s.rotY), 0, -Math.sin(s.rotY)).multiplyScalar(s.w * 0.4);
  const up = new THREE.Vector3(0, (s.w / aspect) * 0.4, 0);
  const pts = [new THREE.Vector3(0, 0, 0), right.clone().add(up), right.clone().sub(up), up.clone().sub(right), right.clone().add(up).negate()].map((v) => v.add(s.pos));
  let vis = 0;
  for (const p of pts) {
    const d = p.clone().sub(o);
    const len = d.length();
    d.divideScalar(len);
    let hit = false;
    for (const tw of towers) {
      // slab test against the tower box
      const minX = tw.x - tw.w / 2, maxX = tw.x + tw.w / 2, minZ = tw.z - tw.d / 2, maxZ = tw.z + tw.d / 2;
      let t0 = 0;
      let t1 = len - 0.6;
      for (const [oc, dc, lo, hi] of [[o.x, d.x, minX, maxX], [o.y, d.y, 0, tw.h], [o.z, d.z, minZ, maxZ]]) {
        if (Math.abs(dc) < 1e-9) {
          if (oc < lo || oc > hi) {
            t0 = 1;
            t1 = 0;
          }
          continue;
        }
        let a = (lo - oc) / dc;
        let b = (hi - oc) / dc;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        if (t0 > t1) break;
      }
      if (t0 <= t1) {
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (let k = 0; k < slots.length && !hit; k++) {
        if (k === si) continue;
        const q = slots[k];
        const n = new THREE.Vector3(Math.sin(q.rotY), 0, Math.cos(q.rotY));
        const den = n.dot(d);
        if (Math.abs(den) < 1e-6) continue;
        const tt = n.dot(q.pos.clone().sub(o)) / den;
        if (tt <= 0 || tt >= len - 0.6) continue;
        const hp = o.clone().addScaledVector(d, tt).sub(q.pos);
        const ax = new THREE.Vector3(Math.cos(q.rotY), 0, -Math.sin(q.rotY));
        if (Math.abs(hp.dot(ax)) < q.w / 2 && Math.abs(hp.y) < q.h / 2) hit = true;
      }
    }
    if (!hit) vis++;
  }
  return vis / pts.length;
}

/** Pick, for each card, a billboard slot that sits in its region at lift-off and is not occluded. */
export function pickHeroSlots(defs: CardDef[], slots: Slot[], towers: Tower[], camAt: (t: number) => THREE.PerspectiveCamera) {
  const used = new Set<number>();
  for (const d of defs) {
    const cam = camAt(d.tLift);
    let best = -1;
    let bestScore = -Infinity;
    slots.forEach((s, i) => {
      if (used.has(i)) return;
      const b = slotBox(s, cam, d.pw / d.ph);
      if (!b) return;
      const [x0, y0, x1, y1] = d.region;
      if (b.cx < x0 || b.cx > x1 || b.cy < y0 || b.cy > y1) return;
      // fully on screen, clear of the credits corner
      if (b.x0 < 8 || b.x1 > 1912 || b.y0 < 8 || b.y1 > 1072) return;
      if (b.x1 > 1480 && b.y0 < 265) return;
      let score: number;
      if (d.style === 'hinge') score = s.rotY !== 0 ? Math.min(b.w * b.h, 380 * 380) : -1;
      else if (d.style === 'depth' || d.style === 'glitch') score = -Math.abs(b.w - 70);
      else score = Math.min(b.w, 260) * (s.rotY === 0 ? 1 : 0.6);
      if (score > bestScore && visibleFrac(i, slots, towers, cam, d.pw / d.ph) >= 0.8) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) {
      used.add(best);
      d.slot = best;
    }
  }
  return used;
}

export { seg };
