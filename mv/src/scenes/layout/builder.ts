import * as THREE from 'three';
import { clamp } from '../../engine/anim';
import { C } from '../_shared/palette';
import { FatLines, Fills, lin } from './gpu';
import { polyRange, rrOutline, type Box } from './geom';
import type { GroupKey } from './geo';
import { VH, VW } from './layouts';
import type { FrameState } from './morph';

/** All GPU primitives the wireframes are made of (shared by every frame instance). */
export class Ink {
  readonly frame = new FatLines(8000); // orange viewport outlines (thick)
  readonly edge = new FatLines(40000); // panel outlines / separators
  readonly fine = new FatLines(120000); // content boxes, circles, rails
  readonly fills = new Fills(720000);
  readonly glass = new Fills(60000, { transparent: true });
  readonly group = new THREE.Group();
  /** bars differ in thickness: bucketed into world-unit FatLines */
  readonly barBuckets: { th: number; L: FatLines }[] = [];

  constructor() {
    for (const th of [2, 4.4, 6, 7, 8.5, 11, 14, 18, 24, 32, 40]) this.barBuckets.push({ th, L: new FatLines(14000, { worldUnits: true, width: th }) });
    this.fills.mesh.renderOrder = 0;
    this.glass.mesh.renderOrder = 2;
    this.group.add(this.fills.mesh, this.glass.mesh, this.frame.obj, this.edge.obj, this.fine.obj);
    for (const b of this.barBuckets) this.group.add(b.L.obj);
    for (const L of [this.fine, ...this.barBuckets.map((b) => b.L)]) L.obj.renderOrder = 1;
    // outlines draw after the projected captures (transparent pass, renderOrder 4) so they stay on top
    for (const L of [this.frame, this.edge]) {
      L.mat.transparent = true;
      L.obj.renderOrder = 4;
    }
  }

  reset() {
    this.frame.reset();
    this.edge.reset();
    this.fine.reset();
    for (const b of this.barBuckets) b.L.reset();
    this.fills.reset();
    this.glass.reset();
  }

  bucket(th: number): FatLines {
    let best = this.barBuckets[0];
    for (const b of this.barBuckets) if (Math.abs(b.th - th) < Math.abs(best.th - th)) best = b;
    return best.L;
  }

  commit(ss: number, W: number, H: number, w: { frame: number; edge: number; fine: number }) {
    const rw = W * ss;
    const rh = H * ss;
    this.frame.commit(w.frame * ss, rw, rh);
    this.edge.commit(w.edge * ss, rw, rh);
    this.fine.commit(w.fine * ss, rw, rh);
    for (const b of this.barBuckets) b.L.commit(b.th, rw, rh);
    this.fills.commit();
    this.glass.commit();
  }

  /** Depth-only mode for the glow pass: fills occlude but draw nothing. */
  setGlowPass(on: boolean) {
    this.fills.mat.colorWrite = !on;
    this.glass.mat.colorWrite = !on;
    this.glass.mat.depthWrite = on;
  }
}

const ORANGE = lin(C.ORANGE);
const WHITE = lin(C.WHITE);
const BASE = lin('#0f0f11');
const FILL_LO = lin('#0d0d0f');
const FILL_HI = lin('#18181b');
const CARD = lin('#151518');
const CARD_ACC = lin('#2b1709');
const WALL = lin('#0b0b0d');

/**
 * Scene lighting (world space): one key light high behind-left of the row, so the slabs throw
 * long shadows toward the camera, their tops catch the light, and a face sweeps through the
 * specular as it tips over. Also the camera position for the sheen.
 */
const KEY = new THREE.Vector3(-0.35, 0.85, -0.45).normalize();
const VIEW = new THREE.Vector3(0, 0, 1e4);
export function setView(p: THREE.Vector3) {
  VIEW.copy(p);
}
export const LIGHT_DIR = KEY;

/** Slab thickness of a frame body (viewport px). */
export const BODY = 48;

