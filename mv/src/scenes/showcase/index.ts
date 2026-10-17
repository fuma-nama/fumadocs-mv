import * as THREE from 'three';
import type { Frame, OverlayHints, SceneImpl } from '../../engine/engine';
import { clamp, ease, hash, hold, seg } from '../../engine/anim';
import { render3D } from '../../engine/three-kit';
import { boxLabel, brackets, line, measure, ring, sparkle, text } from '../../engine/draw2d';
import { drawDot, drawMoon } from '../_shared/moon';
import { C } from '../_shared/palette';
import { T } from './timeline';
import { MOON, P_END, aimMoon, applyCam, project, projectedRadius, sampleKeys, type CamState, type Key, type V3 } from './rig';
import { aviationLights, buildLayout, groundMesh, streetLamps, towerMaterial, towersMesh, type CityLayout } from './city';
import { PANEL_T, ScreenSet, nightDim, screenMaterial, siteCell, stripMaterial } from './screens';
import { KEY_LIGHT } from './objects';
import { drawStars, horizon, skyParams, skyPass, type Glow } from './sky';
import { applyFlow, cameraFlow } from './motion';
import { buildMaskScene, reflectionPass, syncMask } from './reflect';
import { MOSAIC, mosaicTiles } from './contract';
import { ATLAS, SITES, STRIPS } from './sites.gen';
import { CardStage, cardDefs, entrancePose, exitPose, heroScreenMaterial, landedPose, loadHeroTextures, pickHeroSlots, slotViewPose, CARD_CX, CARD_CY, type CardDef, type Pose } from './parade';
import { Sockets, Swarm, TileShadows, discFrame, drawDiscTiles, type DiscFrame, type TilePose } from './mosaic';

const ID = 'showcase';
const BASE = '/assets/scenes/showcase/';

// ── camera path ──────────────────────────────────────────────────────────────
function key(t: number, p: V3, moonAt: [number, number], fov: number, roll = 0, v?: number[]): Key {
  const a = aimMoon(p, moonAt[0], moonAt[1], fov);
  return { t, s: { p, yaw: a.yaw, pitch: a.pitch, roll, fov }, v };
}

/** fov (deg) at which the moon has screen radius r from position p */
function fovFor(p: V3, r: number) {
  const d = Math.hypot(MOON.pos.x - p[0], MOON.pos.y - p[1], MOON.pos.z - p[2]);
  return (2 * Math.atan(((MOON.radius / d) * 540) / r) * 180) / Math.PI;
}

const P0: V3 = [0, 280, 300];
const FOV_END = fovFor(P_END, MOSAIC.R);
const KEYS: Key[] = [
  key(T.start, P0, [960, 540], fovFor(P0, 140), 0, [0, -240, -60, 0, 0, 0, 22]),
  key(90.3, [0, 90, 190], [960, 340], 47, 0),
  key(91.2, [0, 19, 96], [800, 250], 55, 0),
  // bar 58: a fast run down the avenue with a gentle bank, braking into the parade
  key(91.9, [3, 15, 10], [720, 240], 58, -0.035),
  key(92.75, [5, 14, -38], [330, 200], 55, -0.025),
  key(94.4, [6, 14, -70], [250, 190], 55, -0.02),
  key(96.0, [6, 15, -100], [270, 185], 55, -0.01),
  key(96.5, [3, 40, -106], [620, 300], 40, 0.02),
  key(97.1, [-2, 105, -116], [900, 470], 20, 0.01),
  key(97.6, P_END, [960, 540], 9, 0),
  key(98.4, P_END, [1660, 960], 3.6, 0.05),
  key(99.2, P_END, [360, 790], 4.2, -0.04),
  key(100.3, P_END, [960, 540], 11.5, 0),
  key(T.still, P_END, [960, 540], FOV_END, 0),
];

// ── state ────────────────────────────────────────────────────────────────────
const scene3 = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(55, 16 / 9, 1, 9000);
let layout: CityLayout;
let towerMat: THREE.ShaderMaterial;
let ground: THREE.Mesh;
let tiles: ScreenSet;
let tileMat: THREE.ShaderMaterial;
let stripMat: THREE.ShaderMaterial;
/** tile index → city slot index (or -1 = starts off-screen) */
let tileSlot: number[] = [];
let cards: CardDef[] = [];
let stage: CardStage;
const heroScreens: THREE.Mesh[] = [];
let F: DiscFrame;
let swarm: Swarm;
let tileShadows: TileShadows;
let sockets: Sockets;
const tileM = new THREE.Matrix4();
const unitS = new THREE.Vector3();
let atlasImg: HTMLImageElement;
let maskScene: THREE.Scene;
let avMat: THREE.ShaderMaterial;
let lampMat: THREE.ShaderMaterial;
/** soft band mask for the lyric (white alpha: 0 above y 770, 1 from y 830 down) */
let calmMask: THREE.Texture;
let discReady = false;
const pose: TilePose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), w: 1, h: 1 };

function camAt(t: number): CamState {
  return sampleKeys(KEYS, t);
}

function camObj(t: number) {
  const c = new THREE.PerspectiveCamera(55, 16 / 9, 1, 9000);
  applyCam(c, camAt(t));
  return c;
}

const yUp = () => new THREE.Vector3(0, 1, 0);

