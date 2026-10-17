# Lyrics & staff-credits overlay

The global overlay (`mv/src/overlay/`) is drawn by the engine on top of every scene frame. It
ties the nine sections together: one karaoke lyric system (one mora per lead note) with
section-specific styles, and an anime-OP staff-credit system ("features as staff").

## 1. How it is drawn

- **Three canvas layers per frame** (only when a lyric or credit is visible):
  - `mono` — all text, rules and outlines, drawn in white. Composited twice: tinted **INK**
    where the blurred scene is light, **PAPER** where it is dark (a luminance mask of the scene
    blurred by 18 px). Text therefore inverts cleanly across panel edges and per-beat theme flips.
    `f.overlay.tone` biases the threshold toward the scene's stated background
    (light → ink unless the local background is darker than ~0.27; dark → paper unless brighter
    than ~0.73; no hint → 0.5).
  - `col` — fixed-colour accents under the text: the orange dot, accent offset shadows and glow
    (chorus/final), chant blocks, credit nodes/carets, theme swatches.
  - `plate` — backing shapes composited as **frosted glass** (scene blurred 14 px) tinted by the
    luminance under them (INK → PAPER, continuous, so a plate never flips colour in one frame).
    Pre-chorus cells always have a plate interior; every other style gets a plate only where a
    probe measures clutter (UI text, wireframes, stripes) under it.
- A 96×54 probe of the scene (mean luminance + in-cell deviation) drives the plate amount and a
  soft opposite-colour halo for mid-grey backgrounds. Plates respond gently for big type (a
  pulsing plate is worse than clutter — scenes force one with `hints(f).plate`), firmer for small
  text (verse, vertical, subtitle, outro, English) and for credits (static blocks). Plates are composited into the base image first and the ink/paper mask is
  measured on that base, so text on a plate always takes one consistent colour. All decisions are
  per-frame and deterministic (no state across frames).
- The engine applies lens effects (chromatic aberration, shake) to the scene *before* the
  overlay; grain, vignette and flash still apply over everything — overlay text stays crisp.
- Fonts: lyrics `jpSerif` (Noto Serif JP, verse/vertical/outro), `jpKaku` (Zen Kaku Gothic New,
  pre/chorus/final/subtitle), `pixel` (DotGothic16, chant, sizes on its 16 px grid); README in
  Archivo; English lines Archivo semi-expanded uppercase, tracked 0.14–0.22 em; credits role
  `jpKaku` 700 + Michroma, names Geist (Geist Mono for the CLI credit).
- Japanese typesetting (`overlay/jp.ts`): proportional kana tightening from ink bounds (palt-like,
  kanji stay full-width), half-width 、。, phrase spaces 0.42–0.75 em, mono/group ruby with 1:2:1
  distribution (overhang onto kana up to half a ruby character), 縦組み with rotated ー/Latin,
  small kana and punctuation moved to the upper right, ruby on the right.

## 2. Timing

