import * as THREE from 'three';
import type { Frame } from '../../engine/engine';
import { C } from '../_shared/palette';
import { drawMoon } from '../_shared/moon';
import { ease, clamp, pulse } from '../../engine/anim';
import { render3D } from '../../engine/three-kit';
import { boxLabel, text, diamond } from '../../engine/draw2d';
import { drawFloor } from './dial';
import { drawSilhouette } from './faces';
import { PL, drawPlate } from './plates';
import { poseWorld, drawDust } from './voidphase';
import { CHAPTERS, chapterAngle, DEG } from './world';
import { S, seg } from './state';

export const MONTAGE = 9.6;
const STEP = 0.2;

/** Yaw (screen-angle θ) the moon's eye looks at during bar 7: whips 45° per 8th. */
function montageYaw(t: number) {
  const k = Math.min(7, Math.floor((t - MONTAGE + 0.05) / STEP));
  if (k <= 0) return chapterAngle(0);
  const tk = MONTAGE + k * STEP;
  const p = ease.outExpo(seg(t, tk - 0.05, tk + 0.12));
  return chapterAngle(k - 1) + 45 * DEG * p;
}

/** Bar 7 (9.6–11.2): from inside the moon, the eye ticks round the eight chapter pages. */
export function renderMontage(f: Frame): THREE.Texture {
  const { e, t } = f;
  const { cam, P, T, cues, world } = S;
  const gfx = e.gfx;
  const k = Math.min(7, Math.floor((t - MONTAGE) / STEP + 1e-6));
  const tk = MONTAGE + k * STEP;
  const age = t - tk;
  const yaw = montageYaw(t);
  const yaw2 = montageYaw(t - 1 / 120);
  const vel = Math.abs(yaw - yaw2) * 120; // rad/s
  // slow push toward the face during each hold
  const push = 0.35 * ease.outCubic(seg(t, tk, tk + STEP));
  const eye = new THREE.Vector3(Math.cos(yaw) * push, 1.55, Math.sin(yaw) * push);
  cam.fov = 28; // tight on the word + the top of the UI: the section name reads on a phone
  cam.position.copy(eye);
  cam.up.set(0, 1, 0);
  cam.lookAt(eye.x + Math.cos(yaw) * 3.9, 2.05, eye.z + Math.sin(yaw) * 3.9);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  P.update(cam);

  const flash = (j: number) => (j === k ? 0.45 * (1 - seg(age, 0, 0.05)) ** 2 : 0);
  const lit = (j: number) => (j === k ? 1 : 0.1);
  poseWorld(t, lit, flash);
  world.moon.visible = false; // we are inside it
  const kp = pulse(t, cues.kicks, 0.16);

  const refl = render3D(gfx, world.mirror, cam, { key: 'intro:refl', ss: 1, clear: null });
  const reflB = gfx.blur(refl, 5, 'intro:reflblur');
  const main = render3D(gfx, world.scene, cam, { key: 'intro:3d', ss: 2, clear: null, edges: { color: '#efede6', width: 1.25, opacity: 0.8 + 0.2 * kp } });
  const floor = e.layer('intro:floor');
  const c = floor.begin();
  const fog = (d: number) => clamp(1 - (d - 9) / 22);
  drawFloor(c, { t, P, T, cues, fog, bright: 0.5, labels: 0, chapterLabels: 0, dot: false });
  const fg = e.layer('intro:fg');
  const g = fg.begin();
  drawDust(g, P, t, 0.8, 1.55);
  // the eye: an orange reticle fixed at frame centre (the guide dot); its ticks step on the 16ths
  let steps = 0;
  for (const tk of cues.ticks) if (tk >= MONTAGE - 1e-6 && tk <= t) steps += ease.outBack(seg(t, tk, tk + 0.05), 1.3);
  const rot = steps * (Math.PI / 8);
  g.save();
  g.strokeStyle = 'rgba(250,128,35,0.85)';
  g.fillStyle = C.ORANGE;
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(960, 540, 5, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(960, 540, 18, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 4; i++) {
    const a = rot + i * Math.PI * 0.5;
    g.beginPath();
    g.moveTo(960 + Math.cos(a) * 24, 540 + Math.sin(a) * 24);
    g.lineTo(960 + Math.cos(a) * 34, 540 + Math.sin(a) * 34);
    g.stroke();
  }
  g.restore();
  text(g, `${String(k + 1).padStart(2, '0')} / 08`, 1856, 1016, { font: 'mono', size: 14, weight: 500, align: 'right', color: 'rgba(250,250,247,0.6)', tracking: 0.08 });

  let comp = gfx.compose(gfx.rt('intro:comp'), C.INK, [{ tex: reflB, opacity: 0.55 }, { tex: floor.end() }, { tex: main }, { tex: fg.end() }]);
  const blur = Math.min(0.22, vel / 60 / 8);
  if (blur > 0.002) comp = gfx.motionBlur(comp, { amount: blur, dir: [1, 0] }, 'intro:whip');
  f.post.ca = 0.0008;
  f.overlay.tone = 'dark';
  return gfx.bloom(comp, { threshold: 0.6, strength: 0.55, radius: 18 }, 'intro:bloom');
}

/** Diamond path centred on (x, y) with half-diagonal r. */
function diamondPath(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + r, y);
  c.lineTo(x, y + r);
  c.lineTo(x - r, y);
  c.closePath();
}

