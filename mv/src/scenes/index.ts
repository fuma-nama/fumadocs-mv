import type { Boundary, SceneEntry } from '../engine/engine';
import { at, DURATION, snap } from '../engine/time';

/**
 * Master timeline (director-owned). Scene agents own src/scenes/<id>/ only.
 * Boundary windows: both neighbours render during [from, to); the owner composes the final
 * image and receives the other scene's frame as `f.other`. See docs/handoffs.md.
 */
export const registry: SceneEntry[] = [
  { id: 'intro', start: 0, end: at(10), load: () => import('./intro') },
  { id: 'read', start: at(10), end: at(17), load: () => import('./read') },
  { id: 'toc', start: at(17), end: at(25), load: () => import('./toc') },
  { id: 'layout', start: at(25), end: at(33), load: () => import('./layout') },
  { id: 'theme', start: at(33), end: at(41), load: () => import('./theme') },
  { id: 'cli', start: at(41), end: at(49), load: () => import('./cli') },
  { id: 'integrations', start: at(49), end: at(57), load: () => import('./integrations') },
  { id: 'showcase', start: at(57), end: at(65), load: () => import('./showcase') },
  { id: 'outro', start: at(65), end: DURATION, load: () => import('./outro') },
];

const win = (bar: number, before: number, after: number, owner: Boundary['owner']): Boundary => ({
  at: at(bar),
  from: snap(at(bar) - before),
  to: snap(at(bar) + after),
  owner,
});

/** boundaries[i] sits between registry[i] and registry[i + 1]. */
export const boundaries: Boundary[] = [
  win(10, 0.8, 1.2, 'in'), // intro → read: the title page opens (page turn)
  win(17, 0.8, 0.8, 'out'), // read → toc: dive into the TOC indicator
  win(25, 0.8, 0.8, 'in'), // toc → layout: progress ring → wireframe
  win(33, 0, 0, null), // layout → theme: hard cut on the drop (contract: black + centre dot)
  win(41, 0.8, 0.8, 'in'), // theme → cli: the page shrinks into an OS window
  win(49, 0.4, 0.8, 'in'), // cli → integrations: caret becomes the request packet
  win(57, 0.8, 0.8, 'in'), // integrations → showcase: core → moon over the city
  win(65, 0.8, 0.8, 'in'), // showcase → outro: mosaic collapses into the logo
];
