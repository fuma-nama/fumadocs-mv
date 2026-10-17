import type * as THREE from 'three';
import type { Frame } from '../../engine/engine';
import { ease, seg } from '../../engine/anim';
import { render3D } from '../../engine/three-kit';
import { C } from '../_shared/palette';
import { swatch, type Swatch } from '../_shared/theme-tokens';
import { pageTex } from './plates';
import { stage, silhouette } from './stage';
import { eventIndex, type Ev } from './timeline';
import { stripePath, stripeEdges, irisPath, irisRadius, invertPath, type StripeOpts } from './masks';

/**
 * Generic "one page, repainted" renderer: a world field, the two-sided 3D page card and decor,
 * driven by a list of state events. Repaints (stripe / iris) use one screen-space mask for the
 * world, the decor and the page shader; flips turn the card and cut the world on the hit.
 */
const W = 1920;
const H = 1080;
export const STRIPE: StripeOpts = { angle: -62, period: 132, spread: 0.55 };

export interface Pose {
  x: number;
  y: number;
  z: number;
  s: number;
  rx: number;
  ry: number;
  rz: number;
}

export interface Phase {
  cur: Ev;
  prev?: Ev;
  /** transition progress 0..1 (1 = done) */
  p: number;
  k: number;
}

export function phase(evs: Ev[], t: number): Phase {
  const k = Math.max(0, eventIndex(evs, t));
  const cur = evs[k];
  const prev = k > 0 ? evs[k - 1] : undefined;
  const p = cur.via === 'flip' || cur.via === 'cut' || cur.via === 'burst' ? 1 : seg(t, cur.t, cur.t + cur.dur);
  return { cur, prev, p, k };
}

/** half-turns completed by t (eased around each flip hit, edge-on exactly on the hit) */
export function flipTurns(t: number, evs: Ev[]) {
  let k = 0;
  for (const ev of evs) if (ev.via === 'flip') k += seg(t, ev.t - ev.dur / 2, ev.t + ev.dur / 2, ease.inOutCubic);
  return k;
}

export function maskPath(c: CanvasRenderingContext2D, ev: Ev, p: number) {
  if (ev.via === 'stripe') stripePath(c, p, { ...STRIPE, dir: ev.dir });
  else if (ev.via === 'iris') irisPath(c, p, ev.origin!);
}

export interface Track {
  key: string;
  events: Ev[];
  pose(t: number): Pose;
  /** decor under the page (drawn per state, masked by repaints) */
  back?(c: CanvasRenderingContext2D, s: Swatch, t: number): void;
  /** decor over the page (drawn per state, masked by repaints) */
  front?(c: CanvasRenderingContext2D, s: Swatch, t: number): void;
  /** unmasked top layer (tags, cursor) */
  over?(c: CanvasRenderingContext2D, cur: Swatch, t: number): void;
  /** replaces the whole back layer while it returns true (e.g. the burst) */
  special?(c: CanvasRenderingContext2D, t: number, drawBack: (c: CanvasRenderingContext2D, s: Swatch) => void, cur: Swatch): boolean;
  cardVisible?(t: number): boolean;
  /** flat offset shadow opacity */
  shadow?(t: number): number;
  /** wipe leading edges drawn as thick brush bands in the new primary */
  brush?: boolean;
}

