# Audit: progression gating, boss-arena geometry & graphics headroom

Status: partially implemented, independently re-audited 2026-07-20. The
2026-07-19 diagnosis below is retained as the evidence record, but its old
"nothing patched" status is historical. Progression gating, GUMOI platform
classification, room-exit camera cleanup, the shadow-map constant, and a
WebGL2 startup message now exist in the worktree. Exact dependency pinning,
shader prewarming, and optional GTAO remain open. Live GUMOI traversal still
lacks a normal-physics browser test.

The prior audit-only directive governed the 2026-07-19 session. It is not a
truth claim about the current worktree. Do not use the historical wording in
the findings below to conclude that later fixes are absent.

## Independent implementation check: 2026-07-20

| Item | Current result | Evidence / remaining risk |
|---|---|---|
| Overworld beat gating | **Implemented** | `overworld.js` checks `game.isLevelUnlocked`; player-facing requests use `requestLevel`; Beat Select requires `unlockedBeats`; boot repairs an invalid `currentBeat`. Unit and browser progression checks pass. |
| GUMOI terrace collision | **Structurally implemented** | `witnesscrown` now uses `platforms()`, and three unit assertions verify the raised columns stay out of the planar solid map. No registered browser test walks the terraces and fights the Witness through normal physics, so full traversal remains unproven. |
| Room-exit camera focus | **Implemented** | `room-graph.js:startTransition()` calls `clearFocus()` before the pan. No focused timing regression test was added. |
| Shadow deprecation | **Implemented** | Renderer now selects `THREE.PCFShadowMap`. Fresh visual shadow review is not recorded. |
| Frozen-engine boundary | **Review required** | `src/engine/renderer.js` was modified even though the Builder Guide and this audit identify `src/engine/` as frozen. The repository does not record the external approval history, so authorization cannot be verified from the worktree. |
| WebGL2 failure path | **Implemented, not automated** | `index.html` gates dynamic game import and renders a readable fatal message. There is no test that forces an unavailable WebGL2 context. |
| Exact three.js pin | **Open** | `package.json` still declares `^0.185.0`, so the declaration remains softer than the vendored-runtime policy described below. |
| Shader prewarming | **Open** | No `compile()` or `compileAsync()` path exists. |
| Ultra GTAO | **Open and optional** | No GTAO pass or measured performance budget has landed. |

Verification is not green. `npm run test:unit` passes **669/669**. The complete
runner finishes at **1257/1267** with ten failures: nine Abyss luminance
samples fall below their required band, and `world-e2e` still expects grapple
anchor posts to be planar collision solids even though the new implementation
deliberately makes them visual-only. The latter is a stale test contract; the
dark scenes are a current presentation regression.

## Historical project context at diagnosis

- Repo root: `D:\Zelda\sovereign-scar` (this file lives at the repo root,
  alongside `BUILD_LOG.md` and `CHANGELOG.md`). Git-tracked; `git status`
  before anything destructive.
- Zero-build ES modules, three.js revision r185 and npm package 0.185.1,
  WebGL with classic `WebGLRenderer` plus `EffectComposer`, not the newer
  WebGPU and TSL pipeline. See Finding 3.
- Run: `npm run serve` → `http://127.0.0.1:8799/`. Test: `npm test` (full
  suite, needs a real GPU; use `npm run test:unit` for the GPU-free subset).
  Fresh final verification on 2026-07-19 passed 560/560 unit assertions and
  1140/1140 full-suite assertions.
- Standing project constraints (from the Builder Guide, still in force):
  `src/engine/`, `src/voxel/`, `src/combat/`, `src/characters/`, `lib/` are
  frozen. The only permitted change to any of them is additive edits
  to `src/audio/synth.js`. Game code lives in `src/game/` + `tests/`, which
  is where Findings 1 and 2 below live (not frozen, but still awaiting
  go-ahead per the standing directive above). Finding 3 lives in
  `src/engine/renderer.js` + `src/engine/quality.js`. Both are frozen, so it
  needs explicit sign-off regardless of the audit-only directive.
  Also: no new npm dependencies; "boring over clever"; `npm test` after
  every ticket with the pass count never decreasing; a `BUILD_LOG.md` entry
  + conventional-prefix commit per ticket.
