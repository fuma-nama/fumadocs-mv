import { clamp, ease, lerp, seg, spring } from '../../engine/anim';
import { rect, lerpRect, TITLE_H, restoreButton, type Rect } from './desk';
import { T, steps1, steps2 } from './timeline';
import { termState, termHeight, CELL_W, CELL_H, TERM_PAD, TERM_BAR_H, TERM_H_PROMPT, TERM_H_FULL, COLS_PROMPT, type TermState } from './term';

/** Desktop space = screen space at rest. Every rect is a window CONTENT rect. */
export const FULL = rect(0, 0, 1920, 1080);
export const PAGE_WIN = rect(1052, 200, 800, 450);
export const TERM_WIN = rect(66, 160, 960, TERM_H_FULL);
const TERM_W_PROMPT = COLS_PROMPT * CELL_W + 2 * 12; // 648
export function termRect(t: number): Rect {
  const w = t >= T.enter1 && t < T.speed ? lerp(TERM_WIN.w, TERM_W_PROMPT, promptK(t)) : TERM_WIN.w;
  return rect(TERM_WIN.x, TERM_WIN.y, w, termHeight(t));
}
export { TERM_PAD, TERM_BAR_H };
/** Bars 43–44: the page preview becomes an inset window overlapping the (big) terminal. */
export const INSET = rect(1118, 312, 768, 432);
/** Bar 47: the printed page lands here; it ends above the chant band (y ≥ 820). */
export const MONTAGE_WIN = rect(304, 62, 1312, 738);
/** Prompt framing: the terminal scaled so the prompt text reads big (JetBrains Mono 20 px → 35 px). */
export const PROMPT_SCALE = 1.75;
export const ICONS = [
  { kind: 'folder', label: 'my-docs', x: 112, y: 236 },
  { kind: 'doc', label: 'README.mdx', x: 112, y: 366 },
  { kind: 'term', label: 'TERMINAL', x: 112, y: 496 },
  { kind: 'doc', label: 'cli.json', x: 112, y: 626 },
] as const;
export const TERM_ICON = ICONS[2];

export type FigureKind = 'dot' | 'block' | 'radio' | 'moon' | 'none';
export interface Figure {
  kind: FigureKind;
  x: number;
  y: number;
  /** morph 0..1 between kinds while hopping (dot→block etc.) */
  morph: number;
  from?: FigureKind;
  /** click squash 0..1 and ring ripple 0..1 */
  squash: number;
  ring: number;
  ringR: number;
  ringX: number;
  ringY: number;
  /** moon-spinner frame */
  frame: number;
  visible: boolean;
  /** cursor smear: where it came from and how strong (0..1) */
  smear?: { x: number; y: number; k: number };
}

export interface Desk {
  t: number;
  page: { rect: Rect; over: number; visible: boolean; zoom: Rect[]; alpha: number; pressed: boolean; minimised: number; mode: 'page' | 'montage'; onTop: boolean };
  term: { rect: Rect; visible: boolean; zoom: Rect[]; state: TermState; xf: Xf };
  taskbarY: number;
  iconsIn: number[];
  iconSel: number;
  figure: Figure;
  titleRevealed: number;
  view: View;
}

/** Cell centre (desktop px) of a terminal row/col (row already scroll-adjusted by caller). */
export function cellCenter(row: number, col: number, scroll = 0) {
  return {
    x: TERM_WIN.x + TERM_PAD + col * CELL_W + CELL_W / 2,
    y: TERM_WIN.y + TERM_PAD + (row - scroll) * CELL_H + CELL_H / 2,
  };
}

const bez = (a: number, b: number, c: number, k: number) => (1 - k) * (1 - k) * a + 2 * (1 - k) * k * b + k * k * c;

/** Restore-down progress (63.6 → 64.0) in log-size space, accelerating into the landing. */
function restoreK(t: number) {
  const u = clamp((t - T.click) / (T.restoreEnd - T.click));
  return Math.pow(u, 1.35);
}

