"""Formant singer: a PolyBLEP glottal saw through a 5-formant Klatt cascade whose targets morph per
mora vowel, with a parallel frication branch for consonants, plosive bursts, nasal murmur, flaps,
glides, portamento, phrase scoops and delayed vibrato.

Every mora is placed so that its vowel starts exactly on the grid time; consonants are articulated
just before it (as a singer does)."""

from dataclasses import dataclass

import numpy as np
from numba import njit
from scipy import ndimage, signal

from .core import SR, hz
from . import dsp

CUTE = 1.1  # formant scale (smaller vocal tract)
F1_TUNE = 0.8  # F1 never sits far below f0 (soprano formant tuning)
VOWELS = {
    "a": (800, 1250, 2600),
    "i": (320, 2300, 3000),
    "u": (350, 1250, 2300),
    "e": (500, 1900, 2500),
    "o": (500, 850, 2400),
    "n": (250, 1600, 2500),
}
F45 = (3700.0, 4700.0)
BW_VOWEL = (110.0, 120.0, 160.0, 230.0, 300.0)
BW_NASAL = (110.0, 320.0, 420.0, 400.0, 500.0)

# consonant articulation (seconds before the vowel onset etc.)
CONS = {
    "k": dict(kind="stop", clo=0.034, asp=0.016, bf=2400.0, bb=1600.0, bg=0.9),
    "ky": dict(kind="stop", clo=0.034, asp=0.016, bf=3100.0, bb=1800.0, bg=0.9, glide="i"),
    "t": dict(kind="stop", clo=0.030, asp=0.010, bf=4300.0, bb=3000.0, bg=0.8),
    "p": dict(kind="stop", clo=0.032, asp=0.012, bf=1000.0, bb=1600.0, bg=0.8),
    "b": dict(kind="vstop", clo=0.030, bf=900.0, bb=1200.0, bg=0.35),
    "d": dict(kind="vstop", clo=0.026, bf=3400.0, bb=2600.0, bg=0.35),
    "g": dict(kind="vstop", clo=0.030, bf=2200.0, bb=1600.0, bg=0.35),
    "s": dict(kind="fric", dur=0.075, ff=6800.0, fb=3600.0, amp=0.22),
    "sh": dict(kind="fric", dur=0.080, ff=3700.0, fb=2400.0, amp=0.27),
    "h": dict(kind="fric", dur=0.060, ff=4000.0, fb=3000.0, amp=0.18, asp=0.4),
    "f": dict(kind="fric", dur=0.060, ff=1700.0, fb=2800.0, amp=0.2, asp=0.3),
    "ch": dict(kind="affr", clo=0.022, dur=0.050, ff=3800.0, fb=2400.0, amp=0.28),
    "j": dict(kind="vaffr", dur=0.050, ff=3600.0, fb=2400.0, amp=0.18),
    "m": dict(kind="nasal", dur=0.050, locus=(270, 1100, 2400)),
    "n": dict(kind="nasal", dur=0.045, locus=(270, 1700, 2600)),
    "r": dict(kind="flap", dur=0.022, locus=(380, 1600, 2050)),
    "y": dict(kind="glide", dur=0.045, locus="i"),
    "w": dict(kind="glide", dur=0.040, locus=(380, 760, 2300)),
}
SPECIAL = {"shi": ("sh", "i"), "chi": ("ch", "i"), "ji": ("j", "i"), "kyu": ("ky", "u"), "fu": ("f", "u"), "wo": ("w", "o")}


def parse(romaji):
    """romaji -> (consonant or '', vowel). 'n' alone = ん, 's'/'q' alone = っ (vowel '-')."""
    r = romaji.lower()
    if r in ("s", "q", "xtsu"):
        return "Q", "-"
    if r == "n":
        return "N", "n"
    if r in SPECIAL:
        return SPECIAL[r]
    if r in VOWELS:
        return "", r
    return r[:-1], r[-1]


