import type { LyricStyleName } from '../data';
import { lyricLines } from '../state';
import type { LineTiming } from '../timing';
import { drawChorus, drawFinal, drawSubtitle } from './big';
import { INK, lineWindow, ORANGE, PAPER, type Palette, type StyleFn } from './common';
import { drawChant, drawEnglishOnly, drawOutro, drawPlain } from './misc';
import { drawPre } from './pre';
import { drawVerse, drawVertical } from './verse';

export * from './common';
export { drawPreCell, drawBoxWord, type PreCellOpts } from './pre';

export const STYLE_FNS: Record<LyricStyleName, StyleFn> = {
  verse: drawVerse,
  vertical: drawVertical,
  pre: drawPre,
  chorus: drawChorus,
  subtitle: drawSubtitle,
  chant: drawChant,
  final: drawFinal,
  outro: drawOutro,
  plain: drawPlain,
  english: drawEnglishOnly,
  // the line is carried by the picture (e.g. a stop where the scene's shape IS the vocal)
  none: () => {},
};

export interface DrawLyricOpts {
  style?: LyricStyleName;
  /**
   * Anchor: verse = left end of the baseline · vertical = top of the column axis ·
   * pre/chant = centre of the cell row · chorus/final/subtitle/plain/outro/english = centre of the baseline.
   */
  x?: number;
  y?: number;
  scale?: number;
  alpha?: number;
  /** background tone under the text (dark → light text) */
  tone?: 'dark' | 'light';
  ink?: string;
  accent?: string;
  /** a specific take (default: the take visible at t) */
  line?: LineTiming;
}

/** Draw the overlay's karaoke look for the line visible at t onto your own canvas. */
export function drawLyric(c: CanvasRenderingContext2D, t: number, o: DrawLyricOpts = {}) {
  const L =
    o.line ??
    lyricLines().find((l) => {
      const w = lineWindow(l);
      return t >= w.a && t < w.b;
    });
  if (!L) return;
  const tone = o.tone ?? 'dark';
  const pal: Palette = { ink: o.ink ?? (tone === 'dark' ? PAPER : INK), bg: tone === 'dark' ? INK : PAPER, accent: o.accent ?? ORANGE, tone };
  STYLE_FNS[o.style ?? L.style](c, L, t, { pal, scale: o.scale, alpha: o.alpha, anchor: o.x !== undefined && o.y !== undefined ? [o.x, o.y] : undefined });
}
