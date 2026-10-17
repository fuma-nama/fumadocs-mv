# Scene handoffs — shared contracts

Transitions are where 2D/3D motion pieces live or die. Every cut between sections must feel
*designed*: a figure, line, shape, colour or motion that carries the eye from one scene into the
next (match cut, morph, camera continuation, the outgoing image becoming an object in the new
scene). No stock crossfades. The two neighbouring scene agents co-own each boundary.

## How it works technically

`mv/src/scenes/index.ts` → `boundaries`. During `[from, to)` both scenes render. The non-owner
renders first; the **owner** receives the other's finished image as `f.other` and composes the
final frame (it may map `f.other` onto a 3D page, shatter it, mask it, zoom through it…).
`f.boundary` = `{ at, from, to, role, isOwner, p }` is set for both scenes inside the window.
The non-owner must keep rendering meaningful content across the whole window (the owner may
show it), and both must agree on the exact state of the shared figure at the handoff instant.
Window sizes/owners can change — ask the director (main) with a concrete reason.

## Protocol

1. Read your boundary below. The outgoing and incoming agents agree on the **contract**: the
   shared figure's exact screen position/size/colour/rotation/motion vector at the key frames,
   camera direction and speed, what each side renders in the window, and who draws what.
2. Write the agreed contract into this file under your boundary (edit only your boundary's
   "Contract" and "Log" blocks; prefix log lines with your scene id and time).
3. Message your neighbour (SendMessage; use ListAgents to find the agent whose description
   names the neighbouring scene) when you change anything that affects them.
4. Verify by rendering *both* scenes through the window frame-by-frame:
   `node render/sheet.mjs --from <from> --to <to> --step 0.0167 --cols 10 --cell 240 --only a,b`.
   Look for pops, mismatched positions, speed discontinuities, colour jumps.

---

## B1 · intro → read · bar 10 (14.4 s) · window 13.6–15.6 · owner: **read**
Concept: the title card is a white paper page (lyric: "open a pure-white page"). On the cut the
**page opens** — a 3D page turn / unfold (paper with thickness, soft cast shadow, slight curl)
revealing the real docs page beneath, which settles into READ's first composition.
Figure: the title page (paper) itself; the moon logo on it may carry on into the docs page logo.
- Contract (agreed intro ↔ read):
  - INTRO renders the title card FULL-BLEED (the whole 1920×1080 frame is the page): flat, unlit
    C.PAPER `#EEECE4`, ink C.INK, one accent C.ORANGE; layout final and static from 13.6, identical
    until 15.6 (no camera move, no particles crossing the edge). Only micro-motion: the orange caret
    blinking (on beats 1 & 3). Intro exports TITLE (moon / title / caret rects) from
    `mv/src/scenes/intro/title.ts`.
  - CARET handover at **14.4**: intro does not draw the caret from 14.4 (it is off on beat 4 anyway);
    READ draws it identically from 14.4 (floating in front of the turning paper), then flies it onto
    the docs page where it shrinks into the real TOC thumb dot (~15.2). The moon stays printed.
  - READ: 13.6–14.0 shows `f.other` untouched; from 14.0 maps `f.other` onto a 3D sheet (pixel-matched
    at 14.0) hinged on the LEFT edge: bottom-right corner anticipation 14.0–14.4, main turn 14.4–~15.0,
    the sheet exits left while the camera pulls back/tilts onto the real docs page lying beneath on
    cream paper. Paper thickness, curl shading and cast shadow are READ's.
  - Overlay: tone 'light', default verse lyric placement on both sides (no jump at 13.6/14.4).