@dataclass
class Syl:
    t: int  # onset sample (vowel on the grid)
    dur: int  # samples
    midi: float
    romaji: str
    vel: float = 1.0


def _formants(v, f0):
    f1, f2, f3 = VOWELS[v]
    f1, f2, f3 = f1 * CUTE, f2 * CUTE, f3 * CUTE
    f1 = max(f1, F1_TUNE * f0) if v != "n" else f1
    f2 = max(f2, f1 + 250)
    return np.array([f1, f2, f3, F45[0], F45[1]])


def _locus(spec, f0):
    if isinstance(spec, str):
        return _formants(spec, f0)
    f1, f2, f3 = spec
    return np.array([f1 * CUTE, f2 * CUTE, f3 * CUTE, F45[0], F45[1]])


@njit(cache=True)
def _kernel(f0, av, ah, af, ff, fb, nas, F, B, n1, n2, phase, sr):
    n = f0.shape[0]
    out = np.empty(n)
    fo = np.empty(n)
    so = np.empty(n)
    p = phase
    y1 = np.zeros(5)
    y2 = np.zeros(5)
    lc = np.exp(-2.0 * np.pi * 900.0 / sr)
    l1 = 0.0
    l2 = 0.0
    fy1 = 0.0
    fy2 = 0.0
    T = 1.0 / sr
    for i in range(n):
        dt = f0[i] * T
        if p < dt:
            x0 = p / dt
            bl = x0 + x0 - x0 * x0 - 1.0
        elif p > 1.0 - dt:
            x0 = (p - 1.0) / dt
            bl = x0 * x0 + x0 + x0 + 1.0
        else:
            bl = 0.0
        s = 2.0 * p - 1.0 - bl
        p += dt
        if p >= 1.0:
            p -= 1.0
        x = s * av[i] + n1[i] * ah[i]
        so[i] = s * av[i]
        for k in range(5):
            bw = B[k, i]
            fr = F[k, i]
            C = -np.exp(-2.0 * np.pi * bw * T)
            Bc = 2.0 * np.exp(-np.pi * bw * T) * np.cos(2.0 * np.pi * fr * T)
            A = 1.0 - Bc - C
            v = A * x + Bc * y1[k] + C * y2[k]
            y2[k] = y1[k]
            y1[k] = v
            x = v
        l1 += (1.0 - lc) * (x - l1)
        l2 += (1.0 - lc) * (l1 - l2)
        y = x * (1.0 - nas[i]) + l2 * nas[i] * 1.3
        r = np.exp(-np.pi * fb[i] * T)
        c = 2.0 * r * np.cos(2.0 * np.pi * ff[i] * T)
        g = (1.0 - r * r) * 0.5
        fv = g * n2[i] + c * fy1 - r * r * fy2
        fy2 = fy1
        fy1 = fv
        out[i] = y
        fo[i] = fv * af[i]
    return out, fo, so


FR = 48  # control frame = 1 ms
TILT = (4000.0, 12000.0)
AIR = 0.8


def tilt(x, f1, f2):
    """First-order shelf: unity below f1, +6 dB/oct between f1 and f2, +20log10(f2/f1) dB above."""
    w1, w2 = 2 * np.pi * f1, 2 * np.pi * f2
    b, a = signal.bilinear([w2 / w1, w2], [1.0, w2], SR)
    return signal.lfilter(b, a, x)


def cascade_gain(F, B, f0):
    """RMS gain of the formant cascade for a 1/k harmonic source at f0 (per control frame)."""
    T = 1.0 / SR
    k = np.arange(1, 48)[:, None]
    f = k * f0[None, :]
    z1 = np.exp(-2j * np.pi * f * T)
    z2 = z1 * z1
    H = np.ones(f.shape, complex)
    for i in range(5):
        C = -np.exp(-2 * np.pi * B[i] * T)
        Bc = 2 * np.exp(-np.pi * B[i] * T) * np.cos(2 * np.pi * F[i] * T)
        A = 1 - Bc - C
        H *= A / (1 - Bc * z1 - C * z2)
    amp = np.abs(H) / k * (f < 6000)
    return np.sqrt(np.sum(amp**2, axis=0))


