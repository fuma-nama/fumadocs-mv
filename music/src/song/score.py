"""The full arrangement as data: every hit, note, mora, chop and FX event on the 150 BPM grid.
The renderer (song/render_parts.py) turns this into audio and export.py into timing.json."""

from collections import defaultdict

from engine.core import at, S16, midi
from . import melody as mel
from .harmony import voicing, bass_note

SECTIONS = [
    ("intro", "Intro", 1, 8),
    ("verseA1", "Verse A1", 9, 16),
    ("verseA2", "Verse A2", 17, 24),
    ("pre", "Pre-chorus B", 25, 32),
    ("chorus1", "Chorus 1", 33, 40),
    ("bridge", "Bridge C", 41, 48),
    ("drop", "Drop D", 49, 56),
    ("chorus2", "Final chorus", 57, 64),
    ("outro", "Outro", 65, 68),
]

VERSE = ["Bm7", "Gmaj7", "Em7", "F#m7", "Bm7", "Gmaj7", "Em7", "F#7"]
CHART = (
    [(1, 0, 64, "Bm9")]
    + [(5, 0, 16, "Bm7"), (6, 0, 16, "Gmaj7"), (7, 0, 16, "Em7"), (8, 0, 8, "F#7sus4"), (8, 8, 4, "F#7")]
    + [(9 + i, 0, 16, c) for i, c in enumerate(VERSE)]
    + [(17 + i, 0, 16, c) for i, c in enumerate(VERSE[:7])]
    + [(24, 0, 8, "F#7sus4"), (24, 8, 8, "F#7")]
    + [(25, 0, 16, "Gmaj7"), (26, 0, 16, "A6"), (27, 0, 16, "Bm7"), (28, 0, 16, "Bm7/A"), (29, 0, 16, "Gmaj7"),
       (30, 0, 16, "A6"), (31, 0, 8, "F#7sus4"), (31, 8, 8, "F#7"), (32, 0, 16, "F#7")]
    + [(33, 0, 16, "Gmaj7"), (34, 0, 16, "A7"), (35, 0, 16, "F#m7"), (36, 0, 16, "Bm7"), (37, 0, 16, "Gmaj7"),
       (38, 0, 16, "A7"), (39, 0, 8, "F#m7"), (39, 8, 8, "B7"), (40, 0, 8, "Em7"), (40, 8, 4, "A7sus4"), (40, 12, 4, "A7")]
    + [(41 + i, 0, 16, c) for i, c in enumerate(["Bm7", "Em7", "Gmaj7", "F#7", "Bm7", "Em7", "Gmaj7"])]
    + [(48, 0, 12, "F#7")]
    + [(49 + i, 0, 16, c) for i, c in enumerate(["Gmaj7", "F#7", "Bm7", "D7", "Gmaj7", "F#7", "Bm7"])]
    + [(56, 0, 8, "D7"), (56, 8, 4, "G7")]
    + [(57, 0, 16, "Abmaj7"), (58, 0, 16, "Bb7"), (59, 0, 16, "Gm7"), (60, 0, 16, "Cm7"), (61, 0, 16, "Abmaj7"),
       (62, 0, 16, "Bb7"), (63, 0, 8, "Gm7"), (63, 8, 8, "C7"), (64, 0, 8, "Fm7"), (64, 8, 4, "Bb7sus4")]
    + [(65, 0, 16, "Abmaj9"), (66, 0, 16, "Abm6"), (67, 0, 32, "Ebmaj9")]
)


# ---- used by mix/export/analysis
SCALE_BY_SECTION = {"chorus1": "D", "drop": "D", "chorus2": "Eb", "outro": "Eb"}
DOUBLE_LINES = {"L8", "L9", "L10", "L12", "L13"}  # lines sung with the L/R double-tracks
TARGET_LUFS = -11.5
SWEEPS = [(at(5), at(8, 12), "arp filter"), (at(41), at(48, 12), "bridge low-pass")]
DROP_ACCENTS = [(49, "impact + crash + 'fu' shout"), (51, "laser zap + glass chord"),
                (53, "machine hit: return-key clunk + power-on thump + ding + gear ratchet + stutter + glass motif"),
                (55, "china cymbal + noise hit + sub impact + 'do' shout")]


def chord_at(bar, pos=0):
    t = at(bar, pos)
    for b, p, d, name in CHART:
        s = at(b, p)
        if s <= t < s + d * S16:
            return name
    return None


def bars_of(bar, pos, dur):
    """Chord-chart entries overlapping a span (for parts that follow the chart)."""
    a, b = at(bar, pos), at(bar, pos) + dur * S16
    out = []
    for cb, cp, cd, name in CHART:
        s = at(cb, cp)
        e = s + cd * S16
        if e > a and s < b:
            out.append((max(s, a), min(e, b), name))
    return out


