"""Synthesized drum kit, mechanical foley and transition FX. All one-shots start at their onset
(the transient is on sample 0) and end at silence."""

import numpy as np

from .core import SR, hz
from . import dsp


def _t(n):
    return np.arange(n) / SR


def _env(n, t60, attack=0.0005):
    t = _t(n)
    return np.exp(-6.9 * t / t60) * np.minimum(1.0, t / max(attack, 1e-5))


# ---------------------------------------------------------------- kit


def kick(vel=1.0, tune=49.0, decay=0.45, click=1.0, drive=1.8, seed=0, start=230.0):
    n = int((decay + 0.06) * SR)
    t = _t(n)
    f = tune + (start - tune) * np.exp(-t / 0.032) + 900.0 * np.exp(-t / 0.0035)
    ph = dsp.phase_of(f)
    amp = np.exp(-6.9 * np.maximum(t - 0.012, 0) / decay) * np.minimum(1, t / 0.0006)
    body = np.sin(ph) * amp
    body = np.tanh(drive * body) / np.tanh(drive)
    nz = dsp.noise(n, seed)
    clk = dsp.bp(nz, 4200.0, 0.7) * np.exp(-t / 0.0025) * 1.1
    knock = np.sin(2 * np.pi * 1600 * t) * np.exp(-t / 0.004) * 0.3
    y = body + click * (clk + knock)
    return dsp.fade(y * vel, 0.0003, 0.01)


def snare(vel=1.0, tone=188.0, decay=0.22, snap=1.0, seed=0, bright=1.0):
    n = int((decay + 0.05) * SR)
    t = _t(n)
    f1 = tone + 70 * np.exp(-t / 0.012)
    body = np.sin(dsp.phase_of(f1)) * np.exp(-t / 0.055)
    body += 0.45 * np.sin(dsp.phase_of(f1 * 1.62)) * np.exp(-t / 0.035)
    nz = dsp.noise(n, seed)
    wires = dsp.bp(nz, 5200.0 * bright, 0.55) * 0.8 + dsp.hp(nz, 2500.0) * 0.5
    wires *= np.exp(-6.9 * t / decay) * np.minimum(1, t / 0.0008)
    clk = dsp.hp(nz, 1500.0) * np.exp(-t / 0.0015) * 0.6 * snap
    y = 0.62 * np.tanh(1.5 * body) + 0.85 * wires + clk
    y = dsp.lp(y, 14000.0, 0.7)
    return dsp.fade(y * vel, 0.0003, 0.01)


def clap(vel=1.0, seed=0, decay=0.16):
    n = int((decay + 0.08) * SR)
    t = _t(n)
    nz = dsp.noise(n, seed)
    env = np.zeros(n)
    for k, off in enumerate((0.0, 0.0085, 0.017, 0.0245)):
        tt = t - off
        e = np.where(tt >= 0, np.exp(-np.maximum(tt, 0) / 0.0045), 0.0)
        env += e * (0.8 if k < 3 else 1.0)
    tt = t - 0.0245
    env += np.where(tt >= 0, np.exp(-6.9 * np.maximum(tt, 0) / decay), 0.0) * 0.55
    y = dsp.bp(nz, 1250.0, 1.1) * 1.4 + dsp.bp(nz, 3200.0, 0.9) * 0.35
    y = dsp.lp(y * env * np.minimum(1, t / 0.0005), 11000.0, 0.7)
    return dsp.fade(y * vel, 0.0, 0.01)


_HAT_F = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0]) * 1.55


def _metal(n, seed):
    rng = np.random.default_rng(seed)
    y = np.zeros(n)
    for f in _HAT_F:
        y += dsp.pulse(np.full(n, f), np.full(n, 0.5), rng.random())
    return y / 6


