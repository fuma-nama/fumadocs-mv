# 「README」 — Fumadocs MV · Director's treatment

A ~111 s Japanese vocaloid-MV-style showcase of **Fumadocs** (an open-source React docs
framework): smooth 2D motion graphics mixed with flat/toon 3D, cut to an original 150 BPM
J-pop × reggaeton × EDM track. This document is the creative contract every agent works from.
Section plans are strong proposals — improve them, but keep the musical anchors, the
recurring motifs and the handoff contracts (docs/handoffs.md).

## 1. References — what we take

**Daoko 「TACTIC」 (Tensura S4 OP2)** — cinematic, mostly *monochrome* (cool greys, ink and
paper) that bursts into *full colour at the climax*; 3D environments (black monoliths, chains,
orbit rings, clock faces with roman numerals, magic circles of text) mixed with 2D; bold
graphic design: diagonal stripes, diamond frames, split-screen bands, mirrored symmetry,
thin orbit lines with tiny square nodes, crosshair/registration marks, four-point sparkles,
dust; small **boxed, widely tracked single English words** ("CONVICTION", "PROMISE"),
mirrored/vertical text, anime-OP **staff credits** (small katakana role label + names);
neon line-art architecture (chartreuse / violet edges on black); glitch block displacement;
fast flash-cut montages; slow pushes and whip transitions.

**P1PE — 「肆足歩行 / 足立レイV6」** — "a precision instrument placed at the centre of the
screen": complex *layered* compositions built from 2D and 3D; sharp lines; a mechanical
contraption (rollers, gears, flap displays, print head) that **types the lyrics** one character
at a time; technical-diagram grid with numbered cells (01–12), part labels ("Print Head",
"Flap Display"), percentage tags ("37.1682%"); a retro OS taskbar ("STATUS: CONNECTED", tabs
showing lyric fragments, clock); pixel-crisp, dithered toon renders; white/black + one accent
(orange).

**Fumadocs brand** — the logo is a *moon*: a circle whose diagonal gradient runs from the
background colour to the primary colour, with a 1 px primary rim. Banner: black, cream
wordmark, an orange *dithered sphere*. Brand orange `hsl(26 73% 51%)` ≈ `#DD7627`, hero
oranges `#FA8023` `#DF3F00` `#FFA057`, dark-mode brand yellow `#FFF383`. Fonts: Geist +
JetBrains Mono. Taglines: "Build excellent documentation, your style." · "The docs framework
designed with care." · "Minimal aesthetics, Maximum customizability."

## 2. Style bible

**Palette (first half: monochrome + one accent)**
| token | hex | use |
|---|---|---|
| INK | `#0A0A0B` | darkest, Fumadocs dark theme colour |
| INK-2 / INK-3 | `#151518` / `#26262C` | dark planes |
| GREY | `#7C7C84` | secondary lines/text |
| PAPER | `#EEECE4` | cream paper (light scenes) |
| PAPER-2 | `#E0DDD3` | paper shade |
| WHITE | `#FAFAF7` | highlights |
| ORANGE | `#FA8023` | THE accent: the moon/dot, cursor, active states |
| EMBER | `#DF3F00` | deep orange, sparingly |
| SUN | `#FFF383` | dark-mode brand yellow, glows |

Sections intro → layout stay monochrome + ORANGE only (orange used sparingly: it is the
"guide"). The chorus (themes) floods the world with the 12 theme palettes. CLI, integrations
and showcase keep colour (each block has a key colour). The outro drains back to monochrome +
orange (bookend).

**Type** — `display` Archivo (condensed heavy for impact words, expanded light for wide
titles) · `wide` Michroma for boxed tracked labels · `mono`/`code` Geist Mono / JetBrains Mono
for HUD, code and numbers · `ui` Geist for UI recreations · Japanese: `jpKaku` Zen Kaku Gothic
New Black for impact lyrics, `jpSerif` Noto Serif JP for elegant lyrics, `jpBlack` Dela Gothic
One for giant one-off kanji (読 / 目次 / 色 / 書), `pixel` DotGothic16 for retro-OS bits.

