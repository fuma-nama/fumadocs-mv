import { clamp, ease, lerp, seg, spring, TAU } from '../../engine/anim';
import { brackets, measure, text } from '../../engine/draw2d';
import { bt, KEY, ringLocalY, T } from './k';
import { hasStoryPlates, plates } from './plates';
import { Route } from './route';
import type { StationCtx, StationImpl } from './station';
import { backlight, callout, calloutColor, card, chevronDown, FD, mono, rr, screenGlass, ui, xIcon } from './ui';
import { hexA } from './world';

const K = KEY.story;
/** linework / labels over the lit cyan field */
const A = '#0A0A0B';
const b = (n: number) => bt(T.sto, n);

const STAGE = { x: 560, y: 700, rx: 370, ry: 58 }; // stage disc
const COMP = { x: 560, y: 612, w: 620, k: 1.75 }; // component on stage (centre x; top at y − 60)

// ── timeline (shared by plate + vector modes) ────────────────────────────────
type St = { type: string; title: string; variant: string };
const TITLE0 = 'This is a Callout', TITLE1 = 'Make it yours';
const tPick = [b(2), b(3), b(4), b(5)]; // warning, error, variant Warning, success
const tType = b(5) + 0.1; // "Make it yours" typed on 32nds
const CPS = 0.026;
const tTyped = tType + TITLE1.length * CPS;

function stateAt(t: number): St & { changed: number; typed: number } {
  const s: St = { type: 'info', title: TITLE0, variant: 'Default' };
  let changed = T.sto - 0.02;
  if (t >= tPick[0] + 0.04) (s.type = 'warning'), (changed = tPick[0] + 0.04);
  if (t >= tPick[1] + 0.04) (s.type = 'error'), (changed = tPick[1] + 0.04);
  if (t >= tPick[2] + 0.04) (s.variant = 'Warning'), (s.type = 'warning'), (changed = tPick[2] + 0.04);
  if (t >= tPick[3]) (s.variant = 'Default'), (s.type = 'success'), (changed = tPick[3]);
  let typed = -1;
  if (t >= tType) {
    typed = clamp(Math.floor((t - tType) / CPS) + 1, 0, TITLE1.length);
    s.title = TITLE1.slice(0, typed);
    changed = Math.max(changed, tType + (typed - 1) * CPS);
  }
  return { ...s, changed, typed };
}

function plateName(t: number) {
  if (t < tPick[0] + 0.04) return '01-default';
  if (t < tPick[1] + 0.04) return '02-type-warning';
  if (t < tPick[2] + 0.04) return '02-type-error';
  if (t < tPick[3]) return '04-variant-warning';
  if (t < tType) return '02-type-success';
  return '03-title-make-it-yours';
}

// ── card geometry: plate css → station-local (card css origin (542, 202) at CX, CY) ──
const CX = 1000, CY = 300;
const cx = (x: number) => x - 542 + CX;
const cy = (y: number) => y - 202 + CY;
const CARD = { x: CX, y: CY, w: 836, h: 328 };
const TYPE_SEL = { x: cx(556), y: cy(478), w: 396, h: 38 };
const TITLE_IN = { x: cx(968), y: cy(404), w: 372, h: 36 };
const VAR_SEL = { x: cx(1297.88), y: cy(207), w: 75.13, h: 24 };
const PREVIEW_COMP = { x: cx(560), y: cy(264), w: 800, h: 46 };
const OPTIONS = ['Unset', '"info"', '"warning"', '"error"', '"success"'];
const VAR_OPTS = ['Default', 'Warning'];

const typeAt: [number, number] = [TYPE_SEL.x + TYPE_SEL.w - 60, TYPE_SEL.y + TYPE_SEL.h / 2];
const titleAt: [number, number] = [TITLE_IN.x + 150, TITLE_IN.y + TITLE_IN.h / 2];
const varAt: [number, number] = [VAR_SEL.x + VAR_SEL.w / 2, VAR_SEL.y + VAR_SEL.h / 2];
const optAt = (i: number): [number, number] => [TYPE_SEL.x + 120, TYPE_SEL.y + TYPE_SEL.h + 8 + i * 32 + 16];
const varOptAt = (i: number): [number, number] => [VAR_SEL.x + 20, VAR_SEL.y + VAR_SEL.h + 8 + i * 30 + 15];

