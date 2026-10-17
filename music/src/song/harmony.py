"""Chord symbols -> pitch classes, voice-led voicings, and per-section scales."""

import itertools

import numpy as np

PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
QUALITY = {
    "": (0, 4, 7),
    "m": (0, 3, 7),
    "7": (0, 4, 7, 10),
    "maj7": (0, 4, 7, 11),
    "maj9": (0, 4, 7, 11, 14),
    "m7": (0, 3, 7, 10),
    "m9": (0, 3, 7, 10, 14),
    "6": (0, 4, 7, 9),
    "m6": (0, 3, 7, 9),
    "sus4": (0, 5, 7),
    "7sus4": (0, 5, 7, 10),
    "add9": (0, 4, 7, 14),
    "madd9": (0, 3, 7, 14),
}


def parse_root(s):
    r = PC[s[0]]
    i = 1
    while i < len(s) and s[i] in "#b":
        r += 1 if s[i] == "#" else -1
        i += 1
    return r % 12, s[i:]


def chord(name):
    """'Bm7', 'Gmaj7', 'F#7sus4', 'Bm7/A', 'Abmaj9' -> (root_pc, bass_pc, intervals)."""
    main, _, bass = name.partition("/")
    root, q = parse_root(main)
    ivs = QUALITY[q]
    bass_pc = parse_root(bass)[0] if bass else root
    return root, bass_pc, ivs


def pcs(name):
    root, bass, ivs = chord(name)
    return sorted({(root + i) % 12 for i in ivs} | {bass})


def display(name):
    return name.replace("maj", "△").replace("b", "♭").replace("#", "♯")


def voicing(name, center=64, n=4, prev=None, lo=None, hi=None):
    """Close-ish voicing of n notes (no root doubling below the 5th) chosen to minimise movement
    from `prev` and stay near `center`."""
    root, _, ivs = chord(name)
    tones = [(root + i) % 12 for i in ivs]
    if len(tones) > n:  # drop the fifth first
        fifth = (root + 7) % 12
        if fifth in tones and len(tones) - 1 >= n:
            tones.remove(fifth)
        tones = tones[:n]
    while len(tones) < n:
        tones.append(tones[len(tones) % len(tones)])
    lo = center - 9 if lo is None else lo
    hi = center + 10 if hi is None else hi
    best = None
    for perm in itertools.permutations(tones):
        for base in range(lo - 12, hi):
            notes = []
            cur = base
            for pc in perm:
                m = cur + ((pc - cur) % 12)
                notes.append(m)
                cur = m + 1
            if notes[0] < lo or notes[-1] > hi or notes[-1] - notes[0] > 14:
                continue
            spread = notes[-1] - notes[0]
            cost = abs(np.mean(notes) - center) * 0.6 + spread * 0.08
            if prev is not None:
                cost += sum(min(abs(a - b) for b in prev) for a in notes) * 0.5
            if best is None or cost < best[0]:
                best = (cost, notes)
    return sorted(set(best[1]))


def bass_note(name, lo=28, hi=40):
    """Sub-bass pitch (root or slash bass) in [lo, hi): E1 (41 Hz) .. D#2 (78 Hz)."""
    _, b, _ = chord(name)
    m = lo + ((b - lo) % 12)
    return m


SCALES = {
    "Bm": {11, 1, 2, 4, 6, 7, 9},  # B natural minor (= D major)
    "D": {2, 4, 6, 7, 9, 11, 1},
    "Eb": {3, 5, 7, 8, 10, 0, 2},
}
