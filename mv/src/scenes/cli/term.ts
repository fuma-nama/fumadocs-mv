import { clamp, ease, lerp, seg } from '../../engine/anim';
import { P } from './pal';
import { COMMAND, T, TYPING, steps1, steps2 } from './timeline';

/**
 * The terminal as a pure function of t: the real `@fumadocs/cli` + @clack/prompts 1.8.1 output
 * (base-ui, Next.js template), rows of coloured spans on a 12×24 px cell grid.
 * Clack colours → film palette: cyan→SKY, green/magenta symbols→ORANGE, green text→MINT.
 */
export const COLS = 78;
/** From Enter until bar 48 the terminal window is narrower (52 columns), so prompts wrap before the preview. */
export const COLS_PROMPT = 52;
export const CELL_W = 12;
export const CELL_H = 24;
export const TERM_PAD = 12;
export const PROMPT = '~/my-docs ❯ ';

/**
 * Terminal content height (desktop px). A compact bar while the command is typed; from Enter a
 * 14-row screen (the big prompt framing, then the mini window); 23 rows when restored in bar 48.
 */
export const TERM_BAR_H = 72;
export const TERM_H_PROMPT = 14 * CELL_H + 2 * TERM_PAD; // 360
export const TERM_H_FULL = 23 * CELL_H + 2 * TERM_PAD; // 576
export function termHeight(t: number) {
  if (t < T.enter1) return TERM_BAR_H;
  if (t < T.speed) return lerp(TERM_BAR_H, TERM_H_PROMPT, ease.outCubic(seg(t, T.enter1, T.enter1 + 0.16)));
  return TERM_H_FULL;
}
/** Logical screen rows (scrolling), independent of the window's open animation. */
export function screenRows(t: number) {
  if (t < T.enter1) return 2;
  return t < T.speed ? 14 : 23;
}

export interface Span {
  s: string;
  c: string;
  b?: boolean;
  chip?: boolean;
}
export interface Row {
  spans: Span[];
  /** time the row appears */
  t: number;
}

export interface Radio {
  /** row of the active option: the ● lands on it on the hit frame */
  row: number;
  col: number;
  alpha: number;
  /** the row it came from and a 0..1 smear that decays over 3 frames after the hit */
  fromRow: number;
  smear: number;
}

export interface TermState {
  rows: Row[];
  caret?: { row: number; col: number; on: boolean };
  radio?: Radio;
  spinner?: { row: number; col: number; frame: number };
  /** rows scrolled off the top (fractional) */
  scroll: number;
  /** smooth row count */
  n: number;
  /** everything but the caret is cleared (the stop) */
  cleared: boolean;
}

const g = (s: string): Span => ({ s, c: P.TERM_GRAY });
const fg = (s: string, b = false): Span => ({ s, c: P.TERM_FG, b });
const dim = (s: string): Span => ({ s, c: P.TERM_DIM });
const sky = (s: string, b = false): Span => ({ s, c: P.SKY, b });
const mint = (s: string, b = false): Span => ({ s, c: P.MINT, b });
const or = (s: string): Span => ({ s, c: P.ORANGE });
const chip = (s: string): Span => ({ s, c: P.WHITE, chip: true, b: true });

export const LAYOUTS: [label: string, hint: string, id: string][] = [
  ['Docs Layout', 'the default docs layout', 'docs'],
  ['Notebook Layout', 'a more compact version of docs layout', 'notebook'],
  ['Flux Layout', 'the experimental variant of docs layout', 'flux'],
  ['Glass Layout', 'a docs layout with floating, translucent panels', 'glass'],
  ['Spacious Layout', 'a docs layout with the page in an inset panel, Base UI only', 'spacious'],
  ['Home Layout', 'the layout for other non-docs pages', 'home'],
];
const PAGE_HINT = "only replace a part of layout's page, useful for adjusting details";
const LAYOUT_HINT = 'only replace a part of layout, useful for adjusting details';
export const PARTS: [label: string, hint: string, slot: string][] = [
  ['All', 'install the entire layout', 'all'],
  ['Replace & rewrite from minimal styles', 'for those who want to build their own UI from ground up', 'min'],
  ['Page: breadcrumb', PAGE_HINT, 'breadcrumb'],
  ['Page: container', PAGE_HINT, 'container'],
  ['Page: footer', PAGE_HINT, 'footer'],
  ['Page: toc', PAGE_HINT, 'toc'],
  ['Layout: container', LAYOUT_HINT, 'layout-container'],
  ['Layout: header', LAYOUT_HINT, 'header'],
  ['Layout: sidebar', LAYOUT_HINT, 'sidebar'],
];