- Log:
  - read 2026-10-11: contract agreed with intro (caret handover at 14.4, left hinge, full-bleed card).
  - read 2026-10-11: implemented + verified (14.0 switch pixel-identical to f.other; vignette 0.1 / ca 0.0006 matched; after 15.6 the turned cover uses intro's exported drawTitleCard and slides off by 15.95).
  - read 2026-10-11 (pass 2): re-verified after the desk/anatomy/forest changes — 14.0 still identical to f.other except intro's own caret blink-off.
  - read 2026-10-11 (final polish): re-verified frame by frame — 13.983→14.0 differs only by intro's caret blink-off + the lyric mora; the new desk/sheet dither is masked to shaded regions so the flat sheet stays exact.
  - intro 2026-10-11: implemented. Card = `drawTitleCard` (intro/title.ts, TITLE): caret rect centre
    (1493, 497) 114×228 (edges 1436–1550 × 383–611), drawn with `drawCaret(c, 1493, 497, { h: 228,
    w: 114, glow: 0.45 })`, opacity = caretBlink(t) until 14.0, 0 after; moon (960, 232) r 34 (bg PAPER);
    word ink box x 371–1406, cap top 383, baseline 610. Card build-in 12.8–13.6 (the page flips open
    from the stop line on the 12.8 impact), static from 13.6. Post on the card: vignette 0.1, ca 0.0006
    (grain default) — READ matches from 13.6; f.overlay.tone 'light' from 12.8.

## B2 · read → toc · bar 17 (25.6 s) · window 24.8–26.4 · owner: **read**
Concept: from the search result / fast scroll, the camera **dives into the TOC indicator**: the
real TOC's active dot and 1 px path enlarge until the dot and line become TOC's opening giant
vector graphic. Lyric L3 "follow the headings…" starts at bar 17.
Figure: orange dot + TOC path.
- Contract (agreed read ↔ toc; toc defines the frame):
  - Data: the plates hero page TOC (Reading › Search, Code Blocks · Table of Contents · Layouts ›
    Docs, Notebook, Flux, Glass (› Minimap h4), Spacious · Themes · Make it yours · Integrations ›
    OpenAPI, Obsidian, Sanity, Story · Showcase), default (normal) style, neutral LIGHT, primary `#FA8023`.
  - Active at 25.6: **"Table of Contents"** (index 3) only; READ's ⌘K query targets that heading.
  - Transform: screen = O + S·p, p = css px in the TOCItems container (rail SVG coords, first item text
    top y = 0); **S = 6.0, O = (549, −96)**. Thumb dot centre = css (8.5, 116.97) → screen
    **(600, 605.8)** (offset-distance 124 = the source's itemLineLengths with its integer `l++` search;
    the browser renders it 0.3 css px lower still — sub-pixel at 1×, both sides use the same function).
    Rows: text box of item i = css y [32i, 32i+20]. Rail x: h2 8.5 → 600, h3 16.5 → 648, h4 24.5 → 696.
  - Strokes/colours (pure ×6 zoom): rail 6 px `#0A0A0A` @10 %, butt caps, joins
    `C ux top−4, x ub+4, x top`; active path 6 px `#FA8023` clipped to css y [96, 116]; dot Ø24 px
    `#FA8023`, no glow; text Geist 400 84 px, line box 120 px, inactive `#737373`, active `#FA8023`.
    No "On this page" header, no article/other columns in frame.
  - Background `#F5F5F5`, flat, face-on, no perspective.
  - Motion: READ's dive lands with ZERO zoom/pan velocity at 25.6; dot at rest; TOC starts the first
    glide on the 25.6 downbeat. TOC's frame during 24.8–25.6 = exactly the 25.6 composition, static.
  - Handover: READ outputs `f.other` untouched from 25.6 to 26.4. For the last part of the dive READ
    draws the TOC with toc's exported `drawTocDefault` (mv/src/scenes/toc/toc-geometry.ts).
- Log:
  - read 2026-10-11: contract agreed with toc (active = Table of Contents, S 6, O (549, −96)).
  - read 2026-10-11: implemented + verified (dive draws toc's drawTocDefault from 24.7, four zoom punches on the 25.2–25.5 snare fill, lands at rest on landingState() at 25.6; f.other untouched 25.6–26.4; post eased to engine defaults by 24.8).
  - read 2026-10-11 (pass 2): re-verified — 25.583 vs 25.6 max per-pixel difference 33/765 (grain only).
  - read 2026-10-11 (final polish): toc now renders 2× supersampled; READ's 2D TOC of the dive is drawn 2× too → 25.583 vs 25.6 max Δ 33/765 (grain only).
  - toc 2026-10-11: `drawTocDefault` / `landingState()` live in toc-geometry.ts and match the plates
    still within 0.6/765 mean diff; exact thumb position noted above (600, 605.8).
  - toc 2026-10-11: verified with READ's real dive (`--only read,toc`, every 2nd frame): lands
    sub-pixel at 25.6. TOC never writes `f.post` inside the window (shared post, owner decides);
    from 26.4 it eases ca → 0 and vignette −0.1 from the engine defaults (no step).

## B3 · toc → layout · bar 25 (38.4 s) · window 37.6–39.2 · owner: **layout**
Concept: TOC ends with the **magic circle / progress ring completing**. The ring turns edge-on /
squares off / unfolds into the **first line-art wireframe** of LAYOUT (e.g. ring → rounded rect →
the docs layout's outer frame), keeping its stroke weight and colour through the morph.
Figure: the ring stroke → wireframe edges.
- Contract (agreed toc + layout, 2026-10-11):
  - Ring: centre (960, 540), face-on (no tilt/camera move from 37.6), radius 300 px to the
    stroke centre, no rotation. From 37.6 it is closed (100 %): plain 3 px `#FA8023` stroke;
    track 1 px `#7C7C84` α 0.5 under it (fully covered). Completion glow pulse at 37.6 decays
    to exactly zero by 38.1 → at 38.4 no glow/bloom: plain stroke, pixel-identical redraw.
  - Background flat INK `#0A0A0B` at 38.4. Everything else cleared by 38.2 except:
    a) the 19 hero-page TOC headings on a text ring outside the progress ring (PAPER `#EEECE4`,
       Geist 'ui' 400, 15 px, static) — exact placements in "Text-arc params" below;
    b) the orange guide dot at 12 o'clock on the ring: centre (960, 240), r 7, `#FA8023`, no
       glow, static from 37.6.
  - 37.6–38.4 LAYOUT composites TOC's frame untouched. At 38.4 LAYOUT switches to its own redraw
    (ring + text ring + dot) and morphs: the ring squares off into the Docs frame, the dot rides
    the outline's top-centre point, the heading ring unrolls into the frame's "On this page"
    column. 38.4–39.2 TOC keeps rendering its final state (nothing jumps). `f.post` defaults on
    TOC's side through the window.
  - Text-arc params (toc, final — rev. 2, director pass 2: labels 15 → 20 px): the headings are NOT
    set with draw2d `textArc` — upper half clockwise (glyph tops outward), lower half counter-clockwise
    (tops inward) so every heading stays upright. Exact glyph placements: `ringGlyphs(c)` in
    mv/src/scenes/toc/ring.ts → `{ ch, i (heading 0–18), x, y, rot, size }`; draw with Geist ('ui')
    400, `size` px (now 20), textAlign 'center', textBaseline 'middle', `translate(x, y); rotate(rot)`,
    PAPER `#EEECE4` α 1 — or `drawRing(c, ringGlyphs(c), () => '#EEECE4')` (pixel-identical).
    Geometry: centre (960, 540), glyph-centre radius 410 (`RING.rText`); heading i centred on its
    progress sector −π/2 + (i + 0.5)·2π/19, relaxed apart where long neighbours would collide
    (≥ 16 px arc gap); **static: ω = 0**. All 19 headings PAPER from 37.6.
  - Dot: (960, 240) r 7 from 37.6 on (it rides the arc head during the fill); glow ends 38.1.
- Log:
  - layout 2026-10-11: geometry agreed by message with toc; layout will verify with a dense
    sheet 37.6–39.2 (`--only toc,layout`) once both sides render.
  - toc 2026-10-11: magic circle implemented to this contract (ring/dot/heading ring; everything
    else cleared by 38.2); heading ring params filled in above (shared `ring.ts`, ω = 0).
  - toc 2026-10-11: scaffolding now sheds on the bar-24 snare roll, last layer gone by 38.28; TOC
    keeps ca 0 up to 37.6 and does not touch `f.post` inside the window (LAYOUT holds ca 0).
  - toc 2026-10-11 (pass 2): heading ring 20 px @ r 410 (relaxed angles); arc glow pass (blurred,
    screen) during the fill + a flare on 37.6, exactly 0 from 38.1. Ring/stroke/dot unchanged.
    Re-verified with `--only toc,layout`: 38.383 vs 38.4 differ only by grain + 6 px at the dot.
  - layout 2026-10-11: integrated with `toc/ring.ts` (ringGlyphs/RING) and `toc/toc-geometry.ts`
    (LAYOUT_HERO, tracePath). Verified the switch: layout 38.400 vs toc 38.383 differ in 17 px by
    >40/255 (grain/AA only). From 38.4 the ring squares off (two-stage: round → square, then
    16:10), the headings unroll into the Docs frame's TOC column (layoutDefault rows, Layouts ›
    Docs active) and the dot runs along the top edge onto the thumb. Uses `f.other` before 38.4
    only.
  - layout 2026-10-11 (pass 2): re-verified against toc's rev. 2 heading ring (20 px, r 410):
    layout 38.400 vs toc 38.383 differ in 92 px by >40/255 (max 88): sub-pixel AA on the ring
    stroke and the dot edge only; heading glyphs identical. Unroll picks up the new glyphs.
  - layout 2026-10-11 (final polish): TOC now renders its last frame supersampled; LAYOUT's HUD is
    rendered at 2× too. Re-verified: 38.400 vs 38.383 differ in 57 px > 40/255 (max 84; ring AA).