const scene: SceneImpl = {
  async setup(e) {
    const [atlas, strips, img] = await Promise.all([
      e.assets.texture(BASE + 'atlas.jpg', { srgb: true }),
      e.assets.texture(BASE + 'strips.jpg', { srgb: true }),
      e.assets.image(BASE + 'atlas.jpg'),
    ]);
    atlasImg = img;
    // the moon stays in open sky along the camera path (descent, avenue, parade, final shot)
    const sights: number[][] = [];
    for (let tt = 89.9; tt <= 96.2; tt += 0.1) sights.push(camAt(tt).p);
    for (let tt = 97.4; tt <= 101.2; tt += 0.2) sights.push(camAt(tt).p);
    layout = buildLayout(sights);
    towerMat = towerMaterial();
    const towers = towersMesh(layout, towerMat);
    scene3.add(towers);
    const av = aviationLights(layout);
    avMat = av.mat;
    scene3.add(av.pts);
    const lamps = streetLamps();
    lampMat = lamps.mat;
    scene3.add(lamps.pts);
    ground = groundMesh();
    scene3.add(ground);

    // parade cards take their source billboards first
    cards = cardDefs();
    const heroTex = await loadHeroTextures(e, cards);
    // uploaded now rather than one by one as the screens wake (up to 22 ms each)
    for (const tex of heroTex) e.renderer.initTexture(tex);
    const usedSlots = pickHeroSlots(cards, layout.slots, layout.towers, camObj);
    for (const d of cards) {
      d.dim0 = d.slot !== undefined ? nightDim(camObj(d.tLift).position.distanceTo(layout.slots[d.slot].pos)) : 1;
    }
    stage = new CardStage(cards, heroTex);
    cards.forEach((d, i) => {
      if (d.slot === undefined) return;
      const s = layout.slots[d.slot];
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), heroScreenMaterial(heroTex[i]));
      mesh.position.copy(s.pos);
      mesh.rotation.y = s.rotY;
      mesh.scale.set(s.w, s.w / (d.pw / d.ph), 1);
      mesh.userData.noEdges = true;
      mesh.userData.card = i;
      (mesh.material as THREE.ShaderMaterial).uniforms.uBoot.value = T.start + 0.3 + layout.towers[s.tower].wake;
      scene3.add(mesh);
      heroScreens.push(mesh);
    });

    // tiles: the 312 mosaic tiles start life as billboards on the facades
    const mt = mosaicTiles();
    tileMat = screenMaterial(atlas);
    tiles = new ScreenSet(mt.length, tileMat);
    scene3.add(tiles.mesh);
    // slots ranked by prominence: closest approach of the camera while the city is on screen
    const launchPos = new THREE.Vector3(...camAt(T.launch).p);
    const path: THREE.Vector3[] = [];
    for (let tt = 90.4; tt <= T.launch + 0.3; tt += 0.2) path.push(new THREE.Vector3(...camAt(tt).p));
    const order = layout.slots
      .map((s, i) => ({ i, d: Math.min(...path.map((p) => s.pos.distanceTo(p))) }))
      .filter((o) => !usedSlots.has(o.i))
      .sort((a, b) => a.d - b.d);
    // the slots along the camera path get dark pages (they glow like screens at night); light pages
    // go further out, and bright sparse colourless ones (blank white slabs at night) furthest, where
    // night exposure and haze calm them. Within each group, the disc's centre tiles come first, so
    // the nearest screens are also the first to launch at the crash.
    const site = new Map(SITES.map((x) => [x.slug, x]));
    const rank = (slug: string) => {
      const x = site.get(slug)!;
      if (x.lum <= 110) return 0;
      return x.lum > 200 && x.ink < 0.12 && slug !== 'generative-a11y' ? 2 : 1;
    };
    const byRadius = mt
      .map((tl, i) => ({ i, g: rank(tl.slug), r: Math.hypot(tl.x + tl.w / 2 - 960, tl.y + tl.h / 2 - 540) }))
      .sort((a, b) => a.g - b.g || a.r - b.r);
    tileSlot = new Array(mt.length).fill(-1);
    byRadius.forEach((b, k) => (tileSlot[b.i] = k < order.length ? order[k].i : -1));
    F = discFrame(P_END);
    swarm = new Swarm(F, tileSlot, layout.slots, launchPos);
    tileShadows = new TileShadows(mt.length, F, KEY_LIGHT, PANEL_T);
    scene3.add(tileShadows.mesh);
    sockets = new Sockets(F, swarm.flights, PANEL_T);
    scene3.add(sockets.mesh);
    mt.forEach((tl, i) => {
      const si = tileSlot[i];
      const boot = si >= 0 ? T.start + 0.3 + layout.towers[layout.slots[si].tower].wake : 0;
      tiles.setStatic(i, siteCell(tl.slug), siteCell(swarm.alt(i)), boot);
    });
    const u = tileMat.uniforms;
    u.uDiscC.value.copy(F.c);
    u.uDiscR.value.copy(F.r);
    u.uDiscU.value.copy(F.u);
    u.uDiscRad.value = MOON.radius;

    // portrait strips (scrolling docs pages)
    stripMat = stripMaterial(strips);
    const sg = new THREE.PlaneGeometry(1, 1);
    const n = layout.strips.length;
    const aStrip = new Float32Array(n);
    const aAspect = new Float32Array(n);
    const aBoot = new Float32Array(n);
    const aSpeed = new Float32Array(n);
    const stripMesh = new THREE.InstancedMesh(sg, stripMat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    layout.strips.forEach((s, i) => {
      q.setFromAxisAngle(yUp(), s.rotY);
      m.compose(s.pos, q, new THREE.Vector3(s.w, s.h, 1));
      stripMesh.setMatrixAt(i, m);
      aStrip[i] = i % STRIPS.cols;
      aAspect[i] = s.h / s.w;
      aBoot[i] = T.start + 0.4 + layout.towers[s.tower].wake;
      aSpeed[i] = 0.035 + (i % 5) * 0.012;
    });
    sg.setAttribute('aStrip', new THREE.InstancedBufferAttribute(aStrip, 1));
    sg.setAttribute('aAspect', new THREE.InstancedBufferAttribute(aAspect, 1));
    sg.setAttribute('aBoot', new THREE.InstancedBufferAttribute(aBoot, 1));
    sg.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(aSpeed, 1));
    stripMesh.frustumCulled = false;
    stripMesh.userData.noEdges = true;
    scene3.add(stripMesh);

    const cm = e.layer(`${ID}:calmmask`);
    const cmc = cm.begin();
    const cg = cmc.createLinearGradient(0, 770, 0, 830);
    cg.addColorStop(0, 'rgba(255, 255, 255, 0)');
    cg.addColorStop(1, 'rgba(255, 255, 255, 1)');
    cmc.fillStyle = cg;
    cmc.fillRect(0, 770, cm.w, cm.h - 770);
    calmMask = cm.end();

    // wet street: everything that hides the road, for the reflection mask
    maskScene = buildMaskScene(ground, [towers, tiles.mesh, stripMesh, ...heroScreens]);
  },

  render(f: Frame) {
    const { e, t, W, H } = f;
    const g = e.gfx;
    // overlay hints (extras per mv/src/overlay/state.ts; set directly to avoid importing the overlay module)
    const h = f.overlay as OverlayHints & { accent?: string; lyricAlpha?: number };
    h.tone = 'dark';

    // B7: before the downbeat the frame is integrations' (core converging into the moon)
    if (t < T.start && f.other) return f.other;

    const cs = camAt(t);
    // kick pulse: a 1–2 % breath in the lights and a tiny camera nudge (not inside the locked hold)
    const kick = t < T.still ? e.audio.pulse('kick', t, 0.11) * seg(t, T.start + 0.2, T.start + 0.4) : 0;
    applyCam(cam, { ...cs, pitch: cs.pitch + kick * 0.0009 * Math.min(1, cs.fov / 30), fov: cs.fov * (1 - kick * 0.004) });
    const lightsOut = t >= T.lightsOut ? 1 : 0;

    // city uniforms: the city emerges from the dark as the flash decays; lights wake from the horizon
    const expose = seg(t, T.start + 0.04, T.start + 0.75, ease.outCubic);
    avMat.uniforms.uTime.value = t;
    avMat.uniforms.uScale.value = (H * 2) / 2 / Math.tan((cam.fov * Math.PI) / 360);
    avMat.uniforms.uOn.value = seg(t, T.start + 0.15, T.start + 0.35) * (1 - (t >= T.lightsOut ? 1 : 0));
    lampMat.uniforms.uTime.value = t;
    lampMat.uniforms.uWake0.value = T.start;
    lampMat.uniforms.uScale.value = (H * 2) / 2 / Math.tan((cam.fov * Math.PI) / 360);
    lampMat.uniforms.uOut.value = t >= T.lightsOut ? 1 : 0;
    towerMat.uniforms.uTime.value = t;
    towerMat.uniforms.uWake0.value = T.start;
    towerMat.uniforms.uOut.value = lightsOut;
    towerMat.uniforms.uExpose.value = expose;
    const gu = (ground.material as THREE.ShaderMaterial).uniforms;
    gu.uLights.value = seg(t, T.start + 0.4, T.start + 1.3);
    gu.uExpose.value = expose;
    gu.uOut.value = lightsOut;
    gu.uTime.value = t;
    gu.uWake0.value = T.start;
    tileMat.uniforms.uTime.value = t;
    tileMat.uniforms.uGain.value = 1 + 0.08 * kick;
    towerMat.uniforms.uGain.value = 1 + 0.12 * kick;
    // docked tiles: tamed highlights on the wall, true colours by the hold (matches the exact 2D disc)
    tileMat.uniforms.uDockTame.value = 1 - seg(t, 99.6, 100.9, ease.inOutQuad);
    stripMat.uniforms.uTime.value = t;
    stripMat.uniforms.uGain.value = 1 - lightsOut;
    for (const m of heroScreens) {
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uTime.value = t;
      u.uOn.value = t < cards[m.userData.card as number].tLift ? 1 : 0;
    }

    // tiles: facade billboards → launch → dock into the moon → flip waves on the wall
    const mt = mosaicTiles();
    for (let i = 0; i < mt.length; i++) {
      if (tileSlot[i] < 0 && t < swarm.flights[i].dep) {
        tiles.hide(i);
        tileShadows.set(i, tileM.makeScale(0, 0, 0), 0);
        continue;
      }
      const st = swarm.pose(i, t, pose);
      tiles.setPose(i, pose, st.flash, st.clip, st.fog, st.obj);
      if (st.lift > 0.001) {
        tileM.compose(pose.pos, pose.quat, unitS.set(pose.w, pose.h, 1));
        tileShadows.set(i, tileM, st.lift);
      } else {
        tileShadows.set(i, tileM.makeScale(0, 0, 0), 0);
      }
    }
    tiles.commit();
    tileShadows.commit();
    // the moon's lit sockets exist only while panels are docked and can lift (wall phase)
    sockets.mesh.visible = t >= 97.4 && t < 100.0;
    sockets.mat.uniforms.uOn.value = seg(t, 97.4, 97.8);
    // the city's line art glows up while it wakes (89.65–90.4), then settles
    const edgeUp = seg(t, T.start + 0.02, T.start + 0.2, ease.outCubic) * (1 - seg(t, 90.3, 91.0, ease.inOutQuad));
    const edgeCol = new THREE.Color('#4d4672').lerp(new THREE.Color('#7a6cc0'), edgeUp).getStyle();
    const tex3d = render3D(g, scene3, cam, { key: `${ID}:city`, ss: 2, edges: { color: edgeCol, width: 1.0, opacity: 0.7 + 0.3 * edgeUp } });

    // sky + moon (from the launch the moon's face fills with docked tiles; its gaps fade to ink).
    // The haze and the moon's halo are float gradients with dither (no 8-bit banding).
    const wake = seg(t, T.start + 0.1, T.start + 1.1, ease.inOutCubic);
    const mp = project(cam, MOON.pos, W, H);
    const mr = projectedRadius(cam, MOON.pos, MOON.radius, H);
    const flashK = Math.exp(-Math.max(0, t - T.start) / 0.12);
    const ink = seg(t, 97.45, 98.1, ease.inOutCubic);
    // halo: a ring of light just outside the rim (bounded so a telephoto moon doesn't tint the whole sky)
    const halo: Glow = { x: mp.x, y: mp.y, r: mr + Math.min(mr * 2.2, 240), color: [250, 128, 35], a: (0.22 + 0.35 * flashK) * Math.min(1, 220 / Math.max(mr, 1)) * (1 - 0.5 * ink) };
    const skyGrad = skyPass(g, `${ID}:skygrad`, skyParams(cam, W, H, wake, [10, 10, 11], [halo]), f.frame);
    const skyL = e.layer(`${ID}:sky`);
    const c = skyL.begin();
    drawStars(c, cam, t, W, H, { stars: 0.3 + 0.7 * wake });
    const sky = skyL.end();
    const moonL = e.layer(`${ID}:moon`);
    const mc0 = moonL.begin();
    drawMoon(mc0, mp.x, mp.y, mr);
    if (ink > 0) {
      mc0.beginPath();
      mc0.arc(mp.x, mp.y, mr + 1, 0, Math.PI * 2);
      mc0.fillStyle = `rgba(10, 10, 11, ${ink})`;
      mc0.fill();
    }
    const moonTex = moonL.end();
    // in the city nothing covers the moon, so it can sit on top of the motion-blurred city (the
    // guide stays crisp); from the launch on, screens fly in front of it, so it joins the stack
    const moonOnTop = t < T.launch;

    let out = g.compose(g.rt(`${ID}:comp`), C.INK, moonOnTop ? [{ tex: skyGrad }, { tex: sky }, { tex: tex3d }] : [{ tex: skyGrad }, { tex: sky }, { tex: moonTex }, { tex: tex3d }]);
    // wet-street reflection of the lit frame (while the camera still sees the road)
    const wet = 0.42 * seg(t, T.start + 0.5, T.start + 1.4) * (1 - seg(t, 96.2, 96.9));
    if (wet > 0.001) {
      syncMask(maskScene);
      const maskTex = render3D(g, maskScene, cam, { key: `${ID}:mask`, ss: 1, clear: '#000000' });
      const refl = reflectionPass(g, out, maskTex, horizon(cam, W, H), wet, t, `${ID}:refl`);
      out = g.compose(g.rt(`${ID}:wet`), C.INK, [{ tex: out }, { tex: refl, blend: 'add' }]);
    }
    // camera motion blur (180° shutter): far windows streak instead of strobing during fast moves
    if (t < T.still) {
      const wallPhase = t >= 97.0;
      const flow = cameraFlow(camAt, t, (o, d) => {
        if (wallPhase) {
          const den = d.dot(F.n);
          const s2 = Math.abs(den) > 1e-6 ? F.c.clone().sub(o).dot(F.n) / den : -1;
          return s2 > 0 ? s2 : 1700;
        }
        return d.y < -1e-4 ? Math.min(-o.y / d.y, 1600) : 1600;
      });
      flow.s = Math.max(-0.025, Math.min(0.025, flow.s));
      // full 180° shutter in the city; on the mosaic a short shutter keeps every tile legible
      const gain = 1 - 0.65 * seg(t, 96.9, 97.3) + 0.1 * seg(t, 99.2, 99.6);
      out = applyFlow(g, out, flow, `${ID}:mblur`, gain);
    }
    if (moonOnTop) out = g.compose(g.rt(`${ID}:moonc`), C.INK, [{ tex: out }, { tex: moonTex }]);
    // bloom fades out before the hold so the 3D tiles match the exact (unbloomed) 2D disc
    const bloomK = (1 - seg(t, 100.4, T.still, ease.inOutQuad)) * (1 - 0.45 * seg(t, 96.9, 97.5) * (1 - seg(t, 99.2, 100.0)));
    if (bloomK > 0.001) out = g.bloom(out, { threshold: 0.62, strength: 0.55 * bloomK, radius: 18 }, `${ID}:bloom`);

    // ── parade ────────────────────────────────────────────────────────────────
    let accent: string | undefined;
    if (t >= cards[0].tLift - 0.05 && t < T.launch + 0.2) {
      // rack focus to the cards: the city softens and dims behind them
      const focus = seg(t, cards[0].tLift, cards[0].tLand, ease.inOutCubic) * (1 - seg(t, T.launch - 0.05, T.launch + 0.15, ease.inOutCubic));
      if (focus > 0.001) {
        const bl = g.blur(out, 7 * focus, `${ID}:rack`);
        // the moon stays crisp (the guide); the landed card's key colour glows behind it
        let glowCol: string | undefined;
        let glowA = 0;
        for (const d of cards) {
          const a = seg(t, d.tLand - 0.12, d.tLand, ease.outQuad) * (1 - seg(t, d.tExit - 0.02, d.tExit + 0.1));
          if (a > glowA) {
            glowA = a;
            glowCol = d.accent;
          }
        }
        const glows: Glow[] = [{ x: mp.x, y: mp.y, r: mr * 2.6, color: [250, 128, 35], a: 0.25 * focus }];
        if (glowCol && glowA > 0.01) {
          const col = new THREE.Color(glowCol);
          glows.push({ x: CARD_CX, y: CARD_CY, r: 900, color: [Math.round(col.r * 255), Math.round(col.g * 255), Math.round(col.b * 255)], a: 0.3 * glowA * focus });
        }
        const glowTex = skyPass(g, `${ID}:parglow`, { ...skyParams(cam, W, H, 0, null), glows }, f.frame);
        const ml = e.layer(`${ID}:moonfx`);
        const mc = ml.begin();
        mc.save();
        mc.globalAlpha = focus;
        drawMoon(mc, mp.x, mp.y, mr);
        mc.restore();
        out = g.compose(g.rt(`${ID}:rackc`), C.INK, [{ tex: bl, tint: new THREE.Color(1 - 0.38 * focus, 1 - 0.38 * focus, 1 - 0.36 * focus) }, { tex: glowTex }, { tex: ml.end() }]);
      }
      stage.cam.fov = cam.fov;
      stage.cam.updateProjectionMatrix();
      const moonView = MOON.pos.clone().applyMatrix4(cam.matrixWorldInverse).normalize();
      const visible: number[] = [];
      cards.forEach((d, i) => {
        const land = landedPose(d.pw, d.ph, cam.fov, i);
        let p: Pose | null = null;
        if (t >= d.tLift && t < d.tLand) {
          const from =
            d.slot !== undefined
              ? slotViewPose(layout.slots[d.slot], cam, layout.slots[d.slot].w, layout.slots[d.slot].w / (d.pw / d.ph))
              : { ...land, pos: land.pos.clone().add(new THREE.Vector3(0, -30, -60)) };
          p = entrancePose(d.style, from, land, seg(t, d.tLift, d.tLand), d.crisp);
        } else if (t >= d.tLand && t < d.tExit) {
          // lands with a small punch on the kick, then a slow push
          const punch = 0.018 * Math.exp(-(t - d.tLand) / 0.07);
          const k = 1 + 0.03 * seg(t, d.tLand, d.tExit, ease.outQuad) + punch;
          p = { ...land, w: land.w * k, h: land.h * k };
        } else if (t >= d.tExit && t < d.tGone) {
          if (i === cards.length - 1) {
            // the last card shrinks uniformly and fades while its outline contracts into the
            // PUBLISH button (shape match through the outline; the capture itself never distorts)
            const u = seg(t, d.tExit, d.tGone, ease.inOutCubic);
            const k = 1.03 * (1 - 0.45 * u);
            p = { ...land, w: land.w * k, h: land.h * k };
            if (stage.setPose(i, p, 1 - u, 0.5 * (1 - u))) visible.push(i);
            return;
          }
          p = exitPose({ ...land, w: land.w * 1.03, h: land.h * 1.03 }, moonView, seg(t, d.tExit, d.tGone));
        }
        if (stage.setPose(i, p)) visible.push(i);
        const cu = stage.caps(i).uniforms;
        cu.uGlint.value = t >= d.tLand && t < d.tLand + 0.2 ? Math.exp(-(t - d.tLand) / 0.035) : 0;
        const clear = d.slot !== undefined ? seg(t, d.tLift, d.tLand, ease.inOutQuad) : 1;
        cu.uGain.value = d.dim0 + (1 - d.dim0) * clear;
        cu.uTame.value = d.slot !== undefined ? 1 - clear : 0;
        if (t >= d.tLand - 0.1 && t < d.tExit) accent = d.accent;
      });
      // dealt like a deck: each visible card (≤ 3 at once) renders in its own pass, newest on top
      const layers: { tex: THREE.Texture }[] = [{ tex: out }];
      for (const i of visible) {
        let tex = render3D(g, stage.scenes[i], stage.cam, { key: `${ID}:card${i % 3}`, ss: 2 });
        // the last 8th-note card materialises through a glitch
        const d = cards[i];
        if (d.style === 'glitch' && t >= d.tLift && t < d.tLand + 0.06) {
          const k = 1 - seg(t, d.tLift, d.tLand + 0.06, ease.outCubic);
          tex = g.glitch(tex, { amount: 0.85 * k, seed: Math.floor(t * 30), bands: 26, split: 0.02 }, `${ID}:cardglitch`);
        }
        layers.push({ tex });
      }
      out = g.compose(g.rt(`${ID}:paradec`), C.INK, layers);
    }

    // ── the mosaic moon: wash + rim, then the exact B8 disc (static from the lock) ──
    if (t >= 97.3) {
      const disc = e.layer(`${ID}:disc`);
      if (t >= T.lock && discReady) {
        // pixel-static: reuse the uploaded texture untouched
        out = g.compose(g.rt(`${ID}:discc`), C.INK, [{ tex: out }, { tex: disc.texture }]);
      } else {
        const dc = disc.begin();
        const exact = seg(t, T.still, T.lock - 1 / 60, ease.inOutQuad);
        if (exact > 0) {
          dc.save();
          dc.globalAlpha = exact;
          drawDiscTiles(dc, atlasImg, siteCell, ATLAS.cols, ATLAS.cw, ATLAS.ch, ATLAS.bezel);
          dc.restore();
        }
        const wash = 0.3 * seg(t, 97.3, 98.2, ease.inOutCubic) + 0.7 * seg(t, 100.0, T.still, ease.inOutCubic);
        const cx = t >= T.still ? MOSAIC.CX : mp.x;
        const cy = t >= T.still ? MOSAIC.CY : mp.y;
        const rr = t >= T.still ? MOSAIC.R : mr;
        drawMoon(dc, cx, cy, rr, { alpha: MOSAIC.WASH * wash, rim: 0 });
        const rimK = seg(t, 100.5, T.still, ease.inOutCubic);
        if (rimK > 0) {
          dc.beginPath();
          dc.arc(cx, cy, rr, -Math.PI / 2 - Math.PI * rimK, -Math.PI / 2 + Math.PI * rimK);
          dc.lineWidth = MOSAIC.RIM;
          dc.strokeStyle = MOSAIC.RIM_COLOR;
          dc.stroke();
        }
        out = g.compose(g.rt(`${ID}:discc`), C.INK, [{ tex: out }, { tex: disc.end() }]);
        discReady = t >= T.lock - 1 / 60;
      }
    }

    // ── foreground: labels, PUBLISH, wall tags ─────────────────────────────────
    const fg = e.layer(`${ID}:fg`);
    const d2 = fg.begin();
    let fgUsed = false;
    for (const d of cards) {
      if (d.slot !== undefined && t >= d.tLift - 0.22 && t < d.tLift + 0.06 && d.tLand - d.tLift > 0.25) {
        drawTarget(d2, d, t);
        fgUsed = true;
      }
      if (t < d.tLand - 1 / 60 || t >= d.tExit) continue;
      drawLabel(d2, d, t);
      fgUsed = true;
    }
    if (t >= T.dot && t < 100.95) {
      drawPublish(d2, t, mp.x, mp.y);
      fgUsed = true;
    }
    if (t >= T.wall && t < T.zoomOut + 0.2) fgUsed = drawWallTags(d2, t) || fgUsed;
    if (fgUsed) out = g.compose(g.rt(`${ID}:fgc`), C.INK, [{ tex: out }, { tex: fg.end() }]);

    // a calmer band behind the hook lyric while the mosaic fills the frame (agreed with the
    // overlay): the lower band is dimmed ~35 % and softened; gone before the B8 lock
    const calm = seg(t, 96.8, 97.0, ease.inOutQuad) * (1 - seg(t, 101.0, 101.4, ease.inOutQuad));
    if (calm > 0.001) {
      const soft = g.blur(out, 3, `${ID}:calmblur`);
      out = g.compose(g.rt(`${ID}:calm`), C.INK, [
        { tex: out },
        { tex: soft, mask: calmMask, opacity: calm },
        { tex: calmMask, tint: '#000000', opacity: 0.35 * calm },
      ]);
    }
    // downbeat: light bursting out of the core (added, radial — not a flat flash)
    if (t >= T.start && t < T.start + 0.6) {
      const k = t - T.start;
      const a = Math.exp(-k / 0.022);
      const bl = e.layer(`${ID}:burst`);
      drawBurst(bl.begin(), k, mp.x, mp.y, mr);
      const layers: { tex: THREE.Texture; blend: 'add' }[] = [];
      if (a > 0.01) {
        // hot core falling off radially to warm orange, plus a wide faint warm lift (dithered)
        const flare = skyPass(g, `${ID}:burstglow`, { ...skyParams(cam, W, H, 0, null), glows: [
          { x: mp.x, y: mp.y, r: 1300, color: [250, 150, 70], a: 0.3 * a },
          { x: mp.x, y: mp.y, r: mr * 4.2, color: [255, 232, 200], a },
        ] }, f.frame);
        layers.push({ tex: flare, blend: 'add' });
      }
      layers.push({ tex: bl.end(), blend: 'add' });
      out = g.compose(g.rt(`${ID}:burstc`), C.INK, [{ tex: out }, ...layers]);
    }

    if (accent) h.accent = accent;

    // crash: the PUBLISH click launches every screen — radial light from the button + a shake
    if (t >= T.launch && t < T.launch + 0.4) {
      const k = t - T.launch;
      const a = Math.exp(-k / 0.03);
      if (a > 0.01) {
        const leave = seg(t, T.launch, T.launch + 0.35, ease.inOutCubic);
        const bx = CARD_CX + (160 - CARD_CX) * leave;
        const by = CARD_CY + (110 - CARD_CY) * leave;
        const crash = skyPass(g, `${ID}:crashglow`, { ...skyParams(cam, W, H, 0, null), glows: [
          { x: bx, y: by, r: 1400, color: [250, 140, 50], a: 0.28 * a },
          { x: bx, y: by, r: 480, color: [255, 228, 190], a: 0.85 * a },
        ] }, f.frame);
        out = g.compose(g.rt(`${ID}:crashc`), C.INK, [{ tex: out }, { tex: crash, blend: 'add' }]);
      }
      const sh = 7 * Math.exp(-k / 0.1);
      f.post.shake = [Math.sin(k * 90) * sh, Math.cos(k * 77) * sh * 0.6];
    }
    return out;
  },
};

