import { clamp, ease, hash, hold, lerp, seg, TAU } from '../../engine/anim';
import { boxLabel, line, text } from '../../engine/draw2d';
import { stationMatrix } from './cam';
import { A_LAUNCH, KEY, ORANGE, R, T, YH } from './k';
import { LAUNCH_T } from './packet';
import { hexA, polar, type View } from './world';

const K = KEY.openapi;
const LM = stationMatrix(A_LAUNCH);

/** World-space departure sign "00 · CONNECT" standing on the rail at the launch point. */
export function drawConnectSign(c: CanvasRenderingContext2D, v: View, t: number) {
  if (t < T.drop) return;
  // flicker in on twos, then hold
  const f = hold(t - T.drop, 30);
  // on, a one-frame dip (flicker), on; gone once the ride has left it behind
  const vis = (f > 0.03 && f < 0.06 ? 0.4 : 1) * (1 - seg(t, 77.5, 77.9));
  if (vis <= 0) return;
  const m = v.m.multiply(LM);
  c.save();
  c.setTransform(m);
  c.globalAlpha = vis;
  const by = YH - 168;
  const ink = '#0A0A0B';
  const box = boxLabel(c, 'CONNECT', 960, by, { size: 52, tracking: 0.42, align: 'center', color: ink, lw: 2.5, ticks: true, padX: 48, padY: 30 });
  text(c, '接続', box.x + box.w + 26, by - 14, { font: 'jpKaku', size: 26, weight: 900, color: ink });
  text(c, '00', box.x - 30, by - 14, { font: 'wide', size: 18, align: 'right', color: hexA(ink, 0.7) });
  text(c, 'DEPARTURE · cli → integrations', box.x, box.y + box.h + 30, { font: 'mono', size: 15, color: hexA(ink, 0.75) });
  text(c, 'bar 49 · 76.800 s', box.x + box.w, box.y + box.h + 30, { font: 'mono', size: 15, align: 'right', color: hexA(ink, 0.75) });
  // mast down to the rail
  line(c, 960, box.y + box.h, 960, YH - 14, 2, hexA(ink, 0.6));
  c.restore();
}

/** Screen-space impact at the drop: flash bloom, anamorphic rail flare, shock rings. */
export function drawImpact(c: CanvasRenderingContext2D, v: View, t: number) {
  const dt = t - T.drop;
  if (dt < 0 || dt > 0.7) return;
  const [cx, cy] = polar(v, A_LAUNCH, R);
  c.save();
  c.globalCompositeOperation = 'lighter';
  // core flash
  const fl = Math.exp(-dt / 0.06);
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, 420);
  g.addColorStop(0, `rgba(255,250,235,${0.9 * fl})`);
  g.addColorStop(0.2, hexA(ORANGE, 0.5 * fl));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(cx - 420, cy - 420, 840, 840);
  // anamorphic flare along the rail tangent
  const fa = Math.exp(-dt / 0.12);
  const ang = v.sa(A_LAUNCH) + Math.PI / 2;
  c.translate(cx, cy);
  c.rotate(ang);
  for (const [h, a] of [[2, 0.95], [9, 0.25], [26, 0.08]] as [number, number][]) {
    const lg = c.createLinearGradient(-1100, 0, 1100, 0);
    lg.addColorStop(0, 'rgba(0,0,0,0)');
    lg.addColorStop(0.5, `rgba(255,252,240,${a * fa})`);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = lg;
    c.fillRect(-1100, -h / 2, 2200, h);
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  // shock rings
  for (const [d, col, w0] of [[0, '#0A0A0B', 4], [0.06, '#FAFAF7', 2]] as [number, string, number][]) {
    const p = clamp((dt - d) / 0.5);
    if (p <= 0 || p >= 1) continue;
    c.strokeStyle = hexA(col, (1 - p) ** 1.5);
    c.lineWidth = w0 * (1 - p) + 0.5;
    c.beginPath();
    c.arc(cx, cy, 24 + 980 * ease.outCubic(p), 0, TAU);
    c.stroke();
  }
  c.restore();
}

/** Rail power-on wave: a bright front racing both ways around the ring from the launch point. */
export function drawPowerWave(c: CanvasRenderingContext2D, v: View, t: number) {
  const dt = t - T.drop;
  if (dt < 0 || dt > 0.6) return;
  const span = ease.outCubic(clamp(dt / 0.5)) * Math.PI; // half-ring
  const fade = 1 - seg(dt, 0.3, 0.6);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.lineCap = 'round';
  for (const dir of [-1, 1]) {
    const a = A_LAUNCH + dir * span;
    const [x, y] = polar(v, a, R);
    const g = c.createRadialGradient(x, y, 0, x, y, 70);
    g.addColorStop(0, `rgba(255,255,240,${0.85 * fade})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - 70, y - 70, 140, 140);
  }
  // the swept rail glows briefly
  c.strokeStyle = hexA(K, 0.55 * fade);
  c.lineWidth = 2;
  c.beginPath();
  c.arc(v.cx, v.cy, R * v.s, v.sa(A_LAUNCH + span), v.sa(A_LAUNCH - span), false);
  c.stroke();
  c.restore();
}

/**
 * Reverse-swell anticipation over cli's held caret (76.6 → 76.8): streaks converge into the
 * caret, a glow gathers, and the caret compresses (narrow + tall) and recoils left before the shot.
 */
export function drawAnticipation(c: CanvasRenderingContext2D, t: number) {
  const p = seg(t, T.drop - 0.2, T.drop);
  if (p <= 0) return;
  const cx = 960, cy = 540;
  c.save();
  // gathering glow
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, 40 + 160 * p);
  g.addColorStop(0, hexA(ORANGE, 0.42 * p * p));
  g.addColorStop(1, hexA(ORANGE, 0));
  c.fillStyle = g;
  c.fillRect(cx - 220, cy - 220, 440, 440);
  // converging streaks (time-reversed sparks), accelerating into the caret
  c.lineCap = 'round';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + hash(i, 3) * 0.3;
    const d0 = 120 + hash(i, 1) * 520;
    const ph = clamp(p * 1.25 - hash(i, 2) * 0.25);
    const r1 = d0 * (1 - ease.inCubic(ph));
    const r0 = r1 + 30 + 90 * (1 - ph);
    if (ph <= 0 || r1 < 30) continue;
    c.strokeStyle = hexA(i % 4 === 0 ? '#FFF3D6' : ORANGE, 0.85 * ph);
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.75);
    c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.75);
    c.stroke();
  }
  // the caret itself: cover cli's and draw the compressed one
  const q = ease.inCubic(seg(t, T.drop - 0.1, T.drop));
  const w = lerp(48, 36, q), h = lerp(96, 118, q);
  c.fillStyle = '#0A0A0B';
  c.fillRect(936 - 2, 492 - 2, 52, 100);
  c.fillStyle = ORANGE;
  c.fillRect(cx - w / 2 - 8 * q, cy - h / 2, w, h);
  c.restore();
}

/** Packet radius (local px): starts as big as the caret, tightens to the dot. */
export function packetRadius(t: number) {
  return 9 + 15 * (1 - seg(t, LAUNCH_T, LAUNCH_T + 0.32, ease.outCubic));
}

