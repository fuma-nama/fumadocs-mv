import * as THREE from 'three';
import type { Gfx } from '../../engine/gfx';
import { drawTocDefault, LAYOUT_HERO, type TocDrawState } from '../toc/toc-geometry';
import type { LayerId, PageAssets, Rect } from './page';
import { Sheet } from './curl';
import { deskMat, SHADOW, uiMat, uiPlane } from './world';

/** Layer stacking inside the page group (local z, css px units). */
export const LAYER_Z: Record<LayerId, number> = {
  background: 0,
  'sidebar.bg': 1,
  'sidebar.header': 2,
  'sidebar.tree': 2,
  'sidebar.footer': 2,
  'sidebar.search': 3,
  'article.body': 1,
  'page.header': 2,
  breadcrumb: 2,
  toc: 1,
};

/** draw order (back → front when exploded): plate by plate, glass first */
export const LAYER_ORDER: Record<LayerId, number> = {
  background: 0,
  'article.body': 1,
  'page.header': 2,
  'sidebar.bg': 10,
  'sidebar.header': 11,
  'sidebar.tree': 11,
  'sidebar.footer': 11,
  'sidebar.search': 20,
  toc: 30,
  breadcrumb: 40,
};
/**
 * Exploded-view furniture per part (anatomy): an opaque backing so the element reads as a solid
 * plate when lifted, a subtle glass rim around it, and its soft cast shadow.
 * Keyed by part id; `layer` = the layer group it moves with.
 */
export const PLATES: { id: string; layer: LayerId; rect: Rect; color?: string; r: number }[] = [
  { id: 'sidebar', layer: 'sidebar.bg', rect: { x: 0, y: 0, w: 268, h: 810 }, r: 0 },
  { id: 'search', layer: 'sidebar.search', rect: { x: 15, y: 58, w: 236, h: 36 }, color: 'card', r: 8 },
  { id: 'breadcrumb', layer: 'breadcrumb', rect: { x: 294, y: 50, w: 222, h: 32 }, color: 'bg', r: 6 },
  { id: 'article', layer: 'article.body', rect: { x: 270, y: 0, w: 900, h: 810 }, color: 'bg', r: 0 },
  { id: 'toc', layer: 'toc', rect: { x: 1172, y: 0, w: 268, h: 810 }, color: 'bg', r: 0 },
];

/** css rect of the vector TOC canvas (items) and its resolution scale */
export const TOC_CANVAS: Rect = { x: 1172, y: 72, w: 268, h: 620 };
const TOC_DPR = 3;

export class Stage {
  readonly scene = new THREE.Scene();
  readonly sheetScene = new THREE.Scene();
  readonly shadowScene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(28, 16 / 9, 20, 40000);
  readonly shadowCam: THREE.OrthographicCamera;
  /** page group: origin = viewport top-left, x = css x, y = -css y */
  readonly page = new THREE.Group();
  readonly layers = {} as Record<LayerId, THREE.Mesh>;
  /** per-layer group (for exploding) */
  readonly lgroups = {} as Record<LayerId, THREE.Group>;
  readonly desk: THREE.Mesh;
  readonly base: THREE.Mesh;
  readonly sheet: Sheet;
  readonly tocCanvas: HTMLCanvasElement;
  readonly tocTex: THREE.CanvasTexture;
  readonly tocMesh: THREE.Mesh;
  readonly tocGroup = new THREE.Group();
  /** article tiles for scrolling (document coords) */
  readonly tilesGroup = new THREE.Group();
  readonly tiles: THREE.Mesh[] = [];
  /** per-part exploded-view furniture (anatomy), keyed by part id */
  readonly backings = new Map<string, THREE.Mesh>();
  readonly rims = new Map<string, THREE.Mesh>();
  /** physical thickness of each part (a slab under its content: lit left edge, shaded front) */
  readonly slabs = new Map<string, THREE.Mesh>();
  readonly decals = new Map<string, THREE.Mesh>();
  private tocKey = '';

  constructor(readonly A: PageAssets) {
    const m = A.model;
    this.page.position.set(-m.vw / 2, m.vh / 2, 0);
    this.scene.add(this.page);

    this.desk = new THREE.Mesh(new THREE.PlaneGeometry(16000, 10000), deskMat());
    this.desk.position.z = -4;
    this.desk.userData.noEdges = true;
    this.scene.add(this.desk);

    this.base = new THREE.Mesh(new THREE.BoxGeometry(m.vw, m.vh, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color('#d9d9d6') }));
    this.base.position.set(m.vw / 2, -m.vh / 2, -2.5);
    this.page.add(this.base);

