import * as THREE from 'three';
import type { Frame } from '../../engine/engine';
import { at } from '../../engine/time';
import { clamp, ease, lerp, seg, hash, hold } from '../../engine/anim';
import { text, measure, rect, crosshair, textArc } from '../../engine/draw2d';
import { render3D } from '../../engine/three-kit';
import { C } from '../_shared/palette';
import { drawDot } from '../_shared/moon';
import { swatch, mix, NAME, type Mode, type ThemeId, type Swatch } from '../_shared/theme-tokens';
import { plate, hiTex, PW, PH } from './plates';
import { pxCamera, pageMaterial } from './page3d';
import { silhouette } from './stage';
import { DECK_POSE } from './montage';
import { irisPath, irisRadius } from './masks';

/**
 * S6–S9 · the hook. The deck is dealt into a ring of 12 theme cards orbiting the giant README
 * (S6–S7: one leader per beat — the type and its repaint shockwave on beats 1/3, card flips on
 * the snares), the orange dot picks OCEAN (S8: the card snaps large and central, the other 11 peel
 * away on 8ths with smear trails over a kick-pulsing backdrop), and a smash-zoom rush lands it
 * maximised, full-bleed, ocean·dark, on ト (S9) — cli's window from 63.2.
 */
const W = 1920;
const H = 1080;
const T6 = at(37); // 57.6
const STEP = (Math.PI * 2) / 12;
const R = 760;
const CARD_S = 0.17;
/** card thickness in plate px (≈5 px on screen in the ring) */
const CARD_DEPTH = 24;
/** cover-flow: residual outward turn at the ring's sides, relative to facing the camera (≈20°) */
const COVER_YAW = 0.35;
const TILT0 = 0.36;
const TILT1 = 0.25;
let TILT = TILT0;
const RING_Y = 40;
const DUTCH = -0.1;

/** ring positions (front at 57.6 = purple, the deck's top card; ocean reaches the front at 61.2) */
export const RING_ORDER: ThemeId[] = ['purple', 'emerald', 'ruby', 'vitepress', 'dusk', 'ocean', 'aspen', 'catppuccin', 'solar', 'neutral', 'black', 'shadcn'];
const CHOSEN = RING_ORDER.indexOf('ocean');
export const CLICK_T = at(39, 2); // 61.2 (snare, み)
const RUSH0 = at(39, 4) + 0.2; // 62.2 ド — anticipation
const RUSH1 = at(40) + 0.0; // 62.4 キュ — the rush
export const LAND_T = at(40, 2) + 0.2; // 63.0 ト
export const DOT_HANDOFF = at(40, 3); // 63.2
/** presented pose of the chosen card (px units, frame centre origin, y up) */
const PRESENT = { x: 0, y: 70, s: 0.625 };
/** beats-1/3 hits of the hook: the type leads, the world repaints from it */
const TYPE_HITS = [at(37, 3), at(38), at(38, 3)]; // 58.4 リ · 59.2 (README) · 60.0
const SNARES = [at(37, 2), at(37, 4), at(38, 2), at(38, 4)];

// ── ring rotation (continuous; front card index = A) ────────────────────────
const V = CHOSEN / 3.4; // steps/s: linear over 57.6–60.8, quadratic stop 60.8–61.2
function ringA(t: number) {
  let a = -0.5 * (1 - ease.outCubic(seg(t, T6, T6 + 0.5)));
  a += V * clamp(t - T6, 0, 3.2);
  const u = clamp(t - at(39), 0, 0.4);
  a += V * (u - (u * u) / 0.8);
  return a; // = CHOSEN at 61.2
}

/** half-turns of the card flips (snares 58.0 … 60.4, a wave around the ring from the front) */
function flipHalfTurns(t: number, p: number) {
  let k = 0;
  for (const s of SNARES) {
    const d = (((p - ringA(s)) % 12) + 12) % 12;
    const t0 = s - 0.07 + Math.min(d, 12 - d) * 0.012;
    k += ease.inOutCubic(seg(t, t0, t0 + 0.16));
  }
  // the chosen card turns dark on 39.4 (62.0, snare)
  if (p === CHOSEN) k += ease.inOutCubic(seg(t, at(39, 4) - 0.09, at(39, 4) + 0.11));
  return k;
}

// ── objects ─────────────────────────────────────────────────────────────────
interface Card {
  id: ThemeId;
  pos: number;
  group: THREE.Group;
  mf: THREE.ShaderMaterial;
  mb: THREE.ShaderMaterial;
}

