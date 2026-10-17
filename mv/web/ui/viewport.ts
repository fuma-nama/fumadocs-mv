import type * as THREE from 'three';
import { dolly, explore, grab, orbit, pan, pick, rectOf, reset } from '../../src/engine/explore';
import { app } from './app';
import { count, el, put } from './film';

const canvas = el<HTMLCanvasElement>('out');
const layer = el<HTMLCanvasElement>('overlay');
const g = layer.getContext('2d')!;
const hintEl = el('hint');
const rect = [0, 0, 0, 0];
let free = false;
/** the frame on screen has no 3D for the modes to work on */
let flat = false;
let tip = '';
let tipTimer: ReturnType<typeof setTimeout> | undefined;
let hover: [x: number, y: number] | null = null;
let hit: ReturnType<typeof pick> = null;
const label = ['', ''];
let labelW = 0;
let font = '';
let probing = 0;

const hint = () => put(hintEl, flat ? '2D shot · no 3D here' : tip);
function say(text: string) {
  tip = text;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => {
    tip = '';
    hint();
  }, 4000);
  hint();
}

export const isFree = () => free;

export function setFree(on: boolean) {
  free = on;
  el('cam-director').setAttribute('aria-pressed', String(!on));
  el('cam-free').setAttribute('aria-pressed', String(on));
  document.body.toggleAttribute('data-free', on);
  reset();
  say(!on ? '' : matchMedia('(pointer: coarse)').matches ? 'Drag orbit · pinch zoom & pan · double-tap reset' : 'Drag orbit · scroll zoom · right-drag pan · double-click reset');
  app.redraw();
}

export function setXray(on: boolean) {
  explore.xray = on;
  el('xray').setAttribute('aria-pressed', String(on));
  app.redraw();
}

export function resetView() {
  reset();
  app.redraw();
}

export function orbitBy(dx: number, dy: number) {
  grab();
  orbit(dx, dy);
  app.redraw();
}

export function zoomBy(k: number) {
  grab();
  dolly(k);
  app.redraw();
}

export const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : el('view').requestFullscreen());

export const stats = (text: string) => put(el('stats'), text);

/** After every rendered frame. */
export function drawn(calls: number) {
  flat = (free || explore.xray) && !calls;
  hint();
  paint();
}

/** What's under the mouse: on pointer moves while paused, at the panels' rate while playing. */
export function probe() {
  probing = 0;
  const next = hover && !pts.size ? pick(hover[0], hover[1]) : null;
  if (next?.object !== hit?.object || next?.instance !== hit?.instance) {
    hit = next;
    if (hit) {
      const ob = hit.object as THREE.Mesh;
      const geo = ob.geometry;
      const m = Array.isArray(ob.material) ? ob.material[0] : ob.material;
      const color = (m as THREE.MeshBasicMaterial).color;
      label[0] = `${ob.name || ob.type}${hit.instance === undefined ? '' : ` #${hit.instance}`} · ${geo.type}`;
      label[1] = `${count((geo.index ?? geo.attributes.position).count / 3)} tris · ${m.type}${color ? ` #${color.getHexString()}` : ''}`;
      g.font = font;
      labelW = Math.max(g.measureText(label[0]).width, g.measureText(label[1]).width);
    }
  }
  paint();
}

/** Selection boxes in orange, the hovered object in paper with its label. */
export function paint() {
  const { width: w, height: h } = layer;
  const dpr = devicePixelRatio;
  g.clearRect(0, 0, w, h);
  g.lineWidth = dpr;
  g.strokeStyle = '#fa8023';
  const s = app.selection;
  for (let i = 0; s && i < s.objects.length && i < 64; i++) if (rectOf(s.objects[i], s.instance, rect)) box(w, h);
  if (!hit || !rectOf(hit.object, hit.instance, rect)) return;
  g.strokeStyle = 'rgba(238, 236, 228, 0.85)';
  const [x0, y0, , y1] = box(w, h);
  const lh = 16 * dpr;
  const below = y1 + 6 * dpr + 2 * lh < h;
  const ly = below ? y1 + 6 * dpr : y0 - 6 * dpr - 2 * lh;
  const lx = Math.min(x0, w - labelW - 16 * dpr);
  g.fillStyle = 'rgba(10, 10, 11, 0.85)';
  g.fillRect(lx, ly, labelW + 16 * dpr, 2 * lh + 6 * dpr);
  g.fillStyle = '#eeece4';
  g.font = font;
  g.fillText(label[0], lx + 8 * dpr, ly + 14 * dpr);
  g.fillText(label[1], lx + 8 * dpr, ly + 14 * dpr + lh);
}

