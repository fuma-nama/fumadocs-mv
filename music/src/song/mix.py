"""Mixing: per-track channel strips, sidechain, sends (plate / hall / tempo delay), stem buses,
arrangement gates (stops, tape stop, stutter) and the master chain."""

import numpy as np
import pyloudnorm as pyln
from scipy import signal

from engine.core import SR, TOTAL, S16, at, db
from engine import dsp, fx
from .render_parts import automation_curve
from . import score as S

STEMS = ["drums", "foley", "bass", "chords", "arp", "lead_voice", "lead_synth", "fx"]

# gain (dB), static EQ, sidechain depth, sends, extras
STRIP = {
    "kick": dict(stem="drums", g=-4.0, eq=[("hp", 28, 2), ("peak", 58, 2.0, 1.1), ("peak", 105, 2.5, 1.2), ("peak", 3800, 2.0, 1.0)]),
    "snare": dict(stem="drums", g=-9.0, eq=[("hp", 110, 2), ("peak", 220, 1.5, 1.3), ("high", 7000, 2.0)], plate=0.16),
    "clap": dict(stem="drums", g=-12.5, eq=[("hp", 350, 2)], plate=0.22),
    "hat": dict(stem="drums", g=-16.5, eq=[("hp", 600, 2)]),
    "shaker": dict(stem="drums", g=-20.0, eq=[("hp", 700, 2)]),
    "cym": dict(stem="drums", g=-16.0, eq=[("hp", 450, 2), ("high", 9000, -2.0)], hall=0.06),
    "clock": dict(stem="foley", g=-9.0, eq=[("hp", 400, 2)], plate=0.08, clamp=16.0),
    "machine": dict(stem="foley", g=-8.0, eq=[("hp", 160, 2), ("peak", 3000, -2.0, 1.2)], plate=0.12, delay=0.06, clamp=17.0),
    "blips": dict(stem="foley", g=-15.0, eq=[("hp", 500, 2)], delay=0.3, hall=0.15, clamp=16.0),
    "sub": dict(stem="bass", g=-11.5, eq=[("hp", 30, 2), ("lp", 320, 2)], sc=0.7),
    "mid": dict(stem="bass", g=-19.5, eq=[("hp", 70, 2), ("lp", 4500, 2)], sc=0.65),
    "growl": dict(stem="bass", g=-18.5, eq=[("hp", 75, 2), ("peak", 2800, -2.5, 1.0)], sc=0.6),
    "ep": dict(stem="chords", g=-17.5, eq=[("hp", 150, 2), ("peak", 330, -2.5, 1.0), ("peak", 650, -2.0, 1.2), ("high", 4000, 2.0)], sc=0.25, plate=0.14, chorus=0.45),
    "pad": dict(stem="chords", g=-24.0, eq=[("hp", 180, 2), ("peak", 500, -2.0, 1.0)], sc=0.35, hall=0.22),
    "saw": dict(stem="chords", g=-20.5, eq=[("hp", 160, 2), ("peak", 450, -3.0, 0.9), ("high", 6000, 2.5)], sc=0.62, hall=0.16, width=1.7),
    "stab": dict(stem="chords", g=-21.0, eq=[("hp", 200, 2)], plate=0.18, delay=0.12, sc=0.3),
    "drone": dict(stem="chords", g=-25.0, eq=[("hp", 38, 2)], hall=0.28),
    "fbass": dict(stem="chords", g=-18.5, eq=[("hp", 190, 2), ("peak", 500, -2.0, 1.0), ("high", 2500, 3.0)], sc=0.6, hall=0.1, width=1.6),
    "arp": dict(stem="arp", g=-13.5, eq=[("hp", 260, 2)], sc=0.35, delay=0.22, plate=0.12, width=1.4),
    "bell": dict(stem="arp", g=-16.0, eq=[("hp", 400, 2)], delay=0.25, hall=0.28),
    "marimba": dict(stem="arp", g=-9.0, eq=[("hp", 220, 2), ("peak", 800, -2.0, 1.0)], plate=0.18, delay=0.12),
    "motif": dict(stem="arp", g=-12.0, eq=[("hp", 300, 2)], delay=0.22, hall=0.32),
    "voice_dbl": dict(stem="lead_voice", g=-11.0, eq=[("hp", 250, 2), ("peak", 750, -3.0, 1.0), ("peak", 1800, 2.0, 0.8),
                                                         ("peak", 3200, -6.0, 1.4)], vox=True, keep_stereo=True, plate=0.2, delay=0.1),
    "voice": dict(stem="lead_voice", g=-6.0, eq=[("hp", 150, 2), ("peak", 750, -2.0, 1.0), ("peak", 1800, 3.0, 0.8),
                                                    ("peak", 3200, -5.0, 1.4)], vox=True, plate=0.2, delay=0.13),
    "harm": dict(stem="lead_voice", g=-13.0, eq=[("hp", 200, 2), ("peak", 750, -2.0, 1.0), ("peak", 1800, 3.0, 0.8),
                                                   ("peak", 3200, -5.0, 1.4)], vox=True, plate=0.25, delay=0.1),
    "chops": dict(stem="lead_voice", g=-11.0, eq=[("hp", 180, 2), ("peak", 750, -2.0, 1.0), ("peak", 1800, 3.0, 0.8),
                                                    ("peak", 3200, -5.0, 1.4)], vox=True,
                  plate=0.18, delay=0.2),
    "double": dict(stem="lead_synth", g=-21.0, eq=[("hp", 250, 2), ("lp", 7000, 2)], delay=0.12, plate=0.08),
    "answer": dict(stem="lead_synth", g=-14.0, eq=[("hp", 250, 2)], delay=0.3, plate=0.18),
    "descant": dict(stem="lead_synth", g=-17.0, eq=[("hp", 300, 2)], hall=0.25, delay=0.18),
    "droplead": dict(stem="lead_synth", g=-13.0, eq=[("hp", 250, 2)], delay=0.18, plate=0.14, sc=0.25),
    "impact": dict(stem="fx", g=-9.0, eq=[("hp", 25, 2)], hall=0.2),
    "accent": dict(stem="fx", g=-6.0, eq=[("hp", 30, 2), ("peak", 3000, -2.0, 1.0)], plate=0.25, hall=0.1),
    "riser": dict(stem="fx", g=-17.0, eq=[("hp", 200, 2)], hall=0.15),
    "revcym": dict(stem="fx", g=-15.0, eq=[("hp", 400, 2)]),
    "swell": dict(stem="fx", g=-15.0, eq=[("hp", 180, 2)], hall=0.25),
    "noisebed": dict(stem="fx", g=0.0, eq=[]),
}

