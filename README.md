<p align="center">
  <img src="docs/readme/banner.jpg" alt="Yesterkeep: the same room in yesterday (left, torch-lit and intact) and today (right, ruined, with frozen red guard ghosts)" width="100%">
</p>

<h1 align="center">Yesterkeep <sub>어제의 성채</sub></h1>

<p align="center">
  A stealth dagger game about one key.<br>
  <b>GitHub Game Off 2026</b> · theme <b>SHIFT</b> · plays in the browser · three.js
</p>

---

Press **Shift** and the whole keep shifts between its golden past (**yesterday**) and its ruined present (**today**).
Guards only exist yesterday; today they stand frozen as red ghosts. The era you leave freezes in place,
so you can hold a gate open, stop arrows mid-air, or slip behind a guard and strike from the other side of time.

## One key, two keeps

| Today | Yesterday |
|---|---|
| ![Today: the guard is a frozen red ghost, and you walk around behind it](docs/readme/ghost_today.jpg) | ![Yesterday: shift back and stab the guard in the back](docs/readme/backstab_yesterday.jpg) |
| The guard is frozen. Walk around behind it. | Shift back. It never saw you coming. |
| ![Today: yesterday's arrows hang frozen in the air](docs/readme/arrows_today.jpg) | ![Yesterday: the arrows fly](docs/readme/arrows_yesterday.jpg) |
| Yesterday's arrows hang in midair while you are in today. | Step back into yesterday and they fly again. |

![A stone golem winds up a slam after a front stab bounces off its shield](docs/readme/golem_slam.jpg)

Stone golems exist only today. Stab one from the front and it bounces off the shield, then the hammer comes down.
Shift to yesterday, where the golem freezes, get behind it, and shift back.

**Score** = seconds spent in yesterday. Fewer seconds, fewer alarms, more stars.

Built with plain JavaScript and [three.js](https://threejs.org/). No build step, no framework.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| J / Click | Stab |
| Space | Roll |
| Shift | Shift era (yesterday ↔ today) |
| E | Interact |
| R | Restart room |

## Running locally

The game uses ES modules, so it must be served over HTTP (opening `index.html` directly will not work).

```bash
python -m http.server 8133
```

Then open <http://localhost:8133>.

**The 3D art is not in this repository** (see below). Without it the game will not load its models.

## Third-party assets not included

The art and animation come from paid packs on [Fab](https://www.fab.com/) under the Fab Standard License,
which does not allow redistributing the source files. They are excluded with `.gitignore`.
To run the game from source, buy the packs yourself, convert them to GLB, and place them under `assets/fab/`:

| Pack | Used for | Path in `assets/fab/` |
|---|---|---|
| FANTASTIC Dungeon Pack | Floors, walls, stairs, traps, levers, gates, props | `Fantastic_Dungeon_Pack/meshes/`, `Fantastic_Dungeon_Pack/textures/` |
| Modular Stylized Character (Polyart) | Player (rogue) and guards | `Polyart/ModularStylizedChars/` |
| Dagger Animation Pack | Dagger model and player/guard animations | `Dagger/Demo/Characters/Mannequins/Meshes/Dagger.glb`, `anims/Dagger.anims.glb`, `anims/SKEL_Mannequin.anims.glb` |
| Armored Stone Golem | Stone golem enemy, hammer and shield | `StoneGolem/`, `anims/SKEL_StoneGolem.anims.glb` |

`tools/golem_pack.py` and `tools/shrink_tex.py` show how the GLB files were trimmed and compressed for the web.
`tools/readme_shots.py` renders the screenshots on this page with headless Chrome, and `tools/readme_compose.py` builds the banner.

## Building and checking the web upload

```bash
py -I tools/build_itch.py
py -I tools/release_check.py build/itch/web
```

`build_itch.py` copies the playable files (no bundler, no build step) to `build/itch/web/` and zips them with `index.html` at the root.
`release_check.py` opens that folder in headless Chrome with an English browser, plays every room to the end with
`src/dev/clear-all.js` (real key input, no teleporting), and reports console errors, missing files, file-name case
mismatches, missing translations, download sizes and unused assets. It needs Python with `websockets` and Chrome.

Before building, `py -I tools/web_pack.py` shrinks the Fab GLB files for the web: WebP textures (`EXT_texture_webp`),
`KHR_mesh_quantization` for normals, UVs, joints and weights, no tangents or unused UV sets, and animation tracks with
redundant keys and rest-pose channels removed. It reads untouched copies kept in `build/fab-originals/` and can be re-run
or undone (`--restore`). `py -I tools/quality_shots.py <dir>` renders the same scenes before and after, and
`--compare <before> <after>` reports PSNR and writes diff images. On 2026-11-12 this took the first download from
12.9 MB to 5.8 MB and the whole game from 15.0 MB to 7.9 MB (zip 10.75 MB to 5.13 MB).

## Repository layout

| Path | Contents |
|---|---|
| `index.html` | Page, HUD, import map |
| `src/` | Game code (`main.js`, `rooms.js`, `hero.js`, `golem.js`, `eramat.js`); `src/dev/` holds dev-only test tools |
| `lang/` | UI translations (Korean is the source text) |
| `vendor/` | three.js (MIT, see `vendor/three-LICENSE.txt`) |
| `tools/` | Asset preparation, screenshot, build and release-check scripts |
| `docs/` | Progress screenshots; `docs/readme/` holds the images on this page |
| `devlog/` | Devlog notes and video scripts |
| `DESIGN.md`, `NOTES.md` | Design document and technical notes (Korean) |

## AI disclosure

The code was written with the AI coding assistant Claude (Claude Code), directed and reviewed by the developer,
who chose the design, played the builds and decided what to keep. Claude also drafted the design notes, the UI text
and its English translation, the procedurally synthesized sound effects, and the test bots that play every room.
The art, 3D models and animations are purchased Fab assets made by human artists (listed above); none of them are AI-generated.

## License

Code © 2026 xmflrtm2. All rights reserved (no open-source license yet).
three.js is MIT-licensed. Fab assets belong to their creators and are not part of this repository.
