# READ — bars 10–16 · 14.4–25.6 s · word: READ

Lyrics: L1 (bars 9–12) まっしろな ページを ひらいて — *open a pure-white page* ·
L2 (bars 13–16) ことばの もりを あるいてく — *walk through a forest of words*.
Real onsets (music/out/timing.json): ページを 14.0–14.6 · ひらいて 15.6–16.0 (て = the 16.0
explosion) · ことばの 19.4 · もりを 20.4 · あるいてく 22.0–22.6. Groove: kick 1 · 2& · 3&,
snare 2 · 4, 16th snare fill 25.2–25.5.

Palette: a deeper warm paper desk `#E2DCCE` with a soft light pool (the intro card stays PAPER
`#EEECE4`, so the white page pops) + the REAL Fumadocs page (plates: neutral light,
`--color-fd-primary: #FA8023`), ink annotations, orange only for the guide (caret → TOC thumb,
active states, the current part). Tone `light` every frame. Post: vignette 0.1 / ca 0.0006 at
B1 (matches intro), vignette deepening to 0.2 once the card is a sheet on the desk, then easing
to the engine defaults across 24.0–24.8 (TOC uses defaults).

**Viewing rule** (director): flat UI faces the camera within ~25°, or is a convincing physical
object. Page shots are at 66–90° elevation (≤ 24° off the page normal); the anatomy is a
moderate axonometric (50–56°); the forest is a camera-facing multiplane; the turning sheet and
the keycaps are physical objects (thickness, shading, outlines).

**The one idea**: one continuous camera over one real docs page. The intro's orange caret is
handed to us at 14.4, lands on the page as the real TOC thumb dot, and at the end we dive into
that same dot — the section is the life of the dot on a page (*follow the dot*).

Plates (`/plates/read/orange-light/…`): Introduction page, 1440×810 css @2x, Docs layout, TOC =
the film's chapters (19 items). Layers, boxes.json, tall article tiles, search states for
"contents" are all real captures. TOC is drawn with toc's `toc-geometry.ts` (identical maths).

Safe zones (overlay): verse lyric band x 112–1000 · y 900–1015; credits top-right during
16.0–19.2, bottom-right during 20.8–24.0. The lyric gets the overlay's frosted plate only during
⌘K (22.0–24.5), when the page fills the frame.

## Implemented shot list

### S1 · OPEN (13.6–16.0) — `open.ts`, `curl.ts`
| t | what happens |
|---|---|
| 13.6–14.0 | intro's title card (`f.other`) passed through untouched |
| 14.0 (b4) | switch to a 3D sheet carrying `f.other` (pixel-matched); camera pulls back so the card becomes a sheet on the desk; bottom-right corner peels (anticipation) |
| 14.4 (b1) | **turn**: hinged on the left edge, curl region + travelling bend (free edge leads, then trails), paper thickness ribbon, curl shading, cast shadow on the docs page; back = paper with the title mirrored as show-through. Caret handed over (intro stops drawing it at 14.0): hovers & shrinks while the paper turns under it |
| 15.0–15.15 | the book lies open: mirrored ƎMDAƎЯ on the left page, the real docs page on the right |
| 14.95–15.2 | caret dives into the TOC thumb (block → 4 px dot); 15.2 ping ring, "Reading" + active path light up |
| 15.05–15.95 | camera pushes onto the docs page; 15.4–16.0 P1PE desk marks draw on (registration marks, `1440 css · 2880 px`, `810`, FIG.01, file path) |

