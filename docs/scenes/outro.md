# OUTRO — `outro` · bar 64.3 → end · 101.6–110.8 s · word: WRITE · lyric L14

The landing after the loudest section. The showcase's mosaic of sites (the moon over the city) turns
over card by card into the Fumadocs logo; the colour drains to ink + one orange; the intro's clock
returns around the moon; on the minor-iv chord the whole clockwork collapses into the logo lockup and
the film closes on **the night side of its own title card**: 「README█」 became 「WRITE█」. The caret
writes WRITE on the sung う, types `npm create fumadocs-app` on the README motif, the music box walks
a light down the card, and the caret, the film's first image, glides home, blinks once on the
final chime and goes out. Emotion through restraint: one moving idea at a time and long landings.

Code: `mv/src/scenes/outro/` — `index.ts` (timeline + compositing), `cards.ts` (3D flip),
`card.ts` (end card), `fx.ts` (comets, rings), `life.ts` (sheen, playhead, dust), `cues.ts`,
`mock.ts` (dev stand-in for the showcase disc when it isn't loaded).

## Cue sheet (music agent, committed; all on the 16th grid)

| t (s) | bar.beat | music | picture |
|---|---|---|---|
| 101.6 | 64.3 | hook ends | B8 window opens; showcase disc locked (R 300): pass-through |
| 102.0 | 64.4 | **stop**; reverse-cymbal swell → 102.4 | city lights off (showcase); two comets run the rim and meet top-left |
| 102.4 | 65.1 | **Abmaj9** + crash + soft impact | ignition sparkle; **flip wave** starts; a ring leaves the rim; sky desaturates |
| 102.6 / 102.8 | 65.1–65.2 | さ / あ (held → 103.6) | wave crosses the disc; glint band; sky sinks to ink |
| 103.2 | 65.3 | — | moon whole; the intro's **clock dial** draws on, README text ring types on |
| 104.0 | 66.1 | **Abm6** (minor iv) · か | **collapse**: moon + dial shrink and rise into the lockup; frame draws from the corners |
| 104.4–104.8 | 66.2–66.3 | う (held → 105.4) | the big caret is born (flash) and types **W R I T E** on 16ths |
| 104.8–105.6 | 66.3–67.1 | — | tagline word by word on 8ths; 105.2 caret blinks off, 」 snaps shut; か こ う |
| 105.6–106.4 | 67 | **Ebmaj9** · bell motif G5 C6 D6 E♭6 B♭5 · clock 8ths | caret types `npm` · ` create` · ` fuma` `docs` · `-app`, one chunk per note, intro ping per note |
| 106.4–107.2 | 67.3–68 | held B♭5 | the complete card (screenshot frame); playhead steps along the ruler |
| 107.2–107.7 | 68 | music box 8va | the light walks down: moon chime ping → FUMADOCS → sheen across WRITE → tagline |
| 108.0 | 68.3 | held B♭6 | card dims + defocuses; caret glides to (960,540); reverse power-on (ring + hairlines in) |
| 108.6 | 68.4+ | last tick | playhead reaches the end of the ruler (under the dim) |
| 108.8 | 69.1 | **final chime + click** | lines converge, white-hot flash on the caret = the film's frame 0; the one last blink |
| 109.2 | 69.2 | tail | caret OFF forever → INK (default post, = frame 0 minus the caret) to 110.8 |

## Shots

### S0 · LOCK — 101.6–102.4 (window, f.other = showcase)
- 101.6–102.0: the showcase frame passes through untouched (overlay hints: tone only, so L13 keeps
  its 'final' style until it ends).
- 102.0–102.4 (silence + swell): two comets are born at the disc's lit bottom-right (45°), run the
  rim in opposite directions accelerating with the swell (warm trail, white head) and meet at the
  dark top-left at 102.4; a four-point sparkle ignites there. The eye lands where the wave starts.

### S1 · TURN — 102.4–103.2 (Abmaj9)
- Every one of the 312 tiles becomes a physical card: a 4.5 px thick box (instanced, world unit =
  px) whose front samples f.other at its own rect, so frame 102.4 is pixel-identical to the
  showcase frame (verified, max diff 0 inside the disc). A wave along the logo's 45° light axis
  (TL → BR, 0.56 s) turns each card about its vertical axis (spring 1.9 Hz, ζ 0.7) while it lifts
  toward camera. Back = the exact logo gradient at the card's landing position (same maths as
  `drawMoon`); landed cards settle back so their backs sit on z = 0.
