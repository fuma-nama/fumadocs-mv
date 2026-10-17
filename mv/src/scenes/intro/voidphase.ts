import * as THREE from 'three';
import type { Frame } from '../../engine/engine';
import { C } from '../_shared/palette';
import { ease, clamp, pulse, hash, n1 } from '../../engine/anim';
import { render3D } from '../../engine/three-kit';
import { applyCam, introCam, floorFog } from './camera';
import { drawFloor } from './dial';
import { MOON_R } from './three-world';
import { S, seg } from './state';
import type { Projector } from './proj';
import { drawOrbits } from './orbits';
import { drawHUD } from './hud';

const ORANGE_LIN = new THREE.Color(C.ORANGE);
const INK_LIN = new THREE.Color(C.INK);
/** monoliths rise in pairs, far pair first; the near pair is the gate we pass through at 9.2 */
export const RISE_ORDER = [[7, 0], [6, 1], [5, 2], [4, 3]];

export function moonY(t: number) {
  const scale = moonScale(t);
  const lift = ease.inOutCubic(seg(t, 8.0, 9.6));
  return MOON_R * scale + (1.55 - MOON_R) * lift;
}
export function moonScale(t: number) {
  return 0.18 + 0.82 * ease.outBack(seg(t, 6.4 - 1 / 60, 6.76), 1.5);
}

/** Set the 3D world for time t (shared with the montage). */
export function poseWorld(t: number, lit: (k: number) => number, flashOf: (k: number) => number) {
  const { world, cues } = S;
  const kp = pulse(t, cues.kicks, 0.16);
  const scale = moonScale(t);
  const y = moonY(t);
  world.setMoon(y, scale);
  const cool = ease.inOutCubic(seg(t, 6.42, 6.95));
  for (const m of [world.moon, world.moonM]) {
    const u = (m.material as THREE.ShaderMaterial).uniforms;
    (u.bg.value as THREE.Color).copy(ORANGE_LIN).lerp(INK_LIN, cool);
  }
  const moonPos = new THREE.Vector3(0, y, 0);
  const moonI = (1.0 + 0.7 * kp) * ease.outCubic(seg(t, 6.4, 6.7));
  for (let i = 0; i < 4; i++) {
    // the far pairs rise on the first three kicks of bar 5; the near pair (the gate the camera
    // flies through) waits for the bar-6 beat-4 kick so the moon's reflection stays clear
    const tk = i < 3 ? (cues.kicks[i] ?? 6.4 + 0.4 * i) : (cues.kicks[7] ?? 9.2);
    for (const k of RISE_ORDER[i]) {
      const rise = ease.outExpo(seg(t, tk - 1 / 60, tk + 0.4));
      const fl = t >= tk ? 0.32 * (1 - seg(t, tk, tk + 0.09)) ** 2 : 0;
      world.setMono(k, rise, lit(k), fl + flashOf(k), moonPos, moonI, 9, 32);
    }
  }
  return { kp, y, scale };
}

/** the dot's light pool on the floor when it is home (bars 4→5 continuity) */
export const HOME_POOL = 0.16;

/** Warm light pool on the floor under the moon + kick ripples. */
function floorLight(c: CanvasRenderingContext2D, P: Projector, t: number, kp: number) {
  const F = 100;
  c.save();
  c.globalCompositeOperation = 'lighter';
  if (P.floorTransform(c, [0, 0, 0], [1, 0, 0], [0, 0, -1], 1, F)) {
    const r = 3.2 * F;
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
    // continues the dot's own light pool (boot.ts) and swells with the moon
    const a = Math.max(HOME_POOL * (1 - seg(t, 6.4, 6.7)), (0.2 + 0.12 * kp) * ease.outCubic(seg(t, 6.4, 6.7)));
    g.addColorStop(0, `rgba(250,128,35,${a.toFixed(3)})`);
    g.addColorStop(0.35, `rgba(250,128,35,${(a * 0.35).toFixed(3)})`);
    g.addColorStop(1, 'rgba(250,128,35,0)');
    c.fillStyle = g;
    c.fillRect(-r, -r, 2 * r, 2 * r);
    // ripples on kicks
    for (const tk of S.cues.kicks) {
      const age = t - tk;
      if (age < 0 || age > 0.9 || tk > 9.6) continue;
      const k = ease.outCubic(age / 0.9);
      c.beginPath();
      c.arc(0, 0, (0.9 + 7 * k) * F, 0, Math.PI * 2);
      c.lineWidth = 1.2 * F * 0.012;
      c.strokeStyle = `rgba(250,250,247,${(0.35 * (1 - k) ** 2).toFixed(3)})`;
      c.stroke();
    }
  }
  c.restore();
}

