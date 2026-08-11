# Sovereign Scar — Road to Ten

## Context

Sovereign Scar is a finished-shaped game: 14 dungeons, 14 bosses, a 7×7 overworld, a
generated score, a renderer with a certification gate, and 3544 assertions holding it
together. The owner asked what it would take to make it genuinely great rather than
merely complete.

I measured the campaign instead of guessing. The probe is
`node tests/qa/content-density.mjs` (added, print-only, not in the suite). Its finding,
in one line:

> **The systems are better than the content authored against them, and the rules are
> better than the moment-to-moment feel.**

That is a good problem. Almost all of the remaining distance is *authoring and tuning
against machinery that already exists* — not new architecture.

Two subagent surveys (boss roster; overworld/narrative/meta) corrected my first pass
and are the factual basis for everything below.

### Owner decisions taken 2026-07-26

| decision | choice |
|---|---|
| Three endings (`destroyer`/`liberator`/`merged`) | **Cut the dead data.** It is unreachable and always was. |
| Boss scope | **Full kit — 3 moves each, all 14.** |
| New content | **Yes:** minibosses/elites, NPCs and a few towns, more enemy kinds, and *"crank the graphics as impressive as possible without going over the top."* |

---

## The diagnosis, in numbers

```
committed telegraphed attacks per boss   2.46   (was 1.00 — phase B, 2026-07-27)
enemy group coordination                 none   (each enemy commits on its own cooldown)
encounters                               119 enemies / 47 rooms, mean 2.53, peak 5
puzzle blockers per dungeon              1.5    (all 4 types ask "do you have the item?")
pushable-block.js importers              0      (87 lines, finished, never placed)
input buffering                          none   (a press during cooldown is discarded)
overworld screens with any reward        13 of 49
NPCs in the entire game                  0
endings actually reachable               1 of 3
kit design channels with code behind them 3 of 7
```

**An important correction to my own first pass.** "Every boss has one attack" is true of
the *telegraphed, answerable* layer only. Several bosses have real identity in their
passive behaviour — the Sand Spur burrows and beaches itself, the Kinetic Core is only
vulnerable at the top of its bob, the Phantasm is untouchable half the time, the Proxy
hides among decoys. The work is **finishing bosses, not inventing them.**

---

## Phase A — Feel (do first, ~2 days) — ✅ IMPLEMENTED 2026-07-27

Everything after this is judged through it.

> **Status.** A1 and A2 are both landed and verified; see the CHANGELOG for
> measurements and `tests/game/input-buffer.spec.mjs`,
> `tests/game/spatial-audio.spec.mjs`, `tests/qa/stereo-field.mjs`.
>
> **Two sub-items below were not implemented, because their premise was wrong.**
> Both are left as written so the reasoning stays legible, and both are recorded
> in the CHANGELOG and HANDOFF as owner decisions rather than omissions:
>
> - A1's *"split the attack cooldown so dash cancels recovery"* — there is no
>   commitment window to split. `tryDash` has never consulted `attackCd`; the
>   dash is already free for the whole swing. Adding the lock is a balance
>   change, not a responsiveness fix.
> - A2's *"layer bump via `MoodController.setMusicProfile`"* — there is nothing
>   to bump. `index.js` re-derives music intensity from the live scene every
>   frame and any live boss pins it at 3, the maximum. The stinger is the whole
>   reaction.
>
> **Do not start Phase B until the owner has played this.**

### A1. Input buffering

`input.js:327` `consumeAttack()` returns a boolean and clears it unconditionally;
`player.js:389` discards it if `attackCd > 0`. The Anchor Link's cooldown is 0.28 s, the
Mallet's 0.50 s — **any press inside that window vanishes silently.** At a natural attack
rhythm that is roughly one input in three, and it reads as the game ignoring you.

- Replace the boolean with a timestamp; a press is honoured for `INPUT_BUFFER = 0.15 s`.
- **Keep the asymmetry**: buffer against *cooldowns*, drain against *guard-break stun*.
  The comment at `player.js:387` is right — buffering a punishment deletes it.
- Split the attack cooldown at the smear's end (0.19 s) so **dash cancels recovery, never
  windup**. You are locked in for the dangerous part, free for the animation.
- **Do not** add attack-cancels-into-guard; it makes turtling dominant and undoes the
  poise economy.

Files: `src/game/input.js`, `src/game/player.js`.
Spec: `tests/game/input-buffer.spec.mjs` — fires within the window, does *not* fire
outside it, retains nothing through a guard break. **Revert the fix and watch it fail**
(HANDOFF trap 10).

