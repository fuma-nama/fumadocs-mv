import * as THREE from 'three';
import { clamp, ease, hash, lerp, seg } from '../../engine/anim';
import { MOSAIC, mosaicTiles, type MosaicTile } from './contract';
import type { Slot } from './city';
import { MOON, type V3 } from './rig';
import { SITES } from './sites.gen';
import { T } from './timeline';

/** The mosaic disc in world space: the moon's face, perpendicular to the final camera's view. */
export interface DiscFrame {
  c: THREE.Vector3;
  r: THREE.Vector3;
  u: THREE.Vector3;
  n: THREE.Vector3;
  /** world units per screen px at the hold */
  s: number;
  quat: THREE.Quaternion;
}

export function discFrame(pEnd: V3): DiscFrame {
  const c = MOON.pos.clone();
  const n = new THREE.Vector3(...pEnd).sub(c).normalize();
  const f = n.clone().negate();
  const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  const u = new THREE.Vector3().crossVectors(r, f).normalize();
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, n));
  return { c, r, u, n, s: MOON.radius / MOSAIC.R, quat };
}

export interface TilePose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  w: number;
  h: number;
}

const AY = new THREE.Vector3(0, 1, 0);
/** how far a flipping wall tile lifts off the moon's face, in tile widths (clears its swinging edge) */
const LIFT = 0.56;

interface Flight {
  tile: MosaicTile;
  /** normalised distance of the tile centre from the disc centre (0..1) */
  rho: number;
  dep: number;
  arr: number;
  from: TilePose;
  dock: TilePose;
  /** wall phase: flip start (s) and the alternate site cell shown on the back */
  flip: number;
  alt: string;
  roll: number;
  /** launch-flare scale (screens next to the lens flare less) */
  near: number;
  /** start of the return turn (s) */
  back: number;
}

function bez(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, u: number, out = new THREE.Vector3()) {
  const v = 1 - u;
  return out
    .set(0, 0, 0)
    .addScaledVector(a, v * v * v)
    .addScaledVector(b, 3 * v * v * u)
    .addScaledVector(c, 3 * v * u * u)
    .addScaledVector(d, u * u * u);
}

export class Swarm {
  readonly flights: Flight[] = [];

  constructor(
    readonly F: DiscFrame,
    tileSlot: number[],
    slots: Slot[],
    launchCam: THREE.Vector3,
  ) {
    const tiles = mosaicTiles();
    const slugs = SITES.map((s) => s.slug);
    tiles.forEach((tile, i) => {
      const cx = tile.x + tile.w / 2 - MOSAIC.CX;
      const cy = tile.y + tile.h / 2 - MOSAIC.CY;
      const rho = Math.min(1, Math.hypot(cx, cy) / MOSAIC.R);
      const dock: TilePose = {
        pos: F.c.clone().addScaledVector(F.r, cx * F.s).addScaledVector(F.u, -cy * F.s),
        quat: F.quat.clone(),
        w: tile.w * F.s,
        h: tile.h * F.s,
      };
      let from: TilePose;
      const si = tileSlot[i];
      if (si >= 0) {
        const sl = slots[si];
        from = { pos: sl.pos.clone(), quat: new THREE.Quaternion().setFromAxisAngle(AY, sl.rotY), w: sl.w, h: sl.h };
      } else {
        // starts behind/below the launch camera and rises past it
        const a = hash(i, 11) * Math.PI * 2;
        from = {
          pos: launchCam.clone().add(new THREE.Vector3(Math.cos(a) * (40 + 90 * hash(i, 12)), -30 - 20 * hash(i, 13), 60 + 120 * hash(i, 14))),
          quat: new THREE.Quaternion(),
          w: dock.w,
          h: dock.h,
        };
      }
      // launch waves on the 16ths (near first); docking ripples out from the centre
      const wave = Math.floor(clamp(rho * 5 + hash(i, 3) * 0.6, 0, 5.99));
      const dep = T.launch + 0.1 * wave + 0.03 * hash(i, 4);
      const arr = 96.9 + 0.85 * rho + 0.06 * hash(i, 5);
      // flip wave across the wall (diagonal): each turn (0.24 s) settles exactly on an 8th,
      // from 98.0 (bar 62 beat 2) to 99.2 (bar 63 downbeat); the return turn settles 0.8 s later
      const diag = (tile.i * 0.55 + tile.j * 0.4 + 14) / 28;
      let flip = T.wall + 0.2 * (2 + Math.floor(clamp(diag, 0, 1) * 6 + hash(i, 6) * 0.9)) - 0.24;
      // never turn while still docking (no pop): move to the next 8th after arrival
      if (flip < arr + 0.02) flip += 0.2 * Math.ceil((arr + 0.02 - flip) / 0.2);
      const alt = slugs[(slugs.indexOf(tile.slug) + 7 + Math.floor(hash(i, 7) * 20)) % slugs.length];
      // screens right next to the lens flare less as they lift off (no white slabs filling the frame)
      const near = clamp((from.pos.distanceTo(launchCam) - 15) / 60, 0.25, 1);
      // the return turn: 0.8 s later, spread over three 8ths so no single beat turns half the wall
      const back = flip + 0.8 + 0.2 * Math.floor(hash(i, 9) * 2.99);
      this.flights.push({ tile, rho, dep, arr, from, dock, flip, back, alt, roll: (hash(i, 8) - 0.5) * 2, near });
    });
  }

