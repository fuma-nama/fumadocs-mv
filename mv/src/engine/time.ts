/** Musical grid. The soundtrack is exactly 150 BPM, 4/4, bar 1 beat 1 at t = 0. */
export const BPM = 150;
export const BEAT = 60 / BPM; // 0.4 s
export const BAR = BEAT * 4; // 1.6 s
export const FPS = 60;

/**
 * Time (s) of 1-indexed `bar`, 1-indexed (fractional allowed) `beat`. at(9) = 12.8.
 * Snapped to 1/2400 s so values that land on frames compare equal to `frame / 60`.
 */
export function at(bar: number, beat = 1): number {
  return Math.round(((bar - 1) * 4 + (beat - 1)) * BEAT * 2400) / 2400;
}

/** Snap a time to the 1/2400 s grid (use after adding/subtracting offsets). */
export const snap = (x: number) => Math.round(x * 2400) / 2400;

/** Position on the grid: bar/beat are 1-indexed, phase is 0..1 inside the beat. */
export function gridPos(t: number) {
  const beats = t / BEAT;
  const b = Math.floor(beats);
  return { bar: Math.floor(b / 4) + 1, beat: (b % 4) + 1, beatPhase: beats - b, barPhase: (beats / 4) % 1 };
}

export interface Section {
  id: string;
  name: string;
  startBar: number;
  endBar: number; // exclusive
  start: number;
  end: number;
}

const s = (id: string, name: string, startBar: number, endBar: number): Section => ({
  id,
  name,
  startBar,
  endBar,
  start: at(startBar),
  end: at(endBar),
});

export const SECTIONS: Section[] = [
  s('intro', 'Intro', 1, 9),
  s('read', 'Verse A1 — Reading', 9, 17),
  s('toc', 'Verse A2 — TOC', 17, 25),
  s('layout', 'Pre-chorus — Layouts', 25, 33),
  s('theme', 'Chorus — Themes', 33, 41),
  s('cli', 'Bridge — CLI', 41, 49),
  s('integrations', 'Drop — Integrations', 49, 57),
  s('showcase', 'Final chorus — Showcase', 57, 65),
  s('outro', 'Outro', 65, 70),
];

export const DURATION = snap(at(69) + 2.0); // 110.8 s

export function sectionAt(t: number): Section {
  return SECTIONS.find((x) => t >= x.start && t < x.end) ?? SECTIONS[SECTIONS.length - 1];
}
