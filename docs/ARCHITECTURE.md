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
       ├─ combat/               sweeper, weapons, grapple, guard/parry, lock-on
       ├─ world/                room graph, keys, blockers, altar, destructible,
       │                        gears, fluid, frustum, light lines, threat curve
       ├─ overworld/            7×7 world builder + screens (screens-as-rooms)
       ├─ dev/                  dev mode: gate, panel, overlays, hit geometry
       ├─ fx/ + render/         mood, motifs, phase-shift, flicker, wrap
       ├─ assets/               palettes + procedural props
       ├─ levels/               overworld + sandbox + 14 dungeon defs + registry
       ├─ bosses/               BossBase + 14 multi-phase bosses + attachBoss
       └─ ui/                   HUD (boss bar), StoryPanel, map screen, ending,
                                coach (one-shot hint bus)
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

## Combat contract

**One damage entry point.** `HealthPool.damage(amount, iFrameTime, source, meta)`
carries a `meta.from` world position and `meta.attacker` for *every* hostile hit,
including boss attacks (`BossBase.hitPlayer`) and projectiles. Anything that
wraps it must forward all arguments — `(n, iframes) => orig(n, iframes)` silently
disarmed the guard in the live game while every unit test passed.

- `health.damageFilter` is the single interception hook. `GuardController.resolve`
  returns `null` (pass through), a negation (`{ negated, parried }`), or a
  reduction (`{ amount, iFrameTime }`). Directionless damage cannot be guarded:
  `inGuardArc` returns **false** when `from` is unknown, because a shield does
  not protect against a pit.
- **Directional armour** is defender-side, in `combat-sweeper.applyHit`:
  `defender.armorUp && inFrontArc(defender, attacker)` refuses the hit outright.
  No weapon bypasses it — the lesson is positioning, not loadout.
- **Reachability is part of the contract.** An enemy that can gate damage must
  turn at a finite `turnRate`, or its armoured cone tracks its attacker and the
  counterplay becomes geometrically impossible. `Enemy._separateFrom` guarantees
  a non-zero bearing exists at all, since every directional rule degenerates at
  zero separation.
- **`stagger()` is the universal answer.** A parry undoes whatever makes an enemy
  hard to hit: plates drop, hovering enemies are grounded. One rule, so no kind
  becomes unkillable because the player skipped an item.

## Audio

Two layers, both game-side. The frozen kit's `audio/synth.js` keeps its generic
primitives (`playTone`, `playNoise`, `playDrone`) and gains exactly one additive
export, `channelGain(channel)` (SS-027), so game code can build persistent buses
that honour the same volume settings.

```
src/game/audio/
  theory.js       keys, modes, scale degrees, chords, voice leading  (pure, no Web Audio)
  instruments.js  nine synth voices, all scheduled at an absolute `when`
  tracks.js       the compositions: 4 base pieces + 22 variations
  score.js        lookahead sequencer, effect buses, adaptive layering
  sfx-bank.js     30 game-specific sounds over a shared short-reverb bus
```

- **Timing never comes from the render loop.** Every frame the sequencer looks
  ~200 ms ahead and schedules each sixteenth at its exact AudioContext time.
  The previous bed advanced by `dt`, so its rhythm was quantised to the frame
  rate and a GPU hitch was a stumble. Music is the one system that cannot
  borrow the renderer's clock.
- **A track is a key, a mode, a tempo, a progression and a melody**, not a
  frequency ratio. Melodies are written as scale degrees, so a variation
  transposes in tune for free.
- **Voice leading must be re-centred.** Leading alone drifts: each chord goes
  wherever is nearest the last, so a descending progression steps down forever.
  `theory.recenter` shifts by whole octaves — harmony-preserving — to keep the
  chords in register.
- **Nothing sustains.** No voice may still be sounding when its next
  articulation arrives, and nothing at all runs underneath the score. This is
  the difference between a soundtrack and a hum, and it has been got wrong here
  three separate ways: a mood oscillator started outside the score engine
  entirely, a chord voice holding 105% of a bar so every chord overlapped the
  next, and a reverb return hot enough to fill the gaps back in. All three are
  now structural — `VOICE_SUSTAIN` / `chordSustain` derive note length from the
  gap to the next strike, `MOOD_PRESETS` carries no drone data to revive, and
  `tests/game/music.spec.mjs` fails on any of it returning.
- **The music is measured, not described.** `score.renderOffline` renders the
  real scheduler through the real voices into an `OfflineAudioContext`, and
  `tests/audio-render-e2e.spec.mjs` asserts the signal falls to near-silence
  between notes. Analyser RMS proves audio *exists*; reading the score back as
  note names (`tests/qa/score-readout.mjs`) proves it is *music*; only the
  rendered envelope (`tests/qa/audio-envelope.mjs`) proves there is nothing
  droning underneath it. All three questions are different.
- **Intensity fades layers, it does not switch tracks.** Derived from the live
  scene (boss present, enemies near) so it decays on its own when a room
  clears.
- **Sounds that mean different things must not share a voice.** Blocked,
  armoured, wounded and killed are four outcomes and four sounds; a parry is
  deliberately the loudest thing in the bank.

## Game-feel visuals

Three systems the player previously could not see:

| module | what it fixes |
|---|---|
| `assets/weapon-models.js` + `fx/held-weapon.js` | all five weapons looked like an empty fist. Models parent to the rig's `armR` pivot, inheriting every swing the animator drives |
| `fx/grapple-rope.js` | the grapple had no rope, hook or anchor markers — press G and you were elsewhere, with nothing explaining a failed pull |
| `assets/pickup-shapes.js` | every pickup was the same octahedron in a different colour, which survives neither the Abyss grade, nor bloom, nor a colour-blind player |

Pickup shape is chosen from `reward.type` first (Z7 made it data); label
sniffing is only a fallback for pickups that predate it, kept in step with the
identical fallback room-graph uses for scoring.

## Threat curve

`world/threat-curve.js` is the single lever for campaign difficulty, applied in
`room-graph.bakeRoom` (enemies) and immediately after the boss factory
(`applyBossCurve`). Authored HP in a beat def is a **relative weight within its
room**; the curve sets the absolute figure from the beat number, because player
weapon damage triples over the campaign while authored HP does not move.

- Beats 1–4 pass through untouched — tuned against a 1-damage weapon.
- Beat 05 is deliberately the softest point of the back half: it grants the
  Tectonic Wedge, and a new weapon has to *feel* like one.
- Boss authored HP is discarded rather than kept as a weight (12/14/12/16/… is
  noise, not a progression). Phase thresholds are HP *fractions*, so scaling
  moves the boundaries with it and a fight keeps its shape.
- Measured in **landed hits**, not HP, because that is the unit that decides
  whether an enemy's behaviour has time to happen at all.

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
