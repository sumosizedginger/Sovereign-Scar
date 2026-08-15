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

---

## Static analysis

Two gates, both cheap, both correctness-only.

| command | what it is |
|---|---|
| `npm run lint` | ESLint (`eslint.config.js`). Undefined identifiers, unreachable code, duplicate object keys, duplicate switch cases, constant conditions, self-comparison, dead private fields, unused variables and imports. **No formatting, no style rules.** Every rule turned off is turned off with a written reason in the config. |
| `npm run typecheck` | TypeScript `checkJs` (`tsconfig.json`). Emits nothing; there is no `.ts` in the product and no build step. |

**The type boundary is four trees, not the whole game.** Only files under
`src/game/kernel/`, `src/game/world/`, `src/game/combat/` and
`src/game/physics/` carry `// @ts-check` and are analysed — the save schema, the
key economy and room graph, the damage entry point, and the body that decides
where the player may stand. That is where this project's bugs have actually
lived. Everything else — `index.js`, `player.js`, `enemy.js`, the boss roster,
all of `fx/`, `ui/`, `render/`, `assets/` and `levels/` — gets **no type
analysis at all**, and the frozen kit trees are excluded by policy.

`tests/game/typecheck-boundary.spec.mjs` reads `tsconfig.json`, walks those four
trees, and fails if any file has lost its pragma or if `checkJs` gets flipped on
(which would silently make `include` meaningless, since TypeScript checks
everything the included files import). Expanding the boundary is: add a tree to
`include`, add the pragma, fix what `tsc` says. Adding `@ts-ignore` instead is
explicitly not the move.

## Test process hygiene

Every spec runs in **one Node process**, in order, with no isolation. That has
cost this project real time — three specs once installed a fake global
`document` and never removed it, defeating `typeof document === 'undefined'`
guards in production code for every spec that ran afterwards. All three passed
alone; the suite crashed in a fourth.

`runNamed` / `runNamedAsync` in `tests/run-all.mjs` now wrap every spec:

- a spec that **throws** is recorded as a failing assertion and the run
  continues, instead of killing `main()` and losing every spec after it;
- a spec that **dirties the shared surface** fails, in its own name — global
  names added or removed, `process.env` keys, a replaced `Math.random` /
  `Date.now` / `console.*` / `JSON.*`, a mutated `Object.prototype` or
  `Array.prototype`;
- both run in a `finally`, so a spec that throws while holding a global reports
  both problems rather than only the first.

**What it does not see:** module-level singleton state — the coach's spoken set,
the score engine's current track, saved progress. Those live inside modules, not
on any shared object, and no general fingerprint can reach them. That gap is
real and `REVIEW.md` §4.4 says so.

## Two containers, one game

```
                    canonical source
                    index.html + src/ + lib/
                             │
             ┌───────────────┴───────────────┐
       GitHub Pages                      Electron
   dist-pages/ over HTTPS          loopback HTTP in a window
   /Sovereign-Scar/                 OS-assigned port
```

There is no web-specific and no desktop-specific gameplay code, and no second
copy of the game in a `docs/` folder. The rules that keep it that way:

- **Every runtime path is relative.** The import map is `./lib/three/…`, the
  entry is `./src/game/index.js`, and nothing in `src/` writes a leading-slash
  URL, a `localhost`, a port, or a `file://`. A leading slash resolves against
  the *origin* root, which on Pages is somebody else's URL space.
- **No module knows where it is hosted.** The string `/Sovereign-Scar/` appears
  in the deployment scripts and workflows and nowhere in `src/`.
- **The Pages file list is derived, not authored.** `scripts/build-pages.mjs`
  walks the real import graph from the real entry and exports that derivation;
  `tests/game/dual-runtime.spec.mjs` uses the same function to check the
  Electron `build.files` globs cover every file in it. One derivation, two
  consumers — so a new module cannot be shipped to one container and forgotten
  in the other.
- **`.nojekyll` is load-bearing.** GitHub Pages runs Jekyll unless it is
  present, and Jekyll silently drops every path beginning with `_`. Exactly one
  file in the runtime graph starts with one — `src/game/levels/_common.js` —
  and `room-graph.js` reaches it through `encounter-director.js`, so it is on
  the path to loading any level at all.
- **Electron serves rather than `loadFile`s.** `file://` makes Chromium apply
  CORS to every ES-module import; the window would open black. The loopback
  server is `scripts/serve.mjs` — the same one the tests use.

`scripts/validate-pages.mjs` checks the staged artifact's shape.
`tests/pages-smoke-e2e.spec.mjs` serves it under a `/Sovereign-Scar/` prefix,
404s and *records* anything requested outside that prefix, and drives a real
browser through boot → dungeon load → save → reload.

---

## The two large files, deliberately left large

`src/game/index.js` (~2,100 lines) and `src/game/enemy.js` (~1,900 lines) were
audited for decomposition. Almost nothing came out, and this section is the
record of why — so the next reader does not have to re-derive it, and so
"someone should split these up" stops being a free opinion.