### A2. Stereo placement

`grep PannerNode|StereoPanner src/audio src/game/audio` → nothing. Every sound plays dead
centre. In a top-down game where threats wind up at the frame edge, **which side it came
from is information**, not polish.

Route positional SFX through a `StereoPannerNode`, pan = `clamp((srcX − playerX) /
halfViewWidth, ±1)` in camera space, gentle distance rolloff on gain. Keep UI, music and
the player's own sword centred.

Also: `sfx.phase()` fires on every boss phase change but the *score* never reacts. Add a
one-bar stinger + layer bump via the existing `MoodController.setMusicProfile`.

Spec: extend `tests/qa/audio-envelope.mjs` for channel asymmetry. **Trap 2 applies** —
prove the offline render reached its end before trusting any statistic.

---

## Phase B — The 14 bosses (the largest and most valuable block) — ✅ IMPLEMENTED 2026-07-27

> **All fourteen have kits.** Each carries a punish, a pressure move and a phase
> move. Departures from the text below are recorded in the CHANGELOG; the two
> that matter are that boss 02 was NOT ported onto `startAction` (its cycle
> already had real stages — its defect was a wind-up that moved 2.88 units
> before it landed) and that boss 01's phase move introduced a new telegraph
> SHAPE, the ring, with its own reserved colours.
>
> **None of it has been played.** The sequencing rule at the bottom of this
> section was superseded by the owner's `/goal`. Read the HANDOFF status block
> before tuning anything.

### The shared framework work (do once, before any boss) — ✅ IMPLEMENTED 2026-07-27

> **Status.** All four items below are closed; see the CHANGELOG for what each one
> actually turned out to be. Two corrections to this plan came out of doing them:
> item 2's "eleven bosses reimplement `atan2`" was **two**, and item 3 was already
> covered — better — by `tests/game/boss-bodies.spec.mjs`, so no assertion was added.
> Item 4's radius mechanic did not survive contact with the geometry (both weak points
> sit at body centre, so "inside the radius" means "any hit"); they are windows in
> *time* instead, and multipliers take the **max**, never the product.
>
> `chooseAction` ships wired to the **Crypt Warden**, which gains its `sweep` early as
> a result. **Nothing blocks the 14 kits now** — but the sequencing rule at the bottom
> of this section still stands: one boss per sitting, played before the next starts.

`BossBase` already has staged actions, `telegraphShape` (`circle`/`cone`/`line`),
`inCone`, `inBlast`, `hitPlayer`, `stagger`, `faceToward`, phases, arena clamping. It was
built for a moveset nobody wrote. Add four things:

1. **`chooseAction(player, dist)`** — weighted selection, deterministic given
   `(dist, phase, history)` so specs can drive a whole kit without flake. Rules in the
   base, not in fourteen subclasses:
   - never the same action three times running;
   - distance *gates*, not distance *rules* (a boss that always answers range the same
     way is one you solve once and then execute);
   - **read the player's habit** — track mean distance over ~4 s; a player who never
     leaves melee sees the pressure move more, a kiter sees the gap-closer more. One
     number, and it is the whole difference between a pattern and an opponent;
   - **chain ~25 % of the time** at reduced cooldown out of recovery, phase-gated.
     Recovery being an *unconditional* free hit is why fights resolve to "wait, hit,
     repeat".
2. **`faceToward` for everyone.** Only `ObsidianArachnid` calls it; eleven others
   reimplement `atan2` inline *without the capped turn rate*. Any directional armour
   added to those would immediately reproduce the old bulwark bug (armour tracks the
   attacker, flank unreachable).
3. **`measureBody(root)`** in `boss-models.js:208` is written, documented, and called by
   nothing — it derives `hitRadius` from actual geometry. It is precisely the tool that
   would have prevented trap 11. Wire it in as an assertion, not a setter: bake-time
   check that the authored `hitRadius` clears the measured silhouette.
4. **Weak points.** Sand Spur and Kinetic Core both *model* a glowing weak point that
   does nothing. Make a hit inside a weak-point radius count double, with its own sound.

**The law that survives all of it** (`docs/CONTROLS.md`): *a parry undoes whatever makes
an enemy hard to hit*, and a whiffed punish stays punishable. Depth, not attrition.

### The shape every kit takes

