import type * as THREE from 'three';
import type { Frame, SceneImpl } from '../../engine/engine';
import type { LayerSpec } from '../../engine/gfx';
import { clamp, ease, lerp, seg } from '../../engine/anim';
import { C } from '../_shared/palette';
import { drawMoon } from '../_shared/moon';
import { MOSAIC } from '../showcase/contract';
import { drawCaret, caretBlink, drawPowerOn, CARET, POWER_ON } from '../intro/caret';
import { T, motifNotes, chimeAt } from './cues';
import { Cards, CARDS_DONE, buildMasks } from './cards';
import { mockDisc } from './mock';
import { drawComets, drawRingOut, drawDialPens } from './fx';
import { drawDust, drawPlayhead, drawRimLight } from './life';
import { drawPing, drawClockDial, drawTextRing, VOCAB, TEXT_RING } from '../intro/vocab';
import { drawCard, wordLayout, termLayout, CMD, BIG_CARET, TERM_Y, CELL, type CardBuild } from './card';

const W = 1920;
const H = 1080;
const sineInOut = (x: number) => (1 - Math.cos(Math.PI * clamp(x))) / 2;

let cards: Cards;
let masks: ReturnType<typeof buildMasks>;
let gapWash: HTMLCanvasElement;
let mock: HTMLCanvasElement | undefined;

/** Slow push-in over bar 65 (scale about the frame centre). */
function camS(t: number) {
  return 1 + 0.1 * sineInOut((t - T.down) / (T.collapse - T.down));
}

/** The moon: centre + radius in screen px. */
function moonAt(t: number): { x: number; y: number; r: number } {
  // anticipation: a small breath (+2.5 %) into the minor iv, then the collapse exhales from it
  const breath = 1 + 0.025 * ease.inOutQuad(seg(t, T.collapse - 0.18, T.collapse));
  if (t < T.collapse) return { x: 960, y: 540, r: MOSAIC.R * camS(t) * breath };
  // rises a touch ahead of shrinking, so it clears WRITE's cap line before the caret arrives
  // velocity ramps up over the first 3 frames (no jolt), then the long out-quart landing
  const ramp = (u: number, k: number) => (u < k ? (u * u) / (2 * k) : u - k / 2) / (1 - k / 2);
  const q = ramp(seg(t, T.collapse, T.collapse + 1.3), 0.05 / 1.3);
  const py = ease.outQuart(ramp(seg(t, T.collapse, T.collapse + 1.0), 0.05 / 1.0)); // ≥16 px clear of the newborn caret
  const pr = ease.outQuart(q ** 1.25);
  const r0 = MOSAIC.R * camS(T.collapse) * breath;
  const r1 = 34;
  return { x: 960, y: lerp(540, 232, py), r: r0 * (r1 / r0) ** pr };
}

let uOnset = 104.4;
/** Onsets used to type WRITE (16ths from う, the last mora of L14). */
function writeOnsets(): number[] {
  return [0, 1, 2, 3, 4].map((k) => uOnset + k * 0.1);
}

/** Command chunks on the five bell-motif notes: npm · ␣create · ␣fuma · docs · -app */
const CHUNKS: [number, number][] = [
  [0, 3],
  [3, 10],
  [10, 15],
  [15, 19],
  [19, 23],
];
const KEY = 0.022; // s per keystroke inside a burst

function cmdTyped(t: number, notes: number[]): number {
  let n = 0;
  CHUNKS.forEach(([a, b], i) => {
    for (let k = a; k < b; k++) if (t >= notes[i] + (k - a) * KEY) n = k + 1;
  });
  return n;
}

