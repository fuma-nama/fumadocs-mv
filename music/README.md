# 「README」 — soundtrack for the Fumadocs MV

Original ~111 s instrumental (150 BPM, 68 bars + tail) rendered entirely from code: a small
synthesis/sequencing/mixing engine in Python (numpy + numba), with no samples. The structure,
cue points and lyric/mora list follow `../docs/music-spec.md`.

## Render

```sh
cd music
uv sync                                      # Python 3.12 venv in .venv (numpy, scipy, numba, pyloudnorm, …)
uv run python src/render.py                  # ≈ 40 s on an M-series Mac, writes out/
uv run python src/render.py --qc DIR         # also writes per-section spectrogram PNGs to DIR
uv run python src/render.py --out DIR        # render somewhere else (A/B, checks)
uv run python src/render.py --timing-only    # only build the score and write timing.json
```

The render is deterministic: every random source is seeded. It prints a QC report: integrated
loudness, true peak, clipping, DC, loudness per section, low-end mono check, onset-grid
deviation, a scale check of every pitched note, and limiter gain reduction.

## Outputs (`out/`)

| file | content |
|---|---|
| `readme.wav` | master (v2), 48 kHz / 24-bit stereo, 111.2 s (68 bars = 108.8 s + 2.4 s tail) |
| `stems/{drums,foley,bass,chords,arp,lead_voice,lead_synth,fx}.wav` | same length, 24-bit; each stem carries its own reverb/delay returns. They are written 4.3 dB below the master bus so none clips (the render prints the exact figure); their sum raised by that amount is exactly the master bus before the soft clipper + true-peak limiter |
| `timing.json` | sections and every event in seconds (see below) |
| `envelopes.json` | 60 fps, frame *i* = *i*/60 s: normalised RMS for master, kick, snare, hats, bass, chords, lead, fx (+ arp, foley), plus an `onset` (spectral-flux) curve |
| `overview.png` | waveform, spectrogram and short-term loudness with section markers |

`lead_voice` holds the formant singer (lead, chorus double-tracks, harmonies, drop chops), so
muting it removes every "vocal". `lead_synth` (the clean square/saw double and the drop lead)
still carries the melody without it.

### timing.json

`{ bpm, beatsPerBar, sampleRate, duration, sections[], events{} }`. All times are seconds on the
16th-note grid (0.1 s), except six CLI-scene foley flams on 32nds. Every value is a whole 60 fps frame.

- `kick, snare, clap, hatClosed, hatOpen, crash, impact, shaker, ride, tom, downlifter`: onset times
- `riser`: `{start, end, kind}`: `noise` sweeps, `reverse` cymbal swells (incl. the ones inside
  stops), and the `swell` under the bar-32 break
- `stop`: `{start, end}`: full stops 12.4, 50.4 (break: voice + swell only), 76.4, 89.2, 102.0
- `foley`: `{t, type}` with `click` (power-on 0.0, mouse, final 108.8), `tick`, `typewriter`, `ding`,
  `gear`, `paper`, `servo`, `blip`, `enter`, `clunk`, `flutter` (+`dur`), `cursor`, `chime`
- `chords`: `{t, dur, name, display, midi}`; `midi` = sub-bass note + the voicing
- `lead`: one entry per mora `{t, dur, midi, line, mora, romaji, vowel}`. `t` is the vowel onset
  (consonants are sung just before it, as a singer does). っ is listed as its own mora
  (`romaji "s"`, `vowel "-"`, silence) and ん has vowel `n`. `leadHarmony` holds the second
  voices (L11 take two, L13 hook) so `lead` has no duplicates.
- `chops`: drop vocal chops `{t, dur, midi, syllable}` (fu / ma / do)
- `motif`: README motif notes `{t, dur, midi, instrument}`
- extras: `sweep` (filter openings), `tapeStop`, `stutter`, `dropAccents` (what lands on 76.8 /
  80.0 / 83.2 / 86.4)

