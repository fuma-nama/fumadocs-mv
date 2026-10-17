# CLI — bars 41–48 · 64.0–76.8 s · word: CUSTOMIZE · lyric L11 (43–44, 47–48)

Bridge, half-time reggaeton. "Make it yours" with `@fumadocs/cli`. One world: a P1PE-style
retro OS desktop (cream paper, pixel chrome, INK taskbar). Its wallpaper is the engineering
drawing of the **Document Engine**, which inflates into a toon 3D machine when the files are
ejected. The orange figure carries the eye through the whole section:
- theme's cursor dot → the desktop pointer (restore click, double-click)
- → the terminal's block caret → the ● of the select prompt → the ◒◐◓◑ spinner (moon phases)
- → the engine's moon core and the print head → the orange ◼ ticks of `add`
- → the caret again, which goes to integrations as the request packet.

Code: `mv/src/scenes/cli/` — timeline, term (clack model), state (windows/figure/camera),
ui (desktop drawing), engine3d + machine (3D engine, passes), hud, plates, wallpaper, stop.
Terminal strings are checked against the real recordings in plates/out/cli/transcript.json
(@fumadocs/cli 1.7.5, base-ui, Next): prompt texts, option order, hints, the 14 ejected files,
the dependency box, "What is Next?" lines, the `add` list order and its footer variants.

## Grid (timing.json, final)
Bars 41–47:
- kick +0.0 +0.8 · snare/clap +0.6 +1.2 · rim +0.3 +1.1 (+1.4 in odd bars) · hats 8ths
- bar 47: soft snare on 8ths; riser 73.6→76.4
Bar 48:
- kick 75.2, 76.0 · snare 16th roll 75.2→76.3 · tape stop 76.0→76.4 · dead stop 76.4–76.8
L11:
- き 67.2 み 67.5 の 67.8 | も 68.8 の 69.1 に 69.4 (→70.0)
- again 73.6 73.9 74.2 | 75.2 75.5 75.8 (→76.4)
Foley I picture to:
- click 63.6 / 64.6 / 64.8
- 22 typewriter clacks 65.0–67.1 (+5 ghost flams)
- cursor ticks on every select step
- enter 67.2 / 68.8 / 70.4
- clunk 70.4 / 71.0 / 71.2 / 71.6 / 72.0
- flutter 72.6–73.2 · servo + paper 73.2
- gear at +1.5 of every bar: the engine's gears and core rings ratchet a notch

## Palette / type
- PAPER desktop, INK chrome/terminal, WHITE windows, OCEAN `#2357A8` blueprint and active
  title bars.
- ORANGE = the figure only (pointer, caret, active ●, ◇ done, spinner, ◼ ticks, print head).
- Clack colours: cyan→SKY `#8FD0FF` (◆, active bars), green symbols→ORANGE, green text→MINT,
  dim/gray kept.
- Pixel chrome: DotGothic16 16 px. Terminal: JetBrains Mono 20 px on a 12×24 cell grid (78×23).
  Box-drawing and prompt glyphs (│┌└◆◇●○◻◼❯) are drawn as vectors on the grid.
- Boxed word: Michroma tracked 0.3.
- Post: vignette 0.07 / ca 0.0004 / grain 0.03 on the desktop. Ramped from the engine
  defaults at 63.6–64.0 and back to the defaults by 76.4. A whole-pixel vertical drop on each
  dembow hit (2 px kick, 1 px snare) from 64.0 to 76.0.
- Motion blur only during moves: the 2D desktop camera (whip-out, slam) and the 3D engine
  camera (inflate, whips, print flight) are blurred separately by their own velocity; the UI is
  never blurred while the 3D camera moves, and rests are never blurred.
- Overlay tone: dark until 63.8, light until 76.1 (the chant band is on cream throughout),
  then dark.

## Layout
- Taskbar y 1040–1080.
- Terminal content (66,160) 960 wide; a 72 px bar while typing, 576 tall after Enter.
- Page window content 800×450 at (1052,200). Montage window content (192,72,1536,864).
- Chant band (overlay) y 820–1010 kept clear in bars 43–44.
- Credit (overlay) top-right 45–46 kept clear.

## Shots (as built)