/**
 * Downbeat: the core goes white-hot and the light bursts outward — an orange-white radial flare
 * that is gone within ~2 frames, a shock ring and sparkles thrown out (12 fps). Drawn additively.
 */
function drawBurst(c: CanvasRenderingContext2D, k: number, x: number, y: number, r: number) {
  const rk = ease.outCubic(Math.min(1, k / 0.5));
  ring(c, x, y, r + 30 + 1000 * rk, 2.5 * (1 - rk) + 0.6, `rgba(255, 196, 120, ${0.85 * (1 - rk)})`);
  const k2 = Math.min(1, k / 0.3);
  ring(c, x, y, r + 8 + 480 * ease.outCubic(k2), 1.2, `rgba(255, 238, 210, ${0.55 * (1 - k2)})`);
  const th = hold(k, 12);
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2 + hash(i, 3) * 0.4;
    const d = r + 60 + (380 + 300 * hash(i, 4)) * ease.outCubic(Math.min(1, th / 0.45));
    const s = (10 + 14 * hash(i, 5)) * Math.max(0, 1 - th / 0.5);
    if (s > 0.5) sparkle(c, x + Math.cos(ang) * d, y + Math.sin(ang) * d, s, `rgba(255, 232, 196, ${Math.max(0, 1 - th / 0.5)})`);
  }
}

