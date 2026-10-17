/**
 * Japanese typesetting for lyrics: proportional kana tightening (palt-like, from ink bounds),
 * half-width punctuation, group/mono ruby with 1:2:1 distribution, horizontal and vertical
 * (縦組み) layout. Positions are relative to the line origin: horizontal = left end of the
 * baseline; vertical = top of the column, x = column axis.
 */
import { FONTS, type FontRole } from '../engine/draw2d';
import { isKana, isPunct, isSmallKana } from './kana';
import type { LineTiming } from './timing';

export interface FontSpec {
  role: FontRole;
  weight?: number;
  size: number;
  stretch?: CanvasFontStretch;
}

export const fontStr = (f: FontSpec, size = f.size) => `${f.weight ?? 400} ${size}px ${FONTS[f.role]}`;

interface Metrics {
  adv: number;
  l: number; // ink left (x of left ink edge relative to pen, may be negative)
  r: number; // ink right
  a: number; // ink ascent (above baseline)
  d: number; // ink descent (below baseline)
  emA: number;
  emD: number;
}

let mctx: CanvasRenderingContext2D | null = null;
const mcache = new Map<string, Metrics>();

function ctx() {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d')!;
  return mctx;
}

export function metrics(font: FontSpec, ch: string): Metrics {
  const key = fontStr(font) + '|' + (font.stretch ?? '') + '|' + ch;
  let m = mcache.get(key);
  if (!m) {
    const c = ctx();
    c.font = fontStr(font);
    c.fontStretch = font.stretch ?? 'normal';
    c.letterSpacing = '0px';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    const t = c.measureText(ch);
    const s = font.size;
    const emA = (t as TextMetrics & { emHeightAscent?: number }).emHeightAscent;
    const emD = (t as TextMetrics & { emHeightDescent?: number }).emHeightDescent;
    // CJK ideographic em box: ~0.88 above / 0.12 below the alphabetic baseline
    m = {
      adv: t.width,
      l: -t.actualBoundingBoxLeft,
      r: t.actualBoundingBoxRight,
      a: t.actualBoundingBoxAscent,
      d: t.actualBoundingBoxDescent,
      emA: emA && emA > 0 && emA < s * 1.2 ? emA : s * 0.88,
      emD: emD !== undefined && emD >= 0 && emD < s * 0.5 ? emD : s * 0.12,
    };
    mcache.set(key, m);
  }
  return m;
}

export function textWidth(font: FontSpec, s: string, tracking = 0): number {
  const c = ctx();
  c.font = fontStr(font);
  c.fontStretch = font.stretch ?? 'normal';
  c.letterSpacing = `${tracking * font.size}px`;
  const w = c.measureText(s).width;
  c.letterSpacing = '0px';
  return w;
}

const isLatin = (ch: string) => /[A-Za-z0-9@./\-_:]/.test(ch);

export interface TypesetOpts {
  font: FontSpec;
  /** font for Latin ruby bases such as README (default: font) */
  latin?: FontSpec;
  /** 0..1 proportional tightening of kana (0 = solid full-width) */
  tsume?: number;
  /** extra space after each glyph, em */
  tracking?: number;
  /** phrase gap, em */
  space?: number;
  /** ruby font (null = no ruby) and gap to the base (px) */
  ruby?: { font: FontSpec; gap: number } | null;
  vertical?: boolean;
  /** vertical only: start a new column at each phrase, columns step left by this many px */
  columnStep?: number;
  /** vertical only: extra drop (px) of each next column's top (stepped like TOC depth) */
  columnDrop?: number;
  /** horizontal only: display kana instead of ruby bases (chant) */
  kanaOnly?: boolean;
}

export interface PlacedGlyph {
  ch: string;
  seg: number;
  /** index into LineTiming.chars (or -1 for kanaOnly glyphs) */
  ci: number;
  /** morae covered [a, b) */
  morae: [number, number];
  /** pen origin for fillText (textAlign left, alphabetic) before rotation */
  x: number;
  y: number;
  /** visual centre of the cell (transform pivot) */
  cx: number;
  cy: number;
  /** cell size along / across the line */
  w: number;
  h: number;
  rot: number;
  font: FontSpec;
  latin: boolean;
  phrase: number;
  /** column index (vertical) */
  col: number;
}

export interface PlacedRuby {
  seg: number;
  mora: number;
  text: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  rot: number;
  font: FontSpec;
}

export interface SegBox {
  seg: number;
  /** along-line extent: x0..x1 (horizontal) or y0..y1 (vertical) */
  a0: number;
  a1: number;
  /** cross position: baseline y (horizontal) / column x (vertical) */
  cross: number;
  phrase: number;
  col: number;
}