| role | feel | purpose |
|---|---|---|
| **Punish** | long windup, big damage, wide tell, long recovery | teaches the rhythm; whiffing it is your main damage window |
| **Pressure** | short windup, low damage, narrow tell | stops you camping the safe spot; punishes greed |
| **Phase** | unlocked phase 2+, changes the **arena** | makes phase 2 a different fight, not the same one faster |

### The 14

Each keeps its existing move as the Punish. New moves in **bold**. Every design is tied
to that dungeon's own authored `theme:` line.

> **01 and 02 are IMPLEMENTED (2026-07-27).** Both departed from the text below
> where measurement disagreed with it, and both departures are recorded in the
> CHANGELOG. Boss 01's third move is a *ring* telegraph — a new shape, with its
> own reserved colours, because it means the opposite of every other telegraph in
> the game. Boss 02 was **not** ported onto `startAction`: reading it first
> showed it already has real stages and a real opening, and its actual defect was
> that its wind-up moved 2.88 units before it landed, which no amount of porting
> would have fixed.

**01 · Crypt Warden** — *"Read the Wind-Up."* The tutorial boss; legibility beats depth.
- Punish: `slam` (existing).
- **`sweep`** — a short frontal cone that must be blocked or stepped. Beat 01 hands you
  the Bulwark Shield; its own boss should be the first thing that asks you to use it.
- **`ground-crack`** (ph2) — a ring that *expands outward*, so the answer is to move
  **in**, not away. Teaches that not all telegraphs mean the same thing. Deliberately the
  gentlest phase move in the game.

**02 · Tri-Compiler** — *"Reach."* Three orbiting cores joined by damaging beams.
The odd one: not a `BossBase` subclass, hand-rolled cycle, **no ground telegraph at all**
(the beams just flare white) and **zero contact damage**. Port it onto `startAction` so it
speaks the same visual language as everything else.
- Punish: **`converge`** — all three cores slam together on your position.
- Pressure: the existing beam sweep, **given a real lane telegraph**.
- **`triangulate`** (ph2) — cores park at the arena corners; the beams become three
  rotating walls and the room becomes a maze. Killing one core early removes a wall —
  focus fire is rewarded.
- Opening: the `spent` stage already doubles damage taken and nothing announces it. Give
  it the recover cue.

**03 · Sand Spur** — *"Out of the Lane."* Burrows, erupts, beaches itself.
- Punish: `erupt` (existing).
- **`sand-wake`** — the burrow mound now drags a brief damaging trench, so standing in
  its path is no longer free. Right now the tell carries no threat.
- **`breach-spin`** (ph3) — surfaces and *stays up*, sweeping one full rotating cone. The
  one time you fight it above ground.
- Opening: the beached recovery, plus **make the modelled gold weak point on its head
  actually pay**.

**04 · Kinetic Core** — *"What You Cannot Reach."* Ricochets; vulnerable only at the top
of its bob, weak point on its underside.
- Punish: `charge` (existing lane dash → wall slam → slump).
- **`shockring`** — each wall bounce emits a low expanding ring. Turns its ricochet into
  a rhythm you read rather than background motion.
- **`fission`** (ph3) — promote the existing split orbs into a telegraphed action, with
  the orbs respawning on a timer so the arena stays live.
- Opening: the wall-slam slump; plus the underside weak point.

**05 · The Proxy** — *"The Plate."* Decoys and teleports.
- Punish: `bolt` (existing).
- **`mirror-volley`** — every clone fires at once; only the real one's bolt lands.
  Reading which is real *is* the mechanic.
- **`proxy-swap`** (ph3) — it swaps bodies mid-telegraph, so the ring you are dodging was
  placed by something no longer standing there. The ring stays where it was placed —
  the game's own law holds.
- Opening: brief stillness after a swap. Also **hitting a decoy needs its own sound** —
  nothing currently tells you.

**06 · Obsidian Arachnid** — *"Make Space."* Directional carapace; get around it.
- Punish: `leap` (existing).
- **`web-spit`** — a cone at range that slows you in the patch. Attacks the fight's
  counterplay (circling) without removing it — you can still reach the flank, you just
  have to leave sooner.
- **`carapace-flare`** (ph2) — it plants and fires six radiating lanes; the safe ground is
  *between* them. Phase 1 asks for patience, phase 2 asks for precision.
- Opening: the plate already drops during any action and on a parry. Unchanged.

**07 · Hydroid Cloud** — *"Current and Reach."* A swarm with no single body.
- Punish: `pulse` (existing).
- **`orb-shed`** — sheds three slow drifting orbs that detonate, denying the standing-still
  that currently dominates.
