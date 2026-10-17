import * as THREE from 'three';
import { C } from './palette';

/**
 * The Fumadocs logo "moon": a circle filled with a 45° linear gradient from the background
 * colour (at 45 %) to the primary colour (at 100 %), with a 1 px primary rim
 * (apps/docs/app/layout.client.tsx — FumadocsIcon). Use this everywhere the moon/dot appears.
 */
export function drawMoon(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  o: { bg?: string; primary?: string; rim?: number; rimColor?: string; angle?: number; alpha?: number } = {},
) {
  const bg = o.bg ?? C.INK;
  const primary = o.primary ?? C.ORANGE;
  const a = o.angle ?? Math.PI / 4;
  // SVG semantics: objectBoundingBox gradient (0,0)→(1,0) rotated 45° about the bbox's top-left
  // corner, i.e. from (x−r, y−r) along `a` for 2r; stops bg 0–45 %, primary 100 %, padded.
  const k = 2 * r;
  c.save();
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  const g = c.createLinearGradient(x - r, y - r, x - r + Math.cos(a) * k, y - r + Math.sin(a) * k);
  g.addColorStop(0, bg);
  g.addColorStop(0.45, bg);
  g.addColorStop(1, primary);
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = g;
  c.fill();
  const rim = o.rim ?? Math.max(1, r / 89);
  if (rim > 0) {
    c.lineWidth = rim;
    c.strokeStyle = o.rimColor ?? primary;
    c.stroke();
  }
  c.restore();
}

/** Solid orange dot (the TOC indicator / cursor form of the moon). */
export function drawDot(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string = C.ORANGE, glow = 0) {
  c.save();
  if (glow > 0) {
    c.shadowColor = color;
    c.shadowBlur = glow;
  }
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
  c.restore();
}

/**
 * 3D moon material: unlit sphere shaded with the logo gradient in view space
 * (bg → primary along the screen diagonal) plus a thin fresnel rim in the primary colour.
 */
export function moonMaterial(o: { bg?: string; primary?: string; rim?: number } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      bg: { value: new THREE.Color(o.bg ?? C.INK) },
      primary: { value: new THREE.Color(o.primary ?? C.ORANGE) },
      rim: { value: o.rim ?? 0.025 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 bg; uniform vec3 primary; uniform float rim;
      varying vec3 vN; varying vec3 vV;
      vec3 enc(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
      vec3 dec(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
      void main(){
        // signed position along the top-left → bottom-right diagonal of the disc, in units of r
        float s = (vN.x - vN.y) * 0.70710678;
        float k = clamp((0.70710678 + 0.5 * s - 0.45) / 0.55, 0.0, 1.0);
        vec3 col = dec(mix(enc(bg), enc(primary), k)); // interpolate in sRGB like the SVG
        float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0);
        col = mix(col, primary, smoothstep(1.0 - rim, 1.0, f));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
