import type { Frame, SceneImpl } from '../../engine/engine';
import type { LayerSpec } from '../../engine/gfx';
import { C } from '../_shared/palette';
import { drawA } from './shotA';
import { renderB, setupB, toneB } from './shotB';
import { DIVE_END, drawC, soloSpot } from './shotC';
import { drawD, glowParams } from './shotD';
import { arcGlow, spotLight } from './dither';
import { T_B, T_C, T_D } from './timeline';

/** Overlay hint extras (mv/src/overlay/state.ts `hints(f)` is a plain cast of f.overlay). */
const hints = (f: Frame) => f.overlay as Frame['overlay'] & { accent?: string; creditCorner?: 'tl' | 'tr' | 'bl' | 'br' };

/** 2× supersampled 2D layer (the compositor box-filters it down exactly 2:1): no hairline shimmer */
const SS = 2;
function ssLayer(f: Frame, key: string) {
  const L = f.e.layer(key, f.W * SS, f.H * SS);
  const c = L.begin();
  c.setTransform(SS, 0, 0, SS, 0, 0);
  return { L, c };
}

/** the magic circle's arc glow: analytic (float, dithered), screened over D */
function glowLayer(f: Frame): LayerSpec {
  const gp = glowParams(f.t);
  if (gp.k <= 0.002) return { tex: null };
  return { tex: arcGlow(f.e.gfx, { ...gp, k: Math.min(1.6, 0.95 * gp.k) }, 'toc:arcglow'), blend: 'screen' };
}

const scene: SceneImpl = {
  setup(e) {
    setupB(e);
  },
  render(f) {
    const t = f.t;
    // post is shared per frame and the window owners (READ ≤ 26.4, LAYOUT ≥ 37.6) decide it there:
    // only touch it while TOC renders alone, easing to and from the engine defaults at both ends.
    if (!f.boundary) {
      const sm = (x: number) => {
        const k = Math.min(1, Math.max(0, x));
        return k * k * (3 - 2 * k);
      };
      // LAYOUT (owner from 37.6) holds ca 0 too, so no ramp back at the end
      const own = sm((t - 26.4) / 0.25);
      // chromatic aberration splits 1 px hairlines into coloured fringes: off for this line-art
      // section, a trace kept in the 3D city for the lens feel
      const caB = 0.4 * sm((t - T_B) / 0.3) * (1 - sm((t - (T_C - 0.3)) / 0.3));
      f.post.ca *= 1 - own * (1 - caB);
      // lighter vignette on paper (A), back to default as the lights go out (B)
      f.post.vignette -= 0.1 * own * (1 - sm((t - T_B) / 0.4));
    }
    if (t < T_B) {
      const { L, c } = ssLayer(f, 'toc:main');
      drawA(f, c);
      f.overlay.tone = 'light';
      hints(f).accent = C.INK;
      return L.end();
    }
    if (t < T_C) {
      const tex = renderB(f);
      const dark = toneB === 'dark';
      f.overlay.tone = dark ? 'dark' : 'light';
      hints(f).accent = dark ? C.PAPER : C.INK;
      return tex;
    }
    f.overlay.tone = 'dark';
    hints(f).accent = C.PAPER;
    if (t >= T_D && t < DIVE_END) {
      // the sheet racks out of focus behind the lifting circle
      const g = f.e.gfx;
      const { L: Lc, c: cc } = ssLayer(f, 'toc:csheet');
      drawC(f, cc, { noCircle: true });
      const u = (t - T_D) / (DIVE_END - T_D);
      const sheet = g.blur(Lc.end(), 14 * u * u, 'toc:cblur');
      const { L: Ld, c: cd } = ssLayer(f, 'toc:main');
      drawD(f, cd, { overlayOnly: true });
      return g.compose(g.rt('toc:dive'), C.INK, [{ tex: sheet, opacity: 1 - u * u * (3 - 2 * u) }, { tex: Ld.end() }, glowLayer(f)]);
    }
    const { L, c } = ssLayer(f, 'toc:main');
    if (t < T_D) {
      // the specimens over a soft pool of light that follows the soloing panel
      drawC(f, c, { noBg: true });
      const sp = soloSpot(t);
      const spot = spotLight(f.e.gfx, { ...sp, color: [0.93, 0.925, 0.89], k: 0.05 * sp.k }, 'toc:spot');
      return f.e.gfx.compose(f.e.gfx.rt('toc:ccomp'), C.INK, [{ tex: spot, blend: 'add' }, { tex: L.end() }]);
    }
    drawD(f, c);
    const gl = glowLayer(f);
    if (!gl.tex) return L.end();
    return f.e.gfx.compose(f.e.gfx.rt('toc:dcomp'), null, [{ tex: L.end() }, gl]);
  },
};

export default scene;
