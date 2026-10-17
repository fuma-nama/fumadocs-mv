import { measure, setFont, text, type TextOpts } from '../../engine/draw2d';

/** Fumadocs dark (neutral) tokens — packages/base-ui/css/lib/default-colors.css (.dark). */
export const FD = {
  bg: '#121212',
  card: '#191919',
  popover: '#1E1E1E',
  secondary: '#212121',
  muted: '#212121',
  border: 'rgba(102,102,102,0.32)',
  fg: '#EBEBEB',
  mutedFg: 'rgba(179,179,179,0.8)',
  primary: '#FAFAFA',
  primaryFg: '#171717',
  accent: 'rgba(104,104,104,0.3)',
  info: '#2B7FFF',
  warning: '#FE9A00',
  error: '#FB2C36',
  success: '#00C950',
  idea: '#F87700',
} as const;

/** Method label colours (dark: text-*-400). */
export const METHOD: Record<string, string> = {
  GET: '#05DF72',
  POST: '#51A2FF',
  PUT: '#FDC700',
  PATCH: '#FF8904',
  DELETE: '#FF6467',
};

/** github-dark token colours (Shiki default dark theme in Fumadocs). */
export const SYN = {
  plain: '#E1E4E8',
  key: '#85E89D',
  str: '#9ECBFF',
  num: '#79B8FF',
  kw: '#F97583',
  fn: '#B392F0',
  param: '#FFAB70',
  com: '#6A737D',
  punct: '#E1E4E8',
} as const;

export type Tok = [string, string];

export function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

/** Card: fill + 1 px border (in local px; `lw` keeps hairlines crisp under zoom). */
export function card(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o: { r?: number; fill?: string; stroke?: string; lw?: number } = {}) {
  rr(c, x, y, w, h, o.r ?? 14);
  c.fillStyle = o.fill ?? FD.card;
  c.fill();
  if (o.stroke !== 'none') {
    c.lineWidth = o.lw ?? 1;
    c.strokeStyle = o.stroke ?? FD.border;
    c.stroke();
  }
}

export function ui(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, o: Partial<TextOpts> = {}) {
  return text(c, s, x, y, { font: 'ui', size, weight: 400, color: FD.fg, ...o });
}

export function mono(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, o: Partial<TextOpts> = {}) {
  return text(c, s, x, y, { font: 'mono', size, weight: 400, color: FD.fg, ...o });
}

/** One line of syntax tokens; returns end x. `chars` limits visible characters (typing). */
export function toks(c: CanvasRenderingContext2D, line: Tok[], x: number, y: number, size: number, font: 'mono' | 'code' = 'code', chars = Infinity) {
  setFont(c, { font, size });
  let cx = x;
  let left = chars;
  for (const [s, col] of line) {
    if (left <= 0) break;
    const part = s.slice(0, Math.max(0, left));
    left -= s.length;
    c.fillStyle = col;
    c.fillText(part, cx, y);
    cx += c.measureText(part).width;
  }
  return cx;
}

export const lineLen = (line: Tok[]) => line.reduce((n, [s]) => n + s.length, 0);

/** Skeleton placeholder bar (before content is generated). */
export function skel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a = 1) {
  rr(c, x, y, w, h, h / 2);
  c.fillStyle = `rgba(255,255,255,${0.07 * a})`;
  c.fill();
}

// ── icons (lucide-like, 24-unit box) ────────────────────────────────────────
function icon(c: CanvasRenderingContext2D, x: number, y: number, size: number, col: string, lw: number, draw: (c: CanvasRenderingContext2D) => void) {
  c.save();
  c.translate(x, y);
  c.scale(size / 24, size / 24);
  c.lineWidth = lw * (24 / size) * (size / 24) * 2;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = col;
  c.fillStyle = col;
  draw(c);
  c.restore();
}