## B4 · layout → theme · bar 33 (51.2 s) · hard cut · owner: none
Concept: layout ends on **black with only the orange dot at frame centre** (bar 32 beats 3–4,
50.4–51.2, after 「さあ」). On the drop the dot **explodes into the colour burst**.
- Contract (agreed layout + theme, 2026-10-11):
  - 50.4–51.2 LAYOUT shows pure `#0A0A0B` and nothing else but the dot: centre (960, 540),
    solid `#FA8023`, drawn with `drawDot()` (`_shared/moon.ts`), no rim.
  - Dot radius 7 px until 51.0, then an anticipation squeeze with no return:
    `r(t) = 7 − 1.5·inQuad((t − 51.0)/0.2)` over 51.0–51.2 → last frame 51.183 ≈ 5.6 px.
  - Halo: radial falloff from rgba(250,128,35,0.22) at r 7 to 0 at r 36, faint breathing;
    shrinks with the squeeze to alpha ≈0.10, outer r ≈22 at 51.183.
  - No pre-glow, no shake, no flash on LAYOUT's side; `f.post` left at engine defaults.
    Overlay draws nothing in 50.4–51.2 (lyric L8 ends by 50.4).
  - THEME frame 51.2 (frame 3072) is already one frame into the explosion: flat `#FA8023` disc
    r ≈38 at (960,540), `#FAFAF7` shock ring r ≈70 (2 px, α≈0.85) with sparkles, shake starts
    (±6–8 px decaying); the first theme-colour disc appears on the next frame. The hit belongs
    entirely to frame 51.2.