class Score:
    def __init__(self):
        self.hits = defaultdict(list)  # name -> [(t, vel, kw)]
        self.notes = defaultdict(list)  # part -> [(t, dur, midi | [midi], vel, kw)]
        self.lead = []  # dicts
        self.harm = []
        self.chops = []
        self.motif = []
        self.risers = []
        self.stops = []
        self.tape_stops = []
        self.stutters = []
        self.beds = []  # unpitched noise beds: (t, dur, level)
        self.stop_keep = {}  # stop start -> stems that keep sounding through it (default: fx only)
        self.voice_cuts = []  # extra (start, end) windows where the voice stem is silenced
        self.auto = {}

    def hit(self, name, bar, pos=0, vel=1.0, **kw):
        self.hits[name].append((at(bar, pos), vel, kw))

    def note(self, part, bar, pos, dur16, m, vel=0.8, **kw):
        self.notes[part].append((at(bar, pos), int(round(dur16 * S16)), m, vel, kw))

    def pattern(self, name, bars, pat, vel=1.0, **kw):
        levels = {"X": 1.0, "x": 0.78, "o": 0.5, "-": 0.32}
        for bar in bars:
            for i, ch in enumerate(pat):
                if ch in levels:
                    self.hit(name, bar, i, levels[ch] * vel, **kw)


def R(a, b):
    return range(a, b + 1)


def build():
    sc = Score()
    intro(sc)
    verse(sc)
    pre(sc)
    chorus(sc, 33, final=False)
    bridge(sc)
    drop(sc)
    chorus(sc, 57, final=True)
    outro(sc)
    lead(sc)
    return sc


# ======================================================================= intro (bars 1-8)


