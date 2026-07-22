# ZeldaLevel — what stands between Sovereign Scar and a 10/10 Zelda-like

**Date:** 2026-07-21
**Scope:** design audit + execution plan. Written after a session of fixing
hand-found gameplay bugs, and grounded in measurements taken from the actual
baked levels, not impressions.

---

## 0. The verdict up front

Sovereign Scar is a **well-built skeleton with almost no play-testing on it**.
Call it **6/10**. The scope is genuinely large — 14 dungeons, a 7×7 overworld in
two mirror states, keys/locks/items/bosses/story/score, zero build step, no
external assets, 21k lines. The engineering discipline is real.

What it does not yet have is the thing that makes a Zelda a Zelda: **hundreds of
small moments that were felt, judged, and tuned by a human**.

The single most damning measurement of this session:

> **1455 automated tests passed while the GUMOI boss room was inescapable.**

The suite proved 188 room transitions *existed*. It never proved a human could
survive one. Every bug found this session — buried boss keys, 18 broken door
landings, arches that acted as walls, platforms that could not be climbed, a
boss floor that blinded the screen, decoration the player kept trying to scale, a
slab that eclipsed a boss fight — was found by **a person walking around**, not
by a test.

That gap is the distance between 6 and 10. It does not close by writing more
tests of the kind already written. It closes by making the *rules of the game*
explicit enough that violating them is a build failure, and by giving the player
a verb set worth practising.

---

## 1. Evidence

### 1.1 Every dungeon is the same dungeon

Baked all 14 beats headlessly and counted their contents:

| beat | rooms | enemies | enemy kinds | gate item |
|---|---|---|---|---|
| 01 crypt | 6 | 4 | sentinel/scarab | — |
| 02 spindle | 8 | 9 | sentinel/scarab/frost | wedge_crack |
| 03 sink | 8 | 9 | scarab/frost/sentinel | boot_ledge/grapple_gap |
| 04 sky | 8 | 9 | sentinel/frost/scarab | grapple_gap/caster_dark |
| 05 citadel | 8 | 9 | sentinel/frost/scarab | wedge_crack |
| 06 quarry | 8 | 8 | scarab/sentinel/frost | caster_dark |
| 07 sluice | 8 | 9 | frost/sentinel/scarab | grapple_gap/boot_ledge |
| 08 bone | 8 | 9 | sentinel/scarab/frost | wedge_crack |
| 09 town | 8 | 9 | sentinel/frost/scarab | caster_dark |
| 10 cryo | 8 | 9 | frost/sentinel/scarab | boot_ledge |
| 11 mire | 8 | 9 | scarab/sentinel/frost | wedge_crack |
| 12 pyre | 8 | 9 | sentinel/frost/scarab | caster_dark |
| 13 gumoi | 8 | 9 | sentinel/scarab/frost | boot_ledge |
| 14 leviathan | 6 | 8 | sentinel/frost/scarab | wedge_crack |

**Totals: 108 rooms, 119 enemies, 3 enemy kinds, 3 AI routines, 4 blocker types.**

Twelve consecutive dungeons with *identical* composition: eight rooms, nine
enemies, the same three archetypes, one gate type. The palette changes. Nothing
else does. A player who has cleared Beat 02 has mechanically cleared Beats 03
through 13; only the wallpaper is new.

Zelda's answer to this is that each dungeon is **built around one idea** —
the hookshot dungeon, the somaria dungeon, the mirror dungeon. The idea is
taught, complicated, combined with combat, then examined by the boss.

### 1.2 The combat verb set has no defensive half

Read from `player.js` / `weapons.js`:

- **Offence:** melee arc (5 weapons), a ray weapon, a shatter property.
- **Mobility:** dash (i-frames floored at 0.3s), grapple.
- **Defence:** *nothing*. There is no shield, no parry, no block.

The enemy layer is actually good here — every hostile action has a windup, a
ground telegraph ring, and resolves against the player's position *at strike
time*, so hits are avoidable and readable (`enemy.js:_beginWindup`). That work
is wasted. A telegraph asks a question; without a defensive verb the only
available answer is "walk away." Zelda's shield is what makes a telegraph a
*conversation*.

The lone exception — `reflector_plate` bouncing projectiles in
`_updateProjectiles` — is passive. It happens *to* you.

