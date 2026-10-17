import { boxLabel, text } from '../../engine/draw2d';
import { clamp, hash } from '../../engine/anim';
import { gridPos } from '../../engine/time';

const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

/** Type-on: first n chars of s, revealed at `cps` chars/s from t0. */
const typed = (s: string, t: number, t0: number, cps = 60) => (t < t0 ? '' : s.slice(0, Math.floor((t - t0) * cps) + 1));

/**
 * P1PE-style corner readouts (the instrument's status bar). Booted on the bar-1 ticks; blips
 * flicker one readout. `a` = master opacity.
 */
export function drawHUD(c: CanvasRenderingContext2D, t: number, a: number, o: { blips: number[]; nodes: number; bytes: number; W?: number; H?: number; top?: boolean }) {
  if (a <= 0.004) return;
  const W = o.W ?? 1920;
  const H = o.H ?? 1080;
  let flick = -1;
  for (const b of o.blips) if (t >= b && t < b + 0.034) flick = Math.floor(hash(b) * 4);
  const col = (i: number, k = 1) => `rgba(250,250,247,${(a * k * (flick === i ? 0.25 : 1)).toFixed(3)})`;
  const mono = { font: 'mono' as const, size: 15, weight: 500, tracking: 0.06 };

  // calibration readouts at the four registration ticks left by the power-on crosshair
  const kc = seg(t, 0.14, 0.3) * (1 - seg(t, 1.5, 1.7));
  if (kc > 0) {
    const tiny = { ...mono, size: 12, color: `rgba(250,250,247,${(0.5 * a * kc).toFixed(3)})` };
    text(c, 'X 960', W / 2 + 8, 30, tiny);
    text(c, 'Y 540', 26, H / 2 - 8, tiny);
    text(c, '1920', W - 26, H / 2 - 8, { ...tiny, align: 'right' });
    text(c, '1080', W / 2 + 8, H - 22, tiny);
  }
  // TL: boxed section word
  const k0 = seg(t, 0.2, 0.32);
  if (k0 > 0) {
    c.save();
    c.globalAlpha = k0;
    boxLabel(c, 'README', 64, 74, { size: 14, color: col(0, 0.95), ticks: false, tracking: 0.42, padX: 13, padY: 9 });
    c.restore();
    text(c, typed('00 / INTRODUCTION', t, 0.3), 64, 118, { ...mono, size: 13, color: col(0, 0.55) });
  }
  // TR: time code + grid position
  if (t >= 0.4) {
    const f = Math.floor(t * 60 + 1e-6);
    const ss = Math.floor(f / 60);
    const tc = `00:00:${String(ss).padStart(2, '0')}:${String(f % 60).padStart(2, '0')}`;
    const g = gridPos(t);
    text(c, typed(tc, t, 0.4), W - 64, 78, { ...mono, align: 'right', color: col(1, 0.8) });
    text(c, typed(`BAR ${String(g.bar).padStart(2, '0')} · ${g.beat}`, t, 0.46), W - 64, 104, { ...mono, size: 13, align: 'right', color: col(1, 0.55) });
  }
  if (o.top) return;
  // BL: editor status
  if (t >= 0.6) {
    const s = `README.mdx  ·  LN 1, COL 1  ·  NODES ${String(o.nodes).padStart(2, "0")}  ·  ${o.bytes.toLocaleString("en-US")} B`;
    text(c, typed(s, t, 0.6, 90), 64, H - 64, { ...mono, color: col(2, 0.6) });
  }
  // BR: transport
  if (t >= 0.8) {
    text(c, typed('150 BPM  ·  4/4  ·  B MINOR  ·  UTF-8', t, 0.8, 90), W - 64, H - 64, { ...mono, align: 'right', color: col(3, 0.6) });
  }
}
