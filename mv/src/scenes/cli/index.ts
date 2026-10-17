import * as THREE from 'three';
import type { SceneImpl, Frame } from '../../engine/engine';
import { lerp, seg } from '../../engine/anim';
import { P } from './pal';
import { T, FLOPPIES } from './timeline';
import { loadPlates, plates } from './plates';
import { drawWallpaper } from './wallpaper';
import { drawDesktop, layoutAt, applyView } from './ui';
import { drawStop } from './stop';
import { renderMachine, buildEngine } from './machine';
import { setSheetTexture } from './engine3d';
import { drawCallouts, drawBlueprintDetails } from './hud';
import { cellCenter, xfPoint, deskAt, type View } from './state';
import { rigAt } from './engine3d';

/**
 * CLI · bars 41–48 · "make it yours" with @fumadocs/cli (docs/scenes/cli.md).
 * Owner of B5 (theme → cli, 63.2–64.8); non-owner of B6 (→ integrations, 76.4–77.6).
 */
const scene: SceneImpl = {
  async setup(e) {
    await loadPlates(e);
    buildEngine();
    const page = plates.get('page');
    if (page) {
      const tx = new THREE.CanvasTexture(page.mid);
      tx.colorSpace = THREE.SRGBColorSpace;
      tx.anisotropy = 16;
      tx.generateMipmaps = true;
      tx.minFilter = THREE.LinearMipmapLinearFilter;
      setSheetTexture(tx);
    }
  },
  render(f) {
    const { e, t } = f;
    hints(f);
    post(f);
    if (t >= T.stop) return drawStop(f);

    const g = e.gfx;
    const d = layoutAt(t);

    const bg = e.layer('cli:bg');
    const cb = bg.begin(P.DESK);
    applyView(cb, d.view);
    drawWallpaper(cb, t, d);

    // the Document Engine: blueprint wallpaper → live machine → folds back
    const m = renderMachine(f, d.view, launchAt);
    if (m.shadow) drawContactShadow(cb, m.shadow);
    const hud = e.layer('cli:hud');
    const ch = hud.begin();
    const live = t >= T.enter3 && t < T.speed;
    if (!live) applyView(ch, d.view);
    // the drawing's annotations get out of the way of the prompts (the big terminal) and the slam
    const quiet = seg(t, T.enter1, T.enter1 + 0.2) * (1 - seg(t, T.enter3 - 0.05, T.enter3));
    const hudOut = (1 - seg(t, T.slam - 0.1, T.slam + 0.05)) * (1 - 0.75 * quiet);
    drawBlueprintDetails(ch, m.anchors, (m.linesOpacity / 0.62) * hudOut);
    drawCallouts(ch, t, m.anchors, { ink: live ? P.INK : P.OCEAN, alpha: live ? 1 - seg(t, T.installed, T.installed + 0.15) : 0.85 * hudOut, live });

    const ui = e.layer('cli:ui');
    drawDesktop(ui.begin(), t, d);

    // B5: theme's maximised page underneath until my crisp copy has faded in
    const other = f.other && t < T.click ? f.other : undefined;
    // the machine blurs only while its camera moves (inflate, whips, print); the UI never does
    const mb = blur3D(t);
    const back = mb > 0 && m.back ? e.gfx.motionBlur(m.back, { amount: mb, center: [0.5, 0.5] }, 'cli:mb3') : m.back;
    const front = mb > 0 && m.front ? e.gfx.motionBlur(m.front, { amount: mb, center: [0.5, 0.5] }, 'cli:mbf') : m.front;
    const comp = g.compose(g.rt('cli:comp'), P.DESK, [
      { tex: bg.end() },
      { tex: m.lines, opacity: m.linesOpacity },
      { tex: back, opacity: m.backOpacity },
      { tex: hud.end() },
      { tex: other },
      { tex: ui.end() },
      { tex: front },
    ]);
    return blurView(f, comp, d.view);
  },
};

/** Soft floor shadow under the machine (2D, under the 3D layer): an ellipse on the projected floor axes. */
function drawContactShadow(c: CanvasRenderingContext2D, s: NonNullable<ReturnType<typeof renderMachine>['shadow']>) {
  c.save();
  c.setTransform(s.ax.x, s.ax.y, s.az.x, s.az.y, s.c.x, s.c.y);
  const g = c.createRadialGradient(0, 0, 0.05, 0, 0, 1);
  g.addColorStop(0, `rgba(10,10,11,${0.34 * s.alpha})`);
  g.addColorStop(0.6, `rgba(10,10,11,${0.14 * s.alpha})`);
  g.addColorStop(1, 'rgba(10,10,11,0)');
  c.fillStyle = g;
  c.fillRect(-1, -1, 2, 2);
  c.restore();
}