const scene = new THREE.Scene();
const cam = pxCamera(24);
const root = new THREE.Group();
const cards: Card[] = [];
let typePlane: THREE.Mesh;
let typeTex: THREE.CanvasTexture;
let typeCanvas: HTMLCanvasElement;
const TYPE_W = 2400;
const TYPE_H = 900;
/** the type rides in front of the ring (README dominates); sized to keep its screen size */
const TYPE_Z = 900;
const TYPE_UNITS = (1760 * (2540 - TYPE_Z)) / 2540;

export function setupRing() {
  scene.add(root);
  const g = new THREE.PlaneGeometry(PW, PH);
  // a physical card: thin box with an ink face frame and lit paper edges (top/left light,
  // bottom/right shaded) so flips and peels read as card stock, not cardboard
  const gb = new THREE.BoxGeometry(PW + 14, PH + 14, CARD_DEPTH);
  const mat = (c: string) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c) });
  const ink = mat(C.INK);
  const border = [mat('#c9c8c2'), mat(C.WHITE), mat(C.WHITE), mat('#8f8e88'), ink, ink];
  RING_ORDER.forEach((id, pos) => {
    const group = new THREE.Group();
    const mf = pageMaterial();
    const mb = pageMaterial();
    const front = new THREE.Mesh(g, mf);
    const back = new THREE.Mesh(g, mb);
    back.rotation.y = Math.PI;
    front.position.z = CARD_DEPTH / 2 + 0.6;
    back.position.z = -CARD_DEPTH / 2 - 0.6;
    group.add(new THREE.Mesh(gb, border), front, back);
    root.add(group);
    cards.push({ id, pos, group, mf, mb });
  });
  typeCanvas = document.createElement('canvas');
  typeCanvas.width = TYPE_W;
  typeCanvas.height = TYPE_H;
  typeTex = new THREE.CanvasTexture(typeCanvas);
  typeTex.colorSpace = THREE.SRGBColorSpace;
  typeTex.generateMipmaps = true;
  typeTex.minFilter = THREE.LinearMipmapLinearFilter;
  typeTex.anisotropy = 8;
  const tm = new THREE.MeshBasicMaterial({ map: typeTex, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide });
  tm.alphaToCoverage = true;
  typePlane = new THREE.Mesh(new THREE.PlaneGeometry(TYPE_UNITS, (TYPE_UNITS * TYPE_H) / TYPE_W), tm);
  root.add(typePlane);
}

// ── poses ───────────────────────────────────────────────────────────────────
interface Pose3 {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: number;
}
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** ring slot (root space) for ring angle phi with `half` flip turns */
function slot(phi: number, half: number): Pose3 {
  const v = new THREE.Vector3(Math.sin(phi) * R, 0, Math.cos(phi) * R).applyAxisAngle(X_AXIS, TILT);
  v.y += RING_Y;
  // cover-flow: the card counter-rotates as it orbits — it faces the camera and keeps only a
  // residual outward turn (≤ COVER_YAW) that follows the ring's curve; flips spin about local Y
  const q = facing(v).multiply(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, COVER_YAW * Math.sin(phi) + half * Math.PI));
  // far side: smaller rather than edge-on
  const depth01 = clamp((Math.cos(phi) + 1) / 2);
  return { p: v, q, s: CARD_S * lerp(0.8, 1, depth01) };
}

/** camera position in root space (updated per frame) */
const camLocal = new THREE.Vector3(0, 0, 2540);
const _look = new THREE.Matrix4();
/** orientation whose +z faces the camera from p, upright in root space */
function facing(p: THREE.Vector3): THREE.Quaternion {
  _look.lookAt(camLocal, p, Y_AXIS);
  return new THREE.Quaternion().setFromRotationMatrix(_look);
}

/** ring distance (in slots) of position p from the front at time t */
const ringDist = (p: number, a: number) => {
  const d = (((p - a) % 12) + 12) % 12;
  return Math.min(d, 12 - d);
};

