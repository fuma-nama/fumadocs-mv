import { ease } from '../../engine/anim';
import { setFont, measure } from '../../engine/draw2d';
import type { Projector } from './proj';
import { DEG, type V3 } from './world';
import { seg } from './state';

/** TACTIC-style orbit rings of text around the moon (bar 6), depth-split around the moon. */
interface Orbit {
  /** glyph face: Michroma for words, Geist Mono for file names / data (user rule) */
  font?: 'wide' | 'mono';
  r: number;
  u: V3;
  v: V3;
  speed: number;
  text: string;
  size: number;
  t0: number;
  dash?: boolean;
  nodes?: number;
}

function basis(tilt: number, yaw: number): [V3, V3] {
  const rot = (p: V3): V3 => {
    const [x, y, z] = p;
    const y1 = y * Math.cos(tilt) - z * Math.sin(tilt);
    const z1 = y * Math.sin(tilt) + z * Math.cos(tilt);
    return [x * Math.cos(yaw) + z1 * Math.sin(yaw), y1, -x * Math.sin(yaw) + z1 * Math.cos(yaw)];
  };
  return [rot([1, 0, 0]), rot([0, 0, 1])];
}

const ORBITS: Orbit[] = [
  { r: 1.14, ...uv(76, 24), speed: 0.55, text: 'READ · NAVIGATE · ARRANGE · COLOR · CUSTOMIZE · CONNECT · PUBLISH · WRITE · ', size: 0.082, t0: 8.0 },
  { r: 1.36, ...uv(12, -8), speed: -0.32, text: 'README.mdx · index.mdx · meta.json · 150 BPM · 4/4 · 01 / 09 · README.mdx · ', size: 0.075, t0: 8.4, font: 'mono' },
  { r: 1.62, ...uv(54, -40), speed: 0.24, text: '', size: 0, t0: 8.8, dash: true, nodes: 8 },
];
function uv(tiltDeg: number, yawDeg: number) {
  const [u, v] = basis(tiltDeg * DEG, yawDeg * DEG);
  return { u, v };
}

const F = 64;

/**
 * Draw the orbits around centre c (moon centre). Back halves go to `back` (composited under the
 * 3D moon), front halves to `front`. `a` = master alpha.
 */
export function drawOrbits(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, P: Projector, t: number, cy: number, scale: number, a: number, ticks: number[] = []) {
  if (a <= 0.01) return;
  const centre = P.view(0, cy, 0);
  const dC = -centre[2];
  for (const o of ORBITS) {
    if (t < o.t0 - 1 / 60) continue;
    const grow = ease.outExpo(seg(t, o.t0 - 1 / 60, o.t0 + 0.44));
    const phase = (t - o.t0) * o.speed;
    const r = o.r * scale;
    const at = (phi: number): V3 => [
      r * (Math.cos(phi) * o.u[0] + Math.sin(phi) * o.v[0]),
      cy + r * (Math.cos(phi) * o.u[1] + Math.sin(phi) * o.v[1]),
      r * (Math.cos(phi) * o.u[2] + Math.sin(phi) * o.v[2]),
    ];
    const isFront = (p: V3) => -P.view(p[0], p[1], p[2])[2] < dC;
    // line: draw-on from the phase origin
    const N = 180;
    const span = Math.PI * 2 * grow;
    for (const ctx of [back, front]) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(250,250,247,${(0.5 * a * (ctx === back ? 0.7 : 1)).toFixed(3)})`;
      if (o.dash) ctx.setLineDash([3, 5]);
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= N; i++) {
        const phi = phase + (span * i) / N;
        const p = at(phi);
        const f = isFront(p);
        if (f !== (ctx === front)) {
          pen = false;
          continue;
        }
        const s = P.project(p[0], p[1], p[2]);
        if (!s.ok) {
          pen = false;
          continue;
        }
        if (!pen) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
        pen = true;
      }
      ctx.stroke();
      ctx.restore();
    }
    // nodes
    if (o.nodes) {
      for (let j = 0; j < o.nodes; j++) {
        const phi = phase + (j / o.nodes) * Math.PI * 2;
        if (phi - phase > span) continue;
        const p = at(phi);
        const s = P.project(p[0], p[1], p[2]);
        if (!s.ok) continue;
        const ctx = isFront(p) ? front : back;
        // a running light on the arp's 16ths: one node at a time flares orange
        let n16 = 0;
        for (const tk of ticks) if (tk >= o.t0 && tk <= t) n16++;
        const on = n16 > 0 && (n16 - 1) % o.nodes === j;
        ctx.fillStyle = on ? `rgba(250,128,35,${a.toFixed(3)})` : `rgba(250,250,247,${(0.85 * a).toFixed(3)})`;
        const sz = on ? 6 : 4;
        ctx.fillRect(Math.round(s.x) - sz / 2, Math.round(s.y) - sz / 2, sz, sz);
      }
    }
    // text along the ring (types on with the draw-on)
    if (o.text) {
      for (const ctx of [back, front]) {
        ctx.save();
        const font = o.font ?? 'wide';
        const tracking = font === 'mono' ? 0.08 : 0.25;
        setFont(ctx, { font, size: F, weight: font === 'mono' ? 500 : 400, tracking });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(250,250,247,${(0.75 * a * (ctx === back ? 0.6 : 1)).toFixed(3)})`;
        const k = (o.size * scale) / F;
        let sAcc = 0;
        for (const ch of o.text) {
          const w = measure(ctx, ch, { font, size: F, tracking });
          const phi = phase + ((sAcc + w / 2) * k) / r;
          sAcc += w;
          if (phi - phase > span || ch === ' ') continue;
          const p = at(phi);
          if (isFront(p) !== (ctx === front)) continue;
          const tx: V3 = [-Math.sin(phi) * o.u[0] + Math.cos(phi) * o.v[0], -Math.sin(phi) * o.u[1] + Math.cos(phi) * o.v[1], -Math.sin(phi) * o.u[2] + Math.cos(phi) * o.v[2]];
          const up: V3 = [(p[0] - 0) / r, (p[1] - cy) / r, (p[2] - 0) / r];
          const q: V3 = [p[0] + up[0] * 0.045 * scale, p[1] + up[1] * 0.045 * scale, p[2] + up[2] * 0.045 * scale];
          if (P.floorTransform(ctx, q, tx, up, o.size * scale, F)) ctx.fillText(ch, 0, 0);
        }
        ctx.restore();
      }
    }
  }
}
