"""Sample-accurate DSP kernels (numba): band-limited oscillators, filters, envelopes."""

import numpy as np
from numba import njit
from scipy import signal

from .core import SR


# ---------------------------------------------------------------- oscillators


@njit(cache=True)
def _blep(t, dt):
    if t < dt:
        x = t / dt
        return x + x - x * x - 1.0
    if t > 1.0 - dt:
        x = (t - 1.0) / dt
        return x * x + x + x + 1.0
    return 0.0


@njit(cache=True)
def saw(freq, phase):
    """PolyBLEP sawtooth, freq is a per-sample Hz array."""
    n = freq.shape[0]
    out = np.empty(n)
    p = phase
    for i in range(n):
        dt = freq[i] / SR
        out[i] = 2.0 * p - 1.0 - _blep(p, dt)
        p += dt
        while p >= 1.0:
            p -= 1.0
    return out


@njit(cache=True)
def pulse(freq, width, phase):
    """PolyBLEP pulse with per-sample width (0.5 = square). Output is DC-corrected."""
    n = freq.shape[0]
    out = np.empty(n)
    p = phase
    for i in range(n):
        dt = freq[i] / SR
        w = width[i]
        v = 1.0 if p < w else -1.0
        v += _blep(p, dt)
        q = p - w
        if q < 0.0:
            q += 1.0
        v -= _blep(q, dt)
        out[i] = v - (2.0 * w - 1.0)
        p += dt
        while p >= 1.0:
            p -= 1.0
    return out


def saw_hq(freq, phase=0.0, factor=4):
    """4x-oversampled PolyBLEP saw when the pitch is high enough to alias audibly (>400 Hz)."""
    if freq.max() < 400.0:
        return saw(freq, phase)
    y = saw(np.repeat(freq, factor) / factor, phase)
    return signal.resample_poly(y, 1, factor)[: len(freq)]


def pulse_hq(freq, width, phase=0.0, factor=4):
    if freq.max() < 400.0:
        return pulse(freq, width, phase)
    y = pulse(np.repeat(freq, factor) / factor, np.repeat(width, factor), phase)
    return signal.resample_poly(y, 1, factor)[: len(freq)]


def sine(freq, phase=0.0):
    ph = 2.0 * np.pi * np.cumsum(freq) / SR + phase
    return np.sin(ph)


def phase_of(freq, phase=0.0):
    return 2.0 * np.pi * np.cumsum(freq) / SR + phase


# ---------------------------------------------------------------- filters


@njit(cache=True)
def svf(x, fc, q, mode):
    """Topology-preserving state-variable filter (Simper). mode 0 lp, 1 bp (unity peak), 2 hp, 3 notch."""
    n = x.shape[0]
    y = np.empty(n)
    ic1 = 0.0
    ic2 = 0.0
    nyq = 0.49 * SR
    for i in range(n):
        f = fc[i]
        if f > nyq:
            f = nyq
        if f < 5.0:
            f = 5.0
        g = np.tan(np.pi * f / SR)
        k = 1.0 / q[i]
        a1 = 1.0 / (1.0 + g * (g + k))
        a2 = g * a1
        a3 = g * a2
        v3 = x[i] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        if mode == 0:
            y[i] = v2
        elif mode == 1:
            y[i] = k * v1
        elif mode == 2:
            y[i] = x[i] - k * v1 - v2
        else:
            y[i] = x[i] - k * v1
    return y


def lp(x, fc, q=0.707):
    return svf(np.ascontiguousarray(x, dtype=np.float64), _arr(fc, len(x)), _arr(q, len(x)), 0)


def bp(x, fc, q=1.0):
    return svf(np.ascontiguousarray(x, dtype=np.float64), _arr(fc, len(x)), _arr(q, len(x)), 1)


def hp(x, fc, q=0.707):
    return svf(np.ascontiguousarray(x, dtype=np.float64), _arr(fc, len(x)), _arr(q, len(x)), 2)


def lp4(x, fc, q=0.707):
    """24 dB/oct low-pass (two SVF stages, resonance on the second)."""
    return lp(lp(x, fc, 0.54), fc, q)


def hp4(x, fc):
    return hp(hp(x, fc, 0.54), fc, 1.31)


def _arr(v, n):
    if np.isscalar(v):
        return np.full(n, float(v))
    return np.ascontiguousarray(v, dtype=np.float64)


@njit(cache=True)
def onepole_lp(x, coef):
    n = x.shape[0]
    y = np.empty(n)
    s = 0.0
    for i in range(n):
        s += (1.0 - coef) * (x[i] - s)
        y[i] = s
    return y


@njit(cache=True)
def follow(x, att, rel):
    """Causal attack/release envelope follower (coefficients per sample)."""
    n = x.shape[0]
    y = np.empty(n)
    s = 0.0
    for i in range(n):
        c = att if x[i] > s else rel
        s += (1.0 - c) * (x[i] - s)
        y[i] = s
    return y


def onepole_coef(fc):
    return float(np.exp(-2.0 * np.pi * fc / SR))


