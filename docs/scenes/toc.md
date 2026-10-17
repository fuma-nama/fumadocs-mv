# TOC — bars 17–24 · 25.6–38.4 s · word: NAVIGATE

Verse A2 (energy 5.5, "adds layers"). Lyrics L3 みだしを たどれば まよわない (17–20, ≈25.8–) and
L4 もくじが てらす みちしるべ (21–24, ≈32.2–). Credit 目次 TABLE OF CONTENTS (21–22, top-left).
Overlay: lyric 'vertical' in the right column x 1640–1830 (monochrome rail/dot here — one orange
dot only); tone 'light' until the bar-19 lights-out, 'dark' after. I keep x ≥ 1600 free.

**The one idea**: the TOC indicator is a guide you follow. One orange dot (the real 4 px TOC
thumb, `primary` = ORANGE) carries the eye through four representations of the *same* table of
contents — the film's own TOC (plates hero page: Reading > Search, Code Blocks · Table of
Contents · Layouts > Docs, Notebook, Flux, Glass > Minimap, Spacious · Themes · Make it yours ·
Integrations > OpenAPI, Obsidian, Sanity, Story · Showcase; 19 items, h2/h3/h4):
**page → city → specimens → compass**. Directions of travel: down (A), toward us (B), down again
in six panels (C), clockwise (D). Monochrome + orange; orange = `primary` = the guide only.

