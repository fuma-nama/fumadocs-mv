/**
 * Exact Fumadocs preset tokens (packages/base-ui/css/<preset>.css merged over lib/default-colors.css;
 * shadcn = shadcn/ui default neutral variables). Values are CSS strings; `rgb()` converts them.
 */
export type Mode = 'light' | 'dark';
export type ThemeId =
  | 'neutral' | 'black' | 'vitepress' | 'dusk' | 'catppuccin' | 'ocean'
  | 'purple' | 'solar' | 'emerald' | 'ruby' | 'aspen' | 'shadcn';

/** Official order (docs + credits). */
export const ORDER: ThemeId[] = ['neutral', 'black', 'vitepress', 'dusk', 'catppuccin', 'ocean', 'purple', 'solar', 'emerald', 'ruby', 'aspen', 'shadcn'];

export interface Tokens {
  background: string;
  foreground: string;
  primary: string;
  card: string;
  border: string;
  muted: string;
  accent: string;
}

const base: Record<Mode, Tokens> = {
  light: { background: 'hsl(0, 0%, 96%)', foreground: 'hsl(0, 0%, 3.9%)', primary: 'hsl(0, 0%, 9%)', card: 'hsl(0, 0%, 94.7%)', border: 'hsla(0, 0%, 80%, 50%)', muted: 'hsl(0, 0%, 45.1%)', accent: 'hsla(0, 0%, 82%, 50%)' },
  dark: { background: 'hsl(0, 0%, 7.04%)', foreground: 'hsl(0, 0%, 92%)', primary: 'hsl(0, 0%, 98%)', card: 'hsl(0, 0%, 9.8%)', border: 'hsla(0, 0%, 40%, 20%)', muted: 'hsla(0, 0%, 70%, 0.8)', accent: 'hsla(0, 0%, 40.9%, 30%)' },
};