@njit(cache=True)
def resonator(x, fc, bw):
    """Unity-peak two-pole band-pass resonator with per-sample centre/bandwidth."""
    n = x.shape[0]
    y = np.empty(n)
    y1 = 0.0
    y2 = 0.0
    for i in range(n):
        r = np.exp(-np.pi * bw[i] / SR)
        c = 2.0 * r * np.cos(2.0 * np.pi * fc[i] / SR)
        g = (1.0 - r * r) * 0.5
        v = g * x[i] + c * y1 - r * r * y2
        y2 = y1
        y1 = v
        y[i] = v
    return y


# ---------------------------------------------------------------- biquads (static, scipy)


def _sos_peak(f, gain_db, q):
    a = 10 ** (gain_db / 40)
    w = 2 * np.pi * f / SR
    al = np.sin(w) / (2 * q)
    b = [1 + al * a, -2 * np.cos(w), 1 - al * a]
    aa = [1 + al / a, -2 * np.cos(w), 1 - al / a]
    return np.array([[b[0] / aa[0], b[1] / aa[0], b[2] / aa[0], 1.0, aa[1] / aa[0], aa[2] / aa[0]]])


def _sos_shelf(f, gain_db, high, s=1.0):
    a = 10 ** (gain_db / 40)
    w = 2 * np.pi * f / SR
    cw = np.cos(w)
    al = np.sin(w) / 2 * np.sqrt((a + 1 / a) * (1 / s - 1) + 2)
    sa = 2 * np.sqrt(a) * al
    if high:
        b = [a * ((a + 1) + (a - 1) * cw + sa), -2 * a * ((a - 1) + (a + 1) * cw), a * ((a + 1) + (a - 1) * cw - sa)]
        aa = [(a + 1) - (a - 1) * cw + sa, 2 * ((a - 1) - (a + 1) * cw), (a + 1) - (a - 1) * cw - sa]
    else:
        b = [a * ((a + 1) - (a - 1) * cw + sa), 2 * a * ((a - 1) - (a + 1) * cw), a * ((a + 1) - (a - 1) * cw - sa)]
        aa = [(a + 1) + (a - 1) * cw + sa, -2 * ((a - 1) + (a + 1) * cw), (a + 1) + (a - 1) * cw - sa]
    return np.array([[b[0] / aa[0], b[1] / aa[0], b[2] / aa[0], 1.0, aa[1] / aa[0], aa[2] / aa[0]]])


def eq(x, bands):
    """Static EQ. bands: list of ('hp'|'lp', f, order) / ('peak', f, dB, q) / ('low'|'high', f, dB)."""
    sos = []
    for b in bands:
        kind = b[0]
        if kind == "hp":
            sos.append(signal.butter(b[2] if len(b) > 2 else 2, b[1], "highpass", fs=SR, output="sos"))
        elif kind == "lp":
            sos.append(signal.butter(b[2] if len(b) > 2 else 2, b[1], "lowpass", fs=SR, output="sos"))
        elif kind == "peak":
            sos.append(_sos_peak(b[1], b[2], b[3]))
        elif kind == "low":
            sos.append(_sos_shelf(b[1], b[2], False))
        elif kind == "high":
            sos.append(_sos_shelf(b[1], b[2], True))
    if not sos:
        return x
    sos = np.concatenate(sos)
    return signal.sosfilt(sos, x, axis=-1)


# ---------------------------------------------------------------- envelopes


@njit(cache=True)
def adsr(n, gate, a, d, s, r):
    """ADSR in samples-domain: a/d/r in seconds, gate = note-on length in samples.
    Attack is a raised-cosine ramp, decay/release are exponential (-60 dB over the given time)."""
    env = np.zeros(n)
    na = max(int(a * SR), 16)
    kd = np.exp(-6.9 / max(d * SR, 1.0))
    kr = np.exp(-6.9 / max(r * SR, 1.0))
    level = 0.0
    for i in range(n):
        if i < gate:
            if i < na:
                level = 0.5 - 0.5 * np.cos(np.pi * (i + 1) / na)
            else:
                level = s + (level - s) * kd
        else:
            level *= kr
        env[i] = level
    return env


def fade(x, fin=0.002, fout=0.005):
    """Short raised-cosine fades to kill clicks at buffer boundaries."""
    n = x.shape[-1]
    a = min(int(fin * SR), n // 2)
    b = min(int(fout * SR), n // 2)
    if a > 0:
        x[..., :a] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
    if b > 0:
        x[..., n - b :] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, b))
    return x


def exp_decay(n, t60):
    return np.exp(-6.9 * np.arange(n) / (t60 * SR))


def ramp(n, a, b, curve=1.0):
    t = np.linspace(0.0, 1.0, n)
    return a + (b - a) * t**curve


# ---------------------------------------------------------------- nonlinearities


def oversampled(fn, x, factor=4):
    up = signal.resample_poly(x, factor, 1, axis=-1)
    return signal.resample_poly(fn(up), 1, factor, axis=-1)


def softclip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def noise(n, seed):
    return np.random.default_rng(seed).standard_normal(n)
