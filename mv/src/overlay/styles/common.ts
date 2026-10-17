import { clamp } from '../../engine/anim';
import { textWidth, type FontSpec, type TypesetOpts, fontStr } from '../jp';
import { lyricLines, slotOf } from '../state';
import type { LineTiming } from '../timing';
import type { PlacedGlyph } from '../jp';

export const INK = '#0A0A0B';
export const PAPER = '#EEECE4';
export const ORANGE = '#FA8023';

export interface Palette {
  /** main text colour ('#FFFFFF' in the overlay's adaptive mono layer) */
  ink: string;
  /** background-ish colour (single-canvas halos) */
  bg: string;
  /** highlight colour */
  accent: string;
  tone: 'dark' | 'light';
}

export interface RenderOpts {
  /** anchor override (style-specific meaning, see DrawLyricOpts) */
  anchor?: [number, number];
  scale?: number;
  alpha?: number;
  pal: Palette;
  /** 0..1 canvas halo (single-canvas mode only) */
  halo?: number;
  /** colour layer for fixed-colour accents; when absent everything is drawn on the main context */
  cc?: CanvasRenderingContext2D;
  /** plate layer: backing shapes drawn in white, composited as frosted glass tinted opposite to the text */
  pc?: CanvasRenderingContext2D;
  /** 0..1 automatic backing strength (clutter under the text) */
  plate?: number;
  /** plate fill colour (follows the luminance under the text, so it never flips abruptly) */
  plateColor?: string;
}

export type StyleFn = (c: CanvasRenderingContext2D, L: LineTiming, t: number, o: RenderOpts) => void;