- `package.json` declares `three: ^0.185.0`, so the npm declaration is not an
  exact pin. `package-lock.json`, `node_modules`, and both vendored runtime
  builds resolve to 0.185.1 today. The vendored runtime files match the
  installed package byte for byte.
- Doc cross-references: `BUILD_LOG.md`'s "Session 9: gremlin audit" entry
  still says the progression and terrace defects are not fixed. That entry is
  now stale. `CHANGELOG.md` records the later fixes but also records obsolete
  green-suite totals. This audit is the refreshed status source until those
  histories are reconciled.

## Origin report

By-hand playthrough, beat-13 GUMOI Tower, 2026-07-19. Screenshot showed the
camera clipped into large voxel geometry; HUD read `Beat: 13 GUMOI Tower /
HP 2/6 / Weapon: Bare Strike / Keys: 0/3 · Shards: 49 / Small keys: 0 · BOSS
KEY · Bosses: 0/14`; boss bar `GUMOI WITNESS PHASE 2/3`. User's words: "I
was able to just run to whatever level this is without issue, and I might
have won if I didn't get stuck in the boss fight."

That HUD is two separate bugs in one screenshot: reaching beat 13 with the
starting weapon and zero prior boss kills (a progression-gating hole),
and getting physically stuck in the GUMOI Witness arena (a collision
geometry bug specific to that room). Both are confirmed below with exact
file:line citations, independently reproducible from the code alone, no
build or playtest was needed to find either.

---

## Finding 1: Overworld dungeon entrances have no unlock check (HIGH confidence)

The bug: walking up to any of the 14 dungeon doors on the overworld and
pressing E loads that dungeon immediately, with no check against
`unlockedBeats` or `bossesDefeated` at all.

```js
// src/game/overworld/overworld.js:144-151
if (game.input?.consumeInteract?.()) {
    patchOverworld({
        pos: { world: levelId, screen: sid, x: en.x, z: en.z + 2 },
    });
    sfx.heave?.();
    game.loadLevel?.(en.to);   // <-- no unlockedBeats / bossesDefeated check
    return;
}
```

This is the only place a normal player travels between beats. Two other
travel paths exist and both gate correctly, which is exactly why this
one stands out as a miss rather than an intentional design choice:

```js
// src/game/ui/menu.js:46  (pause-menu Beat Select)
const isOpenBeat = unlocked.has(meta.id) || meta.id === 'sandbox-combat' || meta.id === prog.currentBeat;
// -> disabled: !isOpenBeat, rendered with a 🔒
```

```js
// src/game/index.js:616-628  ([ / ] beat-cycle keys)
if (unlocked.has(nid) || nid === 'sandbox-combat' || prog.currentBeat === nid) {
    loadLevel(nid);
} else {
    if (dev.enabled) { loadLevel(nid); hud.toast(`Dev skip → ${nid}`); }
    else hud.toast(`Locked: defeat the prior boss first`);
}
```

It compounds. `loadLevel()` unconditionally persists `currentBeat` to the
save on every load, gated or not:

```js
// src/game/index.js:262-267
saveSovereignProgress({
    currentBeat: meta.id,   // set for ANY load, including the un-gated overworld-door path
    inventory: player.inventory.toJSON(),
    hp: player.health.hp,
    mood: mood.mood,
});
```

Since the menu's own gate (`menu.js:46` above) treats
`meta.id === prog.currentBeat` as sufficient to open a beat, one un-gated
walk through any door permanently clears that beat's 🔒 in the Beat Select
menu too, `unlockedBeats` is never touched, and doesn't need to be. The
padlock a player sees in the pause menu does not mean "defeated the prior
boss"; it means "has ever loaded this level once, by any means." This is
save-corrupting: it's not just a one-time skip, the false "unlocked" state
persists across sessions.

Why this fully explains the screenshot: reaching beat 13 with Bare
Strike / 0 keys / Bosses 0/14 required no exploit, walking to a door and
pressing E is unremarkable player behavior on an open-world overworld map.

