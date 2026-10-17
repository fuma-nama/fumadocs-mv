import { at } from '../../engine/time';

/** READ beat map (global seconds). See docs/scenes/read.md. */
export const T = {
  lift: at(9, 4), // 14.0 corner anticipation
  open: at(10), // 14.4 page turn + caret handover
  b1To: at(10, 4), // 15.6 end of the intro window
  anatomy: at(11), // 16.0
  forest: at(13), // 19.2
  search: at(15), // 22.4
  enter: at(16), // 24.0
  dive: at(16, 3), // 24.8 (B2 window start)
} as const;