/** Greedy word wrap like wrap-ansi(hard) at `w` columns. */
function wrap(text: string, w: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const cand = line ? `${line} ${word}` : word;
    if ([...cand].length <= w) line = cand;
    else {
      if (line) out.push(line);
      line = word;
      while ([...line].length > w) {
        out.push([...line].slice(0, w).join(''));
        line = [...line].slice(w).join('');
      }
    }
  }
  if (line) out.push(line);
  return out;
}

/** Index after the last step with time <= t, and the slide progress of that step. */
function cursorAt(t: number, steps: [number, number][], start: number) {
  let idx = start;
  let prev = start;
  let ts = -1;
  for (const [st, i] of steps) {
    if (st <= t + 1e-9) {
      prev = idx;
      idx = i;
      ts = st;
    }
  }
  // the cursor lands ON the hit (terminal UIs move instantly); a short smear trails it
  const smear = ts < 0 ? 0 : 1 - clamp((t - ts) / 0.05);
  return { idx, prev, smear };
}

interface Built {
  rows: Row[];
  /** row index of each option's first line */
  optRow: number[];
}

/** Select prompt rows (active state); long active lines wrap at the window width like wrap-ansi. */
function selectRows(at: number, message: string, opts: [string, string, string][], active: number, cols = COLS_PROMPT): Built {
  const rows: Row[] = [];
  let k = 0;
  // the prompt prints fast: two rows per frame
  const push = (spans: Span[]) => rows.push({ spans, t: at + k++ / 120 });
  push([g('│')]);
  push([sky('◆'), fg('  ' + message)]);
  const optRow: number[] = [];
  opts.forEach(([label, hint], i) => {
    optRow.push(rows.length);
    if (i === active) {
      const lines = wrap(`● ${label} (${hint})`, cols - 3);
      lines.forEach((ln, j) => {
        if (j === 0) {
          // label bright, hint dim; the ● cell stays blank (the moving orange dot draws there)
          const labelEnd = 2 + label.length;
          push([sky('│'), fg('  '), fg('  '), fg(ln.slice(2, labelEnd)), dim(ln.slice(labelEnd))]);
        } else push([sky('│'), fg('  '), dim(ln)]);
      });
    } else push([sky('│'), fg('  '), dim('○ ' + label)]);
  });
  push([sky('│'), fg('  '), dim('↑/↓'), fg(' to navigate • '), dim('Enter:'), fg(' confirm')]);
  push([sky('└')]);
  return { rows, optRow };
}

/** Submitted select rows. */
function doneRows(at: number, message: string, answer: string): Row[] {
  return [
    { spans: [g('│')], t: at },
    { spans: [or('◇'), fg('  ' + message)], t: at },
    { spans: [g('│'), fg('  '), dim(answer)], t: at },
  ];
}

/** Files written by `customize` → Docs Layout → All (real run, @fumadocs/cli 1.7.5, base-ui). */
const FILES = [
  'layouts/docs/index.tsx',
  'layouts/docs/page/index.tsx',
  'layouts/docs/slots/sidebar.tsx',
  'layouts/docs/client.tsx',
  'layouts/docs/page/slots/toc.tsx',
  'layouts/docs/slots/header.tsx',
  'layouts/docs/slots/container.tsx',
  'layouts/docs/page/slots/breadcrumb.tsx',
  'layouts/docs/page/slots/footer.tsx',
  'layouts/docs/page/slots/container.tsx',
  'layouts/shared/client.tsx',
  'layouts/shared/slots/search-trigger.tsx',
  'layouts/shared/slots/theme-switch.tsx',
  'layouts/shared/slots/language-select.tsx',
];
export const FILE_COUNT = FILES.length; // 14

/** Spinner message while installing: the file being written (spin.message per written file). */
export function installMessage(t: number): string {
  if (t < T.enter3 + 0.05) return 'Installing layouts/docs';
  const k = Math.floor(clamp((t - T.enter3 - 0.05) / (T.installed - T.enter3 - 0.1)) * FILES.length);
  return FILES[Math.min(FILES.length - 1, k)];
}
export function installedCount(t: number): number {
  if (t < T.enter3 + 0.05) return 0;
  return Math.min(FILES.length, 1 + Math.floor(clamp((t - T.enter3 - 0.05) / (T.installed - T.enter3 - 0.1)) * FILES.length));
}

