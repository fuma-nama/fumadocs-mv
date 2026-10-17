import { at } from '../../engine/time';
import type { Mode, ThemeId } from '../_shared/theme-tokens';

/** How a state arrives. */
export type Via = 'burst' | 'stripe' | 'iris' | 'flip' | 'cut';

export interface Ev {
  /** the musical hit (s): stripes/irises start here, flips pass edge-on here */
  t: number;
  id: ThemeId;
  mode: Mode;
  via: Via;
  /** transition length (s) */
  dur: number;
  /** stripe sweep direction (+1 left→right, −1 right→left) */
  dir?: number;
  /** iris origin in frame px */
  origin?: [number, number];
}

/** Picker chip centres (S3); chips are laid out by poster.ts with the same function. */
export const CHIP_ORDER: ThemeId[] = ['neutral', 'black', 'vitepress', 'dusk', 'catppuccin', 'ocean', 'purple', 'solar', 'emerald', 'ruby', 'aspen', 'shadcn'];
/** Vertical picker column (bar 34): 12 logo moons + the light/dark toggle below. */
export const PICKER = { x: 132, y0: 292, step: 42, r: 14 };
export const chipPos = (id: ThemeId): [number, number] => [PICKER.x, PICKER.y0 + CHIP_ORDER.indexOf(id) * PICKER.step];
export const TOGGLE_Y = PICKER.y0 + 11 * PICKER.step + 62;
/** the sun (light) or moon (dark) half of the toggle pill */
export const togglePos = (mode: Mode): [number, number] => [PICKER.x + (mode === 'light' ? -18 : 18), TOGGLE_Y];

const B = (bar: number, beat = 1) => at(bar, beat);
/** stripe repaints start 2 frames early so half the frame is repainted on the cue */
export const WIPE_LEAD = 2 / 60;

/** S1–S3 (posters): one state per beat. */
export const POSTER_EVENTS: Ev[] = [
  { t: B(33), id: 'purple', mode: 'light', via: 'burst', dur: 0.4 },
  { t: B(33, 3) - WIPE_LEAD, id: 'emerald', mode: 'light', via: 'stripe', dur: 0.15, dir: 1 },
  { t: B(33, 4), id: 'emerald', mode: 'dark', via: 'flip', dur: 0.2 },
  { t: B(34), id: 'ruby', mode: 'dark', via: 'iris', dur: 0.3, origin: chipPos('ruby') },
  { t: B(34, 2), id: 'ruby', mode: 'light', via: 'flip', dur: 0.2 },
  { t: B(34, 3), id: 'vitepress', mode: 'light', via: 'iris', dur: 0.3, origin: chipPos('vitepress') },
  { t: B(34, 4), id: 'vitepress', mode: 'dark', via: 'flip', dur: 0.2 },
];

/** Index of the event active at t (last with ev.t <= t, flips switch at their edge-on time). */
export function eventIndex(evs: Ev[], t: number): number {
  let k = -1;
  for (let i = 0; i < evs.length; i++) if (evs[i].t <= t + 1e-9) k = i;
  return k;
}
