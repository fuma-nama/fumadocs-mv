import { at } from '../../engine/time';
import { lyricLine } from '../../overlay/lyrics';

/** Bar start + offset (s) — the bridge grid: kick +0/+0.8, rim +0.3/+1.1(+1.4), snare +0.6/+1.2. */
export const B = (bar: number, off = 0) => at(bar) + off;

export const T = {
  start: at(41), // 64.0
  // B5 restore-down
  winFrom: at(40, 3), // 63.2
  barReveal: 63.3,
  click: at(40, 4), // 63.6
  restoreEnd: at(41), // 64.0
  swapPlate: 63.45,
  // desktop + terminal
  iconsIn: at(41),
  dbl1: B(41, 0.6), // 64.6
  dbl2: B(41, 0.8), // 64.8
  termOpen: B(41, 0.8),
  termShown: B(41, 0.9), // 64.9
  caretIn: 65.0,
  enter1: at(43), // 67.2 run command
  enter2: at(44), // 68.8 confirm layout
  enter3: at(45), // 70.4 confirm part → install
  installed: B(46, 0.4), // 72.4
  flapFrom: B(46, 0.6), // 72.6
  print: B(46, 1.2), // 73.2
  montage: at(47), // 73.6
  speed: at(48), // 75.2
  slam: B(48, 0.8), // 76.0
  stop: B(48, 1.2), // 76.4
  end: at(49), // 76.8
} as const;

/** `npx @fumadocs/cli customize` keystrokes: [time, chars] — one per music clack, five 32nd flams. */
export const TYPING: [number, string][] = (() => {
  const slots = ['n', 'p', 'x ', '@', 'fu', 'm', 'ad', 'o', 'cs', '/', 'c', 'l', 'i ', ...'customize'];
  const out: [number, string][] = [];
  slots.forEach((s, k) => {
    const t = 65.0 + k * 0.1;
    if (s.length === 1) out.push([t, s]);
    else {
      out.push([t, s[0]]);
      out.push([t + 0.05, s[1]]);
    }
  });
  return out;
})();
export const COMMAND = 'npx @fumadocs/cli customize';

/** L11 mora onsets (take 0 / 1), from the overlay timing (timing.json once it exists). */
function morae(take: number, fallback: number[]): number[] {
  const L = lyricLine('L11', take);
  const m = L?.morae.map((x) => x.t);
  return m && m.length >= 6 ? m : fallback;
}
export const chant = (take: 0 | 1) =>
  morae(take, take === 0 ? [67.2, 67.5, 67.8, 68.8, 69.1, 69.4] : [73.6, 73.9, 74.2, 75.2, 75.5, 75.8]);

/** Prompt 1 cursor: [time, option index]; 6 steps round the list (clack wraps at the end). */
export function steps1(): [number, number][] {
  const m = chant(0);
  return [
    [m[1], 1],
    [m[2], 2],
    [B(43, 0.8), 3],
    [B(43, 1.1), 4],
    [B(43, 1.2), 5],
    [B(43, 1.4), 0],
  ];
}

/** Prompt 2 cursor (0 All, 1 Replace, 2..5 Page:, 6..8 Layout:). */
export function steps2(): [number, number][] {
  const m = chant(0);
  return [
    [m[4], 1],
    [m[5], 2],
    [B(44, 0.8), 3],
    [B(44, 1.1), 4],
    [B(44, 1.2), 5],
    [B(44, 1.3), 6],
    [B(44, 1.4), 7],
    [B(44, 1.5), 8],
    [B(44, 1.55), 0],
  ];
}

/** Floppy flights: [launch, land]. */
export const FLOPPIES: { file: string; launch: number; land: number }[] = [
  { file: 'layouts/docs/index.tsx', launch: B(45, 0.15), land: B(45, 0.6) },
  { file: 'layouts/docs/page/index.tsx', launch: B(45, 0.3), land: B(45, 0.8) },
  { file: 'layouts/docs/slots/sidebar.tsx', launch: B(45, 0.6), land: B(45, 1.2) },
  { file: 'layouts/docs/page/slots/toc.tsx', launch: B(45, 1.1), land: B(46, 0) },
  { file: 'layouts/docs/slots/header.tsx', launch: B(45, 1.45), land: B(46, 0.05) },
  { file: 'layouts/docs/slots/container.tsx', launch: B(45, 1.55), land: B(46, 0.15) },
  { file: 'layouts/docs/page/slots/breadcrumb.tsx', launch: B(46, 0.05), land: B(46, 0.25) },
  { file: 'layouts/docs/page/slots/footer.tsx', launch: B(46, 0.15), land: B(46, 0.35) },
];

/** Montage changes (bar 47): [time, label, source]. */
export function montage(): { t: number; label: string; src: string }[] {
  const m = chant(1);
  return [
    { t: m[1], label: 'SIDEBAR', src: 'layouts/docs/slots/sidebar.tsx' },
    { t: m[2], label: 'TOC · CLERK', src: 'layouts/docs/page/slots/toc.tsx' },
    { t: B(47, 0.8), label: 'BANNER', src: 'npx @fumadocs/cli add banner' },
    { t: B(47, 1.1), label: 'FONT', src: 'app/global.css' },
    { t: B(47, 1.2), label: 'COLOUR', src: 'app/global.css' },
  ];
}