def hat(vel=1.0, decay=0.05, seed=0, tone=1.0):
    n = int((decay * 1.2 + 0.01) * SR)
    t = _t(n)
    m = _metal(n, seed)
    nz = dsp.noise(n, seed + 11)
    y = 0.6 * dsp.bp(m, 8200.0 * tone, 1.1) + 0.35 * dsp.bp(nz, 9500.0 * tone, 0.8)
    y = dsp.lp(dsp.hp(y, 5200.0 * tone), 15000.0, 0.7)
    y *= _env(n, decay, 0.0004)
    return dsp.fade(y * vel, 0.0, 0.004)


def open_hat(vel=1.0, decay=0.42, seed=0):
    n = int((decay + 0.02) * SR)
    t = _t(n)
    m = _metal(n, seed)
    nz = dsp.noise(n, seed + 5)
    y = 0.55 * dsp.bp(m, 7800.0, 1.0) + 0.45 * dsp.bp(nz, 9000.0, 0.7)
    y = dsp.lp(dsp.hp(y, 4800.0), 14500.0, 0.7)
    env = np.exp(-6.9 * t / decay) * np.minimum(1, t / 0.0015)
    y *= env
    return dsp.fade(y * vel, 0.0, 0.01)


def shaker(vel=1.0, seed=0, decay=0.075):
    n = int((decay + 0.03) * SR)
    t = _t(n)
    nz = dsp.noise(n, seed)
    y = dsp.bp(nz, 7200.0, 0.9) + 0.3 * dsp.hp(nz, 10000.0)
    env = np.where(t < 0.003, (t / 0.003) ** 2, np.exp(-np.maximum(t - 0.003, 0) * 6.9 / decay))
    return dsp.fade(y * env * vel, 0.0, 0.004)


def _band(x, lo, hi):
    from scipy import signal as ss

    return ss.sosfilt(ss.butter(2, [lo, min(hi, 0.45 * SR)], "bandpass", fs=SR, output="sos"), x)


def _modes(n, t, rng, count, lo, hi, t60, tmin, tmax):
    """Dense cloud of inharmonic modes (metallic shimmer without discrete tonal lines)."""
    f = np.exp(rng.uniform(np.log(lo), np.log(hi), count))
    y = np.zeros(n)
    for k in range(count):
        a = rng.uniform(0.2, 1.0)
        y += a * np.sin(2 * np.pi * f[k] * t + rng.random() * 6.28) * np.exp(-6.9 * t / (t60 * rng.uniform(tmin, tmax)))
    return y / np.sqrt(count)


def _cymbal(n, t, seed, ch, t60, bands, modes_lvl, burst_lvl, mode_rng=(350, 12000), stick=0.6):
    """Band-split noise whose upper bands decay faster (spectrum darkens as it rings), a dense mode
    cloud, a stick burst and a two-slope envelope (quick initial drop, long tail)."""
    rng = np.random.default_rng(seed + 101 * ch)
    nz = dsp.noise(n, seed + 31 * ch)
    y = np.zeros(n)
    for lo, hi, lev, tf in bands:
        y += 10 ** (lev / 20) * _band(nz, lo, hi) * np.exp(-6.9 * t / (t60 * tf))
    y += modes_lvl * _modes(n, t, rng, 160, mode_rng[0], mode_rng[1], t60, 0.15, 0.8)
    y *= 1.0 + 0.9 * np.exp(-t / 0.08)
    y += burst_lvl * _band(nz, 2000, 9000) * np.exp(-t / 0.01)
    y += stick * _band(nz, 5000, 14000) * np.exp(-t / 0.008)  # bright stick contact
    return y


CRASH_RMS = 0.25 * 10 ** (4.2 / 20)  # level-matched to the v1 crash (K-weighted, first second)
CRASH_BANDS = ((400, 1000, -3.5, 1.15), (1000, 2500, 0.3, 1.08), (2500, 6000, 0.0, 1.0),
               (6000, 10000, -1.0, 0.62), (10000, 16000, -7.7, 0.38))


