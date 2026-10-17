import { clamp, ease, lerp } from '../../engine/anim';
import type { Frame } from '../../engine/engine';
import { audio } from '../../engine/audio';
import { text } from '../../engine/draw2d';
import { C } from '../_shared/palette';
import { drawTocDefault, LAYOUT_HERO, landingState, pointOn, tracePath, TOC_LIGHT, type TocLayout } from './toc-geometry';
import { cssEase, glideDurs, hops, landLag, LANDING, steps, T0, T_B, tocStateAt, type TocState, type TocTiming } from './timeline';
import { boxWord, hair, MONO, node, regMark, reticle, typeOn } from './hud';

const L: TocLayout = LAYOUT_HERO;
const inOutSine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
const ROWS = L.rows;

/** Head (range end) advances on every beat of bars 17–18; tail on the following 8th. */
/**
 * Eight hops, each ARRIVING on a real drum hit (timing.json), bars 17–18: snare 2, kick 2&, kick 3&,
 * snare 4 | kick 1, snare 2, kick 3&, snare 4. The glide anticipates and settles on the hit.
 */
export const ARR_A = [26.0, 26.2, 26.6, 26.8, 27.2, 27.6, 28.2, 28.4];
const DUR_A = glideDurs(ARR_A, 0.22, T0);
/** glide start times (the dot leaves) */
export const HEADS_A = ARR_A.map((h, k) => h - DUR_A[k] + landLag(DUR_A[k]));
export const EV_A = hops(LANDING, ARR_A, 0.22, T0);
export const TM_A: TocTiming = { clip: 0.2, dot: 0.22, text: 0.18, ease: cssEase };

const LAND = landingState(L);
const LAND_DOT = pointOn(L.pts, LAND.dotDist);
/** screen position of the landing dot (B2 contract) */
const ANCHOR0 = { x: LAND.ox + LAND.S * LAND_DOT[0], y: LAND.oy + LAND.S * LAND_DOT[1] };

export interface CamA {
  S: number;
  ox: number;
  oy: number;
  /** dutch roll (rad, canvas sense) about the anchor (ax, ay) — the dot's screen position */
  rot: number;
  ax: number;
  ay: number;
}

export function stateA(t: number): TocState {
  return tocStateAt(Math.max(t, T0 - 1), L, LANDING, EV_A, TM_A);
}

/** 2D camera of shot A: follows the dot down the page and pulls back (pure function of t). */
export function cameraA(t: number): CamA {
  if (t <= T0) return { S: LAND.S, ox: LAND.ox, oy: LAND.oy, rot: 0, ax: ANCHOR0.x, ay: ANCHOR0.y };
  const lt = t - T0;
  // follow: 32 css per beat, eased, trailing the 0.22 s thumb glide
  const fy = LAND_DOT[1] + steps(t, HEADS_A.map((h) => ({ t: h, d: 32 })), 0.62, ease.inOutCubic);
  const fx = LAND_DOT[0];
  // pull back 6 → 4.2 across the shot (zero velocity at the landing)
  const k = inOutSine(clamp(lt / (T_B - T0)));
  let S = lerp(6, 4.2, k);
  const ax = lerp(ANCHOR0.x, 690, k);
  const ay = lerp(ANCHOR0.y, 600, k);
  // snare punches (real hits from timing.json once READ has handed over)
  if (t >= T0 + 0.8) S *= 1 + 0.011 * audio.pulse('snare', t, 0.1);
  // a slow dutch builds through bar 18 and carries into B's tilt
  const rot = -0.04 * inOutSine(clamp((t - (T0 + 1.6)) / 1.6));
  return { S, ox: ax - S * fx, oy: ay - S * fy, rot, ax, ay };
}

const INK = C.INK;
const GREY = C.GREY;

