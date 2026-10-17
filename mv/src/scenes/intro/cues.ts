import type { Engine } from '../../engine/engine';

/**
 * Intro sync points. Read from the soundtrack's timing.json when it exists, else the music
 * agent's committed plan (identical grid). Computed once.
 */
export interface Cues {
  /** clock ticks (8ths in bars 1–4, 16ths in bars 5–8) */
  ticks: number[];
  /** README motif notes in bars 1–4 (2 statements × 5) */
  motif: { t: number; dur: number }[];
  blips: number[];
  /** kicks from bar 5 to the stop */
  kicks: number[];
  /** bar 8 snare build */
  snares: number[];
}

let cached: Cues | null = null;

const PLAN_MOTIF = [1.6, 1.8, 2.0, 2.1, 2.4, 4.8, 5.0, 5.2, 5.3, 5.6];
const PLAN_BLIPS = [0.6, 1.1, 2.9, 3.5, 3.9, 4.2, 4.6, 5.8, 6.1, 6.9, 8.9, 9.4, 9.9];

export function cues(e: Engine): Cues {
  if (cached) return cached;
  const ev = e.audio.timing.events;
  const real = e.audio.real;
  const foley = real ? (ev.foley ?? []) : [];
  let ticks = foley.filter((x) => x.type === 'tick' && x.t < 12.4).map((x) => x.t);
  if (ticks.length < 16) {
    ticks = [];
    for (let i = 0; i < 32; i++) ticks.push(+(i * 0.2).toFixed(3));
    for (let i = 0; i < 60; i++) ticks.push(+(6.4 + i * 0.1).toFixed(3));
  }
  let motif = (real ? (ev.motif ?? []) : []).filter((m) => m.t < 6.4).map((m) => ({ t: m.t, dur: m.dur }));
  if (motif.length < 10) motif = PLAN_MOTIF.map((t, i) => ({ t, dur: i === 4 || i === 9 ? 0.8 : i === 2 || i === 7 ? 0.1 : 0.2 }));
  let blips = foley.filter((x) => x.type === 'blip' && x.t < 12.8).map((x) => x.t);
  if (!blips.length) blips = PLAN_BLIPS;
  let kicks = real ? ev.kick.filter((t) => t >= 6.3 && t < 12.4) : [];
  if (kicks.length < 8) {
    kicks = [];
    for (let i = 0; i < 12; i++) kicks.push(+(6.4 + i * 0.4).toFixed(3));
    kicks.push(11.2, 11.6, 12.0);
  }
  let snares = real ? ev.snare.filter((t) => t >= 11.1 && t < 12.4) : [];
  if (snares.length < 4) snares = [11.2, 11.4, 11.6, 11.8, 12.0, 12.1, 12.2, 12.3];
  cached = { ticks: ticks.sort((a, b) => a - b), motif, blips, kicks, snares };
  return cached;
}
