# Key.md — data-dictionary source of truth

Every canonical string ID, dictionary key, enum-like value, and persisted
save field used across Sovereign Scar, gathered in one place. This exists so
a mismatch like the one in
[AUDIT-progression-and-geometry.md](AUDIT-progression-and-geometry.md)
Finding 1 (three different places checking beat-unlock state, only two of
which agreed) is something you can check against a single doc instead of
grepping five files. **Read-only reference — nothing here was changed to
produce this doc; if code and doc disagree, the code is right and this
needs a follow-up edit.**

Last verified against source: 2026-07-19.

---

## 1. Save schema — `sovereignProgress`

Persisted via `src/engine/settings.js`'s `getProgress()/setProgress()`
(frozen engine) under the top-level localStorage key `vsbeu.progress`, as
the nested field `sovereignProgress`. Owning module:
[src/game/kernel/progress.js](src/game/kernel/progress.js).

### First-class fields (present in `DEFAULT_SOVEREIGN()`, always defined)

| Key | Type | Default | Notes |
|---|---|---|---|
| `version` | number | `2` | v1→v2 migration in `migrateToV2()` fills the fields below marked *(v2)* |
| `currentBeat` | beat id string | `'overworld'` | Also (incorrectly, per audit Finding 1) treated by `ui/menu.js:46` as sufficient to unlock a beat in the Beat Select menu |
| `unlockedBeats` | string[] of beat ids | `['overworld', 'beat-01-crypt', 'sandbox-combat']` | The actual unlock list; see §3 for valid beat ids |
| `inventory` | `Inventory.toJSON()` shape or `null` | `null` | See §6 |
| `hp` | number | `6` | |
| `maxHp` | number | `6` | |
| `playTime` | number (seconds) | `0` | |
| `deaths` | number | `0` | |
| `bossesDefeated` | string[] of boss ids | `[]` | See §4 for valid boss ids |
| `mood` | `'crust' \| 'abyss'` | `'crust'` | See §8 |
| `dungeons` | `{ [dungeonId]: DungeonState }` | `{}` | *(v2)* — see §2 |
| `overworld` | `{ pos, state, visited }` | `{ pos: null, state: 'crust', visited: [] }` | *(v2)* |

### Lazily-created fields (NOT in `DEFAULT_SOVEREIGN()` — always read with `|| {}`)

These are real, load-bearing save fields, but they don't exist until the
first write, and nothing seeds them at migration time. Any new code reading
them must guard exactly like the existing call sites do — do not assume
they exist:

| Key | Type | First write site | Read pattern used everywhere else |
|---|---|---|---|
| `settings` | `{ masterVol, sfxVol, musicVol, reduceShake, reduceFlash, showTimer, quality }` | `persistSetting()` in `src/game/index.js:275-278` | `loadSovereignProgress().settings \|\| {}` |
| `upgrades` | `{ [upgradeId]: level }` | purchase handler in `src/game/index.js:404-408` | `loadSovereignProgress().upgrades \|\| {}` |