Geometry is rebuilt from source (`toc-geometry.ts`, shared with READ): items Geist 14/20, py 6
(first pt-0, last pb-0) → text box i = [32i, 32i+20]; line x 8.5/16.5/24.5 (clerk 8.5/20.5/32.5);
joins `C ux top−4, x ub+4, x top` (clerk: straight diagonal `L ux ub, x top`); rail = same `d` in
fg/10; active path = `d` in primary clipped to [top(first active), bottom(last active)]; thumb =
4 px dot on offset-path at itemLineLengths (incl. the source's integer `l++` search), 150 ms
transitions; block = from-primary/10 gradient, `inset(top 0 bottom round 8px)`, 300 ms ease-out;
Glass = 4 px muted dots / primary when active, open: `depth^1.5·4 × 1 px` lines + titles, rows
12 → 24 px; popover = 18 px ProgressCircle (stroke 1.5, r 7.5, from 12 o'clock, round cap),
value (lastActive+1)/N; Spacious roll-in = opacity 0, translateY ±0.6em, blur 2 px → 0, 320 ms
cubic-bezier(0.22, 1, 0.36, 1).

Real behaviour, beat-quantised: the active set is the headings on screen. Scrolling down, a new
heading enters at the bottom (range end + 1 → the thumb glides to the new bottom) and the old one
leaves at the top a moment later (range start + 1). I put the **head on the beat and the tail on
the following 8th** — an inch-worm that crawls down the rail in time with kick + hat.

`at(bar, beat)`: 17 = 25.6 · 18 = 27.2 · 19 = 28.8 · 20 = 30.4 · 21 = 32.0 · 22 = 33.6 ·
23 = 35.2 · 24 = 36.8 · 25 = 38.4. Beat 0.4 s, 8th 0.2, 16th 0.1.

---

## A · THE PATH (25.6–28.8, bars 17–18) — 2D vector, light
*Proves*: the default TOC — rail, primary path with Bézier joins, clip-path reveal, the 4 px
thumb on offset-path. Reads instantly because it *is* the UI, 6× bigger.

- **25.6 (B2 contract)**: READ's dive lands with zero velocity on my frame: S = 6, O = (549, −96)
  (screen = O + S·css), "Table of Contents" active (orange), dot centre css (8.5, 116.97) →
  (600, 605.8), rail 6 px fg/10, path 6 px ORANGE, text Geist 84 px #737373 / ORANGE, bg #F5F5F5.
- **Crawl on beats** (head) **+ 8ths** (tail): 25.6 → Layouts · 26.0 → Docs (2→3 join) · 26.4 →
  Notebook · 26.8 → Flux · 27.2 → Glass · 27.6 → Minimap (3→4) · 28.0 → Spacious (4→3) ·
  28.4 → Themes (3→2). Glide 0.22 s, CSS-like ease; text colour fades with it (150 ms in the UI).
- **Camera**: eases in from rest, follows the dot down (0.62 s eased steps, trailing the glide),
  slow pull-back S 6 → 4.2, a dutch building to −2.3° through bar 18 (carried into B's tilt as a
  camera roll), snare punches +1.1 % on the real snare hits (timing.json). Line weights scale
  with S (a physical zoom on the drawing). Vignette eases 0.22 → 0.12 on paper after 26.4.
- **HUD (P1PE annotation, ink + grey, thin)**, builds over the 8 beats, never more than ~3
  live callouts:
  - left of the rail: row cells `03 h2`, `04 h2`, `05 h3`… (mono 14) and a tick ruler;
  - at each join the dot crosses: the cubic's control polygon (P0–P3 as 5 px squares, 1 px
    handles) + `C 16.5 92, 8.5 88, 8.5 96` drawn on in 2 frames, fades over 0.8 s;
  - the thumb: leader line to `offset-distance 156px` (counts during the glide) + crosshair;
  - the clip range: a dimension line between `--track-top` and `--track-bottom`;
  - frame: boxed **NAVIGATE** (Michroma 17, top-left, draws on at 26.0), `toc/default.tsx`;
  - **1:1 inset** (right, x 1304–1500): the real-size TOC column ("On this page" + list) in the
    same state, with the main camera's viewport as an orange rect and its `× 4.65` scale — the
    P1PE detail view that says "this giant thing is that small real UI".
  HUD retracts on 28.45–28.75 (nothing of it survives into the tilt).
- *Exit*: the drawing is exactly the top-down view of B's ground at 28.8.

## B · THE CITY OF HEADINGS (28.8–32.0, bars 19–20) — three.js, lights out
*Proves*: navigation as an experience — "you won't get lost": the guide lights each heading.
- **28.8** the page becomes the ground of a 3D scene (same pixels: top-down perspective camera
  matched to A's S/O). The camera orbits *forward* around the dot (pivot) and pitches up to a
  retreating drone ~40° above the avenue, in front of the dot looking back up the page — so the
  rooftop text stays upright and content keeps streaming *up* the screen like in A.
- **28.82–29.2 lights out**: an iris of darkness closes on the dot (ground shader), the lit disc
  dimming as it shrinks; the dot becomes the only light (orange point light + glow). Rail → faint
  hairline, path → glowing orange avenue. The tilt kicks off on the downbeat (snap ease).
- **29.2 (snare)**: each heading's row extrudes into a monolith (text box = footprint, height
  by depth h2 > h3 > h4), staggered on 16ths outward from the dot; rows spread apart along the
  avenue so the faces read; the Bézier joins become lane changes. Around: dim monolith pages of
  the rest of the docs (procedural blocks) in fog, edge-lit line art (render3D edges).
- **Passes on the real drum hits** (snare 29.2 · kick 29.8 · snare 30.0 · kick 30.4 · snare 30.8 ·
  kick 31.0 · kick 31.4): Make it yours → … → Showcase. Each pass: the face flashes white then
  settles PAPER (active = ORANGE), a **pillar of light** shoots up from the sign and a ground
  ping ring expands — the signposts are lit; the avenue behind the dot keeps glowing (the way
  back). The drone slowly swings round and sinks (az −0.44 → −0.33, d 9.5 → 8.6).
- *Exit 31.45–32.0*: crane up to top-down while the thumb **rewinds** up the rail to "Reading"
  (TOC click → scroll to top, 31.6–31.94, vertical motion blur); the monoliths sink in a wave
  just ahead of it, the city sinks, colours settle to C's dark TOC — the last frame equals C's
  first (pixel-matched, S 4.2, thumb at (760, 420)).

## C · SPECIMENS (32.0–35.2, bars 21–22) — 2D, dark, numbered cells
*Proves*: every TOC style, synchronised to ONE heading sweep (all six move on the same beat).
Layout (keeps credit TL x 128–600 y 84–230 and the lyric column free):
`01 NORMAL · 02 CLERK · 03 BLOCK · 04 MINIMAP` = four list columns (356×560, y 252–812),
`05 POPOVER · 06 ROLL-IN` = two wide bars (728×172, y 828–1000). Boxed labels, cell numbers,
hairline grid, registration marks (P1PE spec sheet); panels #121212 on INK.
- **32.0**: camera starts close on cell 01 (match with B's top-down end), then pulls back one
  step per beat revealing 02 (32.4), 03 (32.8), 04 (33.2), 05 (33.6), 06 (34.0); full sheet from
  34.0, drift + slight dutch. Each reveal = frame draw-on (rectP) + label + content wipe.
- **目次**: the section's giant kanji (Dela Gothic One, outlined, PAPER 10 %) slams in behind the
  sheet on the sung 「もくじ」 (32.2) with parallax — TACTIC typography as depth.
- **Sync line**: from 33.3 a dashed orange hairline with the anchor id (`#flux`) rides the head row
  across the four list panels — the one sweep made visible.
- **Sweep**: idx 0 → 8, one heading per beat (head on the beat, tail on the 8th): NORMAL thumb
  glides through Bézier joins · CLERK clip slides along straight diagonals · BLOCK soft block
  slides (300 ms) · MINIMAP ticks light; on 33.2 they expand to titles (12 → 24 px rows) ·
  POPOVER circle fills (lastActive+1)/19 and the title slides up · ROLL-IN title rolls in.
- *Exit 34.8–35.2*: the NORMAL thumb leaps out of its column in an arc and lands on the head of
  the POPOVER circle's arc while the popover *opens* (circle → primary, chevron up, 150 ms).

## D · MICHISHIRUBE — the magic circle (35.2–38.4, bars 23–24) — 2D, dark
*Proves*: the popover's progress circle (+ Spacious roll-in), as a compass of signposts.
- **35.2–35.62 lift-off** (shared-element transition): the open popover's circle detaches from
  its cell and grows to (960, 540) R 300 with its 3 px stroke and the dot on its head, while the
  sheet leans in ×1.6 and racks out of focus (blur 0 → 14 px) and fades. (A ×22 camera zoom was
  tried first — giant UI text flew through the frame; the lift-off reads far cleaner.)
- Rings: progress arc (ORANGE, round caps, from 12 o'clock clockwise, track 1 px GREY α .5);
  19 headings on a ring outside (Geist 15, sector-centred, upright: top half clockwise, bottom
  half counter-clockwise), unread GREY → current ORANGE → read PAPER; 19-tick ring + numbered
  cells `01–19`; slow counter-rotating dashed/text rings (`ON THIS PAGE · 目次 · NAVIGATE`),
  compass crosshairs N/E/S/W. Centre: the current heading rolling in (roll-in, Geist 56, PAPER),
  `ON THIS PAGE` above, a P1PE % tag below (`47.3684%`).
- **Fill**: idx 9 → 18, accelerating (beats → an 8th → 16ths), the dot rides the arc head; a slow
  push-in (0.955 → 1) lands exactly on R 300 at **37.6 (bar 24 b3, snare + F♯7) = 100 %**: arc
  closes, pulse (gone by 38.1) + a shock ring, `100.0000%`, the dot rests at 12 o'clock.
- *Exit 37.6–38.4 (B3, layout composites my frame untouched)*: the circle sheds its scaffolding
  layer by layer on the bar-24 snare roll (37.8 ticks · 38.0 numbers · 38.1 inner rings · 38.2
  centre · 38.28 guides); from 38.3 only ring (3 px ORANGE, R 300), dot (960, 240) r 7 and the
  heading ring (PAPER, static). LAYOUT squares the ring off and unrolls the headings (verified
  pixel-identical by layout).

---

## Alternatives considered
- **Opening**: (a) pure zoom of the real TOC ✔ — READ's dive lands invisibly and the viewer
  *knows* this UI; (b) rotate the TOC 90° to fill 16:9 — breaks the dive and reading; (c) start
  dark via an inversion on the downbeat — loses the night-falls moment in B.
- **Active range in A**: (a) growing range (long progress line) — not how the UI behaves;
  (b) sliding range with head-on-beat / tail-on-8th ✔ — truthful and rhythmic.
- **City**: (a) chase cam behind the dot — rooftop text upside down, streaming reverses;
  (b) retreating drone in front ✔ — text upright, content streams up as in A, the lit trail
  recedes behind the guide; (c) hinge-up signboards — too close to READ's pop-up forest.
- **Variants**: (a) six equal columns — POPOVER/ROLL-IN are bars, columns too narrow at a
  readable scale; (b) flash-cards one per beat — no sync; (c) spec sheet 4 columns + 2 bars ✔.
- **Magic circle**: (a) polar TOC path as the ring — clever but noisy, needs flattening for
  the handoff; (b) the real progress circle + heading ring ✔ — faithful, clean handoff.

## Contracts
- **B2 (read owns, 24.8–26.4)**: above; READ renders the last part of its dive with my
  `drawTocDefault` (toc-geometry.ts) → pixel-identical switch at 25.6; full handover at 25.6.
  During 24.8–25.6 I render the static 25.6 composition. Post defaults.
- **B3 (layout owns, 37.6–39.2)**: ring centre (960, 540), R 300, 3 px #FA8023 closed from 37.6,
  track 1 px #7C7C84 α .5 covered; no glow at 38.4 (pulse ends 38.1); bg INK; dot (960, 240)
  r 7 static from 37.6; heading arc params in handoffs.md; I keep rendering through 39.2.
- **Overlay**: 'vertical' lyrics (monochrome accent in my section), credit TL 32.0–35.2.

## Implementation map (mv/src/scenes/toc/)
`toc-geometry.ts` default/clerk TOC geometry + exact drawer (shared with READ, LAYOUT, overlay) ·
`ring.ts` heading-ring glyph placements (shared with LAYOUT) · `variants.ts` block / glass /
popover / roll-in drawers · `timeline.ts` CSS-transition maths + schedules · `shotA.ts` ·
`shotB.ts` (three.js city) · `shotC.ts` · `shotD.ts` · `hud.ts` annotation helpers ·
`index.ts` dispatch, dive compositing, post + overlay hints.

## Verification (2026-10-11)
- **Real UI fidelity**: every TOC is a vector redraw diffed against the plates (`plates/out/toc/…`,
  same state, 2×): default light mean |Δ| 0.02/765 · block dark 0.40 (p99 3) · glass expanded 1.3
  (p99 3) · mobile popover bar 0.56 · Spacious trigger 1.15. Baselines follow Chrome's model
  (integer ascent/descent, floored half-leading: Geist 14/20 → 15, 13/20 → 14). Only residual: the
  browser's thumb sits 0.3 css px lower (Skia's chord-length offset-path vs exact arc length).
- **Seams** (dense sheets, every 2nd frame): B2 lands sub-pixel (READ draws my `drawTocDefault`);
  A→B switch 2D→3D within 1 px (dot, rows, rail); B→C pixel-matched top-down pose; C→D lift-off
  continuous; B3 verified pixel-identical by LAYOUT (ring, dot, heading ring).
- **Post**: TOC only writes `f.post` outside the handoff windows (post is shared per frame; owners
  decide inside): ca eases default → 0 over 26.4–26.65 (hairline fringes), 40 % of default in the
  city; vignette −0.1 on paper, back to default as the lights go out. LAYOUT holds ca 0 from 37.6.
- **Perf**: 54–126 ms/frame at 1080p (incl. PNG encode), B's 3D city the heaviest.
- **Music** (timing.json): A's punches on the real snares; B's passes on the verse-A2 hits
  (29.2 s · 29.8 k · 30.0 s · 30.4 k · 30.8 s · 31.0 k · 31.4 k); D's 100 % on 37.6 (snare + F♯7),
  scaffolding shed on the bar-24 snare roll (37.8 · 38.0 · 38.1 · 38.2 · 38.3).

## Pass 2 (director notes, 2026-10-11)
- **Specimens solo tour**: on each beat one panel solos (NORMAL 32.0 → CLERK 32.4 → BLOCK 32.8 →
  MINIMAP 33.2 → POPOVER 33.6 → ROLL-IN 34.0): it brightens (frame 0.16 → 0.5, longer/heavier
  brackets, faint panel lift) and its boxed label grows 11 → 16 px and fills (PAPER box, INK text,
  the fill growing with the typed text); the others dim to 40 % (120 ms up / 250 ms down). 34.4 all
  together (sync-line flash); 34.8 POPOVER solos again as the thumb leaps into its circle. The sweep
  line stays at full strength across the dimmed panels. Camera: leans 10 % toward the soloing panel
  (outExpo per beat), a continuous dutch drift, and a slow 4.5 % push toward POPOVER over 34.2–35.2
  anchored at the sheet's top-right (credit line and lyric column stay clear).
- **Magic circle presence**: heading ring 15 → 20 px at radius 410 (angles relaxed where long
  neighbours collided; shared via `ring.ts`, LAYOUT's redraw follows); centre heading 52 → 64 px
  (16th-note run rolls from a 0.4 opacity floor, no strobe); an arc glow pass (arc + guide drawn
  thick, blurred 18 px, screened; kick-breathing) builds with the lift-off, flares on 37.6 and is
  exactly 0 from 38.1, so the B3 end state (ring R 300, 3 px stroke, dot r 7, plain) is unchanged —
  re-verified with LAYOUT: 38.383 vs 38.4 differ only by grain + 6 px at the dot.

## Objecthood pass (treatment §2, 2026-10-11)
Audit: the monoliths/city are lit 3D objects (fine); C and D stay 2D in the screen plane (fine).
The A→B tilt (28.8–29.2) read as a flat, evenly lit card rotating, the darkness arrived as a 2D iris,
and the remaining light was a flat radial gradient. Now the page is a physically lit floor:
- **Page lamp**: a lamp high above (and up-page of) the guide lights the paper with cosθ/r² falloff.
  On the 28.8 frame it is effectively at infinity, so A's flat page matches exactly. It sinks into
  the dot over 28.82–29.22 (ease-out in log height), so the pool of light forms as soon as the tilt
  starts, slides from up-page onto the dot in perspective, contracts, warms toward orange and hands
  over to the guide's own light. The rail and the flat headings are lit by the same lamp.
- **Satin sheen**: the reflection of a 60° sky light, set opposite the camera azimuth (zero top-down),
  crosses the paper as the camera pitches.
- **Grounding**: soft contact shadows under each monolith, plus shadows cast away from the guide
  light (they swing as the dot passes). The darkness of the world beyond the lamp is the fog colour
  from the first frame, so the tilt never reveals a lit infinite plane.
- **Halo**: the guide's camera-facing halo sprite now slides toward the camera along the view ray, so
  it no longer cuts into the floor with a straight edge; its core stays orange.
- Overlay tone in B follows the actual light under the lyric column (ground point raycast).
- Seams re-verified: 28.8 cut (paper within ±2 levels, geometry coincident), B→C unchanged.

## Final polish (2026-10-11)
Review: v1 at ¼ size (phone), v1 full-res crops (contrast-stretched for banding), current renders
with read/layout loaded, drum events from /music/timing.json. Defects ranked by visibility:
1. **Sync** — hops/solos sit on the beat grid, not the hits: A heads at 26.4 / 28.0 (no hit), C solos +
   sweep at 32.8 / 34.4 (no hit), D steps at 36.0, 37.0, 37.1, 37.3, 37.5 (no hit); and every glide
   *starts* on its cue, so the dot settles 0.15–0.36 s after the hit (B's dot reaches each sign
   after its pillar has fired). Fix: every hop *arrives* on a real kick/snare (glide anticipates).
2. **Clipped glyphs** — D's 64 px centre title is hard-clipped mid-glyph while it rolls in (v1 37.0).
3. **Shimmer / stepping** — A's 1 px HUD hairlines snap to whole pixels while the camera moves;
   C's panel hairlines + text shimmer under the zooming camera; D's rotating dashed ring and thin
   rings alias. Fix: 2× supersampled 2D layers; moving hairlines unrounded.
4. **C at phone size** — the solo emphasis is too subtle on a phone (dim 40 %, 16 px label); the
   sheet is small and dark. Fix: stronger solo (dim, larger label, beat pop), stronger lean.
5. **Banding risk** — halo sprite is a magnified 8-bit canvas gradient; lamp/orange pools and D's
   arc glow (8-bit blur) have long dark tails. Fix: analytic shader halo + dither; dithered ground;
   dithered glow pass.
6. **City background** — generic dark boxes. Fix: faint document text lines on their faces +
   per-block tone variation (fade with distance, no moiré).
7. Minor: ROLL-IN label passes through a grey mid-state when its solo releases (0.2 s) — accepted.
8. Known: browser thumb sits 0.3 css px lower than ours (Skia contour measure) — accepted.
9. Typography rule (mono for paths/selectors/code): checked — all such labels already use MONO.
10. Overlay: no clash in v1 (credit TL clear in C, lyric column clean against A–D).

### Final polish — status (all fixed unless noted)
1. **Sync** ✔ every hop now *arrives* on a real hit (glides anticipate; `hops()` / `landLag`), measured
   settle-frame vs timing.json: A ±1 f (26.0 26.2 26.6 26.8 27.2 27.6 28.2 28.4), B ±1 f (29.2 29.8 30.0
   30.4 30.8 31.0 31.4; flights in-out), C 0 f (sweep 32.4 32.6 33.0 33.2 33.6 34.0 34.2 34.6 34.8; panel
   reveals/solos/camera steps 32.0 32.4 33.0 33.2 33.6 34.0; Glass expands onto 33.6; popover opens onto
   35.0), D ±1 f (35.6 35.8 35.9 36.2 36.4 36.8 37.2 37.4 → 100 % on 37.6), sheds on the snare roll
   37.8 38.0 38.1 38.2 38.3, rewind lands on the 32.0 kick. CSS-faithful transitions (restart only on
   change).
2. **Clipped glyphs** ✔ D's title rolls in through a soft vertical mask (own 2× canvas) — no cut glyphs.
3. **Shimmer** ✔ A/C/D drawn on 2× supersampled 2D layers (exact 2:1 box resolve); moving hairlines no
   longer pixel-snapped; canvas blur/shadow lengths scaled to device px. B was already 2× SS.
4. **C at phone size** ✔ solo dim 0.3, label 11 → 19 px with fast fill + ink text, lock-on flash and
   bracket snap on each solo hit, 16 % lean, a dithered light pool following the solo panel; file paths
   step aside while a grown label needs the header (no text over text).
5. **Banding** ✔ arc glow is analytic (float) + dithered; city halo is an analytic billboard + dither;
   lamp/orange pools dithered in the ground shader; dither after the bloom; solo light pool dithered.
6. **City background** ✔ faint document text lines (fwidth-AA, fade before aliasing) + per-block tone.
7. **Line-pass artefact** ✔ (found in review) faint outlines around the ping-ring planes (edge-pass
   marker coverage): rings now drawn by the ground shader, pillars are Y-billboard sprites.
8. Accepted: browser thumb 0.3 css px lower (Skia contour measure); B→C cut shows ≤ 0.5 px AA offset
   between the 3D text texture and the 2D redraw.
9. Typography ✔ paths/selectors/code are mono (`toc/default.tsx`, `#flux`, `C 16.5 …`, `#nd-toc`, %).
10. Seams re-verified (renders with read/layout): B2 25.583 vs 25.6 0 px > 120; A→B rows within 1 px;
    B→C AA-only; B3 38.383 vs 38.4: 6 px (dot, LAYOUT's motion start). Perf 64–102 ms/frame.
