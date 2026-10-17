# INTRO — `intro` · bars 1–9 · 0.0–14.4 s (renders to 15.6 for B1) · word: README

The boot of a precision instrument. One orange caret in the dark calibrates a clock, pulls
itself into a line, draws the film's page tree as a dial on a floor, comes home as the moon,
raises eight monolith pages (= the eight chapters of the film), flashes a preview of every
chapter, stops — and the page opens: 「README」.

**One figure carries the eye the whole time: the orange caret → line head → dot → moon →
(montage anchor) → caret on the title.** Everything else is ink, paper, white hairlines.

## Music map (music agent's committed plan; re-checked against timing.json when it lands)
| t (s) | event | picture |
|---|---|---|
| 0.000 | power-on click + sub thump | caret snaps on, crosshair shoots to the edges, ring ping |
| 0.0–6.2 | clock ticks on 8ths | clock hand / dot steps |
| 1.6 1.8 2.0 2.1 2.4(–3.2) | motif 1: F#5 B5 C#6 D6 A5(held) | caret→line; dot hops node to node; held note = dot sweeps the ring closed |
| 3.2–4.6 | ticks only | dot ticks round again; each landing sprouts that chapter's pages |
| 4.8 5.0 5.2 5.3 5.6(–6.4) | motif 2: F#5 B5 C#6 D6 E6(held) | dot climbs outward ring by ring, each ring snaps on; held note = crane down, dot comes home |
| blips ≈0.6 1.1 2.9 3.5 3.9 4.2 4.6 5.8 6.1 6.9 8.9 9.4 9.9 | data blips (16ths) | HUD readout flickers / label glitches |
| 6.4… | muffled kick every beat, 16th ticks + arp, filter sweep 6.4→12.4 | 3D void: moon inflates, monoliths rise per kick, light pulses |
| 9.6→12.4 | noise riser | montage |
| 11.2 11.4 11.6 11.8 / 12.0 12.1 12.2 12.3 | snare 8ths / 16ths (kick b1–3) | strobe cards |
| 12.4–12.8 | full stop + reverse cymbal | black, one 1 px line growing with the swell |
| 12.8 | impact + crash + paper slide | the page flips open: title card |
| 13.0 | L1 first mora ま (overlay) | lyric on the white page (overlay, bottom-left) |

## World (one space for bars 1–8)
Floor y = 0, dial centred at the origin, top-down camera first (looks flat 2D), then a crane
into perspective. Rings (world units): construction R0 1.6 · chapters R1 4.0 · pages R2 5.5 (file
names run outward to ~8.2) · clock dial R3 8.6 (ticks outward) · numbers 9.32 · text ring RT 9.85.
**Phone legibility (director pass 2):** main ring + trunk 2 px with a soft 6 px glow, branches
1.6 px, dial 1.75 px, ticks 1.5/2 px; labels in Geist ≥ 13 px at the widest framing (page 0.32,
chapter 0.34 world units), numbers 0.42; camera 72 → 43 px/unit over bars 1–4 so the ring is ~53 %
of frame height in bar 1 and the full dial ~80 % by bar 4. Every 8th-note event of bars 1–4 leaves
a floor ping (orange = motif note, white = clock event): bar-1 marks, motif hops, the held-note
sweep, every bar-3 sprout, the landing home; the text ring ticks on the 8ths from 5.4. Eight chapters at 45° steps,
clockwise from 12 o'clock = the eight later sections, labelled with real Fumadocs doc paths:
01 READ `markdown/` · 02 NAVIGATE `navigation.mdx` · 03 ARRANGE `ui/layouts/` · 04 COLOR
`ui/theme.mdx` · 05 CUSTOMIZE `cli/` · 06 CONNECT `integrations/` · 07 PUBLISH `deploying/` ·
08 WRITE `page-conventions.mdx`; 2–4 child pages each (`twoslash.mdx`, `docs.mdx`,
`notebook.mdx`, `openapi/`, `static.mdx` …). Root at the centre = `README.mdx`.
Lines are drawn in 2D by projecting world points through the same three.js camera (crisp 1 px
at any angle); text on the floor (dial numbers, text ring) is foreshortened per glyph; file-name
labels are screen-upright with leader lines (P1PE annotation). The dot is screen-space (constant
size) at a projected world point. 3D (moon, monoliths, reflections, fog) uses the same camera.

