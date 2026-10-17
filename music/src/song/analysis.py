"""Quality control by analysis: loudness (integrated / per section), true peak, clipping, DC,
low-end mono compatibility, onset grid alignment, scale membership of every pitched note."""

import numpy as np
from scipy import signal
import pyloudnorm as pyln

from engine.core import SR, S16, TOTAL, at
from engine import fx
from .harmony import pcs, SCALES
from . import score as S

# BS.1770 K-weighting at 48 kHz
_KB1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
_KA1 = [1.0, -1.69065929318241, 0.73248077421585]
_KB2 = [1.0, -2.0, 1.0]
_KA2 = [1.0, -1.99004745483398, 0.99007225036621]


def kweight(x):
    return signal.lfilter(_KB2, _KA2, signal.lfilter(_KB1, _KA1, x, axis=-1), axis=-1)


def short_term(x, win=3.0, hop=0.1):
    k = kweight(x)
    p = np.sum(k**2, axis=0)
    c = np.concatenate([[0.0], np.cumsum(p)])
    w = int(win * SR)
    h = int(hop * SR)
    ends = np.arange(w, len(p) + 1, h)
    ms = (c[ends] - c[ends - w]) / w
    t = (ends - w / 2) / SR
    return t, -0.691 + 10 * np.log10(ms + 1e-12)