type Over = Partial<Tokens>;
const over: Record<ThemeId, Record<Mode, Over>> = {
  neutral: { light: {}, dark: {} },
  black: {
    light: { background: 'hsl(0, 0%, 98%)', card: 'hsl(0, 0%, 99.7%)', border: 'hsla(0, 0%, 60%, 0.2)', accent: 'hsl(0, 0%, 94.1%)' },
    dark: { background: 'hsl(0, 0%, 2%)', foreground: 'hsl(0, 0%, 98%)', card: 'hsl(0, 0%, 4%)', border: 'hsla(0, 0%, 50%, 0.2)', muted: 'hsl(0, 0%, 60%)', accent: 'hsl(0, 0%, 15%)' },
  },
  vitepress: {
    light: { background: 'hsl(0, 0%, 100%)', foreground: 'hsl(240, 6%, 25%)', primary: 'hsl(226, 55%, 45%)', card: 'hsl(240, 8%, 97%)', border: 'hsl(0, 0%, 89.8%)', muted: 'hsl(240, 6%, 50%)', accent: 'hsl(0, 0%, 94.1%)' },
    dark: { background: '#1b1b1f', foreground: 'hsl(60, 100%, 98%)', primary: 'hsl(234, 100%, 83%)', card: 'hsl(240, 4%, 9%)', border: 'hsl(240, 5.2%, 18%)', muted: 'hsl(240, 5%, 58%)', accent: 'hsl(240, 5.4%, 21%)' },
  },
  dusk: {
    light: { background: 'hsl(250, 20%, 92%)', foreground: 'hsl(220, 20%, 30%)', primary: 'hsl(340, 40%, 48%)', card: 'hsl(250, 20%, 92%)', border: 'hsl(240, 40%, 90%)', muted: 'hsl(240, 10%, 50%)', accent: 'hsl(250, 30%, 90%)' },
    dark: { background: 'hsl(220, 15%, 6%)', foreground: 'hsl(220, 15%, 87%)', primary: 'hsl(340, 100%, 90%)', card: 'hsl(240, 20%, 5%)', border: 'hsl(220, 15%, 15%)', muted: 'hsl(220, 15%, 60%)', accent: 'hsl(250, 20%, 15%)' },
  },
  catppuccin: {
    light: { background: 'hsl(220, 23%, 95%)', foreground: 'hsl(234, 16%, 35%)', primary: 'hsl(266, 85%, 58%)', card: 'hsl(220, 22%, 92%)', border: 'hsl(223, 16%, 83%)', muted: 'hsl(233, 10%, 47%)', accent: 'hsl(223, 16%, 83%)' },
    dark: { background: 'hsl(240, 21%, 15%)', foreground: 'hsl(226, 64%, 88%)', primary: 'hsl(267, 84%, 81%)', card: 'hsl(240, 21%, 12%)', border: 'hsl(237, 16%, 23%)', muted: 'hsl(228, 24%, 72%)', accent: 'hsl(237, 16%, 23%)' },
  },
  ocean: {
    light: { background: 'hsl(0, 0%, 98%)', foreground: 'hsl(0, 0%, 3.9%)', primary: 'hsl(210, 80%, 20.2%)', card: 'hsl(220, 50%, 98%)', border: 'hsl(220, 50%, 89.8%)', muted: 'hsl(0, 0%, 45.1%)', accent: 'hsl(220, 50%, 94.1%)' },
    dark: { background: 'hsl(220, 60%, 8%)', foreground: 'hsl(220, 60%, 94.5%)', primary: 'hsl(205, 100%, 85%)', card: 'hsla(220, 56%, 15%, 0.4)', border: 'hsla(220, 50%, 50%, 0.2)', muted: 'hsl(220, 30%, 65%)', accent: 'hsl(220, 40%, 20%)' },
  },
  purple: {
    light: { background: 'hsl(256, 100%, 96%)', foreground: 'hsl(256, 60%, 26%)', primary: 'hsl(270, 100%, 52%)', card: 'hsl(256, 60%, 92%)', border: 'hsla(270, 40%, 80%, 0.5)', muted: 'hsl(256, 50%, 50%)', accent: 'hsl(270, 40%, 88%)' },
    dark: { background: 'hsl(256, 20%, 6%)', foreground: 'hsl(256, 60%, 90%)', primary: 'hsl(270, 100%, 86%)', card: 'hsl(256, 23%, 10%)', border: 'hsla(270, 50%, 40%, 0.3)', muted: 'hsl(256, 50%, 75%)', accent: 'hsl(256, 23%, 22%)' },
  },
  solar: {
    light: { primary: 'oklch(0.487 0.083 262.691)' },
    dark: { background: 'hsl(0, 0%, 5.04%)', primary: 'oklch(0.902 0.0461 259.51)' },
  },
  emerald: {
    light: { background: 'hsl(165, 45%, 96%)', foreground: 'hsl(165, 40%, 18%)', primary: 'hsl(168, 70%, 40%)', card: 'hsl(165, 45%, 94%)', border: 'hsla(168, 40%, 70%, 0.5)', muted: 'hsl(165, 30%, 45%)', accent: 'hsl(165, 50%, 90%)' },
    dark: { background: 'hsl(200, 30%, 7%)', foreground: 'hsl(168, 40%, 88%)', primary: 'hsl(168, 70%, 60%)', card: 'hsl(200, 30%, 10%)', border: 'hsla(168, 40%, 35%, 0.35)', muted: 'hsl(168, 25%, 65%)', accent: 'hsl(200, 30%, 18%)' },
  },
  ruby: {
    light: { background: 'hsl(0, 0%, 98%)', foreground: 'hsl(350, 45%, 14%)', primary: 'hsl(348, 85%, 45%)', card: 'hsl(0, 0%, 100%)', border: 'hsla(348, 40%, 60%, 0.25)', muted: 'hsl(348, 25%, 42%)', accent: 'hsl(348, 70%, 95%)' },
    dark: { background: 'hsl(350, 30%, 6%)', foreground: 'hsl(350, 30%, 92%)', primary: 'hsl(348, 90%, 62%)', card: 'hsl(350, 30%, 9%)', border: 'hsla(348, 40%, 45%, 0.25)', muted: 'hsl(348, 25%, 65%)', accent: 'hsl(348, 35%, 16%)' },
  },
  aspen: {
    light: { background: 'hsl(75, 45%, 96%)', foreground: 'hsl(75, 35%, 18%)', primary: 'hsl(80, 60%, 40%)', card: 'hsl(75, 45%, 94%)', border: 'hsla(80, 35%, 70%, 0.5)', muted: 'hsl(75, 25%, 45%)', accent: 'hsl(75, 50%, 90%)' },
    dark: { background: 'hsl(80, 25%, 7%)', foreground: 'hsl(75, 35%, 88%)', primary: 'hsl(80, 60%, 55%)', card: 'hsl(80, 25%, 10%)', border: 'hsla(80, 35%, 35%, 0.35)', muted: 'hsl(75, 25%, 65%)', accent: 'hsl(80, 25%, 18%)' },
  },
  shadcn: {
    light: { background: 'oklch(1 0 0)', foreground: 'oklch(0.145 0 0)', primary: 'oklch(0.205 0 0)', card: 'oklch(1 0 0)', border: 'oklch(0.922 0 0)', muted: 'oklch(0.556 0 0)', accent: 'oklch(0.97 0 0)' },
    dark: { background: 'oklch(0.145 0 0)', foreground: 'oklch(0.985 0 0)', primary: 'oklch(0.922 0 0)', card: 'oklch(0.205 0 0)', border: 'oklch(1 0 0 / 10%)', muted: 'oklch(0.708 0 0)', accent: 'oklch(0.269 0 0)' },
  },
};