def crash(vel=1.0, t60=2.8, seed=0, bright=1.0):
    n = int((t60 + 0.05) * SR)
    t = _t(n)
    out = np.stack([_cymbal(n, t, seed, ch, t60, CRASH_BANDS, 0.14, 0.45, (1500, 12000), stick=1.0) for ch in range(2)])
    out = dsp.eq(out, [("lp", 15000.0 * bright, 2)])
    out *= np.minimum(1, t / 0.0008)
    out /= np.sqrt(np.mean(out[:, : int(0.5 * SR)] ** 2)) / CRASH_RMS
    return dsp.fade(out * vel, 0.0003, 0.05)


def ride(vel=1.0, seed=0, t60=3.2):
    """Stick 'ping' (a few prominent bell partials + tip transient) over a dense, long wash."""
    n = int((t60 + 0.05) * SR)
    t = _t(n)
    rng = np.random.default_rng(seed)
    nz = dsp.noise(n, seed)
    ping = np.zeros(n)
    for f, a in ((2480, 1.0), (3710, 0.7), (5230, 0.5), (6640, 0.3)):
        ping += a * np.sin(2 * np.pi * f * (1 + 0.002 * rng.standard_normal()) * t) * np.exp(-6.9 * t / 0.45)
    tip = _band(nz, 3500, 9000) * np.exp(-t / 0.006) * 0.8
    wash = (0.5 * _band(nz, 1500, 4000) * np.exp(-6.9 * t / (t60 * 0.8)) + _band(nz, 4000, 11000) * np.exp(-6.9 * t / (t60 * 0.6)))
    wash += 0.35 * _modes(n, t, rng, 120, 1500, 11000, t60, 0.3, 0.9)
    y = 0.25 * ping + tip + 0.6 * wash * (1 + 0.8 * np.exp(-t / 0.08))
    y = dsp.lp(y * np.minimum(1, t / 0.0006), 15000.0, 0.7)
    y /= np.sqrt(np.mean(y[: int(0.3 * SR)] ** 2)) / (0.2 * 10 ** (0.5 / 20))
    return dsp.fade(y * vel, 0.0003, 0.05)


def tom(m, vel=1.0, decay=0.35, seed=0):
    f = float(hz(m))
    n = int((decay + 0.03) * SR)
    t = _t(n)
    fv = f * (1 + 0.6 * np.exp(-t / 0.02))
    y = np.sin(dsp.phase_of(fv)) * np.exp(-6.9 * t / decay)
    y += 0.25 * dsp.bp(dsp.noise(n, seed), 1800.0, 1.0) * np.exp(-t / 0.02)
    y = np.tanh(1.4 * y) * np.minimum(1, t / 0.0006)
    return dsp.fade(y * vel, 0.0003, 0.01)


def rim(vel=1.0, seed=0):
    n = int(0.08 * SR)
    t = _t(n)
    y = np.sin(2 * np.pi * 1720 * t) * np.exp(-t / 0.012) + 0.6 * dsp.bp(dsp.noise(n, seed), 2600.0, 2.0) * np.exp(-t / 0.006)
    y *= np.minimum(1, t / 0.0003)
    return dsp.fade(y * vel, 0.0, 0.01)


# ---------------------------------------------------------------- transition fx


def impact(vel=1.0, seed=0, t60=2.4):
    n = int((t60 + 0.1) * SR)
    t = _t(n)
    f = 34.0 + 52.0 * np.exp(-t / 0.18)
    sub = np.sin(dsp.phase_of(f)) * np.exp(-6.9 * t / t60) * np.minimum(1, t / 0.001)
    sub = np.tanh(1.6 * sub) / np.tanh(1.6)
    nz = dsp.noise(n, seed)
    burst = dsp.lp(nz, 2500.0 * np.exp(-t / 0.25) + 200.0, 0.7) * np.exp(-6.9 * t / 0.7) * 0.9
    boom = np.sin(dsp.phase_of(70.0 + 40 * np.exp(-t / 0.03))) * np.exp(-t / 0.12) * 0.5
    y = 0.9 * sub + burst + boom
    return dsp.fade(y * vel, 0.0005, 0.05)


