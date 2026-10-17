import { FONTS, crosshair, grid, line } from '../../engine/draw2d';
import { P } from './pal';
import type { Desk } from './state';

/**
 * Desktop wallpaper: cream paper, a fine drawing grid and the engineering-drawing furniture of
 * the Document Engine blueprint (sheet border, title block, numbered cells, registration marks).
 * The engine itself is drawn by the 3D blueprint pass on top of this.
 */
export function drawWallpaper(c: CanvasRenderingContext2D, t: number, d: Desk) {
  void t;
  void d;
  grid(c, 0, 0, 1920, 1040, 40, 1, 'rgba(10,10,11,0.045)', 0, 0);
  const blue = 'rgba(35,87,168,0.55)';
  const blueSoft = 'rgba(35,87,168,0.28)';
  // sheet border
  c.strokeStyle = blueSoft;
  c.lineWidth = 1;
  c.strokeRect(24.5, 24.5, 1871, 991);
  c.strokeRect(32.5, 32.5, 1855, 975);
  // numbered cells along the top edge (01–12)
  c.font = `400 12px ${FONTS.mono}`;
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.fillStyle = blue;
  for (let i = 0; i < 12; i++) {
    const x = 32 + (i + 0.5) * (1855 / 12);
    c.fillText(String(i + 1).padStart(2, '0'), x, 28.5);
    if (i > 0) line(c, 32 + i * (1855 / 12) + 0.5, 24, 32 + i * (1855 / 12) + 0.5, 33, 1, blueSoft);
  }
  // registration marks
  for (const [x, y] of [[60, 60], [1860, 60], [60, 980], [1860, 980]] as const) crosshair(c, x + 0.5, y + 0.5, 12, 1, blue, 3);
  // title block (bottom-left, outside the chant band)
  const tx = 52;
  const ty = 900;
  c.strokeStyle = blue;
  c.strokeRect(tx + 0.5, ty + 0.5, 400, 96);
  line(c, tx, ty + 32.5, tx + 400, ty + 32.5, 1, blue);
  line(c, tx, ty + 64.5, tx + 400, ty + 64.5, 1, blue);
  line(c, tx + 260.5, ty + 32, tx + 260.5, ty + 96, 1, blue);
  c.textAlign = 'left';
  c.fillStyle = blue;
  c.font = `400 15px ${FONTS.wide}`;
  c.letterSpacing = '3px';
  c.fillText('DOCUMENT ENGINE', tx + 12, ty + 17);
  c.letterSpacing = '0px';
  c.font = `400 12px ${FONTS.mono}`;
  c.fillText('MODEL FD-16 · @fumadocs/cli', tx + 12, ty + 49);
  c.fillText('SHEET 01/01', tx + 272, ty + 49);
  c.fillText('PART: layouts/docs', tx + 12, ty + 81);
  c.fillText('SCALE 1:1', tx + 272, ty + 81);
  c.textAlign = 'right';
  c.fillText('README · bridge · bars 41–48', 1880, 1004);
}

export { P };
