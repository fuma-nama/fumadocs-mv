"""Score -> dry tracks. Each track belongs to one stem; mixing (EQ, sidechain, sends) is in mix.py."""

import numpy as np

from engine.core import SR, S16, BEAT, TOTAL, Track, hz, at
from engine import dsp, drums, synths, voice
from . import score as S


def automation(points, t):
    """Piecewise-exponential automation value at sample t (points: [(t, value)])."""
    if t <= points[0][0]:
        return points[0][1]
    for (t0, v0), (t1, v1) in zip(points, points[1:]):
        if t0 <= t < t1:
            x = (t - t0) / (t1 - t0)
            return v0 * (v1 / v0) ** x
    return points[-1][1]


def automation_curve(points, n=TOTAL, step=480):
    ts = np.arange(0, n, step)
    v = np.array([automation(points, t) for t in ts])
    return np.interp(np.arange(n), ts, v)


def render(sc):
    T = {}

    def tr(name):
        if name not in T:
            T[name] = Track(name)
        return T[name]

    H = sc.hits
    # ------------------------------------------------------------------ drums
    for t, v, kw in H["kick"]:
        y = drums.kick(v, seed=1)
        if kw.get("muffle"):
            fc = automation([(at(5), 160.0), (at(7), 420.0), (at(8), 1100.0), (at(8, 12), 2400.0)], t)
            y = dsp.lp(dsp.lp(y, fc, 0.7), fc, 0.7)
            y *= 1.0 + 0.25 * (1 - min(fc / 2400.0, 1))  # keep some weight while muffled
        tr("kick").add(t, y)
    for t, v, kw in H["snare"]:
        if kw.get("build"):
            y = drums.snare(v, decay=0.13, seed=int(t) % 97, bright=1.1)
        elif kw.get("dembow"):
            y = drums.snare(v, tone=230.0, decay=0.15, seed=5, bright=1.25)
        else:
            y = drums.snare(v, seed=2)
        tr("snare").add(t, y, pan=0.0)
    for t, v, kw in H["clap"]:
        tr("clap").add(t, drums.clap(v, seed=3), pan=0.0)
    for t, v, kw in H["rim"]:
        tr("snare").add(t, drums.rim(v, seed=4) * 0.7, pan=-0.25)
    for i, (t, v, kw) in enumerate(H["hat"]):
        tr("hat").add(t, drums.hat(v, decay=0.045, seed=10 + i % 4), pan=0.22)
    for i, (t, v, kw) in enumerate(H["ohat"]):
        tr("hat").add(t, drums.open_hat(v, decay=0.32, seed=20 + i % 3), pan=0.15)
    for i, (t, v, kw) in enumerate(H["shaker"]):
        tr("shaker").add(t, drums.shaker(v, seed=30 + i % 5), pan=-0.35)
    for i, (t, v, kw) in enumerate(H["tamb"]):
        y = layer(drums.shaker(v, seed=40 + i % 3, decay=0.11), 0.5 * drums.hat(v, decay=0.09, seed=41, tone=0.85))
        tr("shaker").add(t, y, pan=0.4)
    for t, v, kw in H["ride"]:
        tr("cym").add(t, drums.ride(v, seed=50), pan=0.3)
    for t, v, kw in H["crash"]:
        tr("cym").add(t, drums.crash(v, seed=60 + t % 7))
    for t, v, kw in H["tom"]:
        tr("snare").add(t, drums.tom(kw["m"], v, seed=70), pan=0.15 if kw["m"] > 48 else -0.15)

    # ------------------------------------------------------------------ foley
    for i, (t, v, kw) in enumerate(H["tick"]):
        tr("clock").add(t, drums.clock_tick(kw.get("tock", False), v, seed=i % 6), pan=0.45 if kw.get("tock") else -0.45)
    for i, (t, v, kw) in enumerate(H["type"]):
        tr("machine").add(t, drums.typewriter(v, seed=100 + i % 9), pan=((i * 37) % 11 - 5) / 9)
    for t, v, kw in H["ding"]:
        tr("accent" if kw.get("accent") else "machine").add(t, drums.ding(96, v), pan=0.5)
    for i, (t, v, kw) in enumerate(H["gear"]):
        tr("accent" if kw.get("accent") else "machine").add(
            t, drums.gear(v, clicks=kw.get("clicks", 5), spacing=kw.get("spacing", 0.011), seed=200 + i % 5), pan=-0.55)
    for i, (t, v, kw) in enumerate(H["paper"]):
        y = drums.paper(kw.get("dur", 0.34), v, seed=300 + i, up=kw.get("up", True))
        tr("machine").add(t, np.stack([y, np.roll(y, 240)]))
    for i, (t, v, kw) in enumerate(H["servo"]):
        tr("machine").add(t, drums.servo(kw.get("dur", 0.3), v, kw.get("f0", 170.0), kw.get("f1", 330.0), seed=400 + i), pan=0.3)
    for i, (t, v, kw) in enumerate(H["blip"]):
        tr("blips").add(t, drums.blip(kw["m"], v, seed=i), pan=kw.get("pan", 0.0))
    for i, (t, v, kw) in enumerate(H["cursor"]):
        tr("machine").add(t, drums.blip(98 + (i % 3) * 2, v, dur=0.018, seed=i) * 0.6, pan=0.35)
    for i, (t, v, kw) in enumerate(H["mouse"]):
        tr("machine").add(t, drums.mouse_click(v, seed=450 + i), pan=0.2)
    for i, (t, v, kw) in enumerate(H["enter"]):
        tr("accent" if kw.get("accent") else "machine").add(t, drums.enter_key(v, seed=470 + i), pan=-0.1)
    for i, (t, v, kw) in enumerate(H["clunk"]):
        tr("machine").add(t, drums.clunk(v, seed=490 + i), pan=-0.25 + 0.12 * i)
    for t, v, kw in H["power"]:
        tr("accent" if kw.get("accent") else "machine").add(t, drums.power_on() * v)
    for t, v, kw in H["endclick"]:
        tr("clock").add(t, layer(drums.clock_tick(False, v, seed=7), 0.6 * drums.clock_tick(True, v, seed=8)))

    # ------------------------------------------------------------------ fx
    for t, v, kw in H["impact"]:
        tr("impact").add(t, drums.impact(v, seed=t % 13))
    for i, (a, b) in enumerate(sc.risers):
        tr("riser").add(a, drums.riser((b - a) / SR, seed=500 + i))
    for t, v, kw in H["riser_short"]:
        tr("riser").add(t, drums.riser(kw["dur"] / SR, seed=520, pitch=False) * v)
    for i, (t, v, kw) in enumerate(H["revcym"]):
        tr("revcym").add(t, drums.reverse_cymbal(kw["dur"] / SR, seed=600 + i) * v)
    for i, (t, v, kw) in enumerate(H["downlift"]):
        tr("riser").add(t, drums.downlifter(1.6, seed=700 + i) * v)
    for t, v, kw in H["swell"]:
        n = kw["dur"]
        y = synths.supersaw(kw["chord"], n / SR + 0.05, attack=0.01, release=0.01, cutoff=900.0, seed=9)
        y = y[:, :n]
        x = np.linspace(0, 1, n)
        y *= x**3 * v
        y[0] = dsp.hp(y[0], 200 + 2000 * x**2)
        y[1] = dsp.hp(y[1], 200 + 2000 * x**2)
        tr("swell").add(t, dsp.fade(y, 0.01, 0.004))
    for t, v, kw in H["zap"]:
        n = int(0.35 * SR)
        x = np.arange(n) / SR
        f = 80 + 3600 * np.exp(-x / 0.06)
        y = np.sin(dsp.phase_of(f) + 2.5 * np.exp(-x / 0.1) * np.sin(dsp.phase_of(f * 1.5)))
        y *= np.exp(-x / 0.12) * v
        tr("impact").add(t, dsp.fade(y, 0.0005, 0.02) * 0.8, pan=0.0)
    for t, v, kw in H["noise_hit"]:
        n = int(0.7 * SR)
        x = np.arange(n) / SR
        out = np.stack([dsp.bp(dsp.noise(n, 800 + c), 2600.0, 0.5) for c in range(2)])
        out *= np.exp(-x / 0.12) * v
        tr("impact").add(t, dsp.fade(out, 0.0005, 0.05) * 2.0)

    for i, (t, d, v) in enumerate(sc.beds):
        x = np.arange(d) / SR
        out = np.stack([dsp.bp(dsp.noise(d, 950 + 7 * i + c), 2200.0 * (1 + 0.15 * c), 0.45) for c in range(2)])
        out = dsp.eq(out, [("lp", 7000, 2), ("hp", 300, 2)])
        breathe = 0.75 + 0.25 * np.sin(2 * np.pi * 0.09 * x + i)
        env = np.minimum(1, x / 1.5) * np.minimum(1, (d - np.arange(d)) / (1.0 * SR)) * breathe * v
        tr("noisebed").add(t, out * env)

    # ------------------------------------------------------------------ bass
    N = sc.notes
    for t, d, m, v, kw in N["sub"]:
        rel = kw.get("release", 0.03)
        n = d + int(rel * SR)
        y = synths.sub_bass(np.full(n, float(hz(m))), d, v, release=rel)
        tr("sub").add(t, y)
    for i, (t, d, m, v, kw) in enumerate(N["mid"]):
        n = d + int(0.05 * SR)
        y = synths.mid_bass(np.full(n, float(hz(m))), d, v, cutoff=420.0, env_amt=5.0, decay=0.09, seed=i % 7)
        tr("mid").add(t, y)
    prev = None
    for i, (t, d, m, v, kw) in enumerate(N["b808"]):
        n = d + int(0.05 * SR)
        g = kw.get("glide", 0.0)
        f = synths.glide_freq(n, prev if g else None, m, g)
        y = synths.sub_bass(f, d, v, release=0.04, drive=2.2)
        y += 0.25 * synths.mid_bass(f * 2, d, v, cutoff=300.0, env_amt=3.0, seed=i % 3)
        tr("sub").add(t, y)
        prev = m
    for i, (t, d, m, v, kw) in enumerate(N["growl"]):
        n = d + int(0.05 * SR)
        lfo = kw.get("lfo", 4) * SR / BEAT
        y = synths.growl(np.full(n, float(hz(m))), d, lfo, v, seed=i % 5, vowel_hi=2600.0)
        tr("growl").add(t, y)

    # ------------------------------------------------------------------ chords
    for i, (t, d, ms, v, kw) in enumerate(N["ep"]):
        y = layer(*[synths.epiano(m, d / SR, v, bright=kw.get("bright", 1.0), seed=i * 7 + j) for j, m in enumerate(ms)])
        tr("ep").add(t, y / np.sqrt(len(ms)))
    for i, (t, d, ms, v, kw) in enumerate(N["pad"]):
        y = synths.soft_pad(ms, d / SR, attack=kw.get("attack", 0.3), release=kw.get("release", 0.6), cutoff=2200.0, seed=i)
        tr("pad").add(t, y * v)
    for i, (t, d, ms, v, kw) in enumerate(N["saw"]):
        cut = kw.get("cut", 1.0)
        y = synths.supersaw(ms, d / SR, attack=0.012, decay=0.8, sustain=0.85, release=kw.get("rel", 0.25),
                            detune=0.24 if kw.get("wide") else 0.16, cutoff=1500 + 6500 * cut, cutoff_env=0.6,
                            env_decay=0.25, spread=1.0 if kw.get("wide") else 0.7, seed=i, voices=7)
        tr("saw").add(t, y * v)
    for i, (t, d, ms, v, kw) in enumerate(N["saw_hi"]):
        y = synths.supersaw(ms, d / SR, attack=0.02, release=0.2, detune=0.18, cutoff=9000.0, seed=100 + i, voices=5, os=4)
        tr("saw").add(t, y * v)
    for i, (t, d, ms, v, kw) in enumerate(N["stab"]):
        y = layer(*[synths.pluck(m, d / SR, v, bright=0.7, decay=0.12, seed=i + j) for j, m in enumerate(ms)])
        tr("stab").add(t, np.stack([y, y]) / np.sqrt(len(ms)))
    for t, d, ms, v, kw in N["drone"]:
        y = synths.drone(ms, d, cutoff=380.0, seed=3)
        x = np.arange(d) / SR
        env = np.minimum(1, x / 1.4) ** 2 * np.minimum(1, (d - np.arange(d)) / (0.02 * SR))
        fo = at(7) - t  # fade out across bars 7-8 so the B pedal doesn't rub against F#7
        env[fo:] *= np.linspace(1.0, 0.0, d - fo) ** 1.5
        tr("drone").add(t, y * env * v)
    for i, (t, d, ms, v, kw) in enumerate(N["fbass"]):
        n = d + int(0.06 * SR)
        x = np.arange(n) / SR
        pe = 2 ** (-1.2 * np.exp(-x / 0.025) / 12)
        y = synths.supersaw(ms, d / SR, attack=0.003, decay=0.25, sustain=0.75, release=0.05, detune=0.28,
                            cutoff=8000.0, cutoff_env=0.8, env_decay=0.1, q=0.8, pitch_env=pe, spread=1.0,
                            seed=i % 11, voices=7)
        tr("fbass").add(t, y * v)

    # ------------------------------------------------------------------ arp / bells
    for i, (t, d, m, v, kw) in enumerate(N["arp"]):
        fc = automation(sc.auto["arp_cut"], t) / 4200.0
        y = synths.pluck(m, d / SR, v, bright=min(fc, 1.6), decay=0.09 + 0.05 * min(fc, 1.0), seed=i % 13, fm=0.15)
        tr("arp").add(t, y, pan=0.55 * np.sin(i * 0.9))
    for i, (t, d, m, v, kw) in enumerate(N["bell"]):
        tr("bell").add(t, synths.bell(m, d / SR, v, ratio=3.5, index=1.8, t60=2.0, seed=i), pan=0.25 * ((i % 3) - 1))
    for i, (t, d, m, v, kw) in enumerate(N["marimba"]):
        tr("marimba").add(t, marimba(m, v, seed=i), pan=-0.2 + 0.4 * ((i * 5) % 7) / 6)
    for i, (t, d, m, inst) in enumerate(sc.motif):
        if inst == "musicbox":
            y = synths.music_box(m, 0.75, t60=2.4, seed=i)
        elif inst == "glass":
            y = synths.bell(m, d / SR, 0.75, ratio=2.0, index=2.6, t60=1.6, seed=i, shimmer=0.25)
        else:
            y = layer(synths.bell(m, max(d / SR, 0.9), 0.8, ratio=3.5, index=2.4, t60=2.6, seed=i, shimmer=0.15),
                      0.35 * synths.music_box(m + 12, 0.6, t60=1.6, seed=i))
        tr("motif").add(t, y, pan=0.3 * np.sin(i * 1.7))
    for t, v, kw in H["glass"]:
        y = layer(*[synths.bell(m, 0.6, v, ratio=2.0, index=3.0, t60=1.4, seed=j, shimmer=0.3) for j, m in enumerate(kw["chord"])])
        tr("motif").add(t, y * 0.6)
    for t, v, kw in H["chime"]:
        y = layer(synths.bell(75, 2.0, v, ratio=3.5, index=1.6, t60=2.2, seed=1), 0.4 * synths.music_box(87, v, t60=2.0, seed=2))
        tr("motif").add(t, y)

    # ------------------------------------------------------------------ voices
    syls = [voice.Syl(e["t"], e["dur"], e["midi"], e["romaji"], vel_of(e)) for e in sc.lead]
    v_main, gate, f0 = voice.sing(syls, TOTAL, seed=11, breath=0.04)
    tr("voice").add(0, v_main)
    for i, ph in enumerate(voice.split_phrases(syls)):
        prev_end = max((p.t + p.dur for p in syls if p.t + p.dur <= ph[0].t), default=-SR)
        b0 = ph[0].t - int(0.3 * SR)
        in_stop = any(a <= b0 < e for a, e in sc.stops)  # a stop holds only its swell: no breath there
        if ph[0].t - prev_end > int(0.55 * SR) and not in_stop:
            tr("voice").add(b0, breath_in(seed=600 + i) * 0.05)
    # chorus double-tracks: two detuned, slightly late copies hard-ish left/right
    dbl_lines = S.DOUBLE_LINES
    for side, (cents, ms_late, seed) in enumerate(((+8, 9, 31), (-8, 15, 37))):
        ds = [voice.Syl(e["t"] + int(ms_late * SR / 1000), e["dur"], e["midi"] + cents / 100, e["romaji"], vel_of(e))
              for e in sc.lead if e["line"] in dbl_lines]
        vd, _, _ = voice.sing(ds, TOTAL, seed=seed, breath=0.05)
        tr("voice_dbl").add(0, vd, pan=-0.75 if side == 0 else 0.75)
    hsyl = [voice.Syl(e["t"], e["dur"], e["midi"], e["romaji"], 0.9) for e in sc.harm]
    v_h, _, _ = voice.sing(hsyl, TOTAL, seed=23, breath=0.05)
    tr("harm").add(0, v_h)
    chop = np.zeros(TOTAL)
    for i, c in enumerate(sc.chops):
        ph = voice.build_phrase([voice.Syl(c["t"], c["dur"], c["midi"], c["syllable"], 1.0)], scoop=0.25,
                                vib_depth=0.0, drift_seed=i, fall=0.0)
        y, _, _ = voice.render_phrase(ph, seed=900 + i, breath=0.02)
        a = ph.t0
        chop[a:a + len(y)] += y[: TOTAL - a]
    tr("chops").add(0, chop)
    for name, syl, m, sd, lvl in (("accent_fu", "fu", 83, 77, 0.9), ("accent_do", "do", 86, 78, 0.9)):
        for t, v, kw in H[name]:
            ph = voice.build_phrase([voice.Syl(t, int(0.3 * SR), m, syl, 1.0)], scoop=1.5, vib_depth=0.0, fall=3.0)
            y, _, _ = voice.render_phrase(ph, seed=sd, breath=0.05)
            tr("chops").add(ph.t0, y * v * lvl)
    for t, v, kw in H["china"]:
        tr("cym").add(t, drums.china(v, seed=88))

    # clean lead double from the singer's own pitch track
    tr("double").add(0, lead_double(hold_f0(f0), double_gate(syls, TOTAL)))
    for name in ("answer", "descant", "droplead"):
        for i, (t, d, m, v, kw) in enumerate(N[name]):
            tr(name).add(t, lead_note(m, d, v, bright=1.2 if name != "descant" else 0.9, seed=i))
    return T