# Gain staging: each track is calibrated to a target loudness (LUFS, integrated over the bar range,
# measured after EQ + sidechain); STRIP["g"] is then only a trim. Tracks not listed use g as-is.
CAL = {
    "voice": ((33, 40), -18.5),
    "kick": ((33, 40), -19.0),
    "snare": ((33, 40), -24.0),
    "clap": ((33, 40), -27.0),
    "hat": ((33, 40), -27.5),
    "shaker": ((33, 40), -31.0),
    "cym": ((37, 40), -27.0),
    "sub": ((33, 40), -17.5),
    "mid": ((33, 40), -22.5),
    "growl": ((49, 56), -23.0),
    "saw": ((33, 40), -20.5),
    "ep": ((9, 16), -23.0),
    "pad": ((17, 24), -27.0),
    "stab": ((41, 47), -25.0),
    "drone": ((1, 4), -31.5),
    "fbass": ((49, 56), -20.0),
    "arp": ((33, 40), -24.5),
    "bell": ((9, 24), -27.0),
    "marimba": ((41, 47), -23.5),
    "motif": ((1, 4), -29.0),
    "clock": ((9, 16), -33.0),
    "machine": ((9, 16), -29.0),
    "blips": ((1, 8), -37.0),
    "double": ((9, 24), -27.0),
    "voice_dbl": ((33, 40), -27.0),
    "answer": ((33, 40), -23.0),
    "descant": ((61, 64), -25.0),
    "droplead": ((49, 56), -22.5),
    "chops": ((49, 56), -17.5),
    "harm": ((61, 62), -24.0),
    "noisebed": ((1, 4), -44.0),
}