/** Lock-on brackets on the billboard a card is about to lift from ("a page opens"). */
function drawTarget(c: CanvasRenderingContext2D, d: CardDef, t: number) {
  const sl = layout.slots[d.slot!];
  const hgt = sl.w / (d.pw / d.ph);
  const right = new THREE.Vector3(Math.cos(sl.rotY), 0, -Math.sin(sl.rotY)).multiplyScalar(sl.w / 2);
  const up = new THREE.Vector3(0, hgt / 2, 0);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const p = project(cam, sl.pos.clone().addScaledVector(right, a).addScaledVector(up, b));
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  if (!isFinite(x0) || x1 < 0 || x0 > 1920) return;
  const k = seg(t, d.tLift - 0.22, d.tLift - 0.06, ease.outCubic);
  const a = Math.min(1, k * 2) * (1 - seg(t, d.tLift, d.tLift + 0.06));
  const pad = 6 + 60 * (1 - k);
  c.save();
  c.globalAlpha = a;
  brackets(c, x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2, 12, 2, d.accent);
  text(c, d.url, x0 - pad, y0 - pad - 10, { font: 'mono', size: 13, color: d.accent });
  c.restore();
}

/** Label row above the landed card: index cell, boxed name, typed URL; corner brackets. */
function drawLabel(c: CanvasRenderingContext2D, d: CardDef, t: number) {
  const k = seg(t, d.tLand - 1 / 60, d.tLand + 0.12, ease.outCubic);
  // stays while the next card flies in; gone just before this card launches away
  const out = seg(t, d.tExit - 0.05, d.tExit);
  const a = (1 - out) * Math.min(1, k * 3);
  if (a <= 0.01) return;
  const push = 1 + 0.03 * seg(t, d.tLand, d.tExit, ease.outQuad) + (t >= d.tLand ? 0.018 * Math.exp(-(t - d.tLand) / 0.07) : 0);
  const w = d.pw * push;
  const hgt = d.ph * push;
  const x0 = CARD_CX - w / 2;
  const y0 = CARD_CY - hgt / 2;
  c.save();
  c.globalAlpha = a;
  const off = 10 + 26 * (1 - k);
  brackets(c, x0 - off, y0 - off, w + off * 2, hgt + off * 2, 22, 2, d.accent);
  const ly = y0 - 34;
  const idx = String(d.index).padStart(2, '0');
  c.fillStyle = d.accent;
  c.fillRect(x0, ly - 15, 30, 30);
  text(c, idx, x0 + 15, ly + 1, { font: 'mono', size: 15, weight: 600, color: C.INK, align: 'center', baseline: 'middle' });
  text(c, `/${String(cards.length).padStart(2, '0')}`, x0 + 38, ly + 1, { font: 'mono', size: 13, color: '#9a98a6', baseline: 'middle' });
  const box = boxLabel(c, d.name.toUpperCase(), x0 + 82, ly, { size: 19, tracking: 0.28, color: C.WHITE, lw: 1.2, fillBox: 'rgba(10,10,11,0.55)' });
  const chars = Math.floor(6 + (t - d.tLand) / 0.016);
  const url = d.url.slice(0, Math.max(0, Math.min(d.url.length, chars)));
  const ux = box.x + box.w + 18;
  text(c, url, ux, ly + 1, { font: 'mono', size: 18, color: '#d9d7e2', baseline: 'middle' });
  if (url.length < d.url.length || Math.floor(t * 5) % 2 === 0) {
    const cw = measure(c, url, { font: 'mono', size: 18 });
    c.fillStyle = C.ORANGE;
    c.fillRect(ux + cw + 3, ly - 9, 9, 18);
  }
  c.restore();
}

