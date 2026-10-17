import { FONTS } from '../../engine/draw2d';
import { drawMoon } from '../_shared/moon';
import { P } from './pal';

/** Retro-OS desktop vocabulary (pixel chrome, crisp integer geometry). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
export const lerpRect = (a: Rect, b: Rect, k: number): Rect => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  w: a.w + (b.w - a.w) * k,
  h: a.h + (b.h - a.h) * k,
});

export const TITLE_H = 30;
export const BORDER = 2;
export const TASKBAR_Y = 1040;

export function pixel(c: CanvasRenderingContext2D, s: string, x: number, y: number, o: { size?: number; color?: string; align?: CanvasTextAlign; base?: CanvasTextBaseline } = {}) {
  c.font = `400 ${o.size ?? 16}px ${FONTS.pixel}`;
  c.letterSpacing = '0px';
  c.textAlign = o.align ?? 'left';
  c.textBaseline = o.base ?? 'middle';
  c.fillStyle = o.color ?? P.INK;
  c.fillText(s, Math.round(x), Math.round(y));
  return c.measureText(s).width;
}

let checker: CanvasPattern | null = null;
function checkerPattern(c: CanvasRenderingContext2D) {
  if (!checker) {
    const p = document.createElement('canvas');
    p.width = 2;
    p.height = 2;
    const x = p.getContext('2d')!;
    x.fillStyle = P.INK;
    x.fillRect(0, 0, 1, 1);
    x.fillRect(1, 1, 1, 1);
    checker = c.createPattern(p, 'repeat');
  }
  return checker!;
}

/** Hard 50 % dithered drop shadow (retro). */
export function ditherShadow(c: CanvasRenderingContext2D, r: Rect, off = 8, alpha = 0.55) {
  c.save();
  c.globalAlpha *= alpha;
  c.fillStyle = checkerPattern(c);
  const x = Math.round(r.x + off);
  const y = Math.round(r.y + off);
  c.fillRect(x, y, Math.round(r.w), Math.round(r.h));
  c.restore();
}

export interface WinOpts {
  title: string;
  active?: boolean;
  /** title bar placement: 'above' content (windowed) … 'over' content top (maximised) as 0..1 */
  over?: number;
  shadow?: number;
  /** 0..1 which button is pressed (restore) */
  pressed?: 'restore' | null;
  restoreGlyph?: boolean;
  alpha?: number;
  /** pixel-art scale of the chrome (1 or 2 at rest → crisp pixel font/buttons; fractional only while moving) */
  u?: number;
}

