import * as THREE from 'three';
import type { Gfx } from '../../engine/gfx';
import { render3D, toonMat } from '../../engine/three-kit';
import { hash } from '../../engine/anim';

const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(-960, 960, 540, -540, -4000, 4000);
cam.position.set(0, 0, 1000);
cam.lookAt(0, 0, 0);

let crystal: THREE.Mesh;
const shards: { m: THREE.Mesh; dir: THREE.Vector3; spin: THREE.Vector3 }[] = [];
let built = false;

/** A generic faceted crystal: irregular hexagonal bipyramid (not any product logo). */
function crystalGeometry() {
  const top = new THREE.Vector3(0.04, 1.32, 0.02);
  const bot = new THREE.Vector3(-0.03, -0.92, 0);
  const ring: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    const r = 0.56 + 0.1 * Math.sin(i * 2.3);
    ring.push(new THREE.Vector3(Math.cos(a) * r, 0.12 + 0.12 * Math.sin(i * 1.7), Math.sin(a) * r));
  }
  const pos: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = ring[i], b = ring[(i + 1) % 6];
    pos.push(...top.toArray(), ...b.toArray(), ...a.toArray());
    pos.push(...bot.toArray(), ...a.toArray(), ...b.toArray());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function build() {
  built = true;
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-1.2, 1.6, 1.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xb79cff, 2.2);
  rim.position.set(1.5, -0.4, -0.6);
  scene.add(rim);
  crystal = new THREE.Mesh(crystalGeometry(), toonMat('#2B1766', { steps: 4, emissive: '#000000' }));
  scene.add(crystal);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05 + hash(i, 1) * 0.07), toonMat('#6A45F0', { steps: 3 }));
    const a = (i / 16) * Math.PI * 2 + hash(i, 2) * 0.4;
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a) * 1.3, (hash(i, 4) - 0.5) * 0.6).normalize();
    shards.push({ m, dir, spin: new THREE.Vector3(hash(i, 5) * 9, hash(i, 6) * 9, hash(i, 7) * 9) });
    scene.add(m);
  }
}

export interface CrystalState {
  /** screen position of the crystal's centre */
  x: number;
  y: number;
  /** px per crystal unit (≈ half height) */
  size: number;
  /** screen roll of the station frame (rad, canvas convention) */
  roll: number;
  spin: number;
  tilt: number;
  /** emissive charge 0..1 */
  glow: number;
  /** eruption shards 0..1 (0 = none) */
  burst: number;
  /** edge opacity */
  edge: number;
  /** white facet flash 0..1 */
  flash?: number;
}

export function renderCrystal(g: Gfx, st: CrystalState): THREE.Texture {
  if (!built) build();
  crystal.position.set(st.x - 960, 540 - st.y, 0);
  crystal.scale.setScalar(st.size);
  crystal.rotation.set(st.tilt, st.spin, 0);
  // roll the whole object with the station frame (canvas y-down → three y-up flips the sign)
  crystal.rotation.z = 0;
  crystal.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -st.roll));
  const mat = crystal.material as THREE.MeshToonMaterial;
  const fl = st.flash ?? 0;
  mat.emissive.setRGB(0.55 * st.glow + 0.9 * fl, 0.22 * st.glow + 0.85 * fl, 0.85 * st.glow + 0.95 * fl);
  for (let i = 0; i < shards.length; i++) {
    const s = shards[i];
    const b = st.burst;
    s.m.visible = b > 0 && b < 1;
    if (!s.m.visible) continue;
    // from the crystal's outline outward, decelerating; shrink away
    const d = 0.75 + (0.9 + hash(i, 9) * 1.6) * (1 - (1 - b) ** 3);
    const p = new THREE.Vector3().copy(s.dir).multiplyScalar(d * st.size);
    p.y -= 0.5 * st.size * b * b;
    p.applyAxisAngle(new THREE.Vector3(0, 0, 1), -st.roll);
    s.m.position.set(st.x - 960 + p.x, 540 - st.y + p.y, 160);
    s.m.scale.setScalar(st.size * (1 - b) * 0.9);
    s.m.rotation.set(s.spin.x * b, s.spin.y * b, s.spin.z * b);
  }
  return render3D(g, scene, cam, { key: 'integrations:crystal', ss: 2, edges: { color: '#CDBBFF', width: 2.2, opacity: st.edge } });
}