/** Bar 60 beat 4: the boxed PUBLISH button; the orange dot flies in from the moon and clicks it. */
function drawPublish(c: CanvasRenderingContext2D, t: number, moonX: number, moonY: number) {
  // the box outline contracts from the Zen card's rect into the button, then the word appears
  const zen = cards[cards.length - 1];
  const morph = seg(t, zen.tExit, zen.tGone, ease.inOutCubic);
  if (t >= zen.tExit && t < zen.tGone) {
    const lbW = measure(c, 'PUBLISH', { font: 'wide', size: 46, tracking: 0.3 }) - 46 * 0.3 + 2 * 46 * 1.2;
    const lbH = 46 + 2 * 46 * 0.75;
    const w = zen.pw * 1.03 + (lbW - zen.pw * 1.03) * morph;
    const h = zen.ph * 1.03 + (lbH - zen.ph * 1.03) * morph;
    c.save();
    c.fillStyle = `rgba(10, 10, 11, ${0.6 * morph})`;
    c.fillRect(CARD_CX - w / 2, CARD_CY - h / 2, w, h);
    c.strokeStyle = C.ORANGE;
    c.lineWidth = 2;
    c.strokeRect(CARD_CX - w / 2, CARD_CY - h / 2, w, h);
    c.restore();
  }
  const appear = seg(t, zen.tGone - 0.017, zen.tGone + 0.05, ease.outBack);
  const clickT = T.click;
  const pressed = t >= clickT;
  const leave = seg(t, T.launch, T.launch + 0.35, ease.inOutCubic);
  const cx = CARD_CX + (160 - CARD_CX) * leave;
  const cy = CARD_CY + (110 - CARD_CY) * leave;
  const sc = (0.92 + 0.08 * appear) * (1 - 0.62 * leave) * (pressed && t < clickT + 0.08 ? 0.94 : 1);
  // the dot: leaves the moon on beat 4 and arcs over the last card to the button's edge
  if (t < clickT + 0.12) {
    const u = seg(t, T.dot, clickT, ease.inOutCubic);
    const tx = cx + 150;
    const ty = cy + 18;
    const px = moonX + (tx - moonX) * u;
    const py = moonY + (ty - moonY) * u - Math.sin(u * Math.PI) * 120;
    drawDot(c, px, py, 9, C.ORANGE, 18);
  }
  if (t < zen.tGone - 0.017) return;
  const hudOut = seg(t, 100.55, 100.9);
  c.save();
  c.globalAlpha = 1 - hudOut;
  // HUD readout next to the docked button: tiles docked into the moon (P1PE % tag)
  if (leave > 0.6) {
    const docked = swarm.flights.filter((fl) => fl.arr <= t).length;
    const n = swarm.flights.length;
    const k = seg(leave, 0.6, 1);
    const hx = cx + 98;
    c.fillStyle = `rgba(10, 10, 11, ${0.72 * k})`;
    c.fillRect(hx - 8, cy - 22, 300, 44);
    text(c, 'SHOWCASE · fumadocs.dev/showcase', hx, cy - 9, { font: 'mono', size: 13, color: `rgba(217, 215, 226, ${0.85 * k})`, baseline: 'middle' });
    text(c, `DOCKED ${String(docked).padStart(3, '0')}/${n}  ${((docked / n) * 100).toFixed(4)}%`, hx, cy + 11, { font: 'mono', size: 13, color: `rgba(250, 128, 35, ${k})`, baseline: 'middle' });
  }
  c.translate(cx, cy);
  c.scale(sc, sc);
  const lbl = boxLabel(c, 'PUBLISH', 0, 0, {
    size: 46,
    tracking: 0.3,
    align: 'center',
    color: pressed ? C.INK : C.WHITE,
    lw: 2,
    fillBox: pressed ? C.ORANGE : 'rgba(10,10,11,0.6)',
    ticks: true,
  });
  brackets(c, lbl.x - 16, lbl.y - 16, lbl.w + 32, lbl.h + 32, 18, 2, C.ORANGE);
  c.restore();
  if (pressed && t < clickT + 0.6) {
    const k = seg(t, clickT, clickT + 0.6, ease.outCubic);
    ring(c, cx, cy, 60 + 520 * k, 2 * (1 - k) + 0.5, `rgba(250, 128, 35, ${1 - k})`);
  }
}