Use `events` for hit-accurate sync. The envelopes are for continuous motion: an RMS peak can
trail its hit by 1–2 frames (a kick's energy builds as its pitch sweeps down). The `onset` curve
peaks on the hit frame.

## Song map

Key B minor / D major, final chorus +1 semitone (E♭ major).

| bars | section | chords (one per bar unless split) |
|---|---|---|
| 1–8 | Intro | B pedal drone (Bm9) · 5 Bm7 · 6 G△7 · 7 Em7 · 8 F♯7sus4→F♯7 (stop b4) |
| 9–16 | Verse A1 | Bm7 G△7 Em7 F♯m7 · Bm7 G△7 Em7 F♯7 |
| 17–24 | Verse A2 | same, bar 24 F♯7sus4→F♯7 |
| 25–32 | Pre-chorus | G△7 A6 Bm7 Bm7/A · G△7 A6 F♯7sus4→F♯7 · F♯7 (break b3–4) |
| 33–40 | Chorus 1 | G△7 A7 F♯m7 Bm7 · G△7 A7 F♯m7/B7 Em7/A7sus4→A7 (王道進行) |
| 41–48 | Bridge (dembow) | Bm7 Em7 G△7 F♯7 · Bm7 Em7 G△7 F♯7 (stop b4) |
| 49–56 | Drop | G△7 F♯7 Bm7 D7 · G△7 F♯7 Bm7 D7→G7 (丸サ; fill/stop b3–4) |
| 57–64 | Final chorus (E♭) | A♭△7 B♭7 Gm7 Cm7 · A♭△7 B♭7 Gm7/C7 Fm7/B♭7sus4 (pause b4) |
| 65–68 | Outro | A♭△9 · A♭m6 · E♭△9 (2 bars) · bar 69 chime |

**README motif:** F♯5 B5 C♯6 D6 A5 in the rhythm 8th-8th-16th-dotted 8th-half (a broken Bm(add9)).
It plays in the intro (bars 2 and 4) and is quoted in both choruses (bars 36, 60) and at drop
block 3 (bar 53). It returns +1 semitone in the outro (bar 67 glass bell, bar 68 music box an
octave up).

## Engine (`src/`)

- `engine/dsp.py`: PolyBLEP saw/pulse (4× oversampled above 400 Hz), TPT state-variable filters,
  resonators, RBJ EQ, ADSR, oversampled waveshaping
- `engine/fx.py`: 16-line FDN reverb (plate/hall), tempo ping-pong delay, chorus, compressor,
  kick-keyed sidechain shaper, M/S low-end mono, look-ahead true-peak limiter
- `engine/synths.py`: FM e-piano, supersaw (4× oversampled), plucks, FM glass bell, music box, sub/mid/FM-growl
  bass, pads, drone
- `engine/drums.py`: 909/808-style kit; crash/ride/china built from band-split noise whose highs decay first, plus a
  dense mode cloud and a stick transient; risers/impacts; plus the
  "document machine" foley: clock, typewriter, return key, gears, paper, servo, floppy, mouse,
  data blips
- `engine/voice.py`: the singer. A 2× oversampled glottal saw drives a 5-formant Klatt cascade
  whose targets morph per mora vowel (formants scaled ×1.1 from the spec table). It adds
  articulated consonants (plosive bursts and aspiration, fricatives, nasal murmur, flaps, glides),
  っ closures, portamento, phrase scoops and delayed vibrato. Per-frame loudness compensation
  keeps every mora even.
- `song/melody.py`: every lyric line note-by-note (one note per mora), the chops and the motif
- `song/score.py`: chord chart and all section patterns as data
- `song/render_parts.py`, `song/mix.py`: tracks → channel strips (each calibrated to a target
  loudness in a reference section), sends, stems, stops, tape stop, stutter, a vocal-keyed
  1–4.5 kHz dip on the chords/arp, a relative dynamic EQ on the vocals, reverb/delay rendered per
  segment between stops, and the master (glue comp → soft clip → true-peak limiter at −1.2 dBTP, −11.5 LUFS)
- `song/export.py`, `song/analysis.py`: timing/envelopes/overview and QC

No Apple Loops or GarageBand samples are used, so the render needs nothing outside this folder.

## Final polish (v2)

Technical polish only, every item measured. `timing.json` is byte-identical to v1 (same file,
same hash); only the audio, `envelopes.json` and `overview.png` changed. v1 is kept as
`out/readme-v1.wav` + `out/stems-v1/`.

### Defect list (ranked by audibility) and status

1. **Tails came back after every hard stop: fixed.** The stems were silenced during the stops
   (12.4, 50.4, 76.4, 89.2, 102.0), but the 2.8 s hall/plate/delay tails of material from before a
   stop resumed after its downbeat. Reverb and delay returns are now rendered per segment between
   the stops that gate each stem, so a stop kills its tails for good.
2. **Clicks at the bar-48 tape stop: fixed.**
   - At 76.0 the tape stop's darkening low-pass started from cold filter state; it now crossfades in over 25 ms.
   - At 76.4, 12 ms of un-stopped audio leaked after the slowed segment; the stop now begins silent
     after a tape stop.
   - The bar-53 stutter also had a step where its first slice handed over (83.25); it is faded now.
   - Discontinuity scan on the tonal stems (chords/arp/lead synth): 8 → 1. The remaining one is a
     marimba attack.
3. **Stops cut the singer's consonants: fixed.** The "f" of the 76.8 "fu" shout and the "s" of
   「せ」 at 89.6 lost their pre-onset. The voice now reopens 100 ms before a stop's downbeat. Inhale
   breaths that would start inside a stop are dropped, so the stops hold only their swell (checked:
   voice silent in every stop until the pre-roll).
4. **The clean double combed against the voice: fixed.** It was phase-locked to the singer's f0,
   so whole notes were randomly thinned: 42 of 137 notes by more than 1.5 dB, the worst by 7.3 dB.
   It is now a stereo pair detuned ±10 cents. Per-note spread fell from 2.0 to 0.9 dB, the worst
   note from −7.3 to −3.1 dB, and 4 notes remain below −1.5 dB. The `lead` curve in
   envelopes.json changed shape because of this (correlation 0.92 with v1). The master curve
   correlates 0.991 and every other channel ≥ 0.998.
5. **Harsh consonants: fixed.** The fixed-threshold de-esser was replaced by a relative dynamic EQ
   (2–5 kHz held below the look-ahead sung level −6 dB, 5–10 kHz below −9 dB), measured per
   20 ms against the sung level:
   - 2–5 kHz consonant peaks: p95 −1.4 → −4.7 dB, p99 +2.1 → −2.0 dB, max +8.1 → +6.2 dB
   - sibilance max: +6.3 → +4.4 dB
   - sustained vowels: change at most 0.7 dB
6. **Supersaw aliasing ("fizz"): fixed.** Aliasing went from −36 to −38 dB (vs an 8× reference)
   to −61 to −63 dB with 4× oversampled oscillators. Plucks, leads and the double went from 2×
   to 4×. FM bells were checked and are fine at −51 to −63 dB; the e-piano's only aliases fold
   above 20 kHz.
7. **Cymbals sounded synthetic: improved.** The new designs are level-matched to v1 (K-weighted)
   and keep crest factors within 1.7 dB of v1.
   - Crash: was hissy, thin and static, with a constant 8.1 kHz centroid and the 0.4–2.5 kHz body
     13–25 dB down. The new crash is band-split noise whose highs decay first (centroid
     5.8 → 4.4 → 3.7 kHz), with the body restored (−11 / −4 dB), 10–16 kHz down 7 dB, and a
     two-slope decay.
   - Ride: was tonal (11–18 lines more than 20 dB above the local spectrum) and short. It now has
     0 tonal lines and a wash that sustains (−35 dB at 1 s vs −62).
   - China: gained mid "trash" and darkens over time.
   - Big crash downbeats now read stronger on the onset curve (bar 9: 0.71 → 0.86).
8. **Abrupt phrase onsets: fixed.** The vowel attack ramp started at 35 %; it now starts from 0
   (20 ms, or 8 ms after a voiceless consonant). The clean double's gate also no longer rises
   before the onset.

### Checked, no change needed or adopted

- **Low end in the drop and final chorus.** It already matches chorus 1 (30–60 Hz share within
  0.3 dB, mono, correlation 1.000). Kick/sub rebalances were tried and reverted: they lowered the
  drop accents' salience.
- **Final limiter.** A −2 dB clip threshold with 80 ms release gained about 0.1 dB of transient
  crest but doubled limiter time, so v1's chain was kept. With v2's mix:
  - share of 10 ms windows with more than 0.5 dB gain reduction: 2.89 % → 2.77 %
  - deepest gain reduction: −2.62 → −2.64 dB
  - kick crest at hits in the choruses/drop: +0.10 to +0.21 dB; snare +0.07 to +0.21 dB (verse A1
    −0.13 dB, from the fuller crash wash)
- **Section balance.** Every stem is within ±0.25 dB of v1 per section (outro master +0.5 dB).
  Drop block accents (onset vs other downbeats): 1.52 / 1.63 / 1.64 / 1.89 vs v1 1.53 / 1.54 /
  1.64 / 1.89.

### Known weaknesses left

- The singer's intelligibility and "cuteness" are designed and measured but not verified by ear.
- The cymbals and kit are still synthetic.
- The drop's 1.6–5 kHz is darker than typical future-bass references.
- The doubler still beats slowly, as any doubler does.