/** dealt ring pose: deck → slot, plus a bob wave */
function ringPose(cd: Card, t: number): Pose3 {
  const A = ringA(t);
  const sl = slot((cd.pos - A) * STEP, flipHalfTurns(t, cd.pos));
  const d = cd.pos === 0 ? 0 : Math.min(cd.pos, 12 - cd.pos);
  const t0 = T6 + 0.015 + d * 0.022;
  const k = ease.outExpo(seg(t, t0, t0 + 0.42));
  const p = new THREE.Vector3(DECK_POSE.x, DECK_POSE.y, -cd.pos * 3).lerp(sl.p, k);
  p.z += Math.sin(k * Math.PI) * 120 * (cd.pos === 0 ? 0 : 1);
  p.y += Math.sin((t - T6) * Math.PI * 2 * 1.25 - cd.pos * (Math.PI / 3)) * 12 * k * (1 - seg(t, CLICK_T - 0.4, CLICK_T));
  const q = new THREE.Quaternion().slerp(sl.q, k);
  return { p, q, s: lerp(DECK_POSE.s, CARD_S, k) };
}

/** peel order: the far side first, the chosen card's neighbours last (8ths from the click) */
const PEEL_T = [CLICK_T, CLICK_T + 0.2, CLICK_T + 0.4, CLICK_T + 0.6];
function peelStart(cd: Card): number {
  const d = ringDist(cd.pos, CHOSEN);
  return PEEL_T[d >= 5 ? 0 : d >= 4 ? 1 : d >= 2 ? 2 : 3] + (cd.pos % 2) * 0.03;
}

/** peeling: from its ring pose the card is flung outward and toward the lens, spinning */
function peelPose(cd: Card, t: number): Pose3 | null {
  const tp = peelStart(cd);
  if (t < tp) return ringPose(cd, t);
  const u = seg(t, tp, tp + 0.42);
  if (u >= 1) return null;
  const base = ringPose(cd, tp);
  const out = new THREE.Vector3(base.p.x, base.p.y - RING_Y, base.p.z).setY(0).normalize();
  const side = Math.sign(out.x || 1);
  const e = u * u;
  const p = base.p.clone().add(new THREE.Vector3(out.x * 2100 * e + side * 300 * e, (380 + 300 * hash(cd.pos, 2)) * e, 900 * e));
  // stays camera-facing while flung: the spin is in the picture plane, the yaw stays small
  const half = Math.round(flipHalfTurns(tp, cd.pos));
  const spin = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, side * -2.4 * e).multiply(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, side * 0.3 * e + half * Math.PI));
  return { p, q: facing(p).multiply(spin), s: base.s * (1 + 0.5 * e) };
}

/** the chosen card: ring → snaps large & central on the click → flips dark on 62.0 → rush */
function chosenPose(t: number, rootScale: number): Pose3 {
  const cd = cards[CHOSEN];
  const r = ringPose(cd, t);
  const half = flipHalfTurns(t, CHOSEN);
  // snap (outBack) to the presented pose, facing the lens
  const k = seg(t, CLICK_T + 0.02, CLICK_T + 0.32, (x) => ease.outBack(x, 1.6));
  const kr = clamp(k);
  const present = new THREE.Vector3(PRESENT.x, PRESENT.y, 0);
  const pq = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, half * Math.PI);
  const p = r.p.clone().lerp(present, kr);
  const q = r.q.clone().slerp(pq, kr);
  let s = lerp(r.s, PRESENT.s / rootScale, k);
  // anticipation: eases back a touch, then the rush (accelerating, hard stop on ト)
  const ant = Math.sin(seg(t, RUSH0, RUSH1) * Math.PI * 0.5) * (1 - seg(t, RUSH1, RUSH1 + 0.15));
  s *= 1 - 0.05 * ant;
  const ru = ease.inCubic(seg(t, RUSH1, LAND_T));
  if (ru > 0) {
    p.lerp(new THREE.Vector3(0, 0, 0), ru);
    q.slerp(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, Math.PI), ru);
    s = lerp(s, 1.2 / rootScale, ru);
  }
  return { p, q, s };
}

// ── type ────────────────────────────────────────────────────────────────────
interface Mora {
  t: number;
  ch: string;
}
/** L10 onsets (real timing.json via f.e.audio; grid fallback) */
function l10(f: Frame): Mora[] {
  const lead = f.e.audio.timing.events.lead.filter((n) => n.line === 'L10');
  if (lead.length >= 10) return lead.map((n) => ({ t: n.t, ch: n.mora }));
  const kana = ['よ', 'ん', 'で', 'よ', 'リ', 'ー', 'ド', 'ミ', 'ー', 'き', 'み', 'だ', 'け', 'の', 'ド', 'キュ', 'メ', 'ン', 'ト'];
  const ts = [57.6, 57.9, 58.0, 58.2, 58.4, 58.7, 58.8, 59.0, 59.2, 60.8, 61.1, 61.4, 61.6, 61.8, 62.2, 62.4, 62.6, 62.8, 63.0];
  return kana.map((ch, i) => ({ t: ts[i], ch }));
}

