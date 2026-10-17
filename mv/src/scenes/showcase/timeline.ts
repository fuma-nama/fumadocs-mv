import { at as atRaw } from '../../engine/time';

/** at() rounded to the millisecond so frame times (frame / 60) compare exactly. */
const at = (bar: number, beat = 1) => Math.round(atRaw(bar, beat) * 1000) / 1000;

/** Showcase timeline anchors (s). Bar 57 = 89.6 … bar 65 = 102.4. */
export const T = {
  b7From: 88.8,
  start: at(57), // 89.6 — downbeat flash, the core is the moon
  b7To: 90.4,
  avenue: at(58), // 91.2 — fly-through
  parade: at(59), // 92.8 — first card lands
  dot: at(60, 4), // 95.6 — the orange dot leaves the moon toward the last card
  publish: at(60, 4.5), // 95.8 — Zen Browser contracts into the PUBLISH button
  click: at(60, 4.75), // 95.9 — the dot clicks (a 16th before the crash)
  launch: at(61), // 96.0 — crash: every screen lifts off
  wall: at(62), // 97.6 — mosaic wall close-up
  zoomOut: at(63), // 99.2 — the wall becomes the disc
  settle: at(64), // 100.8
  still: 101.4, // camera at rest from here (3D tiles crossfade into the exact 2D disc until the lock)
  lock: 101.6, // B8: disc pixel-static from here
  lightsOut: at(64, 4), // 102.0 — the music's pause
  end: 103.2,
} as const;

export const BEAT = 0.4;
