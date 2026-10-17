import * as THREE from 'three';
import { ATLAS, STRIPS, SITES } from './sites.gen';
import { KEY_LIGHT, TURN_GLSL } from './objects';

/** Screen panels are real slabs: this thickness (world m) shows as a lit edge whenever they turn. */
export const PANEL_T = 0.7;

const cellOf = new Map(SITES.map((s) => [s.slug, s.cell]));

/**
 * Night exposure: only screens near the camera show their full brightness; distant ones dim
 * (and cool slightly) so white pages don't read as bright slabs across the city.
 */
export const NIGHT_NEAR = 60;
export const NIGHT_FAR = 340;
export const NIGHT_MIN = 0.42;
export const NIGHT_GLSL = /* glsl */ `
float nightDim(float d){ return mix(1.0, ${NIGHT_MIN.toFixed(2)}, smoothstep(${NIGHT_NEAR.toFixed(1)}, ${NIGHT_FAR.toFixed(1)}, d)); }
vec3 nightTint(vec3 c, float d){ float k = smoothstep(${NIGHT_NEAR.toFixed(1)}, ${NIGHT_FAR.toFixed(1)}, d); return mix(c, c * vec3(0.86, 0.84, 1.0), k); }
`;
/** CPU twin of nightDim (for continuity when a card lifts off a billboard). */
export function nightDim(d: number) {
  const k = Math.min(1, Math.max(0, (d - NIGHT_NEAR) / (NIGHT_FAR - NIGHT_NEAR)));
  return 1 + (NIGHT_MIN - 1) * k * k * (3 - 2 * k);
}
export const siteCell = (slug: string) => cellOf.get(slug) ?? 0;

/**
 * Billboard material: an atlas cell (front face) / alternate cell (back face), CRT-style boot,
 * dock flash, distance haze. Per-instance attributes: aCell, aAlt, aBoot, aFlash.
 */