function slam(t: number, t0: number) {
  const k = seg(t, t0 - 1 / 60, t0 + 0.14, (x) => ease.outBack(x, 2.4));
  return { a: clamp((t - t0 + 1 / 60) * 30), s: lerp(1.9, 1, k) };
}

/** punch on the beats-1/3 hits; README (38.1) is the hero hit */
function typePunch(t: number) {
  let k = 0;
  TYPE_HITS.forEach((th, i) => {
    if (t >= th) k = Math.max(k, Math.exp(-(t - th) / 0.11) * (i === 1 ? 0.16 : 0.07));
  });
  return k;
}

function drawType(f: Frame) {
  const t = f.t;
  const m = l10(f);
  const c = typeCanvas.getContext('2d')!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, TYPE_W, TYPE_H);
  const size = 470;
  const o = { font: 'display' as const, size, weight: 900, stretch: 'extra-condensed' as CanvasFontStretch, tracking: -0.01 };
  const letters = ['R', 'E', 'A', 'D', 'M', 'E'];
  const tIn = [m[0].t, m[1].t, m[2].t, m[3].t, m[4].t, m[4].t + 0.05];
  // READ ME → README: the gap closes on ド→ミ, the fused word lands on 38.1
  const gap = (1 - ease.inOutQuart(seg(t, m[6].t - 0.05, m[7].t))) * size * 0.3;
  const ws = letters.map((L) => measure(c, L, o));
  const total = ws.reduce((a, b) => a + b, 0) + gap;
  let x = TYPE_W / 2 - total / 2;
  const base = 470;
  const punch = 1 + typePunch(t);
  for (let i = 0; i < letters.length; i++) {
    const { a, s } = slam(t, tIn[i]);
    const w = ws[i];
    if (a > 0) {
      c.save();
      c.globalAlpha = a;
      c.translate(TYPE_W / 2 + (x + w / 2 - TYPE_W / 2) * punch, base);
      c.scale(s * punch, s * punch);
      text(c, letters[i], -w / 2, 0, { ...o, color: C.WHITE });
      c.restore();
    }
    x += w + (i === 3 ? gap : 0);
  }
  // katakana line: リードミー, one glyph per mora
  const kata = ['リ', 'ー', 'ド', 'ミ', 'ー'];
  const ko = { font: 'jpKaku' as const, size: 128, weight: 900 };
  const kw = kata.map((k) => measure(c, k, ko));
  let kx = TYPE_W / 2 - kw.reduce((a, b) => a + b, 0) / 2 - 40;
  for (let i = 0; i < 5; i++) {
    const { a, s } = slam(t, m[4 + i].t);
    if (a > 0) {
      c.save();
      c.globalAlpha = a;
      c.translate(kx + kw[i] / 2, 668);
      c.scale(s, s);
      text(c, kata[i], -kw[i] / 2, 0, { ...ko, color: C.WHITE });
      c.restore();
    }
    kx += kw[i] + 20;
  }
  typeTex.needsUpdate = true;
}

// ── world colour ────────────────────────────────────────────────────────────
/** visible mode of the front card at time t (cards flip on the snares) */
function frontSwatch(t: number): Swatch {
  const pos = ((Math.round(ringA(t)) % 12) + 12) % 12;
  const mode: Mode = Math.floor(flipHalfTurns(t, pos) + 0.5) % 2 ? 'dark' : 'light';
  return swatch(RING_ORDER[pos], mode);
}

const REPAINT_DUR = 0.26;
/** world: purple at the deal; repainted every 2 beats (58.4, 59.2, 60.0) from the type centre,
 * to ocean on the click (from the card), cut to ocean·dark on its flip (62.0) */
function worldAt(t: number): { from: Swatch; to: Swatch; p: number; origin: [number, number] } {
  const typeO: [number, number] = [W / 2, 470];
  const hits = [...TYPE_HITS, CLICK_T];
  // the hook's worlds stay saturated (light-mode primaries) so the paper README always reads
  const cols = [swatch('purple', 'light'), ...TYPE_HITS.map((h) => swatch(frontSwatch(h + 0.01).id, 'light'))];
  let k = -1;
  for (let i = 0; i < hits.length; i++) if (t >= hits[i]) k = i;
  if (k < 0) return { from: cols[0], to: cols[0], p: 1, origin: typeO };
  const p = seg(t, hits[k], hits[k] + REPAINT_DUR);
  if (k === hits.length - 1) {
    const mode: Mode = Math.floor(flipHalfTurns(t, CHOSEN) + 0.5) % 2 ? 'dark' : 'light';
    return { from: cols[k], to: swatch('ocean', mode), p, origin: [W / 2, 790] };
  }
  return { from: cols[k], to: cols[k + 1], p, origin: typeO };
}

