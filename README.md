# Sovereign Scar

**The Wound That Remembers** — a 14-beat Zelda-like 3D WebGL voxel labyrinth.

Built on **[My-Engine](https://github.com/sumosizedginger/My-Engine) 0.2.0** (pinned SHA in [ENGINE_PIN.md](ENGINE_PIN.md)). Zero-build, offline-first three.js r185.

![Sigil](https://img.shields.io/badge/sigil-%E2%88%9A%CF%80%20%E2%8A%97%20%E2%88%9E%20%E2%8A%97%20%CF%84%C2%B2-d4a84b)

## Quick start

```bash
npm run serve          # http://127.0.0.1:8799/
npm test               # unit + browser E2E (284 assertions)
npm run test:unit      # unit only
```

Open the URL, click once to unlock audio, then explore with WASD. Press **Enter** to advance story lines.

## What’s in this build

- Full **game loop** — top-down camera, combat, health, inventory, save progress
- **15 playable levels** (sandbox + beats 01–14) with original voxel props
- **14 unique multi-phase bosses** (bible roster): Warden, Tri-Compiler, Sand Spur, Kinetic Core, Proxy, Obsidian Arachnid, Hydroid Cloud, Skeletal Mantis, Phantasm, Frost & Fuel, Sludge Golem, Magma Wyrm, GUMOI Witness, Leviathan
- Boss **HP bar**, telegraphs, win unlocks, `Bosses: N/14` progress
- **Story panel** with speaker-tagged dialogue per beat
- **Crust / Abyss** mood post stack + **layered music beds** (crust/abyss/boss/leviathan)
- **Y-physics**, destructibles, gears, push blocks, grapple, frustum walls, fluid/wind, light lines, flicker, screen-wrap
- Enemy AI variants: chase / charge / ranged projectiles

Design sources (parent folder):

- `../Sovereign-Scar-Narrative-Bible.md`
- `../Sovereign-Scar-Engine-Integration-Plan.md`
- `../Buildplan.md`

Implementation log: [BUILD_LOG.md](BUILD_LOG.md) · Controls: [docs/CONTROLS.md](docs/CONTROLS.md) · Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Project layout

```
src/game/           product code
  bosses/           framework + 14 bosses
  levels/           15 loaders
  ui/               HUD + story panel
src/audio/          synth, drones, music beds
tests/              unit + browser E2E (incl. boss-e2e)
assets/screenshots/ visual proof
```

## License

MIT (inherits kit license). Game content © project authors.