Ruled out as contributing factors:
- Dev mode defaults to `enabled = false` (`src/game/dev/dev-mode.js:18`),
  requires `?dev=1` or an explicit toggle, not implicated.
- `docs`/`src/game/ui/map-screen.js` is read-only (no `loadLevel` /
  teleport calls), the Tab map is not a fast-travel vector.
- Mirror travel (`startSwap`) only swaps the overworld's Crust/Abyss layout,
  it does not call `loadLevel` on a dungeon, not implicated.

Implemented direction: `overworld.js` now checks `game.isLevelUnlocked`
before changing the return position or loading a dungeon. `requestLevel`
provides the shared player-facing second layer, and boot repairs a stale
locked `currentBeat`. The raw loader remains intentionally exposed for dev
and test harnesses, not ordinary play.

---

## Finding 2: beat-13's GUMOI Witness arena terraces are solid walls, not climbable floor (HIGH confidence)

The mechanism. `CollisionWorld` (`src/engine/collision.js`, frozen
engine) is a 2D XZ-only solid registry, a solid is `{minX, maxX, minZ,
maxZ}`, there is no Y field anywhere in it. `meshAndCollide()` says exactly
what this means for voxel geometry, in its own comment:

```js
// src/game/world/level-builder.js:43-44, 61-75
// Mesh a map and register column solids for walls (y>=1) and optional floors.
export function meshAndCollide(map, scene, collisionWorld, opts = {}) {
    ...
    if (collisionWorld) {
        // Walls: any column with maxY >= 1 becomes an XZ solid
        ...
        for (const [ck, c] of columns) {
            if (c.maxY < 1) continue; // pure floor
            ...
            collisionWorld.addSolid({ id, minX, maxX, minZ, maxZ }); // no Y bound at all
        }
    }
```

Once a column is registered this way it blocks that XZ footprint at every
height, forever, a thin floating slab with nothing underneath it still
walls off the ground beneath it, because the collision check never looks at
Y. This is by design for actual walls, and it's wrong for anything meant
to be a walkable elevated floor.

The project already has the correct escape hatch, used deliberately
elsewhere in the same file:

```js
// src/game/world/room-graph.js:236-243
// Multi-Y platforms (G5): meshed WITHOUT XZ solids so their tops are
// standable, VoxelPhysicsBody climbs 1-cell steps via getVoxelAt.
let platformBuilt = null;
if (room.platforms) {
    const pmap = new Map();
    room.platforms(pmap, buildHelpers(room));
    platformBuilt = meshAndCollide(pmap, scene, null, { origin }); // collisionWorld = null
}
```

`build(map, h)` → gets full XZ collision (walls, pillars, obstacles).
`platforms(map, h)` → does not (climbable elevated terrain, steps up via
`VoxelPhysicsBody`'s Y-only gravity/ground-snap in
`src/game/physics/voxel-physics-body.js`, no jump button exists in this
game, WASD + dash + grapple + interact only, per `docs/CONTROLS.md`).
Every other climbable structure in the game correctly uses `platforms()`:
beat-04's stepped monument, beat-05, beat-08, beat-09, and, tellingly -
beat-13's own `stairworks` room, whose `spiral()` staircase sits inside
`platforms()` at `beat-13-gumoi.js:106-109`.

The bug: `witnesscrown`, the GUMOI Witness's own room, i.e. the boss
arena itself, puts its terraces in `build()` instead:

```js
// src/game/levels/beat-13-gumoi.js:195-206
witnesscrown: {
    grid: [0, -4],
    half: 10,
    wallH: 6,
    build(map, h) {
        // The original tower-top terraces, climbable to the Witness
        h.fillBox(map, -3, 3, 1, 1, 3, 6, CRUST_COLORS.slate);
        h.fillBox(map, -6, -2, 3, 3, -2, 2, CRUST_COLORS.slate);
        h.fillBox(map, 2, 6, 5, 5, -4, 0, CRUST_COLORS.slate);
        h.fillBox(map, -2, 2, 7, 7, -7, -3, ABYSS_COLORS.violet);
        h.fillBox(map, -1, 1, 9, 9, -2, 2, ABYSS_COLORS.goldVein);
    },
    doors: [{ to: 'indexspire', side: 'S', at: 0, type: 'boss' }],
    boss(ctx, level, origin) {
        const witness = new GumoiWitness(ctx.scene, { x: origin.x, y: 9.5, z: origin.z });
        ...
```