### 1.3 There is no lock-on

Facing is derived from the movement vector (`player.js:213`, the LttP model),
with an optional right-stick override. That is correct for 2D Zelda, but this is
a 3D game with a perspective camera at height 17.5. Circling a boss while facing
it is impossible: to strafe you must walk sideways, and walking sideways points
your sword sideways. Every 3D Zelda since Ocarina solved this with Z-targeting on
day one. It is not a luxury feature; it is the thing that makes 3D melee legible.

### 1.4 The camera and the level geometry are in an unresolved argument

The rig sits at **height 17.5, back 6.1**, looking down. The levels keep building
upward. Three separate bugs this session came from this one disagreement:

- Beat 13's arena grew a 10-cell spiral that sat directly between the lens and
  the fight.
- Beat 08's arch lintels hide the player when walking underneath.
- Multiple rooms staged platforms the camera could not see past.

A *Link to the Past* screen is essentially flat. Elevation exists as ledges you
drop off, never as mass between the camera and the player. Until that is a
written rule with a number attached, this class of bug recurs forever.

### 1.5 One traversal verb, and the levels do not respect it

`MAX_STEP_HEIGHT` is exactly one voxel. There is no jump. Yet level code
repeatedly authored two-cell rises — which is what made Beat 13's platforms
scenery — and scattered one-cell decoration everywhere, which is why the player
reported *"constantly trying to climb up the walls."*

Both failures are the same failure: **climbability is invisible.** Nothing about
a surface tells you whether it is a stair or a wall. In Zelda you always know:
stairs are drawn as stairs.

### 1.6 Secrets are uniform

Nearly every secret in the game is a shard cache — *stand here, receive 20–35
shards*. There is no cracked wall, no bombable floor, no "that statue is facing
the wrong way." Uniform rewards train the player to stop looking, which quietly
kills the exploration loop that is the entire point of the genre.

### 1.7 What is genuinely strong

Not padding — these are real and should be protected:

- **The Crust/Abyss mirror.** This is the Light/Dark World, and it is the best
  structural idea in the project. It earns the whole architecture.
- **Enemy telegraphs.** Windup, ring, resolve-at-strike-time. Better than most
  indie action games manage.
- **The frozen-engine boundary.** Genre-neutral core, genre-specific game code.
  Actual discipline, actually held.
- **The luminance certification band.** Sampling rendered rooms and asserting
  they land in a brightness range is an unusual and effective QA instrument — it
  caught two bad boss arenas before the player reached them.
- **Procedural pose-based actor rigs.** The right call at this budget: pose over
  polish.

---

## 2. The plan

Seven tickets, ordered by leverage. Each states the rule it establishes and the
spec that will make violating it a build failure — because the lesson of this
session is that *design intent that is not enforced decays back into bugs*.

### Z1 — The camera contract
**Rule:** no mass in the play space between the lens and the floor. Formally:
within a room's walkable interior, no voxel above `y = 3` may sit over a cell
the player can stand on, except thin verticals (a column footprint of ≤ 4 cells)
which read as pillars rather than roofs.
**Spec:** `camera-contract.spec.mjs` sweeps all 14 beats, computes overhead mass
over walkable cells, and fails on contiguous roofs.

### Z2 — Legible traversal
**Rule:** if a surface can be climbed, it must *look* climbable; if it cannot, it
must not tempt. Every 1-cell rise that is genuinely walkable gets stair
treatment from the dungeon kit (a distinct tread colour + riser); decoration is
raised to ≥ 2 cells so it reads unambiguously as furniture.
**Spec:** `traversal-legibility.spec.mjs` — every climbable 1-cell rise that
borders walkable floor is stair-coloured; no unmarked 1-cell decoration.

### Z3 — The defensive verb (guard + parry)
**Rule:** every telegraph has an answer that is not retreat.
Hold **L / right-mouse** to guard: damage from the guarded arc is reduced and
knockback replaces the hit. Guard has a **0.18s parry window** on press — a hit
absorbed inside it is fully negated, staggers the attacker, and refunds the
window. Guarding drains a poise meter; breaking leaves you open. Implemented as
a `damageFilter` hook on `HealthPool`, so every existing enemy and boss damage
path routes through it without touching frozen code.
**Spec:** `guard.spec.mjs`.

