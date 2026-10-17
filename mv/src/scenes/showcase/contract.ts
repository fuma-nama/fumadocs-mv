/**
 * Showcase scene contracts — side-effect free (no three / engine imports), safe to import
 * read-only from other scenes and the overlay:
 * - MOSAIC / mosaicTiles(): the B8 mosaic disc at the hold (outro owns 101.6–103.2).
 * - LANDING: the parade (bars 59–60), one site landing front-centre per beat/8th.
 * - MOSAIC_NAMES: names for the 出演 SHOWCASE credit's second page (bars 61–62).
 */
import { SITES } from './sites.gen';

/** B8 mosaic disc, screen px (origin top-left, y down). Every tile edge sits on an integer pixel. */
export const MOSAIC = {
  CX: 960,
  CY: 540,
  R: 300,
  /** grid pitch */
  PX: 40,
  PY: 25,
  GAP: 2,
  /** tile size = pitch − gap */
  TW: 38,
  TH: 23,
  /** drawMoon(c, CX, CY, R, { alpha: WASH, rim: 0 }) over the tiles (normal blend) */
  WASH: 0.55,
  /** rim stroke centred on R */
  RIM: 1.5,
  RIM_COLOR: '#FA8023',
  BG: '#0A0A0B',
  /** the disc is pixel-static (tile level) from LOCK through END */
  LOCK: 101.6,
  END: 103.2,
  /** city lights outside the disc switch off on the music's pause (bar 64 beat 4) */
  LIGHTS_OUT: 102.0,
} as const;

export interface MosaicTile {
  /** full tile rect (before the disc clip), screen px */
  x: number;
  y: number;
  w: number;
  h: number;
  /** column (0 = centred on CX) and row (0 = first row below the seam on CY) */
  i: number;
  j: number;
  slug: string;
}

/** Column i is centred on CX; a horizontal seam is centred on CY (row j spans [CY+1+25j, CY+24+25j)). */
export function tileRect(i: number, j: number) {
  const { CX, CY, PX, PY, GAP, TW, TH } = MOSAIC;
  return { x: CX - TW / 2 + PX * i, y: CY + GAP / 2 + PY * j, w: TW, h: TH };
}

