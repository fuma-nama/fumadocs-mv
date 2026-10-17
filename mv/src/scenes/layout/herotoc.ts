import { LAYOUT_HERO, pointOn } from '../toc/toc-geometry';

/**
 * The hero-page TOC (shared with READ/TOC) as it sits in the first wireframe's "On this page"
 * column: TOCItems container origin from the Docs capture, Layouts › Docs active.
 */
export const HERO_TOC_ORIGIN: [number, number] = [1173, 80];
export const HERO_ACTIVE: [number, number] = [4, 5];

/** Thumb position (end of the active path) in viewport px. */
export function heroThumb(): [number, number] {
  const d = LAYOUT_HERO.lens[HERO_ACTIVE[1]][1];
  const [x, y] = pointOn(LAYOUT_HERO.pts, d);
  return [HERO_TOC_ORIGIN[0] + x, HERO_TOC_ORIGIN[1] + y];
}