**Important gotcha:** `src/engine/settings.js` (frozen engine) ALSO defines
a `SETTING_DEFAULTS` object with keys `difficulty, masterVolume, sfxVolume,
musicVolume, reduceFlashing, reduceMotion, reduceHorrorAudio,
alwaysShowDialogue, keybindings, lastHero` — similar-sounding names,
**different keys, different object, different localStorage key**
(`vsbeu.settings`, not nested under progress at all). This game does **not**
appear to read/write through that object for volume/gfx toggles — it uses
its own `sovereignProgress.settings` bag above instead (`masterVol` vs
`masterVolume`, `reduceFlash` vs `reduceFlashing`, etc. — note the
naming is NOT parallel). Confirm before assuming either one is "the"
settings store; as of this writing the engine's `SETTING_DEFAULTS` object
looks like unused leftover surface from the kit extraction, not dead code
you can delete (frozen dir — don't touch it either way without asking).

---

## 2. Per-dungeon state — `sovereignProgress.dungeons[dungeonId]`

Owning module: [src/game/world/keys.js](src/game/world/keys.js). Keyed by
dungeon id (same string as the beat id, §3).

| Key | Type | Default | Notes |
|---|---|---|---|
| `smallKeys` | number | `0` | |
| `bossKey` | bool | `false` | |
| `opened` | string[] of door keys | `[]` | door key format: `` `${dungeonId}:${roomA}-${roomB}` `` with the room pair **sorted** — see `doorKey()` in `room-graph.js:25-28` |
| `visited` | string[] of room ids | `[]` | |
| `taken` | string[] of pickup ids | `[]` | author-defined per-room, e.g. `'key1'`, `'bosskey'` — no central registry, grep the beat file for `addKeyPickup(` to find them for a given dungeon |
| `mapPickup` | bool | `false` | |

Blocker clear-state (§7) piggybacks on the same `opened` array using the
convention `` `blocker:${blockerId}` `` (see `blockers.js:85` / `keys.js`'s
`isOpen`/`open` — same store, a different key shape, not a separate field).

## `sovereignProgress.overworld`

| Key | Type | Default |
|---|---|---|
| `pos` | `{ world, screen, x, z } \| null` | `null` |
| `state` | `'crust' \| 'abyss'` | `'crust'` |
| `visited` | string[] of screen ids | `[]` |

---

## 3. Beat / level registry

Owning module:
[src/game/levels/registry.js](src/game/levels/registry.js). Every `id` here
is what `unlockedBeats`, `currentBeat`, `bossesDefeated`-adjacent lookups,
`loadLevel()`, and the pause-menu Beat Select all key off of.

| id | name | mood | bossId |
|---|---|---|---|
| `sandbox-combat` | Combat Sandbox | crust | *(none)* |
| `overworld` | The Scarred Crust | crust | *(none)* |
| `beat-01-crypt` | 01 Crypt Breach | crust | `crypt_warden` |
| `beat-02-spindle` | 02 Eastern Spindle | crust | `tri_compiler` |
| `beat-03-sink` | 03 Duval Sink | crust | `sand_spur` |
| `beat-04-sky` | 04 Sky Monument | crust | `kinetic_core` |
| `beat-05-citadel` | 05 Citadel of the Proxy | crust | `proxy` |
| `beat-06-quarry` | 06 Bleeding Quarry | abyss | `obsidian_arachnid` |
| `beat-07-sluice` | 07 Sluice of Tears | abyss | `hydroid_cloud` |
| `beat-08-bone` | 08 Bone Forest | abyss | `skeletal_mantis` |
| `beat-09-town` | 09 Ruined Town | abyss | `phantasm` |
| `beat-10-cryo` | 10 Cryo Vault | abyss | `frost_and_fuel` |
| `beat-11-mire` | 11 Rot Mire | abyss | `sludge_golem` |
| `beat-12-pyre` | 12 Pyre Peak | abyss | `magma_wyrm` |
| `beat-13-gumoi` | 13 GUMOI Tower | abyss | `gumoi_witness` |
| `beat-14-leviathan` | 14 Leviathan Core | abyss | `leviathan` |

Dev-only (`DEV_LEVELS`, never in the player-facing list): `w-test-dungeon`,
`w-test-overworld`.

`getLevel(id)` falls back to `LEVELS[0]` (`sandbox-combat`) for an unknown
id — worth knowing if you're chasing a silent-fallback bug rather than a
thrown error.

---

## 4. Boss roster ids

Owning module: [src/game/bosses/roster.js](src/game/bosses/roster.js) (+
`sand-spur.js` for beat 03). Each boss's `id` field must match the
`bossId` in the beat-registry table above **and** the string passed to
`recordBossDefeat(id)` — these are three independent places that must agree
and nothing enforces it at the type level.

`crypt_warden` (hp 8) · `tri_compiler` · `sand_spur` (hp 14, own file) ·
`kinetic_core` · `proxy` (hp 16) · `obsidian_arachnid` (hp 14) ·
`hydroid_cloud` (hp 15) · `skeletal_mantis` (hp 14) · `phantasm` (hp 12) ·
`frost_and_fuel` (hp 16) · `sludge_golem` (hp 18) · `magma_wyrm` (hp 16) ·
`gumoi_witness` (hp 18) · `leviathan` (hp 28)

The HP figures above are the values **authored in the boss classes**, and are
what you will find by grepping. They are not what the player fights: for beats
05–14, `world/threat-curve.js` overwrites boss HP at bake time from an absolute
per-beat target (the authored 12/14/12/16/… is noise, not a progression), so the
live values run 23 → 54. Phase thresholds are HP *fractions*, so they scale with
it and each fight keeps its shape. Beats 01–04 are passed through untouched.

## 8b. Enemy kinds

Owning module: [src/game/enemy.js](src/game/enemy.js). The `kind` string selects
palette, animation archetype, default AI, and traits; `ai` may override the
default but should not contradict the kind — a lancer that does not lunge is a
reskinned sentinel. `tests/qa/ai-override-audit.mjs` reports contradictions.

| kind | default `ai` | trait | the question it asks |
|---|---|---|---|
| `sentinel` | `chase` | — | baseline |
| `scarab` | `charge` | — | baseline |
| `frost` | `ranged` | — | baseline |
| `bulwark` | `chase` | `frontArmor`, `turnRate` 2.2 | are you willing to move? |
| `mote` | `drift` | `hover` at `flyHeight` 3.4 | can you fight at range? |
| `lancer` | `lunge` | — | which way is sideways? |
| `brood` | `charge` | `split: 2` | did you make space first? |

Authored `hp` in a beat def is a **relative weight within its room**, not an
absolute — `world/threat-curve.js` sets the absolute figure from the beat
number. `turnRate` is `Infinity` for every kind except plated ones.

---

## 5. Weapons — `WEAPONS`

Owning module:
[src/game/combat/weapons.js](src/game/combat/weapons.js). Keys double as
both the dictionary key and each move's own `id` field (kept in sync by
hand — nothing asserts they match).