- Source: `f.e.audio.timing.events.lead` (`/music/timing.json`). Notes are grouped by `line`
  (L11's two takes split by the 3.6 s gap / bar windows) and aligned to each line's morae
  (1:1 when counts match, otherwise a DP alignment tolerant to melisma, missing っ, を/o).
- Until the real file existed the overlay injected a provisional melody (`overlay/data.ts`,
  same interface); it is only used if timing.json is missing or lacks a line.
- A take is visible from the **8th at/before 0.35 s ahead of its first onset — never before its
  first bar** (no lyric leaks into the bar-8 stop, a title impact, the B4 break or a hand-off) —
  until the **beat nearest 1.1 s after its last note**, clipped by the next take's start and the end
  of its bar window. Hard caps (contracts): L8 is gone at 50.4 (B4: black + dot only), L11's repeat
  is gone at 76.4 (cli stop). Windows: L1 12.8–18.0 · L2 19.2–24.4 · L3 25.6–30.8 · L4 32.0–37.2 ·
  L5 38.4–41.2 · L6 41.6–44.4 · L7 44.8–49.6 · L8 49.6–50.4 · L9 51.2–57.6 · L10 57.6–64.0 ·
  L11 67.2–70.4 / 73.6–76.4 · L12 89.6–96.0 · L13 96.0–102.4 · L14 102.4–105.6.
- Glyph reveal = onset of the first mora that covers it (multi-mora kanji appear on their first
  mora; their ruby kana light one per mora).

## 3. Lyrics as typeset

| line | bars | typeset (ruby) | morae | English | default style |
|---|---|---|---|---|---|
| L1 | 9–12 | 真(ま)っ白(しろ)な ページを 開(ひら)いて | 13 | open a pure-white page | verse |
| L2 | 13–16 | 言(こと)葉(ば)の 森(もり)を 歩(ある)いてく | 12 | and walk through a forest of words | verse |
| L3 | 17–20 | 見(み)出(だ)しを たどれば 迷(まよ)わない | 13 | follow the headings and you won't get lost | vertical |
| L4 | 21–24 | 目(もく)次(じ)が 照(て)らす 道(みち)しるべ | 12 | the table of contents lights the signposts | vertical |
| L5 | 25–26 | 並(なら)べて | 4 | line them up | pre |
| L6 | 27–28 | 組(く)み替(か)えて | 5 | rearrange them | pre |
| L7 | 29–31 | 形(かたち)を 変(か)えてゆく | 9 | the shape keeps changing | pre |
| L8 | 32 b1–2 | さあ | 2 | now— | pre (layout draws it, 'scene') |
| L9 | 33–36 | 色(いろ)を 選(えら)んで 世(せ)界(かい)を 塗(ぬ)り替(か)えて | 16 | choose your colours, repaint the world | chorus |
| L10 | 37–40 | 読(よ)んでよ README(リードミー) 君(きみ)だけの ドキュメント | 19 | read me — README — docs that are yours alone | subtitle |
| L11 | 43–44, 47–48 | きみの ものに (kana in the chant; text field: 君(きみ)の ものに) | 6 | make it yours | chant |
| L12 | 57–60 | 世(せ)界(かい)の どこかで ページが 開(ひら)く | 15 | somewhere in the world, a page opens | final |
| L13 | 61–64 | = L10 | 19 | = L10 | final |
| L14 | 65–66 | さあ、書(か)こう | 5 | now, let's write | outro (outro sets vertical) |

README is a Latin ruby base covering リ ー ド ミ ー (5 morae) — the hook names the film.

## 4. Styles (`f.overlay.lyricStyle`)

Anchor (`f.overlay.lyricAnchor`) meaning per style in brackets.

- **verse** [left end of the baseline; default 128, 968] — Noto Serif JP 46/600, tsume 0.6.
  Morae *appear as sung* (rise 10 px + 3 px blur → sharp, 0.16 s): writing on the page. A 1 px
  rule under the line (faint track drawn on over 0.45 s) with the read-so-far part solid and the
  **orange dot** at its head sliding to each mora on its onset (the TOC indicator). English
  wipes in under it. Exit 0.34 s: glyphs lift and fade left → right, rule retracts.
- **vertical** [top of the column axis; default 1772, 150] — 縦組み Noto Serif JP 44. Phrases
  indented like TOC depths (L3 0/1/2, L4 0/1/0), rail on the left with the real Fumadocs TOC
  join (`C ux top−4, x ub+4, x top`), the dot rides it mora by mora; ruby right; English rotated
  along the rail. Monochrome in the TOC section; L14 has no dot, a neutral end tick instead.
- **pre** [centre of the cell row; default 960, 896] — Zen Kaku Gothic New Black in 116 px
  line-art cells with a frosted ink interior, slamming in per onset (perimeter draw-on 0.13 s,
  pop 1.35 → 1 with overshoot, orange flash, orange registration ticks on the current mora).
  L5 tiles land at scattered heights/angles and snap into one row an 8th after the last onset;
  L6 cells arrive pairwise in each other's slot and swap on the partner's onset (み組 → 組み,
  え替 → 替え); L7 cells morph shape/radius on 8ths, 16ths from bar 31.
  English as a boxed tracked Michroma word. `drawPreCell` / `drawBoxWord` are exported.
- **chorus** [centre of the baseline; default 960, 985] — Zen Kaku Gothic New Black 76 px; the
  line is previewed as thin ghost outlines, each glyph fills and pops (1.32 → 1, small rotation
  jitter) on its mora with an accent offset shadow (`hints(f).accent` — the theme colour); the
  block pumps 1 % on every kick.
- **subtitle** [centre of the baseline; default 960, 1004] — one compact row, Japanese 40 px with
  inline English after a hairline; unsung 42 % → sung 100 %; accent underline wipes per mora.
- **chant** [centre of the block row; default 960, 892] — DotGothic16 kana (96 px, on its pixel
  grid) stamped one per note in orange inverse-video blocks, limited animation on twos (1-frame
  white flash, 1.18 → 1.06 → 1); the repeat is bigger with an offset echo outline. Boxed
  MAKE IT YOURS. Exit: blocks collapse to bars, stepped.
- **final** [centre of the baseline; default 960, 952] — chorus look at 98 px plus an accent glow
  that breathes with the real singing level (`audio.env('lead')`, ±3-frame smoothed: alpha
  0.5–0.88, blur 0.62–1.12× plus a kick on each pop — it dims in the bar-64 pause);
  long lines page at the largest rest (L12: 世界の どこかで | ページが 開く; L13: 読んでよ README |
  君だけの ドキュメント); the old page leaves 0.4 s before the new page's first onset, the new
  page's ghost appears 0.2 s before it.
- **outro** [centre of the baseline; default 960, 962] — soft serif 54 px, focus-in per mora.
- **plain** — fallback subtitle; **english** — translation line only (for scenes that render the
  Japanese themselves).

## 5. Hints

Set in `render(f)` every frame. Inside a hand-off window only the **owner's** `f.overlay` is read.
`lyricStyle` / `lyricAnchor` / `lyricScale` are honoured only from scenes whose section overlaps
the line's bars (a neighbour owning a hand-off window can't restyle your line mid-phrase).