function restoredRect(t: number): Rect {
  const k = restoreK(t);
  // interpolate size in log space so the shrink reads at a constant perceived speed
  const s = Math.exp(lerp(0, Math.log(PAGE_WIN.w / FULL.w), k));
  const cx = lerp(FULL.x + FULL.w / 2, PAGE_WIN.x + PAGE_WIN.w / 2, k);
  const cy = lerp(FULL.y + FULL.h / 2, PAGE_WIN.y + PAGE_WIN.h / 2, k) + TITLE_H * 0.5 * k;
  let w = FULL.w * s;
  let h = FULL.h * s;
  // landing settle: it keeps shrinking a touch past the mark on the downbeat, then springs back
  if (t >= T.restoreEnd) {
    const d = t - T.restoreEnd;
    const sq = 1 - 0.03 * Math.sin(d * Math.PI * 2 * 3.2) * Math.exp(-d * 9);
    w = PAGE_WIN.w * sq;
    h = PAGE_WIN.h * sq;
    return rect(PAGE_WIN.x + PAGE_WIN.w / 2 - w / 2, PAGE_WIN.y + PAGE_WIN.h / 2 - h / 2, w, h);
  }
  return rect(cx - w / 2, cy - TITLE_H * 0.5 * k - h / 2, w, h);
}

let lastRadioPos: { x: number; y: number } | null = null;
/** Where the ● sat on the last frame of prompt 2 (screen-continuous start of the drop into the spinner). */
function lastRadio() {
  if (!lastRadioPos) {
    const st = termState(T.enter3 - 1e-4);
    lastRadioPos = st.radio ? cellCenter(st.radio.row, st.radio.col, st.scroll) : cellCenter(8, 3, st.scroll);
  }
  return lastRadioPos;
}

function figureAt(t: number, term: TermState): Figure {
  const f: Figure = { kind: 'dot', x: 960, y: 540, morph: 1, squash: 0, ring: 0, ringR: 0, ringX: 0, ringY: 0, frame: 0, visible: true };
  const btn0 = restoreButton(rect(0, 0, 1920, TITLE_H));
  const click = (tc: number, x: number, y: number) => {
    const d = t - tc;
    // the press anticipates: fully squashed ON the click, released over the next 7 frames
    if (d >= -0.04 && d < 0.12) f.squash = Math.max(f.squash, d < 0 ? (d + 0.04) / 0.04 : 1 - d / 0.12);
    if (d < 0 || d > 0.35) return;
    if (1 - d / 0.35 > f.ring) {
      f.ring = 1 - d / 0.35;
      f.ringR = 7 + 26 * ease.outCubic(d / 0.35);
      f.ringX = x;
      f.ringY = y;
    }
  };
  // maximised title bar's restore button
  const btn = restoreButton(rect(0, 0, 1920, TITLE_H));
  if (t < T.click) {
    const k = ease.inOutCubic(seg(t, T.winFrom, T.click - 0.05));
    f.x = bez(960, 1500, btn.x, k);
    f.y = bez(540, 120, btn.y, k);
  } else if (t < T.restoreEnd) {
    f.x = btn.x;
    f.y = btn.y;
  } else if (t < T.dbl1) {
    const k = ease.inOutCubic(seg(t, T.restoreEnd, T.dbl1 - 0.05));
    f.x = bez(btn.x, 900, TERM_ICON.x, k);
    f.y = bez(btn.y, 60, TERM_ICON.y - 6, k);
  } else if (t < T.dbl2 + 0.05) {
    f.x = TERM_ICON.x;
    f.y = TERM_ICON.y - 6;
  } else if (t < T.caretIn) {
    // dive into the prompt and become the block caret
    const k = ease.inOutCubic(seg(t, T.dbl2 + 0.05, T.caretIn));
    const c = cellCenter(0, 12);
    f.x = lerp(TERM_ICON.x, c.x, k);
    f.y = lerp(TERM_ICON.y - 6, c.y, k) - Math.sin(k * Math.PI) * 40;
    f.kind = 'block';
    f.from = 'dot';
    f.morph = k;
  } else if (t < T.enter1) {
    f.kind = 'block';
    if (term.caret) {
      const c = cellCenter(term.caret.row, term.caret.col, term.scroll);
      f.x = c.x;
      f.y = c.y;
      f.visible = term.caret.on;
    }
  } else if (t < T.enter3 + 0.1 && term.radio) {
    // hop from the previous holder, then ride the select cursor
    const r = cellCenter(term.radio.row, term.radio.col, term.scroll);
    const hop = (t0: number, from: { x: number; y: number }, kindFrom: FigureKind) => {
      // already in motion on the Enter frame (it never sits on the collapsed answer text)
      const k = ease.outCubic(seg(t, t0 - 1 / 60, t0 + 0.1));
      if (k >= 1) return false;
      f.x = lerp(from.x, r.x, k);
      f.y = lerp(from.y, r.y, k) - Math.sin(k * Math.PI) * 18;
      f.from = kindFrom;
      f.morph = k;
      return true;
    };
    f.kind = 'radio';
    f.x = r.x;
    f.y = r.y;
    if (term.radio.smear > 0) {
      const from = cellCenter(term.radio.fromRow, term.radio.col, term.scroll);
      f.smear = { x: from.x, y: from.y, k: term.radio.smear };
    }
    if (t < T.enter2) hop(T.enter1, cellCenter(0, 12 + 27), 'block');
    else hop(T.enter2, cellCenter(4, 3), 'radio');
  } else if (t < T.installed) {
    // the radio dot drops into the spinner and becomes the moon (◒◐◓◑)
    const sp = term.spinner;
    const target = sp ? cellCenter(sp.row, sp.col, term.scroll) : cellCenter(9, 0);
    const from = lastRadio();
    const k = ease.outCubic(seg(t, T.enter3 - 1 / 60, T.enter3 + 0.1));
    f.kind = 'moon';
    f.from = 'radio';
    f.morph = k;
    f.x = lerp(from.x, target.x, k);
    f.y = lerp(from.y, target.y, k) - Math.sin(k * Math.PI) * 14;
    f.frame = sp?.frame ?? 0;
  } else if (t >= T.speed && term.caret) {
    const c = cellCenter(term.caret.row, term.caret.col, term.scroll);
    f.kind = 'block';
    f.x = c.x;
    f.y = c.y;
    f.visible = term.caret.on;
  } else {
    f.visible = false;
    f.kind = 'none';
  }
  click(T.click, btn0.x, btn0.y);
  click(T.dbl1, TERM_ICON.x, TERM_ICON.y - 6);
  click(T.dbl2, TERM_ICON.x, TERM_ICON.y - 6);
  if (t >= T.dbl2 + 0.05) f.squash = 0;
  return f;
}

