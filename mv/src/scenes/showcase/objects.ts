import * as THREE from 'three';

/**
 * Objecthood (treatment §2): anything that turns out of the screen plane is a real slab —
 * thickness with lit, bevelled edges, a face that dims as it turns from the key light, a sheen
 * that sweeps across it while it turns, and a soft shadow. Facing the camera, faces render
 * exactly as before (all turn-lighting is relative to the facing state).
 */

/** Key light in view space (towards the light): upper left, in front — the moon's side. */
export const KEY_LIGHT = new THREE.Vector3(-0.45, 0.55, 0.7).normalize();

/** GLSL: turn lighting for a face with view-space normal n and face uv (0..1), aspect = h/w. */
export const TURN_GLSL = /* glsl */ `
vec3 turnLight(vec3 col, vec3 n, vec2 uv, float aspect, vec3 l, float k){
  float tilt = length(n.xy);
  float on = smoothstep(0.02, 0.3, tilt) * k;
  if (on <= 0.0) return col;
  float lam = max(dot(n, l), 0.0);
  float lam0 = max(l.z, 1e-3);
  col *= mix(1.0, (0.4 + 0.6 * lam) / (0.4 + 0.6 * lam0), on);
  // a soft glossy band sweeping across the face along the direction it tilts
  vec2 dir = n.xy / max(tilt, 1e-4);
  float along = dot((uv - 0.5) * vec2(1.0, aspect), dir);
  float centre = -0.75 + 1.7 * smoothstep(0.0, 0.95, tilt);
  float band = exp(-pow((along + centre) / 0.11, 2.0));
  col += vec3(1.0, 0.93, 0.84) * band * 0.32 * on * (0.5 + 0.5 * lam);
  return col;
}
vec3 edgeLight(vec3 n, vec3 l){
  float lam = max(dot(n, l), 0.0);
  vec3 base = vec3(0.075, 0.074, 0.085);
  return base * (0.45 + 0.9 * lam) + vec3(0.95, 0.9, 0.82) * pow(lam, 6.0) * 0.55;
}
float sdRoundRect(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
`;

