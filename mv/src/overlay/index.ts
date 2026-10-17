import type * as THREE from 'three';
import type { Engine, Frame } from '../engine/engine';
import type { LayerSpec } from '../engine/gfx';
import { activeCredit, drawCredit } from './credits';
import type { LyricStyleName } from './data';
import { probe, regionStats } from './probe';
import { hints } from './state';
import { INK, isMonoColor, lineWindow, lumaOfHex, ORANGE, PAPER, plateColorFor, STYLE_FNS, type Palette } from './styles';
import { setupTest, TEST, testScene } from './testbg';
import { ensureLead, lineTimings, type LineTiming } from './timing';
import { profile } from './profile';
import { at } from '../engine/time';

/**
 * Global lyrics + staff-credits overlay (docs/overlay.md). Drawn by the engine on top of every
 * scene; scenes steer it with f.overlay hints (lyrics / lyricStyle / lyricAnchor / tone / credits)
 * and the extras in hints(f) (creditCorner, accent, ink, plate, lyricAlpha, lyricScale).
 *
 * Legibility: text is drawn once in white on a "mono" layer and composited twice — tinted INK
 * where the (blurred) scene is light, PAPER where it is dark — so it inverts cleanly across panel
 * edges and theme flips. The tone hint biases the threshold toward the scene's stated background.
 * A soft opposite-colour halo fades in only where the background sits near that threshold.
 * Fixed-colour accents (orange dot, offset shadows, chant blocks, swatches) live on a colour layer.
 */
export async function setup(e: Engine) {
  ensureLead();
  lineTimings();
  await setupTest(e);
}

/** Background tone per section until a scene sets f.overlay.tone (profile: agreed with the scene agents). */
function defaultTone(t: number): 'dark' | 'light' {
  let tone: 'dark' | 'light' = 'dark';
  for (const [a, v] of profile().tones) if (t >= a) tone = v;
  return tone;
}

/** e.g. the TOC section keeps the film's only orange dot for itself: lyric marks go monochrome there. */
const monoAccent = (t: number) => profile().monoAccent.some(([a, b]) => t >= a && t < b);

/** Approximate screen box of a style's text block (for the contrast probe). */
function bandOf(style: LyricStyleName, anchor?: [number, number]): [number, number, number, number] {
  const [x, y] = anchor ?? [NaN, NaN];
  const has = anchor !== undefined;
  switch (style) {
    case 'verse':
      return has ? [x - 8, y - 84, x + 960, y + 52] : [120, 884, 1080, 1022];
    case 'vertical':
      return has ? [x - 80, y - 10, x + 50, y + 720] : [1680, 140, 1820, 860];
    case 'pre':
    case 'chant':
      return has ? [x - 520, y - 80, x + 520, y + 130] : [440, 816, 1480, 1022];
    case 'chorus':
      return has ? [x - 800, y - 100, x + 800, y + 45] : [180, 884, 1740, 1034];
    case 'final':
      return has ? [x - 820, y - 125, x + 820, y + 55] : [150, 820, 1770, 1010];
    case 'subtitle':
      return has ? [x - 680, y - 56, x + 680, y + 22] : [280, 950, 1640, 1034];
    case 'outro':
      return has ? [x - 320, y - 90, x + 320, y + 52] : [640, 870, 1280, 1015];
    case 'english':
      return has ? [x - 520, y - 18, x + 520, y + 8] : [420, 992, 1500, 1022];
    default:
      return has ? [x - 640, y - 70, x + 640, y + 50] : [320, 900, 1600, 1022];
  }
}

/** Threshold band of the light/dark mask: the tone hint biases it toward the stated background. */
function maskBand(tone: 'dark' | 'light' | undefined): [number, number] {
  if (tone === 'light') return [0.2, 0.34];
  if (tone === 'dark') return [0.66, 0.8];
  return [0.42, 0.58];
}

const smooth = (a: number, b: number, x: number) => {
  const s = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return s * s * (3 - 2 * s);
};

