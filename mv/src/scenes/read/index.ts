import * as THREE from 'three';
import type { Engine, Frame, SceneImpl } from '../../engine/engine';
import { ease, seg, lerp } from '../../engine/anim';
import { render3D } from '../../engine/three-kit';
import { defaultPost, type LayerSpec } from '../../engine/gfx';
import { drawTocDefault, LAYOUT_HERO } from '../toc/toc-geometry';
import { hints } from '../../overlay/lyrics';
import { C } from '../_shared/palette';
import { drawTitleCard, TITLE } from '../intro/title';
import { loadPlates } from './plates';
import type { LayerId, PageAssets } from './page';
import { PLATES, Stage } from './stage';
import { drawAnatomy, drawFigureTitle, drawSlam, explodeAt, explodeAmount, partFlash, partOf, partOffset, partWeight, PARTS } from './anatomy';
import { Forest, F_IN, F_SWAP } from './forest';
import { camAt, DIVE_S0 } from './camera';
import { curlAt, drawDeskMarks, drawFlyingCaret, drawLandingPing, LAND } from './open';
import { Search } from './search';
import { diveSO, scrollAt, tocScrollState, SCROLL0, LANDING } from './dive';
import { T } from './timeline';
import { applyCam, SHADOW } from './world';
import { cameraBlur } from './mblur';

let A: PageAssets | null = null;
let S: Stage | null = null;
let forest: Forest | null = null;
let search: Search | null = null;
let loadError = '';
/** studio backdrop seen above the far desk in the low-angle shots (forest, keycaps) */
let skyTex: THREE.Texture | null = null;
function buildSky(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 540;
  const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, 540);
  g.addColorStop(0, '#CFC5B1');
  g.addColorStop(0.75, '#E1DACB');
  g.addColorStop(1, '#E8E2D5');
  c.fillStyle = g;
  c.fillRect(0, 0, 4, 540);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.premultiplyAlpha = true;
  return t;
}
/** the intro's title card redrawn from its exported layout: carries the sheet after the B1 window */
let titleTex: THREE.Texture | null = null;
function buildTitleTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = 1920;
  cv.height = 1080;
  const c = cv.getContext('2d')!;
  c.fillStyle = TITLE.paper;
  c.fillRect(0, 0, 1920, 1080);
  drawTitleCard(c, { caret: 0 });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.premultiplyAlpha = true;
  return t;
}
/** TOC keeps the engine's defaults: ease into them before the B2 window */
const POST_DEFAULT = defaultPost();
const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
BLACK.needsUpdate = true;

const ARTICLE_LAYERS: LayerId[] = ['article.body', 'page.header', 'breadcrumb'];
const CHROME_LAYERS: LayerId[] = ['sidebar.bg', 'sidebar.header', 'sidebar.tree', 'sidebar.footer', 'sidebar.search', 'toc'];
/** the 3D TOC hands over to the crisp 2D one once the camera is frontal */
const TOC2D = T.enter + 0.7;

/**
 * The forest's share of the frame: crossfades in on the dive; the swap back to the page on the
 * title is a hard switch at F_SWAP (the two frames are pixel-identical by construction).
 */
function forestMix(t: number): number {
  if (t < F_IN - 0.02 || t >= F_SWAP) return 0;
  return seg(t, F_IN - 0.02, F_IN + 0.05, ease.inOutCubic);
}

/** set every tile's visible window: document rows [y0, y1] (css), shifted up by `scroll` */
function placeTiles(st: Stage, scroll: number, y0: number, y1: number, smear: number, opacity: number) {
  for (const m of st.tiles) {
    const r = m.userData.doc as { x: number; y: number; w: number; h: number };
    m.position.y = -(r.y - scroll + r.h / 2);
    const top = (y0 + scroll - r.y) / r.h;
    const bot = (y1 + scroll - r.y) / r.h;
    m.visible = bot > 0 && top < 1 && opacity > 0.001;
    const u = (m.material as THREE.ShaderMaterial).uniforms;
    u.clip.value.set(0, top, 1, bot);
    u.smear.value = smear / r.h;
    u.opacity.value = opacity;
  }
}

/**
 * Upload every texture and compile every shader up front, so no frame pays for first use
 * (the first forest frame cost ≈ 440 ms before this).
 */
