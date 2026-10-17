import * as THREE from 'three';
import { clamp, ease, lerp, seg } from '../../engine/anim';
import { BEAT } from '../../engine/time';
import { audio } from '../../engine/audio';
import { BODY, type DrawStyle } from './builder';
import { camAt, distFor, type CamKey } from './cam';
import { lerpBox, type Box } from './geom';
import { CYCLE, LAYOUTS, ORDER, VH, VW, type LayoutId } from './layouts';
import { dotOf, geoOf, groupProgress, morph, still, type FrameState } from './morph';
import { CROPS, type El } from './geo';
import { heroThumb } from './herotoc';
import { CITY_KEYS, HERO_KEYS, HOP_T, NAME_KEYS, NAME_OUT, T, morphAt, nameReel, type MorphKey, type NameKey } from './timeline';

type V3 = [number, number, number];

/** Row layout: six frames side by side along +x, facing +z. */
export const PITCH = 1800;
export const HERO = 5;
/** Frontal framing: frame width on screen, frame centre screen y. */
export const FRAME_PX = 1060;
export const FRAME_SY = 424;
export const S0 = FRAME_PX / VW;
export const D0 = distFor(VW, FRAME_PX);
export const Y0 = -(540 - FRAME_SY) / S0; // camera target y for frontal framing
/** Ground plane the frames fall onto in the architecture phase. */
export const GROUND = -VH / 2;
/** Hero framing in bars 27–28: a little smaller and right of centre, leaving the left column for the name. */
export const HERO_PX = 1000;
export const HERO_SX = 1020;
export const HERO_SY = 440;

export interface Inst {
  k: number;
  id: LayoutId;
  fs: FrameState;
  M: THREE.Matrix4;
  st: DrawStyle;
}

/** A piece of a real capture riding a wireframe panel (viewport px of the frame instance). */
export interface Piece {
  k: number;
  id: LayoutId;
  /** source rect in the capture */
  src: [number, number, number, number];
  /** destination rect on the frame */
  dst: [number, number, number, number];
  /** elevation (panel top) */
  z: number;
  /** corner radius at the destination */
  r: number;
  a: number;
  /** opacity below the scan line (not yet revealed) */
  lo: number;
  /** scan line position 0..1 (top → bottom), 0 = none */
  scan: number;
  flick: number;
}