/** Halo need (share of cells whose luminance sits near the light/dark threshold) and plate need (clutter). */
function needs(box: [number, number, number, number], lo: number, hi: number, small = false): { halo: number; plate: number } {
  const r = regionStats(...box);
  if (!r.n) return { halo: 0, plate: 0 };
  let bad = 0;
  for (const l of r.cells) if (l > lo - 0.12 && l < hi + 0.12) bad++;
  // gentle automatic response (a strong, flickering plate is worse than clutter); small text gets a
  // firmer one; scenes can force hints(f).plate
  const plate = small ? smooth(0.014, 0.05, r.busy) : 0.7 * smooth(0.025, 0.09, r.busy);
  return { halo: smooth(0.05, 0.4, bad / r.n), plate };
}

// firmer automatic backing: small text, and the final chorus (its ground — city, mosaic wall — moves slowly)
const SMALL_STYLES = new Set<LyricStyleName>(['verse', 'vertical', 'subtitle', 'english', 'plain', 'outro', 'final']);

/** Scenes whose section overlaps a take's bars: only they may restyle / move that line. */
function homeScenes(f: Frame, L: LineTiming): string[] {
  const a = at(L.barStart);
  const b = at(L.barEnd);
  return f.e.entries.filter((s) => s.start < b && s.end > a).map((s) => s.id);
}

function lumaMask(f: Frame, scene: THREE.Texture, lo: number, hi: number): THREE.Texture {
  const g = f.e.gfx;
  const bl = g.blur(scene, 18, 'overlay:mblur');
  const rt = g.rt('overlay:mask', g.W / 2, g.H / 2);
  const m = g.material(
    'overlay:mask',
    `uniform sampler2D tex; uniform float lo; uniform float hi;
     void main(){ float l = luma(texture(tex, vUv).rgb); float k = smoothstep(lo, hi, l); outColor = vec4(k, k, k, 1.0); }`,
    { tex: { value: null }, lo: { value: 0.4 }, hi: { value: 0.6 } },
  );
  m.uniforms.tex.value = bl;
  m.uniforms.lo.value = lo;
  m.uniforms.hi.value = hi;
  g.run(m, rt);
  return rt.texture;
}

