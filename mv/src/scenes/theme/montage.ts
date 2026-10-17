import type * as THREE from 'three';
import type { Frame } from '../../engine/engine';
import { at } from '../../engine/time';
import { ease, lerp, seg } from '../../engine/anim';
import { boxLabel, text, measure, crosshair } from '../../engine/draw2d';
import { NAME, type Swatch } from '../_shared/theme-tokens';
import { WIPE_LEAD, type Ev } from './timeline';
import { renderTrack, type Pose, type Track } from './repaint';
import { BANDS_END, BAND_FRAME } from './bands';

/**
 * S5 · REPAINT (bar 36 「ぬりかえて」): the page is repainted on every 8th by brush-edged
 * stripe sweeps (alternating direction) while the camera pulls back from full-bleed and the
 * card settles centred, small and square: the deck that S6 deals into the ring.
 */
const S = at(36); // 56.0
const E8 = 0.2;

export const MONTAGE_EVENTS: Ev[] = [
  { t: S, id: 'dusk', mode: 'light', via: 'cut', dur: 0 },
  { t: S + E8 - WIPE_LEAD, id: 'catppuccin', mode: 'light', via: 'stripe', dur: 0.14, dir: 1 },
  { t: S + 2 * E8 - WIPE_LEAD, id: 'solar', mode: 'dark', via: 'stripe', dur: 0.14, dir: -1 },
  { t: S + 3 * E8 - WIPE_LEAD, id: 'aspen', mode: 'dark', via: 'stripe', dur: 0.14, dir: 1 },
  { t: S + 4 * E8 - WIPE_LEAD, id: 'black', mode: 'dark', via: 'stripe', dur: 0.14, dir: -1 },
  { t: S + 5 * E8 - WIPE_LEAD, id: 'ruby', mode: 'dark', via: 'stripe', dur: 0.14, dir: 1 },
  { t: S + 6 * E8 - WIPE_LEAD, id: 'emerald', mode: 'light', via: 'stripe', dur: 0.14, dir: -1 },
  { t: S + 7 * E8 - WIPE_LEAD, id: 'purple', mode: 'light', via: 'stripe', dur: 0.14, dir: 1 },
];

/** the deck pose at 57.6 (S6 starts from exactly this) */
export const DECK_POSE: Pose = { x: 0, y: 0, z: 0, s: 0.42, rx: 0, ry: 0, rz: 0 };

let kick: (t: number) => number = () => 0;

export function montagePose(t: number): Pose {
  // a hard pull-back right after the band collapse reveals the world (outExpo), then a slow drift.
  // The card settles left of centre: the top-right corner stays free for the credits (54.4–57.6)
  // and the vertical name takes the right column.
  const a1 = seg(t, BANDS_END - 1e-6, BANDS_END + 0.45, ease.outQuart);
  const a2 = seg(t, BANDS_END + 0.2, at(36, 4), ease.inOutQuad);
  const b = seg(t, at(36, 4) - 0.05, at(37), ease.inOutQuart); // → deck
  const p: Pose = { ...BAND_FRAME, z: 0, rx: 0, ry: 0, rz: 0 };
  p.s = lerp(BAND_FRAME.s, 0.69, a1) - 0.03 * a2;
  p.x = lerp(BAND_FRAME.x, -112, a1) - 12 * a2;
  p.y = lerp(BAND_FRAME.y, -6, a1);
  p.rz = lerp(0, 0.03, a1) + 0.012 * a2;
  p.ry = lerp(0, -0.12, a1) - 0.06 * a2;
  p.rx = lerp(0, 0.04, a1) + 0.01 * a2;
  p.s = lerp(p.s, DECK_POSE.s, b);
  p.rz = lerp(p.rz, DECK_POSE.rz, b);
  p.ry = lerp(p.ry, DECK_POSE.ry, b);
  p.rx = lerp(p.rx, DECK_POSE.rx, b);
  p.x = lerp(p.x, DECK_POSE.x, b);
  p.y = lerp(p.y, DECK_POSE.y, b);
  p.s *= 1 + 0.012 * kick(t) * a1 * (1 - b);
  return p;
}

/** vertical name in the right column (mirrors the posters), below the credits corner */
function drawNameRight(c: CanvasRenderingContext2D, sw: Swatch) {
  const name = NAME[sw.id];
  const o = { font: 'display' as const, weight: 900, stretch: 'extra-condensed' as CanvasFontStretch, tracking: -0.005 };
  let size = 300;
  const w = measure(c, name, { ...o, size });
  if (w > 560) size = (size * 560) / w;
  c.save();
  c.translate(1862, 864);
  c.rotate(-Math.PI / 2);
  text(c, name, 0, 0, { ...o, size, color: sw.ink });
  c.restore();
  text(c, `${String(sw.index).padStart(2, '0')}/12`, 1862 - size * 0.7 - 12, 862, { font: 'mono', size: 15, color: sw.ink, align: 'right', alpha: 0.85 });
}

const W = 1920;

export const MONTAGE_TRACK: Track = {
  key: 'montage',
  events: MONTAGE_EVENTS,
  pose: montagePose,
  brush: true,
  shadow: (t) => seg(t, S + 0.2, S + 0.5),
  back(c, s, t) {
    // the name, vertical in the left column (as in the posters), revealed by the pull-back;
    // decor clears over the last 8th so the deck arrives clean on the crash
    const a = seg(t, S + 0.2, S + 0.45) * (1 - seg(t, at(37) - 0.2, at(37) - 0.04, ease.inCubic));
    if (a <= 0) return;
    c.save();
    c.globalAlpha = a;
    drawNameRight(c, s);
    c.restore();
  },
  front(c, s, t) {
    const a = seg(t, S + 0.15, S + 0.35) * (1 - seg(t, at(37) - 0.2, at(37) - 0.04, ease.inCubic));
    if (a <= 0) return;
    c.save();
    c.globalAlpha = a;
    boxLabel(c, 'COLOR', 92, 64, { size: 15, tracking: 0.42, color: s.ink });
    text(c, `${String(s.index).padStart(2, '0')} / 12 · ${s.id}.css · ${s.mode}`, 268, 69, { font: 'mono', size: 13, color: s.ink, alpha: 0.85 });
    for (const [x, y] of [[60, 60], [W - 60, 60], [60, 1020], [W - 60, 1020]] as [number, number][]) crosshair(c, x, y, 12, 1, s.ink, 0);
    c.restore();
  },
};

export function renderMontage(f: Frame): THREE.Texture {
  kick = (tt) => f.e.audio.pulse('kick', tt, 0.09);
  const out = renderTrack(f, MONTAGE_TRACK);
  f.post.vignette = 0.1;
  return out;
}