const DEPS = ['@fuma-translate/react@^1.0.2', '@fumadocs/base-ui', 'class-variance-authority@^0.7.1', 'next-themes@^0.4.6', '@base-ui/react@^1.8.0', 'scroll-into-view-if-needed@^3.1.0'];

/** `add` options matching the search "ui -" (real list order, @fumadocs/cli 1.7.5). */
const UI_ITEMS: [label: string, hint?: string][] = [
  ['accordion'],
  ['ai/page-actions', 'Common page actions'],
  ['banner'],
  ['callout'],
  ['card'],
  ['codeblock'],
  ['files'],
  ['github-info', 'A card to display GitHub repo info'],
  ['heading'],
  ['image-zoom', 'Zoomable Image'],
  ['inline-toc'],
  ['steps'],
  ['tabs'],
  ['type-table'],
];

/** Bar 48 schedule (snare roll 75.2 → 76.3): cursor moves and Tab ticks on 16ths. */
export const ADD = {
  typed: T.speed + 0.06,
  fetched: T.speed + 0.1,
  shown: T.speed + 0.13,
  // every keypress on a 16th of the snare roll: ↓↓↓+Tab land together on one 16th
  moves: [
    [T.speed + 0.3, 3],
    [T.speed + 0.4, 6],
  ] as [number, number][],
  ticks: [
    [T.speed + 0.2, 0],
    [T.speed + 0.3, 3],
    [T.speed + 0.4, 6],
  ] as [number, number][],
  enter: T.speed + 0.5,
  feature: T.speed + 0.6,
  final: T.slam - 0.03,
};

function speedRun(t: number, idleAt: number, blink: boolean, promptRow: (typed: string, at: number) => Row) {
  const rows: Row[] = [];
  let caret: TermState['caret'];
  const t0 = T.speed;
  if (t < t0) {
    rows.push(promptRow('', idleAt));
    return { rows, caret: { row: 0, col: PROMPT.length, on: blink } };
  }
  const cmd1 = 'npx @fumadocs/cli add';
  const n1 = Math.round(clamp((t - t0) / (ADD.typed - t0)) * cmd1.length);
  rows.push(promptRow(cmd1.slice(0, n1), t0));
  if (n1 < cmd1.length) return { rows, caret: { row: 0, col: PROMPT.length + n1, on: true } };
  let j = 0;
  const at = (base: number) => base + j++ / 120;
  rows.push({ spans: [g('│')], t: ADD.typed });
  if (t < ADD.fetched) {
    rows.push({ spans: [fg('   '), fg('fetching registry')], t: ADD.typed });
    return { rows, caret };
  }
  rows.push({ spans: [or('◇'), fg('  '), mint('registry fetched', true)], t: ADD.fetched });
  // cursor + selection
  let cur = 0;
  for (const [tt, i] of ADD.moves) if (tt <= t + 1e-9) cur = i;
  const sel = new Set<number>();
  for (const [tt, i] of ADD.ticks) if (tt <= t + 1e-9) sel.add(i);
  if (t < ADD.enter) {
    j = 0;
    rows.push({ spans: [g('│')], t: at(ADD.shown) });
    rows.push({ spans: [sky('◆'), fg('  Select components to install')], t: at(ADD.shown) });
    rows.push({ spans: [sky('│')], t: at(ADD.shown) });
    // the search is typed, then the cursor navigates (the footer switches to Space/Tab)
    const q = 'ui -';
    const nq = Math.round(clamp((t - ADD.shown) / 0.05) * q.length);
    const navigating = t >= ADD.moves[0][0];
    const typing = nq < q.length || t < ADD.ticks[0][0];
    rows.push({ spans: [sky('│'), fg('  '), dim('Search:'), fg(' ' + q.slice(0, nq) + (typing && !navigating ? '█' : '')), ...(nq >= 2 ? [dim(' (14 matches)')] : [])], t: at(ADD.shown) });
    const first = Math.max(0, cur - 6);
    for (let i = first; i < Math.min(UI_ITEMS.length, first + 9); i++) {
      const [label, hint] = UI_ITEMS[i];
      const on = sel.has(i);
      const focus = i === cur;
      const box: Span = on ? or('◼') : dim('◻');
      const name: Span[] = [{ s: 'ui', c: focus ? P.TERM_FG : P.TERM_DIM, b: true }, focus ? fg(` - ${label}`) : dim(` - ${label}`)];
      rows.push({ spans: [sky('│'), fg('  '), box, fg(' '), ...name, ...(focus && hint ? [dim(` (${hint})`)] : [])], t: at(ADD.shown) });
    }
    rows.push({ spans: [sky('│'), fg('  '), dim('↑/↓'), fg(' to navigate • '), dim(navigating ? 'Space/Tab:' : 'Tab:'), fg(' select • '), dim('Enter:'), fg(' confirm • '), dim('Type:'), fg(' to search')], t: at(ADD.shown) });
    rows.push({ spans: [sky('└')], t: at(ADD.shown) });
    return { rows, caret };
  }
  // one cascade, 3 rows per frame, finished before the next command starts
  let q = 0;
  const casc = () => ADD.enter + q++ / 180;
  rows.push({ spans: [g('│')], t: casc() });
  rows.push({ spans: [or('◇'), fg('  Select components to install')], t: casc() });
  rows.push({ spans: [g('│'), fg('  '), dim('3 items selected')], t: casc() });
  for (const name of ['accordion', 'callout', 'files']) {
    rows.push({ spans: [g('│')], t: casc() });
    rows.push({ spans: [or('◇'), fg('  '), mint(`${name} installed`, true)], t: casc() });
  }
  rows.push({ spans: [g('│')], t: casc() });
  rows.push({ spans: [g('└'), fg('  '), mint('Successful', true)], t: casc() });
  rows.push({ spans: [], t: casc() });
  // one feature, straight after
  const cmd2 = 'npx @fumadocs/cli feature search --provider mixedbread';
  if (t < ADD.feature) return { rows, caret };
  const n2 = Math.round(clamp((t - ADD.feature) / 0.05) * cmd2.length);
  rows.push(promptRow(cmd2.slice(0, n2), ADD.feature));
  if (n2 < cmd2.length) return { rows, caret: { row: rows.length - 1, col: PROMPT.length + n2, on: true } };
  const r0 = ADD.feature + 0.06;
  // three small cascades (3 rows per frame), all printed before the final prompt at 75.97
  const group = (base: number, list: Span[][]) => list.forEach((spans, i) => rows.push({ spans, t: base + i / 180 }));
  group(r0, [[g('┌'), fg('  '), chip('Search')], [g('│')], [sky('●'), fg('  next, pnpm')]]);
  group(r0 + 0.04, [[g('│')], [or('◇'), fg('  Search applied')]]);
  group(r0 + 0.08, [[g('│')], [g('└'), fg('  '), mint('Done', true)], []]);
  if (t >= ADD.final) {
    rows.push(promptRow('', ADD.final));
    caret = { row: rows.length - 1, col: PROMPT.length, on: true };
  }
  return { rows, caret };
}

