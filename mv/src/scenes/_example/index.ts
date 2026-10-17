import * as THREE from 'three';
import type { SceneImpl } from '../../engine/engine';
import { at } from '../../engine/time';
import { ease, seg, TAU } from '../../engine/anim';
import { text, textV, boxLabel, ring, ticksRing, sparkle, crosshair, stripes, textArc, brackets } from '../../engine/draw2d';
import { render3D, toonMat } from '../../engine/three-kit';

// Engine smoke test: 2D vocabulary + 3D toon/edges + bloom + glitch + pixelate.
const scene3 = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 100);
let knot: THREE.Mesh;
let sphere: THREE.Mesh;

// Not registered — reference for the scene API (2D layers, 3D with line art, compose, post).
const scene: SceneImpl = {
  setup() {
    scene3.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 2.2);
    dl.position.set(3, 4, 5);
    scene3.add(dl);
    knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.28, 220, 32), toonMat('#ecebe6'));
    scene3.add(knot);
    sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 5), toonMat('#FA8023'));
    sphere.position.set(1.9, 0.4, -0.5);
    scene3.add(sphere);
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1 + (i % 3) * 0.7, 0.35), toonMat('#2a2a30'));
      b.position.set(-3 + i * 0.75, -1.3, -2 - (i % 2));
      scene3.add(b);
    }
    cam.position.set(0, 0.6, 6);
    cam.lookAt(0, 0, 0);
  },
  render(f) {
    const { e, t, W, H } = f;
    knot.rotation.set(t * 0.4, t * 0.7, 0);
    sphere.position.y = 0.4 + Math.sin(t * 2) * 0.2;
    const tex3d = render3D(e.gfx, scene3, cam, { key: 'test:3d', ss: 2, edges: { color: '#0b0b0e', width: 2.2 } });
    const bg = e.layer('test:bg');
    const c = bg.begin('#ecebe6');
    stripes(c, 0, 0, W, H, { angle: -30, period: 140, duty: 0.08, color: '#0b0b0e10', phase: t * 60 });
    const cx = W * 0.5, cy = H * 0.5;
    ring(c, cx, cy, 420, 1, '#0b0b0e55');
    ticksRing(c, cx, cy, 400, 120, 8, 1, '#0b0b0e88', t * 0.2, 10, 22);
    textArc(c, 'INTRODUCTION · QUICK START · INSTALLATION · LAYOUTS · THEMES · ', cx, cy, 455, t * 0.15, { font: 'wide', size: 15, tracking: 0.2, color: '#0b0b0e' });
    const fg = e.layer('test:fg');
    const d = fg.begin();
    const k = seg(t, 0.5, 1.5, ease.outExpo);
    boxLabel(d, 'README', 120, 110, { size: 18, ticks: true, color: '#0b0b0e' });
    text(d, 'FUMADOCS', 120, 260, { font: 'display', size: 150 * (0.9 + 0.1 * k), weight: 800, stretch: 'condensed', tracking: -0.02, color: '#0b0b0e' });
    text(d, 'ドキュメントを、きみの色に。', 124, 330, { font: 'jpKaku', size: 40, weight: 900, color: '#FA8023' });
    textV(d, '目次が照らす道しるべ', W - 120, 120, { font: 'jpSerif', size: 38, weight: 700, color: '#0b0b0e', tracking: 0.15 });
    for (let i = 0; i < 6; i++) sparkle(d, 200 + i * 260, 900 + Math.sin(t * 3 + i) * 20, 14 + 6 * Math.sin(t * 5 + i), '#0b0b0e');
    crosshair(d, cx, cy, 30, 1.5, '#FA8023', 6);
    brackets(d, 80, 60, W - 160, H - 120, 28, 2, '#0b0b0e');
    const comp = e.gfx.compose(e.gfx.rt('test:comp'), null, [
      { tex: bg.end() },
      { tex: tex3d },
      { tex: fg.end() },
    ]);
    let out = e.gfx.bloom(comp, { threshold: 0.8, strength: 0.6 }, 'test:bloom');
    if (t > 6 && t < 7) out = e.gfx.glitch(out, { amount: 0.6, seed: Math.floor(t * 12) }, 'test:glitch');
    if (t > 8 && t < 10) out = e.gfx.pixelate(out, { pixel: 4, palette: ['#0b0b0e', '#ecebe6', '#FA8023', '#7a7a80'] }, 'test:px');
    f.post.shake = [Math.sin(t * 40) * e.audio.pulse('kick', t, 0.08) * 6, 0];
    void TAU;
    void at;
    return out;
  },
};

export default scene;