def riser(dur, seed=0, f0=350.0, f1=9000.0, pitch=True, curve=2.2):
    """Noise sweep + rising saw; ends at full level (the caller cuts it at the downbeat)."""
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    out = np.zeros((2, n))
    fc = f0 * (f1 / f0) ** (t**1.4)
    amp = t**curve
    for ch in range(2):
        nz = dsp.noise(n, seed + 17 * ch)
        y = dsp.bp(nz, fc * (1 + 0.04 * ch), 1.6) * 1.2 + 0.25 * dsp.hp(nz, fc)
        out[ch] = y
    if pitch:
        pf = hz(55 + 24 * t**1.2)
        s = dsp.saw(pf, 0.0) + dsp.saw(pf * 1.5, 0.3) * 0.5
        s = dsp.lp(s, 600 + 6000 * t**2, 0.9) * 0.25
        out += s
    out *= amp
    out = dsp.fade(out, 0.01, 0.003)
    return out


def downlifter(dur=1.6, seed=0):
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    out = np.zeros((2, n))
    fc = 7000.0 * (200.0 / 7000.0) ** (t**0.7)
    for ch in range(2):
        nz = dsp.noise(n, seed + 9 * ch)
        out[ch] = dsp.bp(nz, fc, 1.3)
    out *= (1 - t) ** 1.6
    return dsp.fade(out, 0.002, 0.02)


REVERSE_TRIM = 10 ** (-2.75 / 20)  # with CRASH_RMS this lands the swells at the v1 level


def reverse_cymbal(dur, seed=0):
    c = crash(1.0, t60=max(dur * 1.6, 1.0), seed=seed) * REVERSE_TRIM
    n = int(dur * SR)
    c = c[:, :n][:, ::-1].copy()
    return dsp.fade(c, 0.02, 0.002)


def power_on(seed=0):
    n = int(0.9 * SR)
    t = _t(n)
    clickn = dsp.hp(dsp.noise(n, seed), 1200.0) * np.exp(-t / 0.0012)
    clickt = np.sin(2 * np.pi * 2900 * t) * np.exp(-t / 0.004) * 0.5
    f = 38.0 + 40.0 * np.exp(-t / 0.05)
    thump = np.sin(dsp.phase_of(f)) * np.exp(-6.9 * t / 0.6) * np.minimum(1, t / 0.003)
    hum = np.sin(2 * np.pi * 98 * t) * np.exp(-6.9 * t / 0.5) * 0.06
    y = 0.8 * clickn + clickt + 0.9 * thump + hum
    return dsp.fade(y, 0.0, 0.02)


# ---------------------------------------------------------------- mechanical foley


def clock_tick(tock=False, vel=1.0, seed=0):
    n = int(0.06 * SR)
    t = _t(n)
    nz = dsp.noise(n, seed)
    exc = nz * np.exp(-t / 0.0014)
    body_f = 1650.0 if tock else 2450.0
    y = dsp.bp(exc, body_f, 5.0) * 2.2 + dsp.bp(exc, body_f * 2.71, 7.0) * 1.0 + dsp.hp(exc, 5000.0) * 0.35
    y += np.sin(2 * np.pi * body_f * 0.42 * t) * np.exp(-t / 0.004) * 0.05
    y *= np.minimum(1, t / 0.0002)
    return dsp.fade(y * vel, 0.0, 0.01)


