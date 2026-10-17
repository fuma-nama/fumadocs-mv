import * as THREE from 'three';
import type { Gfx } from '../../engine/gfx';
import { apply } from './cam';

const toM3 = (m: DOMMatrix, out: THREE.Matrix3) => out.set(m.a, m.c, m.e, m.b, m.d, m.f, 0, 0, 1);

/**
 * Camera motion blur for the 2D world: each pixel is smeared along the screen path its world
 * point travels during the shutter interval (centred on the frame), given world→screen
 * matrices at the shutter start/end and now.
 */
export function camBlur(g: Gfx, src: THREE.Texture, m0: DOMMatrix, m1: DOMMatrix, m: DOMMatrix, key: string): THREE.Texture {
  const inv = m.inverse();
  const d0 = m0.multiply(inv);
  const d1 = m1.multiply(inv);
  // skip when the max displacement over the frame corners is tiny
  let maxd = 0;
  for (const [x, y] of [[0, 0], [1920, 0], [0, 1080], [1920, 1080], [960, 540]]) {
    const [ax, ay] = apply(d0, x, y);
    const [bx, by] = apply(d1, x, y);
    maxd = Math.max(maxd, Math.hypot(bx - ax, by - ay));
  }
  if (maxd < 0.75) return src;
  const out = g.rt(key);
  const mat = g.material('integrations:camblur', `
    uniform sampler2D tex; uniform mat3 D0; uniform mat3 D1; uniform vec2 res; uniform int n;
    void main(){
      vec2 p = vec2(vUv.x * res.x, (1.0 - vUv.y) * res.y);
      vec2 a = (D0 * vec3(p, 1.0)).xy;
      vec2 b = (D1 * vec3(p, 1.0)).xy;
      vec4 acc = vec4(0.0);
      for (int i = 0; i < 32; i++) {
        if (i >= n) break;
        float k = (float(i) + 0.5) / float(n);
        vec2 s = mix(a, b, k);
        // sample the source where this world point sits now: p + (p - s) maps back
        vec2 q = 2.0 * p - s;
        acc += texture(tex, vec2(q.x / res.x, 1.0 - q.y / res.y));
      }
      outColor = acc / float(n);
    }`, { tex: { value: null }, D0: { value: new THREE.Matrix3() }, D1: { value: new THREE.Matrix3() }, res: { value: new THREE.Vector2() }, n: { value: 8 } });
  mat.uniforms.tex.value = src;
  toM3(d0, mat.uniforms.D0.value);
  toM3(d1, mat.uniforms.D1.value);
  mat.uniforms.res.value.set(1920, 1080);
  mat.uniforms.n.value = Math.max(4, Math.min(32, Math.ceil(maxd / 3)));
  g.run(mat, out);
  return out.texture;
}

/** Source-side dither: triangular noise (±1.5/255) so large flat-colour gradients don't band in 8-bit. */
export function dither(g: Gfx, src: THREE.Texture, frame: number, key: string): THREE.Texture {
  const out = g.rt(key);
  const mat = g.material('integrations:dither', `
    uniform sampler2D tex; uniform vec2 res; uniform float seed;
    void main(){
      vec4 c = texture(tex, vUv);
      vec2 p = vUv * res;
      float n = hash12(p + seed) + hash12(p * 1.37 + seed * 1.91) - 1.0;
      c.rgb += n * (1.5 / 255.0) * c.a;
      outColor = c;
    }`, { tex: { value: null }, res: { value: new THREE.Vector2() }, seed: { value: 0 } });
  mat.uniforms.tex.value = src;
  mat.uniforms.res.value.set(1920, 1080);
  mat.uniforms.seed.value = (frame % 97) * 17.31;
  g.run(mat, out);
  return out.texture;
}