export function tokens(id: ThemeId, mode: Mode): Tokens {
  return { ...base[mode], ...over[id][mode] };
}

// ── colour maths ─────────────────────────────────────────────────────────────
export type RGB = [number, number, number]; // 0..255 sRGB

function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function oklchToRgb(L: number, C: number, h: number): RGB {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const enc = (x: number) => {
    x = Math.max(0, Math.min(1, x));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  };
  return [enc(lin[0]) * 255, enc(lin[1]) * 255, enc(lin[2]) * 255];
}

const cache = new Map<string, { rgb: RGB; a: number }>();

/** Parse hsl()/hsla()/oklch()/#hex into sRGB 0..255 + alpha. */
export function parse(css: string): { rgb: RGB; a: number } {
  const hit = cache.get(css);
  if (hit) return hit;
  let out: { rgb: RGB; a: number };
  const s = css.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
    out = { rgb: [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)], a: 1 };
  } else {
    const nums = s.slice(s.indexOf('(') + 1, s.lastIndexOf(')')).split(/[\s,/]+/).filter(Boolean);
    const num = (x: string, pct = 1) => (x.endsWith('%') ? (parseFloat(x) / 100) * pct : parseFloat(x));
    if (s.startsWith('oklch')) {
      out = { rgb: oklchToRgb(num(nums[0]), num(nums[1]), num(nums[2])), a: nums[3] ? num(nums[3]) : 1 };
    } else {
      out = { rgb: hslToRgb(parseFloat(nums[0]), num(nums[1]), num(nums[2])), a: nums[3] ? num(nums[3]) : 1 };
    }
  }
  cache.set(css, out);
  return out;
}

const hex2 = (x: number) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0');
export const toHex = (c: RGB) => `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`;

/** Opaque hex of a token, compositing its alpha over `under` (default: the theme background). */
export function hex(css: string, under?: string): string {
  const { rgb, a } = parse(css);
  if (a >= 1 || !under) return toHex(rgb);
  const u = parse(under).rgb;
  return toHex([rgb[0] * a + u[0] * (1 - a), rgb[1] * a + u[1] * (1 - a), rgb[2] * a + u[2] * (1 - a)]);
}

export function mix(a: string, b: string, k: number): string {
  const x = parse(a).rgb;
  const y = parse(b).rgb;
  return toHex([x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]);
}

export function luminance(css: string): number {
  const [r, g, b] = parse(css).rgb.map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Strip spaces after commas for compact display: "hsl(205 100% 85%)". */
export const pretty = (css: string) => css.replace(/,\s*/g, ' ').replace(/\s+/g, ' ');

/** Everything a state needs, as opaque hex. */
export interface Swatch {
  id: ThemeId;
  mode: Mode;
  index: number; // 1..12 in the official order
  bg: string;
  fg: string;
  primary: string;
  card: string;
  border: string;
  muted: string;
  accent: string;
  /** the world field behind the page = primary of this mode */
  world: string;
  /** type colour on the world field */
  ink: string;
  /** darker/lighter shade of the world for flat shadows */
  shade: string;
  tone: 'dark' | 'light';
  raw: Tokens;
}

const swCache = new Map<string, Swatch>();
export function swatch(id: ThemeId, mode: Mode): Swatch {
  const key = id + mode;
  const hit = swCache.get(key);
  if (hit) return hit;
  const t = tokens(id, mode);
  const bg = hex(t.background);
  const other = tokens(id, mode === 'light' ? 'dark' : 'light');
  const world = hex(t.primary);
  const worldDark = luminance(world) < 0.2;
  const ink = worldDark ? hex(mode === 'light' ? t.background : other.background) : hex(mode === 'dark' ? t.background : other.background);
  const s: Swatch = {
    id,
    mode,
    index: ORDER.indexOf(id) + 1,
    bg,
    fg: hex(t.foreground, t.background),
    primary: world,
    card: hex(t.card, t.background),
    border: hex(t.border, t.background),
    muted: hex(t.muted, t.background),
    accent: hex(t.accent, t.background),
    world,
    ink,
    shade: worldDark ? mix(world, '#000000', 0.38) : mix(world, '#000000', 0.16),
    tone: worldDark ? 'dark' : 'light',
    raw: t,
  };
  swCache.set(key, s);
  return s;
}

export const NAME: Record<ThemeId, string> = {
  neutral: 'NEUTRAL', black: 'BLACK', vitepress: 'VITEPRESS', dusk: 'DUSK', catppuccin: 'CATPPUCCIN', ocean: 'OCEAN',
  purple: 'PURPLE', solar: 'SOLAR', emerald: 'EMERALD', ruby: 'RUBY', aspen: 'ASPEN', shadcn: 'SHADCN',
};
