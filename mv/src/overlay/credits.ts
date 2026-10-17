/**
 * Anime-OP staff credits: small Japanese role + tracked English role over a hairline with a
 * node, names below. Crisp reveal: hairline draw-on, role stagger, names mask-wiped behind a
 * thin caret bar; faster exit ending exactly on the next downbeat.
 */
import { ease, seg } from '../engine/anim';
import { at } from '../engine/time';
import { THEMES } from '../scenes/_shared/palette';
import type { Corner, CreditDef } from './data';
import { profile } from './profile';
import { fontStr, textWidth, type FontSpec } from './jp';
import { isMonoColor, plateRect, rgba, type Palette } from './styles';

interface ShowcaseContract {
  LANDING?: { name: string; t: number }[];
  MOSAIC_NAMES?: string[];
}
const showcase = Object.values(import.meta.glob('../scenes/showcase/contract.ts', { eager: true }))[0] as ShowcaseContract | undefined;

const ROLE_JP: FontSpec = { role: 'jpKaku', weight: 700, size: 18 };
const ROLE_EN: FontSpec = { role: 'wide', weight: 400, size: 9.5 };
const IDX: FontSpec = { role: 'mono', weight: 500, size: 10 };

export interface CreditBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface NameItem {
  text: string;
  x: number; // left of the text
  y: number; // baseline
  w: number;
  font: FontSpec;
  t: number; // reveal start
  tOut: number;
  swatch?: [string, string];
}

/** Window of a credit: explicit t0/t1 (seconds) or its bar window. */
export function creditWindow(d: CreditDef): [number, number] {
  return [d.t0 ?? at(d.bars[0]), d.t1 ?? at(d.bars[1])];
}

export function activeCredit(t: number): { def: CreditDef; index: number; t0: number; t1: number } | null {
  const list = profile().credits;
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    const [t0, t1] = creditWindow(d);
    if (t >= t0 && t < t1) return { def: d, index: i, t0, t1 };
  }
  return null;
}

/** Names in Geist; code-ish names (package names, commands, config values) in Geist Mono. */
export function nameFont(def: CreditDef): FontSpec {
  if (def.mono) {
    const size = def.layout === 'single' ? 22 : def.layout === 'row' ? 19 : 15.5;
    return { role: 'mono', weight: 500, size };
  }
  switch (def.layout) {
    case 'single':
      return { role: 'ui', weight: 500, size: 30 };
    case 'row':
      return { role: 'ui', weight: 500, size: 21 };
    case 'columns':
      return { role: 'ui', weight: 450, size: 16.5 };
    case 'beats':
      return { role: 'ui', weight: 500, size: 18 };
  }
}

export function themeSwatch(name: string): [string, string] | undefined {
  const th = (THEMES as Record<string, { light: { primary: string }; dark: { primary: string } }>)[name];
  return th ? [th.light.primary, th.dark.primary] : undefined;
}