- Objecthood (film-wide rule): lighting is computed per fragment from each card's real rotation
  under a key light that sweeps from upper-left toward the top during the turn. Fronts darken as
  they turn away; backs brighten past flat and catch a specular glint (zero face-on), so a glint
  band drifts across the wave. While turning, the edges are opaque two-tone thickness (cream toward
  the light, dark away); they are hidden only at rest. Each turning card casts a soft contact shadow
  onto its right and lower neighbours, computed from its tilt, lift and the light direction. Cards
  are seen through a screen-space disc (clean silhouette under the rim).
- Colour drain outside: the sky desaturates on the downbeat (0.35 s) and sinks to ink by 103.1.
- A 1 px orange ring leaves the rim on the downbeat (the chord ringing). Camera: push-in
  1.00 → 1.10 over bar 65 (in-out sine), so the magic circle fills the frame by 104.0.

### S2 · MOON — 103.2–104.0
- Seams heal per card after landing → a seamless logo moon; at ~103.73 the cards are replaced by
  the 2D `drawMoon` (invisible swap, diff ≈ frame-to-frame noise). Soft halo (screen) grows in.
- The intro's clock returns with weight: `drawClockDial` (r = 1.2 R, text ring at VOCAB's 1.1453 × r) is drawn by two bright pens
  leaving 12 o'clock both ways (0.62 s), each (outward) hour tick stamping a short flash as a pen passes;
  the README text ring types on behind them — a magic circle around the logo. A soft rim light
  slides along the moon's lit edge; dust drifting near the moon catches its orange light. The halo
  follows the harmony (dims on the minor iv, swells on the resolve) and breathes with the real pad
  envelope. Lyric さあ、 (overlay, vertical, anchor [1690, 300]).

### S3 · COLLAPSE → WRITE — 104.0–105.6 (Abm6, かこう)
- On the minor iv the moon (with its dial and text ring) shrinks and rises into the title card's
  lockup position (960, 232, r 34); short ease-in, long out-quart landing (1.3 s); a second ring
  leaves it on the chord change. The title card's frame / marks / rulers draw out from the corners
  (intro's `drawTitleCard` with night colours), header `README.mdx — 01→09 / 09` (the page counter
  rolls through the film's sections), FUMADOCS tracks in under the moon.
- う (104.4): the big caret (title caret size 114×228) is born in the empty brackets with the white
  flash and types W·R·I·T·E on 16ths (glyph and caret move together). 105.2 (blink OFF) the caret
  leaves for the next line and the closing 」 snaps in tight after the word.
- Tagline "Build excellent documentation, your style." word by word on 8ths, "your style."
  landing on the resolve (105.6) in PAPER; か こ う fades in under WRITE (mirror of リードミー).

### S4 · TYPE — 105.6–106.4 (Ebmaj9, bell motif, clock)
- The caret (intro `drawCaret`, 18×36 = one Geist Mono 30 px cell) appears at the orange ❯ prompt
  and types one chunk per bell note in fast keystroke bursts; the intro's motif ping marks each
  landing (scale 0.45, held on the last). Solid while typing, then the film-wide `caretBlink`.
- The credit block 制作 PRODUCTION / Fumadocs / fumadocs.dev resolves at 106.4 in the title
  card's credit position (the overlay's 66–67 credit is dropped; credits hidden from 104.0).

### S5 · END CARD — 106.4–108.0 (music box)
- The screenshot frame: night-side title card, moon + FUMADOCS, 「WRITE」, か こ う, tagline,
  `❯ npm create fumadocs-app█`, credit block, faint dust, an orange playhead stepping along the top
  ruler on every clock tick (8ths, reaching x 1800 on the last tick at 108.6), a slow rim light
  circling the logo. Legibility: 「WRITE」 (PAPER) and the command (WHITE) are the brightest
  elements; tagline #9F9D97 with "your style." #D8D6CE; か こ う at 70 %.
