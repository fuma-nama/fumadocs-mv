import type { Engine } from '../../engine/engine';

/**
 * Real Fumadocs UI plates (from the plates agent) prepared for the intro's monochrome world:
 * luminance with a contrast curve, orange pixels kept (the guide colour). Loaded once in setup;
 * missing files fall back to line-art (null).
 */
export interface Plate {
  img: HTMLCanvasElement;
}

const SRC = {
  read: '/plates/read/neutral-dark/frame.png',
  toc: '/plates/toc/normal-orange-dark/table-of-contents.png',
  notebook: '/plates/layouts/notebook.png',
  flux: '/plates/layouts/flux.png',
  docs: '/plates/layouts/docs.png',
  files: '/plates/cli/files/files.png',
  sites: ['evilcharts', 'better-auth', 'prisma', 'turborepo', 'pothos', 'opencoven'].map((s) => `/assets/showcase/${s}/docs-dark.png`),
  sitesLight: ['better-auth', 'arktype', 'prisma', 'turborepo', 'pothos', 'evilcharts'].map((s) => `/assets/showcase/${s}/docs.png`),
};

export const PL: {
  read?: HTMLCanvasElement;
  readInv?: HTMLCanvasElement;
  toc?: HTMLCanvasElement;
  tocInv?: HTMLCanvasElement;
  notebook?: HTMLCanvasElement;
  flux?: HTMLCanvasElement;
  docs?: HTMLCanvasElement;
  files?: HTMLCanvasElement;
  sites: HTMLCanvasElement[];
  sitesLight: HTMLCanvasElement[];
} = { sites: [], sitesLight: [] };

/** Light-mode screenshot → monochrome, kept light (for paper cards). */
function gradeLight(img: HTMLImageElement, maxW: number): HTMLCanvasElement {
  const k = Math.min(1, maxW / img.naturalWidth);
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.naturalWidth * k);
  cv.height = Math.round(img.naturalHeight * k);
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, 0, 0, cv.width, cv.height);
  const d = c.getImageData(0, 0, cv.width, cv.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    let l = (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;
    l = Math.min(1, Math.max(0, (l - 0.05) / 0.9)) ** 1.25;
    const v = Math.round(l * 255);
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  c.putImageData(d, 0, 0);
  return cv;
}

/** Draw `img` (optionally a crop) into a canvas of max width `maxW`, graded to monochrome. */
function grade(img: HTMLImageElement, maxW: number, crop?: [number, number, number, number], invert = false): HTMLCanvasElement {
  const [sx, sy, sw, sh] = crop ?? [0, 0, img.naturalWidth, img.naturalHeight];
  const k = Math.min(1, maxW / sw);
  const cv = document.createElement('canvas');
  cv.width = Math.round(sw * k);
  cv.height = Math.round(sh * k);
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
  const d = c.getImageData(0, 0, cv.width, cv.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2];
    const orange = r > 170 && r - b > 110 && g > 60 && g < 190 && r - g > 50;
    if (orange) continue;
    let l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    // lift the near-black UI surfaces to pure black, keep text crisp
    l = Math.min(1, Math.max(0, (l - 0.09) / 0.82));
    l = l ** 1.1;
    if (invert) l = 1 - l * 0.96;
    const v = Math.round(l * 255);
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  c.putImageData(d, 0, 0);
  return cv;
}

export async function loadPlates(e: Engine) {
  const get = async (url: string) => {
    try {
      return await e.assets.image(url);
    } catch {
      return undefined;
    }
  };
  const [read, toc, notebook, flux, docs, files, ...rest] = await Promise.all([
    get(SRC.read),
    get(SRC.toc),
    get(SRC.notebook),
    get(SRC.flux),
    get(SRC.docs),
    get(SRC.files),
    ...SRC.sites.map(get),
    ...SRC.sitesLight.map(get),
  ]);
  const sites = rest.slice(0, SRC.sites.length);
  const sitesLight = rest.slice(SRC.sites.length);
  if (read) {
    PL.read = grade(read, 1600);
    PL.readInv = grade(read, 1600, undefined, true);
  }
  for (const s of sitesLight) if (s) PL.sitesLight.push(gradeLight(s, 900));
  if (toc) {
    PL.toc = grade(toc, 536);
    PL.tocInv = grade(toc, 536, undefined, true);
  }
  if (notebook) PL.notebook = grade(notebook, 1600);
  if (flux) PL.flux = grade(flux, 1600);
  if (docs) PL.docs = grade(docs, 1600);
  if (files) PL.files = grade(files, 1200);
  for (const s of sites) if (s) PL.sites.push(grade(s, 900));
}

/** Draw a plate canvas to fit/cover a box (with an optional source crop in plate px). */
export function drawPlate(c: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, w: number, h: number, o: { mode?: 'cover' | 'contain'; crop?: [number, number, number, number]; ax?: number; ay?: number; invert?: boolean; alpha?: number } = {}) {
  const [sx, sy, sw, sh] = o.crop ?? [0, 0, img.width, img.height];
  const s = o.mode === 'contain' ? Math.min(w / sw, h / sh) : Math.max(w / sw, h / sh);
  const dw = sw * s;
  const dh = sh * s;
  const dx = x + (w - dw) * (o.ax ?? 0.5);
  const dy = y + (h - dh) * (o.ay ?? 0.5);
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  if (o.invert) c.filter = 'invert(1)';
  c.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  c.restore();
}