/** Window chrome around a content rect. Content itself is drawn by the caller. Returns the title bar rect. */
export function drawChrome(c: CanvasRenderingContext2D, content: Rect, o: WinOpts): Rect {
  const u = o.u ?? 1;
  if (Math.abs(u - 1) > 1e-6) {
    c.save();
    c.translate(content.x, content.y);
    c.scale(u, u);
    const tb = drawChrome(c, rect(0, 0, content.w / u, content.h / u), { ...o, u: 1 });
    c.restore();
    return rect(content.x + tb.x * u, content.y + tb.y * u, tb.w * u, tb.h * u);
  }
  const over = o.over ?? 0;
  const tb = rect(content.x, content.y - TITLE_H * (1 - over), content.w, TITLE_H);
  const outer = rect(content.x - BORDER, tb.y - BORDER, content.w + BORDER * 2, content.y + content.h - tb.y + BORDER * 2);
  c.save();
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  if ((o.shadow ?? 1) > 0) ditherShadow(c, outer, 8, 0.5 * (o.shadow ?? 1));
  // border (drawn as 4 crisp bars so the content stays untouched)
  c.fillStyle = P.INK;
  const X = Math.round(outer.x);
  const Y = Math.round(outer.y);
  const W = Math.round(outer.w);
  const H = Math.round(outer.h);
  c.fillRect(X, Y, W, BORDER);
  c.fillRect(X, Y + H - BORDER, W, BORDER);
  c.fillRect(X, Y, BORDER, H);
  c.fillRect(X + W - BORDER, Y, BORDER, H);
  // title bar
  const tx = Math.round(tb.x);
  const ty = Math.round(tb.y);
  const tw = Math.round(tb.w);
  c.fillStyle = o.active ? P.OCEAN : P.WHITE;
  c.fillRect(tx, ty, tw, TITLE_H);
  c.fillStyle = P.INK;
  c.fillRect(tx, ty + TITLE_H - 1, tw, 1);
  // pinstripes behind the title
  c.fillStyle = o.active ? 'rgba(255,255,255,0.28)' : 'rgba(10,10,11,0.5)';
  for (let k = 0; k < 5; k++) c.fillRect(tx + 8, ty + 8 + k * 3, tw - 16, 1);
  // title plate + text
  c.font = `400 16px ${FONTS.pixel}`;
  const textW = c.measureText(o.title).width;
  const plateW = Math.round(textW + 24);
  const px = Math.round(tx + 40);
  c.fillStyle = o.active ? P.OCEAN : P.WHITE;
  c.fillRect(px, ty + 4, plateW, TITLE_H - 9);
  pixel(c, o.title, px + 12, ty + TITLE_H / 2 - 0.5, { color: o.active ? P.WHITE : P.INK });
  // app glyph (left): a tiny moon
  c.fillStyle = o.active ? P.OCEAN : P.WHITE;
  c.fillRect(tx + 6, ty + 4, 26, TITLE_H - 9);
  drawMoon(c, tx + 19, ty + TITLE_H / 2 - 0.5, 7, { bg: o.active ? P.OCEAN_DEEP : P.INK, primary: P.ORANGE, rim: 1 });
  // buttons (right): minimise, restore/maximise, close
  const bw = 20;
  const by = ty + 5;
  const glyphs = ['min', o.restoreGlyph ? 'restore' : 'max', 'close'] as const;
  glyphs.forEach((gname, i) => {
    const bx = Math.round(tx + tw - 8 - (3 - i) * (bw + 4) + 4);
    const pressed = o.pressed === 'restore' && i === 1;
    c.fillStyle = pressed ? P.INK : o.active ? P.OCEAN : P.WHITE;
    c.fillRect(bx, by, bw, bw - 2);
    c.fillStyle = pressed ? P.WHITE : o.active ? P.WHITE : P.INK;
    // outline
    c.fillRect(bx, by, bw, 1);
    c.fillRect(bx, by + bw - 3, bw, 1);
    c.fillRect(bx, by, 1, bw - 2);
    c.fillRect(bx + bw - 1, by, 1, bw - 2);
    if (gname === 'min') c.fillRect(bx + 5, by + 12, 10, 2);
    else if (gname === 'max') {
      c.fillRect(bx + 5, by + 4, 10, 2);
      c.fillRect(bx + 5, by + 4, 1, 9);
      c.fillRect(bx + 14, by + 4, 1, 9);
      c.fillRect(bx + 5, by + 12, 10, 1);
    } else if (gname === 'restore') {
      c.fillRect(bx + 7, by + 3, 8, 2);
      c.fillRect(bx + 14, by + 3, 1, 7);
      c.fillRect(bx + 4, by + 7, 8, 2);
      c.fillRect(bx + 4, by + 7, 1, 7);
      c.fillRect(bx + 11, by + 7, 1, 7);
      c.fillRect(bx + 4, by + 13, 8, 1);
    } else {
      for (let k = 0; k < 9; k++) {
        c.fillRect(bx + 5 + k, by + 4 + k, 2, 1);
        c.fillRect(bx + 13 - k, by + 4 + k, 2, 1);
      }
    }
  });
  c.restore();
  return tb;
}

/** Restore/maximise button centre for a title bar rect. */
export const restoreButton = (tb: Rect) => ({ x: tb.x + tb.w - 8 - 2 * 24 + 4 + 10, y: tb.y + 5 + 9 });

/** Classic zoom rects: outline rectangles trailing a moving window. */
export function zoomRects(c: CanvasRenderingContext2D, rects: Rect[], color: string = P.INK, lw = 1) {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = lw;
  for (const r of rects) {
    c.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));
  }
  c.restore();
}

// ── pixel icons (24×24 grids drawn at 2×) ───────────────────────────────────
const ICONS: Record<string, string[]> = {
  folder: [
    '........................',
    '........................',
    '..########..............',
    '.#........#.............',
    '.#.........##########...',
    '.#..................#...',
    '.####################...',
    '.#..................##..',
    '.#..................##..',
    '.#..................##..',
    '.#..................##..',
    '.#..................##..',
    '.#..................##..',
    '.#..................##..',
    '.#..................##..',
    '.#..................##..',
    '.####################...',
    '..###################...',
  ],
  doc: [
    '....##############......',
    '....#...........#.#.....',
    '....#...........#..#....',
    '....#...........####....',
    '....#..............#....',
    '....#..########....#....',
    '....#..............#....',
    '....#..###########.#....',
    '....#..............#....',
    '....#..#########...#....',
    '....#..............#....',
    '....#..##########..#....',
    '....#..............#....',
    '....#..######......#....',
    '....#..............#....',
    '....################....',
    '.....###############....',
  ],
  term: [
    '.######################.',
    '.#....................#.',
    '.######################.',
    '.#####################..',
    '.#....................#.',
    '.#..#.................#.',
    '.#...#................#.',
    '.#....#...............#.',
    '.#...#................#.',
    '.#..#....######.......#.',
    '.#....................#.',
    '.#....................#.',
    '.#....................#.',
    '.######################.',
    '..#####################.',
  ],
  gear: [
    '..........##............',
    '.....##...##...##.......',
    '.....###.####.###.......',
    '......##########........',
    '...###############......',
    '...####.......####......',
    '....##.........##.......',
    '.####...........####....',
    '.####....###....####....',
    '....##...###...##.......',
    '...####.......####......',
    '...###############......',
    '......##########........',
    '.....###.####.###.......',
    '.....##...##...##.......',
    '..........##............',
  ],
};

