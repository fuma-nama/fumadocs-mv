import { C } from '../_shared/palette';
import { boxLabel, text, rect, line, barcode, measure } from '../../engine/draw2d';
import { CHAPTERS } from './world';
import { PL, drawPlate } from './plates';

/**
 * Monolith page faces: one per chapter (= later section). White line-art on black, drawn once.
 * Also reused (flat) by the bar-8 strobe cards via drawSilhouette.
 */
export const FACE_W = 520;
export const FACE_H = 1200;

const WHITE = '#f4f3ee';
const DIM = 'rgba(244,243,238,0.45)';
const FAINT = 'rgba(244,243,238,0.22)';

type Ctx = CanvasRenderingContext2D;

function bars(c: Ctx, x: number, y: number, widths: number[], gap: number, h: number, color: string) {
  widths.forEach((w, i) => rect(c, x, y + i * gap, w, h, { fill: color }));
}

/** Silhouette of chapter k's key image inside the box (x, y, w, h). `ink` = line colour. */
export function drawSilhouette(c: Ctx, k: number, x: number, y: number, w: number, h: number, ink = WHITE, dim = DIM, faint = FAINT, accent: string = C.ORANGE) {
  c.save();
  c.lineWidth = 2;
  c.strokeStyle = ink;
  c.fillStyle = ink;
  const s = Math.min(w / 440, h / 620);
  c.translate(x + w / 2, y + h / 2);
  c.scale(s, s);
  c.translate(-220, -310);
  switch (k) {
    case 0: {
      // READ — a docs page: sidebar + article + code block
      rect(c, 0, 0, 440, 620, { stroke: ink, lw: 2, r: 14 });
      line(c, 0, 52, 440, 52, 2, ink);
      rect(c, 18, 18, 18, 18, { fill: ink, r: 9 });
      bars(c, 46, 22, [90], 0, 10, ink);
      line(c, 130, 52, 130, 620, 2, dim);
      bars(c, 18, 80, [80, 96, 70, 88, 60, 92, 76], 34, 9, dim);
      rect(c, 12, 74 + 34 * 2, 108, 22, { fill: faint, r: 6 });
      bars(c, 152, 82, [180], 0, 22, ink);
      bars(c, 152, 128, [260, 240, 268, 200], 24, 8, dim);
      rect(c, 152, 240, 268, 150, { stroke: ink, lw: 2, r: 10 });
      bars(c, 170, 262, [120, 180, 150, 90, 160], 24, 8, dim);
      bars(c, 152, 420, [250, 262, 230, 180, 240, 210], 24, 8, faint);
      break;
    }
    case 1: {
      // NAVIGATE — the TOC: headings + 1 px rail with Bézier joins + the dot
      text(c, 'On this page', 40, 40, { font: 'ui', size: 26, weight: 500, color: dim });
      const items: [number, number][] = [[0, 100], [0, 160], [1, 220], [1, 280], [2, 340], [0, 400], [1, 460], [0, 520]];
      const xs = [40, 58, 76];
      c.beginPath();
      items.forEach(([d, yy], i) => {
        const xx = xs[d];
        if (i === 0) c.moveTo(xx, yy - 18);
        else {
          const [pd, py] = items[i - 1];
          c.bezierCurveTo(xs[pd], yy - 30, xx, py + 30, xx, yy - 18);
        }
        c.lineTo(xx, yy + 18);
      });
      c.lineWidth = 3;
      c.strokeStyle = ink;
      c.stroke();
      items.forEach(([d, yy], i) => bars(c, xs[d] + 30, yy - 6, [[200, 170, 150, 190, 120, 210, 160, 180][i]], 0, 12, i === 3 ? ink : dim));
      c.beginPath();
      c.arc(xs[1], 280, 9, 0, Math.PI * 2);
      c.fillStyle = accent;
      c.fill();
      break;
    }
    case 2: {
      // ARRANGE — layout wireframes: Docs / Notebook / Flux
      const L = (yy: number, kind: number) => {
        rect(c, 0, yy, 440, 180, { stroke: ink, lw: 2, r: 10 });
        if (kind === 0) {
          line(c, 100, yy, 100, yy + 180, 2, ink);
          line(c, 350, yy, 350, yy + 180, 2, dim);
          bars(c, 120, yy + 24, [140, 200, 180, 210], 30, 10, dim);
        } else if (kind === 1) {
          line(c, 0, yy + 36, 440, yy + 36, 2, ink);
          line(c, 90, yy + 36, 90, yy + 180, 2, dim);
          bars(c, 110, yy + 58, [200, 260, 230], 30, 10, dim);
        } else {
          bars(c, 110, yy + 24, [220, 200, 180], 30, 10, dim);
          rect(c, 120, yy + 130, 200, 34, { stroke: ink, lw: 2, r: 17 });
        }
      };
      L(0, 0);
      L(220, 1);
      L(440, 2);
      break;
    }
    case 3: {
      // COLOR — twelve swatch circles (monochrome until the chorus)
      for (let i = 0; i < 12; i++) {
        const cx = 70 + (i % 3) * 150;
        const cy = 70 + Math.floor(i / 3) * 160;
        c.beginPath();
        c.arc(cx, cy, 52, 0, Math.PI * 2);
        c.save();
        c.globalAlpha *= 0.15 + (i / 11) * 0.8;
        c.fillStyle = ink;
        c.fill();
        c.restore();
        c.lineWidth = 2;
        c.strokeStyle = ink;
        c.stroke();
      }
      break;
    }
    case 4: {
      // CUSTOMIZE — terminal with the CLI prompt
      rect(c, 0, 60, 440, 480, { stroke: ink, lw: 2, r: 12 });
      line(c, 0, 104, 440, 104, 2, ink);
      for (let i = 0; i < 3; i++) rect(c, 18 + i * 22, 76, 12, 12, { stroke: ink, lw: 2, r: 6 });
      const mono = (s: string, xx: number, yy: number, col: string) => text(c, s, xx, yy, { font: 'code', size: 22, weight: 500, color: col });
      mono('$ npx @fumadocs/cli', 20, 150, ink);
      mono('  customize', 20, 182, ink);
      mono('◆ What to customize?', 20, 240, dim);
      mono('● Docs Layout', 20, 280, ink);
      mono('○ Notebook', 20, 316, dim);
      mono('○ Flux', 20, 352, dim);
      mono('◻ Layout: sidebar', 20, 410, dim);
      rect(c, 20, 440, 14, 26, { fill: accent });
      break;
    }
    case 5: {
      // CONNECT — a request packet: POST /planets → 201 Created
      rect(c, 0, 40, 120, 44, { fill: ink, r: 8 });
      text(c, 'POST', 60, 70, { font: 'code', size: 22, weight: 700, color: '#000', align: 'center' });
      text(c, '/planets', 140, 70, { font: 'code', size: 26, weight: 500, color: ink });
      line(c, 60, 110, 60, 420, 2, dim);
      for (let i = 0; i < 5; i++) {
        rect(c, 50, 140 + i * 56, 20, 20, { stroke: ink, lw: 2 });
        bars(c, 90, 145 + i * 56, [[220, 180, 260, 150, 200][i]], 0, 10, dim);
      }
      rect(c, 0, 440, 440, 70, { stroke: ink, lw: 2, r: 10 });
      text(c, '201 Created', 24, 486, { font: 'code', size: 28, weight: 700, color: ink });
      c.beginPath();
      c.arc(400, 475, 10, 0, Math.PI * 2);
      c.fillStyle = accent;
      c.fill();
      break;
    }
    case 6: {
      // PUBLISH — a city of screens (site tiles)
      for (let i = 0; i < 15; i++) {
        const cx = (i % 3) * 150;
        const cy = Math.floor(i / 3) * 124;
        rect(c, cx, cy, 136, 108, { stroke: i === 7 ? ink : dim, lw: 2, r: 8 });
        line(c, cx, cy + 22, cx + 136, cy + 22, 2, i === 7 ? ink : faint);
        bars(c, cx + 12, cy + 38, [70 + (i * 17) % 50, 90, 60], 18, 7, i === 7 ? ink : faint);
      }
      break;
    }
    default: {
      // WRITE — the caret and the first command
      rect(c, 0, 120, 440, 300, { stroke: dim, lw: 2, r: 12 });
      text(c, '$ npm create', 24, 200, { font: 'code', size: 30, weight: 600, color: ink });
      text(c, '  fumadocs-app', 24, 244, { font: 'code', size: 30, weight: 600, color: ink });
      rect(c, 24, 290, 40, 80, { fill: accent });
      bars(c, 0, 470, [420, 380, 410, 300], 30, 10, faint);
    }
  }
  c.restore();
}

