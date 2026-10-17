import type { Engine } from '../../engine/engine';
import { assetUrl } from '../../engine/url';

/**
 * Real Fumadocs UI plates for the CLI section (docs/scenes/cli.md · Assets).
 * Page = the theme set's ocean-dark docs page (shared with theme's last frame, B5).
 * Each plate is held at full res (`src`, 16:9) plus halving-step downscales for crisp drawing.
 * Stand-ins (assets/ref-ui) are cover-fitted top-left exactly like theme's stand-in, so the B5
 * hand-over stays pixel-identical before the real captures land.
 */
export const PW = 1600;
export const PH = 900;

export interface Plate {
  key: string;
  src: HTMLImageElement | HTMLCanvasElement;
  mid: HTMLCanvasElement; // 1600×900
  small: HTMLCanvasElement; // 800×450
  real: boolean;
}

/** Element boxes in plate CSS px (1600×900). */
export type Boxes = Record<string, [x: number, y: number, w: number, h: number]>;

export const plates = new Map<string, Plate>();
export let pageBoxes: Boxes = {
  sidebar: [0, 0, 268, 900],
  header: [8, 8, 252, 92],
  breadcrumb: [330, 34, 300, 28],
  container: [300, 0, 1000, 900],
  'layout-container': [0, 0, 1600, 900],
  toc: [1270, 40, 300, 420],
  footer: [330, 800, 900, 90],
};

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
  x.drawImage(img, 0, 0, img.width * s, img.height * s);
  return c;
}

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
  const c = canvas(w, h);
  const x = c.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(cur, 0, 0, w, h);
  return c;
}

interface Manifest {
  themes?: Record<string, { file?: string; path?: string; src?: string; boxes?: unknown; dpr?: number }>;
  cli?: Record<string, unknown>;
  [k: string]: unknown;
}

const LAYOUT_STANDIN: Record<string, string> = {
  notebook: '/assets/ref-ui/notebook.png',
  flux: '/assets/ref-ui/flux.png',
  glass: '/assets/ref-ui/glass.png',
  spacious: '/assets/ref-ui/spacious.png',
  home: '/assets/ref-ui/home.png',
};

/** Montage variants (cumulative): v1 sidebar, v2 +clerk, v3 +banner, v4 +font, v5..v8 colours. */
export const VARIANTS = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'] as const;
const VARIANT_STANDIN: Record<string, string> = {
  v5: '/assets/ref-ui/themes/purple.png',
  v6: '/assets/ref-ui/themes/emerald.png',
  v7: '/assets/ref-ui/themes/ruby.png',
  v8: '/assets/ref-ui/themes/catppuccin.png',
};

function put(key: string, src: HTMLImageElement | HTMLCanvasElement, real: boolean) {
  const mid = src.width === PW && src.height === PH && src instanceof HTMLCanvasElement ? src : scaled(src, PW, PH);
  plates.set(key, { key, src, mid, small: scaled(mid, PW / 2, PH / 2), real });
}

type Box4 = [number, number, number, number];
const css = (v: unknown): Box4 | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as { css?: number[]; box?: { css?: number[] } };
  const a = o.box?.css ?? o.css;
  return a && a.length === 4 ? (a as Box4) : undefined;
};
const union = (bs: (Box4 | undefined)[]): Box4 | undefined => {
  const v = bs.filter(Boolean) as Box4[];
  if (!v.length) return undefined;
  const x0 = Math.min(...v.map((b) => b[0]));
  const y0 = Math.min(...v.map((b) => b[1]));
  const x1 = Math.max(...v.map((b) => b[0] + b[2]));
  const y1 = Math.max(...v.map((b) => b[1] + b[3]));
  return [x0, y0, x1 - x0, y1 - y0];
};
const clipV = (b: Box4 | undefined, h = PH): Box4 | undefined => (b ? [b[0], b[1], b[2], Math.min(b[3], h - b[1])] : undefined);
const pad = (b: Box4 | undefined, p: number): Box4 | undefined => (b ? [b[0] - p, b[1] - p, b[2] + p * 2, b[3] + p * 2] : undefined);

