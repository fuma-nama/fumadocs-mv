import * as THREE from 'three';
import type { SceneImpl, Frame } from '../../engine/engine';
import { render3D } from '../../engine/three-kit';
import { clamp, ease, seg } from '../../engine/anim';
import { C } from '../_shared/palette';
import { hints, lyricState } from '../../overlay/lyrics';
import { Ink, LIGHT_DIR, buildFrame, setView } from './builder';
import { applyCam } from './cam';
import { FatLines, Fills, lin } from './gpu';
import { drawArrange, drawBigName, drawBuildHud, drawFinalDot, drawGuideDot, drawRingEchoes, drawRowLabels, drawSaa, drawUnroll, setFrame0 } from './hud';
import { loadPlates, plates, projMaterial } from './plates';
import { loadGeo } from './geo';
import { T } from './timeline';
import { GROUND, HERO_SX, collapseRing, local, worldAt, type World } from './world';
import { VH, VW } from './layouts';

const SS = 2;
const HUD_SS = 2;
const scene3 = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(30, 16 / 9, 10, 400000);
const ink = new Ink();
const floor = new FatLines(4000);
const projMeshes: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
/** Focal light pool (additive, on the ground plane around the hero). */
const pool = new THREE.Mesh(
  new THREE.PlaneGeometry(3600, 2800),
  new THREE.ShaderMaterial({
    uniforms: { a: { value: 0 }, col: { value: new THREE.Color(C.ORANGE) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float a; uniform vec3 col; varying vec2 vUv;
      void main(){ vec2 d = (vUv - 0.5) * 2.0; float r = length(d); float k = max(0.0, exp(-r * r * 3.2) - exp(-3.2)) / (1.0 - exp(-3.2)) * a;
        gl_FragColor = vec4(col * k * 0.4, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }),
);
/** The frames stand on the reflective floor (2 px under their bottom edges, no z-fighting). */
const FLOOR_Y = GROUND - 2;
const shadow = new Fills(40000, { transparent: true });
const wash = new Fills(600, { transparent: true });
/** The floor's own pass: the light pool on the floor and the slab shadows (under the reflections). */
const floorScene = new THREE.Scene();
const WASH = lin('#202024');

/** A soft pool of light on the floor around what the camera looks at. */
function buildWash(w: World) {
  wash.reset();
  if (w.floorA <= 0.01) return;
  const cx = w.cam.tgt[0];
  const cz = 0;
  const R = 7000;
  const y = FLOOR_Y + 0.2;
  const N = 48;
  const ring = [0, 0.35, 0.7, 1];
  const alpha = [0.95, 0.75, 0.32, 0];
  for (let r = 0; r < ring.length - 1; r++) {
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2;
      const a1 = ((i + 1) / N) * Math.PI * 2;
      const p = (rr: number, a: number) => [cx + Math.cos(a) * R * rr, y, cz + Math.sin(a) * R * rr * 0.8];
      const c0 = [WASH[0], WASH[1], WASH[2], alpha[r]];
      const c1 = [WASH[0], WASH[1], WASH[2], alpha[r + 1]];
      if (r === 0) wash.triC(p(0, 0), p(ring[1], a0), p(ring[1], a1), c0, c1, c1);
      else {
        wash.triC(p(ring[r], a0), p(ring[r + 1], a0), p(ring[r + 1], a1), c0, c1, c1);
        wash.triC(p(ring[r], a0), p(ring[r + 1], a1), p(ring[r], a1), c0, c1, c0);
      }
    }
  }
}

/** Soft floor shadows: each slab's box projected along the key light, convex hull, feathered. */
function buildShadows(w: World) {
  shadow.reset();
  if (w.floorA <= 0.01) return;
  const L = LIGHT_DIR;
  for (const inst of w.insts) {
    const T = inst.st.body ?? 0;
    if (T < 0.5) continue;
    const a = 0.85 * clamp(inst.st.inten) * clamp(inst.st.fillA);
    if (a < 0.01) continue;
    const pts: [number, number][] = [];
    for (const x of [0, VW]) for (const y of [0, VH]) for (const z of [0, -T]) {
      const p = local(inst.M, x, y, z);
      const h = Math.max(0, p[1] - FLOOR_Y);
      pts.push([p[0] - (L.x * h) / L.y, p[2] - (L.z * h) / L.y]);
    }
    const hull = convexHull(pts);
    if (hull.length < 3) continue;
    let cx = 0;
    let cz = 0;
    for (const [x, z] of hull) {
      cx += x;
      cz += z;
    }
    cx /= hull.length;
    cz /= hull.length;
    const y = FLOOR_Y + 0.5;
    const core = [0, 0, 0, a];
    const edge = [0, 0, 0, 0];
    const F = 220;
    for (let i = 0; i < hull.length; i++) {
      const [ax, az] = hull[i];
      const [bx, bz] = hull[(i + 1) % hull.length];
      shadow.triC([cx, y, cz], [ax, y, az], [bx, y, bz], core, core, core);
      const da = Math.hypot(ax - cx, az - cz) || 1;
      const db = Math.hypot(bx - cx, bz - cz) || 1;
      const ao: [number, number] = [ax + ((ax - cx) / da) * F, az + ((az - cz) / da) * F];
      const bo: [number, number] = [bx + ((bx - cx) / db) * F, bz + ((bz - cz) / db) * F];
      shadow.triC([ax, y, az], [bx, y, bz], [bo[0], y, bo[1]], core, core, edge);
      shadow.triC([ax, y, az], [bo[0], y, bo[1]], [ao[0], y, ao[1]], core, edge, edge);
    }
  }
}

function convexHull(p: [number, number][]): [number, number][] {
  const pts = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const q = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function buildFloor(w: World) {
  floor.reset();
  if (w.floorA <= 0.001) return;
  const g = lin('#5a5a62');
  const x0 = -5400;
  const x1 = 14400;
  const z0 = -6300;
  const z1 = 6300;
  const step = 450;
  const fade = (x: number, z: number) => {
    const d = Math.hypot(x - w.cam.pos[0], z - w.cam.pos[2]);
    const near = Math.min(1, d / 1500);
    return w.floorA * near * Math.max(0, 1 - d / 10000) ** 1.6 * 0.42;
  };
  for (let x = x0; x <= x1; x += step) {
    for (let z = z0; z < z1; z += step) {
      const k = fade(x, z + step / 2);
      if (k > 0.01) floor.seg(x, FLOOR_Y, z, x, FLOOR_Y, z + step, [g[0] * k, g[1] * k, g[2] * k]);
    }
  }
  for (let z = z0; z <= z1; z += step) {
    for (let x = x0; x < x1; x += step) {
      const k = fade(x + step / 2, z);
      if (k > 0.01) floor.seg(x, FLOOR_Y, z, x + step, FLOOR_Y, z, [g[0] * k, g[1] * k, g[2] * k]);
    }
  }
}

/** Glass tints under a projected capture must go (the capture already shows the real glass). */
function projectionStyles(w: World) {
  for (const p of w.pieces) {
    const inst = w.insts.find((x) => x.k === p.k);
    if (inst) inst.st.panelFillA = Math.min(inst.st.panelFillA ?? 1, 1 - Math.min(1, p.a * 1.2));
  }
}

function setupProjections(w: World, t: number) {
  for (const m of projMeshes) m.visible = false;
  w.pieces.forEach((p, i) => {
    const inst = w.insts.find((x) => x.k === p.k);
    const plate = plates.get(p.id);
    const mesh = projMeshes[i];
    if (!inst || !plate || !mesh) return;
    mesh.visible = true;
    const [dx, dy, dw, dh] = p.dst;
    mesh.matrix
      .copy(inst.M)
      .multiply(new THREE.Matrix4().makeTranslation(dx + dw / 2 - 720, 450 - (dy + dh / 2), p.z))
      .multiply(new THREE.Matrix4().makeScale(dw, dh, 1));
    mesh.matrixWorldNeedsUpdate = true;
    mesh.renderOrder = 3 + p.z * 0.001 + i * 0.00001;
    const u = mesh.material.uniforms;
    const [u0, v0, u1, v1] = plate.uv;
    const [sx, sy, sw, sh] = p.src;
    u.map.value = plate.tex;
    u.uvr.value.set(u0 + (sx / 1440) * (u1 - u0), v1 - ((sy + sh) / 900) * (v1 - v0), u0 + ((sx + sw) / 1440) * (u1 - u0), v1 - (sy / 900) * (v1 - v0));
    u.rr.value.set(dw, dh, p.r, 0);
    u.alpha.value = p.a;
    u.alphaLo.value = p.lo;
    u.yr.value.set(dy / 900, dh / 900);
    u.scan.value = p.scan;
    u.flick.value = p.flick;
    u.seed.value = Math.floor(t * 30) + i * 7;
  });
}

let dofTex: THREE.Texture | null = null;
/** Static radial mask: 0 in the middle, 1 toward the edges (tilt-shift / depth of field). */
function dofMask(e: Frame['e']) {
  if (dofTex) return dofTex;
  const L = e.layer('layout:dofmask', 480, 270);
  const c = L.begin('#000');
  const gr = c.createRadialGradient(240, 150, 40, 240, 150, 300);
  gr.addColorStop(0, '#000');
  gr.addColorStop(0.45, '#000');
  gr.addColorStop(1, '#fff');
  c.fillStyle = gr;
  c.fillRect(0, 0, 480, 270);
  dofTex = L.end();
  return dofTex;
}

const scene: SceneImpl = {
  async setup(e) {
    scene3.add(ink.group);
    floor.obj.renderOrder = 1;
    scene3.add(floor.obj);
    pool.rotation.x = -Math.PI / 2;
    pool.renderOrder = 0.5;
    pool.visible = false;
    pool.frustumCulled = false;
    scene3.add(pool);
    wash.mesh.renderOrder = 0;
    shadow.mesh.renderOrder = 1;
    wash.mat.depthTest = false;
    shadow.mat.depthTest = false;
    floorScene.add(wash.mesh, shadow.mesh);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), projMaterial());
      m.matrixAutoUpdate = false;
      m.renderOrder = 3;
      m.visible = false;
      m.frustumCulled = false;
      scene3.add(m);
      projMeshes.push(m);
    }
    await Promise.all([loadPlates(e), loadGeo(e)]);
    // a capture's first upload costs ≈ 45 ms, mid-scene
    for (const p of plates.values()) e.renderer.initTexture(p.tex);
  },
  render(f: Frame) {
    const { e, W, H, t } = f;
    const g = e.gfx;
    const h = hints(f);
    h.tone = 'dark';
    // L6 (bars 27–28) sits centred under the hero frame, which is right of centre to leave the
    // left column for the layout name
    if (lyricState(t)?.id === 'L6') h.lyricAnchor = [HERO_SX, 896];
    // thin hairlines fringe under chromatic aberration: off while the line art is fine (continuity
    // with TOC's ca 0), creeping in with the riser, engine default again for the B4 dot
    const ca0 = f.post.ca;
    if (t < T.collapse) f.post.ca = 0.0011 * seg(t, T.arch, T.collapse, ease.inQuad);
    else if (t < T.dot) f.post.ca = 0.0011 + (ca0 - 0.0011) * seg(t, T.collapse, T.dot);
    // B3 window before the downbeat: the TOC frame, untouched
    if (t < T.start) return f.other ?? g.compose(g.rt('layout:empty'), C.INK, []);
    if (t >= T.collapse && t < T.dot) h.lyrics = 'scene';
    if (t >= T.dot) h.lyrics = 'hidden';

    const w = worldAt(t);
    // HUD at 2× (box-downsampled by the compositor): matches TOC's supersampled B3 frame and keeps
    // moving glyphs / hairlines from shimmering
    const hud = e.layer('layout:hud', W * HUD_SS, H * HUD_SS);
    const c = hud.begin();
    c.setTransform(HUD_SS, 0, 0, HUD_SS, 0, 0);

    if (w.black) {
      drawFinalDot(c, t);
      return g.compose(g.rt('layout:comp'), C.INK, [{ tex: hud.end() }]);
    }

    applyCam(cam, w.cam, w.cam.up);
    setView(cam.position);
    pool.visible = !!w.pool;
    if (w.pool) {
      pool.position.set(w.pool.x, w.pool.y, w.pool.z);
      pool.material.uniforms.a.value = w.pool.a;
    }
    projectionStyles(w);
    ink.reset();
    for (const inst of w.insts) {
      // projected scale of the frame's vertical axis at its centre (text-bar thickness on screen)
      const a = new THREE.Vector3(...local(inst.M, 720, 450, 0)).project(cam);
      const b = new THREE.Vector3(...local(inst.M, 720, 550, 0)).project(cam);
      inst.st.pxScaleY = Math.hypot((b.x - a.x) * 960, (b.y - a.y) * 540) / 100;
      buildFrame(ink, inst.fs, inst.M, inst.st);
    }
    buildFloor(w);
    buildWash(w);
    buildShadows(w);
    wash.commit();
    shadow.commit();
    ink.commit(SS, W, H, { frame: 3, edge: 2, fine: 1.4 });
    floor.commit(1 * SS, W * SS, H * SS);

    // glossy floor: the scene mirrored about the floor plane, blurred, under everything
    let refl: THREE.Texture | null = null;
    let floorTex: THREE.Texture | null = null;
    if (w.floorA > 0.01) {
      floor.obj.visible = false;
      pool.visible = false;
      for (const m of projMeshes) m.visible = false;
      ink.group.scale.set(1, -1, 1);
      ink.group.position.set(0, 2 * FLOOR_Y, 0);
      ink.group.updateMatrixWorld(true);
      const r = render3D(g, scene3, cam, { key: 'layout:refl', ss: 1, samples: 0, clear: null });
      ink.group.scale.set(1, 1, 1);
      ink.group.position.set(0, 0, 0);
      ink.group.updateMatrixWorld(true);
      floor.obj.visible = true;
      pool.visible = !!w.pool;
      refl = g.blur(r, 5, 'layout:reflb');
      floorTex = render3D(g, floorScene, cam, { key: 'layout:floor', ss: 1, samples: 0, clear: null });
    }
    setupProjections(w, t);
    const main = render3D(g, scene3, cam, { key: 'layout:3d', ss: SS, clear: null });
    ink.setGlowPass(true);
    for (const m of projMeshes) m.material.uniforms.mask.value = 1;
    floor.obj.visible = false;
    const poolVis = pool.visible;
    pool.visible = false;
    const glowSrc = render3D(g, scene3, cam, { key: 'layout:glow3d', ss: 1, samples: 4, clear: '#000000' });
    for (const m of projMeshes) m.material.uniforms.mask.value = 0;
    floor.obj.visible = true;
    pool.visible = poolVis;
    ink.setGlowPass(false);
    const g1 = g.blur(glowSrc, 4, 'layout:g1');
    const g2 = g.blur(glowSrc, 26, 'layout:g2');

    // HUD
    const f0 = w.insts.find((i) => i.k === 0);
    if (f0) setFrame0(cam, f0.M);
    if (w.unroll !== undefined) drawUnroll(c, t, w.unroll);
    drawBuildHud(c, t, 1 - seg(t, T.pull, T.pull + 0.2));
    drawArrange(c, t);
    drawRowLabels(c, w, cam);
    drawBigName(c, w, t);
    drawGuideDot(c, w, cam);
    if (w.ring) drawRingEchoes(c, t, collapseRing);
    if (t >= T.collapse) drawSaa(c, t);
    if (w.flash) f.post.flash = w.flash;

    let out = g.compose(g.rt('layout:comp'), C.INK, [
      { tex: floorTex, opacity: w.floorA },
      { tex: refl, opacity: 0.24 * w.floorA },
      { tex: main },
      { tex: g1, blend: 'screen', opacity: 0.7 * w.glow },
      { tex: g2, blend: 'screen', opacity: 0.6 * w.glow },
    ]);
    // the square-off snaps out of the ring: a short radial smear on the downbeat
    const snap = t < T.start + 0.25 ? Math.exp(-(t - T.start) / 0.06) : 0;
    if (snap > 0.02 && t > T.start) out = g.motionBlur(out, { amount: 0.05 * snap, center: [0.5, 0.5] }, 'layout:mb0');
    if (w.dof > 0.01) {
      const blurred = g.blur(out, 7 * w.dof, 'layout:dof');
      out = g.compose(g.rt('layout:dofc'), null, [{ tex: out }, { tex: blurred, mask: dofMask(e), maskLuma: true, opacity: w.dof }]);
    }
    if (w.swing) out = g.motionBlur(out, { amount: 1, dir: w.swing }, 'layout:mbs');
    if (w.rush) {
      const p = new THREE.Vector3(...w.rush.at).project(cam);
      out = g.motionBlur(out, { amount: w.rush.amount, center: [p.x * 0.5 + 0.5, p.y * 0.5 + 0.5] }, 'layout:mbr');
    }
    // the spiral into the hero: a short radial smear while the city converges
    const conv = seg(t, T.collapse + 0.1, T.a) * (1 - seg(t, T.a - 0.04, T.a + 0.02));
    if (conv > 0.01) out = g.motionBlur(out, { amount: 0.09 * conv * conv }, 'layout:mb');
    // HUD, labels, lyric cells and the dot stay crisp on top of the camera effects
    return g.compose(g.rt('layout:final'), null, [{ tex: out }, { tex: hud.end() }]);
  },
};

export default scene;