function build(t: number, notes: number[]): CardBuild {
  const wo = writeOnsets();
  // promise before the call to action: the tagline lands on 8ths in bar 66 (under the empty
  // command slot), 」 snaps shut with "documentation,", the prompt settles on the resolve
  const tagOn = [105.0, 105.2, 105.4];
  return {
    frame: ease.outCubic(seg(t, T.collapse, T.collapse + 0.75)),
    header: seg(t, 104.45, 104.75),
    pages: seg(t, 104.5, 105.05),
    wordmark: seg(t, 104.55, 105.1),
    brackets: seg(t, wo[0] - 0.12, wo[0] + 0.25),
    closeK: ease.snap(seg(t, 105.22, 105.5)),
    kana: seg(t, wo[4], wo[4] + 0.3),
    typed: wo.filter((o) => t >= o).length,
    tag: tagOn.map((o) => seg(t, o, o + 0.32)),
    prompt: seg(t, T.resolve - 0.18, T.resolve - 0.02),
    cmd: cmdTyped(t, notes),
    credits: seg(t, T.box, T.box + 0.4),
    alpha: cardAlpha(t),
    // bar 68 music box: the light walks down the card, one element per note
    light: { wordmark: seg(t, notes[6], notes[6] + 0.45), word: seg(t, notes[7], notes[7] + 0.6), cmd: seg(t, notes[8], notes[8] + 0.55) },
  };
}

/** The card dims away while the caret goes home (from rest at 108.0, mostly gone by 108.3). */
function cardAlpha(t: number) {
  return 1 - ease.outCubic(ease.inQuad(seg(t, T.home, T.home + 0.4)) ** 0.75);
}

interface CaretState {
  x: number;
  y: number;
  w: number;
  h: number;
  a: number;
  glow: number;
  snap: boolean;
}

/** The caret: position, size, visibility (screen space). */
function caretState(c: CanvasRenderingContext2D, t: number, notes: number[]): CaretState | null {
  const wo = writeOnsets();
  // after the last ON beat the caret falls like every blink (3 frames), then never returns
  if (t < wo[0] - 0.02 || t >= T.off + 3 / 60) return null;
  if (t < T.resolve - 0.4) {
    // big caret writing WRITE (solid while typing, then the film-wide blink)
    const WL = wordLayout(c);
    const k = wo.filter((o) => t >= o).length;
    const typing = t < wo[4] + 0.2;
    return { x: WL.caretX[k], y: BIG_CARET.y, w: BIG_CARET.w, h: BIG_CARET.h, a: typing ? 1 : caretBlink(t), glow: 0.45, snap: true };
  }
  if (t < T.resolve) return null; // OFF beat: the caret moves to the next line
  const TL = termLayout();
  if (t < T.home) {
    const typing = t < notes[4] + 0.1;
    return { x: TL.caretX(cmdTyped(t, notes)), y: TERM_Y, w: CELL, h: 2 * CELL, a: typing ? 1 : caretBlink(t), glow: 1, snap: true };
  }
  // home: glide to the frame centre during the 108.0 ON beat, settling to the intro's 18×36
  const g = ease.inOutCubic(seg(t, T.home, T.home + 0.34));
  return {
    x: lerp(TL.caretX(CMD.length), CARET.x, g),
    y: lerp(TERM_Y, CARET.y, g),
    w: lerp(CELL, CARET.w, g),
    h: lerp(2 * CELL, CARET.h, g),
    a: caretBlink(t),
    glow: 1,
    snap: g >= 1,
  };
}

const useMock = (f: Frame) => !!f.e.only && !f.e.only.includes('showcase');

/** The showcase frame (or the dev stand-in) during the B8 window. */
function otherTex(f: Frame): THREE.Texture | undefined {
  if (f.t >= T.winEnd) return undefined;
  if (useMock(f)) {
    const L = f.e.layer('outro:mock');
    const c = L.begin();
    if (mock) c.drawImage(mock, 0, 0);
    return L.end();
  }
  return f.other;
}