/** READ's anatomy shot: the docs page's real parts exploded on an oblique plane, labelled. */
const ISO = { a: 0.62, b: 0.3 };
// [label, crop in the graded 1600-px read plate (x, y, w, h), panel size, screen centre]
const ANATOMY: [string, [number, number, number, number], number, number, number, number][] = [
  ['SEARCH ⌘K', [10, 58, 290, 60], 280, 60, 760, 390],
  ['SIDEBAR · ページツリー', [0, 0, 300, 900], 250, 440, 860, 560],
  ['ARTICLE', [302, 60, 700, 840], 500, 440, 1040, 530],
  ['TOC · 目次', [1300, 0, 300, 720], 230, 400, 1215, 500],
];
function anatomy(c: CanvasRenderingContext2D, ink: string, dim: string) {
  for (const [, crop, w, h, x, y] of ANATOMY) {
    c.save();
    c.setTransform(ISO.a, ISO.b, -ISO.a, ISO.b, x, y);
    c.translate(-w / 2, -h / 2);
    // soft shadow under each floating part
    c.fillStyle = 'rgba(10,10,11,0.14)';
    c.fillRect(18, 26, w, h);
    if (PL.readInv) drawPlate(c, PL.readInv, 0, 0, w, h, { crop });
    else {
      c.fillStyle = '#fbfaf6';
      c.fillRect(0, 0, w, h);
    }
    c.lineWidth = 2.5;
    c.strokeStyle = ink;
    c.strokeRect(0, 0, w, h);
    c.restore();
  }
  void dim;
}
/** Leader lines + labels for the anatomy parts (drawn outside the diamond clip). */
function anatomyLabels(c: CanvasRenderingContext2D, ink: string, dim: string) {
  ANATOMY.forEach(([label, , w, h, x, y], j) => {
    // left corner of each panel → leader to the label column
    const lx = x - ISO.a * (w + h) / 2;
    const ly = y - ISO.b * (w - h) / 2;
    const tx = 380;
    const ty = 400 + j * 110;
    c.strokeStyle = dim;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(lx, ly + 0.5);
    c.lineTo(tx + 10, ty + 0.5);
    c.stroke();
    boxLabel(c, label, tx, ty, { size: 14, align: 'right', color: ink, tracking: 0.22, fillBox: C.PAPER });
  });
}

/** LAYOUT's neon slabs: six layout wireframes in orange line-light. */
function neonLayouts(c: CanvasRenderingContext2D) {
  const W = 220;
  const H = 140;
  const g = 22;
  c.save();
  c.strokeStyle = C.ORANGE;
  c.shadowColor = C.ORANGE;
  c.lineWidth = 2.5;
  for (let j = 0; j < 6; j++) {
    const x = 960 - (3 * W + 2 * g) / 2 + (j % 3) * (W + g);
    const y = 540 - (2 * H + g) / 2 + Math.floor(j / 3) * (H + g);
    c.shadowBlur = 14;
    c.fillStyle = '#120a04';
    c.fillRect(x, y, W, H);
    c.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
    c.shadowBlur = 6;
    c.lineWidth = 1.5;
    c.beginPath();
    if (j === 0) { c.moveTo(x + 52, y); c.lineTo(x + 52, y + H); c.moveTo(x + W - 46, y); c.lineTo(x + W - 46, y + H); } // docs
    if (j === 1) { c.moveTo(x, y + 26); c.lineTo(x + W, y + 26); c.moveTo(x + 46, y + 26); c.lineTo(x + 46, y + H); } // notebook
    if (j === 2) { c.rect(x + 50, y + 20, W - 100, H - 56); c.rect(x + 66, y + H - 28, W - 132, 16); } // flux
    if (j === 3) { c.rect(x + 12, y + 14, 46, H - 28); c.rect(x + 74, y + 10, W - 88, 14); } // glass
    if (j === 4) { c.rect(x + 14, y + 14, W - 28, H - 28); c.moveTo(x + 62, y + 14); c.lineTo(x + 62, y + H - 14); } // spacious
    if (j === 5) { c.moveTo(x, y + 24); c.lineTo(x + W, y + 24); c.rect(x + 40, y + 48, W - 80, 30); c.rect(x + 70, y + 92, W - 140, 16); } // home
    c.stroke();
    c.lineWidth = 2.5;
  }
  c.restore();
  text(c, 'DOCS · NOTEBOOK · FLUX · GLASS · SPACIOUS · HOME', 960, 540 + H + g + 24, { font: 'wide', size: 12, align: 'center', color: 'rgba(250,128,35,0.8)', tracking: 0.3 });
}