/** Chapter k's key image: real UI plates where we have them, line-art otherwise. */
export function drawContent(c: Ctx, k: number, x: number, y: number, w: number, h: number) {
  const frame = (fx: number, fy: number, fw: number, fh: number) => rect(c, fx + 0.5, fy + 0.5, fw - 1, fh - 1, { stroke: DIM, lw: 1, r: 6 });
  if (k === 0 && PL.read) {
    drawPlate(c, PL.read, x, y, w, h, { crop: [292, 80, 680, 820], ax: 0 });
    frame(x, y, w, h);
    return;
  }
  if (k === 1 && PL.toc) {
    drawPlate(c, PL.toc, x, y, w, h, { crop: [0, 40, 536, 1240], mode: 'contain', ax: 0.25 });
    return;
  }
  if (k === 2 && PL.notebook && PL.flux) {
    const hh = Math.round((w / 1.6));
    const y0 = y + (h - (2 * hh + 28)) / 2;
    drawPlate(c, PL.notebook, x, y0, w, hh);
    frame(x, y0, w, hh);
    drawPlate(c, PL.flux, x, y0 + hh + 28, w, hh);
    frame(x, y0 + hh + 28, w, hh);
    return;
  }
  if (k === 4 && PL.files) {
    drawSilhouette(c, 4, x, y, w, h * 0.58);
    drawPlate(c, PL.files, x, y + h * 0.64, w, h * 0.34, { mode: 'contain' });
    return;
  }
  if (k === 6 && PL.sites.length >= 6) {
    const cw = (w - 14) / 2;
    const ch = Math.round(cw / 1.6);
    const y0 = y + (h - (3 * ch + 28)) / 2;
    for (let i = 0; i < 6; i++) {
      const cx = x + (i % 2) * (cw + 14);
      const cy = y0 + Math.floor(i / 2) * (ch + 14);
      drawPlate(c, PL.sites[i], cx, cy, cw, ch, { ay: 0 });
      frame(cx, cy, cw, ch);
    }
    return;
  }
  drawSilhouette(c, k, x, y, w, h);
}

