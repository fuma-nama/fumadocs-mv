import { C } from '../_shared/palette';
import { text, measure, glyphs, type TextOpts } from '../../engine/draw2d';
import { clamp, ease } from '../../engine/anim';
import { TITLE, drawTitleCard } from '../intro/title';
import { sheen } from './life';

/**
 * End card = the intro title card's night side (TITLE grid, PAPER on INK): frame, marks and
 * rulers from the intro's drawTitleCard; README.mdx — 09 / 09; the moon + FUMADOCS lockup at the
 * title's position; 「WRITE█」 where 「README█」 stood; tagline; the terminal line; credits.
 */
type Ctx = CanvasRenderingContext2D;

const WORD = 'WRITE';
const WORD_FONT: TextOpts = { font: 'display', size: 330, weight: 900, stretch: 'extra-condensed', tracking: -0.005, color: C.PAPER };
/** title caret (big, after the word) */
export const BIG_CARET = { w: TITLE.caret.w, h: TITLE.caret.h, y: TITLE.caret.y };
const CARET_GAP = TITLE.caret.x - TITLE.caret.w / 2 - TITLE.word.x1; // ink → caret gap (30 px)

/** hierarchy: WRITE → the command (second voice, right under the word) → tagline → credits */
const TAGLINE = ['Build excellent', 'documentation,', 'your style.'];
const TAG_FONT: TextOpts = { font: 'ui', size: 32, weight: 400, tracking: -0.01, color: C.PAPER };
const TAG_Y = 884;

/** terminal line: Geist Mono 44 px → 26.4 px cells; the caret is one cell (1:2, like the intro's) */
const TERM_FONT: TextOpts = { font: 'mono', size: 44, weight: 400, tracking: 0, color: C.PAPER };
export const CMD = 'npm create fumadocs-app';
export const TERM_Y = 792; // caret centre
export const CELL = 26.4;
const TERM_BASE = TERM_Y + 0.278 * 2 * CELL; // baseline (same caret/baseline relation as the 30 px line)
/** optical correction: W's slanted side reads ~8 px farther from 「 than E's bar ends from 」 */
const OPEN_OPTICAL = 8;

interface WordLayout {
  /** pen origin x of each glyph (alphabetic baseline at TITLE.word.baseline) */
  glyphX: number[];
  inkL: number;
  inkR: number;
  /** caret centre x after k glyphs (k = 0..5) */
  caretX: number[];
  open: [number, number];
  /** closing bracket corner: with the caret inside / tight after the word */
  closeCaret: [number, number];
  closeWord: [number, number];
}

let wl: WordLayout | undefined;
/** WRITE centred on the frame (the caret overhangs while it writes, the bracket closes after). */
export function wordLayout(c: Ctx): WordLayout {
  if (wl) return wl;
  c.save();
  c.font = `${WORD_FONT.weight} ${WORD_FONT.size}px "Archivo", "Noto Sans JP", sans-serif`;
  c.fontStretch = WORD_FONT.stretch!;
  c.letterSpacing = `${(WORD_FONT.tracking ?? 0) * WORD_FONT.size}px`;
  const m = c.measureText(WORD);
  c.restore();
  const lsb = -m.actualBoundingBoxLeft; // ink starts this far right of the origin
  const inkW = m.actualBoundingBoxRight + m.actualBoundingBoxLeft;
  const inkL = Math.round(960 - inkW / 2);
  const ox = inkL - lsb;
  const inkR = inkL + inkW;
  const { glyphs: gs } = glyphs(c, WORD, WORD_FONT);
  // caret after k glyphs: advance end of the k-th glyph, shifted so the final position = inkR + gap
  const advEnd = (k: number) => (k === 0 ? 0 : gs[k - 1].x + gs[k - 1].w);
  const fix = inkR + CARET_GAP - (ox + advEnd(gs.length));
  const caretX = [inkL + BIG_CARET.w / 2];
  for (let k = 1; k <= gs.length; k++) caretX.push(ox + advEnd(k) + fix + BIG_CARET.w / 2);
  const br = TITLE.brackets;
  const dxOpen = TITLE.word.x0 - br.open[0];
  const dxClose = br.close[0] - (TITLE.caret.x + TITLE.caret.w / 2);
  wl = {
    glyphX: gs.map((g) => ox + g.x),
    inkL,
    inkR,
    caretX,
    open: [inkL - dxOpen + OPEN_OPTICAL, br.open[1]],
    closeCaret: [inkR + CARET_GAP + BIG_CARET.w + dxClose, br.close[1]],
    closeWord: [inkR + dxOpen, br.close[1]],
  };
  return wl;
}

