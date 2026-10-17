import type * as THREE from 'three';
import type { Frame, SceneImpl } from '../../engine/engine';
import { clamp, ease, lerp, seg } from '../../engine/anim';
import { apply, camAt, camMatrix, stationMatrix } from './cam';
import { INK, ORANGE, R, STATIONS, T } from './k';
import { LAUNCH_T, packetAt, railSegments } from './packet';
import { drawHud } from './hud';
import { drawTitleBands, drawTitleNames } from './title';
import { downbeatSlam, shakeAt } from './energy';
import { camBlur, dither } from './fx';
import { drawDisc, drawDust, drawGlows, drawGrid, drawPassingSigns, drawRail, drawSky, hexA, makeView, polar, type View } from './world';
import { openapi } from './st-openapi';
import { obsidian } from './st-obsidian';
import { sanity } from './st-sanity';
import { story } from './st-story';
import { drawAnticipation, drawConnectSign, drawImpact, drawPowerWave, packetRadius } from './launch';
import { ARRIVE, drawCore, drawFlights, drawHubWord, drawSpokes, MERGED, railMix, stationAlpha, worldAlpha } from './converge';
import type { StationCtx, StationImpl } from './station';
import { loadPlates } from './plates';

const stations: StationImpl[] = [
  openapi,
  obsidian,
  sanity,
  story,
];
const stM = STATIONS.map((s) => stationMatrix(s.a));

/** key colour of the block under the camera (for disc tint etc.) */
function keyAt(t: number) {
  let k = 0;
  for (let i = 0; i < STATIONS.length; i++) if (t >= STATIONS[i].t0 - 0.15) k = i;
  return STATIONS[k].key;
}

/** Glow amplitude per station: the active one lit, neighbours dim. */
function glowAmps(t: number): number[] {
  // at the reveal every station lights up at once
  const all = seg(t, T.reveal, T.reveal + 0.2, ease.outCubic);
  return STATIONS.map((s, k) => {
    const on = seg(t, s.t0 - 0.25, s.t0 + 0.1, ease.outCubic);
    const off = k < 3 ? seg(t, STATIONS[k + 1].t0 - 0.1, STATIONS[k + 1].t0 + 0.6, ease.inOutCubic) : 0;
    return Math.max(clamp(on * (1 - 0.65 * off)), all * 1.6);
  });
}

function setPost(f: Frame) {
  f.post.grain = 0.04;
  f.post.vignette = 0.22;
  f.post.ca = 0.0008;
}

function stationCtx(t: number, k: number, s: number, alpha: number): StationCtx {
  const p = packetAt(t, stations);
  return {
    t,
    lt: t - STATIONS[k].t0,
    s,
    packet: p.kind === 'st' && p.k === k ? { x: p.x, y: p.y } : null,
    def: STATIONS[k],
    alpha,
  };
}

/** Which stations are near enough to draw (angular distance to the camera). */
function visibleStations(phi: number, s: number) {
  const out: number[] = [];
  for (let k = 0; k < STATIONS.length; k++) {
    let d = Math.abs(phi - STATIONS[k].a) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < (s < 0.6 ? Math.PI * 2 : 1.25)) out.push(k);
  }
  return out;
}