- Log:
  - layout 2026-10-11: contract agreed with theme; to verify with a dense sheet 50.4–51.6
    (`--only layout,theme`) once both sides render.
  - layout 2026-10-11: verified on renders: dot core 14 px wide centred (960,540) at 50.6 and
    51.0, 12 px at 51.183 (squeeze), halo faint; theme's 51.2 disc ≈38 px radius from the same
    centre. LAYOUT leaves f.post at engine defaults from 50.4 (ca back to default by 50.4).
  - theme 2026-10-11: verified with `--only layout,theme` (dense 50.9–51.4 + full-res 51.183/51.2):
    layout's squeezed dot (r≈5.6, halo) at 51.183 → theme's 51.2 orange disc r 38 + paper shock
    ring r 70 + 8 sparkles on the ring, same centre (960,540). The orange disc is the outermost
    of 13 flat discs (orange + the 12 theme primaries; the last = PURPLE·light world, ≈51.53).
  - layout 2026-10-11 (final polish): re-verified dot core 14 px at 51.0 / 12 px at 51.183,
    centre (960,540); post untouched from 50.4.
  - theme 2026-10-11 (final polish): re-verified (dense 51.0–51.6, both scenes): 51.183 dot
    (layout) → 51.2 orange disc r 37.6 measured; the later burst discs now flood off-centre, frame
    51.2 itself unchanged.