/** Zoom blur for the 3D engine camera (frame-height / orbit speed), 0 when at rest. */
function blur3D(t: number) {
  if (t < T.enter3 || t >= T.speed) return 0;
  const dt = 1 / 60;
  const a = rigAt(t);
  const b = rigAt(t - dt);
  const r3 = (Math.abs(Math.log(a.H) - Math.log(b.H)) + Math.abs(a.az - b.az) * 0.004 + Math.abs(a.el - b.el) * 0.004) * 0.45;
  const amt = Math.min(0.12, r3);
  return amt < 0.004 ? 0 : amt;
}

/** Zoom blur for the 2D desktop camera (whip-out 67.2, slam 76.0); 0 on rests. */
function blurView(f: Frame, tex: THREE.Texture, v: View) {
  const t = f.t;
  const dt = 1 / 60;
  const pv = deskAt(t - dt).view;
  // 2D desktop camera: zoom speed about its pivot
  let amt = Math.abs(Math.log(v.s) - Math.log(pv.s)) * 0.45;
  let ctr: [number, number] = [0.5, 0.5];
  if (amt > 0.002) {
    // screen position of the zoom's fixed point
    const fx = (v.qx - v.s * v.cx - (pv.qx - pv.s * pv.cx)) / (pv.s - v.s || 1e-6);
    const fy = (v.qy - v.s * v.cy - (pv.qy - pv.s * pv.cy)) / (pv.s - v.s || 1e-6);
    const sx = v.s * fx + v.qx - v.s * v.cx;
    const sy = v.s * fy + v.qy - v.s * v.cy;
    ctr = [Math.min(1, Math.max(0, sx / 1920)), Math.min(1, Math.max(0, 1 - sy / 1080))];
  }
  amt = Math.min(0.12, amt);
  if (amt < 0.004) return tex;
  return f.e.gfx.motionBlur(tex, { amount: amt, center: ctr }, 'cli:mblur');
}

/** Screen point where floppy i pops out of the (mini) terminal: its spinner line at launch. */
const launchCache = new Map<number, { x: number; y: number }>();
function launchAt(i: number) {
  const hit = launchCache.get(i);
  if (hit) return hit;
  const p = launchPoint(i);
  launchCache.set(i, p);
  return p;
}
function launchPoint(i: number) {
  const tl = FLOPPIES[i].launch;
  const d = deskAt(tl);
  const st = d.term.state;
  const row = st.spinner?.row ?? 9;
  const p = cellCenter(row, 14, st.scroll);
  return xfPoint(d.term.xf, p.x, p.y);
}

function hints(f: Frame) {
  const t = f.t;
  f.overlay.lyrics = 'auto';
  f.overlay.credits = 'auto';
  // the chant band (y 820–1010) sits on cream wallpaper from the restore to the slam
  f.overlay.tone = t < 63.8 ? 'dark' : t < T.slam + 0.1 ? 'light' : 'dark';
}

/** Clean P1PE look on the cream desktop; engine defaults at both handoffs. */
function post(f: Frame) {
  const t = f.t;
  if (t >= T.stop) return; // B6: integrations owns post from 76.4 (defaults)
  const d0 = { ...f.post }; // the engine defaults for this frame
  const k = Math.min(seg(t, T.click, T.restoreEnd), 1 - seg(t, T.slam, T.stop));
  // chromatic fringing goes first: 1 px pixel chrome near the frame edges must stay clean
  const kc = Math.min(seg(t, T.click, T.click + 0.1), 1 - seg(t, T.slam, T.stop));
  f.post.vignette = lerp(d0.vignette, 0.07, k);
  f.post.ca = lerp(d0.ca, 0.0004, kc);
  f.post.grain = lerp(d0.grain, 0.03, k);
  // the groove: a whole-pixel drop on each kick, a lighter one on the snares (crisp: integer px)
  if (t >= T.restoreEnd && t < T.slam) {
    const bar = Math.floor((t - T.start) / 1.6);
    const off = t - (T.start + bar * 1.6);
    const since = (a: number) => (off >= a ? off - a : 99);
    const kick = Math.exp(-Math.min(since(0), since(0.8)) / 0.05);
    const snare = Math.exp(-Math.min(since(0.6), since(1.2)) / 0.04);
    f.post.shake = [0, -Math.round(2 * kick + snare)];
  }
}

export type { View };
export default scene;
