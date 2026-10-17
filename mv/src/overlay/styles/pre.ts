/**
 * PRE-CHORUS — punchy words: each kana/kanji in its own 1.5 px line-art cell (the layout
 * wireframes), slamming in on its note. L5 cells land scattered and snap into a row ("line them
 * up"), L6 cells enter in another cell's slot and slide home ("rearrange"), L7 cells morph shape
 * on 8ths → 16ths ("the shape keeps changing").
 */
import { clamp, ease, hash, lerp, seg } from '../../engine/anim';
import { at, BEAT } from '../../engine/time';
import { fontStr, metrics, textWidth, type FontSpec } from '../jp';
import type { LineTiming } from '../timing';
import { isMonoColor, lineWindow, moraIndex, ORANGE, PAPER, plateRect, rgba, textAt, withHalo, type RenderOpts } from './common';

export interface PreCellOpts {
  alpha?: number;
  /** 0..1: cell perimeter drawn (clockwise from the top-left) */
  draw?: number;
  /** 0..1: glyph pop (scale 1.35 → 1 with an overshoot) */
  pop?: number;
  /** 0..1: accent flash fill */
  flash?: number;
  ink?: string;
  accent?: string;
  /** cell size multipliers (shape morph) */
  sw?: number;
  sh?: number;
  /** corner radius as a fraction of the cell (0..0.5) */
  round?: number;
  /** reading drawn above the cell; rubyLit = per-kana 0..1 */
  ruby?: string;
  rubyLit?: number[];
  /** glyph squashes with the cell */
  squash?: boolean;
  /** 0..1 registration ticks at the corners (current mora) */
  ticks?: number;
  /** colour layer for the accent flash/ticks (overlay internal) */
  cc?: CanvasRenderingContext2D;
  /** plate layer for the cell interior (overlay internal) */
  pc?: CanvasRenderingContext2D;
  /** solid interior fill colour (single-canvas use), e.g. INK on busy dark backgrounds */
  bg?: string;
  /** 0..1 interior opacity (plate layer / bg) */
  fill?: number;
  /** interior colour on the plate layer (overlay internal) */
  plateColor?: string;
}

const PRE_FONT: FontSpec = { role: 'jpKaku', weight: 900, size: 92 };

/**
 * One pre-chorus cell centred on (cx, cy); `size` = cell edge (glyph = 0.72 of it).
 * Apply your own transform (translate/rotate/scale) around it.
 */
export function drawPreCell(c: CanvasRenderingContext2D, ch: string, cx: number, cy: number, size: number, o: PreCellOpts = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0.002) return;
  const ink = o.ink ?? PAPER;
  const accent = o.accent ?? ORANGE;
  const cc = o.cc && !isMonoColor(accent) ? o.cc : c;
  const w = size * (o.sw ?? 1);
  const h = size * (o.sh ?? 1);
  const x = cx - w / 2;
  const y = cy - h / 2;
  const r = Math.min(w, h) * clamp(o.round ?? 0, 0, 0.5);
  c.save();
  c.globalAlpha *= alpha;
  if (cc !== c) {
    cc.save();
    cc.globalAlpha *= alpha;
    cc.setTransform(c.getTransform());
  }
  const fillA = (o.fill ?? 0.88) * alpha;
  if (o.pc && fillA > 0.01) {
    o.pc.save();
    o.pc.setTransform(c.getTransform());
    o.pc.globalAlpha = fillA;
    o.pc.beginPath();
    o.pc.roundRect(x, y, w, h, r);
    o.pc.fillStyle = o.plateColor ?? '#0A0A0B';
    o.pc.fill();
    o.pc.restore();
  } else if (o.bg && fillA > 0.01) {
    c.save();
    c.globalAlpha = fillA;
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fillStyle = o.bg;
    c.fill();
    c.restore();
  }
  if ((o.flash ?? 0) > 0.01) {
    cc.beginPath();
    cc.roundRect(x, y, w, h, r);
    cc.fillStyle = rgba(cc === c && isMonoColor(accent) ? ink : accent, 0.9 * (o.flash ?? 0));
    cc.fill();
  }
  const d = o.draw ?? 1;
  if (d > 0) {
    c.lineWidth = 1.5;
    c.strokeStyle = ink;
    c.beginPath();
    c.roundRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5, r);
    if (d < 1) {
      const per = 2 * (w + h);
      c.setLineDash([per * d, per]);
    }
    c.stroke();
    c.setLineDash([]);
  }
  const tk = o.ticks ?? 0;
  if (tk > 0.01) {
    const len = size * 0.12 * tk;
    const g = size * 0.07;
    cc.strokeStyle = cc === c && isMonoColor(accent) ? ink : accent;
    cc.lineWidth = 1.5;
    cc.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const px = cx + sx * (w / 2 + g);
      const py = cy + sy * (h / 2 + g);
      cc.moveTo(px - sx * len, py);
      cc.lineTo(px, py);
      cc.lineTo(px, py - sy * len);
    }
    cc.stroke();
  }
  const pop = o.pop ?? 1;
  if (pop > 0) {
    const f: FontSpec = { ...PRE_FONT, size: size * 0.72 };
    const m = metrics(f, ch);
    const s = 1 + (1 - ease.outBack(clamp(pop), 2.2)) * 0.35;
    const sx = (o.squash ? (o.sw ?? 1) ** 0.7 : 1) * s;
    const sy = (o.squash ? (o.sh ?? 1) ** 0.7 : 1) * s;
    c.save();
    c.translate(cx, cy);
    c.scale(sx, sy);
    c.globalAlpha *= clamp(pop * 4);
    c.font = fontStr(f);
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillStyle = ink;
    c.fillText(ch, -m.adv / 2, (m.emA - m.emD) / 2);
    c.restore();
  }
  if (o.ruby) {
    const rf: FontSpec = { role: 'jpKaku', weight: 700, size: Math.round(size * 0.2) };
    const chars = [...o.ruby];
    const adv = rf.size * 1.02;
    const total = adv * chars.length;
    chars.forEach((rc, i) => {
      const lit = o.rubyLit?.[i] ?? 1;
      if (lit <= 0) return;
      const m = metrics(rf, rc);
      c.save();
      c.globalAlpha *= clamp(lit * 3);
      c.font = fontStr(rf);
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillStyle = ink;
      c.fillText(rc, cx - total / 2 + i * adv + (adv - m.adv) / 2, y - size * 0.1 - (1 - ease.outExpo(clamp(lit))) * 6);
      c.restore();
    });
  }
  if (cc !== c) cc.restore();
  c.restore();
}