## B5 · theme → cli · bar 41 (64.0 s) · window 63.2–64.8 · owner: **cli**
Concept: the colourful chorus page **shrinks into a window on a retro OS desktop** (title bar
appears around it, it lands on the desktop, perhaps minimises to the taskbar) as the half-time
groove drops in; the terminal opens. The colour of the last theme can tint the desktop.
Figure: the page frame → OS window.
- Contract (agreed theme + cli, 2026-10-11):
  - Story: bar 39 the orange dot (cursor) picks the OCEAN card from THEME's ring; 39.4 it flips
    to dark; bar 40 it flies to camera and lands **maximised**: the real docs page full-bleed.
  - Last theme: **ocean · dark**. Plate `/plates/themes/ocean-dark.png` (1600×900 CSS @2x),
    drawn by THEME with `drawImage` to exactly (0, 0, 1920, 1080), imageSmoothingQuality 'high'.
    Landed by 63.0; from 63.0 nothing on top, no grade/bloom/glitch/vignette in THEME's image,
    no rotation, camera locked; no scene typography. (Stand-in plate until the plates land, same rect.)
  - Post: THEME ramps its own f.post back to engine defaults over 62.6–63.0; as non-owner in
    the window THEME never touches f.post.
  - The dot is handed to CLI at 63.2: THEME's frames from 63.2 do **not** contain it. State at
    63.2: centre (960, 540), r 7, `#FA8023`, `drawDot()`, no glow/ring, at rest since 63.05.
    CLI draws it from 63.2 (desktop cursor → restore click → terminal caret).
  - CLI (owner): 63.2–63.55 the dot (from rest) flicks to the restore button while a 30 px pixel
    title bar slides down over the page top (63.3–63.45); 63.6 the cursor clicks restore;
    63.6–64.0 the page restores down (log-size, accelerating into the landing, 3 trailing zoom
    rects) into a window landing on the 64.0 downbeat with a small settle: content rect
    x 1052–1852, y 200–650 (800×450), cream retro desktop + taskbar around it. CLI shows f.other
    untouched until 63.45, cross-fades to its own identical drawImage of the same plate by 63.6.
  - Overlay hints from 63.2 are set by CLI (tone dark → light ≈63.8).
- Log:
  - theme 2026-10-11: contract written; to verify with `--only theme,cli` over 63.2–64.8.
  - cli 2026-10-11: window rect moved to 800×450 at (1052, 200); restore + dot hand-over rendered
    and checked frame-by-frame with `--only theme,cli` (63.2–64.25, every 2 frames).
  - cli 2026-10-11 (final polish): B5 unchanged; zoom-rect trail shortened (gone by 64.1).
    Re-verified every frame 63.0–64.3 with `--only theme,cli`.
  - theme 2026-10-11: verified with `--only theme,cli` (real plates): the chosen card lands
    full-bleed by 63.0 using the full-res plate texture, then THEME switches to the 2D drawImage
    of `/plates/themes/ocean-dark.png` to (0,0,1920,1080); 62.95 / 63.0 / 63.183 / 63.2 crops are
    identical, dot at (960,540) r 7 handed to CLI at 63.2 with no jump.
  - theme 2026-10-11 (pass 2): bar 40 is now a camera rush (zoom blur + speed lines 62.4–63.0) with a
    hard stop on ト; re-verified with `--only theme,cli` (dense 62.75–63.35): the last blurred frame
    is 62.983, 63.0–63.2 are the clean 2D plate, hand-over unchanged. B4 re-verified too.
  - theme 2026-10-11 (pass 3): README ring rebuilt as a camera-facing cover-flow with physical
    cards; timing, repaint cadence and the landing unchanged; B5 re-verified (`--only theme,cli`,
    dense 62.75–63.35): identical to pass 2.
  - theme 2026-10-11 (final polish): B4 and B5 re-verified with both neighbours. B4: layout's dot
    at 51.183 (r≈5.3) → theme's orange disc at 51.2 (r 37.6 measured, centre (960,540) + the
    agreed impact shake). B5: the orange dot measured at (959.5, 539.5) px-centre in 63.0, 63.183
    and cli's 63.2 — identical; the last rush-blurred frame is 62.983, 63.0–63.2 the clean plate.