### Z4 — Lock-on
**Rule:** the player can always face what they are fighting.
Press **Tab / R3** to lock the nearest valid hostile within 18 units and line of
sight. While locked, facing tracks the target regardless of movement, so you can
strafe and back away while still pointed at it. Breaks on death, on leaving
range, or on a second press. Feeds the camera's existing `setSecondSubject` for
two-subject framing, and draws a reticle.
**Spec:** `lock-on.spec.mjs`.

### Z5 — A real bestiary
**Rule:** an enemy exists to ask a *different question*.
Three archetypes across fourteen dungeons cannot carry a campaign. Add four,
each of which is a question the new verbs answer:

| kind | question it asks | answer |
|---|---|---|
| **bulwark** | armoured front, telegraphed overhead | parry, or get behind it |
| **mote** | hovers out of melee reach, drifts | ray weapon, or grapple it down |
| **lancer** | long committed thrust down a lane | sidestep with lock-on strafe |
| **brood** | splits into two on death | crowd control, spacing |

Then **redistribute across the 14 beats** so no two dungeons share a roster.

### Z6 — Dungeon pedagogy
**Rule:** every dungeon teaches one idea: **introduce → develop → combine →
test**. Each beat declares a `theme` naming its mechanic and the four rooms that
carry the arc, and the boss must require the mechanic.
**Spec:** `dungeon-pedagogy.spec.mjs` — every beat declares a theme; the teaching
room precedes the first room that requires the mechanic in graph distance from
the entrance; no two adjacent beats share a theme.

### Z7 — Secrets worth finding
**Rule:** a secret rewards *noticing*, and the reward is not always currency.
Replace uniform shard caches with a taxonomy: **heart pieces** (4 = +1 max HP),
**permanent upgrades**, **lore fragments**, and **shortcuts** back to the
entrance. At most half of a dungeon's secrets may be plain currency.
**Spec:** `secret-taxonomy.spec.mjs`.

---

## 3. What this plan cannot fix

Honesty about the boundary of the exercise:

- **Feel.** Whether the dash reads, whether the sword has weight, whether 0.18s
  is the right parry window — these are decided by hands on a controller. I can
  build the mechanism and pick defensible starting numbers. I cannot tune them.
- **Difficulty curve and pacing.** Requires a playthrough. *(Wrong — see §6.3.
  It required a measurement, and the curve turned out to be running backwards.)*
- **Whether the story lands.** Requires a reader.
- **The overworld's memorability.** Region grammars now give eight silhouettes
  that read apart in grayscale, which beats palette-swapped noise. But procedural
  generation cannot produce a landmark you *remember*. A 10/10 overworld is
  hand-placed. That is a content decision, not an engineering one.

---

## 4. Execution log

All seven tickets landed. Suite grew **1455 → 1879**, all green, including the
browser e2e set.

| ticket | status | what shipped |
|---|---|---|
| Z1 camera contract | ✅ | `camera-contract.spec.mjs`; worst overhead cluster **9 → 2** cells |
| Z2 legible traversal | ✅ | `markTraversal()`; **565** climbable rises marked campaign-wide |
| Z3 guard + parry | ✅ | `combat/guard.js`, poise meter, `damageFilter` on `HealthPool` |
| Z4 lock-on | ✅ | `combat/lock-on.js`, ground reticle, camera integration |
| Z5 bestiary | ✅ | 4 new kinds; **14/14 dungeons now have a distinct roster** |
| Z6 dungeon pedagogy | ✅ | `theme` on all 14 beats + in-game teaching hint |
| Z7 secret taxonomy | ✅ | reward became data; 16 sutures = 4 hearts, 4 vials, lore |

### Where the plan was wrong

Three things turned out differently once the code was open. Recording them
because the corrections are more interesting than the plan:

**Z7 was a worse problem than I diagnosed.** I wrote that heart pieces and
Memory Vials didn't exist. They did — fully implemented, persisted, HUD-wired.
What was actually broken is that rewards were dispatched by **string-matching
the display label**: `/cache/i` meant "Scar Suture", and a hard-coded list of
three label strings meant "Memory Vial". Renaming a pickup silently changed
what the player received. I proved it by renaming eight of them and watching
the heart ledger break. Reward type is now explicit data (`reward: { type }`),
with the label heuristics kept only as a fallback for undeclared pickups.
Sutures also moved from "beats 07–14 only" to **exactly one per dungeon** — a
promise the player can rely on.

