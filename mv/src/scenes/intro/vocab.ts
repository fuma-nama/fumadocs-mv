import { setFont, measure } from '../../engine/draw2d';

/** The text that circles the dial (one pass fitted to the circumference). */
export const TEXT_RING = 'README · INTRODUCTION · QUICK START · INSTALLATION · PAGE TREE · MARKDOWN · NAVIGATION · LAYOUTS · THEMES · CLI · INTEGRATIONS · ';

/**
 * The intro's dial vocabulary as flat 2D drawing (side-effect free) — the OUTRO echoes it on
 * the end card. Same proportions as the intro's floor dial (world units there: dial ring R3 8.6,
 * numbers 9.32, text ring 9.85 → on a flat card use numbers at 1.0837·r, text ring at 1.1453·r).
 */
export const VOCAB = {
  /** motif ping: orange ring (2 px), r0 → r0 + grow over `dur` (outExpo), alpha (1−p)^1.4;
   *  held notes ×1.4 and a white echo ring 0.12 s later at 0.6 alpha */
  ping: { dur: 0.8, r0: 10, grow: 86, alpha: 1, lw: 2, color: '250,128,35', echoDelay: 0.12 },
  /** clock dial: 1.75 px ring, 60 minor / 12 major ticks pointing OUTWARD, numbers 01–12 upright */
  dial: { lw: 1.75, minor: 0.0233, major: 0.0523, tickLw: 1.5, majorLw: 2, numbersAt: 1.0837, numberSize: 0.0488, ringAlpha: 0.85, minorAlpha: 0.55, majorAlpha: 0.95, numberAlpha: 0.9 },
  /** text ring: Michroma, tracking 0.6 em, one pass of TEXT_RING fitted to the circumference, −3.2°/s */
  textRing: { text: TEXT_RING, tracking: 0.6, speed: (-3.2 * Math.PI) / 180, alpha: 0.75, radius: 1.1453 },
} as const;

const outExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** Motif ping at (x, y), `age` seconds after the note. `scale` multiplies radii. */
export function drawPing(c: CanvasRenderingContext2D, x: number, y: number, age: number, o: { scale?: number; held?: boolean; alpha?: number } = {}) {
  const P = VOCAB.ping;
  const s = o.scale ?? 1;
  c.save();
  c.lineWidth = P.lw;
  for (let j = 0; j < (o.held ? 2 : 1); j++) {
    const a = age - j * P.echoDelay;
    if (a <= 0 || a >= P.dur) continue;
    const p = a / P.dur;
    const r = (P.r0 + P.grow * (o.held ? 1.4 : 1) * outExpo(p)) * s;
    const al = P.alpha * (1 - p) ** 1.4 * (o.alpha ?? 1) * (j ? 0.6 : 1);
    c.strokeStyle = j ? `rgba(250,250,247,${al.toFixed(3)})` : `rgba(${P.color},${al.toFixed(3)})`;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}

/**
 * Clock dial of radius r at (cx, cy). `k` 0..1 draws it on from 12 o'clock both ways (the
 * intro's 5.0 s reveal); `alpha` scales everything; `numbers` draws 01–12.
 */
export function drawClockDial(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, o: { k?: number; alpha?: number; numbers?: boolean; color?: string } = {}) {
  const D = VOCAB.dial;
  const k = o.k ?? 1;
  const a = o.alpha ?? 1;
  const col = o.color ?? '250,250,247';
  const top = -Math.PI / 2;
  c.save();
  c.lineWidth = D.lw;
  c.strokeStyle = `rgba(${col},${(D.ringAlpha * a).toFixed(3)})`;
  c.beginPath();
  c.arc(cx, cy, r, top - Math.PI * k, top + Math.PI * k);
  c.stroke();
  for (let i = 0; i < 60; i++) {
    const th = top + (i / 60) * Math.PI * 2;
    const d = Math.abs(((th - top + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (d > Math.PI * k + 1e-6 && !(i === 30 && k > 0.999)) continue;
    const major = i % 5 === 0;
    const len = (major ? D.major : D.minor) * r;
    c.lineWidth = major ? D.majorLw : D.tickLw;
    c.strokeStyle = `rgba(${col},${((major ? D.majorAlpha : D.minorAlpha) * a).toFixed(3)})`;
    c.beginPath();
    c.moveTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r);
    c.lineTo(cx + Math.cos(th) * (r + len), cy + Math.sin(th) * (r + len));
    c.stroke();
  }
  if (o.numbers !== false) {
    setFont(c, { font: 'mono', size: D.numberSize * r, weight: 600 });
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = `rgba(${col},${(D.numberAlpha * a).toFixed(3)})`;
    for (let i = 1; i <= 12; i++) {
      const th = top + (i / 12) * Math.PI * 2;
      const d = Math.min(i, 12 - i) / 6;
      if (d > k + 1e-6) continue;
      c.fillText(String(i).padStart(2, '0'), cx + Math.cos(th) * r * D.numbersAt, cy + Math.sin(th) * r * D.numbersAt);
    }
  }
  c.restore();
}

/** Rotating text ring of radius r; `t` drives the rotation, `n` = visible chars (type-on). */
export function drawTextRing(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, o: { alpha?: number; n?: number; color?: string } = {}) {
  const R = VOCAB.textRing;
  // one pass of the text wraps the ring exactly (glyph size fitted to the circumference)
  const unit = measure(c, R.text, { font: 'wide', size: 100, tracking: R.tracking }) / 100;
  const size = (Math.PI * 2 * r) / unit;
  c.save();
  setFont(c, { font: 'wide', size, tracking: R.tracking });
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = `rgba(${o.color ?? '250,250,247'},${(R.alpha * (o.alpha ?? 1)).toFixed(3)})`;
  const str = R.text;
  const n = Math.min(str.length, o.n ?? str.length);
  let s = 0;
  const a0 = -Math.PI / 2 + t * R.speed;
  for (let i = 0; i < n; i++) {
    const ch = str[i];
    const w = c.measureText(ch).width;
    const a = a0 + (s + w / 2) / r;
    s += w;
    if (ch === ' ') continue;
    c.save();
    c.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    c.rotate(a + Math.PI / 2);
    c.fillText(ch, 0, 0);
    c.restore();
  }
  c.restore();
}