_REF = None


def ref_gain():
    global _REF
    if _REF is None:
        F = _formants("e", 440.0)[:, None]
        B = np.array(BW_VOWEL)[:, None]
        _REF = float(cascade_gain(F, B, np.array([440.0]))[0])
    return _REF


class Phrase:
    """Control tracks for one legato phrase, built at 1 ms resolution."""

    def __init__(self, syls, pre, post):
        self.t0 = syls[0].t - pre
        self.t1 = syls[-1].t + syls[-1].dur + post
        self.k = (self.t1 - self.t0) // FR + 2
        k = self.k
        self.F = np.zeros((5, k))
        self.B = np.tile(np.array(BW_VOWEL)[:, None], (1, k))
        self.av = np.zeros(k)
        self.ah = np.zeros(k)
        self.af = np.zeros(k)
        self.ff = np.full(k, 4000.0)
        self.fb = np.full(k, 2500.0)
        self.nas = np.zeros(k)
        self.f0 = np.zeros(k)
        self.gate = np.zeros(k)
        self.bursts = []

    def i(self, s):
        return int(np.clip((s - self.t0) // FR, 0, self.k - 1))

    def span(self, a, b):
        return slice(self.i(a), max(self.i(b), self.i(a) + 1))


def _sec(x):
    return int(x * SR)


def build_phrase(syls, scoop=0.55, vib_depth=0.28, vib_rate=5.8, port=0.045, drift_seed=0, fall=0.4, level_comp=0.8):
    pre = _sec(0.16)
    post = _sec(0.12)
    ph = Phrase(syls, pre, post)
    K = ph.k
    parsed = [parse(s.romaji) for s in syls]

    # ---------------- pitch
    f0m = np.full(K, float(syls[0].midi))
    for s in syls[1:]:
        f0m[ph.i(s.t):] = s.midi
    # portamento: smooth transitions around each onset
    pm = f0m.copy()
    for j in range(1, len(syls)):
        s, p = syls[j], syls[j - 1]
        if s.midi == p.midi:
            continue
        legato = s.t - (p.t + p.dur) < _sec(0.03)
        g = port if legato else 0.03
        a = ph.i(s.t - _sec(g * 0.45))
        b = ph.i(s.t + _sec(g * 0.55))
        if b <= a:
            continue
        x = np.linspace(0, 1, b - a)
        sm = x * x * (3 - 2 * x)
        pm[a:b] = p.midi + (s.midi - p.midi) * sm
        # light overshoot on upward leaps
        if s.midi - p.midi >= 4:
            ob = min(b + 60, K)
            pm[b:ob] += 0.18 * np.sin(np.linspace(0, np.pi, ob - b))
    # phrase-initial scoop
    a = ph.i(syls[0].t)
    ns = 70
    pm[max(a - 30, 0):a] -= scoop
    pm[a:a + ns] -= scoop * (1 - np.linspace(0, 1, len(pm[a:a + ns]))) ** 2
    # vibrato on long notes
    vib = np.zeros(K)
    for j, s in enumerate(syls):
        d = s.dur / SR
        if d < 0.3:
            continue
        a = ph.i(s.t + _sec(0.15))
        b = ph.i(s.t + s.dur)
        if b - a < 40:
            continue
        x = np.arange(b - a) / 1000.0
        depth = vib_depth * np.minimum(1.0, x / 0.25)
        depth *= np.minimum(1.0, (b - a - np.arange(b - a)) / 40.0)
        vib[a:b] = depth * np.sin(2 * np.pi * vib_rate * x)
    # end-of-phrase fall
    e = ph.i(syls[-1].t + syls[-1].dur)
    fe = min(e + 80, K)
    pm[e:fe] -= fall * np.linspace(0, 1, fe - e) ** 2
    pm[fe:] -= fall
    drift = ndimage.gaussian_filter1d(np.random.default_rng(drift_seed).standard_normal(K), 60)
    drift *= 0.04 / (drift.std() + 1e-9)
    ph.f0 = hz(pm + vib + drift)

    # ---------------- articulation
    vowels = []  # (frame_a, frame_b, formants, is_nasal)
    loci = []  # consonant loci painted over the vowels
    for j, s in enumerate(syls):
        c, v = parsed[j]
        f0 = float(hz(s.midi))
        end = s.t + s.dur
        prev = syls[j - 1] if j > 0 else None
        prev_v = parsed[j - 1][1] if j > 0 else None
        gap_before = (s.t - (prev.t + prev.dur)) if prev is not None else 10**9
        legato = gap_before < _sec(0.03)
        room = (s.t - prev.t) if prev is not None else _sec(0.4)
        lim = 0.5 * room / SR if legato else 0.2  # time the consonant may borrow before the onset
        vel = s.vel

        if c == "Q":  # っ: closure, voicing off
            ph.av[ph.span(s.t, end)] = 0.0
            ph.gate[ph.span(s.t, end)] = 0.0
            continue
        nasal_mora = v == "n"
        vowels.append((ph.i(s.t), ph.i(end), _formants(v, f0), nasal_mora))
        ph.av[ph.span(s.t, end)] = (0.62 if nasal_mora else 1.0) * vel
        ph.gate[ph.span(s.t, end)] = 1.0
        if nasal_mora:
            continue
        if c == "":
            if prev is not None and legato:
                dip = 0.82 if prev_v == v else 0.68
                ph.av[ph.span(s.t - _sec(0.012), s.t + _sec(0.012))] *= dip
            continue
        spec = CONS[c]
        kind = spec["kind"]
        if kind in ("stop", "vstop"):
            asp = spec.get("asp", 0.006)
            clo = spec["clo"]
            tot = min(clo + asp, max(lim, 0.022))
            sc = tot / (clo + asp)
            clo *= sc
            asp *= sc
            cs = s.t - _sec(clo + asp)
            bt = s.t - _sec(asp)
            if kind == "stop":
                ph.av[ph.span(cs, s.t)] = 0.0
                ph.ah[ph.span(bt, s.t)] = 0.5 * vel
            else:
                ph.av[ph.span(cs, bt)] = 0.16 * vel
                ph.nas[ph.span(cs, bt)] = 0.9
                ph.av[ph.span(bt, s.t)] = 0.5 * vel
            ph.bursts.append((bt, spec["bf"], spec["bb"], spec["bg"] * vel))
            if spec.get("glide"):
                loci.append((ph.i(cs), ph.i(s.t + _sec(0.02)), _formants(spec["glide"], f0), False))
        elif kind in ("fric", "affr", "vaffr"):
            dur = min(spec["dur"], max(lim, 0.035))
            if j > 0 and parsed[j - 1][0] == "Q":  # geminate after っ: long frication
                dur = max(dur, (s.t - syls[j - 1].t) / SR - 0.02)
            fs = s.t - _sec(dur)
            if kind == "affr":
                clo = min(spec["clo"], 0.3 * dur)
                ph.av[ph.span(fs - _sec(clo), s.t)] = 0.0
                ph.bursts.append((fs, 3800.0, 2500.0, 0.5 * vel))
            elif kind == "vaffr":
                ph.av[ph.span(fs, s.t)] = 0.25 * vel
                ph.nas[ph.span(fs, s.t - _sec(0.02))] = 0.6
            else:
                ph.av[ph.span(fs, s.t)] = 0.0
            sl = ph.span(fs, s.t + _sec(0.004))
            nfr = sl.stop - sl.start
            shape = np.sin(np.linspace(0.15, 1.0, nfr) * np.pi / 2) ** 1.5
            m = min(6, nfr)
            shape[nfr - m:] *= np.linspace(1, 0, m)
            ph.af[sl] = np.maximum(ph.af[sl], spec["amp"] * vel * shape)
            ph.ff[sl] = spec["ff"]
            ph.fb[sl] = spec["fb"]
            if spec.get("asp"):
                ph.ah[sl] = np.maximum(ph.ah[sl], spec["asp"] * vel * shape)
        elif kind == "nasal":
            dur = min(spec["dur"], max(lim, 0.025))
            ns = s.t - _sec(dur)
            ph.av[ph.span(ns, s.t)] = 0.55 * vel
            loci.append((ph.i(ns), ph.i(s.t), _locus(spec["locus"], f0), True))
        elif kind == "flap":
            dur = min(spec["dur"], max(lim, 0.014))
            fs = s.t - _sec(dur)
            ph.av[ph.span(fs, s.t)] *= 0.42
            loci.append((ph.i(fs), ph.i(s.t), _locus(spec["locus"], f0), False))
        elif kind == "glide":
            loci.append((ph.i(s.t - _sec(0.015)), ph.i(s.t + _sec(spec["dur"] * 0.45)), _locus(spec["locus"], f0), False))

    # pass 1: vowels hold until the next vowel starts; pass 2: consonant loci on top
    bw_n = np.array(BW_NASAL)[:, None]
    for idx, (a, b, fvec, nasal) in enumerate(vowels):
        nb = vowels[idx + 1][0] if idx + 1 < len(vowels) else K
        ph.F[:, a:nb] = fvec[:, None]
        if nasal:
            ph.B[:, a:b + 1] = bw_n
            ph.nas[a:b + 1] = 1.0
    if vowels:
        ph.F[:, : vowels[0][0]] = vowels[0][2][:, None]
    for a, b, fvec, nasal in loci:
        ph.F[:, a:b + 1] = fvec[:, None]
        if nasal:
            ph.B[:, a:b + 1] = bw_n
            ph.nas[a:b + 1] = 1.0

    ph.F = ndimage.gaussian_filter1d(ph.F, 9.0, axis=1, mode="nearest")
    ph.B = ndimage.gaussian_filter1d(ph.B, 6.0, axis=1, mode="nearest")
    ph.nas = ndimage.gaussian_filter1d(ph.nas, 7.0, mode="nearest")

    # amplitude: soft onset from the phrase's first voiced frame (20 ms after a vowel / voiced consonant,
    # 8 ms after a voiceless one), release tail, smoothing
    voiced = np.nonzero(ph.av > 0.01)[0]
    if len(voiced):
        v0 = int(voiced[0])
        c0 = parse(syls[0].romaji)[0]
        na = min(8 if c0 in ("k", "ky", "t", "p", "s", "sh", "h", "f", "ch") else 20, K - v0)
        ph.av[v0:v0 + na] *= np.linspace(0.0, 1.0, na) ** 1.5
    e = ph.i(syls[-1].t + syls[-1].dur)
    tail = ph.av[max(e - 1, 0)]
    ph.av[e:] = 0.0
    rel = min(45, K - e)
    ph.av[e:e + rel] = tail * np.linspace(1, 0, rel) ** 2
    comp = (ref_gain() / cascade_gain(ph.F, ph.B, ph.f0)) ** level_comp
    ph.av *= ndimage.gaussian_filter1d(comp, 8.0, mode="nearest")
    ph.av = ndimage.gaussian_filter1d(ph.av, 2.5, mode="nearest")
    ph.ah = ndimage.gaussian_filter1d(ph.ah, 2.0, mode="nearest")
    ph.af = ndimage.gaussian_filter1d(ph.af, 1.5, mode="nearest")
    ph.gate = ndimage.gaussian_filter1d(ph.gate, 4.0, mode="nearest")
    return ph


def _up(x, n):
    """Control frames -> audio rate (linear)."""
    k = x.shape[-1]
    src = np.arange(k) * FR
    dst = np.arange(n)
    if x.ndim == 1:
        return np.interp(dst, src, x)
    return np.stack([np.interp(dst, src, r) for r in x])


def render_phrase(ph, seed=0, breath=0.0, os=2):
    """Synthesise one phrase at os x the sample rate (alias-free glottal saw), then decimate."""
    n = ph.t1 - ph.t0
    m = n * os
    src = np.arange(ph.k) * FR * os
    dst = np.arange(m)

    def up(x):
        if x.ndim == 1:
            return np.interp(dst, src, x)
        return np.stack([np.interp(dst, src, r) for r in x])

    f0, av, ah, af = up(ph.f0), up(ph.av), up(ph.ah), up(ph.af)
    ff, fb, nas, F, B = up(ph.ff), up(ph.fb), up(ph.nas), up(ph.F), up(ph.B)
    rng = np.random.default_rng(seed)
    n1 = rng.standard_normal(m) * 0.5
    n2 = rng.standard_normal(m)
    ph_cycle = (np.cumsum(f0) / (SR * os)) % 1.0
    ah = ah + breath * av * (0.4 + 0.6 * (ph_cycle < 0.4))
    y, fr, srcw = _kernel(f0, av, ah, af * 3.2, ff, fb, nas, F, B, n1, n2, rng.random(), float(SR * os))
    y = signal.resample_poly(y, 1, os)[:n]
    fr = signal.resample_poly(fr, 1, os)[:n] * np.sqrt(os)
    srcw = signal.resample_poly(srcw, 1, os)[:n]
    # higher-pole correction: radiation tilt and a parallel 'air' path from the glottal source above the last formant
    y = tilt(y, TILT[0], TILT[1])
    y = y + AIR * dsp.lp(dsp.hp(dsp.hp(srcw, 4200.0, 0.6), 4200.0, 0.6), 8500.0, 0.6)
    y = y + dsp.hp(dsp.hp(fr, 1700.0, 0.6), 1700.0, 0.6)
    for bt, bf, bb, bg in ph.bursts:
        a = bt - ph.t0
        k = int(0.012 * SR)
        if a < 0 or a + k > n:
            continue
        tt = np.arange(k) / SR
        bn = dsp.resonator(rng.standard_normal(k), np.full(k, bf), np.full(k, bb)) * 2.2
        bn += dsp.hp(rng.standard_normal(k), 1500.0) * 0.3
        y[a:a + k] += bn * np.exp(-tt / 0.0035) * bg * np.minimum(1, tt / 0.0004)
    y = dsp.hp(y, 110.0)
    return dsp.fade(y, 0.002, 0.01), _up(ph.gate, n), _up(ph.f0, n)


def split_phrases(syls, max_gap=0.12):
    out = []
    cur = []
    for s in syls:
        if cur:
            p = cur[-1]
            gap = s.t - (p.t + p.dur)
            if gap > max_gap * SR and parse(p.romaji)[0] != "Q":
                out.append(cur)
                cur = []
        cur.append(s)
    if cur:
        out.append(cur)
    return out


def sing(syls, total_n, seed=0, breath=0.05, **kw):
    """Render a whole vocal line. Returns (voice, gate, f0) as full-length arrays."""
    voice = np.zeros(total_n)
    gate = np.zeros(total_n)
    f0 = np.zeros(total_n)
    for pi, phr in enumerate(split_phrases(syls)):
        ph = build_phrase(phr, drift_seed=seed + pi, **kw)
        y, g, f = render_phrase(ph, seed=seed + 101 * pi, breath=breath)
        a = ph.t0
        b = min(a + len(y), total_n)
        voice[a:b] += y[: b - a]
        gate[a:b] = np.maximum(gate[a:b], g[: b - a])
        sel = f[: b - a]
        f0[a:b] = np.where(g[: b - a] > 0.01, sel, f0[a:b])
    return voice, gate, f0
