import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, ease, lerp, seg, smoothstep, track, type Key } from '../../engine/anim';
import { FONTS } from '../../engine/draw2d';
import { flatMat, toonMat } from '../../engine/three-kit';
import { moonMaterial } from '../_shared/moon';
import { P } from './pal';
import { FLOPPIES, T, B } from './timeline';

/**
 * The Document Engine (docs/scenes/cli.md · S4–S5): a toon 3D precision machine whose front
 * elevation is the desktop wallpaper's blueprint. Floppies (ejected layout files) slot into the
 * top bay; a split-flap display rewrites the import; the print head prints the page.
 * Units: the chassis is 8 wide; the front face looks down +z.
 */
export const scene3 = new THREE.Scene();
export const cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 600);

const SLOT_X = (i: number) => -3.15 + i * 0.9;
const BAY_Y = 1.83;
const BAY_Z = 0.15;
export const DISPLAY = { x: -0.75, y: 0.5, z: 1.56, w: 5.6, h: 1.12 };
export const CORE = { x: 2.85, y: 0.5, z: 1.5 };
export const PRINT = { y: -0.78, z: 1.5 };

const machine = new THREE.Group();
const leds: THREE.Mesh[] = [];
const floppies: { g: THREE.Group; slot: number }[] = [];
let gearA: THREE.Mesh;
let gearB: THREE.Mesh;
let ringA: THREE.Mesh;
let ringB: THREE.Mesh;
let carriage: THREE.Mesh;
let coreGlow: THREE.Mesh;
let sheet: THREE.Mesh;
let flapTex: THREE.CanvasTexture;
let flapCanvas: HTMLCanvasElement;
const lamps: THREE.Mesh[] = [];
const ledOn = flatMat(P.ORANGE);
const ledOff = flatMat('#2a2a30');

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 8;
  return tx;
}

function plane(w: number, h: number, tex: THREE.Texture, transparent = false) {
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent, toneMapped: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

function gearGeom(r: number, teeth: number, thick: number) {
  const s = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = i % 4;
    const rr = k === 1 || k === 2 ? r : r * 0.82;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.22, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -thick / 2);
  return g;
}

/** Floppy label: the file name as big as the label allows (auto-fit), its folder small beneath. */
function floppyLabel(file: string) {
  const parts = file.split('/');
  const name = parts.pop()!;
  const dir = parts.join('/') + '/';
  const W = 512;
  const H = 352;
  return canvasTex(W, H, (c) => {
    c.fillStyle = '#F4F2EA';
    c.fillRect(0, 0, W, H);
    c.fillStyle = P.ORANGE;
    c.fillRect(0, 0, W, 44);
    c.fillStyle = P.INK;
    c.font = `400 32px ${FONTS.pixel}`;
    c.textBaseline = 'middle';
    c.fillText('FD-16', 18, 23);
    // the name fills the label width
    let size = 112;
    c.font = `800 ${size}px ${FONTS.code}`;
    const w = c.measureText(name).width;
    size = Math.floor(Math.min(size, (size * (W - 32)) / w));
    c.font = `800 ${size}px ${FONTS.code}`;
    c.fillText(name, 16, 44 + 22 + size * 0.5);
    c.font = `500 30px ${FONTS.code}`;
    c.fillStyle = '#55565c';
    c.fillText(dir, 18, H - 40);
  });
}
function buildFloppy(file: string) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.74, 0.05, 2, 0.02), toonMat('#2B2C33'));
  g.add(body);
  // metal shutter at the bottom (goes into the slot first)
  const sh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.058), toonMat('#C9CCD2'));
  sh.position.set(0.04, -0.22, 0);
  g.add(sh);
  const lab = plane(0.64, 0.44, floppyLabel(file));
  lab.position.set(0, 0.135, 0.0265);
  lab.userData.noEdges = true;
  g.add(lab);
  return g;
}

