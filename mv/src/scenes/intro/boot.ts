import type * as THREE from 'three';
import type { Frame } from '../../engine/engine';
import { C } from '../_shared/palette';
import { ease, clamp } from '../../engine/anim';
import { drawCaret, drawPowerOn, caretBlink, POWER_ON } from './caret';
import { applyCam, introCam, floorFog } from './camera';
import { drawFloor, dotState } from './dial';
import { drawHUD } from './hud';
import { PAGES } from './world';
import { S, seg } from './state';
import { HOME_POOL } from './voidphase';
import type { Projector } from './proj';
import type { V3 } from './world';

/** The orange figure in screen space: caret (bar 1) → stretch → dot. */
function drawFigure(c: CanvasRenderingContext2D, t: number) {
  const { P, T } = S;
  const m = T.m;
  const root = P.project(0, 0, 0);
  if (t < m[0] - 2 / 60) {
    const pw = t / POWER_ON.dur;
    if (pw < 1) drawPowerOn(c, Math.round(root.x), Math.round(root.y), pw);
    drawCaret(c, Math.round(root.x), Math.round(root.y), { alpha: t < 0.4 ? 1 : caretBlink(t) });
    return;
  }
  const d = dotState(t, T);
  const head = P.project(d.p[0], 0, d.p[2]);
  // stretch: the caret is pulled along the trunk, its mass gathering at the head
  const ks = seg(t, m[0] - 2 / 60, m[0] + 0.1);
  if (ks < 1) {
    const e = ease.outCubic(ks);
    const w = 18 * (1 - e) + 1.5 * e;
    const base = { x: root.x, y: root.y + 18 * (1 - e) };
    const dx = head.x - base.x;
    const dy = head.y - base.y;
    const len = Math.max(2, Math.hypot(dx, dy));
    c.save();
    c.translate(base.x, base.y);
    c.rotate(Math.atan2(dy, dx) + Math.PI / 2);
    c.fillStyle = C.ORANGE;
    c.globalAlpha = 1 - ease.inQuad(ks);
    c.fillRect(-w / 2, -len, w, len);
    c.restore();
  }
  // trail (sub-frame samples)
  c.save();
  c.lineCap = 'round';
  for (let i = 1; i <= 10; i++) {
    const a = dotState(t - i / 300, T);
    const b = dotState(t - (i - 1) / 300, T);
    const pa = P.project(a.p[0], 0, a.p[2]);
    const pb = P.project(b.p[0], 0, b.p[2]);
    if (Math.hypot(pb.x - pa.x, pb.y - pa.y) < 0.6) continue;
    c.strokeStyle = `rgba(250,128,35,${(0.7 * (1 - i / 11)).toFixed(3)})`;
    c.lineWidth = 9 * (1 - i / 12);
    c.beginPath();
    c.moveTo(pa.x, pa.y);
    c.lineTo(pb.x, pb.y);
    c.stroke();
  }
  c.restore();
  // the dot (swells on the held E6 once home)
  const home = seg(t, m[9] + 0.45, 6.4);
  const r = (8 + 5 * ease.inQuad(home)) * Math.min(1, 0.3 + ks);
  c.save();
  c.shadowColor = C.ORANGE;
  c.shadowBlur = 18 + 24 * home;
  c.fillStyle = C.ORANGE;
  c.beginPath();
  c.arc(head.x, head.y, Math.max(1, r), 0, Math.PI * 2);
  c.fill();
  c.shadowBlur = 0;
  c.fillStyle = `rgba(255,236,214,${(0.5 * clamp(d.speed / 40) + 0.35 * home).toFixed(3)})`;
  c.beginPath();
  c.arc(head.x, head.y, r * 0.45, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** The dot is a small light: once the floor tilts into view it pools warm light around it. */
function dotPool(c: CanvasRenderingContext2D, P: Projector, p: V3, a: number) {
  if (a <= 0.003) return;
  const F = 100;
  c.save();
  c.globalCompositeOperation = 'lighter';
  if (P.floorTransform(c, p, [1, 0, 0], [0, 0, -1], 1, F)) {
    const r = 3.2 * F;
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(250,128,35,${a.toFixed(3)})`);
    g.addColorStop(0.35, `rgba(250,128,35,${(a * 0.35).toFixed(3)})`);
    g.addColorStop(1, 'rgba(250,128,35,0)');
    c.fillStyle = g;
    c.fillRect(-r, -r, 2 * r, 2 * r);
  }
  c.restore();
}

export function nodesAt(t: number) {
  const m = S.T.m;
  return PAGES.filter((p) => t >= m[4] + 0.8 + 0.2 * p.chapter + 0.42).length + (t >= m[0] ? 1 : 0) + Math.min(8, Math.max(0, Math.floor((t - m[0]) / 0.2) + 1));
}

/** Bars 1–4 (0–6.4): power-on, the clock, the line, the page tree dial, the crane. */
export function renderBoot(f: Frame): THREE.Texture {
  const { e, t } = f;
  const { cam, P, T, cues } = S;
  applyCam(cam, introCam(t));
  P.update(cam);
  const fog = floorFog(t);

  const floor = e.layer('intro:floor');
  const c = floor.begin();
  dotPool(c, P, dotState(t, T).p, HOME_POOL * ease.inOutCubic(seg(t, T.m[9], 6.2)));
  drawFloor(c, { t, P, T, cues, fog, bright: 1, labels: 1 - seg(t, T.m[9], T.m[9] + 0.5), dot: true });
  const fg = e.layer('intro:fg');
  const g = fg.begin();
  drawFigure(g, t);
  const n = nodesAt(t);
  drawHUD(g, t, 1 - seg(t, 5.9, 6.3), { blips: cues.blips, nodes: n, bytes: n * 312 });

  const gfx = e.gfx;
  const comp = gfx.compose(gfx.rt('intro:comp'), C.INK, [{ tex: floor.end() }, { tex: fg.end() }]);
  f.post.ca = 0.0008;
  f.overlay.tone = 'dark';
  return gfx.bloom(comp, { threshold: 0.55, strength: 0.55, radius: 18 }, 'intro:bloom');
}