The comment says "climbable"; the function it's written in guarantees it
isn't. All five terrace tiers register as permanent, full-height 2D walls -
the exact opposite of the intended design. I checked every `build()` body
across all 14 beats for the same mistake (climbable-shaped terrain landed in
the wrong builder), this is the only occurrence. Everywhere else
`build()` is used correctly, for actual obstacles/pillars/rims that are
genuinely meant to block movement at every height.

Why bosses don't get stuck the same way: `src/game/bosses/base.js`
(`BossBase`) never references `collisionWorld`, `resolveMove`, or
`getVoxelAt` anywhere (confirmed via grep, zero matches). Bosses hover and
move through all geometry unimpeded, by design. So during the fight the
Witness can freely close distance and corner the player against these
accidentally-solid terrace faces, while the player has no way to step around
or through them, the boss is never subject to the bug that traps the
player.

Why this plausibly explains both halves of the screenshot:
- "Got stuck in the boss fight", the player is boxed in by
  invisible-logic walls that don't match the visible floor height, unable to
  navigate the arena as the room's own comment says they should be able to.
- "Camera clipped into large geometry blocks", pinned flush against one
  of these full-height meshes under a tight, near-overhead top-down camera
  reads exactly like a clipped camera. This is made worse by the boss-intro
  camera dip that fires the instant the room is entered:
  ```js
  // src/game/index.js:666
  camRig.focus({ height: 6, back: 3.5, duration: 1.8, target: b.root?.position || null });
  ```
  (height 17.5 → 6, back 6.1 → 3.5 for 1.8s) pulls the camera in tight right
  as the player is likely to be immediately jammed against one of these
  walls.

Implemented direction: the five `fillBox` calls were moved
at `beat-13-gumoi.js:201-205` from `build(map, h)` into a new
`platforms(map, h)` on the `witnesscrown` room definition, matching the
pattern already used by `stairworks` in the same file and by beats 04/05/08/09
elsewhere. Verify afterward that the boss's own start position (`y: 9.5`,
`beat-13-gumoi.js:210`) and the `STRIKE_Y = 2.0` descent height in
`src/game/bosses/roster.js:1064` are actually reachable/relevant from
wherever the player ends up standing once the terraces are properly
climbable, the terrace-height mismatch between the boss's spawn height
(9.5) and its strike height (2.0) was not fully investigated in this audit
and may be worth a second look once the collision fix lands (i.e. does the
player need to be standing near the base floor to be hit at all, and if so,
is climbing to y=9 ever actually required or useful for this specific
fight?).

---

## Finding 3: graphics headroom and renderer hygiene

This is separate from the two gameplay bugs above. Dynamic contact AO and
shader prewarming are opportunities. The deprecated shadow-map selection,
soft dependency pin, and missing WebGL2 failure path are current technical
defects or maintenance gaps. All claims below were checked against the
2026-07-19 worktree and official sources on that date.

Current pipeline. `src/engine/renderer.js`, `src/engine/quality.js`, and
`src/engine/lights.js` are frozen. The pipeline is already substantial: an
HDR half-float `EffectComposer` target with 4x MSAA, ACES filmic tone
mapping, `UnrealBloomPass`, `SMAAPass`, vignette, film grain, Ultra-only
chromatic aberration, directional-light shadows up to 4096 squared,
environment maps, a planar reflector, and baked per-vertex corner AO from
`AO_LEVELS` in `src/voxel/core.js`.

Dynamic AO gap. Baked voxel AO is computed once from fixed voxel neighbors.
It cannot darken changing contact between moving actors or destructibles and
static geometry. Official r185 documentation still provides WebGL
`GTAOPass` for `EffectComposer`. It offers higher quality than `SSAOPass` and
costs more. The project can vendor the matching addon and test it on Ultra
without changing renderers.

