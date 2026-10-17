import * as THREE from 'three';
import { ease, clamp, mulberry32 } from '../../engine/anim';
import { at, BEAT } from '../../engine/time';
import type { Gfx } from '../../engine/gfx';
import { render3D } from '../../engine/three-kit';
import { FONTS, text, measure } from '../../engine/draw2d';
import { C } from '../_shared/palette';
import type { PageAssets, Rect } from './page';
import { uiMat } from './world';
import { cameraBlurCam } from './mblur';

/**
 * S3 · forest of words (bars 13–14) — a typographic multiplane. A misty paper space; tall trunks
 * made of the page's own sentences, headings and code, set vertically, stand at many depths, and
 * the camera walks forward between them (parallax, scale, haze, three-pass depth of field). Every
 * element is a flat plane facing the camera: nothing is ever seen at an angle. The real components
 * are the heroes: paper cards that pop in on the hits, ride gently with the walker while in focus
 * and pop out before the next one (code block + copy ✓, callouts + tabs, steps + cards, the page
 * title). Trunks grow in on the grid (lines 16ths, headings 8ths, code on beats). A ground mist
 * keeps the lyric band and the credit corner clean.
 * World units ≈ css px: X right, Y up, the camera looks down −Z.
 */

const FOV = 40;
const F = 540 / Math.tan(((FOV / 2) * Math.PI) / 180);
const GROUND = -820;
const EYE_Y = 40;
/** walk speed (css/s) and the hero focus distance */
export const V = 1150;
export const D_F = 1450;
/** heroes in focus on the hits: snare 19.6 · kicks 20.2 · 20.8 · 21.4 */
export const HERO_TIMES = [at(13, 2), at(13, 3.5), at(14, 1), at(14, 2.5)];
/** the forest is on screen from the dive (F_IN) to the swap back to the real page (F_SWAP) */
export const F_IN = at(13) + 0.22; // 19.42
export const F_SWAP = at(14, 3.5); // 21.8, on the kick
const sp = (x: number, tau = 0.18) => tau * Math.log1p(Math.exp(x / tau));
/** camera Z (forward = −Z): constant walk with soft start/stop */
export const camZ = (t: number) => -V * (sp(t - (at(13) + 0.1)) - sp(t - (F_SWAP - 0.2)));
const camX = (t: number) => Math.sin((t - at(13)) * 2.2) * 26;
const camRot = (t: number): [number, number, number] => [-0.035, Math.sin((t - at(13)) * 1.3) * 0.012, Math.sin((t - at(13)) * 1.7) * 0.008];

const E8 = BEAT / 2;
interface HeroSpec {
  key: string;
  title: string;
  tags: [string, number, number][];
  /** screen centre (px) while on stage */
  sx: number;
  sy: number;
  /** extra depth beyond the focus distance */
  dz?: number;
  t: number;
  tIn: number;
  tOut: number;
  states?: [number, string][];
  statePrefix?: string;
}
const S16 = BEAT / 4;
const HEROES: HeroSpec[] = [
  { key: 'hero:code', title: 'CODE · shiki · source.config.ts', tags: [], sx: 1340, sy: 400, t: HERO_TIMES[0], tIn: at(13, 1.5), tOut: at(13, 3) - S16, statePrefix: 'copy', states: [[-9, 'idle'], [-0.12, 'hover-button'], [-0.04, 'pressed'], [0, 'copied']] },
  { key: 'hero:callouts-tabs', title: 'CALLOUT · TABS', tags: [], sx: 600, sy: 410, t: HERO_TIMES[1], tIn: at(13, 3), tOut: at(14, 1) - E8 - S16, statePrefix: 'tabs', states: [[-9, 'next-js'], [BEAT / 2, 'react-router'], [BEAT, 'tanstack-start']] },
  { key: 'hero:steps', title: 'STEPS · 01 — 03', tags: [], sx: 1340, sy: 430, t: HERO_TIMES[2], tIn: at(14, 1) - E8, tOut: at(14, 2) - S16 },
  { key: 'hero:cards', title: 'CARDS · Layouts', tags: [], sx: 400, sy: 330, dz: 760, t: HERO_TIMES[2] + E8, tIn: at(14, 1), tOut: at(14, 2) - S16 },
  { key: 'hero:header', title: 'H1 · Introduction', tags: [], sx: 960, sy: 430, t: HERO_TIMES[3], tIn: at(14, 2), tOut: 99 },
];
/** heroes ride at this depth (≈1.25 px per css px: the real UI reads on a phone), approaching slowly */
const HERO_D = 1190;
/** heroes ride with the walker, approaching only this fast (css/s): a gentle push, legible */
const HERO_APPROACH = 240;
/**
 * The title card's push: it ends with the word "Introduction" (H1_ANCHOR, page css) centred at
 * SWAP_SCALE px per css px — exactly the framing of the page camera that takes over at F_SWAP.
 */