export interface World {
  insts: Inst[];
  cam: { pos: V3; tgt: V3; fov: number; roll: number; up?: V3 };
  /** white flash 0..1 */
  flash?: number;
  /** collapse ring (screen px radius) */
  ring?: { r: number; t: number };
  glow: number;
  floorA: number;
  pieces: Piece[];
  /** guide dot (world position, or screen override) */
  dot: { world?: V3; screen?: [number, number]; r: number; a: number; halo: number; trail?: V3[] };
  /** B3: heading ring unroll 0..1 (undefined = not drawn) */
  unroll?: number;
  /** labels for row frames: alpha per k */
  labels: number[];
  /** label expansion per k (name + package while the dot is on that frame) */
  labelFull: number[];
  /** the big layout name (title block): u = reel progress into `cur` (ends on cur.t) */
  name?: { cur: NameKey; prev?: NameKey; i: number; u: number; out: number };
  /** collapse progress 0..1 (49.6–50.4) */
  collapse: number;
  /** radial zoom smear toward a world point (camera rushes) */
  rush?: { amount: number; at: V3 };
  /** directional smear for fast camera swings (uv) */
  swing?: [number, number];
  /** tilt-shift style depth of field toward the frame edges (0..1) */
  dof: number;
  /** focal light pool on the ground around the hero (bars 30–31) */
  pool?: { x: number; y: number; z: number; a: number };
  black: boolean;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const standM = (k: number) => new THREE.Matrix4().makeTranslation(k * PITCH, 0, 0);

/**
 * Standing frame k tipped back by angle a (0 = standing, π/2 = lying face-up). A slab falls over
 * its back-bottom edge, so it lands on its back with the face BODY above the floor.
 */
function tiltM(k: number, a: number) {
  const m = new THREE.Matrix4().makeTranslation(k * PITCH, GROUND, -BODY);
  m.multiply(new THREE.Matrix4().makeRotationX(-a));
  m.multiply(new THREE.Matrix4().makeTranslation(0, -GROUND, BODY));
  return m;
}

/** Height of a lying slab's face, and the z of the lying hero's centre. */
export const LIE_Y = GROUND + BODY;
export const LIE_Z = GROUND - BODY;
/** A slab lying face-up on the floor, centred at (x, LIE_Y, z). */
function lyingM(x: number, z: number) {
  return new THREE.Matrix4().makeTranslation(x, LIE_Y, z).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
}

/** Ring box (B3) in frame-0 viewport px: the 300 px circle at screen (960, 540). */
const RING_R = 300 / S0;
const RING_CY = VH / 2 + (540 - FRAME_SY) / S0;
export const RING_BOX: Box = { x: VW / 2 - RING_R, y: RING_CY - RING_R, w: RING_R * 2, h: RING_R * 2, r: RING_R };
const FULL_BOX = (r: number): Box => ({ x: 0, y: 0, w: VW, h: VH, r });

/** Hero layout state with an optional delay (waves through the city). */
function heroState(t: number, keys: MorphKey[] = HERO_KEYS): { fs: FrameState; id: LayoutId; prev: LayoutId; u: number } {
  const m = morphAt(keys, t);
  const fs = m.u >= 1 ? still(m.to) : morph(m.from, m.to, m.u);
  return { fs, id: m.to, prev: m.from, u: m.u };
}

/** Layout of a row frame during the architecture phase: cycles with the hero, offset by k, delayed by distance. */
const N_CYCLE = CYCLE.length;
/** Offset into CYCLE that makes a frame showing `base` at the end of bar 28 (hero = Spacious) continue from it. */
export function cycleOffset(base: LayoutId) {
  return (CYCLE.indexOf(base) - CYCLE.indexOf('spacious') + N_CYCLE) % N_CYCLE;
}
function rowCycleKeys(offset: number, delay: number): MorphKey[] {
  return CITY_KEYS.map((key) => ({
    t: key.t < T.arch - 0.01 ? key.t : key.t + delay,
    to: CYCLE[(CYCLE.indexOf(key.to) + offset) % N_CYCLE],
    dur: key.dur,
  }));
}

// ── camera ──────────────────────────────────────────────────────────────────

const HX = HERO * PITCH;
type CamS = { pos: V3; tgt: V3; fov: number; roll: number; up?: V3 };

const inOutSine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);

const frontalOn = (k: number, dz = 1): CamS => ({ pos: [k * PITCH, Y0, D0 * dz], tgt: [k * PITCH, Y0, 0], fov: 30, roll: 0 });

function lerpCam(a: CamS, b: CamS, u: number): CamS {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const l3 = (p: V3, q: V3): V3 => [lerp(p[0], q[0], u), lerp(p[1], q[1], u), lerp(p[2], q[2], u)];
  return { pos: l3(a.pos, b.pos), tgt: l3(a.tgt, b.tgt), fov: lerp(a.fov, b.fov, u), roll: lerp(a.roll, b.roll, u) };
}

/** Frontal camera on frame k so it spans `px` screen px with its centre at (sx, sy). */
function frontalAt(k: number, px: number, sx: number, sy: number): CamS {
  const s = px / VW;
  const d = distFor(VW, px);
  const ox = (960 - sx) / s;
  const oy = (sy - 540) / s;
  return { pos: [k * PITCH + ox, oy, d], tgt: [k * PITCH + ox, oy, 0], fov: 30, roll: 0 };
}

/** Lineup (bar 26): far enough that the whole row reads at similar sizes, drifting right. */
const WIDE: CamS = { pos: [600, 1500, 9400], tgt: [4700, -420, 0], fov: 30, roll: 0 };
const WIDE_V: V3 = [520, 0, 0];
/** Rush from the wide shot into HOME on the last 8th of bar 26. */
export const RUSH0 = HOP_T[3] + 0.04; // the dot lands on 05 SPACIOUS (41.0) before the camera leaves
export const HERO_CAM = frontalAt(HERO, HERO_PX, HERO_SX, HERO_SY);