def intro(sc):
    sc.hit("power", 1, 0)
    # subtle machine-room noise bed: intro -> verses, and again under the outro tail
    sc.beds.append((at(1, 0), at(8, 12) - at(1, 0), 1.0))
    sc.beds.append((at(9, 0), at(25, 0) - at(9, 0), 0.7))
    sc.beds.append((at(67, 0), at(69, 0) + int(1.2 * 48000) - at(67, 0), 0.9))
    for bar in R(1, 4):
        for pos in range(0, 16, 2):
            sc.hit("tick", bar, pos, 0.42 + 0.06 * (bar - 1) + (0.08 if pos % 4 == 0 else 0), tock=(pos // 2) % 2 == 1)
    for bar in R(5, 8):
        for pos in range(16):
            if bar == 8 and pos >= 12:
                break
            sc.hit("tick", bar, pos, 0.5 if pos % 4 == 0 else 0.3, tock=pos % 2 == 1)
    blips = [(1, 6, "F#6"), (1, 11, "B6"), (2, 13, "D7"), (3, 3, "A6"), (3, 7, "E7"), (3, 10, "B6"),
             (3, 14, "F#6"), (4, 10, "C#7"), (4, 13, "B6"), (5, 5, "D7"), (6, 9, "F#6"), (6, 14, "A6"), (7, 3, "E7")]
    for bar, pos, n in blips:
        sc.hit("blip", bar, pos, 0.55, m=midi(n), pan=((pos * 7) % 9 - 4) / 5)
    # README motif: statement (bar 2) and answer (bar 4)
    for bar, notes in ((2, mel.MOTIF_B), (4, mel.MOTIF_B_ANSWER)):
        for (pos, d), n in zip(mel.MOTIF_RHYTHM, notes):
            sc.motif.append((at(bar, pos), d * S16, midi(n), "bell"))
    # drone bars 1-8 (the chords part takes over from bar 5 underneath)
    sc.notes["drone"].append((at(1, 0), at(8, 12) - at(1, 0), [midi("B1"), midi("F#2"), midi("B2")], 1.0, {}))
    # muffled kick from bar 5; snare build bar 8; riser; stop
    sc.pattern("kick", R(5, 7), "X...X...X...X...", 0.9, muffle=True)
    sc.pattern("kick", [8], "X...X...X.......", 0.95, muffle=True)
    for i, pos in enumerate([0, 2, 4, 6, 8, 9, 10, 11]):
        sc.hit("snare", 8, pos, 0.42 + 0.07 * i, build=True)
    sc.risers.append((at(7, 0), at(8, 12)))
    sc.hit("revcym", 8, 12, 0.7, dur=at(9, 0) - at(8, 12))
    sc.stops.append((at(8, 12), at(9, 0)))
    # 16th arp, filter opens over bars 5-8
    arp_bars(sc, R(5, 8), "arp", pattern=[0, 1, 2, 3, 4, 3, 2, 1], vel=0.75, octaves=2, base=59, stop_at=at(8, 12))
    sc.auto["arp_cut"] = [(at(5, 0), 260.0), (at(6, 0), 520.0), (at(7, 0), 1200.0), (at(8, 0), 2600.0), (at(8, 12), 4200.0),
                          (at(9, 0), 2800.0), (at(17, 0), 2800.0), (at(25, 0), 3200.0), (at(32, 8), 5500.0)]
    # sub swells on the roots, bars 5-8
    for bar in R(5, 8):
        d = 12 if bar == 8 else 16
        sc.note("sub", bar, 0, d, bass_note(chord_at(bar)), 0.55)


def arp_bars(sc, bars, part, pattern, vel, octaves, base, stop_at=None, step=1, accent=True, every=1):
    """Chord-tone arpeggio from the chart; pattern indexes into stacked chord tones."""
    for bar in bars:
        for pos in range(0, 16, step):
            t = at(bar, pos)
            if stop_at is not None and t >= stop_at:
                return
            name = chord_at(bar, pos)
            if name is None:
                continue
            tones = sorted(voicing(name, center=base + 6, n=4))
            stack = []
            for o in range(octaves):
                stack += [m + 12 * o for m in tones]
            idx = pattern[(pos // step) % len(pattern)] % len(stack)
            v = vel * (1.0 if (pos % 4 == 0 or not accent) else 0.78)
            sc.note(part, bar, pos, step * 0.9, stack[idx], v)


# ======================================================================= verses (bars 9-24)


def verse(sc):
    sc.hit("impact", 9, 0, 1.0)
    sc.hit("crash", 9, 0, 0.9)
    sc.hit("paper", 9, 0, 0.8, up=True)
    # ---- drums
    for bar in R(9, 24):
        a2 = bar >= 17
        fill = bar in (16, 24)
        sc.pattern("kick", [bar], "X.....x...x...o." if a2 and bar % 2 == 0 else "X.....x...x.....")
        if bar == 16:
            sc.pattern("snare", [bar], "....X.......oxxX", 0.95)
        elif bar == 24:
            sc.pattern("snare", [bar], "....X...x.x.xxXX", 0.95)
        else:
            sc.pattern("snare", [bar], "....X..o....X..." if a2 else "....X.......X...", 0.95)
        if not fill:
            sc.pattern("clap", [bar], "....X.......X...", 0.75)
        if a2:
            sc.pattern("hat", [bar], "x-o-x-o-x-o-x-oo", 0.85)
            sc.pattern("shaker", [bar], "..o...x...o...x.", 0.8)
        else:
            sc.pattern("hat", [bar], "o.x.o.x.o.x.o.x.", 0.8)
    # ---- foley machine
    for bar in R(9, 24):
        for pos in range(16):
            sc.hit("tick", bar, pos, 0.22 if pos % 4 else 0.32, tock=pos % 2 == 1)
        sc.hit("type", bar, 3, 0.55)
        sc.hit("type", bar, 11, 0.5)
        if bar >= 17:
            sc.hit("type", bar, 7, 0.38)
            sc.hit("gear", bar, 14, 0.5)
        elif bar % 2 == 0:
            sc.hit("gear", bar, 14, 0.45)
    for bar in (12, 16, 20):  # carriage return after each sung line
        sc.hit("ding", bar, 0, 0.5)
        sc.hit("paper", bar, 2, 0.4, up=False, dur=0.28)
    sc.hit("servo", 16, 8, 0.5, dur=0.35)
    sc.hit("servo", 24, 4, 0.55, dur=0.45, f0=150.0, f1=420.0)
    sc.hit("paper", 17, 0, 0.6, up=True)
    sc.hit("paper", 21, 0, 0.45, up=True)
    sc.hit("revcym", 24, 8, 0.6, dur=at(25, 0) - at(24, 8))
    # ---- bass: sub + mid, kick-locked; A2 busier
    for bar in R(9, 24):
        name = chord_at(bar)
        r = bass_note(name)
        cells = [(0, 5, 0), (6, 3, 0), (10, 4, 0), (14, 2, 12)]
        if bar >= 17:
            cells = [(0, 3, 0), (3, 2, 0), (6, 2, 0), (8, 2, 12), (10, 3, 0), (14, 2, 12)]
        if bar == 24:
            cells = [(0, 3, 0), (3, 2, 0), (6, 2, 0), (8, 2, 0), (10, 2, 0), (12, 2, 0), (14, 2, 0)]
        for pos, d, o in cells:
            n2 = chord_at(bar, pos)
            rr = bass_note(n2)
            sc.note("sub", bar, pos, d * 0.92, rr + o, 0.9 if o == 0 else 0.6)
            sc.note("mid", bar, pos, d * 0.85, rr + o + 12, 0.75 if o == 0 else 0.6)
    # ---- keys: EP following the kick rhythm; A2 adds a soft pad
    prev = None
    for bar in R(9, 24):
        for pos, d, v in ((0, 5, 0.62), (6, 2, 0.5), (10, 4, 0.55)):
            name = chord_at(bar, pos)
            vo = voicing(name, center=62, n=4, prev=prev)
            prev = vo
            sc.note("ep", bar, pos, d, vo, v)
        if bar >= 17:
            name = chord_at(bar)
            sc.note("pad", bar, 0, 16, voicing(name, center=66, n=4), 0.5)
    # ---- arp (A2): soft 8th-note pluck answering the voice
    arp_bars(sc, R(17, 24), "arp", pattern=[0, 2, 4, 3, 1, 3, 5, 4], vel=0.55, octaves=2, base=66, step=2)
    # ---- bell answers in the vocal rests
    for bar, pos, d, n in [(11, 12, 2, "A5"), (11, 14, 2, "F#5"), (12, 0, 6, "C#6"), (12, 6, 2, "B5"), (12, 8, 6, "A5"),
                           (15, 12, 2, "B5"), (15, 14, 2, "A5"), (16, 0, 4, "F#5"), (16, 4, 4, "E5"), (16, 8, 4, "C#5"),
                           (19, 12, 2, "B5"), (19, 14, 2, "D6"), (20, 0, 6, "C#6"), (20, 6, 2, "A5"), (20, 8, 6, "E5"),
                           (23, 12, 2, "A5"), (23, 14, 2, "B5"), (24, 0, 4, "C#6"), (24, 4, 4, "E6"), (24, 8, 8, "F#6")]:
        sc.note("bell", bar, pos, d, midi(n), 0.6)


# ======================================================================= pre-chorus (bars 25-32)


def pre(sc):
    sc.hit("paper", 25, 0, 0.6, up=True)
    sc.hit("downlift", 25, 0, 0.5)
    for bar in R(25, 32):
        if bar <= 28:
            sc.pattern("kick", [bar], "X.......X.....x.")
            sc.pattern("snare", [bar], "....X.......X...", 0.95)
            sc.pattern("clap", [bar], "....X.......X...", 0.8)
            sc.pattern("hat", [bar], "o-x-o-x-o-x-o-xo", 0.85)
            sc.pattern("ohat", [bar], "..............x.", 0.6)
            sc.pattern("shaker", [bar], "o-x-o-x-o-x-o-x-", 0.8)
        elif bar <= 30:
            sc.pattern("kick", [bar], "X...X...X...X...")
            sc.pattern("snare", [bar], "....X.......X..." if bar == 29 else "x.x.X.x.x.x.X.x.", 0.95)
            sc.pattern("clap", [bar], "....X.......X...", 0.8)
            sc.pattern("hat", [bar], "x-x-x-x-x-x-x-x-", 0.9)
            sc.pattern("ohat", [bar], "..x...x...x...x.", 0.55)
            sc.pattern("shaker", [bar], "oxoxoxoxoxoxoxox", 0.75)
        elif bar == 31:
            sc.pattern("kick", [bar], "X...X...X...X...")
            for pos in range(16):
                sc.hit("snare", bar, pos, 0.5 + 0.025 * pos, build=True)
            sc.pattern("hat", [bar], "xxxxxxxxxxxxxxxx", 0.7)
        else:  # 32: roll to beat 2, then the break
            sc.pattern("kick", [bar], "X...X...........")
            for pos in range(8):
                sc.hit("snare", bar, pos, 0.85 + 0.02 * pos, build=True)
            sc.pattern("hat", [bar], "xxxxxxxx........", 0.75)
    for bar in R(25, 32):
        for pos in range(0, 16, 2 if bar < 29 else 1):
            if bar == 32 and pos >= 8:
                break
            sc.hit("tick", bar, pos, 0.25, tock=pos % 2 == 1)
        if bar < 31:
            sc.hit("type", bar, 3, 0.45)
            sc.hit("gear", bar, 11, 0.4)
    sc.risers.append((at(29, 0), at(32, 8)))
    sc.hit("revcym", 32, 8, 0.75, dur=at(33, 0) - at(32, 8))
    sc.stops.append((at(32, 8), at(33, 0)))
    sc.stop_keep[at(32, 8)] = {"fx", "lead_voice"}  # the break: only the vocal pickup and the swell
    sc.hit("swell", 32, 8, 0.6, dur=at(33, 0) - at(32, 8), chord=[midi(n) for n in ("F#3", "A#3", "C#4", "E4")])
    # bass: 8ths -> octaves -> 16ths
    for bar in R(25, 32):
        for pos in range(0, 16, 2 if bar <= 30 else 1):
            if bar == 32 and pos >= 8:
                break
            name = chord_at(bar, pos)
            r = bass_note(name)
            o = 12 if (bar >= 29 and bar <= 30 and pos % 4 == 2) else 0
            d = 1.8 if bar <= 30 else 0.9
            sc.note("sub", bar, pos, d, r + o, 0.85)
            sc.note("mid", bar, pos, d * 0.9, r + o + 12, 0.7 + (0.15 if pos % 4 == 0 else 0))
    # chords: supersaw rising + EP 8ths
    prev = None
    for bar in R(25, 32):
        name = chord_at(bar)
        if bar == 31:
            sc.note("saw", bar, 0, 8, voicing("F#7sus4", 66, 4), 0.55 + 0.04 * 6, cut=1.0)
            sc.note("saw", bar, 8, 8, voicing("F#7", 66, 4), 0.55 + 0.04 * 7, cut=1.0)
        elif bar == 32:
            sc.note("saw", bar, 0, 8, voicing("F#7", 66, 4), 0.85, cut=1.0)
        else:
            sc.note("saw", bar, 0, 16, voicing(name, 66, 4), 0.55 + 0.04 * (bar - 25), cut=(bar - 25) / 7)
        for pos in range(0, 16, 2):
            if bar == 32 and pos >= 8:
                break
            n2 = chord_at(bar, pos)
            vo = voicing(n2, 62, 4, prev=prev)
            prev = vo
            sc.note("ep", bar, pos, 1.6, vo, 0.42 + (0.12 if pos % 4 == 0 else 0))
    arp_bars(sc, R(25, 32), "arp", pattern=[0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 3, 4, 5], vel=0.62, octaves=2, base=66,
             stop_at=at(32, 8))


# ======================================================================= choruses


def chorus(sc, b0, final):
    k = 1 if final else 0  # semitone offset is in the chart; extra layers when final
    sc.hit("crash", b0, 0, 1.0)
    sc.hit("impact", b0, 0, 1.0 if final else 0.95)
    sc.hit("crash", b0 + 4, 0, 0.9)
    sc.hit("downlift", b0, 0, 0.45)
    last = b0 + 7
    for bar in R(b0, last):
        if bar == last and not final:
            sc.pattern("kick", [bar], "X...X...X.......")
            sc.pattern("snare", [bar], "....X.......X.X.", 0.95)
            sc.hit("tom", bar, 13, 0.85, m=50)
            sc.hit("tom", bar, 15, 0.9, m=45)
            sc.pattern("clap", [bar], "....X...........", 0.85)
        elif bar == last and final:
            sc.pattern("kick", [bar], "X...X...X.......")
            sc.pattern("snare", [bar], "....X...........", 0.95)
            sc.pattern("clap", [bar], "....X.......", 0.85)
        else:
            sc.pattern("kick", [bar], "X...X...X...X...")
            sc.pattern("snare", [bar], "....X.......X...", 0.95)
            sc.pattern("clap", [bar], "....X.......X...", 0.9)
        stop16 = 12 if bar == last else 16
        sc.pattern("ohat", [bar], "..x...x...x...x."[:stop16], 0.85)
        sc.pattern("hat", [bar], "x-o-x-o-x-o-x-o-"[:stop16], 0.7)
        sc.pattern("shaker", [bar], "oxoxoxoxoxoxoxox"[:stop16], 0.65 if not final else 0.8)
        if final or bar >= b0 + 4:
            sc.pattern("ride", [bar], "x...x...x...x..."[:stop16], 0.5 if not final else 0.6)
        if final:
            sc.pattern("tamb", [bar], "..x...x...x...x."[:stop16], 0.6)
        for pos in range(0, stop16, 2):
            sc.hit("tick", bar, pos, 0.22, tock=pos % 4 == 2)
        if bar % 2 == 1:
            sc.hit("type", bar, 14, 0.4)
    if final:
        sc.hit("revcym", last, 12, 0.45, dur=at(last + 1, 0) - at(last, 12))
        sc.stops.append((at(last, 12), at(last + 1, 0)))
    # bass: pumping sub + 8th-note octave mid bass
    for bar in R(b0, last):
        for pos in range(0, 16, 2):
            if bar == last and pos >= 12:
                break
            name = chord_at(bar, pos)
            r = bass_note(name)
            sc.note("sub", bar, pos, 1.9, r, 0.95)
            sc.note("mid", bar, pos, 1.6, r + 12, 0.85 if pos % 4 == 2 else 0.5)
    # chords: wide supersaw (sidechained) + EP tresillo comping
    prev = None
    for bar in R(b0, last):
        for s, e, name in bars_of(bar, 0, 12 if bar == last else 16):
            d16 = (e - s) / S16
            pos = (s - at(bar, 0)) / S16
            sc.note("saw", bar, pos, d16, voicing(name, 67, 4), 0.95 if final else 0.85, cut=1.0, wide=True)
            if final:
                sc.note("saw_hi", bar, pos, d16, [m + 12 for m in voicing(name, 67, 3)], 0.45)
        for pos, d in ((0, 3), (3, 3), (6, 2), (8, 3), (11, 3), (14, 2)):
            if bar == last and pos >= 12:
                break
            name = chord_at(bar, pos)
            vo = voicing(name, 64, 4, prev=prev)
            prev = vo
            sc.note("ep", bar, pos, d * 0.8, vo, 0.5 + (0.12 if pos in (0, 8) else 0), bright=1.3)
    arp_bars(sc, R(b0, last), "arp", pattern=[0, 2, 4, 6, 7, 5, 3, 1], vel=0.7, octaves=2, base=77,
             stop_at=at(last, 12))
    # motif quote and lead-synth answers in the vocal rests
    mb = mel.MOTIF_EB if final else mel.MOTIF_B
    for (pos, d), n in zip([(8, 1), (9, 1), (10, 1), (11, 1), (12, 4)], mb):
        sc.motif.append((at(b0 + 3, pos), d * S16, midi(n), "bell"))
    resp1 = [(8, 2, "C#6"), (10, 2, "B5"), (12, 2, "A5"), (14, 2, "E5")]
    resp2 = [(8, 2, "A5"), (10, 2, "B5"), (12, 2, "C#6"), (14, 2, "E6")]
    for bar, resp in ((b0 + 1, resp1), (b0 + 5, resp2)):
        for pos, d, n in resp:
            sc.note("answer", bar, pos, d, midi(n) + k, 0.75)
    if final:  # descant counter-line over the hook
        for bar, pos, d, n in [(61, 0, 16, "Eb6"), (62, 0, 8, "D6"), (62, 8, 8, "F6"),
                               (63, 0, 8, "D6"), (63, 8, 8, "E6"), (64, 0, 8, "F6"), (64, 8, 4, "F6")]:
            sc.note("descant", bar, pos, d, midi(n), 0.55)


# ======================================================================= bridge (bars 41-48)


def bridge(sc):
    sc.hit("downlift", 41, 0, 0.6)
    sc.hit("servo", 41, 0, 0.55, dur=0.5, f0=420.0, f1=140.0)
    for bar in R(41, 48):
        if bar == 48:
            sc.pattern("kick", [bar], "X.......X.......")
            for pos in range(12):
                sc.hit("snare", bar, pos, 0.55 + 0.035 * pos, build=True)
            sc.pattern("hat", [bar], "x-x-x-x-x-x-....", 0.8)
            continue
        sc.pattern("kick", [bar], "X.......X.......")
        sc.pattern("snare", [bar], "......X.....X...", 0.9, dembow=True)
        sc.pattern("clap", [bar], "......x.....x...", 0.7)
        sc.pattern("rim", [bar], "...x.......x..x." if bar % 2 else "...x.......x....", 0.6)
        sc.pattern("hat", [bar], "x.x.x.x.x.x.x.x.", 0.6)
        sc.pattern("shaker", [bar], "oxoxoxoxoxoxoxox", 0.55)
        if bar == 47:
            sc.pattern("snare", [bar], "x.x.x.x.x.x.x.x.", 0.6, build=True)
        if bar in (43, 44, 47):
            sc.hit("type", bar, 2, 0.32)
            sc.hit("type", bar, 10, 0.3)
        sc.hit("gear", bar, 15, 0.4)
    # foley synced to the CLI picture: click, double-click, typing, Enter, floppies, split-flap, print head
    sc.hit("mouse", 40, 12, 0.55)
    sc.hit("mouse", 41, 6, 0.6)
    sc.hit("mouse", 41, 8, 0.6)
    for k in range(22):
        bar, pos = divmod(10 + k, 16)
        sc.hit("type", 41 + bar, pos, 0.42 + 0.18 * ((k * 7) % 5) / 4)
    for bar, pos in ((41, 12.5), (41, 14.5), (42, 0.5), (42, 2.5), (42, 6.5)):  # flams: two chars in one 16th
        sc.hit("type", bar, pos, 0.3)
    for bar, pos in ((43, 3), (43, 6), (43, 8), (43, 11), (43, 12), (43, 14), (44, 3), (44, 6), (44, 8), (44, 11),
                     (44, 12), (44, 13), (44, 14), (44, 15), (44, 15.5)):  # menu cursor steps
        sc.hit("cursor", bar, pos, 0.45)
    for bar in (43, 44, 45):
        sc.hit("enter", bar, 0, 0.7)
    for bar, pos in ((45, 0), (45, 6), (45, 8), (45, 12), (46, 0)):
        sc.hit("clunk", bar, pos, 0.75)
    sc.hit("gear", 46, 6, 0.55, clicks=18, spacing=S16 * 6 / 18 / 48000)
    sc.hit("servo", 46, 12, 0.5, dur=0.4, f0=620.0, f1=760.0)
    sc.hit("paper", 46, 12, 0.45, up=True, dur=0.4)
    sc.risers.append((at(47, 0), at(48, 12)))
    sc.stops.append((at(48, 12), at(49, 0)))
    sc.tape_stops.append((at(48, 8), at(48, 12)))
    sc.hit("revcym", 48, 12, 0.85, dur=at(49, 0) - at(48, 12))
    # 808 dembow bass with glides
    for bar in R(41, 48):
        r = bass_note(chord_at(bar))
        cells = [(0, 5.5, 0), (6, 1.8, 0), (8, 3.5, 0), (12, 3.5, 7 if bar % 2 else 12)]
        if bar == 48:
            cells = [(0, 5.5, 0), (6, 1.8, 0), (8, 3.8, 0)]
        for pos, d, o in cells:
            sc.note("b808", bar, pos, d, r + o, 0.95, glide=0.06 if o else 0.0)
    # filtered playful keys: offbeat stabs on the snare slots + a soft pad
    prev = None
    for bar in R(41, 48):
        name = chord_at(bar)
        vo = voicing(name, 64, 4, prev=prev)
        prev = vo
        for pos in ((6, 12) if bar < 48 else (6,)):
            sc.note("stab", bar, pos, 1.5, vo, 0.75)
        sc.note("pad", bar, 0, 16 if bar < 48 else 12, voicing(name, 62, 4), 0.55)
    sc.auto["bridge_lp"] = [(at(41, 0), 900.0), (at(45, 0), 1600.0), (at(47, 0), 2600.0), (at(48, 12), 9000.0)]
    riff = [(0, "B5"), (2, "F#5"), (3, "A5"), (6, "F#5"), (8, "E5"), (10, "D5"), (11, "E5"), (14, "F#5")]
    riff2 = [(0, "G5"), (2, "E5"), (3, "F#5"), (6, "E5"), (8, "D5"), (10, "B4"), (11, "D5"), (14, "E5")]
    for bar, rf in ((41, riff), (42, riff2), (45, riff), (46, riff2)):
        for pos, n in rf:
            sc.note("marimba", bar, pos, 1.5, midi(n), 0.7 if pos % 4 == 0 else 0.55)
    for i, pos in enumerate(range(0, 16, 1)):  # bar 47 rising run, chord tones
        name = chord_at(47, pos)
        tones = sorted(voicing(name, 72, 4))
        sc.note("marimba", 47, pos, 0.9, tones[i % 4] + 12 * (i // 8) - 12, 0.4 + 0.025 * i)


# ======================================================================= drop (bars 49-56)

DROP_RHYTHM = [(0, 3), (3, 3), (6, 2), (8, 3), (11, 3), (14, 2)]


def drop(sc):
    sc.hit("crash", 49, 0, 1.0)
    sc.hit("impact", 49, 0, 1.0)
    # distinct block accents (49 / 51 / 53 / 55)
    sc.hit("accent_fu", 49, 0, 1.0)
    sc.hit("zap", 51, 0, 1.0)
    sc.hit("glass", 51, 0, 0.9, chord=[midi(n) for n in ("B5", "D6", "F#6", "A6")])
    sc.hit("revcym", 50, 8, 0.7, dur=at(51, 0) - at(50, 8))
    sc.hit("ding", 53, 0, 0.9, accent=True)
    sc.hit("gear", 53, 0, 0.9, clicks=8, accent=True)
    sc.hit("enter", 53, 0, 1.0, accent=True)
    sc.hit("power", 53, 0, 0.9, accent=True)
    sc.stutters.append(("music", at(53, 0), S16 // 2, 4))
    sc.hit("noise_hit", 55, 0, 1.0)
    sc.hit("impact", 55, 0, 0.85)
    sc.hit("china", 55, 0, 1.0)
    sc.hit("accent_do", 55, 0, 1.0)
    sc.hit("downlift", 55, 0, 0.5)
    sc.hit("riser_short", 54, 8, 0.8, dur=at(55, 0) - at(54, 8))
    for (pos, d), n in zip(mel.MOTIF_RHYTHM, mel.MOTIF_B):
        sc.motif.append((at(53, pos), d * S16, midi(n) + 12, "glass"))
    for bar in R(49, 56):
        if bar == 56:
            sc.pattern("kick", [bar], "X.....x.........")
            sc.pattern("snare", [bar], "....X...XXXX....", 1.0)
            sc.pattern("clap", [bar], "....X...........", 0.9)
            sc.pattern("hat", [bar], "xxxxxxxx........", 0.8)
            sc.hit("tom", bar, 10, 0.9, m=52)
            sc.hit("tom", bar, 11, 0.95, m=47)
            continue
        sc.pattern("kick", [bar], "X.....x...x....." if bar % 2 else "X.....x...x...x.")
        sc.pattern("snare", [bar], "....X.......X...", 1.0)
        sc.pattern("clap", [bar], "....X.......X...", 0.95)
        sc.pattern("hat", [bar], "xoxoxoxoxoxoxoxo", 0.85)
        sc.pattern("ohat", [bar], "..x.......x...x.", 0.7)
        sc.pattern("shaker", [bar], "..x...x...x...x.", 0.6)
        for pos in (2, 10):
            sc.hit("tick", bar, pos, 0.3)
    sc.stops.append((at(56, 12), at(57, 0)))
    sc.hit("revcym", 56, 12, 0.8, dur=at(57, 0) - at(56, 12))
    sc.risers.append((at(56, 0), at(56, 12)))
    # bass + chopped future-bass chords on the 3-3-2 grid
    for bar in R(49, 56):
        for pos, d in DROP_RHYTHM:
            if bar == 56 and pos >= 8:
                break
            name = chord_at(bar, pos)
            r = bass_note(name)
            o = 12 if pos in (6, 14) else 0
            sc.note("sub", bar, pos, d * 0.9, r, 0.95)
            sc.note("growl", bar, pos, d * 0.92, r + 12 + o, 0.9, lfo=(4 if d == 3 else 2))
            sc.note("fbass", bar, pos, d * 0.8, voicing(name, 69, 4), 0.85 + (0.1 if pos == 0 else 0))
    sc.note("fbass", 56, 8, 3, voicing("G7", 67, 4), 0.85)
    sc.note("sub", 56, 8, 3.5, bass_note("G7"), 0.9)
    arp_bars(sc, R(49, 56), "arp", pattern=[0, 2, 4, 2, 6, 4, 7, 5], vel=0.62, octaves=2, base=79, stop_at=at(56, 8))
    for bar, pos, d, n, syl in mel.CHOPS:
        sc.chops.append(dict(t=at(bar, pos), dur=d * S16, midi=midi(n), syllable=syl))
        sc.note("droplead", bar, pos, d * 0.9, midi(n), 0.8)


# ======================================================================= outro (bars 65-69)


def outro(sc):
    sc.hit("crash", 65, 0, 0.85)
    sc.hit("impact", 65, 0, 0.7)
    sc.note("saw", 65, 0, 16, voicing("Abmaj9", 67, 5), 0.85, cut=1.0, wide=True, rel=0.6)
    sc.note("saw", 66, 0, 16, voicing("Abm6", 67, 4), 0.8, cut=0.8, wide=True, rel=1.2)
    sc.note("ep", 65, 0, 16, voicing("Abmaj9", 62, 5), 0.6)
    sc.note("ep", 66, 0, 16, voicing("Abm6", 62, 4), 0.55)
    sc.note("pad", 67, 0, 30, voicing("Ebmaj9", 62, 5), 0.6, attack=0.4, release=1.8)
    sc.note("sub", 65, 0, 16.4, midi("Ab1"), 0.9)
    sc.note("sub", 66, 0, 16.4, midi("Ab1"), 0.8)
    sc.note("sub", 67, 0, 22, midi("Eb2"), 0.45, release=1.2)
    sc.note("bell", 65, 0, 8, midi("Eb6"), 0.5)
    sc.note("bell", 66, 0, 8, midi("Cb6"), 0.45)
    for (pos, d), n in zip(mel.MOTIF_RHYTHM, mel.MOTIF_EB):
        sc.motif.append((at(67, pos), d * S16, midi(n), "bell"))
        sc.motif.append((at(68, pos), d * S16, midi(n) + 12, "musicbox"))
    for bar in (67, 68):
        for pos in range(0, 16, 2):
            sc.hit("tick", bar, pos, 0.42 - 0.1 * (bar - 67) - 0.012 * pos, tock=(pos // 2) % 2 == 1)
    sc.hit("chime", 69, 0, 1.0)
    sc.hit("endclick", 69, 0, 0.6)


# ======================================================================= vocal events


def lead(sc):
    for line, rows in mel.LINES:
        for i, (bar, pos, d, n, kana, rom) in enumerate(rows):
            m = midi(n)
            if rom in ("s", "q"):  # っ: listed at the pitch of the following mora
                m = midi(rows[i + 1][3])
            sc.lead.append(dict(t=at(bar, pos), dur=d * S16, midi=m, line=line, mora=kana, romaji=rom))
    for line, rows in mel.HARMONY:
        for bar, pos, d, n, kana, rom in rows:
            sc.harm.append(dict(t=at(bar, pos), dur=d * S16, midi=midi(n), line=line, mora=kana, romaji=rom))