def layer(*xs):
    """Sum one-shots of different lengths (mono or stereo)."""
    n = max(x.shape[-1] for x in xs)
    stereo = any(x.ndim == 2 for x in xs)
    out = np.zeros((2, n) if stereo else n)
    for x in xs:
        out[..., : x.shape[-1]] += x
    return out


def vel_of(e):
    pos = (e["t"] // S16) % 16
    return 1.0 if pos % 4 == 0 else (0.95 if pos % 2 == 0 else 0.9)


def breath_in(seed=0, dur=0.24):
    n = int(dur * SR)
    x = np.linspace(0, 1, n)
    nz = dsp.noise(n, seed)
    y = dsp.bp(nz, 1800.0 + 1400.0 * x, 1.2) + 0.4 * dsp.bp(nz, 5200.0, 1.5)
    env = np.sin(np.pi * x) ** 2 * (0.6 + 0.4 * x)
    return dsp.fade(y * env, 0.005, 0.01)


def marimba(m, vel, seed=0):
    f = float(hz(m))
    n = int(0.9 * SR)
    x = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * x) * np.exp(-6.9 * x / 0.7)
    y += 0.5 * np.sin(2 * np.pi * f * 3.93 * x) * np.exp(-6.9 * x / 0.22)
    y += 0.22 * np.sin(2 * np.pi * f * 9.2 * x) * np.exp(-6.9 * x / 0.06)
    y += 0.08 * np.sin(2 * np.pi * f * 2.0 * x) * np.exp(-6.9 * x / 0.3)
    y += 0.25 * dsp.bp(dsp.noise(n, seed), 3.0 * f, 1.5) * np.exp(-x / 0.005)
    y *= np.minimum(1, x / 0.0008)
    return dsp.fade(y * vel, 0.0, 0.03)