# per-bar-range gain offsets (dB) for arrangement dynamics
GAIN_AUTO = {
    "double": [(33, 40, 4.0), (57, 64, 5.0), (65, 66, 3.0)],
    "voice": [(25, 28, -1.5), (29, 30, -0.7), (33, 40, 1.0), (57, 64, 1.8)],
    "ep": [(25, 28, -2.0), (33, 40, -3.0), (57, 64, -3.0)],
    "arp": [(5, 6, -4.0), (7, 8, -2.0), (25, 28, -3.0), (33, 40, 1.0), (57, 64, 2.0)],
    "saw": [(25, 26, -5.0), (27, 28, -3.5), (29, 30, -1.5), (37, 40, 1.0)],
    "hat": [(9, 16, -2.0), (25, 28, -1.0), (41, 44, -3.0), (45, 48, -1.5)],
    "kick": [(5, 7, -3.0), (9, 16, -1.5), (17, 24, -1.0), (25, 28, -2.5), (29, 30, -1.0), (41, 44, -1.5)],
    "snare": [(9, 16, -1.5), (17, 24, -1.0), (25, 28, -2.5), (29, 30, -1.0), (41, 44, -1.5)],
    "bell": [(1, 8, -2.0)],
    "clap": [(41, 44, -1.5)],
    "stab": [(41, 44, -2.0)],
    "sub": [(5, 8, -3.0), (9, 24, -1.5), (41, 44, -4.5), (45, 48, -3.0), (49, 56, 2.0), (57, 64, 2.0)],
    "mid": [(9, 16, -2.0)],
    "clock": [(33, 40, -4.0), (57, 64, -4.0), (67, 68, 4.0)],
    "drone": [(1, 4, -3.0)],
    "pad": [(41, 48, -3.0), (67, 68, -2.0)],
}

BRIDGE_FILTERED = {"stab": 1.0, "pad": 1.0, "marimba": 2.2, "mid": 0.6, "arp": 1.0, "ep": 1.0}


def gain_curve(spec, n=TOTAL):
    g = np.ones(n)
    for b0, b1, dbv in spec:
        a = at(b0)
        b = at(b1 + 1)
        r = int(0.01 * SR)
        seg = np.full(b - a, db(dbv))
        seg[:r] = np.linspace(1, db(dbv), r)
        seg[-r:] = np.linspace(db(dbv), 1, r)
        g[a:b] *= seg
    return g


def body_ref_db(x):
    """Look-ahead sung level: 200 Hz-2 kHz RMS envelope, max-held over +-150 ms (so a phrase-initial
    consonant is judged against the vowel it leads into, not the silence before it)."""
    from scipy import ndimage, signal as ss

    body = ss.sosfilt(ss.butter(2, [200.0, 2000.0], "bandpass", fs=SR, output="sos"), x)
    e = np.sqrt(dsp.onepole_lp(body * body, dsp.onepole_coef(1000.0 / (2 * np.pi * 10.0))))
    return ndimage.maximum_filter1d(20 * np.log10(e + 1e-9), int(0.3 * SR))


def deharsh(x, offset_db=-6.0, ratio=4.0, max_gr=12.0):
    """Relative dynamic EQ (de-harsh + de-ess): the 2-5 kHz band may not exceed the sung level - 6 dB and
    the 5-10 kHz band the sung level - 9 dB; above that they are compressed 4:1 (1 ms attack, 40 ms
    release). Sustained vowels sit far below the thresholds and are untouched."""
    from scipy import signal as ss

    ref = body_ref_db(x)
    for lo, hi, off in ((2000.0, 5000.0, offset_db), (5000.0, 10000.0, offset_db - 3.0)):
        sos = ss.butter(2, [lo, hi], "bandpass", fs=SR, output="sos")
        band = ss.sosfilt(sos, x)
        be = np.sqrt(dsp.follow(band * band, float(np.exp(-1 / (0.001 * SR))), float(np.exp(-1 / (0.02 * SR)))))
        excess = 20 * np.log10(be + 1e-9) - (ref + off)
        gr = np.minimum(np.maximum(excess, 0.0) * (1 - 1 / ratio), max_gr)
        g = 10 ** (-gr / 20)
        g = 1.0 - dsp.follow(1.0 - g, float(np.exp(-1 / (0.001 * SR))), float(np.exp(-1 / (0.04 * SR))))
        x = x - (1.0 - g) * band
    return x


def vox_chain(x):
    g = fx.compressor_gain(x, thr=-22.0, ratio=3.5, knee=8.0, attack=0.004, release=0.09, rms_ms=3.0)
    x = x * g * db(6.0)
    x = deharsh(x)
    x = dsp.softclip(x * 0.9, 1.3)
    return x