Do not confuse `GTAOPass` with `GTAONode`. The r184 to r185 migration note
about darker, wider AO applies to WebGPU and TSL `GTAONode`. It is not tuning
advice for the WebGL pass. Tune `GTAOPass` from paired captures and measured
frame cost.

Active shadow deprecation. `src/engine/renderer.js:45` selects
`THREE.PCFSoftShadowMap`. The official migration guide deprecated that
choice for `WebGLRenderer` in r182 and says to use `PCFShadowMap`, which is
now soft. Current r185 source warns and converts the old value at runtime.
Replace it with `THREE.PCFShadowMap`, then recapture shadow-heavy scenes to
verify softness and bias.

Soft package pin. `package.json` declares `three: ^0.185.0`. The live npm
registry reports 0.185.1 as current on 2026-07-19. The lockfile and installed
package resolve 0.185.1. The vendored runtime matches those installed builds:

- `three.module.min.js` SHA-256:
  `86BCEE248B64F44BCFC23C331AE74619061957D59CAB040171DCB6FB5900BEB6`
- `three.core.min.js` SHA-256:
  `05B2609338C76CD65DAF74F3AC515BC9A5045E1B3B33EDC07D8C9BD55250FA90`

The shipped runtime is coherent today, but a caret range and hand-vendored
runtime can drift. If the project means pinned, use exact `0.185.1` and move
the declaration, lockfile, vendored builds, and addon files as one reviewed
unit.

Release-boundary warning. The official migration guide now contains a
`185 -> 186` section, but the official site still identifies r185 as current
and the live npm registry still reports 0.185.1. Those entries are
forward-looking. Do not mix r186 addon code into the r185 offline runtime
until an official r186 release and matching npm package exist.

Missing compatibility path. Official r185 documentation states that
`WebGLRenderer` requires WebGL2. The game constructs it without a capability
gate or readable fallback. Vendor the matching
`three/addons/capabilities/WebGL.js`, call `isWebGL2Available()` before game
initialization, and show `getWebGL2ErrorMessage()` or a branded equivalent
when unavailable.

Existing metrics ownership is correct. `src/engine/renderer.js:43` sets
`renderer.info.autoReset = false`, and `src/game/index.js:507` resets the
counters once per game frame. Official documentation recommends this pattern
for multi-pass post-processing. Preserve it so future passes remain included
in whole-frame draw-call and triangle measurements.

Measured shader prewarming. The current renderer does not call `compile()`
or `compileAsync()`. Official documentation recommends `compileAsync()`
when possible because it uses `KHR_parallel_shader_compile`. If the visual
reconstruction adds new material families, configure the target scene's
lights and environment first, precompile during the level transition, and
keep the change only if measurement shows lower first-use stalls.

WebGPU migration remains the wrong job. Official three.js guidance calls
`WebGPURenderer` experimental. It does not support this project's existing
`EffectComposer` passes, `ShaderMaterial`, `RawShaderMaterial`, or
`onBeforeCompile()` path without a TSL and node-material rewrite. The same
official guide says `WebGLRenderer` remains maintained and recommended for
pure WebGL2 applications. The newer renderer does have a WebGL2 backend
fallback, but that does not erase the migration cost or unsupported paths.

Current direction. `PCFSoftShadowMap` and the readable WebGL2 failure path
are implemented. The dependency pin is not exact. Treat shader prewarming
as a measured optimization. Add WebGL
`GTAOPass` only after the higher-impact composition, geometry, actor,
material, and lighting work in v2, and keep it Ultra-only if it earns its
frame cost.

### Official live sources checked on 2026-07-19