- Bar 68 walks a light down the card on the music-box notes: the moon chimes (held ping), then a
  sheen crosses FUMADOCS, a warm-white sheen crosses WRITE, then the tagline — the eye arrives at
  the caret on the held note.
- Finishing: CA 0.0003 while the card is up (the default splits 1 px lines on black), vignette
  0.14 on the card; the last frames return to the film default = frame 0 (CA 0.0008, vignette 0.22,
  grain 0.04).

### S6 · HOME — 108.0–110.8 (held B♭6 → chime)
- 108.0 (caret ON beat): the card dims ((1−p)², 0.38 s) and defocuses (≤ 9 px); a held ping stays
  where the caret leaves the line; the caret glides to (960,540) (in-out cubic, 0.34 s).
- 108.0–108.8: intro's `drawPowerOn(…, reverse)`: ring contracts, hairline crosshair comes in from
  the frame edges and converges; the white-hot flash peaks exactly on the 108.8 chime + click.
- 108.8–109.2: caret ON with the flash decaying over 4 frames = the film's first frames (mean
  luma 9.28 vs frame 0's 9.29). 109.2: OFF, falling over 3 frames like every blink, never back.
- From 109.25 the picture (ink + grain) sinks to true black with the chime's reverb tail: the
  perceived (dB) decay of the master envelope over ~45 dB (pure black ≈ 110.45).

## Alternatives considered
- B8: implosion (a second climax when we need a landing), dither dissolve (slower read),
  terminator sweep alone (loses "every site is Fumadocs"). The flip carries the meaning and lands
  exactly on the logo.
- End card: centred brand stack / banner composition (sphere right, text left) vs the title-card
  mirror. The mirror wins: the film opens and closes on the same page (day → night, README →
  WRITE), the layout is proven, and the caret's journey has a beginning and an end.
- Ending: caret staying at the end of the command (no bookend), a centred command (unbalanced),
  a camera re-centre (scales the caret off 18×36). The glide keeps the caret identical.

## Layers / composition
- B8: INK → sky (f.other outside the disc, graded) → showcase gaps + rim (f.other) → my gap-wash
  replica (fades in 102.8–103.1) → halo → 3D cards → fx (rim, comets, rings, dial, text ring).
- Card: halo → moon → fx → card layer (dust, card, playhead, pings; blurred on the dim) → caret
  layer (caret, flashes, reverse power-on, departure ping).
- Overlay: tone 'dark'; L14 vertical at [1690, 300] from its pre-roll (102.25); credits hidden
  from 104.0; lyrics hidden from 108.0.

## Contracts
- B8 (showcase → outro): docs/handoffs.md B8 + `scenes/showcase/contract.ts` (imported).
- Caret bookend + title card + dial vocabulary (intro): `scenes/intro/caret.ts`,
  `scenes/intro/title.ts`, `scenes/intro/vocab.ts` (imported, never copied).
- Music cues: as in the table; verified against the final timing.json (motif, L14, ticks, chords,
  riser, impact, chime + click at 108.8 all match). `motifNotes()`, L14, `chimeAt()` and
  `tailFade()` read timing.json / envelopes.json automatically.

## Final polish (2026-10-11)

Reviewed in context (`--only showcase,outro`, `intro,outro` for the bookend): sheets every 2 frames
across 101.6–110.8, every frame around the accents, full-res stills on every downbeat, the
delivered v1 (with overlay) at 1/4 size, an automatic single-frame pop scan over the whole section,
and pixel diffs at both handoffs. Ranked by visibility; all fixed unless marked.

1. **Comets read weakly on a phone** (director note 1). At 1/4 size v1's comets were 1 px specks.
   Now the rim they sweep stays *charged* (4 px warm core + two bloom passes that build with the
   swell), the heads are bigger (6.5 px, white-hot) and throw sparks like a lit fuse, and the whole
   lit circle releases in one white flash on the 102.4 downbeat that the chord ring carries out.
   Reads as "the moon ignites" at 1/4 size. Afterglow decays in 0.18 s so the flip reads by 102.6.
