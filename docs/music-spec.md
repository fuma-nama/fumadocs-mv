# Music spec — 「README」 (Fumadocs MV soundtrack)

Original instrumental for a ~110 s Japanese vocaloid-MV-style showcase video of Fumadocs
(an open-source documentation framework). The picture is cut to this track bar-by-bar, so
the structure and cue points below are hard requirements; everything else is creative freedom.

Mood references (described, not to copy): the anime OP "TACTIC" (Daoko) mixes J-pop with
reggaeton and EDM — cool, dark, monochrome verses that burst into colour at the climax. The
other reference is a precise, mechanical, "designed instrument" vocal-synth MV (P1PE): crisp,
detailed, ticking machinery. Aim for: cool + mechanical verses → euphoric, bright, colourful
chorus → groovy half-time bridge → big drop → modulated final chorus → quiet ending.

## Global

- Tempo **150 BPM exactly**, 4/4, straight (no swing). beat = 0.4 s, bar = 1.6 s, 16th = 0.1 s.
  (Video is 60 fps → 24 frames per beat; keep every event on the grid.)
- Bar 1 beat 1 = t 0.000 s (no pre-roll). 68 bars = 108.8 s, then a natural tail ≤ 2.5 s.
  Total file length ≤ 111.3 s (hard limit < 120 s).
- 48 kHz, 24-bit, stereo WAV. Master: ~-11 to -12 LUFS integrated, true peak ≤ -1.0 dBTP,
  no clipping, no DC, mono-compatible low end (mono below ~120 Hz).

## Structure (bars are 1-indexed; times in seconds)

| # | Section | Bars | Time | On screen | Energy |
|---|---------|------|------|-----------|--------|
| 1 | Intro | 1–8 | 0.0–12.8 | boot sequence, title card | 2 → 5 |
| 2 | Verse A1 | 9–16 | 12.8–25.6 | the reading experience | 5 |
| 3 | Verse A2 | 17–24 | 25.6–38.4 | table-of-contents variants | 5.5 |
| 4 | Pre-chorus B | 25–32 | 38.4–51.2 | layout variants (build) | 6 → 8, stop at end |
| 5 | Chorus 1 | 33–40 | 51.2–64.0 | colour themes — the world bursts into colour | 9 |
| 6 | Bridge C | 41–48 | 64.0–76.8 | CLI, "make it yours" (half-time reggaeton groove) | 5 → 7 |
| 7 | Drop D | 49–56 | 76.8–89.6 | integrations (4 blocks of 2 bars) | 9 |
| 8 | Final chorus | 57–64 | 89.6–102.4 | showcase sites — key change +1 semitone | 10 |
| 9 | Outro | 65–68 (+tail) | 102.4–108.8+ | logo / call to action | 6 → 1 |

### Hard cue points (the picture hits these)

- **t 0.0** — start from silence with a single mechanical click + soft sub thump ("power on").
- **Bars 1–4** — ambient: very quiet mechanical clock ticking (8ths or 16ths), a low drone pad,
  sparse data blips, and the **README motif**: a short 4–5 note glassy bell / music-box figure
  that is the song's signature (it returns in the outro, and may be quoted elsewhere).
- **Bar 5** — muffled kick enters; a 16th-note arp starts with a closed filter.
- **Bars 5–8** — filter opens; snare build in bar 8 (8ths → 16ths) + noise riser.
- **Bar 8 beat 4 (12.4–12.8)** — full stop (silence or only a reverse swell).
- **Bar 9 beat 1 (12.8)** — impact + crash: title card. Verse groove starts.
- **Bar 16 beat 4** — short fill. **Bar 17** — verse A2 adds layers.
- **Bars 29–32** — build intensifies (snare roll in 31–32, riser, rising noise).
- **Bar 32 beats 3–4 (50.4–51.2)** — break: drums out, only the vocal pickup 「さあ」 and/or a swell.
- **Bar 33 beat 1 (51.2)** — CHORUS DROP: crash + impact + full arrangement.
  This is the most important hit in the video (monochrome → colour).