function rowCam(t: number): CamS {
  const A = frontalOn(0, lerp(1, 1.04, seg(t, T.start, T.pull, inOutSine)));
  if (t < T.pull) return A;
  const dt = t - T.b26;
  const wide: CamS = {
    pos: [WIDE.pos[0] + WIDE_V[0] * dt, WIDE.pos[1] + WIDE_V[1] * dt, WIDE.pos[2] + WIDE_V[2] * dt],
    tgt: [WIDE.tgt[0] + WIDE_V[0] * dt, WIDE.tgt[1], WIDE.tgt[2]],
    fov: WIDE.fov,
    roll: 0,
  };
  let c = lerpCam(frontalOn(0, 1.04), wide, seg(t, T.pull, T.b26 + 0.04, ease.inOutCubic));
  c = lerpCam(c, HERO_CAM, seg(t, RUSH0, T.arrive, ease.inOutQuart));
  if (t <= T.arrive) return c;
  // C: slow orbit + push-in on the hero while it rearranges (around the shifted framing)
  const u = seg(t, T.arrive, T.arch, inOutSine);
  const yaw = lerp(0, 0.1, u) - 0.05 * Math.sin(u * Math.PI);
  const d = HERO_CAM.pos[2] * lerp(1, 0.95, u);
  const [tx, ty] = HERO_CAM.tgt;
  return {
    pos: [tx + Math.sin(yaw) * d, ty + 40 * Math.sin(u * Math.PI), Math.cos(yaw) * d],
    tgt: [tx, ty, 0],
    fov: 30,
    roll: 0,
  };
}

/** Orbit keys around the hero plan (bars 29–31): [t, azimuth, elevation, distance]. */
const ORBIT: CamKey[] = [
  { t: T.arch, pos: [0.11, 0, D0 * 0.94], tgt: [0, 0, 0], stop: true },
  { t: T.arch + 0.6, pos: [0.3, 0.9, 3300], tgt: [0, 0, 0] },
  { t: T.b30, pos: [0.78, 1.0, 3500], tgt: [0, 0, 0] },
  { t: T.b31, pos: [1.95, 1.1, 4600], tgt: [0, 0, 0] },
  { t: T.collapse, pos: [4.1, 1.3, 4900], tgt: [0, 0, 0] },
  { t: T.a, pos: [Math.PI * 2, Math.PI / 2, distFor(VW, 800)], tgt: [0, 0, 0], stop: true },
];

/** Architecture orbit (44.8–49.6) around the hero lying on the ground; continuous with rowCam at 44.8. */
function orbitCam(t: number): CamS {
  const base = rowCam(T.arch);
  const u = seg(t, T.arch, T.arch + 0.6, ease.inOutCubic);
  const C: V3 = [HX, LIE_Y, LIE_Z];
  const tgt: V3 = [lerp(base.tgt[0], C[0], u), lerp(base.tgt[1], C[1], u), lerp(base.tgt[2], C[2], u)];
  const o = camAt(ORBIT, Math.min(t, T.a));
  const [az, el, R] = o.pos;
  const pos: V3 = [tgt[0] + Math.sin(az) * Math.cos(el) * R, tgt[1] + Math.sin(el) * R, tgt[2] + Math.cos(az) * Math.cos(el) * R];
  const roll = 0.1 * seg(t, T.b31, T.collapse, ease.inOutCubic) * (1 - seg(t, T.collapse, T.collapse + 0.3)) * Math.sin((t - T.b31) * 3.2);
  const up: V3 = [-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el)];
  const fov = 30 + 5 * seg(t, T.b31, T.collapse, ease.inCubic) * (1 - seg(t, T.collapse, T.a, ease.inOutCubic));
  return { pos, tgt, fov, roll, up };
}

// ── world at t ──────────────────────────────────────────────────────────────