export function screenMaterial(atlas: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLight: { value: KEY_LIGHT.clone() },
      uAtlas: { value: atlas },
      uCols: { value: ATLAS.cols },
      uCell: { value: new THREE.Vector2(ATLAS.cw / ATLAS.w, ATLAS.ch / ATLAS.h) },
      uTime: { value: 0 },
      uGain: { value: 1 },
      uDockTame: { value: 0 },
      uFog: { value: new THREE.Color('#191530') },
      uFogNear: { value: 300 },
      uFogFar: { value: 2600 },
      uFogMax: { value: 0.85 },
      uInset: { value: new THREE.Vector2(ATLAS.bezel / ATLAS.cw, ATLAS.bezel / ATLAS.ch) },
      uDiscC: { value: new THREE.Vector3() },
      uDiscR: { value: new THREE.Vector3(1, 0, 0) },
      uDiscU: { value: new THREE.Vector3(0, 1, 0) },
      uDiscRad: { value: 1e9 },
    },
    vertexShader: /* glsl */ `
      attribute float aCell; attribute float aAlt; attribute float aBoot; attribute float aFlash; attribute float aClip; attribute float aFog; attribute float aObj;
      varying vec2 vUv; varying float vCell; varying float vAlt; varying float vBoot; varying float vFlash; varying float vDist; varying float vClip; varying vec3 vW; varying float vFogK;
      varying vec3 vObjN; varying vec3 vViewN; varying float vAspect; varying float vObjK;
      void main(){
        vUv = uv; vCell = aCell; vAlt = aAlt; vBoot = aBoot; vFlash = aFlash; vClip = aClip; vFogK = aFog; vObjK = aObj;
        vObjN = normal;
        mat4 m = modelMatrix * instanceMatrix;
        // box face normals stay axis-aligned under the instance's axis scale
        vViewN = normalize(mat3(viewMatrix * m) * normal);
        vAspect = length(m[1].xyz) / max(length(m[0].xyz), 1e-4);
        vec4 wp = m * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas; uniform float uCols; uniform vec2 uCell; uniform float uTime; uniform float uGain; uniform float uDockTame;
      uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform float uFogMax; uniform vec2 uInset;
      uniform vec3 uDiscC; uniform vec3 uDiscR; uniform vec3 uDiscU; uniform float uDiscRad;
      varying vec2 vUv; varying float vCell; varying float vAlt; varying float vBoot; varying float vFlash; varying float vDist; varying float vClip; varying vec3 vW; varying float vFogK;
      varying vec3 vObjN; varying vec3 vViewN; varying float vAspect; varying float vObjK;
      uniform vec3 uLight;
      ${NIGHT_GLSL}
      ${TURN_GLSL}
      void main(){
        if (vClip > 0.5) {
          vec3 d = vW - uDiscC;
          if (length(vec2(dot(d, uDiscR), dot(d, uDiscU))) > uDiscRad) discard;
        }
        vec3 n = normalize(vViewN);
        vec3 l = normalize(uLight);
        // turn lighting once the panel is an object in flight / on the moon (city panels stay as they were)
        float objK = vObjK;
        if (abs(vObjN.z) < 0.5) {
          // the panel's edge: bevel-lit graphite
          vec3 e = edgeLight(n, l);
          e *= uGain;
          e = mix(e, vec3(1.0, 0.92, 0.82), vFlash * 0.6);
          e = mix(e, uFog, smoothstep(uFogNear, uFogFar, vDist) * uFogMax * vFogK);
          gl_FragColor = vec4(e, 1.0);
          #include <colorspace_fragment>
          return;
        }
        bool front = vObjN.z > 0.0;
        float cell = front ? vCell : vAlt;
        vec2 uv = uInset + vUv * (1.0 - 2.0 * uInset);
        vec2 c = vec2(mod(cell, uCols), floor(cell / uCols + 0.001));
        vec2 auv = vec2((c.x + uv.x) * uCell.x, 1.0 - (c.y + 1.0 - uv.y) * uCell.y);
        vec3 col = texture2D(uAtlas, auv).rgb;
        // boot: a bright line opens vertically into the page (≈ 0.16 s)
        float k = clamp((uTime - vBoot) / 0.16, 0.0, 1.0);
        float open = smoothstep(0.25, 1.0, k);
        float half_ = max(open * 0.5, 0.012);
        float inside = 1.0 - smoothstep(half_ - 0.01, half_ + 0.01, abs(uv.y - 0.5));
        float line = (1.0 - smoothstep(0.0, 0.25, k)) * step(0.001, k);
        vec3 off = vec3(0.005, 0.005, 0.009);
        col = mix(off, col * (1.0 + 0.6 * (1.0 - open)), inside * step(0.001, k));
        col += vec3(1.0, 0.95, 0.9) * line * inside * 0.8;
        // tame white pages in the night city (not once docked: the mosaic shows true colours)
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col *= mix(1.0, 0.58, smoothstep(0.3, 0.92, lum) * mix(1.0, uDockTame, vClip));
        // night exposure only while the screen is in the city (not in flight / docked)
        col = mix(col, nightTint(col, vDist) * nightDim(vDist), vFogK);
        col = turnLight(col, n, vUv, vAspect, l, objK);
        col *= uGain;
        col = mix(col, vec3(1.0, 0.92, 0.82), vFlash);
        float fog = smoothstep(uFogNear, uFogFar, vDist) * uFogMax * vFogK;
        col = mix(col, uFog, fog);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** Portrait screens scrolling full docs pages (strips atlas, wraps). */
export function stripMaterial(strips: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uStrips: { value: strips },
      uCols: { value: STRIPS.cols },
      uTime: { value: 0 },
      uGain: { value: 1 },
      uFog: { value: new THREE.Color('#191530') },
    },
    vertexShader: /* glsl */ `
      attribute float aStrip; attribute float aAspect; attribute float aBoot; attribute float aSpeed;
      varying vec2 vUv; varying float vStrip; varying float vAspect; varying float vBoot; varying float vSpeed; varying float vDist;
      void main(){
        vUv = uv; vStrip = aStrip; vAspect = aAspect; vBoot = aBoot; vSpeed = aSpeed;
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uStrips; uniform float uCols; uniform float uTime; uniform float uGain; uniform vec3 uFog;
      varying vec2 vUv; varying float vStrip; varying float vAspect; varying float vBoot; varying float vSpeed; varying float vDist;
      ${NIGHT_GLSL}
      void main(){
        float win = vAspect * ${(STRIPS.sw / STRIPS.h).toFixed(5)};
        float y0 = fract((uTime - vBoot) * vSpeed);
        float v = fract(y0 + (1.0 - vUv.y) * win);
        vec2 auv = vec2((vStrip + vUv.x) / uCols, 1.0 - v);
        vec3 col = texture2D(uStrips, auv).rgb;
        float k = clamp((uTime - vBoot) / 0.16, 0.0, 1.0);
        float inside = 1.0 - smoothstep(max(k * 0.5, 0.012) - 0.01, max(k * 0.5, 0.012) + 0.01, abs(vUv.y - 0.5));
        col = nightTint(col, vDist) * nightDim(vDist);
        col = mix(vec3(0.005, 0.005, 0.009), col, inside * step(0.001, k)) * uGain;
        col = mix(col, uFog, smoothstep(260.0, 2600.0, vDist) * 0.85);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export interface ScreenPose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  w: number;
  h: number;
}

/** Instanced quads (1×1 plane) with per-instance attributes and a pose setter. */
export class ScreenSet {
  readonly mesh: THREE.InstancedMesh;
  private aCell: THREE.InstancedBufferAttribute;
  private aAlt: THREE.InstancedBufferAttribute;
  private aBoot: THREE.InstancedBufferAttribute;
  private aFlash: THREE.InstancedBufferAttribute;
  private aClip: THREE.InstancedBufferAttribute;
  private aFog: THREE.InstancedBufferAttribute;
  private aObj: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private s = new THREE.Vector3();

  constructor(
    readonly count: number,
    mat: THREE.ShaderMaterial,
  ) {
    const geo = new THREE.BoxGeometry(1, 1, PANEL_T);
    this.aCell = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.aAlt = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.aBoot = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.aFlash = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.aClip = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.aFog = new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1);
    this.aObj = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    for (const a of [this.aCell, this.aAlt, this.aBoot, this.aFlash, this.aClip, this.aFog, this.aObj]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCell', this.aCell);
    geo.setAttribute('aAlt', this.aAlt);
    geo.setAttribute('aBoot', this.aBoot);
    geo.setAttribute('aFlash', this.aFlash);
    geo.setAttribute('aClip', this.aClip);
    geo.setAttribute('aFog', this.aFog);
    geo.setAttribute('aObj', this.aObj);
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noEdges = true;
  }

  setStatic(i: number, cell: number, alt: number, boot: number) {
    this.aCell.setX(i, cell);
    this.aAlt.setX(i, alt);
    this.aBoot.setX(i, boot);
  }

  setPose(i: number, p: ScreenPose, flash = 0, clip = 0, fog = 1, obj = 0) {
    this.s.set(Math.max(1e-4, p.w), Math.max(1e-4, p.h), 1);
    this.m.compose(p.pos, p.quat, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.aFlash.setX(i, flash);
    this.aClip.setX(i, clip);
    this.aFog.setX(i, fog);
    this.aObj.setX(i, obj);
  }

  hide(i: number) {
    this.m.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(i, this.m);
  }

  commit() {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aCell.needsUpdate = true;
    this.aAlt.needsUpdate = true;
    this.aBoot.needsUpdate = true;
    this.aFlash.needsUpdate = true;
    this.aClip.needsUpdate = true;
    this.aFog.needsUpdate = true;
    this.aObj.needsUpdate = true;
  }
}