2. **End-card hierarchy** (note 2). v1 read WRITE → tagline → command. Now WRITE → command (Geist
   Mono 44 px, WHITE, one cell = the caret, 1:2 like the intro's) → tagline (Geist 32 px, #8E8C86
   with "your style." #CFCDC5) → credits. Story order kept as brand → promise → call to action: the
   tagline lands on 8ths in bar 66 under the empty command slot, 」 snaps shut with
   "documentation,", ❯ settles on the resolve, the command types on the bell motif. The bar-68
   light sweep now crosses the command instead of the tagline. The terminal caret shrinks from the
   cell size to the intro's 18×36 during the glide home. All paths/commands/URLs are mono.
3. **Optical bracket spacing.** 「 sat ~8 px farther from W's slanted side than 」 from E (measured
   per row): corrected by `OPEN_OPTICAL` = 8 px.
4. **One-frame pop at 105.200** (found by the pop scan): the collapse ring flashed at full opacity.
   At t = t0 + dur, float error gave p = 1 + ε and `(1 − p) ** 1.6` = NaN, which the canvas ignores
   as a globalAlpha. `drawRingOut` now rejects p ∉ [0, 1); every `(1 − x) ** k` was audited.
5. **Bookend drift** (note 5). The intro now draws its power-on *under* the caret (its white flash
   is hidden at frame 0) and blooms its frame (threshold 0.55, strength 0.55, radius 18). The outro
   mirrors both: power-on under the caret, no separate flash, the same bloom from 108.2; the caret
   is fully ON for the chime's beat (the intro's `t < 0.4 ? 1 : caretBlink`); the reverse power-on
   progress is snapped to exactly 1 on the chime (1 − ε drew the ping ring at r 24); the departure
   ping fades before the chime. **108.8 is now pixel-identical to frame 0** over the full frame
   (grain off); frames 4 and 12 after the chime match the intro's frames 4 and 12 in the caret box.
6. **Loop seam** (note 5, director choice (b)): the picture no longer fades to #000 after the
   final blink; it rests on INK + grain (frame 0's background) while the reverb tail rings out. Last
   frame vs frame 0, background: mean |Δ| 3.40 = two consecutive grain-only frames (3.40).
7. **Final blink vs the real chime** (note 4): chime attack measured in readme.wav at 108.800 s
   (+12 dB in 2 ms); the caret's ON frame 6528 is exactly on it. Tail −38 dBFS at 109.2, −60 at
   110.0, −86 at 110.8 over the ink hold.
8. **Velocity discontinuities**: the moon left at 18 px/frame from rest on the Abm6 chord; now it
   takes a small breath (+2.5 %, 0.18 s) into the chord and the collapse ramps up over 3 frames
   (rise in 1.0 s keeps it ≥ 16 px clear of the newborn caret). The 108.0 card dim dropped 9 % in
   one frame; now it starts from rest.
9. **Playhead** stepped on the tick; it now starts 2 frames early and settles on each clock tick.
10. **Banding** (note 3) — measured, no change needed: grain-free, the moon interior has 254 steps
    over 480 px and the card backs 313; the only 8-bit steps are 1-level ones in near-black tails,
    which the finish grain (±5 levels, applied before quantization) dithers. At the preview's
    1.5 Mbps the blotches come from the encoder: an A/B of a baked static dither showed no visible
    gain at identical settings, so it was not kept.
11. Not changed, by design: the deliberate type-on cuts (WRITE glyphs on 16ths, the caret's birth
    flash at 104.383, the 105.2 off-beat) remain the only hard changes in the pop scan.

Verified at the end: B8 takeover 102.383 → 102.4 pixel-identical inside the disc; window frames
101.6–102.0 pixel-identical to showcase rendering alone (overlay on, grain off); pop scan
101.2–103.8 clean; 45–62 ms/frame; `npx tsc --noEmit` clean for the outro.