/** Layout names relative to (0, 0) = left end of the first names baseline; returns items + size. */
function layoutNames(def: CreditDef, t0: number, t1: number): { items: NameItem[]; w: number; h: number } {
  const f = nameFont(def);
  const items: NameItem[] = [];
  const lh = Math.round(f.size * (def.layout === 'single' ? 1.2 : 1.5));
  if (def.layout === 'single') {
    def.names.forEach((n, i) => {
      const ff = i === 0 ? f : { ...f, size: Math.round(f.size * 0.68), weight: 400 };
      items.push({ text: n, x: 0, y: i === 0 ? 0 : lh * 0.5 + ff.size * 1.1, w: textWidth(ff, n), font: ff, t: t0 + 0.18 + i * 0.08, tOut: t1 - 0.3 + i * 0.04 });
    });
  } else if (def.layout === 'row') {
    // " · " separated names on one line, or two balanced lines (never an orphan) beyond 540 px
    const sep = def.mono ? ' · ' : '  ·  ';
    const one = def.names.join(sep);
    let lines = [one];
    if (textWidth(f, one) > 540) {
      let best = Infinity;
      for (let k = 1; k < def.names.length; k++) {
        const a = def.names.slice(0, k).join(sep);
        const b = def.names.slice(k).join(sep);
        const w = Math.max(textWidth(f, a), textWidth(f, b));
        if (w < best) {
          best = w;
          lines = [a, b];
        }
      }
    }
    lines.forEach((s, i) => {
      items.push({ text: s, x: 0, y: i * lh, w: textWidth(f, s), font: f, t: t0 + 0.18 + i * 0.07, tOut: t1 - 0.3 + i * 0.04 });
    });
  } else {
    let names = def.names;
    let times: number[] | undefined;
    if (def.layout === 'beats') {
      const land = showcase?.LANDING;
      const page2 = showcase?.MOSAIC_NAMES;
      const split = at(def.bars[0] + 2);
      const p1 = land?.length ? land.map((x) => x.name) : (def.pages?.[0] ?? def.names);
      const t1s = land?.length ? land.map((x) => x.t) : p1.map((_, i) => t0 + i * 0.4);
      const p2 = page2?.length ? page2.slice(0, 10) : (def.pages?.[1] ?? []);
      names = [...p1, ...p2];
      times = [...t1s, ...p2.map((_, i) => split + 0.06 + i * 0.045)];
    }
    const cols = def.layout === 'beats' ? 2 : (def.cols ?? 3);
    const sw = def.layout === 'columns' && def.en === 'COLOUR DESIGN' ? 9 + 7 : 0;
    // page-local grid (page 2 reuses the same cells)
    const p1n = def.layout === 'beats' ? (showcase?.LANDING?.length ?? def.pages?.[0]?.length ?? names.length) : names.length;
    const colW: number[] = new Array(cols).fill(0);
    names.forEach((n, i) => {
      const li = def.layout === 'beats' && i >= p1n ? i - p1n : i;
      const col = li % cols;
      colW[col] = Math.max(colW[col], textWidth(f, n) + sw);
    });
    const gapX = 28;
    const xs: number[] = [];
    let acc = 0;
    for (let k = 0; k < cols; k++) {
      xs.push(acc);
      acc += colW[k] + gapX;
    }
    names.forEach((n, i) => {
      const li = def.layout === 'beats' && i >= p1n ? i - p1n : i;
      const page = def.layout === 'beats' && i >= p1n ? 1 : 0;
      const col = li % cols;
      const row = Math.floor(li / cols);
      const split = at(def.bars[0] + 2);
      const tin = times ? times[i] : t0 + 0.18 + (row * cols + col) * 0.03;
      const tout = def.layout === 'beats' && page === 0 ? split - 0.16 + li * 0.012 : t1 - 0.3 + li * 0.012;
      items.push({ text: n, x: xs[col] + sw, y: row * lh, w: textWidth(f, n), font: f, t: tin, tOut: tout, swatch: sw ? themeSwatch(n) : undefined });
    });
    const rows = Math.ceil(Math.max(p1n, names.length - p1n) / cols);
    return { items, w: acc - gapX, h: (rows - 1) * lh + f.size * 0.25 };
  }
  const w = Math.max(...items.map((x) => x.x + x.w));
  const h = Math.max(...items.map((x) => x.y)) + f.size * 0.25;
  return { items, w, h };
}

