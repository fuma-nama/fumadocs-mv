import type { SceneImpl } from '../../engine/engine';
import { at } from '../../engine/time';
import { loadPlates, hiTex } from './plates';
import { setupStage } from './stage';
import { renderPosters } from './posters';
import { renderBands, BANDS_END } from './bands';
import { renderMontage } from './montage';
import { setupRing, renderRing, renderFinal, LAND_T } from './ring';

const scene: SceneImpl = {
  async setup(e) {
    setupStage();
    setupRing();
    await loadPlates(e);
    // full-bleed moments: posters → bands (54.4), bands → montage (56.16), the landing (63.0);
    // uploaded now, as each costs ≈ 45 ms on first use
    e.renderer.initTexture(hiTex('vitepress', 'dark'));
    e.renderer.initTexture(hiTex('dusk', 'light'));
    e.renderer.initTexture(hiTex('ocean', 'dark'));
  },
  render(f) {
    if (f.t < at(35)) return renderPosters(f);
    if (f.t < BANDS_END) return renderBands(f, 'vitepress', 'dark');
    if (f.t < at(37)) return renderMontage(f);
    if (f.t < LAND_T) return renderRing(f);
    return renderFinal(f);
  },
};

export default scene;
