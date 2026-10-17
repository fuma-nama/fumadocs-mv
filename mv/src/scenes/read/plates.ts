import * as THREE from 'three';
import type { Engine } from '../../engine/engine';
import { rectOf, type Block, type Heading, type LayerId, type PageAssets, type PageModel, type Rect, type Tex } from './page';

/** Loads READ's real plates (plates/out/read/orange-light). Returns null when they are missing. */

const BASE = '/plates/';
const MARGIN = 4; // css px around cropped layers (antialiasing)

interface Manifest {
  read?: Record<string, { path?: string; layers?: Record<string, string>; boxes?: string; dpr?: number; css?: [number, number]; columnX?: number; tiles?: { docY: number; cssHeight: number; alpha: string; opaque: string }[]; states?: unknown }>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Boxes = any;

export function texFromCanvas(cv: HTMLCanvasElement | HTMLImageElement, mip = true): THREE.Texture {
  const t = cv instanceof HTMLCanvasElement ? new THREE.CanvasTexture(cv) : new THREE.Texture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.premultiplyAlpha = true;
  t.generateMipmaps = mip;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 16;
  t.needsUpdate = true;
  return t;
}

/** Crop a css rect (in image css space, dpr scale) out of one or more images into a canvas. */
function crop(srcs: { img: HTMLImageElement; rect: Rect }[], r: Rect, dpr: number, bg?: string): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(r.w * dpr));
  cv.height = Math.max(1, Math.round(r.h * dpr));
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  if (bg) {
    c.fillStyle = bg;
    c.fillRect(0, 0, cv.width, cv.height);
  }
  for (const s of srcs) {
    // overlap of r with the source rect, in css
    const x0 = Math.max(r.x, s.rect.x), y0 = Math.max(r.y, s.rect.y);
    const x1 = Math.min(r.x + r.w, s.rect.x + s.rect.w), y1 = Math.min(r.y + r.h, s.rect.y + s.rect.h);
    if (x1 <= x0 || y1 <= y0) continue;
    const sx = Math.round((x0 - s.rect.x) * dpr), sy = Math.round((y0 - s.rect.y) * dpr);
    const sw = Math.round((x1 - x0) * dpr), sh = Math.round((y1 - y0) * dpr);
    c.drawImage(s.img, sx, sy, sw, sh, Math.round((x0 - r.x) * dpr), Math.round((y0 - r.y) * dpr), sw, sh);
  }
  return cv;
}

const pad = (r: Rect, m = MARGIN): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });

export async function loadPlates(e: Engine): Promise<PageAssets | null> {
  let man: Manifest;
  try {
    man = await e.assets.loadJSON<Manifest>(BASE + 'manifest.json');
  } catch {
    return null;
  }
  const ent = man.read?.['docs.orange.light'] as any;
  const tall = man.read?.['docs.orange.light.tall'];
  if (!ent?.layers || !ent.boxes || !tall?.tiles) return null;
  const dpr = ent.dpr ?? 2;
  const b: Boxes = await e.assets.loadJSON(BASE + ent.boxes);
  const [vw, vh] = ent.css ?? [1440, 810];

  // ── model ────────────────────────────────────────────────────────────────
  const sb = b.sidebar;
  const tocC = b.toc.geometry.container as number[];
  const blocks: Block[] = (b.article.blocks as any[]).map((k) => ({
    kind: k.kind,
    rect: rectOf(k.css),
    id: k.id,
    text: k.title ?? k.text,
    lines: k.lines?.map(rectOf),
    copy: k.copyButton ? rectOf(k.copyButton) : undefined,
    list: k.list ? rectOf(k.list) : undefined,
    tabs: k.tabs?.map((t: any) => rectOf(t.css)),
    steps: k.steps?.map((t: any) => rectOf(t.css)),
    cards: k.cards?.map((t: any) => rectOf(t.css)),
    code: k.code,
  }));
  const headings: Heading[] = (b.activeRanges as any[]).map((h) => ({ id: h.id, text: h.text, depth: h.depth, top: h.top, height: h.height, range: h.visibleScrollRange }));
  const tocHead = headings.find((h) => h.id === 'table-of-contents');
  const h1 = rectOf(b.header.h1.css);
  const desc = rectOf(b.header.description.css);
  const actions = rectOf(b.header.actions.box.css);
  const bc = rectOf(b.breadcrumb.box.css);
  const colors = b.colors;
  const layers: Record<LayerId, Rect> = {
    background: { x: 0, y: 0, w: vw, h: vh },
    'sidebar.bg': { x: 0, y: 0, w: 268, h: vh },
    'sidebar.header': { x: 0, y: 0, w: 268, h: 102 },
    'sidebar.search': pad(rectOf(sb.search.box.css)),
    'sidebar.tree': { x: 0, y: 100, w: 268, h: 652 },
    'sidebar.footer': { x: 0, y: 746, w: 268, h: 64 },
    breadcrumb: pad(bc),
    'page.header': pad({ x: h1.x, y: h1.y, w: h1.w, h: actions.y + actions.h - h1.y }),
    'article.body': { x: 270, y: 0, w: 900, h: vh },
    toc: { x: 1172, y: 0, w: 268, h: vh },
  };
  const model: PageModel = {
    vw,
    vh,
    dpr,
    layers,
    columnX: tall.columnX ?? 270,
    columnW: 900,
    docH: b.documentHeight,
    blocks,
    headings,
    tocOrigin: [tocC[0], tocC[1]],
    tocBox: rectOf(b.toc.box.css),
    search: { trigger: rectOf(sb.search.box.css), kbd: (sb.search.kbd as any[]).map((k) => rectOf(k.css)) },
    sidebarItems: (sb.items as any[]).map((it) => ({ text: it.text, rect: rectOf(it.css), active: !!it.active, kind: it.kind })),
    breadcrumb: bc,
    h1,
    desc,
    actions,
    targetScroll: tocHead ? tocHead.top - 112 : 2000,
    colors: { bg: colors.background, card: colors.card, primary: colors.primary, muted: colors['muted-foreground'], fg: colors.foreground, border: colors.border },
  };

  // ── images ───────────────────────────────────────────────────────────────
  const frameImg = await e.assets.image(BASE + ent.path);
  const layerIds = Object.keys(layers) as LayerId[];
  const layerImgs = await Promise.all(layerIds.map((id) => e.assets.image(BASE + ent.layers![id])));
  const full: Rect = { x: 0, y: 0, w: vw, h: vh };
  const layerTex = {} as Record<LayerId, Tex>;
  layerIds.forEach((id, i) => {
    const r = layers[id];
    layerTex[id] = { tex: texFromCanvas(id === 'background' ? layerImgs[i] : crop([{ img: layerImgs[i], rect: full }], r, dpr)), rect: id === 'background' ? full : r };
  });
  const tileImgs = await Promise.all(tall.tiles.map((t) => e.assets.image(BASE + t.alpha)));
  const colX = tall.columnX ?? 270;
  const tiles: Tex[] = tall.tiles.map((t, i) => ({ tex: texFromCanvas(tileImgs[i]), rect: { x: colX, y: t.docY, w: 900, h: t.cssHeight } }));
  const tileSrc = tall.tiles.map((t, i) => ({ img: tileImgs[i], rect: { x: colX, y: t.docY, w: 900, h: t.cssHeight } }));

  const crops = new Map<string, Tex>();
  // whole sections of the page for the forest monoliths
  const span = (from: number, to: number): Rect => ({ x: 302, y: from, w: 836, h: to - from });
  const hy = (id: string) => headings.find((h) => h.id === id)?.top ?? 0;
  const endOf = (kind: string, after: number) => {
    const b = blocks.find((x) => x.kind === kind && x.rect.y >= after);
    return b ? b.rect.y + b.rect.h : after;
  };
  const firstOf = (kind: string, after: number) => blocks.find((x) => x.kind === kind && x.rect.y >= after)?.rect.y ?? after;
  const blockRect = (pred: (b: Block) => boolean) => blocks.find(pred)?.rect;
  const codeR = blockRect((b) => b.kind === 'code' && b.text === 'source.config.ts');
  const stepsR = blockRect((b) => b.kind === 'steps');
  const cardsR = blockRect((b) => b.kind === 'cards');
  const groups: [string, Rect][] = [
    ['hero:header', span(bc.y, actions.y + 32)],
    ['hero:callouts-tabs', span(firstOf('callout', endOf('code', hy('code-blocks'))), endOf('tabs', hy('code-blocks')))],
  ];
  if (codeR) groups.push(['hero:code', codeR]);
  if (stepsR) groups.push(['hero:steps', { x: 302, y: stepsR.y, w: 836, h: stepsR.h }]);
  if (cardsR) groups.push(['hero:cards', cardsR]);
  // forest heroes: real blocks of the page as opaque paper cards (content over the page background)
  for (const [k, r] of groups) {
    const rr = { x: r.x - 20, y: r.y - 18, w: r.w + 40, h: r.h + 36 };
    crops.set(k, { tex: texFromCanvas(crop(tileSrc, rr, dpr, b.colors.background)), rect: rr });
  }

  // real interaction states (plates P2) cropped to the same framing as the forest pieces
  const ex = man.read?.['extras.orange.light'] as any;
  if (ex) {
    const stateCrops = async (key: string, clip: number[], scrollY: number, files: Record<string, string>, block: Block | undefined) => {
      if (!block) return;
      const rr = pad(block.rect, 6);
      const clipR = { x: clip[0], y: clip[1] + scrollY, w: clip[2], h: clip[3] };
      for (const [name, file] of Object.entries(files)) {
        const img = await e.assets.image(BASE + file);
        crops.set(`${key}:${name}`, { tex: texFromCanvas(crop([{ img, rect: clipR }], rr, dpr)), rect: rr });
      }
    };
    const tabsBlock = blocks.find((b) => b.kind === 'tabs');
    const codeBlock = blocks.find((b) => b.kind === 'code' && b.text === 'source.config.ts') ?? blocks.find((b) => b.kind === 'code' && Math.abs(b.rect.y - 1457.8) < 2);
    if (ex.tabs?.states) {
      const files: Record<string, string> = {};
      for (const [k, v] of Object.entries(ex.tabs.states as Record<string, any>)) files[k] = v.still;
      await stateCrops('tabs', ex.tabs.clip, ex.tabs.scrollY ?? 0, files, tabsBlock);
    }
    if (ex.copy?.states && codeBlock) {
      // the copy clip was captured with the block at viewport y 199.8 (scrollY = doc y - 199.8)
      const scrollY = codeBlock.rect.y - (ex.copy.clip[1] + 8);
      await stateCrops('copy', ex.copy.clip, scrollY, ex.copy.states, codeBlock);
    }
  }

  return {
    model,
    frame: { tex: texFromCanvas(frameImg), rect: full },
    layers: layerTex,
    tiles,
    crops,
  };
}