- **`rainfall`** (ph2) — the rain already exists as an untelegraphed passive. **Promote it
  to an action** with a sweeping band tell, so it is readable.
- Opening: pulse recovery; plus **shed orbs should be killable**, briefly shrinking its
  contact radius. A swarm should be thinnable.

**08 · Skeletal Mantis** — *"Behind the Plate."* Currently one of the thinnest.
- Punish: `slice` cone (existing).
- **`scythe-hook`** — a narrow lane that **pulls you toward it**, reversing the usual
  get-away instinct.
- **`double-harvest`** (ph2) — two overlapping cones, left then right; the only safe
  ground is behind it.
- **Give it a front `armorUp` arc.** The dungeon's stated theme is literally *"Lock on,
  then circle — that is how you get behind armour."* Its own boss should examine it.

**09 · Phantasm** — *"What the Town Forgot."* Untouchable roughly half the time.
- Punish: `echo` (existing).
- **`after-image`** — leaves a solid copy where it de-materialised; the copy detonates
  after 1.5 s. Punishes chasing.
- **`recollect`** (ph2) — three after-images materialise at once and only one is real for
  a beat.
- Opening: it is already forced solid while committed — good design, keep it. Extend the
  window slightly on a parry.

**10 · Frost & Fuel** — *"Cold Numbers."* Two heads, two elements. Currently the only
difference between them is damage and a friction change.
- Punish: **`cast-fuel`** — leaves a burning patch.
- Pressure: **`cast-frost`** — leaves a persistent slick.
- **The two hazards must interact**: fire melts ice into water, ice quenches fire. The
  arena becomes something you *shape* by baiting which head fires where. This is the
  fight's whole reason to have two heads.
- **`twinned`** (ph2) — both fire simultaneously into opposite halves; you cross through
  the seam.
- Opening: the head that just fired dims — **already visually implied and mechanically
  meaningless.** Make the dim head take double damage.

**11 · Sludge Golem** — *"Plate and Spawn."* One lunge and some pools.
- Punish: `lunge` (existing).
- **`sling`** — lobs a blob at range that lands as a pool, denying the kiting that
  currently wins.
- **`split`** (ph2) — sheds two small golems. **Reuse the `brood` enemy's existing split
  logic.** Directly examines its own dungeon's theme.
- Opening: it is briefly stuck in its own pool after a lunge.

**12 · Magma Wyrm** — *"Lane and Sky."* Segmented serpent laying fire trails.
- Punish: `breath` cone (existing, narrow, 8 long).
- **`tail-lash`** — a ring centred on itself, punishing melee camped at its flank.
- **`dive`** (ph2) — submerges into the caldera and re-emerges elsewhere, leaving a ring
  of fire where it left.
- Opening: after breath its head is low, and the trails hand you a lane map of the arena.

**13 · GUMOI Witness** — *"The Index of Wrong Turns."* Hovers out of reach; descends only
to attack. Its stated theme is *"The Tower has nothing new to teach you. It only asks
whether you learned it."*
- Punish: `bolt` (existing).
- **`index-sweep`** — a rotating scanning lane. It is *The Eye That Renders*.
- **`cite`** (ph3) — **it performs telegraphs borrowed from earlier bosses** — the
  Warden's slam, the Mantis's cone, the Wyrm's breath — in their original colours. Take
  the dungeon's own sentence literally and re-ask the campaign's questions.
- Opening: the descent. Unchanged — it is already the fight.

**14 · Leviathan Core** — *"Everything At Once."* The finale; the biggest thing in the
game. Currently one slam plus decoys and a gravity cycle.
- Punish: `slam` (existing).
- **`wrapfield`** — the world-warp it already drives *visually* becomes mechanical: a band
  of distorted space crosses the arena.
- **`chorus`** (ph3) — it manifests three fallen bosses' silhouettes and fires one
  telegraph from each in sequence. Its own theme line is *"Plate, swarm, lane, and sky.
  The Core kept one of each."*
- Opening: after a slam; plus **make the decoys destructible** for a real window.

### Boss verification

- `tests/game/boss-movesets.spec.mjs` — ≥3 distinct reachable action names per boss;
  `chooseAction` never repeats three in a row over 200 driven ticks.
- `tests/boss-variety-e2e.spec.mjs` — drive each boss 60 s at three fixed distances;
  every action fires at least once, none exceeds 60 % of the histogram.