def typewriter(vel=1.0, seed=0):
    n = int(0.11 * SR)
    t = _t(n)
    nz = dsp.noise(n, seed)
    strike = dsp.hp(nz, 2000.0) * np.exp(-t / 0.0018)
    ring = dsp.bp(nz, 3100.0, 7.0) * np.exp(-t / 0.018) * 1.6
    thunk = np.sin(dsp.phase_of(190 + 60 * np.exp(-t / 0.01))) * np.exp(-t / 0.022) * 0.5
    t2 = t - 0.016
    rattle = np.where(t2 > 0, dsp.bp(nz, 4200.0, 3.0) * np.exp(-np.maximum(t2, 0) / 0.004), 0.0) * 0.7
    y = strike + ring + thunk + rattle
    y *= np.minimum(1, t / 0.0002)
    return dsp.fade(y * vel, 0.0, 0.01)


def ding(m=96, vel=1.0, seed=0):
    """Typewriter carriage-return bell."""
    f = float(hz(m))
    n = int(1.6 * SR)
    t = _t(n)
    y = np.sin(2 * np.pi * f * t) * np.exp(-6.9 * t / 1.4)
    y += 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-6.9 * t / 0.5)
    y += 0.25 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-6.9 * t / 0.2)
    y *= np.minimum(1, t / 0.0005) * (1 + 0.04 * np.sin(2 * np.pi * 6 * t))
    return dsp.fade(y * vel, 0.0, 0.05)


def gear(vel=1.0, clicks=5, spacing=0.011, seed=0):
    n = int((clicks * spacing + 0.05) * SR)
    t = _t(n)
    nz = dsp.noise(n, seed)
    y = np.zeros(n)
    for k in range(clicks):
        tt = t - k * spacing
        e = np.where(tt >= 0, np.exp(-np.maximum(tt, 0) / 0.0012), 0.0) * (1 - 0.5 * k / clicks)
        y += e
    y = dsp.bp(nz * y, 4300.0, 2.5) * 1.8 + dsp.bp(nz * y, 1900.0, 4.0) * 0.8
    return dsp.fade(y * vel, 0.0, 0.01)


def paper(dur=0.32, vel=1.0, seed=0, up=True):
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    nz = dsp.noise(n, seed)
    grain = 1 + 0.5 * dsp.lp(dsp.noise(n, seed + 1), 60.0) * 8
    fc = (1400.0 * (5200.0 / 1400.0) ** t) if up else (5200.0 * (1400.0 / 5200.0) ** t)
    y = dsp.bp(nz * grain, fc, 0.9) + 0.3 * dsp.hp(nz, 6000.0)
    env = np.sin(np.pi * t) ** 1.5
    return dsp.fade(y * env * vel, 0.005, 0.01)


def servo(dur=0.3, vel=1.0, f0=170.0, f1=330.0, seed=0):
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    f = f0 * (f1 / f0) ** (0.5 - 0.5 * np.cos(np.pi * t))
    f = f * (1 + 0.02 * np.sin(2 * np.pi * 37 * t * dur))
    y = dsp.pulse(f, np.full(n, 0.3), 0.0) + 0.5 * dsp.saw(f * 2.01, 0.2)
    y = dsp.bp(y, 1300.0, 1.4) + 0.2 * dsp.bp(dsp.noise(n, seed), 3000.0, 1.0)
    env = np.sin(np.pi * t) ** 0.6
    return dsp.fade(y * env * vel, 0.004, 0.01)


def blip(m, vel=1.0, dur=0.05, seed=0):
    f = float(hz(m))
    n = int((dur + 0.01) * SR)
    t = _t(n)
    fv = f * (1 + 0.03 * np.exp(-t / 0.005))
    y = dsp.pulse(fv, np.full(n, 0.25), 0.0)
    y = dsp.lp(y, 4.0 * f, 0.8)
    y *= np.exp(-6.9 * t / dur) * np.minimum(1, t / 0.0006)
    return dsp.fade(y * vel, 0.0, 0.004)