/** Style of one frame instance. */
export interface DrawStyle {
  /** slab body thickness behind the face (0 = flat plane, only for frontal shots) */
  body?: number;
  /** overall line brightness */
  inten: number;
  /** 0..1 heat: white edges → orange */
  heat: number;
  /** viewport outline draw-on (fraction of perimeter, from the top-centre both ways) */
  frameOn: number;
  /** panel outlines draw-on 0..1 */
  edgeOn: number;
  /** content cascade 0..1 */
  contentOn: number;
  /** viewport base fill opacity */
  fillA: number;
  /** viewport outline box override (ring → frame morph) */
  frameBox?: Box;
  /** extrusion (px) applied to group slabs (architecture mode) */
  extrude?: number;
  noBase?: boolean;
  /** groups whose content is drawn elsewhere (or hidden) */
  skip?: GroupKey[];
  /** content opacity multiplier (fades the skeleton under a projection) */
  contentA?: number;
  /** panel fill opacity (default 1) */
  panelFillA?: number;
  /** screen px per viewport px along the frame's vertical axis (for sub-pixel text bars) */
  pxScaleY?: number;
}

function shade(tone: number, acc: number, heat: number, k: number): number[] {
  const h = clamp(Math.max(acc, heat));
  const g = tone * tone;
  const o = Math.max(0.35, tone);
  return [
    (WHITE[0] * g * (1 - h) + ORANGE[0] * o * h) * k,
    (WHITE[1] * g * (1 - h) + ORANGE[1] * o * h) * k,
    (WHITE[2] * g * (1 - h) + ORANGE[2] * o * h) * k,
  ];
}

/** Extrusion height factor per group (architecture mode). */
const EXTRUDE: Record<GroupKey, number> = {
  surface: 0.06,
  navbar: 0.32,
  tabs: 0.22,
  sidebar: 0.6,
  page: 0.2,
  main: 1,
  toc: 0.75,
  pills: 0.5,
  panel: 0.55,
  hero: 0.85,
  overlay: 0.05,
};

const tmp: number[] = [];