  /** Pose of tile i at time t (world), plus dock flash / clip / fog and the wall-flip lift (0..1). */
  pose(i: number, t: number, out: TilePose): { flash: number; clip: number; fog: number; lift: number; obj: number } {
    const fl = this.flights[i];
    if (t < fl.dep) {
      out.pos.copy(fl.from.pos);
      out.quat.copy(fl.from.quat);
      out.w = fl.from.w;
      out.h = fl.from.h;
      return { flash: 0, clip: 0, fog: 1, lift: 0, obj: 0 };
    }
    if (t < fl.arr) {
      const u = seg(t, fl.dep, fl.arr);
      const e = ease.inOutCubic(u);
      const p0 = fl.from.pos;
      const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(fl.from.quat);
      const p1 = p0.clone().addScaledVector(nrm, 10).add(new THREE.Vector3(0, 40, 0));
      const p3 = fl.dock.pos;
      const p2 = p3.clone().addScaledVector(this.F.n, 420);
      bez(p0, p1, p2, p3, e, out.pos);
      const k = ease.inOutCubic(clamp(u / 0.85));
      out.quat.copy(fl.from.quat).slerp(fl.dock.quat, k);
      const fwd = new THREE.Vector3(0, 0, 1);
      out.quat.multiply(new THREE.Quaternion().setFromAxisAngle(fwd, Math.sin(u * Math.PI) * 0.7 * fl.roll));
      out.w = lerp(fl.from.w, fl.dock.w, ease.inOutQuad(u));
      out.h = lerp(fl.from.h, fl.dock.h, ease.inOutQuad(u));
      const flare = Math.exp(-(t - fl.dep) / 0.06) * 0.6 * fl.near;
      return { flash: flare, clip: 0, fog: 1 - ease.inOutQuad(clamp(u * 1.6)), lift: 0, obj: clamp(u / 0.04) };
    }
    out.pos.copy(fl.dock.pos);
    out.quat.copy(fl.dock.quat);
    out.w = fl.dock.w;
    out.h = fl.dock.h;
    // wall phase: flip to the alternate site and back (180° about the tile's up axis); the panel
    // lifts off the moon's face while it turns (it needs the room) and casts a shadow on it
    const f1 = seg(t, fl.flip, fl.flip + 0.24, ease.inOutCubic);
    const f2 = seg(t, fl.back, fl.back + 0.24, ease.inOutCubic);
    const ang = Math.PI * (f1 + f2);
    const lift = Math.sin(Math.PI * f1) + Math.sin(Math.PI * f2);
    if (ang > 0 && ang < Math.PI * 2) {
      out.pos.addScaledVector(this.F.n, lift * LIFT * fl.dock.w);
      out.quat.multiply(new THREE.Quaternion().setFromAxisAngle(AY, ang));
    }
    const dockFlash = Math.exp(-Math.max(0, t - fl.arr) / 0.05) * 0.22;
    return { flash: dockFlash, clip: 1, fog: 0, lift, obj: 1 };
  }

  alt(i: number) {
    return this.flights[i].alt;
  }

  /** Site visible on tile i at time t (its back shows the alternate site mid-wall), or null mid-turn. */
  visibleSlug(i: number, t: number): string | null {
    const fl = this.flights[i];
    const f1 = seg(t, fl.flip, fl.flip + 0.24, ease.inOutCubic);
    const f2 = seg(t, fl.back, fl.back + 0.24, ease.inOutCubic);
    const c = Math.cos(Math.PI * (f1 + f2));
    if (Math.abs(c) < 0.5) return null;
    return c > 0 ? fl.tile.slug : fl.alt;
  }
}

/**
 * Shadows of lifted wall tiles on the moon's face: each tile's silhouette (a little enlarged, soft
 * edged) projected along the key light onto the plane just in front of the resting tiles.
 */
export class TileShadows {
  readonly mesh: THREE.InstancedMesh;
  private aLift: THREE.InstancedBufferAttribute;