export const H1_ANCHOR = { x: 384.1, y: 113 };
export const SWAP_SCALE = 11;
const PUSH0 = at(14, 2.5) + 0.08;

function heroDepth(h: HeroSpec, t: number): number {
  const base = HERO_D + (h.dz ?? 0) - HERO_APPROACH * (t - h.t);
  if (h.key !== 'hero:header') return base;
  // depth scales the card by F/d: interpolate the scale (not the depth) for an even push
  const k = ease.inCubic(clamp((t - PUSH0) / (F_SWAP - PUSH0)));
  const s0 = F / base, s1 = SWAP_SCALE;
  return F / (s0 * Math.pow(s1 / s0, k));
}
function heroScreen(h: HeroSpec, rect: Rect, t: number): [number, number] {
  if (h.key !== 'hero:header') return [h.sx, h.sy];
  const k = ease.inCubic(clamp((t - PUSH0) / (F_SWAP - PUSH0)));
  const s = F / heroDepth(h, t);
  // the anchor point travels from its on-stage spot to the frame centre while the card scales
  const ax0 = h.sx + (H1_ANCHOR.x - (rect.x + rect.w / 2)) * (F / heroDepth(h, PUSH0));
  const ay0 = h.sy + (H1_ANCHOR.y - (rect.y + rect.h / 2)) * (F / heroDepth(h, PUSH0));
  const ax = ax0 + (960 - ax0) * k, ay = ay0 + (540 - ay0) * k;
  return [ax - (H1_ANCHOR.x - (rect.x + rect.w / 2)) * s, ay - (H1_ANCHOR.y - (rect.y + rect.h / 2)) * s];
}

interface Trunk {
  mesh: THREE.Mesh;
  z: number;
  tPop: number;
  grow: number;
  /** optional exit: sinks back into the mist from this time (clears the way for a hero) */
  tSink?: number;
}
export interface Hero {
  spec: HeroSpec;
  group: THREE.Group;
  rect: Rect;
  overlays: { mesh: THREE.Mesh; states: [number, THREE.Texture][] }[];
}

interface Seg {
  text: string;
  font: string;
  size: number;
  weight: number;
  color: string;
}

/** paths, packages, commands and calls inside prose are set in mono (as inline code is on the page) */
const CODE_RE = /(npm run dev|npm create [\w-]+|https?:\/\/[^\s,]+?(?=[.,]?(?:\s|$))|[\w@.-]+\/[\w.\/[\]-]+|\w+\(\)|[\w-]+\.(?:ts|tsx|js|mjs|mdx|md|json|css))/g;

/** split prose into ui / mono segments */
function proseSegs(str: string, o: Omit<Seg, 'text'>): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of str.matchAll(CODE_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ ...o, text: str.slice(last, i) });
    out.push({ ...o, text: m[0], font: FONTS.code, size: o.size * 0.92, weight: Math.min(o.weight, 500) });
    last = i + m[0].length;
  }
  if (last < str.length) out.push({ ...o, text: str.slice(last) });
  return out;
}