/** Emits one wireframe (a FrameState) placed by matrix M (viewport-local → world). */
export function buildFrame(ink: Ink, fs: FrameState, M: THREE.Matrix4, st: DrawStyle) {
  const e = M.elements;
  const X = (x: number, y: number, z: number) => e[0] * (x - VW / 2) + e[4] * (VH / 2 - y) + e[8] * z + e[12];
  const Y = (x: number, y: number, z: number) => e[1] * (x - VW / 2) + e[5] * (VH / 2 - y) + e[9] * z + e[13];
  const Z = (x: number, y: number, z: number) => e[2] * (x - VW / 2) + e[6] * (VH / 2 - y) + e[10] * z + e[14];
  const P = (x: number, y: number, z: number) => [X(x, y, z), Y(x, y, z), Z(x, y, z)];
  const seg = (L: FatLines, ax: number, ay: number, bx: number, by: number, z: number, col: number[]) =>
    L.seg(X(ax, ay, z), Y(ax, ay, z), Z(ax, ay, z), X(bx, by, z), Y(bx, by, z), Z(bx, by, z), col);
  const k = st.inten;
  const ext = st.extrude ?? 0;
  const pfa = Math.min(st.fillA, st.panelFillA ?? 1);

  // ── viewport base + outline ─────────────────────────────────────────────
  const vb: Box = st.frameBox ?? { x: 0, y: 0, w: VW, h: VH, r: fs.frameR };
  const outline = rrOutline(vb, 24, tmp);
  const body = st.body ?? 0;
  // the face is always lit the same way (flat frontal frames and slabs match: no pop when the
  // body appears); slabs add walls, back and edge-lit thickness
  if (!st.noBase && st.fillA > 0.001) slab(ink, vb, body, M, st, P);
  if (st.frameOn > 0) {
    const col = shade(1, 1, 1, k);
    const half = clamp(st.frameOn) / 2;
    polyRange(outline, 0, half, (ax, ay, bx, by) => seg(ink.frame, ax, ay, bx, by, 0.6, col));
    polyRange(outline, 1 - half, 1, (ax, ay, bx, by) => seg(ink.frame, ax, ay, bx, by, 0.6, col));
  }

  // ── group slabs ──────────────────────────────────────────────────────────
  const top = new Map<GroupKey, number>();
  for (const pn of fs.els) {
    if (pn.k !== 'panel') continue;
    const height = (pn.t ?? 2) + ext * EXTRUDE[pn.g];
    const z0 = pn.z ?? 0;
    const z1 = z0 + height;
    top.set(pn.g, Math.max(top.get(pn.g) ?? 0, z1));
    const pk = k * pn.a;
    if (pk <= 0.002 || pn.w < 0.5 || pn.h < 0.5) continue;
    const out = rrOutline(pn, 8, []);
    const glassy = (pn.glass ?? 0) > 0.01;
    if (pfa > 0.001 && (pn.fill > 0.01 || glassy || height > 3)) {
      const f = FILL_LO.map((v, i) => v + (FILL_HI[i] - v) * pn.fill);
      const col = [f[0], f[1], f[2], glassy && ext < 1 ? 0.5 + 0.4 * (1 - (pn.glass ?? 0)) : 1];
      const target = glassy && ext < 1 ? ink.glass : ink.fills;
      fan(target, out, z1, col, P, pfa * pn.a);
      if (height > 2.5) walls(target, out, z0, z1, [WALL[0], WALL[1], WALL[2], col[3]], P, pfa * pn.a);
    }
    const edgeK = Math.max(pn.edge ?? 1, clamp(ext / 30));
    const ek = pk * edgeK * clamp(st.edgeOn * 1.2);
    if (ek > 0.002) {
      const col = shade(0.8, 0, st.heat, ek);
      const on = clamp(st.edgeOn);
      if (pn.sep && ext < 1) {
        const [t, r, bt, l] = pn.sep;
        const b = pn;
        if (t > 0.01) seg(ink.edge, b.x, b.y, b.x + b.w * on, b.y, z1, mul(col, t));
        if (r > 0.01) seg(ink.edge, b.x + b.w, b.y, b.x + b.w, b.y + b.h * on, z1, mul(col, r));
        if (bt > 0.01) seg(ink.edge, b.x, b.y + b.h, b.x + b.w * on, b.y + b.h, z1, mul(col, bt));
        if (l > 0.01) seg(ink.edge, b.x, b.y, b.x, b.y + b.h * on, z1, mul(col, l));
      } else {
        polyRange(out, 0, on / 2, (ax, ay, bx, by) => seg(ink.edge, ax, ay, bx, by, z1, col));
        polyRange(out, 1 - on / 2, 1, (ax, ay, bx, by) => seg(ink.edge, ax, ay, bx, by, z1, col));
        if (height > 2.5) {
          // edge-lit slab: back outline + posts at the corners
          const cb = mul(col, 0.5);
          for (let i = 2; i < out.length; i += 2) seg(ink.edge, out[i - 2], out[i - 1], out[i], out[i + 1], z0, cb);
          for (let c = 0; c < 4; c++) {
            const idx = 2 * (1 + c * 9 + 4);
            const x = out[idx];
            const y = out[idx + 1];
            ink.edge.seg(X(x, y, z0), Y(x, y, z0), Z(x, y, z0), X(x, y, z1), Y(x, y, z1), Z(x, y, z1), cb, col);
          }
        }
      }
    }
  }

  // ── content ──────────────────────────────────────────────────────────────
  if (st.contentOn <= 0) return;
  const N = fs.els.length;
  const spread = 6;
  const ca = st.contentA ?? 1;
  for (let i = 0; i < N; i++) {
    const el = fs.els[i];
    if (el.k === 'panel' || st.skip?.includes(el.g)) continue;
    const on = clamp((st.contentOn * (N + spread) - i) / spread);
    if (on <= 0) continue;
    const kk = k * el.a * ca;
    if (kk <= 0.002) continue;
    const z = (top.get(el.g) ?? 0) + 0.4;
    const col = shade(el.tone, el.acc, st.heat * 0.6, kk * Math.min(1, on * 1.5));
    if (el.k === 'bar') {
      const len = el.w * on;
      if (len < 0.5) continue;
      const hw = Math.min(el.h / 2, len / 2);
      const pxTh = el.h * (st.pxScaleY ?? 1);
      // sub-pixel bars (far slabs) shimmer as world-width lines: draw them as 1.4 px screen lines, dimmed
      const L = pxTh < 1.25 ? ink.fine : ink.bucket(el.h);
      const cc = pxTh < 1.25 ? mul(col, Math.max(0.2, pxTh / 1.25)) : col;
      L.seg(X(el.x + hw, el.y, z), Y(el.x + hw, el.y, z), Z(el.x + hw, el.y, z), X(el.x + len - hw, el.y, z), Y(el.x + len - hw, el.y, z), Z(el.x + len - hw, el.y, z), cc);
    } else if (el.k === 'box') {
      if (el.w < 0.5 || el.h < 0.5) continue;
      const o = rrOutline(el, 4, []);
      if (el.fill > 0.01) {
        const src = el.acc > 0.5 ? CARD_ACC : CARD;
        fan(ink.fills, o, z - 0.2, [src[0], src[1], src[2], 1], P, pfa * on);
      }
      polyRange(o, 0, on, (ax, ay, bx, by) => seg(ink.fine, ax, ay, bx, by, z, col));
    } else if (el.k === 'dot') {
      if (el.r * 2 * (st.pxScaleY ?? 1) < 0.9) continue;
      const L = ink.bucket(Math.max(2, el.r * 2));
      L.seg(X(el.x, el.y, z), Y(el.x, el.y, z), Z(el.x, el.y, z), X(el.x + 0.05, el.y, z), Y(el.x + 0.05, el.y, z), Z(el.x + 0.05, el.y, z), col);
    } else if (el.k === 'ring') {
      const o = rrOutline({ x: el.x - el.r, y: el.y - el.r, w: el.r * 2, h: el.r * 2, r: el.r }, 8, []);
      polyRange(o, 0, on, (ax, ay, bx, by) => seg(ink.fine, ax, ay, bx, by, z, col));
    } else if (el.k === 'poly' && el.pts) {
      polyRange(el.pts, 0, on * (el.on ?? 1), (ax, ay, bx, by) => seg(ink.fine, ax, ay, bx, by, z, col), false);
    }
  }
}