const DIVE0 = 88.6, DIVE1 = ARRIVE[0] - 0.03;
function drawPacket(c: CanvasRenderingContext2D, v: View, t: number) {
  if (t >= DIVE0) {
    if (t >= DIVE1) return;
    const q = packetAt(DIVE0, stations);
    if (q.kind !== 'st') return;
    const [x0, y0] = apply(v.m.multiply(stM[q.k]), q.x, q.y);
    const e = ease.inCubic(clamp((t - DIVE0) / (DIVE1 - DIVE0)));
    const x = lerp(x0, v.cx, e), y = lerp(y0, v.cy, e);
    c.save();
    c.shadowColor = ORANGE;
    c.shadowBlur = 18;
    c.fillStyle = ORANGE;
    c.beginPath();
    c.arc(x, y, Math.max(4, 9 * v.s) * (1 + e), 0, Math.PI * 2);
    c.fill();
    c.restore();
    return;
  }
  const p = packetAt(t, stations);
  if (p.kind === 'none' || p.kind === 'launch') return;
  if (p.kind === 'st' && stations[p.k].hidePacket?.(t)) return;
  let x: number, y: number, tx: number, ty: number;
  if (p.kind === 'ring') {
    [x, y] = polar(v, p.a, R);
    [tx, ty] = polar(v, p.a - p.va * 0.022, R);
  } else {
    const m = v.m.multiply(stM[p.k]);
    [x, y] = apply(m, p.x, p.y);
    [tx, ty] = apply(m, p.x - p.vx * 0.022, p.y - p.vy * 0.022);
  }
  const r = Math.max(4, packetRadius(t) * v.s);
  const len = p.kind === 'st' && stations[p.k].noTail?.(t) ? 0 : Math.hypot(x - tx, y - ty);
  c.save();
  if (len > r) {
    const g = c.createLinearGradient(tx, ty, x, y);
    g.addColorStop(0, hexA(ORANGE, 0));
    g.addColorStop(1, hexA(ORANGE, 0.9));
    // tapered comet tail
    const nx = (x - tx) / len, ny = (y - ty) / len;
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(tx, ty);
    c.lineTo(x - ny * r * 0.9, y + nx * r * 0.9);
    c.lineTo(x + ny * r * 0.9, y - nx * r * 0.9);
    c.closePath();
    c.fill();
  }
  c.shadowColor = ORANGE;
  c.shadowBlur = 18;
  c.fillStyle = ORANGE;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.shadowBlur = 0;
  c.fillStyle = 'rgba(255,240,220,0.9)';
  c.beginPath();
  c.arc(x, y, r * 0.42, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** The caret at the drop: held → squash, recoil (screen centre). */
function drawLaunchCaret(c: CanvasRenderingContext2D, t: number) {
  const p = clamp((t - T.drop) / (LAUNCH_T - T.drop));
  // released: from compressed (36×118, recoiled) to stretched along the shot
  const w = lerp(36, 92, ease.outCubic(p));
  const h = lerp(118, 52, ease.outCubic(p));
  c.fillStyle = ORANGE;
  c.fillRect(960 - w / 2 - 8 * (1 - p) + 22 * p, 540 - h / 2, w, h);
}

function drawWorldBack(c: CanvasRenderingContext2D, v: View, t: number) {
  const wa = worldAlpha(t);
  drawSky(c, v, t, wa);
  drawGlows(c, v, glowAmps(t).map((a) => a * wa), stM);
  drawGrid(c, v, wa, t);
  drawPassingSigns(c, v, stationMatrix, 1 - seg(t, T.reveal - 0.1, T.reveal + 0.1), t);
  drawDisc(c, v, t, wa, keyAt(t));
  const mix = railMix(t);
  const segs = railSegments(t, stations).map(([a0, a1, col]) => [a0, a1, mix > 0 ? mixHex(col, ORANGE, mix) : col] as [number, number, string]);
  const ra = 1 - seg(t, MERGED - 0.03, MERGED + 0.02);
  if (ra > 0) drawRail(c, v, segs, ra, 10);
  drawPowerWave(c, v, t);
  drawDust(c, v, t, wa);
  drawConnectSign(c, v, t);
  // keep the world quiet under the overlay credit (bottom-right, bars 53–54)
  const cz = seg(t, T.san - 0.2, T.san + 0.1) * (1 - seg(t, T.sto + 0.05, T.sto + 0.3));
  if (cz > 0) {
    const g = c.createRadialGradient(1640, 960, 60, 1640, 960, 420);
    g.addColorStop(0, `rgba(10,10,11,${0.7 * cz})`);
    g.addColorStop(1, 'rgba(10,10,11,0)');
    c.fillStyle = g;
    c.fillRect(1180, 600, 740, 480);
  }
}

function mixHex(a: string, b: string, k: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (n: number, sh: number) => (n >> sh) & 255;
  const m = (sh: number) => Math.round(lerp(ch(pa, sh), ch(pb, sh), k));
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, '0')}`;
}

const scene: SceneImpl = {
  async setup(e) {
    await loadPlates(e);
  },
  render(f) {
    const { e, t } = f;
    const g = e.gfx;
    f.overlay.lyrics = 'hidden';
    f.overlay.tone = 'dark';
    const nonOwner = !!f.boundary && !f.boundary.isOwner;
    if (!nonOwner) setPost(f);

    // ── B6: cli's held caret until the drop ──
    if (t < T.drop) {
      const an = e.layer('integrations:anticip');
      drawAnticipation(an.begin(), t);
      return g.compose(g.rt('integrations:b6'), INK, [{ tex: f.other ?? null }, { tex: an.end() }]);
    }

    const cam = camAt(t);
    const m = camMatrix(cam);
    const v = makeView(m, cam);
    const vis = visibleStations(cam.phi, cam.s);

    // ── back: world ──
    const back = e.layer('integrations:back');
    const cb = back.begin(INK);
    cb.imageSmoothingQuality = 'high';
    drawWorldBack(cb, v, t);
    for (const k of vis) {
      const st = stations[k];
      if (!st.back) continue;
      cb.save();
      cb.setTransform(m.multiply(stM[k]));
      st.back(cb, stationCtx(t, k, cam.s, 1));
      cb.restore();
    }

    // ── 3D (per station) ──
    const tex3: THREE.Texture[] = [];
    const tex3Alpha: number[] = [];
    for (const k of vis) {
      const st = stations[k];
      if (!st.three) continue;
      const sa = stationAlpha(t, k);
      if (sa <= 0) continue;
      const t3 = st.three(g, stationCtx(t, k, cam.s, sa), m.multiply(stM[k]));
      if (!t3) continue;
      tex3.push(t3);
      tex3Alpha.push(sa);
    }

    // ── front: station UI, routes, packet ──
    const front = e.layer('integrations:front');
    const cf = front.begin();
    cf.imageSmoothingQuality = 'high';
    for (const k of vis) {
      const st = stations[k];
      const sa = stationAlpha(t, k);
      if (sa <= 0) continue;
      cf.save();
      cf.setTransform(m.multiply(stM[k]));
      cf.globalAlpha = sa;
      st.front(cf, stationCtx(t, k, cam.s, sa));
      cf.restore();
    }
    if (t >= T.reveal) {
      drawSpokes(cf, v, t);
      drawHubWord(cf, v, t);
      drawFlights(cf, v, t, stations, stM, (k) => stationCtx(t, k, cam.s, 1));
      drawCore(cf, v, t);
    }
    drawPacket(cf, v, t);
    if (t < LAUNCH_T) drawLaunchCaret(cf, t);
    drawImpact(cf, v, t);
    if (!nonOwner) f.post.shake = shakeAt(t);


    // ── compose ──
    let img: THREE.Texture = g.compose(g.rt('integrations:comp'), INK, [{ tex: back.end() }, ...tex3.map((tex, i) => ({ tex, opacity: tex3Alpha[i] })), { tex: front.end() }]);
    const sh = 1 / 120;
    // blur from the camera path only: punches stay crisp impact frames
    const np = { punch: false };
    if (t > LAUNCH_T + 1 / 60) img = camBlur(g, img, camMatrix(camAt(t - sh / 2, np)), camMatrix(camAt(t + sh / 2, np)), camMatrix(camAt(t, np)), 'integrations:blur');
    img = g.bloom(img, { threshold: 0.84, knee: 0.1, strength: 0.5, radius: 16 }, 'integrations:bloom');
    img = dither(g, img, f.frame, 'integrations:dither');
    // 83.2 machine hit: a short stutter of slice glitches (audio stutter 83.2–83.4)
    const stt = t - T.san;
    if (stt >= 0 && stt < 0.22) img = g.glitch(img, { amount: 0.32 * (1 - stt / 0.22), seed: Math.floor(stt * 30) + 7, bands: 26, split: 0.006 }, 'integrations:glitch');
    // title band (normal) under the HUD + title names (difference: legible on any field)
    const band = e.layer('integrations:titleband');
    drawTitleBands(band.begin(), t);
    const hud = e.layer('integrations:hud');
    const ch = hud.begin();
    drawHud(ch, t, cam.s);
    drawTitleNames(ch, t);
    img = g.compose(g.rt('integrations:final'), INK, [{ tex: img }, { tex: band.end() }, { tex: hud.end(), blend: 'difference' }]);
    // block downbeats: 3-frame colour slam in the block's colours
    return downbeatSlam(g, img, t);
  },
};

export default scene;