export function worldAt(t: number): World {
  const w: World = {
    insts: [],
    cam: rowCam(t),
    glow: 1,
    floorA: 0,
    pieces: [],
    dot: { r: 7, a: 1, halo: 0 },
    labels: [0, 0, 0, 0, 0, 0],
    labelFull: [1, 0, 0, 0, 0, 0],
    collapse: 0,
    black: false,
    dof: 0,
  };
  w.name = nameAt(t);
  if (t >= T.dot) {
    w.black = true;
    w.dot = { screen: [960, 540], r: 7, a: 1, halo: 1 };
    return w;
  }

  // ── A · square-off (38.4–39.6) ───────────────────────────────────────────
  if (t < T.pull) {
    // two overlapping stages: the circle squares off, then stretches into the 16:10 viewport
    const ur = seg(t, T.start, T.start + 0.24, ease.outCubic);
    const uw = seg(t, T.start + 0.05, T.start + 0.42, ease.outCubic);
    const full = FULL_BOX(12);
    const sq = Math.max(RING_BOX.w, VH);
    const mid = { x: VW / 2 - sq / 2, y: lerp(RING_BOX.y, 0, 0.5), w: sq, h: sq, r: 40 };
    const box: Box = {
      x: lerp(lerp(RING_BOX.x, mid.x, ur), full.x, uw),
      y: lerp(lerp(RING_BOX.y, mid.y, ur), full.y, uw),
      w: lerp(lerp(RING_BOX.w, mid.w, ur), full.w, uw),
      h: lerp(lerp(RING_BOX.h, mid.h, ur), full.h, uw),
      r: lerp(lerp(RING_BOX.r, mid.r, ur), full.r, uw),
    };
    const u = uw;
    w.insts.push({
      k: 0,
      id: 'docs',
      fs: still('docs'),
      M: standM(0),
      st: {
        inten: 1,
        heat: 0,
        frameOn: 1,
        frameBox: box,
        edgeOn: seg(t, T.b25_2, T.b25_2 + 0.3, ease.outCubic),
        contentOn: seg(t, T.b25_2 + 0.12, T.pull, ease.linear),
        fillA: seg(t, T.start + 0.03, T.start + 0.3),
        panelFillA: seg(t, T.b25_2, T.b25_2 + 0.25),
        skip: ['toc'],
      },
    });
    w.glow = seg(t, T.start + 0.02, T.start + 0.3);
    w.unroll = 1;
    // dot rides the outline's top-centre, then runs along the top edge into the TOC rail
    const topY = box.y;
    const d = heroThumb(); // the TOC thumb: end of the active path (Layouts › Docs)
    const v = seg(t, T.b25_2, T.b25_3, ease.inOutCubic);
    const px = lerp(VW / 2, d[0], clamp(v * 1.6));
    const py = lerp(topY, d[1], clamp(v * 1.6 - 0.6));
    w.dot = { world: local(standM(0), px, py, 3), r: 7, a: 1, halo: 0.3 * u };
    w.labels[0] = seg(t, T.b25_3, T.b25_3 + 0.2);
    return w;
  }

  // ── B · lineup (39.6–41.2) and C · rearrange (41.2–44.8) ─────────────────
  if (t < T.arch) {
    // kick punch: a 1.2 % dolly toward the target on every kick (from bar 25 beat 2 on)
    if (t > T.b25_2) {
      const k = 0.012 * audio.pulse('kick', t, 0.1);
      const c = w.cam;
      c.pos = [lerp(c.pos[0], c.tgt[0], k), lerp(c.pos[1], c.tgt[1], k), lerp(c.pos[2], c.tgt[2], k)];
    }
    for (let k = 0; k < 6; k++) {
      const t0 = T.pull + 0.1 + 0.1 * (k - 1);
      const on = k === 0 ? 1 : seg(t, t0, t0 + 0.32, ease.outCubic);
      if (on <= 0) continue;
      let fs = still(ORDER[k]);
      let id = ORDER[k];
      if (k === HERO) {
        const h = heroState(t);
        fs = h.fs;
        id = h.id;
      }
      // focus: once the camera settles on the hero the rest of the row goes (the left column
      // belongs to the layout name in bars 27–28)
      const focus = k === HERO ? 1 : 1 - seg(t, T.arrive - 0.12, T.arrive + 0.2);
      if (focus <= 0.002) continue;
      // the dot lights each frame as it lands
      const lit = dotLit(t, k);
      w.insts.push({
        k,
        id,
        fs,
        M: standM(k),
        st: {
          // objecthood: every frame is a slab as soon as the camera leaves the frontal view
          body: BODY * seg(t, T.pull - 0.05, T.pull + 0.08),
          inten: focus * (0.85 + 0.35 * lit),
          heat: 0.25 * lit,
          frameOn: on,
          edgeOn: k === 0 ? 1 : seg(t, t0 + 0.1, t0 + 0.4, ease.outCubic),
          contentOn: k === 0 ? 1 : seg(t, t0 + 0.14, t0 + 0.7),
          fillA: on * focus,
          skip: k === 0 && t < T.pull + 0.25 ? ['toc'] : undefined,
        },
      });
      w.labels[k] = (k === 0 ? 1 : seg(t, t0 + 0.1, t0 + 0.3)) * (1 - seg(t, RUSH0 - 0.04, RUSH0 + 0.1));
      // roll call: the number tag lights while the dot sits on the frame
      const land = k === 0 ? -1 : DOT_T[k] - 0.04;
      const leave = k < 5 ? DOT_T[k + 1] - 0.04 : 1e9;
      w.labelFull[k] = seg(t, land, land + 0.05) * (1 - seg(t, leave, leave + 0.06));
    }
    if (t < T.pull + 0.3) w.unroll = 1 - seg(t, T.pull, T.pull + 0.25);
    // the swing from frontal to the row is fast: smear it sideways (velocity of inOutCubic)
    const su = (t - T.pull) / (T.b26 + 0.06 - T.pull);
    if (su > 0 && su < 1) {
      const v = su < 0.5 ? 12 * su * su : 12 * (1 - su) * (1 - su);
      w.swing = [-0.012 * Math.max(0, v - 0.4), 0.001 * v];
    }
    const ru = seg(t, RUSH0, T.arrive);
    if (ru > 0 && ru < 1) w.rush = { amount: 0.16 * Math.sin(ru * Math.PI) ** 1.5, at: [HX, 0, 0] };
    w.floorA = seg(t, T.pull, T.b26);
    // screenshot projection on the hero
    heroPieces(t, w);
    dotPath(t, w);
    return w;
  }

  // ── D · architecture (44.8–49.6) and E · collapse (49.6–50.4) ────────────
  w.cam = orbitCam(t);
  // the riser drives heat and glow; kicks pump the buildings
  const fx = audio.env('fx', t);
  const heat = Math.min(0.9, 0.25 * seg(t, T.b30, T.b31) + 1.6 * fx);
  const pump = 1 + 0.14 * audio.pulse('kick', t, 0.14);
  w.glow = 1 + 1.3 * fx + 0.25 * audio.env('kick', t);
  for (let k = 0; k < 6; k++) {
    const dist = Math.abs(k - HERO);
    const ta = T.arch + 0.05 * dist;
    const tilt = (Math.PI / 2) * seg(t, ta, ta + 0.5, ease.inOutCubic);
    const keys = k === HERO ? HERO_KEYS : rowCycleKeys(cycleOffset(ORDER[k]), 0.06 * dist);
    const h = heroState(t, keys);
    const M = tiltM(k, tilt);
    w.insts.push({
      k,
      id: h.id,
      fs: h.fs,
      M,
      st: {
        body: BODY,
        // the row comes back as the frames tip over into the city
        inten: k === HERO ? 1.12 : 0.8 * seg(t, T.arch, T.arch + 0.35) * (1 - 0.3 * seg(t, T.b30, T.b31)),
        heat: k === HERO ? Math.min(1, heat + 0.35 * seg(t, T.b30, T.b31)) : heat * 0.85,
        frameOn: 1,
        edgeOn: 1,
        contentOn: 1,
        fillA: k === HERO ? 1 : seg(t, T.arch, T.arch + 0.3),
        extrude: 190 * seg(t, ta + 0.25, ta + 0.7, ease.outBack) * pump,
      },
    });
  }
  // the city grows around the row in bar 30–31
  city(t, w, heat);
  // one focal point: a pool of orange light around the hero, kicked on every beat
  const pa = seg(t, T.b30 + 0.2, T.b31 + 0.4, ease.inOutCubic) * (1 - seg(t, T.collapse, T.collapse + 0.12));
  if (pa > 0.002) w.pool = { x: HX, y: GROUND + 1, z: LIE_Z, a: pa * (0.55 + 0.45 * audio.pulse('kick', t, 0.18)) };
  w.dof = seg(t, T.arch + 0.3, T.arch + 1.0) * (1 - seg(t, T.collapse, T.collapse + 0.25));
  w.floorA = 1 - seg(t, T.arch + 0.75, T.arch + 1.5);
  if (t >= T.collapse) collapse(t, w);
  return w;
}

