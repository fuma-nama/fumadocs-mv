# Engine guide

The MV is a deterministic web app: `mv/` (Vite + TypeScript + three.js 0.186 + Canvas2D).
Every frame is a pure function of time `t` — never accumulate state across frames
(if you need a simulation, re-simulate from a fixed start time with a fixed dt, and cache).
Output: 1920×1080 @ 60 fps. Music: 150 BPM, 4/4 → beat 0.4 s = 24 frames, bar 1.6 s.

## Resolution independence

Always work in **design units: 1920×1080** (`f.W`, `f.H`). The engine can render the same film
at other sizes (e.g. a 3840×2160 master): 2D layers scale their context automatically, render
targets/blur radii/pixel sizes/edge widths/xform offsets are all in design units. Never read
`canvas.width` to lay things out; if you need real pixels (rare), use `f.e.scale`.

## Where things live

- `mv/src/scenes/<id>/**`: one scene, default-exporting a `SceneImpl`.
- `mv/src/scenes/index.ts`: the scene registry and the boundary windows between scenes.
- `mv/src/engine/**`: the shared engine.
- `assets/scenes/<id>/`: scene-specific assets, served at `/assets/scenes/<id>/…`.
- A scene that throws renders as a red error frame instead of breaking the others. Type-check
  with `cd mv && npx tsc --noEmit`.

## Scene API

```ts
import type { SceneImpl, Frame } from '../../engine/engine';

const scene: SceneImpl = {
  async setup(e) { /* once: load textures/models, build three.js scenes */ },
  async prepare(f) { /* optional, per frame, async: e.g. await seq.prepare(index) */ },
  render(f) { /* draw; return a texture (sRGB, premultiplied, frame-size) */ },
};
export default scene;
```

`Frame` (`f`): `t` global seconds · `lt` seconds since your nominal start (negative while you
pre-roll in a handoff window) · `frame` · `W`,`H` · `e` the Engine · `post` (global finishing
params for this frame, mutable) · `boundary?` (when inside a handoff window: `{ at, from, to,
role: 'in'|'out', isOwner, p }`) · `other?` (the neighbour scene's finished image — only given
to the boundary owner, who must composite it).

Timeline lives in `mv/src/scenes/index.ts` (`registry`, `boundaries`). Musical helpers in
`engine/time.ts`: `at(bar, beat?)` → seconds (1-indexed, fractional beats OK; `at(9)` = 12.8),
`BEAT`, `BAR`, `gridPos(t)`.

### 2D layers — `engine/draw2d.ts`

```ts
const L = f.e.layer('read:fg');      // persistent canvas, prefix keys with your scene id!
const c = L.begin('#eeece4');        // reset + clear (transparent if no colour)
text(c, 'FUMADOCS', x, y, { font: 'display', size: 160, weight: 800, stretch: 'condensed', tracking: -0.02, color: '#0a0a0b' });
const tex = L.end();                  // upload → THREE.Texture
```