export interface Typeset {
  glyphs: PlacedGlyph[];
  ruby: PlacedRuby[];
  segs: SegBox[];
  /** along-line extent of the whole line (horizontal width / vertical height of the longest column) */
  width: number;
  /** horizontal: em ascent/descent of the base font; vertical: column count */
  ascent: number;
  descent: number;
  columns: number;
  vertical: boolean;
  size: number;
}

/** Advance (along the line) and draw offset for one Japanese glyph with tsume. */
function cell(font: FontSpec, ch: string, tsume: number, vertical: boolean): { adv: number; off: number } {
  const s = font.size;
  const m = metrics(font, ch);
  const full = vertical ? s : m.adv;
  if (isPunct(ch) && /[、。，．]/.test(ch)) return { adv: s * 0.5, off: 0 };
  if (!(isKana(ch) || ch === 'ー') || tsume <= 0) return { adv: full, off: 0 };
  const side = s * 0.075;
  let ink: number;
  let lo: number;
  let hi: number;
  if (!vertical) {
    // keep the em box centred: trim symmetrically, never into the ink
    const c0 = full / 2;
    lo = Math.min(m.l, c0);
    hi = Math.max(m.r, c0);
    ink = 2 * Math.max(c0 - lo, hi - c0);
  } else if (ch === 'ー') {
    ink = m.r - m.l;
  } else {
    const c0 = (m.emA - m.emD) / 2; // em centre above baseline
    ink = 2 * Math.max(m.a - c0, c0 + m.d);
  }
  const prop = Math.min(full, Math.max(s * 0.5, ink + side * 2));
  const adv = full + (prop - full) * tsume;
  return { adv, off: -(full - adv) / 2 };
}

