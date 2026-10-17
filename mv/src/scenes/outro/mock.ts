import { C } from '../_shared/palette';
import { drawMoon } from '../_shared/moon';
import { MOSAIC, mosaicTiles, tileInDisc } from '../showcase/contract';
import { SITES } from '../showcase/sites.gen';

/**
 * Development stand-in for the showcase's B8 disc (used only when the showcase scene is not
 * loaded, e.g. `--only outro`). Follows the contract: tiles = site captures, rect ∩ disc,
 * 55 % moon wash, 1.5 px rim, a dark skyline below.
 */
let canvas: HTMLCanvasElement | undefined;
let building: Promise<HTMLCanvasElement> | undefined;

/** Load an image without tracked rejections (missing captures just fall back to a sketch). */
function quietImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

export function mockDisc(): Promise<HTMLCanvasElement> {
  if (canvas) return Promise.resolve(canvas);
  building ??= build().then((c) => (canvas = c));
  return building;
}

async function build(): Promise<HTMLCanvasElement> {
  const tiles = mosaicTiles();
  const slugs = [...new Set(tiles.map((t) => t.slug))];
  const thumbs = new Map<string, HTMLCanvasElement>();
  await Promise.all(
    slugs.map(async (slug) => {
      const th = document.createElement('canvas');
      th.width = 76;
      th.height = 46;
      const c = th.getContext('2d')!;
      const site = SITES.find((s) => s.slug === slug);
      const img = await quietImage(`/assets/showcase/${slug}/docs.png`);
      if (img) {
        // two-step downscale for a clean thumbnail
        const mid = document.createElement('canvas');
        mid.width = 400;
        mid.height = 250;
        mid.getContext('2d')!.drawImage(img, 0, 0, 400, 250);
        c.imageSmoothingQuality = 'high';
        c.drawImage(mid, 0, 0, 76, 46);
      } else {
        const dark = site?.tone !== 'light';
        c.fillStyle = dark ? '#111114' : '#f6f6f4';
        c.fillRect(0, 0, 76, 46);
        c.fillStyle = site?.accent ?? C.ORANGE;
        c.fillRect(6, 8, 20, 4);
        c.fillStyle = dark ? '#3a3a40' : '#c8c8c4';
        for (let k = 0; k < 5; k++) c.fillRect(30, 8 + k * 7, 38 - (k % 2) * 10, 3);
        c.fillRect(6, 16, 18, 24);
      }
      thumbs.set(slug, th);
    }),
  );
  const out = document.createElement('canvas');
  out.width = 1920;
  out.height = 1080;
  const c = out.getContext('2d')!;
  c.fillStyle = MOSAIC.BG;
  c.fillRect(0, 0, 1920, 1080);
  // dark skyline (lights off)
  c.fillStyle = '#121216';
  let x = 0;
  let k = 0;
  while (x < 1920) {
    const w = 40 + ((k * 37) % 70);
    const h = 60 + ((k * 53) % 150);
    c.fillRect(x, 1080 - h, w - 4, h);
    x += w;
    k++;
  }
  const { CX, CY, R } = MOSAIC;
  c.save();
  c.beginPath();
  c.arc(CX, CY, R, 0, Math.PI * 2);
  c.clip();
  for (const t of tiles) {
    if (!tileInDisc(t.x, t.y, t.w, t.h)) continue;
    c.drawImage(thumbs.get(t.slug)!, t.x, t.y, t.w, t.h);
  }
  c.restore();
  drawMoon(c, CX, CY, R, { alpha: MOSAIC.WASH, rim: 0 });
  c.beginPath();
  c.arc(CX, CY, R, 0, Math.PI * 2);
  c.lineWidth = MOSAIC.RIM;
  c.strokeStyle = MOSAIC.RIM_COLOR;
  c.stroke();
  return out;
}