def cal_entry(name):
    return CAL.get(name)


def calibration_gain(name, x):
    entry = cal_entry(name)
    if entry is None:
        return 1.0
    (b0, b1), target = entry
    seg = x[:, at(b0):at(b1 + 1)]
    L = pyln.Meter(SR).integrated_loudness(seg.T)
    if not np.isfinite(L):
        return 1.0
    return db(target - L)


def mix(sc, T):
    kicks = sorted(t for t, v, kw in sc.hits["kick"])
    duck = {}
    bridge_lp = None
    sends = {s: dict(plate=np.zeros((2, TOTAL)), hall=np.zeros((2, TOTAL)), delay=np.zeros((2, TOTAL))) for s in STEMS}
    dry = {s: np.zeros((2, TOTAL)) for s in STEMS}
    sub = {}  # sub-group signals for envelopes
    for name, tr in T.items():
        st = STRIP[name]
        x = tr.buf.astype(np.float64)
        if st.get("vox"):
            if st.get("keep_stereo"):
                x = np.stack([vox_chain(x[0]), vox_chain(x[1])])
            else:
                m = vox_chain(0.5 * (x[0] + x[1]))
                x = np.stack([m, m])
        x = dsp.eq(x, st.get("eq", []))
        if st.get("chorus"):
            x = fx.chorus(x, mix=st["chorus"], base_ms=8.0, depth_ms=2.5, rate=0.45)
        if st.get("width") is not None:
            x = fx.width(x, st["width"])
        if name in BRIDGE_FILTERED:
            if bridge_lp is None:
                bridge_lp = automation_curve(sc.auto["bridge_lp"], n=TOTAL)
            pts = sc.auto["bridge_lp"]
            a, b = pts[0][0] - 4 * S16, pts[-1][0] + 4 * S16
            fc = np.full(b - a, 20000.0)
            k = pts[0][0] - a
            fc[k:] = np.minimum(bridge_lp[pts[0][0]:b] * BRIDGE_FILTERED[name], 20000.0)
            for c in range(2):
                seg = dsp.lp(x[c, a:b], fc, 0.9)
                r = int(0.01 * SR)
                seg[:r] = x[c, a:a + r] * np.linspace(1, 0, r) + seg[:r] * np.linspace(0, 1, r)
                x[c, a:b] = seg
        if st.get("sc"):
            d = st["sc"]
            if d not in duck:
                duck[d] = fx.duck_curve(TOTAL, kicks, depth=d, attack=0.003, hold=0.015, release=0.16)
            x = x * duck[d]
        entry = cal_entry(name)
        g = calibration_gain(name, x) * db(st["g"] if entry is None else st.get("trim", 0.0))
        if name in GAIN_AUTO:
            x = x * gain_curve(GAIN_AUTO[name])
        x = x * g
        if st.get("clamp") is not None and entry is not None:
            x, _ = fx.limiter(x, ceiling_db=entry[1] + st["clamp"], lookahead=0.001, release=0.015)
        stem = st["stem"]
        dry[stem] += x
        for k in ("plate", "hall", "delay"):
            if st.get(k):
                sends[stem][k] += x * st[k]
        sub[name] = x
    # returns per stem (each stem owns its reverb/delay so stems sum to the mix). Returns are rendered
    # per segment between the stops that gate the stem, so a tail killed by a stop never resumes after it.
    hall_duck = fx.duck_curve(TOTAL, kicks, depth=0.35, attack=0.003, hold=0.01, release=0.2)
    stems = {}
    for s in STEMS:
        y = dry[s].copy()
        segs = segments(sc, s)
        if np.any(sends[s]["plate"]):
            w = segmented(lambda x, n: fx.reverb(x, rt60=1.3, predelay=0.012, damp_hz=7500.0, size=0.65, seed=1,
                                                 tail=(n - x.shape[1]) / SR), sends[s]["plate"], segs)
            y += dsp.eq(w, [("hp", 220, 2), ("lp", 11000, 2)])
        if np.any(sends[s]["hall"]):
            w = segmented(lambda x, n: fx.reverb(x, rt60=2.8, predelay=0.03, damp_hz=4800.0, size=1.25, seed=2,
                                                 tail=(n - x.shape[1]) / SR), sends[s]["hall"], segs)
            y += dsp.eq(w, [("hp", 250, 2), ("lp", 9000, 2)]) * hall_duck
        if np.any(sends[s]["delay"]):
            w = segmented(lambda x, n: fx.delay(np.pad(x, ((0, 0), (0, n - x.shape[1]))), beats=0.75, fb=0.32,
                                                lp_hz=4500.0, hp_hz=350.0), sends[s]["delay"], segs)
            y += w * 0.8
        stems[s] = y
    return stems, sub


