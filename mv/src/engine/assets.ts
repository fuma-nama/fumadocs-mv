import * as THREE from 'three';
import { assetUrl } from './url';

/** Tracks in-flight loads so the renderer can await them before capturing a frame. */
export class Assets {
  private pending = new Set<Promise<unknown>>();
  private images = new Map<string, Promise<HTMLImageElement>>();
  private textures = new Map<string, THREE.Texture>();
  private json = new Map<string, Promise<unknown>>();

  track<T>(p: Promise<T>): Promise<T> {
    this.pending.add(p);
    p.finally(() => this.pending.delete(p));
    return p;
  }

  async settle() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  image(url: string): Promise<HTMLImageElement> {
    let p = this.images.get(url);
    if (!p) {
      p = new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => img.decode().then(() => res(img), () => res(img));
        img.onerror = () => rej(new Error('image failed: ' + url));
        img.src = assetUrl(url);
      });
      this.images.set(url, this.track(p));
    }
    return p;
  }

  /**
   * Texture from an image URL. `srgb: true` when used as a material map in a 3D scene
   * (three decodes to linear); leave false for compositor/2D use (raw sRGB values).
   */
  async texture(url: string, o: { srgb?: boolean; mipmaps?: boolean; nearest?: boolean } = {}): Promise<THREE.Texture> {
    const key = `${url}|${o.srgb ? 1 : 0}|${o.mipmaps === false ? 0 : 1}|${o.nearest ? 1 : 0}`;
    const hit = this.textures.get(key);
    if (hit) return hit;
    const img = await this.image(url);
    const t = new THREE.Texture(img);
    t.colorSpace = o.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.generateMipmaps = o.mipmaps !== false && !o.nearest;
    t.minFilter = o.nearest ? THREE.NearestFilter : t.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.magFilter = o.nearest ? THREE.NearestFilter : THREE.LinearFilter;
    t.anisotropy = 16;
    t.needsUpdate = true;
    this.textures.set(key, t);
    return t;
  }

  loadJSON<T = unknown>(url: string): Promise<T> {
    let p = this.json.get(url);
    if (!p) {
      p = this.track(fetch(assetUrl(url)).then((r) => {
        if (!r.ok) throw new Error('json failed: ' + url);
        return r.json();
      }));
      this.json.set(url, p);
    }
    return p as Promise<T>;
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => img.decode().then(() => res(img), () => res(img));
    img.onerror = () => rej(new Error('image failed: ' + url));
    img.src = assetUrl(url);
  });
}

/**
 * Frame-indexed image sequence (e.g. UI plates captured at 60 fps). Frames load on demand;
 * call `prepare(i)` in a scene's prepare() hook, then `get(i)` in render().
 */
export class ImageSequence {
  private cache = new Map<number, HTMLImageElement>();
  private order: number[] = [];
  constructor(
    readonly assets: Assets,
    readonly pattern: (i: number) => string,
    readonly count: number,
    readonly keep = 8,
  ) {}

  clampIndex(i: number) {
    return Math.max(0, Math.min(this.count - 1, Math.floor(i)));
  }

  async prepare(i: number) {
    const k = this.clampIndex(i);
    if (this.cache.has(k)) return;
    const img = await this.assets.track(loadImage(this.pattern(k)));
    this.cache.set(k, img);
    this.order.push(k);
    while (this.order.length > this.keep) this.cache.delete(this.order.shift()!);
  }

  get(i: number): HTMLImageElement | undefined {
    return this.cache.get(this.clampIndex(i));
  }
}