def mouse_click(vel=1.0, seed=0):
    n = int(0.04 * SR)
    t = _t(n)
    nz = dsp.noise(n, seed)
    press = dsp.bp(nz, 4200.0, 3.0) * np.exp(-t / 0.0012) * 1.6
    t2 = t - 0.009
    release = np.where(t2 > 0, dsp.bp(nz, 5200.0, 3.0) * np.exp(-np.maximum(t2, 0) / 0.001), 0.0) * 0.7
    body = np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.004) * 0.25
    y = (press + release + body) * np.minimum(1, t / 0.0002)
    return dsp.fade(y * vel, 0.0, 0.005)


def enter_key(vel=1.0, seed=0):
    """Heavy return key: big typewriter strike + carriage thunk + short slide."""
    n = int(0.3 * SR)
    t = _t(n)
    y = np.zeros(n)
    k = typewriter(1.0, seed)
    y[: len(k)] += k * 1.2
    thunk = np.sin(dsp.phase_of(140 + 90 * np.exp(-t / 0.012))) * np.exp(-t / 0.05) * 0.8
    y += thunk
    sl = paper(0.16, 0.5, seed=seed + 3, up=False)
    a = int(0.03 * SR)
    y[a:a + len(sl)] += sl
    return dsp.fade(y * vel, 0.0, 0.02)


def clunk(vel=1.0, seed=0):
    """Floppy disk sliding home: plastic click + low chunk + tiny motor spin."""
    n = int(0.25 * SR)
    t = _t(n)
    nz = dsp.noise(n, seed)
    click = dsp.bp(nz, 2300.0, 2.5) * np.exp(-t / 0.003) * 1.4
    chunk = np.sin(dsp.phase_of(115 + 60 * np.exp(-t / 0.01))) * np.exp(-t / 0.045)
    t2 = np.maximum(t - 0.04, 0)
    motor = dsp.bp(dsp.pulse(np.full(n, 95.0), np.full(n, 0.3), 0.0), 900.0, 2.0) * np.where(t > 0.04, 1, 0) * np.exp(-t2 / 0.06) * 0.25
    y = (click + chunk + motor) * np.minimum(1, t / 0.0003)
    return dsp.fade(y * vel, 0.0, 0.02)


CHINA_BANDS = ((500, 1000, -2.0, 1.1), (1000, 2500, 3.0, 1.05), (2500, 6000, 0.0, 1.0),
               (6000, 10000, -4.0, 0.55), (10000, 16000, -12.0, 0.3))


def china(vel=1.0, t60=1.4, seed=0):
    """Trashy china: mid-heavy band noise, dense modes, gentle saturation for 'trash', quicker decay."""
    n = int((t60 + 0.05) * SR)
    t = _t(n)
    out = np.stack([_cymbal(n, t, seed, ch, t60, CHINA_BANDS, 0.3, 0.6, (1500, 9000)) for ch in range(2)])
    out = np.tanh(out / (np.abs(out).max() + 1e-9) * 1.4)
    out = dsp.eq(out, [("lp", 13000.0, 2)])
    out *= np.minimum(1, t / 0.0006)
    out /= np.sqrt(np.mean(out[:, : int(0.4 * SR)] ** 2)) / (0.25 * 10 ** (1.56 / 20))
    return dsp.fade(out * vel, 0.0003, 0.05)


def snap(vel=1.0, seed=0):
    """Dry finger-snap / click pickup: a bright noise crack with a short woody body."""
    n = int(0.12 * SR)
    t = _t(n)
    nz = dsp.noise(n, seed)
    crack = _band(nz, 1800, 6500) * np.exp(-t / 0.006) * 1.6
    body = np.sin(2 * np.pi * 1150 * t) * np.exp(-t / 0.012) * 0.35
    tail = _band(nz, 3000, 9000) * np.exp(-t / 0.03) * 0.15
    y = (crack + body + tail) * np.minimum(1, t / 0.0004)
    return dsp.fade(y * vel, 0.0002, 0.01)
