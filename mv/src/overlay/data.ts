/**
 * Lyric + staff-credit data (docs/music-spec.md lyric table, docs/treatment.md §3 credits).
 *
 * Lyric markup: `{base|reading}` = a ruby group (kanji or Latin base, kana reading = its morae),
 * plain kana = one mora each (small ゃゅょ attach to the previous kana), ' ' = phrase break,
 * punctuation (、) = no mora (revealed with the previous mora).
 */

export type LyricStyleName =
  | 'verse' | 'vertical' | 'pre' | 'chorus' | 'subtitle' | 'chant' | 'final' | 'outro' | 'plain' | 'english' | 'none';

export interface LineDef {
  id: string;
  /** bar window(s) [startBar, endBar) per take; L11 is sung twice */
  takes: [number, number][];
  markup: string;
  en: string;
  style: LyricStyleName;
  /**
   * Provisional melody per take: [16th from the take's start bar, duration in 16ths, midi].
   * Mirrors the onsets the music agent committed to (docs/overlay.md); replaced by
   * /music/timing.json lead notes when that file exists.
   */
  melody: [pos: number, dur: number, midi: number][];
}

const HOOK: LineDef['melody'] = [
  [0, 2, 78], [2, 2, 76], [4, 2, 74], [6, 2, 76],
  [8, 2, 78], [10, 2, 78], [12, 2, 81], [14, 2, 78], [16, 6, 76],
  [24, 2, 74], [26, 2, 76], [28, 2, 78], [30, 2, 76], [32, 6, 74],
  [44, 2, 73], [46, 2, 74], [48, 2, 76], [50, 4, 74], [54, 6, 71],
];
const up = (m: LineDef['melody'], k: number): LineDef['melody'] => m.map(([p, d, n]) => [p, d, n + k]);

export const LINES: LineDef[] = [
  {
    id: 'L1', takes: [[9, 13]], style: 'verse',
    markup: '{真|ま}っ{白|しろ}な ページを {開|ひら}いて',
    en: 'open a pure-white page',
    melody: [[2, 2, 66], [4, 1, 66], [5, 1, 69], [6, 2, 71], [8, 4, 69], [12, 2, 66], [14, 2, 66], [16, 2, 64], [18, 4, 62], [24, 2, 59], [26, 2, 62], [28, 2, 64], [30, 10, 66]],
  },
  {
    id: 'L2', takes: [[13, 17]], style: 'verse',
    markup: '{言|こと}{葉|ば}の {森|もり}を {歩|ある}いてく',
    en: 'and walk through a forest of words',
    melody: [[2, 2, 62], [4, 2, 64], [6, 2, 66], [8, 4, 69], [12, 2, 69], [14, 2, 71], [16, 6, 69], [24, 2, 66], [26, 2, 64], [28, 2, 62], [30, 2, 64], [32, 8, 66]],
  },
  {
    id: 'L3', takes: [[17, 21]], style: 'vertical',
    markup: '{見|み}{出|だ}しを たどれば {迷|まよ}わない',
    en: "follow the headings and you won't get lost",
    melody: [[2, 2, 66], [4, 2, 69], [6, 2, 71], [8, 4, 69], [12, 2, 66], [14, 2, 69], [16, 2, 71], [18, 4, 73], [24, 2, 74], [26, 2, 73], [28, 2, 71], [30, 2, 69], [32, 8, 71]],
  },
  {
    id: 'L4', takes: [[21, 25]], style: 'vertical',
    markup: '{目|もく}{次|じ}が {照|て}らす {道|みち}しるべ',
    en: 'the table of contents lights the signposts',
    melody: [[2, 2, 71], [4, 2, 69], [6, 2, 66], [8, 4, 64], [12, 2, 66], [14, 2, 69], [16, 6, 71], [24, 2, 74], [26, 2, 73], [28, 2, 71], [30, 2, 69], [32, 8, 66]],
  },
  {
    id: 'L5', takes: [[25, 27]], style: 'pre',
    markup: '{並|なら}べて',
    en: 'line them up',
    melody: [[2, 2, 71], [4, 2, 69], [6, 2, 66], [8, 10, 67]],
  },
  {
    id: 'L6', takes: [[27, 29]], style: 'pre',
    markup: '{組|く}み{替|か}えて',
    en: 'rearrange them',
    melody: [[2, 2, 71], [4, 2, 73], [6, 2, 74], [8, 2, 73], [10, 8, 69]],
  },
  {
    id: 'L7', takes: [[29, 32]], style: 'pre',
    markup: '{形|かたち}を {変|か}えてゆく',
    en: 'the shape keeps changing',
    melody: [[2, 2, 74], [4, 2, 76], [6, 2, 78], [8, 4, 76], [16, 2, 74], [18, 2, 76], [20, 2, 78], [22, 2, 79], [24, 14, 78]],
  },
  {
    id: 'L8', takes: [[32, 33]], style: 'pre',
    markup: 'さあ',
    en: 'now—',
    melody: [[0, 4, 78], [4, 10, 81]],
  },
  {
    id: 'L9', takes: [[33, 37]], style: 'chorus',
    markup: '{色|いろ}を {選|えら}んで {世|せ}{界|かい}を {塗|ぬ}り{替|か}えて',
    en: 'choose your colours, repaint the world',
    melody: [[0, 2, 74], [2, 2, 76], [4, 4, 78], [8, 2, 76], [10, 2, 74], [12, 2, 73], [14, 6, 74], [32, 2, 74], [34, 2, 76], [36, 2, 78], [38, 2, 81], [42, 2, 78], [44, 2, 76], [46, 2, 74], [48, 2, 76], [50, 6, 78]],
  },
  {
    id: 'L10', takes: [[37, 41]], style: 'subtitle',
    markup: '{読|よ}んでよ {README|リードミー} {君|きみ}だけの ドキュメント',
    en: 'read me — README — docs that are yours alone',
    melody: HOOK,
  },
  {
    id: 'L11', takes: [[43, 45], [47, 49]], style: 'chant',
    markup: '{君|きみ}の ものに',
    en: 'make it yours',
    melody: [[0, 3, 71], [3, 3, 71], [6, 6, 74], [16, 3, 71], [19, 3, 71], [22, 6, 69]],
  },
  {
    id: 'L12', takes: [[57, 61]], style: 'final',
    markup: '{世|せ}{界|かい}の どこかで ページが {開|ひら}く',
    en: 'somewhere in the world, a page opens',
    melody: [[0, 2, 75], [2, 2, 77], [4, 2, 79], [6, 4, 77], [12, 2, 75], [14, 2, 77], [16, 2, 79], [18, 6, 80], [32, 2, 82], [34, 2, 82], [36, 2, 80], [38, 4, 79], [44, 2, 77], [46, 2, 79], [48, 8, 80]],
  },
  {
    id: 'L13', takes: [[61, 65]], style: 'final',
    markup: '{読|よ}んでよ {README|リードミー} {君|きみ}だけの ドキュメント',
    en: 'read me — README — docs that are yours alone',
    melody: up(HOOK, 1),
  },
  {
    id: 'L14', takes: [[65, 67]], style: 'outro',
    markup: 'さあ、{書|か}こう',
    en: "now, let's write",
    melody: [[2, 2, 66], [4, 8, 69], [16, 2, 71], [18, 2, 69], [20, 10, 66]],
  },
];

