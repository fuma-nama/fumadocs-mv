import type * as THREE from 'three';

/** One object, one instance of an instanced mesh, or a group of objects listed together. */
export interface Selection {
  objects: THREE.Object3D[];
  instance?: number;
}

/** What the panels share; main.ts provides the actions. */
export const app = {
  /** the film and the music have loaded */
  ready: false,
  /** the frame on screen */
  frame: 0,
  playing: false,
  selection: null as Selection | null,
  /** the film time playback is at, or will show once the frame renders */
  time: () => 0,
  seek: (_t: number) => {},
  toggle: () => {},
  redraw: () => {},
  /** `reveal` scrolls the Explorer to it, for picks in the viewport */
  select: (_s: Selection | null, _reveal?: boolean) => {},
};
