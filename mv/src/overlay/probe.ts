import type * as THREE from 'three';
import type { Gfx } from '../engine/gfx';

/**
 * Coarse probe of the scene image: per 20×20 px cell (96×54 grid) the mean luminance and the
 * mean absolute deviation of 16 taps (a "busyness" measure: UI text, wireframes, stripes).
 * Read back to the CPU so the overlay can measure contrast/clutter under its text.
 */
const PW = 96;
const PH = 54;
const buf = new Uint8Array(PW * PH * 4);
let valid = false;

export function probe(g: Gfx, scene: THREE.Texture) {
  const rt = g.rt('overlay:probe', PW, PH);
  const m = g.material(
    'overlay:probe',
    `uniform sampler2D tex;
     void main(){
       vec2 cell = vec2(1.0 / ${PW}.0, 1.0 / ${PH}.0);
       vec2 base = floor(vUv / cell) * cell;
       float l[16];
       float acc = 0.0;
       for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) {
         float v = luma(texture(tex, base + (vec2(float(i), float(j)) + 0.5) * 0.25 * cell).rgb);
         l[i * 4 + j] = v;
         acc += v;
       }
       float mean = acc / 16.0;
       float mad = 0.0;
       for (int k = 0; k < 16; k++) mad += abs(l[k] - mean);
       mad /= 16.0;
       outColor = vec4(mean, min(1.0, mad * 4.0), 0.0, 1.0);
     }`,
    { tex: { value: null } },
  );
  m.uniforms.tex.value = scene;
  g.run(m, rt);
  g.renderer.readRenderTargetPixels(rt, 0, 0, PW, PH, buf);
  valid = true;
}

export interface RegionStats {
  n: number;
  mean: number;
  /** mean absolute deviation inside cells (0..~0.3): clutter */
  busy: number;
  cells: number[];
}

/** Stats over a screen rect (px, y down). */
export function regionStats(x0: number, y0: number, x1: number, y1: number, W = 1920, H = 1080): RegionStats {
  if (!valid) return { n: 0, mean: 0.5, busy: 0, cells: [] };
  const cx0 = Math.max(0, Math.floor((x0 / W) * PW));
  const cx1 = Math.min(PW - 1, Math.floor((x1 / W) * PW));
  const cy0 = Math.max(0, Math.floor((y0 / H) * PH));
  const cy1 = Math.min(PH - 1, Math.floor((y1 / H) * PH));
  let sum = 0;
  let busy = 0;
  let n = 0;
  const cells: number[] = [];
  for (let cy = cy0; cy <= cy1; cy++) {
    const row = PH - 1 - cy; // readPixels rows are bottom-up
    for (let cx = cx0; cx <= cx1; cx++) {
      const i = (row * PW + cx) * 4;
      const l = buf[i] / 255;
      sum += l;
      busy += buf[i + 1] / 255 / 4;
      n++;
      cells.push(l);
    }
  }
  return { n, mean: n ? sum / n : 0.5, busy: n ? busy / n : 0, cells };
}