// ── staff credits ───────────────────────────────────────────────────────────

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export interface CreditDef {
  /** [startBar, endBar) */
  bars: [number, number];
  jp: string;
  en: string;
  names: string[];
  /** default corner (agreed with the scene; docs/overlay.md) */
  corner: Corner;
  /** layout of the names */
  layout: 'single' | 'row' | 'columns' | 'beats';
  cols?: number;
  /** 'beats': names land at given times (showcase contract); a second page from bar `page2` */
  pages?: string[][];
  /** names in the mono face (CLI) */
  mono?: boolean;
  /** indices of names set in the mono face (domains, paths) when the rest are not */
  monoNames?: number[];
  /** explicit window in seconds (overrides `bars`) */
  t0?: number;
  t1?: number;
}

export const CREDITS: CreditDef[] = [
  { bars: [11, 13], jp: '原作', en: 'ORIGINAL WORK', names: ['Fuma Nama'], corner: 'tr', layout: 'single' },
  { bars: [14, 16], jp: '本文', en: 'CONTENT', names: ['MDX', 'Markdown', 'Shiki', 'Twoslash'], corner: 'br', layout: 'row' },
  // TOC styles and theme presets are config values (`style: 'clerk'`, `ruby.css`): mono, like all code
  { bars: [21, 23], jp: '目次', en: 'TABLE OF CONTENTS', names: ['normal', 'clerk', 'block', 'minimap', 'popover'], corner: 'tl', layout: 'row', mono: true },
  { bars: [27, 29], jp: '美術設定', en: 'LAYOUTS', names: ['Docs', 'Notebook', 'Flux', 'Glass', 'Spacious', 'Home'], corner: 'tr', layout: 'columns', cols: 3 },
  {
    bars: [35, 37], jp: '色彩設計', en: 'COLOUR DESIGN', corner: 'tr', layout: 'columns', cols: 3, mono: true,
    names: ['neutral', 'black', 'vitepress', 'dusk', 'catppuccin', 'ocean', 'purple', 'solar', 'emerald', 'ruby', 'aspen', 'shadcn'],
  },
  { bars: [45, 47], jp: '編集', en: 'CUSTOMIZE', names: ['@fumadocs/cli', 'customize · add · tree'], corner: 'tr', layout: 'single', mono: true },
  { bars: [53, 55], jp: '協力', en: 'INTEGRATIONS', names: ['OpenAPI', 'Obsidian', 'Sanity', 'Story', 'Notion', 'Python', 'TypeScript'], corner: 'br', layout: 'columns', cols: 4 },
  {
    // names/times come from the showcase scene contract (mv/src/scenes/showcase/contract.ts) when present
    bars: [59, 63], jp: '出演', en: 'SHOWCASE', corner: 'tr', layout: 'beats',
    names: ['Evil Charts', 'shadcn/ui', 'Better Auth', 'Zod', 'Prisma', 'nuqs', 'ArkType', 'Zen Browser'],
    pages: [
      ['Evil Charts', 'shadcn/ui', 'Better Auth', 'Zod', 'Prisma', 'nuqs', 'ArkType', 'Zen Browser'],
      ['Turborepo', 'Hero UI', 'React-PDF', 'Pothos GraphQL', 'Ultracite', 'Better T Stack', 'Dokploy', 'Documenso'],
    ],
  },
  // 制作 PRODUCTION (bars 66–67) is drawn by the outro inside its end card (mirrors the intro title card's block)
];
