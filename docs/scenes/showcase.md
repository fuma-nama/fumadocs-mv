# SHOWCASE — `showcase` · bars 57–64 · 89.6–102.4 s · word: PUBLISH

Final chorus (+1 semitone), the film's peak: full colour, biggest camera moves. Lyrics L12
"せかいの どこかで ページが ひらく — somewhere in the world, a page opens" (57–60) and the hook
L13 "よんでよ リードミー きみだけの ドキュメント" (61–64).

**One idea:** the moon (Fumadocs) hangs over a night city whose every screen is a real site
built with Fumadocs. Pages open all over the city; eight of them fly out to us; on the PUBLISH
click every screen in the city lifts off and docks into the moon, which is revealed to be a
mosaic of all of them — the moon the outro turns back into the logo.
*Follow the dot:* core → moon (sky) → screens fly toward it → mosaic moon → logo.

## World & look
- **Night city of screens** (three.js, flat/toon): ink slab towers (instanced, 900+) with thin
  violet edge lines (render3D edges), procedural AA windows (warm/cool, a few fully lit floors,
  fading to an averaged glow with distance), street-level neon strips, roof rims; violet depth
  fog; red aviation lights blinking on the 8ths; a wet street (screen-space mirror of the lit
  frame under a ground mask, streaked + gently rippled). Screens: 312 billboards (blades over
  the sidewalk, big LED walls on the avenue facades, rooftop and back-row billboards) showing a
  64-site atlas (repo showcase OG cards + live captures), 13 portrait screens scrolling full
  docs pages. Night exposure: screens dim (to 0.42) and cool with distance (60→340 m), white pages are tamed, and bright sparse pages are only assigned to slots far from the camera path (true colours once docked).
- **Sky**: 2D, projected from the 3D camera: ink → violet haze by elevation angle, stars on
  limited animation (12 fps), sparkles; **the moon = `drawMoon`** at the projected
  position, constant angular size; it hangs up-left over the avenue (world (−500, 520, −1700)).
- Towers are lowered wherever they would cover the moon from any sampled camera position
  (descent, avenue, parade, final shot) — the moon is always open sky.
- **Colour**: the sites bring the colour; the city body stays ink; each landed card's key colour
  drives its brackets/index cell, a glow behind it and the overlay's lyric accent.
- Motifs: moon/dot (guide; the PUBLISH cursor), boxed tracked PUBLISH, P1PE annotation (index
  cells 01–09, lock-on brackets, leader-line tags, mono URLs, DOCKED % counter), sparkles.

## Shot list (as implemented)

Beat 0.4 s, 8th 0.2 s. Times are absolute seconds.

| t | shot | what moves (downbeat / beats / 8ths) |
|---|---|---|
| 88.8–89.6 | S0 B7 inherit | integrations' frame untouched (outputs land on the fill 16ths, stop + swell, moon at (960,540) r 140, at rest). |
| 89.6 | S1 burst | crash + key change: light bursts out of the core — an additive orange-white radial flare that is gone within ~2 frames (no flat full-frame flash), a warm shock ring, sparkles thrown outward (12 fps). My moon is exactly the core. |
| 89.6–91.2 | S1 moonrise / descent | crane-down + zoom-out (fov 31→55): moon → (805,247) r 85; the skyline rises; the city wakes in a wave from the horizon toward us on 16ths (towers, then windows, then screens boot as thin lines opening into pages). Aviation lights from 89.75. |
| 91.2–92.8 | S2 avenue | establishing shot at 91.2, then a fast banked run down the avenue (LED walls, blades, scrolling docs pages stream past; kick nudges 1–2 %); brake into the parade. |
| 92.4–95.6 | S3 parade | 9 sites land front-centre: 92.8 Evil Charts (hinge: the facade screen swings out like a page — "ページが") · 93.2 shadcn/ui (from the vanishing point) · 93.6 Better Auth (full flip) · 94.0 Zod (rises, flipping up) · 94.4 Prisma (drops with a roll) · 94.8 Better T Stack (whip) · 95.0 ArkType (split-flap leaf) · 95.2 Turborepo (snap) · 95.4 Zen Browser (glitch-in). Each card lifts off a real billboard (lock-on brackets + URL on it 0.2 s before), is dealt over the previous card, lands on the kick with a 1.8 % punch, holds with a slow push; label above: index cell 01–09 in the key colour, boxed name (Michroma), URL typed on 16ths, corner brackets. City rack-focused + dimmed behind; the moon stays crisp. Old cards launch toward the moon. |
| 95.4–96.0 | S4 PUBLISH | Zen Browser holds readable through 95.8 (one extra 8th) while the orange dot leaves the moon on beat 4 (95.6) and arcs over it; at 95.8 Zen squashes into the boxed PUBLISH button (shape match); the dot clicks it on the 16th 95.9: box fills orange, ripple ring. 96.0 crash: radial light from the button + shake. |
| 96.0–97.6 | S5 launch | crash: flash + shake punch; every screen flares and lifts off its facade in 16th waves (near first), arcing up into the moon; the camera cranes up over the rooftops and telephotos onto the moon (fov 55→9); tiles dock into the mosaic grid from the centre out (dock flash); the moon's gaps go ink; PUBLISH docks into a HUD with a DOCKED 000→312 / % counter. |
| 97.6–99.2 | S6 wall | close on the moon's face: tiles ~190 px (every site legible), lateral drift + dutch; tiles flip to other sites and back in diagonal waves on the 8ths; two name tags per beat (leader line + boxed name + host). |
| 99.2–101.4 | S7 zoom-out | the long lens pulls back: the wall's edge curves into view — a disc, the moon over the distant skyline; wash rises to 0.55 and the 1.5 px rim draws on. Camera at rest 101.4. |
| 101.4–101.6 | lock | 3D tiles crossfade into the exact 2D disc from contract.ts. |
| 101.6–103.2 | S8 B8 (outro owns) | pixel-static disc; skyline windows + aviation lights switch off at 102.0 (the pause); identical frames through 103.2. |