const scene: SceneImpl = {
  setup() {
    cards = new Cards();
    masks = buildMasks();
    gapWash = document.createElement('canvas');
    gapWash.width = W;
    gapWash.height = H;
    const c = gapWash.getContext('2d')!;
    c.fillStyle = C.INK;
    c.fillRect(0, 0, W, H);
    drawMoon(c, MOSAIC.CX, MOSAIC.CY, MOSAIC.R, { alpha: MOSAIC.WASH, rim: 0 });
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(masks.gapCanvas, 0, 0);
  },

  async prepare(f) {
    if (f.t < T.winEnd && useMock(f) && !mock) mock = await mockDisc();
  },

  render(f) {
    const { e, t } = f;
    const g = e.gfx;
    const L14 = e.audio.line('L14');
    if (L14.length >= 5) uOnset = L14[4].t;
    const o = f.overlay;
    o.tone = 'dark';
    // L14 runs vertically right of the moon; until its pre-roll the showcase's L13 keeps its own style
    if (t >= (L14[0]?.t ?? 102.6) - 0.35) {
      o.lyricStyle = 'vertical';
      o.lyricAnchor = [1690, 300];
    }
    // the PRODUCTION credit lives in the end card (mirror of the title card's credit block)
    if (t >= T.collapse) o.credits = 'hidden';
    if (t >= T.home) o.lyrics = 'hidden';
    // card-only finishing (crisp 1 px lines, light vignette), released as the caret goes home
    const card = ease.inOutCubic(seg(t, T.collapse, T.collapse + 0.6)) * (1 - seg(t, T.home, T.home + 0.6));
    // CA near zero while the card is up (it splits 1 px lines on black); default again at the end = frame 0
    f.post.ca = lerp(f.post.ca, 0.0003, card);
    f.post.vignette = lerp(f.post.vignette, 0.14, card);
    const notes = motifNotes(e.audio);
    const layers: LayerSpec[] = [];
    const s = camS(t);
    const cardA = cardAlpha(t);
    const defocus = 9 * ease.outCubic(seg(t, T.home, T.home + 0.4));
    const m = moonAt(t);
    // the moon's soft halo grows in while it forms, then follows the harmony: dims on the minor iv,
    // swells on the Ebmaj9 resolve, breathes with the pad
    const minor = seg(t, T.collapse, T.collapse + 0.6) * (1 - seg(t, T.resolve, T.resolve + 0.3));
    const swell = Math.sin(Math.PI * seg(t, T.resolve, T.resolve + 1.2)) ** 2;
    const pad = e.audio.curves.chords ? 0.8 + 0.4 * e.audio.env('chords', t) : 1; // breathes with the real pad
    const haloA = 0.36 * cardA * seg(t, 102.5, 103.3) * (1 - 0.3 * minor + 0.45 * swell) * pad;
    const halo = (src: THREE.Texture) => layers.push({ tex: g.blur(src, 24 + m.r * 0.22, 'outro:glow'), opacity: haloA, blend: 'screen' });

    // ── S0–S2: the mosaic turns into the moon ───────────────────────────────
    const other = otherTex(f);
    if (t < T.down) {
      layers.push({ tex: other });
    } else if (t < CARDS_DONE) {
      if (t < T.winEnd && other) {
        // split the showcase frame in source space, then follow the camera
        const outside = g.compose(g.rt('outro:outside'), null, [{ tex: other, mask: masks.out }]);
        const inside = g.compose(g.rt('outro:inside'), null, [{ tex: other, mask: masks.gap }]);
        // colour drains: the sky desaturates on the downbeat, then sinks to ink
        const drain = ease.inOutCubic(seg(t, T.down, T.down + 0.35));
        const sink = ease.inOutCubic(seg(t, T.down + 0.12, T.down + 0.72));
        const grey = g.grade(outside, { sat: 1 - drain, bright: -0.04 * drain }, 'outro:drain');
        layers.push({ tex: grey, opacity: 1 - sink, xform: { scale: s } });
        layers.push({ tex: inside, xform: { scale: s } });
      }
      const gw = e.layer('outro:gapwash');
      gw.begin().drawImage(gapWash, 0, 0);
      layers.push({ tex: gw.end(), opacity: t < T.winEnd ? seg(t, 102.8, 103.1) : 1, xform: { scale: s } });
      const cardsTex = cards.render(g, t, other, s);
      halo(cardsTex);
      layers.push({ tex: cardsTex });
    }

    // ── the 2D moon (seamless after the cards heal) ─────────────────────────
    if (t >= CARDS_DONE && cardA > 0) {
      const moonL = e.layer('outro:moon');
      const mc = moonL.begin();
      // rim follows the radius: the showcase's 1.5 px at R (camera-scaled) → the logo's 1 px
      drawMoon(mc, m.x, m.y, m.r, { rim: Math.max(1, (MOSAIC.RIM * m.r) / MOSAIC.R) });
      const moonTex = moonL.end();
      halo(moonTex);
      layers.push({ tex: g.blur(moonTex, defocus, 'outro:moonblur'), opacity: cardA });
    }

    // ── fx in camera space: rim, comets, the chord ring ─────────────────────
    if (t < T.collapse + 1.4) {
      const fxL = e.layer('outro:fx');
      const fc = fxL.begin();
      fc.save();
      fc.setTransform(s, 0, 0, s, (W / 2) * (1 - s), (H / 2) * (1 - s));
      if (t >= T.down && t < CARDS_DONE) {
        // my rim takes over from the showcase's (identical stroke) as the edge cards turn
        fc.globalAlpha = seg(t, T.down, T.down + 0.4);
        fc.beginPath();
        fc.arc(MOSAIC.CX, MOSAIC.CY, MOSAIC.R, 0, Math.PI * 2);
        fc.lineWidth = MOSAIC.RIM;
        fc.strokeStyle = MOSAIC.RIM_COLOR;
        fc.stroke();
        fc.globalAlpha = 1;
      }
      drawComets(fc, t);
      // the released charge rings outward with the chord
      drawRingOut(fc, t, T.down, MOSAIC.CX, MOSAIC.CY, MOSAIC.R, { dur: 1.6, grow: 560, alpha: 0.7, lw: 1.6, color: '#FFB869' });
      fc.restore();
      drawRingOut(fc, t, T.collapse, m.x, m.y, m.r, { dur: 1.2, grow: 260, alpha: 0.35 });
      // the intro's clock returns around the whole moon (drawn by two pens, hour ticks stamping),
      // then collapses into the logo with it
      const fade = clamp((m.r - 100) / (220 - 100));
      if (t >= T.winEnd && fade > 0) {
        const dr = 1.2 * m.r; // keeps the text ring (×1.1453) clear of the frame edges at full push-in
        const k = ease.inOutCubic(seg(t, T.winEnd, T.winEnd + 0.62));
        drawClockDial(fc, m.x, m.y, dr, { k, alpha: 0.62 * fade });
        drawDialPens(fc, m.x, m.y, dr, k, fade);
        const n = Math.floor(TEXT_RING.length * seg(t, T.winEnd + 0.12, T.winEnd + 0.8));
        drawTextRing(fc, m.x, m.y, VOCAB.textRing.radius * dr, t, { alpha: fade, n });
      }
      // light catching the rim: a soft highlight slides along the lit edge as the camera pushes in
      const rl = seg(t, 102.95, T.collapse + 0.15);
      drawRimLight(fc, m.x, m.y, m.r, -0.45 + 2.35 * ease.inOutQuad(rl), 1.0, 0.85 * Math.sin(Math.PI * rl));
      const fxTex = fxL.end();
      // the burning rim blooms (reads at phone size): builds with the swell, releases on the downbeat
      const burn = seg(t, T.pause, T.down) * (t < T.down ? 1 : Math.exp(-(t - T.down) / 0.18));
      if (burn > 0.01) {
        layers.push({ tex: g.blur(fxTex, 22, 'outro:fxbloom'), opacity: 1.6 * burn, blend: 'screen' });
        layers.push({ tex: g.blur(fxTex, 7, 'outro:fxbloom2'), opacity: 0.9 * burn, blend: 'screen' });
      }
      layers.push({ tex: fxTex });
    }

    // ── dust: one field from bar 65 to the end, motes near the moon catch its light ──
    if (t >= 102.7 && cardA > 0) {
      const dL = e.layer('outro:dust');
      const dc = dL.begin();
      drawDust(dc, t, seg(t, 102.7, 103.4) * cardA, { x: m.x, y: m.y, r: m.r, k: 1 - 0.6 * seg(t, T.collapse, T.collapse + 1) }, 64);
      layers.push({ tex: dL.end() });
    }

    // ── end card ────────────────────────────────────────────────────────────
    if (t >= T.collapse && cardA > 0) {
      const cardL = e.layer('outro:card');
      const cc = cardL.begin();
      // a slow rim light travels around the logo while the card holds
      const lap = seg(t, 104.9, 105.4) * (1 - seg(t, T.home - 0.1, T.home + 0.2));
      drawRimLight(cc, m.x, m.y, m.r + 0.5, -2.2 + (t - 104.9) * 1.9, 1.3, 0.7 * lap, 1.5);
      drawCard(cc, build(t, notes));
      drawPlayhead(cc, t, T.resolve, T.chime - 0.2, seg(t, T.collapse, T.collapse + 0.75));
      // bar 67: the bell motif pings where each chunk lands (the intro's motif ping)
      const TL = termLayout();
      CHUNKS.forEach(([, b], i) => drawPing(cc, TL.caretX(b), TERM_Y, t - notes[i], { scale: 0.36, held: i === 4, alpha: 0.5 }));
      // bar 68: the music box chimes the moon first, then the light walks down the card
      drawPing(cc, 960, 232, t - notes[5], { scale: 0.55, held: true });
      layers.push({ tex: g.blur(cardL.end(), defocus, 'outro:cardblur') });
    }

    // ── the caret + the reverse power-on (screen space) ─────────────────────
    const kL = e.layer('outro:caret');
    const kc = kL.begin();
    // home: drawn exactly like the intro's opening (power-on under the caret), so 108.8 = frame 0
    const chime = chimeAt(e.audio);
    const pon = chime - POWER_ON.dur;
    if (t >= pon && t <= chime) {
      kc.save();
      kc.globalAlpha = seg(t, pon, pon + 0.15);
      // p is snapped to exactly 1 on the chime: (t − pon)/dur = 1 − ε would draw the ping ring at r 24
      const pp = t >= chime - 1e-6 ? 1 : (t - pon) / POWER_ON.dur;
      drawPowerOn(kc, CARET.x, CARET.y, pp, { reverse: true });
      kc.restore();
    }
    const cs = caretState(kc, t, notes);
    // on the chime the caret is fully ON for one beat, exactly like the intro's first beat
    if (cs && t >= chime && t < chime + 0.4) cs.a = 1;
    if (cs && cs.a > 0) drawCaret(kc, cs.x, cs.y, { h: cs.h, w: cs.w, alpha: cs.a, glow: cs.glow, snap: cs.snap });
    // the big caret is born in the empty brackets with the intro's white-hot flash (4 frames)
    const born = writeOnsets()[0] - 0.02;
    if (cs && t >= born && t < born + 4 / 60) {
      kc.globalAlpha = 1 - (t - born) / (4 / 60);
      kc.fillStyle = C.WHITE;
      kc.fillRect(Math.round(cs.x - cs.w / 2), Math.round(cs.y - cs.h / 2), Math.round(cs.w), Math.round(cs.h));
      kc.globalAlpha = 1;
    }
    // the held B♭6: a ring stays where the caret leaves the line
    drawPing(kc, termLayout().caretX(CMD.length), TERM_Y, t - notes[9], { scale: 0.45, held: true, alpha: 1 - seg(t, T.chime - 0.3, T.chime - 0.05) });
    layers.push({ tex: kL.end() });

    // after the last blink the picture rests on ink + grain = frame 0's background, so a looped
    // playback cuts invisibly back into the opening click (the audio tail rings out over it)
    const comp = g.compose(g.rt('outro:comp'), C.INK, layers);
    // home: the intro's opening bloom (same parameters), faded in once the card has gone
    const bk = seg(t, T.home + 0.2, T.home + 0.5);
    return bk > 0 ? g.bloom(comp, { threshold: 0.55, strength: 0.55 * bk, radius: 18 }, 'outro:bloom') : comp;
  },
};

export default scene;
