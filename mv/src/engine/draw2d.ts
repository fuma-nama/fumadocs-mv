import * as THREE from 'three';
import { assetUrl } from './url';
import { TAU, hash } from './anim';

// ── fonts ───────────────────────────────────────────────────────────────────
const FONT_FILES: [family: string, file: string, desc: FontFaceDescriptors][] = [
  ['Archivo', 'Archivo-VF.ttf', { weight: '100 900', stretch: '62% 125%' }],
  ['JetBrains Mono', 'JetBrainsMono-VF.ttf', { weight: '100 800' }],
  ['Geist', 'Geist-VF.ttf', { weight: '100 900' }],
  ['Geist Mono', 'GeistMono-VF.ttf', { weight: '100 900' }],
  ['Noto Sans JP', 'NotoSansJP-VF.ttf', { weight: '100 900' }],
  ['Noto Serif JP', 'NotoSerifJP-VF.ttf', { weight: '200 900' }],
  ['DotGothic16', 'DotGothic16-Regular.ttf', {}],
  ['Dela Gothic One', 'DelaGothicOne-Regular.ttf', {}],
  ['Michroma', 'Michroma-Regular.ttf', {}],
  ['Zen Kaku Gothic New', 'ZenKakuGothicNew-Medium.ttf', { weight: '500' }],
  ['Zen Kaku Gothic New', 'ZenKakuGothicNew-Bold.ttf', { weight: '700' }],
  ['Zen Kaku Gothic New', 'ZenKakuGothicNew-Black.ttf', { weight: '900' }],
];

/** Font stacks by role. Latin-first stacks fall back to Japanese faces for kana/kanji. */
export const FONTS = {
  display: '"Archivo", "Noto Sans JP", sans-serif',
  ui: '"Geist", "Noto Sans JP", sans-serif',
  mono: '"Geist Mono", "JetBrains Mono", "Noto Sans JP", monospace',
  code: '"JetBrains Mono", "Noto Sans JP", monospace',
  wide: '"Michroma", "Archivo", sans-serif',
  jp: '"Noto Sans JP", sans-serif',
  jpKaku: '"Zen Kaku Gothic New", "Noto Sans JP", sans-serif',
  jpSerif: '"Noto Serif JP", serif',
  jpBlack: '"Dela Gothic One", "Noto Sans JP", sans-serif',
  pixel: '"DotGothic16", monospace',
} as const;
export type FontRole = keyof typeof FONTS;

export async function loadFonts(base = '/assets/fonts/') {
  await Promise.all(
    FONT_FILES.map(async ([family, file, desc]) => {
      const f = new FontFace(family, `url(${assetUrl(base + file)})`, desc);
      await f.load();
      document.fonts.add(f);
    }),
  );
  // Warm up glyph caches for every face so the first real frame doesn't race the rasterizer.
  const c = document.createElement('canvas').getContext('2d')!;
  for (const role of Object.values(FONTS)) {
    c.font = `400 20px ${role}`;
    c.fillText('Aaあ漢ア0', 0, 20);
  }
  await document.fonts.ready;
}

// ── 2D layer (canvas → texture) ─────────────────────────────────────────────
export class Layer2D {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;

  /** w/h in design units (1920×1080 space); the backing canvas is w·scale × h·scale px. */
  constructor(
    public readonly w: number,
    public readonly h: number,
    public readonly scale = 1,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * scale);
    this.canvas.height = Math.round(h * scale);
    this.ctx = this.canvas.getContext('2d', { alpha: true })!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.premultiplyAlpha = true;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
  }

  /** Reset transform/state and clear (transparent, or fill with `bg`). */
  begin(bg?: string): CanvasRenderingContext2D {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.filter = 'none';
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (bg) {
      c.fillStyle = bg;
      c.fillRect(0, 0, this.w, this.h);
    }
    return c;
  }

  end(): THREE.Texture {
    this.texture.needsUpdate = true;
    if (this._tex3d) this._tex3d.needsUpdate = true;
    return this.texture;
  }

  private _tex3d?: THREE.CanvasTexture;
  /**
   * The same canvas as a texture for three.js materials (map of a mesh in a 3D scene):
   * sRGB-tagged, straight alpha, mipmapped. Use with `transparent: true` materials.
   */
  get texture3d(): THREE.CanvasTexture {
    if (!this._tex3d) {
      const t = new THREE.CanvasTexture(this.canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.premultiplyAlpha = false;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = 16;
      this._tex3d = t;
    }
    return this._tex3d;
  }
}

// ── text ────────────────────────────────────────────────────────────────────
export interface TextOpts {
  font?: FontRole;
  size: number;
  weight?: number;
  /** font-stretch keyword for Archivo: 'extra-condensed'(62) 'condensed'(75) 'semi-condensed' 'normal' 'semi-expanded' 'expanded'(125) */
  stretch?: CanvasFontStretch;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** letter spacing in em */
  tracking?: number;
  alpha?: number;
  stroke?: { color: string; width: number };
  italic?: boolean;
}

