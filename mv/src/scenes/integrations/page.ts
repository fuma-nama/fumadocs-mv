import { clamp } from '../../engine/anim';
import { callout, card, FD, mono, rr, toks, type Tok, ui } from './ui';

/** Blocks of a rendered Fumadocs article (dark). */
export type Block =
  | { k: 'h1'; text: string }
  | { k: 'h2'; text: string }
  | { k: 'p'; parts: (string | { link: string })[] }
  | { k: 'callout'; type: string; title: string; body: string }
  | { k: 'code'; title?: string; lines: Tok[][] }
  | { k: 'img'; caption: string; hue: number }
  | { k: 'cards'; items: [string, string][] };

export interface PageOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  sidebar?: { items: { label: string; depth?: number; folder?: boolean }[]; active: number; title: string };
  toc?: { items: string[]; active: number };
  blocks: Block[];
  /** per-block reveal 0..1 (undefined = shown) */
  reveal?: (i: number) => number;
  /** per-block highlight 0..1 (key-colour flash) */
  flash?: (i: number) => number;
  key: string;
  k?: number;
}

export function blockHeight(b: Block, k: number) {
  switch (b.k) {
    case 'h1': return 58 * k;
    case 'h2': return 50 * k;
    case 'p': return 34 * k;
    case 'callout': return (b.body ? 74 : 46) * k + 18 * k;
    case 'code': return (b.title ? 40 : 14) * k + b.lines.length * 22 * k + 16 * k;
    case 'img': return 150 * k;
    case 'cards': return 88 * k;
  }
}

/** Draws a docs page (navbar strip, sidebar, article, TOC). Returns block rects. */
export function docsPage(c: CanvasRenderingContext2D, o: PageOpts) {
  const k = o.k ?? 1;
  const { x, y, w, h } = o;
  card(c, x, y, w, h, { r: 16 * k, fill: FD.bg });
  c.save();
  rr(c, x, y, w, h, 16 * k);
  c.clip();
  // navbar strip
  c.fillStyle = FD.border;
  c.fillRect(x, y + 46 * k, w, 1);
  rr(c, x + 18 * k, y + 15 * k, 16 * k, 16 * k, 8 * k);
  c.fillStyle = '#FA8023';
  c.fill();
  ui(c, 'Docs', x + 42 * k, y + 29 * k, 14 * k, { weight: 600 });
  rr(c, x + w - 210 * k, y + 10 * k, 190 * k, 26 * k, 8 * k);
  c.fillStyle = FD.secondary;
  c.fill();
  ui(c, 'Search', x + w - 196 * k, y + 28 * k, 12.5 * k, { color: FD.mutedFg });
  ui(c, '⌘K', x + w - 46 * k, y + 28 * k, 11.5 * k, { color: FD.mutedFg });
  let ax = x + 28 * k;
  // sidebar
  if (o.sidebar) {
    const sw = 196 * k;
    c.fillStyle = FD.border;
    c.fillRect(x + sw, y + 47 * k, 1, h);
    ui(c, o.sidebar.title, x + 20 * k, y + 82 * k, 12 * k, { weight: 500, color: FD.mutedFg });
    o.sidebar.items.forEach((it, i) => {
      const iy = y + 104 * k + i * 32 * k;
      const ix = x + (16 + (it.depth ?? 0) * 14) * k;
      if (i === o.sidebar!.active) {
        rr(c, ix - 6 * k, iy - 6 * k, sw - (it.depth ?? 0) * 14 * k - 22 * k, 28 * k, 7 * k);
        c.fillStyle = o.key + '22';
        c.fill();
      }
      ui(c, (it.folder ? '▾ ' : '') + it.label, ix + 4 * k, iy + 13 * k, 13 * k, { weight: i === o.sidebar!.active ? 500 : 400, color: i === o.sidebar!.active ? o.key : FD.mutedFg });
    });
    ax = x + sw + 36 * k;
  }
  const tocW = o.toc ? 170 * k : 0;
  const aw = x + w - tocW - 30 * k - ax;
  // TOC
  if (o.toc) {
    const tx = x + w - tocW;
    ui(c, 'On this page', tx, y + 84 * k, 12 * k, { weight: 500, color: FD.mutedFg });
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.fillRect(tx, y + 98 * k, 1, o.toc.items.length * 26 * k);
    o.toc.items.forEach((s, i) => {
      const on = i === o.toc!.active;
      if (on) {
        c.fillStyle = o.key;
        c.fillRect(tx, y + 98 * k + i * 26 * k, 1.5, 26 * k);
      }
      ui(c, s, tx + 12 * k, y + 116 * k + i * 26 * k, 12 * k, { color: on ? FD.fg : FD.mutedFg });
    });
  }
  // article blocks
  let by = y + 92 * k;
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  o.blocks.forEach((b, i) => {
    const bh = blockHeight(b, k);
    rects.push({ x: ax, y: by, w: aw, h: bh });
    const rv = o.reveal ? o.reveal(i) : 1;
    if (rv > 0) {
      c.save();
      c.globalAlpha *= clamp(rv * 1.5);
      c.translate(0, (1 - rv) * 14 * k);
      drawBlock(c, b, ax, by, aw, k, o.key);
      const fl = o.flash ? o.flash(i) : 0;
      if (fl > 0) {
        rr(c, ax - 10 * k, by - 4 * k, aw + 20 * k, bh, 8 * k);
        c.fillStyle = o.key + Math.round(fl * 40).toString(16).padStart(2, '0');
        c.fill();
      }
      c.restore();
    }
    by += bh;
  });
  c.restore();
  return rects;
}