interface TermLayout {
  x0: number;
  cmdX: number;
  /** caret centre x after n typed chars */
  caretX: (n: number) => number;
}
export function termLayout(): TermLayout {
  const cells = 2 + CMD.length + 1; // "❯ " + command + caret
  const x0 = Math.round(960 - (cells * CELL) / 2);
  const cmdX = x0 + 2 * CELL;
  return { x0, cmdX, caretX: (n) => cmdX + n * CELL + CELL / 2 };
}

/** Build state of the card (all 0..1). */
export interface CardBuild {
  frame: number;
  header: number;
  /** 0..1 page counter roll (01 → 09) */
  pages: number;
  wordmark: number;
  brackets: number;
  /** 0 = closing bracket after the caret, 1 = tight after the word */
  closeK: number;
  /** か こ う under the word (mirror of the title's リードミー) */
  kana: number;
  /** number of WRITE glyphs typed (fractional = glyph ink-in) */
  typed: number;
  tag: number[];
  prompt: number;
  /** chars of the command typed */
  cmd: number;
  credits: number;
  /** global card opacity (fade at the end) */
  alpha: number;
  /** music-box light sweep (bar 68): sheen progress per element, 0..1 */
  light?: { wordmark: number; word: number; cmd: number };
}

export function drawCard(c: Ctx, b: CardBuild) {
  if (b.alpha <= 0) return;
  c.save();
  c.globalAlpha = b.alpha;
  // frame + registration marks + rulers (intro's drawing, night colours)
  if (b.frame > 0) drawTitleCard(c, { ink: C.PAPER, bg: C.INK, caret: 0, build: { frame: b.frame, lockup: 0, word: 0, credits: 0 } });
  c.globalAlpha = b.alpha;
  const mono = (s: string, x: number, y: number, align: CanvasTextAlign, a: number) =>
    text(c, s, x, y, { font: 'mono', size: 14, weight: 500, color: C.PAPER, align, alpha: a, tracking: 0.04 });
  if (b.header > 0) {
    mono('README.mdx', 84, 94, 'left', 0.75 * b.header);
    // the page counter rolls through the film's sections: 01 → 09 (the title card read 01 / 09)
    const page = Math.min(9, 1 + Math.floor(b.pages * 8.999));
    mono(`— ${String(page).padStart(2, '0')} / 09`, 188, 94, 'left', 0.4 * b.header);
    mono('FUMADOCS MV  ·  2026', 1836, 94, 'right', 0.75 * b.header);
  }
  if (b.credits > 0) {
    mono('制作  PRODUCTION', 1836, 950, 'right', 0.45 * b.credits);
    mono('Fumadocs', 1836, 974, 'right', 0.75 * b.credits);
    mono('fumadocs.dev', 1836, 998, 'right', 0.75 * b.credits);
  }
  if (b.wordmark > 0) {
    const tr = 0.62 + 0.5 * (1 - ease.outCubic(b.wordmark));
    const wo: TextOpts = { font: 'wide', size: 18, tracking: tr, align: 'center', color: C.PAPER, alpha: b.wordmark };
    text(c, 'FUMADOCS', TITLE.wordmark.x, TITLE.wordmark.baseline, wo);
    if (b.light) sheen(c, 'FUMADOCS', TITLE.wordmark.x, TITLE.wordmark.baseline, wo, b.light.wordmark, 830, 1090, C.SUN, 1, 70);
  }
  const L = wordLayout(c);
  // 「 」 brackets (snap in from slightly outside)
  if (b.brackets > 0) {
    const br = TITLE.brackets;
    const k = ease.outExpo(b.brackets);
    const off = (1 - k) * 26;
    c.globalAlpha = b.alpha * clamp(b.brackets * 3);
    c.fillStyle = C.PAPER;
    const [ox, oy] = L.open;
    const qx = L.closeCaret[0] + (L.closeWord[0] - L.closeCaret[0]) * b.closeK;
    const qy = L.closeCaret[1];
    c.fillRect(ox - off, oy - off, br.t, br.armV);
    c.fillRect(ox - off, oy - off, br.armH, br.t);
    c.fillRect(qx - br.t + off, qy - br.armV + off, br.t, br.armV);
    c.fillRect(qx - br.armH + off, qy - br.t + off, br.armH, br.t);
    c.globalAlpha = b.alpha;
  }
  // WRITE, glyph by glyph
  if (b.typed > 0) {
    const n = Math.min(WORD.length, Math.ceil(b.typed));
    for (let k = 0; k < n; k++) {
      const p = clamp(b.typed - k);
      const kk = k < Math.floor(b.typed) ? 1 : p;
      text(c, [...WORD][k], L.glyphX[k], TITLE.word.baseline, { ...WORD_FONT, alpha: b.alpha * clamp(kk * 1.6) });
      if (b.light) sheen(c, [...WORD][k], L.glyphX[k], TITLE.word.baseline, WORD_FONT, b.light.word, L.inkL, L.inkR, '#FFFBF2', 1, 190);
    }
  }
  // か こ う — the reading under the word, like the title card's リ ー ド ミ ー
  if (b.kana > 0) text(c, 'か こ う', 960, 704 + (1 - ease.outCubic(b.kana)) * 6, { font: 'jpKaku', size: 22, weight: 700, align: 'center', color: C.PAPER, alpha: 0.7 * b.alpha * b.kana, tracking: 0.3 });
  // tagline, word by word
  if (b.tag.some((x) => x > 0)) {
    const space = measure(c, ' ', TAG_FONT);
    const widths = TAGLINE.map((w) => measure(c, w, TAG_FONT));
    const total = widths.reduce((a, w) => a + w, 0) + space * (TAGLINE.length - 1);
    let x = 960 - total / 2;
    TAGLINE.forEach((w, i) => {
      const p = b.tag[i] ?? 0;
      if (p > 0) {
        const e = ease.outCubic(p);
        const last = i === TAGLINE.length - 1; // "your style." a step brighter
        // secondary to WRITE and the command: "your style." a step brighter than the rest
        const to: TextOpts = { ...TAG_FONT, color: last ? '#CFCDC5' : '#8E8C86', alpha: b.alpha * e };
        text(c, w, x, TAG_Y + (1 - e) * 8, to);
      }
      x += widths[i] + space;
    });
  }
  // terminal line
  const T = termLayout();
  if (b.prompt > 0) text(c, '❯', T.x0, TERM_BASE, { ...TERM_FONT, color: C.ORANGE, alpha: b.alpha * b.prompt });
  if (b.cmd > 0) {
    const typed = CMD.slice(0, Math.floor(b.cmd + 1e-6));
    const to: TextOpts = { ...TERM_FONT, color: C.WHITE, alpha: b.alpha };
    text(c, typed, T.cmdX, TERM_BASE, to);
    if (b.light) sheen(c, typed, T.cmdX, TERM_BASE, to, b.light.cmd, T.cmdX, T.cmdX + CMD.length * CELL, '#FFF1D6', 0.8, 140);
  }
  c.restore();
}