// ── render ──────────────────────────────────────────────────────────────────
function project(v: THREE.Vector3): [number, number] {
  const q = v.clone().project(cam);
  return [(q.x * 0.5 + 0.5) * W, (-q.y * 0.5 + 0.5) * H];
}

function setPose(cd: Card, ps: Pose3) {
  cd.group.position.copy(ps.p);
  cd.group.quaternion.copy(ps.q);
  cd.group.scale.setScalar(ps.s);
}

/** screen quad of a card pose (for trails/annotation) */
function quadOf(ps: Pose3): [number, number][] {
  const m = new THREE.Matrix4().compose(ps.p, ps.q, new THREE.Vector3(ps.s, ps.s, ps.s));
  const mw = new THREE.Matrix4().multiplyMatrices(root.matrixWorld, m);
  return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => project(new THREE.Vector3((sx * PW) / 2, (sy * PH) / 2, 0).applyMatrix4(mw)));
}

export function renderRing(f: Frame): THREE.Texture {
  const { e, t } = f;
  const g = e.gfx;
  const wd = worldAt(t);
  const fs = wd.p < 0.5 ? wd.from : wd.to;
  TILT = lerp(TILT0, TILT1, ease.inOutQuad(seg(t, T6, CLICK_T)));

  // root: dutch eases in after the deal, slow push; released toward the presented card
  const push = seg(t, T6, at(39), ease.inOutQuad);
  const roll = seg(t, T6, T6 + 0.6, ease.inOutCubic) * (1 - seg(t, CLICK_T, CLICK_T + 0.4, ease.inOutCubic));
  root.rotation.set(0, 0, DUTCH * roll);
  root.scale.setScalar(lerp(1, 1.06, push));
  root.position.set(0, 0, 0);
  root.updateMatrixWorld();
  camLocal.set(0, 0, cam.position.z).applyMatrix4(new THREE.Matrix4().copy(root.matrixWorld).invert());

  // cards
  const chosen = cards[CHOSEN];
  for (const cd of cards) {
    const sel = cd === chosen;
    const ps = sel ? chosenPose(t, root.scale.x) : peelPose(cd, t);
    cd.group.visible = !!ps;
    if (!ps) continue;
    setPose(cd, ps);
    const big = sel && t >= CLICK_T;
    const pl = plate(cd.id, 'light');
    const pd = plate(cd.id, 'dark');
    cd.mf.uniforms.texA.value = big ? pl.mid : pl.card;
    cd.mb.uniforms.texA.value = big ? (t > RUSH1 ? hiTex(cd.id, 'dark') : pd.mid) : pd.card;
    cd.mf.uniforms.useMask.value = 0;
    cd.mb.uniforms.useMask.value = 0;
    // depth cue: far cards recede (the type is the hero)
    const wp = cd.group.getWorldPosition(new THREE.Vector3());
    const dim = sel && t >= CLICK_T ? 1 : lerp(0.5, 1, clamp((wp.z + R) / (2 * R)));
    // aerial perspective in the world colour: far cards sink into the field, README stays on top
    const sink = sel && t >= CLICK_T ? 0 : 0.55 * (1 - clamp((wp.z + R) / (2 * R)));
    for (const m of [cd.mf, cd.mb]) {
      m.uniforms.dim.value = dim;
      m.uniforms.tintCol.value.setStyle(fs.world);
      m.uniforms.tintAmt.value = sink;
    }
  }

  // type: at the ring centre; exits through the lens on 39.1
  const tx = ease.inCubic(seg(t, at(39), at(39) + 0.24));
  typePlane.visible = t < at(39) + 0.24;
  typePlane.position.set(0, ((RING_Y + 10) * (2540 - TYPE_Z)) / 2540, lerp(TYPE_Z, 2150, tx));
  typePlane.scale.setScalar(1 + 0.02 * f.e.audio.pulse('kick', t, 0.1) * (t > T6 + 0.3 ? 1 : 0));
  if (typePlane.visible) drawType(f);

  const tex3d = render3D(g, scene, cam, { key: 'theme:ring3d', ss: 2 });
  const rush = ease.inCubic(seg(t, RUSH1, LAND_T));
  const shadow = silhouette(g, tex3d, fs.shade, 'theme:ringShadow', 1 - rush);

  // back: world, repaint iris, hook HUD or the S8 backdrop, peel trails
  const BL = e.layer('theme:ringBack');
  const b = BL.begin(wd.to.world);
  drawWorld(b, f, wd);
  if (t >= CLICK_T) {
    // the S8 backdrop belongs to the new (ocean) world: clipped to its iris while it opens
    b.save();
    if (wd.p < 1) {
      b.beginPath();
      irisPath(b, wd.p, wd.origin);
      b.clip();
    }
    drawBackdrop(b, f, wd.to, chosenCentre(t, root.scale.x));
    b.restore();
  }
  drawTrails(b, t);
  const back = BL.end();

  // front: annotation + cursor
  const FL = e.layer('theme:ringFront');
  const fc = FL.begin();
  drawSelection(fc, t, fs.ink);
  drawCursor(fc, t);
  const front = FL.end();

  f.overlay.tone = rush > 0.5 ? 'dark' : fs.tone;
  (f.overlay as { accent?: string }).accent = fs.world;
  f.overlay.lyricStyle = 'subtitle';
  // post back to engine defaults for the landing (B5)
  f.post.vignette = lerp(0.1, 0.22, seg(t, 62.6, 63.0));

  let out = g.compose(g.rt('theme:ring'), null, [
    { tex: back },
    { tex: shadow, xform: { x: 18, y: 18 } },
    { tex: tex3d },
    { tex: front },
  ]);
  // the rush: radial (zoom) blur from the card centre, strongest on the last frames before ト
  if (rush > 0 && t < LAND_T) {
    const [cx, cy] = chosenCentre(t, root.scale.x);
    out = g.motionBlur(out, { amount: 0.16 * rush, center: [cx / W, 1 - cy / H] }, 'theme:rushBlur');
  }
  return out;
}

