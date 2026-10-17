import { audio, type LeadNote } from '../engine/audio';
import { at, BAR } from '../engine/time';
import type { LineDef, LyricStyleName } from './data';
import { profile } from './profile';
import { isPunct, romajiKey, romajiOf, splitMorae, toHira, vowelOf } from './kana';

/** One display unit: a ruby group (kanji/Latin + reading), one kana mora, punctuation or a phrase break. */
export interface Seg {
  kind: 'ruby' | 'kana' | 'punct' | 'space';
  /** display text (base) */
  text: string;
  /** ruby reading (kind 'ruby') */
  ruby?: string;
  /** ruby split into morae */
  rubyMorae?: string[];
  /** morae covered: [first, end) indices into the line's morae */
  morae: [number, number];
  /** phrase index (phrases are separated by spaces) */
  phrase: number;
}

export interface MoraTiming {
  /** kana of this mora (as read) */
  kana: string;
  romaji: string;
  /** onset (s) */
  t: number;
  /** end of the sung note (s) */
  end: number;
  midi: number;
  /** index of the segment that displays it */
  seg: number;
  /** position inside a multi-mora ruby segment: [k, n] = k-th of n */
  part: [number, number];
}

export interface CharTiming {
  ch: string;
  seg: number;
  /** reveal time = onset of the mora that first covers this character */
  t: number;
  /** end of the last mora covering it */
  end: number;
  /** morae covering this character [first, end) */
  morae: [number, number];
}

export interface LineTiming {
  id: string;
  /** 0 for the first take, 1 for the repeat (L11) */
  take: number;
  def: LineDef;
  style: LyricStyleName;
  /** typeset text (kanji where natural, phrase spaces) */
  text: string;
  /** full kana reading (phrase spaces kept) */
  kana: string;
  english: string;
  segs: Seg[];
  morae: MoraTiming[];
  chars: CharTiming[];
  /** first onset / last note end */
  t0: number;
  t1: number;
  /** nominal bar window of this take */
  barStart: number;
  barEnd: number;
  source: 'real' | 'provisional';
}

// ── markup → segments ───────────────────────────────────────────────────────

interface Parsed {
  segs: Seg[];
  morae: string[];
}

export function parseMarkup(markup: string): Parsed {
  const segs: Seg[] = [];
  const morae: string[] = [];
  let phrase = 0;
  const re = /\{([^|}]+)\|([^}]+)\}|(\s+)|(.)/gu;
  let m: RegExpExecArray | null;
  let pendingKana = '';
  const flushKana = () => {
    for (const mo of splitMorae(pendingKana)) {
      segs.push({ kind: 'kana', text: mo, morae: [morae.length, morae.length + 1], phrase });
      morae.push(mo);
    }
    pendingKana = '';
  };
  while ((m = re.exec(markup))) {
    if (m[1] !== undefined) {
      flushKana();
      const rm = splitMorae(m[2]);
      segs.push({ kind: 'ruby', text: m[1], ruby: m[2], rubyMorae: rm, morae: [morae.length, morae.length + rm.length], phrase });
      morae.push(...rm);
    } else if (m[3] !== undefined) {
      flushKana();
      if (segs.length) {
        segs.push({ kind: 'space', text: ' ', morae: [morae.length, morae.length], phrase });
        phrase++;
      }
    } else {
      const ch = m[4];
      if (isPunct(ch)) {
        flushKana();
        segs.push({ kind: 'punct', text: ch, morae: [morae.length, morae.length], phrase });
      } else pendingKana += ch;
    }
  }
  flushKana();
  return { segs, morae };
}

// ── provisional timing ──────────────────────────────────────────────────────

const SIXTEENTH = BAR / 16;

function provisionalNotes(def: LineDef, take: number): { t: number; dur: number; midi: number }[] {
  const t0 = at(def.takes[take][0]);
  return def.melody.map(([p, d, n]) => ({ t: round(t0 + p * SIXTEENTH), dur: round(d * SIXTEENTH), midi: n }));
}

const round = (x: number) => Math.round(x * 1e6) / 1e6;