def section_loudness(x):
    out = []
    k = kweight(x)
    p = np.sum(k**2, axis=0)
    for sid, name, a, b in S.SECTIONS:
        s, e = at(a), at(b + 1)
        # momentary (400 ms) blocks inside the section, gated at -70 LUFS
        w = int(0.4 * SR)
        blocks = [np.mean(p[i:i + w]) for i in range(s, e - w, w // 4)]
        blocks = np.array(blocks)
        lk = -0.691 + 10 * np.log10(blocks + 1e-12)
        sel = blocks[lk > -70]
        mean = -0.691 + 10 * np.log10(np.mean(sel) + 1e-12) if len(sel) else -99
        half = (s + e) // 2
        first = -0.691 + 10 * np.log10(np.mean(p[s:half]) + 1e-12)
        second = -0.691 + 10 * np.log10(np.mean(p[half:e]) + 1e-12)
        out.append((sid, name, a, b, mean, first, second, float(lk.max())))
    return out


def low_corr(x, fc=120.0):
    sos = signal.butter(4, fc, "lowpass", fs=SR, output="sos")
    l = signal.sosfilt(sos, x[0])
    r = signal.sosfilt(sos, x[1])
    res = []
    for sid, name, a, b in S.SECTIONS:
        s, e = at(a), at(b + 1)
        ll, rr = l[s:e], r[s:e]
        den = np.sqrt(np.sum(ll**2) * np.sum(rr**2)) + 1e-12
        side = np.sum((ll - rr) ** 2) / (np.sum((ll + rr) ** 2) + 1e-12)
        res.append((sid, float(np.sum(ll * rr) / den), float(10 * np.log10(side + 1e-12))))
    return res


def onset_grid(x, label=""):
    m = 0.5 * (x[0] + x[1])
    hop = 96
    f, t, Z = signal.stft(m, SR, nperseg=512, noverlap=512 - hop, boundary=None, padded=False)
    mag = np.log1p(np.abs(Z) * 50)
    flux = np.maximum(np.diff(mag, axis=1), 0).sum(axis=0)
    times = (np.arange(1, mag.shape[1]) * hop + 256) / SR
    pk, _ = signal.find_peaks(flux, prominence=np.percentile(flux, 99) * 0.35, distance=int(0.05 * SR / hop))
    on = times[pk]
    grid = 0.1
    dev = on - np.round(on / grid) * grid
    return on, dev


def scale_check(sc):
    """Every pitched note must be in its section scale or in the chord sounding at that time."""
    bad = []
    total = 0

    def scale_for(t):
        bar = t // (16 * S16) + 1
        sid = S.SECTIONS[-1][0]
        for i, n, a, b in S.SECTIONS:
            if a <= bar <= b:
                sid = i
                break
        return SCALES[S.SCALE_BY_SECTION.get(sid, "Bm")]

    def chk(part, t, m):
        nonlocal total
        total += 1
        name = S.chord_at(t // (16 * S16) + 1, (t % (16 * S16)) / S16)
        ok = (m % 12) in scale_for(t) or (name is not None and (m % 12) in pcs(name))
        if not ok:
            bad.append((part, round(t / SR, 3), int(m), name))

    for e in sc.lead + sc.harm:
        chk("lead", e["t"], e["midi"])
    for c in sc.chops:
        chk("chops", c["t"], c["midi"])
    for t, d, m, inst in sc.motif:
        chk("motif", t, m)
    for part, notes in sc.notes.items():
        for t, d, m, v, kw in notes:
            for mm in (m if isinstance(m, (list, tuple)) else [m]):
                chk(part, t, mm)
    for t, v, kw in sc.hits["blip"]:
        chk("blip", t, kw["m"])
    for t, v, kw in sc.hits["glass"] + sc.hits["swell"]:
        for mm in kw["chord"]:
            chk("fx-chord", t, mm)
    return total, bad


def melody_stats(sc):
    out = []
    by_line = {}
    for e in sc.lead:
        by_line.setdefault(e["line"] + ("b" if e["line"] == "L11" and e["t"] >= at(47) else ""), []).append(e)
    for line, ev in by_line.items():
        ms = [e["midi"] for e in ev if e["romaji"] not in ("s",)]
        leaps = [abs(b - a) for a, b in zip(ms, ms[1:])]
        out.append((line, len(ev), min(ms), max(ms), max(leaps) if leaps else 0))
    return out


def gr_report(gr):
    out = []
    for sid, name, a, b in S.SECTIONS:
        g = 20 * np.log10(gr[at(a):at(b + 1)] + 1e-12)
        out.append(f"{sid}:{np.mean(g):.1f}/{np.min(g):.1f}")
    return "limiter gain reduction mean/max dB per section: " + "  ".join(out)


def report(master, stems, pre, sc):
    lines = []
    meter = pyln.Meter(SR)
    I = meter.integrated_loudness(master.T)
    tp = fx.true_peak_db(master)
    sp = 20 * np.log10(np.max(np.abs(master)) + 1e-12)
    clip = int(np.sum(np.abs(master) >= 0.9999))
    dc = [float(np.mean(master[c])) for c in range(2)]
    lines.append(f"integrated loudness {I:.2f} LUFS | true peak {tp:.2f} dBTP | sample peak {sp:.2f} dBFS | clipped samples {clip}")
    lines.append(f"DC offset L {dc[0]:.2e}  R {dc[1]:.2e} | length {master.shape[1] / SR:.3f} s")
    stsum = sum(stems.values())
    err = np.max(np.abs(stsum - pre))
    lines.append(f"stems sum vs pre-limiter mix: max abs diff {err:.2e}; master vs stems-sum corr "
                 f"{np.corrcoef(stsum[0], master[0])[0, 1]:.4f}")
    lines.append("section loudness (gated mean / 1st half / 2nd half / max momentary, LUFS):")
    for sid, name, a, b, mean, f1, f2, mx in section_loudness(master):
        lines.append(f"  {name:14s} bars {a:2d}-{b:2d}: {mean:6.1f}  {f1:6.1f} -> {f2:6.1f}   max {mx:6.1f}")
    lines.append("low end (<120 Hz) L/R correlation, side/mid dB per section:")
    lines.append("  " + "  ".join(f"{sid}:{c:.3f}/{s:.0f}" for sid, c, s in low_corr(master)))
    on, dev = onset_grid(stems["drums"])
    ad = np.abs(dev) * 1000
    lines.append(f"drum-stem onsets: {len(on)} detected; within 2 ms of the 16th grid: {np.mean(ad <= 2) * 100:.1f}%, "
                 f"within 5 ms: {np.mean(ad <= 5) * 100:.1f}% (median {np.median(ad):.1f} ms)")
    worst = np.argsort(ad)[::-1][:6]
    lines.append("  largest deviations (s, ms): " + ", ".join(f"{on[i]:.3f}/{dev[i] * 1000:+.0f}" for i in sorted(worst)))
    total, bad = scale_check(sc)
    lines.append(f"scale check: {total} pitched notes, {len(bad)} outside section scale + current chord")
    for b in bad[:20]:
        lines.append(f"   ! {b}")
    lines.append("melody per line (morae, lowest, highest, largest leap in semitones):")
    lines.append("  " + "  ".join(f"{l}:{n}/{lo}-{hi}/{lp}" for l, n, lo, hi, lp in melody_stats(sc)))
    peaks = {k: 20 * np.log10(np.max(np.abs(v)) + 1e-12) for k, v in stems.items()}
    lines.append("stem sample peaks dBFS: " + ", ".join(f"{k} {v:.1f}" for k, v in peaks.items()))
    return "\n".join(lines), dict(integrated=I, true_peak=tp, sample_peak=sp, clipped=clip, dc=dc)