/** Inclusion rule: a tile exists iff its rect intersects the open disc; its visible part is rect ∩ disc. */
export function tileInDisc(x: number, y: number, w: number, h: number) {
  const { CX, CY, R } = MOSAIC;
  const nx = Math.min(Math.max(CX, x), x + w);
  const ny = Math.min(Math.max(CY, y), y + h);
  return Math.hypot(nx - CX, ny - CY) < R;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let tilesCache: MosaicTile[] | undefined;

/**
 * Sites dealt first, to the tiles nearest the wall close-up's two view centres (bar 62), so the
 * shots seen up close are varied and show the strongest pages (credit page 2 names first).
 */
const FEATURED = ['turbobulls', 'cua', 'opencoven', 'pothos', 'reopt-handbook', 'menlo', 'react-pdf', 'ultracite', 'nuqs', 'hero-ui', 'chainbound', 'dokploy', 'documenso', 'sim', 'codehike', 'assistant-ui', 'kibo-ui', 'expostarter', 'hexta-ui', 'openpanel', 'mrscraper', 'llm-gateway'];
/** strong logos that would read as repeats: at most two tiles each */
const LOUD = ['sim', 'kibo-ui', 'nxjs', 'expostarter', 'hexta-ui', 'zen-browser', 'modelfetch', 'llm-gateway', 'cossistant', 'turbostarter'];
/** wall close-up view centres in hold px (see the camera keys at 98.4 / 99.2) */
const VIEW_CENTRES: [number, number][] = [
  [823, 458],
  [1098, 483],
];

/** All mosaic tiles at the hold, row-major (top → bottom, left → right). Deterministic. */
export function mosaicTiles(): MosaicTile[] {
  if (tilesCache) return tilesCache;
  const slugs = SITES.map((s) => s.slug);
  const r = rng(57);
  const shuffled = (list: string[]) => {
    const d = [...list];
    for (let k = d.length - 1; k > 0; k--) {
      const m = Math.floor(r() * (k + 1));
      [d[k], d[m]] = [d[m], d[k]];
    }
    return d;
  };
  // first deck: featured (in order) then the rest shuffled; later decks fully shuffled
  const featured = FEATURED.filter((s) => slugs.includes(s));
  let deck: string[] = [...featured, ...shuffled(slugs.filter((s) => !featured.includes(s)))];
  const grid = new Map<string, string>();
  const rects: MosaicTile[] = [];
  const half = Math.ceil(MOSAIC.R / MOSAIC.PX) + 1;
  const rows = Math.ceil(MOSAIC.R / MOSAIC.PY) + 1;
  for (let j = -rows; j <= rows; j++) {
    for (let i = -half; i <= half; i++) {
      const rc = tileRect(i, j);
      if (tileInDisc(rc.x, rc.y, rc.w, rc.h)) rects.push({ ...rc, i, j, slug: '' });
    }
  }
  // deal in order of distance to the nearest close-up view centre
  const dist = (tl: MosaicTile) => Math.min(...VIEW_CENTRES.map(([x, y]) => Math.hypot(tl.x + tl.w / 2 - x, (tl.y + tl.h / 2 - y) * 1.3)));
  const order = [...rects].sort((a, b) => dist(a) - dist(b));
  const count = new Map<string, number>();
  const ok = (s: string) => !LOUD.includes(s) || (count.get(s) ?? 0) < 2;
  const around = (tl: MosaicTile, rad: number) => {
    const out: (string | undefined)[] = [];
    for (let di = -rad; di <= rad; di++) for (let dj = -rad; dj <= rad; dj++) out.push(grid.get(`${tl.i + di},${tl.j + dj}`));
    return out;
  };
  for (const tl of order) {
    if (!deck.length) deck = shuffled(slugs);
    let k = -1;
    // identical sites stay ≥ 4 cells apart where possible; loud logos appear at most twice
    for (const rad of [3, 2, 1]) {
      const near = around(tl, rad);
      k = deck.findIndex((s) => !near.includes(s) && ok(s));
      if (k < 0) {
        deck = [...deck, ...shuffled(slugs)];
        k = deck.findIndex((s) => !near.includes(s) && ok(s));
      }
      if (k >= 0) break;
    }
    if (k < 0) k = 0;
    tl.slug = deck.splice(k, 1)[0];
    count.set(tl.slug, (count.get(tl.slug) ?? 0) + 1);
    grid.set(`${tl.i},${tl.j}`, tl.slug);
  }
  tilesCache = rects;
  return rects;
}

export interface Landing {
  slug: string;
  name: string;
  url: string;
  /** the moment the card lands front-centre (s) */
  t: number;
}

const site = (slug: string) => {
  const s = SITES.find((x) => x.slug === slug);
  if (!s) throw new Error(`showcase: unknown site ${slug}`);
  return s;
};

/** URL shown on a parade card when the card shows a deeper page than the site root. */
const SHOWN_URL: Record<string, string> = { evilcharts: 'evilcharts.com/docs', prisma: 'prisma.io/docs' };

/** Parade (bars 59–60): five cards on beats, four on 8ths (accelerando); bar 60 beat 4 = the PUBLISH click. */
export const LANDING: Landing[] = (
  [
    ['evilcharts', 92.8],
    ['shadcn-ui', 93.2],
    ['better-auth', 93.6],
    ['zod', 94.0],
    ['prisma', 94.4],
    ['better-t-stack', 94.8],
    ['arktype', 95.0],
    ['turborepo', 95.2],
    ['zen-browser', 95.4],
  ] as const
).map(([slug, t]) => {
  const s = site(slug);
  return { slug, name: s.name, url: SHOWN_URL[slug] ?? s.host, t };
});

/** Credit page 2 (bars 61–62): more sites in the mosaic. */
export const MOSAIC_NAMES: string[] = ['turbobulls', 'cua', 'opencoven', 'pothos', 'reopt-handbook', 'menlo', 'react-pdf', 'ultracite', 'nuqs', 'hero-ui'].map((s) => site(s).name);
