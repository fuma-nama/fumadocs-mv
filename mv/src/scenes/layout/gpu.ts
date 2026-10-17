import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

const warned = new Set<string>();
function overflow(kind: string, cap: number) {
  const k = kind + cap;
  if (warned.has(k)) return;
  warned.add(k);
  console.warn(`[layout] ${kind} buffer full (cap ${cap}) — geometry dropped`);
}

/** Linear RGB of a CSS colour (three.js colour management converts sRGB → linear). */
export function lin(css: string): [number, number, number] {
  const c = new THREE.Color(css);
  return [c.r, c.g, c.b];
}

/**
 * Fixed-capacity fat line segments (LineSegments2). Colours are linear RGB, written opaque
 * (dimmer = darker colour), so joints of polylines never double up.
 */
export class FatLines {
  readonly obj: LineSegments2;
  readonly mat: LineMaterial;
  private pos: Float32Array;
  private col: Float32Array;
  private posBuf: THREE.InstancedInterleavedBuffer;
  private colBuf: THREE.InstancedInterleavedBuffer;
  private geo: LineSegmentsGeometry;
  n = 0;

  constructor(readonly cap: number, o: { worldUnits?: boolean; width?: number } = {}) {
    this.pos = new Float32Array(cap * 6);
    this.col = new Float32Array(cap * 6);
    this.geo = new LineSegmentsGeometry();
    this.posBuf = new THREE.InstancedInterleavedBuffer(this.pos, 6, 1);
    this.posBuf.setUsage(THREE.DynamicDrawUsage);
    this.colBuf = new THREE.InstancedInterleavedBuffer(this.col, 6, 1);
    this.colBuf.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(this.posBuf, 3, 0));
    this.geo.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(this.posBuf, 3, 3));
    this.geo.setAttribute('instanceColorStart', new THREE.InterleavedBufferAttribute(this.colBuf, 3, 0));
    this.geo.setAttribute('instanceColorEnd', new THREE.InterleavedBufferAttribute(this.colBuf, 3, 3));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.geo.boundingBox = new THREE.Box3(new THREE.Vector3(-1e9, -1e9, -1e9), new THREE.Vector3(1e9, 1e9, 1e9));
    this.mat = new LineMaterial({ vertexColors: true, worldUnits: o.worldUnits ?? false, linewidth: o.width ?? 2 });
    this.mat.side = THREE.DoubleSide; // mirrored (reflection) passes flip the winding
    this.obj = new LineSegments2(this.geo, this.mat);
    this.obj.frustumCulled = false;
  }

  reset() {
    this.n = 0;
  }

  seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number, c0: readonly number[], c1: readonly number[] = c0) {
    if (this.n >= this.cap) {
      overflow('lines', this.cap);
      return;
    }
    const i = this.n * 6;
    const p = this.pos;
    p[i] = ax; p[i + 1] = ay; p[i + 2] = az; p[i + 3] = bx; p[i + 4] = by; p[i + 5] = bz;
    const c = this.col;
    c[i] = c0[0]; c[i + 1] = c0[1]; c[i + 2] = c0[2]; c[i + 3] = c1[0]; c[i + 4] = c1[1]; c[i + 5] = c1[2];
    this.n++;
  }

  /** Upload; width in output px (× supersampling), resolution = render size. */
  commit(width: number, resW: number, resH: number) {
    this.posBuf.needsUpdate = true;
    this.colBuf.needsUpdate = true;
    this.posBuf.updateRanges.length = 0;
    this.colBuf.updateRanges.length = 0;
    this.posBuf.addUpdateRange(0, Math.max(6, this.n * 6));
    this.colBuf.addUpdateRange(0, Math.max(6, this.n * 6));
    this.geo.instanceCount = this.n;
    this.obj.visible = this.n > 0;
    // screen-space LineMaterial renders 2 × linewidth px wide (measured against a canvas stroke)
    this.mat.linewidth = this.mat.worldUnits ? width : width / 2;
    this.mat.resolution.set(resW, resH);
  }
}

/** Fixed-capacity triangle soup with RGBA vertex colours (linear, straight alpha). */
export class Fills {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.MeshBasicMaterial;
  private pos: Float32Array;
  private col: Float32Array;
  private geo: THREE.BufferGeometry;
  private pa: THREE.BufferAttribute;
  private ca: THREE.BufferAttribute;
  n = 0; // vertices

  constructor(readonly cap: number, o: { transparent?: boolean } = {}) {
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.geo = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.pos, 3);
    this.pa.setUsage(THREE.DynamicDrawUsage);
    this.ca = new THREE.BufferAttribute(this.col, 4);
    this.ca.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pa);
    this.geo.setAttribute('color', this.ca);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: !!o.transparent,
      depthWrite: !o.transparent,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
  }

  reset() {
    this.n = 0;
  }

  tri(a: readonly number[], b: readonly number[], c: readonly number[], col: readonly number[]) {
    if (this.n + 3 > this.cap) {
      overflow('fills', this.cap);
      return;
    }
    for (const v of [a, b, c]) {
      const i = this.n * 3;
      this.pos[i] = v[0]; this.pos[i + 1] = v[1]; this.pos[i + 2] = v[2];
      const j = this.n * 4;
      this.col[j] = col[0]; this.col[j + 1] = col[1]; this.col[j + 2] = col[2]; this.col[j + 3] = col[3] ?? 1;
      this.n++;
    }
  }

  /** Triangle with per-vertex RGBA colours. */
  triC(a: readonly number[], b: readonly number[], c: readonly number[], ca: readonly number[], cb: readonly number[], cc: readonly number[]) {
    if (this.n + 3 > this.cap) {
      overflow('fills', this.cap);
      return;
    }
    const vs = [a, b, c];
    const cs = [ca, cb, cc];
    for (let k = 0; k < 3; k++) {
      const v = vs[k];
      const col = cs[k];
      const i = this.n * 3;
      this.pos[i] = v[0]; this.pos[i + 1] = v[1]; this.pos[i + 2] = v[2];
      const j = this.n * 4;
      this.col[j] = col[0]; this.col[j + 1] = col[1]; this.col[j + 2] = col[2]; this.col[j + 3] = col[3] ?? 1;
      this.n++;
    }
  }

  commit() {
    this.pa.needsUpdate = true;
    this.ca.needsUpdate = true;
    this.pa.clearUpdateRanges();
    this.ca.clearUpdateRanges();
    this.pa.addUpdateRange(0, Math.max(3, this.n * 3));
    this.ca.addUpdateRange(0, Math.max(4, this.n * 4));
    this.geo.setDrawRange(0, this.n);
    this.mesh.visible = this.n > 0;
  }
}