**Recurring motifs** (use them; they make 9 scenes feel like one film)
1. **The MOON / ORANGE DOT** — Fumadocs' logo and our guide. It is the cursor at the start,
   the TOC indicator dot, the iris into the chorus, the request packet, the core of the
   engine, the moon over the showcase city, and the cursor again at the end. *Follow the dot.*
2. **The TOC LINE** — the real Fumadocs TOC indicator: a 1 px path with smooth Bézier joins
   where heading depth changes (clerk variant: straight diagonals). Use it as a graphic thread
   that snakes through compositions and carries the eye across cuts.
3. **The PAGE TREE** — branching lines + nodes (pages), drawn like circuitry/roots.
4. **Annotation HUD (P1PE)** — numbered cells 01–12, leader lines with part labels, % tags,
   crosshairs, registration marks, tiny mono metadata (`index.mdx`, `h2#layouts`, `200 OK`).
5. **Boxed single words (TACTIC)** — one per section: READ · NAVIGATE · ARRANGE · COLOR ·
   CUSTOMIZE · CONNECT · PUBLISH · WRITE.
6. **Paper & ink 3D** — documents as thin 3D sheets, standing monolith pages, the "Document
   Engine" machine, edge-lit line art.
7. **Dither / halftone / pixel** — the brand's dithered sphere + P1PE's pixel renders: use for
   specific 3D renders and textures, never as a lazy global filter.

**Motion principles**
- Everything lands on the grid: cuts on bar downbeats, accents on beats, micro-motion on
  8ths/16ths. Lyrics appear on note onsets. Use kick/snare pulses for subtle punches (1–2 %).
- Entrances: fast-out eases (`outExpo`, `snap`, `outBack` with small overshoot); exits faster
  than entrances. Holds are never dead: slow drift, parallax, breathing lines, particles.
- Mix smooth 60 fps camera/3D motion with *limited animation* (`hold(t, 12)`) for some 2D
  bits (sparkles, glitch text, flipbook UI) — the anime texture.
- Camera language: slow push-ins, dutch angles on climaxes, whip pans with directional blur,
  rack-focus via blur, orbit reveals. Keep a clear focal point; 2–3 supporting layers; the rest
  is texture. Leave negative space — dense ≠ cluttered.