## Objecthood (treatment §2)
Everything that turns out of the screen plane is a real object (`objects.ts`):
- **Parade cards**: bevelled slabs (thickness 1.2 % of the width, rounded corners) with graphite
  edges lit by the key light (upper left, the moon's side), turn lighting on both faces (the face
  dims as it turns from the light, a soft sheen sweeps across it), a dark back panel printed with
  the Fumadocs moon, and a soft shadow projected along the light onto the card beneath (each card
  is its own pass, newest dealt on top; deck depth staggered 0.3 m per card).
- **Screens / tiles** are boxes (0.7 m panels with lit edges). Mounted on buildings they render as
  before; from lift-off (launch tumble, docking, wall flips) the turn lighting switches on.
- **Wall flips (97.6–99.2)**: a flipping panel lifts off the moon's face (0.56 × its width) to
  turn, revealing a lit socket behind it (the moon's own gradient colour), and casts a soft shadow
  (silhouette projected along the light) into the socket and onto its neighbours.
- Facing the camera, every face renders exactly as before; the B8 disc is untouched.

## Alternatives considered
- **B7:** (a) flash + crane-down/zoom-out — chosen: one continuous figure, reverses
  integrations' push-in; (b) iris: integrations inside the moon disc shrinking to the sky moon
  — tidy but small, not "grand"; (c) hard cut to a wide city — loses the figure.
- **Parade:** (a) cards lifted out of the city's own screens, varied 3D entrances over the
  defocused moving city — chosen: the city stays alive behind, each card is crisp and
  readable; (b) camera whips between billboards in-world — perspective/lighting hurt
  legibility at 24 frames per site; (c) single flap-display flipbook — reads as a slideshow.
- **Mosaic:** (a) the city's screens launch and dock into the moon, wall close-up, zoom out to
  the disc over the skyline — chosen: grand, alive, ties city ↔ moon, PUBLISH = launch;
  (b) zoom out from the last card through a flat wall to a disc — clean but static;
  (c) giant README letters filled with the mosaic — duplicates theme's hook typography and
  fights the lyrics.

## Safe zones & overlay
- Lyrics (overlay) lower band y 800–1010, x 140–1780 → cards end at y ≈ 782, labels go above.
- Credits 出演 SHOWCASE top-right x ≥ 1500, y 84–240 during 92.8–99.2 → kept clear.
- `f.overlay.tone = 'dark'` every frame; lyric accent follows the landed card in 92.8–96.0.

## Implementation map (mv/src/scenes/showcase/)
- `contract.ts` — B8 grid (`MOSAIC`, `tileRect`, `tileInDisc`, `mosaicTiles()`), `LANDING`,
  `MOSAIC_NAMES` (side-effect free; imported by outro and the overlay credits).
- `sites.gen.ts` — generated site data (atlas cells, strips, hero files, accents).
- `index.ts` — camera keys, orchestration, compositing, labels/PUBLISH/tags/burst.
- `timeline.ts` (anchors), `rig.ts` (moon, camera Hermite keys, projection), `city.ts` (layout,
  tower/ground shaders, aviation lights), `screens.ts` (instanced billboards + strips),
  `parade.ts` (cards, entrances, slot picking with occlusion test), `mosaic.ts` (swarm flights,
  dock, wall flips, sockets, tile shadows, exact 2D disc), `objects.ts` (slab geometry, turn
  lighting, card shadows), `sky.ts`, `reflect.ts` (wet street).
- Assets in `assets/scenes/showcase/`: `atlas.jpg` (70 sites, 512×320 cells), `strips.jpg`
  (full pages for portrait screens), `hero/*.jpg` (parade). Built by the scratch script
  `tools/build_assets.py` from the repo thumbnails + `assets/showcase` captures.

## Final polish (round 1: defect list, ranked by visibility)

Reviewed v1 (`out/roughcut-v1.mov`, 88.8–103.2, 1/4 size, with lyrics/credits) and the current
code with both neighbours loaded (every-2-frame sheets, every-frame around accents, full-res
downbeats, contrast-stretched grain-off frames for banding).

1. **Wall close-up (96.8–101.4) too busy behind the hook lyric (L13).** The English line and the
   ruby break up over bright tiles. Fix: calm band y ≥ 770 (soft 770→830): −35 % and ~3 px blur,
   eases in 96.8→97.0 and out 101.0→101.4, so the disc is exact before the B8 lock. Overlay
   adds a frosted backing scaled to the remaining clutter (agreed).
2. **89.65–90.4 reads as an empty dark stretch.** The wake is too subtle at phone size: the
   exposure ramp also scales the window lights. Fix: lights unaffected by exposure, windows
   flare as they switch on, brighter far-field glow, edge lines brighten with the wave, and
   street lamps along the avenue switch on in 16ths from the horizon toward the camera.
3. **PUBLISH morph squashes the Zen Browser capture non-uniformly** (~4 frames of distorted
   UI). Fix: uniform shrink and fade, while the box outline morphs from the card's rect to the
   button.
4. **8th-note cards (94.8–95.4) are clean for only 3–6 frames.** Each next card starts
   entering 0.17 s early. Fix: 0.12 s snap entrances that settle exactly on the 8th, plus a
   1-frame rim glint on landing.
5. **Banding** in the sky haze, moon glow, parade accent glow and burst (8-bit canvas
   gradients). Hidden by grain in the master; it shows once encoders crush the grain. Fix: these
   gradients render in a shader with float math and TPDF dither before the 8-bit write.
6. **Aliasing while moving.** Distant window grids shimmer (cells of 2–7 px), road dashes and
   zebra use unfiltered `step` (crawl/moiré), and windows toggling on 8ths flicker at
   distance. Fix: earlier far-field averaging, analytic AA for the road marks, toggles on near
   windows only.
7. **Launch 96.0–96.5:** the nearest tiles sweep past the lens as big abstract slabs. Fix:
   start them further from the lens.
8. **Wall flips start off the grid** (x.x7) and settle at x.x94. Fix: settle exactly on 8ths.
9. Small: check the mono rule on all URLs (done: labels, lock-on, tags, HUD are all mono);
   card shadows on the deck at the 8th-note pace; the B7/B8 windows re-verified at the end.

### Final polish: status (all items fixed)
1. Lyric band over the wall: fixed. The calm band (−35 %, ~3 px blur, y ≥ 770 with a soft edge)
   eases in 96.8→97.0 and out 101.0→101.4, so the B8 disc is untouched. Wall tags stay inside
   x 300–1250, y 380–720 for their whole life. The mosaic gets a short shutter, so tiles stay
   legible. Overlay re-checked 96.8–102.4 and confirmed the hook reads at phone size.
2. Wake 89.65–90.4: fixed. Window lights no longer scale with the exposure ramp; each window
   flares as it switches on (three 16th steps, wave from the horizon); street lamps and their
   kerb pools ignite down the avenue in 16ths; the city's line art brightens during the wake.
3. 8th-note cards: fixed. Entrances shortened to 0.12 s with outQuint, so each card settles
   exactly on its 8th. Cards stay under the next one until they are covered. A 1–2 frame rim
   glint marks each landing.
   PUBLISH: the Zen capture now shrinks uniformly and fades while an outline contracts from the
   card's rect to the button. Nothing is stretched non-uniformly any more.
4. Banding: fixed. The sky haze, the moon halo, the parade glows, the burst flare and the crash
   light now render in a float shader with TPDF dither (`sky.ts` `skyPass`). Verified by
   contrast-stretching grain-off frames.
5. Aliasing: fixed.
   - Window coverage is box-filtered, and the far-field average starts later.
   - Road dashes and the zebra crossing use analytic box-filtered pulses.
   - The 8th-note window toggles only run on near windows.
   - Camera motion blur (180° shutter, flow fitted per frame from the camera keys, `motion.ts`)
     streaks far windows instead of strobing; it is shortened on the mosaic.
6. Launch: fixed. Slots along the camera path carry dark pages only, so no white slabs sweep
   past the lens, and the lift-off flare is scaled down for screens near the lens.
   - City: light pages sit further from the camera path, and blank white pages furthest away.
   - Lamp pools hug the kerb, so the road stays ink.
7. Wall flips: fixed. Each turn now settles exactly on an 8th (98.0 … 99.2). Return turns are
   spread over three 8ths, so no single beat turns half the wall. Sockets are darker and clipped
   to the disc.
8. Mono rule: OK. All URLs and hosts (card labels, lock-on brackets, wall tags, HUD) use
   FONTS.mono.

Left as is: the first frame of the section costs ~0.45 s (one-time shader compile); steady
state is a median of 54 ms per frame (p95 63 ms).
