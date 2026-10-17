/**
 * The intro's floor plan: the film's page tree laid out as a clock dial on the floor (y = 0).
 * Screen-angle convention: θ = 0 at 3 o'clock, clockwise positive (top-down view, 12 o'clock =
 * θ −90°); world point = (R cos θ, 0, R sin θ).
 */
export const R0 = 1.6; // construction ring
export const R1 = 4.0; // chapters
export const RJ = 4.3; // branch fork radius
export const RS = 5.15; // end of the S-jog
export const R2 = 5.5; // pages (file-name labels run outward to ~8.2)
export const R3 = 8.6; // clock dial (ticks point outward)
export const RN = 9.32; // numbers 01–12
export const RT = 9.85; // text ring

export const DEG = Math.PI / 180;

export interface Chapter {
  word: string;
  path: string;
  pages: string[];
}

/** Eight chapters = the eight later sections, labelled with real Fumadocs doc paths. */
export const CHAPTERS: Chapter[] = [
  { word: 'READ', path: 'markdown/', pages: ['index.mdx', 'twoslash.mdx'] },
  { word: 'NAVIGATE', path: 'navigation.mdx', pages: ['page-tree.mdx', 'inline-toc.mdx'] },
  { word: 'ARRANGE', path: 'ui/layouts/', pages: ['docs.mdx', 'notebook.mdx', 'flux.mdx', 'glass.mdx'] },
  { word: 'COLOR', path: 'ui/theme.mdx', pages: ['neutral.css', 'catppuccin.css', 'ocean.css'] },
  { word: 'CUSTOMIZE', path: 'cli/', pages: ['index.mdx', 'preview.mdx'] },
  { word: 'CONNECT', path: 'integrations/', pages: ['openapi/', 'story/', 'typescript.mdx', 'llms.mdx'] },
  { word: 'PUBLISH', path: 'deploying/', pages: ['index.mdx', 'static.mdx'] },
  { word: 'WRITE', path: 'editor.mdx', pages: ['meta.json', 'index.mdx'] },
];

export const chapterAngle = (k: number) => (-90 + 45 * k) * DEG;

export type V3 = [number, number, number];
export const polar = (r: number, th: number, y = 0): V3 => [r * Math.cos(th), y, r * Math.sin(th)];

export interface Page {
  name: string;
  chapter: number;
  angle: number;
  /** branch polyline (world) from the chapter node to the page node */
  path: V3[];
  /** cumulative lengths along `path` */
  cum: number[];
}

const SPREAD = 9 * DEG;
const smooth = (x: number) => x * x * (3 - 2 * x);

function cumulative(path: V3[]) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2]));
  }
  return cum;
}

/** Branch: radial R1 → RJ, TOC-style S-jog to the page angle over RJ → RS, radial to R2. */
function branch(th0: number, th1: number): V3[] {
  const pts: V3[] = [];
  const N = 28;
  pts.push(polar(R1, th0));
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const r = RJ + (RS - RJ) * s;
    pts.push(polar(r, th0 + (th1 - th0) * smooth(s)));
  }
  pts.push(polar(R2, th1));
  return pts;
}

export const PAGES: Page[] = [];
CHAPTERS.forEach((ch, k) => {
  const th0 = chapterAngle(k);
  const n = ch.pages.length;
  ch.pages.forEach((name, i) => {
    const th1 = th0 + (i - (n - 1) / 2) * SPREAD;
    const path = branch(th0, th1);
    PAGES.push({ name, chapter: k, angle: th1, path, cum: cumulative(path) });
  });
});

/** Point at arc length `l` along a polyline. */
export function along(path: V3[], cum: number[], l: number): V3 {
  if (l <= 0) return path[0];
  const L = cum[cum.length - 1];
  if (l >= L) return path[path.length - 1];
  let i = 1;
  while (cum[i] < l) i++;
  const k = (l - cum[i - 1]) / (cum[i] - cum[i - 1]);
  const a = path[i - 1];
  const b = path[i];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Sub-polyline from 0 to arc length `l`. */
export function partial(path: V3[], cum: number[], l: number): V3[] {
  if (l <= 0) return [];
  const out: V3[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    if (cum[i] <= l) out.push(path[i]);
    else {
      out.push(along(path, cum, l));
      break;
    }
  }
  return out;
}

/** Arc polyline on radius r from θa to θb (any direction), ~1 point per 2°. */
export function arc(r: number, a: number, b: number, y = 0): V3[] {
  const n = Math.max(2, Math.ceil(Math.abs(b - a) / (2 * DEG)));
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) out.push(polar(r, a + ((b - a) * i) / n, y));
  return out;
}

export { TEXT_RING } from './vocab';