export function setFont(c: CanvasRenderingContext2D, o: TextOpts) {
  c.font = `${o.italic ? 'italic ' : ''}${o.weight ?? 400} ${o.size}px ${FONTS[o.font ?? 'display']}`;
  c.fontStretch = o.stretch ?? 'normal';
  c.letterSpacing = `${(o.tracking ?? 0) * o.size}px`;
  c.textAlign = o.align ?? 'left';
  c.textBaseline = o.baseline ?? 'alphabetic';
}

/** Draw a single-line string. Returns its advance width (including tracking). */
export function text(c: CanvasRenderingContext2D, str: string, x: number, y: number, o: TextOpts): number {
  c.save();
  setFont(c, o);
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  if (o.stroke) {
    c.lineJoin = 'round';
    c.strokeStyle = o.stroke.color;
    c.lineWidth = o.stroke.width;
    c.strokeText(str, x, y);
  }
  if (o.color !== 'none') {
    c.fillStyle = o.color ?? '#fff';
    c.fillText(str, x, y);
  }
  const w = c.measureText(str).width;
  c.restore();
  return w;
}

export function measure(c: CanvasRenderingContext2D, str: string, o: TextOpts): number {
  c.save();
  setFont(c, o);
  const w = c.measureText(str).width;
  c.restore();
  return w;
}

export interface Glyph {
  ch: string;
  i: number;
  x: number; // left edge offset from the line start
  w: number;
}

/** Kerning-aware per-glyph layout for per-character animation. x is relative to the line's left edge. */
export function glyphs(c: CanvasRenderingContext2D, str: string, o: TextOpts): { glyphs: Glyph[]; width: number } {
  c.save();
  setFont(c, { ...o, align: 'left' });
  const chars = [...str];
  const out: Glyph[] = [];
  let prefix = '';
  for (let i = 0; i < chars.length; i++) {
    const x = c.measureText(prefix).width;
    prefix += chars[i];
    const w = c.measureText(prefix).width - x;
    out.push({ ch: chars[i], i, x, w });
  }
  const width = c.measureText(str).width;
  c.restore();
  return { glyphs: out, width };
}

const ROTATE_V = new Set([...'ー〜～…‥―─-–—()（）「」『』[]【】〈〉《》<>:;=~|_']);
const SMALL_V = new Set([...'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ']);
const PUNCT_V = new Set([...'、。，．,.']);

/** Vertical Japanese text (top → bottom) centred on x, starting at y. Latin letters are rotated. */
export function textV(c: CanvasRenderingContext2D, str: string, x: number, y: number, o: TextOpts & { lineGap?: number }): number {
  c.save();
  setFont(c, { ...o, align: 'center', baseline: 'middle', tracking: 0 });
  c.fillStyle = o.color ?? '#fff';
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  const step = o.size * (1 + (o.tracking ?? 0));
  let cy = y + o.size / 2;
  for (const ch of str) {
    c.save();
    c.translate(x, cy);
    const latin = /[A-Za-z0-9]/.test(ch);
    if (ROTATE_V.has(ch) || latin) c.rotate(Math.PI / 2);
    if (SMALL_V.has(ch)) c.translate(o.size * 0.1, -o.size * 0.1);
    if (PUNCT_V.has(ch)) c.translate(o.size * 0.55, -o.size * 0.55);
    if (o.stroke) {
      c.strokeStyle = o.stroke.color;
      c.lineWidth = o.stroke.width;
      c.lineJoin = 'round';
      c.strokeText(ch, 0, 0);
    }
    c.fillText(ch, 0, 0);
    c.restore();
    cy += latin ? c.measureText(ch).width + o.size * (o.tracking ?? 0) : step;
  }
  c.restore();
  return cy - y - o.size / 2;
}

/** Glyphs placed along a circle (clockwise from angle a0, radians, 0 = 3 o'clock). */
export function textArc(c: CanvasRenderingContext2D, str: string, cx: number, cy: number, r: number, a0: number, o: TextOpts & { inward?: boolean }) {
  const { glyphs: gs } = glyphs(c, str, o);
  c.save();
  setFont(c, { ...o, align: 'center', baseline: 'middle', tracking: 0 });
  c.fillStyle = o.color ?? '#fff';
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  for (const g of gs) {
    const a = a0 + (g.x + g.w / 2) / r;
    c.save();
    c.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    c.rotate(a + (o.inward ? -Math.PI / 2 : Math.PI / 2));
    c.fillText(g.ch, 0, 0);
    c.restore();
  }
  c.restore();
}