- Re-run `tests/boss-reach-e2e.spec.mjs` after **any** mesh or radius change — **trap 11**:
  a new action that scales or repositions a boss changes where the player can stand.
- `content-density.mjs`'s boss mean must move off 1.00.

**Do them one boss at a time, each played before the next starts. Do not batch fourteen.**

---

## Phase C — The player's side — ✅ IMPLEMENTED 2026-07-28

Adding opposition without adding options makes a harder game, not a deeper one.
Deliberately restrained: this is a top-down Zelda-like, not a character-action game.
**No combo system.**

- **Charge attack** — hold past `CHARGE_TIME = 0.45 s` for a weapon-specific committed
  move: a 360° spin for the Mallet, a long thrust for the Wedge, a shockwave for the
  Anchor Link. It costs a real windup, so **the player becomes readable too** — exactly
  right for a game whose whole combat thesis is honest telegraphs. It also gives four
  weapons identities beyond four numbers.
- **Dash-attack** — attack during `dashTimer > 0` converts the dash into a committed
  lunge. Gives dash an offensive use and gives you a gap-closer against shooters.

Both additive; a player who never finds either loses nothing.
Spec: `tests/game/player-moves.spec.mjs`, plus `tests/qa/swing-readout.mjs` for the new
arcs. **Trap 1** — assert arcs in **world space**, never as a rotation sign.

---

## Phase D — Encounters, elites, and the bestiary — ✅ IMPLEMENTED 2026-07-28

### D1. Encounter direction

No coordination layer exists. Each enemy commits the moment its own cooldown allows, so
you get either **simultaneous commits** (three overlapping rings with no shared safe
ground — the game's "every attack is dodgeable" promise silently broken) or a **conga
line** (the same 1-on-1 three times).

New `src/game/world/encounter-director.js`, owned by the room, built in `room-graph.js`'s
`bakeRoom` beside the existing seal logic:

- **Attack tokens.** `_beginWindup` requires a token; released on strike-resolve or death.
  `N = 1` (beats 01–04) → `2` (05–10) → `3` (11–14). This single number is the encounter
  difficulty dial the campaign lacks, orthogonal to `threat-curve.js` (HP) and
  `run-mode.js` (global multipliers).
- **Pressure behaviour for the token-less** — they must not simply stand there. A `chase`
  closes and circles at attack range; a `ranged` repositions to a firing line; a `lunge`
  backs to its lunge distance. They *look* about to attack, which is correct: the threat
  is real, the commit is staged.
- **Soft separation** — a weak mutual repulsion at `< 1.2 × (rA + rB)`. Costs almost
  nothing, immediately makes a group read as a group, and fixes two stacked enemies
  looking like one.

`Enemy.director` is nullable and a null director grants every token, so the sandbox and
every existing test keep working.

Spec: `tests/game/encounter-director.spec.mjs` (concurrency ≤ N; token released on death
— a leaked token is a silent difficulty cliff; null is permissive) and
`tests/encounter-e2e.spec.mjs` sweeping **all 21 rooms with ≥3 enemies**. **Trap 5** — do
not validate this on one room.

### D2. Elites / minibosses

Nothing sits between "dies in three hits" and "twenty-minute boss". The score system
already defines an `elite` award worth 250 that **nothing ever fires**.

An elite is an existing kind with one twist, a name, a health bar, and a guaranteed drop:

| elite | base | twist |
|---|---|---|
| **Lance Captain** | lancer | lunges *twice*, second lane perpendicular to the first |
| **Plated Warden** | bulwark | armour covers ±120°; only a parry or a back-hit opens it |
| **Frost Chorus** | frost ×3 | fire in sequence, not together — a rhythm, not a wall |
| **Brood Mother** | brood | splits into four, and the splits split once |
| **Mote Cluster** | mote | shares one HP pool across three bodies |

Place one per dungeon from beat 05 on, in the `combine` room of the existing
`theme:` structure. Wire `SCORE_EVENTS.elite`.

### D3. More enemy kinds — but author the grid first

The kind × AI matrix is **21 of 42 cells (50 %)** authored, and `chase`, `lunge` and
`drift` are almost never used as overrides. Authoring the combinations that already exist
is nearly free content. Do that pass *first*, then add two new kinds:

- **Weaver** — spins a slow line of web between itself and a wall; the room gains
  temporary geometry. Makes rooms change shape mid-fight.
- **Censer** — a support that heals and shields nearby enemies. The first enemy in the
  game whose answer is *target priority*.

---

## Phase E — Dungeons: puzzles, verticality, towns — ✅ IMPLEMENTED 2026-07-28

### E1. The puzzle kit

All four live blocker types ask the same question — *do you have the item?* That is a
lock, not a puzzle. A lock's answer is inventory; a puzzle's answer is a plan.

Three complete systems are trapped in one dungeon each, and one is trapped in none:
`pushable-block.js` (**0 importers**, 87 lines, the most recognisable primitive in the
genre), `gear-system.js` (beat-02 only), `light-line-system.js` (beat-12 only),
`fluid-plane.js` (beat-11 only). **Lifting those four into the shared blocker registry
triples the vocabulary before a line of new logic is written.**

Then add: `pressure_plate` (held by the player, a block, or a lured enemy),
`switch` + `timed_gate`, `block_socket`, and `mirror` (a pushable that redirects a beam).

**The combinations are the game.** Plate + timed gate + pushable block is a complete Zelda
puzzle: *the plate needs weight, you need to be elsewhere, so the block has to hold it.*
No piece is interesting alone.

**Author to the structure that already exists.** Every level def already declares
`theme: { teach, develop, combine, test }` naming four rooms. Give each slot one puzzle
beat using that dungeon's item: `teach` (mechanic alone, unfailable) → `develop` (a
twist) → `combine` (with combat, or a second primitive) → `test` (the exam, before the
boss). Target **1.5 → 6 per dungeon**. Two dungeons at a time; play each.