- [three.js official site, current revision r185](https://threejs.org/)
- [three.js r185 release](https://github.com/mrdoob/three.js/releases/tag/r185)
- [three.js migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- [WebGLRenderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html)
- [WebGL capability documentation](https://threejs.org/docs/pages/WebGL.html)
- [WebGPURenderer status and migration guide](https://threejs.org/manual/en/webgpurenderer)
- [GTAOPass documentation](https://threejs.org/docs/pages/GTAOPass.html)

---

## Secondary observations (lower priority / informational)

- Camera focus dip not cancelled on room backtrack. `camRig.clearFocus()`
  runs only on full level load (`index.js:227`), not on room-to-room
  transitions inside a multi-room dungeon. `witnesscrown`'s own `onEnter`
  (`beat-13-gumoi.js:225-233`) re-fires `focus()` on every entry, which
  self-overwrites cleanly on repeat entry, but there's no cancellation if
  the player backtracks out through the door mid-dip (within the 1.8s
  window), so the push-in keeps blending toward a boss the player is no
  longer approaching. Same bug family as the already-fixed "boss-intro
  push-in bleeding into the next level" (see `CHANGELOG.md`'s Unreleased
  section), just not covered for the room-backtrack case. Low severity,
  purely cosmetic/disorienting, not blocking.

- Not investigated further, flagged for awareness: the boss's hover
  height (`y: 9.5` at spawn, per `beat-13-gumoi.js:210`) vs. its
  `STRIKE_Y = 2.0` descent-to-attack height (`roster.js:1064`), a ~7.5-unit
  mismatch that may itself cause reachability problems in the fight
  independent of the collision bug in Finding 2. Worth re-checking once
  Finding 2 is fixed and the terraces are actually climbable, to confirm the
  fight is winnable at whatever height the player ends up fighting from.

---

## What the original 2026-07-19 audit did NOT do

Per explicit instruction, this was a read-only sweep. No game or renderer
code was changed and no fixes were applied. Findings 1 and 2 are
derived from static reading of the source (with grep sweeps to check whether
each bug class recurs elsewhere), not from a live playtest or a headless
probe. Finding 3 is derived from official live sources checked on 2026-07-19
and cross-checked against the actual pipeline and installed package. Final
verification reran both test commands on the refreshed worktree:
`npm run test:unit` passed 560/560 and `npm test` passed 1140/1140. That suite
does not catch Findings 1 or 2:
there is no test that walks the
player to an unearned dungeon entrance and checks it's blocked, and no test
that attempts to reach the witnesscrown terraces via normal movement.
The renderer-hygiene items in Finding 3 have no focused regression coverage
yet. GTAO and shader prewarming remain optional, measured improvements.

## Open work record, refreshed 2026-07-20

Do not rely on a prior session's transient task numbers. The repository
documents are the durable record. The implementation work remains open:

1. Add a normal-physics browser test that climbs the GUMOI terraces, reaches
   the boss, survives a room exit during focus, and confirms melee alignment.
2. Repair the Abyss presentation until all nine failing luminance samples are
   back inside the 35-75 certification band.
3. Update `world-e2e` to assert the new visual-only grapple-post contract
   instead of requiring the posts to block planar movement.
4. Make the three.js version declaration and vendored runtime policy exact.
5. Add a forced-no-WebGL2 browser test for the compatibility message.
6. Perform and record a fresh shadow visual review with `PCFShadowMap`.
7. Measure shader prewarming after new material families exist.
8. Consider Ultra-only WebGL `GTAOPass` after the higher-impact visual work.

`AUDIT-progression-and-geometryv2.md` defines the complete sequence,
acceptance gates and reconstruction scope. Several Priority 0 items are now
implemented, but the reconstruction as a whole is not complete.

## Relevant existing tests (for whoever picks up the fix)

- `tests/game/boss-grammar.spec.mjs`, `tests/boss-quality-e2e.spec.mjs`,
  `tests/boss-combat-e2e.spec.mjs`, boss behavior, unaffected by either
  finding, should stay green.
- `tests/world-e2e.spec.mjs`, `tests/locked-doors-e2e.spec.mjs`, world/door
  traversal; a new gating test almost certainly belongs near
  `locked-doors-e2e.spec.mjs`'s pattern (walk a real physics body at a door,
  assert the outcome), extended to overworld dungeon entrances specifically.
- No existing spec walks the `witnesscrown` terraces; a new one should
  assert the player can actually reach a point near the boss via normal
  movement once Finding 2 is fixed.