export function drawIcon(c: CanvasRenderingContext2D, kind: keyof typeof ICONS, x: number, y: number, label: string, o: { selected?: number; scale?: number; alpha?: number } = {}) {
  const grid = ICONS[kind];
  const s = 2 * (o.scale ?? 1);
  const w = 24 * s;
  const ox = Math.round(x - w / 2);
  const oy = Math.round(y - grid.length * s / 2);
  c.save();
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  const sel = o.selected ?? 0;
  // body fill (white) under the outline for doc / folder / term
  c.fillStyle = sel > 0.5 ? P.OCEAN : P.WHITE;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    const a = row.indexOf('#');
    const b = row.lastIndexOf('#');
    if (a >= 0 && b > a) c.fillRect(ox + a * s, oy + r * s, (b - a + 1) * s, s);
  }
  c.fillStyle = P.INK;
  for (let r = 0; r < grid.length; r++)
    for (let k = 0; k < 24; k++) if (grid[r][k] === '#') c.fillRect(ox + k * s, oy + r * s, s, s);
  // label: file names use the mono face (film typography rule)
  c.font = `500 15px ${FONTS.mono}`;
  c.letterSpacing = '0px';
  const tw = Math.ceil(c.measureText(label).width);
  const ly = oy + grid.length * s + 14;
  c.fillStyle = sel > 0.5 ? P.INK : P.DESK;
  c.fillRect(Math.round(x - tw / 2 - 5), ly - 11, tw + 10, 22);
  c.fillStyle = sel > 0.5 ? P.WHITE : P.INK;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(label, Math.round(x), ly + 1);
  c.restore();
}

/** Taskbar (bottom). */
export function drawTaskbar(c: CanvasRenderingContext2D, t: number, o: { y?: number; tabs: { label: string; active?: boolean; pulse?: number }[]; build?: number | null; clock: string; statusOn: boolean }) {
  const y = Math.round(o.y ?? TASKBAR_Y);
  c.fillStyle = P.INK;
  c.fillRect(0, y, 1920, 1080 - y + 40);
  c.fillStyle = P.WHITE;
  c.fillRect(0, y, 1920, 1);
  // start: moon + FUMADOCS
  drawMoon(c, 30, y + 20, 10, { bg: P.INK, primary: P.ORANGE, rim: 1 });
  pixel(c, 'FUMADOCS', 50, y + 20, { color: P.WHITE });
  c.fillStyle = '#3a3a40';
  c.fillRect(150, y + 8, 1, 24);
  // tabs
  let x = 164;
  for (const tab of o.tabs) {
    c.font = `400 16px ${FONTS.pixel}`;
    const w = Math.max(150, Math.ceil(c.measureText(tab.label).width) + 36);
    const act = tab.active;
    c.fillStyle = act ? P.WHITE : '#1d1d22';
    c.fillRect(x, y + 6, w, 28);
    c.fillStyle = act ? P.INK : '#55555c';
    c.fillRect(x, y + 6, w, 1);
    c.fillRect(x, y + 33, w, 1);
    c.fillRect(x, y + 6, 1, 28);
    c.fillRect(x + w - 1, y + 6, 1, 28);
    if (tab.pulse && tab.pulse > 0) {
      c.fillStyle = `rgba(250,128,35,${0.85 * tab.pulse})`;
      c.fillRect(x, y + 6, w, 28);
    }
    c.fillStyle = act ? P.ORANGE : '#55555c';
    c.fillRect(x + 10, y + 17, 6, 6);
    pixel(c, tab.label, x + 24, y + 20, { color: act ? P.INK : '#c9c7c0' });
    x += w + 8;
  }
  // build % tag
  if (o.build !== null && o.build !== undefined) {
    const v = Math.min(100, Math.max(0, o.build));
    const bx = 900;
    pixel(c, 'BUILD', bx, y + 20, { color: P.WHITE });
    c.fillStyle = '#2a2a30';
    c.fillRect(bx + 56, y + 13, 200, 14);
    c.fillStyle = P.ORANGE;
    c.fillRect(bx + 56, y + 13, Math.round(2 * v), 14);
    pixel(c, `${v.toFixed(4)}%`, bx + 266, y + 20, { color: P.WHITE });
  }
  // status + clock (right)
  const sx = 1500;
  c.fillStyle = o.statusOn ? P.ORANGE : '#3a3a40';
  c.fillRect(sx, y + 16, 8, 8);
  pixel(c, 'STATUS: CONNECTED', sx + 16, y + 20, { color: P.WHITE });
  c.fillStyle = '#3a3a40';
  c.fillRect(1770, y + 8, 1, 24);
  pixel(c, o.clock, 1900, y + 20, { color: P.WHITE, align: 'right' });
}