function warmUp(e: Engine, st: Stage, fo: Forest, se: Search, assets: PageAssets) {
  const r = e.renderer;
  const seen = new Set<THREE.Texture>();
  const up = (tex: unknown) => {
    if (tex instanceof THREE.Texture && !seen.has(tex)) {
      seen.add(tex);
      r.initTexture(tex);
    }
  };
  const visit = (root: THREE.Object3D) =>
    root.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      for (const mat of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        up((mat as THREE.MeshBasicMaterial).map);
        const u = (mat as THREE.ShaderMaterial).uniforms;
        if (u) for (const k of Object.keys(u)) up(u[k].value);
      }
    });
  for (const sc of [st.scene, st.sheetScene, se.scene, fo.scene]) visit(sc);
  for (const c of assets.crops.values()) up(c.tex);
  for (const t of assets.tiles) up(t.tex);
  for (const s of se.states) up(s.tex);
  // shaders: compile with every object visible (render passes toggle visibility per frame)
  const shown: THREE.Object3D[] = [];
  for (const sc of [st.scene, st.sheetScene, se.scene, fo.scene])
    sc.traverse((o) => {
      if (!o.visible) {
        o.visible = true;
        shown.push(o);
      }
    });
  r.compile(st.scene, st.cam);
  r.compile(st.sheetScene, st.cam);
  r.compile(se.scene, st.cam);
  r.compile(fo.scene, fo.cam);
  for (const o of shown) o.visible = false;
}