/** a vertical trunk of text: the segments set bottom-to-top along one baseline (rotated −90°) */
function trunkTexture(segs: Seg[], scale = 1.5) {
  const probe = document.createElement('canvas').getContext('2d')!;
  const widths = segs.map((g) => {
    probe.font = `${g.weight} ${g.size}px ${g.font}`;
    return probe.measureText(g.text).width;
  });
  const len = Math.ceil(widths.reduce((a, b) => a + b, 0)) + 8;
  const maxSize = Math.max(...segs.map((g) => g.size));
  const thick = Math.ceil(maxSize * 1.45);
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(thick * scale);
  cv.height = Math.ceil(len * scale);
  const c = cv.getContext('2d')!;
  c.scale(scale, scale);
  c.translate(thick * 0.74, len - 4);
  c.rotate(-Math.PI / 2);
  let x = 0;
  segs.forEach((g, i) => {
    c.font = `${g.weight} ${g.size}px ${g.font}`;
    c.fillStyle = g.color;
    c.fillText(g.text, x, 0);
    x += widths[i];
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.premultiplyAlpha = true;
  tex.anisotropy = 8;
  return { tex, w: thick, h: len };
}

/** paper card behind a hero: rounded, opaque, soft drop shadow baked around it */
function cardBacking(w: number, h: number): THREE.Texture {
  const pad = 40;
  const cv = document.createElement('canvas');
  cv.width = w + pad * 2;
  cv.height = h + pad * 2;
  const c = cv.getContext('2d')!;
  c.shadowColor = 'rgba(40,30,10,0.2)';
  c.shadowBlur = 28;
  c.shadowOffsetY = 12;
  c.fillStyle = '#F5F5F5';
  c.beginPath();
  c.roundRect(pad, pad, w, h, 14);
  c.fill();
  c.shadowColor = 'transparent';
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(10,10,11,0.08)';
  c.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.premultiplyAlpha = true;
  return tex;
}

/**
 * A vertical gradient as a full-frame texture with a triangular ±1-level dither baked in: a
 * stretched 8-bit gradient would band (≈30 levels over the frame height).
 */
function gradientTexture(stops: [number, string][], w = 960, h = 540): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  const g = c.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of stops) g.addColorStop(o, col);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // the canvas stores 8-bit, so re-derive each row's exact value and dither it
  const exact = document.createElement('canvas');
  exact.width = 1;
  exact.height = h * 16;
  const ec = exact.getContext('2d', { willReadFrequently: true })!;
  const ge = ec.createLinearGradient(0, 0, 0, h * 16);
  for (const [o, col] of stops) ge.addColorStop(o, col);
  ec.fillStyle = ge;
  ec.fillRect(0, 0, 1, h * 16);
  const ed = ec.getImageData(0, 0, 1, h * 16).data;
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  const rnd = mulberry32(99);
  for (let y = 0; y < h; y++) {
    // average 16 sub-rows for a fractional (higher-precision) row value
    const acc = [0, 0, 0, 0];
    for (let k = 0; k < 16; k++) for (let ch = 0; ch < 4; ch++) acc[ch] += ed[(y * 16 + k) * 4 + ch] / 16;
    for (let x = 0; x < w; x++) {
      const n = rnd() + rnd() - 1;
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 4; ch++) d[i + ch] = Math.max(0, Math.min(255, Math.round(acc[ch] + n)));
    }
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.premultiplyAlpha = true;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

export class Forest {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(FOV, 16 / 9, 20, 30000);
  private trunks: Trunk[] = [];
  private heroes: Hero[] = [];
  private sky: THREE.Texture;
  private fog: THREE.Texture;

  constructor(A: PageAssets) {
    this.sky = gradientTexture([[0, '#D3C9B5'], [0.55, '#E6E0D2'], [1, '#EFEBE2']]);
    this.fog = gradientTexture([[0, 'rgba(240,237,229,0)'], [0.6, 'rgba(240,237,229,0)'], [0.78, 'rgba(240,237,229,0.9)'], [0.86, 'rgba(240,237,229,0.97)'], [1, 'rgba(240,237,229,1)']]);
    for (const h of HEROES) {
      const crop = A.crops.get(h.key);
      if (!crop) continue;
      const r = crop.rect;
      const g = new THREE.Group();
      const back = new THREE.Mesh(new THREE.PlaneGeometry(r.w + 80, r.h + 80), uiMat(cardBacking(r.w, r.h)));
      back.position.z = -0.6;
      g.add(back, new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h), uiMat(crop.tex)));
      const overlays: Hero['overlays'] = [];
      const first = h.statePrefix && h.states ? A.crops.get(`${h.statePrefix}:${h.states[0][1]}`) : undefined;
      if (first && h.states) {
        const states: [number, THREE.Texture][] = [];
        for (const [dt, name] of h.states) {
          const s = A.crops.get(`${h.statePrefix}:${name}`);
          if (s) states.push([h.t + dt, s.tex]);
        }
        const br = first.rect;
        const om = new THREE.Mesh(new THREE.PlaneGeometry(br.w, br.h), uiMat(first.tex));
        om.position.set(br.x + br.w / 2 - (r.x + r.w / 2), -(br.y + br.h / 2 - (r.y + r.h / 2)), 0.4);
        g.add(om);
        overlays.push({ mesh: om, states });
      }
      g.visible = false;
      this.scene.add(g);
      this.heroes.push({ spec: h, group: g, rect: r, overlays });
    }
    // trunk texts: the page's own sentences, headings and code
    const rnd = mulberry32(11);
    const sentences: string[] = [];
    const heads: string[] = [];
    const codes: string[] = [];
    for (const b of A.model.blocks) {
      if (b.rect.y > 3800) continue;
      if ((b.kind === 'p' || b.kind === 'callout') && b.text) sentences.push(...b.text.split(/(?<=[.:!?])\s+/).filter((x) => x.length > 12));
      else if ((b.kind === 'h2' || b.kind === 'h3') && b.text) heads.push(b.text);
      else if (b.kind === 'code' && b.code) for (const l of b.code) if (l.trim().length > 10) codes.push(l.trim());
    }
    let si = 0, hi = 0, ci = 0;
    const lineText = () => {
      let s = '';
      while (s.length < 70 + rnd() * 70) s += (s ? '   ·   ' : '') + sentences[si++ % sentences.length];
      return s;
    };
    const add = (kind: 'line' | 'head' | 'code', tPop: number, dPop: number) => {
      const str = kind === 'line' ? lineText() : kind === 'head' ? heads[hi++ % heads.length] : codes[ci++ % codes.length];
      const style = kind === 'line'
        ? { font: FONTS.ui, size: 30, weight: 400, color: 'rgba(90,90,90,0.72)' }
        : kind === 'head'
          ? { font: FONTS.ui, size: 92, weight: 600, color: rnd() < 0.22 ? C.ORANGE : '#0A0A0A' }
          : { font: FONTS.code, size: 28, weight: 500, color: ['#6F42C1', '#005CC5', '#D73A49', '#22863A'][Math.floor(rnd() * 4)] };
      const { tex, w, h } = trunkTexture(kind === 'line' ? proseSegs(str, style) : [{ ...style, text: str }], kind === 'head' ? 1 : 1.5);
      // a corridor stays open for the walker
      const side = rnd() < 0.5 ? -1 : 1;
      const x = side * (300 + Math.pow(rnd(), 0.8) * 2300);
      const z = camZ(tPop) - dPop;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), uiMat(tex, { depthWrite: false }));
      mesh.position.set(x, GROUND + h / 2, z);
      mesh.visible = false;
      this.scene.add(mesh);
      this.trunks.push({ mesh, z, tPop, grow: kind === 'head' ? 0.18 : 0.12 });
    };
    // three headings walk through the focus band between the heroes, on the free side: the trees are words
    const feature = (str: string, tFocus: number, sx: number, tail?: string, baseY?: number, tSink?: number) => {
      const segs: Seg[] = [{ text: str, font: FONTS.ui, size: 112, weight: 650, color: '#0A0A0A' }];
      if (tail) segs.push({ text: tail, font: FONTS.ui, size: 60, weight: 500, color: '#3A3A3A' });
      const { tex, w, h } = trunkTexture(segs, 1);
      const x = ((sx - 960) * D_F) / F;
      const z = camZ(tFocus) - D_F;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), uiMat(tex, { depthWrite: false }));
      // base on the ground, or raised so the trunk's first word sits at screen y = baseY at focus
      const base = baseY === undefined ? GROUND : EYE_Y - ((baseY - 540) * D_F) / F;
      mesh.position.set(x, base + h / 2, z);
      mesh.visible = false;
      this.scene.add(mesh);
      this.trunks.push({ mesh, z, tPop: Math.round((tFocus - 1.3) / E8) * E8, grow: 0.22, tSink });
    };
    // each passes through focus in a window when its side of the frame is free of heroes
    feature('Start the dev server', at(13, 3) + 0.05, 1600);
    // passes focus on the 20.4 snare (「も」 of 森) on the free right side, between the code card and the steps
    // …and sinks back into the mist on the 8th before the steps card takes that side
    feature('Layouts', at(13, 4), 1250, '   Docs · Notebook · Flux · Glass · Spacious', 830, at(14, 1) - E8 - 0.12);
    feature('Table of Contents', at(14, 2), 1750);
    // the forest that is already there when we arrive, near and far
    for (let i = 0; i < 46; i++) add(i % 5 === 0 ? 'head' : i % 7 === 0 ? 'code' : 'line', F_IN - 1, 500 + rnd() * 6200);
    // and the forest that grows on the grid as we walk
    const G16 = BEAT / 4;
    for (let tq = F_IN, n = 0; tq < at(14, 3); tq += G16, n++) {
      add('line', tq, 2600 + rnd() * 3400);
      add('line', tq, 2600 + rnd() * 3400);
      if (n % 2 === 0) add('head', tq, 3000 + rnd() * 3000);
      if (n % 4 === 2) add('code', tq, 2600 + rnd() * 3000);
    }
  }

  /** the camera at time x (also used for motion blur) */
  camAt(x: number, into: THREE.PerspectiveCamera = this.cam.clone()): THREE.PerspectiveCamera {
    into.position.set(camX(x), EYE_Y, camZ(x));
    into.rotation.set(...camRot(x));
    into.updateMatrixWorld(true);
    return into;
  }

  /** pose for time t; returns the heroes on stage */
  pose(t: number): Hero[] {
    this.camAt(t, this.cam);
    const cz = camZ(t);
    for (const tr of this.trunks) {
      const d = cz - tr.z;
      const on = t >= tr.tPop && d > 40;
      tr.mesh.visible = on;
      if (!on) continue;
      const sink = tr.tSink === undefined ? 0 : ease.inCubic(clamp((t - tr.tSink) / 0.12));
      const g = ease.outCubic(clamp((t - tr.tPop) / tr.grow)) * (1 - sink);
      tr.mesh.visible = g > 0.001;
      const u = (tr.mesh.material as THREE.ShaderMaterial).uniforms;
      u.clip.value.set(0, 1 - g, 1, 1);
      // atmospheric perspective: far trunks dissolve into the paper mist
      u.opacity.value = clamp((7000 - d) / 3600) * Math.min(1, g * 1.4);
      tr.mesh.layers.set(d > D_F * 1.3 ? 0 : d > D_F * 0.72 ? 1 : 2);
    }
    const on: Hero[] = [];
    const v = new THREE.Vector3();
    for (const h of this.heroes) {
      const s = h.spec;
      const vis = t >= s.tIn && t < s.tOut + 0.16;
      h.group.visible = vis;
      if (!vis) continue;
      const d = heroDepth(s, t);
      const [sx, sy] = heroScreen(s, h.rect, t);
      h.group.position.copy(v.set((sx - 960) * (d / F), (540 - sy) * (d / F), -d).applyMatrix4(this.cam.matrixWorld));
      h.group.quaternion.copy(this.cam.quaternion);
      const pin = ease.outBack(clamp((t - s.tIn) / 0.28), 1.6);
      const pout = ease.inCubic(clamp((t - s.tOut) / 0.14));
      const sc = (0.84 + 0.16 * pin) * (1 + 0.1 * pout);
      h.group.scale.set(sc, sc, 1);
      const op = clamp((t - s.tIn) / 0.1) * (1 - pout);
      h.group.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (m?.uniforms?.opacity) m.uniforms.opacity.value = op;
        o.layers.set(1);
      });
      for (const ov of h.overlays) {
        let tex = ov.states[0][1];
        for (const [ts, tx] of ov.states) if (t >= ts) tex = tx;
        (ov.mesh.material as THREE.ShaderMaterial).uniforms.map.value = tex;
      }
      on.push(h);
    }
    return on;
  }

  /** render: far (defocused) · focus (sharp) · near (strongly defocused) over the mist */
  render(gfx: Gfx, t: number): THREE.Texture {
    const pass = (key: string, layer: number, r: number, ss: number) => {
      this.cam.layers.set(layer);
      const tex = cameraBlurCam(gfx, render3D(gfx, this.scene, this.cam, { key, ss, clear: null }), (x) => this.camAt(x), t, key + ':mb', 0.5);
      return r > 0 ? gfx.blur(tex, r, key + ':dof') : tex;
    };
    const far = pass('read:f:far', 0, 7, 1);
    const focus = pass('read:f:focus', 1, 0, 2);
    const near = pass('read:f:near', 2, 14, 1);
    this.cam.layers.set(0);
    return gfx.compose(gfx.rt('read:f:comp'), '#EEEAE0', [{ tex: this.sky }, { tex: far }, { tex: focus }, { tex: near }, { tex: this.fog }]);
  }

  /** tags on the heroes: title (orange) + components, typed on as each arrives */
  drawLabels(c: CanvasRenderingContext2D, heroes: Hero[], t: number) {
    const v = new THREE.Vector3();
    for (const h of heroes) {
      const s = h.spec;
      if (s.key === 'hero:header' && t > F_SWAP - 0.3) continue;
      const P = (x: number, y: number) => {
        h.group.localToWorld(v.set(-h.rect.w / 2 + x, h.rect.h / 2 - y, 0.5));
        v.project(this.cam);
        return { x: (v.x * 0.5 + 0.5) * 1920, y: (0.5 - v.y * 0.5) * 1080 };
      };
      // one tag per hero, outside the card, above its top-left corner
      const labels = [{ s: s.title, x: 2, y: -14, t: s.t - BEAT * 0.75, accent: true }];
      const fade = s.tOut < 90 ? 1 - clamp((t - s.tOut) / 0.1) : 1;
      c.save();
      for (const l of labels) {
        const k = clamp((t - l.t) / 0.14);
        if (k <= 0) continue;
        const p = P(l.x, l.y);
        if (p.x < -300 || p.x > 2200 || p.y < 24 || p.y > 1060) continue;
        const str = l.s.slice(0, Math.round(l.s.length * k));
        c.globalAlpha = fade;
        c.fillStyle = l.accent ? C.ORANGE : C.INK;
        c.fillRect(Math.round(p.x), Math.round(p.y - 11), 9, 9);
        const w = measure(c, str, { font: 'mono', size: 17 });
        c.globalAlpha = 0.92 * fade;
        c.fillStyle = C.PAPER;
        c.fillRect(Math.round(p.x + 15), Math.round(p.y - 17), Math.round(w + 14), 24);
        c.globalAlpha = fade;
        text(c, str, p.x + 22, p.y, { font: 'mono', size: 17, color: C.INK });
      }
      c.restore();
    }
  }
}