/** Map the plates agent's rich boxes JSON onto the slot names of the customize prompt. */
function slotBoxes(j: Record<string, unknown>): Boxes {
  const out: Boxes = { ...pageBoxes };
  const sb = css(j.sidebar);
  if (sb) out.sidebar = sb;
  const bc = j.breadcrumb as { items?: unknown[] } | undefined;
  const bcb = pad(union((bc?.items ?? []).map(css)) ?? css(bc), 6);
  if (bcb) out.breadcrumb = bcb;
  const art = clipV(css(j.article));
  if (art) out.container = art;
  const toc = j.toc as { title?: unknown; items?: unknown[] } | undefined;
  const tb = pad(union([css(toc?.title), ...(toc?.items ?? []).map(css)]), 8);
  if (tb) out.toc = clipV(tb)!;
  out['layout-container'] = [0, 0, PW, PH];
  return out;
}

/** Boxes per montage variant (for the annotation tags). */
export const variantBoxes = new Map<string, Boxes>();

export async function loadPlates(e: Engine) {
  let manifest: Manifest = {};
  try {
    const r = await fetch(assetUrl('/plates/manifest.json'), { cache: 'no-store' });
    if (r.ok) manifest = await r.json();
  } catch {}
  const url = (p: string) => (p.startsWith('/') ? p : `/plates/${p.replace(/^plates\//, '')}`);
  const cli = (manifest.cli ?? {}) as Record<string, { path?: string; boxes?: string }>;

  // 1 · the page (theme's last frame)
  const m = manifest.themes?.['ocean-dark'];
  let page: HTMLImageElement | HTMLCanvasElement | undefined;
  if (m) {
    try {
      page = await e.assets.image(url(m.file ?? m.path ?? m.src ?? 'themes/ocean-dark.png'));
    } catch {}
  }
  const real = !!page;
  if (!page) page = fit(await e.assets.image('/assets/ref-ui/themes/ocean.png'), PW, PH);
  put('page', page, real);

  // 2 · layout previews + 3 · cumulative variants
  const jobs: Promise<void>[] = [];
  for (const id of ['notebook', 'flux', 'glass', 'spacious', 'home']) {
    jobs.push(
      (async () => {
        const c = cli[`layout.${id}`];
        if (c?.path) put(id, await e.assets.image(url(c.path)), true);
        else put(id, fit(await e.assets.image(LAYOUT_STANDIN[id]), PW, PH), false);
      })(),
    );
  }
  for (const v of VARIANTS) {
    jobs.push(
      (async () => {
        const c = cli[`variant.${v}`];
        if (c?.path) {
          put(v, await e.assets.image(url(c.path)), true);
          if (c.boxes) {
            try {
              variantBoxes.set(v, slotBoxes(await e.assets.loadJSON<Record<string, unknown>>(url(c.boxes))));
            } catch {}
          }
        } else if (VARIANT_STANDIN[v]) put(v, fit(await e.assets.image(VARIANT_STANDIN[v]), PW, PH), false);
        else put(v, standInVariant(plates.get('page')!.mid, v), false);
      })(),
    );
  }
  // 4 · element boxes for the docs page
  jobs.push(
    (async () => {
      const b = (m as { boxes?: string } | undefined)?.boxes;
      if (!b || typeof b !== 'string') return;
      try {
        pageBoxes = slotBoxes(await e.assets.loadJSON<Record<string, unknown>>(url(b)));
      } catch {}
    })(),
  );
  await Promise.all(jobs);
  plates.set('docs', plates.get('page')!);
}

/** Dev stand-in for a montage variant: the page with a visible marker of the change. */
function standInVariant(base: HTMLCanvasElement, v: string) {
  const c = canvas(PW, PH);
  const x = c.getContext('2d')!;
  x.drawImage(base, 0, 0);
  const n = Number(v.slice(1));
  if (n >= 1) {
    x.fillStyle = 'rgba(70,140,255,0.16)';
    x.fillRect(0, 0, 268, PH);
  }
  if (n >= 2) {
    x.strokeStyle = 'rgba(143,208,255,0.9)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(1290, 70);
    for (let k = 0; k < 8; k++) x.lineTo(1290 + (k % 2) * 14, 70 + k * 40);
    x.stroke();
  }
  if (n >= 3) {
    const y = 0;
    x.drawImage(base, 0, 0, PW, PH, 0, 40, PW, PH);
    x.fillStyle = '#123a6b';
    x.fillRect(0, y, PW, 40);
    x.fillStyle = '#e8f4ff';
    x.font = '500 16px Geist, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('Fumadocs 16 is here — read the release notes', PW / 2, 20);
  }
  if (n >= 4) {
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = 'rgba(255,240,220,0.04)';
    x.fillRect(0, 0, PW, PH);
  }
  return c;
}