function drawBlock(c: CanvasRenderingContext2D, b: Block, x: number, y: number, w: number, k: number, key: string) {
  switch (b.k) {
    case 'h1':
      ui(c, b.text, x, y + 38 * k, 32 * k, { weight: 600 });
      return;
    case 'h2':
      ui(c, b.text, x, y + 34 * k, 22 * k, { weight: 600 });
      return;
    case 'p': {
      let cx = x;
      for (const part of b.parts) {
        if (typeof part === 'string') cx += ui(c, part, cx, y + 22 * k, 15 * k, { color: FD.mutedFg });
        else {
          const lw = ui(c, part.link, cx, y + 22 * k, 15 * k, { weight: 500, color: FD.fg });
          c.fillStyle = key;
          c.fillRect(cx, y + 26 * k, lw, 1.2 * k);
          cx += lw;
        }
      }
      return;
    }
    case 'callout':
      callout(c, x, y + 4 * k, w, b.type, b.title, b.body, k);
      return;
    case 'code': {
      const hh = blockHeight(b, k) - 8 * k;
      card(c, x, y, w, hh, { r: 12 * k, fill: FD.card });
      let ly = y + 30 * k;
      if (b.title) {
        mono(c, b.title, x + 14 * k, y + 26 * k, 12 * k, { color: FD.mutedFg });
        c.fillStyle = FD.border;
        c.fillRect(x, y + 40 * k, w, 1);
        ly = y + 64 * k;
      }
      b.lines.forEach((l, i) => toks(c, l, x + 14 * k, ly + i * 22 * k, 13 * k, 'mono'));
      return;
    }
    case 'img': {
      const ih = 136 * k;
      rr(c, x, y, Math.min(w, 300 * k), ih, 12 * k);
      const g = c.createLinearGradient(x, y, x + 300 * k, y + ih);
      g.addColorStop(0, `hsl(${b.hue} 45% 18%)`);
      g.addColorStop(1, `hsl(${b.hue + 18} 55% 38%)`);
      c.fillStyle = g;
      c.fill();
      ui(c, b.caption, x + 12 * k, y + ih - 12 * k, 12 * k, { color: 'rgba(255,255,255,0.8)' });
      return;
    }
    case 'cards': {
      const cw = (w - 12 * k) / 2;
      b.items.forEach(([t, d], i) => {
        const cx = x + i * (cw + 12 * k);
        card(c, cx, y, cw, 76 * k, { r: 12 * k, fill: FD.card });
        ui(c, t, cx + 14 * k, y + 30 * k, 14 * k, { weight: 500 });
        ui(c, d, cx + 14 * k, y + 54 * k, 12.5 * k, { color: FD.mutedFg });
      });
      return;
    }
  }
}

