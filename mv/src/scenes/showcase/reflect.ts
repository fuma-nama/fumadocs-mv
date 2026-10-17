import * as THREE from 'three';
import type { Gfx } from '../../engine/gfx';

/**
 * Wet-street reflection: a mask scene (ground white, everything that occludes it black) and a
 * screen-space mirror of the lit frame across the horizon line, streaked vertically.
 */
export function buildMaskScene(ground: THREE.Mesh, occluders: THREE.Object3D[]) {
  const scene = new THREE.Scene();
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const g = new THREE.Mesh(ground.geometry, white);
  g.position.copy(ground.position);
  g.quaternion.copy(ground.quaternion);
  scene.add(g);
  for (const o of occluders) {
    if (o instanceof THREE.InstancedMesh) {
      const m = new THREE.InstancedMesh(o.geometry, black, o.count);
      m.instanceMatrix = o.instanceMatrix; // shared: follows the live poses
      m.frustumCulled = false;
      scene.add(m);
    } else if (o instanceof THREE.Mesh) {
      const m = new THREE.Mesh(o.geometry, black);
      m.position.copy(o.position);
      m.quaternion.copy(o.quaternion);
      m.scale.copy(o.scale);
      m.userData.src = o;
      scene.add(m);
    }
  }
  return scene;
}

/** Keep cloned plain meshes in sync with their sources (visibility). */
export function syncMask(scene: THREE.Scene) {
  for (const o of scene.children) {
    const src = o.userData.src as THREE.Object3D | undefined;
    if (src) o.visible = src.visible;
  }
}

const FRAG = /* glsl */ `
uniform sampler2D src; uniform sampler2D mask; uniform vec2 res; uniform vec2 hp; uniform vec2 nup; uniform float strength; uniform float t;
void main(){
  float m = texture(mask, vUv).r;
  if (m < 0.004) { outColor = vec4(0.0); return; }
  vec2 px = vUv * res;
  float d = dot(px - hp, nup);            // < 0 below the horizon
  if (d > -1.0) { outColor = vec4(0.0); return; }
  vec2 side = vec2(nup.y, -nup.x);
  // gentle ripple: horizontal wobble that grows toward the camera
  float wob = (sin(px.y * 0.13 + t * 2.1) + 0.6 * sin(px.y * 0.051 - t * 1.7)) * (0.6 + (-d) * 0.004);
  vec2 mir = px - 2.0 * d * nup + side * wob;
  float spread = 6.0 + (-d) * 0.35;
  vec4 acc = vec4(0.0); float ws = 0.0;
  for (int i = -7; i <= 7; i++) {
    float k = float(i) / 7.0;
    float w = 1.0 - abs(k) * 0.7;
    vec2 q = (mir + nup * k * spread) / res;
    if (q.y > 1.0 || q.y < 0.0 || q.x < 0.0 || q.x > 1.0) continue;
    acc += texture(src, q) * w; ws += w;
  }
  vec4 c = ws > 0.0 ? acc / ws : vec4(0.0);
  float fres = 0.35 + 0.65 * exp(d / (res.y * 0.22));  // stronger at grazing angles (near the horizon)
  outColor = vec4(c.rgb * strength * m * fres, 0.0);
}`;

export function reflectionPass(gfx: Gfx, src: THREE.Texture, mask: THREE.Texture, horizon: [number, number][], strength: number, t: number, key: string) {
  const W = gfx.W;
  const H = gfx.H;
  const [[x0, y0], [x1, y1]] = horizon;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  // screen (y down) up-normal → shader space (y up)
  const nx = dy / len;
  const ny = -dx / len;
  const out = gfx.rt(key);
  const m = gfx.material('showcase:reflect', FRAG, {
    src: { value: null },
    mask: { value: null },
    res: { value: new THREE.Vector2() },
    hp: { value: new THREE.Vector2() },
    nup: { value: new THREE.Vector2() },
    strength: { value: 0.4 },
    t: { value: 0 },
  });
  const u = m.uniforms;
  u.src.value = src;
  u.mask.value = mask;
  u.res.value.set(W, H);
  u.hp.value.set((x0 + x1) / 2, H - (y0 + y1) / 2);
  u.nup.value.set(nx, -ny);
  u.strength.value = strength;
  u.t.value = t;
  gfx.run(m, out, [0, 0, 0, 0]);
  return out.texture;
}