/** Lay out a lyric line (all segments, or the phrase range given). */
export function typeset(L: LineTiming, o: TypesetOpts, phrases?: [number, number]): Typeset {
  const font = o.font;
  const s = font.size;
  const tsume = o.tsume ?? 0;
  const tr = (o.tracking ?? 0) * s;
  const gap = (o.space ?? 0.5) * s;
  const out: Typeset = { glyphs: [], ruby: [], segs: [], width: 0, ascent: 0, descent: 0, columns: 1, vertical: !!o.vertical, size: s };
  const m0 = metrics(font, '永');
  out.ascent = m0.emA;
  out.descent = m0.emD;
  // char index lookup per seg
  const segChars = new Map<number, number[]>();
  L.chars.forEach((c, i) => {
    const arr = segChars.get(c.seg) ?? [];
    arr.push(i);
    segChars.set(c.seg, arr);
  });

  let pen = 0;
  let col = 0;
  let colX = 0;
  let maxLen = 0;
  let lastWasSpace = true;
  let rubyPushRight = 0;
  for (let si = 0; si < L.segs.length; si++) {
    const sg = L.segs[si];
    if (phrases && (sg.phrase < phrases[0] || sg.phrase > phrases[1])) continue;
    if (sg.kind === 'space') {
      if (phrases && sg.phrase >= phrases[1]) continue;
      if (o.vertical && o.columnStep) {
        maxLen = Math.max(maxLen, pen);
        col++;
        colX -= o.columnStep;
        pen = (o.columnDrop ?? 0) * col;
      } else pen += gap;
      lastWasSpace = true;
      continue;
    }
    const chars = segChars.get(si) ?? [];
    const kanaMode = o.kanaOnly && sg.kind === 'ruby';
    const glyphText = kanaMode ? sg.ruby! : sg.text;
    const gl = [...glyphText];
    const latinRun = sg.kind === 'ruby' && !kanaMode && gl.every(isLatin);
    const gfont = latinRun ? (o.latin ?? font) : font;

    // ruby overhang handling (horizontal + vertical): measure first
    let rubyW = 0;
    let baseW = 0;
    const rubyFont = o.ruby?.font;
    if (sg.kind === 'ruby' && rubyFont && !kanaMode) {
      rubyW = [...sg.ruby!].reduce((w, ch) => w + (o.vertical ? rubyFont.size : metrics(rubyFont, ch).adv), 0);
      baseW = latinRun ? textWidth(gfont, glyphText) : gl.reduce((w, ch) => w + cell(gfont, ch, 0, !!o.vertical).adv, 0);
      // allow the ruby to overhang neighbouring kana by up to half a ruby character each side
      const over = (rubyW - baseW) / 2 - rubyFont.size * 0.5;
      if (over > 0 && !lastWasSpace) pen += over;
      rubyPushRight = Math.max(0, over);
    } else rubyPushRight = 0;

    const segStart = pen;
    if (latinRun) {
      // Latin base: native proportional advances, rotated as a run in vertical text
      const w = textWidth(gfont, glyphText, o.tracking ?? 0) - tr;
      let x = 0;
      gl.forEach((ch, gi) => {
        const adv = metrics(gfont, ch).adv + (gi < gl.length - 1 ? tr : 0);
        const ci = chars[gi] ?? -1;
        const mor = ci >= 0 ? L.chars[ci].morae : sg.morae;
        if (!o.vertical) {
          out.glyphs.push({ ch, seg: si, ci, morae: mor, x: pen + x, y: 0, cx: pen + x + adv / 2, cy: -(m0.emA - m0.emD) / 2, w: adv, h: s, rot: 0, font: gfont, latin: true, phrase: sg.phrase, col });
        } else {
          // rotated 90° cw: glyph advances downwards; baseline sits left of the column axis
          const cy = pen + x + adv / 2;
          out.glyphs.push({ ch, seg: si, ci, morae: mor, x: colX, y: pen + x, cx: colX, cy, w: adv, h: s, rot: Math.PI / 2, font: gfont, latin: true, phrase: sg.phrase, col });
        }
        x += adv;
      });
      pen += w;
    } else {
      gl.forEach((ch, gi) => {
        const { adv, off } = cell(gfont, ch, tsume, !!o.vertical);
        const ci = kanaMode ? -1 : (chars[gi] ?? -1);
        let mor: [number, number] = ci >= 0 ? L.chars[ci].morae : sg.morae;
        if (kanaMode) {
          // map each kana of the reading to its mora
          let k = 0;
          let acc = 0;
          const rm = sg.rubyMorae!;
          while (k < rm.length && acc + [...rm[k]].length <= gi) acc += [...rm[k++]].length;
          mor = [sg.morae[0] + k, sg.morae[0] + k + 1];
        }
        const m = metrics(gfont, ch);
        if (!o.vertical) {
          const x = pen + off;
          out.glyphs.push({ ch, seg: si, ci, morae: mor, x, y: 0, cx: pen + adv / 2, cy: -(m.emA - m.emD) / 2, w: adv, h: s, rot: 0, font: gfont, latin: false, phrase: sg.phrase, col });
        } else {
          const cy = pen + adv / 2;
          let x = colX - m.adv / 2;
          let y = cy + (m.emA - m.emD) / 2;
          let rot = 0;
          if (ch === 'ー' || /[〜～—―…()（）「」『』]/.test(ch)) rot = Math.PI / 2;
          else if (isSmallKana(ch) || ch === 'っ' || ch === 'ッ') {
            // vertical small kana sit towards the upper right of the cell
            const inkCx = (m.l + m.r) / 2 - m.adv / 2;
            const inkCy = (m.a - m.d) / 2 - (m.emA - m.emD) / 2;
            x += -inkCx + s * 0.1;
            y += inkCy - s * 0.1;
          } else if (/[、。，．]/.test(ch)) {
            // punctuation moves to the upper-right quadrant
            const inkCx = (m.l + m.r) / 2;
            const inkCy = (m.a - m.d) / 2;
            x = colX + s * 0.28 - inkCx;
            y = pen + s * 0.22 + inkCy;
          }
          out.glyphs.push({ ch, seg: si, ci, morae: mor, x, y, cx: colX, cy, w: adv, h: s, rot, font: gfont, latin: false, phrase: sg.phrase, col });
        }
        pen += adv + tr;
      });
    }
    const segEnd = pen;

    // ruby placement with 1:2:1 distribution
    if (sg.kind === 'ruby' && rubyFont && !kanaMode && o.ruby) {
      const rm = sg.rubyMorae!;
      const rch = rm.flatMap((mo, k) => [...mo].map((ch) => ({ ch, k })));
      const advs = rch.map(({ ch }) => (o.vertical ? rubyFont.size : metrics(rubyFont, ch).adv));
      const total = advs.reduce((a, b) => a + b, 0);
      const span = segEnd - segStart - (sg.kind === 'ruby' ? tr : 0);
      let unit = 0;
      let start = segStart;
      if (total < span) {
        unit = (span - total) / (2 * rch.length);
        start = segStart + unit;
      } else start = segStart + (span - total) / 2;
      let p = start;
      const rm0 = metrics(rubyFont, 'あ');
      rch.forEach(({ ch, k }, i) => {
        const adv = advs[i];
        const rmx = metrics(rubyFont, ch);
        if (!o.vertical) {
          const y = -m0.emA - o.ruby!.gap - rm0.emD;
          out.ruby.push({ seg: si, mora: sg.morae[0] + k, text: ch, x: p, y, cx: p + adv / 2, cy: y - (rm0.emA - rm0.emD) / 2, rot: 0, font: rubyFont });
        } else {
          const rx = colX + s / 2 + o.ruby!.gap + rubyFont.size / 2;
          const cy = p + adv / 2;
          let x = rx - rmx.adv / 2;
          let y = cy + (rmx.emA - rmx.emD) / 2;
          let rot = 0;
          if (ch === 'ー') rot = Math.PI / 2;
          else if (isSmallKana(ch)) {
            x += rubyFont.size * 0.1;
            y -= rubyFont.size * 0.1;
          }
          out.ruby.push({ seg: si, mora: sg.morae[0] + k, text: ch, x, y, cx: rx, cy, rot, font: rubyFont });
        }
        p += adv + unit * 2;
      });
    }
    out.segs.push({ seg: si, a0: segStart, a1: segEnd - tr, cross: o.vertical ? colX : 0, phrase: sg.phrase, col });
    pen += rubyPushRight;
    lastWasSpace = false;
  }
  // trailing tracking is not part of the measure
  pen -= tr;
  maxLen = Math.max(maxLen, pen);
  out.width = maxLen;
  out.columns = col + 1;
  return out;
}