- Objecthood (user's rule): rotating a flat 2D plane in depth exposes that it is flat — "if it's
  not a 3D object, the difference is too obvious to ignore". So anything that rotates out of the
  screen plane (flips, tilts, page turns, swings, tumbles, world turns with panels) must be a
  convincing 3D object: visible thickness/edge, lighting that responds to the rotation (a light
  sweep across the face, lit/shaded edges), contact or cast shadow, maybe a slight bend. Otherwise
  keep the element 2D: translate, scale, in-plane rotation, wipes, masks. Camera-facing multiplane
  layers with parallax are always fine.
- Exploded views must explode into the *actual parts*: crop each part to its element, keep it
  opaque and crisp, and separate silhouettes on screen. (User feedback.)
- Smoothness is non-negotiable: no pops, no 1-frame layout jumps (unless a deliberate flash
  cut), no aliasing shimmer on thin lines (supersample 3D, align 1 px lines to half pixels),
  no texture swimming. Check fast moves frame-by-frame.

**Real UI** — show *real* Fumadocs UI (plates captured from a real fumadocs-ui app, see
engine.md) wherever we claim a feature. Stylise around it (frames, annotations, 3D, colour)
but never fake the product's look.

**Craft checklist — ask for every shot**: What is the one thing the viewer must notice? Which
Fumadocs feature does it prove, and is it recognisable? What moves on the downbeat, on each
beat, on the 8ths? What carries the eye into and out of the shot (figure, line, direction,
colour)? Is the cut point motivated (motion match, shape match, colour match, sound hit)?
Are there dead frames or uninteresting holds? Is every edge crisp and every motion smooth at
60 fps? Does it fit the section's palette and the film's motifs? Would it look good as a still?

## 3. Global overlays (built by the typography agent; leave room for them)

- **Lyrics**: karaoke-style, one mora per lead note (from `timing.events.lead`), Japanese with
  a small English line. Default placements per section are defined by the overlay; scenes can
  set `f.overlay.lyrics = 'hidden'` (e.g. during a giant typographic moment) or `'scene'` to
  render a line themselves as part of the composition (e.g. the flap-display machine typing
  it, words on a monolith) — when you do, use the overlay's exported helpers so timing and
  spelling stay consistent. Set `f.overlay.tone` ('dark'|'light') to keep text legible.
- **Staff credits** (anime-OP style, features as "staff"): small role label + names, fading in a
  corner for ~2 bars. Keep the corner safe area (roughly the outer 140 px band, bottom-right or
  top-right — the overlay picks per shot) free of critical content when credits run:

| bars | role | names |
|---|---|---|
| 11–12 | 原作 ORIGINAL WORK | Fuma Nama |
| 14–15 | 本文 CONTENT | MDX · Markdown · Shiki · Twoslash |
| 21–22 | 目次 TABLE OF CONTENTS | normal · clerk · block · minimap · popover |
| 27–28 | 美術設定 LAYOUTS | Docs · Notebook · Flux · Glass · Spacious · Home |
| 35–36 | 色彩設計 COLOUR DESIGN | neutral · black · vitepress · dusk · catppuccin · ocean · purple · solar · emerald · ruby · aspen · shadcn |
| 45–46 | 編集 CUSTOMIZE | @fumadocs/cli — customize · add · tree |
| 53–54 | 協力 INTEGRATIONS | OpenAPI · Obsidian · Sanity · Story · Notion · Python · TypeScript |
| 59–62 | 出演 SHOWCASE | (showcase site names) |
| 66–67 | 制作 PRODUCTION | Fumadocs · fumadocs.dev |

## 4. Section plans

Times: `at(bar)` = (bar−1)·1.6 s. Lyrics per the music spec (docs/music-spec.md).

### INTRO — `intro` · bars 1–9 · 0.0–14.4 s · word: README
Music: power-on click at 0; clock ticks, drone and the bell **README motif** (bars 1–4);
muffled kick + closed arp from bar 5; filter opens, snare build in bar 8; **stop** at bar 8
beat 4 (12.4–12.8); **impact** at bar 9 (12.8) → title.
1. Bar 1: black. Click → a single ORANGE block caret at centre, blinking on the beat.
2. Bars 2–4: the caret stretches into a 1 px line that travels and **branches into the page
   tree** (right-angle runs + Bézier joins like the TOC line); nodes with tiny file names
   (`index.mdx`, `quick-start.mdx`, `meta.json`, `layouts/docs.mdx`…). Each motif bell lights a
   node with a ping ring. The tree sits on a tilted plane inside a clock-like ring (12 ticks
   numbered 01–12, a slowly rotating text ring "README · INTRODUCTION · QUICK START · …").
3. Bars 5–6: kick → 3D: dark void, glossy floor, the **moon** (logo sphere: diagonal gradient
   ink→orange with a thin rim) forms from the caret and rises; edge-lit monolith pages stand
   around it in fog; dust; dolly in; light pulses on kicks.
4. Bars 7–8: flash-cut montage on 8ths→16ths: white-on-black silhouettes of UI fragments
   (sidebar items, code lines, the TOC path, a search box), diamond frames, the 8 boxed section
   words — a 1-frame-flash preview of the whole film; glitch slices. Bar 8 beat 4: **stop** —
   black, one 1 px white line across the centre.
5. Bar 9 (impact 12.8): **TITLE CARD** on PAPER: 「README」 (title in the Japanese MV
   style), "FUMADOCS", the moon logo, thin frame with registration marks, small credits.
   Lyric L1 ("open a pure-white page") starts here — the title card *is* that white page.
→ Handoff to READ: the title page opens (see handoffs).

### READ — `read` · bars 10–16 · 14.4–25.6 s · word: READ · lyrics L1 (9–12), L2 (13–16)
"Open a pure-white page / walk through a forest of words." The reading experience.
1. Bar 10: the page opens onto a **real Fumadocs docs page** (default Docs layout, neutral
   light) lying at a slight 3D angle on cream paper.
2. Bars 11–12: **anatomy of a page** (P1PE precision diagram): the UI separates into
   isometric layers (navbar, sidebar/page tree, article, TOC, search) with leader-line
   annotations ("SIDEBAR · ページツリー", "BREADCRUMB", "ARTICLE", "TOC · 目次",
   "SEARCH ⌘K"), numbered cells, % tags; one layer lifts per beat.
3. Bars 13–14: "forest of words": layers re-assemble; dive into the article — headings,
   paragraphs, code blocks (Shiki colours, copy button), callouts, cards, tabs, steps pass by,
   each popping with a tiny label; optionally text lines stand up as a 3D forest.
4. Bar 15: **⌘K search**: 3D key caps ⌘ + K press on the beat → the real search dialog;
   "layouts" typed on 16ths; highlighted results.
5. Bar 16: result chosen → fast scroll → dive into the TOC indicator (handoff to TOC).

### TOC — `toc` · bars 17–24 · 25.6–38.4 s · word: NAVIGATE · lyrics L3, L4
"Follow the headings and you won't get lost / the table of contents lights the signposts."
1. Bars 17–18: the **TOC line, huge**: the real default TOC drawn as a screen-filling vector
   graphic — headings, 1 px rail, primary path with Bézier joins, the orange dot gliding along
   the path (offset-path) to a new heading on each beat, clip reveal growing.
2. Bars 19–20: the headings become **monoliths in a dark 3D city of documents**; the dot is a
   guiding light flying the TOC path (now a 3D curve) and lighting each monolith ("lights the
   signposts"); drone camera.
3. Bars 21–22: **variants** on beats, as panels/split bands with boxed labels: NORMAL (Bézier
   + dot), CLERK (diagonal joins), BLOCK (sliding highlight), MINIMAP (Glass ticks expanding),
   POPOVER (mobile bar with progress circle), ROLL-IN (Spacious) — synchronised to one
   heading sweep.
4. Bars 23–24: **magic circle**: headings on a ring (text arc), the mobile TOC's progress
   circle as a giant gauge filling toward 100 % as L4 completes.
→ Handoff to LAYOUT: the completed ring becomes the first wireframe.

### LAYOUT — `layout` · bars 25–32 · 38.4–51.2 s · word: ARRANGE · lyrics L5–L8
"Line them up / rearrange them / the shape keeps changing / now—"
Layouts as **neon line-art architecture** (TACTIC's edge-lit beams), monochrome with orange
edges: Docs (sidebar + article + TOC) · Notebook (full-width navbar, compact sidebar) · Flux
(centred article + floating bottom panel) · Glass (floating translucent sidebar, pill header,
minimap) · Spacious (card surface with inset rounded page) · Home (navbar + hero).
1. Bars 25–26 "line them up": the six wireframes stand in a row; camera tracks along; labels.
2. Bars 27–28 "rearrange": boxes physically move between configurations (sidebar slides to
   top → Notebook; article centres → Flux; panels float → Glass; page insets → Spacious);
   the real screenshot projects onto each wireframe as it settles.
3. Bars 29–31 "the shape keeps changing": accelerating morphs (beats → 8ths), orbiting camera,
   edges brighten with the riser.
4. Bar 32: beats 1–2 「さあ」; everything collapses into the orange dot; beats 3–4 **black +
   the dot only** (hard-cut contract into the chorus).

### THEME — `theme` · bars 33–40 · 51.2–64.0 s · word: COLOR · lyrics L9, L10 (chorus)
"Choose your colours, repaint the world / read me — README — docs that are yours alone."
1. Bar 33 downbeat: **COLOUR BURST** — the dot explodes into concentric rings of the twelve
   theme primaries; the monochrome world floods with colour (the film's turning point).
2. Bars 33–36: theme carousel on every beat: the real docs page in each theme (12 presets ×
   light/dark), the background flooding to the theme's colours, the theme name huge, swatch
   chips with values (a paint-sample card), diagonal-stripe repaint wipes.
3. Bars 37–40: the hook 「よんでよ リードミー」: giant kinetic README typography, a ring of
   theme cards orbiting in 3D, light/dark flips on snares.
→ Handoff to CLI: the page shrinks into an OS window.

### CLI — `cli` · bars 41–48 · 64.0–76.8 s · word: CUSTOMIZE · lyric L11 (43–44, 47–48)
Half-time reggaeton groove. "Make it yours."
1. Bars 41–42: a retro OS desktop (P1PE taskbar, pixel font, clock, "STATUS: CONNECTED");
   the chorus page is a window; a terminal opens: `npx @fumadocs/cli customize` typed on 16ths.
2. Bars 43–44: the real prompts (◆ What do you want to customize? ● Docs Layout ○ Notebook
   … → Which part? ◻ Layout: sidebar …) — selection moves and boxes tick on the dembow hits;
   chant 「きみの ものに」/ MAKE IT YOURS.
3. Bars 45–46: ejected files (`layouts/docs/index.tsx`, `page.tsx`, `slots/sidebar.tsx`…) fly
   out as cartridges/floppies and slot into a P1PE-style **Document Engine** machine.
4. Bars 47–48: customisation montage on the real UI (restyled sidebar, banner, TOC → clerk,
   fonts/colours), `npx @fumadocs/cli add …` components installing; build; the caret zooms.

### INTEGRATIONS — `integrations` · bars 49–56 · 76.8–89.6 s · word: CONNECT · (drop, no lyrics)
Four 2-bar blocks, each with its own key colour and a distinct downbeat accent; conceptual
motion graphics (names in type; avoid third-party logos):
1. 49–50 **OpenAPI**: the caret is now a request packet; spec YAML → API reference (colour
   method badges GET/POST/PUT/DELETE, `POST /planets`), playground "Send" → `201 Created`.
2. 51–52 **Obsidian**: a faceted purple crystal vault; notes linked by `[[wikilinks]]` drawing
   a graph; `> [!note]` callouts turning into Fumadocs callouts.
3. 53–54 **Sanity**: structured content blocks stream from a studio panel into the docs page,
   live preview.
4. 55–56 **Story**: a component on a stage with a controls panel; toggles/selects flip on beats
   and the component morphs live.
Bar 56 beats 3–4: the four outputs converge into the central core (the moon).

### SHOWCASE — `showcase` · bars 57–64 · 89.6–102.4 s · word: PUBLISH · lyrics L12, L13 (+1 key)
"Somewhere in the world, a page opens / read me — README…"
1. Bars 57–58: the core pulls back into the moon over a night **city of screens** (each
   building/window a real showcase site); fly-through.
2. Bars 59–60: one site lands front-centre per beat (evilcharts, shadcn/ui, Better Auth, Zod,
   Prisma, nuqs, Arktype, HeroUI, Zen Browser…) with boxed name + URL; varied entrances.
3. Bars 61–64: hook again: a mosaic wall of all sites; zoom out → the mosaic forms the moon.
Peak energy, full colour.

### OUTRO — `outro` · bars 65–69 + tail · 102.4–110.8 s · word: WRITE · lyric L14
1. Bars 65–66: the mosaic collapses into the moon logo; colour drains to monochrome + orange;
   big final chord; "Build excellent documentation, your style."
2. Bars 67–68: README motif on music box; a terminal line types `npm create fumadocs-app`.
3. Bar 69 (108.8): final chime — the caret blinks once and vanishes → black (bookend). Hold.

## 5. Character

None — decided: no dancing character. The film's "performer" is the orange moon/dot and the
real UI; give them the personality (timing, anticipation, squash/overshoot, glances of light).