/** Lead notes in the timing.json format, built from the provisional melody (used until the real file exists). */
export function provisionalLead(): LeadNote[] {
  const out: LeadNote[] = [];
  for (const def of profile().lines) {
    const { morae } = parseMarkup(def.markup);
    const rom = romajiOf(morae);
    def.takes.forEach((_, k) => {
      provisionalNotes(def, k).forEach((n, i) => {
        out.push({ t: n.t, dur: n.dur, midi: n.midi, line: def.id, mora: morae[i], romaji: rom[i], vowel: vowelOf(rom[i]) });
      });
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

// ── alignment of real notes to our morae ────────────────────────────────────

const sameLine = (a: string, id: string) => a === id || a.replace(/[^0-9]/g, '') === id.slice(1);

/**
 * DP alignment notes ↔ morae. Matches cost by romaji similarity; extra notes are melisma on
 * the previous mora; missing morae get interpolated times.
 */
function align(notes: LeadNote[], morae: string[], rom: string[]): { t: number; end: number; midi: number }[] {
  const n = notes.length;
  const m = morae.length;
  if (n === m) return notes.map((x) => ({ t: x.t, end: x.t + x.dur, midi: x.midi }));
  const key = (x: LeadNote) => romajiKey(x.romaji || toHira(x.mora));
  const cost = (i: number, j: number) => {
    const a = key(notes[i]);
    const b = romajiKey(rom[j]);
    if (a === b || toHira(notes[i].mora ?? '') === toHira(morae[j])) return 0;
    if (vowelOf(a) && vowelOf(a) === vowelOf(b)) return 0.4;
    return 1;
  };
  const INF = 1e9;
  const D: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  const B: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  D[0][0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const d = D[i][j];
      if (d >= INF) continue;
      if (i < n && j < m && d + cost(i, j) < D[i + 1][j + 1]) {
        D[i + 1][j + 1] = d + cost(i, j);
        B[i + 1][j + 1] = 1; // match
      }
      if (i < n && j > 0) {
        const mel = vowelOf(key(notes[i])) === vowelOf(romajiKey(rom[j - 1])) ? 0.15 : 0.6;
        if (d + mel < D[i + 1][j]) {
          D[i + 1][j] = d + mel;
          B[i + 1][j] = 2; // extra note → melisma of mora j-1
        }
      }
      if (j < m) {
        const miss = morae[j] === 'っ' || morae[j] === 'ッ' ? 0.2 : 0.8;
        if (d + miss < D[i][j + 1]) {
          D[i][j + 1] = d + miss;
          B[i][j + 1] = 3; // mora without a note
        }
      }
    }
  }
  const out: ({ t: number; end: number; midi: number } | null)[] = new Array(m).fill(null);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const b = B[i][j];
    if (b === 1) {
      const x = notes[i - 1];
      const prev = out[j - 1];
      out[j - 1] = { t: x.t, end: prev ? prev.end : x.t + x.dur, midi: x.midi };
      i--;
      j--;
    } else if (b === 2) {
      const x = notes[i - 1];
      const prev = out[j - 1];
      out[j - 1] = prev ? { ...prev, end: Math.max(prev.end, x.t + x.dur) } : { t: x.t, end: x.t + x.dur, midi: x.midi };
      // the earliest melisma note is the onset
      out[j - 1]!.t = Math.min(out[j - 1]!.t, x.t);
      i--;
    } else if (b === 3) {
      j--;
    } else break;
  }
  // interpolate missing morae
  for (let k = 0; k < m; k++) {
    if (out[k]) continue;
    let a = k - 1;
    while (a >= 0 && !out[a]) a--;
    let b = k + 1;
    while (b < m && !out[b]) b++;
    const ta = a >= 0 ? out[a]!.end : (b < m ? out[b]!.t - 0.1 * (b - k) : 0);
    const tb = b < m ? out[b]!.t : ta + 0.1 * (k - a);
    const span = b - a - 1;
    const pos = k - a;
    const t = ta + ((tb - ta) * (pos - 1)) / Math.max(1, span);
    out[k] = { t, end: ta + ((tb - ta) * pos) / Math.max(1, span), midi: a >= 0 ? out[a]!.midi : 60 };
  }
  return out as { t: number; end: number; midi: number }[];
}

// ── build line timings ──────────────────────────────────────────────────────

function build(def: LineDef, take: number, notes: { t: number; end: number; midi: number }[], source: LineTiming['source']): LineTiming {
  const { segs, morae } = parseMarkup(def.markup);
  const rom = romajiOf(morae);
  const mt: MoraTiming[] = morae.map((kana, i) => ({ kana, romaji: rom[i], t: notes[i].t, end: notes[i].end, midi: notes[i].midi, seg: -1, part: [0, 1] }));
  segs.forEach((s, si) => {
    for (let k = s.morae[0]; k < s.morae[1]; k++) {
      mt[k].seg = si;
      mt[k].part = [k - s.morae[0], s.morae[1] - s.morae[0]];
    }
  });
  const chars: CharTiming[] = [];
  let lastMora = 0;
  segs.forEach((s, si) => {
    if (s.kind === 'space') return;
    const glyphs = [...s.text];
    const [a, b] = s.morae;
    glyphs.forEach((ch, gi) => {
      let ma: number;
      let mb: number;
      if (b > a) {
        const n = b - a;
        ma = a + Math.floor((gi / glyphs.length) * n + 1e-9);
        mb = a + Math.max(ma - a + 1, Math.ceil(((gi + 1) / glyphs.length) * n - 1e-9));
        lastMora = mb - 1;
      } else {
        // punctuation: shown with the previous mora
        ma = lastMora;
        mb = lastMora + 1;
      }
      chars.push({ ch, seg: si, t: mt[ma].t, end: mt[mb - 1].end, morae: [ma, mb] });
    });
  });
  const text = segs.map((s) => s.text).join('');
  const kana = segs.map((s) => (s.kind === 'ruby' ? s.ruby! : s.text)).join('');
  return {
    id: def.id,
    take,
    def,
    style: def.style,
    text,
    kana,
    english: def.en,
    segs,
    morae: mt,
    chars,
    t0: mt[0].t,
    t1: Math.max(...mt.map((x) => x.end)),
    barStart: def.takes[take][0],
    barEnd: def.takes[take][1],
    source,
  };
}

let cacheKey: unknown = null;
let cache: LineTiming[] = [];
let injected: LeadNote[] | null = null;

/** Fill audio.timing.events.lead with the provisional melody while the real soundtrack timing is missing. */
export function ensureLead() {
  const ev = audio.timing.events;
  if (!ev.lead || ev.lead.length === 0) {
    injected = provisionalLead();
    ev.lead = injected;
  }
}

/** true when lyric timing comes from /music/timing.json */
export const realTiming = () => {
  ensureLead();
  return audio.timing.events.lead !== injected;
};

/** All lyric line takes with per-mora timing (real notes when available, provisional otherwise). */
export function lineTimings(): LineTiming[] {
  ensureLead();
  const lead = audio.timing.events.lead;
  if (cacheKey === lead) return cache;
  cacheKey = lead;
  const real = lead !== injected;
  const out: LineTiming[] = [];
  for (const def of profile().lines) {
    const { morae } = parseMarkup(def.markup);
    const rom = romajiOf(morae);
    const all = real ? lead.filter((n) => sameLine(String(n.line), def.id)).sort((a, b) => a.t - b.t) : [];
    // split takes: by clusters (gap > 1 bar) when they match the take count, else by bar window
    let groups: LeadNote[][] = [];
    if (all.length) {
      if (def.takes.length === 1) groups = [all];
      else {
        const cl: LeadNote[][] = [[all[0]]];
        for (let i = 1; i < all.length; i++) {
          const prev = all[i - 1];
          if (all[i].t - (prev.t + prev.dur) > BAR) cl.push([]);
          cl[cl.length - 1].push(all[i]);
        }
        groups =
          cl.length === def.takes.length
            ? cl
            : def.takes.map(([b0, b1]) => all.filter((n) => n.t >= at(b0) - BAR / 2 && n.t < at(b1) + BAR / 2));
      }
    }
    def.takes.forEach((_, k) => {
      const g = groups[k];
      if (g && g.length) out.push(build(def, k, align(g, morae, rom), 'real'));
      else out.push(build(def, k, provisionalNotes(def, k).map((n) => ({ t: n.t, end: n.t + n.dur, midi: n.midi })), 'provisional'));
    });
  }
  cache = out.sort((a, b) => a.t0 - b.t0);
  return cache;
}