/** Terminal window transform: screen = (p - TERM_ORIGIN) * s + (dx, dy). */
export interface Xf {
  s: number;
  dx: number;
  dy: number;
}
export const TERM_ORIGIN = { x: TERM_WIN.x - 2, y: TERM_WIN.y - TITLE_H - 2 };
const XF_ID: Xf = { s: 1, dx: TERM_ORIGIN.x, dy: TERM_ORIGIN.y };
// content top-left lands on whole pixels: x = 2·s + dx = 38, y = 32·s + dy = 176
const XF_PROMPT: Xf = { s: PROMPT_SCALE, dx: 34.5, dy: 120 };
const XF_MINI: Xf = { s: 0.5, dx: 30, dy: 800 };
/** Enter → prompt framing: the camera whips out while the terminal grows (same curve). */
export const promptK = (t: number) => ease.outCubic(seg(t, T.enter1, T.enter1 + 0.22));
const TAB_PAGE = rect(164, 1046, 166, 28);
export const xfPoint = (xf: Xf, x: number, y: number) => ({ x: (x - TERM_ORIGIN.x) * xf.s + xf.dx, y: (y - TERM_ORIGIN.y) * xf.s + xf.dy });
const lerpXf = (a: Xf, b: Xf, k: number): Xf => ({ s: lerp(a.s, b.s, k), dx: lerp(a.dx, b.dx, k), dy: lerp(a.dy, b.dy, k) });
/** Terminal content rect (desktop px) for a transform and content size. */
function contentRect(xf: Xf, w: number, h: number): Rect {
  return rect(xf.dx + (TERM_WIN.x - TERM_ORIGIN.x) * xf.s, xf.dy + (TERM_WIN.y - TERM_ORIGIN.y) * xf.s, w * xf.s, h * xf.s);
}
/** Transform that puts the terminal content (logical width w) on content rect r. */
function xfFromContent(r: Rect, w: number): Xf {
  const s = r.w / w;
  return { s, dx: r.x - (TERM_WIN.x - TERM_ORIGIN.x) * s, dy: r.y - (TERM_WIN.y - TERM_ORIGIN.y) * s };
}
/** Outer window rect (border + title bar) around a content rect at chrome pixel scale u. */
function outerOf(r: Rect, u: number): Rect {
  return rect(r.x - 2 * u, r.y - (TITLE_H + 2) * u, r.w + 4 * u, r.h + (TITLE_H + 4) * u);
}
/** The terminal's taskbar tab, as a content rect (its chrome shrinks to almost nothing there). */
const TAB_CONTENT = rect(344, 1060, 138, 12);