function nameAt(t: number): World['name'] {
  const start = (i: number) => NAME_KEYS[i].t - nameReel(i);
  if (t < start(0) || t >= NAME_OUT + 0.4) return undefined;
  let i = 0;
  while (i + 1 < NAME_KEYS.length && start(i + 1) <= t) i++;
  const u = clamp((t - start(i)) / nameReel(i));
  return { cur: NAME_KEYS[i], prev: NAME_KEYS[i - 1], i, u, out: seg(t, NAME_OUT, NAME_OUT + 0.25) };
}

/** World position of viewport px (x, y, z) under placement M. */
export function local(M: THREE.Matrix4, x: number, y: number, z: number): V3 {
  const v = new THREE.Vector3(x - VW / 2, VH / 2 - y, z).applyMatrix4(M);
  return [v.x, v.y, v.z];
}

/** Dot hop schedule across the row (bar 26): lands on frame k at DOT_T[k]. */
const DOT_T = [T.b25_3, ...HOP_T];
/** Flight time of the hop into frame k (shorter on the 8ths). */
const hopDur = (k: number) => Math.min(0.2, 0.6 * (DOT_T[k] - DOT_T[k - 1]));
function dotLit(t: number, k: number) {
  const tk = DOT_T[k];
  if (t < tk) return 0;
  return Math.exp(-(t - tk) / 0.25);
}