const corner = [0, 0, 0, 0];
function box(w: number, h: number) {
  const dpr = devicePixelRatio;
  corner[0] = Math.round(((Math.max(rect[0], -1) + 1) / 2) * w);
  corner[1] = Math.round(((1 - Math.min(rect[3], 1)) / 2) * h);
  corner[2] = Math.round(((Math.min(rect[2], 1) + 1) / 2) * w);
  corner[3] = Math.round(((1 - Math.max(rect[1], -1)) / 2) * h);
  g.strokeRect(corner[0] + dpr / 2, corner[1] + dpr / 2, corner[2] - corner[0] - dpr, corner[3] - corner[1] - dpr);
  return corner;
}

new ResizeObserver(() => {
  layer.width = Math.round(layer.clientWidth * devicePixelRatio);
  layer.height = Math.round(layer.clientHeight * devicePixelRatio);
  font = `${11 * devicePixelRatio}px 'Geist Mono'`;
  paint();
}).observe(layer);

// gestures: a click picks the object under it; with the free camera, drag orbits, right/shift-drag
// and two fingers pan, wheel and pinch zoom, and a double click or tap resets
const pts = new Map<number, { x: number; y: number }>();
let travel = 0;
let tapAt = 0;
let wheelAt = 0;
const ndc = (e: MouseEvent): [number, number] => {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2];
};

canvas.addEventListener('pointerdown', (e) => {
  if (!app.ready) return;
  canvas.setPointerCapture(e.pointerId);
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size > 1) return;
  travel = 0;
  if (free) grab();
  document.body.toggleAttribute('data-drag', free);
});
canvas.addEventListener('pointermove', (e) => {
  const p = pts.get(e.pointerId);
  if (!p) {
    if (e.pointerType !== 'mouse' || !app.ready) return;
    hover = ndc(e);
    if (!app.playing) probing ||= requestAnimationFrame(probe);
    return;
  }
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  const h = canvas.clientHeight;
  travel += Math.abs(dx) + Math.abs(dy);
  if (free && pts.size > 1) {
    // the other finger holds still during this event
    let o = p;
    for (const q of pts.values()) if (q !== p) o = q;
    dolly(Math.hypot(p.x - o.x, p.y - o.y) / Math.max(1, Math.hypot(e.clientX - o.x, e.clientY - o.y)));
    pan(dx / 2, dy / 2, h);
  } else if (free && (e.buttons & 2 || e.shiftKey)) pan(dx, dy, h);
  else if (free) orbit((dx * Math.PI) / h, (dy * Math.PI) / h);
  p.x = e.clientX;
  p.y = e.clientY;
  if (free) app.redraw();
});
const lift = (e: PointerEvent) => {
  if (!pts.delete(e.pointerId) || pts.size) return;
  document.body.removeAttribute('data-drag');
  if (e.type !== 'pointerup' || travel > 6) return;
  if (free && e.timeStamp - tapAt < 350) {
    tapAt = 0;
    return resetView();
  }
  tapAt = e.timeStamp;
  const p = pick(...ndc(e));
  app.select(p && { objects: [p.object], instance: p.instance }, true);
};
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);
canvas.addEventListener('pointerleave', () => {
  hover = null;
  probe();
});
canvas.addEventListener('contextmenu', (e) => free && e.preventDefault());
canvas.addEventListener(
  'wheel',
  (e) => {
    if (!free) return;
    e.preventDefault();
    if (e.timeStamp - wheelAt > 300) grab();
    wheelAt = e.timeStamp;
    dolly(Math.exp(e.deltaY * (e.deltaMode ? 0.05 : 0.0015)));
    app.redraw();
  },
  { passive: false },
);

el('cam-director').addEventListener('click', () => app.ready && setFree(false));
el('cam-free').addEventListener('click', () => app.ready && setFree(true));
el('xray').addEventListener('click', () => app.ready && setXray(!explore.xray));
el('reset').addEventListener('click', () => app.ready && resetView());
el('full').addEventListener('click', toggleFull);
if (!document.fullscreenEnabled) el('full').hidden = true;
