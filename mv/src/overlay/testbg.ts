/**
 * Debug harness (only with `?ovtest=1`): replaces the scene image with a stand-in background per
 * section and applies the hints the scene agents agreed to (docs/overlay.md placement table), so
 * the overlay can be reviewed before every scene exists.
 */
import * as THREE from 'three';
import type { Engine, Frame } from '../engine/engine';
import { at, BEAT } from '../engine/time';
import { THEMES } from '../scenes/_shared/palette';
import { drawMoon } from '../scenes/_shared/moon';
import { ease, seg } from '../engine/anim';
import { hints } from './state';
import { drawBoxWord, drawPreCell, INK, ORANGE, PAPER } from './styles';
import { lyricLine } from './state';

export const TEST = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('ovtest') : null;

const imgs: Record<string, HTMLImageElement> = {};

export async function setupTest(e: Engine) {
  if (!TEST) return;
  const names = ['docs', 'notebook', 'flux', 'glass', ...Object.keys(THEMES).filter((n) => n !== 'shadcn').map((n) => `themes/${n}`)];
  await Promise.all(
    names.map(async (n) => {
      try {
        imgs[n] = await e.assets.image(`/assets/ref-ui/${n}.png`);
      } catch {}
    }),
  );
}

function fit(c: CanvasRenderingContext2D, img: HTMLImageElement | undefined, x: number, y: number, w: number) {
  if (!img) return;
  const h = (img.height / img.width) * w;
  c.drawImage(img, x, y, w, h);
}

export function testScene(f: Frame): THREE.Texture {
  const { t, W, H } = f;
  const h = hints(f);
  const L = f.e.layer('overlay:testbg');
  let c: CanvasRenderingContext2D;
  if (t < 12.8) {
    c = L.begin(INK);
    h.tone = 'dark';
  } else if (t < 25.6) {
    c = L.begin(PAPER);
    c.save();
    c.translate(W / 2, 430);
    c.rotate(-0.03);
    c.shadowColor = 'rgba(0,0,0,0.18)';
    c.shadowBlur = 40;
    fit(c, imgs.docs, -680, -330, 1360);
    c.restore();
    h.tone = 'light';
  } else if (t < 38.4) {
    const light = t < 29.0;
    c = L.begin(light ? '#F5F5F5' : INK);
    c.strokeStyle = light ? '#0A0A0B33' : '#EEECE422';
    c.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      c.moveTo(300 + i * 18, 160 + i * 70);
      c.lineTo(1200, 160 + i * 70);
      c.stroke();
    }
    h.tone = light ? 'light' : 'dark';
    h.lyricStyle = 'vertical';
    h.accent = light ? INK : PAPER;
    h.creditCorner = 'tl';
  } else if (t < 51.2) {
    c = L.begin(INK);
    c.strokeStyle = ORANGE;
    c.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) c.strokeRect(160 + i * 280, 220, 240, 420);
    h.tone = 'dark';
    if (t >= 49.6 && t < 50.4) {
      // layout draws 「さあ」 itself, imploding into its centre dot
      h.lyrics = 'scene';
      const Ln = lyricLine('L8');
      if (Ln) {
        const k = seg(t, 50.0, 50.4, ease.inQuart);
        Ln.morae.forEach((m, i) => {
          if (t < m.t) return;
          const cx = 960 + (i ? 70 : -70) * (1 - k);
          c.save();
          c.translate(cx, 540);
          c.rotate(k * (i ? 1.2 : -1.2));
          c.scale(1 - k * 0.95, 1 - k * 0.95);
          drawPreCell(c, m.kana, 0, 0, 132, { pop: seg(t, m.t, m.t + 0.2), draw: seg(t, m.t, m.t + 0.12), flash: Math.max(0, 1 - (t - m.t) / 0.16), ink: PAPER, accent: ORANGE });
          c.restore();
        });
        drawBoxWord(c, 'NOW', 960, 660, { size: 12, color: PAPER, alpha: 1 - k, p: seg(t, 49.6, 49.9) });
      }
    }
    if (t >= 50.4) {
      c.beginPath();
      c.arc(960, 540, 7, 0, Math.PI * 2);
      c.fillStyle = ORANGE;
      c.fill();
    }
  } else if (t < 64.0) {
    const names = Object.keys(THEMES) as (keyof typeof THEMES)[];
    const beat = Math.floor((t - 51.2) / BEAT);
    const th = THEMES[names[beat % names.length]];
    const dark = beat % 2 === 1;
    const v = dark ? th.dark : th.light;
    c = L.begin(v.bg);
    c.fillStyle = v.primary;
    c.globalAlpha = 0.85;
    c.fillRect(0, 0, W * 0.32, H);
    c.globalAlpha = 1;
    fit(c, imgs[`themes/${names[beat % names.length]}`] ?? imgs.docs, 520, 120, 980);
    h.tone = dark ? 'dark' : 'light';
    h.accent = v.primary;
    if (t >= at(37)) h.lyricStyle = 'subtitle';
  } else if (t < 76.8) {
    const dark = t >= 73.6;
    c = L.begin(dark ? '#0b1626' : '#E6E1D3');
    if (!dark) {
      c.fillStyle = '#FAFAF7';
      c.fillRect(380, 120, 1160, 640);
      c.strokeStyle = INK;
      c.strokeRect(380.5, 120.5, 1160, 640);
      c.fillStyle = INK;
      c.fillRect(380, 120, 1160, 28);
      c.fillRect(0, 1040, W, 40);
    } else fit(c, imgs['themes/ocean'], 160, 80, 1600);
    h.tone = dark ? 'dark' : 'light';
  } else if (t < 89.6) {
    c = L.begin(INK);
    h.lyrics = 'hidden';
    h.tone = 'dark';
    h.creditCorner = 'br';
  } else if (t < 102.4) {
    c = L.begin('#070a14');
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `hsl(${(i * 47) % 360} 60% ${30 + (i % 5) * 8}%)`;
      c.fillRect((i * 173) % 1800, 300 + ((i * 97) % 500), 60, 40);
    }
    drawMoon(c, 960, 260, 120);
    h.tone = 'dark';
  } else {
    c = L.begin(INK);
    drawMoon(c, 960, 540, 300);
    h.tone = 'dark';
    h.lyricStyle = 'vertical';
    h.lyricAnchor = [1400, 300];
  }
  return L.end();
}