/** The chorus colours: the twelve theme primaries as swatches (a glimpse of what's coming). */
const SWATCHES = ['hsl(0 0% 92%)', 'hsl(0 0% 98%)', 'hsl(226 55% 55%)', 'hsl(340 55% 60%)', 'hsl(266 85% 65%)', 'hsl(205 80% 45%)', 'hsl(270 100% 60%)', 'oklch(0.6 0.12 262)', 'hsl(168 70% 45%)', 'hsl(348 85% 52%)', 'hsl(80 60% 45%)', 'hsl(240 6% 70%)'];
function swatches(c: CanvasRenderingContext2D) {
  for (let j = 0; j < 12; j++) {
    const x = 960 - 150 + (j % 3) * 150;
    const y = 540 - 240 + Math.floor(j / 3) * 160;
    c.beginPath();
    c.arc(x, y, 56, 0, Math.PI * 2);
    c.fillStyle = SWATCHES[j];
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = C.WHITE;
    c.stroke();
  }
}

/** INTEGRATIONS' four blocks in their key colours. */
const BLOCKS: [string, string, string][] = [
  ['01', 'OPENAPI', '#C6F432'],
  ['02', 'OBSIDIAN', '#9D7BFF'],
  ['03', 'SANITY', '#FF4F6E'],
  ['04', 'STORY', '#38D9F5'],
];
function integrationBlocks(c: CanvasRenderingContext2D) {
  const W = 190;
  const H = 560;
  const g = 14;
  BLOCKS.forEach(([n, name, key], j) => {
    const x = 960 - (4 * W + 3 * g) / 2 + j * (W + g);
    const y = 540 - H / 2;
    c.fillStyle = key;
    c.fillRect(x, y, W, H);
    // a dark UI chip on each block
    c.fillStyle = C.INK;
    c.fillRect(x + 18, y + 150, W - 36, 120);
    c.fillStyle = key;
    for (let r = 0; r < 4; r++) c.fillRect(x + 32, y + 172 + r * 22, (W - 64) * (0.5 + 0.5 * ((r * 37 + j * 13) % 10) / 10), 7);
    text(c, n, x + 18, y + 318, { font: 'mono', size: 18, weight: 700, color: C.INK });
    text(c, name, x + 18, y + 346, { font: 'wide', size: 15, color: C.INK, tracking: 0.12 });
  });
}

/** SHOWCASE: the moon over a night city of real sites. */
function nightCity(c: CanvasRenderingContext2D, dim: string) {
  const cw = 300;
  const ch = 188;
  for (let j = 0; j < 6; j++) {
    const cx = 960 - (cw * 1.5 + 12) + (j % 3) * (cw + 12);
    const cy = 600 - (ch + 6) + Math.floor(j / 3) * (ch + 12);
    if (PL.sites[j]) drawPlate(c, PL.sites[j], cx, cy, cw, ch, { ay: 0 });
    c.strokeStyle = dim;
    c.lineWidth = 1;
    c.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
  }
  drawMoon(c, 960, 255, 64, { bg: C.INK });
}

