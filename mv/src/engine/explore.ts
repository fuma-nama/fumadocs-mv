import * as THREE from 'three';
import type { Render3DOpts } from './three-kit';

export interface Seen {
  scene: THREE.Scene;
  camera: THREE.Camera;
  layers: number;
  /** render3D's key, which names the layer ('intro:refl', 'showcase:city') */
  key: string;
}

/**
 * Viewer modes of the web page. render3D applies them around its passes and undoes them right
 * after, so nothing reaches later code; off (the default), it only counts its calls.
 *
 * The free camera rides on the director cameras of the shot, each in its own local frame (so the
 * director's roll stays) and in units of its own pivot distance (so a city and a small machine turn
 * alike): the pivot `target`, `yaw`/`pitch` about it, then `dist` back along the view axis.
 */
export const explore = {
  /** render3D calls since the page zeroed it: 0 after a frame means a pure 2D shot */
  calls: 0,
  /** `calls` of the last whole frame, set by the page: the readers' count, steady while the next frame renders */
  drawn: 0,
  /** while the page records them, the frame's 3D renders are its first entries (reused) */
  seen: null as Seen[] | null,
  /** the cameras the free camera rides on, with their unit: the pivot distance when they joined */
  cams: new Map<THREE.Camera, number>(),
  target: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  dist: 0,
  /** orthographic cameras zoom instead of moving */
  zoom: 1,
  xray: false,
};

const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const rot = new THREE.Quaternion();
const v = new THREE.Vector3();
const saved = { p: new THREE.Vector3(), q: new THREE.Quaternion(), zoom: 1, proj: new THREE.Matrix4(), inv: new THREE.Matrix4() };
let posed: THREE.Camera | null = null;
const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
const hidden: THREE.Object3D[] = [];

// x-ray draws every surface that shows as orange wire; scene shaders keep their vertex stage, so
// displaced and instanced geometry stays where it draws
let wire: THREE.Material | undefined;
const wires = new WeakMap<THREE.Material, THREE.Material>();
function wireOf(m: THREE.Material) {
  const s = m as THREE.ShaderMaterial;
  if (!m.visible || (m.transparent && m.opacity < 0.01)) return m;
  if (!s.isShaderMaterial) return (wire ??= new THREE.MeshBasicMaterial({ color: 0xfa8023, wireframe: true }));
  let w = wires.get(m);
  if (!w) {
    w = new THREE.ShaderMaterial({ vertexShader: s.vertexShader, fragmentShader: 'void main(){ gl_FragColor = vec4(0.955, 0.216, 0.017, 1.0); }', uniforms: s.uniforms, defines: s.defines, wireframe: true });
    wires.set(m, w);
  }
  return w;
}

const ortho = (c: THREE.Camera): c is THREE.OrthographicCamera => (c as THREE.OrthographicCamera).isOrthographicCamera;
const orbitRot = () => rot.setFromEuler(euler.set(explore.pitch, explore.yaw, 0));

function pose(c: THREE.Camera) {
  const unit = explore.cams.get(c);
  if (unit === undefined) return;
  posed = c;
  saved.p.copy(c.position);
  saved.q.copy(c.quaternion);
  orbitRot();
  c.position.add(v.set(0, 0, explore.dist).applyQuaternion(rot).add(explore.target).multiplyScalar(unit).applyQuaternion(c.quaternion));
  c.quaternion.multiply(rot);
  if (ortho(c)) {
    saved.zoom = c.zoom;
    saved.proj.copy(c.projectionMatrix);
    saved.inv.copy(c.projectionMatrixInverse);
    c.zoom *= explore.zoom;
    c.updateProjectionMatrix();
  }
  c.updateMatrixWorld();
}

function unpose() {
  const c = posed!;
  posed = null;
  c.position.copy(saved.p);
  c.quaternion.copy(saved.q);
  if (ortho(c)) {
    c.zoom = saved.zoom;
    c.projectionMatrix.copy(saved.proj);
    c.projectionMatrixInverse.copy(saved.inv);
  }
  // what the render would have left: matrices of the director's pose
  c.updateMatrixWorld();
}