/** screen centre of the chosen card */
function chosenCentre(t: number, rootScale: number): [number, number] {
  const ps = chosenPose(t, rootScale);
  return project(ps.p.clone().applyMatrix4(root.matrixWorld));
}

function drawWorld(c: CanvasRenderingContext2D, f: Frame, wd: ReturnType<typeof worldAt>) {
  const t = f.t;
  if (wd.p < 1) {
    c.fillStyle = wd.from.world;
    c.fillRect(0, 0, W, H);
    c.beginPath();
    irisPath(c, wd.p, wd.origin);
    c.fillStyle = wd.to.world;
    c.fill();
    c.beginPath();
    c.arc(wd.origin[0], wd.origin[1], irisRadius(wd.p, wd.origin), 0, Math.PI * 2);
    c.lineWidth = 3;
    c.strokeStyle = wd.to.ink;
    c.stroke();
  }
  const fs = wd.p < 0.5 ? wd.from : wd.to;
  // hook HUD: projected orbit line, slot nodes, name arc (clears for the choice)
  const la = seg(t, T6 + 0.2, T6 + 0.6) * (1 - seg(t, CLICK_T - 0.1, CLICK_T + 0.15));
  if (la <= 0) return;
  const A = ringA(t);
  const pt = (phi: number) => {
    const v = new THREE.Vector3(Math.sin(phi) * R, 0, Math.cos(phi) * R).applyAxisAngle(X_AXIS, TILT);
    v.y += RING_Y;
    return project(v.applyMatrix4(root.matrixWorld));
  };
  c.save();
  c.globalAlpha = la;
  c.beginPath();
  for (let i = 0; i <= 96; i++) {
    const [x, y] = pt((i / 96) * Math.PI * 2);
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.lineWidth = 1.5;
  c.strokeStyle = fs.ink;
  c.stroke();
  for (let k = 0; k < 12; k++) {
    const [x, y] = pt((k - A) * STEP);
    rect(c, x - 4, y - 4, 8, 8, { fill: swatch(RING_ORDER[k], 'light').primary, stroke: fs.ink, lw: 1 });
  }
  const names = RING_ORDER.map((id) => NAME[id]).join(' · ') + ' · ';
  textArc(c, names, W / 2, 500, 600, -t * 0.25, { font: 'wide', size: 15, tracking: 0.3, color: fs.ink, alpha: 0.7 });
  for (const [x, y] of [[60, 60], [W - 60, 60], [60, 1020], [W - 60, 1020]] as [number, number][]) crosshair(c, x, y, 12, 1, fs.ink, 0);
  c.restore();
}

/** S8 backdrop: rotating sunburst from the chosen card, kick rings, mirrored giant OCEAN, rush lines */
function drawBackdrop(c: CanvasRenderingContext2D, f: Frame, fs: Swatch, ctr: [number, number]) {
  const t = f.t;
  const a = seg(t, CLICK_T, CLICK_T + 0.12, ease.outCubic);
  if (a <= 0) return;
  const kick = f.e.audio.pulse('kick', t, 0.12);
  const [cx, cy] = ctr;
  c.save();
  c.globalAlpha = a;
  // sunburst: 24 wedges alternating the world and a shade of it; contrast pulses on kicks
  const shade = mix(fs.world, fs.ink, 0.06 + 0.1 * kick);
  const rot = t * 0.18 + seg(t, RUSH1, LAND_T, ease.inCubic) * 1.2;
  c.fillStyle = shade;
  c.beginPath();
  for (let i = 0; i < 24; i += 2) {
    const a0 = rot + (i / 24) * Math.PI * 2;
    const a1 = rot + ((i + 1) / 24) * Math.PI * 2;
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(a0) * 2400, cy + Math.sin(a0) * 2400);
    c.lineTo(cx + Math.cos(a1) * 2400, cy + Math.sin(a1) * 2400);
    c.closePath();
  }
  c.fill();
  // mirrored giant OCEAN in the side columns (left reads up, right reads down)
  const word = mix(fs.world, fs.ink, 0.16);
  const o = { font: 'display' as const, size: 330, weight: 900, stretch: 'extra-condensed' as CanvasFontStretch, color: word };
  const wv = measure(c, 'OCEAN', o);
  c.save();
  c.translate(300, H / 2 + wv / 2);
  c.rotate(-Math.PI / 2);
  text(c, 'OCEAN', 0, 0, o);
  c.restore();
  c.save();
  c.translate(W - 300, H / 2 - wv / 2);
  c.rotate(Math.PI / 2);
  text(c, 'OCEAN', 0, 0, o);
  c.restore();
  // kick rings from the card
  for (const kt of [CLICK_T, at(39, 3), at(39, 4), at(40), at(40, 2)]) {
    const d = t - kt;
    if (d < 0 || d > 0.45) continue;
    const q = d / 0.45;
    c.beginPath();
    c.arc(cx, cy, 300 + 900 * ease.outCubic(q), 0, Math.PI * 2);
    c.lineWidth = 10 * (1 - q);
    c.strokeStyle = fs.ink;
    c.globalAlpha = a * 0.55 * (1 - q);
    c.stroke();
  }
  c.globalAlpha = a;
  // rush: radial speed lines streaking outward (on twos)
  const ru = seg(t, RUSH1 - 0.05, LAND_T);
  if (ru > 0 && t < LAND_T) {
    const th = hold(t, 30);
    c.strokeStyle = fs.ink;
    for (let i = 0; i < 60; i++) {
      const an = hash(i, 3) * Math.PI * 2;
      const r0 = 260 + 900 * hash(i, Math.floor(th * 30)) + 600 * ru;
      const len = 120 + 520 * ru * hash(i, 7);
      c.lineWidth = 1.5 + 3 * hash(i, 5);
      c.globalAlpha = a * 0.6 * ru;
      c.beginPath();
      c.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0);
      c.lineTo(cx + Math.cos(an) * (r0 + len), cy + Math.sin(an) * (r0 + len));
      c.stroke();
    }
  }
  c.restore();
}