## Shots

### S1 · bar 1 (0.0–1.6) · POWER ON — the hook
- f0 (0.000, click): INK frame; the orange block caret (18×36, centre) is ON with a white-hot
  flash; 1 px hairlines shoot from it to the four frame edges (heads 0–0.14 s outExpo, tails
  follow 0.12–0.5 s) leaving 16 px registration ticks at the edge midpoints; a 1 px ring ping
  expands to ~324 px (0–0.8 s). Instant, crisp, mechanical. (`caret.ts drawPowerOn`)
- Clock (8ths): a thin clock hand (1 px, 30 % white) from the caret ticks 45° per tick
  (quartz jump: 4-frame outExpo + 1-frame settle), and on each tick a calibration mark +
  index `01…08` is placed at R1 — the eight chapter positions are measured out, one revolution
  per bar. The hand is back at 12 o'clock at 1.6, exactly where the caret will stretch.
- Caret blinks on the beat (on b1/b3, off b2/b4; `caretBlink`).
- HUD boots on ticks (mono 12–13 px, 45–60 % white): 0.2 boxed README (top-left), 0.4 time
  code (top-right), 0.6 blip → `LN 1, COL 1 · README.mdx · 0 B` (bottom-left), 0.8 `150 BPM ·
  4/4 · MDX` (bottom-right). Blips flicker one readout for 2 frames.
- Eye: the caret, then the hand's sweep around it. Exit: the hand points up at 1.6.

