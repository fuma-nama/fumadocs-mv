"""Pitched instruments. Every function returns a float64 array (mono (n,) or stereo (2, n))
starting at the note onset; envelopes always start and end at zero."""

import numpy as np
from scipy import signal

from .core import SR, hz
from . import dsp


def _t(n):
    return np.arange(n) / SR


def _rng(seed):
    return np.random.default_rng(seed)


def saw_os(freq, phase=0.0, factor=2):
    """Oversampled PolyBLEP saw for bright, high voices (cleaner top octave)."""
    f = np.repeat(freq, factor) if factor > 1 else freq
    y = dsp.saw(f / factor, phase)
    if factor == 1:
        return y
    return signal.resample_poly(y, 1, factor)


# ---------------------------------------------------------------- keys


def epiano(m, dur, vel=0.8, bright=1.0, seed=0):
    """FM electric piano (1:1 body pair + 14:1 tine pair), Rhodes-like."""
    f = float(hz(m))
    rel = 0.28
    n = int((dur + rel) * SR)
    gate = int(dur * SR)
    t = _t(n)
    ph = 2 * np.pi * f * t + _rng(seed).random() * 2 * np.pi
    keyscale = np.clip((m - 48) / 36, 0, 1)
    idx = (0.35 + 1.5 * vel * bright) * np.exp(-t / (0.5 - 0.25 * keyscale)) + 0.18 * vel
    body = np.sin(ph + idx * np.sin(ph))
    body2 = np.sin(ph * 1.0019 + 0.7 * idx * np.sin(ph * 1.0019))
    tine_amp = (0.35 * vel * bright) * np.exp(-t / 0.045)
    tine = np.sin(ph + 1.6 * np.exp(-t / 0.03) * np.sin(14 * ph)) * tine_amp
    y = 0.6 * body + 0.4 * body2 + tine
    env = dsp.adsr(n, gate, 0.0015, 2.2 - 1.2 * keyscale, 0.0, rel)
    env = np.maximum(env, 0.0)
    return y * env * (0.55 + 0.45 * vel)


def supersaw(ms, dur, attack=0.02, decay=0.6, sustain=0.8, release=0.35, voices=7, detune=0.22,
             cutoff=5000.0, cutoff_env=0.0, env_decay=0.3, q=0.8, pitch_env=None, spread=0.9,
             seed=0, sub_oct=0.0, os=4):
    """Detuned saw stack per chord note with stereo spread; returns (2, n)."""
    rng = _rng(seed)
    n = int((dur + release) * SR)
    gate = int(dur * SR)
    out = np.zeros((2, n))
    offs = np.linspace(-1, 1, voices)
    weights = 1.0 - 0.35 * np.abs(offs)
    pans = offs * spread
    rng.shuffle(pans)
    for m in ms:
        f = float(hz(m))
        for v in range(voices):
            det = offs[v] * detune + 0.01 * rng.standard_normal()
            fv = np.full(n, f * 2 ** (det / 12))
            if pitch_env is not None:
                fv = fv * pitch_env[:n]
            s = saw_os(fv, rng.random(), os) if os > 1 else dsp.saw(fv, rng.random())
            gl, gr = np.cos((pans[v] + 1) * np.pi / 4), np.sin((pans[v] + 1) * np.pi / 4)
            out[0] += s * gl * weights[v]
            out[1] += s * gr * weights[v]
        if sub_oct > 0:
            s = dsp.saw(np.full(n, f / 2), rng.random()) * sub_oct
            out += s * 0.7
    out /= np.sqrt(voices * len(ms))
    t = _t(n)
    fc = cutoff * (1.0 + cutoff_env * np.exp(-t / env_decay))
    out[0] = dsp.lp(out[0], fc, q)
    out[1] = dsp.lp(out[1], fc, q)
    env = dsp.adsr(n, gate, attack, decay, sustain, release)
    return out * env