/** World-space normal of a frame-local normal (local: x right, y up, z out of the face). */
function nWorld(M: THREE.Matrix4, nx: number, ny: number, nz: number, out = new THREE.Vector3()) {
  const e = M.elements;
  return out.set(e[0] * nx + e[4] * ny + e[8] * nz, e[1] * nx + e[5] * ny + e[9] * nz, e[2] * nx + e[6] * ny + e[10] * nz).normalize();
}

const WALL_LO = lin('#0b0b0d');
const WALL_HI = lin('#62626c');
const SHEEN = lin('#f2f2f6');
const _n = new THREE.Vector3();
const _v = new THREE.Vector3();
const _h = new THREE.Vector3();

/**
 * The frame as a physical slab: lit face (diffuse + a broad specular sheen that slides across it
 * as the frame turns), side walls shaded by their angle to the key light, a dark back, and
 * edge-lit thickness (dim back outline + posts at the corners).
 */
function slab(ink: Ink, vb: Box, T: number, M: THREE.Matrix4, st: DrawStyle, P: (x: number, y: number, z: number) => number[]) {
  const e = M.elements;
  const Nf = nWorld(M, 0, 0, 1, new THREE.Vector3());
  const k = st.fillA;
  // face: a grid (rounded corners as fans) so the sheen is smooth
  const faceCol = (x: number, y: number): number[] => {
    const wx = e[0] * (x - VW / 2) + e[4] * (VH / 2 - y) + e[12];
    const wy = e[1] * (x - VW / 2) + e[5] * (VH / 2 - y) + e[13];
    const wz = e[2] * (x - VW / 2) + e[6] * (VH / 2 - y) + e[14];
    _v.set(VIEW.x - wx, VIEW.y - wy, VIEW.z - wz).normalize();
    _h.copy(KEY).add(_v).normalize();
    const diff = Math.max(0, Nf.dot(KEY));
    // a tight glint that sweeps across the face while it turns, never a wash over the content
    const spec = Math.max(0, Nf.dot(_h)) ** 160;
    const fres = (1 - Math.max(0, Nf.dot(_v))) ** 4;
    const amb = 0.8 + 0.45 * diff;
    const sh = 0.05 * spec + 0.008 * fres;
    return [BASE[0] * amb + SHEEN[0] * sh, BASE[1] * amb + SHEEN[1] * sh, BASE[2] * amb + SHEEN[2] * sh, 1];
  };
  litFace(ink.fills, vb, -0.5, P, faceCol);
  if (T <= 0.5) return;
  // walls + back
  const out = rrOutline(vb, 6, []);
  const n = out.length / 2 - 1;
  const cx = vb.x + vb.w / 2;
  const cy = vb.y + vb.h / 2;
  for (let i = 0; i < n; i++) {
    const ax = out[2 * i], ay = out[2 * i + 1], bx = out[2 * i + 2], by = out[2 * i + 3];
    let nx = by - ay;
    let ny = -(bx - ax);
    const mx = (ax + bx) / 2 - cx;
    const my = (ay + by) / 2 - cy;
    if (nx * mx + ny * my < 0) {
      nx = -nx;
      ny = -ny;
    }
    const len = Math.hypot(nx, ny) || 1;
    // px coords are y-down: the local 3D normal is (nx, -ny, 0)
    nWorld(M, nx / len, -ny / len, 0, _n);
    const lit = 0.18 + 0.82 * Math.max(0, _n.dot(KEY));
    const c = WALL_LO.map((v, j) => v + (WALL_HI[j] - v) * lit);
    const a0 = P(ax, ay, -0.5), b0 = P(bx, by, -0.5), a1 = P(ax, ay, -T), b1 = P(bx, by, -T);
    ink.fills.tri(a0, b0, b1, [c[0], c[1], c[2], 1]);
    ink.fills.tri(a0, b1, a1, [c[0], c[1], c[2], 1]);
  }
  fan(ink.fills, out, -T, [WALL_LO[0], WALL_LO[1], WALL_LO[2], 1], P, 1);
  // edge-lit thickness: dim back outline and posts at the corner midpoints (fade with the fills)
  const col = shade(1, 1, 1, st.inten * 0.42 * k);
  const seg3 = (L: FatLines, ax: number, ay: number, az: number, bx: number, by: number, bz: number, c0: number[], c1: number[] = c0) => {
    const pa = P(ax, ay, az);
    const pb = P(bx, by, bz);
    L.seg(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], c0, c1);
  };
  for (let i = 0; i < n; i++) seg3(ink.edge, out[2 * i], out[2 * i + 1], -T, out[2 * i + 2], out[2 * i + 3], -T, col);
  const front = shade(1, 1, 1, st.inten * 0.8 * k);
  for (let c = 0; c < 4; c++) {
    const idx = 2 * (1 + c * 7 + 3);
    seg3(ink.edge, out[idx], out[idx + 1], 0.4, out[idx], out[idx + 1], -T, front, col);
  }
}