// ── shapes / HUD vocabulary ─────────────────────────────────────────────────
type Ctx = CanvasRenderingContext2D;

export function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, lw = 1, color = '#fff') {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.lineWidth = lw;
  c.strokeStyle = color;
  c.stroke();
}

/** Partially drawn line, p in 0..1 (for draw-on animations). */
export function lineP(c: Ctx, x0: number, y0: number, x1: number, y1: number, p: number, lw = 1, color = '#fff') {
  if (p <= 0) return;
  line(c, x0, y0, x0 + (x1 - x0) * p, y0 + (y1 - y0) * p, lw, color);
}

export function rect(c: Ctx, x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; lw?: number; r?: number }) {
  c.beginPath();
  if (o.r) c.roundRect(x, y, w, h, o.r);
  else c.rect(x, y, w, h);
  if (o.fill) {
    c.fillStyle = o.fill;
    c.fill();
  }
  if (o.stroke) {
    c.lineWidth = o.lw ?? 1;
    c.strokeStyle = o.stroke;
    c.stroke();
  }
}

/** Rectangle outline drawn on progressively (perimeter fraction p). */
export function rectP(c: Ctx, x: number, y: number, w: number, h: number, p: number, lw = 1, color = '#fff') {
  if (p <= 0) return;
  const per = 2 * (w + h);
  let rem = per * Math.min(1, p);
  const pts: [number, number][] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
  c.beginPath();
  c.moveTo(x, y);
  for (let i = 1; i < pts.length && rem > 0; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    const k = Math.min(1, rem / len);
    c.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k);
    rem -= len;
  }
  c.lineWidth = lw;
  c.strokeStyle = color;
  c.stroke();
}

/** Corner brackets around a rect. */
export function brackets(c: Ctx, x: number, y: number, w: number, h: number, len = 14, lw = 1.5, color = '#fff') {
  c.beginPath();
  c.moveTo(x, y + len);
  c.lineTo(x, y);
  c.lineTo(x + len, y);
  c.moveTo(x + w - len, y);
  c.lineTo(x + w, y);
  c.lineTo(x + w, y + len);
  c.moveTo(x + w, y + h - len);
  c.lineTo(x + w, y + h);
  c.lineTo(x + w - len, y + h);
  c.moveTo(x + len, y + h);
  c.lineTo(x, y + h);
  c.lineTo(x, y + h - len);
  c.lineWidth = lw;
  c.strokeStyle = color;
  c.stroke();
}

/** Thin boxed, tracked uppercase label — the "CONVICTION" device. Returns the box rect. */
export function boxLabel(c: Ctx, str: string, x: number, y: number, o: Partial<TextOpts> & { padX?: number; padY?: number; lw?: number; align?: 'left' | 'center' | 'right'; ticks?: boolean; fillBox?: string } = {}) {
  const size = o.size ?? 14;
  const to: TextOpts = { font: o.font ?? 'wide', size, weight: o.weight ?? 400, tracking: o.tracking ?? 0.3, color: o.color ?? '#fff', baseline: 'middle' };
  const tw = measure(c, str, to) - size * (to.tracking ?? 0); // drop trailing tracking
  const padX = o.padX ?? size * 1.2;
  const padY = o.padY ?? size * 0.75;
  const bw = tw + padX * 2;
  const bh = size + padY * 2;
  const bx = o.align === 'center' ? x - bw / 2 : o.align === 'right' ? x - bw : x;
  const by = y - bh / 2;
  if (o.fillBox) rect(c, bx, by, bw, bh, { fill: o.fillBox });
  rect(c, bx, by, bw, bh, { stroke: to.color, lw: o.lw ?? 1 });
  if (o.ticks) {
    line(c, bx - size * 0.8, y, bx - size * 0.2, y, o.lw ?? 1, to.color);
    line(c, bx + bw + size * 0.2, y, bx + bw + size * 0.8, y, o.lw ?? 1, to.color);
  }
  text(c, str, bx + padX, y + size * 0.04, to);
  return { x: bx, y: by, w: bw, h: bh };
}

export function crosshair(c: Ctx, x: number, y: number, r = 10, lw = 1, color = '#fff', gap = 0) {
  c.beginPath();
  c.moveTo(x - r, y);
  c.lineTo(x - gap, y);
  c.moveTo(x + gap, y);
  c.lineTo(x + r, y);
  c.moveTo(x, y - r);
  c.lineTo(x, y - gap);
  c.moveTo(x, y + gap);
  c.lineTo(x, y + r);
  c.lineWidth = lw;
  c.strokeStyle = color;
  c.stroke();
}