/** Draw shot A into the context (full frame). */
export function drawA(f: Frame, c: CanvasRenderingContext2D, o: { hud?: number } = {}) {
  const t = f.t;
  const lt = t - T0;
  const st = stateA(t);
  const cam = cameraA(t);
  const { S, ox, oy } = cam;
  const W = f.W, H = f.H;
  c.fillStyle = TOC_LIGHT.bg;
  c.fillRect(0, 0, W, H);

  // HUD builds after READ's handover and retracts before the tilt (28.45–28.75)
  const retract = 1 - ease.inOutCubic(clamp((t - (T_B - 0.35)) / 0.3));
  const hudA = (o.hud ?? 1) * clamp((lt - 0.62) / 0.35) * retract;
  // technical dot grid on the page (8 css px), only after READ has handed over
  if (hudA > 0) {
    const step = 8 * S;
    c.save();
    c.globalAlpha = 0.07 * hudA;
    c.fillStyle = INK;
    const x0 = ((ox % step) + step) % step;
    const y0 = ((oy % step) + step) % step;
    const r = Math.max(0.8, S * 0.18);
    for (let y = y0; y < H; y += step) for (let x = x0; x < W; x += step) c.fillRect(x - r / 2, y - r / 2, r, r);
    c.restore();
  }

  c.save();
  if (cam.rot) {
    c.translate(cam.ax, cam.ay);
    c.rotate(cam.rot);
    c.translate(-cam.ax, -cam.ay);
  }
  drawTocDefault(c, L, { S, ox, oy, trackTop: st.trackTop, trackBottom: st.trackBottom, dotDist: st.dotDist, textActive: st.textActive }, { colors: TOC_LIGHT });
  // smear: the thumb's travel over the last 1.5 frames, drawn along the path (no strobing on fast glides)
  if (t > T0) {
    const prev = stateA(t - 1.5 / 60).dotDist;
    const d0 = Math.min(prev, st.dotDist), d1 = Math.max(prev, st.dotDist);
    if (d1 - d0 > 0.6) {
      c.save();
      c.beginPath();
      tracePath(c, L, S, ox, oy, d0, d1);
      c.strokeStyle = TOC_LIGHT.primary;
      c.globalAlpha = 0.55;
      c.lineWidth = 3.4 * S;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.stroke();
      c.restore();
    }
  }

  if (hudA <= 0) {
    c.restore();
    return;
  }
  const P = (x: number, y: number): [number, number] => [ox + x * S, oy + y * S];
  const [dx, dy] = P(...pointOn(L.pts, st.dotDist));

  // ── row cells: index + depth, left of the rail ──
  for (const r of ROWS) {
    const [, y] = P(0, (r.top + r.bottom) / 2);
    if (y < -20 || y > H + 20) continue;
    const act = st.textActive[r.i];
    const col = act > 0.5 ? INK : GREY;
    const [rx] = P(-8, 0);
    text(c, String(r.i + 1).padStart(2, '0'), rx - 86, y + 5, MONO(14, col, { alpha: hudA * (0.55 + 0.45 * act) }));
    text(c, `h${r.depth}`, rx - 46, y + 5, MONO(14, GREY, { alpha: hudA * 0.6 }));
    hair(c, rx - 16, y, rx - 4, y, GREY, 1, hudA * 0.6);
  }

  // ── clip range dimension (track-top → track-bottom) ──
  {
    const [x] = P(-3, 0);
    const [, y0] = P(0, st.trackTop);
    const [, y1] = P(0, st.trackBottom);
    hair(c, x, y0, x, y1, INK, 1, hudA);
    hair(c, x - 5, y0, x + 5, y0, INK, 1, hudA);
    hair(c, x - 5, y1, x + 5, y1, INK, 1, hudA);
  }

  // ── Bézier join callouts as the thumb crosses a depth change ──
  for (let k = 0; k < HEADS_A.length; k++) {
    const i = LANDING + 1 + k; // row the head moves to
    const u = ROWS[i - 1], r = ROWS[i];
    if (u.depth === r.depth) continue;
    const t0 = HEADS_A[k];
    const age = t - t0;
    if (age < 0 || age > 0.85) continue;
    const a = hudA * clamp(age / 0.06) * (1 - clamp((age - 0.55) / 0.3));
    const p0 = P(u.x, u.bottom), p1 = P(u.x, r.top - 4), p2 = P(r.x, u.bottom + 4), p3 = P(r.x, r.top);
    const draw = clamp(age / 0.14);
    hair(c, p0[0], p0[1], p1[0], p1[1], INK, draw, a);
    hair(c, p3[0], p3[1], p2[0], p2[1], INK, draw, a);
    node(c, p0[0], p0[1], 6, INK, true, a);
    node(c, p3[0], p3[1], 6, INK, true, a);
    node(c, p1[0], p1[1], 9, INK, false, a);
    node(c, p2[0], p2[1], 9, INK, false, a);
    const label = `C ${u.x} ${r.top - 4}, ${r.x} ${u.bottom + 4}, ${r.x} ${r.top}`;
    // callouts own the far-left column (the thumb readout owns the inner one)
    const lx = P(-8, 0)[0] - 300;
    const ly = (p0[1] + p3[1]) / 2;
    hair(c, Math.min(p0[0], p3[0]) - 10, ly, lx + 6, ly, GREY, draw, a);
    typeOn(c, label, lx, ly - 10, MONO(13, INK, { alpha: a }), clamp(age / 0.25), 'right');
    text(c, 'bézier join', lx, ly + 18, { ...MONO(12, GREY, { alpha: a }), align: 'right' });
  }

  // ── thumb reticle + offset-distance readout ──
  {
    // readout sits left of the row-label column, its leader runs level with the thumb
    const a = hudA;
    reticle(c, dx, dy, 26, INK, a * 0.85);
    const lx = P(-8, 0)[0] - 112;
    hair(c, dx - 20, dy, lx + 6, dy, INK, 1, a * 0.55);
    text(c, 'offset-distance', lx, dy - 8, { ...MONO(12, GREY, { alpha: a }), align: 'right' });
    text(c, `${st.dotDist.toFixed(1)}px`, lx, dy + 16, { ...MONO(15, INK, { alpha: a, weight: 500 }), align: 'right' });
  }

  c.restore();

  // ── 1:1 inset: the real-size TOC with the camera's viewport (P1PE detail view) ──
  drawInset(c, t, st, cam, hudA);

  // ── frame furniture ──
  const fa = (o.hud ?? 1) * clamp((lt - 0.7) / 0.5) * retract;
  c.save();
  c.globalAlpha = retract;
  boxWord(c, 'NAVIGATE', 96, 104, clamp((lt - 0.7) / 0.55), { size: 17, color: INK });
  typeOn(c, 'components/toc/default.tsx — offset-path · clip-path', 96, 160, MONO(13, GREY), clamp((lt - 1.0) / 0.6));
  c.restore();
  for (const [x, y] of [[56, 56], [W - 56, 56], [56, H - 56], [W - 56, H - 56]] as const) regMark(c, x, y, 12, INK, fa * 0.5);
}