The test applied to every candidate: **does the extraction move state, or only
move code?** Moving code that still reaches into another object's mutable fields
does not create a boundary; it creates the appearance of one, which is worse,
because the next person trusts it.

### `enemy.js` — one class, 38 methods, one bag of state

| candidate seam | verdict |
|---|---|
| **AI behaviour families** (`_aiLunge`, `_aiDrift`, `_aiWeave`, `_aiCenser`, `_aiChase`, `_aiCharge`, `_aiRanged`, ~300 lines) | **Rejected.** Each reads and writes a dozen fields of `this` — `_windupT`, `attackCd`, `_denied`, `_pressure`, `state.current`, `rig.position`, `facing`. As free functions taking `(enemy, dt, player, …)` they would mutate another object's privates from outside. Same coupling, further away, and now it *looks* modular. |
| **Projectiles** (`_spawnProjectile`, `_updateProjectiles`, `_reflect`, `_clearProjectiles`) | **Rejected, but it is the closest call.** It does own a self-contained list with its own lifetime. It also resolves damage against the player and consults guard state to decide a reflect, so the boundary would carry combat rules across it — and a new wire between a producer and a consumer is this repository's single most expensive recurring defect (`REVIEW.md` §5). Not worth paying that to make one file shorter. |
| **Webs** (`_spawnWeb`, `_tickWebs`, `_clearWebs`) | **Rejected**, same shape as projectiles and a third the size. |
| **Ground and placement** (`_groundAt`, `_standingY`, `_move`, `seatOnGround`, `_followGround`, `_clampToRoom`) | **Rejected.** These are the enemy's answer to "where may my body be", and the whole file's correctness depends on them agreeing with each other. Splitting them is how two answers to one question appear — the exact bug removed from `voxel-physics-body.js` this pass. |
| **Nine archetypes → nine subclasses** | **Rejected outright.** The archetypes differ by a data table and a switch in `defaultAi`, not by structure. Nine classes to express nine strings is abstraction for its own sake, and it would make "what does a censer do differently" require reading nine files. |
| **The constant block** (~135 lines of tuning) | **Rejected.** Moving it to `enemy-tuning.js` is a re-export shuffle that separates the numbers from the code that reads them, and several are exported and imported by specs. |

**Nothing was extracted from `enemy.js`.** It is large because it is one entity
with many behaviours, all of which read and write the same mutable state, and
that is a shape where visible orchestration is genuinely safer than distributed
orchestration.

### `index.js` — boot, lifecycle, wiring, frame loop

| candidate seam | verdict |
|---|---|
| **The frame loop** | **Rejected, on principle.** Update order *is* gameplay behaviour here, and the file documents why: `hud.setMenuOpen` and `input.setUiCapture` are at the top of the frame, above every `consume*`, because a frame late is the whole bug — a menu that closes inside its own listener has already let the closing keypress latch a gameplay verb. Splitting the loop into phases hides that ordering behind call sites. |
| **Boot / singleton construction** (~220 lines) | **Rejected.** The construction *order* is load-bearing — the post-stack passes must be assembled before `outputPass`, and the sequence is documented above. A `boot()` returning a bag of thirty names replaces one readable sequence with a destructure and a function boundary that hides the ordering constraint. |
| **Level lifecycle** (`unloadLevel`, `loadLevel`, `requestLevel`, `activateCampaignServices`, ~220 lines) | **Rejected.** Closes over roughly twenty-five module-scope singletons. Extraction means passing all of them, or passing a context object everything reaches into — which is the same coupling with an extra layer. |
| **Menu and ending wiring** (~350 lines) | **Rejected.** It is one large declarative `MenuOverlay` configuration whose callbacks close over `game`, `player`, `hud`, `menu`, `loadLevel` and progress. The recent `Enter`-eats-a-dialogue-line bug lived precisely in the interaction between this wiring and the frame loop, and was fixed by *ordering*; moving the wiring further from the loop makes that harder to see, not easier. |
| **`finalScorePayload(progress, completed)`** | **Rejected.** Reads as pure, is not — it closes over `witnessScore`, `game` and `SCORE_VERSION`. |
| **`reconstitutionLine(progress, outcome)`** | **PERFORMED.** → `src/game/narrative/reconstitution-copy.js`. |

**The one extraction, and why it was the only one.** `reconstitutionLine` is a
pure function of saved progress — no renderer, no scene, no singleton, no
mutation. It is also narrative content, and it belongs with the narrative code.
It had **no test at all** while it lived in the boot file, because reaching it
meant booting the renderer, starting a run and dying with the right number of
charges left; as a free function it costs ten assertions to pin completely
(`tests/game/reconstitution-copy.spec.mjs`), including the branch where a
pre-lives-system save must read as *plenty* rather than *none*.

That is the shape a justified extraction has here. If a candidate does not look
like that one, the honest answer is to leave it where it is and write down why.