/** flat smear trails behind the peeling cards (the swept area of the last 3 frames) */
function drawTrails(c: CanvasRenderingContext2D, t: number) {
  for (const cd of cards) {
    if (cd.pos === CHOSEN) continue;
    const tp = peelStart(cd);
    if (t < tp || t > tp + 0.42) continue;
    const now = peelPose(cd, t);
    const was = peelPose(cd, Math.max(tp, t - 3 / 60));
    if (!now || !was) continue;
    const pts = [...quadOf(was), ...quadOf(now)];
    const hull = convexHull(pts);
    const k = seg(t, tp, tp + 0.42);
    const sw = swatch(cd.id, 'light');
    c.save();
    c.globalAlpha = 0.55 * (1 - k * 0.6);
    c.fillStyle = sw.primary;
    c.beginPath();
    hull.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
    c.restore();
  }
}

function convexHull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** P1PE annotation on the presented card: snapping corner brackets + label under it */
function drawSelection(c: CanvasRenderingContext2D, t: number, ink: string) {
  const a = seg(t, CLICK_T + 0.26, CLICK_T + 0.36) * (1 - seg(t, RUSH0, RUSH0 + 0.2));
  if (a <= 0) return;
  const cd = cards[CHOSEN];
  const pts = quadOf({ p: cd.group.position, q: cd.group.quaternion, s: cd.group.scale.x });
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const snap = 1 - ease.outCubic(seg(t, CLICK_T + 0.26, CLICK_T + 0.42));
  const pad = 16 + 70 * snap;
  c.save();
  c.globalAlpha = a;
  c.lineWidth = 2.5;
  c.strokeStyle = ink;
  const L = 34;
  c.beginPath();
  for (const [cx, cy, dx, dy] of [[x0 - pad, y0 - pad, 1, 1], [x1 + pad, y0 - pad, -1, 1], [x1 + pad, y1 + pad, -1, -1], [x0 - pad, y1 + pad, 1, -1]]) {
    c.moveTo(cx, cy + dy * L);
    c.lineTo(cx, cy);
    c.lineTo(cx + dx * L, cy);
  }
  c.stroke();
  // label above the card (the peeling neighbours own the space below it)
  const mode = Math.floor(flipHalfTurns(t, CHOSEN) + 0.5) % 2 ? 'DARK' : 'LIGHT';
  const ly = y0 - pad - 34;
  text(c, '06', x0 - pad, ly, { font: 'mono', size: 16, color: ink, baseline: 'middle' });
  const w = text(c, 'OCEAN', x0 - pad + 34, ly + 2, { font: 'display', size: 44, weight: 800, stretch: 'condensed', color: ink, baseline: 'middle' });
  text(c, `${mode} · fumadocs-ui/css/ocean.css`, x0 - pad + 50 + w, ly + 3, { font: 'mono', size: 15, color: ink, baseline: 'middle', alpha: 0.85 });
  c.restore();
}