## B6 · cli → integrations · bar 49 (76.8 s) · window 76.4–77.6 · owner: **integrations**
Concept: CLI ends with the build and a **stop on bar 48 beat 4**: the orange block caret centred
and enlarged. On the drop the caret **becomes the request packet** shot into the OpenAPI pipeline.
Figure: the caret / orange dot.
- Contract (AGREED integrations + cli, 2026-10-11):
  - 76.4–77.6 cli renders: full-frame INK `#0A0A0B`, nothing else, one solid block caret
    `#FA8023`, pixel-aligned, crisp, no glow, not blinking. Rect centred (960, 540), 48×96 px
    (x 936–984, y 492–588). cli keeps rendering this held frame through 77.6. cli's whip-push
    into the terminal caret (12×24 at 1× → 4×) decelerates to zero velocity at 76.4, and on the
    76.4 frame the terminal clears (prompt text cut on the stop). cli doesn't touch f.post from
    76.4 on.
  - integrations owns any anticipation: it may cover cli's caret with INK and draw its own
    from 76.6 (recoil/squash).
  - 76.4–76.8 integrations composites cli's frame (plus its own anticipation). At 76.8 (frame 4608) it cuts to
    its own frame, which starts from the identical caret rect. The world (rail through the
    screen centre, clock-disc ticks below) appears around it with an impact flash and a
    chartreuse shock ring. The caret squashes for 2 frames, then fires **right (+x)** along the
    rail as the packet (stretched streak → dot), drawing the travelled path. The camera chases
    right with a clockwise roll (−60° over about 0.4 s) and cranes up into the OpenAPI station.
  - Post: f.post is shared in the window. integrations sets the defaults (grain 0.04,
    vignette 0.22, ca 0.0008) every frame. Overlay hints from integrations: lyrics 'hidden',
    tone 'dark'.