const tIn = T.sto - 0.02, tOut = 89.4;
const xe = typeAt[0], xx = xe;
const route = new Route([
  { t0: tIn, t1: T.sto + 0.16, pts: [[xe, ringLocalY(xe)], typeAt], e: ease.outCubic },
  // b2: open → "warning" → back; b3: open → "error" → back
  { t0: tPick[0] - 0.06, t1: tPick[0] + 0.02, pts: [typeAt, optAt(2)], e: ease.inOutCubic },
  { t0: tPick[0] + 0.12, t1: tPick[1] - 0.08, pts: [optAt(2), typeAt], e: ease.inOutCubic },
  { t0: tPick[1] - 0.06, t1: tPick[1] + 0.02, pts: [typeAt, optAt(3)], e: ease.inOutCubic },
  // b4: to the variant select → "Warning"
  { t0: tPick[1] + 0.12, t1: tPick[2] - 0.08, pts: [optAt(3), varAt], e: ease.inOutCubic },
  { t0: tPick[2] - 0.05, t1: tPick[2] + 0.02, pts: [varAt, varOptAt(1)], e: ease.inOutCubic },
  // b5: back to the type select (success), then into the title input for the typing
  { t0: tPick[2] + 0.12, t1: tPick[3] - 0.02, pts: [varOptAt(1), typeAt], e: ease.inOutCubic },
  { t0: tPick[3] + 0.02, t1: tType - 0.01, pts: [typeAt, titleAt], e: ease.inOutCubic },
]);

function dropdownOpen(t: number, tp: number) {
  return seg(t, tp - 0.07, tp - 0.02) * (1 - seg(t, tp + 0.1, tp + 0.15));
}

// ── stage ────────────────────────────────────────────────────────────────────
function stage(c: CanvasRenderingContext2D, t: number, st: ReturnType<typeof stateAt>) {
  if (t < T.sto - 0.02) return;
  const snap = Math.exp(-Math.max(0, t - T.sto) / 0.08);
  const br = 0.55 + 0.45 * snap + 0.04 * Math.sin(t * 9);
  c.save();
  // beam: hard edges, soft core, dust motes drifting in it
  const top = 30, hw0 = 60;
  const beam = c.createLinearGradient(0, top, 0, STAGE.y);
  beam.addColorStop(0, 'rgba(255,255,255,0)');
  beam.addColorStop(0.35, `rgba(255,255,255,${0.14 * br})`);
  beam.addColorStop(1, `rgba(255,255,255,${0.42 * br})`);
  c.fillStyle = beam;
  c.beginPath();
  c.moveTo(STAGE.x - hw0, top);
  c.lineTo(STAGE.x + hw0, top);
  c.lineTo(STAGE.x + STAGE.rx, STAGE.y);
  c.lineTo(STAGE.x - STAGE.rx, STAGE.y);
  c.closePath();
  c.fill();
  c.strokeStyle = `rgba(255,255,255,${0.5 * br})`;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(STAGE.x - hw0, top);
  c.lineTo(STAGE.x - STAGE.rx, STAGE.y);
  c.moveTo(STAGE.x + hw0, top);
  c.lineTo(STAGE.x + STAGE.rx, STAGE.y);
  c.stroke();
  for (let i = 0; i < 26; i++) {
    const u = (((i * 0.6180339) % 1) + (t - T.sto) * 0.05 * (1 + (i % 3))) % 1;
    const yy = lerp(top + 40, STAGE.y - 20, u);
    const half = lerp(hw0, STAGE.rx, (yy - top) / (STAGE.y - top));
    const xx2 = STAGE.x + (((i * 0.37) % 1) * 2 - 1) * half * 0.9;
    c.fillStyle = hexA('#E8FBFF', 0.25 + 0.25 * Math.sin(t * 5 + i));
    c.fillRect(xx2, yy, 1.6, 1.6);
  }
  // disc
  const g = c.createRadialGradient(STAGE.x, STAGE.y, 0, STAGE.x, STAGE.y, STAGE.rx);
  g.addColorStop(0, `rgba(255,255,255,${0.55 * br})`);
  g.addColorStop(1, 'rgba(255,255,255,0.04)');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(STAGE.x, STAGE.y, STAGE.rx, STAGE.ry, 0, 0, TAU);
  c.fill();
  c.strokeStyle = hexA(A, 0.8);
  c.lineWidth = 1.5;
  c.stroke();
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    c.strokeStyle = hexA(A, 0.55);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(STAGE.x + Math.cos(a) * (STAGE.rx + 10), STAGE.y + Math.sin(a) * (STAGE.ry + 4));
    c.lineTo(STAGE.x + Math.cos(a) * (STAGE.rx + (i % 3 ? 18 : 30)), STAGE.y + Math.sin(a) * (STAGE.ry + (i % 3 ? 7 : 12)));
    c.stroke();
  }
  // the component: pops on the downbeat, springs on each control change
  const popIn = spring(t - (T.sto - 0.02), 3.2, 0.42);
  const dtc = t - st.changed;
  const bump = 1 + 0.06 * Math.sin(Math.min(1, dtc / 0.25) * Math.PI) * Math.exp(-dtc / 0.2);
  const k = popIn * bump;
  c.save();
  c.translate(COMP.x, COMP.y);
  c.scale(Math.max(0.01, k), Math.max(0.01, k));
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath();
  c.ellipse(0, STAGE.y - COMP.y - 4, COMP.w / 2.2, 16, 0, 0, TAU);
  c.fill();
  c.save();
  c.translate(0, 2 * (-60 + 46 * COMP.k) + 8);
  c.scale(1, -1);
  c.globalAlpha *= 0.12;
  callout(c, -COMP.w / 2, -60, COMP.w, st.type, st.title || ' ', '', COMP.k);
  c.restore();
  callout(c, -COMP.w / 2, -60, COMP.w, st.type, st.title || ' ', '', COMP.k, { shadow: true });
  // live caret while typing
  if (st.typed >= 0 && t < tTyped + 0.1) {
    const w = measure(c, st.title, { font: 'ui', size: 14 * COMP.k, weight: 500 });
    c.fillStyle = K;
    c.fillRect(-COMP.w / 2 + 42 * COMP.k + w + 3, -60 + 13 * COMP.k, 2.5, 22 * COMP.k);
  }
  const ch = clamp(dtc / 0.3);
  if (ch > 0 && ch < 1) {
    c.strokeStyle = hexA(calloutColor(st.type), 1 - ch);
    c.lineWidth = 2;
    rr(c, -COMP.w / 2 - 14 * ch, -60 - 14 * ch, COMP.w + 28 * ch, 46 * COMP.k + 28 * ch, 18 + 10 * ch);
    c.stroke();
  }
  c.restore();
  text(c, 'STAGE', STAGE.x - STAGE.rx, STAGE.y + STAGE.ry + 52, { font: 'wide', size: 13, tracking: 0.3, color: A });
  text(c, `<Callout type="${st.type}" title="${st.title}" />`, STAGE.x - STAGE.rx + 96, STAGE.y + STAGE.ry + 52, { font: 'mono', size: 12.5, color: hexA(A, 0.8) });
  c.restore();
}

