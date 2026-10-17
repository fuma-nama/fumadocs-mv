"""Effects: FDN reverb, tempo delay, chorus, compressor, sidechain shapes, stereo tools, limiter."""

import numpy as np
from numba import njit
from scipy import signal

from .core import SR, BEAT
from . import dsp


# ---------------------------------------------------------------- reverb


@njit(cache=True)
def _allpass_chain(x, lengths, g):
    n = x.shape[0]
    y = x.copy()
    for k in range(lengths.shape[0]):
        L = lengths[k]
        buf = np.zeros(L)
        idx = 0
        out = np.empty(n)
        for i in range(n):
            d = buf[idx]
            v = y[i] + g * d
            out[i] = d - g * v
            buf[idx] = v
            idx += 1
            if idx >= L:
                idx = 0
        y = out
    return y


@njit(cache=True)
def _fdn(xl, xr, delays, gains, damp, mod_depth, mod_rate, n_out):
    N = delays.shape[0]
    size = 1
    while size < delays.max() + mod_depth + 8:
        size *= 2
    mask = size - 1
    buf = np.zeros((N, size))
    lpst = np.zeros(N)
    vals = np.zeros(N)
    out = np.zeros((2, n_out))
    nin = xl.shape[0]
    w = 0
    phases = np.zeros(N)
    for j in range(N):
        phases[j] = 2.0 * np.pi * j / N
    dph = 2.0 * np.pi * mod_rate / SR
    for i in range(n_out):
        il = xl[i] if i < nin else 0.0
        ir = xr[i] if i < nin else 0.0
        s = 0.0
        for j in range(N):
            if j < 4 and mod_depth > 0.0:
                dl = delays[j] + mod_depth * (1.0 + np.sin(phases[j] + dph * i)) * 0.5
                di = int(dl)
                fr = dl - di
                a = buf[j, (w - di) & mask]
                b = buf[j, (w - di - 1) & mask]
                v = a + (b - a) * fr
            else:
                v = buf[j, (w - delays[j]) & mask]
            lpst[j] += (1.0 - damp[j]) * (v - lpst[j])
            vals[j] = lpst[j] * gains[j]
            s += vals[j]
        s *= 2.0 / N
        ol = 0.0
        orr = 0.0
        for j in range(N):
            fb = vals[j] - s
            inj = il if (j & 1) == 0 else ir
            buf[j, w] = fb + inj
            sg = 1.0 if ((j >> 1) & 1) == 0 else -1.0
            if (j & 1) == 0:
                ol += vals[j] * sg
            else:
                orr += vals[j] * sg
        out[0, i] = ol
        out[1, i] = orr
        w = (w + 1) & mask
    return out


def reverb(x, rt60=2.0, predelay=0.02, damp_hz=6000.0, size=1.0, diffusion=0.7, mod=6.0, tail=None, seed=3):
    """16-line FDN reverb with input diffusion. x: (2, n). Returns wet (2, n) (same length unless tail)."""
    n = x.shape[1]
    n_out = n if tail is None else n + int(tail * SR)
    base = np.array([1031, 1171, 1301, 1433, 1559, 1693, 1811, 1949, 2083, 2213, 2357, 2503, 2659, 2789, 2953, 3121])
    rng = np.random.default_rng(seed)
    delays = (base * size * (1.0 + 0.03 * rng.standard_normal(16))).astype(np.int64)
    gains = 10.0 ** (-3.0 * delays / (rt60 * SR))
    damp = np.full(16, dsp.onepole_coef(damp_hz))
    pre = int(predelay * SR)
    xl = np.concatenate([np.zeros(pre), x[0].astype(np.float64)])
    xr = np.concatenate([np.zeros(pre), x[1].astype(np.float64)])
    ap_l = np.array([142, 107, 379, 277], dtype=np.int64)
    ap_r = np.array([151, 113, 397, 293], dtype=np.int64)
    xl = _allpass_chain(xl, ap_l, diffusion)
    xr = _allpass_chain(xr, ap_r, diffusion)
    wet = _fdn(xl, xr, delays, gains, damp, float(mod), 0.35, n_out)
    wet *= 0.35
    return wet


# ---------------------------------------------------------------- delay