| key | values | meaning |
|---|---|---|
| `f.overlay.lyrics` | 'auto' · 'hidden' · 'scene' | overlay draws / nothing / scene draws it with the helpers |
| `f.overlay.lyricStyle` | see §4 | style override |
| `f.overlay.lyricAnchor` | [x, y] | anchor override (style-specific, §4) |
| `f.overlay.tone` | 'dark' · 'light' | the BACKGROUND under the text (biases the ink/paper switch) |
| `f.overlay.credits` | 'auto' · 'hidden' | |
| `hints(f).creditCorner` | 'tl' · 'tr' · 'bl' · 'br' | corner for the running credit |
| `hints(f).accent` | '#hex' | accent colour (dot, offset shadows, underline, credit node); INK/PAPER = monochrome |
| `hints(f).ink` | '#hex' | fixed text colour (disables the adaptive ink/paper switch) |
| `hints(f).plate` | 0..1 | force a frosted backing behind the lyric |
| `hints(f).lyricAlpha` | 0..1 | lyric opacity (ramp it for soft hand-offs) |
| `hints(f).lyricScale` | number | size multiplier |

## 6. API for scenes (`mv/src/overlay/lyrics.ts`)

```ts
import { lyricState, lyricLine, lyricLines, sungText, moraLit, hints, drawLyric, drawPreCell, drawBoxWord } from '../../overlay/lyrics';
lyricState(t)        // visible take or null: { id, take, text, kana, english, segs[], morae[{kana, romaji, t, end, midi, seg, part}],
                     //   chars[{ch, seg, t, end, morae}], t0, t1, index, moraProgress, progress, phase, next, prev, source }
lyricLine('L10', 0)  // one take with all timing up front; lyricLines() → all takes
sungText(line, t)    // characters revealed so far (typing machines / flap displays)
moraLit(line, k, t)  // 0..1 quick wipe of mora k
drawLyric(c, t, { style, x, y, scale, alpha, tone, ink, accent, line })   // the overlay look on your canvas
drawPreCell(c, ch, cx, cy, size, { alpha, draw, pop, flash, ink, accent, sw, sh, round, ruby, rubyLit, ticks, bg, fill })
drawBoxWord(c, word, cx, cy, { size, color, alpha, p })
```

