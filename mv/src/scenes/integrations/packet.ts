import { clamp, ease, lerp } from '../../engine/anim';
import { A_LAUNCH, ringAngleAtLocalX, STATIONS, T } from './k';
import type { StationImpl } from './station';

export type PacketState =
  | { kind: 'launch'; p: number } // caret → packet morph at the screen centre (76.8 → LAUNCH_T)
  | { kind: 'ring'; a: number; va: number }
  | { kind: 'st'; k: number; x: number; y: number; vx: number; vy: number }
  | { kind: 'none' };

/** The caret squashes, then fires. */
export const LAUNCH_T = T.drop + 2 / 60;

/** outQuart with a hard start (a fired shot). */
const fired = (x: number) => 1 - (1 - x) ** 4;

export function entryAngle(sts: StationImpl[], k: number) {
  return ringAngleAtLocalX(STATIONS[k].a, sts[k].xe);
}
export function exitAngle(sts: StationImpl[], k: number) {
  return ringAngleAtLocalX(STATIONS[k].a, sts[k].xx);
}

/** Angle of the packet on the ring for the ride legs, or null when it is not on the ring. */
function ringAngle(t: number, sts: StationImpl[]): number | null {
  if (t >= LAUNCH_T && t < sts[0].tIn) {
    const p = fired(clamp((t - LAUNCH_T) / (sts[0].tIn - LAUNCH_T)));
    return lerp(A_LAUNCH, entryAngle(sts, 0), p);
  }
  for (let k = 0; k < sts.length - 1; k++) {
    const a = sts[k], b = sts[k + 1];
    if (t >= a.tOut && t < b.tIn) {
      const p = ease.inOutCubic(clamp((t - a.tOut) / (b.tIn - a.tOut)));
      return lerp(exitAngle(sts, k), entryAngle(sts, k + 1), p);
    }
  }
  return null;
}

export function packetAt(t: number, sts: StationImpl[]): PacketState {
  if (t < T.drop) return { kind: 'none' };
  if (t < LAUNCH_T) return { kind: 'launch', p: (t - T.drop) / (LAUNCH_T - T.drop) };
  const a = ringAngle(t, sts);
  if (a !== null) {
    const a2 = ringAngle(t - 1 / 240, sts) ?? a;
    return { kind: 'ring', a, va: (a - a2) * 240 };
  }
  for (let k = 0; k < sts.length; k++) {
    const s = sts[k];
    if (t >= s.tIn && t < s.tOut) {
      const p = s.route.pos(t);
      return { kind: 'st', k, x: p.x, y: p.y, vx: p.vx, vy: p.vy };
    }
  }
  return { kind: 'none' };
}

/**
 * Travelled path on the ring as [a0, a1, colour] segments (a0 < a1): the launch ride and each
 * station's span fill as the packet progresses; each block colours its own stretch.
 */
export function railSegments(t: number, sts: StationImpl[]): [number, number, string][] {
  const out: [number, number, string][] = [];
  if (t < LAUNCH_T) return out;
  let from = A_LAUNCH; // angles decrease clockwise
  for (let k = 0; k < sts.length; k++) {
    const s = sts[k];
    const col = STATIONS[k].key;
    const ea = entryAngle(sts, k), xa = exitAngle(sts, k);
    // ride into station k
    const tRide0 = k === 0 ? LAUNCH_T : sts[k - 1].tOut;
    if (t < tRide0) break;
    const ra = t < s.tIn ? ringAngle(t, sts)! : ea;
    out.push([Math.min(from, ra), Math.max(from, ra), col]);
    if (t < s.tIn) break;
    // station span fills like a progress bar while the packet works inside
    const f = ease.inOutQuad(clamp((t - s.tIn) / (s.tOut - s.tIn)));
    const pa = lerp(ea, xa, f);
    out.push([Math.min(ea, pa), Math.max(ea, pa), col]);
    if (t < s.tOut) break;
    from = xa;
  }
  return out;
}
