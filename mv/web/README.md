# README, the web page

The film as a static Vite app: a workspace around the live render, with an explorer, an inspector and a timeline, in sync with the music.

```bash
pnpm dev:web      # http://localhost:5182
pnpm build:web    # writes web/dist
pnpm preview:web  # serves web/dist on http://localhost:5183
```

`web/dist` is plain static files with relative URLs, so it can be served from any host and path.

## Deploy on Vercel

Import the repository, set **Root Directory** to `mv`, and deploy. `mv/vercel.json` sets the Vite framework, `pnpm build:web` and the `web/dist` output, and caches the hashed bundles under `_app/` for a year.

## Files

| file | what |
|---|---|
| `index.html`, `app.css` | the workspace: top bar, explorer, viewport, inspector, timeline |
| `main.ts` | loading, playback timed by the audio clock, the frame loop, keys |
| `ui/viewport.ts` | toolbar, free camera gestures, click and hover picking, selection boxes |
| `ui/explorer.ts` | the film's scenes, and the current scene's live three.js content |
| `ui/inspector.ts` | selection, frame, feature, lyric, render cost |
| `ui/timeline.ts` | transport, playhead, scrubbing; bars, scene, lyric and audio tracks |
| `ui/film.ts`, `ui/app.ts` | chapters, features and their docs pages, lyric faces; the panels' shared state |
| `files.txt` | every public file the film loads |
| `glyphs.json` | the characters the film draws, per font; re-record with `node web/record-glyphs.mjs` when drawn text changes |
| `public/`, `asset-map.json` | the converted files the page loads, and the map from each original path to them (committed, so the build is plain `vite build`) |
| `build-assets.mjs` | `pnpm assets:web` regenerates `public/` and `asset-map.json` from the originals: fonts as WOFF2 subsets, PNG as lossless WebP (photo-like ones at q90), JPG as WebP q90, minified JSON, AAC audio |

The engine loads every file through `assetUrl()` (`src/engine/url.ts`), which applies the map. Regenerating the assets needs `ffmpeg` (macOS, for the AudioToolbox AAC encoder), `cwebp` and `uv` (for fonttools); building and deploying need only Node. Page text stays in what the subsets hold: ASCII and `·` in every face, plus the film's own glyphs (`×` in Geist Mono, each lyric in the face the film sets it in).

## Workspace

| area | what |
|---|---|
| Explorer | the film's 9 scenes with their time range and features; a click jumps there. The current scene lists the three.js scenes the frame drew, named by `render3D`'s key, with their objects grouped by name or type and geometry. Rebuilt only when the set of drawn scenes changes |
| Viewport | director or free camera, x-ray, reset view, and stats: fps while playing, render ms when paused. A click picks the 3D object under the pointer, hovering names it |
| Inspector | selection (type, geometry, triangles, material, world position and size), frame, feature with its docs page, lyric, `renderer.info` |
| Timeline | transport, and scrubbing anywhere on the tracks: bars at 150 BPM, scenes, lyrics, the master envelope with the kicks |

Panels refresh at about 12 Hz while playing, and after each frame while paused; the playhead moves by `transform`. Below 1100 px or in portrait, the viewport sits on top, the timeline keeps one scene track, and Explorer and Inspector become tabs.

The free camera, x-ray and the explorer's view of a frame live in `src/engine/explore.ts`: `render3D` calls it around its passes and everything is undone right after them, so 2D layers, the lyrics and the camera later code reads stay the director's. With the modes off, the film renders exactly as delivered.

## Keys

| key | does |
|---|---|
| `Space`, `K` | play, pause |
| `,` `.` | frame back, forward |
| `[` `]` | beat back, forward |
| `←` `→` | seek 5 s |
| `1`-`9` | scenes |
| `C`, `X`, `0` | free camera, x-ray, reset view |
| drag, wheel, right-drag | free camera: orbit, zoom, pan (also `Shift` + arrows, `+` `-`) |
| `I` | hide or show the panels |
| `F` | full-screen viewport |
| `Esc` | clear the selection |
| `?` | keys |

## URL parameters

| param | effect |
|---|---|
| `?q=720` | render at 720p (default: 1080p, 720p on touch devices) |
| `?mode=render` | no workspace; exposes `window.__mv` for headless renders, like the dev tool |