export const FLAP_COLS = 30;
export const FLAP_ROWS: [string, string][] = [
  ['fumadocs-ui/layouts/docs', '@/layouts/docs'],
  ['fumadocs-ui/layouts/docs/page', '@/layouts/docs/page'],
];

export function buildEngine() {
  if (machine.children.length) return;
  // warm key, cool fill and a rim from behind: three cel bands with a lit silhouette
  scene3.add(new THREE.AmbientLight(0xdfe6ff, 0.55));
  const dl = new THREE.DirectionalLight(0xfff0d8, 2.3);
  dl.position.set(-5, 8, 7);
  scene3.add(dl);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.5);
  fill.position.set(6, 1, 3);
  scene3.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(2, 5, -8);
  scene3.add(rim);

  const cream = toonMat('#EFEDE5', { steps: 4 });
  const cream2 = toonMat('#D9D6CB', { steps: 4 });
  const ink = toonMat('#17171B');
  const chassis = new THREE.Mesh(new RoundedBoxGeometry(8.0, 3.4, 3.0, 3, 0.14), cream);
  machine.add(chassis);
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(8.5, 0.32, 3.3, 2, 0.06), cream2);
  plinth.position.y = -1.86;
  machine.add(plinth);
  for (const [x, z] of [[-3.7, 1.2], [3.7, 1.2], [-3.7, -1.2], [3.7, -1.2]]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.26, 0.6), ink);
    foot.position.set(x, -2.15, z);
    machine.add(foot);
  }
  // flap display bezel + face
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(DISPLAY.w + 0.3, DISPLAY.h + 0.3, 0.24, 2, 0.05), ink);
  bezel.position.set(DISPLAY.x, DISPLAY.y, 1.46);
  machine.add(bezel);
  flapCanvas = document.createElement('canvas');
  flapCanvas.width = 1536;
  flapCanvas.height = 308;
  flapTex = new THREE.CanvasTexture(flapCanvas);
  flapTex.colorSpace = THREE.SRGBColorSpace;
  flapTex.anisotropy = 8;
  const face = plane(DISPLAY.w, DISPLAY.h, flapTex);
  face.position.set(DISPLAY.x, DISPLAY.y, DISPLAY.z + 0.025);
  face.userData.noEdges = true;
  machine.add(face);
  // core porthole: ring + moon + gyroscope rings
  const port = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.08, 10, 48), ink);
  port.position.set(CORE.x, CORE.y, CORE.z);
  machine.add(port);
  const well = new THREE.Mesh(new THREE.CircleGeometry(0.82, 48), toonMat('#1d1d22'));
  well.position.set(CORE.x, CORE.y, CORE.z - 0.02);
  machine.add(well);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 32), moonMaterial({ bg: P.INK, primary: P.ORANGE }));
  moon.position.set(CORE.x, CORE.y, CORE.z - 0.1);
  machine.add(moon);
  ringA = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.022, 6, 64), flatMat(P.ORANGE));
  ringA.position.copy(moon.position);
  machine.add(ringA);
  ringB = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.018, 6, 64), flatMat('#F3EFE3'));
  ringB.position.copy(moon.position);
  machine.add(ringB);
  coreGlow = new THREE.Mesh(new THREE.CircleGeometry(0.84, 48), new THREE.MeshBasicMaterial({ color: P.ORANGE, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
  coreGlow.position.set(CORE.x, CORE.y, CORE.z + 0.06);
  coreGlow.userData.noEdges = true;
  machine.add(coreGlow);
  // print slot + rail + carriage
  const slot = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.13, 0.3), ink);
  slot.position.set(0, PRINT.y, 1.42);
  machine.add(slot);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 7.2, 12), toonMat('#BFC2C8'));
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, -0.5, 1.62);
  machine.add(rail);
  carriage = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.3, 0.32, 2, 0.04), toonMat(P.ORANGE));
  carriage.position.set(-3.2, -0.5, 1.64);
  machine.add(carriage);
  // nameplate
  const name = plane(2.5, 0.34, canvasTex(750, 102, (c) => {
    c.fillStyle = '#17171B';
    c.fillRect(0, 0, 750, 102);
    c.fillStyle = '#EFEDE5';
    c.font = `400 34px ${FONTS.wide}`;
    c.letterSpacing = '6px';
    c.textBaseline = 'middle';
    c.fillText('DOCUMENT ENGINE', 24, 54);
    c.letterSpacing = '0px';
    c.fillStyle = P.ORANGE;
    c.font = `700 30px ${FONTS.code}`;
    c.textAlign = 'right';
    c.fillText('FD-16', 726, 54);
  }));
  name.position.set(-2.55, -1.28, 1.505);
  name.userData.noEdges = true;
  machine.add(name);
  // vents (right of the nameplate)
  for (let k = 0; k < 7; k++) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.04), ink);
    v.position.set(0.6 + k * 0.22, -1.28, 1.5);
    machine.add(v);
  }
  // top bay: 8 slot lips, slits, LEDs, number plates
  for (let i = 0; i < 8; i++) {
    const x = SLOT_X(i);
    const lip = new THREE.Mesh(new RoundedBoxGeometry(0.82, 0.14, 0.42, 2, 0.03), cream2);
    lip.position.set(x, 1.76, BAY_Z);
    machine.add(lip);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.02, 0.09), ink);
    slit.position.set(x, BAY_Y, BAY_Z);
    machine.add(slit);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.04), ledOff);
    led.position.set(x, 1.76, BAY_Z + 0.22);
    leds.push(led);
    machine.add(led);
    const num = plane(0.34, 0.18, canvasTex(136, 72, (c) => {
      c.fillStyle = '#EFEDE5';
      c.fillRect(0, 0, 136, 72);
      c.fillStyle = P.INK;
      c.font = `700 52px ${FONTS.code}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(i + 1).padStart(2, '0'), 68, 38);
    }));
    num.rotation.x = -Math.PI / 2;
    num.position.set(x, 1.702, 0.95);
    num.userData.noEdges = true;
    machine.add(num);
  }
  // side gear train (left face)
  gearA = new THREE.Mesh(gearGeom(1.0, 16, 0.16), toonMat('#D9D6CB'));
  gearA.rotation.y = Math.PI / 2;
  gearA.position.set(-4.1, 0.15, 0.25);
  machine.add(gearA);
  gearB = new THREE.Mesh(gearGeom(0.55, 9, 0.16), toonMat(P.ORANGE));
  gearB.rotation.y = Math.PI / 2;
  gearB.position.set(-4.1, -0.85, -0.95);
  machine.add(gearB);
  // panel seams and bolts on the front plate: crisp line-art detail on the big cream surfaces
  const seam = (x: number, y: number, w: number, h: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), ink);
    m.position.set(x, y, 1.505);
    machine.add(m);
  };
  seam(0, -0.98, 7.7, 0.025);
  seam(-3.62, 0.25, 0.025, 2.4);
  seam(3.62, 0.25, 0.025, 2.4);
  for (const [x, y] of [[-3.82, 1.5], [3.82, 1.5], [-3.82, -1.5], [3.82, -1.5], [-3.82, -0.62], [3.82, -0.62]] as const) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 12), toonMat('#BFC2C8'));
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(x, y, 1.52);
    machine.add(bolt);
  }
  // status lamps on the top deck (they light up as the slots fill)
  for (let i = 0; i < 3; i++) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16), i === 0 ? flatMat(P.ORANGE) : flatMat('#2a2a30'));
    lamp.position.set(3.0 + i * 0.3, 1.74, 0.95);
    lamps.push(lamp);
    machine.add(lamp);
  }
  scene3.add(machine);


  // floppies
  FLOPPIES.forEach((fl, i) => {
    const g = buildFloppy(fl.file);
    g.visible = false;
    floppies.push({ g, slot: i });
    scene3.add(g);
  });

  // printed sheet: a real paper slab (front = the page, cream back + edges), bent per frame on the CPU
  const geo = new THREE.BoxGeometry(1, 1, SHEET_THICK, 32, 18, 1);
  geo.translate(0, 0, -SHEET_THICK / 2); // the printed face sits exactly on the pose plane (lands pixel-exact)
  sheetBase = (geo.attributes.position.array as Float32Array).slice();
  const edge = toonMat('#F6F3EA');
  const back = toonMat('#E4DFD2');
  sheet = new THREE.Mesh(geo, [edge, edge, edge, edge, paperFront, back]);
  sheet.visible = false;
  scene3.add(sheet);

  // its soft shadow on the machine's front plate (multiplied into the colour pass)
  sheetShadow = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 3.0), shadowMat);
  sheetShadow.position.set(0, 0, 1.502);
  sheetShadow.visible = false;
  sheetShadow.renderOrder = 2;
  machine.add(sheetShadow);
}

const SHEET_THICK = 0.016;
let sheetBase: Float32Array;
let sheetShadow: THREE.Mesh;
/** Key light direction (towards the light), world space — matches the directional key light. */
const KEY = new THREE.Vector3(-5, 8, 7).normalize();

/** The printed face: the page plate, lit while it turns (shade + a sheen band), exact plate colours at rest. */
const paperFront = new THREE.ShaderMaterial({
  uniforms: { map: { value: null as THREE.Texture | null }, amt: { value: 0 }, lightV: { value: new THREE.Vector3(0, 0, 1) } },
  vertexShader: /* glsl */ `
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D map; uniform float amt; uniform vec3 lightV;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){
      vec3 base = texture2D(map, vUv).rgb;
      vec3 n = normalize(vN); vec3 v = normalize(vV); vec3 l = normalize(lightV);
      float d = max(dot(n, l), 0.0);
      float shade = mix(1.0, 0.55 + 0.6 * d, amt);
      float spec = pow(max(dot(n, normalize(l + v)), 0.0), 36.0) * 0.6 * amt;
      gl_FragColor = vec4(base * shade + vec3(spec), 1.0);
      #include <colorspace_fragment>
    }`,
});

/** dst *= (1 - strength · softRect): a contact-free soft shadow, alpha untouched. */
const shadowMat = new THREE.ShaderMaterial({
  uniforms: { rect: { value: new THREE.Vector4(0, -5, 0.1, 0.1) }, soft: { value: 0.1 }, strength: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vP;
    void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec4 rect; uniform float soft; uniform float strength;
    varying vec2 vP;
    void main(){
      vec2 q = abs(vP - rect.xy) - rect.zw;
      float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
      float a = 1.0 - smoothstep(-soft, soft, dist);
      gl_FragColor = vec4(vec3(1.0 - strength * a), 1.0);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.ZeroFactor,
  blendDst: THREE.SrcColorFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
});

/** Scene parts for pass splitting. */
export function parts() {
  return { machine, floppies: floppies.map((f) => f.g), sheet };
}

export function setSheetTexture(tex: THREE.Texture) {
  paperFront.uniforms.map.value = tex;
}

// ── camera rig ───────────────────────────────────────────────────────────────
export interface Rig {
  az: number; // degrees, 0 = front, negative = from the left
  el: number;
  fov: number;
  /** frame height (world units) at the target distance */
  H: number;
  tx: number;
  ty: number;
  tz: number;
}

const D2R = Math.PI / 180;
const io = ease.inOutCubic;
const k = (t: number, v: number, e = io): Key => [t, v, e];

/** Home = the wallpaper blueprint (near-ortho front elevation). */
export const HOME: Rig = { az: 0, el: 0, fov: 2.5, H: 11.2, tx: 0, ty: 0.05, tz: 0 };

export function rigAt(t: number): Rig {
  const inflate0 = T.enter3;
  const inflate1 = T.enter3 + 0.6;
  const whip0 = T.installed;
  const whip1 = T.flapFrom;
  // fov: log-space dolly zoom
  const lf = track(t, [k(inflate0, Math.log(HOME.fov)), k(inflate1, Math.log(30), ease.inOutQuad), k(whip0, Math.log(30)), k(whip1, Math.log(24)), k(T.print, Math.log(24)), k(T.montage, Math.log(28))]);
  const fold0 = T.montage + 0.2;
  const fold1 = T.speed - 0.2;
  const back = (v: number, home: number): Key[] => [k(fold0, v), k(fold1, home)];
  return {
    fov: t >= fold0 ? Math.exp(track(t, back(Math.log(28), Math.log(HOME.fov)))) : Math.exp(lf),
    az: track(t, [k(inflate0, 0), k(inflate1, -30), k(whip0, -24, ease.inOutCubic), k(whip1, 0, ease.inOutQuint), k(T.print, 0), k(T.montage, -6), ...back(-6, 0)]),
    el: track(t, [k(inflate0, 0), k(inflate1, 24), k(whip0, 21, ease.inOutCubic), k(whip1, 3, ease.inOutQuint), k(T.print, 2), k(T.montage, 10), ...back(10, 0)]),
    H: track(t, [k(inflate0, HOME.H), k(inflate1, 10.2), k(whip0, 7.6, ease.inOutCubic), k(whip1, 3.85, ease.inOutQuint), k(T.print, 3.6, ease.linear), k(T.montage, 6.5), ...back(6.5, HOME.H)]),
    tx: track(t, [k(inflate0, 0), k(inflate1, 0.2), k(whip0, 0.0, ease.inOutCubic), k(whip1, DISPLAY.x, ease.inOutQuint), k(T.print, DISPLAY.x), k(T.montage, 0), ...back(0, 0)]),
    ty: track(t, [k(inflate0, HOME.ty), k(inflate1, 0.75), k(whip0, 1.05, ease.inOutCubic), k(whip1, DISPLAY.y + 0.5, ease.inOutQuint), k(T.print, DISPLAY.y + 0.45), k(T.montage, -0.2), ...back(-0.2, HOME.ty)]),
    tz: track(t, [k(inflate0, 0), k(inflate1, 0.2), k(whip0, 0.2), k(whip1, 1.5, ease.inOutQuint), k(T.print, 1.5), k(T.montage, 1.0), ...back(1.0, 0)]),
  };
}

export function applyRig(r: Rig, bump = 0) {
  const fov = r.fov;
  const dist = r.H / 2 / Math.tan((fov * D2R) / 2);
  const az = r.az * D2R;
  const el = r.el * D2R;
  const tgt = new THREE.Vector3(r.tx, r.ty, r.tz);
  cam.fov = fov;
  cam.near = Math.max(0.1, dist - 30);
  cam.far = dist + 30;
  cam.position.set(tgt.x + Math.sin(az) * Math.cos(el) * dist, tgt.y + Math.sin(el) * dist, tgt.z + Math.cos(az) * Math.cos(el) * dist);
  cam.up.set(0, 1, 0);
  cam.lookAt(tgt);
  cam.zoom = 1 + bump;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return dist;
}

export function project(v: THREE.Vector3, W = 1920, H = 1080) {
  const p = v.clone().project(cam);
  return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, z: p.z };
}

// ── animated parts ──────────────────────────────────────────────────────────
/** Floppy pose at t: hidden before launch; flight from `from` (world) to its slot; inserted. */
function floppyPose(t: number, i: number, from: THREE.Vector3) {
  const fl = FLOPPIES[i];
  const g = floppies[i].g;
  if (t < fl.launch) {
    g.visible = false;
    return 0;
  }
  g.visible = true;
  const x = SLOT_X(i);
  const above = new THREE.Vector3(x, BAY_Y + 0.95, BAY_Z);
  const seated = new THREE.Vector3(x, BAY_Y + 0.12, BAY_Z);
  const dur = fl.land - fl.launch;
  const u = clamp((t - fl.launch) / dur);
  // flight 0..0.8 (arc to above the slot), insert 0.8..1 (drop in), then a tiny settle
  const fu = ease.inOutCubic(clamp(u / 0.8));
  const apex = new THREE.Vector3(lerp(from.x, x, 0.55), Math.max(from.y, above.y) + 1.6, lerp(from.z, BAY_Z, 0.6) + 0.8);
  const a = from.clone().lerp(apex, fu);
  const b = apex.clone().lerp(above, fu);
  const pos = a.lerp(b, fu);
  const ins = ease.inCubic(clamp((u - 0.8) / 0.2));
  pos.lerp(seated, ins);
  if (u >= 1) {
    const d = t - fl.land;
    pos.copy(seated);
    pos.y -= Math.exp(-d * 18) * Math.sin(d * 60) * 0.03;
  }
  g.position.copy(pos);
  const spin = (1 - fu) * Math.PI * 2 * (i % 2 ? -1 : 1);
  g.rotation.set((1 - fu) * 0.6, spin, (1 - fu) * 0.4 * (i % 2 ? 1 : -1));
  const s = lerp(0.55, 1, ease.outCubic(clamp(u / 0.5)));
  g.scale.setScalar(s);
  return u;
}

export interface EngineState {
  /** floppy flight progress 0..1 per slot (1 = seated) */
  floppy: number[];
  seated: number;
}

/** Pose everything for time t. `launchFrom(i)` = world start point of floppy i. */
export function poseEngine(t: number, launchFrom: (i: number) => THREE.Vector3, gearTimes: number[] = []): EngineState {
  // gears turn in 16th-note steps (limited animation) and ratchet a big notch on each 'gear' foley
  const step = Math.floor(t / 0.1);
  let ratchet = 0;
  for (const g of gearTimes) if (g <= t) ratchet += ease.outBack(clamp((t - g) / 0.08));
  gearA.rotation.x = step * (Math.PI / 16) + ratchet * (Math.PI / 4);
  gearB.rotation.x = -(step * (Math.PI / 16) + ratchet * (Math.PI / 4)) * (16 / 9);
  ringA.rotation.set(step * 0.35 + ratchet * 0.9, step * 0.2, 0);
  ringB.rotation.set(-step * 0.25 - ratchet * 0.7, step * 0.4, 0.5);
  let seated = 0;
  const prog: number[] = [];
  FLOPPIES.forEach((_, i) => {
    const u = floppyPose(t, i, launchFrom(i));
    prog.push(u);
    const on = t >= FLOPPIES[i].land;
    if (on) seated++;
    leds[i].material = on ? ledOn : ledOff;
  });
  lamps.forEach((l, i) => (l.material = seated >= [1, 4, 8][i] || (i === 0 && t >= T.enter3) ? ledOn : ledOff));
  // core glow pulses on each landing and on the print
  let glow = 0;
  for (const fl of FLOPPIES) glow = Math.max(glow, Math.exp(-Math.max(0, t - fl.land) / 0.12) * (t >= fl.land ? 0.55 : 0));
  glow = Math.max(glow, t >= T.print ? Math.exp(-(t - T.print) / 0.25) * 0.9 : 0);
  (coreGlow.material as THREE.MeshBasicMaterial).opacity = glow;
  // print head carriage sweeps during the print
  const pk = seg(t, T.print, T.print + 0.3, ease.inOutQuad);
  carriage.position.x = t < T.print ? -3.2 : lerp(-3.2, 3.2, pk);
  return { floppy: prog, seated };
}

// ── split-flap display ──────────────────────────────────────────────────────
/**
 * A real split-flap module: every module turns its drum forward, in drum order, one card per
 * frame. All modules start together on the flutter cue (the second row one frame later) and each
 * stops on its own character, so the board settles in a natural staggered wave by 73.12.
 */
const DRUM = ' @-./abcdefghijklmnopqrstuvwxyz';
const FLIP_RATE = 60;
function flapChar(row: number, col: number, t: number): { a: string; b: string; flipping: boolean } {
  const [from, to] = FLAP_ROWS[row];
  const A = from.padEnd(FLAP_COLS, ' ')[col];
  const Z = to.padEnd(FLAP_COLS, ' ')[col];
  const L = DRUM.length;
  const ia = DRUM.indexOf(A);
  const n = (DRUM.indexOf(Z) - ia + L) % L;
  const t0 = T.flapFrom + row / 60;
  if (n === 0 || t < t0) return { a: A, b: A, flipping: false };
  const i = Math.floor((t - t0) * FLIP_RATE + 1e-6);
  if (i >= n) return { a: Z, b: Z, flipping: false };
  return { a: DRUM[(ia + i) % L], b: DRUM[(ia + i + 1) % L], flipping: true };
}

export function drawFlaps(t: number) {
  const c = flapCanvas.getContext('2d')!;
  const W = flapCanvas.width;
  const H = flapCanvas.height;
  c.fillStyle = '#0d0d10';
  c.fillRect(0, 0, W, H);
  const cw = W / FLAP_COLS;
  const ch = (H - 24) / 2;
  c.font = `700 ${Math.round(ch * 0.62)}px ${FONTS.code}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const CARD = '#1e1f25';
  for (let r = 0; r < 2; r++) {
    for (let col = 0; col < FLAP_COLS; col++) {
      const x = col * cw + 2;
      const y = 8 + r * (ch + 8);
      const w = cw - 4;
      const h = ch;
      const mid = y + h / 2;
      const { a, b, flipping } = flapChar(r, col, t);
      /** one half card of character `s`, optionally squashed toward the hinge (fold) */
      const half = (s: string, top: boolean, sy = 1, shade = 0) => {
        c.save();
        c.beginPath();
        c.rect(x, top ? y : mid, w, h / 2);
        c.clip();
        c.translate(0, mid);
        c.scale(1, sy);
        c.translate(0, -mid);
        c.fillStyle = CARD;
        c.fillRect(x, y, w, h);
        if (s !== ' ') {
          c.fillStyle = '#F2EFE6';
          c.fillText(s, x + w / 2, mid + 2);
        }
        if (shade > 0) {
          c.fillStyle = `rgba(0,0,0,${shade})`;
          c.fillRect(x, y, w, h);
        }
        c.restore();
      };
      if (!flipping) {
        half(b, true);
        half(b, false);
      } else {
        // mid-flip, just past vertical: the next card's top is revealed, the current bottom still
        // shows, and the falling flap (next card's lower half) is a thin sliver under the hinge
        half(b, true);
        half(a, false, 1, 0.28);
        half(b, false, 0.16, 0.45);
      }
      c.fillStyle = '#060608';
      c.fillRect(x, mid - 1, w, 2);
    }
  }
  flapTex.needsUpdate = true;
}

// ── printed sheet ───────────────────────────────────────────────────────────
/**
 * The page slides out of the print slot (73.2–73.35), then lifts and flies to the camera, ending
 * exactly on the montage window rect `target` (screen px) at 73.6.
 */
export function poseSheet(t: number, target: { x: number; y: number; w: number; h: number }) {
  if (t < T.print || t >= T.montage + 0.05) {
    sheet.visible = false;
    sheetShadow.visible = false;
    return;
  }
  sheet.visible = true;
  const W = 6.4;
  const Hs = W * (9 / 16);
  // final pose: a plane facing the camera at distance d covering the target rect
  const d = cam.position.distanceTo(new THREE.Vector3(0, 0, 1.5)) * 0.5;
  const fovY = cam.fov * D2R;
  const viewH = 2 * d * Math.tan(fovY / 2);
  const pxToWorld = viewH / 1080;
  const cx = (target.x + target.w / 2 - 960) * pxToWorld;
  const cy = -(target.y + target.h / 2 - 540) * pxToWorld;
  const fwd = new THREE.Vector3();
  cam.getWorldDirection(fwd);
  const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const endPos = cam.position.clone().addScaledVector(fwd, d).addScaledVector(right, cx).addScaledVector(up, cy);
  const endQ = cam.quaternion.clone();
  const endScale = new THREE.Vector2(target.w * pxToWorld, target.h * pxToWorld);
  // slot pose: lying flat, sliding out of the print slot toward +z
  const out = ease.outCubic(seg(t, T.print, T.print + 0.15));
  const slotPos = new THREE.Vector3(0, PRINT.y - 0.02, 1.55 + (Hs / 2) * (2 * out - 1));
  const slotQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const fly = ease.inOutCubic(seg(t, T.print + 0.12, T.montage));
  const pos = slotPos.clone().lerp(endPos, fly);
  pos.y += Math.sin(fly * Math.PI) * 0.8;
  sheet.position.copy(pos);
  sheet.quaternion.copy(slotQ).slerp(endQ, ease.outCubic(fly));
  const sx = lerp(W, endScale.x, fly);
  const sy = lerp(Hs, endScale.y, fly);
  sheet.scale.set(sx, sy, 1);
  sheet.updateMatrixWorld(true);

  // paper physicality: the free end droops as it leaves the slot; in flight the sheet bows (middle
  // leading, edges trailing) with a little twist; flat again for the landing
  const droop = 0.1 * Hs * out * (1 - seg(t, T.print + 0.1, T.print + 0.22, ease.inOutQuad));
  const bow = 0.075 * sy * Math.sin(Math.PI * fly) * (1 - seg(t, T.montage - 0.08, T.montage));
  const twist = 0.03 * sy * Math.sin(Math.PI * fly);
  const pa = sheet.geometry.attributes.position as THREE.BufferAttribute;
  const arr = pa.array as Float32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const x = sheetBase[i];
    const y = sheetBase[i + 1];
    const free = Math.max(0, -y * 2); // 0 at the middle → 1 at the free (bottom) edge
    arr[i + 2] = sheetBase[i + 2] - droop * free * free + bow * (1 / 3 - 4 * y * y) + twist * 4 * x * y;
  }
  pa.needsUpdate = true;
  sheet.geometry.computeVertexNormals();
  sheet.geometry.computeBoundingSphere();

  // lighting that answers the rotation (sheen sweeps across while it turns), neutral when it lands
  paperFront.uniforms.amt.value = 1 - seg(t, T.montage - 0.1, T.montage, ease.inOutQuad);
  paperFront.uniforms.lightV.value.copy(KEY).transformDirection(cam.matrixWorldInverse);

  // its shadow on the front plate: the sheet's corners projected along the key light onto z = 1.502
  const zp = 1.502;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let tMin = Infinity;
  let tSum = 0;
  for (const [u, v] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] as const) {
    const c = new THREE.Vector3(u, v, 0).applyMatrix4(sheet.matrixWorld);
    const tt = Math.max(0, (c.z - zp) / KEY.z);
    const px = c.x - KEY.x * tt;
    const py = c.y - KEY.y * tt;
    x0 = Math.min(x0, px);
    x1 = Math.max(x1, px);
    y0 = Math.min(y0, py);
    y1 = Math.max(y1, py);
    tMin = Math.min(tMin, tt);
    tSum += tt;
  }
  const su = shadowMat.uniforms;
  su.rect.value.set((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2);
  su.soft.value = 0.06 + 0.08 * (tSum / 4);
  su.strength.value = 0.42 * (1 - smoothstep(0.6, 5.5, tMin)) * (1 - seg(t, T.montage - 0.15, T.montage));
  sheetShadow.visible = su.strength.value > 0.003;
}

/** Hide the sheet's shadow whenever the sheet itself is hidden. */
export function sheetShadowOff() {
  sheetShadow.visible = false;
}

export { B };