/** Draw one placed glyph (handles vertical rotation) with an optional transform about its cell centre. */
export function drawGlyph(
  c: CanvasRenderingContext2D,
  g: PlacedGlyph | PlacedRuby,
  ox: number,
  oy: number,
  o: { fill?: string; stroke?: string; lw?: number; alpha?: number; scale?: number; sx?: number; sy?: number; rot?: number; dx?: number; dy?: number } = {},
) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0.002) return;
  const isG = 'ch' in g;
  const text = isG ? (g as PlacedGlyph).ch : (g as PlacedRuby).text;
  c.save();
  c.globalAlpha *= alpha;
  c.font = fontStr(g.font);
  c.fontStretch = g.font.stretch ?? 'normal';
  c.letterSpacing = '0px';
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  const sx = (o.sx ?? 1) * (o.scale ?? 1);
  const sy = (o.sy ?? 1) * (o.scale ?? 1);
  const pcx = ox + g.cx + (o.dx ?? 0);
  const pcy = oy + g.cy + (o.dy ?? 0);
  c.translate(pcx, pcy);
  if (o.rot) c.rotate(o.rot);
  if (sx !== 1 || sy !== 1) c.scale(sx, sy);
  c.translate(-(ox + g.cx), -(oy + g.cy));
  let x = ox + g.x;
  let y = oy + g.y;
  if (g.rot) {
    // rotate about the glyph's own em centre
    const m = metrics(g.font, text);
    const ecx = x + m.adv / 2;
    const ecy = y - (m.emA - m.emD) / 2;
    c.translate(ecx, ecy);
    c.rotate(g.rot);
    c.translate(-ecx, -ecy);
    if (isG && (g as PlacedGlyph).latin) {
      // Latin in a vertical run: the run is rotated about the column axis
      const gg = g as PlacedGlyph;
      const mm = metrics(gg.font, gg.ch);
      x = ecx - mm.adv / 2;
      y = ecy + (mm.a - mm.d) / 2 + (mm.emA - mm.emD) / 2 - (mm.a - mm.d) / 2;
    }
  }
  if (o.stroke) {
    c.lineJoin = 'round';
    c.miterLimit = 2;
    c.lineWidth = o.lw ?? 2;
    c.strokeStyle = o.stroke;
    c.strokeText(text, x, y);
  }
  if (o.fill) {
    c.fillStyle = o.fill;
    c.fillText(text, x, y);
  }
  c.restore();
}

/** Ink bounds of a placed glyph in line space (approximate, unrotated). */
export function glyphBox(g: PlacedGlyph | PlacedRuby): { x0: number; y0: number; x1: number; y1: number } {
  const text = 'ch' in g ? (g as PlacedGlyph).ch : (g as PlacedRuby).text;
  const m = metrics(g.font, text);
  if (g.rot) {
    const h = m.adv / 2;
    return { x0: g.cx - g.font.size / 2, y0: g.cy - h, x1: g.cx + g.font.size / 2, y1: g.cy + h };
  }
  return { x0: g.x + m.l, y0: g.y - m.a, x1: g.x + m.r, y1: g.y + m.d };
}
