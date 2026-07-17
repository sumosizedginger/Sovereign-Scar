# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.3.0] — 2026-07-17

The "LttP scope" release: the fifteen single arenas became a connected world.
Executes the Completion Plan (Phases S/D/W/C) via the Builder Guide.

### Added
- **World architecture**: room-graph dungeons on a 64-unit world grid (door
  gaps, locked/boss-door plugs, camera room-lock panning, prebake, multi-Y
  platform meshes), persistent per-dungeon key/door/visited state (save v2 +
  one-shot migration), overworld screens with edge transitions, mirror travel
  (monolith swaps between per-screen Crust/Abyss layouts), Tab map (overworld
  grid + dungeon room graph), item-gating blockers (grapple gap, wedge crack,
  boot ledge, caster shroud).
- **Content**: 7×7 overworld (49 screens × 2 states, 8 regions, 14 dungeon
  entrances, monoliths, secrets); all 14 beats rebuilt as 6–8-room dungeons
  with keys, locks, boss keys, maps, secrets, altars, and their signature
  systems; new game starts on the overworld; Bare Strike starting weapon —
  the Anchor Link is salvaged from the Crypt Warden.
- **Dev mode** (`?dev=1` / Ctrl+Shift+D): god/one-hit, F2 boss kill, F3 phase
  force, teleport/grant panel, perf + luminance overlays, hitbox geometry.
- Visual-sanity and campaign/world e2e suites (388 → 900+ assertions),
  per-level luminance sampler, character `measure()` hook.

### Fixed
- P0-1: characters were ~7× world scale with feet below the floor (player
  14.85 → 1.93 units, grounded via bounding-box shift).
- P0-2: near-black scenes — the abyss vignette preset was crushing the frame
  (13–32/255); lights now driven by mood presets, all 15+ scenes read
  35–90/255.
- P0-3: 0×0 canvas on hidden-tab boot (continuous size guard).
- P1-4: no longer start holding the weapon Beat 01 says to salvage (plus the
  `grantItem('anchor_link')` no-op).
- P1-5: boss silhouettes now dominate trash mobs (presence scaling with
  matched combat radii).
- Bosses that orbit/patrol anchor to their arena, not the world origin.
- Boss HP bar only shows when the fight is near.

## [0.2.0-engine] — 2026-07-13 (kit changelog below)

## [0.2.0] — 2026-07-13

Professionalization pass: the kit went from "code that works" to a real
public project — tests, CI, examples, docs, and a standalone identity.

### Added
- Full test suite: pure-node unit specs for `collision.js`, `hitbox.js` +
  `facing.js` (including the equivalence proof that a vectorized facing
  matches the classic X-signed cone bit-for-bit), and `settings.js`
  (storage-absent/throwing degradation, persistence, reset semantics), plus
  a browser smoke spec covering `index.html` and both examples.
- GitHub Actions CI running the unit suite on every push/PR to `main`.
- Two genre-neutral examples: `examples/topdown-8way.html` (top-down camera,
  8-way movement, melee arc, wall collision) and `examples/voxel-showcase.html`
  (six bespoke voxel builds, live quality-tier switching).
- `docs/API.md` — a hand-curated reference for every export in `src/`,
  including the implicit `world` contract.
- README screenshots ("See it" section) for the smoke test and both examples.
- `package.json` identity fields (`repository`, `author`, `license`) and a
  standalone description no longer framed as an extraction of a specific game.
- `.editorconfig`, `.gitattributes`, `CONTRIBUTING.md`.

### Changed
- README rewritten to stand on its own: leads with what the kit *is*, closes
  with a "Built with this kit" section linking an example project instead of
  a "lifted out of" provenance framing.

### Known limitations
- CI runs the pure-node unit suite only (44 assertions, <1s). The browser
  smoke test (`npm test`, full suite) needs a real GPU — GitHub's hosted
  runners don't have one, and headless Chrome + SwiftShader software
  rendering proved unreliable there across several attempts. Run `npm test`
  locally before tagging a release; see CONTRIBUTING.md.

## [0.1.0] — Initial extraction

The kit as pulled out of its origin game: renderer + HDR bloom/vignette/film
composer, voxel meshing with baked ambient occlusion, character-part
builders, particle and motion-smear FX, a WebAudio synth, localStorage-backed
settings, quality tiers, skybox/environment, and the two combat primitives
that motivated the extraction — swept AABB collision and a vectorized
(8-way) hitbox, first proven in real belt-scroller combat with `facingVec`
pinned to `±X`. No tests, no CI, no examples yet.