| id | name | damage | cooldown | notes |
|---|---|---|---|---|
| `bare_strike` | Bare Strike | 0.5 | 0.35 | starting weapon, arc move |
| `anchor_link` | Anchor Link | 1 | 0.28 | salvaged from Crypt Warden, arc move |
| `tectonic_wedge` | Tectonic Wedge | 2 | 0.4 | arc move, `shatter: true` (breaks `wedge_crack` blockers) |
| `heavy_mallet` | Heavy Mallet | 1.5 | 0.5 | arc move, `shatter: true` |
| `light_caster` | Light Caster | 1 | 0.35 | `ray: true`, **no `vertical` field** — see audit Finding 2's note on the GUMOI Witness hit-gate `NaN` accident |
| `phase_boot` | Phase Boot | — | 0.7 | dash-type, not a melee move (`dashSpeed`/`dashDuration`) |
| `magnetic_grapple` | Magnetic Grapple | — | 0.8 | not a melee move (`range`/`pullSpeed`) |

`getWeapon(id)` falls back to `ANCHOR_LINK` for an unknown id (silent
fallback, same caution as `getLevel()` above).

---

## 6. Inventory — `Inventory` (`src/game/kernel/inventory.js`)

`toJSON()` shape (this is what `sovereignProgress.inventory` actually holds):

```js
{
  weapons: string[],        // weapon ids the player owns, from §5
  activeWeapon: string,     // one of the above
  items: { ... },           // see below — booleans
  memoryKeys: { ... },      // see below — booleans
  flags: { [id]: any },     // freeform, set via setFlag/getFlag
  scarShards: number,
}
```

`items` dictionary (all default `false`): `phase_boot`, `tectonic_glove`,
`magnetic_grapple`, `light_caster`, `heavy_mallet`, `tectonic_wedge`,
`vector_staff`. Note `tectonic_glove` and `vector_staff` have **no
corresponding entry in `WEAPONS`** (§5) — they exist only as inventory
flags, presumably narrative/gating items rather than equippable weapons.
`grantItem(id)` auto-adds to the weapons list *only* for
`light_caster`/`heavy_mallet`/`tectonic_wedge` — granting `phase_boot`,
`tectonic_glove`, `magnetic_grapple`, or `vector_staff` sets the item flag
but does **not** call `addWeapon()` (correct for boot/grapple, which aren't
melee weapons — but confirms glove/staff really are non-equippable).

`memoryKeys` dictionary (all default `false`): `spindle`, `sink`, `sky`.
`hasAllMemoryKeys` requires all 3 true (hardcoded `>= 3`, not
`Object.keys(memoryKeys).length` — adding a 4th memory key later would
silently need this changed too).

---

## 7. World-building — room graph, doors, blockers

### Room definition contract (per room, in a beat's dungeon def)

Owning module:
[src/game/world/room-graph.js](src/game/world/room-graph.js). Fields a
room object may define (all optional except `grid`/`half`):

| Key | Shape | Purpose |
|---|---|---|
| `grid` | `[i, j]` | room's position on the world grid; world origin = `(i*64, 0, j*64)` (`ROOM_STRIDE = 64`) |
| `half` | number | half-extent of the room footprint |
| `wallH` | number | wall height (default 4) |
| `floorColor` / `wallColor` | hex | overrides for `buildPerimeterWithDoors`/floor fill |
| `build(map, h)` | fn | **full XZ collision** — walls/pillars/obstacles. See audit Finding 2: anything meant to be climbable must NOT go here |
| `platforms(map, h)` | fn | meshed with `collisionWorld: null` — climbable elevated terrain, no XZ solid registered |
| `boss(ctx, api, origin)` | fn | factory; must call `attachBoss(api, …)` |
| `doors` | array of `{ to, side, at, type }` | see below |
| `blockers` | array of blocker defs | see §7b |
| `enemies` | array | enemy spawn defs |
| `spawn` | `{ x, z }` | local-space entry point offset |
| `onBake(api, origin, ctx)` | fn | fires once when the room's geometry is baked |
| `onEnter(game, room)` | fn | fires every time the player enters |
| `onExit(game, api)` | fn | fires on leaving |
| `onUpdate(dt, game, api)` | fn | per-frame while the room is active |

