import * as THREE from 'three';
import { PH, PW } from './plates';

/** Pixel-unit perspective camera: the z = 0 plane maps 1 unit = 1 px, origin at frame centre, +y up. */
export function pxCamera(fov = 30) {
  const cam = new THREE.PerspectiveCamera(fov, 16 / 9, 10, 20000);
  const d = 540 / Math.tan(((fov / 2) * Math.PI) / 180);
  cam.position.set(0, 0, d);
  cam.lookAt(0, 0, 0);
  cam.userData.dist = d;
  return cam;
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
  uniform sampler2D texA; uniform sampler2D texB; uniform sampler2D maskTex;
  uniform int useMask; uniform vec2 res; uniform float dim; uniform vec3 tintCol; uniform float tintAmt;
  varying vec2 vUv;
  void main(){
    vec4 col = texture2D(texA, vUv);
    if (useMask == 1) {
      float m = texture2D(maskTex, gl_FragCoord.xy / res).a;
      col = mix(col, texture2D(texB, vUv), m);
    }
    col.rgb = mix(col.rgb, tintCol, tintAmt) * dim;
    gl_FragColor = vec4(col.rgb, 1.0);
    #include <colorspace_fragment>
  }`;

export function pageMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      texA: { value: null },
      texB: { value: null },
      maskTex: { value: null },
      useMask: { value: 0 },
      res: { value: new THREE.Vector2(1920, 1080) },
      dim: { value: 1 },
      tintCol: { value: new THREE.Color(0, 0, 0) },
      tintAmt: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.FrontSide,
  });
}

/** A two-sided page: front = light plate, back = dark plate (flip = rotate π about local Y). */
export class PageCard {
  readonly group = new THREE.Group();
  readonly front: THREE.Mesh;
  readonly back: THREE.Mesh;
  readonly mf = pageMaterial();
  readonly mb = pageMaterial();

  constructor(w = PW, h = PH, depth = 18) {
    const g = new THREE.PlaneGeometry(w, h);
    this.front = new THREE.Mesh(g, this.mf);
    this.back = new THREE.Mesh(g, this.mb);
    this.back.rotation.y = Math.PI;
    this.front.position.z = depth / 2 + 0.6;
    this.back.position.z = -depth / 2 - 0.6;
    // a physical card: thin core with lit paper edges (top/left light, bottom/right shaded)
    const mat = (c: string) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c) });
    const core = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), [mat('#c9c8c2'), mat('#FAFAF7'), mat('#FAFAF7'), mat('#8f8e88'), mat('#0A0A0B'), mat('#0A0A0B')]);
    this.group.add(core, this.front, this.back);
  }

  /** Set a face's texture(s); with `b` + `mask`, b shows where the screen-space mask is set. */
  face(which: 'front' | 'back', a: THREE.Texture, b?: THREE.Texture, mask?: THREE.Texture, res?: [number, number]) {
    const u = (which === 'front' ? this.mf : this.mb).uniforms;
    u.texA.value = a;
    u.texB.value = b ?? a;
    u.maskTex.value = mask ?? null;
    u.useMask.value = b && mask ? 1 : 0;
    if (res) u.res.value.set(res[0], res[1]);
  }

  shade(dim: number, tint?: THREE.Color, amt = 0) {
    for (const m of [this.mf, this.mb]) {
      m.uniforms.dim.value = dim;
      if (tint) m.uniforms.tintCol.value.copy(tint);
      m.uniforms.tintAmt.value = amt;
    }
  }
}
