# Sovereign Scar

**The Wound That Remembers** — a 14-beat Zelda-like 3D WebGL voxel labyrinth
in the shape of *A Link to the Past*: a connected overworld with two mirror
states, fourteen multi-room dungeons, keys, locks, and the items that open
the world.

Built on **[My-Engine](https://github.com/sumosizedginger/My-Engine) 0.2.0** (pinned SHA in [ENGINE_PIN.md](ENGINE_PIN.md)). Zero-build, offline-first three.js r185.

![Sigil](https://img.shields.io/badge/sigil-%E2%88%9A%CF%80%20%E2%8A%97%20%E2%88%9E%20%E2%8A%97%20%CF%84%C2%B2-d4a84b)

## ▶ Play it

**[Play in your browser →](https://sumosizedginger.github.io/Sovereign-Scar/)**
Needs WebGL2 — any current Chrome, Edge, Firefox or Safari. Nothing to install,
nothing to download, and it saves to your browser's local storage.

**[Download for Windows →](https://github.com/sumosizedginger/Sovereign-Scar/releases)**
An installer and a portable `.exe`. Both are **unsigned**: Windows SmartScreen
will warn on first run until they are code-signed, which is a certificate
purchase and not something the code can fix.

> **Both are the same game.** The browser build and the desktop build run the
> identical files out of `src/` and `lib/` — no bundler, no transpiler, no
> web-specific or Electron-specific fork of the gameplay. GitHub Pages serves
> those files over HTTPS; Electron serves them over a loopback port inside a
> window. They are two containers, not two products, and
> `tests/game/dual-runtime.spec.mjs` fails the build if they start to drift.

Click once to unlock audio, then explore with **WASD**. **B** (or right mouse)
guards — hold to block, tap to parry — and **T** locks on. **Enter** advances
story lines, **Tab** opens the map. A new game begins on the Scarred Crust; the
Crypt Breach lies north. Full controls: [docs/CONTROLS.md](docs/CONTROLS.md).

## Run it from source

```bash
npm i
npm run serve          # http://127.0.0.1:8799/
```

No build step. `npm run serve` is a 60-line static file server; the browser
loads the ES modules directly off disk.

### Desktop, locally

```bash
npm run desktop        # run the native app
npm run desktop:build  # installer + portable .exe into dist-desktop/
```

The desktop shell is `electron/main.cjs` and it changes nothing about the game.
It starts the project's own `scripts/serve.mjs` on a loopback port and points a
window at it, because `loadFile` over `file://` makes Chromium apply CORS to
every ES-module import and the game will not load. The port is OS-assigned, so
the app never collides with a dev server you already have open.

### Build the browser artifact

```bash
npm run pages          # stage dist-pages/ and validate it
```

`scripts/build-pages.mjs` walks the real import graph out of `index.html` and
copies only what the game needs — no tests, no audits, no changelogs. The file
list is derived rather than authored, so a new module cannot be forgotten.
`scripts/validate-pages.mjs` then checks the staged directory: the graph closes,
nothing reaches outside `/Sovereign-Scar/`, no development material got
published, and `.nojekyll` is present (without it GitHub Pages silently drops
`src/game/levels/_common.js`, which every level imports).

## Checks

```bash
npm run lint           # ESLint — correctness rules only, no style opinions
npm run typecheck      # TypeScript checkJs over kernel/world/combat/physics
npm run test:unit      # the pure-Node suite (4,000+ assertions, ~90s)
npm test               # everything, incl. browser E2E (5,000+, needs Chrome, ~9 min)
npm run check          # lint + typecheck + unit, in that order
```

`npm test` prints the only assertion count that is true right now. Counts move
every session, so no number written in a document here is load-bearing — run the
thing.

**What a green GitHub Actions run proves:** the pure-Node suite passes, no
undefined identifiers or unreachable branches, the checked trees type-check, and
the browser artifact builds and validates.
**What it does not prove:** that the game renders anything. The browser/WebGL
half of the suite does not run in CI — hosted runners have no GPU and software
rendering proved unreliable across several attempts — so it is a required local
check before release, not a gate. That half is historically the half that caught
the real bugs. See [REVIEW.md](REVIEW.md) §4.5.

## What's in this build

- **A connected overworld** — 49 screens (7×7) across eight regions, each
  with **two mirror states** (Crust / Abyss) swapped at monoliths, screen-lock
  camera panning, secrets, and all fourteen dungeon entrances
- **14 multi-room dungeons** (6–8 rooms each) on a room-graph system: small
  keys and locked doors, boss keys and boss doors, map pickups, secret rooms,
  Reconstitution Altars, and per-dungeon signature systems (gears, sand,
  multi-Y towers, grapple chasms, phantom walls, meltable ice, sludge pools,
  magma vents, flicker gauntlets). Rooms are not all squares — a room may cut
  rectangles out of its own footprint, and the Quarry is authored that way
- **A camera that frames the fight** — a sealed arena opens the frame by as
  much as the fight is spread out and closes it again at knife range, capped by
  what it costs a 34-px hero; an attack committed from outside the frame puts a
  mark on the edge pointing at it, for exactly the length of its wind-up
- **A full combat verb set** — telegraphed enemy attacks answered by a **guard
  that fully blocks and a 0.3 s parry** (once you find the Bulwark Shield partway through the
  first dungeon — before it, telegraphs have to be read and dodged), plus
  **lock-on** so you can circle what you are fighting instead of only backing
  away from it
- **Nine enemy kinds that ask different questions** — the bulwark's front
  plate must be flanked or parried, the mote must be answered at range, the
  lancer's lunge must be dodged sideways, the brood splits when it dies. No two
  dungeons share a roster. Two of the nine are about the *rest* of the room:
  the weaver webs the ground you were going to stand on, and the censer heals
  and shields whatever it is standing next to — so a room with a live censer
  cannot be ground down, it has to be prioritised
- **A measured difficulty curve** — enemy and boss HP scale with the beat they
  spawn in, so an enemy still lives long enough for its behaviour to happen
  after your weapon damage has tripled
- **A stated idea per dungeon** — each of the fourteen declares a theme and
  lays out rooms that introduce → develop → combine → test it
- **Item-gated traversal** — Magnetic Grapple, Phase Boot, Tectonic Wedge,
  and Light Caster each open blockers across the overworld and dungeons
- **14 unique multi-phase bosses** (bible roster): Warden, Tri-Compiler,
  Sand Spur, Kinetic Core, Proxy, Obsidian Arachnid, Hydroid Cloud, Skeletal
  Mantis, Phantasm, Frost & Fuel, Sludge Golem, Magma Wyrm, GUMOI Witness,
  Leviathan — with intros, phase telegraphs, and a full ending sequence
- **Persistent world** — per-dungeon keys/doors/visited rooms, overworld
  position and mirror state, shard economy + upgrade altars, save v2 with
  migration
- **Dev mode** (`?dev=1` / Ctrl+Shift+D) — god mode, boss controls, teleport
  panel, perf/luminance overlays, hitbox geometry
- **A generated score** — four composed pieces (real keys, modes, chord
  progressions and melodies) with twenty-two per-dungeon and per-region
  variations, scheduled sample-accurately on the audio clock and layered
  adaptively so the music thickens when a fight starts rather than switching.
  **Nothing drones underneath it** — chords are struck on a rhythm rather than
  held, and a browser spec renders the score offline and fails if the signal
  does not fall to near-silence between the notes
- **A sound bank that says what happened** — per-weapon swings, four distinct
  combat outcomes, a parry that sounds nothing like a failed block, and audio
  on doors, locks, the grapple, lock-on, menus and low health
- **Lighting that describes a surface** — the key light's shadow frustum now
  follows the room you are standing in (it used to sit on the world origin, so
  one room per dungeon and **none of the 49 overworld screens** had sun shadows
  at all); every solid mesh receives shadow, or records in the source why it
  does not; contact discs ground every actor, boss and pickup; a procedural
  environment map per mood lets metal finally read as metal; and ambient came
  down from **47% of the total light** so the baked ambient occlusion is no
  longer washed out by it
- **A certification gate that cannot be gamed by flattening the art** — it used
  to band mean frame luminance alone, and a flat room meters *higher* than a
  well-lit one, so raising ambient was always the cheapest way to pass. It now
  bands centre-crop contrast too, with a unit spec proving a flat grey frame
  passes the mean band and fails the floor
- **Crust / Abyss** mood post stack

Design sources (parent folder):

- `../Sovereign-Scar-Narrative-Bible.md`
- `../Sovereign-Scar-Completion-Plan.md`
- `../Sovereign-Scar-Builder-Guide.md`

**Picking this up cold?** Start with [HANDOFF.md](HANDOFF.md) — current state,
what to do next, and the traps that have each already produced a green suite
that was lying.

**Reviewing rather than continuing?** Start with [REVIEW.md](REVIEW.md) — what
is and is not under review, how to verify the claims here yourself, and an
unflattering list of this project's known weaknesses written by the person who
built it.

Implementation log: [BUILD_LOG.md](BUILD_LOG.md) · Controls: [docs/CONTROLS.md](docs/CONTROLS.md) · Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Design audit: [ZeldaLevel.md](ZeldaLevel.md) · Rendering roadmap: [docs/VISUAL_PLAN.md](docs/VISUAL_PLAN.md) · Open questions: [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)

## Project layout

```
src/game/           product code
  world/            room graph, keys, blockers, level builder, threat curve
  overworld/        7×7 world + screens
  audio/            score engine (theory, instruments, tracks) + sfx bank
  combat/           sweeper, weapons, grapple, guard/parry, lock-on
  characters/       actor rigs, animator, pose library, archetypes
  bosses/           framework + 14 bosses
  levels/           overworld + sandbox + 14 dungeon defs + dungeon kits
  dev/              dev mode (gate, panel, overlays, geometry)
  ui/               HUD, story, menus, map screen, ending, coach hints
  narrative/        anchor thread, cutscenes, item chains, reconstitution copy
src/audio/          frozen kit synth primitives (the game drives no drones)
tests/              unit + browser E2E (world, bosses, campaign, visual sanity, audio render)
tests/qa/           print-only measurement probes — see tests/qa/README.md first
scripts/            static server, icon builder, Pages stage + validate
electron/           desktop shell (opens a window at the loopback server)
types/              ambient .d.ts for the one global the game writes
.github/workflows/  tests · pages deploy · tagged desktop release
docs/media/         every change judged by eye, kept — see docs/media/README.md
```

Configuration worth knowing about: `eslint.config.js` (correctness rules and a
written reason for every disable), `tsconfig.json` (the checked-tree boundary
and why it is there).

## License

**MIT, including the game content.** The engine, the systems, the fourteen
dungeons, the narrative, the boss designs and the score are all covered by the
same grant: use it, modify it, fork it, ship it, sell it, provided the copyright
notice travels with it. Copyright stays with the author — that is what MIT's
first line means — but nothing is reserved beyond it.

That is a deliberate choice rather than an oversight, and
[docs/LICENSING.md](docs/LICENSING.md) records what was decided and what the
alternatives were. Vendored dependencies keep their own terms: three.js is MIT
and its licence ships alongside it in `lib/three/`.
