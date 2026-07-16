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
       ├─ world/                destructible, gears, fluid, frustum, light lines
       ├─ fx/ + render/         mood, phase-shift, flicker, wrap
       ├─ assets/               palettes + procedural props
       ├─ levels/               15 loaders + registry
       ├─ bosses/               BossBase + 14 multi-phase bosses + attachBoss
       └─ ui/                   HUD (boss bar) + StoryPanel
src/engine|voxel|combat|audio|characters  FROZEN kit (My-Engine 0.2.0)
  audio/synth.js also owns music beds (startMusicBed / updateMusicBed)
```

## Boss contract

Every beat boss implements combat fields (`root`, `hitRadius`, `hp`, `state`, `onHit`, `onDeath`) and is registered with `attachBoss(level, boss, { nextBeat, toast, onDefeat })`.

- `managedBySystem = true` prevents double-update in the level shell
- Phase thresholds (e.g. `[0.66, 0.33]`) fire `onPhaseChange`
- Telegraphs: `boss.telegraphAt(x, z, radius, life, color)`
- Defeat is single-fire: records `bossesDefeated`, unlocks next beat, optional story line

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

## Progress

Nested under engine settings:

```js
getProgress().sovereignProgress = {
  currentBeat, unlockedBeats, inventory, hp, playTime, deaths, bossesDefeated, mood
}
```

## Post stack

Custom passes **must** sit before `outputPass`:

`Render → Bloom → Vignette → RGB → Film → SMAA → Flicker → Wrap → Output`
