import { at } from '../../engine/time';
import type { AudioData } from '../../engine/audio';

/** Snap to the 60 fps frame grid so `t >= T.x` holds on the exact frame (t = frame / 60). */
const F = (x: number) => Math.round(x * 60) / 60;

/** Outro cue sheet (music agent, committed; every onset on the 16th grid). */
export const T = {
  /** B8 window opens (bar 64 beat 3) */
  win: F(at(64, 3)),
  /** music stops; reverse swell into the downbeat (bar 64 beat 4) */
  pause: F(at(64, 4)),
  /** Abmaj9 + crash + soft impact (bar 65) */
  down: F(at(65)),
  /** B8 window closes */
  winEnd: F(at(65, 3)),
  /** Abm6, the minor iv (bar 66): the collapse */
  collapse: F(at(66)),
  /** Ebmaj9 resolve + bell motif + clock (bar 67) */
  resolve: F(at(67)),
  /** music-box motif 8va (bar 68) */
  box: F(at(68)),
  /** held B♭6: the card dims, the caret goes home (bar 68 beat 3) */
  home: F(at(68, 3)),
  /** final chime + click (bar 69) */
  chime: F(at(69)),
  /** caret OFF for good (bar 69 beat 2) */
  off: F(at(69, 2)),
  end: F(at(69) + 2),
} as const;

/** Fallback README motif onsets (two statements of five notes). */
const MOTIF = [105.6, 105.8, 106.0, 106.1, 106.4, 107.2, 107.4, 107.6, 107.7, 108.0];

/** README motif onsets inside the outro (real timing when the soundtrack exists). */
export function motifNotes(audio: AudioData): number[] {
  if (audio.real) {
    const ev = audio.timing.events.motif.map((m) => m.t).filter((t) => t > T.resolve - 0.05 && t < T.chime - 0.05);
    if (ev.length >= 10) return ev.slice(0, 10);
  }
  return MOTIF;
}

/** The final chime (real timing when available: a foley/impact event near bar 69, else the grid). */
export function chimeAt(audio: AudioData): number {
  if (audio.real) {
    const near = (x: number) => Math.abs(x - T.chime) < 0.25;
    const f = audio.timing.events.foley.find((e) => near(e.t) && /chime|end|click|bell/i.test(e.type));
    if (f) return F(f.t);
    const imp = audio.cue('impact').find(near);
    if (imp !== undefined) return F(imp);
  }
  return T.chime;
}