/** Pixel-art scale for the terminal chrome: 2 in the prompt framing, 1 otherwise; continuous in between. */
export function chromeScale(s: number) {
  if (s >= 1) return 1 + Math.min(1, (s - 1) / (PROMPT_SCALE - 1));
  return s >= 0.5 ? 1 : 2 * s;
}


/** 2D desktop camera: screen = s * (desk - c) + q. Identity when s = 1 and c = q. */
export interface View {
  s: number;
  cx: number;
  cy: number;
  qx: number;
  qy: number;
}
export const VIEW_ID: View = { s: 1, cx: 960, cy: 540, qx: 960, qy: 540 };

export function deskAt(t: number): Desk {
  const term = termState(t);
  // ── page window ──
  let pr: Rect;
  let over = 0;
  const zoomP: Rect[] = [];
  let pageVisible = true;
  let minimised = 0;
  let pageMode: 'page' | 'montage' = 'page';
  if (t < T.click) {
    pr = FULL;
    over = 1;
  } else if (t < T.restoreEnd + 0.4) {
    pr = restoredRect(t);
    over = 1 - restoreK(t);
    for (const lag of [0.035, 0.07, 0.105]) {
      const tl = Math.max(T.click, t - lag);
      if (tl > T.click && tl < T.restoreEnd) zoomP.push(restoredRect(tl));
    }
  } else pr = PAGE_WIN;
  if (t >= T.enter1 && t < T.enter3) pr = lerpRect(PAGE_WIN, INSET, promptK(t));
  if (t >= T.enter3 && t < T.montage) {
    const k = ease.inCubic(seg(t, T.enter3, T.enter3 + 0.15));
    minimised = k;
    pr = lerpRect(INSET, TAB_PAGE, k);
    for (const lag of [0.03, 0.06]) {
      const kk = ease.inCubic(seg(t - lag, T.enter3, T.enter3 + 0.15));
      if (kk > 0 && kk < 1) zoomP.push(lerpRect(INSET, TAB_PAGE, kk));
    }
    if (k >= 1) pageVisible = false;
  } else if (t >= T.montage) {
    pageMode = 'montage';
    const k = ease.inCubic(seg(t, T.speed, T.speed + 0.12));
    pr = lerpRect(MONTAGE_WIN, TAB_PAGE, k);
    minimised = k;
    for (const lag of [0.025, 0.05]) {
      const kk = ease.inCubic(seg(t - lag, T.speed, T.speed + 0.12));
      if (kk > 0 && kk < 1) zoomP.push(lerpRect(MONTAGE_WIN, TAB_PAGE, kk));
    }
    if (k >= 1) pageVisible = false;
  }
  // ── terminal window ──
  let termVisible = t >= T.termShown;
  const zoomT: Rect[] = [];
  if (t >= T.termOpen && t < T.termShown + 0.03) {
    const icon = rect(TERM_ICON.x - 24, TERM_ICON.y - 15, 48, 30);
    const full = rect(TERM_WIN.x, TERM_WIN.y - TITLE_H, TERM_WIN.w, TERM_BAR_H + TITLE_H);
    for (const lag of [0, 0.033, 0.066]) {
      const k = ease.outCubic(seg(t - lag, T.termOpen, T.termShown));
      if (k > 0 && k < 1) zoomT.push(lerpRect(icon, full, k));
    }
  }
  let xf = XF_ID;
  if (t >= T.enter1 && t < T.enter3) xf = lerpXf(XF_ID, XF_PROMPT, promptK(t));
  else if (t >= T.enter3 && t < T.installed) xf = lerpXf(XF_PROMPT, XF_MINI, ease.inOutCubic(seg(t, T.enter3, T.enter3 + 0.15)));
  else if (t >= T.installed && t < T.speed) {
    // minimise the mini terminal into its tab (content rect → a tab-sized rect; chrome scales with it)
    const k = ease.inCubic(seg(t, T.installed, T.installed + 0.14));
    const mini = contentRect(XF_MINI, TERM_W_PROMPT, TERM_H_PROMPT);
    const cr = lerpRect(mini, TAB_CONTENT, k);
    xf = xfFromContent(cr, TERM_W_PROMPT);
    if (k > 0 && k < 1) {
      const k2 = ease.inCubic(seg(t - 0.03, T.installed, T.installed + 0.14));
      zoomT.push(outerOf(cr, chromeScale(xf.s)), outerOf(lerpRect(mini, TAB_CONTENT, k2), chromeScale(xf.s)));
    }
    if (k >= 1) termVisible = false;
  } else if (t >= T.speed) {
    // restore from the tab for bar 48
    const k = ease.outCubic(seg(t, T.speed, T.speed + 0.12));
    const full = contentRect(XF_ID, TERM_WIN.w, TERM_H_FULL);
    xf = xfFromContent(lerpRect(TAB_CONTENT, full, k), TERM_WIN.w);
    if (k < 1)
      for (const lag of [0.02, 0.045]) {
        const kk = ease.outCubic(seg(t - lag, T.speed, T.speed + 0.12));
        if (kk > 0) {
          const cr = lerpRect(TAB_CONTENT, full, kk);
          zoomT.push(outerOf(cr, chromeScale(cr.w / TERM_WIN.w)));
        }
      }
  }
  const taskbarY = lerp(1080, 1040, ease.outCubic(seg(t, T.click + 0.15, T.restoreEnd)));
  const iconsIn = ICONS.map((_, i) => ease.outBack(seg(t, T.iconsIn + i * 0.1, T.iconsIn + i * 0.1 + 0.2)));
  const iconSel = t >= T.dbl1 && t < T.termShown ? 1 : 0;
  return {
    t,
    page: { rect: pr, over, visible: pageVisible, zoom: zoomP, alpha: 1, pressed: t >= T.click && t < T.click + 0.12, minimised, mode: pageMode, onTop: t >= T.enter1 && t < T.enter3 + 0.2 },
    term: { rect: termRect(t), visible: termVisible, zoom: zoomT, state: term, xf },
    taskbarY,
    iconsIn,
    iconSel,
    figure: figureAt(t, term),
    titleRevealed: ease.outCubic(seg(t, T.barReveal, T.barReveal + 0.15)),
    view: viewAt(t, term),
  };
}