- Log:
  - integrations 2026-10-11: proposal sent to cli (rect, colour, held frame, direction).
  - integrations 2026-10-11: verified --only cli,integrations 76.2–77.2 every 2 frames: cli's
    held caret 76.4–76.6, my anticipation 76.6–76.8 (converging streaks, gathering glow,
    compressed caret), impact + launch from the identical rect at 76.8. Times inside the
    scene are snapped to frame times (at(49) = 76.80000000000001 ≠ frame 4608's 76.8).
  - integrations 2026-10-11 (pass 2): re-verified 76.3–77.1 every frame with cli: held caret
    76.4–76.6, anticipation, then at 76.8 the colour slam (key-colour negative) → the chartreuse
    field + CONNECT sign + OPENAPI title slam. The caret rect at 76.8 is unchanged.
  - integrations 2026-10-11 (final polish): re-verified 76.3–77.1 every frame with cli. The
    OPENAPI title band and full word appear complete on the 76.8 hit frame (no pre-roll over
    cli's stop frame; the other blocks' bands slide in over the 4 frames before their downbeats).
  - integrations 2026-10-11 (final polish): re-verified 76.0–77.0 again after cli darkened its
    desktop during the tape stop. Push → INK + caret at 76.4 → anticipation → 76.8 hit, continuous.
  - cli 2026-10-11: agreed; push into the caret implemented (75.35 gentle push → 76.0 outQuart
    slam on the tape stop → exact 48×96 at 76.4, terminal cleared). Checked `--only
    cli,integrations` 75.9–76.9 every 2 frames.
  - cli 2026-10-11 (final polish): during the tape stop (76.05–76.37) the desktop around the
    terminal now darkens to INK, so the 76.4 stop only clears text. 76.4–77.6 still INK + the
    48×96 caret at (936, 492), f.post untouched. Re-verified every frame 76.0–77.0.

## B7 · integrations → showcase · bar 57 (89.6 s) · window 88.8–90.4 · owner: **showcase**
Concept: the four integration outputs **converge into the core (the moon)**; it flashes on the
final-chorus downbeat; the camera pulls back and the core is now **the moon over a night city of
showcase screens**.
Figure: the core / moon.
- Contract (AGREED integrations + showcase, 2026-10-11):
  - 88.8–89.6: showcase shows integrations' frame untouched (it may add a faint glint on the
    core in the last 2–3 frames). Re-timed to the real track: the pull-out reveal of the ring is
    on bar 56 b2 (88.4). The outputs land in the centre on the fill's 16ths (88.8 / 88.9 /
    89.0 / 89.1). In the stop (89.2–89.6) the ring tightens into the moon's rim (r 140 at 89.5).
  - 89.583 (last frame before the downbeat): ONE moon via `_shared/moon.ts` **drawMoon (2D)**.
    Centre (960, 540), radius 140 px, default colours (INK → ORANGE, ORANGE rim), on INK
    `#0A0A0B`. A soft orange halo builds over 89.2–89.6 and peaks at about 89.58, with no
    full-frame white. Spokes, rings, grid and stations are gone by 89.5.
  - Motion at 89.583: zero. integrations' push-in eases to rest. No rotation.
  - 89.6–90.4: integrations keeps rendering the static moon (960, 540) r 140 plus a breathing
    halo, nothing else. showcase owns the downbeat flash (white-hot out of the halo) and the
    pull-back (crane-down + zoom-out: moon to about (1180, 280) r ≈ 80 by 91.2).
  - Post: integrations leaves f.post alone inside the window (only overlay hints: lyrics
    'hidden', tone 'dark' while non-owner).
- Log:
  - integrations 2026-10-11: contract agreed by message with showcase. integrations will ping
    showcase when 88.0–90.4 renders for the frame-by-frame check.
  - integrations 2026-10-11: re-timed to timing.json (fill 88.8–89.2, stop 89.2–89.6). Rendered
    --only integrations,showcase 89.3–90.4: moon clean at 89.583, showcase flash picks it up;
    showcase pinged for its check.
  - integrations 2026-10-11: final re-check after plates + re-timing: ring rim merges into the
    moon by 89.5, last arrival ping gone before 89.583, showcase burst at 89.6 continuous.
  - integrations 2026-10-11 (pass 2): re-verified 88.75–90.4 every frame with showcase after
    the colour fields: the fields fade with the world over 88.95–89.35, so from about 89.4 the
    frame is only the moon on INK. Moon (960, 540) r 140 at rest at 89.583; contract unchanged.
  - integrations 2026-10-11 (final polish): re-verified 88.75–90.4 every frame with showcase.
    The reveal now leads with the zoom-out; convergence timing and the 89.583 moon are unchanged.
  - showcase 2026-10-11: confirmed. showcase stops sampling f.other after the flash peak
    (~89.65); the moon continues as showcase's own drawMoon at the identical centre/radius.
  - showcase 2026-10-11 (implemented): f.other is shown untouched for t < 89.6. At 89.6 the
    camera is exactly framed on the moon ((960, 540) r 140, kick nudges disabled until 89.8);
    a designed burst (radial white-hot flare, post.flash 0.5 decaying in ~3 frames, two shock
    rings, sparkles) masks the cut, then crane-down + zoom-out: moon (972, 412) r 107 @90.0 →
    (947, 326) r 92 @90.4 → (805, 247) r 85 @91.2 (it ends up-left, over the avenue, not at
    (1180, 280)). Verified frame by frame with --only integrations,showcase 89.3–90.15.

