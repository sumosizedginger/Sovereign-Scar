# Voxel Engine Kit

[![tests](https://github.com/sumosizedginger/My-Engine/actions/workflows/test.yml/badge.svg)](https://github.com/sumosizedginger/My-Engine/actions/workflows/test.yml)

A zero-build, offline-first three.js voxel engine layer: a renderer with an HDR
bloom/vignette/film composer, voxel meshing with baked ambient occlusion,
character-part builders, particle and motion-smear FX, a WebAudio synth,
localStorage-backed settings, quality tiers, and two genre-neutral combat
primitives — swept AABB collision and a vectorized (8-way) hitbox. Drop it into
a new project and you have a running, good-looking voxel sandbox on day one —
then build *your* game (shmup, top-down adventure, brawler, whatever) on top.

This is a starting point, not a framework. Copy it, rename it, hack it.

## Boot it

```
npm run serve      # node scripts/serve.mjs 8799 — a zero-dep static server
# open http://localhost:8799
```

`three` r185 is vendored under `lib/three/` (ES modules + a hand-traced subset of
the postprocessing addons), so it runs with no network and no bundler. The import
map in `index.html` wires `import * as THREE from 'three'`. `npm i` is only needed
if you want your editor to resolve three's types.

`index.html` is a smoke test: it boots the renderer, builds a voxel figure from
the voxel pipeline, and live-proves the vectorized hitbox and the collision
module in an on-screen panel. If that page renders, the kit is healthy.

## What's in the box

| Area | Files | Notes |
|------|-------|-------|
| Render pipeline | `engine/renderer.js`, `lights.js`, `environment.js`, `quality.js`, `skybox.js`, `textures.js` | three.js scene + camera, HDR bloom / vignette / film / RGB-shift composer, shadow lights, IBL environment, quality tiers, procedural skybox + textures. |
| Voxel art | `voxel/core.js`, `voxel/helpers.js`, `voxel/palette.js` | `buildVoxelGeo(map)` bakes a voxel `Map` into one geometry with AO; `fillBox`/`fillEllipsoid`/`paint` author the map. |
| Character builders | `characters/builders.js` | `buildTorso`/`buildHead`/`buildArm`/`buildLeg`/`buildGlowEyes` — voxel humanoid parts you assemble into a rig. |
| FX | `engine/particles.js`, `engine/smear.js` | Instanced dust/petal/spark pools; motion-smear arcs for weapon/limb swings. |
| Audio | `audio/synth.js` | WebAudio synth: `initAudio`, `playTone`, `playNoise`, `sfx`, `setVolumes`. |
| Persistence / settings | `engine/settings.js` | localStorage-backed settings, progress, high scores, difficulty multipliers, change events. Degrades gracefully with no storage. |
| **Collision** | `engine/collision.js` | Genre-neutral AABB solids on the XZ ground plane, swept + axis-separated so movers slide along walls and never tunnel. **New** — see below. |
| **Vectorized hitbox** | `combat/hitbox.js`, `combat/facing.js` | Dot-product reach cone that follows a facing **vector**, plus a tiny facing helper so you get 8-way aim without a combat state machine. **New** — see below. |
| Shared handle | `context.js` | The empty `world` object every module reads (`world.collision`, `world.particles`, …). Your game populates it. |

### Not included (they were game-specific)

The brawler's combat state machine, factory, bosses, levels, waves, narrative
director, and HUD live in the game repo, not here — they encode belt-scroller
rules. `combat/hitbox.js` + `combat/facing.js` are the reusable seed of a combat
layer; grow your own on top.

## The two combat primitives, and why they're here

### Vectorized hitbox (`combat/hitbox.js` + `combat/facing.js`)

`hitboxCheck(attacker, defender, move)` tests reach in the attacker's **facing
frame**: it projects the attacker→defender offset onto the facing direction
(`forward`, the reach toward the enemy) and across it (`lateral`, the "lane" gap),
then checks `move.range` / `move.depthTolerance` / `move.vertical`.

Facing is a **unit vector in XZ** (`attacker.state.facingVec`). When that vector is
axis-aligned (`±1` on X, as in a belt-scroller) the math is *numerically identical*
to a classic X-signed cone — so a side-scroller pays nothing. Feed a real Z
component and the whole cone turns with it: that's free 8-way / top-down aiming.

`combat/facing.js` gives you that vector without any of the game's combat code:

```js
import { makeFacing } from './src/combat/facing.js';
import { hitboxCheck } from './src/combat/hitbox.js';

const player = { root, state: makeFacing(1) };
player.state.setFacing(inputX, inputZ);   // 8-way aim from stick / WASD
// player.state.setFacing8(inputX, inputZ) to snap to 8 compass directions
// player.state.facing = -1;               // or stay pure belt-scroller

if (hitboxCheck(player, enemy, { range: 1.6, depthTolerance: 0.9, vertical: 1.2 })) {
    // land the hit
}
```

`move` fields, all in **world units**: `range` (forward reach), `depthTolerance`
(lateral tolerance), `vertical` (Y tolerance), and optional `omni: true` for a
radial sweep (spin attacks). `defender.hitRadius` widens every window by the
target's body size.

### AABB collision (`engine/collision.js`)

```js
import { CollisionWorld } from './src/engine/collision.js';

const cw = new CollisionWorld();          // wire it to world.collision if you use the world handle
cw.addSolid({ minX: 2, maxX: 3, minZ: -5, maxZ: 5 });   // a wall; returns an id
const next = cw.resolveMove(px, pz, desiredX, desiredZ, halfExtent);
entity.x = next.x; entity.z = next.z;     // slides along solids, won't tunnel
cw.removeSolid(id);                        // e.g. when a crate is destroyed
```

Empty world ⇒ every `resolveMove` is a pass-through, so adding it changes nothing
until you register geometry. Solids are static ground-plane boxes; movers are
squares of `halfExtent`. Movement resolves X then Z (wall-slide) and is swept on
each axis so one fast step can't jump through a thin wall.

## Wiring a new game

1. Import `scene`, `camera`, `composer` from `engine/renderer.js`; call
   `initLights()`; add your content to `scene`; run a loop that calls
   `composer.render()` each frame. (`index.html` is the 60-line version of this.)
2. The camera in `renderer.js` is set up for a **locked 2.5D side view**
   (`updateCamera`, `lockedTraverseBoundsX`, etc.). For a top-down or free-roam
   game, replace that block — it's the most side-scroller-specific file here.
3. Populate the shared `world` handle (`context.js`) with whatever your systems
   read: `world.collision = new CollisionWorld()`, `world.particles = new
   ParticleSystem(scene)`, `world.characters = []`.
4. Build characters from `characters/builders.js`, or author bespoke voxel meshes
   with the `voxel/` helpers.
5. Give each attacker a facing (`makeFacing`) and use `hitboxCheck` for melee, or
   grow your own projectile system for a shmup.

## Examples

Two tiny, self-contained pages (kit APIs only, no bundler — open them straight
off `npm run serve`) that prove the "genre-neutral" claim above isn't just talk:

- **[examples/topdown-8way.html](examples/topdown-8way.html)** — the camera
  block replaced for a top-down follow, a voxel hero built from
  `characters/builders.js`, WASD 8-way movement via `setFacing`, a melee arc
  via `hitboxCheck` against three dummy targets, and `CollisionWorld` walls the
  hero slides along. The Zelda-like porting note, made real.
- **[examples/voxel-showcase.html](examples/voxel-showcase.html)** — a rotating
  gallery of six bespoke voxel builds (ship, crystal, mushroom, robot head,
  tree, turret) authored purely with `fillBox` / `fillEllipsoid` / `paint`,
  bloom picking out the glowing bits, quality tiers live-switchable on
  <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd>. The shmup porting note's proof.

## Porting notes (from the honest assessment)

- **R-Type-style shmup**: keep the renderer, voxel pipeline, FX, audio, UI, and
  collision; the melee cone doesn't apply — build a bullet pool instead. The
  biggest transplant is the *shape* of a multi-phase boss state machine (rewrite
  the contents). Voxel **ships** come out of `voxel/` beautifully.
- **Top-down adventure (Zelda-like)**: this is exactly why facing was vectorized.
  Flip your entities to `setFacing(x, z)` (8-way) and `hitboxCheck` already turns
  the sword arc with you; `collision.js` is the wall/obstacle layer such a game
  lives on. You still owe the big content system — rooms, items-as-progression,
  puzzles — none of which is here.

## Built with this kit

**[Neon Rot: Unbound](https://github.com/sumosizedginger/neon-rot-unbound)** — a
synthwave-horror voxel beat-'em-up with 3 playable heroes, 11 levels/bosses, and 3
endings — is where this kit's vectorized hitbox and collision module were first
proven, running real belt-scroller combat with `facingVec` pinned to `±X`. The
repo is private while the game is in development; a public build (GitHub Pages /
itch.io) is planned, and this link will go live then.

MIT licensed (see `LICENSE`). Vendored three.js keeps its own MIT license under
`lib/three/`.
