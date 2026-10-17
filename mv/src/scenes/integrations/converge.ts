import { clamp, ease, lerp, seg, TAU } from '../../engine/anim';
import { drawMoon } from '../_shared/moon';
import { boxLabel, text } from '../../engine/draw2d';
import { apply } from './cam';
import { fr, ORANGE, R, STATIONS, T } from './k';
import type { StationCtx, StationImpl } from './station';
import { hexA, type View } from './world';

/** Arrival of each station's output at the core, on the fill's 16ths (snare + chop): 88.8 / 88.9 / 89.0 / 89.1. */
export const ARRIVE = [fr(88.8), fr(88.9), fr(89.0), fr(89.1)];
const FLIGHT = 0.3;
export const MERGED = fr(89.5);
export const MOON_R = 140;

/** How much of station k's body remains (fades as its output leaves). */
export function stationAlpha(t: number, k: number) {
  if (t < T.reveal) return 1;
  return 1 - seg(t, ARRIVE[k] - FLIGHT - 0.04, ARRIVE[k] - FLIGHT + 0.14);
}

/** World layers fade (grid, disc, dust) once the outputs are on their way. */
export function worldAlpha(t: number) {
  return t < T.reveal ? 1 : 1 - seg(t, 88.95, 89.35, ease.inOutCubic);
}

/** Core radius on screen while it forms (steps up on each arrival, ends exactly at MOON_R). */
export function coreRadius(t: number) {
  if (t < ARRIVE[0] - 0.08) return 0;
  const targets = [46, 80, 108, 124];
  let r = 10 * seg(t, ARRIVE[0] - 0.08, ARRIVE[0]);
  for (let i = 0; i < 4; i++) {
    const p = ease.outBack(seg(t, ARRIVE[i], ARRIVE[i] + 0.07), 1.4);
    const from = i === 0 ? 10 : targets[i - 1];
    if (t >= ARRIVE[i]) r = lerp(from, targets[i], p);
  }
  // the stop: the core swells to meet the tightening ring (same ease as the camera)
  return lerp(r, MOON_R, ease.inOutCubic(seg(t, 89.2, MERGED)));
}

/** Rail colour during the converge: the four key colours drain to orange as the ring tightens. */
export function railMix(t: number) {
  return seg(t, 89.15, 89.45, ease.inOutCubic);
}

/** Output cards fly down their spokes into the core (radial in world space, so they turn with the world). */
export function drawFlights(c: CanvasRenderingContext2D, v: View, t: number, sts: StationImpl[], stM: DOMMatrix[], ctx: (k: number) => StationCtx) {
  for (let k = 0; k < sts.length; k++) {
    const t0 = ARRIVE[k] - FLIGHT;
    const pre = seg(t, t0 - 0.12, t0);
    if (t < t0 - 0.12 || t >= ARRIVE[k]) continue;
    const st = sts[k];
    const o = st.out;
    // world position of the output's centre, then pulled down the spoke
    const [wx, wy] = apply(stM[k], o.x + o.w / 2, o.y + o.h / 2);
    const e = ease.inCubic(clamp((t - t0) / FLIGHT));
    const kx = 1 - e;
    const m = v.m.multiply(new DOMMatrix().translate(wx * (kx - 1), wy * (kx - 1))).multiply(stM[k]);
    // m maps station-local → screen with the output's centre moved toward the core
    const sc = (1 + 0.3 * ease.outCubic(pre)) * (1 - 0.94 * e);
    const [cx, cy] = apply(m, o.x + o.w / 2, o.y + o.h / 2);
    c.save();
    c.setTransform(new DOMMatrix().translate(cx, cy).scale(sc, sc).rotate((0.9 * e * 180) / Math.PI).translate(-cx, -cy).multiply(m));
    c.globalAlpha = 1 - 0.25 * e;
    st.drawOutput(c, ctx(k));
    c.lineWidth = 3 / (sc * v.s);
    c.strokeStyle = hexA(STATIONS[k].key, 0.95);
    c.beginPath();
    c.roundRect(o.x, o.y, o.w, o.h, 16);
    c.stroke();
    c.restore();
  }
}