/** One strobe card's image (inside the diamond), echoing each later section as it looks now. */
function cardImage(c: CanvasRenderingContext2D, i: number, ink: string, dim: string, faint: string, R: number) {
  const box = { x: 960 - R, y: 540 - R, w: 2 * R, h: 2 * R };
  switch (i) {
    case 0:
      return anatomy(c, ink, dim);
    case 1:
      if (PL.toc) {
        drawPlate(c, PL.toc, 960 - 300, 70, 600, 940, { crop: [0, 60, 536, 840], mode: 'contain' });
        const g = c.createRadialGradient(960 - 300 + 30, 70 + 0.42 * 940, 0, 960 - 300 + 30, 70 + 0.42 * 940, 140);
        g.addColorStop(0, 'rgba(250,128,35,0.55)');
        g.addColorStop(1, 'rgba(250,128,35,0)');
        c.fillStyle = g;
        c.fillRect(box.x, box.y, box.w, box.h);
        return;
      }
      break;
    case 2:
      return neonLayouts(c);
    case 3:
      return swatches(c);
    case 4: {
      // retro desktop: grid paper, a terminal window, the Files plate
      c.strokeStyle = faint;
      c.lineWidth = 1;
      for (let x = box.x; x < box.x + box.w; x += 40) {
        c.beginPath();
        c.moveTo(x + 0.5, box.y);
        c.lineTo(x + 0.5, box.y + box.h);
        c.stroke();
      }
      for (let y = box.y; y < box.y + box.h; y += 40) {
        c.beginPath();
        c.moveTo(box.x, y + 0.5);
        c.lineTo(box.x + box.w, y + 0.5);
        c.stroke();
      }
      c.fillStyle = '#16213e';
      c.fillRect(960 - 430, 300, 860, 230);
      c.fillStyle = ink;
      c.fillRect(960 - 430, 300, 860, 34);
      text(c, '~/my-docs › npx @fumadocs/cli customize', 960 - 400, 400, { font: 'code', size: 30, weight: 600, color: C.WHITE });
      c.fillStyle = C.ORANGE;
      c.fillRect(960 - 400, 430, 16, 34);
      if (PL.files) drawPlate(c, PL.files, 960 - 430, 560, 860, 300, { mode: 'contain' });
      return;
    }
    case 5:
      return integrationBlocks(c);
    case 6:
      return nightCity(c, dim);
  }
  const sw = 470;
  drawSilhouette(c, i, 960 - sw / 2, 540 - sw * 0.7, sw, sw * 1.4, ink, dim, faint);
}

/** Bar 8 (11.2–12.4): strobe cards on the snare build — every chapter again, faster. */
export function renderStrobe(f: Frame): THREE.Texture {
  const { e, t } = f;
  const gfx = e.gfx;
  const sn = S.cues.snares;
  let i = 0;
  for (let j = 0; j < sn.length; j++) if (t >= sn[j] - 1e-6) i = j;
  const age = t - sn[i];
  const dark = i !== 0 && i !== 4; // READ and CUSTOMIZE live on paper; the rest are night scenes
  const bg = dark ? C.INK : C.PAPER;
  const ink = dark ? C.WHITE : C.INK;
  const dim = dark ? 'rgba(250,250,247,0.45)' : 'rgba(10,10,11,0.45)';
  const faint = dark ? 'rgba(250,250,247,0.2)' : 'rgba(10,10,11,0.18)';
  const L = e.layer('intro:strobe');
  const c = L.begin(bg);
  const pop = ease.outExpo(seg(age, 0, 0.06));
  if (i < 7) {
    const R = 520 * (0.95 + 0.05 * pop);
    c.save();
    diamondPath(c, 960, 540, R);
    c.clip();
    cardImage(c, i, ink, dim, faint, R);
    c.restore();
    diamondPath(c, 960, 540, R);
    c.lineWidth = 2;
    c.strokeStyle = ink;
    c.stroke();
    diamondPath(c, 960, 540, R + 18);
    c.lineWidth = 1;
    c.strokeStyle = faint;
    c.stroke();
    if (i === 0) anatomyLabels(c, ink, dim);
    if (i === 3) {
      // the giant vertical word (echoes the chorus's huge theme names)
      c.save();
      c.translate(1640, 540);
      c.rotate(-Math.PI / 2);
      text(c, 'COLOR', 0, 0, { font: 'display', size: 330, weight: 900, stretch: 'extra-condensed', align: 'center', baseline: 'middle', color: ink, tracking: -0.01 });
      c.restore();
    }
    boxLabel(c, CHAPTERS[i].word, 960, 1000, { size: 26, align: 'center', color: ink, tracking: 0.34, ticks: true, fillBox: bg, lw: 1.5 });
    text(c, String(i + 1).padStart(2, '0'), 96, 250, { font: 'display', size: 230, weight: 800, stretch: 'condensed', color: 'none', stroke: { color: ink, width: 2 } });
    text(c, CHAPTERS[i].path, 1824, 96, { font: 'mono', size: 16, weight: 500, align: 'right', color: dim });
  } else {
    // 12.3: the caret, huge — it becomes the stop line at 12.4
    c.fillStyle = C.ORANGE;
    c.fillRect(960 - 90, 540 - 180, 180, 360);
    text(c, '$ npm create fumadocs-app', 960, 860, { font: 'code', size: 24, weight: 600, align: 'center', color: dim });
  }
  let out = L.end();
  // entry glitch: 3 frames on the 8th cards, 2 on the 16ths, 1 on the final caret
  const gl = i === 7 ? 1 / 60 : i >= 4 ? 2 / 60 : 3 / 60;
  if (age < gl) out = gfx.glitch(out, { amount: 0.7 * (1 - age / gl), seed: i * 7 + 3, bands: 30, split: 0.01 }, 'intro:glitch');
  f.overlay.tone = dark ? 'dark' : 'light';
  f.post.ca = 0.0008;
  return out;
}
