import type { Frame } from '../../engine/engine';
import { P } from './pal';

/** B6 contract: from 76.4 to 77.6, INK + the held orange caret 48×96 at (936, 492). No glow, no blink. */
export const STOP_CARET = { x: 936, y: 492, w: 48, h: 96 } as const;

export function drawStop(f: Frame) {
  const L = f.e.layer('cli:stop');
  const c = L.begin(P.INK);
  c.fillStyle = P.ORANGE;
  c.fillRect(STOP_CARET.x, STOP_CARET.y, STOP_CARET.w, STOP_CARET.h);
  return L.end();
}