def double_gate(syls, n):
    """Causal note gate for the clean double: opens on each sung onset (never before), 6 ms / 40 ms."""
    g = np.zeros(n)
    for s in syls:
        if voice.parse(s.romaji)[0] == "Q":
            continue
        g[s.t:s.t + s.dur] = 1.0
    return dsp.follow(g, float(np.exp(-1 / (0.006 * SR))), float(np.exp(-1 / (0.04 * SR))))


def hold_f0(f0):
    """Carry the last sung pitch through gaps so a releasing note never falls to 0 Hz."""
    idx = np.where(f0 > 0, np.arange(len(f0)), 0)
    idx = np.maximum.accumulate(idx)
    first = int(np.argmax(f0 > 0))
    idx[:first] = first
    return f0[idx]


def lead_double(f0, gate, cents=10.0, spread=0.6):
    """Square/saw lead that follows the singer's f0 (incl. portamento/vibrato) under the voice gate, as a
    stereo pair detuned +-10 cents: a single phase-locked copy would comb against the voice's harmonics
    (random per-note dips), the slowly rotating pair averages that out."""
    out = np.zeros((2, len(f0)))
    for k, c in enumerate((cents, -cents)):
        y = _double_one(f0 * 2 ** (c / 1200), gate, phase=0.37 * k)
        pan = (-spread, spread)[k]
        out[0] += y * np.cos((pan + 1) * np.pi / 4)
        out[1] += y * np.sin((pan + 1) * np.pi / 4)
    return out