/** The final push: one continuous move from 75.35, slamming into the caret 76.0 → 76.4 (tape stop). */
let finalCaret: { x: number; y: number } | null = null;
/** The last prompt's caret (desktop px, full-size terminal) — the B6 caret before the 4× slam. */
export function finalCaretPos() {
  if (!finalCaret) {
    const st = termState(T.stop - 1e-3);
    const c = cellCenter(st.caret?.row ?? 0, st.caret?.col ?? 12, st.scroll);
    finalCaret = { x: c.x, y: c.y };
  }
  return finalCaret;
}

/** View that maps desktop point P to screen S at scale s. */
function viewMap(s: number, P: { x: number; y: number }, S: { x: number; y: number }): View {
  return { s, cx: P.x - (S.x - 960) / s, cy: P.y - (S.y - 540) / s, qx: 960, qy: 540 };
}

function viewAt(t: number, term: TermState): View {
  void term;
  // bars 41–42: push in on the command while it's typed, whip out on Enter
  if (t < T.speed) {
    const k = ease.inOutCubic(seg(t, T.caretIn - 0.05, T.caretIn + 0.75)) * (1 - ease.outCubic(seg(t, T.enter1, T.enter1 + 0.22)));
    if (k > 0) {
      // exactly 2× at rest with whole-pixel translation, so the pixel chrome stays crisp
      const P = { x: 312, y: 184 };
      return viewMap(Math.exp(Math.log(2) * k), P, { x: lerp(P.x, 700, k), y: lerp(P.y, 500, k) });
    }
    return VIEW_ID;
  }
  if (t < T.speed + 0.15) return VIEW_ID;
  const caret = finalCaretPos();
  const push = ease.inOutQuad(seg(t, T.speed + 0.15, T.slam));
  const slam = ease.outQuart(seg(t, T.slam, T.stop));
  const s = Math.exp(lerp(0, Math.log(1.22), push) + lerp(0, Math.log(4 / 1.22), slam));
  // caret screen position: drifts toward the centre during the push, lands at the centre
  const px = lerp(caret.x, lerp(caret.x, 960, 0.25), push);
  const py = lerp(caret.y, lerp(caret.y, 540, 0.25), push);
  const sx = lerp(px, 960, slam);
  const sy = lerp(py, 540, slam);
  return { s, cx: caret.x - (sx - 960) / s, cy: caret.y - (sy - 540) / s, qx: 960, qy: 540 };
}

export { steps1, steps2 };