/** Four-point concave sparkle star. */
export function sparkle(c: Ctx, x: number, y: number, r: number, color = '#fff', pinch = 0.18) {
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4 - Math.PI / 2;
    const b = a + TAU / 8;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    const qx = x + Math.cos(b) * r * pinch;
    const qy = y + Math.sin(b) * r * pinch;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
    c.lineTo(qx, qy);
  }
  c.closePath();
  c.fillStyle = color;
  c.fill();
}

export function diamond(c: Ctx, x: number, y: number, r: number, o: { fill?: string; stroke?: string; lw?: number }) {
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + r, y);
  c.lineTo(x, y + r);
  c.lineTo(x - r, y);
  c.closePath();
  if (o.fill) {
    c.fillStyle = o.fill;
    c.fill();
  }
  if (o.stroke) {
    c.lineWidth = o.lw ?? 1;
    c.strokeStyle = o.stroke;
    c.stroke();
  }
}

export function ring(c: Ctx, x: number, y: number, r: number, lw = 1, color = '#fff', a0 = 0, a1 = TAU) {
  c.beginPath();
  c.arc(x, y, r, a0, a1);
  c.lineWidth = lw;
  c.strokeStyle = color;
  c.stroke();
}

export function dashedRing(c: Ctx, x: number, y: number, r: number, dash: number, gap: number, lw = 1, color = '#fff', rot = 0) {
  c.save();
  c.setLineDash([dash, gap]);
  c.lineDashOffset = -rot * r;
  ring(c, x, y, r, lw, color);
  c.restore();
}

/** Clock-like radial tick marks. */
export function ticksRing(c: Ctx, x: number, y: number, r: number, n: number, len: number, lw = 1, color = '#fff', rot = 0, majorEvery = 0, majorLen = len * 2) {
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const l = majorEvery && i % majorEvery === 0 ? majorLen : len;
    c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    c.lineTo(x + Math.cos(a) * (r - l), y + Math.sin(a) * (r - l));
  }
  c.lineWidth = lw;
  c.strokeStyle = color;
  c.stroke();
}

export function grid(c: Ctx, x: number, y: number, w: number, h: number, step: number, lw = 1, color = '#fff', ox = 0, oy = 0) {
  c.beginPath();
  for (let gx = x + (((ox % step) + step) % step); gx <= x + w; gx += step) {
    c.moveTo(gx, y);
    c.lineTo(gx, y + h);
  }
  for (let gy = y + (((oy % step) + step) % step); gy <= y + h; gy += step) {
    c.moveTo(x, gy);
    c.lineTo(x + w, gy);
  }
  c.lineWidth = lw;
  c.strokeStyle = color;
  c.stroke();
}

/** Diagonal stripes clipped to a rect. angle in degrees, period/duty in px/fraction. */
export function stripes(c: Ctx, x: number, y: number, w: number, h: number, o: { angle?: number; period?: number; duty?: number; color?: string; phase?: number }) {
  const angle = ((o.angle ?? 45) * Math.PI) / 180;
  const period = o.period ?? 24;
  const width = period * (o.duty ?? 0.5);
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.translate(x + w / 2, y + h / 2);
  c.rotate(angle);
  const R = Math.hypot(w, h) / 2 + period;
  c.fillStyle = o.color ?? '#fff';
  const ph = (((o.phase ?? 0) % period) + period) % period;
  for (let s = -R - period + ph; s < R; s += period) c.fillRect(s, -R, width, R * 2);
  c.restore();
}

/** Small percentage tag "37.1682%" in a box (P1PE annotation style). */
export function pctTag(c: Ctx, x: number, y: number, value: number, o: { color?: string; bg?: string; size?: number } = {}) {
  const size = o.size ?? 12;
  const s = `${value.toFixed(4)}%`;
  const to: TextOpts = { font: 'mono', size, color: o.color ?? '#111', baseline: 'middle' };
  const w = measure(c, s, to) + size * 0.8;
  rect(c, x, y - size * 0.75, w, size * 1.5, { fill: o.bg ?? '#fff', stroke: o.color ?? '#111', lw: 1 });
  text(c, s, x + size * 0.4, y + 1, to);
  return w;
}

/** Deterministic barcode. */
export function barcode(c: Ctx, x: number, y: number, w: number, h: number, seed = 1, color = '#fff') {
  c.fillStyle = color;
  let px = x;
  let i = 0;
  while (px < x + w) {
    const bw = 1 + Math.floor(hash(seed, i) * 4);
    if (hash(seed, i, 7) > 0.45) c.fillRect(px, y, Math.min(bw, x + w - px), h);
    px += bw + 1;
    i++;
  }
}

/** Draw an image to cover/contain a rect. */
export function drawImageFit(c: Ctx, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, mode: 'cover' | 'contain' = 'cover', ax = 0.5, ay = 0.5) {
  const s = mode === 'cover' ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  c.drawImage(img, x + (w - dw) * ax, y + (h - dh) * ay, dw, dh);
}
