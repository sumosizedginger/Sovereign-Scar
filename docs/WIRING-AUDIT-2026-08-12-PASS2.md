# Wiring audit, second pass — 2026-08-12

Pass 1 checked **modules**: what imports what, which files nobody loads. This
pass checks **content**: authored data no code reads, and code reading data
nobody authors. Different net, different fish.

Two real findings, both in the same shape — *a thing the player is handed that
does nothing* — plus one more instrument caught lying about the game's own size.
Everything else came back clean, and the clean bills are listed too, because
"we checked and it's fine" is worth as much as a finding when the next person
is deciding where to look.

Every candidate was hand-verified. The scanners lied twice more this pass
(sections F). One finding was proved in the running game, not by reading.

---

## A. The Pyre hands you a reward that grants nothing — PROVEN IN GAME

`beat-12-pyre.js:136` places a pickup labelled **Vector Staff**. Picking it up
toasts *"Vector Staff and Line Caster — light lines now hold"* and runs four
statements. Here is what each one actually does:

| statement | effect |
|---|---|
| `grantItem('vector_staff')` | sets `items.vector_staff = true` — **nothing anywhere calls `hasItem('vector_staff')`** |
| `grantItem('line_caster')` | `line_caster` is not in the items map and not in `grantItem`'s weapon whitelist, so it sets one flag — **which nothing reads**. No weapon. No `ITEM_HINTS` line, so no coach tip either. |
| `hud.toast(…)` | works |
| `markProgress('item_acquired', 'line_caster')` | `markProgress(_event, _detail)` — **both parameters are underscore-prefixed and unused**. It resets an idle timer. |

And the ability it is named for does not check it. `level.onEnter` patches
`player.tryAttack` to fire a light line whenever
`inventory.activeWeapon === 'light_caster'` — no staff test anywhere in the
file, the system, or the engine.

**Verified by running the game**, not by reading it: load beat-12, grant only
the Light Caster, never touch the pickup, swing once.

```
hasStaff:          false
hasLineCaster:     false
lines before:      0
lines after:       1     ← the mechanic fires with no staff and no line caster
```

So the twelfth dungeon's named reward is decorative, and the mechanic it
advertises is already on. `level.lightLines` is assigned and read by nothing,
which is the same fact from the other end.

**Not fixed here** — which of these it should be is a design call:
1. gate the light line on `hasItem('vector_staff')` (makes the pickup a reward);
2. drop the pickup and let the Light Caster do this in the Pyre by rule;
3. keep both and delete the phantom `line_caster` so the toast stops naming
   something that does not exist.

`line_caster` should go regardless — it is an id with no item, no weapon, no
hint and no reader, and it is one letter from the real `light_caster`, which is
how it got here.

## B. The density probe was reporting on seven of nine enemy types — FIXED HERE

`tests/qa/content-density.mjs:86` held a hardcoded roster:

```js
const KINDS = ['sentinel','scarab','frost','bulwark','mote','lancer','brood'];
```

The game has **nine**. The `weaver` and the `censer` ship with palettes, bodies,
AI branches, held props and six authored spawns across beats 07, 09, 11, 12, 13
and 14 — and this matrix has never once mentioned them. It also printed a
coverage *percentage* against that short grid, which is the number most likely
to end up in a content plan:

```
before   37 of 42 cells authored (88%)      ← two rows missing from the grid
after    39 of 54 cells authored (72%)
```

**And the same drift was already found and fixed one file over.** The comment in
`tests/game/bestiary.spec.mjs` says so in as many words: its own hardcoded seven
was replaced with a derivation "when the weaver and censer were later added to
three data tables and six beat files". The spec was swept; the probe was not.
This project's most expensive recurring bug, arriving on schedule.

Fixed by deriving from `ENEMY_PALETTES` — the thing `createActorRig` actually
builds a kind from — so a tenth kind appears here without anyone remembering.
Guarded by three new assertions in `bestiary.spec.mjs` that pin the palette list
against the kinds the campaign really spawns; putting the hardcoded seven back
fails two of them.

**The content fact this exposed**, invisible until now: the weaver and the
censer are each authored exactly three times, and **only ever on default AI**.
Seven kinds get five behaviours between them; two get one. That is a third of
the bestiary running at a third of its depth.

## C. Dead schema and dead flags

- **`tectonic_glove`** — declared in `Inventory`'s items map and appearing
  **exactly once in the entire repository**: that declaration. Never granted,
  never checked, no hint, no weapon. A slot for an item that was never built.
- **`gumoi_sigil`** — set by beat-13 (`setFlag('gumoi_sigil', true)`), read by
  nothing. Beat 13 marks an achievement no one asks about.

## D. A consistency wrinkle, working but fragile

Five real items — `resonance_fork`, `entropy_dust`, `cipher_lens`,
`reflector_plate`, `deep_pull_coil` — are granted and checked but are **not keys
in the inventory's `items` map**. They work only because `hasItem` falls through
to the flags bag:

```js
hasItem(id) {
    if (this.items[id]) return true;
    if (this.weapons.includes(id)) return true;
    return !!this.flags[id];          // ← five real items live here
}
```

Nothing is broken. But `items` reads as the canonical list of what a player can
own, and five of the things they can own are not on it — including the
Resonance Fork, which gates Altar Travel. Anyone reasoning from that map will
reason wrong, exactly as this audit's first scanner did.

## E. Clean bills — checked, sound, skip these next time

- **All 110 spec files are registered and run.** None orphaned, none listed but
  missing. (This was the highest-value thing pass 1 never looked at: a spec that
  is not imported by `run-all.mjs` is a test suite lying by omission.)
- **All 34 sound effects wired.** Every `gsfx.x()` call site resolves to a real
  method, and every method on the bank is called. Verified by importing the real
  module, not by parsing it.
- **All 11 score events awarded.** `enemy`/`elite` fire through a ternary,
  `secret` through `scoreType` on pickups — all three of my "never awarded"
  candidates were scanner error.
- **Every level-authoring call has a provider.** `level.flicker`, `level.wrap`,
  `level.musicBed`, `addPickup`, `addSystem`, `addEnemy`, `addDummy`,
  `onEnter`, `story`, `suppressBossIntro` — all consumed. Only
  `level.lightLines` is written and never read (section A).
- **The desktop build packages everything the game loads.** `build.files` covers
  `src/**`, and every `assets/` import in the game resolves to `src/game/assets/`.
  The top-level `assets/` folder holds only the five orphaned screenshots.
- **Every enemy kind and AI authored in a level is implemented**, and every AI
  implemented is reachable through the kind→AI default map.
- **`mirror_free`** — flagged by the scanner as write-only; it is read in
  `overworld.js:339` through optional chaining the regex could not see.
- **`buoyancy_mesh`** — flagged as unreachable; it is granted through the altar
  `buyItem` path with a variable id.

## F. Two more scanner lies, for the record

3 and 4 were pass 1's. Continuing the count:

5. The sfx cross-check's method parser read the bank as **7 methods** (it caught
   the weapon-name keys and missed every `export function`), and confidently
   reported **34 missing sound effects**. A game missing 34 sounds would be
   audibly broken and the audio E2E would fail. Re-done by importing the module:
   zero missing.
6. Shell-quoted `node -e` mangled the escaping in the level-API scan, so it
   declared `level.addPickup`, `level.story` and `ctx.scene` unprovided —
   things the game plainly uses on every frame.

The standing rule that caught both: **if a scanner says something load-bearing
is broken, the game would be visibly broken too. When it isn't, suspect the
scanner first.**