/** Rounded-rect face as a grid (corner cells as fans) with per-vertex colours. */
function litFace(F: Fills, b: Box, z: number, P: (x: number, y: number, z: number) => number[], colOf: (x: number, y: number) => number[]) {
  const r = Math.max(0, Math.min(b.r, b.w / 2, b.h / 2));
  const nx = 10;
  const ny = 6;
  const xs: number[] = [b.x];
  const ys: number[] = [b.y];
  if (r > 0.5) xs.push(b.x + r);
  for (let i = 1; i < nx; i++) xs.push(b.x + r + ((b.w - 2 * r) * i) / nx);
  if (r > 0.5) xs.push(b.x + b.w - r);
  xs.push(b.x + b.w);
  if (r > 0.5) ys.push(b.y + r);
  for (let j = 1; j < ny; j++) ys.push(b.y + r + ((b.h - 2 * r) * j) / ny);
  if (r > 0.5) ys.push(b.y + b.h - r);
  ys.push(b.y + b.h);
  const cache = new Map<string, { p: number[]; c: number[] }>();
  const V = (x: number, y: number) => {
    const key = x.toFixed(2) + ',' + y.toFixed(2);
    let v = cache.get(key);
    if (!v) {
      v = { p: P(x, y, z), c: colOf(x, y) };
      cache.set(key, v);
    }
    return v;
  };
  const triV = (a: { p: number[]; c: number[] }, bb: { p: number[]; c: number[] }, c: { p: number[]; c: number[] }) => {
    F.triC(a.p, bb.p, c.p, a.c, bb.c, c.c);
  };
  const last = xs.length - 2;
  const lastY = ys.length - 2;
  for (let i = 0; i <= last; i++) {
    for (let j = 0; j <= lastY; j++) {
      const corner = r > 0.5 && (i === 0 || i === last) && (j === 0 || j === lastY);
      if (corner) {
        // fan from the inner corner over the arc
        const cxr = i === 0 ? b.x + r : b.x + b.w - r;
        const cyr = j === 0 ? b.y + r : b.y + b.h - r;
        const a0 = i === 0 ? (j === 0 ? Math.PI : Math.PI / 2) : j === 0 ? -Math.PI / 2 : 0;
        const ctr = V(cxr, cyr);
        let prev = V(cxr + Math.cos(a0) * r, cyr + Math.sin(a0) * r);
        for (let s = 1; s <= 6; s++) {
          const a = a0 + (s / 6) * (Math.PI / 2);
          const cur = V(cxr + Math.cos(a) * r, cyr + Math.sin(a) * r);
          triV(ctr, prev, cur);
          prev = cur;
        }
        continue;
      }
      const p00 = V(xs[i], ys[j]);
      const p10 = V(xs[i + 1], ys[j]);
      const p01 = V(xs[i], ys[j + 1]);
      const p11 = V(xs[i + 1], ys[j + 1]);
      triV(p00, p10, p11);
      triV(p00, p11, p01);
    }
  }
}