### S0 · B5 restore-down · 63.2–64.8 (owner cli)
- 63.2: theme's maximised ocean-dark page (f.other) shown untouched; I take the dot
  (960,540,r7) at rest.
- 63.2–63.55: the dot flicks to the restore button. A pixel title bar slides down over the page
  top (63.3–63.45).
- 63.45–63.6: f.other cross-fades to my identical drawImage of the same plate.
- 63.6 click (squash + ring at the button). 63.6–64.0: restore-down in log-size space,
  accelerating into the 64.0 landing, with three trailing 1 px zoom rects. A 3 % spring settle
  follows. Cream desktop, blueprint and taskbar are revealed, and the taskbar lands on 64.0.
- 64.0–64.3: desktop icons pop on 16ths. 64.0–64.55: the dot sweeps across the desktop to the
  TERMINAL icon.
- 64.6/64.8: double-click. Zoom rects open the terminal as a compact bar (64.8–64.9).
- 64.85–65.0: the dot dives into the prompt and morphs into the 12×24 block caret.

### S1 · typing · 65.0–67.2 (bars 41–42)
- The camera pushes in to 2.1× on the bar: the command line sits big over the blueprint, which
  is now a rich technical drawing (flap cells, nameplate lettering, W 8500 dimension, callouts).
- `~/my-docs ❯ npx @fumadocs/cli customize`: one keystroke per clack, five 32nd flams, then
  `customize` on 16ths.
- While `customize` is typed, the boxed **CUSTOMIZE** builds letter by letter in screen space at
  the top, its box drawing on.

### Prompt framing (bars 43–44, director note: the prompts are the payload)
On Enter the terminal scales to 1.75× (JetBrains Mono 20 → 35 px on screen) and narrows to 52
columns (prompts wrap like wrap-ansi before the preview). The page preview becomes an inset
window overlapping the terminal's right side (768×432 at 1118,312). Blueprint callouts dim to 25 %.

### S2 · prompt 1 · 67.2–68.8 (き み の)
- 67.2 Enter: the box flashes orange, the bar grows to the full window, the real clack output
  cascades 1 frame per line, and the camera whips out (zoom blur).
- The caret hops down and becomes the orange ● on "Docs Layout".
- Steps on the hits: 67.5 Notebook · 67.8 Flux · 68.0 Glass · 68.3 Spacious · 68.4 Home ·
  68.6 wraps to Docs. Each step: the ● slides (3 frames), the active row and its hint swap, and
  the page window re-renders as that real layout plate (orange scanline wipe, 4 frames) with an
  updated title.
- A slow 3 % drift keeps the hold alive.

### S3 · prompt 2 · 68.8–70.4 (も の に)
- 68.8 Enter: `◇ … │ Docs Layout`; the ● hops to "All".
- Steps: 69.1 Replace & rewrite (page goes minimal) · 69.4 Page: breadcrumb · 69.6 container ·
  69.9 footer · 70.0 toc · 70.1/70.2/70.3 Layout: container/header/sidebar · 70.35 wraps to All.
