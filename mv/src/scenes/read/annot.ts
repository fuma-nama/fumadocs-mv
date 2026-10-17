import { text, measure, crosshair } from '../../engine/draw2d';
import { C } from '../_shared/palette';

/** P1PE-style annotation vocabulary (screen space, crisp 1 px ink). */

type Ctx = CanvasRenderingContext2D;
export type P2 = { x: number; y: number };

const px = (v: number) => Math.round(v) + 0.5;

/** Quad outline through 4 projected corners, drawn on progressively (p 0..1 of the perimeter). */
export function quadOutline(c: Ctx, q: P2[], p: number, color: string, lw = 1, ticks = 0) {
  if (p <= 0) return;
  const seg = q.map((a, i) => [a, q[(i + 1) % 4]] as [P2, P2]);
  const lens = seg.map(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y));
  const total = lens.reduce((a, b) => a + b, 0);
  let rem = total * Math.min(1, p);
  c.save();
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.lineCap = 'butt';
  c.beginPath();
  c.moveTo(q[0].x, q[0].y);
  for (let i = 0; i < 4 && rem > 0; i++) {
    const [a, b] = seg[i];
    const k = Math.min(1, rem / lens[i]);
    c.lineTo(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
    rem -= lens[i];
  }
  c.stroke();
  if (ticks > 0 && p >= 1) {
    // corner registration ticks along the edges, outside the quad
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = q[i];
      const b = q[(i + 1) % 4];
      const d = q[(i + 3) % 4];
      const ux = (a.x - b.x) / Math.hypot(a.x - b.x, a.y - b.y);
      const uy = (a.y - b.y) / Math.hypot(a.x - b.x, a.y - b.y);
      const vx = (a.x - d.x) / Math.hypot(a.x - d.x, a.y - d.y);
      const vy = (a.y - d.y) / Math.hypot(a.x - d.x, a.y - d.y);
      c.moveTo(a.x + ux * 4, a.y + uy * 4);
      c.lineTo(a.x + ux * (4 + ticks), a.y + uy * (4 + ticks));
      c.moveTo(a.x + vx * 4, a.y + vy * 4);
      c.lineTo(a.x + vx * (4 + ticks), a.y + vy * (4 + ticks));
    }
    c.stroke();
  }
  c.restore();
}

/** Leader: anchor dot → 45° elbow → horizontal run to the label edge. Drawn on with p. */
export function leader(c: Ctx, a: P2, l: P2, p: number, color: string, lw = 1) {
  if (p <= 0) return;
  const dx = l.x - a.x;
  const dy = l.y - a.y;
  const diag = Math.min(Math.abs(dy), Math.abs(dx) * 0.6);
  const ex = a.x + Math.sign(dx) * diag;
  const ey = l.y;
  const pts: P2[] = [a, { x: ex, y: a.y + Math.sign(dy) * diag }, { x: l.x, y: ey }];
  if (Math.abs(dy) < 1) pts.splice(1, 1);
  const lens = pts.slice(1).map((b, i) => Math.hypot(b.x - pts[i].x, b.y - pts[i].y));
  let rem = lens.reduce((x, y) => x + y, 0) * Math.min(1, p);
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = lw;
  c.beginPath();
  c.moveTo(a.x, a.y);
  for (let i = 1; i < pts.length && rem > 0; i++) {
    const k = Math.min(1, rem / lens[i - 1]);
    c.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k);
    rem -= lens[i - 1];
  }
  c.stroke();
  // anchor: ring + dot
  c.beginPath();
  c.arc(a.x, a.y, 2.2, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(a.x, a.y, 6 * Math.min(1, p * 2), 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

export interface LabelSpec {
  num: string;
  label: string;
  jp: string;
  meta: string;
  pct: number;
}

/**
 * Label block: [num] LABEL / jp · meta / % bar. (x, y) = the leader's attach point; the block
 * extends away from the stack (`side` -1 = block to the left of x, +1 = to the right).
 */
export function labelBlock(c: Ctx, x: number, y: number, s: LabelSpec, on: number, active: boolean, side: -1 | 1, ink: string = C.INK, fade = 1, k = 1, fixedLeft?: number) {
  if (on <= 0 || fade <= 0) return;
  const acc = active ? C.ORANGE : ink;
  c.save();
  c.globalAlpha *= Math.min(1, on * 1.4) * fade;
  const cell = Math.round(26 * k);
  const big = { font: 'wide' as const, size: 17 * k, tracking: 0.22, color: ink };
  const jpo = { font: 'jpKaku' as const, size: 14 * k, weight: 700 };
  const mono = { font: 'mono' as const, size: 11 * k };
  const w1 = measure(c, s.label, big) - 17 * k * 0.22;
  const w2 = measure(c, s.jp, jpo) + 10 * k + measure(c, s.meta, mono);
  const gap = 12 * k;
  // a fixed left edge makes the legend a table: every block runs from fixedLeft to the leader
  const width = side < 0 && fixedLeft !== undefined ? x - 10 - fixedLeft : cell + gap + Math.max(w1, w2, 210 * k);
  const x0 = Math.round(side < 0 ? x - width - 10 : x + 10);
  // reveal: wipe from the leader side
  c.beginPath();
  const rw = width * Math.min(1, on);
  if (side < 0) c.rect(x0 + width - rw - 2, y - 40 * k, rw + 4, 100 * k);
  else c.rect(x0 - 2, y - 40 * k, rw + 4, 100 * k);
  c.clip();
  // number cell
  const cy = Math.round(y - cell / 2);
  if (active) {
    c.fillStyle = C.ORANGE;
    c.fillRect(x0, cy, cell, cell);
  }
  c.strokeStyle = acc;
  c.lineWidth = 1;
  c.strokeRect(px(x0), px(cy), cell - 1, cell - 1);
  text(c, s.num, x0 + cell / 2, y + 4.5 * k, { font: 'mono', size: 12 * k, weight: 600, align: 'center', color: active ? C.WHITE : ink });
  // label
  text(c, s.label, x0 + cell + gap, y + 6.5 * k, big);
  // underline rule
  c.fillStyle = acc;
  c.fillRect(x0 + cell + gap, Math.round(y + 16 * k), Math.min(width - cell - gap, (width - cell - gap) * on), Math.max(1, Math.round(k)));
  text(c, s.jp, x0 + cell + gap, y + 37 * k, { ...jpo, color: ink });
  const jw = measure(c, s.jp, jpo);
  text(c, s.meta, x0 + cell + gap + 10 * k + jw, y + 36.5 * k, { ...mono, color: '#5E5E66' });
  // pct tag
  const v = s.pct * Math.min(1, on);
  const tag = `${v.toFixed(4)}%`;
  text(c, tag, x0 + cell + gap, y + 56 * k, { ...mono, color: acc });
  const tw = measure(c, tag, mono);
  const bx = x0 + cell + gap + 8 * k + tw;
  const bw = Math.max(60 * k, width - cell - gap - 8 * k - tw - 8);
  const by = Math.round(y + 51 * k);
  const bh = Math.round(4 * k);
  c.fillStyle = ink;
  c.globalAlpha *= 0.18;
  c.fillRect(bx, by, bw, bh);
  c.globalAlpha /= 0.18;
  c.fillStyle = acc;
  c.fillRect(bx, by, bw * Math.min(1, v / 100), bh);
  c.restore();
}

export function cross(c: Ctx, p: P2, r: number, color: string) {
  crosshair(c, px(p.x), px(p.y), r, 1, color, 3);
}