function typedCommand(t: number): string {
  let s = '';
  for (const [tt, ch] of TYPING) if (tt <= t + 1e-9) s += ch;
  return s;
}

/**
 * Moments where the output can get shorter (a prompt redraws or collapses). Like a real screen,
 * lines that scrolled off the top never come back, so the scroll is a running maximum.
 */
const SHRINKS = () => [
  ...steps1().map((x) => x[0]),
  T.enter2,
  ...steps2().map((x) => x[0]),
  T.enter3,
  T.installed,
  ADD.enter,
];
const before = new Map<number, number>();
export function termState(t: number, noPeak = false): TermState {
  const rows: Row[] = [];
  let caret: TermState['caret'];
  let radio: Radio | undefined;
  let spinner: TermState['spinner'];
  const blink = (t * 2.5) % 1 < 0.5; // on for the first half of each beat
  const promptRow = (typed: string, at: number): Row => ({ spans: [sky('~/my-docs'), fg(' ❯ '), fg(typed)], t: at });

  // 1 · command line
  const typed = t < T.enter1 ? typedCommand(t) : COMMAND;
  rows.push(promptRow(typed, T.termShown));
  if (t < T.enter1) {
    const lastKey = TYPING.filter(([tt]) => tt <= t + 1e-9).at(-1)?.[0] ?? -1;
    const typing = t - lastKey < 0.25;
    caret = { row: 0, col: PROMPT.length + [...typed].length, on: typing || blink };
  }

  if (t >= T.enter1) {
    // 2 · intro + prompt 1
    rows.push({ spans: [g('┌'), fg('  '), chip('Customize Fumadocs UI')], t: T.enter1 });
    if (t < T.enter2) {
      const c = cursorAt(t, steps1(), 0);
      const b = selectRows(T.enter1 + 1 / 60, 'What do you want to customize?', LAYOUTS, c.idx);
      const base = rows.length;
      rows.push(...b.rows);
      const prevRow = base + b.optRow[c.prev];
      const curRow = base + b.optRow[c.idx];
      radio = { row: curRow, col: 3, alpha: 1, fromRow: prevRow, smear: c.smear };
    } else {
      rows.push(...doneRows(T.enter2, 'What do you want to customize?', 'Docs Layout'));
      if (t < T.enter3) {
        const c = cursorAt(t, steps2(), 0);
        const b = selectRows(T.enter2 + 1 / 60, 'Which part do you want to customize?', PARTS, c.idx);
        const base = rows.length;
        rows.push(...b.rows);
        const prevRow = base + b.optRow[c.prev];
        const curRow = base + b.optRow[c.idx];
        radio = { row: curRow, col: 3, alpha: 1, fromRow: prevRow, smear: c.smear };
      } else {
        rows.push(...doneRows(T.enter3, 'Which part do you want to customize?', 'All'));
        // 3 · installer spinner
        rows.push({ spans: [g('│')], t: T.enter3 + 1 / 60 });
        if (t < T.installed) {
          const msg = installMessage(t);
          const first = msg === 'Installing layouts/docs';
          const dots = '.'.repeat(Math.floor(((t - T.enter3) / 0.1) * 0.125) % 4);
          rows.push({ spans: [fg('   '), first ? sky(msg, true) : fg(msg), fg(dots)], t: T.enter3 + 2 / 60 });
          spinner = { row: rows.length - 1, col: 0, frame: Math.floor((t - T.enter3) / 0.1) % 4 };
        } else {
          const at = T.installed;
          let k = 0;
          const push = (spans: Span[]) => rows.push({ spans, t: at + k++ / 60 });
          push([or('◇'), fg('  '), mint('layouts/docs installed', true)]);
          // the real run: the installer lists new dependencies and asks to install them
          push([g('│')]);
          const inner = COLS_PROMPT - 4;
          push([g('│ '), g('┌─'), fg('New Dependencies'), g('─'.repeat(inner - 18) + '┐')]);
          for (const dep of DEPS) push([g('│ '), g('│'), fg(('  ' + dep).padEnd(inner)), g('│')]);
          push([g('│ '), g('└' + '─'.repeat(inner) + '┘')]);
          push([g('│')]);
          push([or('◇'), fg('  Do you want to install with pnpm?')]);
          push([g('│'), fg('  '), dim('Yes')]);
          push([g('│')]);
          push([or('◇'), fg('  Dependencies installed')]);
          push([g('┌'), fg('  '), fg('What is Next?', true)]);
          push([g('│')]);
          push([sky('●'), fg('  You can check the installed layouts in `layouts` folder.')]);
          push([g('│'), fg('  '), dim('---')]);
          push([g('│'), fg('  Updated the imports of app/docs/layout.tsx, app/docs/[[...slug]]/page.tsx.')]);
          push([g('│'), fg('  '), mint('"fumadocs-ui/layouts/docs" -> "@/layouts/docs"')]);
          push([g('│'), fg('  '), mint('"fumadocs-ui/layouts/docs/page" -> "@/layouts/docs/page"')]);
          push([g('│')]);
          push([g('└'), fg('  '), fg('Have fun!', true)]);
          push([]);
          // 4 · bar 48 on the snare roll: `add` (boxes tick on 16ths), then one `feature`
          const sp = speedRun(t, at + k / 60, blink, promptRow);
          rows.push(...sp.rows);
          if (sp.caret) caret = { ...sp.caret, row: rows.length - sp.rows.length + sp.caret.row };
        }
      }
    }
  }

  // rows print in order: a row never shows before the rows above it (keeps caret rows exact)
  for (let i = 1; i < rows.length; i++) if (rows[i].t < rows[i - 1].t) rows[i] = { ...rows[i], t: rows[i - 1].t };

  // smooth scroll: rows slide in over 3 frames; keep the last screenRows(t) visible
  let n = 0;
  for (const r of rows) n += ease.outCubic(clamp((t - r.t) / 0.05));
  let top = n;
  if (!noPeak)
    for (const tc of SHRINKS()) {
      if (tc > t) continue;
      let v = before.get(tc);
      if (v === undefined) {
        v = termState(tc - 1e-4, true).n;
        before.set(tc, v);
      }
      top = Math.max(top, v);
    }
  const scroll = Math.max(0, top - screenRows(t));
  return { rows: rows.filter((r) => r.t <= t + 1e-9), caret, radio, spinner, scroll, n, cleared: t >= T.stop };
}
