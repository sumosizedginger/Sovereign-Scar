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
npm test               # unit + browser E2E (955 assertions)
npm run test:unit      # unit only
```

Open the URL, click once to unlock audio, then explore with WASD. Press
**Enter** to advance story lines, **Tab** for the map. A new game begins on
the Scarred Crust — the Crypt Breach lies north.

## What's in this build

- **A connected overworld** — 49 screens (7×7) across eight regions, each
  with **two mirror states** (Crust / Abyss) swapped at monoliths, screen-lock
  camera panning, secrets, and all fourteen dungeon entrances
- **14 multi-room dungeons** (6–8 rooms each) on a room-graph system: small
  keys and locked doors, boss keys and boss doors, map pickups, secret rooms,
  Reconstitution Altars, and per-dungeon signature systems (gears, sand,
  multi-Y towers, grapple chasms, phantom walls, meltable ice, sludge pools,
  magma vents, flicker gauntlets)
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
- **Crust / Abyss** mood post stack + **layered music beds**
  (crust/abyss/boss/leviathan)

Design sources (parent folder):

- `../Sovereign-Scar-Narrative-Bible.md`
- `../Sovereign-Scar-Completion-Plan.md`
- `../Sovereign-Scar-Builder-Guide.md`

Implementation log: [BUILD_LOG.md](BUILD_LOG.md) · Controls: [docs/CONTROLS.md](docs/CONTROLS.md) · Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Project layout

```
src/game/           product code
  world/            room graph, keys, blockers, level builder
  overworld/        7×7 world + screens
  bosses/           framework + 14 bosses
  levels/           overworld + sandbox + 14 dungeon defs
  dev/              dev mode (gate, panel, overlays, geometry)
  ui/               HUD, story, menus, map screen, ending
src/audio/          synth, drones, music beds
tests/              unit + browser E2E (world, bosses, campaign, visual sanity)
docs/media/         gate screenshots + certification captures
```

## License

MIT (inherits kit license). Game content © project authors.
