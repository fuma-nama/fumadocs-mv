import * as THREE from 'three';
import type { Gfx } from '../../engine/gfx';

/**
 * Anti-banding helpers. Gradients must be dithered *before* they are quantized to 8 bits, so the
 * glows are computed analytically in float and dithered in the same pass.
 */

/** GLSL: triangular noise in [-1, 1] from a pixel coordinate (static per pixel). */
export const TRI_NOISE = /* glsl */ `
  float triNoise(vec2 p){
    float a = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    float b = fract(sin(dot(p + 17.17, vec2(39.3468, 11.135))) * 24634.6345);
    return a + b - 1.0;
  }`;

/** Add ±amount LSB of triangular noise to an 8-bit texture (breaks banding contours). */
export function ditherTex(g: Gfx, src: THREE.Texture, key: string, amount = 1.5): THREE.Texture {
  const out = g.rt(key);
  const m = g.material(
    'toc:dither',
    `${TRI_NOISE}
    uniform sampler2D tex; uniform vec2 res; uniform float amt;
    void main(){
      vec4 c = texture(tex, vUv);
      float n = triNoise(vUv * res) * amt / 255.0;
      outColor = vec4(clamp(c.rgb + n * c.a, 0.0, 1.0), c.a);
    }`,
    { tex: { value: null }, res: { value: new THREE.Vector2() }, amt: { value: 1.5 } },
  );
  m.uniforms.tex.value = src;
  m.uniforms.res.value.set(out.width, out.height);
  m.uniforms.amt.value = amount;
  g.run(m, out);
  return out.texture;
}

export interface ArcGlow {
  /** circle centre and radius (px, canvas coordinates, y down) */
  cx: number;
  cy: number;
  r: number;
  /** progress 0..1 from 12 o'clock clockwise */
  p: number;
  /** the guide (px) */
  dx: number;
  dy: number;
  /** overall strength */
  k: number;
}

/**
 * The magic circle's glow, analytic: a gaussian of the distance to the progress arc (round caps)
 * plus a warmer halo around the guide, computed in float and dithered before the 8-bit write.
 */
export function arcGlow(g: Gfx, o: ArcGlow, key: string): THREE.Texture {
  const out = g.rt(key);
  const m = g.material(
    'toc:arcglow',
    `${TRI_NOISE}
    uniform vec2 res; uniform vec2 ctr; uniform float R; uniform float prog; uniform vec2 dot; uniform float k;
    uniform vec3 orange; uniform vec3 warm;
    const float PI = 3.14159265;
    void main(){
      vec2 p = vec2(vUv.x * res.x, (1.0 - vUv.y) * res.y); // canvas px, y down
      vec2 v = p - ctr;
      float ang = atan(v.y, v.x);
      float rel = mod(ang + PI * 0.5, 2.0 * PI);
      float span = 2.0 * PI * clamp(prog, 0.0, 1.0);
      float d;
      if (rel <= span) d = abs(length(v) - R);
      else {
        vec2 s = ctr + R * vec2(0.0, -1.0);
        vec2 e = ctr + R * vec2(cos(-PI * 0.5 + span), sin(-PI * 0.5 + span));
        d = min(length(p - s), length(p - e));
      }
      float ga = 0.62 * exp(-(d * d) / (7.0 * 7.0)) + 0.26 * exp(-(d * d) / (24.0 * 24.0));
      float dd = length(p - dot);
      float gd = 0.55 * exp(-(dd * dd) / (13.0 * 13.0)) + 0.2 * exp(-(dd * dd) / (36.0 * 36.0));
      vec3 col = (orange * ga + warm * gd) * k;
      col += triNoise(gl_FragCoord.xy) * 1.2 / 255.0;
      col = clamp(col, 0.0, 1.0);
      outColor = vec4(col, max(col.r, max(col.g, col.b)));
    }`,
    {
      res: { value: new THREE.Vector2() },
      ctr: { value: new THREE.Vector2() },
      R: { value: 300 },
      prog: { value: 0 },
      dot: { value: new THREE.Vector2() },
      k: { value: 1 },
      orange: { value: new THREE.Vector3(250 / 255, 128 / 255, 35 / 255) },
      warm: { value: new THREE.Vector3(1, 176 / 255, 112 / 255) },
    },
  );
  const u = m.uniforms;
  u.res.value.set(out.width, out.height);
  u.ctr.value.set(o.cx, o.cy);
  u.R.value = o.r;
  u.prog.value = o.p;
  u.dot.value.set(o.dx, o.dy);
  u.k.value = o.k;
  g.run(m, out);
  return out.texture;
}

/** A soft, dithered pool of light (screen px, y down) — computed in float, no 8-bit contours. */
export function spotLight(g: Gfx, o: { x: number; y: number; rx: number; ry: number; color: [number, number, number]; k: number }, key: string): THREE.Texture {
  const out = g.rt(key);
  const m = g.material(
    'toc:spot',
    `${TRI_NOISE}
    uniform vec2 res; uniform vec2 ctr; uniform vec2 rad; uniform vec3 col; uniform float k;
    void main(){
      vec2 p = vec2(vUv.x * res.x, (1.0 - vUv.y) * res.y);
      vec2 q = (p - ctr) / rad;
      float a = exp(-dot(q, q) * 1.6) * k;
      vec3 c = col * a + triNoise(gl_FragCoord.xy) * 1.2 / 255.0 * step(0.0005, a);
      outColor = vec4(max(c, 0.0), 1.0);
    }`,
    { res: { value: new THREE.Vector2() }, ctr: { value: new THREE.Vector2() }, rad: { value: new THREE.Vector2() }, col: { value: new THREE.Vector3() }, k: { value: 0 } },
  );
  const u = m.uniforms;
  u.res.value.set(out.width, out.height);
  u.ctr.value.set(o.x, o.y);
  u.rad.value.set(o.rx, o.ry);
  u.col.value.set(...o.color);
  u.k.value = o.k;
  g.run(m, out);
  return out.texture;
}
