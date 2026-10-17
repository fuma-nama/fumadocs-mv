import { at, BEAT, FPS, SECTIONS } from './time';
import { indexBefore, lastBefore } from './anim';
import { assetUrl } from './url';

export interface LeadNote {
  t: number;
  dur: number;
  midi: number;
  line: string; // 'L1'…'L14'
  mora: string; // kana for this note
  romaji: string;
  vowel: string;
}

export interface Timing {
  bpm: number;
  duration: number;
  events: {
    kick: number[];
    snare: number[];
    clap: number[];
    hatClosed: number[];
    hatOpen: number[];
    crash: number[];
    impact: number[];
    riser: { start: number; end: number }[];
    stop: { start: number; end: number }[];
    foley: { t: number; type: string }[];
    chords: { t: number; dur: number; name: string; midi: number[] }[];
    lead: LeadNote[];
    chops: { t: number; dur: number; midi: number; syllable: string }[];
    motif: { t: number; dur: number; midi: number }[];
  };
}

/** Grid-only stand-in used until the real soundtrack timing exists. */
function fallbackTiming(): Timing {
  const kick: number[] = [];
  const snare: number[] = [];
  const hat: number[] = [];
  for (let b = 9; b < 65; b++) {
    for (let k = 0; k < 4; k++) kick.push(at(b, 1 + k));
    snare.push(at(b, 2), at(b, 4));
    for (let k = 0; k < 8; k++) hat.push(at(b, 1 + k / 2));
  }
  return {
    bpm: 150,
    duration: at(69) + 2,
    events: {
      kick,
      snare,
      clap: snare,
      hatClosed: hat,
      hatOpen: [],
      crash: [at(9), at(33), at(37), at(57), at(61)],
      impact: [at(9), at(33), at(49), at(57)],
      riser: [{ start: at(5), end: at(9) }, { start: at(29), end: at(33) }],
      stop: [{ start: at(8, 4), end: at(9) }, { start: at(32, 3), end: at(33) }],
      foley: [],
      chords: [],
      lead: [],
      chops: [],
      motif: [],
    },
  };
}

export class AudioData {
  timing: Timing = fallbackTiming();
  curves: Record<string, Float32Array> = {};
  envFps = FPS;
  real = false;

  async load(base = '/music/') {
    try {
      const r = await fetch(assetUrl(base + 'timing.json'), { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        const fb = fallbackTiming();
        this.timing = { ...fb, ...j, events: { ...fb.events, ...(j.events ?? {}) } };
        this.real = true;
      }
    } catch {}
    try {
      const r = await fetch(assetUrl(base + 'envelopes.json'), { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        this.envFps = j.fps ?? FPS;
        // music/out/envelopes.json: { fps, frames, duration, channels: { master, kick, … }, onset: [...] }
        const src: Record<string, unknown> = { ...(j.channels ?? j.curves ?? j.envelopes ?? {}), ...(Array.isArray(j.onset) ? { onset: j.onset } : {}) };
        for (const [k, v] of Object.entries(src)) if (Array.isArray(v)) this.curves[k] = Float32Array.from(v as number[]);
      }
    } catch {}
  }

  /** Sorted event times for drum-like cues ('kick', 'snare', 'crash', …). */
  cue(name: keyof Timing['events']): number[] {
    const ev = this.timing.events[name] as unknown[];
    if (!ev?.length) return [];
    return typeof ev[0] === 'number' ? (ev as number[]) : (ev as { t?: number; start?: number }[]).map((e) => e.t ?? e.start ?? 0);
  }

  /** exp(-(t - lastEvent)/decay) for a cue. */
  pulse(name: keyof Timing['events'], t: number, decay = 0.2): number {
    const last = lastBefore(this.cue(name), t);
    return last === undefined ? 0 : Math.exp(-(t - last) / decay);
  }

  /** Envelope curve value (0..1) at time t, linearly interpolated; 0 if missing. */
  env(name: string, t: number): number {
    const c = this.curves[name];
    if (!c) return name === 'kick' ? this.pulse('kick', t, 0.12) : 0;
    const x = t * this.envFps;
    const i = Math.floor(x);
    if (i < 0) return c[0] ?? 0;
    if (i >= c.length - 1) return c[c.length - 1] ?? 0;
    return c[i] + (c[i + 1] - c[i]) * (x - i);
  }

  /** Lead notes of one lyric line. */
  line(id: string): LeadNote[] {
    return this.timing.events.lead.filter((n) => n.line === id);
  }

  /** Index of the lead note sounding (or last started) at t, -1 if none started yet. */
  leadIndex(t: number): number {
    return indexBefore(this.timing.events.lead, t, (n) => n.t);
  }
}

export const audio = new AudioData();
export { SECTIONS, BEAT };
