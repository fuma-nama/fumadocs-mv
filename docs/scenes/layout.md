# LAYOUT — bars 25–32 · 38.4–51.2 s · word ARRANGE

Pre-chorus build (energy 6 → 8, break at 50.4). Lyrics (real timing): L5 な ら べ て 38.6–39.2
(+hold), L6 く み か え て 41.8–42.6, L7 か た ち を 45.0–45.6 / か え て ゆ く 46.4–47.2, L8 さ 49.6 /
あ 50.0 (sustains to 51.0). Credit 美術設定 LAYOUTS 41.6–44.8 top-right (overlay).

**Idea.** Fumadocs' six layouts are *architecture*: the same page built in six arrangements.
They are drawn as neon line art (INK planes, white edges, ORANGE outer frames and active states),
lined up, physically rearranged while the real UI projects onto them, then laid down and
extruded into a city whose plan keeps changing faster and faster — until the whole city spirals
into one frame, the frame rounds back into the ring it came from, and the ring contracts into
the orange dot. The dot (TOC's guide dot) is the eye's anchor through the whole section.

## Rendering (mv/src/scenes/layout/)
- `geo.ts` — every layout's wireframe is **generated from the real captures' element boxes**
  (`/plates/layouts/<id>.boxes.json`, 1440×900): group slabs (sidebar, navbar, tabs, main, toc,
  page, pills, panel, hero, surface) + keyed content (logo, search + kbd, tab dropdown, every
  sidebar row, breadcrumb, h1, description, page actions, paragraphs wrapped with the real text,
  cards, callouts, the real TOC rail path from `thumb.d`, Glass minimap ticks, Flux panel
  controls, Home hero). Same keys across layouts → any layout morphs into any other.
- `morph.ts` — keyed interpolation with per-group stagger (chrome first, content last),
  outBack landing; unmatched slabs collapse to an edge, unmatched content rides its group.
- `builder.ts` — one `Ink` (fat lines: frame/edge/fine in screen px, text bars in world px,
  fills, translucent glass) rebuilt per frame; frames can be extruded into edge-lit slabs
  (walls + back outline + corner posts). Glow = separate line-only pass (fills occlude),
  two blurs, screen-blended.
- `plates.ts` + `CROPS` — the real capture is cut into per-panel pieces that ride the moving
  slabs; dim while panels move, revealed again behind a scan line when they settle.
- `world.ts` — the whole section as a pure function of t (instances, camera, dot, labels).
- `hud.ts` — B3 heading unroll (TOC's `ring.ts` glyphs → `LAYOUT_HERO` rows), HUD dims,
  ARRANGE, labels, guide dot, L8 さあ cells (overlay's `drawPreCell`), B4 final dot.

## Shot list (as implemented)

### A · Square-off (37.6–39.6) — B3, bar 25 b1–3
- 37.6–38.4 TOC's frame untouched (magic circle completes; ca 0 for continuity).
- **38.4** pixel-identical redraw (ring + dot + heading ring), then the ring squares off in two
  overlapping stages (round → square 0–0.24 s, square → 16:10 0.05–0.42 s), 3 px ORANGE constant;
  a 0.25 s radial snap smear. The 19 headings fly glyph-by-glyph off the ring into the frame's
  "On this page" column (staggered 16 ms per heading, `layoutDefault(HERO_TOC)` rows), their TOC
  line draws on with Layouts › Docs active in orange.
- **38.8** panel separators draw on; **38.8–39.6** the Docs skeleton cascades in; the dot runs
  along the top edge onto the TOC thumb.
- **39.2** HUD: registration crosshairs, dimension lines `268 · 1440 · 268 · 900`, label
  `01 DOCS fumadocs-ui/layouts/docs ドキュメント`, boxed **ARRANGE** (top-left).

### B · Lineup (39.6–41.2) — bar 25 b4 – bar 26
- **39.6** (clap) whip: the camera swings 3/4 down the row (inOutCubic 0.46 s, sideways smear);
  NOTEBOOK · FLUX · GLASS · SPACIOUS · HOME draw on in a 0.1 s domino; glossy floor + grid fade in.
- **40.0–41.0** low, wide (fov 46) truck along the row; the dot hops frame to frame on 8ths
  (40.2, 40.4 snare, 40.6, 40.8 kick); each frame's label opens (`0N NAME`, package path, katakana)
  while the dot sits on it. Kick punches (1.2 % dolly).
- **40.98–41.2** rush down the row into HOME (radial smear), frontal on the 41.2 snare.

### C · Rearrange (41.2–44.8) — くみかえて, bars 27–28
- 41.2 HOME's real capture scans on. Then one rearrangement per half bar (kicks on 1 and 3):
  **41.6 NOTEBOOK** (hero folds, navbar + tabs + sidebar + TOC slide in), **42.4 FLUX** (chrome
  folds, article centres, floating panel rises), **42.8 (snare)** Flux's page tree opens as the
  full-screen blurred overlay (real capture crossfade), **43.2 GLASS** (the tree flies into the
  floating translucent sidebar, pills land, TOC → minimap ticks), **44.0 SPACIOUS** (card surface,
  inset rounded page panel). Bars 29–31 also cycle the variants (Notebook nav 'auto', Notebook
  tabs 'navbar', Flux overlay).
- Each morph: capture pieces dim and travel with their panels, skeleton shows the motion,
  0.26 s later a scan line re-reveals the new real capture (flicker, RGB-free).
- Split-flap hero label (`02 NOTEBOOK` …), dot rides the active element (TOC thumb, Flux
  progress ring, Glass minimap tick, Spacious block TOC). Slow yaw + push, kick punches.

### D · Architecture (44.8–49.6) — かたちを かえてゆく, bars 29–31
- **44.8** frames tip back onto the floor (staggered by distance), the camera cranes into an
  orbit; panels extrude into edge-lit buildings (kick-pumped heights); morphs on beats.
- **46.4** (bar 30) the city rises in waves from the centre; morphs on 8ths.
- **48.0** (bar 31) morphs on 16ths, orbit accelerates (keyframed azimuth/elevation/distance),
  slight roll; edges heat to ORANGE and the glow rises with the real riser envelope (`fx`);
  CA creeps in; edge-of-frame depth of field.

### E · Collapse (49.6–50.4) + Dot (50.4–51.2) — さあ, bar 32
- **49.6 さ**: 1-frame flash, extrusions slam flat, the city loses its insides; the camera
  climbs overhead while every frame spirals one full turn into the hero's plot (vortex of bare
  orange frames, radial smear) and lands exactly on the hero outline on **50.0 あ**.
- **50.0–50.16** the frame rounds off into a ring (bookend of the square-off) with さ / あ cells
  riding it; **50.16–50.37** the ring contracts (echo rings) and the cells spiral in;
  **50.37** the dot.
- **50.4–51.2** pure INK + dot (B4 contract: r 7, faint breathing halo, squeeze 51.0–51.2).

## Pass 2 (director notes)
- **Big layout name** (title block, top-left, x 76, clear of the lyric band and the credit
  corner): `0N / 06` index, the name in Archivo 800 extra-condensed 104 px, orange underline,
  import path + katakana beneath. Switches 38.8 DOCS · 40.0 NOTEBOOK · 40.4 FLUX · 40.8 GLASS ·
  41.0 SPACIOUS · 41.2 HOME · 41.6 NOTEBOOK · 42.4 FLUX · 42.8 FLUX + PAGE TREE tag · 43.2 GLASS ·
  44.0 SPACIOUS; rolls out at 44.8. Each switch is a slot-reel roll (old and new letters scroll
  one line apart, 5 ms stagger, 0.08 s), the underline stretches to the new width and flashes.
- **Lineup restaged**: the camera sits far back (similar sizes for all six frames, ~280–330 px),
  drifting right; the dot hops on beats then 8ths (N 40.0, F 40.4, G 40.8, S 41.0, H 41.2) and
  each frame's number tag lights orange; the rush into HOME starts at 40.98.
- **Hero framing** in bars 27–28: 1000 px wide, centred at x 1020 (left column for the name);
  the rest of the row fades out on arrival and returns as the frames tip over at 44.8.

## Objecthood (film-wide rule)
- Every frame is a 48 px **slab** from the moment the camera leaves the frontal view (39.55 on):
  lit face (key light high behind-left; diffuse + a narrow specular sheen that slides across the
  face as the frame turns), side walls shaded by their angle to the light, dark back, edge-lit
  thickness (dim back outline + corner posts). Frontal shots (bar 25) use the same lit face, so
  there is no pop when the body appears.
- **Floor** (reflective, bars 26–29): a soft light pool + per-slab **shadows** (slab box
  projected along the key light, convex hull, feathered), rendered under the reflections.
- **Tip-over (44.8)**: each slab falls over its back-bottom edge (physical pivot), lands on its
  back with the face 48 px above the floor; its shadow sweeps across the floor and the sheen runs
  over the face as it passes the light; the floor fades only after the landing (45.55–46.3).
  City buildings (bars 30–31) sit on the same slab bodies.

## Contracts
- B3 / B4: docs/handoffs.md (both agreed and verified).
- Overlay: L5–L7 lower band (y ≥ 820), L8 drawn by this scene ('scene' 49.6–50.4, 'hidden'
  after), tone 'dark' throughout, credit top-right kept clear.

## Alternatives considered
- B3: ring → carousel track; chose the square-off (direct shape match, constant stroke).
- Lineup: carousel / depth-stacked deck; chose the low truck along a straight row + rush.
- Rearrange: relay between frames; chose one hero frame (best recognition of the real UI).
  Docs is skipped in bars 27–28 (it was the bar-25 blueprint and READ's whole section) so each
  remaining layout gets a full half bar.
- Collapse: pull-back to a star / plain shrink; chose vortex → ring → dot (mirror of THEME's
  burst and of the bar-25 square-off).

## Final polish

Review: v1 delivered section at 1/4 size (`out/roughcut-v1.mov`), current renders with toc + theme
(downbeat stills, dense sheets around every move), timing.json event lists. Ranked by visibility.

| # | defect | where | fix |
|---|---|---|---|
| 1 | Name flips land *after* the hit: on the hit frame the index already reads `02 / 06` while the word still shows the old name (40.0, 41.6, 43.2…); the reel finishes ~0.1 s late | 38.8–44.0 | reel *ends* on the key (anticipates), index switches at mid-reel; 8th-note hops snap in 2 frames |
| 2 | SPACIOUS is never seen lit: the rush to HOME starts at 40.98, before the dot lands on 05 | 41.0 | rush starts 41.03 (still lands 41.2), dot lands on 05 at 41.0 with its tag lit |
| 3 | Landed hero face washed by a broad grey highlight; content contrast drops | 45.1–45.6 | narrower, dimmer sheen; the sheen is a sweep during the fall only |
| 4 | Bar-31 city has no focal point (every slab morphs on 16ths at the same brightness) | 46.4–49.6 | hero morphs on 16ths and stays bright/hot; the city changes on beats only, in waves from the hero, dimmer |
| 5 | L6 cells centred at x 960 while the hero frame is centred at x 1020 | 41.8–44.6 | lyricAnchor [1020, 896] while L6 is the current line (agreed hint) |
| 6 | Bar-25 frame bottom (784), corner crosshairs (797) and the `01` tag (818) crowd the L5 ruby (≈805) | 38.8–39.6 | frame 1060 px wide, centred y 424 (bottom 755); B3 ring unchanged (RING_BOX derives from the framing) |
| 7 | Capture pieces stretch non-uniformly while panels move (real-UI fidelity) | morphs 41.6–44.3 | pieces keep 1:1 scale and crop to the moving panel instead |
| 8 | Shimmer on slab edges / text bars during the orbit: glow pass rendered without MSAA; world-unit text bars go sub-pixel on far slabs | 44.8–49.6 | MSAA on the glow pass; bars thinner than 1.2 px on screen fall back to 1 px screen-space lines (dimmed) |
| 9 | Title block left margin 76 vs ARRANGE right margin 96 | 39.2–41.2 | both 84 |
| 10 | Downbeat glitch on the lock/unlock frames jogs rows hard enough to make the capture unreadable on the hit | 41.6, 42.4, 43.2, 44.0 | lighter jog (accent stays) |
| 11 | (checked, OK) sync: every key on its timing.json event (kicks 40.0/40.8/41.6/42.4/43.2/44.0, snares 40.4/41.2/42.8, L5–L8 onsets); mono for all paths; B3/B4 | — | — |
| 12 | HOME's capture showed 1 frame before its scan at 41.183 | 41.18 | pieces start exactly at 41.2 |
| 13 | Capture re-lock started 0.255 s after the key (between grid points) | 41.85, 42.65, 43.45, 44.25 | lock starts on the following 8th (41.8 = L6 く onset, 42.6, 43.4, 44.2) |
| 14 | B3 drift: TOC now renders its final frame supersampled; my 1× HUD glyphs differed at the switch (1573 px > 40/255) | 38.4 | HUD layer rendered at 2× (box-downsampled) → 57 px > 40/255, max 84 (ring AA only) |
| 15 | Riser CA (0.0016) fringed the bar-31 hairlines | 47.2–49.6 | capped at 0.0011 |

### Status (all fixed)
1–15 fixed. Verified: every-2-frame sheets of the whole section with toc + theme, every-frame
sheets at the switches/locks/rush/tip-over/collapse, downbeat stills, before/after stills vs the
delivered v1 (`scratchpad/scene-layout/polish/ba/`). B3: layout 38.400 vs toc 38.383 differ in 57
px > 40/255 (max 84). B4: dot core 14 px (51.0), 12 px (51.183) at (960,540), unchanged.
Steady-state 80–190 ms/frame (first frame of a session ~300 ms warm-up).
Left as is (deliberate): the 8th-note roll call shows GLASS/SPACIOUS for 0.2 s each (each now
lands crisp on its beat with its tag lit; all six get half-bar holds in bars 27–28).