### S2 · ANATOMY (16.0–19.2) — `anatomy.ts`, `annot.ts`
An exploded-view diagram of the real page. Whip (with camera motion blur) into a moderate
axonometric on 16.0 ("て"); every part leaves the empty layout frame along its own direction,
each cropped to its own element (opaque real pixels, a subtle glass rim, a soft cast shadow):
SIDEBAR out to the left, TOC out to the right, ARTICLE up, SEARCH up and toward the viewer,
BREADCRUMB above the article (the two small parts are magnified like detail callouts). Only
DOCS LAYOUT — the empty frame with dashed column guides — carries a full-page outline. Legend
column on the left (boxed `READ` + FIG.01 caption), TOC label bottom-right; every leader hits its
part. On its hit the named part pulls out further, flashes brighter, gets the orange outline and
print-head scan while the others dim to 70 % and desaturate. Parts dip on the kicks. On the
bar-13 downbeat every part slams back to its exact position — the composite is the real page —
with an orange stamp and a jolt: the parts make the page.
| t | part |
|---|---|
| 16.0 | 00 DOCS LAYOUT · sidebar 268 · main · toc 268 · 100 % |
| 16.4 (snare) | 01 SIDEBAR · ページツリー · 18.6111 % |
| 17.0 (kick 3&) | 02 SEARCH · 検索 ⌘K · 0.7284 % |
| 17.2 (snare) | 03 BREADCRUMB · パンくず |
| 17.6 (kick) | 04 ARTICLE · 本文 · MDX · 62.5 % |
| 18.0 (snare) | 05 TOC · 目次 · 18.6111 % |
| 18.4–19.2 | the whole diagram reads; slow orbit + push |

### S3 · FOREST OF WORDS (19.2–21.8) — `forest.ts`
**Concept chosen: a typographic multiplane.** See the comparison below.
- 19.2–19.42 **in**: after the slam the camera dives into the article's text with a 90° whip-roll;
  under the motion blur its lines stand up vertical and crossfade (19.38–19.52) into the forest's
  nearest trunks — the page's lines become the trees.
- The forest is its own world: a misty paper space; tall trunks made of the page's real sentences,
  headings (bold, some orange) and code lines (Shiki colours), set vertically, stand at many
  depths; the camera walks forward between them (parallax, scale, atmospheric haze, three-pass
  depth of field far/focus/near, zoom motion blur). Everything is a flat plane facing the camera.
- Grid: trunks grow in from the ground (clip reveal) — lines on 16ths, headings on 8ths, code on
  beats. Heroes (real components as paper cards) pop in with a snappy outBack on the hits, ride
  gently with the walker while in focus (legible), and pop out before the next one, alternating
  sides so two never collide: 19.6 code block (copy → real ✓) · 20.2 callouts + tabs (real tab
  switches on the 8ths) · 20.8 steps (npm tabs) with the Layouts cards as a second hero · 21.4 the
  page title. One tag per hero, outside the card, typed on before its hit (`CODE · shiki ·
  source.config.ts`, `CALLOUT · TABS`, `STEPS · 01 — 03`, `CARDS · Layouts`, `H1 · Introduction`).
- Three heading trunks ("Start the dev server", "Layouts", "Table of Contents") pass through the
  focus band crisp and dark, each in a window when its side of the frame is free of heroes — the
  trees are words, readable even at phone size.
- A dense ground mist covers the bottom of the frame (≈0.9–1.0 below y 840): the lyric band and
  the credit corner always sit on clean mist.
- 21.45–21.8 **out**: the walker rushes at the title card until the word "Introduction" fills the
  frame; on the 21.8 kick the real page takes over on exactly that framing (the real H1, frontal,
  11 px per css px — identical pixels) and the camera pulls back to the sidebar's search trigger.

**Concepts weighed** (user note: paper-thin planes at oblique angles read as cardboard):
1. *Physical cards on the paper road* (previous version: blocks hinging up / standing beside a
   road): needs grazing views of the road and of every card while it rises — exactly the angle
   that reads as cardboard; thickness and bevels would only partly fix it. Rejected.
2. *Top-down descent through floating layers* (blocks parallel to the page, camera falling toward
   it): face-on and clean, but reads as cards over a distant page, not a forest — no verticals, no
   walk. Rejected after a test render.