export function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a)})`;
}

const MONO = new Set([INK, PAPER, '#FFFFFF', '#000000', '#FFF', '#000', '#0A0A0B', '#FAFAF7']);
/** Accents that are just black/white follow the adaptive text colour instead of a fixed colour. */
export const isMonoColor = (c: string) => MONO.has(c.toUpperCase());

/** Context + colour for accent marks: the colour layer for real colours, the text layer for mono accents. */
export function accentCtx(c: CanvasRenderingContext2D, o: RenderOpts): [CanvasRenderingContext2D, string] {
  if (isMonoColor(o.pal.accent)) return [c, o.pal.ink];
  return [o.cc ?? c, o.pal.accent];
}

export interface LineWindow {
  a: number;
  b: number;
}

/** Visible window of a take (see slotOf in state.ts: beat-snapped, clipped, capped). */
export function lineWindow(L: LineTiming): LineWindow {
  const lines = lyricLines();
  const i = lines.indexOf(L);
  const [a, b] = i >= 0 ? slotOf(lines, i) : [L.t0 - 0.35, L.t1 + 1.1];
  return { a, b };
}

export function withHalo(c: CanvasRenderingContext2D, color: string, amt: number, blur: number) {
  if (amt <= 0.01) {
    c.shadowColor = 'transparent';
    c.shadowBlur = 0;
    return;
  }
  c.shadowColor = rgba(color, 0.85 * amt);
  c.shadowBlur = blur;
  c.shadowOffsetX = 0;
  c.shadowOffsetY = 0;
}

export function textAt(c: CanvasRenderingContext2D, s: string, x: number, y: number, font: FontSpec, o: { color: string; alpha?: number; tracking?: number; align?: CanvasTextAlign; upper?: boolean }) {
  if ((o.alpha ?? 1) <= 0.002) return 0;
  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  c.font = fontStr(font);
  c.fontStretch = font.stretch ?? 'normal';
  c.letterSpacing = `${(o.tracking ?? 0) * font.size}px`;
  c.textAlign = o.align ?? 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = o.color;
  const str = o.upper ? s.toUpperCase() : s;
  // letterSpacing adds trailing space after the last glyph; compensate for right/centre alignment
  const trail = (o.tracking ?? 0) * font.size;
  const dx = o.align === 'right' ? trail : o.align === 'center' ? trail / 2 : 0;
  c.fillText(str, x + dx, y);
  const w = c.measureText(str).width - trail;
  c.restore();
  return w;
}

export const EN_FONT = (size: number, weight = 500): FontSpec => ({ role: 'display', weight, size, stretch: 'semi-expanded' });

/** English translation line (uppercase, tracked Archivo). */
export function english(c: CanvasRenderingContext2D, L: LineTiming, x: number, y: number, size: number, color: string, alpha: number, align: CanvasTextAlign, o: { font?: FontSpec; tracking?: number; upper?: boolean } = {}) {
  return textAt(c, L.english, x, y, o.font ?? EN_FONT(size), { color, alpha, tracking: o.tracking ?? 0.14, align, upper: o.upper ?? true });
}

export function englishWidth(L: LineTiming, font: FontSpec, tracking: number) {
  return textWidth(font, L.english.toUpperCase(), tracking) - tracking * font.size;
}

export function scaled(o: TypesetOpts, k: number): TypesetOpts {
  if (k === 1) return o;
  const sc = (f: FontSpec): FontSpec => ({ ...f, size: Math.round(f.size * k * 2) / 2 });
  return { ...o, font: sc(o.font), latin: o.latin && sc(o.latin), ruby: o.ruby && { font: sc(o.ruby.font), gap: o.ruby.gap * k } };
}

/** Glyph reveal time (kanji: onset of its first mora). */
export function revealT(L: LineTiming, g: PlacedGlyph): number {
  if (g.ci >= 0) return L.chars[g.ci].t;
  return L.morae[g.morae[0]]?.t ?? L.t0;
}

/** Index of the latest mora with onset <= t (-1 before the first). */
export function moraIndex(L: LineTiming, t: number): number {
  let idx = -1;
  for (let i = 0; i < L.morae.length; i++) if (L.morae[i].t <= t + 1e-9) idx = i;
  return idx;
}

/** Cut a round hole into the text layer (so an accent dot on the colour layer underneath shows cleanly). */
export function punch(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.save();
  c.globalCompositeOperation = 'destination-out';
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = '#000';
  c.fill();
  c.restore();
}

/** Feathered rounded backing rect on the plate layer (alpha = strength, frosted underneath). */
export function plateRect(pc: CanvasRenderingContext2D | undefined, x0: number, y0: number, x1: number, y1: number, alpha: number, r = 10, feather = 10, color = '#808080') {
  if (!pc || alpha <= 0.01 || x1 <= x0 || y1 <= y0) return;
  pc.save();
  pc.globalAlpha = Math.min(1, alpha);
  if (feather > 0) pc.filter = `blur(${feather}px)`;
  pc.beginPath();
  pc.roundRect(x0, y0, x1 - x0, y1 - y0, r);
  pc.fillStyle = color;
  pc.fill();
  pc.restore();
}

/**
 * INK → PAPER by the luminance under a block (continuous, so plates never flip in one frame),
 * biased by the scene's tone so the plate always supports the tone-biased text colour
 * (dark scenes keep dark plates over bright patches, light scenes keep light ones).
 */
export function plateColorFor(luma: number, tone?: 'dark' | 'light'): string {
  const [a0, a1] = tone === 'dark' ? [0.6, 0.92] : tone === 'light' ? [0.08, 0.4] : [0.3, 0.7];
  const k = Math.min(1, Math.max(0, (luma - a0) / (a1 - a0)));
  const s = k * k * (3 - 2 * k);
  const a = [0x0a, 0x0a, 0x0b];
  const b = [0xee, 0xec, 0xe4];
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * s).toString(16).padStart(2, '0')).join('');
}

/** sRGB luma (0..1) of a #rrggbb colour (other CSS colours → 0.5). */
export function lumaOfHex(hex: string): number {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return 0.5;
  const n = parseInt(h, 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