/** Rounded-rect outline of width 1 and height h, centred. */
function roundRect(h: number, r: number) {
  const s = new THREE.Shape();
  const x0 = -0.5;
  const y0 = -h / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(-x0 - r, y0);
  s.absarc(-x0 - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(-x0, -y0 - r);
  s.absarc(-x0 - r, -y0 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, -y0);
  s.absarc(x0 + r, -y0 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + r);
  s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Card slab: width 1, height h, thickness t (all in width units), bevelled rounded edges. Groups: 0 caps, 1 sides. */
export function slabGeometry(h: number, t = 0.012, radius = 0.018 * h) {
  const bev = t * 0.32;
  const g = new THREE.ExtrudeGeometry(roundRect(h, radius), {
    depth: t - 2 * bev,
    bevelEnabled: true,
    bevelThickness: bev,
    bevelSize: bev,
    bevelOffset: -bev,
    bevelSegments: 3,
    curveSegments: 6,
  });
  g.translate(0, 0, -(t - 2 * bev) / 2);
  return g;
}

/** Flat silhouette for the card's shadow. */
export function silhouetteGeometry(h: number, radius = 0.018 * h) {
  return new THREE.ShapeGeometry(roundRect(h, radius), 6);
}

const VERT = /* glsl */ `
varying vec3 vObj; varying vec3 vObjN; varying vec3 vViewN;
void main(){
  vObj = position; vObjN = normal;
  vViewN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Card caps: front = the site (tamed like its billboard at lift-off), back = dark panel with the moon. */
export function cardCapMaterial(tex: THREE.Texture, h: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTex: { value: tex },
      uH: { value: h },
      uR: { value: 0.018 * h },
      uAlpha: { value: 1 },
      uGain: { value: 1 },
      uTame: { value: 0 },
      uGlint: { value: 0 },
      uLight: { value: KEY_LIGHT.clone() },
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform float uH; uniform float uR; uniform float uAlpha; uniform float uGain; uniform float uTame; uniform float uGlint; uniform vec3 uLight;
      varying vec3 vObj; varying vec3 vObjN; varying vec3 vViewN;
      ${TURN_GLSL}
      void main(){
        vec2 uv = vObj.xy / vec2(1.0, uH) + 0.5;
        vec3 n = normalize(vViewN);
        float d = sdRoundRect(vObj.xy, vec2(0.5, uH * 0.5), uR);
        float aa = max(fwidth(d), 1e-5);
        float rim = 1.0 - smoothstep(0.0, aa * 1.5, abs(d + aa * 1.2));
        vec3 col;
        if (vObjN.z > 0.0) {
          col = texture2D(uTex, uv).rgb;
          col *= mix(1.0, 0.58, smoothstep(0.3, 0.92, dot(col, vec3(0.2126, 0.7152, 0.0722))) * uTame);
          col *= uGain;
          // landing glint: the rim catches the light for a couple of frames as the card settles
          col = mix(col, vec3(1.0), rim * (0.18 + 0.82 * uGlint));
          col += vec3(1.0, 0.97, 0.92) * 0.05 * uGlint;
        } else {
          // the back of every page: a dark panel with the Fumadocs moon (logo gradient + rim)
          col = vec3(0.035, 0.035, 0.045);
          col = mix(col, vec3(0.98, 0.5, 0.14), rim * 0.8);
          vec2 q = vec2(-vObj.x, vObj.y) / (0.16 * uH);
          float r = length(q);
          float ra = max(fwidth(r), 1e-4);
          float k = clamp((0.35355 * (q.x - q.y + 2.0) - 0.45) / 0.55, 0.0, 1.0);
          vec3 s = mix(vec3(0.0392, 0.0392, 0.0431), vec3(0.9804, 0.502, 0.1373), k);
          vec3 lin = mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(0.04045, s));
          col = mix(col, lin, 1.0 - smoothstep(1.0 - ra, 1.0 + ra, r));
          col = mix(col, vec3(0.955, 0.216, 0.017), 1.0 - smoothstep(0.0, ra * 1.2, abs(r - 1.0 + ra)));
          uv.x = 1.0 - uv.x;
        }
        col = turnLight(col, n, uv, uH, normalize(uLight), 1.0);
        gl_FragColor = vec4(col, uAlpha);
        #include <colorspace_fragment>
      }`,
  });
}

/** Card edges: bevelled graphite, lit by the key light. */
export function cardSideMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uAlpha: { value: 1 }, uLight: { value: KEY_LIGHT.clone() } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform float uAlpha; uniform vec3 uLight;
      varying vec3 vObj; varying vec3 vObjN; varying vec3 vViewN;
      ${TURN_GLSL}
      void main(){
        gl_FragColor = vec4(edgeLight(normalize(vViewN), normalize(uLight)), uAlpha);
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * Soft shadow of a card (stage in view space, camera at the origin): the silhouette, slightly
 * enlarged, projected along the light onto a plane `uBack` behind the card's centre.
 */
export function cardShadowMaterial(h: number) {
  const ld = KEY_LIGHT.clone().negate();
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    // projected along the light, the silhouette's winding flips once the card turns past 90°
    side: THREE.DoubleSide,
    uniforms: { uH: { value: h }, uR: { value: 0.018 * h }, uAlpha: { value: 0.5 }, uLd: { value: ld }, uPlaneZ: { value: -42 } },
    vertexShader: /* glsl */ `
      uniform vec3 uLd; uniform float uPlaneZ; varying vec2 vP;
      void main(){
        vP = position.xy * 1.08;
        vec4 p = modelMatrix * vec4(vP, 0.0, 1.0);
        float s = (uPlaneZ - p.z) / uLd.z;
        p.xyz += uLd * s;
        gl_Position = projectionMatrix * viewMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uH; uniform float uR; uniform float uAlpha; varying vec2 vP;
      ${TURN_GLSL}
      void main(){
        float d = sdRoundRect(vP, vec2(0.5, uH * 0.5), uR);
        float a = (1.0 - smoothstep(-0.035, 0.03, d)) * uAlpha;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }`,
  });
}