const scene: SceneImpl = {
  async setup(e) {
    try {
      A = await loadPlates(e);
      if (!A) throw new Error('plates missing (/plates/manifest.json read["docs.orange.light"])');
      S = new Stage(A);
      forest = new Forest(A);
      search = await Search.load(e, S);
      titleTex = buildTitleTexture();
      skyTex = buildSky();
      warmUp(e, S, forest, search, A);
    } catch (err) {
      loadError = String((err as Error)?.message ?? err);
      console.error('[read] setup', err);
    }
  },

  render(f: Frame) {
    const { e, t } = f;
    f.overlay.tone = 'light';
    // the intro's card uses 0.1; TOC keeps the engine default (0.22): ease across the scroll
    const toDefault = seg(t, T.enter, T.dive, ease.inOutCubic);
    // intro's card uses 0.1; deepen once the card has become a sheet on the desk, then hand TOC the default
    f.post.vignette = lerp(lerp(0.1, 0.2, seg(t, T.lift, T.open + 0.3, ease.inOutCubic)), POST_DEFAULT.vignette, toDefault);
    f.post.ca = lerp(0.0006, POST_DEFAULT.ca, toDefault);
    // ⌘K: the page fills the frame, so back the verse lyric with the overlay's frosted plate
    hints(f).plate = seg(t, 22.0, T.search, ease.inOutCubic) * (1 - seg(t, T.enter + 0.1, T.enter + 0.5, ease.inOutCubic));
    if (!S || !A) {
      const L = e.layer('read:err');
      const c = L.begin('#3a0d0d');
      c.fillStyle = '#ffb3b3';
      c.font = '24px monospace';
      c.fillText('READ: ' + loadError, 60, 120);
      return L.end();
    }
    // 13.6–14.0: the intro's title card, untouched; from 25.6: TOC's own frame, untouched
    if (t < T.lift && f.other) return f.other;
    if (t >= LANDING && f.other) return f.other;

    const st = S;
    const m = A.model;
    const gfx = e.gfx;
    // the plates slam together on the bar-13 kick: a short vertical jolt
    const slam = t >= T.forest ? Math.exp(-(t - T.forest) / 0.07) : 0;
    f.post.shake = [0, slam * 7 * Math.cos((t - T.forest) * 90)];
    // 1 % punch-in on the real kick envelope (anatomy → dialog); kept out of the motion-blur pose
    const pose = camAt(t, m);
    const punch = t >= T.anatomy && t < T.enter ? e.audio.env('kick', t) * 0.012 : 0;
    applyCam(st.cam, { ...pose, dist: pose.dist * (1 - punch) });

    // ── page state: the exploded view (anatomy) ─────────────────────────────
    const ex = explodeAt(t, e.audio.pulse('kick', t, 0.12));
    for (const id of Object.keys(st.lgroups) as LayerId[]) {
      // magnify about the part's centre: position = offset + (1 - s)·centre
      const r = partOf(id).rect;
      const o = ex[id];
      st.lgroups[id].scale.set(o.s, o.s, 1);
      st.lgroups[id].position.set(o.x + (1 - o.s) * (r.x + r.w / 2), -o.y - (1 - o.s) * (r.y + r.h / 2), o.z);
    }
    const xk = explodeAmount(t);
    /** per-layer visibility weight (the named part 1, others 0.5) and flash */
    const weightOf = (id: LayerId) => (xk > 0.001 ? partWeight(partOf(id), t) : 1);
    for (const P of PLATES) {
      const part = PARTS.find((q) => q.id === P.id)!;
      const w = xk > 0.001 ? partWeight(part, t) : 1;
      const o = partOffset(part, t);
      const b = st.backings.get(P.id);
      if (b) {
        b.visible = xk > 0.001;
        (b.material as THREE.ShaderMaterial).uniforms.opacity.value = w;
      }
      if (P.id === 'toc') (st.tocMesh.material as THREE.ShaderMaterial).uniforms.sat.value = 1 - (1 - w) * 2;
      const slab = st.slabs.get(P.id)!;
      slab.visible = xk > 0.001;
      for (const mat of slab.material as THREE.MeshBasicMaterial[]) mat.opacity = w;
      const rim = st.rims.get(P.id)!;
      rim.visible = xk > 0.001;
      (rim.material as THREE.ShaderMaterial).uniforms.opacity.value = xk * w;
      // soft cast shadow on whatever lies below (the frame or the desk), offset by the part's height
      const d = st.decals.get(P.id)!;
      d.visible = xk > 0.001;
      if (d.visible) {
        const r = P.rect;
        const h = Math.max(0, o.z);
        d.position.set(r.x + r.w / 2 + o.x - 0.22 * h, -(r.y + r.h / 2 + o.y + 0.3 * h), 0.4);
        d.scale.setScalar(o.s * (1 + h / 1400));
        (d.material as THREE.ShaderMaterial).uniforms.opacity.value = (0.42 * xk * w) / (1 + h / 500);
      }
      // the named part brightens on its hit
      for (const l of part.layers) {
        const u = (st.layers[l].material as THREE.ShaderMaterial).uniforms;
        u.flash.value = xk > 0.001 ? partFlash(part, t) : 0;
        u.flashCol.value.set(1, 1, 1);
      }
    }

    // article column: plate layers until the slam, then the document tiles (scrolling in S5)
    const useTiles = t >= T.forest;
    for (const id of ARTICLE_LAYERS) st.layers[id].visible = !useTiles;
    st.tilesGroup.visible = useTiles;
    const scroll = scrollAt(t, m);
    const vel = (scrollAt(t + 0.004, m) - scrollAt(t - 0.004, m)) / 0.008; // css/s
    // the page falls away during the dive: only the TOC remains on the bare background
    const pageFade = 1 - seg(t, T.dive + 0.1, T.dive + 0.6, ease.inOutCubic);
    // …and the desk becomes the page background, so only the TOC is left on flat #F5F5F5
    (st.desk.material as THREE.ShaderMaterial).uniforms.toBg.value = seg(t, T.dive - 0.1, T.dive + 0.3, ease.inOutCubic);
    if (useTiles) placeTiles(st, scroll, 0, m.vh, t >= SCROLL0 ? Math.min(34, Math.abs(vel) / 60 * 0.4) : 0, pageFade);
    for (const id of Object.keys(st.layers) as LayerId[]) {
      const u = (st.layers[id].material as THREE.ShaderMaterial).uniforms;
      const w = weightOf(id);
      u.opacity.value = (CHROME_LAYERS.includes(id) ? pageFade : 1) * w;
      // dimmed parts also lose colour, so the named part wins without the others looking faded
      u.sat.value = 1 - (1 - w) * 2;
      if (CHROME_LAYERS.includes(id)) st.layers[id].visible = pageFade > 0.001;
    }

    // forest of words: its own world, crossfaded in on the dive and swapped out on the title
    const fmix = forest ? forestMix(t) : 0;
    const heroes = fmix > 0 && forest ? forest.pose(t) : [];

    // ── S1 sheet ──────────────────────────────────────────────────────────
    const sheetTex = t < T.b1To ? f.other : titleTex;
    const sheetOn = t < T.anatomy && !!sheetTex;
    st.sheet.mesh.visible = sheetOn;
    st.sheet.edge.visible = sheetOn;
    if (sheetOn) {
      st.sheet.update(curlAt(t));
      st.sheet.mat.uniforms.front.value = sheetTex;
      SHADOW.amt.value = 1;
      st.renderShadow(gfx);
    } else SHADOW.amt.value = 0;

    // ── TOC ───────────────────────────────────────────────────────────────
    const tocState = t >= T.enter ? tocScrollState(t, m) : (() => {
      // scroll 0: dark until the caret lands, then "Reading" lights up
      const active = new Float32Array(LAYOUT_HERO.rows.length);
      active[0] = seg(t, LAND, LAND + 0.15, ease.outCubic);
      return { trackTop: lerp(20, 0, seg(t, LAND, LAND + 0.2, ease.outCubic)), trackBottom: 20, dotDist: LAYOUT_HERO.lens[0][1], dotAlpha: t >= LAND ? 1 : 0, textActive: active };
    })();
    st.drawToc(tocState);
    const toc2d = seg(t, TOC2D, TOC2D + 0.08);
    (st.tocMesh.material as THREE.ShaderMaterial).uniforms.opacity.value = (1 - toc2d) * weightOf('toc');
    st.tocMesh.visible = toc2d < 1;

    // motion-blur poses never straddle a camera cut (the swap back from the forest at F_SWAP)
    const poseAt = (x: number) => camAt(t >= F_SWAP ? Math.max(x, F_SWAP) : x, m);
    let page3d: THREE.Texture | null = null;
    if (fmix < 1) {
      // (the whip-zoom out of the title after the forest gets a lighter shutter)
      // the stepped whip out of the forest gets a full shutter on its snap frames
      const gain = t >= F_SWAP && t < F_SWAP + 0.22 ? 1 : 0.6;
      page3d = cameraBlur(gfx, render3D(gfx, st.scene, st.cam, { key: 'read:3d', ss: 2, clear: null }), poseAt, t, 'read:mb3d', gain);
      page3d = gfx.compose(gfx.rt('read:sky'), C.PAPER, [{ tex: skyTex }, { tex: page3d }]);
    }
    const forestTex = fmix > 0 && forest ? forest.render(gfx, t) : null;
    const layers: LayerSpec[] = [];
    if (fmix >= 1 && forestTex) layers.push({ tex: forestTex });
    else if (sheetOn && page3d) {
      layers.push({ tex: page3d });
      layers.push({ tex: render3D(gfx, st.sheetScene, st.cam, { key: 'read:sheet', ss: 1, samples: 4, clear: null }) });
    }
    // ⌘K: the real overlay (black 20 % + 4 px backdrop blur) over the page, keycaps + dialog above
    if (search && Search.on(t) && page3d) {
      search.pose(t);
      const b = search.backdrop(t);
      if (b > 0.001) {
        const bl = gfx.blur(page3d, 5 * b, 'read:backdrop');
        page3d = gfx.compose(gfx.rt('read:bd'), null, [{ tex: page3d }, { tex: bl, opacity: b }, { tex: BLACK, opacity: 0.2 * b }]);
      }
      layers.push({ tex: page3d });
      layers.push({ tex: cameraBlur(gfx, render3D(gfx, search.scene, st.cam, { key: 'read:search', ss: 2, clear: null, edges: { color: C.INK, width: 2.2 } }), poseAt, t, 'read:mbs', 0.5) });
    } else if (!sheetOn && page3d) layers.push({ tex: page3d });
    if (forestTex && fmix < 1) layers.push({ tex: forestTex, opacity: fmix });

    // ── 2D overlay ────────────────────────────────────────────────────────
    const O = e.layer('read:ov');
    const c = O.begin();
    drawFlyingCaret(c, st, t);
    drawLandingPing(c, st, t);
    drawDeskMarks(c, st, t);
    if (t >= T.anatomy - 0.15 && t < T.forest) {
      drawAnatomy(c, st, t);
      drawFigureTitle(c, t);
    }
    drawSlam(c, st, t);
    if (fmix > 0.5 && forest) forest.drawLabels(c, heroes, t);
    if (search && Search.on(t)) {
      search.drawPress(c, t);
      search.drawCaret(c, t);
    }
    layers.push({ tex: O.end() });
    if (toc2d > 0) {
      // the crisp vector TOC of the dive (own layer so the zoom punches can blur it)
      const so = diveSO(t, m, DIVE_S0);
      // 2× supersampled like TOC's own frames (box-filtered 2:1 by the compositor): identical AA at B2
      const L2 = e.layer('read:toc2d', f.W * 2, f.H * 2);
      const c2 = L2.begin();
      c2.setTransform(2, 0, 0, 2, 0, 0);
      c2.globalAlpha = toc2d;
      drawTocDefault(c2, LAYOUT_HERO, { ...tocState, ...so }, {});
      layers.push({ tex: cameraBlur(gfx, L2.end(), poseAt, t, 'read:mbtoc', 0.28) });
    }
    return gfx.compose(gfx.rt('read:comp'), null, layers);
  },
};

export default scene;