Spec: `tests/game/puzzle-kit.spec.mjs` for pure logic, and — the important one —
`tests/puzzle-solvable-e2e.spec.mjs` asserting no action sequence can make a goal state
*unreachable*. A block shoved into a corner is a softlock, and this project has already
shipped two (the seal, the door bounce). **Every pushable needs a reset.**

### E2. Vertical interest

Already ticketed twice (`VISUAL_PLAN.md` 6, `GRAPHICS-OVERHAUL.md` 4) and undone both
times because it is filed as a graphics ticket. **It is a level design ticket.** Flat
floors mean the soft shadows and contact darkening you already paid for have nothing to
fall on, every room is traversally identical, and there are no ledges, pits or high
ground for the puzzles in E1 or for positioning ranged enemies.

Do it **with** E1, per dungeon. It cannot be global: changing floor heights changes where
the player can walk, so each change needs a traversal re-audit (camera contract, platform
and pickup reachability, door triggers) — `OPEN_QUESTIONS.md` §3. Budget is not the
constraint: ~37k triangles and ~41 draw calls per dungeon against a renderer that will
take several hundred thousand.

### E3. NPCs and towns

There are **zero NPCs** in 49 overworld screens and 99 rooms. Beat 09 is called *Ruined
Town* and has nobody in it. **36 of 49 overworld screens contain nothing but enemies and
terrain.** The world has nothing it is ruined *for*.

- **Three settlements** on the overworld, in the Tombfields, Sinklands and Bonetown
  regions: five to eight standing figures, light, a fire, and a reason to stop.
- **A handful of speaking NPCs** reusing the existing `StoryPanel` — no dialogue trees, no
  quest UI. A survivor who names the dungeon ahead; the freed engineer from the Resonance
  Fork chain, who should physically *exist* somewhere after you free them; a merchant at
  an altar who trades shards for one-off items.
- **Beat 09 gets its dead.** Silent figures frozen mid-task, which is what a phantasm
  dungeon called *What the Town Forgot* is asking for.

This is the cheapest emotional content in the plan: the actor rig, animator, story panel
and interact verb all already exist.

---

## Phase F — Graphics: impressive, not gaudy — ✅ IMPLEMENTED 2026-07-28

The renderer is the strongest pillar (ACES, HDR composer, bloom, SMAA, PMREM env, contact
shadows, AO out of albedo, per-region light trim, a 44-shot certification gate). The way
to make it more impressive is **not more post-processing**. It is to build the art
direction that is already written down and has no code behind it.

### F1. The kit channels nobody wired up

`dungeon-kits.js` declares seven design channels per dungeon. `applyKit` reads **two**;
`room-lights.js` reads a third (wired last session, and its header comment describes
exactly this discovery). **Four are inert:**