/** Solid callout icon: coloured shape, inner strokes in the card colour (Fumadocs Callout). */
export function calloutIcon(c: CanvasRenderingContext2D, type: string, x: number, y: number, size: number) {
  const col = calloutColor(type);
  icon(c, x, y, size, col, 1, (c) => {
    c.lineWidth = 2;
    if (type === 'warning') {
      c.beginPath();
      c.moveTo(12, 2.5);
      c.lineTo(22.5, 20.5);
      c.lineTo(1.5, 20.5);
      c.closePath();
      c.lineJoin = 'round';
      c.fill();
      c.stroke();
      c.strokeStyle = FD.card;
      c.beginPath();
      c.moveTo(12, 9);
      c.lineTo(12, 13.5);
      c.moveTo(12, 17);
      c.lineTo(12.01, 17);
      c.stroke();
    } else {
      c.beginPath();
      c.arc(12, 12, 10, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = FD.card;
      c.beginPath();
      if (type === 'error') {
        c.moveTo(15, 9);
        c.lineTo(9, 15);
        c.moveTo(9, 9);
        c.lineTo(15, 15);
      } else if (type === 'success') {
        c.moveTo(8, 12);
        c.lineTo(11, 15);
        c.lineTo(16, 9.5);
      } else {
        c.moveTo(12, 16);
        c.lineTo(12, 12);
        c.moveTo(12, 8);
        c.lineTo(12.01, 8);
      }
      c.stroke();
    }
  });
}

export function calloutColor(type: string) {
  return type === 'warning' || type === 'warn' ? FD.warning : type === 'error' ? FD.error : type === 'success' ? FD.success : type === 'idea' ? FD.idea : type === 'note' ? 'rgba(179,179,179,0.6)' : FD.info;
}

/** Fumadocs Callout: neutral card, thin coloured left bar, solid icon, title + muted body. */
export function callout(c: CanvasRenderingContext2D, x: number, y: number, w: number, type: string, title: string, body: string, k = 1, o: { shadow?: boolean } = {}) {
  const h = (body ? 74 : 46) * k;
  if (o.shadow) {
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.5)';
    c.shadowBlur = 18 * k;
    c.shadowOffsetY = 6 * k;
    card(c, x, y, w, h, { r: 12 * k });
    c.restore();
  }
  card(c, x, y, w, h, { r: 12 * k });
  rr(c, x + 5 * k, y + 10 * k, 2 * k, h - 20 * k, 1 * k);
  c.fillStyle = calloutColor(type) + '80';
  c.fill();
  if (type !== 'note') calloutIcon(c, type, x + 14 * k, y + 13 * k, 20 * k);
  const tx = x + (type !== 'note' ? 42 : 18) * k;
  ui(c, title, tx, y + 29 * k, 14 * k, { weight: 500 });
  if (body) ui(c, body, tx, y + 54 * k, 14 * k, { color: FD.mutedFg });
  return h;
}

export function sendIcon(c: CanvasRenderingContext2D, x: number, y: number, size: number, col: string) {
  icon(c, x, y, size, col, 1, (c) => {
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(3.7, 3.7);
    c.lineTo(21, 12);
    c.lineTo(3.7, 20.3);
    c.lineTo(6, 12);
    c.closePath();
    c.moveTo(6, 12);
    c.lineTo(12, 12);
    c.stroke();
  });
}

export function playIcon(c: CanvasRenderingContext2D, x: number, y: number, size: number, col: string) {
  icon(c, x, y, size, col, 1, (c) => {
    c.beginPath();
    c.moveTo(6, 3.5);
    c.lineTo(20, 12);
    c.lineTo(6, 20.5);
    c.closePath();
    c.fill();
  });
}

export function chevronDown(c: CanvasRenderingContext2D, x: number, y: number, size: number, col: string) {
  icon(c, x, y, size, col, 1, (c) => {
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(6, 9);
    c.lineTo(12, 15);
    c.lineTo(18, 9);
    c.stroke();
  });
}

export function xIcon(c: CanvasRenderingContext2D, x: number, y: number, size: number, col: string) {
  icon(c, x, y, size, col, 1, (c) => {
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(18, 6);
    c.lineTo(6, 18);
    c.moveTo(6, 6);
    c.lineTo(18, 18);
    c.stroke();
  });
}