def gated_stops(sc, stem):
    """Stops that silence this stem (the bar-32 break keeps the voice and fx; fx is never gated)."""
    if stem == "fx":
        return []
    return [(a, b) for a, b in sorted(sc.stops) if stem not in sc.stop_keep.get(a, {"fx"})]


def segments(sc, stem):
    """[start, end) spans between the stops gating `stem`: each ends 20 ms into a stop (the gate's tail cut)
    and the next starts when the stop ends (100 ms early for the voice's consonant pre-roll), so nothing
    fed to an effect before or during a stop can ring on after it."""
    stops = gated_stops(sc, stem)
    pre = int(0.1 * SR) if stem == "lead_voice" else 0
    cuts = [(a, b - pre) for a, b in stops]
    if stem == "lead_voice":
        cuts += [(a, b) for a, b in sc.voice_cuts]
    cuts.sort()
    starts = [0] + [b for a, b in cuts]
    ends = [min(a + int(0.02 * SR), TOTAL) for a, b in cuts] + [TOTAL]
    return list(zip(starts, ends))


def segmented(fn, x, segs):
    """Apply a linear time-invariant effect separately to each segment of x (fresh state per segment)."""
    out = np.zeros_like(x)
    for a, e in segs:
        if not np.any(x[:, a:e]):
            continue
        w = fn(np.ascontiguousarray(x[:, a:e]), e - a)
        out[:, a:e] += w[:, : e - a]
    return out


def vocal_space(stems, key, keyed=("chords", "arp"), depth_db=6.5, lo=1000.0, hi=4500.0):
    """Dynamic band dip on the accompaniment keyed by the dry singer (a 'Trackspacer'): the 1-4.5 kHz band of
    chords/arp/lead synth ducks by up to depth_db while the voice/chops sound. Unity when the voice is silent."""
    from scipy import ndimage, signal as ss

    km = 0.5 * (key[0] + key[1])
    sos = ss.butter(2, [lo, hi], "bandpass", fs=SR, output="sos")
    kb = ss.sosfilt(sos, km)
    env = np.sqrt(dsp.onepole_lp(kb * kb, dsp.onepole_coef(1000.0 / (2 * np.pi * 20.0))))
    ref = np.percentile(env[env > 1e-6], 95)
    lv = 20 * np.log10(env / ref + 1e-9)
    amt = np.clip((lv + 30.0) / 24.0, 0.0, 1.0)
    g = 10 ** (-depth_db * amt / 20)
    g = fx._release(np.ascontiguousarray(g), float(np.exp(-1.0 / (0.12 * SR))))
    g = ndimage.gaussian_filter1d(g, 0.004 * SR)
    for st in keyed:
        x = stems[st]
        band = ss.sosfilt(sos, x, axis=-1)
        stems[st] = x - (1.0 - g) * band
    return stems


def bus(stems):
    """Stem bus processing."""
    d = stems["drums"]
    g = fx.compressor_gain(d, thr=-14.0, ratio=2.5, knee=6.0, attack=0.008, release=0.12)
    stems["drums"] = d * g * db(1.5)
    b = stems["bass"]
    m = 0.5 * (b[0] + b[1])
    side = 0.5 * (b[0] - b[1])
    side = dsp.eq(side, [("hp", 180, 2)])
    stems["bass"] = np.stack([m + side, m - side])
    v = stems["lead_voice"]
    g = fx.compressor_gain(v, thr=-18.0, ratio=2.0, knee=6.0, attack=0.01, release=0.15)
    stems["lead_voice"] = v * g * db(1.0)
    return stems


def finish(sc, stems):
    """Mono below 120 Hz + DC/infrasonic high-pass per stem, then re-apply the stop gates so filter
    ringing (e.g. from the tape-stopped sub) cannot leak into a dead stop."""
    dc = signal.butter(2, 18.0, "highpass", fs=SR, output="sos")
    for s in STEMS:
        stems[s] = signal.sosfilt(dc, fx.mono_low(stems[s], 120.0), axis=-1)
    return stop_gates(sc, stems, final=True)