### S2 · bar 2 (1.6–3.2) · THE LINE — motif statement 1
- 1.6 (F#5): the caret is pulled up like taffy along the hand: top edge shoots to the 12 o'clock
  mark (outExpo 0.12 s), width collapses to 1 px, colour cools to white; its mass gathers at the
  top as the orange DOT (r 5 px, glow). A white 4 px square stays at the root (`README.mdx`).
  Ping at node 01.
- 1.8 / 2.0 / 2.1 (B5 C#6 D6): the dot hops clockwise along R1 to nodes 02, 03, 04 — each hop is
  a 7-frame outExpo arc drawn behind it (short comet trail), landing = ping ring (1 px, r 6→60 px,
  0.8 s) + node square stamps + label types on 16ths. The 16th double (2.0/2.1) reads as a
  stutter-step.
- 2.4 (A5 held → 3.2): hop to 05 with a double ping, then the dot keeps going at clock pace —
  45° per 8th tick, smooth — through 06 (2.6), 07 (2.8), 08 (3.0) and closes the ring at 01 on
  3.2. The held note *sustains* as a sweep.
- Camera: top-down, slow pull-back (R1 ≈ 250 px → whole dial visible by bar 4) + slow roll
  (−6° over bars 1–4). Eye: the dot.

### S3 · bar 3 (3.2–4.8) · GROWTH — ticks
- The dot ticks around R1 once more (quartz steps on each 8th). Each landing on chapter k sprouts
  its pages: white 1 px branches shoot outward (radial run → TOC-style Bézier S-join → arc run →
  radial stubs) to R2 page squares; file names type on in mono. A ripple of growth runs round the
  clock in one bar. Blips glitch individual labels.
- HUD counters (`nodes 09/31`, `3.4 kB`) tick with the growth. Camera keeps pulling back and
  begins a hint of tilt (−90° → −82°).

### S4 · bar 4 (4.8–6.4) · THE INSTRUMENT ASSEMBLES — motif statement 2 → crane
- The dot climbs outward on the rising notes and each ring it reaches snaps on:
  4.8 (F#5) → R2 (page ring, dashed) · 5.0 (B5) → R3 dial ring + 60 minor ticks draw both ways
  from the dot · 5.2 (C#6) → 12 major ticks + `01…12` numbers flip in (flap-display) ·
  5.3 (D6) → text ring `README · INTRODUCTION · QUICK START · …` types round and starts rotating.
  Pings on each note.
- 5.6 (E6 held → 6.4): the camera cranes down (pitch −82° → −10°, descending to the 6 o'clock
  side inside the chapter ring) while the dot glides home along the 12 o'clock spoke to the root
  (arrives ≈ 6.1) and swells with the held note. The dial becomes a magic circle on a floor.
  Labels thin out (only chapter labels survive). Eye: the dot coming home.

### S5 · bar 5 (6.4–8.0) · THE VOID — kick enters
- Camera (one spline, bars 1–6, `camera.ts`): during the held E6 a spiral dive (5.6–6.4) swings
  round to the gap between monoliths 04/05 (az 22.5°) while the lens lengthens 40° → 28°; bar 5 is an
  elevated 3/4 view of the temple from outside the ring.
- 6.4 (kick): the dot (9 px) inflates into the MOON (shared `moonMaterial`, r 0.7, outBack 0.38 s) —
  it starts as a fully orange ball (bg uniform = ORANGE) and cools into the logo gradient by 6.95.
  Glossy floor = blurred mirror pass at 0.55; warm light pool + white ripple on every kick; dust.
- Kicks 6.4 / 6.8 / 7.2 / 7.6: monolith pairs rise out of the floor, far pair first (08+01, 07+02,
  06+03, 05+04) — the ring closes toward the camera. Monoliths = page slabs 1.3 × 3.0 × 0.1 (custom
  shader; rise = visible fraction with the face texture sliding up), white line-art edges (render3D),
  faces = real UI plates graded to monochrome (orange kept): docs article, the real TOC, Notebook/
  Flux layouts, swatches, CLI + Files, request packet, showcase sites, `npm create fumadocs-app`.
- Top-corner HUD returns at 0.55 alpha (boxed README, time code).

### S6 · bar 6 (8.0–9.6) · ORBITS — the moon rises, the camera goes through the gap
- 8.0: the moon lifts (y 0.7 → 1.55 by 9.6, inOutCubic), its reflection separating.
- 8.0 / 8.4 / 8.8: three orbit rings draw on around the moon (`orbits.ts`, depth-split front/back
  around the moon): the eight chapter words, `README.mdx · FUMADOCS · 150 BPM …`, and a dashed ring of
  8 square nodes whose running light follows the arp's 16ths (one node flares orange per tick).
- The outer text ring on the floor ticks like a clock on every 16th from 6.4.
- The camera descends and dollies through the gap between monoliths 04/05; 9.35–9.6 it pushes
  into the moon until its gradient fills the frame.

### S7 · bar 7 (9.6–11.2) · MONTAGE I — from inside the moon (8ths)
- We are inside the moon (it is hidden): the eye looks out at the eight page faces in order, whipping
  45° per 8th (whip = outExpo 0.05 s before → 0.12 s after the 8th, directional motion blur),
  2.5 % push during each hold; the landed face gets an exposure flash (2 frames) and full brightness.
  READ · NAVIGATE · ARRANGE · COLOR · CUSTOMIZE · CONNECT · PUBLISH · WRITE = the film's TOC.
- A fixed orange reticle (dot + ring) at frame centre is the guide; its ticks step on the 16ths.
  Counter `0k / 08` bottom-right.

### S8 · bar 8 (11.2–12.4) · MONTAGE II — strobe (snares)
- 8 full-frame cards on the snares (8ths 11.2–11.8, 16ths 12.0–12.3), polarity L D L D L D L D,
  each echoing its section's actual imagery inside a TACTIC diamond: READ's isometric exploded page
  layers with labels · the real TOC with the orange glow · Docs/Notebook/Flux wireframes with one
  orange edge · 12 swatches + a giant vertical COLOR · retro desktop + terminal `npx @fumadocs/cli
  customize` + Files · `POST /planets → 201` · light showcase site mosaic · the caret, huge.
  Outlined number, boxed word, doc path; entry glitch 3/2/1 frames.
- 12.4: the huge caret squashes (0.09 s) into the stop line.

### S9 · 12.4–12.8 · STOP — the line is the edge of a sheet of paper
- 12.4: the huge caret squashes (0.09 s) into a 3 px line: the edge of a real paper sheet (3D mesh,
  thickness ≈ 3 px edge-on) seen exactly edge-on. The edge light spreads from the centre to the full
  width with the reverse swell (the unlit rest of the edge stays faintly visible). 12.68–12.8: the
  sheet tips back 1.2°, showing a sliver of its unlit underside — anticipation.

### S10 · bar 9 (12.8–14.4, held to 15.6) · TITLE CARD — the white page
- 12.8 (impact + crash + paper slide): the sheet is flung from edge-on to face the camera (outExpo
  0.3 s + a 4° overshoot, flat and still at 13.21). Objecthood (treatment §2): lit 3 px paper edges,
  a matte light sweep across the face (dim at grazing angles, exactly 1.0 face-on), a drag S-bend
  proportional to the spin, a soft cast shadow on a dimly lit backdrop, vertical motion blur; the
  sheet scales with its tilt so the corners are never uncovered. 1-frame flash, 5 px shake. From
  13.21 the flat card is returned (pixel-equivalent to the settled 3D sheet).
- Build-in: word + brackets at 12.8 with a 7 px print misregistration snapping in · frame + marks
  13.0–13.45 · moon + FUMADOCS 13.2 · credits 13.4. Static from 13.6 (B1). Caret = caretBlink until
  14.0, then READ owns it (picks it up at 14.4).
- Layout: `TITLE` in `intro/title.ts` (word ink box x 371–1406 / cap top 383 / baseline 610;
  caret 1493,497 114×228; moon 960,232 r 34). Overlay lyric band x 112–900 × y 895–1015 kept clear.

## Alternatives considered
- Hook: (a) caret + crosshair snap + ring + clock hand **[chosen: precise, instant, sets up
  the clock]**; (b) CRT-style power-on line → dot (generic); (c) caret types "README" then
  erases (spoils the title).
- Tree: (a) radial dial — chapters on orbits, circuit routing **[chosen: centred instrument,
  clock/magic circle, becomes the temple floor]**; (b) vertical TOC-path tree (reads as a list,
  awkward in 16:9); (c) orthogonal PCB tree (busy, no clock).
- 2D → 3D: (a) the dial was on the floor all along, crane down, nodes rise as monoliths
  **[chosen: one continuous space]**; (b) match cut on the dot to a new 3D shot.
- Montage I: (a) whip-pans round the monolith ring with the moon as pivot **[chosen]**;
  (b) flat 2D cards for both bars (loses the world); (c) cut to each monolith (no pivot).
- Stop → title: (a) the line is the page edge-on and flips open **[chosen: "open a pure-white
  page"]**; (b) slit/shutter opening (generic); (c) hard flash cut.

## Zones & hints
- 0–12.8: `f.overlay.tone='dark'` (light on the light strobe cards), no lyrics/credits; HUD in the
  corners (mine).
- 12.8→: `tone='light'`; the overlay's L1 verse band (x 112–900, y 895–1015) stays clear.
- Boundary B1 (13.6–15.6, READ owns): static full-bleed card; caret not drawn by me from 14.4.

## Exports for other scenes (side-effect free)
- `intro/caret.ts`: CARET, drawCaret, caretBlink, POWER_ON, drawPowerOn (outro bookend, READ).
- `intro/title.ts`: TITLE layout constants (READ: caret handover; outro: night-side mirror).
- `intro/vocab.ts`: ping ring, clock dial, text ring (flat 2D) with the constants used here.

## Implementation map (mv/src/scenes/intro/)
index (dispatch + setup) · state (shared camera/projector) · cues (timing.json → ticks, motif,
blips, kicks, snares) · world (dial geometry, chapters, page tree) · proj (world→screen, near
clipping, per-glyph floor transforms) · camera (spline camera bars 1–6, floor fog) · dial (2D floor:
hand, marks, tree, rings, labels, pings; the dot's choreography) · boot (bars 1–4) · three-world
(moon, monolith shader, mirror) · faces + plates (monolith faces, real UI plates) · voidphase
(bars 5–6) · orbits · montage (bars 7–8) · finale (stop, flip, title) · title / caret / vocab
(exported contracts) · hud.

## Final polish (round after rough cut v1)

Defect list, most visible first (reviewed: v1 delivered H.264 at 1/4 size, current code with
read loaded, dense sheets around every accent, full-res downbeats).

1. **Bars 1–2 at phone size** — the first impression: the clock hand, calibration marks and
   white pings are 1.5–2 px and vanish at 1/4 size; the calibration ring is only ~53 % of the frame
   height. Every beat needs a crisp event (director note 1).
2. **Path/file labels in Geist** — user note: every path/file/package label must be Geist Mono
   (FONTS.mono); mono runs ~15 % wider → re-space ring and branches, keep ≥ 13 px.
3. **Motion lands after the beat** — the dot hops and hand steps start *on* the cue and settle 3–5
   frames later; they should anticipate and settle on the cue (checklist: sync).
4. **Montage faces too small on a phone** (bar 7) — each boxed section word is ~1/6 of the frame
   wide; frame tighter on the word + UI.
5. **Strobe cards don't echo the sections as they are now** (bar 8, director note 4): READ's
   anatomy/forest, LAYOUT's neon slabs, INTEGRATIONS' key colours, SHOWCASE's night city/mosaic.
6. **Near monoliths cover the moon's reflection** 7.6–8.4 (director note 2).
7. **Impact frame 12.8** — the 1-frame flash leaves a milky grey frame; check the first flip
   frames (director note 5).
8. Banding — checked the delivered H.264 across the moon glow and void: the global grain dithers
   it (no staircases in luminance profiles); keep an eye after changes.
9. Small: chapter 06 page labels crowd (`story/` / `openapi/`); orbit ring 2 contains a file name
   in Michroma (→ mono per the user note).

### Fixed (this round)
1. Bars 1–2 at phone size: bigger framing (84 → 43 px/unit across bars 1–4), the clock hand is a
   3 px bar with a tip disc, the eight chapter marks are numbered P1PE cells (ink → white when the
   dot lights them), every 8th-note event adds a short filled burst to its ping (2.5–3 px rings).
2. Every path/file label (floor labels, orbit ring 2) is Geist Mono; spacing re-checked (no
   collisions at 4.9/5.5 s; ≥ 13 px at the widest framing).
3. Sync: hand steps, dot hops, ring snaps, text-ring ticks, monolith rises and the moon's
   inflation start 1–2 frames early and land on their cue (±1 frame against timing.json).
4. Montage faces framed tighter (fov 44 → 28, aim at the word): the section word reads on a phone.
5. Strobe cards rebuilt to echo the sections as they are now: READ's exploded anatomy parts (real
   crops) · the real TOC · LAYOUT's orange neon slabs · the 12 theme colours (the only colour
   before the chorus) · CLI navy terminal on the grid desktop · INTEGRATIONS' four key colours ·
   SHOWCASE's moon over the site city.
6. The near monolith pair (the gate the camera flies through) now rises on the 9.2 kick, so the
   moon's reflection is clear 6.4–9.2.
7. Impact: the sheet starts 1 frame early (mid-swing on the hit) and the paper itself flares
   instead of the full-frame grey flash; motion blur reduced.
8. Stop line: glow added so it reads on a phone; the unlit edge emerges from INK (no pop at 12.49).
9. Banding: checked the delivered v1 H.264 across the moon glow/void — grain dithers it (noisy,
   monotonic luminance profile); no change needed.