@njit(cache=True)
def _pingpong(xl, xr, d, fb, lpc, hpc, cross, n_out):
    size = 1
    while size < d + 4:
        size *= 2
    mask = size - 1
    bl = np.zeros(size)
    br = np.zeros(size)
    out = np.zeros((2, n_out))
    w = 0
    lpl = 0.0
    lpr = 0.0
    hpl = 0.0
    hpr = 0.0
    nin = xl.shape[0]
    for i in range(n_out):
        il = xl[i] if i < nin else 0.0
        ir = xr[i] if i < nin else 0.0
        vl = bl[(w - d) & mask]
        vr = br[(w - d) & mask]
        lpl += (1.0 - lpc) * (vl - lpl)
        lpr += (1.0 - lpc) * (vr - lpr)
        hpl += (1.0 - hpc) * (lpl - hpl)
        hpr += (1.0 - hpc) * (lpr - hpr)
        fl = lpl - hpl
        fr = lpr - hpr
        out[0, i] = fl
        out[1, i] = fr
        # cross-feed for ping-pong
        bl[w] = il + fb * ((1.0 - cross) * fl + cross * fr)
        br[w] = ir + fb * ((1.0 - cross) * fr + cross * fl)
        w = (w + 1) & mask
    return out


def delay(x, beats=0.75, fb=0.35, lp_hz=5000.0, hp_hz=300.0, pingpong=True):
    """Tempo-synced (ping-pong) delay; x (2, n), returns wet."""
    d = int(round(beats * BEAT))
    if pingpong:
        mono = 0.5 * (x[0] + x[1])
        xl = mono.astype(np.float64)
        xr = np.zeros_like(xl)
        cross = 1.0
    else:
        xl = x[0].astype(np.float64)
        xr = x[1].astype(np.float64)
        cross = 0.0
    return _pingpong(xl, xr, d, fb, dsp.onepole_coef(lp_hz), dsp.onepole_coef(hp_hz), cross, x.shape[1])


# ---------------------------------------------------------------- chorus


@njit(cache=True)
def _chorus(x, base, depth, rate, phase):
    n = x.shape[0]
    size = 1
    while size < base + depth + 8:
        size *= 2
    mask = size - 1
    buf = np.zeros(size)
    out = np.empty(n)
    w = 0
    for i in range(n):
        buf[w] = x[i]
        dl = base + depth * (0.5 + 0.5 * np.sin(phase + 2.0 * np.pi * rate * i / SR))
        di = int(dl)
        fr = dl - di
        a = buf[(w - di) & mask]
        b = buf[(w - di - 1) & mask]
        out[i] = a + (b - a) * fr
        w = (w + 1) & mask
    return out


def chorus(x, mix=0.5, base_ms=9.0, depth_ms=3.5, rate=0.6):
    """Stereo chorus (one modulated tap per side, quadrature LFOs)."""
    b = base_ms * SR / 1000
    d = depth_ms * SR / 1000
    m = 0.5 * (x[0] + x[1]).astype(np.float64)
    wl = _chorus(m, b, d, rate, 0.0)
    wr = _chorus(m, b * 1.13, d, rate * 1.07, np.pi / 2)
    return np.stack([x[0] * (1 - mix * 0.5) + wl * mix, x[1] * (1 - mix * 0.5) + wr * mix])


# ---------------------------------------------------------------- dynamics


@njit(cache=True)
def _comp_gain(det, thr, ratio, knee, att, rel):
    n = det.shape[0]
    g = np.empty(n)
    ka = np.exp(-1.0 / (att * SR))
    kr = np.exp(-1.0 / (rel * SR))
    s = 0.0
    for i in range(n):
        lv = 20.0 * np.log10(det[i] + 1e-9)
        over = lv - thr
        if over <= -knee / 2:
            gr = 0.0
        elif over >= knee / 2:
            gr = over * (1.0 - 1.0 / ratio)
        else:
            t = over + knee / 2
            gr = (1.0 - 1.0 / ratio) * t * t / (2.0 * knee)
        if gr > s:
            s = ka * s + (1.0 - ka) * gr
        else:
            s = kr * s + (1.0 - kr) * gr
        g[i] = 10.0 ** (-s / 20.0)
    return g


def compressor_gain(x, thr=-18.0, ratio=3.0, knee=6.0, attack=0.005, release=0.12, rms_ms=0.0):
    """Stereo-linked feed-forward compressor; returns the linear gain curve."""
    det = np.max(np.abs(x), axis=0).astype(np.float64) if x.ndim == 2 else np.abs(x).astype(np.float64)
    if rms_ms > 0:
        c = dsp.onepole_coef(1000.0 / (2 * np.pi * rms_ms))
        det = np.sqrt(dsp.onepole_lp(det * det, c))
    return _comp_gain(det, thr, ratio, knee, attack, release)


def compress(x, makeup_db=0.0, **kw):
    g = compressor_gain(x, **kw)
    return x * g * 10 ** (makeup_db / 20)