| channel | status |
|---|---|
| `floorPattern`, `capShade` | live (`applyKit`) |
| `emissive` | live (`room-lights.js`) |
| **`atmosphere`** | **dead — 14 distinct tags authored** (`light_shafts`, `heat_shimmer`, `drips`, `bubbles`, `sparks`, `vapor`, `recursion`, `index_scan`, `phantom_duplicates`, …) |
| **`structural[]`**, **`dressing[]`** | **dead — 28 named prop kinds** (`burial_rows`, `gear_bays`, `prayer_flags`, `cable_coils`, …) |
| **`bossRule`** | **dead — 14 arena rules** (`sunken_dais`, `central_machine`, `open_platform`, …) |
| **`accent`** | **dead — 14 authored accent colours** |

That is **~84 authored design declarations, 3 channels live.** Building the other four is
the single highest-yield visual work available, and it is not "adding effects" — it is
building the game the designer already specified, dungeon by dungeon.

- **`atmosphere`** — one system per tag on the existing `ParticleSystem`. Embers over the
  Pyre, drips in the Sluice, spores in the Mire, snow in the Cryo Vault. Right now all
  sixteen regions share one `DustMotes`.
- **`light_shafts`** specifically — volumetric shafts from the emissive fixtures
  `room-lights.js` already places. In a blocky voxel world with hard silhouettes this is
  the most dramatic possible win per unit of restraint, and it fits the monolith motif
  exactly.
- **`structural` / `dressing`** — turn 28 prop names into actual prop builders. This is
  also E2's answer: props are what make a floor worth having shadows on.
- **`bossRule`** — 14 boss arenas that are shaped, not rectangular. A sunken dais, a
  central machine, an open platform with edges. Arena shape is boss design as much as
  moveset is.

### F2. Impact and camera

- **Receiving-end impact.** `ArcSmear` is good; what is missing is the other half — hit
  sparks oriented along the blow, and debris keyed to the target's material (stone chips
  off a bulwark, ichor off a brood).
- **Camera dynamics.** `CameraRig` already does room-bounds clamping and two-subject boss
  framing, which is more than most. Add a height/FOV ease keyed to room size and a short
  pull-in on the killing blow.
- **Destruction.** `DestructibleVoxelMesh` is real and used in six places. Let boss
  attacks damage the arena — a Wyrm breath should scar the floor it crosses.

### F3. Explicitly out of scope ("without going over the top")

**No** screen-space reflections, depth of field, motion blur, chromatic aberration, or LUT
grading. They cost frame time this project has never measured on real hardware
(`OPEN_QUESTIONS.md` §4) and the art direction does not want them.

**And the standing rule — HANDOFF trap 8: when you change how the game looks, open the
captures before you change the number.** The luminance gate has lied twice.

---

## Phase G — Cut, fix, and finish — ✅ IMPLEMENTED 2026-07-28

Small items found during the survey. Individually minor; together they are the difference
between a careful game and a nearly-careful one.

**Cut (owner decision):**
- **The three endings.** `unlockedEndings: ['destroyer'|'liberator'|'merged']` is written
  by nothing. `setSetting()` — the only writer — is **called nowhere in the codebase**.
  Every player gets the same 9-line epilogue. Delete the schema, and add a spec that fails
  if it returns (**trap 4**: deleting the call is not deleting the feature).
- `legacy-factories.js` — three exported factories no beat file calls.

**Fix:**
- **Coach hints reset on reload.** `coach.js`'s `spoken` Set is an in-memory singleton
  never persisted, so a returning player is re-taught everything. Persist to
  `sovereignProgress.hintsSeen` — the field already exists and is unused.
- **Story lines replay on reload** — same cause, `story.js`'s `shownIds_`.
- **Accessibility settings that exist and are unreachable.** `reduceMotion` and
  `reduceHorrorAudio` have *working engine logic in six files* and no UI, because nothing
  ever calls `setSetting()`. Worse, the menu's `reduceFlash` and the engine's
  `reduceFlashing` are **different keys** — the menu toggle does not touch the flicker
  shader it appears to name. Expose all of them properly.
- **The fifth Memory Vial is a dead pickup.** Four slot cap, five grant sites;
  `grantMemoryVialSlot()` returns `false` silently with no toast. Either raise the cap to
  5 or make the fifth pay out something.
- **Sutures**: 14 exist, +1 heart per 4 → 3 hearts and 2 wasted. `world7.js:123`'s comment
  claims 16 by design. Add 2, or re-band the threshold.