/** Deterministic dust motes around the moon (drift + noise), additive. */
export function drawDust(c: CanvasRenderingContext2D, P: Projector, t: number, a: number, moonYv: number) {
  if (a <= 0.01) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 170; i++) {
    const r = 0.8 + 7.5 * Math.sqrt(hash(i, 1));
    const th = hash(i, 2) * Math.PI * 2 + t * 0.03 * (hash(i, 5) - 0.5);
    const y0 = hash(i, 3) * 4.2;
    const y = ((y0 + t * (0.05 + 0.08 * hash(i, 4))) % 4.4) + 0.05 * n1(t * 0.7, i);
    const x = r * Math.cos(th) + 0.15 * n1(t * 0.5, i + 50);
    const z = r * Math.sin(th) + 0.15 * n1(t * 0.5, i + 90);
    const p = P.project(x, y, z);
    if (!p.ok || p.x < -20 || p.x > 1940 || p.y < -20 || p.y > 1100) continue;
    const near = Math.exp(-((x * x + (y - moonYv) ** 2 + z * z) / 6));
    const fog = clamp(1 - (p.d - 6) / 24);
    const size = clamp(P.scaleAt(p.d) * 0.012, 0.6, 3.2);
    const al = a * fog * (0.25 + 0.75 * hash(i, 6)) * (0.35 + 0.65 * near) * (0.6 + 0.4 * Math.sin(t * 3 + i));
    if (al < 0.01) continue;
    c.fillStyle = near > 0.3 ? `rgba(255,190,130,${al.toFixed(3)})` : `rgba(240,238,232,${(al * 0.8).toFixed(3)})`;
    c.beginPath();
    c.arc(p.x, p.y, size, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** Soft glow around the moon + a faint light shaft from above. */
export function drawMoonGlow(c: CanvasRenderingContext2D, P: Projector, y: number, scale: number, a: number) {
  const p = P.project(0, y, 0);
  if (!p.ok) return;
  const r = MOON_R * scale * P.scaleAt(p.d);
  c.save();
  c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(p.x, p.y, r * 0.9, p.x, p.y, r * 2.2);
  g.addColorStop(0, `rgba(250,128,35,${(0.14 * a).toFixed(3)})`);
  g.addColorStop(1, 'rgba(250,128,35,0)');
  c.fillStyle = g;
  c.fillRect(p.x - r * 2.4, p.y - r * 2.4, r * 4.8, r * 4.8);
  c.restore();
}

/** Bars 5–6 (6.4–9.6): the void — moon inflates, monolith pages rise, the moon lifts. */
export function renderVoid(f: Frame): THREE.Texture {
  const { e, t } = f;
  const { cam, P, T, cues, world } = S;
  const gfx = e.gfx;
  applyCam(cam, introCam(t));
  P.update(cam);
  const fog = floorFog(t);
  const { kp, y, scale } = poseWorld(t, () => 0.1, () => 0);

  const refl = render3D(gfx, world.mirror, cam, { key: 'intro:refl', ss: 1, clear: null });
  const reflB = gfx.blur(refl, 5, 'intro:reflblur');
  const main = render3D(gfx, world.scene, cam, {
    key: 'intro:3d',
    ss: 2,
    clear: null,
    edges: { color: '#efede6', width: 1.25, opacity: 0.7 + 0.3 * kp },
  });
  const moonTex = render3D(gfx, world.moonScene, cam, { key: 'intro:moon', ss: 2, clear: null });

  const floor = e.layer('intro:floor');
  const c = floor.begin();
  floorLight(c, P, t, kp);
  drawFloor(c, { t, P, T, cues, fog, bright: 1 - 0.45 * seg(t, 6.4, 7.2), labels: 0, chapterLabels: 1 - seg(t, 6.4, 6.9), dot: false });
  const fg = e.layer('intro:fg');
  const g = fg.begin();
  // the arp filter opens 6.4 → 12.4: light, dust and bloom swell with it
  const open = ease.inQuad(seg(t, 6.4, 9.6));
  drawMoonGlow(g, P, y, scale, (0.8 + 0.4 * kp + 0.35 * open) * (0.6 + 0.4 * seg(t, 6.4, 6.6)));
  drawOrbits(c, g, P, t, y, scale, 1 - seg(t, 9.42, 9.56), cues.ticks);
  drawHUD(g, t, 0.55 * seg(t, 6.8, 7.0) * (1 - seg(t, 9.3, 9.5)), { blips: cues.blips, nodes: 31, bytes: 31 * 312, top: true });
  drawDust(g, P, t, seg(t, 6.5, 7.4) * (0.75 + 0.35 * open), y);

  const comp = gfx.compose(gfx.rt('intro:comp'), C.INK, [
    { tex: reflB, opacity: 0.55 * seg(t, 6.4, 6.65) },
    { tex: floor.end() },
    { tex: main },
    { tex: moonTex },
    { tex: fg.end() },
  ]);
  f.post.ca = 0.0008;
  f.overlay.tone = 'dark';
  return gfx.bloom(comp, { threshold: 0.5, strength: 0.6 + 0.25 * open, radius: 22 }, 'intro:bloom');
}