- The preview has its own camera: it frames the slot under the cursor (breadcrumb and toc crop
  in, footer frames the page's bottom) with a 3 px orange box and a 22 px `SLOT · name` tag
  plus its file (`layouts/docs/page/slots/toc.tsx` …). Footer = dashed "below the fold";
  header = dashed "mobile nav"; All = every part + `ALL · install the entire layout`;
  Replace = the page drops to bare structure + `MINIMAL STYLES`.
- Long hints wrap at 75 columns exactly like clack.

### S4 · eject → engine · 70.4–72.4
- 70.4 Enter/clunk:
  - spinner `Installing layouts/docs`, the ● drops into the moon-phase spinner
  - the page window minimises (zoom rects); the terminal shrinks to a mini window bottom-left;
    icons step off; CUSTOMIZE does a CRT-off squash
  - the blueprint inflates: a dolly zoom from FOV 2.5° (front elevation) to 30° (3/4 top view),
    blue line art fading into the INK-edged toon machine
- Each spinner message is a real file path, and the floppy pops out of that line (starts are
  re-projected under the moving camera).
  - 4 hero floppies land on the clunks: 71.0 index.tsx · 71.2 page/index.tsx ·
    71.6 slots/sidebar.tsx · 72.0 page/slots/toc.tsx
  - 4 more ratchet in on 16ths (header, container, breadcrumb, footer)
  - On each landing: slot LED orange, core glow, a 1.2 % camera bump
- Callouts 01–05 draw on, plus FILES n/14 · SLOTS n/8 and a % tag.
- 72.4: `◇ layouts/docs installed`, then the real run's New Dependencies box,
  `◇ Do you want to install with pnpm? │ Yes`, `◇ Dependencies installed` and "What is Next?"
  print; the mini terminal minimises.

### S5 · imports rewritten → print · 72.4–73.6
- 72.4–72.6: whip to the front close-up. The floppy row sits under the credit band.
- 72.6–73.2: the split flaps rewrite `fumadocs-ui/layouts/docs` → `@/layouts/docs` and `…/page` →
  `@/layouts/docs/page`, cascading left→right through random letters.
- 73.2 servo/paper: the print-head carriage sweeps and the core flashes. The page slides out of
  the print slot, lifts and turns to the camera, landing at 73.6 exactly on the montage window
  rect. The chrome grows on.
- Objecthood (film rule): the page is a real paper slab, not a card — 0.016 thick with lit cream
  edges and back, INK line-art silhouette, CPU-bent each frame (free end droops leaving the
  slot, bows middle-first with a slight twist in flight, flat for the landing), the printed
  face shaded by the key light with a sheen that sweeps across as it turns (neutral at 73.6 so
  the hand-over to the 2D window is exact), and a soft shadow cast along the key light onto the
  front plate that fades as it flies away.

### S6 · montage · 73.6–75.2 (き み の) — one region at a time, before → after
The montage window (1308×736 at 306,62) ends at y 798, so the chant band stays on cream.
Each change: a hard cut 0.1 s before the hit to the affected region of the real plate (BEFORE
chip), a 4.5 % punch-in settle (no blur, it's a rest), then on the hit the orange print head
wipes the region to the next cumulative plate (AFTER chip). Docked caption ≥ 20 px:
`NN LABEL` (30 px) / source / what changed.
- 73.6 00 EJECTED `@/layouts/docs` — 14 files · same look, now your code (full page)
- 73.9 01 SIDEBAR `layouts/docs/slots/sidebar.tsx` — tinted card · pill items · filled active
- 74.2 02 TOC → CLERK `layouts/docs/page/slots/toc.tsx` — style: 'clerk'
- 74.4 03 BANNER `npx @fumadocs/cli add banner` — <Banner /> above the layout
- 74.7 04 FONT `app/global.css` — serif · Source Serif 4
- 74.8–75.1 05 COLOURS `app/global.css` — @import 'fumadocs-ui/css/<preset>.css', flickering
  purple → emerald → ruby → catppuccin on 16ths (the caption flips with the head).

### S7 · bar 48 (も の に, snare roll)
- 75.2: the page minimises and the terminal restores.
- `npx @fumadocs/cli add` → `◇ registry fetched` → `◆ Select components to install`; the
  search `ui -` is typed (14 matches), then the real ui list.
- ◼ ticks on 16ths: accordion 75.4, callout 75.5, files 75.6. Enter 75.7 →
  `◇ … installed` ×3 → `└ Successful`.
- 75.78: `npx @fumadocs/cli feature search --provider mixedbread` → `◇ Search applied` →
  `└ Done`.
- 75.97: new prompt `~/my-docs ❯ █`.
- Taskbar BUILD % races to 100. A gentle push (1→1.22) runs from 75.35.

### S8 · slam · 76.0–76.4, hold → 77.6
- 76.0 kick: an outQuart push on the tape stop into the caret, with zoom blur on the first
  frames. It reaches exactly 4× (48×96 at 936,492) with zero velocity at 76.4.
- 76.4: the terminal clears to INK + caret, held unchanged to 77.6 (B6). Integrations owns the
  anticipation and the launch.

## Machine pass
Warm key + cool fill + back rim light, 4-step cel on the cream body, panel seams and bolts on
the front plate, status lamps that light as slots fill, and a 2D contact shadow on the floor
(an ellipse on the projected floor axes, drawn under the 3D layer).

## Alternatives considered
- Shrinking f.other as a 3D card instead of an OS restore: rejected, since restore is the gesture
  the maximised page implies.
- A full-height terminal while typing: rejected (a black void). The compact bar that grows on
  Enter keeps the blueprint in frame.
- A machine in its own window vs the wallpaper becoming the machine: the wallpaper wins. It
  foreshadows the machine in bars 41–44 and turns the dolly zoom into a 2D→3D reveal.
- Feature speed-run ×4 in bar 48 vs `add` ticks: ticks ride the snare roll (requested). One
  `feature` command still follows.

## Final polish (rough cut v1 → final)
Reviewed in context (`--only theme,cli,integrations`): every-2-frame sheets over the whole
section, every frame across B5/B6 and fast moves, full-res stills on every downbeat, and the
delivered v1 at 1/4 size. Ranked by visibility, all fixed unless noted:
1. **Pixel chrome blurred at non-integer scales** (terminal at 1.75×, push-in at 2.1×). The
   terminal chrome is now drawn in desktop space at an integer pixel scale (2× in the prompt
   framing, continuous only while moving). The typing push-in rests at exactly 2× with
   whole-pixel translation, and the prompt framing content lands on whole pixels. The prompt
   hold drift was dropped (it kept text sub-pixel).
2. **Montage BEFORE/AFTER chips and captions too small for phones.** Chips are now 48 px
   (3× the pixel grid), and flip ON the print-head hit with a 2-frame pop. Captions: 48 px label
   plus 26/24 px mono source and change on a panel docked away from the region that changes.
   Labels leave the moment the window minimises.
3. **Split-flap scramble looked like random garble.** It is now a real module: each flap turns
   forward through its drum (` @-./a…z`) one card per frame, mid-flip cards show next-top over
   current-bottom with the falling sliver, and modules stop staggered. Settles by 73.12, inside
   the flutter foley.
4. **Floppy labels unreadable in the wide shot.** File names now auto-fit the label (up to
   112 px in the texture) on a larger label. The bay push-in between the inflate and the whip is
   one smooth curve (no linear kinks).
5. **Desktop visible until the hard cut at 76.4.** During the tape stop the desktop now goes
   dark around the terminal, so the stop only clears the text and leaves the B6 caret. B6
   numbers are unchanged.
6. **Sync.**
   - The select ● now lands ON each foley cursor tick, with a 3-frame smear, instead of easing
     in after it.
   - Click squashes peak on the click.
   - `add` ticks and moves are all on snare-roll 16ths (75.4 / 75.5 / 75.6), with Enter on 75.7
     and the feature command on 75.8.
   - Every typing clack, Enter, clunk, flutter and print was re-checked against timing.json:
     all frame-exact.
7. **Terminal row-ordering bug in bar 48.** A row could print before the rows above it, which
   put the caret one row low for a few frames. Rows now print strictly in order, and the
   cascades finish before the next command.
8. **The ● hop sat on the collapsed answer text for a frame** at 68.8 and 70.4. It is now
   already moving on the Enter frame, and the drop into the spinner starts from the real
   on-screen ● position (the old start ignored scroll).
9. **Zoom-rect trail lingered 0.2 s after the 64.0 landing.** Shorter (35 ms steps) and
   fading; gone by 64.1.
10. **Callout labels could leave the frame or sit off-screen** while the camera pushes. Boxes
    are now clamped inside the frame, and anchors that leave the frame drop their callout.
11. **Typography rule (mono for code-ish strings).**
    - Icon labels (`README.mdx`, `cli.json`, `my-docs`) are now Geist Mono.
    - The montage window title no longer shows a path in the pixel font.
    - Every path, command and CSS string in tags, captions and labels is JetBrains/Geist Mono.
    - OS chrome titles ("zsh — my-docs") stay in the pixel OS face as window chrome.
12. **Montage window was not exactly 16:9** (0.03 % stretch). It is now 1312×738 at (304, 62);
    the printed page lands on it exactly.
13. **Earlier this round:** the printed page became a paper object (thickness, lit edges, bend,
    sheen, cast shadow). Machine pass: rim light, seams, bolts, lamps, contact shadow.

Left as is:
- Window chrome titles stay in the pixel face (they're chrome, not code).
- The "Replace & rewrite from minimal styles" preview still uses a grey-filtered plate (no real
  capture of `docs-min`).
- Mono sub-lines are secondary and not phone-legible by design; the label and chip carry the
  beat.