const INSET = { x: 1318, y: 262 };

function drawInset(c: CanvasRenderingContext2D, t: number, st: TocState, cam: CamA, a: number) {
  if (a <= 0) return;
  const { x: ix, y: iy } = INSET;
  c.save();
  c.globalAlpha = a;
  // panel: the TOC column as it sits in the page (header + list), 1 css px = 1 px
  const top = iy - 44, w = 196, h = L.height + 62;
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fillRect(ix - 14, top, w, h);
  c.strokeStyle = 'rgba(10,10,11,0.18)';
  c.lineWidth = 1;
  c.strokeRect(ix - 14 + 0.5, top + 0.5, w - 1, h - 1);
  text(c, '1:1', ix - 14, top - 12, MONO(12, INK));
  text(c, '#nd-toc · 251 × 596', ix - 14 + w, top - 12, { ...MONO(12, GREY), align: 'right' });
  // "On this page" header (lucide text icon)
  c.strokeStyle = TOC_LIGHT.muted;
  c.lineWidth = 1.33;
  c.lineCap = 'round';
  c.beginPath();
  for (const [x0, y0, x1] of [[2, 4.07, 11.33], [2, 8.07, 14], [2, 12, 10.07]] as const) {
    c.moveTo(ix - 1 + x0 * 1, iy - 30 + y0);
    c.lineTo(ix - 1 + x1, iy - 30 + y0);
  }
  c.stroke();
  text(c, 'On this page', ix + 21, iy - 17, { font: 'ui', size: 14, color: TOC_LIGHT.muted });
  drawTocDefault(c, L, { S: 1, ox: ix, oy: iy, trackTop: st.trackTop, trackBottom: st.trackBottom, dotDist: st.dotDist, textActive: st.textActive }, { colors: TOC_LIGHT, alpha: a });
  // the main camera's viewport mapped into the inset
  const inv = (sx: number, sy: number): [number, number] => {
    const cs = Math.cos(-cam.rot), sn = Math.sin(-cam.rot);
    const dx = sx - cam.ax, dy = sy - cam.ay;
    const rx = cam.ax + cs * dx - sn * dy, ry = cam.ay + sn * dx + cs * dy;
    return [ix + (rx - cam.ox) / cam.S, iy + (ry - cam.oy) / cam.S];
  };
  c.save();
  c.beginPath();
  c.rect(ix - 14, top, w, h);
  c.clip();
  c.beginPath();
  const pts = [inv(0, 0), inv(1920, 0), inv(1920, 1080), inv(0, 1080)];
  pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.strokeStyle = C.ORANGE;
  c.lineWidth = 1;
  c.stroke();
  c.restore();
  const [vx, vy] = inv(0, 0);
  text(c, `× ${cam.S.toFixed(2)}`, Math.max(ix - 10, vx + 4), Math.max(top + 14, vy + 14), MONO(11, C.ORANGE));
  void t;
  c.restore();
}