function dotAnchor(k: number): V3 {
  return local(standM(k), ...dotOf(ORDER[k]), 3);
}

function dotPath(t: number, w: World) {
  // the hop k-1 → k flies during [DOT_T[k] - hopDur(k), DOT_T[k]]
  let k = 0;
  for (let j = 1; j < 6; j++) if (t >= DOT_T[j] - hopDur(j)) k = j;
  let pos = dotAnchor(k);
  if (k >= 1) {
    const u = seg(t, DOT_T[k] - hopDur(k), DOT_T[k], ease.inOutCubic);
    if (u < 1) {
      const a = dotAnchor(k - 1);
      const b = pos;
      const arc = Math.sin(u * Math.PI) * 520;
      pos = [lerp(a[0], b[0], u), lerp(a[1], b[1], u) + arc, lerp(a[2], b[2], u) + arc * 0.4];
    }
  }
  // on the hero the dot follows the layout's anchor through each morph
  if (k === HERO && t >= T.b27 - 0.05) {
    const m = morphAt(HERO_KEYS, t);
    const u = clamp(m.u * 1.3);
    const a = dotOf(m.from);
    const b = dotOf(m.to);
    const e = ease.inOutCubic(u);
    const lift = Math.sin(u * Math.PI) * 60;
    pos = local(standM(HERO), lerp(a[0], b[0], e), lerp(a[1], b[1], e) - lift, 3 + lift * 0.5);
  }
  w.dot = { world: pos, r: 7, a: 1, halo: 0.35 };
}

/** Real-UI projection on the hero: the captures ride the moving panels (dim while they move) and
 * lock back in behind a scan line once the panels settle. */
const LO_LEVEL = 0.12;
function heroPieces(t: number, w: World) {
  // HOME's capture scans on from the top as the rush lands (nothing before: no 1-frame pop)
  if (t < T.arrive) return;
  const inst = w.insts.find((i) => i.k === HERO);
  if (!inst) return;
  const m = morphAt(HERO_KEYS, t);
  const key = HERO_KEYS[m.idx];
  const first = m.idx === 0;
  const keyT = first ? T.arrive : key.t;
  // the real capture locks back in on the following 8th (the panels have landed by then)
  const settleT = first ? T.arrive : key.t + Math.min(key.dur * 0.85, BEAT / 2);
  const out = 1 - seg(t, T.arch - 0.05, T.arch + 0.15);
  if (out <= 0.003) return;
  if (key.soft) {
    // a UI state change of the same layout: the real captures crossfade (the previous capture's
    // scan keeps running underneath), nothing re-locks
    const x = ease.inOutCubic(m.u);
    const prev = HERO_KEYS[m.idx - 1];
    const ps = prev.t + prev.dur * 0.85;
    const pscan = t >= ps ? seg(t, ps, ps + 0.2, ease.outCubic) : 0;
    softPieces(w, inst, m.from, 1 - x, out, pscan);
    softPieces(w, inst, m.to, x, out, 0);
    return;
  }
  // while panels move: the capture dims; at the settle a scan line sweeps the full capture back in
  const dim = first ? 1 : 1 - (1 - LO_LEVEL) * seg(t, keyT, keyT + 0.05);
  const locking = t >= settleT;
  const scan = locking ? seg(t, settleT, settleT + 0.2, ease.outCubic) : 0;
  const lo = first ? 0 : LO_LEVEL;
  const flick = Math.exp(-Math.max(0, t - (locking ? settleT : keyT)) / 0.05) * (first && !locking ? 0 : 1);
  const panels = new Map(inst.fs.els.filter((e) => e.k === 'panel').map((e) => [e.key, e]));
  const add = (id: LayoutId, alphaOf: (e: El) => number, isTo: boolean) => {
    const L = geoOf(id);
    for (const c of CROPS[LAYOUTS[id].geo] ?? []) {
      const gL = L.els.find((e) => e.key === c.panel);
      const gNow = panels.get(c.panel);
      if (!gL || !gNow) continue;
      const { src, dst } = cropOn(c, gL, gNow);
      const ga = alphaOf(gNow) * out;
      if (ga <= 0.003 || dst[2] <= 1 || dst[3] <= 1) continue;
      const z = (gNow.z ?? 0) + (gNow.t ?? 2) + 0.3;
      const r = c.r;
      if (isTo && locking && scan < 1) w.pieces.push({ k: HERO, id, src, dst, z, r, a: ga, lo: ga * lo, scan, flick });
      else w.pieces.push({ k: HERO, id, src, dst, z, r, a: ga * (locking && isTo ? 1 : dim), lo: ga * (locking && isTo ? 1 : dim), scan: 0, flick });
    }
  };
  if (!first && m.u < 1) {
    add(m.from, (e) => 1 - groupProgress(e.g, m.u), false);
    add(m.to, (e) => groupProgress(e.g, m.u), true);
  } else add(m.to, () => 1, true);
}