// ── WithControl card: real plates ────────────────────────────────────────────
let maskCols: { input: string; comp: string } | null = null;
function sampleMaskCols() {
  const im = plates.story['02-type-success'] as HTMLCanvasElement;
  const g = im.getContext('2d')!;
  const px = (x: number, y: number) => {
    const d = g.getImageData(Math.round((x - 542) * 2), Math.round((y - 202) * 2), 1, 1).data;
    return `rgb(${d[0]},${d[1]},${d[2]})`;
  };
  // inside the title input (right of its text) and inside the preview callout (right of its title)
  maskCols = { input: px(1290, 422), comp: px(1200, 287) };
}

function popover(c: CanvasRenderingContext2D, x: number, y: number, w: number, opts: string[], pick: number, hv: number, open: number, rowH: number) {
  const h = (opts.length * rowH + 12) * ease.outCubic(open);
  c.save();
  rr(c, x, y, w, h, 10);
  c.clip();
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)';
  c.shadowBlur = 16;
  card(c, x, y, w, opts.length * rowH + 12, { r: 10, fill: FD.popover });
  c.restore();
  const hy = lerp(y + 6, y + 6 + pick * rowH, hv);
  rr(c, x + 6, hy, w - 12, rowH - 2, 6);
  c.fillStyle = hexA(K, 0.2);
  c.fill();
  opts.forEach((o, i) => mono(c, o, x + 16, y + 6 + i * rowH + rowH * 0.66, 13.5, { color: o === 'Unset' ? FD.mutedFg : FD.fg }));
  c.restore();
}