## 7. Placement table (agreed with the scene agents)

| section | time | lyric | zone | credit | corner |
|---|---|---|---|---|---|
| intro (title card) | 12.8–14.4 | L1 verse | x 112–1000, y 900–1015 | — (title card has its own) | — |
| read | 14.4–25.6 | L1, L2 verse | x 112–1000, y 900–1015 | 原作 ORIGINAL WORK — Fuma Nama, 16.0–19.2 · 本文 CONTENT — MDX · Markdown · Shiki · Twoslash, 20.8–24.0 | tr (x ≥ 1500, y 84–200) · br (x ≥ 1380, y 880–1000) |
| toc | 25.6–38.4 | L3, L4 vertical, monochrome | x 1640–1830, y 110–900 | 目次 TABLE OF CONTENTS — normal · clerk · block · minimap · popover, 32.0–35.2 | tl (x 128–600, y 84–230) |
| layout | 38.4–51.2 | L5–L7 pre; L8 drawn by layout ('scene' 49.6–50.4) | y 820–1010, x 560–1360 (L7 x 260–1660) | 美術設定 LAYOUTS — Docs · Notebook · Flux · Glass · Spacious · Home, 41.6–44.8 | tr (x ≥ 1420, y 84–220) |
| theme | 51.2–64.0 | L9 chorus; L10 subtitle under theme's giant README | L9 y 880–1035; L10 y 958–1035 | 色彩設計 COLOUR DESIGN — 12 themes with light/dark swatches, 54.4–57.6 | tr (x ≥ 1340, y 84–260) |
| cli | 64.0–76.8 | L11 chant ×2 | y 820–1010, x 480–1440; gone by 76.4 | 編集 CUSTOMIZE — @fumadocs/cli · customize · add · tree, 70.4–73.6 | tr (x ≥ 1400, y 84–210) |
| integrations | 76.8–89.6 | none ('hidden'; chops drawn by the scene) | — | 協力 INTEGRATIONS — OpenAPI · Obsidian · Sanity · Story · Notion · Python · TypeScript, 83.2–86.4 | br (x ≥ 1360, y 860–1000) |
| showcase | 89.6–102.4 | L12, L13 final | y 800–1010, x 140–1780 | 出演 SHOWCASE — names land with each card (scene contract `LANDING`), page 2 `MOSAIC_NAMES` from bar 61, 92.8–99.2 | tr (x ≥ 1500, y 84–240) |
| outro | 102.4–end | L14 vertical beside the moon (outro sets style + anchor from 102.25) | outro-defined | 制作 PRODUCTION is part of the outro's end card (mirrors the title card) | — |

## 8. Staff credits

Block = role JP (`jpKaku` 700 18 px, tracked 0.28 em) + role EN (Michroma 9.5 px, tracked
0.34 em, 72 %) over a 1 px hairline (42 %) with a 5 px accent node at the anchor end and a tiny
mono index (01–08) at the far end (制作 PRODUCTION is drawn by the outro's end card); names below (Geist 500: 30 px single, 21 px row, 16.5 px
columns, 18 px showcase; Geist Mono for the CLI). Right corners are right-aligned to x 1792,
left corners to x 128; top blocks start at y 84, bottom blocks end at y 1000.
Motion: hairline draws out of the node (0.42 s outExpo), role characters rise in 40 ms apart,
role EN wipes in, each name is mask-wiped left → right behind a 2 px accent caret (0.36 s,
staggered; the caret is gone 0.18 s after each name starts); exit starts 0.32 s before the next downbeat (names wipe out, hairline retracts into
the node) and ends exactly on it. Showcase names land one per card; the second page replaces the
first at bar 61.

## 9. Verify