/**
 * Where a capture crop sits on a (possibly moving) panel: 1:1 scale, anchored at the panel's
 * top-left, cropped by the panel — real UI is never stretched.
 */
function cropOn(c: { rect: [number, number, number, number] }, gL: El, gNow: El) {
  const ox = c.rect[0] - gL.x;
  const oy = c.rect[1] - gL.y;
  const w = Math.max(0, Math.min(c.rect[2], gNow.w - ox));
  const h = Math.max(0, Math.min(c.rect[3], gNow.h - oy));
  return {
    src: [c.rect[0], c.rect[1], w, h] as [number, number, number, number],
    dst: [gNow.x + ox, gNow.y + oy, w, h] as [number, number, number, number],
  };
}

function softPieces(w: World, inst: Inst, id: LayoutId, a: number, out: number, scan: number) {
  if (a * out <= 0.003) return;
  const L = geoOf(id);
  const panels = new Map(inst.fs.els.filter((e) => e.k === 'panel').map((e) => [e.key, e]));
  for (const c of CROPS[LAYOUTS[id].geo] ?? []) {
    const gL = L.els.find((e) => e.key === c.panel);
    const gNow = panels.get(c.panel);
    if (!gL || !gNow) continue;
    const { src, dst } = cropOn(c, gL, gNow);
    if (dst[2] <= 1 || dst[3] <= 1) continue;
    const z = (gNow.z ?? 0) + (gNow.t ?? 2) + 0.3;
    const lo = scan > 0 && scan < 1 ? LO_LEVEL : 1;
    w.pieces.push({ k: inst.k, id, src, dst, z, r: c.r, a: a * out, lo: a * out * lo, scan: scan < 1 ? scan : 0, flick: 0 });
  }
}

// ── city (bars 30–31) ───────────────────────────────────────────────────────

const CITY: { i: number; j: number; d: number; o: number }[] = (() => {
  const out: { i: number; j: number; d: number; o: number }[] = [];
  for (let j = -3; j <= 3; j++) {
    for (let i = -7; i <= 3; i++) {
      if (j === 0 && i >= -5 && i <= 0) continue;
      const d = Math.hypot(i * 1.0, j * 0.75);
      out.push({ i, j, d, o: (((i * 2 + j * 5) % 9) + 9) % 9 });
    }
  }
  return out.sort((a, b) => a.d - b.d);
})();

function city(t: number, w: World, heat: number) {
  for (const c of CITY) {
    const tc = T.b30 - 0.1 + 0.15 * (c.d - 1);
    if (t <= tc) continue;
    const rise = seg(t, tc, tc + 0.45, ease.outBack);
    const keys = rowCycleKeys(c.o % N_CYCLE, 0.05 * c.d);
    const h = heroState(t, keys);
    const M = lyingM(HX + c.i * PITCH, LIE_Z - c.j * 1250);
    const far = c.d > 3.5;
    w.insts.push({
      k: 100 + w.insts.length,
      id: h.id,
      fs: h.fs,
      M,
      st: {
        body: BODY,
        inten: 0.5 * clamp(rise) * (far ? 0.7 : 1),
        heat: heat * 0.75,
        contentA: 0.7,
        frameOn: clamp(rise),
        edgeOn: clamp(rise),
        contentOn: far ? 0 : clamp(rise),
        fillA: clamp(rise * 2),
        extrude: 160 * rise,
      },
    });
  }
}