### Door `type` values

`'open'` (default when `type` omitted) · `'locked'` (needs a small key,
gated via `keyStore.trySpendSmallKey()`) · `'boss'` (needs the boss key,
gated via `keyStore.hasBossKey()`) · `'exit'` (leaves the dungeon entirely —
skipped by the normal door-baking loop).

### Door persistence key format

`doorKey(dungeonId, roomA, roomB)` → `` `${dungeonId}:${[roomA,roomB].sort().join('-')}` ``
— sorted so either room's approach resolves to the same lock state. Stored
in `sovereignProgress.dungeons[dungeonId].opened` (§2).

### 7b. Blockers — `type` values

Owning module: [src/game/world/blockers.js](src/game/world/blockers.js).

| type | requires | build-time effect | runtime effect |
|---|---|---|---|
| `grapple_gap` | `magnetic_grapple` item | carves a floor chasm | falling in = 1 dmg + respawn at near edge; aiming at the far anchor + grapple input pulls across |
| `wedge_crack` | active weapon `=== 'tectonic_wedge'` | destructible plug mesh | only breaks under Tectonic Wedge damage specifically (checks `inventory.activeWeapon`, not just ownership) |
| `boot_ledge` | `phase_boot` item + active dash | 2-high solid barrier | dashing into it while holding `phase_boot` hops to the far side |
| `caster_dark` | active weapon `=== 'light_caster'` | opaque shroud plane | opacity eases toward 0 only while both near AND `light_caster` is the *active* weapon (not just owned) |

Clear-state persists as `` `blocker:${blockerId}` `` in the same `opened`
array doors use (§2) — same key namespace, different prefix convention, not
a separate field.

---

## 8. Mood / palettes

Owning module:
[src/game/assets/palettes.js](src/game/assets/palettes.js). Two moods only:
`'crust'` and `'abyss'` — used for `sovereignProgress.mood`, per-beat `mood`
in the registry (§3), and `MOOD_PRESETS` keys (lighting/fog/bloom/film/
vignette/drone tuning per mood, consumed by the mood-shift system).

**`CRUST_COLORS`** (full — small, and referenced by name across many
level/blocker files, so worth having verbatim): `slate 0x6b7280` ·
`slateDark 0x3f4550` · `limestone 0xe8e0d0` · `clay 0xc4b5a0` ·
`clayDark 0x9a8b78` · `ash 0x9ca3af` · `iron 0x4b5563` · `rust 0x8b5a3c` ·
`goldLeaf 0xd4a84b` · `tombMoss 0x5a6b4a` · `consoleGlow 0x7fe0ff` ·
`bloodStain 0x5c2030` · `floor 0x6a707a` · `wall 0x949aa4` ·
`accent 0xc9b896` · `clayField 0x877b68` · `ashField 0x848b96`

**`ABYSS_COLORS`** (full): `basalt 0x2c2134` · `charcoal 0x1c1622` ·
`violet 0x8b5cf6` · `violetHot 0xc084fc` · `goldVein 0xffd060` ·
`goldHot 0xffe8a0` · `neon 0xff40c8` · `abyssFloor 0x261c30` ·
`abyssWall 0x342644` · `magma 0xff5520` · `ice 0xa0e8ff` ·
`iceDark 0x3a6a8a` · `bone 0xefe6d0` · `rot 0x3d5c34` ·
`rotPale 0x4f6644` · `sludge 0x4a5c28` · `pyre 0xff6a20`

**`HERO_PALETTE`** and **`ENEMY_PALETTES`** (`sentinel`, `scarab`, `frost`,
`bulwark`, `mote`, `lancer`, `brood`) share the same key shape — `skin, skinDark, skinD2, hair, hairDark,
hairLight, belt, beltDark, eyeGlow, freck, beard, beardDark, eyeWhite,
pupil, brow, mouth, teeth` — per-character cosmetic hex values. Not
reproduced in full here (low cross-file collision risk vs. the tables
above); read `palettes.js` directly if you need an exact value.

