"""Deliverables: timing.json, envelopes.json, overview.png."""

import json

import numpy as np
from scipy import signal

from engine.core import SR, BPM, TOTAL, S16, BARS, at
from engine import voice
from .harmony import voicing, bass_note, display
from . import score as S

FPS = 60


def r4(x):
    return round(float(x), 4)


def secs(t):
    return r4(t / SR)


def timing(sc, path):
    H = sc.hits
    ev = {}
    ev["kick"] = sorted(secs(t) for t, v, kw in H["kick"])
    ev["snare"] = sorted(secs(t) for t, v, kw in H["snare"])
    ev["clap"] = sorted(secs(t) for t, v, kw in H["clap"])
    ev["hatClosed"] = sorted(secs(t) for t, v, kw in H["hat"])
    ev["hatOpen"] = sorted(secs(t) for t, v, kw in H["ohat"])
    ev["crash"] = sorted(secs(t) for t, v, kw in H["crash"] + H["china"])
    ev["impact"] = sorted({secs(t) for t, v, kw in H["impact"] + H["noise_hit"]})
    risers = [dict(start=secs(a), end=secs(b), kind="noise") for a, b in sc.risers]
    risers += [dict(start=secs(t), end=secs(t + kw["dur"]), kind="noise") for t, v, kw in H["riser_short"]]
    risers += [dict(start=secs(t), end=secs(t + kw["dur"]), kind="reverse") for t, v, kw in H["revcym"]]
    risers += [dict(start=secs(t), end=secs(t + kw["dur"]), kind="swell") for t, v, kw in H["swell"]]
    ev["riser"] = sorted(risers, key=lambda r: (r["start"], r["kind"]))
    ev["stop"] = [dict(start=secs(a), end=secs(b)) for a, b in sorted(sc.stops)]
    fol = []
    names = {"tick": "tick", "type": "typewriter", "ding": "ding", "gear": "gear", "paper": "paper", "servo": "servo",
             "blip": "blip", "power": "click", "endclick": "click", "chime": "chime", "mouse": "click",
             "enter": "enter", "clunk": "clunk", "cursor": "cursor"}
    for k, typ in names.items():
        fol += [dict(t=secs(t), type=typ) for t, v, kw in H[k]]
    for t, v, kw in H["gear"]:
        if kw.get("clicks", 5) >= 12:  # the long ratchet is the split-flap flutter
            fol = [f for f in fol if not (f["type"] == "gear" and f["t"] == secs(t))]
            fol.append(dict(t=secs(t), type="flutter", dur=r4(kw["clicks"] * kw.get("spacing", 0.011))))
    ev["foley"] = sorted(fol, key=lambda f: (f["t"], f["type"]))
    chords = []
    for b, p, d, name in S.CHART:
        t = at(b, p)
        ms = sorted(voicing(name, 64, 4)) if name != "Bm9" else [47, 54, 59, 61, 62]
        chords.append(dict(t=secs(t), dur=r4(d * S16 / SR), name=name, display=display(name), midi=[bass_note(name)] + ms))
    ev["chords"] = chords
    ev["lead"] = [dict(t=secs(e["t"]), dur=secs(e["dur"]), midi=int(e["midi"]), line=e["line"], mora=e["mora"],
                       romaji=e["romaji"], vowel=voice.parse(e["romaji"])[1]) for e in sc.lead]
    ev["leadHarmony"] = [dict(t=secs(e["t"]), dur=secs(e["dur"]), midi=int(e["midi"]), line=e["line"], mora=e["mora"],
                              romaji=e["romaji"], vowel=voice.parse(e["romaji"])[1]) for e in sc.harm]
    ev["chops"] = [dict(t=secs(c["t"]), dur=secs(c["dur"]), midi=int(c["midi"]), syllable=c["syllable"]) for c in sc.chops]
    ev["motif"] = [dict(t=secs(t), dur=secs(d), midi=int(m), instrument=inst) for t, d, m, inst in sorted(sc.motif)]
    # extras that the picture can use
    ev["shaker"] = sorted(secs(t) for t, v, kw in H["shaker"] + H["tamb"])
    ev["ride"] = sorted(secs(t) for t, v, kw in H["ride"])
    ev["tom"] = sorted(secs(t) for t, v, kw in H["tom"])
    ev["downlifter"] = sorted(secs(t) for t, v, kw in H["downlift"])
    ev["sweep"] = [dict(start=secs(a), end=secs(b), target=tg) for a, b, tg in S.SWEEPS]
    ev["tapeStop"] = [dict(start=secs(a), end=secs(b)) for a, b in sc.tape_stops]
    ev["stutter"] = [dict(t=secs(t), dur=secs(L * k)) for _, t, L, k in sc.stutters]
    ev["dropAccents"] = [dict(t=secs(at(b)), bar=b, sound=s) for b, s in S.DROP_ACCENTS]
    sections = [dict(id=i, name=n, startBar=a, endBar=b, start=secs(at(a)), end=secs(at(b + 1))) for i, n, a, b in S.SECTIONS]
    out = dict(bpm=BPM, beatsPerBar=4, sampleRate=SR, duration=secs(TOTAL), sections=sections, events=ev)
    with open(path, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    return out


def _frame_rms(x, n_frames, hop=SR // FPS):
    m = x if x.ndim == 1 else np.sqrt(0.5 * (x[0] ** 2 + x[1] ** 2))
    m2 = m**2
    c = np.concatenate([[0.0], np.cumsum(m2)])
    idx = np.arange(n_frames) * hop
    a = np.clip(idx - hop // 8, 0, len(m))  # forward-looking window: a hit lights up on its own frame
    b = np.clip(idx + hop, 0, len(m))
    return np.sqrt((c[b] - c[a]) / np.maximum(b - a, 1))


def _norm(v):
    ref = np.percentile(v, 99.7)
    return np.clip(v / (ref + 1e-12), 0, 1)


def onset_strength(x, n_frames, hop=SR // FPS):
    m = 0.5 * (x[0] + x[1])
    f, t, Z = signal.stft(m, SR, nperseg=2048, noverlap=2048 - hop, boundary=None, padded=False)
    mag = np.log1p(np.abs(Z) * 100)
    flux = np.maximum(np.diff(mag, axis=1), 0).sum(axis=0)
    flux = np.concatenate([[0], flux])
    # STFT frame k is centred at k*hop + 1024 samples
    centres = np.arange(len(flux)) * hop + 1024
    out = np.interp(np.arange(n_frames) * hop, centres, flux)
    return _norm(out)


def envelopes(path, master, stems, sub):
    n_frames = int(np.ceil(TOTAL / (SR / FPS)))
    ch = {}
    ch["master"] = master
    ch["kick"] = sub["kick"]
    ch["snare"] = sub["snare"] + sub["clap"]
    ch["hats"] = sub["hat"] + sub["shaker"]
    ch["bass"] = stems["bass"]
    ch["chords"] = stems["chords"]
    ch["lead"] = stems["lead_voice"] + stems["lead_synth"]
    ch["fx"] = stems["fx"]
    ch["arp"] = stems["arp"]
    ch["foley"] = stems["foley"]
    data = {k: [round(float(v), 3) for v in _norm(_frame_rms(x, n_frames))] for k, x in ch.items()}
    data["onset"] = [round(float(v), 3) for v in onset_strength(master, n_frames)]
    out = dict(fps=FPS, frames=n_frames, duration=secs(TOTAL),
               note="frame i = i/60 s; per-channel RMS over [i/60 - 2 ms, (i+1)/60] normalised to its 99.7th percentile, clipped to 0..1; onset = spectral flux of the master, same normalisation",
               channels={k: v for k, v in data.items() if k != "onset"}, onset=data["onset"])
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    return out


# ---------------------------------------------------------------- overview.png

SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK2 = "#52514e"
MUTED = "#8a8985"
BLUE = ["#fcfcfb", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]


def overview(path, master, short_term=None):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.colors import LinearSegmentedColormap

    from matplotlib import font_manager

    names = {f.name for f in font_manager.fontManager.ttflist}
    for fam in ("Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP"):
        if fam in names:
            plt.rcParams["font.family"] = [fam, "DejaVu Sans"]
            break
    cmap = LinearSegmentedColormap.from_list("blue_seq", BLUE)
    t = np.arange(TOTAL) / SR
    mono = 0.5 * (master[0] + master[1])
    fig = plt.figure(figsize=(18, 8.2), facecolor=SURFACE)
    gs = fig.add_gridspec(3, 1, height_ratios=[1.0, 2.2, 0.9], hspace=0.08)
    ax0 = fig.add_subplot(gs[0])
    ax1 = fig.add_subplot(gs[1], sharex=ax0)
    ax2 = fig.add_subplot(gs[2], sharex=ax0)
    for ax in (ax0, ax1, ax2):
        ax.set_facecolor(SURFACE)
        for sp in ax.spines.values():
            sp.set_visible(False)
        ax.tick_params(colors=INK2, labelsize=8, length=0)
    # waveform: min/max envelope per 10 ms
    hop = SR // 100
    k = len(mono) // hop
    seg = mono[: k * hop].reshape(k, hop)
    tt = np.arange(k) * hop / SR
    ax0.fill_between(tt, seg.min(axis=1), seg.max(axis=1), color=INK2, lw=0)
    ax0.set_ylim(-1.05, 1.05)
    ax0.set_yticks([-1, 0, 1])
    ax0.set_ylabel("amplitude", color=INK2, fontsize=8)
    f, ts, Z = signal.stft(mono, SR, nperseg=4096, noverlap=4096 - 1200)
    P = 20 * np.log10(np.abs(Z) + 1e-9)
    P -= P.max()
    ax1.pcolormesh(ts, f, np.clip(P, -90, 0), cmap=cmap, shading="auto", rasterized=True)
    ax1.set_yscale("symlog", linthresh=200)
    ax1.set_ylim(30, 20000)
    ax1.set_yticks([50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000])
    ax1.set_yticklabels(["50", "100", "200", "500", "1k", "2k", "5k", "10k", "20k"])
    ax1.set_ylabel("Hz", color=INK2, fontsize=8)
    if short_term is not None:
        st_t, st_v = short_term
        ax2.plot(st_t, st_v, color=BLUE[5], lw=2)
        ax2.set_ylim(-40, -4)
        ax2.set_ylabel("short-term LUFS", color=INK2, fontsize=8)
        ax2.grid(axis="y", color="#e6e5e1", lw=0.8)
    ax2.set_xlabel("time (s) · bars marked above", color=INK2, fontsize=8)
    ax2.set_xlim(0, TOTAL / SR)
    for sid, name, a, b in S.SECTIONS:
        x = (a - 1) * 1.6
        for ax in (ax0, ax1, ax2):
            ax.axvline(x, color=INK, lw=0.8, alpha=0.55)
        ax0.text(x + 0.25, 1.22, f"{name}\nbars {a}–{b}", color=INK, fontsize=8, va="bottom", ha="left")
    for ax in (ax0, ax1, ax2):
        ax.axvline(BARS * 1.6, color=INK, lw=0.8, alpha=0.55)
    ax0.text(BARS * 1.6 + 0.25, 1.22, f"end chime\nbar {BARS + 1}", color=INK, fontsize=8, va="bottom")
    plt.setp(ax0.get_xticklabels(), visible=False)
    plt.setp(ax1.get_xticklabels(), visible=False)
    fig.suptitle(f"「README」 — 150 BPM · {BARS} bars + tail · master overview", color=INK, fontsize=11, x=0.06, ha="left", y=0.995)
    fig.savefig(path, dpi=110, facecolor=SURFACE, bbox_inches="tight")
    plt.close(fig)