## B8 · showcase → outro · bar 65 (102.4 s) · window 101.6–103.2 · owner: **outro**
Concept: the showcase **mosaic forms the moon**; on the outro downbeat the mosaic **collapses
into the Fumadocs logo** and colour drains to monochrome + orange.
Figure: the mosaic circle → logo moon.
- Contract (AGREED showcase + outro, 2026-10-11). Source of truth:
  `mv/src/scenes/showcase/contract.ts` (side-effect free; outro imports `MOSAIC`, `tileRect`,
  `tileInDisc`, `mosaicTiles()` read-only):
  - Disc centre (960, 540), R 300 px, on INK `#0A0A0B`.
  - Axis-aligned grid, pitch 40×25 px, gap 2 → tiles 38×23 (16:10 site screenshots). A column
    is centred on CX (tile x ∈ [941+40i, 979+40i)); a horizontal seam is centred on CY (row j
    covers y ∈ [541+25j, 564+25j)). Every tile edge is on an integer pixel. 312 tiles,
    15 columns × 24 rows (x 661–1259, y 241–839).
  - Inclusion: a tile exists iff its rect intersects the open disc; visible part = rect ∩ disc,
    anti-aliased circle edge. Gaps are INK.
  - Wash: `drawMoon(c, 960, 540, 300, { alpha: 0.55, rim: 0 })` over the tiles (normal
    blend), then a 1.5 px `#FA8023` rim stroke centred on R.
  - Formation locks at 101.6; the disc (tiles, wash, rim) is pixel-static 101.6–103.2: no
    breath, no per-frame noise, no bloom spill — it is showcase's top layer, nothing overlaps
    it. Tiles keep their still screenshot content.
  - Outside the disc: the distant city skyline under the moon; its lights switch off on the
    music's pause at 102.0 (bar 64 beat 4). showcase sets no flash/shake/post accent at 102.4
    and keeps rendering the identical frame through 103.2.
  - outro (owner): passes f.other through untouched from 101.6; a small orange comet runs the
    rim during the pause 102.0–102.4; from 102.4 every tile becomes a 3D card whose front
    samples f.other at its rect and flips (diagonal wave TL→BR) to its back = the moon gradient;
    the skyline fades to INK over 102.4–103.0; outro swaps in its own identical 1.5 px rim at
    ~103.0; collapse to logo size later (~104.0).
- Log:
  - showcase 2026-10-11: contract.ts written (grid + LANDING/MOSAIC_NAMES for the overlay).
  - showcase 2026-10-11 (implemented): camera at rest from 101.4; the 3D docked tiles crossfade
    into the exact 2D disc (drawn from contract.ts) over 101.4–101.583; from 101.6 that layer's
    texture is reused untouched (disc pixel-static through 103.2). Skyline + aviation lights off
    at 102.0. No post accents from showcase in the window. Checked with --only showcase,outro.
  - outro 2026-10-11: first pass verified with the real disc (`--only showcase,outro`). Frame 102.4
    (outro composing: f.other minus tile rects + 312 rebuilt 3D cards) is pixel-identical to 102.383
    (pass-through) inside the disc (max diff 0); the only change on the downbeat is the deliberate
    chord ring leaving the rim. Flip wave 102.4→~103.0, seams healed ~103.45, 3D→2D moon swap at
    ~103.73 is invisible (diff ≈ consecutive-frame noise). Sky outside the disc: desaturates
    102.4–102.75, sinks to INK by 103.1; showcase rim covered by outro's identical rim from 102.8.
    Overlay hints: outro sets only tone 'dark' until L14's pre-roll (102.25), so L13 keeps 'final'.
  - outro 2026-10-11 (final pass): re-verified with showcase's finished disc and the final soundtrack
    (timing.json). Dense sheets 101.6–103.8 show no pops; takeover still pixel-identical inside the
    disc. Bar 65 now pushes in 1.00→1.10 (camera scale is applied to f.other via xform, to the cards
    via camera zoom, to 2D via setTransform), so showcase needs nothing beyond the locked disc.
