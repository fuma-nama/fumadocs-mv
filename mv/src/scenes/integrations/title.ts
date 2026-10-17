import { clamp, ease, lerp, seg } from '../../engine/anim';
import { glyphs, setFont, text } from '../../engine/draw2d';
import { cornerName, TITLE_LAND } from './hud';
import { STATIONS } from './k';
import { hexA } from './world';

/** Katakana reading + one-line Japanese tagline per block. */
const JP: Record<string, [kana: string, tag: string]> = {
  openapi: ['オープンAPI', 'API仕様から、リファレンスへ'],
  obsidian: ['オブシディアン', '保管庫を、そのままドキュメントに'],
  sanity: ['サニティ', '構造化コンテンツを、ライブで'],
  story: ['ストーリー', 'コンポーネントを、操作できる形で'],
};

const NAME = { size: 196, x: 64, base: 872 };
const BAND = { y: 664, h: 236 };
const COLLAPSE0 = 0.46;
/** the band slides in over the last frames before the hit, fully open ON the downbeat */
const PRE = 4 / 60;
const NAME_OPTS = { font: 'display' as const, size: NAME.size, weight: 900, stretch: 'condensed' as CanvasFontStretch, tracking: -0.01 };
const W = 1920;
/** Story's stage sits bottom-left, so its band mirrors to the right edge. */
const rightSide = (k: number) => k === 3;

function active(t: number) {
  const out: [k: number, dt: number][] = [];
  for (let k = 0; k < STATIONS.length; k++) {
    const dt = t - STATIONS[k].t0;
    if (dt >= -PRE - 1e-6 && dt <= TITLE_LAND + 0.02) out.push([k, dt]);
  }
  return out;
}

const collapseP = (dt: number) => (dt - COLLAPSE0) / (TITLE_LAND - COLLAPSE0);

interface Lay {
  nameW: number;
  bandW: number;
  nameX: number;
  /** x of the tagline/package column and its alignment */
  colX: number;
  colAlign: CanvasTextAlign;
  /** x of the number / katakana row and its alignment */
  headX: number;
  headAlign: CanvasTextAlign;
}

function layout(c: CanvasRenderingContext2D, k: number): Lay {
  const st = STATIONS[k];
  const { width: nameW } = glyphs(c, st.name, NAME_OPTS);
  setFont(c, { font: 'mono', size: 20 });
  const pkgW = c.measureText(st.pkg).width;
  const colW = Math.max(pkgW, 300);
  const bandW = NAME.x + nameW + 40 + colW + 64;
  if (!rightSide(k)) return { nameW, bandW, nameX: NAME.x, colX: NAME.x + nameW + 40, colAlign: 'left', headX: 72, headAlign: 'left' };
  const nameX = W - NAME.x - nameW;
  return { nameW, bandW, nameX, colX: nameX - 40, colAlign: 'right', headX: W - 72, headAlign: 'right' };
}

/**
 * Block title, part 1 (normal blend): the INK band slides in from its edge over the last 4
 * frames before the downbeat (fully open on the hit) with the number, katakana, tagline and
 * package; it retracts back into its edge as the name flies to the corner label.
 */
export function drawTitleBands(c: CanvasRenderingContext2D, t: number) {
  for (const [k, dt] of active(t)) {
    const st = STATIONS[k];
    const [kana, tag] = JP[st.id];
    const L = layout(c, k);
    const col = collapseP(dt);
    const open = ease.outCubic(clamp((dt + PRE) / PRE));
    const retract = ease.inCubic(clamp(col));
    const w = L.bandW * open * (1 - retract);
    if (w <= 1) continue;
    const right = rightSide(k);
    const x0 = right ? W - w : 0;
    c.save();
    c.fillStyle = 'rgba(10,10,11,0.92)';
    c.fillRect(x0, BAND.y, w, BAND.h);
    c.fillStyle = st.key;
    c.fillRect(x0, BAND.y, w, 2);
    c.fillRect(x0, BAND.y + BAND.h - 2, w, 2);
    // leading edge
    c.fillRect(right ? x0 : x0 + w - 10, BAND.y, 10, BAND.h);
    c.beginPath();
    c.rect(right ? x0 + 10 : x0, BAND.y, Math.max(0, w - 10), BAND.h);
    c.clip();
    // band copy: lands with the name on the downbeat, fades before the retract
    const fade = (dt >= 0 ? 1 : 0) * (1 - clamp(col * 3));
    if (fade > 0) {
      c.globalAlpha = fade;
      const nW = text(c, st.n, L.headX, BAND.y + 46, { font: 'wide', size: 22, tracking: 0.1, color: st.key, align: L.headAlign });
      const kx = right ? L.headX - nW - 14 : L.headX + 54;
      text(c, kana, kx, BAND.y + 47, { font: 'jpKaku', size: 26, weight: 900, color: '#FAFAF7', align: L.headAlign });
      text(c, tag, L.colX, NAME.base - 40, { font: 'jpKaku', size: 20, weight: 700, color: hexA('#FAFAF7', 0.82), align: L.colAlign });
      text(c, st.pkg, L.colX, NAME.base - 6, { font: 'mono', size: 20, color: hexA(st.key, 0.95), align: L.colAlign });
    }
    c.restore();
  }
}

/**
 * Block title, part 2 (drawn in the difference-blended HUD layer): the whole name is there on
 * the downbeat frame; letters settle from 1.35× one frame apart (a typeset wave, never a partial
 * word), then the name shrinks uniformly into the corner label, where hud.ts flaps in.
 */
export function drawTitleNames(c: CanvasRenderingContext2D, t: number) {
  for (const [k, dt] of active(t)) {
    if (dt < 0) continue;
    const st = STATIONS[k];
    const { glyphs: gs } = glyphs(c, st.name, NAME_OPTS);
    const L = layout(c, k);
    const col = collapseP(dt);
    const tgt = cornerName(c, k);
    const nameAlpha = 1 - seg(col, 0.72, 1);
    if (nameAlpha <= 0) continue;
    const sEnd = (tgt.size * 0.74) / (NAME.size * 0.7);
    const at = (f: number) => {
      const e = ease.inOutCubic(clamp(f));
      const s = Math.exp(lerp(0, Math.log(sEnd), e));
      return { x: lerp(L.nameX, tgt.x, e), y: lerp(NAME.base, tgt.y, e) - Math.sin(Math.PI * e) * 60, s };
    };
    const trail = col > 0 && col < 1 ? 3 : 0;
    for (let j = trail; j >= 0; j--) {
      const p = at(col - j * 0.06);
      c.save();
      c.translate(p.x, p.y);
      c.scale(p.s, p.s);
      c.globalAlpha = nameAlpha * (j === 0 ? 1 : 0.25 / j);
      setFont(c, { ...NAME_OPTS, align: 'left' });
      for (const g of gs) {
        const lt = dt - g.i / 60;
        const s = lerp(1.18, 1, ease.outCubic(clamp(lt / 0.07)));
        c.save();
        c.translate(g.x + g.w / 2, -NAME.size * 0.35);
        c.scale(s, s);
        c.translate(-(g.x + g.w / 2), NAME.size * 0.35);
        c.fillStyle = dt < 2 / 60 ? '#FFFFFF' : st.key;
        c.fillText(g.ch, g.x, 0);
        c.restore();
      }
      c.restore();
    }
  }
}
