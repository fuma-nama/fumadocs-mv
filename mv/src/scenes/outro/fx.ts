import { ease, hash, seg } from '../../engine/anim';
import { sparkle } from '../../engine/draw2d';
import { C } from '../_shared/palette';
import { MOSAIC } from '../showcase/contract';
import { VOCAB } from '../intro/vocab';
import { T } from './cues';

type Ctx = CanvasRenderingContext2D;
const DEG = Math.PI / 180;

/**
 * S0 — two comets are born at the lit bottom-right (45°) and run the rim in opposite directions,
 * accelerating with the reverse swell. The rim they sweep stays charged with light, so the whole
 * circle is lit when they meet at the dark top-left (225°) on the downbeat; the charge releases
 * there with a flash (the chord ring then carries it outward).
 */
export function drawComets(c: Ctx, t: number) {
  if (t < T.pause || t > T.down + 0.5) return;
  const { CX, CY, R } = MOSAIC;
  const p = seg(t, T.pause, T.down);
  const travel = 180 * (0.25 * p + 0.75 * p * p); // degrees from the start (45°), accelerating
  const fadeIn = seg(t, T.pause, T.pause + 0.05);
  const release = t >= T.down ? Math.exp(-(t - T.down) / 0.12) : 0;
  const charge = fadeIn * (t < T.down ? 1 : release);
  c.save();
  c.lineCap = 'round';
  // the charged rim: everything the comets have swept, warmer and brighter toward the heads
  if (charge > 0.01) {
    const a0 = t < T.down ? (45 - travel) * DEG : 0;
    const a1 = t < T.down ? (45 + travel) * DEG : Math.PI * 2;
    c.shadowColor = C.ORANGE;
    c.shadowBlur = 16;
    c.strokeStyle = '#FFC98A';
    c.lineWidth = 4;
    c.globalAlpha = 0.85 * charge;
    c.beginPath();
    c.arc(CX, CY, R, a0, a1);
    c.stroke();
    if (t >= T.down) {
      // release: one white-hot flash of the whole rim, decaying with the charge
      c.strokeStyle = '#FFF8EC';
      c.lineWidth = 2;
      c.globalAlpha = release;
      c.stroke();
    }
    c.shadowBlur = 0;
  }
  if (t < T.down) {
    for (const dir of [1, -1]) {
      const head = (45 + dir * travel) * DEG;
      const len = Math.min(travel, 12 + 60 * p) * DEG; // hot streak behind the head
      const n = 24;
      for (let k = 0; k < n && len > 0; k++) {
        const a0 = head - dir * len * (k / n);
        const a1 = head - dir * len * ((k + 1) / n);
        const f = 1 - k / n;
        c.beginPath();
        c.arc(CX, CY, R, Math.min(a0, a1), Math.max(a0, a1));
        c.strokeStyle = C.SUN;
        c.globalAlpha = fadeIn * f * f;
        c.lineWidth = 2.5 + 3 * f;
        c.stroke();
      }
      const hx = CX + Math.cos(head) * R;
      const hy = CY + Math.sin(head) * R;
      // sparks thrown off the burning head: born at past head positions, flying outward
      c.fillStyle = '#FFE2B8';
      for (let k = 1; k <= 14; k++) {
        const tb = t - k / 60; // birth time
        if (tb < T.pause) break;
        const pb = seg(tb, T.pause, T.down);
        const ab = (45 + dir * 180 * (0.25 * pb + 0.75 * pb * pb)) * DEG;
        const age = t - tb;
        const h = hash(k + Math.round(tb * 60), dir);
        const sp = 140 + 220 * h; // px/s outward
        const sw = (hash(h * 97) - 0.5) * 0.9; // spread
        const ox = Math.cos(ab + sw) * sp * age;
        const oy = Math.sin(ab + sw) * sp * age + 120 * age * age;
        c.globalAlpha = fadeIn * Math.max(0, 1 - age / 0.25) ** 2 * (0.4 + 0.6 * p);
        c.beginPath();
        c.arc(CX + Math.cos(ab) * R + ox, CY + Math.sin(ab) * R + oy, 1.6, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = fadeIn;
      c.shadowColor = C.ORANGE;
      c.shadowBlur = 30;
      c.fillStyle = '#FFFDF2';
      c.beginPath();
      c.arc(hx, hy, 6.5, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 10;
      c.fill();
      c.shadowBlur = 0;
    }
  }
  c.restore();
  // ignition where they meet (top-left), on the downbeat
  const ig = t >= T.down ? Math.exp(-(t - T.down) / 0.16) : seg(t, T.down - 0.05, T.down) * 0.6;
  if (ig > 0.01) {
    const x = CX + Math.cos(225 * DEG) * R;
    const y = CY + Math.sin(225 * DEG) * R;
    c.save();
    c.globalAlpha = ig;
    c.shadowColor = C.ORANGE;
    c.shadowBlur = 28;
    sparkle(c, x, y, 14 + 30 * ig, C.SUN, 0.14);
    c.restore();
  }
}

/** A thin ring leaving a circle of radius r0 (the chord ringing). */
export function drawRingOut(c: Ctx, t: number, t0: number, x: number, y: number, r0: number, o: { dur?: number; grow?: number; alpha?: number; lw?: number; color?: string } = {}) {
  const dur = o.dur ?? 1.4;
  // clamp: at t = t0 + dur float error can give p = 1 + ε, and (1 − p) ** k = NaN, which the
  // canvas ignores as a globalAlpha (the ring would flash at full opacity for one frame)
  const p = (t - t0) / dur;
  if (!(p >= 0 && p < 1)) return;
  const r = r0 + (o.grow ?? 520) * ease.outExpo(p);
  c.save();
  c.globalAlpha = (o.alpha ?? 0.55) * (1 - p) ** 1.6;
  c.lineWidth = o.lw ?? 1;
  c.strokeStyle = o.color ?? C.ORANGE;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}


/**
 * The dial drawn "with weight": two pens leave 12 o'clock in both directions (k = 0..1 of half a
 * turn each), each hour tick stamps a short flash as a pen passes it.
 */
export function drawDialPens(c: Ctx, x: number, y: number, r: number, k: number, alpha: number) {
  if (alpha <= 0 || k <= 0) return;
  const top = -Math.PI / 2;
  c.save();
  // stamped hour ticks (the dial's own outward major ticks, flashing longer as a pen passes)
  const D = VOCAB.dial;
  for (let i = 0; i < 12; i++) {
    const d = Math.min(i, 12 - i) / 6; // 0 at 12 o'clock … 1 at 6
    const age = k - d;
    if (age < 0 || age > 0.12) continue;
    const f = 1 - age / 0.12;
    const th = top + (i / 12) * Math.PI * 2;
    const len = D.major * r * (1 + 0.9 * f);
    c.globalAlpha = alpha * f;
    c.strokeStyle = C.SUN;
    c.lineWidth = D.majorLw + f;
    c.beginPath();
    c.moveTo(x + Math.cos(th) * (r - 2 * f), y + Math.sin(th) * (r - 2 * f));
    c.lineTo(x + Math.cos(th) * (r + len), y + Math.sin(th) * (r + len));
    c.stroke();
  }
  // the two pens (fade as they meet at 6 o'clock)
  if (k < 1) {
    for (const dir of [1, -1]) {
      const a = top + dir * Math.PI * k;
      const trail = 0.22;
      for (let j = 0; j < 12; j++) {
        const u0 = j / 12;
        const u1 = (j + 1) / 12;
        c.beginPath();
        const a0 = a - dir * trail * u0;
        const a1 = a - dir * trail * u1;
        c.arc(x, y, r, Math.min(a0, a1), Math.max(a0, a1));
        c.globalAlpha = alpha * (1 - u0) ** 2 * (1 - k * 0.6);
        c.strokeStyle = C.SUN;
        c.lineWidth = 2.4 * (1 - u0) + 0.6;
        c.stroke();
      }
      c.globalAlpha = alpha * (1 - k * 0.6);
      c.shadowColor = C.ORANGE;
      c.shadowBlur = 18;
      c.fillStyle = '#FFFDF0';
      c.beginPath();
      c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 3.2, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
    }
  }
  c.restore();
}
