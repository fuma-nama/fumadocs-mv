import { clamp, ease } from '../../engine/anim';
import { GEO, type El, type GroupKey, type LayoutGeo } from './geo';
import { LAYOUTS, VH, VW, type LayoutId } from './layouts';

export interface ElState extends El {
  /** presence 0..1 */
  a: number;
}

export interface FrameState {
  els: ElState[];
  frameR: number;
}

/** Stagger (fraction of the morph) per group: chrome moves first, content follows. */
const DELAY: Record<GroupKey, number> = {
  navbar: 0,
  pills: 0.02,
  panel: 0.04,
  hero: 0.02,
  surface: 0.05,
  tabs: 0.1,
  sidebar: 0.06,
  page: 0.1,
  main: 0.16,
  toc: 0.22,
  overlay: 0.04,
};

/** Physical move: fast start, tiny overshoot, soft landing. */
export function moveEase(u: number) {
  return ease.outBack(clamp(u), 1.2);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Where a group's slab goes when the other layout doesn't have it. */
function degenerate(e: El): El {
  switch (e.g) {
    case 'sidebar':
      return { ...e, w: 0, r: 0 };
    case 'navbar':
    case 'tabs':
      return { ...e, h: 0, r: 0 };
    case 'toc':
      return { ...e, x: e.x + e.w, w: 0 };
    case 'panel':
      return { ...e, x: e.x + e.w / 2 - 40, y: VH + 10, w: 80, h: 0, z: 0 };
    case 'pills':
      return { ...e, x: e.x + e.w - e.h, w: e.h, z: 0 };
    case 'hero':
      return { ...e, y: VH, h: 0, z: 0 };
    case 'page':
      return { ...e, x: 0, y: 0, w: VW, h: VH, r: 12, z: 0 };
    case 'overlay':
      return { ...e, y: e.y + 0.2 * e.h, glass: 0, fill: 0 };
    default:
      return e;
  }
}

function lerpEl(a: El, b: El, t: number): El {
  const pts = a.pts && b.pts && a.pts.length === b.pts.length ? a.pts.map((v, i) => lerp(v, b.pts![i], t)) : t < 0.5 ? a.pts : b.pts;
  const sa = a.sep ?? [1, 1, 1, 1];
  const sb = b.sep ?? [1, 1, 1, 1];
  return {
    key: b.key,
    k: t < 0.5 ? a.k : b.k,
    g: t < 0.5 ? a.g : b.g,
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    w: Math.max(0, lerp(a.w, b.w, t)),
    h: Math.max(0, lerp(a.h, b.h, t)),
    r: Math.max(0, lerp(a.r, b.r, t)),
    tone: lerp(a.tone, b.tone, t),
    acc: clamp(lerp(a.acc, b.acc, t)),
    fill: clamp(lerp(a.fill, b.fill, t)),
    z: lerp(a.z ?? 0, b.z ?? 0, t),
    t: lerp(a.t ?? 2, b.t ?? 2, t),
    glass: clamp(lerp(a.glass ?? 0, b.glass ?? 0, t)),
    edge: clamp(lerp(a.edge ?? 1, b.edge ?? 1, t)),
    sep: a.sep || b.sep ? ([0, 1, 2, 3].map((i) => lerp(sa[i], sb[i], t)) as [number, number, number, number]) : undefined,
    pts,
    on: lerp(a.on ?? 1, b.on ?? 1, t),
  };
}

/** Group slab per layout (for moving unmatched content along with its group). */
function slabs(L: LayoutGeo) {
  const m = new Map<GroupKey, El>();
  for (const e of L.els) if (e.k === 'panel' && !m.has(e.g)) m.set(e.g, e);
  return m;
}

const cache = new Map<string, { keys: string[]; A: Map<string, El>; B: Map<string, El>; sa: Map<GroupKey, El>; sb: Map<GroupKey, El> }>();

function pairing(a: LayoutGeo, b: LayoutGeo) {
  const id = a.id + '>' + b.id;
  let p = cache.get(id);
  if (!p) {
    const A = new Map(a.els.map((e) => [e.key, e]));
    const B = new Map(b.els.map((e) => [e.key, e]));
    const keys: string[] = [];
    // keep B's order (draw order of the target), then A-only keys
    for (const e of b.els) keys.push(e.key);
    for (const e of a.els) if (!B.has(e.key)) keys.push(e.key);
    p = { keys, A, B, sa: slabs(a), sb: slabs(b) };
    cache.set(id, p);
  }
  return p;
}

export function geoOf(id: LayoutId | string): LayoutGeo {
  const g = GEO.get(LAYOUTS[id as LayoutId]?.geo ?? id);
  if (!g) throw new Error('layout geometry not loaded: ' + id);
  return g;
}

/** Eased progress of a group at morph progress u. */
export function groupProgress(g: GroupKey, u: number, easeFn: (x: number) => number = moveEase) {
  const lu = clamp((u - DELAY[g]) / 0.7);
  return lu <= 0 ? 0 : lu >= 1 ? 1 : easeFn(lu);
}

/** Interpolated frame between two layouts at morph progress u (0..1, linear time). */
export function morph(from: LayoutId | string, to: LayoutId | string, u: number, easeFn: (x: number) => number = moveEase): FrameState {
  const a = geoOf(from);
  const b = geoOf(to);
  const P = pairing(a, b);
  const els: ElState[] = [];
  const prog = (g: GroupKey) => {
    const lu = clamp((u - DELAY[g]) / 0.7);
    return lu <= 0 ? 0 : lu >= 1 ? 1 : easeFn(lu);
  };
  for (const key of P.keys) {
    const ea = P.A.get(key);
    const eb = P.B.get(key);
    const g = (eb ?? ea)!.g;
    const s = prog(g);
    if (ea && eb) {
      els.push({ ...lerpEl(ea, eb, s), a: 1 });
      continue;
    }
    const e = (ea ?? eb)!;
    if (e.k === 'panel') {
      const d = degenerate(e);
      const st = ea ? lerpEl(e, d, s) : lerpEl(d, e, s);
      const al = clamp(ea ? 1 - s : s);
      if (al > 0.002) els.push({ ...st, a: Math.min(1, al * 2) });
      continue;
    }
    // unmatched content rides along with its group's slab while it fades
    const ga = P.sa.get(g);
    const gb = P.sb.get(g);
    let dx = 0;
    let dy = 0;
    if (ga && gb) {
      dx = (gb.x - ga.x) * (ea ? s : s - 1);
      dy = (gb.y - ga.y) * (ea ? s : s - 1);
    }
    const al = clamp(ea ? 1 - s * 1.6 : s * 1.6 - 0.6);
    if (al > 0.002) els.push({ ...e, x: e.x + dx, y: e.y + dy, pts: e.pts?.map((v, i) => v + (i % 2 ? dy : dx)), a: al });
  }
  return { els, frameR: 12 };
}

export function still(id: LayoutId | string): FrameState {
  return { els: geoOf(id).els.map((e) => ({ ...e, a: 1 })), frameR: 12 };
}

export function dotOf(id: LayoutId | string): [number, number] {
  return geoOf(id).dot;
}