function cardPlate(c: CanvasRenderingContext2D, t: number, st: ReturnType<typeof stateAt>) {
  const slide = ease.outExpo(clamp((t - (T.sto - 0.1)) / 0.3));
  c.save();
  c.translate((1 - slide) * 300, 0);
  c.globalAlpha *= clamp(slide * 2);
  const im = plates.story[plateName(t)];
  backlight(c, CARD.x, CARD.y, CARD.w, CARD.h, 8);
  c.drawImage(im, CARD.x, CARD.y, CARD.w, CARD.h);
  screenGlass(c, CARD.x, CARD.y, CARD.w, CARD.h, 8, 0.8);
  // typing: reveal "Make it yours" left → right in the input and in the live preview
  if (st.typed >= 0 && t < tTyped) {
    if (!maskCols) sampleMaskCols();
    // reveal edges from the real glyph advances (Geist 14 in the input, 14/500 in the preview title)
    const inX = TITLE_IN.x + 12, inW = measure(c, TITLE1, { font: 'ui', size: 14 }) + 4;
    const inK = measure(c, st.title, { font: 'ui', size: 14 });
    c.fillStyle = maskCols!.input;
    c.fillRect(inX + inK, TITLE_IN.y + 6, inW - inK + 4, TITLE_IN.h - 12);
    const pcX = PREVIEW_COMP.x + 40, pcW = measure(c, TITLE1, { font: 'ui', size: 14, weight: 500 }) + 4;
    const pcK = measure(c, st.title, { font: 'ui', size: 14, weight: 500 });
    c.fillStyle = maskCols!.comp;
    c.fillRect(pcX + pcK, PREVIEW_COMP.y + 10, pcW - pcK + 4, PREVIEW_COMP.h - 20);
  }
  if (st.typed >= 0 && t < tTyped + 0.15 && Math.floor(t * 12) % 2 === 0) {
    const w = measure(c, st.title, { font: 'ui', size: 14 });
    c.fillStyle = K;
    c.fillRect(TITLE_IN.x + 12 + w + 1, TITLE_IN.y + 9, 1.5, 18);
  }
  // focus rings on the control being operated
  const ring = (r: { x: number; y: number; w: number; h: number }, a: number) => {
    if (a <= 0) return;
    c.strokeStyle = hexA(K, a);
    c.lineWidth = 1.5;
    rr(c, r.x - 1, r.y - 1, r.w + 2, r.h + 2, 7);
    c.stroke();
  };
  ring(TYPE_SEL, Math.max(dropdownOpen(t, tPick[0]), dropdownOpen(t, tPick[1]), seg(t, tPick[3] - 0.06, tPick[3]) * (1 - seg(t, tPick[3] + 0.06, tPick[3] + 0.12))));
  ring(VAR_SEL, dropdownOpen(t, tPick[2]));
  ring(TITLE_IN, seg(t, tType - 0.06, tType) * (1 - seg(t, tTyped + 0.1, tTyped + 0.2)));
  // dropdowns (over the card)
  for (const [i, tp] of [[0, tPick[0]], [1, tPick[1]]] as [number, number][]) {
    const o = dropdownOpen(t, tp);
    if (o > 0) popover(c, TYPE_SEL.x, TYPE_SEL.y + TYPE_SEL.h + 6, TYPE_SEL.w, OPTIONS, i === 0 ? 2 : 3, seg(t, tp - 0.05, tp + 0.01), o, 32);
  }
  const vo = dropdownOpen(t, tPick[2]);
  if (vo > 0) popover(c, VAR_SEL.x - 70, VAR_SEL.y + VAR_SEL.h + 6, 150, VAR_OPTS, 1, seg(t, tPick[2] - 0.04, tPick[2] + 0.01), vo, 30);
  c.restore();
}