- Crash at bars 33, 37, 57, 61. Fill at bar 40 beat 4.
- **Bar 41 (64.0)** — half-time reggaeton (dembow) groove, filtered, playful. Bars 47–48 build.
  Bar 48 beat 4 — short stop.
- **Bar 49 (76.8)** — DROP D (instrumental, future-bass/electro). Four 2-bar blocks starting at
  bars 49, 51, 53, 55 (76.8 / 80.0 / 83.2 / 86.4 s); give each block's first downbeat a distinct,
  ear-catching accent because each block shows a different integration. Bar 56 beats 3–4: big fill / stop.
- **Bar 57 (89.6)** — FINAL CHORUS, key up +1 semitone, the biggest energy.
- **Bar 64 beat 4** — short pause.
- **Bar 65 (102.4)** — outro: big sustained final chord(s) in bars 65–66; bars 67–68 the README
  motif on bell/music box over a fading pad with the clock ticking.
- **Bar 69 beat 1 (108.8)** — one soft final "end" chime/click; tail to silence.

## Harmony (suggested, adjust freely)

- Home key B minor / D major.
- Intro/verses: cool minor colour (e.g. i–VI–III–VII, or Bm7–G△7–Em7–F♯7), maybe dorian touches.
- Pre-chorus: rising (e.g. G–A–Bm–Bm/A–G–A–F♯sus4–F♯).
- Chorus: 王道進行 royal road IV–V–iii–vi (G△7–A7–F♯m7–Bm7), last 2 bars may resolve differently.
- Bridge: half-time minor groove (Bm7–Em7 etc.).
- Drop: royal road or 丸サ進行 (G△7–F♯7–Bm7–D7).
- Final chorus: +1 semitone (E♭ major royal road: A♭△7–B♭7–Gm7–Cm7).

## Lead "vocal" melody and lyrics

The lead is a synthetic singer: no real vocals, but its melody sets these Japanese lyrics with
**one note per mora** (melisma allowed on long vowels; っ = a short rest/stop; ー = sustain).
Lyrics are displayed on screen at each note onset, so the timing JSON must list every mora.
Lines (target bars are approximate; keep each line inside its section):

| Line | Bars | Lyric (kana) | Morae | Meaning |
|------|------|--------------|-------|---------|
| L1 | 9–12 | まっしろな ページを ひらいて | ma s shi ro na / pe e ji wo / hi ra i te (13) | open a pure-white page |
| L2 | 13–16 | ことばの もりを あるいてく | ko to ba no / mo ri wo / a ru i te ku (12) | and walk through a forest of words |
| L3 | 17–20 | みだしを たどれば まよわない | mi da shi wo / ta do re ba / ma yo wa na i (13) | follow the headings and you won't get lost |
| L4 | 21–24 | もくじが てらす みちしるべ | mo ku ji ga / te ra su / mi chi shi ru be (12) | the table of contents lights the signposts |
| L5 | 25–26 | ならべて | na ra be te (4) | line them up |
| L6 | 27–28 | くみかえて | ku mi ka e te (5) | rearrange them |
| L7 | 29–31 | かたちを かえてゆく | ka ta chi wo / ka e te yu ku (9) | the shape keeps changing |
| L8 | 32 b1–2 | さあ | sa a (2) | now— (pickup into the drop) |
| L9 | 33–36 | いろを えらんで せかいを ぬりかえて | i ro wo / e ra n de / se ka i wo / nu ri ka e te (16) | choose your colours, repaint the world |
| L10 | 37–40 | よんでよ リードミー きみだけの ドキュメント | yo n de yo / ri i do mi i / ki mi da ke no / do kyu me n to (19) | read me — README — docs that are yours alone |
| L11 | 43–44 (repeat 47–48) | きみの ものに | ki mi no / mo no ni (6) | make it yours (rhythmic chant) |
| — | 49–56 | vocal chops only, e.g. "fu", "ma", "do" | — | — |
| L12 | 57–60 | せかいの どこかで ページが ひらく | se ka i no / do ko ka de / pe e ji ga / hi ra ku (15) | somewhere in the world, a page opens |
| L13 | 61–64 | よんでよ リードミー きみだけの ドキュメント | (19, same melody as L10, +1 semitone) | (same as L10) |
| L14 | 65–66 | さあ かこう | sa a / ka ko u (5) | now, let's write |