/** Draw the staff credit running at t. Returns its box (for contrast sampling) or null. */
export function drawCredit(c: CanvasRenderingContext2D, t: number, o: { pal: Palette; corner?: Corner; halo?: number; measureOnly?: boolean; cc?: CanvasRenderingContext2D; pc?: CanvasRenderingContext2D; plate?: number; plateColor?: string }): CreditBox | null {
  const ac = activeCredit(t);
  if (!ac) return null;
  const { def, index, t0, t1 } = ac;
  const corner = o.corner ?? def.corner;
  const right = corner === 'tr' || corner === 'br';
  const top = corner === 'tl' || corner === 'tr';
  const pal = o.pal;

  // measure
  const jpW = textWidth(ROLE_JP, def.jp, 0.28) - ROLE_JP.size * 0.28;
  const enW = textWidth(ROLE_EN, def.en, 0.34) - ROLE_EN.size * 0.34;
  const roleGap = 12;
  const roleW = jpW + roleGap + enW;
  const names = layoutNames(def, t0, t1);
  const nf = nameFont(def);
  const blockW = Math.max(roleW, names.w);
  const ruleGap = 13; // role baseline → rule
  const nameTop = ruleGap + 12 + nf.size * 0.78; // rule → first name baseline
  const blockH = ROLE_JP.size + ruleGap + 12 + nf.size * 0.78 + names.h;
  const ax = right ? 1792 : 128;
  const yTop = top ? 84 : 1000 - blockH;
  const roleBase = Math.round(yTop + ROLE_JP.size * 0.88);
  const ruleY = roleBase + ruleGap + 0.5;
  const nameBase = Math.round(roleBase + nameTop);
  const left = right ? ax - blockW : ax;
  const box: CreditBox = { x0: left - 10, y0: yTop - 8, x1: left + blockW + 10, y1: yTop + blockH + 10 };
  if (o.measureOnly) return box;

  const halo = o.halo ?? 0;
  const vis = seg(t, t0, t0 + 0.35, ease.outCubic) * (1 - seg(t, t1 - 0.3, t1 - 0.02, ease.inCubic));
  plateRect(o.pc, box.x0 - 10, box.y0 - 6, box.x1 + 10, box.y1 + 4, (o.plate ?? 0) * 0.72 * vis, 10, 10, o.plateColor);
  const mono = isMonoColor(pal.accent);
  const cc = o.cc && !mono ? o.cc : c;
  const accent = mono ? pal.ink : pal.accent;
  c.save();
  if (halo > 0.01) {
    c.shadowColor = rgba(pal.bg, 0.8 * halo);
    c.shadowBlur = 9;
  }
  // hairline: draws out from the anchor side, retracts back into it
  const pIn = seg(t, t0, t0 + 0.42, ease.outExpo);
  const pOut = seg(t, t1 - 0.32, t1 - 0.04, ease.inOutCubic);
  const len = Math.max(0, blockW * pIn * (1 - pOut) - 5);
  if (len > 0.5) {
    c.fillStyle = rgba(pal.ink, 0.42);
    if (right) c.fillRect(ax - 5 - len, ruleY - 0.5, len, 1);
    else c.fillRect(ax + 5, ruleY - 0.5, len, 1);
  }
  // node square at the anchor end
  const node = ease.outBack(seg(t, t0, t0 + 0.14)) * (1 - seg(t, t1 - 0.1, t1 - 0.02));
  if (node > 0.01) {
    const s = 5 * node;
    cc.fillStyle = accent;
    cc.fillRect(ax - s / 2, ruleY - s / 2, s, s);
  }
  // index tag at the far end of the rule
  const idxA = seg(t, t0 + 0.3, t0 + 0.5) * (1 - seg(t, t1 - 0.32, t1 - 0.2));
  if (idxA > 0) {
    c.save();
    c.globalAlpha *= idxA * 0.55;
    c.font = fontStr(IDX);
    c.letterSpacing = '1px';
    c.textBaseline = 'middle';
    c.fillStyle = pal.ink;
    const tag = String(index + 1).padStart(2, '0');
    c.textAlign = right ? 'right' : 'left';
    c.fillText(tag, right ? ax - blockW - 10 : ax + blockW + 10 + 1, ruleY + 0.5);
    c.restore();
  }
  // role JP: per-character stagger (rise + fade)
  const rx = right ? ax - roleW : ax;
  c.font = fontStr(ROLE_JP);
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  let x = rx;
  [...def.jp].forEach((ch, i) => {
    const s0 = t0 + 0.06 + i * 0.04;
    const a = seg(t, s0, s0 + 0.2, ease.outCubic) * (1 - seg(t, t1 - 0.3 + i * 0.03, t1 - 0.12 + i * 0.03, ease.inCubic));
    const w = textWidth(ROLE_JP, ch);
    if (a > 0) {
      c.save();
      c.globalAlpha *= a;
      c.font = fontStr(ROLE_JP);
      c.fillStyle = pal.ink;
      c.fillText(ch, x, roleBase + (1 - seg(t, s0, s0 + 0.3, ease.outExpo)) * 7);
      c.restore();
    }
    x += w + ROLE_JP.size * 0.28;
  });
  // role EN: mask wipe left → right
  const ex = rx + jpW + roleGap;
  const ew = seg(t, t0 + 0.12, t0 + 0.5, ease.outExpo);
  const eo = seg(t, t1 - 0.3, t1 - 0.08, ease.inCubic);
  if (ew > 0 && eo < 1) {
    c.save();
    c.beginPath();
    c.rect(ex + enW * eo - 2, roleBase - 14, enW * (ew - eo) + 4, 20);
    c.clip();
    c.font = fontStr(ROLE_EN);
    c.letterSpacing = `${ROLE_EN.size * 0.34}px`;
    c.fillStyle = rgba(pal.ink, 0.72);
    c.fillText(def.en, ex, roleBase - 0.5);
    c.restore();
  }
  // names: mask wipe with a caret bar at the edge
  const nx0 = right ? ax - names.w : ax;
  for (const it of names.items) {
    const wIn = seg(t, it.t, it.t + 0.36, ease.outExpo);
    const wOut = seg(t, it.tOut, it.tOut + 0.22, ease.inCubic);
    if (wIn <= 0 || wOut >= 1) continue;
    // within the block, right-aligned blocks keep columns left-aligned inside
    const lx = nx0 + it.x;
    const by = nameBase + it.y;
    const fw = it.w + (it.swatch ? 16 : 0);
    const sx0 = it.swatch ? lx - 16 : lx;
    const a0 = sx0 + fw * wOut;
    const a1 = sx0 + fw * wIn;
    if (a1 <= a0) continue;
    c.save();
    c.beginPath();
    c.rect(a0 - 1, by - it.font.size * 1.05, a1 - a0 + 2, it.font.size * 1.45);
    c.clip();
    if (it.swatch) {
      // light / dark primary of the theme, split on the diagonal (colour layer)
      const s = 9;
      const sy = Math.round(by - it.font.size * 0.36 - s / 2);
      const sc = o.cc ?? c;
      sc.save();
      sc.beginPath();
      sc.rect(a0 - 1, by - it.font.size * 1.05, a1 - a0 + 2, it.font.size * 1.45);
      sc.clip();
      sc.shadowColor = 'transparent';
      sc.beginPath();
      sc.moveTo(sx0, sy);
      sc.lineTo(sx0 + s, sy);
      sc.lineTo(sx0, sy + s);
      sc.closePath();
      sc.fillStyle = it.swatch[0];
      sc.fill();
      sc.beginPath();
      sc.moveTo(sx0 + s, sy);
      sc.lineTo(sx0 + s, sy + s);
      sc.lineTo(sx0, sy + s);
      sc.closePath();
      sc.fillStyle = it.swatch[1];
      sc.fill();
      sc.restore();
      c.strokeStyle = rgba(pal.ink, 0.4);
      c.lineWidth = 1;
      c.strokeRect(sx0 - 0.5, sy - 0.5, s + 1, s + 1);
    }
    c.font = fontStr(it.font);
    c.letterSpacing = def.layout === 'single' && !def.mono ? `${-0.005 * it.font.size}px` : '0px';
    c.fillStyle = pal.ink;
    c.fillText(it.text, lx, by);
    c.restore();
    // caret bar riding the wipe edge (fades as the wipe lands)
    const caretA = 1 - seg(t, it.t + 0.05, it.t + 0.18, ease.inCubic);
    if (caretA > 0.02 && wOut <= 0) {
      cc.fillStyle = rgba(accent, caretA);
      cc.fillRect(Math.round(a1), by - it.font.size * 0.82, 2, it.font.size * 0.98);
    }
  }
  c.restore();
  return box;
}
