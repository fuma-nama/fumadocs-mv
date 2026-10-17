import * as THREE from 'three';
import type { Gfx } from '../../engine/gfx';
import { PageCard, pxCamera } from './page3d';

/** Shared 3D stage for the theme scene. */
export const stage = {
  scene: new THREE.Scene(),
  // a longer lens keeps the flipping card's near edge out of the lyric band
  cam: pxCamera(22),
  card: null as unknown as PageCard,
};

export function setupStage() {
  stage.card = new PageCard();
  stage.scene.add(stage.card.group);
}

/** Solid-colour silhouette of a premultiplied texture's alpha (for flat offset shadows). */
export function silhouette(g: Gfx, src: THREE.Texture, color: string, key: string, alpha = 1): THREE.Texture {
  const out = g.rt(key);
  const m = g.material('theme:sil', `
    uniform sampler2D tex; uniform vec3 col; uniform float k;
    void main(){ float a = texture(tex, vUv).a * k; outColor = vec4(col * a, a); }`, { tex: { value: null }, col: { value: new THREE.Color() }, k: { value: 1 } });
  m.uniforms.tex.value = src;
  m.uniforms.col.value.setStyle(color, THREE.NoColorSpace as THREE.ColorSpace);
  m.uniforms.k.value = alpha;
  g.run(m, out);
  return out.texture;
}
