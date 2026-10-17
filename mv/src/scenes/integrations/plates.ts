import type { Engine } from '../../engine/engine';

/**
 * Real Fumadocs UI captures from the plates agent (/plates/manifest.json → "integrations").
 * Everything is optional: stations fall back to their vector stand-ins when a plate is missing.
 */
export interface Plates {
  /** operation page (3840×2160, dpr 2) */
  opPage?: HTMLImageElement;
  /** code-sample panel per tab, clip css [1245,149,402,548.63] */
  code: Record<string, HTMLImageElement>;
  /** playground states (clip css [296,100,1328,880]) */
  pg: Record<string, HTMLImageElement>;
  /** method labels @4x, alpha */
  labels: Record<string, HTMLImageElement>;
  /** Story WithControl card states (card crop only, css 836×328 @2x) */
  story: Record<string, CanvasImageSource & { width: number; height: number }>;
  /** Obsidian Welcome page (full frame @2x), its callout crop, link boxes (css) */
  obPage?: HTMLImageElement;
  obCallout?: HTMLImageElement;
  obLinks: { css: number[]; text: string }[];
  /** Sanity page header + blocks, cropped to their css bboxes (@2x) */
  saHeader?: HTMLCanvasElement;
  saBlocks: { kind: string; text: string; css: number[]; img: HTMLCanvasElement }[];
}

export const plates: Plates = { code: {}, pg: {}, labels: {}, story: {}, obLinks: [], saBlocks: [] };

/** Crop a css rect (@dpr 2) out of a full-frame image into its own canvas, then drop the big image. */
function crop(img: HTMLImageElement, css: number[]): HTMLCanvasElement {
  const [x, y, w, h] = css.map((v) => Math.round(v * 2));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, w);
  cv.height = Math.max(1, h);
  cv.getContext('2d')!.drawImage(img, x, y, w, h, 0, 0, w, h);
  return cv;
}

const CODE_FILES: Record<string, string> = { cURL: 'curl', JavaScript: 'javascript', Go: 'go', Python: 'python', Java: 'java', 'C#': 'csharp', Rust: 'rust' };
const PG_STATES = ['1-idle', '2-send-hover', '2b-send-pressed', '3-sending', '4-response'];

export async function loadPlates(e: Engine) {
  let m: Record<string, unknown>;
  try {
    m = await e.assets.loadJSON<Record<string, unknown>>('/plates/manifest.json');
  } catch {
    return;
  }
  const integ = (m.integrations ?? {}) as Record<string, any>;
  const jobs: Promise<void>[] = [];
  const img = (path: string, set: (i: HTMLImageElement) => void) =>
    jobs.push(
      e.assets.image('/plates/' + path).then(set, () => {
        console.warn('[integrations] plate missing', path);
      }),
    );
  const op = integ['openapi.operation'];
  if (op?.path) {
    img(op.path, (i) => (plates.opPage = i));
    const tabs = op.codeSamples?.tabs ?? {};
    for (const [tab, file] of Object.entries(CODE_FILES)) {
      const still = tabs[tab]?.still ?? `integrations/openapi/code-${file}.png`;
      img(still, (i) => (plates.code[tab] = i));
    }
  }
  const pg = integ['openapi.playground'];
  if (pg?.states) for (const s of PG_STATES) if (pg.states[s]?.still) img(pg.states[s].still, (i) => (plates.pg[s] = i));
  const lb = integ['openapi.labels'];
  if (lb?.items) for (const [k, v] of Object.entries(lb.items as Record<string, { file: string }>)) img(v.file, (i) => (plates.labels[k] = i));
  // Story: the Callout story card, every state cropped to the card (clip-relative 12 css px margin)
  const sc = integ.story?.cards?.callout;
  if (sc?.states)
    for (const [name, st] of Object.entries(sc.states as Record<string, { still: string }>))
      img(st.still, (i) => (plates.story[name] = crop(i, [12, 12, 836, 328])));
  // Obsidian: Welcome page + its rendered callout
  const ob = integ.obsidian?.pages?.welcome;
  if (ob?.path) {
    img(ob.path, (i) => (plates.obPage = i));
    img('integrations/obsidian/welcome-callout-0.png', (i) => (plates.obCallout = i));
    jobs.push(
      e.assets.loadJSON<{ links: { css: number[]; text: string }[] }>('/plates/' + ob.boxes).then(
        (b) => void (plates.obLinks = b.links ?? []),
        () => {},
      ),
    );
  }
  // Sanity: page header + blocks (full-frame alpha layers → cropped)
  const sa = integ.sanity;
  if (sa?.blocks) {
    if (sa.layers?.pageHeader) img(sa.layers.pageHeader, (i) => (plates.saHeader = crop(i, [520, 26, 880, 222])));
    const blocks = sa.blocks as { kind: string; text: string; css: number[]; layer: string }[];
    plates.saBlocks = [];
    blocks.forEach((bl, i) =>
      img(bl.layer, (im) => {
        const pad = 4;
        plates.saBlocks[i] = { kind: bl.kind, text: bl.text, css: bl.css, img: crop(im, [bl.css[0] - pad, bl.css[1] - pad, bl.css[2] + pad * 2, bl.css[3] + pad * 2]) };
      }),
    );
  }
  await Promise.all(jobs);
  plates.saBlocks = plates.saBlocks.filter(Boolean);
}

export const hasStoryPlates = () => ['01-default', '02-type-warning', '02-type-error', '02-type-success', '03-title-make-it-yours', '04-variant-warning'].every((k) => plates.story[k]);
export const hasObsidianPlates = () => !!plates.obPage && !!plates.obCallout && plates.obLinks.length > 0;
export const hasSanityPlates = () => !!plates.saHeader && plates.saBlocks.length >= 8;

export const hasOpenAPIPlates = () => !!plates.opPage && Object.keys(plates.pg).length === PG_STATES.length && Object.keys(plates.code).length === 7;
