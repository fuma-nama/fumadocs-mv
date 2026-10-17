import * as THREE from 'three';
import type { Gfx } from './gfx';
import { enter, leave } from './explore';

export interface Render3DOpts {
  /** pool key; use a unique key per independent 3D layer in a frame */
  key: string;
  /** supersampling factor (1 or 2). 2 = crisper lines, 4× cost */
  ss?: number;
  /** MSAA samples on the colour pass */
  samples?: number;
  /** background (CSS colour) or null/undefined for transparent */
  clear?: string | null;
  /** screen-space line art from depth/normal discontinuities */
  edges?: {
    color: string;
    /** line thickness in output px */
    width?: number;
    depth?: number; // sensitivity
    normal?: number; // sensitivity
    /** draw only the lines (transparent elsewhere) */
    only?: boolean;
    opacity?: number;
  };
  /** output size override (defaults to frame size) */
  w?: number;
  h?: number;
}

const normalMat = new THREE.MeshNormalMaterial();
/** marker for `noEdges` objects in the normal pass: alpha 0.5, writes depth, suppresses lines */
const markerMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, blending: THREE.NoBlending, depthWrite: true });

/**
 * Render a three.js scene and return an sRGB, premultiplied texture at frame size (or w×h),
 * ready for gfx.compose (do NOT set `linear` on it — conversion is done here).
 * Objects with `userData.noEdges = true` are excluded from line detection.
 */
export function render3D(gfx: Gfx, scene: THREE.Scene, camera: THREE.Camera, o: Render3DOpts): THREE.Texture {
  const r = gfx.renderer;
  const ss = o.ss ?? 1;
  const dw = (o.w ?? gfx.W) * ss; // design units
  const dh = (o.h ?? gfx.H) * ss;
  // the colour, normal/depth and edge passes are scratch, shared by every call of the same shape:
  // one key each (≈ 0.5 GB per 2× MSAA pass) would page out between scenes and stall on reuse
  const shape = `${dw}x${dh}`;
  const samples = o.samples ?? 4;
  const color = gfx.rt(`__3d:col:${shape}:${samples}`, dw, dh, { float: true, depth: true, samples });
  const W = color.width; // actual px
  const H = color.height;
  // the web page's free camera, x-ray and explorer, undone by leave()
  enter(scene, camera, o);
  r.setRenderTarget(color);
  if (o.clear) {
    r.setClearColor(new THREE.Color(o.clear), 1);
  } else {
    r.setClearColor(0x000000, 0);
  }
  r.clear(true, true, true);
  r.render(scene, camera);

  let edgeTex: THREE.Texture | null = null;
  if (o.edges) {
    const nd = gfx.rt(`__3d:nd:${shape}`, dw, dh, { float: true, depth: true });
    if (!nd.depthTexture) {
      nd.depthTexture = new THREE.DepthTexture(W, H);
      nd.depthTexture.type = THREE.FloatType;
    }
    // swap materials per object: normals for line-art objects, a depth-writing marker for
    // `noEdges` objects (they hide lines behind them without drawing any); points/lines/sprites hidden
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    const hidden: THREE.Object3D[] = [];
    scene.traverse((ob) => {
      if (!ob.visible) return;
      const mesh = ob as THREE.Mesh;
      if (mesh.isMesh) {
        swapped.push([mesh, mesh.material]);
        mesh.material = ob.userData.noEdges || isNoEdgeAncestor(ob) ? markerMat : normalMat;
      } else if ((ob as THREE.Points).isPoints || (ob as THREE.Line).isLine || (ob as THREE.Sprite).isSprite) {
        ob.visible = false;
        hidden.push(ob);
      }
    });
    const prevBg = scene.background;
    scene.background = null;
    r.setRenderTarget(nd);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene, camera);
    scene.background = prevBg;
    for (const [mesh, m] of swapped) mesh.material = m;
    for (const ob of hidden) ob.visible = true;

    const cam = camera as THREE.PerspectiveCamera;
    const em = gfx.material('edges', `
      uniform sampler2D nTex; uniform sampler2D dTex; uniform vec2 texel; uniform float width; uniform float kd; uniform float kn; uniform float near; uniform float far; uniform int ortho;
      float lin(float d){ if (ortho == 1) return near + d * (far - near); float z = d * 2.0 - 1.0; return (2.0 * near * far) / (far + near - z * (far - near)); }
      void main(){
        vec2 o = texel * width;
        float dc = lin(texture(dTex, vUv).r);
        vec3 nc = texture(nTex, vUv).rgb;
        float ac = texture(nTex, vUv).a;
        float e = 0.0;
        float marker = step(abs(ac - 0.5), 0.2);
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.785398;
          vec2 off = vec2(cos(a), sin(a)) * o;
          float d = lin(texture(dTex, vUv + off).r);
          vec4 n = texture(nTex, vUv + off);
          float dd = abs(d - dc) / max(dc, 1e-3);
          e = max(e, smoothstep(0.02, 0.06, dd * kd));
          e = max(e, smoothstep(0.25, 0.5, length(n.rgb - nc) * kn) * max(ac, n.a));
          e = max(e, abs(n.a - ac));
          marker = max(marker, step(abs(n.a - 0.5), 0.2));
        }
        outColor = vec4(e * (1.0 - marker));
      }`, { nTex: { value: null }, dTex: { value: null }, texel: { value: new THREE.Vector2() }, width: { value: 1 }, kd: { value: 1 }, kn: { value: 1 }, near: { value: 0.1 }, far: { value: 100 }, ortho: { value: 0 } });
    const u = em.uniforms;
    u.nTex.value = nd.texture;
    u.dTex.value = nd.depthTexture;
    u.texel.value.set(1 / W, 1 / H);
    u.width.value = (o.edges.width ?? 1) * ss * gfx.S * 0.5;
    u.kd.value = o.edges.depth ?? 1;
    u.kn.value = o.edges.normal ?? 1;
    u.near.value = cam.near ?? 0.1;
    u.far.value = cam.far ?? 100;
    u.ortho.value = (camera as THREE.OrthographicCamera).isOrthographicCamera ? 1 : 0;
    const er = gfx.rt(`__3d:edge:${shape}`, dw, dh);
    gfx.run(em, er);
    edgeTex = er.texture;
  }
  leave();

  // resolve: linear → sRGB, downsample, merge lines
  const out = gfx.rt(o.key, o.w ?? gfx.W, o.h ?? gfx.H);
  const rm = gfx.material('resolve3d', `
    uniform sampler2D col; uniform sampler2D edge; uniform int hasEdge; uniform vec3 lineCol; uniform int only; uniform float lineOp; uniform vec2 texel; uniform float ss;
    void main(){
      vec4 c = vec4(0.0); float e = 0.0;
      if (ss > 1.5) {
        for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
          vec2 uv = vUv + (vec2(float(x), float(y)) - 0.5) * texel;
          c += texture(col, uv); if (hasEdge == 1) e += texture(edge, uv).r;
        }
        c *= 0.25; e *= 0.25;
      } else { c = texture(col, vUv); if (hasEdge == 1) e = texture(edge, vUv).r; }
      c = clamp(c, 0.0, 1.0);
      vec3 s = c.a > 0.0 ? toSRGB(c.rgb / c.a) : vec3(0.0);
      vec4 base = vec4(s * c.a, c.a);
      if (only == 1) base = vec4(0.0);
      e *= lineOp;
      outColor = vec4(lineCol * e, e) + base * (1.0 - e);
    }`, { col: { value: null }, edge: { value: null }, hasEdge: { value: 0 }, lineCol: { value: new THREE.Color() }, only: { value: 0 }, lineOp: { value: 1 }, texel: { value: new THREE.Vector2() }, ss: { value: 1 } });
  const ru = rm.uniforms;
  ru.col.value = color.texture;
  ru.edge.value = edgeTex;
  ru.hasEdge.value = edgeTex ? 1 : 0;
  if (o.edges) ru.lineCol.value.setStyle(o.edges.color, THREE.NoColorSpace as THREE.ColorSpace);
  ru.only.value = o.edges?.only ? 1 : 0;
  ru.lineOp.value = o.edges?.opacity ?? 1;
  ru.texel.value.set(1 / W, 1 / H);
  ru.ss.value = ss;
  gfx.run(rm, out);
  return out.texture;
}