/** Full monolith face for chapter k. */
export function drawFace(c: Ctx, k: number) {
  const W = FACE_W;
  const H = FACE_H;
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, H);
  rect(c, 14.5, 14.5, W - 29, H - 29, { stroke: FAINT, lw: 1 });
  text(c, String(k + 1).padStart(2, '0'), 40, 78, { font: 'mono', size: 34, weight: 600, color: WHITE });
  text(c, '/ 08', 98, 78, { font: 'mono', size: 18, weight: 500, color: DIM });
  barcode(c, W - 170, 52, 130, 26, k * 13 + 5, DIM);
  line(c, 40, 104, W - 40, 104, 1, DIM);
  const word = CHAPTERS[k].word;
  const w1 = measure(c, word, { font: 'wide', size: 100, tracking: 0.22 }) / 100 - 0.22;
  const size = Math.min(50, 432 / (w1 + 1.0));
  boxLabel(c, word, W / 2, 196, { size, align: 'center', color: WHITE, tracking: 0.22, lw: 3, padX: size * 0.5, padY: size * 0.5 });
  drawContent(c, k, 40, 290, W - 80, 620);
  bars(c, 40, 950, [430, 400, 440, 360, 410, 250], 24, 7, FAINT);
  line(c, 40, 1110, W - 40, 1110, 1, DIM);
  text(c, CHAPTERS[k].path, 40, 1150, { font: 'mono', size: 20, weight: 500, color: DIM });
}