const siteName = new Map(SITES.map((s) => [s.slug, s]));
const v3 = new THREE.Vector3();

/** Wall close-up: name tags pop on a few large tiles per beat (leader line + boxed name). */
function drawWallTags(c: CanvasRenderingContext2D, t: number) {
  let used = false;
  const beats = [T.wall, T.wall + 0.4, T.wall + 0.8, T.wall + 1.2];
  const mt = mosaicTiles();
  for (let b = 0; b < beats.length; b++) {
    const t0 = beats[b];
    if (t < t0 || t > t0 + 0.62) continue;
    const k = seg(t, t0, t0 + 0.1, ease.outCubic) * (1 - seg(t, t0 + 0.5, t0 + 0.62));
    // candidates: tiles that stay well inside the safe area (clear of the lyric band below y 790
    // and the credits top-right) for the tag's whole life, deterministic choice
    const cams = [camObj(t0), camObj(t0 + 0.31), camObj(t0 + 0.62)];
    const cand: { i: number; x: number; y: number }[] = [];
    for (let i = 0; i < mt.length; i++) {
      const fl = swarm.flights[i];
      if (fl.arr > t0) continue;
      // the tile must show the same site for the tag's whole life
      const sA = swarm.visibleSlug(i, t0);
      if (!sA || sA !== swarm.visibleSlug(i, t0 + 0.31) || sA !== swarm.visibleSlug(i, t0 + 0.62)) continue;
      let ok = true;
      for (const cb of cams) {
        v3.copy(fl.dock.pos).project(cb);
        const x = (v3.x * 0.5 + 0.5) * 1920;
        const y = (0.5 - v3.y * 0.5) * 1080;
        if (!(x > 300 && x < 1250 && y > 380 && y < 720)) ok = false;
      }
      if (ok) cand.push({ i, x: 0, y: 0 });
    }
    cand.sort((p, q) => hash(p.i, b) - hash(q.i, b));
    const picks = cand.slice(0, 2);
    for (const p of picks) {
      v3.copy(swarm.flights[p.i].dock.pos).project(cam);
      const x = (v3.x * 0.5 + 0.5) * 1920;
      const y = (0.5 - v3.y * 0.5) * 1080;
      const s = siteName.get(swarm.visibleSlug(p.i, t0)!)!;
      const label = s.name.toUpperCase();
      const bw = measure(c, label, { font: 'wide', size: 15, tracking: 0.26 }) + 36;
      const right = x + 70 + bw < 1840;
      const lx = right ? x + 70 : x - 70 - bw;
      const ly = y - 70;
      c.save();
      c.globalAlpha = k;
      line(c, x, y, right ? lx : lx + bw, ly, 1.5, C.ORANGE);
      c.fillStyle = C.ORANGE;
      c.fillRect(x - 3, y - 3, 6, 6);
      const box = boxLabel(c, label, lx, ly, { size: 15, tracking: 0.26, color: C.WHITE, lw: 1, fillBox: 'rgba(10,10,11,0.82)' });
      const hw = measure(c, s.host, { font: 'mono', size: 13 }) + 14;
      c.fillStyle = 'rgba(10,10,11,0.82)';
      c.fillRect(box.x, box.y + box.h, hw, 22);
      text(c, s.host, box.x + 7, box.y + box.h + 11.5, { font: 'mono', size: 13, color: '#e6e3f0', baseline: 'middle' });
      c.restore();
      used = true;
    }
  }
  return used;
}

export default scene;