export function renderTrack(f: Frame, tr: Track): THREE.Texture {
  const { e, t } = f;
  const g = e.gfx;
  const ph = phase(tr.events, t);
  const cur = swatch(ph.cur.id, ph.cur.mode);
  const prev = ph.prev ? swatch(ph.prev.id, ph.prev.mode) : cur;
  const wiping = ph.p < 1 && (ph.cur.via === 'stripe' || ph.cur.via === 'iris');

  // ── screen-space mask for the page shader
  const ML = e.layer('theme:mask');
  const mc = ML.begin();
  if (wiping) {
    mc.beginPath();
    maskPath(mc, ph.cur, ph.p);
    mc.fillStyle = '#fff';
    mc.fill();
  }
  const maskTex = ML.end();

  // ── world + back decor
  const BL = e.layer('theme:back');
  const b = BL.begin(prev.world);
  const drawBack = (c: CanvasRenderingContext2D, s: Swatch) => {
    c.fillStyle = s.world;
    c.fillRect(0, 0, W, H);
    tr.back?.(c, s, t);
  };
  if (!(tr.special && tr.special(b, t, drawBack, cur))) {
    if (wiping) {
      drawBack(b, prev);
      b.save();
      b.beginPath();
      maskPath(b, ph.cur, ph.p);
      b.clip();
      drawBack(b, cur);
      b.restore();
      wipeEdges(b, ph.cur, ph.p, cur, false);
    } else drawBack(b, cur);
  }
  const backTex = BL.end();

  // ── page card (3D)
  const card = stage.card;
  const pose = tr.pose(t);
  card.group.visible = tr.cardVisible ? tr.cardVisible(t) : true;
  card.group.position.set(pose.x, pose.y, pose.z);
  card.group.rotation.set(pose.rx, pose.ry, pose.rz, 'YXZ');
  card.group.scale.setScalar(pose.s);
  const res: [number, number] = [W * 2, H * 2];
  // the face turned toward the lens shows the current state; the other face holds the same
  // theme in the opposite mode, ready for the next flip
  const vis = Math.cos(pose.ry) * Math.cos(pose.rx) >= 0 ? 'front' : 'back';
  const hid = vis === 'front' ? 'back' : 'front';
  const sc = pose.s;
  const pc = pageTex(ph.cur.id, ph.cur.mode, sc);
  const po = pageTex(ph.cur.id, ph.cur.mode === 'light' ? 'dark' : 'light', sc);
  if (wiping && ph.prev) card.face(vis, pageTex(ph.prev.id, ph.prev.mode, sc), pc, maskTex, res);
  else card.face(vis, pc);
  card.face(hid, po);
  const facing = Math.abs(Math.cos(pose.ry));
  card.shade(0.8 + 0.2 * facing);
  const tex3d = render3D(g, stage.scene, stage.cam, { key: 'theme:3d', ss: 2, edges: { color: cur.mode === 'light' ? cur.fg : C.INK, width: 1.6 } });
  const sa = tr.shadow ? tr.shadow(t) : 1;
  const shadow = sa > 0 ? silhouette(g, tex3d, cur.shade, 'theme:shadow', sa) : null;

  // ── front decor
  const FL = e.layer('theme:front');
  const fc = FL.begin();
  if (tr.front) {
    if (wiping) {
      fc.save();
      fc.beginPath();
      invertPath(fc);
      maskPath(fc, ph.cur, ph.p);
      fc.clip('evenodd');
      tr.front(fc, prev, t);
      fc.restore();
      fc.save();
      fc.beginPath();
      maskPath(fc, ph.cur, ph.p);
      fc.clip();
      tr.front(fc, cur, t);
      fc.restore();
    } else tr.front(fc, cur, t);
  }
  if (wiping && tr.brush) wipeEdges(fc, ph.cur, ph.p, cur, true);
  tr.over?.(fc, cur, t);
  const frontTex = FL.end();

  f.overlay.tone = cur.tone;
  (f.overlay as { accent?: string }).accent = cur.world;

  return g.compose(g.rt('theme:repaint:' + tr.key), null, [
    { tex: backTex },
    { tex: shadow, xform: { x: 16, y: 16 } },
    { tex: tex3d },
    { tex: frontTex },
  ]);
}

/** leading edges of a repaint: thin ink lines, or thick brush bands in the new primary */
function wipeEdges(c: CanvasRenderingContext2D, ev: Ev, p: number, cur: Swatch, brush: boolean) {
  if (ev.via === 'stripe') {
    if (brush) stripeEdges(c, p, { ...STRIPE, dir: ev.dir }, cur.primary, 22);
    else stripeEdges(c, p, { ...STRIPE, dir: ev.dir }, cur.ink, 2);
  } else if (ev.via === 'iris') {
    const r = irisRadius(p, ev.origin!);
    c.beginPath();
    c.arc(ev.origin![0], ev.origin![1], r, 0, Math.PI * 2);
    c.lineWidth = 2;
    c.strokeStyle = cur.ink;
    c.stroke();
  }
}

export { ease };