export function fileIcon(c: CanvasRenderingContext2D, x: number, y: number, size: number, col: string) {
  icon(c, x, y, size, col, 1, (c) => {
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(14, 2);
    c.lineTo(6, 2);
    c.quadraticCurveTo(4, 2, 4, 4);
    c.lineTo(4, 20);
    c.quadraticCurveTo(4, 22, 6, 22);
    c.lineTo(18, 22);
    c.quadraticCurveTo(20, 22, 20, 20);
    c.lineTo(20, 8);
    c.closePath();
    c.moveTo(14, 2);
    c.lineTo(14, 8);
    c.lineTo(20, 8);
    c.stroke();
  });
}

/** Primary (filled) or secondary button; returns its width. */
export function button(c: CanvasRenderingContext2D, label: string, x: number, y: number, h: number, o: { primary?: boolean; icon?: 'send' | 'play'; kbd?: string; size?: number; press?: number } = {}) {
  const size = o.size ?? h * 0.42;
  const tw = measure(c, label, { font: 'ui', size, weight: 500 });
  const iw = o.icon ? size * 1.1 + size * 0.5 : 0;
  const kw = o.kbd ? measure(c, o.kbd, { font: 'mono', size: size * 0.8 }) + size * 1.1 : 0;
  const w = tw + iw + kw + h * 0.7;
  const press = o.press ?? 0;
  c.save();
  if (press > 0) {
    c.translate(x + w / 2, y + h / 2);
    c.scale(1 - 0.06 * press, 1 - 0.06 * press);
    c.translate(-(x + w / 2), -(y + h / 2));
  }
  rr(c, x, y, w, h, h * 0.24);
  c.fillStyle = o.primary ? FD.primary : FD.secondary;
  c.fill();
  if (!o.primary) {
    c.lineWidth = 1;
    c.strokeStyle = FD.border;
    c.stroke();
  }
  const fg = o.primary ? FD.primaryFg : FD.fg;
  let cx = x + h * 0.35;
  if (o.icon === 'send') sendIcon(c, cx, y + h / 2 - size * 0.55, size * 1.1, fg);
  if (o.icon === 'play') playIcon(c, cx, y + h / 2 - size * 0.55, size * 1.1, fg);
  cx += iw;
  ui(c, label, cx, y + h / 2 + size * 0.36, size, { weight: 500, color: fg });
  if (o.kbd) {
    cx += tw + size * 0.5;
    rr(c, cx, y + h * 0.2, kw - size * 0.4, h * 0.6, 4);
    c.fillStyle = o.primary ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
    c.fill();
    mono(c, o.kbd, cx + size * 0.3, y + h / 2 + size * 0.3, size * 0.8, { color: o.primary ? 'rgba(23,23,23,0.6)' : FD.mutedFg });
  }
  c.restore();
  return w;
}

/** Lit-screen treatment, part 1 (draw BEFORE the panel): white backlight spilling onto the wall. */
export function backlight(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, k = 1) {
  c.save();
  c.shadowColor = `rgba(255,255,255,${0.55 * k})`;
  c.shadowBlur = 70;
  rr(c, x, y, w, h, r);
  c.fillStyle = FD.bg;
  c.fill();
  c.restore();
}

/** Lit-screen treatment, part 2 (draw AFTER the panel content): glass sheen + bright rim. */
export function screenGlass(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, k = 1, lw = 1.5) {
  c.save();
  rr(c, x, y, w, h, r);
  c.clip();
  const g = c.createLinearGradient(x, y, x + w * 0.35, y + h);
  g.addColorStop(0, `rgba(255,255,255,${0.1 * k})`);
  g.addColorStop(0.42, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  c.restore();
  c.save();
  rr(c, x, y, w, h, r);
  c.lineWidth = lw;
  c.strokeStyle = `rgba(255,255,255,${0.5 * k})`;
  c.stroke();
  c.restore();
}