export default function overlay(f: Frame, sceneIn: THREE.Texture): THREE.Texture {
  const t = f.t;
  const h = hints(f);
  const scene = TEST === '1' ? testScene(f) : sceneIn;
  if (TEST === 'plate') h.plate = 1;
  const owner = f.e.plan(t)?.main.id ?? '';
  const lines = (
    h.lyrics === 'auto'
      ? lineTimings().filter((L) => {
          const w = lineWindow(L);
          return t >= w.a && t < w.b;
        })
      : []
  )
    .map((L) => {
      // style / anchor / scale hints only from the scenes the line belongs to (no pops when a
      // neighbour owns a hand-off window while the line is still up)
      const own = homeScenes(f, L).includes(owner);
      const style = (own && h.lyricStyle && h.lyricStyle in STYLE_FNS ? h.lyricStyle : L.style) as LyricStyleName;
      return { L, own, style };
    })
    .filter((x) => x.style !== 'none');
  const credit = h.credits !== 'hidden' ? activeCredit(t) : null;
  if (!lines.length && !credit) return scene;

  const g = f.e.gfx;
  probe(g, scene);
  const tone = h.tone ?? defaultTone(t);
  const fixedInk = h.ink;
  // mono layer is drawn in white and tinted at composite time (unless the scene fixes the ink colour)
  const accent = h.accent ?? (monoAccent(t) ? (tone === 'dark' ? PAPER : INK) : ORANGE);
  const pal: Palette = { ink: '#FFFFFF', bg: '#000000', accent: isMonoColor(accent) ? '#FFFFFF' : accent, tone };
  const [lo, hi] = maskBand(h.tone ?? defaultTone(t));

  const monoL = f.e.layer('overlay:mono');
  const colL = f.e.layer('overlay:col');
  const plateL = f.e.layer('overlay:plate');
  const c = monoL.begin();
  const cc = colL.begin();
  const pc = plateL.begin();
  let halo = 0;
  let plated = false;
  const accentL = lumaOfHex(pal.accent);
  for (const { L, own, style } of lines) {
    const anchor = own ? h.lyricAnchor : undefined;
    const band = bandOf(style, anchor);
    const nd = needs(band, lo, hi, SMALL_STYLES.has(style));
    const bandMean = regionStats(...band).mean;
    const plateColor = plateColorFor(bandMean, h.tone ?? defaultTone(t));
    // a scene accent equal to its own background (theme flat fields) would vanish: use the text colour
    const lpal = h.accent && !isMonoColor(pal.accent) && Math.abs(accentL - bandMean) < 0.16 ? { ...pal, accent: '#FFFFFF' } : pal;
    if (TEST) (globalThis as Record<string, unknown>).__overlayNeeds = { id: L.id, style, ...nd, stats: regionStats(...bandOf(style, anchor)).busy };
    halo = Math.max(halo, nd.halo);
    const plate = Math.max(h.plate ?? 0, nd.plate);
    plated ||= plate > 0.01 || style === 'pre';
    STYLE_FNS[style](c, L, t, { pal: lpal, anchor, scale: own ? h.lyricScale : undefined, alpha: h.lyricAlpha, cc, pc, plate, plateColor });
  }
  if (credit) {
    const box = drawCredit(c, t, { pal, corner: h.creditCorner, measureOnly: true });
    if (box) {
      const nd = needs([box.x0, box.y0, box.x1, box.y1], lo, hi);
      // credits are static blocks, so a firmer automatic backing doesn't read as flicker
      const st = regionStats(box.x0, box.y0, box.x1, box.y1);
      const cplate = smooth(0.008, 0.035, st.busy);
      if (TEST) (globalThis as Record<string, unknown>).__overlayCredit = { busy: st.busy, cplate };
      halo = Math.max(halo, nd.halo * 0.8);
      plated ||= cplate > 0.01;
      drawCredit(c, t, { pal, corner: h.creditCorner, cc, pc, plate: cplate, plateColor: plateColorFor(st.mean, h.tone ?? defaultTone(t)) });
    }
  }
  const monoTex = monoL.end();
  const colTex = colL.end();
  const plateTex = plateL.end();

  // 1) base = scene + frosted plates (each tinted by the luminance under it, so it darkens a dark
  //    background / lightens a light one); 2) the ink/paper mask is measured on that base.
  let base = scene;
  if (plated) {
    const frost = g.blur(scene, 14, 'overlay:frost');
    base = g.compose(g.rt('overlay:base'), null, [{ tex: scene }, { tex: frost, mask: plateTex }, { tex: plateTex }]);
  }
  const layers: LayerSpec[] = [{ tex: base }];
  if (fixedInk) {
    const opp = fixedInk.toUpperCase() === INK ? PAPER : INK;
    if (halo > 0.01) layers.push({ tex: g.blur(monoTex, 8, 'overlay:hblur'), tint: opp, opacity: halo * 0.9 });
    layers.push({ tex: colTex }, { tex: monoTex, tint: fixedInk });
  } else {
    const mask = lumaMask(f, base, lo, hi);
    if (halo > 0.01) {
      const hb = g.blur(monoTex, 8, 'overlay:hblur');
      layers.push({ tex: hb, tint: PAPER, mask, maskLuma: true, opacity: halo * 0.9 }, { tex: hb, tint: INK, mask, maskLuma: true, maskInvert: true, opacity: halo * 0.9 });
    }
    layers.push({ tex: colTex }, { tex: monoTex, tint: INK, mask, maskLuma: true }, { tex: monoTex, tint: PAPER, mask, maskLuma: true, maskInvert: true });
  }
  return g.compose(g.rt('overlay:out'), null, layers);
}