def _double_one(f0, gate, phase=0.0):
    act = np.nonzero(gate > 1e-4)[0]
    out = np.zeros_like(f0)
    if len(act) == 0:
        return out
    # process contiguous regions
    edges = np.nonzero(np.diff(act) > 1)[0]
    starts = np.concatenate([[act[0]], act[edges + 1]])
    ends = np.concatenate([act[edges], [act[-1]]]) + 1
    for a, b in zip(starts, ends):
        f = np.maximum(f0[a:b], 60.0)
        y = 0.55 * dsp.pulse_hq(f, np.full(b - a, 0.5), phase) + 0.45 * dsp.saw_hq(f * 1.002, (0.3 + phase) % 1.0)
        y = dsp.lp(y, np.minimum(3600.0, f * 6), 0.6)
        out[a:b] = y * gate[a:b]
    return out


def lead_note(m, d, v, bright=1.0, seed=0):
    f = float(hz(m))
    n = d + int(0.12 * SR)
    x = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.8 * x) * np.minimum(1, np.maximum(x - 0.15, 0) / 0.2)
    fv = f * vib
    y = 0.5 * dsp.saw_hq(fv, 0.1) + 0.5 * dsp.saw_hq(fv * 1.004, 0.6) + 0.3 * dsp.pulse_hq(fv, np.full(n, 0.5), 0.2)
    y = dsp.lp(y, np.full(n, min(9000.0, f * 7 * bright)), 0.7)
    env = dsp.adsr(n, d, 0.005, 0.25, 0.75, 0.1)
    return y * env * v
