import * as THREE from 'three';
import type { Frame } from '../../engine/engine';
import { render3D } from '../../engine/three-kit';
import { clamp, ease, seg } from '../../engine/anim';
import { P } from './pal';
import { T, FLOPPIES } from './timeline';
import { MONTAGE_WIN } from './state';
import { scene3, cam, buildEngine, rigAt, applyRig, HOME, poseEngine, drawFlaps, project, poseSheet, parts, DISPLAY, CORE, PRINT, type EngineState } from './engine3d';

export { buildEngine };

const tmp = new THREE.Vector3();

/** World point on the plane z = zw under screen pixel (x, y) for the current camera. */
function unproject(x: number, y: number, zw: number) {
  const ndc = new THREE.Vector3((x / 1920) * 2 - 1, -(y / 1080) * 2 + 1, 0.5).unproject(cam);
  const dir = ndc.sub(cam.position).normalize();
  const s = (zw - cam.position.z) / dir.z;
  return cam.position.clone().addScaledVector(dir, s);
}

export interface MachineOut {
  /** layer under the windows (blueprint / machine + seated floppies) */
  back: THREE.Texture | null;
  backOpacity: number;
  /** blueprint line pass (fades out while the machine inflates) */
  lines: THREE.Texture | null;
  linesOpacity: number;
  /** floppies early in flight, above the windows */
  front: THREE.Texture | null;
  state: EngineState | null;
  /** HUD anchors in screen px */
  anchors: Record<string, { x: number; y: number }>;
  /** contact shadow on the floor: centre + the two projected half-axes (screen px), and its opacity */
  shadow: { c: { x: number; y: number }; ax: { x: number; y: number }; az: { x: number; y: number }; alpha: number } | null;
}

/**
 * `launchAt(i)` gives the screen point (px) where floppy i pops out of the terminal at its launch.
 */

export function renderMachine(f: Frame, view: { s: number; cx: number; cy: number; qx: number; qy: number }, launchAt: (i: number) => { x: number; y: number }): MachineOut {
  const t = f.t;
  const g = f.e.gfx;
  buildEngine();
  // the machine is the wallpaper drawing until the eject, then folds back after the print
  const live = t >= T.enter3 && t < T.speed;
  // launch points (world) from the camera at each launch
  const rig = live ? rigAt(t) : HOME;
  // camera bumps on the clunks
  let bump = 0;
  for (const fl of FLOPPIES) if (t >= fl.land) bump = Math.max(bump, Math.exp(-(t - fl.land) / 0.08) * 0.012);
  const dist = applyRig(rig, bump);
  cam.clearViewOffset();
  cam.updateProjectionMatrix();
  // HUD anchors in desktop px (the HUD canvas applies the 2D view itself)
  const anchors: MachineOut['anchors'] = {};
  const a = (name: string, x: number, y: number, z: number) => (anchors[name] = project(tmp.set(x, y, z)));
  a('bay', 0, 2.0, 0.15);
  a('display', DISPLAY.x - DISPLAY.w / 2 + 0.3, DISPLAY.y + DISPLAY.h / 2, DISPLAY.z);
  a('core', CORE.x, CORE.y + 0.86, CORE.z);
  a('print', -2.4, PRINT.y, 1.55);
  a('gear', -4.15, 1.0, 0.25);
  a('displayC', DISPLAY.x, DISPLAY.y, DISPLAY.z);
  // blueprint detail points (front elevation)
  a('dispTL', DISPLAY.x - DISPLAY.w / 2, DISPLAY.y + DISPLAY.h / 2, DISPLAY.z);
  a('dispBR', DISPLAY.x + DISPLAY.w / 2, DISPLAY.y - DISPLAY.h / 2, DISPLAY.z);
  a('plinthL', -4.25, -2.28, 1.65);
  a('plinthR', 4.25, -2.28, 1.65);
  a('topR', 4.0, 1.7, 1.5);
  a('coreC', CORE.x, CORE.y, CORE.z);
  a('nameL', -3.8, -1.28, 1.5);
  // the blueprint follows the 2D desktop camera (final push into the caret)
  if (!live && view.s !== 1) {
    const w = 1920 / view.s;
    const h = 1080 / view.s;
    cam.setViewOffset(1920, 1080, view.cx - view.qx / view.s, view.cy - view.qy / view.s, w, h);
  } else cam.clearViewOffset();
  // each floppy leaves its terminal line: the start is re-projected under the moving camera so it
  // always begins on the text, wherever the dolly zoom has taken the world
  const starts = FLOPPIES.map((_, i) => {
    const p = launchAt(i);
    return unproject(p.x, p.y, 3.2);
  });
  const gears = (f.e.audio.timing.events.foley ?? []).filter((x) => x.type === 'gear').map((x) => x.t);
  const state = poseEngine(t, (i) => starts[i], gears);
  drawFlaps(t);
  poseSheet(t, MONTAGE_WIN);

  const kd = Math.max(1, dist / 9);
  const fill = live ? ease.inOutQuad(seg(t, T.enter3 + 0.05, T.enter3 + 0.5)) : 0;
  const out: MachineOut = { back: null, backOpacity: 1, lines: null, linesOpacity: 0, front: null, state, anchors, shadow: null };
  if (fill > 0) {
    const c0 = project(tmp.set(0.2, -2.28, 0.15));
    const px = project(tmp.set(6.6, -2.28, 0.15));
    const pz = project(tmp.set(0.2, -2.28, 2.9));
    out.shadow = { c: c0, ax: { x: px.x - c0.x, y: px.y - c0.y }, az: { x: pz.x - c0.x, y: pz.y - c0.y }, alpha: fill };
  }

  // floppy split between the back pass (near the bay) and the front pass (leaving the terminal)
  const { machine: machineGroup, floppies: floppyGroups, sheet: sheetMesh } = parts();
  const vis = floppyGroups.map((o) => o.visible);

  if (fill < 1) {
    // blueprint: line art only, ocean ink
    floppyGroups.forEach((o) => (o.visible = false));
    out.lines = render3D(g, scene3, cam, { key: 'cli:bp', ss: 2, clear: null, edges: { color: P.OCEAN, width: 1.6, depth: kd, normal: 1, only: true } });
    out.linesOpacity = 0.62 * (1 - fill);
    floppyGroups.forEach((o, i) => (o.visible = vis[i]));
  }
  if (fill > 0) {
    floppyGroups.forEach((o, i) => (o.visible = vis[i] && state.floppy[i] > 0.5));
    out.back = render3D(g, scene3, cam, { key: 'cli:m3', ss: 2, clear: null, edges: { color: P.INK, width: 2.2, depth: kd, normal: 1 } });
    out.backOpacity = fill;
    const front = floppyGroups.some((o, i) => vis[i] && state.floppy[i] <= 0.5 && state.floppy[i] > 0);
    if (front) {
      machineGroup.visible = false;
      floppyGroups.forEach((o, i) => (o.visible = vis[i] && state.floppy[i] <= 0.5 && state.floppy[i] > 0));
      const sv = sheetMesh.visible;
      sheetMesh.visible = false;
      out.front = render3D(g, scene3, cam, { key: 'cli:f3', ss: 2, clear: null, edges: { color: P.INK, width: 2.2, depth: kd, normal: 1 } });
      sheetMesh.visible = sv;
      machineGroup.visible = true;
    }
    floppyGroups.forEach((o, i) => (o.visible = vis[i]));
  }

  void clamp;
  return out;
}