---

## 9. Graphics quality tiers — `TIERS`

Owning module:
[src/engine/quality.js](src/engine/quality.js) (frozen). Keys:
`'low' | 'med' | 'high' | 'ultra'` (default `'high'`). Each tier is a
`{ pixelRatio, bloom, bloomStrength, shadowMap, env, postExtras, aberration,
reflections }` object — see the audit doc's Finding 3 for the proposed
`ultra`-gated `GTAOPass` addition, not yet implemented.

---

## 10. Menu screens & item types

Owning module: [src/game/ui/menu.js](src/game/ui/menu.js). Screen names
(`MenuState` screen keys): `title`, `pause`, `settings`, `beats`,
`controls`, `altar`, `confirmNew`. Row `type` values used by the renderer:
`action`, `submenu`, `slider`, `toggle`, `select`, `text`.

---

## 10b. Music tracks

Owning modules: [src/game/audio/tracks.js](src/game/audio/tracks.js) (content),
[score.js](src/game/audio/score.js) (playback). A track id is a beat id, an
overworld region name, or one of the four base pieces. `resolveTrack(id)` falls
back to `crust` for anything unknown.

Base pieces: `crust` (A aeolian, 84) · `abyss` (A phrygian, 68) ·
`boss` (D harmonic minor, 132) · `leviathan` (C aeolian, 56).

Variations are keyed by beat id (all 14) and region name (all 8), each
overriding key/mode/tempo and inheriting the rest. Layer gates run
`0 exploring · 1 enemies awake · 2 combat · 3 boss`; **`lead` is gated at 0 on
every track** — a melody hidden behind combat means the player concludes the
game has no music.

`comp` is a sixteen-character strike pattern (same grid as `drums`) saying when
the harmony is *played*. Chords are struck, never held: `chordSustain` sizes
each one from the gap to the next strike, so no chord can run into the one after
it. Where the chords do not play is as composed as where they do — a chord voice
sounding through the whole bar is a drone with a progression in it, which is
what this game shipped before the owner reported hearing exactly that. The
`chords` layer was called `pad` while it was one.

Replaces the old `fx/motifs.js` `{ transpose, pattern }` ratio pairs, which have
been deleted along with their spec — nothing imported them once tracks landed.

## 11. Input actions

Owning module: [src/game/input.js](src/game/input.js). Keyboard (scan
codes, not `e.key`):

| Action | Code(s) |
|---|---|
| Attack | `Space`, `KeyJ` |
| Dash | `ShiftLeft`, `ShiftRight`, `KeyK` |
| Interact | `KeyE`, `KeyF` |
| Weapon cycle | `KeyQ` (-1), `KeyR` (+1) |
| Mood toggle | `KeyM` |
| Pause | `KeyP`, `Escape` |
| Beat next/prev | `BracketRight`/`PageDown`, `BracketLeft`/`PageUp` |
| Grapple | `KeyG` |
| Guard / parry | `Mouse2` (right button), `KeyL` |
| Lock-on toggle | `KeyT` |
| Lock-on cycle target | `KeyY` |
| Story advance | `Enter`, `NumpadEnter` |
| Mute | `KeyN` |
| Map toggle | `Tab` |
| Dev toggle | `Ctrl+Shift+KeyD` |
| Dev keys | `F1`, `Shift+F1`, `F2`, `F3`, `F10`, `Backquote`, `KeyH` |
| Movement | `KeyW`/`ArrowUp`, `KeyS`/`ArrowDown`, `KeyA`/`ArrowLeft`, `KeyD`/`ArrowRight` |

Gamepad (standard mapping, button indices): `0` attack, `1` dash, `2`
interact, `3` grapple, `4`/`5` weapon cycle, `6` (LT) lock-on, `7` (RT) guard —
read as a *held* analog value, not an edge — `8` map, `9` pause, `10` (L3)
cycle lock-on target, `12`/`13`/`14`/`15` d-pad (mood-toggle + synthesized
menu-nav codes). **Mute is keyboard-only**: it gave up button `6` to the
defensive verbs, because it is a settings toggle rather than something reached
for mid-fight.

---

## Maintenance note

This doc is hand-curated, not generated — nothing keeps it in sync with the
code automatically. If you add/rename/remove a save field, beat, boss id,
weapon, upgrade, door type, blocker type, quality tier, or input binding,
update the matching table here in the same commit. Treat a stale entry here
as worse than no entry — cross-check against source before trusting a row
you didn't just verify yourself.