3. *Typographic multiplane* ✔: the words themselves are the forest (vertical trunks of the page's
   sentences — the strongest literal reading of 「言葉の森」), everything faces the camera, depth
   comes from parallax/DOF/haze like an anime multiplane, the real components appear as heroes in
   the clearings, and both ends are designed match cuts (page lines → trunks, title card → real H1).

### S4 · ⌘K (21.55–24.0) — `search.ts`
21.8–22.2 pull back from the real H1 to the sidebar's search trigger; on the 22.0 snare its
real kbd chips pop out as toon keycaps (ink outlines, outBack). 22.4 ⌘ down on the kick (orange legend + impact ring),
22.8 K down on the snare → the real dialog opens with Fumadocs' own `fd-dialog-in`
(scale 1.06→1, cubic-bezier(.16,1,.3,1), 300 ms) over the real overlay (black 20 % + 4 px backdrop
blur), camera pans to it; keycaps sink home. "contents" typed on 16ths from the 23.0 kick (real
result states; orange caret), 23.8 ArrowDown selects `# Table of Contents`.

### S5 · SCROLL + DIVE (24.0–25.6) — `dive.ts`
24.0 Enter (kick): `fd-dialog-out`, overlay fades; the page scrolls to the real target (2018 css)
with scroll smear; the TOC follows the real rules (≥90 % visible headings active, thumb at the end
of the range, 150 ms CSS transitions). Camera turns frontal (24.0–24.7) while a log-zoom pushes
into the thumb; the page fades away and the desk becomes #F5F5F5; from 24.7 the TOC is drawn
crisp in 2D with `drawTocDefault`. 25.2–25.5: four zoom punches on the snare fill's 16ths; lands
at rest on TOC's contract frame (S 6, O (549, −96)); from 25.6 `f.other` is shown untouched.

## Alternatives considered
- **Open**: book-cover turn ✔ (literal "open a page", lands as a book spread with mirrored show-
  through); flip-chart top hinge (sheet hangs over the page); sheet flying into camera (no opening).
