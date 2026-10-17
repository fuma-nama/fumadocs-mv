import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Engine } from '../../engine/engine';
import { ease, seg, clamp, lerp } from '../../engine/anim';
import { at, BEAT } from '../../engine/time';
import { toonMat } from '../../engine/three-kit';
import { FONTS } from '../../engine/draw2d';
import { C } from '../_shared/palette';
import type { Rect } from './page';
import { rectOf } from './page';
import { texFromCanvas } from './plates';
import type { Stage } from './stage';
import { cubicBezier, project, uiMat } from './world';

/**
 * S4 · ⌘K (bar 15): the search trigger's real kbd chips extrude into toon keycaps, ⌘ goes down
 * on the downbeat and K on the next 8th; the real search dialog (plates) opens with Fumadocs' own
 * fd-dialog-in easing, "contents" is typed on 16ths (real result states), ArrowDown lands on the
 * "Table of Contents" heading on beat 4, Enter on the bar-16 downbeat.
 */

const BASE = '/plates/';
/* eslint-disable @typescript-eslint/no-explicit-any */

export const K_CMD = at(15); // 22.4 ⌘ on the kick
export const K_K = at(15, 2); // 22.8 K on the snare → the dialog opens
export const TYPE0 = at(15, 2.5); // 23.0 'c' on the kick: the result list drops open
export const ARROW = at(15, 4.5); // 23.8
export const ENTER = at(16); // 24.0 on the kick

const dialogIn = cubicBezier(0.16, 1, 0.3, 1);
const easeCss = cubicBezier(0.25, 0.1, 0.25, 1);

interface State {
  q: string;
  tex: THREE.Texture;
  rect: Rect; // crop rect (css)
  caret: Rect;
}

export class Search {
  states: State[] = [];
  /** own pass: rendered over the (blurred, dimmed) page like the real overlay */
  readonly scene = new THREE.Scene();
  /** same transform as the page group: children use page-local css coords */
  readonly root = new THREE.Group();
  readonly dialog: THREE.Mesh;
  readonly dlgGroup = new THREE.Group();
  readonly keys: THREE.Group[] = [];
  private legend: { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; ch: string; hot: number }[] = [];
  private stIdx = -1;