```bash
cd mv
node render/sheet.mjs --from 12.8 --to 25.6 --step 0.2 --cols 8 --cell 320 --out <scratch>/lyrics-a1.jpg
node render/still.mjs --t 16.9,33.2 --out <scratch>/stills
```
Add `&ovtest=1` to the page URL (overlay review harness, `overlay/testbg.ts`) to see every
style over stand-in backgrounds with the agreed hints, independent of scene progress.

## 10. Final polish

Defect list from the v1 review (rough cut v1, phone size = 1/4) and the current renders with
every scene loaded, ranked by visibility. ✓ = fixed in code, ◐ = fixed together with a scene,
○ = open / waiting for picture lock.

1. ✓ **L13 English line and README ruby over the mosaic wall (96.8–100.4)** broke up on bright
   tiles. Overlay: the final style now takes the firm automatic backing (up to ~78 %, tinted by
   the luminance under it), and the unsung outline preview fades back on cluttered ground.
   Showcase: band y ≥ 770 darkened ~35 % with a ~3 px blur, 96.8→101.4, brightest tiles tamed,
   wall tags kept out of the band and the credit corner. Verified every 0.2 s and at full size.
1b. ✓ **出演 credit over bright tiles (97.5–99.0)**: its automatic backing went light grey (it
   followed the bright tiles) and washed out the paper names. Plate colours are now biased by
   the scene's tone: dark scenes keep dark plates, light scenes light ones.
2. ✓ **Small text read poorly on a phone.** Verse 46 → 50 px (ruby 20), vertical 44 → 48 px,
   L10 subtitle 40 → 44 px (baseline 1010), English lines +1–2 px (verse 16.5, vertical 14,
   chorus 16.5, final 19, outro 15, subtitle 15.5).
3. ✓ **Theme accent equal to its own flat field** made the L10 karaoke underline (and chorus
   offset shadows) vanish; a scene accent within 0.16 luma of the background under the line now
   falls back to the adaptive text colour.
4. ✓ **First sung glyph invisible on the line's first frame** (L9 on the 51.2 drop, L10 at 57.6:
   the entrance fade started on the same frame). Sung glyphs now bypass entrance fades.
5. ✓ **Hit timing.** Chorus/final/subtitle fills now reach ~50 % on the onset frame and full one
   frame later (was 0 → full over 0.065 s after the onset); chant stamps land on the onset frame
   (the 24 fps hold was rounding some onsets one frame late); pre-chorus pops start a frame early.
6. ✓ **L10 subtitle in the B5 hand-off (63.2–64.0)** crossed the docs page's body text; small
   text now gets a firmer automatic backing (busy 0.014–0.05 → full).
7. ✓ **Mono rule for code-ish credit names**: @fumadocs/cli + commands (編集), TOC style names
   (目次) and theme preset names (色彩設計) are set in Geist Mono.
8. ✓ **Row credits wrapped with an orphan** ("popover" alone on line 2): rows now stay on one
   line, or split into two balanced lines past 540 px.
9. ✓ **本文 credit over article text (21.6–24.0)**: firmer automatic credit plate.
10. ✓ **L5 scatter** too wide on the 25.1 frame (cells crossed the scene's wireframe labels):
    lift reduced to ±40 px. The boxed English word under the cells now sits on the same backing.
11. ✓ **Engine lens order** (director): CA/shake now precede the overlay — corner credits crisp.
12. ✓ **出演 credit with 9 names**: 2 × 5 grid, block bottom ≈ y 230 (inside the agreed 260);
    page turn at bar 61 reads cleanly; dark backing over the bright wall.
13. ✓ **L14 beside the end card** (outro's anchor): clear of the 」 bracket, the caret stack and
    the INTRODUCTION · QUICK START arc in the re-laid-out end card.
14. ✓ **Picture-lock re-check** (all scenes loaded, one frame per beat for every line, every credit
    at mid-hold, full size and phone size): no remaining clash. Minor, accepted: on the 51.6
    repaint the diagonal stripes split 色を into ink/paper for 2–3 frames; at 22.0 the READ
    sidebar's "Search" row touches the end of the L2 English line for ~2 frames before READ's
    plate ramp lands; the cli 'document engine' dimension line passes just above the L11 repeat.