def duck_curve(n, hits, depth=0.7, attack=0.004, hold=0.02, release=0.18):
    """Sidechain 'volume shaper' driven by kick sample positions (not audio): smooth and click-free.
    Fully ducked on the hit, raised-cosine recovery over `release`."""
    g = np.ones(n)
    na = max(int(attack * SR), 1)
    nh = int(hold * SR)
    nr = int(release * SR)
    rec = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, nr))
    shape = np.concatenate(
        [
            1 - depth * (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, na))),
            np.full(nh, 1 - depth),
            1 - depth * (1 - rec),
        ]
    )
    for h in hits:
        s = int(h) - na
        if s >= n:
            continue
        a = max(s, 0)
        b = min(s + len(shape), n)
        g[a:b] = np.minimum(g[a:b], shape[a - s : b - s])
    return g


# ---------------------------------------------------------------- stereo


def mono_low(x, fc=120.0):
    """Make everything below fc mono by high-passing the side channel (LR4)."""
    m = 0.5 * (x[0] + x[1])
    s = 0.5 * (x[0] - x[1])
    sos = signal.butter(2, fc, "highpass", fs=SR, output="sos")
    s = signal.sosfilt(sos, signal.sosfilt(sos, s))
    return np.stack([m + s, m - s])


def width(x, w):
    m = 0.5 * (x[0] + x[1])
    s = 0.5 * (x[0] - x[1]) * w
    return np.stack([m + s, m - s])


def haas(mono, ms=12.0):
    d = int(ms * SR / 1000)
    r = np.concatenate([np.zeros(d), mono[: len(mono) - d]])
    return np.stack([mono, r])


# ---------------------------------------------------------------- mastering


def true_peak_track(x, factor=4):
    """Per-sample true-peak estimate (max |x| of the 4x-oversampled signal around each sample)."""
    up = signal.resample_poly(x, factor, 1, axis=-1)
    a = np.max(np.abs(up), axis=0)
    a = a[: (len(a) // factor) * factor].reshape(-1, factor).max(axis=1)
    n = x.shape[-1]
    if len(a) < n:
        a = np.concatenate([a, np.zeros(n - len(a))])
    return a


def true_peak_db(x, factor=4):
    up = signal.resample_poly(x, factor, 1, axis=-1)
    return 20 * np.log10(np.max(np.abs(up)) + 1e-12)


@njit(cache=True)
def _sliding_min_fwd(r, L):
    """m[i] = min(r[i-L .. i]) (backward-looking window) using a monotonic deque."""
    n = r.shape[0]
    m = np.empty(n)
    dq = np.empty(n, dtype=np.int64)
    head = 0
    tail = 0
    for i in range(n):
        while tail > head and r[dq[tail - 1]] >= r[i]:
            tail -= 1
        dq[tail] = i
        tail += 1
        while dq[head] < i - L:
            head += 1
        m[i] = r[dq[head]]
    return m


@njit(cache=True)
def _release(h, alpha):
    n = h.shape[0]
    e = np.empty(n)
    prev = 1.0
    for i in range(n):
        v = 1.0 - (1.0 - prev) * alpha
        if h[i] < v:
            v = h[i]
        e[i] = v
        prev = v
    return e


def limiter(x, ceiling_db=-1.2, lookahead=0.004, release=0.08):
    """Look-ahead true-peak brickwall limiter (offline, zero added latency)."""
    c = 10 ** (ceiling_db / 20)
    L = int(lookahead * SR)
    pk = true_peak_track(x)
    req = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    # delay the audio by L conceptually: gain index m applies to sample m-L
    req_pad = np.concatenate([req, np.ones(L)])
    hmin = _sliding_min_fwd(req_pad, L)
    e = _release(hmin, float(np.exp(-1.0 / (release * SR))))
    k = np.ones(L) / L
    g = np.convolve(e, k)[: len(e)]
    g = g[L : L + x.shape[1]]
    return x * g, g


def softclip_master(x, threshold_db=-2.0):
    """Gentle oversampled soft clipper: transparent below threshold, smooth above."""
    t = 10 ** (threshold_db / 20)

    def f(u):
        a = np.abs(u)
        over = a > t
        y = u.copy()
        knee = 1 - t
        y[over] = np.sign(u[over]) * (t + knee * np.tanh((a[over] - t) / knee))
        return y

    return dsp.oversampled(f, x, 4)


def tpdf_dither(x, bits=24, seed=7):
    rng = np.random.default_rng(seed)
    lsb = 2.0 ** -(bits - 1)
    return x + (rng.random(x.shape) - rng.random(x.shape)) * lsb