/** render3D, before its passes. */
export function enter(scene: THREE.Scene, camera: THREE.Camera, o: Render3DOpts) {
  const seen = explore.seen;
  if (seen) {
    const s = (seen[explore.calls] ??= { scene, camera, layers: 0, key: '' });
    s.scene = scene;
    s.camera = camera;
    s.layers = camera.layers.mask;
    s.key = o.key;
  }
  explore.calls++;
  pose(camera);
  // an opaque clear marks a mask or a glow source, not a picture: x-ray leaves those solid
  if (explore.xray && !o.clear)
    scene.traverseVisible((ob) => {
      const mesh = ob as THREE.Mesh;
      if (mesh.isMesh) {
        swapped.push([mesh, mesh.material]);
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(wireOf) : wireOf(mesh.material);
      } else if ((ob as THREE.Points).isPoints || (ob as THREE.Sprite).isSprite) {
        ob.visible = false;
        hidden.push(ob);
      }
    });
}

/** render3D, after its passes. */
export function leave() {
  if (posed) unpose();
  for (const [mesh, m] of swapped) mesh.material = m;
  for (const ob of hidden) ob.visible = true;
  swapped.length = hidden.length = 0;
}

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hits: THREE.Intersection[] = [];

/** The nearest solid surface under NDC (x, y) in one 3D render of the last frame, as it was on screen. */
function cast(s: Seen, x: number, y: number) {
  pose(s.camera);
  ray.setFromCamera(ndc.set(x, y), s.camera);
  if (posed) unpose();
  ray.layers.mask = s.layers;
  hits.length = 0;
  s.scene.traverseVisible((ob) => {
    const mesh = ob as THREE.Mesh;
    const m = mesh.material;
    // depth-less materials are glows, shadows and beams: their CPU geometry isn't where they draw
    if (mesh.isMesh && ob.layers.test(ray.layers) && (Array.isArray(m) || (m.visible && m.depthWrite))) mesh.raycast(ray, hits);
  });
  let best: THREE.Intersection | undefined;
  for (const h of hits) if (!best || h.distance < best.distance) best = h;
  return best;
}

/** The object under NDC (x, y): the hit in the top-most 3D render of the last frame (later renders are composed over earlier ones). */
export function pick(x: number, y: number) {
  const seen = explore.seen;
  for (let i = explore.drawn - 1; seen && i >= 0; i--) {
    const hit = cast(seen[i], x, y);
    if (hit) return { object: hit.object, instance: hit.instanceId };
  }
  return null;
}

const local = new THREE.Box3();
const m4 = new THREE.Matrix4();
const inst = new THREE.Matrix4();
const boxes = new WeakMap<THREE.BufferGeometry, { version: number; box: THREE.Box3 }>();