Font roles (`FONTS`): `display` Archivo (variable wght 100–900, `stretch` 'extra-condensed'…
'expanded'), `ui` Geist (Fumadocs' own UI font), `mono` Geist Mono, `code` JetBrains Mono,
`wide` Michroma (tracked labels), `jp` Noto Sans JP (100–900), `jpKaku` Zen Kaku Gothic New
(500/700/900), `jpSerif` Noto Serif JP (200–900), `jpBlack` Dela Gothic One, `pixel` DotGothic16.

Helpers: `text`, `measure`, `glyphs` (per-glyph layout for per-character animation), `textV`
(vertical Japanese), `textArc` (text on a circle), `line`, `lineP` (partial draw-on), `rect`,
`rectP` (perimeter draw-on), `brackets`, `boxLabel` (the boxed tracked "CONVICTION" label),
`crosshair`, `sparkle`, `diamond`, `ring`, `dashedRing`, `ticksRing`, `grid`, `stripes`,
`pctTag`, `barcode`, `drawImageFit`. Plain Canvas2D is fine for anything else (paths, clip,
gradients, `globalCompositeOperation`, `filter`). Canvas is 1920×1080 (or `layer(key, w, h)`).

### Compositing & effects — `engine/gfx.ts` (`f.e.gfx`)

All textures are sRGB, **premultiplied**. Keys of pooled render targets must be unique per use
(prefix with your scene id) — the same key reused twice in one frame overwrites itself.

```ts
const g = f.e.gfx;
const img = g.compose(g.rt('read:comp'), '#0a0a0b', [
  { tex: bgTex },
  { tex: tex3d },                                   // from render3D (already sRGB)
  { tex: uiTex, blend: 'multiply', opacity: 0.9, xform: { x: 0, y: -20, scale: 1.05, rot: 0.02 } },
  { tex: fgTex, mask: maskTex, maskLuma: true },
]);
```

Blend modes: normal, add, screen, multiply, difference, overlay, erase. `xform` is in px about
the frame centre (`px`,`py` pivot offset). Effects (each takes a `key`):
`blur(tex, radius)`, `bloom(tex, {threshold, strength, radius, tint})`,
`grade(tex, {sat, contrast, bright, duo, ink, paper, invert, gamma})` (duo = duotone mix),
`glitch(tex, {amount, seed, bands, split})` (quantize `seed` to time steps!),
`pixelate(tex, {pixel, palette, dither})` (P1PE-like dithered retro look),
`halftone(tex, {cell, angle, ink, paper, mix})`, `motionBlur(tex, {amount, center | dir})`,
`transition(a, b, type, p)` (stock wipes — prefer custom transitions), `copy`, `fill`,
`material(key, glsl, uniforms)` + `run(mat, rt)` for your own full-screen shaders (GLSL3:
`in vec2 vUv; out vec4 outColor;`, helpers `toSRGB`, `toLinear`, `luma`, `hash12`).

Global finishing pass (`f.post`, per frame; `ca` + `shake` are a lens pass applied to the scene
before lyrics/credits, the rest applies over everything): `grain` 0.04, `vignette` 0.22, `ca` 0.0008,
`scanlines`, `flash` (0–1 to `flashColor`), `invert`, `mono`, `shake` [px,px], `fadeToBlack`.
Set them in `render()`; they reset every frame.

### 3D — `engine/three-kit.ts`

```ts
const tex3d = render3D(f.e.gfx, scene3, camera, {
  key: 'read:3d', ss: 2,               // supersample for crisp lines
  clear: null,                          // transparent background (or a CSS colour)
  edges: { color: '#0a0a0b', width: 2 }, // screen-space line art (depth+normal); userData.noEdges excludes objects
});
```

`toonMat(color, {steps})` (cel shading with three lights), `flatMat(color)` (unlit exact
colour), `imagePlane(tex, width)`. `userData.noEdges = true` objects get no outlines but still
hide the lines of objects behind them. To put a 2D layer on a 3D mesh use `layer.texture3d`
(sRGB-tagged, straight alpha, mipmapped) — not `layer.texture` (compositor-only). Load textures with
`await f.e.assets.texture(url, { srgb: true })` for 3D materials (srgb:false for 2D/compositor).
three.js examples (`three/examples/jsm/...`) are available (loaders, geometries, Line2…).
Camera aspect = 16/9. No character in this film (director's decision).
Gotcha: three.js `LineMaterial` (Line2 / fat lines) renders at 2× the requested `linewidth` in
our pipeline — halve it (see scenes/layout/gpu.ts for a compensated helper).

### Audio sync — `engine/audio.ts` (`f.e.audio`)

`cue('kick'|'snare'|'clap'|'hatClosed'|'hatOpen'|'crash'|'impact'|…)` → times,
`pulse(name, t, decay)` → exp decay since last hit, `env(name, t)` → per-frame envelope
(master, kick, snare, hats, bass, chords, lead, fx, onset) once the soundtrack exists,
`timing.events.lead` → lyric notes `{t, dur, midi, line, mora, romaji, vowel}`,
`timing.events.chords`, `motif`, `chops`, `foley`. Until the real track lands, a grid
fallback is used — design to the grid (bars/beats), not to specific samples.
Animation helpers in `engine/anim.ts`: `seg`, `win`, `track` (keyframes), `ease.*`
(outExpo, snap, whip, outBack, inOutCubic…), `spring`, `hold` (limited animation, e.g.
`hold(t, 12)`), `pulse`, `hash`, `mulberry32`, `n1`/`n2` noise, `shake`, `lerp`, `clamp`.

### Assets

- Fonts: `assets/fonts` (loaded automatically).
- Reference Fumadocs UI screenshots (stand-ins until real plates land):
  `assets/ref-ui/*.png` (layout previews: docs, notebook*, flux, glass, spacious, home, sidebar…)
  and `assets/ref-ui/themes/*.png` (11 theme previews). Served at `/assets/ref-ui/...`.
- Real UI plates (in production by the plates agent): `/plates/…` with `/plates/manifest.json`
  (full-res captures of every layout/theme/TOC variant, isolated UI layers with alpha,
  element bounding boxes, interaction sequences). Check the manifest; integrate when available.
- Showcase site captures: `assets/showcase/manifest.json` (+ `<slug>/*.png`).
- Music (when ready): `/music/timing.json`, `/music/envelopes.json`, `/music/readme.wav`.

## Rendering to check your work

Run from `mv/` (a shared dev server on :5180 is reused if running; otherwise one is started):

```bash
node render/still.mjs --t 15.2,16.0 --out /path/dir --only read,intro
node render/sheet.mjs --from 14.4 --to 25.6 --step 0.4 --cols 7 --cell 360 --out /path/sheet.jpg --only read
node render/sheet.mjs --from 24.8 --to 26.4 --step 0.0333 --cols 8 --cell 300 --out /path/handoff.jpg --only read,toc
```

`--only` loads just those scenes (others render a stand-in) — always include your neighbour
when checking a handoff. Look at the images (Read tool). Check motion with dense sheets
(every frame or every 2 frames) around fast moves. Put renders in your scratch folder, not in
the project. A stills call costs ~1–3 s, so iterate a lot.