/** Spokes: the four stations wired to the hub (drawn in from the ring at the reveal). */
export function drawSpokes(c: CanvasRenderingContext2D, v: View, t: number) {
  if (t < T.reveal + 0.12) return;
  const fade = 1 - seg(t, 89.1, 89.3);
  if (fade <= 0) return;
  c.save();
  c.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    const p = ease.outCubic(seg(t, T.reveal + 0.14 + k * 0.03, T.reveal + 0.28 + k * 0.03));
    if (p <= 0) continue;
    const a = STATIONS[k].a;
    const ang = v.sa(a);
    const r0 = R * v.s;
    const r1 = r0 * (1 - p);
    const col = STATIONS[k].key;
    c.strokeStyle = hexA(col, 0.85 * fade);
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(v.cx + Math.cos(ang) * r0, v.cy + Math.sin(ang) * r0);
    c.lineTo(v.cx + Math.cos(ang) * r1, v.cy + Math.sin(ang) * r1);
    c.stroke();
    // tiny square nodes along the spoke (TACTIC orbit nodes)
    for (let i = 1; i < 4; i++) {
      const rr = r0 * (1 - i / 4);
      if (rr < r1) continue;
      c.fillStyle = hexA(col, fade);
      c.fillRect(v.cx + Math.cos(ang) * rr - 2.5, v.cy + Math.sin(ang) * rr - 2.5, 5, 5);
    }
  }
  c.restore();
}

/** The section word at the hub between the reveal and the packet's dive. */
export function drawHubWord(c: CanvasRenderingContext2D, v: View, t: number) {
  const a0 = T.reveal + 0.14, a1 = fr(88.74);
  if (t < a0 || t > a1 + 0.06) return;
  const inn = seg(t, a0, a0 + 0.05);
  const flick = Math.floor((t - a0) * 60) === 2 ? 0.35 : 1;
  const out = seg(t, a1 - 0.02, a1 + 0.05, ease.inCubic);
  c.save();
  c.translate(v.cx, v.cy);
  // shrinks into the hub (uniform 2D scale), the packet dives in right after
  c.scale(1 - out, 1 - out);
  c.globalAlpha = inn * flick;
  boxLabel(c, 'CONNECT', 0, 0, { size: 44, tracking: 0.42, align: 'center', color: '#FAFAF7', lw: 1.5, ticks: true, padX: 34, padY: 22, fillBox: '#0A0A0B' });
  text(c, '接続 · 04 INTEGRATIONS', 0, 68, { font: 'mono', size: 13, align: 'center', color: 'rgba(250,250,247,0.6)' });
  c.restore();
}

/** The forming core, arrival pings and the halo; after MERGED only the moon remains. */
export function drawCore(c: CanvasRenderingContext2D, v: View, t: number) {
  if (t < ARRIVE[0] - 0.08) return;
  const cx = v.cx, cy = v.cy;
  const r = coreRadius(t);
  // halo builds toward the downbeat, then breathes (B7 contract: no white flash of ours)
  const hb = seg(t, 89.2, 89.58, ease.inOutCubic) * (t > T.end ? 0.92 + 0.08 * Math.sin((t - T.end) * 7) : 1);
  if (hb > 0) {
    const g = c.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 2.6);
    g.addColorStop(0, hexA(ORANGE, 0.42 * hb));
    g.addColorStop(0.35, hexA(ORANGE, 0.12 * hb));
    g.addColorStop(1, hexA(ORANGE, 0));
    c.fillStyle = g;
    c.fillRect(cx - r * 2.7, cy - r * 2.7, r * 5.4, r * 5.4);
  }
  if (r > 0.5) drawMoon(c, cx, cy, r);
  // arrival pings in each block's key colour
  for (let k = 0; k < 4; k++) {
    const p = clamp((t - ARRIVE[k]) / 0.26);
    if (p <= 0 || p >= 1) continue;
    c.strokeStyle = hexA(STATIONS[k].key, (1 - p) ** 1.3);
    c.lineWidth = 2.5 * (1 - p) + 0.5;
    c.beginPath();
    c.arc(cx, cy, r + 8 + 120 * ease.outCubic(p), 0, TAU);
    c.stroke();
  }
}
