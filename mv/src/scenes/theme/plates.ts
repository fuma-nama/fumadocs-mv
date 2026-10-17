import * as THREE from 'three';
import type { Engine } from '../../engine/engine';
import { ORDER, type Mode, type ThemeId } from '../_shared/theme-tokens';
import { assetUrl } from '../../engine/url';

/**
 * Theme plates: the same real docs page in 12 presets × light/dark, pixel-aligned.
 * Real captures: /plates/themes/<preset>-<mode>.png (manifest.themes). Until they exist, the
 * dark stand-ins in /assets/ref-ui/themes are cover-fitted to 16:9 and light stand-ins are
 * synthesised by inverting HSL lightness (dev only).
 */
export const PW = 1600; // plate viewport, CSS px (16:9)
export const PH = 900;

export interface Plate {
  key: string;
  /** full-resolution source for 2D drawing (image or canvas, 16:9) */
  src: HTMLImageElement | HTMLCanvasElement;
  /**
   * The bands' source, a canvas: they draw all 24 plates per frame, more than the canvas image
   * cache holds (≈ 200 ms frames). `src` copied, or below 1080p the 1600-px plate (no extra memory).
   */
  band: HTMLCanvasElement;
  /** 1600×900 mipmapped sRGB texture for 3D pages */
  mid: THREE.Texture;
  /** 800×450 mipmapped sRGB texture for small cards */
  card: THREE.Texture;
  real: boolean;
}

export interface PlateBoxes {
  dpr?: number;
  importLine?: { css: [number, number, number, number] };
  presetName?: { css: [number, number, number, number] };
  themeToggle?: { css: [number, number, number, number] };
  [name: string]: unknown;
}

export const plates = new Map<string, Plate>();
const hiCache = new Map<string, THREE.Texture>();

/** Full-resolution mipmapped texture for the few full-bleed moments (built at setup). */
export function hiTex(id: ThemeId, mode: Mode): THREE.Texture {
  const key = pkey(id, mode);
  let t = hiCache.get(key);
  if (!t) {
    const src = plates.get(key)!.src;
    t = new THREE.Texture(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 16;
    t.needsUpdate = true;
    hiCache.set(key, t);
  }
  return t;
}

/** the page texture for a card drawn `scale` × the 1600-px viewport: full-res when larger than 1:1 */
export function pageTex(id: ThemeId, mode: Mode, scale: number): THREE.Texture {
  return scale > 1.0 && hiCache.has(pkey(id, mode)) ? hiCache.get(pkey(id, mode))! : plates.get(pkey(id, mode))!.mid;
}
export const plateBoxes = new Map<string, PlateBoxes>();
export const pkey = (id: ThemeId, mode: Mode) => `${id}-${mode}`;
export function plate(id: ThemeId, mode: Mode): Plate {
  return plates.get(pkey(id, mode))!;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function fit(img: CanvasImageSource & { width: number; height: number }, w: number, h: number) {
  const c = canvas(w, h);
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  // anchor top-left: the docs page reads from its header/sidebar
  x.drawImage(img, 0, 0, dw, dh);
  return c;
}

/** Downscale in halving steps for a clean minification. */
function scaled(src: HTMLImageElement | HTMLCanvasElement, w: number, h: number) {
  let cur: HTMLImageElement | HTMLCanvasElement = src;
  let cw = src.width;
  let ch = src.height;
  while (cw / 2 >= w * 1.0001 && ch / 2 >= h) {
    cw = Math.round(cw / 2);
    ch = Math.round(ch / 2);
    const c = canvas(cw, ch);
    const x = c.getContext('2d')!;
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, cw, ch);
    cur = c;
  }
  if (cw === w && ch === h && cur instanceof HTMLCanvasElement) return cur;
  const c = canvas(w, h);
  const x = c.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(cur, 0, 0, w, h);
  return c;
}

function copy(img: HTMLImageElement) {
  const c = canvas(img.width, img.height);
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

function tex(c: HTMLCanvasElement) {
  const t = new THREE.Texture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 16;
  t.needsUpdate = true;
  return t;
}

/** Light stand-in: invert HSL lightness, keep hue/saturation (dev only). */
function invertLightness(src: HTMLCanvasElement) {
  const c = canvas(src.width, src.height);
  const x = c.getContext('2d')!;
  x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i] / 255;
    const g = p[i + 1] / 255;
    const b = p[i + 2] / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    let l = (mx + mn) / 2;
    const dd = mx - mn;
    let h = 0;
    let s = 0;
    if (dd > 1e-6) {
      s = dd / (1 - Math.abs(2 * l - 1));
      if (mx === r) h = ((g - b) / dd) % 6;
      else if (mx === g) h = (b - r) / dd + 2;
      else h = (r - g) / dd + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    l = 1 - l;
    l = 0.035 + l * 0.94; // keep a hint of paper tone
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    p[i] = f(0) * 255;
    p[i + 1] = f(8) * 255;
    p[i + 2] = f(4) * 255;
  }
  x.putImageData(d, 0, 0);
  return c;
}

interface Manifest {
  themes?: Record<string, { file?: string; path?: string; src?: string; keyBoxes?: Record<string, unknown>; dpr?: number }>;
}

export async function loadPlates(e: Engine) {
  let manifest: Manifest = {};
  try {
    const r = await fetch(assetUrl('/plates/manifest.json'), { cache: 'no-store' });
    if (r.ok) manifest = await r.json();
  } catch {}
  const standIns = new Map<ThemeId, HTMLCanvasElement>();
  const standIn = async (id: ThemeId) => {
    let c = standIns.get(id);
    if (!c) {
      const name = id === 'shadcn' ? 'neutral' : id;
      const img = await e.assets.image(`/assets/ref-ui/themes/${name}.png`);
      c = fit(img, PW, PH);
      standIns.set(id, c);
    }
    return c;
  };
  await Promise.all(
    ORDER.flatMap((id) =>
      (['light', 'dark'] as Mode[]).map(async (mode) => {
        const key = pkey(id, mode);
        const m = manifest.themes?.[key];
        let src: HTMLImageElement | HTMLCanvasElement;
        let real = false;
        if (m) {
          const url = m.file ?? m.path ?? m.src ?? `themes/${key}.png`;
          try {
            src = await e.assets.image(url.startsWith('/') ? url : `/plates/${url.replace(/^plates\//, '')}`);
            real = true;
            if (m.keyBoxes) plateBoxes.set(key, { dpr: m.dpr, ...m.keyBoxes });
          } catch {
            src = await standIn(id);
          }
        } else {
          const dark = await standIn(id);
          src = mode === 'dark' ? dark : invertLightness(dark);
        }
        const mid = scaled(src, PW, PH);
        const card = scaled(mid, PW / 2, PH / 2);
        plates.set(key, { key, src, band: e.scale < 1 ? mid : src instanceof HTMLImageElement ? copy(src) : src, mid: tex(mid), card: tex(card), real });
      }),
    ),
  );
}