// ── WithControl card: vector fallback ────────────────────────────────────────
function cardVector(c: CanvasRenderingContext2D, t: number, st: ReturnType<typeof stateAt>) {
  const slide = ease.outExpo(clamp((t - (T.sto - 0.1)) / 0.3));
  c.save();
  c.translate((1 - slide) * 300, 0);
  c.globalAlpha *= clamp(slide * 2);
  card(c, CARD.x, CARD.y, CARD.w, CARD.h, { r: 8, fill: FD.card });
  ui(c, 'Callout', CARD.x + 14, CARD.y + 24, 14, { weight: 500 });
  ui(c, st.variant, VAR_SEL.x, VAR_SEL.y + 17, 13, { color: FD.mutedFg });
  chevronDown(c, VAR_SEL.x + 56, VAR_SEL.y + 4, 16, FD.mutedFg);
  rr(c, CARD.x + 5, CARD.y + 33, CARD.w - 10, 104, 6);
  c.fillStyle = FD.bg;
  c.fill();
  callout(c, PREVIEW_COMP.x, PREVIEW_COMP.y, PREVIEW_COMP.w, st.type, st.title || ' ', '', 1);
  mono(c, 'Props', CARD.x + 30, CARD.y + 162, 13, { weight: 500 });
  rr(c, CARD.x + 5, CARD.y + 172, CARD.w - 10, 150, 8);
  c.strokeStyle = FD.border;
  c.stroke();
  mono(c, 'children', cx(556), cy(395), 13, { weight: 500 });
  mono(c, 'title', TITLE_IN.x, TITLE_IN.y - 9, 13, { weight: 500 });
  mono(c, 'type', TYPE_SEL.x, TYPE_SEL.y - 9, 13, { weight: 500 });
  for (const r of [{ x: cx(556), y: cy(404), w: 396, h: 36 }, TITLE_IN, TYPE_SEL]) {
    rr(c, r.x, r.y, r.w, r.h, 8);
    c.fillStyle = FD.secondary;
    c.fill();
  }
  ui(c, st.title, TITLE_IN.x + 12, TITLE_IN.y + 23, 14);
  xIcon(c, TITLE_IN.x + TITLE_IN.w + 8, TITLE_IN.y + 10, 14, FD.mutedFg);
  mono(c, `"${st.type}"`, TYPE_SEL.x + 12, TYPE_SEL.y + 24, 14);
  for (const [i, tp] of [[0, tPick[0]], [1, tPick[1]]] as [number, number][]) {
    const o = dropdownOpen(t, tp);
    if (o > 0) popover(c, TYPE_SEL.x, TYPE_SEL.y + TYPE_SEL.h + 6, TYPE_SEL.w, OPTIONS, i === 0 ? 2 : 3, seg(t, tp - 0.05, tp + 0.01), o, 32);
  }
  c.restore();
}

function link(c: CanvasRenderingContext2D, t: number, s: number) {
  const a = seg(t, T.sto + 0.1, T.sto + 0.3);
  if (a <= 0) return;
  c.save();
  c.globalAlpha *= a;
  c.setLineDash([5 / s, 6 / s]);
  c.lineDashOffset = t * 40;
  c.strokeStyle = hexA(A, 0.7);
  c.lineWidth = 1.8 / s;
  c.beginPath();
  c.moveTo(PREVIEW_COMP.x, PREVIEW_COMP.y + PREVIEW_COMP.h / 2);
  c.bezierCurveTo(PREVIEW_COMP.x - 90, PREVIEW_COMP.y + 23, COMP.x + COMP.w / 2 + 90, COMP.y - 20, COMP.x + COMP.w / 2 + 8, COMP.y - 20);
  c.stroke();
  c.setLineDash([]);
  text(c, 'STORY', CARD.x, CARD.y - 18, { font: 'wide', size: 13, tracking: 0.3, color: A });
  text(c, 'callout.story.tsx · <story.WithControl />', CARD.x + 92, CARD.y - 18, { font: 'mono', size: 12, color: hexA(A, 0.75) });
  brackets(c, CARD.x - 10, CARD.y - 10, CARD.w + 20, CARD.h + 20, 16, 2.4 / s, A);
  c.restore();
}

function drawAll(c: CanvasRenderingContext2D, x: StationCtx) {
  const t = x.t;
  if (t < T.sto - 0.3) {
    c.save();
    c.strokeStyle = hexA(K, 0.16);
    c.lineWidth = 1 / x.s;
    rr(c, CARD.x, CARD.y, CARD.w, CARD.h, 8);
    c.stroke();
    c.beginPath();
    c.ellipse(STAGE.x, STAGE.y, STAGE.rx, STAGE.ry, 0, 0, TAU);
    c.stroke();
    c.restore();
    return;
  }
  const st = stateAt(t);
  stage(c, t, st);
  link(c, t, x.s);
  if (hasStoryPlates()) cardPlate(c, t, st);
  else cardVector(c, t, st);
}

export const story: StationImpl = {
  route,
  xe,
  xx,
  tIn,
  tOut,
  out: { x: COMP.x - COMP.w / 2, y: COMP.y - 60, w: COMP.w, h: 46 * COMP.k },
  front: drawAll,
  drawOutput(c, x) {
    const st = stateAt(x.t);
    callout(c, COMP.x - COMP.w / 2, COMP.y - 60, COMP.w, st.type, st.title || ' ', '', COMP.k);
  },
};
