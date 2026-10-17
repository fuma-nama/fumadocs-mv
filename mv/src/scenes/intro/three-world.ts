import * as THREE from 'three';
import { C } from '../_shared/palette';
import { moonMaterial } from '../_shared/moon';
import { R1, chapterAngle, polar } from './world';

export const MOON_R = 0.7;
export const MONO = { w: 1.3, h: 3.0, d: 0.1 };

const VERT = /* glsl */ `
uniform float rise;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying float vFront;
varying float vViewZ;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vFront = step(0.5, normal.z);
  vUv = vec2(position.x + 0.5, 1.0 - rise + rise * position.y);
  vec4 mv = viewMatrix * w;
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D face;
uniform float lit;
uniform float flash;
uniform vec3 moonPos;
uniform float moonI;
uniform vec3 body;
uniform vec3 warm;
uniform float mirror;
uniform vec3 fogCol;
uniform float fogNear;
uniform float fogFar;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying float vFront;
varying float vViewZ;
void main(){
  vec3 n = normalize(vN);
  float sky = 0.10 + 0.22 * max(dot(n, normalize(vec3(-0.35, 1.0, 0.45))), 0.0);
  vec3 L = moonPos - vW;
  float dist = length(L);
  float ndl = max(dot(n, L / dist), 0.0);
  float att = moonI / (1.0 + 0.06 * dist * dist);
  vec3 col = body * sky + warm * ndl * att * 0.03;
  if (vFront > 0.5) {
    vec3 tex = texture2D(face, vUv).rgb;
    col = body * 0.3 + tex * (0.13 + 0.87 * lit) * (1.0 + 5.0 * flash) + warm * ndl * att * 0.006 + vec3(flash * 0.12);
  }
  float fog = smoothstep(fogNear, fogFar, vViewZ);
  col = mix(col, fogCol, fog);
  if (mirror > 0.5) col *= exp(-abs(vW.y) * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`;

export function monoMaterial(face: THREE.Texture, mirror: boolean) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      face: { value: face },
      rise: { value: 1 },
      lit: { value: 0 },
      flash: { value: 0 },
      moonPos: { value: new THREE.Vector3(0, MOON_R, 0) },
      moonI: { value: 1 },
      body: { value: new THREE.Color(C.INK3) },
      warm: { value: new THREE.Color(C.ORANGE) },
      mirror: { value: mirror ? 1 : 0 },
      fogCol: { value: new THREE.Color(C.INK) },
      fogNear: { value: 8 },
      fogFar: { value: 30 },
    },
  });
}

export interface Mono {
  k: number;
  mesh: THREE.Mesh;
  mirror: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  mmat: THREE.ShaderMaterial;
}

/** The 3D set: moon + eight monolith pages on the chapter ring, and their mirror images. */
export class IntroWorld {
  /** monoliths (rendered with line-art edges) */
  scene = new THREE.Scene();
  /** the moon alone, composited over `scene` — keeping it out of the edge pass avoids line-art of
   *  the slabs behind it bleeding through (render3D hides noEdges objects from edge detection) */
  moonScene = new THREE.Scene();
  mirror = new THREE.Scene();
  moon: THREE.Mesh;
  moonM: THREE.Mesh;
  monos: Mono[] = [];

  constructor(faces: THREE.Texture[]) {
    const sg = new THREE.SphereGeometry(MOON_R, 96, 64);
    this.moon = new THREE.Mesh(sg, moonMaterial());
    this.moonM = new THREE.Mesh(sg, moonMaterial());
    this.moonScene.add(this.moon);
    this.mirror.add(this.moonM);
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    for (let k = 0; k < 8; k++) {
      const th = chapterAngle(k);
      const [x, , z] = polar(R1, th);
      const mat = monoMaterial(faces[k], false);
      const mmat = monoMaterial(faces[k], true);
      const mesh = new THREE.Mesh(box, mat);
      const mirror = new THREE.Mesh(box, mmat);
      for (const m of [mesh, mirror]) {
        m.position.set(x, 0, z);
        m.rotation.y = Math.atan2(-x, -z);
      }
      this.scene.add(mesh);
      this.mirror.add(mirror);
      this.monos.push({ k, mesh, mirror, mat, mmat });
    }
  }

  /** rise 0..1 (visible fraction), lit/flash for the face, moon light intensity. */
  setMono(k: number, rise: number, lit: number, flash: number, moonPos: THREE.Vector3, moonI: number, fogNear: number, fogFar: number) {
    const m = this.monos[k];
    const vis = rise > 0.001;
    m.mesh.visible = m.mirror.visible = vis;
    const h = MONO.h * Math.max(rise, 0.001);
    m.mesh.scale.set(MONO.w, h, MONO.d);
    m.mirror.scale.set(MONO.w, -h, MONO.d);
    for (const mat of [m.mat, m.mmat]) {
      const u = mat.uniforms;
      u.rise.value = Math.max(rise, 0.001);
      u.lit.value = lit;
      u.flash.value = flash;
      u.moonPos.value.copy(moonPos);
      u.moonI.value = moonI;
      u.fogNear.value = fogNear;
      u.fogFar.value = fogFar;
    }
    // the mirror sees the moon mirrored too
    m.mmat.uniforms.moonPos.value.set(moonPos.x, -moonPos.y, moonPos.z);
  }

  setMoon(y: number, scale: number) {
    this.moon.visible = this.moonM.visible = scale > 0.001;
    this.moon.position.set(0, y, 0);
    this.moon.scale.setScalar(scale);
    this.moonM.position.set(0, -y, 0);
    this.moonM.scale.set(scale, -scale, scale);
  }
}
