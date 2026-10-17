import * as THREE from 'three';
import type { Frame } from '../../engine/engine';
import { C } from '../_shared/palette';
import { ease } from '../../engine/anim';
import { render3D } from '../../engine/three-kit';
import { caretBlink } from './caret';
import { drawTitleCard } from './title';
import { DEG } from './world';
import { seg } from './state';

/** When READ takes the caret over (B1 contract): our blink is OFF from bar 9 beat 4 (14.0). */
export const CARET_HANDOVER = 14.0;
const IMPACT = 12.8;
const STOP = 12.4;
/** the huge caret squashes into the paper's edge */
const SQUASH = 0.09;
/** the flip starts 1 frame ahead so the sheet is mid-swing on the impact frame */
const FLIP0 = IMPACT - 1 / 60;
/** the sheet is flat, still and exactly frame-sized from here on (then the flat card is returned) */
const SETTLE = FLIP0 + 0.41;

// ── the sheet: a real paper object (thickness, lit edges, light sweep, bend, cast shadow) ──────
const ASPECT = 16 / 9;
/** paper thickness (frame height = 1): ~3 px when seen edge-on */
const THICK = 0.0018;
const CAM_Z = 0.5 / Math.tan(15 * DEG); // a 30° camera frames the face-on sheet exactly
const LIGHT = new THREE.Vector3(-0.2, 0.45, 0.87).normalize(); // key light: front, above-left