  constructor(
    count: number,
    F: DiscFrame,
    lightView: THREE.Vector3,
    panelT: number,
  ) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aLift = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.aLift.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aLift', this.aLift);
    // the key light travels from upper left, in front of the moon's face (camera-relative at the wall)
    const ld = new THREE.Vector3().addScaledVector(F.r, lightView.x).addScaledVector(F.u, lightView.y).addScaledVector(F.n, lightView.z).negate().normalize();
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // projected along the light, the silhouette's winding flips once the panel turns past 90°
      side: THREE.DoubleSide,
      uniforms: {
        uC: { value: F.c.clone().addScaledVector(F.n, panelT / 2 + 0.05) },
        uN: { value: F.n.clone() },
        uLd: { value: ld },
        uA: { value: 0.62 },
      },
      vertexShader: /* glsl */ `
        attribute float aLift; uniform vec3 uC; uniform vec3 uN; uniform vec3 uLd;
        varying vec2 vP; varying float vLift;
        void main(){
          vLift = aLift;
          vP = position.xy * 1.2;
          vec4 wp = modelMatrix * instanceMatrix * vec4(vP, 0.0, 1.0);
          float s = dot(uC - wp.xyz, uN) / dot(uLd, uN);
          wp.xyz += uLd * s;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uA; varying vec2 vP; varying float vLift;
        void main(){
          vec2 q = abs(vP) - vec2(0.5);
          float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
          float a = (1.0 - smoothstep(-0.14, 0.09, d)) * uA * clamp(vLift, 0.0, 1.0);
          if (a < 0.002) discard;
          gl_FragColor = vec4(0.0, 0.0, 0.0, a);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noEdges = true;
    this.mesh.renderOrder = 1;
  }

  set(i: number, m: THREE.Matrix4, lift: number) {
    this.mesh.setMatrixAt(i, m);
    this.aLift.setX(i, lift);
  }

  commit() {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aLift.needsUpdate = true;
  }
}

/**
 * The moon behind the mosaic: one socket per tile, set into the moon's face right behind the
 * panel, lit with the moon's own gradient. Hidden while the panel rests in it; revealed (with the
 * lifted panel's shadow falling into it) while the panel turns.
 */
export class Sockets {
  readonly mesh: THREE.InstancedMesh;
  readonly mat: THREE.ShaderMaterial;

  constructor(F: DiscFrame, flights: { tile: MosaicTile; dock: TilePose }[], panelT: number) {
    const n = flights.length;
    const geo = new THREE.PlaneGeometry(1, 1);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    flights.forEach((fl, i) => {
      // drawMoon's gradient (from the bbox's top-left corner along 45° for 2R; stops 0.45 → 1; sRGB mix)
      const x = fl.tile.x + fl.tile.w / 2 - (MOSAIC.CX - MOSAIC.R);
      const y = fl.tile.y + fl.tile.h / 2 - (MOSAIC.CY - MOSAIC.R);
      const tt = ((x + y) * Math.SQRT1_2) / (2 * MOSAIC.R);
      const k = clamp((tt - 0.45) / 0.55);
      c.setRGB((10 + 240 * k) / 255, (10 + 118 * k) / 255, (11 + 24 * k) / 255, THREE.SRGBColorSpace);
      col.set([c.r, c.g, c.b], i * 3);
    });
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uOn: { value: 0 },
        uC: { value: F.c.clone() },
        uR: { value: F.r.clone() },
        uU: { value: F.u.clone() },
        uRad: { value: MOSAIC.R * F.s },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aCol; varying vec3 vCol; varying vec2 vUv; varying vec3 vW;
        void main(){
          vCol = aCol; vUv = uv;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOn; uniform vec3 uC; uniform vec3 uR; uniform vec3 uU; uniform float uRad;
        varying vec3 vCol; varying vec2 vUv; varying vec3 vW;
        void main(){
          // only inside the moon's disc (like the panels)
          vec3 d = vW - uC;
          if (length(vec2(dot(d, uR), dot(d, uU))) > uRad) discard;
          // a recessed slot: lit by the moon's own light, darker towards its walls
          vec2 q = abs(vUv - 0.5) * 2.0;
          float wall = smoothstep(0.55, 1.0, max(q.x, q.y));
          vec3 col = vCol * 0.42 * (1.0 - 0.6 * wall);
          gl_FragColor = vec4(col * uOn, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n);
    const m = new THREE.Matrix4();
    const sc = new THREE.Vector3();
    flights.forEach((fl, i) => {
      const pos = fl.dock.pos.clone().addScaledVector(F.n, -(panelT / 2 + 0.06));
      m.compose(pos, fl.dock.quat, sc.set(fl.dock.w * 0.985, fl.dock.h * 0.97, 1));
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.frustumCulled = false;
    this.mesh.userData.noEdges = true;
    this.mesh.visible = false;
  }
}

/** Exact 2D render of the disc at the hold (B8 contract): tiles, INK gaps, clip, wash, rim. */
export function drawDiscTiles(c: CanvasRenderingContext2D, atlas: HTMLImageElement, cellOf: (slug: string) => number, cols: number, cw: number, ch: number, bezel: number) {
  const { CX, CY, R } = MOSAIC;
  c.save();
  c.beginPath();
  c.arc(CX, CY, R, 0, Math.PI * 2);
  c.clip();
  c.fillStyle = MOSAIC.BG;
  c.fillRect(CX - R - 2, CY - R - 2, R * 2 + 4, R * 2 + 4);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  for (const tl of mosaicTiles()) {
    const cell = cellOf(tl.slug);
    const sx = (cell % cols) * cw + bezel;
    const sy = Math.floor(cell / cols) * ch + bezel;
    c.drawImage(atlas, sx, sy, cw - 2 * bezel, ch - 2 * bezel, tl.x, tl.y, tl.w, tl.h);
  }
  c.restore();
}

export { hash };