  private constructor(readonly st: Stage) {
    this.dialog = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), uiMat(null, { depthTest: false }));
    this.dialog.renderOrder = 200;
    this.dialog.userData.noEdges = true;
    this.dlgGroup.add(this.dialog);
    this.dlgGroup.visible = false;
    this.root.position.copy(st.page.position);
    this.root.add(this.dlgGroup);
    this.scene.add(this.root);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dl = new THREE.DirectionalLight(0xffffff, 2.0);
    dl.position.set(-300, 500, 900);
    this.scene.add(dl);
  }

  static async load(e: Engine, st: Stage): Promise<Search> {
    const s = new Search(st);
    const man: any = await e.assets.loadJSON(BASE + 'manifest.json');
    const ent = man.read?.['search.contents.orange.light'];
    if (ent?.states) {
      const imgs = await Promise.all((ent.states as any[]).map((x) => e.assets.image(BASE + x.dialog)));
      const boxes = await Promise.all((ent.states as any[]).map((x) => e.assets.loadJSON<any>(BASE + x.boxes)));
      (ent.states as any[]).forEach((x, i) => {
        const d = rectOf(boxes[i].dialog.css);
        const r: Rect = { x: d.x - 48, y: d.y - 24, w: d.w + 96, h: d.h + 96 };
        const cv = document.createElement('canvas');
        cv.width = r.w * 2;
        cv.height = r.h * 2;
        cv.getContext('2d')!.drawImage(imgs[i], r.x * 2, r.y * 2, r.w * 2, r.h * 2, 0, 0, r.w * 2, r.h * 2);
        s.states.push({ q: x.value ?? '', tex: texFromCanvas(cv), rect: r, caret: rectOf(boxes[i].caret) });
      });
    }
    s.buildKeys();
    return s;
  }

  private buildKeys() {
    const kbd = this.st.A.model.search.kbd;
    const geo = new RoundedBoxGeometry(1, 1, 0.62, 6, 0.16);
    ['⌘', 'K'].forEach((ch, i) => {
      const g = new THREE.Group();
      const cap = new THREE.Mesh(geo, toonMat('#f4f3ef', { steps: 3 }));
      cap.position.z = 0.31;
      g.add(cap);
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 256;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.NoColorSpace;
      tex.premultiplyAlpha = true;
      const top = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), uiMat(tex));
      top.position.z = 0.625;
      top.userData.noEdges = true;
      top.renderOrder = 210;
      g.add(top);
      g.visible = false;
      g.userData.home = kbd[i];
      this.root.add(g);
      this.keys.push(g);
      this.legend.push({ cv, tex, ch, hot: -1 });
    });
  }

  private drawLegend(i: number, hot: number) {
    const L = this.legend[i];
    const h = Math.round(hot * 20) / 20;
    if (h === L.hot) return;
    L.hot = h;
    const c = L.cv.getContext('2d')!;
    c.clearRect(0, 0, 256, 256);
    c.fillStyle = h > 0 ? `rgba(250,128,35,${0.12 * h})` : 'rgba(0,0,0,0)';
    c.beginPath();
    c.roundRect(14, 14, 228, 228, 40);
    c.fill();
    c.fillStyle = h > 0.5 ? C.ORANGE : C.INK;
    c.font = `500 ${L.ch === '⌘' ? 132 : 124}px ${FONTS.ui}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(L.ch, 128, L.ch === '⌘' ? 134 : 138);
    L.tex.needsUpdate = true;
  }

  /** visible window of the whole ⌘K moment */
  static on(t: number) {
    return t >= K_CMD - 0.5 && t < ENTER + 0.45;
  }

  /** dialog open amount (opacity) and its scale, real fd-dialog-in / fd-dialog-out */
  dialogAnim(t: number): { o: number; s: number } {
    if (t < K_K) return { o: 0, s: 1.06 };
    if (t < ENTER) {
      const p = dialogIn(clamp((t - K_K) / 0.3));
      return { o: p, s: lerp(1.06, 1, p) };
    }
    const p = dialogIn(clamp((t - ENTER - 0.06) / 0.3));
    return { o: 1 - p, s: lerp(1, 1.04, p) };
  }

  /** backdrop amount (fd-fade-in / out, 300 ms ease) */
  backdrop(t: number): number {
    if (t < K_K) return 0;
    if (t < ENTER) return easeCss(clamp((t - K_K) / 0.3));
    return 1 - easeCss(clamp((t - ENTER - 0.06) / 0.3));
  }

  /** which state texture shows at t */
  stateAt(t: number): number {
    if (!this.states.length) return -1;
    if (t < TYPE0) return 0;
    const n = Math.min(8, 1 + Math.floor((t - TYPE0) / (BEAT / 4) + 1e-6));
    if (t >= ARROW) return Math.min(this.states.length - 1, 9);
    return Math.min(n, this.states.length - 1);
  }

  pose(t: number) {
    const on = Search.on(t);
    // keycaps pop out of the trigger on the bar-14 beat-4 snare (22.0), ⌘ down on the 22.4 kick,
    // K on the 22.8 snare, then they sink home
    const out = ease.outBack(seg(t, K_CMD - 0.46, K_CMD - 0.1), 1.25);
    const home = ease.inOutCubic(seg(t, K_K + 0.12, K_K + 0.42));
    const showKeys = on && out > 0 && home < 1;
    this.keys.forEach((g, i) => {
      g.visible = showKeys;
      if (!showKeys) return;
      const h = g.userData.home as Rect;
      const size = lerp(22, 190, out * (1 - home));
      const cx0 = h.x + h.w / 2, cy0 = h.y + h.h / 2;
      const cx1 = 150 + i * 214, cy1 = 300;
      const k = out * (1 - home);
      const rel = 1 - seg(t, K_K + 0.06, K_K + 0.16, ease.inOutCubic);
      const press = (i === 0 ? seg(t, K_CMD, K_CMD + 0.05, ease.outCubic) : seg(t, K_K, K_K + 0.05, ease.outCubic)) * rel;
      g.position.set(lerp(cx0, cx1, k), -lerp(cy0, cy1, k), lerp(4, 250, k) - press * 34);
      g.scale.set(size, size, size * lerp(0.15, 1, k));
      g.rotation.set(lerp(0, 0.18, k), lerp(0, -0.12 + i * 0.08, k), 0);
      this.drawLegend(i, Math.max(press, i === 0 ? seg(t, K_CMD - 0.1, K_CMD, ease.linear) * 0.4 : 0));
    });
    // dialog plane
    const d = this.dialogAnim(t);
    const si = this.stateAt(t);
    this.dlgGroup.visible = on && d.o > 0.001 && si >= 0;
    if (this.dlgGroup.visible) {
      const s = this.states[si];
      const m = this.dialog.material as THREE.ShaderMaterial;
      if (si !== this.stIdx) {
        m.uniforms.map.value = s.tex;
        this.stIdx = si;
      }
      m.uniforms.opacity.value = d.o;
      // scale about the dialog element's centre (transform-origin 50% 50%)
      const r = s.rect;
      this.dialog.scale.set(r.w * d.s, r.h * d.s, 1);
      const cx = r.x + r.w / 2;
      const cy = r.y + 24 + (r.h - 96) / 2;
      this.dialog.position.set(cx + (r.x + r.w / 2 - cx) * d.s, -(cy + (r.y + r.h / 2 - cy) * d.s), 60);
    }
  }

  /** orange impact ring under each key as it bottoms out */
  drawPress(c: CanvasRenderingContext2D, t: number) {
    const v = new THREE.Vector3();
    [K_CMD, K_K].forEach((tk, i) => {
      const p = seg(t, tk, tk + 0.4, ease.outCubic);
      if (p <= 0 || p >= 1 || !this.keys[i].visible) return;
      this.keys[i].getWorldPosition(v);
      const P = project(this.st.cam, v.x, v.y, v.z);
      v.x += 95;
      const Q = project(this.st.cam, v.x, v.y, v.z);
      const r = Math.hypot(Q.x - P.x, Q.y - P.y);
      c.save();
      c.strokeStyle = C.ORANGE;
      c.lineWidth = 2;
      c.globalAlpha = (1 - p) * 0.9;
      c.beginPath();
      c.ellipse(P.x, P.y, r * (1.1 + 0.9 * p), r * (0.8 + 0.6 * p), -0.12, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    });
  }

  /** orange text caret inside the input (the real one is hidden in the captures) */
  drawCaret(c: CanvasRenderingContext2D, t: number) {
    const si = this.stateAt(t);
    const d = this.dialogAnim(t);
    if (si < 0 || d.o < 0.5) return;
    const cr = this.states[si].caret;
    const typing = t >= TYPE0 - 0.05 && t < ARROW;
    const blink = typing ? 1 : Math.floor((t - K_K) / BEAT) % 2 === 0 ? 1 : 0;
    if (!blink) return;
    const v = new THREE.Vector3();
    const P = (x: number, y: number) => {
      v.set(x, -y, 60);
      this.root.localToWorld(v);
      return project(this.st.cam, v.x, v.y, v.z);
    };
    const a = P(cr.x + 0.5, cr.y);
    const b = P(cr.x + 0.5, cr.y + cr.h);
    c.save();
    c.globalAlpha = d.o;
    c.strokeStyle = C.ORANGE;
    c.lineWidth = Math.max(1.5, Math.hypot(b.x - a.x, b.y - a.y) / 14);
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
    c.restore();
  }
}