/** An object's (or one instance's) box in its own space, and the matrix to the world. */
function measure(ob: THREE.Object3D, instance: number | undefined) {
  const g = (ob as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
  const p = g?.attributes.position as THREE.BufferAttribute | undefined;
  if (!g || !p) return null;
  m4.copy(ob.matrixWorld);
  const many = (ob as THREE.InstancedMesh).isInstancedMesh;
  if (many && instance !== undefined) m4.multiply((ob as THREE.InstancedMesh).getMatrixAt(instance, inst));
  // all of an instanced mesh, and instanced line geometry, only have their bounding sphere
  if ((many && instance === undefined) || (g as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) {
    const s = many && instance === undefined ? (ob as THREE.InstancedMesh).boundingSphere : g.boundingSphere;
    return s && local.setFromCenterAndSize(s.center, v.setScalar(s.radius * 2));
  }
  let c = boxes.get(g);
  if (!c) boxes.set(g, (c = { version: -1, box: new THREE.Box3() }));
  if (c.version !== p.version) {
    c.box.setFromBufferAttribute(p);
    c.version = p.version;
  }
  return c.box;
}

/** World bounds of an object, or one instance of it, where the last frame drew it. */
export function boundsOf(ob: THREE.Object3D, instance: number | undefined, out: THREE.Box3) {
  const b = measure(ob, instance);
  return !!b && !out.copy(b).applyMatrix4(m4).isEmpty();
}

/** Its rect on screen in NDC [x0, y0, x1, y1] as the last frame showed it; false when that frame didn't draw its scene or it leaves the depth range. */
export function rectOf(ob: THREE.Object3D, instance: number | undefined, out: number[]) {
  let root = ob;
  while (root.parent) root = root.parent;
  const seen = explore.seen;
  let s: Seen | undefined;
  for (let i = 0; seen && i < explore.drawn && !s; i++) if (seen[i].scene === root) s = seen[i];
  const b = s && measure(ob, instance);
  if (!s || !b) return false;
  pose(s.camera);
  out[0] = out[1] = 1;
  out[2] = out[3] = -1;
  let ok = true;
  for (let k = 0; k < 8 && ok; k++) {
    v.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).applyMatrix4(m4).project(s.camera);
    ok = Math.abs(v.z) <= 1;
    out[0] = Math.min(out[0], v.x);
    out[1] = Math.min(out[1], v.y);
    out[2] = Math.max(out[2], v.x);
    out[3] = Math.max(out[3], v.y);
  }
  if (posed) unpose();
  return ok;
}

export function reset() {
  explore.cams.clear();
  explore.target.set(0, 0, 0);
  explore.yaw = explore.pitch = explore.dist = 0;
  explore.zoom = 1;
}

function retarget(d: number) {
  explore.target.add(v.set(0, 0, explore.dist - d).applyQuaternion(orbitRot()));
  explore.dist = d;
}

/**
 * Called when a gesture starts: moves the pivot along the view axis to the surface at the centre
 * of the screen, which keeps the view. A shot with none of the cameras ridden so far starts afresh.
 * Returns false on a pure 2D frame.
 */
export function grab(): boolean {
  const { seen, cams, drawn } = explore;
  if (!seen || !drawn) return false;
  let known = false;
  for (let i = 0; i < drawn; i++) known ||= cams.has(seen[i].camera);
  if (!known) reset();
  const fresh = !cams.size;
  const joined = new Map<THREE.Camera, number>();
  let d = 0;
  for (let i = 0; i < drawn; i++) {
    const s = seen[i];
    const h = cast(s, 0, 0)?.distance ?? Infinity;
    const unit = cams.get(s.camera);
    if (unit === undefined) joined.set(s.camera, Math.min(joined.get(s.camera) ?? Infinity, h));
    else if (!d && h < Infinity) d = h / unit;
  }
  for (const [c, h] of joined) {
    // nothing under the centre: the world origin when it's ahead, else the middle of the depth range
    const p = c as THREE.PerspectiveCamera;
    const o = -v.set(0, 0, 0).applyMatrix4(c.matrixWorldInverse).z;
    cams.set(c, h < Infinity ? h : o > Math.max(p.near, 0) ? o : Math.sqrt(Math.abs(p.near * p.far)) || 1);
  }
  if (fresh || d) retarget(d || 1);
  return true;
}

/** Orbits about the pivot by screen-space angles (rad). */
export function orbit(dx: number, dy: number) {
  explore.yaw -= dx;
  explore.pitch = Math.max(-1.5, Math.min(1.5, explore.pitch - dy));
}

/** Moves toward the pivot (k < 1) or away from it; limits follow the first camera ridden. */
export function dolly(k: number) {
  const [c, unit] = explore.cams.entries().next().value ?? [];
  if (!c) return;
  if (ortho(c)) explore.zoom = Math.max(0.1, Math.min(20, explore.zoom / k));
  else explore.dist = Math.max((2 * (c as THREE.PerspectiveCamera).near) / unit!, Math.min((c as THREE.PerspectiveCamera).far / 2 / unit!, explore.dist * k));
}

/** Pans by a screen delta in px on a view `h` px tall, so the pivot follows the pointer. */
export function pan(dx: number, dy: number, h: number) {
  const [c, unit] = explore.cams.entries().next().value ?? [];
  if (!c) return;
  const k = ortho(c) ? (c.top - c.bottom) / (c.zoom * explore.zoom * h * unit!) : (2 * explore.dist * Math.tan(THREE.MathUtils.degToRad((c as THREE.PerspectiveCamera).getEffectiveFOV()) / 2)) / h;
  explore.target.add(v.set(-dx * k, dy * k, 0).applyQuaternion(orbitRot()));
}
