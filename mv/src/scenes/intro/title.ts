import { C } from '../_shared/palette';
import { drawMoon } from '../_shared/moon';
import { text, type TextOpts } from '../../engine/draw2d';
import { drawCaret } from './caret';

/**
 * Title card layout (1920×1080, full-bleed paper) — the B1 contract with READ and the
 * template OUTRO mirrors. Static numbers, side-effect free.
 */
export const TITLE = {
  paper: C.PAPER,
  ink: C.INK,
  accent: C.ORANGE,
  /** 1 px ink frame (outer edge of the stroke) */
  frame: { x: 48, y: 48, w: 1824, h: 984 },
  /** registration marks (centres) */
  marks: [[24, 24], [1896, 24], [24, 1056], [1896, 1056]] as [number, number][],
  /** README: ink box (x0..x1, capTop..baseline); drawn in Archivo 900 extra-condensed 330 px */
  word: { x0: 371, x1: 1406, capTop: 383, baseline: 610, size: 330 },
  /** orange block caret: centre + size (drawCaret edges snap to 1436..1550 × 383..611) */
  caret: { x: 1493, y: 497, w: 114, h: 228 },
  /** corner brackets 「 」: corner points, stroke thickness, arm lengths */
  brackets: { open: [301, 347] as [number, number], close: [1620, 646] as [number, number], t: 22, armH: 92, armV: 150 },
  /** moon logo (shared drawMoon, bg = paper) + FUMADOCS wordmark baseline */
  moon: { x: 960, y: 232, r: 34 },
  wordmark: { x: 960, baseline: 312 },
  /** overlay lyric band (bottom-left) — kept clear */
  lyricBand: { x: 112, y: 895, w: 788, h: 120 },
};

const WORD_FONT: TextOpts = { font: 'display', size: 330, weight: 900, stretch: 'extra-condensed', tracking: -0.005 };
/** the font's left side bearing of "R" at 330 px (ink starts this far right of the origin) */
const WORD_LSB = 13.35;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export interface TitleBuild {
  /** 0..1 each: word (+ brackets), frame + marks, moon lockup, small type */
  word?: number;
  frame?: number;
  lockup?: number;
  credits?: number;
  /** print misregistration offset of the word's ink (px), snaps to 0 */
  misreg?: number;
}

/**
 * Draw the title card content (not the paper fill). `build` drives the build-in (omit for the
 * final card). `caret` = caret opacity (0 hides it — READ draws it from 14.4).
 */
export function drawTitleCard(c: CanvasRenderingContext2D, o: { caret?: number; build?: TitleBuild; ink?: string; bg?: string } = {}) {
  const ink = o.ink ?? TITLE.ink;
  const k = { word: 1, frame: 1, lockup: 1, credits: 1, misreg: 0, ...o.build };
  const fr = TITLE.frame;
  c.save();
  c.lineWidth = 1;
  c.strokeStyle = ink;
  c.fillStyle = ink;

  // frame (draws out from the four corners) + registration marks + margin rulers
  if (k.frame > 0) {
    const p = clamp01(k.frame);
    const L = fr.x + 0.5, T = fr.y + 0.5, R = fr.x + fr.w - 0.5, B = fr.y + fr.h - 0.5;
    const hw = ((R - L) / 2) * p, hh = ((B - T) / 2) * p;
    c.beginPath();
    c.moveTo(L, T + hh); c.lineTo(L, T); c.lineTo(L + hw, T);
    c.moveTo(R - hw, T); c.lineTo(R, T); c.lineTo(R, T + hh);
    c.moveTo(R, B - hh); c.lineTo(R, B); c.lineTo(R - hw, B);
    c.moveTo(L + hw, B); c.lineTo(L, B); c.lineTo(L, B - hh);
    c.stroke();
    c.globalAlpha = p;
    for (const [mx, my] of TITLE.marks) {
      c.beginPath();
      c.arc(mx + 0.5, my + 0.5, 8, 0, Math.PI * 2);
      c.moveTo(mx - 15, my + 0.5); c.lineTo(mx + 16, my + 0.5);
      c.moveTo(mx + 0.5, my - 15); c.lineTo(mx + 0.5, my + 16);
      c.stroke();
    }
    c.globalAlpha = 0.4 * p;
    c.beginPath();
    for (let x = 120; x <= 1800; x += 24) {
      const major = (x - 120) % 240 === 0;
      c.moveTo(x + 0.5, 48);
      c.lineTo(x + 0.5, 48 - (major ? 9 : 4));
    }
    for (let y = 120; y <= 960; y += 24) {
      const major = (y - 120) % 240 === 0;
      c.moveTo(48, y + 0.5);
      c.lineTo(48 - (major ? 9 : 4), y + 0.5);
    }
    c.stroke();
    c.globalAlpha = 1;
  }

  // header + small credits (lower-right; the lower-left is the lyric's)
  if (k.credits > 0) {
    const a = clamp01(k.credits);
    const mono = (s: string, x: number, y: number, align: CanvasTextAlign = 'left', alpha = 0.75) =>
      text(c, s, x, y, { font: 'mono', size: 14, weight: 500, color: ink, align, alpha: alpha * a, tracking: 0.04 });
    mono('README.mdx', 84, 94);
    mono('— 01 / 09', 188, 94, 'left', 0.4);
    mono('FUMADOCS MV  ·  2026', 1836, 94, 'right');
    mono('作品  ORIGINAL', 1836, 950, 'right', 0.45);
    mono('Fumadocs', 1836, 974, 'right');
    mono('fumadocs.dev', 1836, 998, 'right');
  }

  // lockup: moon + FUMADOCS
  if (k.lockup > 0) {
    const a = clamp01(k.lockup);
    const m = TITLE.moon;
    drawMoon(c, m.x, m.y, m.r * (0.7 + 0.3 * a), { bg: o.bg ?? TITLE.paper, alpha: a });
    text(c, 'FUMADOCS', TITLE.wordmark.x, TITLE.wordmark.baseline, { font: 'wide', size: 18, tracking: 0.62, align: 'center', color: ink, alpha: a });
  }

  // 「README」
  if (k.word > 0) {
    const a = clamp01(k.word);
    const w = TITLE.word;
    c.globalAlpha = a;
    text(c, 'README', w.x0 - WORD_LSB + k.misreg, w.baseline, { ...WORD_FONT, color: ink });
    const br = TITLE.brackets;
    const [ox, oy] = br.open;
    const [qx, qy] = br.close;
    c.fillRect(ox, oy, br.t, br.armV);
    c.fillRect(ox, oy, br.armH, br.t);
    c.fillRect(qx - br.t, qy - br.armV, br.t, br.armV);
    c.fillRect(qx - br.armH, qy - br.t, br.armH, br.t);
    c.globalAlpha = 1;
    text(c, 'リ ー ド ミ ー', 960, 704, { font: 'jpKaku', size: 22, weight: 700, align: 'center', color: ink, alpha: 0.85 * a, tracking: 0.3 });
    text(c, 'THE DOCS FRAMEWORK DESIGNED WITH CARE', 960, 746, { font: 'wide', size: 11, align: 'center', color: ink, alpha: 0.55 * a, tracking: 0.42 });
  }
  c.restore();

  const ca = o.caret ?? 1;
  if (ca > 0 && k.word > 0) {
    const r = TITLE.caret;
    drawCaret(c, r.x, r.y, { h: r.h, w: r.w, alpha: ca, glow: 0.45 });
  }
}