- **Anatomy**: exploded view with each part cropped to its element and moving along its own
  direction ✔; full-page glass plates stacked in z (tried: reads as six copies of the page at
  different opacities — the user's note); flat 2D explode (no depth).
- **Forest**: typographic multiplane ✔ (see S3 for the three concepts weighed).
- **⌘K**: real kbd chips → toon keycaps ✔; giant keycaps on black (breaks palette).
- **Dive**: 2D-crisp push with fill stutter ✔; iris through the dot (generic); 3D dolly (raster blur).

## Implementation map (mv/src/scenes/read/)
`index.ts` orchestration · `plates.ts` plate loader · `page.ts` model types · `stage.ts` 3D page,
desk, TOC canvas, tiles, shadow pass · `world.ts` UI/desk materials, camera pose maths ·
`camera.ts` the one camera path · `open.ts` S1 · `curl.ts` page-turn sheet · `anatomy.ts` +
`annot.ts` S2 · `forest.ts` S3 (its own three.js world) · `search.ts` S4 · `dive.ts` S5 ·
`mblur.ts` camera motion blur (pose-based and camera-based) ·
`timeline.ts` beat constants.

## Final polish

Review: section rendered with intro + toc every 2 frames (13.6–26.4), every frame around the
moves, full-res stills on every downbeat, and the delivered v1 (`out/roughcut-v1.mov`, with
overlay) at 1/4 size. Cues checked against `music/out/timing.json`.

Defects, ranked by visibility, with the fix:
1. **21.8–21.9 whip out of the forest**: 5 frames of radial mush; the box-kernel motion blur ghosted
   "Introduction" into a double image, and the forest→page crossfade added a second copy.
   → The forest→page swap is a hard switch at 21.8 (the frames are identical by construction).
   The pull-back is now a stepped whip on the 16ths: the real H1 holds crisp on the 21.8 kick, then
   two snaps land and hold on 21.9 (typewriter) and 22.0 (snare, the keycaps pop). Each snap is
   one streaked frame, and motion blur never straddles the cut. [fixed]
2. **Anatomy legend at phone size**: labels were 17 px Michroma, JP 14 px, meta 11 px (≈ 4 px at 1/4).
   → The legend is ×1.45 and set as a left-aligned table (label ≈ 25 px, JP 20 px, meta 16 px, darker
   meta grey); the title block is ×1.3. "本文 · MDX" became "本文", since the `.mdx` path already says it. [fixed]
3. **Forest heroes at phone size**: cards were at ≈ 1.0 px per css px and tags 13 px.
   → Heroes ride closer (≈ 1.3 px/css: body text ≈ 20 px), tags are 17 px mono, and hero placement
   was re-balanced so no two cards overlap. [fixed]
4. **"Layouts" trunk hidden** behind the outgoing callouts card.
   → It passes focus on the 20.4 snare (「も」) on the free right side, raised so its first word
   reads at mid-frame, with the real sub-headings ("Docs · Notebook · Flux · Glass · Spacious") as
   its tail. It sinks into the mist on the 8th before the steps card takes that side. [fixed]
5. **Banding**: the desk light pool and soft shadows were quantised by the 8-bit resolve (≈ 25
   levels over ≈ 1000 px; mean constant run 6.4 px, concentric rings visible on a contrast stretch).
   → The desk shader adds a triangular dither (±1.25 levels after the 2×2 resolve; mean run
   2.7 px, rings gone). The page-turn shading is dithered only where the curl shades, so the flat
   sheet stays pixel-exact with B1. The forest sky and mist are now full-frame, row-exact, dithered
   gradients instead of stretched 4-px textures. [fixed]
6. **⌘K typing sync**: verified. Each state lands on its 16th (foley ticks every 0.1 s): "c" on the
   23.0 kick … "contents" on 23.7, ArrowDown on 23.8; ⌘ on the 22.4 kick, K on the 22.8 snare,
   Enter on the 24.0 kick ("ding"). [verified]
7. **Box-filter motion blur ghosting** on every whip and zoom.
   → The new single-pass tent-weighted blur (zoom + pan) has no double edges. A bug where pull-backs
   (zoom-outs) got no blur at all is also fixed. [fixed]
8. **Thin cool line along the title sheet's top/left edges (14.0–14.45)**: this is intro's own 1 px
   frame/registration art on the card (identical in f.other), not a seam. [not a defect]
9. **19.38–19.43 dive into the forest**: the last frame was a mushy two-image crossfade.
   → The crossfade is shortened to 4 frames inside the whip-roll's streak; it reads as one move. [fixed]
10. **First forest frame ≈ 440 ms** (texture uploads on first use).
    → Every texture is uploaded and every shader compiled in setup. The first forest frame now takes
    ≈ 100 ms; steady state is 60–100 ms. [fixed]
11. **Mono rule**: trunk sentences containing paths/commands (`content/docs`, `npm run dev`,
    `http://localhost:3000/docs`, `createMDX()`, `fumadocs-mdx/next`, `next.config.mjs`) were set
    entirely in Geist.
    → Prose trunks are now set in segments, with paths, packages, commands and calls in JetBrains
    Mono. All other path, package and code labels in READ (legend meta, FIG caption, desk file path,
    hero tags, search query) were already mono. [fixed]
12. **24.13–24.33 fast scroll**: the chrome stays crisp and the article streaks; it reads as a scroll. [kept]
13. **B2 anti-aliasing**: TOC now renders its frames 2× supersampled, so my 1× 2D TOC differed in glyph
    anti-aliasing (max Δ 242). → My 2D TOC is drawn 2× too; 25.583 vs 25.6 is back to grain only
    (max Δ 33/765). [fixed]