    for (const id of Object.keys(A.layers) as LayerId[]) {
      const g = new THREE.Group();
      const L = A.layers[id];
      const mesh = uiPlane(L.tex, L.rect, LAYER_Z[id]);
      mesh.renderOrder = LAYER_ORDER[id];
      if (id === 'toc') (mesh.material as THREE.ShaderMaterial).uniforms.clip.value.set(0, 0, 1, (TOC_CANVAS.y - L.rect.y) / L.rect.h);
      g.add(mesh);
      this.page.add(g);
      this.layers[id] = mesh;
      this.lgroups[id] = g;
    }
    // exploded-view furniture: opaque backings, glass rims, cast shadows (all hidden when assembled)
    for (const P of PLATES) {
      const g = this.lgroups[P.layer];
      const z = LAYER_Z[P.layer];
      if (P.color) {
        const col = P.color === 'card' ? m.colors.card : m.colors.bg;
        const b = new THREE.Mesh(new THREE.PlaneGeometry(P.rect.w, P.rect.h), uiMat(roundRectTexture(P.rect.w, P.rect.h, P.r, col)));
        b.position.set(P.rect.x + P.rect.w / 2, -(P.rect.y + P.rect.h / 2), z - 0.3);
        b.renderOrder = LAYER_ORDER[P.layer] - 1;
        b.userData.noEdges = true;
        b.visible = false;
        g.add(b);
        this.backings.set(P.id, b);
      }
      // the part's body: a thin slab under the element (top face hidden under the content)
      const T = P.rect.w * P.rect.h < 20000 ? 7 : 14;
      const face = (c: string) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c), transparent: true, opacity: 1 });
      // BoxGeometry face order: +x, −x, +y (back edge), −y (front edge, toward the viewer), +z, −z
      const slab = new THREE.Mesh(new THREE.BoxGeometry(P.rect.w, P.rect.h, T), [face('#C9C4BA'), face('#F4F2EC'), face('#CFCAC0'), face('#D9D4CA'), face('#E9E6DF'), face('#B9B4AA')]);
      slab.position.set(P.rect.x + P.rect.w / 2, -(P.rect.y + P.rect.h / 2), z - 0.8 - T / 2);
      slab.renderOrder = LAYER_ORDER[P.layer] - 3;
      slab.userData.noEdges = true;
      slab.visible = false;
      g.add(slab);
      this.slabs.set(P.id, slab);
      const M = 7;
      const rim = new THREE.Mesh(new THREE.PlaneGeometry(P.rect.w + 2 * M, P.rect.h + 2 * M), uiMat(rimTexture(P.rect.w + 2 * M, P.rect.h + 2 * M, P.r + M), { depthWrite: false }));
      rim.position.set(P.rect.x + P.rect.w / 2, -(P.rect.y + P.rect.h / 2), z - 0.5);
      rim.renderOrder = LAYER_ORDER[P.layer] - 2;
      rim.userData.noEdges = true;
      rim.visible = false;
      g.add(rim);
      this.rims.set(P.id, rim);
      const d = new THREE.Mesh(new THREE.PlaneGeometry(P.rect.w + 80, P.rect.h + 80), decalMat(shadowTexture(P.rect.w, P.rect.h, P.r)));
      d.renderOrder = 4;
      d.visible = false;
      d.userData.rect = P.rect;
      this.page.add(d);
      this.decals.set(P.id, d);
    }
    // vector TOC items (drawn per state) live with the toc layer
    this.tocCanvas = document.createElement('canvas');
    this.tocCanvas.width = TOC_CANVAS.w * TOC_DPR;
    this.tocCanvas.height = TOC_CANVAS.h * TOC_DPR;
    this.tocTex = new THREE.CanvasTexture(this.tocCanvas);
    this.tocTex.colorSpace = THREE.NoColorSpace;
    this.tocTex.premultiplyAlpha = true;
    this.tocTex.anisotropy = 16;
    this.tocTex.generateMipmaps = true;
    this.tocTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tocMesh = uiPlane(this.tocTex, TOC_CANVAS, LAYER_Z.toc + 0.5);
    this.tocMesh.renderOrder = LAYER_ORDER.toc + 1;
    this.lgroups.toc.add(this.tocMesh);

    // scrolling article tiles (hidden until used)
    for (const t of A.tiles) {
      const mesh = uiPlane(t.tex, t.rect, LAYER_Z['article.body']);
      mesh.renderOrder = LAYER_ORDER['article.body'];
      mesh.userData.doc = t.rect;
      this.tiles.push(mesh);
      this.tilesGroup.add(mesh);
    }
    this.tilesGroup.visible = false;
    this.page.add(this.tilesGroup);

    // page-turn sheet (its own pass)
    this.sheet = new Sheet(m.vw, m.vh, 5);
    this.sheetScene.add(this.sheet.mesh, this.sheet.edge);
    this.shadowScene.add(this.sheet.shadowMesh);
    const r = SHADOW.rect.value;
    this.shadowCam = new THREE.OrthographicCamera(r.x, r.x + r.z, r.y + r.w, r.y, -20000, 20000);
    this.shadowCam.position.set(0, 0, 1000);
    this.shadowCam.lookAt(0, 0, 0);
    this.shadowCam.updateMatrixWorld(true);
  }

  /** Redraw the vector TOC items (exact Fumadocs default TOC via toc-geometry). */
  drawToc(st: Omit<TocDrawState, 'S' | 'ox' | 'oy'>, style: { dotSize?: number; dotAlpha?: number } = {}) {
    const key = JSON.stringify([st.trackTop, st.trackBottom, st.dotDist, st.dotAlpha, Array.from(st.textActive).map((v) => Math.round(v * 100)), style]);
    if (key === this.tocKey) return;
    this.tocKey = key;
    const c = this.tocCanvas.getContext('2d')!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.tocCanvas.width, this.tocCanvas.height);
    const [ox, oy] = this.A.model.tocOrigin;
    drawTocDefault(c, LAYOUT_HERO, { ...st, S: TOC_DPR, ox: (ox - TOC_CANVAS.x) * TOC_DPR, oy: (oy - TOC_CANVAS.y) * TOC_DPR }, { dotSize: style.dotSize });
    this.tocTex.needsUpdate = true;
  }

  /** Render the sheet's cast shadow maps (call before the main pass when the sheet is active). */
  renderShadow(gfx: Gfx) {
    const r = gfx.renderer;
    const rt = gfx.rt('read:shadow', 1024, 458);
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.render(this.shadowScene, this.shadowCam);
    SHADOW.sharp.value = gfx.blur(rt.texture, 2.5, 'read:shs', 1024, 458);
    SHADOW.soft.value = gfx.blur(rt.texture, 30, 'read:shb', 1024, 458);
  }
}

