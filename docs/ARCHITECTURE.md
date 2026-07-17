# Sovereign Scar — Architecture

## Rule

> All gameplay lives in `src/game/`. Engine trees are frozen except SS-027 (`playDrone` family in `src/audio/synth.js`).

## Layers

```
index.html
  └─ src/game/index.js          boot, level lifecycle, RAF loop
       ├─ player / input / camera-rig / HUD
       ├─ kernel/               health, inventory, progress
       ├─ physics/              VoxelPhysicsBody (Y) + friction
       ├─ combat/               sweeper, weapons, grapple
       ├─ world/                room graph, keys, blockers, altar, destructible,
       │                        gears, fluid, frustum, light lines
       ├─ overworld/            7×7 world builder + screens (screens-as-rooms)
       ├─ dev/                  dev mode: gate, panel, overlays, hit geometry
       ├─ fx/ + render/         mood, motifs, phase-shift, flicker, wrap
       ├─ assets/               palettes + procedural props
       ├─ levels/               overworld + sandbox + 14 dungeon defs + registry
       ├─ bosses/               BossBase + 14 multi-phase bosses + attachBoss
       └─ ui/                   HUD (boss bar), StoryPanel, map screen, ending
src/engine|voxel|combat|audio|characters  FROZEN kit (My-Engine 0.2.0)
  audio/synth.js also owns music beds (startMusicBed / updateMusicBed)
```

## Boss contract

Every beat boss implements combat fields (`root`, `hitRadius`, `hp`, `state`, `onHit`, `onDeath`) and is registered with `attachBoss(level, boss, { nextBeat, toast, onDefeat, defeatStory })`.

- `managedBySystem = true` prevents double-update in the level shell
- Phase thresholds (e.g. `[0.66, 0.33]`) fire `onPhaseChange`
- Telegraphs: `boss.telegraphAt(x, z, radius, life, color)`
- Defeat is single-fire: records `bossesDefeated`, unlocks next beat, queues
  the SYSTEM line + optional `defeatStory` lines
- `boss.home` = arena anchor captured at construction — all orbit/patrol math
  offsets from it, never from the world origin
- Wake gate: outside 40 units of `boss.home` the boss still animates but is
  passed `player: null` (every targeting path guards on it) — prebaked bosses
  can't snipe across the dungeon

## Physics split

| Concern | Owner |
|---|---|
| XZ walls + slide | `CollisionWorld` (engine) |
| Y gravity, fall damage, friction | `VoxelPhysicsBody` (game) |
| Map occupancy | Level `getVoxelAt` from voxel Map |

## Destructibles

- Small **island** meshes only (D1 / SS-032)
- Map is truth; geometry re-baked on shatter
- Solids registered per XZ column with stable ids

## World architecture (Phase W)

A dungeon is still **one registry entry**; its level object manages rooms
internally (`src/game/world/room-graph.js`):

- Room `(i, j)` lives at world origin `(i·64, 0, j·64)` (`ROOM_STRIDE`).
- Only current (+transition-target) rooms are baked; distance-2 rooms are
  disposed (boss room sticky; `def.prebake` keeps everything — used by real
  dungeons so the boss exists at load).
- Doors: `{ to, side, at, width, type: open|locked|boss|exit }`. Locked/boss
  doors are voxel plugs removed on unlock; `exit` hands off via `def.onExit`.
- Transitions: IDLE → SLIDING (0.35 s, player pinned at the far door, camera
  bounds lerp — `CameraRig.setBounds` clamps a lerped look-at).
- `validateDungeonDef(def)` — pure BFS with key economy; every dungeon def is
  structurally tested in `tests/game/world-graph.spec.mjs`.

The **overworld** (`src/game/overworld/`) reuses the same machinery: a screen
is a room with partial borders modeled as wide edge doors. Entrance arches
load dungeons (position saved for the return trip); the monolith swap rebuilds
the current screen in the other mirror state after a 1.5 s mood ramp.

**Keys** (`src/game/world/keys.js`): per-dungeon
`{smallKeys, bossKey, opened[], visited[], taken[], mapPickup}` persisted under
`sovereignProgress.dungeons[id]`; overworld `{pos, state, visited}` under
`sovereignProgress.overworld`. `makeKeyStore(id)` is the write-through cached
adapter levels use.

**Blockers** (`src/game/world/blockers.js`): `grapple_gap`, `wedge_crack`,
`boot_ledge`, `caster_dark` — each a build-time map edit + a runtime, declared
per room/screen via `blockers: []`. Note: collision is 2-D, so `boot_ledge`
is a hop-**over**, never a stand-on-top.

**Map** (`ui/map-screen.js`): Tab overlay fed by `level.mapData()`.

## Progress

Nested under engine settings (`version: 2` since Phase W; v1 saves migrate
one-shot in `kernel/progress.js`):

```js
getProgress().sovereignProgress = {
  version, currentBeat, unlockedBeats, inventory, hp, maxHp, playTime, deaths,
  bossesDefeated, mood, settings, upgrades, lastRun, campaignComplete,
  dungeons: { [id]: { smallKeys, bossKey, opened, visited, taken, mapPickup } },
  overworld: { pos: { world, screen, x, z }, state, visited },
}
```

## Post stack

Custom passes **must** sit before `outputPass`:

`Render → Bloom → Vignette → RGB → Film → SMAA → Flicker → Wrap → Output`
