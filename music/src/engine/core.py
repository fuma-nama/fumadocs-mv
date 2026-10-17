"""Global constants, the 150 BPM grid, pitch helpers and the stereo track buffer."""

import numpy as np

SR = 48000
BPM = 150
BEAT = SR * 60 // BPM  # 19200 samples = 0.4 s
S16 = BEAT // 4  # 4800 samples = 0.1 s
BAR = BEAT * 4  # 76800 samples = 1.6 s
BARS = 68
SONG_END = BARS * BAR  # 108.8 s
TOTAL = SONG_END + int(2.4 * SR)  # 111.2 s file length

NOTE_NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def at(bar, pos16=0.0):
    """Sample index of a 1-indexed bar plus a 16th-note offset."""
    return int(round(((bar - 1) * 16 + pos16) * S16))


def sec(samples):
    return samples / SR


def midi(name):
    """'F#4' / 'Bb3' / 'Eb5' -> MIDI number (C4 = 60)."""
    if isinstance(name, (int, np.integer)):
        return int(name)
    letter = name[0].upper()
    rest = name[1:]
    acc = 0
    while rest and rest[0] in "#b":
        acc += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    return 12 * (int(rest) + 1) + NOTE_NAMES[letter] + acc


def hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=np.float64) - 69.0) / 12.0)


def db(x):
    return 10.0 ** (x / 20.0)


def pan_gains(pan):
    """Constant-power pan, pan in [-1, 1]."""
    a = (pan + 1.0) * np.pi / 4.0
    return np.cos(a), np.sin(a)


class Track:
    """A full-length stereo float32 buffer that notes are mixed into."""

    def __init__(self, name, n=TOTAL):
        self.name = name
        self.buf = np.zeros((2, n), np.float32)

    def add(self, start, audio, gain=1.0, pan=0.0):
        audio = np.asarray(audio)
        if audio.ndim == 1:
            gl, gr = pan_gains(pan)
            audio = np.stack([audio * gl, audio * gr])
        elif pan != 0.0:
            gl, gr = pan_gains(pan)
            audio = np.stack([audio[0] * gl * np.sqrt(2), audio[1] * gr * np.sqrt(2)])
        n = audio.shape[1]
        s0 = max(start, 0)
        s1 = min(start + n, self.buf.shape[1])
        if s1 <= s0:
            return
        self.buf[:, s0:s1] += (audio[:, s0 - start : s1 - start] * gain).astype(np.float32)