function mul(c: number[], k: number) {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** Triangle fan over a closed outline (convex), at height z. */
function fan(F: Fills, out: number[], z: number, col: number[], P: (x: number, y: number, z: number) => number[], alpha = 1) {
  let cx = 0;
  let cy = 0;
  const n = out.length / 2 - 1;
  for (let i = 0; i < n; i++) {
    cx += out[2 * i];
    cy += out[2 * i + 1];
  }
  cx /= n;
  cy /= n;
  const c = [col[0], col[1], col[2], (col[3] ?? 1) * alpha];
  const pc = P(cx, cy, z);
  for (let i = 0; i < n; i++) F.tri(pc, P(out[2 * i], out[2 * i + 1], z), P(out[2 * i + 2], out[2 * i + 3], z), c);
}

function walls(F: Fills, out: number[], z0: number, z1: number, col: number[], P: (x: number, y: number, z: number) => number[], alpha = 1) {
  const c = [col[0], col[1], col[2], (col[3] ?? 1) * alpha];
  for (let i = 2; i < out.length; i += 2) {
    const a0 = P(out[i - 2], out[i - 1], z0);
    const a1 = P(out[i - 2], out[i - 1], z1);
    const b0 = P(out[i], out[i + 1], z0);
    const b1 = P(out[i], out[i + 1], z1);
    F.tri(a0, b0, b1, c);
    F.tri(a0, b1, a1, c);
  }
}
