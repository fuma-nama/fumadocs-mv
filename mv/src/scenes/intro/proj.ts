import type * as THREE from 'three';
import type { V3 } from './world';

/** World → screen through a three.js perspective camera (same matrices as the 3D render). */
export class Projector {
  private v = new Float64Array(16); // view (world → camera), column-major
  private p = new Float64Array(16); // projection
  near = 0.1;
  constructor(
    public W = 1920,
    public H = 1080,
  ) {}

  update(cam: THREE.PerspectiveCamera) {
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    this.v.set(cam.matrixWorldInverse.elements);
    this.p.set(cam.projectionMatrix.elements);
    this.near = cam.near;
  }

  /** camera-space point (z < 0 in front) */
  view(x: number, y: number, z: number): V3 {
    const m = this.v;
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  }

  /** camera-space → screen px [x, y]; caller ensures z < −near */
  screen(vx: number, vy: number, vz: number): [number, number] {
    const p = this.p;
    const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12];
    const cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13];
    const cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15];
    return [((cx / cw + 1) / 2) * this.W, ((1 - cy / cw) / 2) * this.H];
  }

  /** world → { x, y, d (distance along the view axis), ok } */
  project(x: number, y: number, z: number) {
    const [vx, vy, vz] = this.view(x, y, z);
    const d = -vz;
    if (d <= this.near) return { x: 0, y: 0, d, ok: false };
    const [sx, sy] = this.screen(vx, vy, vz);
    return { x: sx, y: sy, d, ok: true };
  }

  /** Pixels per world unit at depth d (for sizing). */
  scaleAt(d: number) {
    return (this.p[5] * this.H) / 2 / d;
  }

  /** Add a world polyline to the current canvas path, clipped against the near plane. */
  pathPolyline(c: CanvasRenderingContext2D, pts: V3[], closed = false) {
    const nearZ = -(this.near + 0.02);
    let prev: V3 | null = null;
    let pen = false;
    const n = pts.length + (closed ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const w = pts[i % pts.length];
      const cur = this.view(w[0], w[1], w[2]);
      if (prev) {
        let a = prev;
        let b = cur;
        const ina = a[2] < nearZ;
        const inb = b[2] < nearZ;
        if (!ina && !inb) {
          pen = false;
        } else {
          if (!ina || !inb) {
            const k = (nearZ - a[2]) / (b[2] - a[2]);
            const m: V3 = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, nearZ];
            if (!ina) a = m;
            else b = m;
          }
          const sa = this.screen(a[0], a[1], a[2]);
          const sb = this.screen(b[0], b[1], b[2]);
          if (!pen || !ina) c.moveTo(sa[0], sa[1]);
          c.lineTo(sb[0], sb[1]);
          pen = inb;
        }
      }
      prev = cur;
    }
  }

  /**
   * Canvas transform for a glyph lying on the floor at p: local +x → world dir `tx`, local −y
   * (glyph up) → world dir `ux`; `size` world units per `F` local px. Returns false if behind.
   */
  floorTransform(c: CanvasRenderingContext2D, p: V3, tx: V3, ux: V3, size: number, F: number): boolean {
    const a = this.project(p[0], p[1], p[2]);
    const b = this.project(p[0] + tx[0] * size, p[1] + tx[1] * size, p[2] + tx[2] * size);
    const u = this.project(p[0] + ux[0] * size, p[1] + ux[1] * size, p[2] + ux[2] * size);
    if (!a.ok || !b.ok || !u.ok) return false;
    // reject glyphs grazing the camera (extreme magnification) or far off-screen
    const m = 400;
    for (const q of [a, b, u]) if (q.d < 0.6 || q.x < -m || q.x > this.W + m || q.y < -m || q.y > this.H + m) return false;
    if (Math.hypot(b.x - a.x, b.y - a.y) > 300 || Math.hypot(u.x - a.x, u.y - a.y) > 300) return false;
    c.setTransform((b.x - a.x) / F, (b.y - a.y) / F, (a.x - u.x) / F, (a.y - u.y) / F, a.x, a.y);
    return true;
  }
}