def stop_gates(sc, stems, final=False):
    """Hard stops: a 12 ms tail cut at the stop (none after a tape stop, which already faded out), instant
    reopening on the downbeat. The voice reopens 100 ms early so the next phrase's consonant is intact."""
    n = TOTAL
    taped = {e for _, e in sc.tape_stops}
    r1 = int(0.012 * SR)
    pre = int(0.1 * SR)
    fade = int(0.005 * SR)
    for s in STEMS:
        g = np.ones(n)
        for a, b in gated_stops(sc, s):
            g[a:b] = 0.0
            if a not in taped:
                g[a:a + r1] = np.linspace(1, 0, r1)
            elif final:  # the tape stop already faded out; only catch filter residue
                r = int(0.003 * SR)
                g[a:a + r] = np.linspace(1, 0, r)
            if s == "lead_voice":
                c = max(b - pre, a + r1)
                g[c:c + fade] = np.linspace(0, 1, fade)
                g[c + fade:b] = 1.0
        if s == "lead_voice":
            for a, b in sc.voice_cuts:  # e.g. the near-silent gap before a pickup
                r = int(0.03 * SR)
                g[a:b] = 0.0
                g[a:a + r] = np.linspace(1, 0, r)
        stems[s] *= g
    return stems


def arrangement_gates(sc, stems):
    """Hard stops (tails cut), the bar-32 break (voice + swell only), tape stop and stutter."""
    n = TOTAL
    stems = stop_gates(sc, stems)
    for a, b in sc.tape_stops:
        for s in STEMS:
            if s == "fx":
                continue
            x = stems[s]
            L = b - a
            u = np.arange(L) / L
            speed = (1 - u) ** 1.6
            pos = a + np.concatenate([[0.0], np.cumsum(speed)[:-1]])
            y = np.stack([np.interp(pos, np.arange(n), x[c]) for c in range(2)])
            y *= np.minimum(1, (L - np.arange(L)) / (0.02 * SR))
            blend = 0.6 * np.minimum(1, np.arange(L) / (0.025 * SR))  # LP fades in, no step at the junction
            y = dsp.eq(y, [("lp", 6000, 2)]) * blend + y * (1 - blend)
            x[:, a:b] = y
    for target, t, L, k in sc.stutters:
        for s in ("chords", "bass", "arp", "lead_synth", "drums"):
            x = stems[s]
            seg = x[:, t:t + L].copy()
            f = int(0.002 * SR)
            seg[:, :f] *= np.linspace(0, 1, f)
            seg[:, -f:] *= np.linspace(1, 0, f)
            x[:, t + L - f:t + L] *= np.linspace(1, 0, f)  # the original slice hands over without a step
            for j in range(1, k):
                x[:, t + j * L:t + (j + 1) * L] = seg * (1 - 0.12 * j)
            e = t + k * L
            x[:, e:e + f] *= np.linspace(0, 1, f)  # back into the original without a step
    return stems


def tail_fade(stems):
    from engine.core import SONG_END
    a = SONG_END + int(1.9 * SR)
    for s in STEMS:
        x = stems[s]
        L = TOTAL - a
        x[:, a:] *= np.linspace(1, 0, L) ** 2
    return stems


def lufs(x):
    return pyln.Meter(SR).integrated_loudness(x.T)


def master(stems, target=None, ceiling=-1.2):
    target = S.TARGET_LUFS if target is None else target
    # glue compression computed on the sum, applied to every stem (stems keep summing to the mix)
    mixsum = sum(stems[s] for s in STEMS)
    g = fx.compressor_gain(mixsum, thr=-12.0, ratio=1.8, knee=8.0, attack=0.015, release=0.22, rms_ms=8.0)
    for s in STEMS:
        stems[s] = stems[s] * g
    pre = sum(stems[s] for s in STEMS)
    G = db(target - lufs(pre) + 2.0)
    out = None
    for _ in range(4):
        y = fx.softclip_master(pre * G, threshold_db=-3.0)
        y, lg = fx.limiter(y, ceiling_db=ceiling, lookahead=0.004, release=0.06)
        L = lufs(y)
        out = y
        master.gr = lg
        if abs(L - target) < 0.05:
            break
        G *= db(target - L)
    for s in STEMS:
        stems[s] = stems[s] * G
    return out, stems, G