def pluck(m, dur, vel=0.8, bright=1.0, decay=0.18, seed=0, width=0.35, fm=0.0):
    """Saw + pulse through a 24 dB low-pass with a fast filter envelope (arp / stabs)."""
    f = float(hz(m))
    rel = 0.06
    n = int((dur + rel) * SR)
    gate = int(dur * SR)
    t = _t(n)
    rng = _rng(seed)
    fv = np.full(n, f)
    y = 0.55 * dsp.saw_hq(fv, rng.random()) + 0.45 * dsp.pulse_hq(fv, np.full(n, width), rng.random())
    y += 0.3 * dsp.saw_hq(fv * 1.006, rng.random())
    if fm > 0:
        y += fm * np.sin(2 * np.pi * f * t + 2.0 * np.exp(-t / 0.08) * np.sin(2 * np.pi * 3 * f * t))
    fc = 180 + f * 1.2 + bright * 7000 * vel * np.exp(-t / decay)
    y = dsp.lp4(y, fc, 0.9)
    env = dsp.adsr(n, gate, 0.0012, decay * 3.0, 0.0, rel)
    return y * env * (0.4 + 0.6 * vel)


def bell(m, dur=1.5, vel=0.8, ratio=3.5, index=2.2, t60=2.2, seed=0, shimmer=0.0, damp=1.4):
    """Glassy two-pair FM bell."""
    f = float(hz(m))
    n = int((dur + t60) * SR)
    t = _t(n)
    rng = _rng(seed)
    p0 = rng.random() * 2 * np.pi
    ph = 2 * np.pi * f * t + p0
    I = index * vel * np.exp(-t / (0.18 + 0.1 * vel))
    a = np.sin(ph + I * np.sin(ratio * ph))
    b = np.sin(2.0 * ph + 0.8 * np.exp(-t / 0.4) * np.sin(ph * 1.0007))
    y = 0.75 * a * np.exp(-6.9 * t / t60) + 0.25 * b * np.exp(-6.9 * t / (t60 * 0.55))
    if shimmer > 0:
        y += shimmer * np.sin(4.0 * ph * 1.0011) * np.exp(-6.9 * t / (t60 * 0.3))
    y *= np.minimum(1.0, t / 0.0015)
    gate = int(dur * SR)
    if gate < n:  # gentle damping after the note (a held bell keeps ringing, a short one rings out softly)
        tail = np.ones(n)
        k = n - gate
        tail[gate:] = np.exp(-6.9 * np.arange(k) / (damp * SR))
        y *= tail
    return dsp.fade(y * vel, 0.0005, 0.02)


def music_box(m, vel=0.8, t60=2.6, seed=0):
    """Cantilever-tine model: fundamental + 6.27x / 17.55x modes + tiny pluck click."""
    f = float(hz(m))
    n = int(t60 * 1.05 * SR)
    t = _t(n)
    rng = _rng(seed)
    y = np.sin(2 * np.pi * f * t + rng.random()) * np.exp(-6.9 * t / t60)
    y += 0.45 * np.sin(2 * np.pi * f * 1.0012 * t + rng.random()) * np.exp(-6.9 * t / (t60 * 0.8))  # paired tooth
    y += 0.30 * np.sin(2 * np.pi * f * 6.267 * t) * np.exp(-6.9 * t / (t60 * 0.18))
    y += 0.10 * np.sin(2 * np.pi * f * 17.55 * t) * np.exp(-6.9 * t / (t60 * 0.05))
    y += 0.06 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-6.9 * t / (t60 * 0.4))
    click = dsp.hp(dsp.noise(n, seed), 3000.0) * np.exp(-t / 0.0015) * 0.15
    y = (y + click) * np.minimum(1.0, t / 0.0008) / 1.3
    return dsp.fade(y * vel, 0.0003, 0.05)


# ---------------------------------------------------------------- bass


def glide_freq(n, m_from, m_to, glide_s):
    """Per-sample frequency with an exponential glide from m_from to m_to."""
    t = _t(n)
    if m_from is None or glide_s <= 0:
        return np.full(n, float(hz(m_to)))
    mm = m_to + (m_from - m_to) * np.exp(-t / (glide_s / 3))
    return hz(mm)


def sub_bass(freq, gate, vel=1.0, attack=0.004, release=0.03, drive=1.6):
    n = len(freq)
    ph = dsp.phase_of(freq)
    y = np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    y = np.tanh(y * drive) / np.tanh(drive)
    env = dsp.adsr(n, gate, attack, 0.5, 1.0, release)
    return y * env * vel


