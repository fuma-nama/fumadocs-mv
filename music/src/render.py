"""Render 「README」: score -> tracks -> stems -> master, plus timing/envelope/overview exports.

    uv run python src/render.py                     # into out/
    uv run python src/render.py --qc DIR            # also write per-section spectrogram PNGs to DIR
    uv run python src/render.py --timing-only       # just (re)write timing.json
"""

import argparse
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--qc", help="directory for per-section spectrogram PNGs")
    ap.add_argument("--out", help="output directory (default: out/)")
    ap.add_argument("--timing-only", action="store_true", help="only build the score and write timing.json")
    return ap.parse_args()


ARGS = _args()
os.environ.setdefault("NUMBA_CACHE_DIR", os.path.join(ROOT, ".cache", "numba"))  # JIT cache outside src/
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

from engine.core import SR  # noqa: E402
from engine import fx  # noqa: E402
from song import render_parts, mix, export, analysis  # noqa: E402
from song import score  # noqa: E402

OUT = os.path.join(ROOT, "out")


def write(path, x):
    x = fx.tpdf_dither(np.clip(x, -1.0, 1.0 - 2**-23))
    sf.write(path, x.T.astype(np.float64), SR, subtype="PCM_24")


def section_spectrograms(master, stems, qc_dir):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from scipy import signal
    from engine.core import at

    os.makedirs(qc_dir, exist_ok=True)
    for sid, name, a, b in score.SECTIONS:
        s, e = at(a), min(at(b + 1) + int(0.6 * SR), master.shape[1])
        fig, axs = plt.subplots(3, 1, figsize=(16, 11), sharex=True)
        for ax, (label, x) in zip(axs, [("master", master), ("lead_voice", stems["lead_voice"]), ("drums+bass", stems["drums"] + stems["bass"])]):
            m = 0.5 * (x[0, s:e] + x[1, s:e])
            f, t, Z = signal.stft(m, SR, nperseg=2048, noverlap=2048 - 240)
            P = 20 * np.log10(np.abs(Z) + 1e-9)
            ax.pcolormesh(t + s / SR, f, P, vmin=P.max() - 90, vmax=P.max(), cmap="magma", shading="auto", rasterized=True)
            ax.set_yscale("symlog", linthresh=300)
            ax.set_ylim(30, 20000)
            ax.set_title(f"{name} — {label}", fontsize=9)
            for bar in range(a, b + 2):
                ax.axvline(at(bar) / SR, color="w", lw=0.6, alpha=0.5)
        plt.tight_layout()
        plt.savefig(os.path.join(qc_dir, f"{a:02d}_{sid}.png"), dpi=70)
        plt.close(fig)


def main():
    args = ARGS
    out_dir = args.out or OUT
    t0 = time.time()
    os.makedirs(os.path.join(out_dir, "stems"), exist_ok=True)
    sc = score.build()
    if args.timing_only:
        export.timing(sc, os.path.join(out_dir, "timing.json"))
        print(f"timing.json written to {out_dir} in {time.time() - t0:.1f}s")
        return
    tracks = render_parts.render(sc)
    print(f"tracks rendered ({len(tracks)}) in {time.time() - t0:.1f}s")
    stems, sub = mix.mix(sc, tracks)
    stems = mix.vocal_space(stems, sub["voice"] + 0.5 * sub["chops"] + sub["harm"])
    stems = mix.bus(stems)
    stems = mix.arrangement_gates(sc, stems)
    stems = mix.finish(sc, stems)
    stems = mix.tail_fade(stems)
    master, stems, G = mix.master(stems)
    pre = sum(stems[s] for s in mix.STEMS)
    print(f"mixed + mastered in {time.time() - t0:.1f}s (pre-limiter gain {20 * np.log10(G):+.2f} dB)")
    write(os.path.join(out_dir, "readme.wav"), master)
    peak = max(np.max(np.abs(stems[s])) for s in mix.STEMS)
    stem_gain = min(1.0, 10 ** (-0.3 / 20) / peak)
    for s in mix.STEMS:
        write(os.path.join(out_dir, "stems", f"{s}.wav"), stems[s] * stem_gain)
    print(f"stems written at {20 * np.log10(stem_gain):+.2f} dB relative to the pre-limiter master bus")
    for k in sub:
        sub[k] = sub[k] * G
    export.timing(sc, os.path.join(out_dir, "timing.json"))
    export.envelopes(os.path.join(out_dir, "envelopes.json"), master, stems, sub)
    export.overview(os.path.join(out_dir, "overview.png"), master, analysis.short_term(master))
    text, _ = analysis.report(master, stems, pre, sc)
    print(text)
    print(analysis.gr_report(mix.master.gr))
    if args.qc:
        section_spectrograms(master, stems, args.qc)
    print(f"done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