function isNoEdgeAncestor(ob: THREE.Object3D): boolean {
  for (let p = ob.parent; p; p = p.parent) if (p.userData.noEdges) return true;
  return false;
}

/** Cel-shading material (three lights) with N hard steps. */
export function toonMat(color: THREE.ColorRepresentation, o: { steps?: number; emissive?: THREE.ColorRepresentation; side?: THREE.Side; transparent?: boolean; opacity?: number } = {}) {
  const steps = o.steps ?? 3;
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    const v = Math.round((i / (steps - 1)) * 255);
    data.set([v, v, v, 255], i * 4);
  }
  const grad = new THREE.DataTexture(data, steps, 1);
  grad.minFilter = THREE.NearestFilter;
  grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;
  return new THREE.MeshToonMaterial({ color, gradientMap: grad, emissive: o.emissive ?? 0x000000, side: o.side ?? THREE.FrontSide, transparent: o.transparent ?? false, opacity: o.opacity ?? 1 });
}

/** Unlit flat colour (exact on-screen colour). */
export const flatMat = (color: THREE.ColorRepresentation, o: THREE.MeshBasicMaterialParameters = {}) =>
  new THREE.MeshBasicMaterial({ color, ...o });

/** A plane showing a texture at a given world width, keeping the texture's aspect. */
export function imagePlane(tex: THREE.Texture, width: number, o: { basic?: boolean; transparent?: boolean; side?: THREE.Side } = {}) {
  const img = tex.image as { width: number; height: number };
  const h = (width * img.height) / img.width;
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: o.transparent ?? false, side: o.side ?? THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, h), m);
  return mesh;
}
