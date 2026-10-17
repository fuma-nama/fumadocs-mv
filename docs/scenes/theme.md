# THEME — bars 33–40 · 51.2–64.0 s · word: COLOR

Chorus 1 and the film's turning point: the monochrome world bursts into colour.
Lyrics (real timing.json): L9 い51.2 ろ を | え52.2 ら ん で52.8 ‖ せ54.4 か い を | ぬ55.4 り か え56.0 て56.2–56.8;
L10 よ57.6 ん で よ | リ58.4 ー ド ミ59.0 ー | (gap 59.8–60.8) | き60.8 み だ け の | ド62.2 キュ メ ン ト63.0–63.6.
Feature: the 12 Fumadocs colour presets (neutral · black · vitepress · dusk · catppuccin · ocean ·
purple · solar · emerald · ruby · aspen · shadcn), each light/dark, switched with one CSS import.

## Core idea: one page, repainted

One real Fumadocs docs page (plates: page "Themes", identical across all 24 preset × mode captures,
its own code block reads `@import 'fumadocs-ui/css/<preset>.css';`) runs through the whole section:
born from the orange dot, repainted on every beat, multiplied into the "world", dealt into a ring
of choices, and one choice becomes *your* page, full screen, which cli turns into an OS window.
Because the plates are pixel-aligned, a repaint changes only colour, never geometry. That is
literally what a preset does.