Melody: catchy, singable, vocaloid-style (wide range, syncopated 8ths/16ths, memorable chorus
hook on 「よんでよ リードミー」). Chorus melody should sit higher than the verses.

## Sound palette

- **Drums**: tight electronic kit — punchy kick (909/808 hybrid), snappy snare + clap layer,
  crisp closed/open hats, shaker, crash/ride, reverse cymbals, noise risers, impacts (sub drop +
  noise burst), downlifters. Verse groove: J-pop electro backbeat; chorus: four-on-the-floor with
  offbeat open hats; bridge: half-time dembow.
- **Mechanical foley as percussion** (the picture has a precision "document machine"): clock ticks,
  typewriter clacks, gear clicks, paper slides, servo whirs — tasteful, rhythmic, quantized.
- **Bass**: sub + mid bass, sidechained to the kick; growlier/FM in the drop.
- **Chords**: electric piano / keys in verses, wide supersaw pads in choruses, future-bass chopped
  chords in the drop.
- **Lead voice**: a cute robotic singer (talkbox/vocoder vibe, not a horror choir): a band-limited
  saw/pulse source through formant filters that morph per mora vowel (Japanese vowels, approx.
  F1/F2/F3 Hz — a 800/1250/2600, i 320/2300/3000, u 350/1250/2300, e 500/1900/2500, o 500/850/2400,
  ん nasal hum ~250/1600/2500), vibrato after ~150 ms, light portamento, a breath/noise burst on
  consonant onsets; doubled quietly by a clean square/saw lead; delay + reverb.
  Keep it as a separate stem so it can be muted.
- **Arps/bells**: glassy FM bells, music box, 16th plucks.
- **FX**: tape stops, beat-repeat stutters at transitions, subtle noise beds.

Allowed raw material: anything you synthesize, plus the locally installed GarageBand / Apple Loops
content (/Library/Audio/Apple Loops/Apple/…, /Library/Application Support/GarageBand/Instrument
Library/…). Its licence allows royalty-free use inside your own original soundtrack; never copy the
raw sample files into the project or distribute them standalone — reference them by path at render
time only.

## Deliverables (all under `music/`)

- `src/…` — the whole synth / sequencer / composition / mix, reproducible with one command
  (document it in `music/README.md`). Python via a uv venv in `music/.venv` is fine
  (numpy, scipy, soundfile, pyloudnorm, pedalboard …).
- `out/readme.wav` — final master.
- `out/stems/{drums,foley,bass,chords,arp,lead_voice,lead_synth,fx}.wav` — same length, sum ≈ master pre-limiter.
- `out/timing.json` — exact event times (seconds):
  `{ bpm, beatsPerBar, sampleRate, duration,
     sections: [{ id, name, startBar, endBar, start, end }],
     events: { kick:[t], snare:[t], clap:[t], hatClosed:[t], hatOpen:[t], crash:[t], impact:[t],
               riser:[{start,end}], stop:[{start,end}], foley:[{t,type}],
               chords:[{t,dur,name,midi:[…]}],
               lead:[{t,dur,midi,line,mora,romaji,vowel}],
               chops:[{t,dur,midi,syllable}], motif:[{t,dur,midi}] } }`
- `out/envelopes.json` — per video frame (60 fps, frame i = i/60 s) normalized 0–1 RMS for
  master, kick, snare, hats, bass, chords, lead, fx, plus an onset-strength curve.
- `out/overview.png` — waveform + spectrogram with section markers.

## Quality checks (you can't listen — verify by analysis)

Look at spectrogram images of each section; measure loudness per section (energy curve should
follow the table); check true peak / clipping / DC; check every pitched note against the section's
scale; check onsets land on the grid; avoid aliasing (PolyBLEP / additive / oversampled
nonlinearities), clicks (fades on every note/sample), mud (high-pass non-bass parts, sidechain),
harshness (tame 2–5 kHz on the voice), and stereo issues (mono bass).