function canvasTex(cv: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.premultiplyAlpha = true;
  t.anisotropy = 16;
  return t;
}

/** opaque backing card in the page colour (css size, 2× texture) */
function roundRectTexture(w: number, h: number, r: number, color: string): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * 2);
  cv.height = Math.round(h * 2);
  const c = cv.getContext('2d')!;
  c.scale(2, 2);
  c.fillStyle = color;
  c.beginPath();
  c.roundRect(0, 0, w, h, r);
  c.fill();
  return canvasTex(cv);
}

/** glass rim: a faint clear fill, a crisp light edge and a thin dark bevel line inside it */
function rimTexture(w: number, h: number, r: number): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * 2);
  cv.height = Math.round(h * 2);
  const c = cv.getContext('2d')!;
  c.scale(2, 2);
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.beginPath();
  c.roundRect(0.5, 0.5, w - 1, h - 1, r);
  c.fill();
  c.lineWidth = 1.25;
  c.strokeStyle = 'rgba(255,255,255,0.95)';
  c.stroke();
  c.lineWidth = 0.75;
  c.strokeStyle = 'rgba(10,10,11,0.16)';
  c.beginPath();
  c.roundRect(2, 2, w - 4, h - 4, Math.max(0, r - 1.5));
  c.stroke();
  return canvasTex(cv);
}

/** soft shadow of a (rounded) rect, padded by 40 css on each side */
function shadowTexture(w: number, h: number, r: number): THREE.Texture {
  const s = 0.5;
  const cv = document.createElement('canvas');
  cv.width = Math.round((w + 80) * s);
  cv.height = Math.round((h + 80) * s);
  const c = cv.getContext('2d')!;
  c.scale(s, s);
  c.filter = `blur(${16 * s}px)`;
  c.fillStyle = '#000';
  c.beginPath();
  c.roundRect(40, 40, w, h, r);
  c.fill();
  return canvasTex(cv);
}

/** soft shadow decal (black, alpha from the texture × opacity) */
function decalMat(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, opacity: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform sampler2D map; uniform float opacity; varying vec2 vUv; void main(){ float a = texture2D(map, vUv).a * opacity; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }`,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
  });
}