// ── E · collapse (49.6–50.4) ────────────────────────────────────────────────

/** Screen scale (px per viewport px) of the hero when the camera sits overhead (frame 800 px wide). */
export const TOP_S = 800 / VW;
const RING0 = 250;
/** Ring radius on screen: the stacked frame rounds into a ring, which contracts to the dot. */
export function collapseRing(t: number): number {
  const shrink = seg(t, T.a + 0.16, T.dot - 0.03, ease.inQuart);
  return lerp(RING0, 6, shrink);
}

function collapse(t: number, w: World) {
  const u = seg(t, T.collapse, T.dot);
  w.collapse = u;
  const C = new THREE.Vector3(HX, LIE_Y, LIE_Z);
  w.flash = t < T.collapse + 0.012 ? 0.18 : 0;
  // everything flattens on さ, spirals into the hero, which clicks upright on あ
  const flat = 1 - seg(t, T.collapse, T.collapse + 0.12, ease.outCubic);
  const p = seg(t, T.collapse + 0.03, T.a, ease.inCubic);
  // the stacked frame rounds into the ring, which contracts to the dot
  const round = seg(t, T.a, T.a + 0.16, ease.outCubic);
  const ringPx = collapseRing(t);
  const ringR = ringPx / TOP_S;
  for (const inst of w.insts) {
    inst.st.extrude = (inst.st.extrude ?? 0) * flat;
    inst.st.heat = lerp(inst.st.heat, 1, seg(t, T.collapse, T.collapse + 0.3));
    if (inst.k === HERO) {
      inst.st.inten = 1 + 0.5 * p;
      inst.st.contentOn = 1 - seg(t, T.a - 0.12, T.a + 0.04);
      inst.st.edgeOn = 1 - seg(t, T.a - 0.05, T.a + 0.1);
      inst.st.panelFillA = 1 - seg(t, T.a - 0.1, T.a);
      inst.st.fillA = 1 - seg(t, T.a + 0.05, T.a + 0.2);
      if (round > 0) {
        const full = { x: 0, y: 0, w: VW, h: VH, r: 12 };
        const ring = { x: VW / 2 - ringR, y: VH / 2 - ringR, w: ringR * 2, h: ringR * 2, r: ringR };
        const R0 = RING0 / TOP_S;
        inst.st.frameBox = round < 1 ? lerpBox(full, { x: VW / 2 - R0, y: VH / 2 - R0, w: R0 * 2, h: R0 * 2, r: R0 }, round) : ring;
      }
      continue;
    }
    // spiral into the hero's plot, fading as they stack onto it
    const e = inst.M.elements;
    const ox = e[12] - C.x;
    const oz = e[14] - C.z;
    // one full turn around the hero while converging: they arrive aligned with it
    const th = Math.PI * 2 * p;
    const k = 1 - p;
    const nx = C.x + (Math.cos(th) * ox + Math.sin(th) * oz) * k;
    const nz = C.z + (-Math.sin(th) * ox + Math.cos(th) * oz) * k;
    const spin = new THREE.Matrix4().makeTranslation(nx, 0, nz).multiply(new THREE.Matrix4().makeRotationY(th)).multiply(new THREE.Matrix4().makeTranslation(-e[12], 0, -e[14]));
    inst.M = spin.multiply(inst.M);
    // they lose their insides first: a vortex of bare orange frames that lands exactly on the
    // hero's outline (one full turn), so the stack merges into it instead of fading out
    inst.st.inten *= 0.85 + 0.15 * (1 - p);
    inst.st.contentOn = Math.min(inst.st.contentOn, 1 - seg(t, T.collapse, T.collapse + 0.12));
    inst.st.edgeOn = Math.min(inst.st.edgeOn, 1 - seg(t, T.collapse + 0.04, T.collapse + 0.16));
    inst.st.fillA = Math.min(inst.st.fillA, 1 - seg(t, T.collapse + 0.04, T.collapse + 0.2));
  }
  if (t >= T.a) w.insts = w.insts.filter((i) => i.k === HERO);
  // the guide dot is born when the ring closes
  w.dot = { screen: [960, 540], r: 7, a: seg(t, T.dot - 0.05, T.dot - 0.02), halo: 1 };
  w.ring = round > 0 ? { r: ringPx, t } : undefined;
}