**Z3 exposed a live integration bug.** Dev-mode permanently wraps
`player.health.damage` with a two-argument function, dropping everything past
`iframes`. That silently ate the `source` and `meta` the guard resolves
direction from, so in the real game the shield never engaged — while every
unit test passed, because the tests construct `HealthPool` directly. It was
only visible by driving the actual running game. Fixed to forward all
arguments. *This is the session's lesson repeating itself in miniature.*

**Z1's last offender was the bone arches.** The arches closed with a solid
lintel — a roof, from a camera at 17.5. They now corbel inward and stop short.
A dead god's ribs never met either; a spine would have.

### One rule worth keeping

Both new hard-to-hit enemies resolve to the same sentence:

> **A parry undoes whatever makes an enemy hard to hit.**

The bulwark drops its plate; the mote drops out of the air. That is one thing
to learn instead of two, and it means neither kind can become unkillable if the
player skipped the item that was "meant" to answer it.

---

## 5. Honest scoring

**Was 6/10. Call it 8/10 now.** Every structural criticism in §1 is closed:
the camera contract is enforced, traversal is legible, combat has a defensive
half and a way to face what it's fighting, no two dungeons play the same, each
one declares and teaches an idea, and secrets pay in something other than
money.

**It is not 10/10, and I cannot make it 10/10 from here.** The remaining two
points are exactly the things §3 said I couldn't touch, and nothing in this
session changed that:

- **Feel.** I picked defensible numbers — a 0.18s parry window, 3 poise, a
  0.25 chip multiplier, `GUARD_SPEED_MULT` 0.45. Whether those *feel* right is
  decided by hands on a controller, and they are almost certainly not all right
  first time. The parry window is my prime suspect.
- **Difficulty and pacing.** Fourteen dungeons now have distinct rosters, which
  changes the difficulty curve everywhere at once. That curve has never been
  walked.
- **A hand-authored overworld.** Procedural generation cannot make a place you
  remember. That is content work, not engineering.

The single highest-value next action is not another ticket. It is **a full
playthrough**, because the through-line of this entire project is that the
player found in one session what 1455 tests did not.

---

## 6. The follow-up pass — and the point proving itself

The playthrough happened, and it took the owner about a minute to find something
1,879 green tests had not:

> *"Cannot kill this mob. What is the issue here?"*

### 6.1 The bulwark could not be killed. At all.

Z5 gave the bulwark a front plate: melee from inside a ±75° frontal cone is
refused outright, and the counterplay is to flank it or parry its swing. Z5 also
— in the same edit — made enemy facing snap at the player **every frame**.

So the plate tracked whoever was attacking. `inFrontArc` was true from every
angle, forever. The flank the entire kind was designed around was
*geometrically unreachable*, and the only surviving answer was a parry that the
player had no reason to know about. The bestiary spec passed the whole time,
because it asserted `spawn('bulwark').armorUp === true` and *placed the attacker
by hand* — it pinned the mechanism and never asked whether a player could get
there.

**This is exactly §1's failure, repeated by the fix for §1.** A spec that
verifies a mechanism exists is not a spec that verifies the mechanism is
*reachable*. Every rule below now has a spec that drives the real code with a
simulated player moving at player speed.

Three defects, one report:

| defect | fix |
|---|---|
| facing snapped instantly, pinning the plate on the attacker | `turnRate` (rad/s). `Infinity` for every other kind, so they are bit-for-bit unchanged; **2.2** for a plated enemy — derived, not picked: the plate spans 1.31 rad, a player circling at speed 5.5 from melee range orbits at ~3.7 rad/s, so the back opens in **~1s of committed strafing** |
| nothing stopped the player standing *inside* an enemy — and at zero separation there is no bearing, so `inFrontArc` defaults to "armoured" | `_separateFrom()`: a body's width is kept between them. The **enemy** yields, never the player |
| a refused swing said nothing but a clang, so the rule was unlearnable | `ui/coach.js` — a one-shot hint fired at the moment of confusion, not on room entry where it can be missed |

Verified in the running game, not just in specs: a Beat 08 bulwark now dies in
**~4s of circling with the starting weapon and no parry**, with real gaps where
the plate catches up and swings are refused. That gap-and-opening rhythm *is*
the mechanic, and it had never once occurred.