const VERT = /* glsl */ `
uniform float bend;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
void main(){
  vec3 p = position;
  // drag S-bend: the halves lag behind the spin (0 when the sheet is still)
  float y = p.y;
  p.z += bend * 4.0 * y * abs(y);
  vec3 n = normal;
  if (abs(n.z) > 0.5) n = normalize(vec3(0.0, -bend * 8.0 * abs(y) * sign(n.z), n.z));
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

/** front: the card, lit so that face-on & still it is exactly the flat card (k = 1, no sheen) */
const FRONT = /* glsl */ `
uniform sampler2D map;
uniform vec3 light;
uniform float ref;
uniform float sheen;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
void main(){
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float lam = max(dot(n, light), 0.0);
  // matte paper: a soft light sweep (dim at grazing angles, exactly 1 face-on) + faint broad sheen
  float k = (0.5 + 0.5 * lam) / (0.5 + 0.5 * ref);
  float sp = pow(max(dot(n, normalize(light + V)), 0.0), 10.0) * sheen;
  gl_FragColor = vec4(texture2D(map, vUv).rgb * k + vec3(sp), 1.0);
}`;

/** edges: bright paper edge; `reveal` (screen px from centre) = how much of it the light reaches */
const EDGE = /* glsl */ `
uniform vec3 light;
uniform vec3 paper;
uniform float reveal;
uniform float glow;
uniform float dim;
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
void main(){
  vec3 n = normalize(vN);
  float lam = max(dot(n, light), 0.0);
  float m = smoothstep(reveal + 4.0, reveal - 4.0, abs(gl_FragCoord.x - 960.0));
  gl_FragColor = vec4(paper * (0.2 + 0.75 * lam + glow) * mix(dim, 1.0, m), 1.0);
}`;

const BACK = /* glsl */ `
uniform vec3 light;
uniform vec3 paper;
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
void main(){
  float lam = max(dot(normalize(vN), light), 0.0);
  gl_FragColor = vec4(paper * (0.35 + 0.55 * lam), 1.0);
}`;

const sheetScene = new THREE.Scene();
const sheetCam = new THREE.PerspectiveCamera(30, ASPECT, 0.05, 50);
sheetCam.position.set(0, 0, CAM_Z);
sheetCam.lookAt(0, 0, 0);
let sheet: THREE.Mesh | null = null;
let frontMat: THREE.ShaderMaterial;
let edgeMat: THREE.ShaderMaterial;

function ensureSheet(map: THREE.Texture) {
  if (!sheet) {
    const g = new THREE.BoxGeometry(ASPECT, 1, THICK, 1, 48, 1);
    g.translate(0, 0, -THICK / 2); // front face on z = 0 → texel-exact when face-on
    const common = { light: { value: LIGHT }, bend: { value: 0 } };
    frontMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRONT,
      uniforms: { ...common, map: { value: map }, ref: { value: LIGHT.z }, sheen: { value: 0 } },
    });
    edgeMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: EDGE,
      uniforms: { ...common, paper: { value: new THREE.Color(C.WHITE) }, reveal: { value: 2000 }, glow: { value: 0 }, dim: { value: 0.02 } },
    });
    const backMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: BACK,
      uniforms: { ...common, paper: { value: new THREE.Color(C.PAPER2) } },
    });
    // BoxGeometry groups: +x, −x, +y, −y, +z (front), −z (back)
    sheet = new THREE.Mesh(g, [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat]);
    sheetScene.add(sheet);
  }
  frontMat.uniforms.map.value = map;
}

/** sheet angle (rad): 90° = edge-on (the stop line), 0 = facing the camera */
const A0 = 91.2; // anticipation: the sheet tips back 1.2°, showing a sliver of its unlit underside
function sheetAngle(t: number) {
  if (t < FLIP0) return (90 + (A0 - 90) * ease.inCubic(seg(t, FLIP0 - 0.12, FLIP0))) * DEG;
  const tau = t - FLIP0;
  // flung up on the impact, a 4° overshoot, settled flat at SETTLE
  const k = ease.outExpo(seg(tau, 0, 0.3)) + 0.045 * Math.sin(Math.PI * seg(tau, 0.05, SETTLE - FLIP0)) ** 2;
  return A0 * DEG * (1 - k);
}

/** px from centre the edge light reaches (the old stop line's width), grows with the reverse swell */
function revealPx(t: number) {
  return 960 * (0.4 + 0.6 * ease.inCubic(seg(t, STOP, IMPACT)));
}

function renderSheet(f: Frame, cardTex3d: THREE.Texture): THREE.Texture {
  const { e, t } = f;
  const gfx = e.gfx;
  ensureSheet(cardTex3d);
  const a = sheetAngle(t);
  const w = (sheetAngle(t + 1 / 120) - sheetAngle(t - 1 / 120)) * 60; // rad/s
  const s = 1 / (1 - 0.27 * Math.abs(Math.sin(a))); // never uncovers the corners; 1 face-on
  sheet!.rotation.set(-a, 0, 0);
  sheet!.scale.set(s, s, 1);
  sheet!.updateMatrixWorld(true);
  const bend = Math.max(-0.05, Math.min(0.05, 0.0012 * w));
  for (const m of [frontMat, edgeMat]) m.uniforms.bend.value = bend;
  // the paper flares as it catches the light on the impact (instead of a full-frame flash)
  frontMat.uniforms.sheen.value = 0.06 * Math.abs(Math.sin(a)) + 0.0012 * Math.abs(w) + 0.45 * (1 - seg(t, IMPACT - 1 / 60, IMPACT + 0.06));
  edgeMat.uniforms.reveal.value = t < FLIP0 ? revealPx(t) : 2000;
  edgeMat.uniforms.glow.value = t < FLIP0 ? 0.3 * ease.inCubic(seg(t, STOP, IMPACT)) : 0;
  // the unlit rest of the edge emerges from the dark (linear values: 0.0037 ≈ INK, so no pop after the
  // squash; 0.02 ≈ sRGB 40 = faintly visible)
  edgeMat.uniforms.dim.value = 0.0037 + 0.0163 * seg(t, STOP + SQUASH, STOP + SQUASH + 0.25);
  const tex = render3D(gfx, sheetScene, sheetCam, { key: 'intro:sheet3d', ss: 1, clear: null, samples: 4 });

  // backdrop: from the impact a soft light pool behind the sheet, and the sheet's cast shadow
  const bg = e.layer('intro:sheetbg');
  const c = bg.begin(C.INK);
  if (t < FLIP0) {
    // the lit edge glows (light scattering off the paper's edge) so the stop line still reads on
    // a phone; it brightens with the reverse swell
    const half = revealPx(t);
    const sw = ease.inCubic(seg(t, STOP, IMPACT));
    const g = c.createLinearGradient(0, 540 - 34, 0, 540 + 34);
    const a = 0.16 + 0.2 * sw;
    g.addColorStop(0, 'rgba(250,250,247,0)');
    g.addColorStop(0.5, `rgba(250,250,247,${a.toFixed(3)})`);
    g.addColorStop(1, 'rgba(250,250,247,0)');
    const h = c.createLinearGradient(960 - half, 0, 960 + half, 0);
    h.addColorStop(0, 'rgba(0,0,0,0)');
    h.addColorStop(0.15, 'rgba(0,0,0,1)');
    h.addColorStop(0.85, 'rgba(0,0,0,1)');
    h.addColorStop(1, 'rgba(0,0,0,0)');
    c.save();
    c.fillStyle = g;
    c.fillRect(960 - half, 540 - 34, 2 * half, 68);
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = h;
    c.fillRect(960 - half, 540 - 34, 2 * half, 68);
    c.restore();
    // destination-in cleared the INK outside the glow: repaint the background under it
    c.save();
    c.globalCompositeOperation = 'destination-over';
    c.fillStyle = C.INK;
    c.fillRect(0, 0, 1920, 1080);
    c.restore();
  }
  const lit = seg(t, FLIP0, IMPACT + 0.03);
  if (lit > 0) {
    const g = c.createRadialGradient(960, 600, 0, 960, 600, 1100);
    g.addColorStop(0, `rgba(240,236,228,${(0.11 * lit).toFixed(3)})`);
    g.addColorStop(1, 'rgba(240,236,228,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 1920, 1080);
    const pts = [
      [-ASPECT / 2, -0.5],
      [ASPECT / 2, -0.5],
      [ASPECT / 2, 0.5],
      [-ASPECT / 2, 0.5],
    ].map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(sheet!.matrixWorld).project(sheetCam));
    c.save();
    c.filter = 'blur(26px)';
    c.translate(960, 540 + 38);
    c.scale(1.05, 1.05);
    c.beginPath();
    pts.forEach((p, i) => {
      const x = p.x * 960;
      const y = -p.y * 540;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.closePath();
    c.fillStyle = `rgba(0,0,0,${(0.6 * lit).toFixed(3)})`;
    c.fill();
    c.restore();
  }
  let out = gfx.compose(gfx.rt('intro:sheetcomp'), C.INK, [{ tex: bg.end() }, { tex }]);
  const blur = Math.min(0.05, Math.abs(w) * 0.0016);
  if (blur > 0.002) out = gfx.motionBlur(out, { amount: blur, dir: [0, 1] }, 'intro:sheetblur');
  return out;
}

/** Title card build-in schedule (12.8 → final at 13.6). */
function build(t: number) {
  return {
    word: 1,
    frame: ease.outExpo(seg(t, 13.0, 13.45)),
    lockup: ease.outCubic(seg(t, 13.2, 13.45)),
    credits: seg(t, 13.4, 13.6),
    misreg: 7 * (1 - ease.outExpo(seg(t, IMPACT, IMPACT + 0.16))),
  };
}

/** 12.4 the caret becomes the paper's edge, 12.8 the sheet flips open, the title card (to 15.6). */
export function renderFinale(f: Frame): THREE.Texture {
  const { e, t } = f;
  f.post.ca = 0.0008;
  if (t < STOP + SQUASH) {
    // the huge caret squashes into the edge of a sheet of paper (3 px), 40 % of it lit
    const L = e.layer('intro:stop');
    const c = L.begin(C.INK);
    const sq = ease.outExpo(seg(t, STOP, STOP + SQUASH));
    const w = 180 + (2 * revealPx(t) - 180) * sq;
    const h = 360 + (3 - 360) * sq;
    c.fillStyle = sq < 0.5 ? C.ORANGE : C.WHITE;
    c.fillRect(960 - w / 2, 540 + 1.5 - h / 2, w, Math.max(3, h));
    if (sq > 0.5) {
      const g = c.createLinearGradient(0, 540 - 34, 0, 540 + 34);
      g.addColorStop(0, 'rgba(250,250,247,0)');
      g.addColorStop(0.5, `rgba(250,250,247,${(0.16 * (sq - 0.5) * 2).toFixed(3)})`);
      g.addColorStop(1, 'rgba(250,250,247,0)');
      c.fillStyle = g;
      c.fillRect(960 - w / 2, 540 - 34, w, 68);
    }
    f.overlay.tone = 'dark';
    return L.end();
  }

  // the card (flat); the caret blinks until READ takes it over
  const card = e.layer('intro:card');
  const c = card.begin(C.PAPER);
  drawTitleCard(c, { build: build(t), caret: t < CARET_HANDOVER ? caretBlink(t) : 0 });
  const cardTex = card.end();
  if (t >= SETTLE) {
    f.overlay.tone = 'light';
    f.post.vignette = 0.1;
    f.post.ca = 0.0006;
    return cardTex;
  }
  if (t >= FLIP0) {
    f.overlay.tone = t >= IMPACT ? 'light' : 'dark';
    f.post.vignette = 0.1 + 0.12 * (1 - seg(t, IMPACT, SETTLE));
    f.post.ca = 0.0006;
    const sh = 5 * (1 - seg(t, IMPACT, IMPACT + 0.22));
    f.post.shake = [Math.sin(t * 90) * sh, Math.cos(t * 77) * sh];
  } else f.overlay.tone = 'dark';
  return renderSheet(f, card.texture3d);
}
