import * as THREE from 'three';
import { Gfx, defaultPost, type PostState } from './gfx';
import { Layer2D, text } from './draw2d';
import { Assets } from './assets';
import { audio, type AudioData } from './audio';
import { FPS } from './time';

/** Handoff window between two consecutive scenes. */
export interface Boundary {
  /** the musical cut point (s) — the incoming scene's nominal start */
  at: number;
  /** both scenes render during [from, to) */
  from: number;
  to: number;
  /** which side composes the final image during the window ('in' = incoming scene). null = hard cut at `at`. */
  owner: 'in' | 'out' | null;
}

export interface FrameBoundary extends Boundary {
  role: 'in' | 'out';
  /** true if this scene composes the final image (it receives `Frame.other`) */
  isOwner: boolean;
  /** progress through the window 0..1 */
  p: number;
}

export interface Frame {
  /** global time (s) */
  t: number;
  /** time since this scene's nominal start (s); negative while an incoming scene pre-rolls */
  lt: number;
  /** global frame index */
  frame: number;
  fps: number;
  W: number;
  H: number;
  e: Engine;
  /** global finishing-pass parameters for this frame; scenes may modify */
  post: PostState;
  /** set while inside a handoff window */
  boundary?: FrameBoundary;
  /** the other scene's finished image (only given to the boundary owner) */
  other?: THREE.Texture;
  /** hints for the global overlay (lyrics/credits) drawn on top of the scene; scenes may modify */
  overlay: OverlayHints;
}

export interface OverlayHints {
  /** 'auto' = global lyric renderer draws; 'hidden' = none; 'scene' = this scene draws lyrics itself */
  lyrics: 'auto' | 'hidden' | 'scene';
  /** optional placement/style override for the global lyric renderer (overlay-defined keys) */
  lyricStyle?: string;
  lyricAnchor?: [x: number, y: number];
  /** colour scheme hint so overlay text stays legible: 'dark' background or 'light' background */
  tone?: 'dark' | 'light';
  credits: 'auto' | 'hidden';
}

/** Global overlay drawn over every frame (lyrics, credits). */
export type Overlay = (f: Frame, scene: THREE.Texture) => THREE.Texture;

/** What a scene module default-exports. */
export interface SceneImpl {
  /** one-time setup: load assets, build objects */
  setup?(e: Engine): Promise<void> | void;
  /** per-frame async preparation (image-sequence frames etc.) */
  prepare?(f: Frame): Promise<void> | void;
  /** draw the frame; return the scene image (sRGB premultiplied texture, frame size) */
  render(f: Frame): THREE.Texture;
}

export interface SceneEntry {
  id: string;
  start: number;
  end: number;
  load: () => Promise<{ default: SceneImpl }>;
}

interface Loaded {
  entry: SceneEntry;
  impl: SceneImpl;
  ready: Promise<void>;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly gfx: Gfx;
  readonly assets = new Assets();
  readonly audio: AudioData = audio;
  private layers = new Map<string, Layer2D>();
  private loaded = new Map<string, Promise<Loaded>>();
  entries: SceneEntry[] = [];
  boundaries: Boundary[] = [];
  /** ids allowed to load (others render a stand-in); undefined = all */
  only?: string[];
  /** the frame currently being rendered (for helpers) */
  current?: Frame;
  overlay?: Overlay;