### 6.2 Sixty-five enemies were not the kind they claimed to be

Auditing outward from the bulwark: **65 of ~120 authored enemies carried an
explicit `ai:` that contradicted their kind.** Eighteen lancers never lunged.
Twelve motes never burst. Fourteen bulwarks never chased. Z5's four new kinds
existed in the roster tables and almost nowhere in the actual levels.

Stripped every override that contradicts its kind (49 sites), keeping ~11
deliberate variants — a lone ranged bulwark reads as a turret and is good
change-of-pace. The enforced rule is not "never override" but the weaker,
truer one: **every dungeon that uses a kind must show that kind behaving like
itself at least once.**

### 6.3 The difficulty curve was inverted — and it was eating the bestiary

§3 called the difficulty curve unfixable "requires a playthrough". That was a
dodge: it had simply never been *measured*. Measuring it
(`tests/qa/time-to-kill.mjs`) found the campaign's real curve runs backwards.

Authored enemy HP is nearly flat — 4 in beat 02, 5 in beat 14. The player is
not: Anchor Link (1 dmg) → Tectonic Wedge (2) → two Edge upgrades (+50%).
Damage triples; HP moves 25%.

| | beats 2–5 | beats 9–14 |
|---|---|---|
| landed hits to kill | 2.6 | **1.5** |

**From beat 05 to beat 14 — ten dungeons — every ordinary enemy died to fewer
than two hits, in about six tenths of a second.** The back half of the campaign
was mechanically *softer* than the front half.

The cost is not that the game was easy. The cost is that **the bestiary stopped
working**. A bulwark asks "are you willing to move?" — but if two swings delete
it, walking around it is strictly *slower* than standing still and mashing, so
the question is never put. Ten dungeons of carefully differentiated enemy
design, answered by the damage curve with "no need to engage". §6.1 fixed a
bulwark that could not be killed; §6.3 fixed a bulwark that did not need to be
fought.

`world/threat-curve.js` scales authored HP by the beat it spawns in — one
tunable lever rather than 120 scattered literals. Authored HP keeps its meaning
as a *relative* weight within a room; the curve sets the absolute figure. Its
shape is deliberate rather than flat:

- **Beats 1–4 are untouched.** They were tuned against a 1-damage weapon and
  play correctly; fixing the back half must not break the front.
- **Beat 05 is the softest point of the back half.** It grants the Wedge, and a
  new weapon has to *feel* like one. The player gets a whole dungeon to enjoy
  the spike before the curve closes it.
- **It climbs past the early game from beat 08 on**, ending at 5.0 hits for the
  finale's elites — enough for a mechanic to run more than one cycle.

Result: 2.6 → **4.0** average landed hits, late over early. Combined threat
(kind weight × durability) now rises **×25** across the campaign with only two
dips, of 3.6% and 1.5% — rest beats, not slumps.

### 6.4 A brood against a wall could softlock the dungeon

Found by audit, not by play. Split children were placed blind at a fixed 1.1
radius: kill a brood with its back to a wall and half the litter materialises
*inside the masonry*, unreachable and permanently alive — and every room-clear
gate in that dungeon then waits forever on a corpse that cannot die. Children
now search outward for a free spot and, failing that, inherit the parent's own
footprint, which is provably standable because something was just standing in
it.

### 6.5 Revised scoring

**Suite 1879 → 1971**, all green, including the full browser e2e set — the
tripled boss HP did not break any campaign-completion test.

**Call it 9/10.** §6 closed the one item §3 claimed was out of reach — the
difficulty curve was not unmeasurable, only unmeasured — and it closed a
campaign-wide softlock and an enemy that could not be killed.

The remaining point is still **feel**, and it is still not mine to award. Every
number in §6.1 and §6.3 is derived from geometry or from measurement, which
makes them defensible, not correct. `turnRate` 2.2 and the beat-14 target of 5.0
landed hits are the two most likely to be wrong, and both are single constants
in one file each, deliberately.

The lesson has now repeated three times in one project and deserves stating
plainly:

> A test that constructs the situation it is testing proves the mechanism
> exists. Only a test that *drives the real code from where the player actually
> stands* proves the mechanism can be reached.