Colour logic (from the real tokens, packages/base-ui/css/*.css; `tokens.ts`):
- **World** = flat field in the current state's `--color-fd-primary`: saturated behind a LIGHT
  page, pastel behind a DARK page. A light/dark flip inverts the frame's luminance (snare hit).
- **Ink** (type on the world) = the theme's background of the contrasting mode; shadows = a
  darker shade of the world. neutral/black/shadcn are honestly ink or paper.
- Never hue-sorted; orders alternate warm/cool and dark/pastel.

Devices: **repaint** (diagonal TACTIC stripes or an iris from the dot; one screen-space mask drives
the world, the decor and the page shader), **flip** (two-sided card, light front / dark back,
edge-on exactly on the snare where the world cuts), **the dot** (burst → cursor → selector).

## Implemented shot list

| shot | time | what happens | module |
|---|---|---|---|
| S1 BURST | 51.2–51.6 | Impact frame: orange disc r 38 + paper shock ring r 70 + 8 sparkles riding the ring (twinkle on twos), shake. 13 flat discs flood out from the dot, each from its own drifting centre with its own growth time (a flood, not a target): orange, then the 9 coloured presets as wide bands, with neutral/black/shadcn as thin ink/paper separators. Tiny mono labels ride 4 bands. The last disc is PURPLE's world (≈51.53). Boxed **COLOR** (the section word) flashes at the centre of the burst on an ink plate (51.22–51.41), then whips into its corner tag. The page card flies out of the centre on the same vector (from a small readable card, turning in) and lands on 33.2. | posters.ts |
| S2 POSTERS | 51.6–52.8 | Poster grid: giant vertical theme name (Archivo 900 extra-condensed, reading upward, left column, behind the page) · 3D page card (tilt, ink outline, flat offset shadow) · paint-sample swatch card with the real tokens (primary/background/card/foreground/border + values + css file) · HUD (registration marks, 8th-note tick strip, `purple.css · light`). Slow continuous drift. 33.2 PURPLE·L lands · 33.3 stripe repaint → EMERALD·L · 33.4 (snare) flip → EMERALD·D. | posters.ts |
| S3 CHOOSE | 52.8–54.4 | Name slides out, picker column slides in: 12 Fumadocs logo moons in each preset's colours + sun/moon toggle pill. Big import line on top `@import 'fumadocs-ui/css/ruby.css';`, its slot retypes on 16ths after each pick. An orange leader runs from the slot to the real token on the page's code block (keyBoxes.presetName, projected on the tilted card), bracketed in orange. The orange dot is born at the page's own TOC thumb (the TOC section's dot) at 52.46 and arcs across to the picker, then hops in arcs, landing on beats: 34.1 RUBY chip → iris repaint from the chip → RUBY·D · 34.2 toggle → flip → RUBY·L · 34.3 VITEPRESS chip → iris · 34.4 toggle → flip → VITEPRESS·D, then the card squares up and dives into the page's top-left, landing at 54.4 on the band framing (1.48×, top-left anchored) while the dot flies to the centre. The swatch card flips with the page on every flip. | posters.ts, timeline.ts |
| S4 WORLD | 54.4–56.16 | The page, framed 1.48× from its top-left (sidebar + article; TOC off-frame so the overlay credits sit on the empty header), splits centre-out into 12 vertical bands, each the same aligned page in another preset (official order), with a primary edge strip. The page steps back under each band's flat tint (bg + 22–34 % primary, 62 % over the page) and gives way to a flat footer below y 846 for L9 (overlay plate 0.7). A giant **色** (Zen Kaku Gothic New Black, one silhouette with a hard shadow and paper outline) slams in on the downbeat; each band paints its slice in its own primary. 35.2 snare: paint rollers roll the bands light→dark in a wave · 35.3 the themes roll one band right, landing on the beat · 35.4 rollers roll them back · 36.1 the bands collapse left→right into DUSK·L. | bands.ts |
| S5 REPAINT | 56.16–57.6 | Hard outExpo pull-back from the band framing reveals the world, then a brush-edged stripe repaint on every 8th (alternating direction, the new primary as 22-px brush bands): CATPPUCCIN·L, SOLAR·D, ASPEN·D, BLACK·D, RUBY·D, EMERALD·L, PURPLE·L. Mirrored layout: card left of centre, vertical name in the right column under the credits corner. Decor clears in the last 8th; the card ends centred, square, s 0.42: the deck. | montage.ts, repaint.ts |
| S6 DEAL | 57.6–58.0 | On the crash the deck fans out (staggered by distance) into a cover-flow ring of 12 theme cards: physical cards (thin box, ink face frame, lit paper edges top/left, shaded bottom/right, light page front / dark page back, flat offset shadow). Each card counter-rotates as it orbits: it faces the camera and keeps only a residual outward turn ≤ 20° (follows the ring's curve, never edge-on); far cards are smaller (×0.8) and dimmer (×0.5). Dutch roll eases in. "R" slams on よ. | ring.ts |
| S7 HOOK | 58.0–60.8 | One leader per beat. Beats 1/3 (58.4 リ, 59.2 README — the hero punch, 60.0) belong to the type: a scale punch and an iris repaint from the type centre (worlds stay saturated: purple → emerald → ruby → dusk, so the paper README always reads). Snares (58.0, 58.8, 59.6, 60.4) belong to the cards: all 12 flip in a wave (the whole ring turns light ↔ dark; the only brief edge-on moments). The ring itself orbits continuously (no per-beat steps), with a travelling bob, tilt descending 0.36→0.25 and a slow push. READ ME fuses into README on ミ (59.0); solid katakana リードミー one per mora. | ring.ts |
| S8 YOURS | 60.8–62.2 | 39.1: README exits through the lens. The ring glides to a stop with OCEAN at the front; on the 61.2 snare the orange dot clicks it and the card snaps (outBack) large and central (≈1000 px, centred above the lyric band) while the world irises to ocean from the card. The other 11 peel away in four 8th-note waves (far side first, neighbours last), flung outward toward the lens, spinning in the picture plane while staying camera-facing, with flat smear trails in their primaries. Backdrop: a rotating 24-wedge sunburst from the card whose contrast pulses on kicks, kick rings, mirrored giant OCEAN in the side columns. Annotation brackets + `06 OCEAN · LIGHT · fumadocs-ui/css/ocean.css` above the card. 62.0 (snare) the card flips to DARK and the world cuts to sky. | ring.ts |
| S9 DOCUMENT | 62.2–64.8 | ド: anticipation (the card eases back), キュ (62.4): the rush — accelerating push to full-bleed with radial speed lines and a zoom blur from the card centre, hard stop on ト (63.0). From 63.0 the real plate is drawn 2D to (0,0,1920,1080); the dot rests at (960,540) and is handed to cli at 63.2. Post ramps back to engine defaults 62.6–63.0. | ring.ts |

Alternatives considered for the key moments:
- Burst: a 12-blade iris aperture (handsome, but reads as camera, hides the colour), a paint-chip
  fan deck opening into a sunburst (lovely but slow and thin), a 3D ring tunnel (breaks "the dot
  explodes"). Concentric flat discs won; the fan deck survives as the S6 deal.
- WORLD: a 4×3 grid of poster tiles (legible, but repeats the S6 ring of 12 and steps on the
  showcase mosaic). Bands + 色 are unique to this section and read as "one page, 12 colours".
- Hook background: ink stage with only the cards coloured (calmer, but a step back into
  monochrome); per-step world repaint kept the chorus flooded with colour.

## Zones (agreed with overlay)
L9 band y ≥ 880 kept free 51.2–57.6 · credits top-right (block x 1290–1800, y 84–260) kept calm
54.4–57.6 (bands framed so it holds only the article header's empty side; montage card left of
centre; only the 56.16–56.25 outExpo pull-back sweeps through it) · L10 as overlay 'subtitle'
(y 958–1030) under my giant type · f.overlay.tone and accent set every frame.

## Film rule: UI planes face the camera
Flat UI planes stay within ~25° of the camera or read as physical objects: posters ≤ 14° yaw, the
montage ≤ 10°, the ring is a cover-flow (≤ 20° residual turn), peeling cards spin in-plane; only
the snare flips and the 0.27 s burst fly-in pass through larger angles, briefly and in motion.

## Performance
~80–140 ms per frame at 1080p (bands ≈ 90–150 ms: 12 bilinear slices of the full-res plates).
GPU: 24 × (1600 + 800 px mipmapped plates) + 3 full-res plates for the full-bleed moments.

## Contracts
- B4 (layout → theme, 51.2 hard cut): verified, see docs/handoffs.md.
- B5 (theme → cli, 63.2–64.8, cli owns): ocean·dark full-bleed from 63.0, dot handed at 63.2;
  verified, see docs/handoffs.md.

## Files
mv/src/scenes/theme/: index.ts (dispatch) · tokens.ts (preset tokens, colour maths) · plates.ts
(real plates via manifest, stand-ins, card/mid/hi textures) · timeline.ts (poster events, picker
layout) · masks.ts (stripe/iris paths) · page3d.ts (pixel camera, two-sided page) · stage.ts ·
repaint.ts (generic repaint track) · posters.ts (S1–S3) · bands.ts (S4) · montage.ts (S5) · ring.ts (S6–S9).

## Final polish

Reviewed: the delivered v1 section with the overlay at 1/4 size (ffmpeg sheets at 5 fps), sheets
every 2 frames across 51.2–64.8 with layout and cli loaded, every frame around each transition,
full-res downbeat stills, 2× crops of wipe/brush edges, and every accent against
`/music/timing.json`. Defects, most visible first, with what was done:

1. **色 not unmistakable at phone size** (bar 35): Dela Gothic One's 色 collapsed into a block with
   two slots; vertical band labels sat on it. → FIXED: Zen Kaku Gothic New Black 色 (open ク over
   巴), one silhouette across all bands (hard shadow + paper outline), per-band colour fill cut to
   the glyph in one pass; band labels removed (the 色彩設計 credit names them at that moment).
2. **Burst read as a bullseye in stills** (51.2–51.5) → FIXED: each disc floods from its own
   drifting centre (golden-angle directions, eccentricity 9–24 %) with its own growth time
   (18–35 frames), so bands are thick on one side and crescents on the other; band labels sit in
   each band's thickest part. Frame 51.2 unchanged (concentric orange disc r 38, B4).
3. **Hook ring busy, README not dominant** (57.6–61.0) → FIXED: README/リードミー ride in front of
   the ring (same screen size), cards ×0.85 smaller, far cards sink into the world colour (up to
   55 % tint) and dim.
4. **UI captures squashed by 2D flips** (bar-35 band flips, swatch card flips) → FIXED: band flips
   are now paint rollers (a primary roller bar with ink lips rolls each band light ↔ dark in a
   staggered wave, page slices undistorted); the swatch card repaints under a roller too.
5. **Poster page flips paper-thin** (52.4, 53.2, 54.0) → FIXED: the poster/montage page is a
   physical card (18-px core, lit top/left edges, shaded bottom/right) like the ring cards.
6. **Lyric band intrusions** (L9 y ≥ 880): poster card bottom ≈ 900 in bars 33–34, the
   montage card ≈ 920 in bar 36, flipping cards' near edge ≈ 960, page text under L9 at 54.4 →
   FIXED: poster card raised/smaller, montage card smaller and higher (and clear of the credits),
   stage lens 30° → 22° plus a 9 % ease-back at edge-on, flat band footer faded in over the
   last 0.15 s of the push-in.
7. **Import line crowding** (bar 34): the card's top edge touched the `@import` descenders →
   FIXED: line raised to y 158.
8. **Sync** → FIXED: card fly-in settles on 51.6 (was 4 frames late); 色 lands on the 54.4 frame;
   the bar-35 theme roll lands on 55.2 (it departed on it); rollers and the 56.0 collapse are
   centred on their cues; stripe repaints lead by 2 frames so half the frame is repainted on the
   cue (52.0, the bar-36 8ths). Checked against timing.json kicks/snares/crash/lead onsets.
9. **Corner-brightness pop**: bands used the default vignette (0.22) between posters/montage at 0.1
   → FIXED (0.1 throughout; ramps to the default only for B5).
10. **Montage pull-back first frame jumped 10 %** (56.167) → FIXED: frame-exact switch
    (BANDS_END = frame 3370) and an outQuart start.
11. **61.25–61.30 flash**: the ocean sunburst drew over the old world outside the iris → FIXED
    (backdrop clipped to the iris).
12. **VITEPRESS** collided with the mode label on the swatch card → FIXED (name fitted).
13. Performance: band frames up to 298 ms → FIXED (glyph colouring in one pass): now ≤ 245 ms;
    other frames 70–140 ms.
14. Checked and fine: brush/stripe edges at 2× (antialiased, no stair-stepping, no fringes), mono
    face for every path/import/CSS/token label, orange `#FA8023`, B4 and B5 pixel-exact.
15. **Left as is**: (a) 56.17–56.30 the hard pull-back sweeps the card's corner near the credit
    block for a few frames (clear of the credit text itself); (b) the impact frame 51.2 carries the
    agreed shake (disc centre displaced ~9 px on that one frame, per the B4 contract); (c) the
    brush bands paint over the HUD label for 1–2 frames per repaint (intended: the brush covers
    everything).
