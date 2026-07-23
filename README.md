# Sovereign Scar

**The Wound That Remembers** — a 14-beat Zelda-like 3D WebGL voxel labyrinth
in the shape of *A Link to the Past*: a connected overworld with two mirror
states, fourteen multi-room dungeons, keys, locks, and the items that open
the world.

Built on **[My-Engine](https://github.com/sumosizedginger/My-Engine) 0.2.0** (pinned SHA in [ENGINE_PIN.md](ENGINE_PIN.md)). Zero-build, offline-first three.js r185.

![Sigil](https://img.shields.io/badge/sigil-%E2%88%9A%CF%80%20%E2%8A%97%20%E2%88%9E%20%E2%8A%97%20%CF%84%C2%B2-d4a84b)

## Quick start

```bash
npm run serve          # http://127.0.0.1:8799/
npm test               # unit + browser E2E (2966 assertions)
npm run test:unit      # unit only
```

Open the URL, click once to unlock audio, then explore with WASD. **Right mouse**
guards (tap it to parry), **T** locks on. Press **Enter** to advance story lines,
**Tab** for the map. A new game begins on the Scarred Crust — the Crypt Breach
lies north.

## What's in this build

- **A connected overworld** — 49 screens (7×7) across eight regions, each
  with **two mirror states** (Crust / Abyss) swapped at monoliths, screen-lock
  camera panning, secrets, and all fourteen dungeon entrances
- **14 multi-room dungeons** (6–8 rooms each) on a room-graph system: small
  keys and locked doors, boss keys and boss doors, map pickups, secret rooms,
  Reconstitution Altars, and per-dungeon signature systems (gears, sand,
  multi-Y towers, grapple chasms, phantom walls, meltable ice, sludge pools,
  magma vents, flicker gauntlets)
- **A full combat verb set** — telegraphed enemy attacks answered by a **guard
  and a 0.18 s parry** (once you find the Bulwark Shield partway through the
  first dungeon — before it, telegraphs have to be read and dodged), plus
  **lock-on** so you can circle what you are fighting instead of only backing
  away from it
- **Seven enemy kinds that ask different questions** — the bulwark's front
  plate must be flanked or parried, the mote must be answered at range, the
  lancer's lunge must be dodged sideways, the brood splits when it dies. No two
  dungeons share a roster
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
src/audio/          frozen kit synth primitives (the game drives no drones)
tests/              unit + browser E2E (world, bosses, campaign, visual sanity, audio render)
tests/qa/           measurement probes (time-to-kill, difficulty curve, luminance, audio envelope)
docs/media/         gate screenshots + certification captures
```

## License

MIT (inherits kit license). Game content © project authors.