/** the orange dot: enters in bar 39, clicks ocean on 61.2, holds the card at its centre, rests */
function cursorPos(t: number): [number, number, number] | null {
  const t0 = at(39) + 0.06;
  if (t < t0 || t >= DOT_HANDOFF) return null;
  const click: [number, number] = [W / 2, 790];
  if (t < CLICK_T) {
    const p = seg(t, t0, CLICK_T, ease.inOutCubic);
    return [lerp(1560, click[0], p), lerp(-40, click[1], p) - Math.sin(p * Math.PI) * 140, 8];
  }
  // rides to the card centre as it snaps up, then holds it (at rest at (960,540) from 63.0)
  const ctr = chosenCentre(t, root.scale.x);
  const k = seg(t, CLICK_T + 0.02, CLICK_T + 0.3, ease.outCubic);
  return [lerp(click[0], ctr[0], k), lerp(click[1], ctr[1], k), lerp(8, 7, seg(t, RUSH1, LAND_T))];
}

function drawCursor(c: CanvasRenderingContext2D, t: number) {
  const k = cursorPos(t);
  if (!k) return;
  let r = k[2];
  const d = t - CLICK_T;
  if (d > -0.03 && d < 0.2) r *= 1 - 0.3 * Math.exp(-((d - 0.01) ** 2) / 0.0012);
  if (d >= 0 && d < 0.4) {
    const q = d / 0.4;
    c.beginPath();
    c.arc(W / 2, 790, 10 + 70 * ease.outCubic(q), 0, Math.PI * 2);
    c.lineWidth = 3 * (1 - q);
    c.strokeStyle = C.ORANGE;
    c.stroke();
  }
  drawDot(c, k[0], k[1], r, C.ORANGE);
}

/** S9 final: the maximised page, drawn exactly to the frame (B5 contract) */
export function renderFinal(f: Frame): THREE.Texture {
  const L = f.e.layer('theme:final');
  const c = L.begin(C.INK);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(plate('ocean', 'dark').src, 0, 0, W, H);
  if (f.t < DOT_HANDOFF) drawDot(c, W / 2, H / 2, 7, C.ORANGE);
  if (!f.boundary || f.boundary.isOwner) {
    f.overlay.tone = 'dark';
    f.overlay.lyricStyle = 'subtitle';
  }
  return L.end();
}
