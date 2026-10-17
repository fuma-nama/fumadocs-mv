import * as THREE from 'three';
import type { SceneImpl } from '../../engine/engine';
import { cues as getCues } from './cues';
import { timeline } from './dial';
import { renderBoot } from './boot';
import { renderVoid } from './voidphase';
import { renderFinale } from './finale';
import { renderMontage, renderStrobe } from './montage';
import { IntroWorld } from './three-world';
import { drawFace, FACE_W, FACE_H } from './faces';
import { S } from './state';
import { loadPlates } from './plates';

const scene: SceneImpl = {
  async setup(e) {
    S.cues = getCues(e);
    S.T = timeline(S.cues);
    await loadPlates(e);
    for (let k = 0; k < 8; k++) {
      const cv = document.createElement('canvas');
      cv.width = FACE_W;
      cv.height = FACE_H;
      drawFace(cv.getContext('2d')!, k);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      S.faceCanvases.push(cv);
      S.faces.push(tex);
    }
    S.world = new IntroWorld(S.faces);
  },
  render(f) {
    const t = f.t;
    if (t < 6.4) return renderBoot(f);
    if (t < 9.6) return renderVoid(f);
    if (t < 11.2) return renderMontage(f);
    if (t < 12.4) return renderStrobe(f);
    return renderFinale(f);
  },
};

export default scene;