/** Boxed, widely tracked uppercase word (TACTIC device) centred on (cx, cy); p = reveal 0..1. */
export function drawBoxWord(c: CanvasRenderingContext2D, word: string, cx: number, cy: number, o: { size?: number; color?: string; alpha?: number; p?: number } = {}) {
  const size = o.size ?? 13;
  const color = o.color ?? PAPER;
  const p = o.p ?? 1;
  if ((o.alpha ?? 1) <= 0.002 || p <= 0) return { w: 0, h: 0 };
  const font: FontSpec = { role: 'wide', weight: 400, size };
  const tracking = 0.32;
  const str = word.toUpperCase();
  const tw = textWidth(font, str, tracking) - tracking * size;
  const padX = size * 1.25;
  const padY = size * 0.78;
  const bw = Math.round(tw + padX * 2);
  const bh = Math.round(size + padY * 2);
  const bx = Math.round(cx - bw / 2) + 0.5;
  const by = Math.round(cy - bh / 2) + 0.5;
  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  const per = 2 * (bw + bh);
  c.lineWidth = 1;
  c.strokeStyle = color;
  c.setLineDash([per * seg(p, 0, 0.7, ease.outCubic), per]);
  c.strokeRect(bx, by, bw, bh);
  c.setLineDash([]);
  c.beginPath();
  c.rect(bx, by, bw * seg(p, 0.2, 1, ease.outExpo), bh);
  c.clip();
  textAt(c, str, cx, cy + size * 0.37, font, { color, tracking, align: 'center' });
  c.restore();
  return { w: bw, h: bh };
}

interface CellPlan {
  ch: string;
  ruby?: string;
  morae: [number, number];
  t: number;
  ts: number[];
  phrase: number;
}

function cellsOf(L: LineTiming): CellPlan[] {
  const out: CellPlan[] = [];
  for (const s of L.segs) {
    if (s.kind === 'space' || s.kind === 'punct') continue;
    const [a, b] = s.morae;
    const ts = L.morae.slice(a, b).map((m) => m.t);
    out.push({ ch: s.text, ruby: s.ruby, morae: [a, b], t: ts[0], ts, phrase: s.phrase });
  }
  return out;
}

