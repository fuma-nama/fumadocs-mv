# 「README」, the Fumadocs MV

A music video for Fumadocs, rendered by a deterministic web engine: as a video, or live as a web page.

| folder | what |
|---|---|
| `mv/` | the engine and scenes (Vite, three.js), the render scripts and the web app |
| `music/` | the soundtrack: generator (`src/`) and mixes (`out/`) |
| `plates/` | captures of the real Fumadocs UI the film uses |
| `assets/` | fonts, showcase sites, references |
| `docs/` | engine guide, treatment and per-scene notes |
| `out/` | renders (not tracked) |

## Video

```bash
cd mv
pnpm dev                                    # preview on :5180
node render/render.mjs --out ../out/mv.mov  # ProRes master, all frames
node render/master.mjs                      # adds music/out/readme.wav: master, -share and -preview MP4s
```

See `docs/engine.md`.

## Web app

```bash
cd mv
pnpm build:web    # web/dist, a static site
pnpm preview:web  # :5183
```

See `mv/web/README.md`.

## License

The code, docs and soundtrack are [MIT](./LICENSE). This doesn't cover third-party material in the repo:

| what | where | license |
|---|---|---|
| Fonts | `assets/fonts/`, `plates/app/fonts/` | SIL Open Font License 1.1, see the `OFL-*.txt` beside them |
| Captures of showcase sites | `assets/showcase/`, `assets/scenes/showcase/` | © their owners, shown as part of the Fumadocs showcase |
| Galaxy sample OpenAPI spec | `plates/app/openapi/galaxy.yaml` | MIT © Scalar |
