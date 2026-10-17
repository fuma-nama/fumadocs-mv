import * as THREE from 'three';
import { Projector } from './proj';
import type { Timeline } from './dial';
import type { Cues } from './cues';
import type { IntroWorld } from './three-world';

/** Shared per-scene objects (built once in setup; every frame stays a pure function of t). */
export const S = {
  cam: new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 400),
  P: new Projector(1920, 1080),
  T: null as unknown as Timeline,
  cues: null as unknown as Cues,
  world: null as unknown as IntroWorld,
  faces: [] as THREE.CanvasTexture[],
  faceCanvases: [] as HTMLCanvasElement[],
};

export const seg = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