export function drawPre(c: CanvasRenderingContext2D, L: LineTiming, t: number, o: RenderOpts) {
  const W = lineWindow(L);
  if (t < W.a || t >= W.b) return;
  const k = o.scale ?? 1;
  const cells = cellsOf(L);
  const pal = o.pal;
  const size = 116 * k * (L.id === 'L7' ? 0.86 : 1);
  const gap = 16 * k;
  const pgap = 44 * k;
  const nP = new Set(cells.map((x) => x.phrase)).size;
  const total = cells.length * size + (cells.length - 1) * gap + (nP - 1) * (pgap - gap);
  const [cx, cy] = o.anchor ?? [960, 896];
  const home: number[] = [];
  let x = cx - total / 2 + size / 2;
  cells.forEach((cl, i) => {
    if (i > 0 && cl.phrase !== cells[i - 1].phrase) x += pgap - gap;
    home.push(x);
    x += size + gap;
  });
  const lastOn = L.morae[L.morae.length - 1].t;
  const out = seg(t, W.b - 0.3, W.b, ease.inCubic);
  const cur = moraIndex(L, t);
  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  withHalo(c, pal.bg, o.halo ?? 0, 12);
  cells.forEach((cl, i) => {
    const t0 = cl.t;
    const appear = seg(t, t0 - 0.02, t0 + 0.12, ease.outCubic);
    if (appear <= 0) return;
    let px = home[i];
    let py = cy;
    let rot = 0;
    let sw = 1;
    let sh = 1;
    let round = 0;
    if (L.id === 'L5') {
      // line them up: tiles land at scattered heights/angles in their own columns, then snap
      // into one row an 8th after the last onset
      const snapT = lastOn + BEAT / 2;
      const s = seg(t, snapT, snapT + 0.32, ease.outExpo);
      const lift = [-40, 30, -18, 36, -28][i % 5];
      py += lift * k * (1 - s);
      px += (hash(i, 5.1) * 2 - 1) * 6 * k * (1 - s);
      rot = [-0.13, 0.1, -0.06, 0.12, -0.09][i % 5] * (1 - s);
    } else if (L.id === 'L6') {
      // rearrange: cells arrive pairwise in each other's slot (み 組 → 組 み, え 替 → 替 え) and
      // swap on the partner's onset, crossing on arcs (one over, one under)
      const partner = i % 2 === 0 ? i + 1 : i - 1;
      if (partner < cells.length) {
        const swapT = Math.max(cl.t, cells[partner].t);
        const s = seg(t, swapT + 0.02, swapT + 0.3, ease.inOutCubic);
        px = lerp(home[partner], home[i], s);
        py += Math.sin(Math.PI * s) * (i < partner ? -1 : 1) * 44 * k;
        rot = Math.sin(Math.PI * s) * (i < partner ? -0.08 : 0.08);
      }
    } else if (L.id === 'L7') {
      // the shape keeps changing: morph on 8ths, 16ths from bar 31
      const rate = t < at(L.barStart + 2) ? BEAT / 2 : BEAT / 4;
      const q = Math.floor((t - t0) / rate);
      const ph = clamp(((t - t0) % rate) / rate);
      const e = ease.outExpo(clamp(ph * 3));
      const shape = (n: number) => [0.78 + hash(i, n, 1) * 0.5, 0.8 + hash(i, n, 2) * 0.42, hash(i, n, 3) < 0.3 ? 0.5 : hash(i, n, 4) < 0.5 ? 0.18 : 0];
      const A = q <= 0 ? [1, 1, 0] : shape(q - 1);
      const B = q < 0 ? [1, 1, 0] : shape(q);
      sw = lerp(A[0], B[0], e);
      sh = lerp(A[1], B[1], e);
      round = lerp(A[2], B[2], e);
    }
    const goI = seg(t, W.b - 0.3 + i * 0.025, W.b - 0.08 + i * 0.025, ease.inCubic);
    const flash = t >= t0 ? Math.max(0, 1 - (t - t0) / 0.16) : 0;
    const rubyLit = cl.ruby ? [...cl.ruby].map((_, j) => seg(t, (cl.ts[Math.min(j, cl.ts.length - 1)] ?? t0) - 0.01, (cl.ts[Math.min(j, cl.ts.length - 1)] ?? t0) + 0.1)) : undefined;
    const isCur = cur >= cl.morae[0] && cur < cl.morae[1] && t < L.t1 + 0.05;
    c.save();
    c.translate(px, py - goI * 14 * k);
    c.rotate(rot);
    drawPreCell(c, cl.ch, 0, 0, size, {
      alpha: appear * (1 - goI),
      draw: seg(t, t0 - 0.03, t0 + 0.13, ease.outCubic),
      pop: seg(t, t0 - 1 / 60, t0 + 0.2),
      flash: flash * 0.9,
      ink: pal.ink,
      accent: pal.accent,
      sw,
      sh,
      round,
      squash: L.id === 'L7',
      ruby: cl.ruby,
      rubyLit,
      ticks: isCur ? seg(t, L.morae[cur].t, L.morae[cur].t + 0.1, ease.outBack) : 0,
      cc: o.cc,
      pc: o.pc,
      plateColor: o.plateColor,
      fill: 0.9 * seg(t, t0 - 0.02, t0 + 0.1),
    });
    c.restore();
  });
  const ep = seg(t, W.a + 0.1, W.a + 0.6);
  if (ep > 0) {
    const word = L.english.replace(/—$/, '');
    const wy = cy + size / 2 + 44 * k;
    // the boxed word gets the same backing as the cells (it sits on the busy wireframes too)
    const bw = textWidth({ role: 'wide', weight: 400, size: 12 * k }, word.toUpperCase(), 0.32) + 12 * k * 2.5;
    plateRect(o.pc, cx - bw / 2 - 4, wy - 14 * k, cx + bw / 2 + 4, wy + 14 * k, 0.85 * ep * (1 - out), 2, 0, o.plateColor ?? '#0A0A0B');
    drawBoxWord(c, word, cx, wy, { size: 12 * k, color: pal.ink, alpha: 1 - out, p: ep });
  }
  c.restore();
  c.shadowColor = 'transparent';
}