def mid_bass(freq, gate, vel=1.0, cutoff=500.0, env_amt=4.0, decay=0.12, q=1.1, drive=2.0, seed=0, release=0.04):
    n = len(freq)
    rng = _rng(seed)
    t = _t(n)
    y = 0.5 * dsp.saw(freq * 1.004, rng.random()) + 0.5 * dsp.saw(freq * 0.996, rng.random())
    y += 0.4 * dsp.pulse(freq, np.full(n, 0.5), rng.random())
    fc = cutoff * (1 + env_amt * vel * np.exp(-t / decay))
    y = dsp.lp4(y, fc, q)
    y = dsp.oversampled(lambda u: np.tanh(u * drive), y, 2) / np.tanh(drive)
    env = dsp.adsr(n, gate, 0.002, 0.4, 0.85, release)
    return y * env * vel


def growl(freq, gate, lfo_hz, vel=1.0, seed=0, vowel_lo=350.0, vowel_hi=1900.0, index=2.6, release=0.05):
    """FM + waveshaper + swept band-pass 'wub' bass for the drop (sub handled separately)."""
    n = len(freq)
    rng = _rng(seed)
    t = _t(n)
    ph = dsp.phase_of(freq, rng.random() * 6.28)
    lfo = 0.5 - 0.5 * np.cos(2 * np.pi * lfo_hz * t)
    I = index * (0.4 + 0.6 * lfo)
    y = np.sin(ph + I * np.sin(ph) + 0.6 * I * np.sin(2 * ph))
    y = dsp.oversampled(lambda u: np.tanh(2.5 * u), y, 4)
    sw = dsp.saw(freq * 1.003, rng.random()) * 0.35
    y = y + sw
    fc = vowel_lo + (vowel_hi - vowel_lo) * lfo
    a = dsp.bp(y, fc, 2.2)
    b = dsp.bp(y, fc * 2.3, 3.0)
    y = 0.9 * a + 0.45 * b + 0.18 * dsp.lp(y, 3000.0)
    env = dsp.adsr(n, gate, 0.003, 0.3, 1.0, release)
    return y * env * vel


# ---------------------------------------------------------------- pads


def drone(ms, n, cutoff=420.0, seed=0, lfo_hz=0.11):
    rng = _rng(seed)
    t = _t(n)
    out = np.zeros((2, n))
    for i, m in enumerate(ms):
        f = float(hz(m))
        for k, det in enumerate((-0.07, 0.0, 0.08)):
            fv = np.full(n, f * 2 ** (det / 12)) * (1 + 0.0015 * np.sin(2 * np.pi * (0.07 + 0.03 * k) * t + rng.random() * 6))
            s = dsp.saw(fv, rng.random())
            pan = (k - 1) * 0.7
            out[0] += s * np.cos((pan + 1) * np.pi / 4)
            out[1] += s * np.sin((pan + 1) * np.pi / 4)
    lfo = 1 + 0.35 * np.sin(2 * np.pi * lfo_hz * t)
    out[0] = dsp.lp4(out[0], cutoff * lfo, 1.2)
    out[1] = dsp.lp4(out[1], cutoff * lfo * 1.05, 1.2)
    return out / np.sqrt(3 * len(ms))


def soft_pad(ms, dur, attack=0.25, release=0.6, cutoff=1800.0, seed=0, detune=0.12, voices=4):
    """Warmer, darker pad (pulse + saw, slow attack) for verses and the outro."""
    rng = _rng(seed)
    n = int((dur + release) * SR)
    gate = int(dur * SR)
    out = np.zeros((2, n))
    t = _t(n)
    for m in ms:
        f = float(hz(m))
        for v in range(voices):
            det = (v - (voices - 1) / 2) * detune / max(voices - 1, 1) * 2
            fv = np.full(n, f * 2 ** (det / 12)) * (1 + 0.002 * np.sin(2 * np.pi * (0.3 + 0.1 * v) * t))
            s = 0.6 * dsp.saw(fv, rng.random()) + 0.4 * dsp.pulse(fv, np.full(n, 0.42), rng.random())
            pan = ((v / max(voices - 1, 1)) * 2 - 1) * 0.8
            out[0] += s * np.cos((pan + 1) * np.pi / 4)
            out[1] += s * np.sin((pan + 1) * np.pi / 4)
    out /= np.sqrt(voices * len(ms))
    out[0] = dsp.lp(out[0], cutoff, 0.7)
    out[1] = dsp.lp(out[1], cutoff, 0.7)
    env = dsp.adsr(n, gate, attack, 1.0, 1.0, release)
    return out * env