- **`map_memory` awards 500 points for opening the map** — free score, once per level.
- **Stale comments** that will mislead the next reader: `altar.js:2` says "one per act
  (beats 01/06/13)" — it is in all 14; `world7.js:123` on suture counts; HANDOFF's coach
  count says 13, the shipped number is 18.

---

## What the plan got wrong

Kept, rather than quietly corrected, because the corrections are the useful part
and because a plan that only records its hits teaches nothing.

| the plan said | measured |
|---|---|
| 28 named prop kinds | **56** — two structural and two dressing per dungeon, all distinct |
| 14 Scar Sutures, 2 wasted | **18** — the survey missed the four beats whose `scoreType: 'secret'` pickups convert. Acting on the plan would have added content the game did not need; the spec stopped it. |
| kind × AI matrix "21 of 42" | **18 of 35** authored (7 kinds × 5 AI). Now 35 of 35. |
| `theme.test` is "the exam, before the boss" | `theme.test` **is the boss room**, in all fourteen. The exam moved to `combine`. |
| Frost Chorus = three frost firing in sequence | That is what the **encounter director** now does to any three enemies for free. Built as one body firing a fanned three-shot volley instead. |
| one puzzle per theme slot, four per dungeon | Three, because of the `test` finding — 40 baked across the campaign. |

Two things in Phase F were cut for budget and are **not started**: volumetric
light shafts (the `light_shafts` tag drives a particle profile, not a god-ray)
and arena destruction from boss attacks.

---

## Sequencing

Each phase is independently shippable and playable. **Do not start a phase before the
owner has played the previous one** — every genuinely important defect in this project's
history was found by playing, not by the suite.

| phase | contents | note |
|---|---|---|
| **A — Feel** | input buffering, stereo | ~2 days. Everything after is judged through it. |
| **B — Bosses** | framework, then 14 kits | The big one. One boss per sitting, played before the next. |
| **C — Player** | charge, dash-attack | After B: options before the opposition needs them are buttons nobody presses. |
| **D — Encounters** | director, elites, bestiary grid | The director is easier to tune once fights have texture. |
| **E — Dungeons** | puzzle kit, verticality, towns | Largest authoring block; needs the owner's design calls, not an implementer's. |
| **F — Graphics** | kit channels, impact, arenas | After E, because E changes every room. |
| **G — Cut & fix** | endings, persistence, a11y, stale docs | Can be done any time; good filler between phases. |

Then: re-shoot the 44 certification captures, re-band the luminance gate, and take the
by-hand ≥60 fps pass on real hardware that `OPEN_QUESTIONS.md` §4 has been waiting on.

---

## Verification (whole plan)

```bash
npm run test:unit                      # fast, no browser — currently 2720/2720
npm test                               # unit + browser E2E — currently 3544/3544
node tests/qa/content-density.mjs      # the density numbers must move
node tests/qa/time-to-kill.mjs         # after any boss/enemy HP change
node tests/qa/swing-readout.mjs        # after any new player arc — world space (trap 1)
node tests/qa/contrast-probe.mjs       # after any lighting change
node tests/qa/certification-captures.mjs   # then LOOK at them (trap 8)
```

Standing rules from `HANDOFF.md` that apply throughout:

1. **Revert every fix and watch its spec fail** before believing it (trap 10).
2. **Sweep every place** — spot checks land on the convenient sample (trap 5).
3. **Assert directions in world space**, never as the sign of an angle (trap 1).
4. **Measure before tuning** — `tests/qa/*` are print-only probes for exactly this.
5. **A green gate is not a good picture** (traps 3, 8).
6. **Verify where a push landed** with `git ls-remote`. (`origin` used to be
   My-Engine; fixed 2026-08-11, so a bare `git push` is now correct.)

---

## What "10/10" means here

"AAA" is a budget, not a quality bar, and this project should not try to buy one. What it
can be is **the best version of what it already is**: a hand-made, offline-first,
zero-build voxel Zelda-like with unusually honest combat rules, a generated score, and
fourteen dungeons that each mean something.

Judged in that category, the distance to excellent is:

- **a boss you remember** (B)
- **a fight you have to move in** (A, C, D)
- **a dungeon you have to think in** (E)
- **a world that looks like somebody lived in it** (E3, F)
- **and a game that answers your button on the frame you press it** (A)

None of that needs new architecture. All of it is authoring against machinery that is
already built and already tested — which is the pleasant position this project is in, and
the direct result of the engineering discipline in `HANDOFF.md`.

**The renderer is done. The rules are good. What is thin is the game.**