  /** design space is always 1920×1080; `scale` maps it to the real output size */
  readonly W = 1920;
  readonly H = 1080;
  readonly scale: number;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly PW: number,
    readonly PH: number,
    readonly fps = FPS,
  ) {
    this.scale = PW / 1920;
    canvas.width = PW;
    canvas.height = PH;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(PW, PH, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.gfx = new Gfx(this.renderer, this.W, this.H, this.scale);
  }

  /** Persistent 2D canvas layer, size in design units (default full frame). Prefix keys with your scene id. */
  layer(key: string, w = this.W, h = this.H): Layer2D {
    let l = this.layers.get(key);
    if (!l || l.w !== w || l.h !== h) {
      l = new Layer2D(w, h, this.scale);
      this.layers.set(key, l);
    }
    return l;
  }

  configure(entries: SceneEntry[], boundaries: Boundary[]) {
    this.entries = [...entries].sort((a, b) => a.start - b.start);
    this.boundaries = boundaries;
  }

  private load(entry: SceneEntry): Promise<Loaded> {
    let p = this.loaded.get(entry.id);
    if (!p) {
      const allowed = !this.only || this.only.includes(entry.id);
      p = (allowed ? entry.load().then((m) => m.default) : Promise.resolve(standIn(entry.id, 'not loaded (only=…)')))
        .catch((err: unknown) => {
          console.error(`[scene ${entry.id}] failed to load`, err);
          return standIn(entry.id, String((err as Error)?.message ?? err), true);
        })
        .then((impl) => {
          const ready = Promise.resolve()
            .then(() => impl.setup?.(this))
            .catch((err: unknown) => {
              console.error(`[scene ${entry.id}] setup failed`, err);
              impl.render = standIn(entry.id, 'setup failed: ' + String((err as Error)?.message ?? err), true).render;
            });
          return { entry, impl, ready };
        });
      this.loaded.set(entry.id, p);
    }
    return p;
  }

  /** Load and set up every scene up front, calling `done` as each finishes. */
  preload(done?: () => void) {
    return Promise.all(this.entries.map((s) => this.load(s).then((l) => l.ready).then(done)));
  }

  /** Which scenes render at t. */
  plan(t: number): { main: SceneEntry; other?: SceneEntry; boundary?: Boundary } | null {
    for (let i = 0; i < this.boundaries.length; i++) {
      const b = this.boundaries[i];
      if (b.owner && t >= b.from && t < b.to) {
        const out = this.entries[i];
        const inn = this.entries[i + 1];
        if (!out || !inn) break;
        return b.owner === 'in' ? { main: inn, other: out, boundary: b } : { main: out, other: inn, boundary: b };
      }
    }
    const main = this.entries.find((s) => t >= s.start && t < s.end) ?? (t >= (this.entries.at(-1)?.end ?? 0) ? this.entries.at(-1) : undefined);
    return main ? { main } : null;
  }

  private frameFor(entry: SceneEntry, t: number, frame: number, post: PostState, b?: Boundary, isOwner = false): Frame {
    let boundary: FrameBoundary | undefined;
    if (b) {
      const role: 'in' | 'out' = Math.abs(entry.start - b.at) < 1e-6 ? 'in' : 'out';
      boundary = { ...b, role, isOwner, p: Math.min(1, Math.max(0, (t - b.from) / (b.to - b.from))) };
    }
    return { t, lt: t - entry.start, frame, fps: this.fps, W: this.W, H: this.H, e: this, post, boundary, overlay: { lyrics: 'auto', credits: 'auto' } };
  }

  /** Render frame index `frame` to the canvas; returns the final render target. */
  async renderFrame(frame: number) {
    const t = frame / this.fps;
    const post = defaultPost();
    const plan = this.plan(t);
    let out: THREE.Texture;
    if (!plan) {
      out = this.gfx.compose(this.gfx.rt('__empty'), '#000000', []);
    } else {
      const main = await this.load(plan.main);
      const other = plan.other ? await this.load(plan.other) : undefined;
      await main.ready;
      if (other) await other.ready;
      const fm = this.frameFor(plan.main, t, frame, post, plan.boundary, true);
      const fo = other ? this.frameFor(plan.other!, t, frame, post, plan.boundary, false) : undefined;
      await main.impl.prepare?.(fm);
      if (other && fo) await other.impl.prepare?.(fo);
      await this.assets.settle();
      if (other && fo) {
        // the non-owner renders first; its image is copied out of the shared pools
        this.current = fo;
        const to = other.impl.render(fo);
        const keep = this.gfx.rt('__other');
        this.gfx.copy(to, keep);
        fm.other = keep.texture;
      }
      this.current = fm;
      out = main.impl.render(fm);
      // lens effects (CA, shake) belong to the camera, not to lyrics/credits
      out = this.gfx.lens(out, post);
      if (this.overlay) {
        try {
          out = this.overlay(fm, out);
        } catch (err) {
          console.error('[overlay] failed', err);
        }
      }
    }
    const final = this.gfx.rt('__final');
    this.gfx.finish(out, final, post, frame);
    this.gfx.copy(final.texture, null);
    return final;
  }

  /** Read a render target as RGBA (bottom-up rows), real px. */
  readPixels(target: THREE.WebGLRenderTarget, buf?: Uint8Array): Uint8Array {
    const b = buf ?? new Uint8Array(this.PW * this.PH * 4);
    this.renderer.readRenderTargetPixels(target, 0, 0, this.PW, this.PH, b);
    return b;
  }
}

/** Placeholder scene: dark frame with the id (red when it is an error). */
export function standIn(id: string, msg: string, error = false): SceneImpl {
  return {
    render(f) {
      const L = f.e.layer(`__standin:${id}`);
      const c = L.begin(error ? '#3a0d0d' : '#111114');
      text(c, id.toUpperCase(), 60, 120, { font: 'mono', size: 48, color: error ? '#ff8a8a' : '#666' });
      text(c, msg.slice(0, 160), 60, 180, { font: 'mono', size: 20, color: error ? '#ffb3b3' : '#555' });
      text(c, `${f.t.toFixed(3)}s`, 60, f.H - 60, { font: 'mono', size: 24, color: '#555' });
      return L.end();
    },
  };
}
