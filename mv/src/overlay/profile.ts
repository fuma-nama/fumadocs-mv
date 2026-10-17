/** Overlay settings tied to the film's bar map: line takes and styles, credit schedule, hard caps, default tones. */
import { at } from '../engine/time';
import { CREDITS, LINES, type CreditDef, type LineDef } from './data';

export interface OverlayProfile {
  id: string;
  lines: LineDef[];
  credits: CreditDef[];
  /** hard end of a take's visible window ('L8:0' → s), from scene contracts (stops, B4 black) */
  caps: Record<string, number>;
  /** default background tone until a scene sets f.overlay.tone */
  tones: [from: number, tone: 'dark' | 'light'][];
  /** time ranges where the lyric/credit accent defaults to monochrome (a scene owns the only dot) */
  monoAccent: [number, number][];
}

export const MAIN_PROFILE: OverlayProfile = {
  id: 'main',
  lines: LINES,
  credits: CREDITS,
  caps: { 'L8:0': at(32, 3), 'L11:1': at(48, 4) },
  tones: [
    [0, 'dark'],
    [12.8, 'light'], // title card (paper) → read
    [29.0, 'dark'], // toc: the lights go out
    [63.8, 'light'], // cli desktop
    [73.6, 'dark'], // cli montage → integrations → showcase → outro
  ],
  monoAccent: [[25.6, 38.4]],
};

export const profile = () => MAIN_PROFILE;
