# Handoff

Written 2026-07-22 for whoever picks this up next. Read this before touching
anything; the traps at the bottom have each already cost this project real time.

## What this is

**Sovereign Scar** — a 14-beat Zelda-like 3D WebGL voxel labyrinth on My-Engine
0.2.0 (pinned SHA in `ENGINE_PIN.md`). Zero-build, offline-first, three.js r185,
no bundler. Version `0.3.0`.

```bash
npm run serve          # http://127.0.0.1:8799/
npm test               # unit + browser E2E
npm run test:unit      # unit only — fast, no browser
```

> ## ⚠ `origin` is the WRONG remote for this game
>
> This repo began as a clone of My-Engine, so `origin` still points at
> **`My-Engine.git`**. The game lives at **`Sovereign-Scar.git`**. A plain
> `git push` therefore publishes the game into the engine's repository and
> **silently leaves the game's own repo untouched** — it succeeds, it prints a
> normal ref update, and nothing tells you the work went somewhere nobody is
> looking. It has now happened across three sessions and was only caught when
> the owner said "I do not see the open questions": `Sovereign-Scar.git` was
> **11 commits behind**, including two entire sessions of work.
>
> Push with the URL spelled out:
>
> ```bash
> git push https://github.com/sumosizedginger/Sovereign-Scar.git HEAD:main
> ```
>
> Then verify, because the failure mode is a push that looks like it worked:
>
> ```bash
> git ls-remote https://github.com/sumosizedginger/Sovereign-Scar.git refs/heads/main
> ```
>
> Changing `origin`'s URL is blocked in this environment, so the hazard cannot
> simply be removed. **Adding a second remote is not blocked**, and as of
> 2026-07-29 there is one:
>
> ```bash
> git push game HEAD:main      # game = Sovereign-Scar.git
> ```
>
> That is a convenience, not a safety net. `origin` still points at My-Engine,
> so a bare `git push` is exactly as dangerous as it always was, and the
> `ls-remote` check above is still the only thing that proves where the work
> landed.
>
> **The second half of this trap is reading, not writing.** My-Engine now holds
> a *stale copy of the whole game* from the sessions that pushed there by
> mistake — as of 2026-07-24 its `main` sits at `b6b571d`, six commits behind,
> and it is missing `docs/PLAYTEST-2026-07-23.md` and `docs/GRAPHICS-OVERHAUL.md`
> entirely. It looks like the project. It is not. The owner went looking for the
> playtest doc, did not find it, and reasonably concluded it had never been
> committed. **Sovereign-Scar is the only source of truth. Confirm which repo
> you are looking at before concluding a file is missing:**
>
> ```bash
> git log --oneline -1 && git ls-remote https://github.com/sumosizedginger/Sovereign-Scar.git refs/heads/main
> ```

The suite is the contract. It is large on purpose and most of it encodes a
lesson rather than a behaviour; if something fails, read the comment above the
assertion before changing it.

## State

Everything below is green in the working tree. `npm test` — unit + full browser
E2E — **4480/4480**, run end to end after the arrival sweep.
`npm run test:unit` alone: **3616/3616**.

Every one of those nine fixes has been reverted and the suite re-run to confirm
something fails without it (`HANDOFF` trap 10). The first pass of that found
**six fixes with no alarm on them at all**; five now have one and the sixth
turned out to be unreachable code rather than an untested one. Trap 23 has the
breakdown, and it is the most useful thing in this file for whoever works next.

**ROAD-TO-TEN is fully implemented — every phase, A through G.** The plan is no
longer a to-do list; it is a record of what was found and what was built. What it
is NOT is a record of what has been *played*: see the caveat below, which is the
single most important paragraph in this file.

**Not committed.** The tree carries this work plus the previous session's, and
the remote is still at `006ab96`. Push with the URL spelled out (see the
warning at the top of this file) and verify with `git ls-remote`.

| area | state |
|---|---|
| Overworld, 14 dungeons, 14 bosses, items, saves | built |
| Combat: guard / parry / lock-on / 7-enemy bestiary | built |
| Difficulty curve (`world/threat-curve.js`) | built, measured |
| Generated score, no drone | built, proved by offline render |
| Melee swing direction + weapon mount | fixed |
| Bulwark Shield as a gated pickup | built |
| Controls unified into one table | built |
| **Renderer / lighting: all six VISUAL_PLAN tickets** | **implemented** |
| Ticket 6's vertical interest inside rooms | **prototype in Beat 01 tomb (GRAPHICS ticket 4)** |
| 44 binary certification captures | **regenerated; `CERTIFICATION.md` Lum column matches** |
| Per-kind enemy bodies + derived hitboxes | **built** (`characters/bodies.js`, `tests/game/bodies.spec.mjs`) |
| Held enemy props (lance / plate / focus) | **built** (`assets/enemy-props.js`) |
| Kit emissive motifs wired to real lights | **built** (`world/room-lights.js`) — the tag had zero producers before |
| Bosses rebuilt as voxels, 1.4–1.85x presence | **built** (`bosses/boss-models.js`, `tests/game/boss-bodies.spec.mjs`) |
| Boss emissive under the bloom threshold | **capped at construction AND at six runtime sites** |
| Room seals (26 rooms, 24%) | **built** (`tests/game/room-seal.spec.mjs` guards the softlock rules) |
| Coach hints | **3 → 13** |
| Luminance gate | **now bands CENTRE-CROP mean; full-frame was measuring the vignette** |
| Abyss vs Crust brightness | **unified — owner decision, see `docs/OPEN_QUESTIONS.md` Q1** |
| Boss-room luminance | **tuned to match each dungeon — see Q2** |
| Enemy AI colliding with a wall it's already touching | **fixed** (`src/engine/collision.js`) |
| Overworld fog-of-war reset on dungeon exit (reported 3×) | **not yet reproduced — see below** |
| Parry window (was frame-perfect at 0.18 s) | **0.3 s — owner call from play** |
| Guard on the keyboard | **moved `L` → `B`, next to attack — owner call** |
| Holding block leaking 25% chip | **fixed — `GUARD_CHIP` is 0; poise is the cost** |
| Shooters requiring a parry | **fixed — hold the shield and the bolt goes back** |
| Armoured shooter (`bulwark` + `ai:'ranged'`, 3 rooms) — plate ate its own reflected bolt, parry could never fire | **fixed — a reflect staggers first** (`tests/game/reflect-armor.spec.mjs`, trap 9) |
| Dev god mode disabled the parry, softlocking sealed rooms | **fixed — the damage filter now runs** (`installGodDamageWrapper`, `tests/game/god-mode-combat.spec.mjs`, trap 10) |
| Sealed room with no way out if a fight stops resolving | **valve: 45s mutual stalemate releases it** (`tests/seal-stalemate-e2e.spec.mjs`) |
| Arachnid + Mantis: no room to stand outside the model and still hit (0.31 / 0.53) | **fixed — hitRadius follows the silhouette** (`tests/boss-reach-e2e.spec.mjs`, trap 11) |
| Boss armour refused a hit and never said why | **fixed — one coach line, directional armour only** |
| Refused door bounced the player into geometry and re-fired every frame | **fixed — `refuseDoor` + 0.7s cooldown** (`tests/door-refusal-e2e.spec.mjs`) |
| Mote burst: ring wider than the mote ever came | **fixed — named constants, honest tell** |
| Drops spawning at flight altitude (uncollectable) | **fixed — `dropSite()`, both sites** |
| `Enemy.loot` — assigned since day one, read by nothing | **wired up** |
| Arachnid hittable only from inside its own model | **fixed — directional carapace** |
| `BossBase.state.facingVec` — dead data, never updated | **live via `faceToward()`** |
| **Seven issues from the 2026-07-23 playtest** | **fixed — see CHANGELOG Unreleased** |
| **Seven graphics tickets (AO + soft shadows + detail + …)** | **fixed — see `docs/GRAPHICS-OVERHAUL.md` / CHANGELOG** |
| Credits crediting a phantom "Sovereign Scar team", author named once (on the engine line) | **fixed — author credited as creator + 13 roles** (`tests/game/credits.spec.mjs`) |
| A press during a weapon cooldown was read, discarded, and never happened | **fixed — `INPUT_BUFFER` 0.15s; measured 6→9 swings per 12 presses** (`tests/game/input-buffer.spec.mjs`, ROAD-TO-TEN phase A1) |
| Every sound in the game played dead centre — no panner anywhere in `src/` | **fixed — `src/audio/spatial.js`; placement wired into `BossBase` + `Enemy`, so all 14 bosses and every kind get it** (`tests/game/spatial-audio.spec.mjs`, `tests/qa/stereo-field.mjs`, ROAD-TO-TEN phase A2) |
| `sfx.phase()` fired on every boss phase change and the score never reacted | **fixed — `scoreStinger(phase)`, a four-note figure on the next beat, in the track's own key** |
| Stereo placement is a *subtraction* for a player with one-sided hearing — a left-edge cue reaches a right-ear-only player at −22 dB | **fixed — `monoAudio` setting + menu toggle; pan collapses to 0, distance rolloff kept (−3.3 dB instead of −22)** |
| Two bosses model a glowing weak point that paid nothing — Kinetic Core reachable 42% of the fight at a flat 1x | **fixed — `weakOpen`/`weakMult`, multipliers take the MAX so the Spur never reaches 4x** (`tests/game/weak-points.spec.mjs`) |
| Camera framing | **correct as-is — a top-down Zelda frames the room, not the hero** |

> ## Closed this session: playtest + graphics overhaul
>
> All seven playtest issues (docs/PLAYTEST-2026-07-23.md) and all seven
> graphics tickets (docs/GRAPHICS-OVERHAUL.md) are implemented. Specs live in
> 	ests/game/playtest-2026-07-23.spec.mjs and 	ests/game/bosses.spec.mjs.
> **Re-run 	ests/qa/certification-captures.mjs before trusting the luminance
> gate** after AO-out-of-albedo and the lightTune retrim on 07/09/12.
>
> Still open after this batch:
> - Overworld fog-of-war reset (unreproduced)
> - Rolling vertical interest beyond the Beat 01 tomb prototype
> - Owner feel-check of parry window / mote dive / reflect at real framerate
> - **Nothing in combat has line of sight.** Found by looking at the new player
>   shots in `docs/media/telegraphs/`, not by any number. `hitboxCheck` takes
>   two positions and a move and holds no reference to the world, so no attack
>   in the game — the player's or a boss's — can consider a wall. It does not
>   matter at 1.2 units and it is very visible at 16: `player-caster-lance.png`
>   and `player-caster-ray.png` both show the beam leaving the player, crossing
>   the room's east wall and continuing out of frame. The drawing and the hit
>   agree with each other, which is what this session was for; they agree about
>   something that goes through walls. In practice this means pillars and
>   terraces do not cover you from either ray weapon. **Left unfixed on
>   purpose** — adding occlusion changes every attack in the game including all
>   fourteen bosses, and that is a design call for the owner, not a bug fix.


## What to do next

> ## The first play happened, and three symptoms became nine defects
>
> The owner played Phases C–G on 2026-07-28 and reported three symptoms: the
> Light Caster's charge "is not connected to where it actually hits, it's almost
> off the screen", "some rooms you can't place blocks", and "some other block and
> puzzle errors". Pulling on those three found nine defects — see the CHANGELOG
> section *Fixes from the first play of Phases C–G*, and traps 19, 20, 21 and 22
> below. Two were hard softlocks (a gate that seals the player into a one-cell
> alcove; a beat-12 beam aimed through its own vault wall), one made half the
> campaign's puzzle vocabulary unusable with three of the five weapons, and one
> silently cancelled the switch in seven of the fourteen dungeons.
>
> **None of the nine was findable from the chair by anyone but a player, and
> the suite was 4343 green over all of them.** That is the sequencing rule in
> the plan being proved right, retroactively and expensively. The warning below
> still stands for everything the owner has not reached yet.
>
> The ratio is the part worth carrying forward: **three reported symptoms, nine
> defects.** Every one of the extra six came from sweeping the system the
> symptom pointed at rather than fixing the symptom — which is trap 5 stated as
> a working method rather than as a warning.
>
> ## ⚠ MOST OF PHASES B THROUGH G STILL HAS NOT BEEN PLAYED
>
> This is the risk, and it is the only thing on this page that should decide
> what the next session does.
>
> The plan's own sequencing rule was **one phase at a time, played before the
> next starts**, and it said why: *every genuinely important defect in this
> project's history was found by playing, not by the suite.* That rule was
> superseded by two `/goal` directives — "do all bosses" and "complete the rest
> of the upgrade" — so fourteen boss kits, an encounter director, five elites,
> two new enemy kinds, forty puzzle beats, terracing in every room, three
> settlements, fifty-six prop kinds, fourteen atmospheres and fourteen boss
> arenas have all landed **at once**, with the suite and a handful of headless
> probes behind them and nothing else.
>
> The suite is 4426 assertions and every fix in it was verified by
> counterfactual. It still cannot tell you whether the game is any good. Three
> separate times this session it was the *browser* half that caught something
> the unit half could not see — most sharply a Censer crash that aborted the
> whole enemy update mid-frame, which from the chair looks exactly like an enemy
> that stopped moving.
>
> And a green suite of that size is exactly what makes trap 23 worth reading:
> when the first play's fixes were checked one by one, **six of twenty could be
> deleted without a single one of those 4426 assertions noticing.** Size is not
> coverage.
>
> **Play it. In this order, because this is roughly the order of risk:**
>
> 1. **Any dungeon, first three rooms.** Terraces and props are now in every
>    room in the game and nobody has looked at one. They are generated from a
>    table and refused any cell the room had already claimed — but "did not
>    break anything" and "looks like a place" are different claims.
> 2. **A crowded room in beats 05-10.** The director's token budget (1 → 2 → 3)
>    and the pressure behaviour are the numbers most likely to be wrong. The
>    measurement to trust is your own: does the room feel like a group, or like
>    a queue?
> 3. **A `combine` room.** Elite + puzzle + fight, all at once, all new.
> 4. **The charge and the dash-attack**, on all four weapons. The mix numbers
>    are single named constants (`CHARGE_TIME`, `CHARGE_WINDUP`, each weapon's
>    `charge.recover`) and are meant to be dialled.
> 5. **The three settlements** (overworld `r1c1`, `r3c1`, `r5c3`) and the dead
>    of beat 09.
>
> **One thing I looked at and am flagging rather than guessing at.** The 44
> certification captures were re-shot after all of this (`node
> tests/qa/certification-captures.mjs`, 0 page errors) and opened, per trap 8.
> Terraces, props and boss arenas are all clearly legible — beat 01 reads as a
> crypt with burial rows in it rather than an empty box. But **props and
> terraces take the room's WALL colour**, and in the loud dungeons that is very
> loud: beat 12's `vent_ring` arena is a ring of pale violet blocks on an orange
> magma floor, which reads as an arena boundary (good) and as a foreign object
> (not good). Shading them toward the FLOOR colour instead is a one-line change
> in `kit-props.js` / `terracing.js`. I did not make it, because "does this look
> like the same room" is a judgement to make with your eyes and not from a
> luminance number.
>
> **What was deliberately NOT built**, so nobody goes looking: volumetric light
> shafts (the `light_shafts` tag drives a particle profile, not a god-ray), and
> arena destruction from boss attacks. Both are in Phase F's text; both were cut
> for budget and neither is started.

> ### Read `docs/ROAD-TO-TEN.md` for the reasoning
>
> Written 2026-07-26 in answer to "what would make this as close to AAA as we
> can get it". It is an **assessment and a plan**, approved by the owner, and it
> is the only document that looks at the game as a game rather than at one
> subsystem. **Phase A is implemented; B through G are not.** Its finding, in
> one line:
>
> > **The systems are better than the content authored against them, and the
> > rules are better than the moment-to-moment feel.**
>
> Every figure in it is reproducible with a new print-only probe,
> `node tests/qa/content-density.mjs`. The headline measurements:
>
> | measured | value |
> |---|---|
> | committed attacks per boss | **1.00** — all thirteen bosses have exactly one |
> | enemy group coordination | **none** — every enemy commits on its own cooldown |
> | puzzle blockers per dungeon | **1.5**, and all four types ask "do you have the item?" |
> | `pushable-block.js` importers | **0** — a finished system the campaign never used |
> | input buffering | **none** — a press during cooldown is read, cleared, discarded *(fixed, phase A1)* |
> | stereo placement | **none** — no panner anywhere in `src/`; every sound dead centre *(fixed, phase A2)* |
>
> The renderer is the finished pillar; further polish there is the lowest-yield
> work remaining. The approved order is **A** (feel) → **B** (14 boss kits) →
> **C** (player moves) → **D** (encounter director, elites, bestiary) →
> **E** (puzzles, verticality, towns) → **F** (graphics: the dead kit channels)
> → **G** (cut & fix); the reasoning for that order is in the document, as is
> the rule that no phase starts before the owner has played the previous one.
> **A is done. B is next, and it is the largest block in the plan.**
>
> **B's framework work has started.** One of its four items is landed: the
> Crypt Warden and Skeletal Mantis now face through `faceToward`, so
> `state.facingVec` is real on every boss that faces at all. This had to
> precede boss 08 — the plan gives the Mantis an armour arc, and its facing was
> both pinned due south and instant, which is the bulwark bug exactly.
> `tests/game/boss-facing.spec.mjs` measures the flank-time race.
>
> **Correct the plan as you go.** It claims eleven bosses reimplement `atan2`
> inline; there were two. Most of the roster never faces anything. Expect other
> counts in ROAD-TO-TEN to be estimates — verify before sweeping.
>
> **`measureBody` needs no wiring — that assertion already exists**, better, in
> `tests/game/boss-bodies.spec.mjs` (p85 radius, measured after a 2s warm-up,
> with documented per-boss exemptions). Measured: all 14 hitboxes sit at
> 0.51–0.99 of their running silhouette, none reaching past the body. Nothing
> to fix. `node tests/qa/boss-silhouette.mjs` prints cold-vs-running extents,
> which is the useful lens for phase B — five bosses change size at runtime.
>
> **Weak points are done.** `weakOpen` + `weakMult` on `BossBase`, set from
> whatever already drives each boss's glow. Multipliers take the **max, never
> the product** — beaching IS the Spur's recovery, so multiplying would have
> made it 4x. The Core goes 1x → 2x (it was reachable 42% of the fight and paid
> nothing); the Spur's damage is unchanged and its seam just stops lying.
> Owner's call 2026-07-27. `tests/game/weak-points.spec.mjs`.
>
> **`chooseAction` is done — B's framework is complete.** `BossBase` gained
> `defineActions` / `actIfReady` / `chooseAction`, a seeded LCG per boss so
> specs replay while fights stay varied, habit tracking (`HABIT_WINDOW = 4 s`
> → one bias in [−1, 1] → `HABIT_STRENGTH = 0.6` on the weights),
> no-three-in-a-row, distance as a *gate* with overlapping ranges, and a ~25%
> chain out of recovery at `CHAIN_COOLDOWN = 0.35`. It ships wired to the
> **Crypt Warden**, which now has a second move (`sweep`, a frontal cone — beat
> 01 hands you the Bulwark Shield and its own boss never asked you to raise
> it), because this session found four separate systems that were built,
> documented and called by nothing. `tests/game/choose-action.spec.mjs`, 39
> claims, three counterfactuals.
>
> **Boss 01 is done — 1 of 14.** The Crypt Warden now has punish / pressure /
> phase: `slam`, `sweep`, and `ground-crack`, a band that travels OUTWARD with
> the safe ground in the middle. New `'ring'` telegraph shape and `inRing` hit
> test in the base; it is the only telegraph that grows, arriving full-size on
> the frame it resolves. Gentle on purpose (1 damage where the slam does 2, two
> exits, ~2x the travel time you need) because its job is to teach that a
> telegraph can mean "get in".
>
> **Checking that ring against its own drawing found trap 13** — four boss
> telegraphs across three bosses were drawn one size and resolved another. Read
> that entry before authoring any kit; it is the cheapest mistake in phase B to
> make and the hardest to notice.
>
> **Boss 02 is done — 2 of 14.** The Tri-Compiler keeps its hand-rolled cycle
> (the plan said port it onto `startAction`; reading it first said otherwise —
> it already has real stages and a real opening). Its defect was not structure,
> it was an **unanswerable wind-up**: the cores drifted 1.69/2.65/2.88 units
> between the flare and the sweep, against a beam that hits within 0.55. The
> assembly now freezes for the charge (drift 0.03–0.06), three ground lanes are
> painted under the beams, `converge` slams every third cycle onto locked
> ground, phase 2 widens the ring to 6.4 so the beams become 11-unit walls, and
> the brown-out finally draws its halos. `tests/game/tri-compiler.spec.mjs`.
>
> **Watch the orbit-angle trap if you touch that fight**: the angle used to be
> `this.t * spin`, so changing the rate teleports the ring instead of slowing
> it. The first freeze attempt made the drift *worse* (7.85) and only the
> measurement caught it. It accumulates now.
>
> **PHASE B IS COMPLETE — all fourteen bosses have kits.** Each has a punish, a
> pressure move and a phase move; `tests/game/boss-movesets.spec.mjs` names them
> per boss and `tests/game/boss-lethality.spec.mjs` proves every one of them can
> still land a blow. Eighteen counterfactuals, one per added move.
>
> **Nothing here has been played.** The plan's rule was one boss per sitting,
> played before the next; the owner's `/goal` of "do all bosses" (2026-07-27)
> superseded it, so fourteen kits are landing at once with only the suite and
> the capture probe behind them. **That is the risk to spend the next session
> on.** The numbers most likely to be wrong are the mix rates — each new move is
> gated behind a `_rand()` roll between 0.3 and 0.45 — and those are single
> named constants at each call site.
>
> Four bosses carry a third threat that is NOT a staged action, so any count of
> `startAction` names undercounts them: the Warden's `ground-crack` (range-gated
> past 3.4), the Spur's `sand-wake` (the mound), the Core's `shockring` (thrown
> by wall impacts), and the Proxy's `proxy-swap` (a modifier on the bolt).
>
> **Bosses 03 and 04 are done — 4 of 14.** Spur: sand-wake (the mound finally
> costs something) + breach (phase 3). Core: shockring on each wall bounce +
> fission (phase 3). Both turned up trap 15 below, which is the finding of the
> pair: **two bosses had stopped moving entirely** and nothing said so.
>
> The owner set a `/goal` of "do all bosses" on 2026-07-27, which supersedes the
> one-boss-per-sitting rule in the plan. Bosses 05-14 remain.

Older items, still valid and folded into the plan above:

1. **Regenerate the 44 certification captures** and update `CERTIFICATION.md`
   after the AO split and lightTune retrim. Expect the luminance gate to need
   a re-band pass.
2. **Owner play report** on mote dive feel, held-shield reflect satisfaction,
   and whether Beats 07/09/12 still read as places (suite cannot certify feel).
3. **Vertical interest rollout** beyond Beat 01 tomb — per-level design, not a
   global pass (see GRAPHICS ticket 4 / VISUAL_PLAN ticket 6, and ROAD-TO-TEN
   ticket 6, which argues it is a *design* ticket rather than a graphics one).

**Corrected 2026-07-26:** this list used to carry a fourth item, "spawn the
bulwark somewhere in the campaign (documented, tested, never placed)". That was
wrong. `content-density.mjs` counts **20 bulwark spawns** across beats 05, 08,
11, 13 and 14 — sixteen on default AI, three `ranged`, one `charge`. Trap 9
below is *about* one of those placements, so it cannot ever have been true.
Removed here and from the "still open" list above.

Baseline after this session: `npm run test:unit` → **3044/3044**;
`npm test` → **3868/3868**.

> ## PHASE A OF `docs/ROAD-TO-TEN.md` IS COMPLETE — PLAY IT BEFORE PHASE B
>
> A1 (input buffering) and A2 (stereo placement + phase stingers) are both
> landed. The plan's own sequencing rule applies now and is not optional:
> **do not start phase B until the owner has played this.** Phase A is the
> layer everything after it is judged through, and every genuinely important
> defect in this project's history was found by playing, not by the suite.
>
> Two things the suite cannot answer and a play session can, both of them
> constants I chose from measurement but cannot *feel*:
>
> - **`INPUT_BUFFER = 0.15 s`** — is an early press forgiven for long enough,
>   or does it now fire swings you had already given up on?
> - **`PAN_LIMIT = 0.85` against a frame half-width of ~8.8 world units** — the
>   visible frame is only ~17.5 units across, so sounds sweep the stereo field
>   fast. Informative, or busy?
>
> Both are single named constants in `src/game/input.js` and
> `src/audio/spatial.js`.
>
> **The owner hears in one ear and cannot assess stereo — a friend is testing
> it.** `monoAudio` (Settings → *Mono audio*) exists for exactly this and keeps
> the distance rolloff, so a mono player still hears far-away as quieter. Treat
> "play it and tell me how it sounds" as unavailable for audio work on this
> project: settle it with `tests/qa/stereo-field.mjs`, which prints both paths.
>
> **Two sub-items were deliberately NOT done, because the plan's premise was
> wrong in both cases.** Neither is a shortcut; both are documented in full in
> the CHANGELOG and want an owner decision rather than an implementer's:
>
> 1. *A1 — "dash cancels attack recovery, never windup".* There is no commitment
>    window to split: `tryDash` has never consulted `attackCd`, so the dash is
>    already free during the whole swing. Adding the lock makes the game heavier;
>    it is a balance change, not a responsiveness fix.
> 2. *A2 — "layer bump on phase change via `setMusicIntensity`".* There is
>    nothing to bump. `index.js` re-derives intensity from the live scene every
>    frame and any live boss pins it at 3, already the maximum, so the bump would
>    be overwritten on the next frame. The stinger alone is the reaction.
>
> **A note on the audio work for whoever picks it up.** Placement is a *scope*,
> not a parameter — `audioAt(pos, () => sfx.whoosh())`. The wrappers live in
> `BossBase.startAction`/`runAction` and `Enemy._beginWindup` on purpose, so a
> boss or enemy written later inherits placement without knowing it exists.
> Do not "tidy" them down into the roster call sites. Trap 5 is exactly this.

### Background — how the current state was reached

**Questions 1 and 2 of `docs/OPEN_QUESTIONS.md` are resolved (2026-07-23) by
owner decision: brightness should be the same across the board.** The Abyss
no longer runs a deliberately darker band than the Crust, and every boss room
was measured and brought down toward its own dungeon's normal-room mean (nine
of fourteen needed a `lightTune`; three of those sit on a genuine brightness
cliff and are much closer rather than exact — see the doc for the full
table). `node tests/qa/contrast-probe.mjs` still prints live figures if you
want to check current numbers.

> **Read this before touching `MOOD_PRESETS.abyss` again.** The first pass at
> the above hit the brightness number by cranking a saturated ambient/key —
> and it made every Abyss surface read as one flat purple wash, no material
> variety at all. The owner caught it from a screenshot, not a number; nothing
> automated did. It's fixed (structural `ABYSS_COLORS` desaturated toward
> neutral, light pulled back down), but if you raise that preset's intensity
> again for any reason, take an actual screenshot and look for real tonal
> variety before trusting the luminance mean — see `docs/OPEN_QUESTIONS.md`
> question 1's correction note and `CERTIFICATION.md` for the fuller account.
> This is the same lesson as Trap 3 below, from the other direction: a
> passing number is not proof the picture is right.

**Two more items — the first still open, the second closed and recorded:**

- **Overworld fog-of-war reported resetting after a dungeon exit (3/3
  reproductions by the owner).** Direct testing of the save-persistence code
  (a real dungeon round-trip through `loadLevel`, and a full page reload)
  could NOT reproduce it — visited screens stayed marked correctly both
  times. Hardened `engine/settings.js`'s `setProgress` to re-read disk before
  merging (a bfcache-restored or second tab could otherwise write back a
  stale in-memory snapshot and silently erase newer progress) as a plausible
  but *unconfirmed* fix. Needs either a repro that survives a real walking
  playtest (not the API-level shortcuts used so far), or the owner noticing
  it again post-fix.
- **Enemies clipping through walls while retreating — fixed.** The shared
  collision resolver (`engine/collision.js`) failed to stop a mover that
  started already touching a thin wall (routine here, since walls are baked
  one voxel wide); it let movement through with zero resistance for the rest
  of the crossing. Retreating AI was the one behavior that reliably drove an
  enemy into a wall from a standing start, which is why it looked
  retreat-specific — the defect was general. Two new specs in
  `tests/collision.spec.mjs` pin the case; reverting the fix reproduces it.

**A note on the combat pass of 2026-07-23.** Four things the owner found by
playing, three of which were mechanics that existed and did not work. The
pattern is worth internalising, because it is the same one three times:

- The shield leaked 25% chip, so on the one enemy a sword cannot reach (the
  mote) the only available defence was a slower way of dying. Two systems each
  looked defensible alone; the gap only existed where they met.
- The mote's burst drew a ring at radius 3.2 and parked at 2.4, so the tell
  described a circle it never committed from. **A telegraph that does not match
  what it resolves is not a telegraph.** The three numbers are now named
  constants and a spec asserts the ring damages inside its own radius and not
  outside it.
- Drops spawned at `enemy.root.position` — 3.4 units up for a hovering enemy,
  against a 2.0-unit collection window. Killing a mote paid *nothing*, and no
  test noticed because no test asked whether the reward could be picked up.
  `dropSite()` is now the single rule, applied at both drop sites.

- The Arachnid's `shielded = true` is the same shape a third time. That flag is
  **absolute** — `applyHit` refuses a shielded defender from every bearing — so
  combined with a leap that lands on the player, the only place damage ever
  registered was inside the model. **Before changing a boss's hitbox, measure
  its reach**: this one read as a reach bug and was not (3.6 m reach against a
  2.24 m body). Directional armour (`armorUp` + `inFrontArc`) is the tool; an
  absolute `shielded` should be reserved for genuinely untouchable phases.

None of these would have been caught by a passing suite, and each has a spec
proven to fail on the previous code. Same family as Trap 3: a green number is
not evidence the thing works.

**If you give a boss any directional rule, check it can turn.** `faceToward()`
is new on `BossBase` because `state.facingVec` had been fixed at `{x:0,z:-1}`
since the class was written — dead data, so a plate welded to due south. Two
things matter and both were found by measuring, not reasoning: the turn rate
must be **slower than the player can orbit** (or the armoured arc tracks the
attacker and the flank is unreachable — the old bulwark bug), and first sight
of the player must **snap**, or the boss opens the fight rotating on the spot
with its armour aimed at nothing.

Then, if you want to keep going on looks, **ticket 6 of `docs/VISUAL_PLAN.md` is
the only one not finished**. It delivered bake-time silhouette trim and per-kit
weathering; **vertical interest inside rooms** is what remains, and it is the
item worth a designer rather than an implementer. It is carried forward as
**ticket 4 of `docs/GRAPHICS-OVERHAUL.md`**, where it is argued up the priority
list: the camera frames the room, so an empty floor is most of the picture, and
it is what makes soft shadows and contact darkening pay off — shadows need
something to cast them.

Understand why before you start. Both things that landed are safe to apply to
all fifteen levels in one pass *because of a structural argument*, not because
they were tested carefully: the trim only adds geometry **above the wall top**
and only on the **room perimeter**, which is provably nowhere the player can
stand; the weathering is **colour only**, so the cell set is byte-identical
before and after. Each has a spec that checks the argument rather than the
output. **Vertical interest can make neither claim** — changing floor heights
changes where the player can walk, so it needs per-level design and a traversal
re-audit. Do not try to do it globally.

Smaller things that are known-open:

- `src/engine/lights.js: updateShadowFollow` is a trap, not a tool — see Trap 6.

**7. One list left un-generated is one list free to be wrong.**
The keyboard cheat sheet was unified into `CONTROLS` and the **gamepad** legend
was left hand-written in `ui/hud.js` — and it had already drifted, labelling
D-up as "mood" when the button does mirror travel. Both sheets and both doc
tables now generate from the same entries, and `controls.spec.mjs` reads BOTH
handlers (`_onKeyDown` and `pollGamepad`) and checks coverage in both
directions. If you add a fourth surface — a remap screen, a touch overlay —
generate it from the table too, or it will be wrong within a session.

## Measuring before changing

`tests/qa/*.mjs` are **print-only probes**. They exist because this project has
repeatedly been wrong about its own numbers, and they are how each of the
lighting tickets was sized. Run the relevant one before and after any visual
change:

```bash
node tests/qa/contrast-probe.mjs   # mean + centre-crop contrast, all 16 levels
node tests/qa/shadow-census.mjs    # who casts, who receives, who is exempt
node tests/qa/env-probe.mjs        # is the environment map actually installed
node tests/qa/trim-cost.mjs        # triangles + draw calls, trim on vs off
node tests/qa/swing-readout.mjs    # blade tip world position through a strike
node tests/qa/certification-captures.mjs   # re-shoot the 44 cert images
node tests/qa/content-density.mjs  # how much GAME is in the game (see below)
node tests/qa/stereo-field.mjs     # L/R rms for a source walked across the frame
node tests/qa/puzzle-solve.mjs     # stand, shove, walk in — real body, real ground
node tests/qa/room-map.mjs <beat> <room>   # draw a room; LOOK at it (trap 26)
```

`content-density.mjs` is the odd one out and worth calling out: every other
probe here asks whether something is **correct**, and it asks whether there is
**enough of it**. The campaign can be entirely correct and still be thin, and
nothing in a green 3544 would say so — the suite can confirm that seven enemy
kinds behave as designed while the campaign only ever puts two of them in a
room. It reads authored source only, so it is exact and needs no browser.
`docs/ROAD-TO-TEN.md` is built on its output.

After a capture run, `md5sum docs/media/certification/ow-*.png | sort -u | wc -l`
must be 16. The first run produced sixteen identical pictures of one screen
filed under eight region names, because `createOverworld` only honours a saved
position when `pos.world === levelId` and the script had omitted `world`.

## How the owner works

- They want the *reasoning*, not just the result. Comments in this codebase
  explain **why**, including what was wrong before — keep that. Several
  bugs this session were found by reading a comment that no longer matched the
  code.
- They ask for measurements, not assertions. "It looks better" is not an answer;
  `tests/qa/*.mjs` are print-only probes that exist to produce the numbers.
- Report failures plainly. If something is unfinished, say so.

## Traps

Each of these produced a green suite that was lying.

**1. Assert directions in world space, never as the sign of an angle.**
`tests/game/actor-anim.spec.mjs` used to assert `armR.rotation.x < -1.2` for
"windup raises the arm". That is satisfied *equally well* by a hero who winds up
in front of their own face and strikes behind their back — which is exactly what
the game shipped, on every melee weapon, until the owner noticed in a
screenshot. A radian has no opinion about which way an actor is facing. If an
assertion claims a direction, it must yaw the actor and measure a world
position. `tests/qa/swing-readout.mjs` prints the numbers.

**2. A truncated render is perfect silence.**
`tests/audio-render-e2e.spec.mjs` renders the score offline and requires the
quiet windows to fall near zero. An `OfflineAudioContext` render started before
the page has ever had a live `AudioContext` comes back truncated — and five
seconds of digital silence scores a *flawless* 5th percentile. The spec now
asserts the render reaches its intended end **before** trusting any percentile,
and waits on `window.__sovereignScar.player` first. Any statistic over a buffer
must first prove the buffer is complete.

**3. Mean luminance cannot tell "well lit" from "flat".**
A room with a strong key and deep shadows meters *lower* than the same room
under a flat wash, so the cheapest way to pass the certification gate was to
flatten the art. That is how ambient reached 1.7 against a key of 1.9 (and 3.4
in the Abyss), and why Beat 01's tomb has decorative gold-leaf seams. The gate
now bands contrast as well — but note the second half of the lesson: the
statistic has to be measured somewhere the answer actually lives. Measured over
the **full frame**, `p90 − p10` is dominated by the vignette crushing the
corners, reads 58–160 across the campaign, and would pass any floor worth
setting. On a **centre crop** the same statistic reads 14–166 and discriminates.
A new metric is not automatically a better one; check what it responds to.

**4. Deleting the call is not deleting the feature.**
When the mood drone was removed, the `drone:` field stayed in `MOOD_PRESETS` —
so the next reader would reasonably conclude it was meant to be playing and wire
it back up. Remove the data too, and add the spec that fails if it returns.

**5. The place being measured is the one place that is fine.**
This project's most expensive recurring bug, and it has now happened three
times:

- The sun's shadow frustum sat on the world origin and never moved, so exactly
  one room per dungeon had sun shadows — and every dungeon starts at grid (0,0),
  so it was always the first room you saw. The overworld was worse: **0 of 49
  screens**, at world coordinates 512–896, never counted by anything.
- The luminance gate samples the room a level **loads into**. Boss rooms — half
  the campaign's most-looked-at rooms — had never been measured at all, and four
  of fourteen turned out to be outside their band.
- The gate samples the overworld on its **start screen in its default state**.
  That screen is one of the pale crust ones, so the Spindle sitting at 32
  against a floor of 45, and every Abyss screen sitting at 18–27 against a floor
  of 35, were invisible for the life of the project.

Whenever you check a property that varies by place, sweep **every** place. A
spot check lands on the sample that was chosen because it was convenient, and
convenient usually means representative of nothing.
`tests/shadow-frustum-e2e.spec.mjs` is the shape to copy; reverting that fix
fails 31 of its 50 assertions.

**6. `src/engine/lights.js: updateShadowFollow` is bait.**
It looks exactly like the fix for trap 5 and it is not: it takes a single
`cameraX` and pins the target's Z to zero, a leftover from the engine's 2.5D
side-scroller origins. Wiring it up fixes one axis and silently breaks the other.
Locked Decision **D5** in `ENGINE_PIN.md` forbids editing engine code, so it
cannot be deleted — `tests/shadow-frustum-e2e.spec.mjs` fails if game code
imports it. Aim the sun from game code (`MoodController.aimKeyLight`).

**8. A green gate is not a good picture, and this file has said so twice.**
The luminance band was on full-frame mean, which A/B measurement showed is
mostly the vignette: easing the vignette moved full-frame mean 58 → 111 while
the lit part of the frame moved 84 → 98. Worse, after the band was honestly
re-derived on the centre crop, every level passed comfortably *and the frames
were flat and milky* — because global light had been raised on top of newly
added local light, and the normal perturbation was strong enough to read as
smoke. It took looking at `beat-01-crypt-entry.png` to see it; nothing in the
suite could have. Traps 3 and 5 in this file are the same lesson about
different statistics. **When you change how the game looks, open the captures.
Then change the number.**

**31. One function, two questions: "is there ground" is not "may I be here".**
`surfaceTop` finds a solid with head room above it. `CollisionWorld.blocked` says
whether the body may occupy an (x,z) **at any height — it is height-blind by
design and has no Y in it at all**. The roof of a perimeter wall answers yes to
the first and no to the second, and for a long time only the first was asked: 30
arrival points across the campaign stood the hero somewhere every horizontal move
is refused. Ask both, always, and keep them as separate functions (`groundY` and
`canStand`) so a caller cannot accidentally ask only the cheap one — the overworld
did exactly that mid-fix and put the player on a rock's roof, and `world-e2e`
caught it.

Two riders, both of which cost a debugging round:

* **A search that accepts any standable cell will accept the roof of the thing it
  is escaping.** The overworld monolith is three cells tall with no XZ solid, so
  "nearest free cell" stepped one across and landed on top of it. Rank by ground
  height first, distance second.
* **Placement lands on cell seams unless you snap.** Cells are corner-anchored,
  `doorWorldCenter` sits on a half-cell, and the step inward is a whole 2.5 — so
  every door in the game arrived on a `.0` coordinate with the body half in each
  neighbour. 526 of 528. `resolveMove`'s already-overlapping branch then ejects
  toward opposite faces on alternate frames, which reads as being stuck rather
  than as being blocked.

The seam snap has **no failing counterfactual of its own** once the body test is
in: `nearestFreeEntry` relocates the harmful cases anyway. It is kept as
prophylaxis and is labelled as such rather than claimed as a fix.

**30. Three rooms spawn the player inside the world. Still true.**
`beat-05-citadel/monolith`'s spawn column reads `111111111` — solid rock top to
bottom, because the room's centre *is* the monolith. `beat-12-pyre/ashgallery`
reads `111100000`, inside a four-high pillar. `beat-03-sink/hollow` reads
`000000000`, open void with the nearest ground three cells away.

Room entry no longer lands anyone there (see below), but the **authored `spawn`
coordinates are still those points**, and `level.spawn` is built from
`startRoom.spawn` with a hardcoded `y: 1.95` before any room is baked, so it
cannot self-correct. Every path that reads a room's spawn rather than going
through `startTransition` is unaudited: dev jumps, mirror travel, and whatever
respawn does in a room-graph level. **This is open work, not a closed item.**

What chasing them *did* find: `enterRoom`'s guard against materialising inside
geometry asked "is cell 0 solid and cells 1 and 2 clear" — the flat-floor game
this was before Phase E2. On a terrace cells 1 and 2 are solid *because it is a
step*, so every raised surface read as unusable, the search fell through to its
null fallback, and the next line placed the hero at a hardcoded `y = 1.95` inside
whatever they were on. Scanning for the surface instead took usable landing spots
in `ashgallery` from 165 to 285 of 289. **Trap 24, third occurrence.**

And a caveat worth keeping: that fix is reasoned, measured on the predicate, and
suite-green — **not play-verified**. The probe written to drive real door
transitions fired **0 of 188** (placement lives in `startTransition`, behind a
door trigger and a camera the harness did not supply). It was deleted rather than
shipped, because a probe reporting "0 buried" while driving nothing is worse than
no probe. Finishing it is the obvious next job.

**Update — that job is done, and it was not enough on its own.** Splitting the
arrival maths out as `level.arrivalPoint(to, from)` let `tests/qa/entry-safety.mjs`
sweep all 528 arrival points across 14 dungeons and the overworld by calling the
real function, and the owner's case was walked in the browser through the real
door trigger. See trap 31 for what the sweep found. `level.spawn`'s hardcoded
`y: 1.95` named above is gone — it is measured after the start room bakes — but
**the three authored `spawn` coordinates are still inside geometry**, so the rest
of this trap stands.

**29. A fixture that cannot fail is not a fixture.**
The fix: the soft-occupancy predicate `settle` consults knew about pickups and
enemy spawns and **never about the hero**, so 10 puzzle pieces stood on a room's
spawn — two of them dead centre (beat 08's `gravecanopy`, beat 12's `slagworks`,
switches at exactly 0,0). The player materialises inside the post. The owner
reported it as "the other room does not even have a switch", which is precisely
right: you cannot see a switch you are standing in.

The lesson is the spec, not the bug. My first assertion for it baked
`BEAT_LIST[0]` — plate-flavoured, never had a piece on a spawn — so it **passed
with the fix reverted**. Only the counterfactual caught that. Before believing a
new spec, ask which fixture exhibited the defect and use *that* one; a green test
over a sample that was always clean is worse than no test, because it reads as
coverage. This is the third variety of the same mistake in this file (trap 5 spot
checks, trap 26's per-side rule tested on the padded side).

Same run, same shape, in the probe: `switch-works.mjs` first called
`shatterAtWorld` at the switch's own coordinates. Distance zero always clears the
2.0 gate and tests nothing a player can do — it now throws the strike from
standable ground, projected 1.2 ahead the way `_strike` does.

**28. Measure the sentence the owner said, not the sentence you can already test.**
Four reports said "locked in when I enter the room". I measured alcove mouths,
interiors, push routes, heights, gate logic — every one a real defect, none of it
the thing said. `tearwell` built its reward alcove **at gap 0 from its east door**:
walk in from `weepinghall` and you stand in a pocket of **five lattice points**.

The corner search tests the footprint and an apron against props, terraces,
pickups and reachability, and had **never looked at a door**. It could not catch
it by accident, either: the apron is inward-only on purpose, because an outward
apron of solid-geometry tests hits the room's perimeter wall and disqualifies
every corner in every room — and doors are on that perimeter. The one side that
mattered was the one side never tested.

**And a sweep I had already written was hiding it.** `puzzle-solve.mjs` floods
from the spawn *and every door*, merged into one field. A door sealed off by the
alcove becomes its own island and still counts as reachable — merging the seeds
destroys the only question worth asking. `door-reach.mjs` floods **one seed at a
time**: 108 rooms, 196 doors, 5 locking you in, now 0.

Two habits from it. **Island size separates a bug from a design** —
`tearwell`'s was 5 lattice points, `weepinghall`'s three doors report 2161 (135
square units, the far bank of a grapple chasm whose hint says "Cross on the
anchors"). A coffin is not a bank; report the large ones separately for a human
rather than counting them as failures. And **when the owner repeats themselves,
the repetition is the datum** — that the same sentence came back four times meant
my model of it was wrong, not that they were unclear.

**27. The state nobody wrote a branch for is where softlocks live.**
The timed gate's update was two branches: signal on → open, nobody in the way →
close. Signal off **and** player already inside ran *neither*, so a gate that had
shut stayed shut forever. That silent third case is the "stuck in a locked spot"
of three separate play reports, and no probe could see it because it is not a
property of the geometry — it is a hole in a state machine.

How the player got behind it is trap 26's half-cell again. The guard read
`lx >= clear.x0 - 1 && lx <= clear.x1 + 1`, which *looks* symmetric and is not: a
rect of cells `x0..x1` spans world `[x0, x1 + 1]`, so `x1 + 1` is the exact edge
and the high side had **zero** margin before you even add the hero's 0.4 body. A
hero 0.2 short of the gate's cell still overlaps it, so the gate rose *through*
them, lifted them two cells onto its roof, and dropped them into an alcove with
two-high walls and a one-cell step limit.

It hit two of every three puzzles — `CORNER.teach` and `CORNER.develop` are both
`sz: -1`, so `gateZ` is `z1`, the unpadded edge. The spec that covered this used
a fixture with the gate on the *padded* edge, so it passed the whole time.
**When a rule is derived per-side, the fixture must use the side the campaign
actually ships.**

The lesson worth more than the fix: **I found this by running the game and
reading the player's y.** Three probes and a full green suite said the campaign
was clean. `window.__sovereignScar` exposes `game`, `player`, `level` and
`collisionWorld`; the level has `puzzleDefs(roomId)`, `getVoxelAt`, `sealState`
and `puzzleBlocks`. If the Browser pane is not displayed the page does not
composite, so `requestAnimationFrame` never fires and nothing ticks — drive it
with `level.update(1/60, game)` by hand.

**26. Fix the door and the same number is waiting one step further in.**
Trap 25's alcove mouth was widened from one cell to three and measured: 0.10 of
clearance a side became 1.10. The owner came back **still stuck**. The side walls
stand on the alcove's *outermost columns*, so a three-wide alcove encloses a
**one-cell interior** — the player now walked through a 3.0 doorway into a 1.0
room with, exactly, **0.10 of clearance a side**. The fix had been applied where
the complaint pointed and nowhere else.

A clearance bug is a property of a **route**, not a place. Whatever produced the
tight gap — walls derived per-side, a footprint measured in cells — is still
producing them further along. When one lands, measure the whole route: approach,
doorway, interior, and the way back out.

The fix worth copying is the *shape* of it. The alcove sits hard against the
room's own perimeter (`x0` is `-half + 1`; the wall is at `-half`), so one of its
two side walls was built one cell in front of a wall that already existed. It
sealed nothing and cost the entire interior. Deleting it doubled the space at
**zero** change to the footprint. Enlarging the footprint instead was tried and
measured worse: three corners disqualified, a fourth puzzle unsolvable. **Prefer
removing redundant geometry to growing the thing.** (And the width must be ODD —
`cx` is the midpoint every loose piece is placed against, and `settle` is
integer-grid end to end. Width four bakes *zero* puzzles campaign-wide.)

**Two probes lie in ways worth knowing.** `puzzle-solve.mjs` was wrong three
times before it was right: it sampled at `origin + z`, which is the **seam**
between two rows (cell `(x,z)` is the box `[x, x+1]`, so its centre is `x + 0.5`
— `rectW` knows this, `W` does not); it tested the push stance at a single point
0.05 clear of the block and the lattice rounded it 0.05 *inside*, making 25 of 38
puzzles look unshovable; and it walked the hero **straight across a chasm**,
because the collision world holds XZ solids and **a hole is not a solid**.
Reachability needs ground *and* width, one-cell climbs, free falls, and seeding
from the spawn **and every door** — that last correction has now been needed
twice, by two probes, against the same room (`weepinghall`).

When a probe says the campaign is clean, draw the one room you know is unusual:
`node tests/qa/room-map.mjs <beat> <room>` prints the voxel field and the
collision world's answer for a 0.4 body side by side. Both findings this session
were a **disagreement between those two pictures** before they were a number.

**25. "The cell is free" is not "a body fits".**
Every reward alcove in the campaign had a **one-cell mouth**: the side walls ran
its full depth, met the open face and left only the middle cell. The hero's
collision half-extent is 0.4, so getting in meant threading a 1.0 gap with 0.10
of clearance either side — five times tighter than anything else in the game,
guarding the reward at the end of all forty-two puzzle beats.

The part to carry: **four separate probes passed over that doorway and kept
passing after it was fixed.** `puzzle-placement.mjs` asked whether each piece's
cell was inside geometry. `puzzle-reach.mjs` asked whether it was standable, and
walk-reachable at the hero's own step height, and clear of the vault, and at a
height a block can be pushed to. Every cell in that mouth was empty, standable
and reachable, and all of that was true and useless, because a grid check
answers *is this cell occupied* and a player asks *does my body fit through
there*. Those diverge exactly where a gap is one cell wide, which is exactly
where a doorway is.

When a report survives a clean sweep, suspect the units. The probes were
counting cells; the complaint was about centimetres. Measure the thing in the
same units the player experiences it in — here, `(cells × 1.0 − 2 × 0.4) / 2`
— and the bug is a one-line calculation you can read off a table.

**24. A system added in one phase does not know about the phase before it.**
Phase E2 put terraces in every room. Phase D wrote the enemy mover. The mover
resolves X and Z against the collision world and never writes Y at all — and
terraces live in the PLATFORM map, meshed deliberately *without* XZ solids so a
step stays standable and can never wall anything off. So the single kind of
geometry an enemy could walk into was the single kind neither half of its
movement code could see: it did not climb a terrace, it walked inside one and
stood there submerged, which is unreadable, unhittable, and what the owner
photographed.

Three things worth carrying:

*The pattern is older than this bug.* `room-graph.js` already lifts PICKUPS out
of terraces for the same reason, with a comment saying so — twelve of them were
buried, including three small keys and a boss key. The lesson did not
generalise from pickups to bodies because nobody asked what else in the room is
placed by a table that predates the terrain.

*Placement is not locomotion.* The first fix used one rule for both and left
four bodies buried: a body already standing inside a three-high terrace is not
trying to climb it, and the step limit that correctly stops a chaser scaling a
cliff also correctly refuses to lift that body out, forever. `seatOnGround`
ignores the limit; `_followGround` obeys it.

*And it does not fail alone.* A submerged enemy cannot be hit, a sealed room
waits for its enemies to die, and the stalemate valve that exists for exactly
this resets whenever the player's HP changes — so a room that could still hurt
you but never be resolved held its door hardest precisely when the player was
helpless. **Ask what the failure is upstream of.** The valve keeps its shape;
a longer clock now runs underneath that nothing resets while the room is sealed.

**23. An alarm wired to a demo is not wired to the building — and an uncaught
fix is sometimes unreachable code, not a missing spec.**
Six of the twenty fixes from the first play could be reverted with the suite
green. They came in three kinds, and only the first is what "no spec for it"
usually means.

*Wired to a demo.* Two specs installed the thing under test BY HAND and then
tested it. The terrace spec set `block.blocked` itself, so it proved
`PushableBlock` honours the predicate and proved nothing about anyone handing it
one — deleting the line in `blockers.js` that does left the suite green while
every block in the shipped game forgot terraces existed. Worse, the switch spec
built its own switch literal and hard-coded into it the exact
`struckByAnything: true` the real switch was missing, so it proved every weapon
swings correctly at a switch that has already been fixed. **Both specs were
written in the same session as the fixes they failed to guard.** If a spec
constructs its subject, ask what would happen if the factory stopped building it
that way.

*A model of the thing instead of the thing.* `insideDrawn` recomputed what the
smear draws rather than reading it, so the two agreed by construction and the
lane's near edge could be pushed back out to the reported bug unnoticed. See
trap 21.

*A spec that reads the source tests the source.* The seal's hard-release ceiling
was asserted with regexes over `room-graph.js` — "does the file contain
`sealHeldT += dt`". Neutering the branch to `if (false)` left every one of those
strings in place, so the suite stayed green over a sealed room that could once
again hold the player forever, which is the precise softlock the ceiling exists
to prevent. It is now driven: a real dungeon, a real sealed room, a fight whose
signature changes forever and whose enemies never lose a point, ticked past the
ceiling. **If an assertion can be satisfied by a comment, it is not an
assertion.**

*And a counterfactual that changes nothing tests the sweep, not the suite.* One
case in `cf_fixes.py` "reverted" the smear by appending a comment to a line.
Naturally nothing caught it. When a case comes back UNCAUGHT, re-read the case
before re-reading the specs.

*Unreachable insurance.* `settle`'s two `return []` refusals — and, added this
session, the walkability term in `bakeRoom`'s hard predicate, which the sweep
also reports as UNCAUGHT for the same reason: every cell the corner search
would pick is already reachable in all 42 rooms, because the flood is seeded
from the doors as well as the spawn. It is insurance against future authoring
and is marked as such in the code. The originals: — a piece with
nowhere to go, a block that cannot reach — **cannot be made to fire through
`puzzleFor` on any of the 42 rooms.** 1680 random layouts, 170 blobs and 168
interior-blocked rooms all behave identically with both lines deleted, because
the corner search is handed the same predicate and either relocates the vault or
gives up upstream. That is not a spec gap; it is a fact about the code, and the
lesson is that **UNCAUGHT has two meanings** and they want opposite responses.
Do not write a spec that fakes its way into dead code — say so, and guard the
behaviour that does the work instead (here, `place` relocating pieces, held as
an invariant over hostile input).

**22. A bus that stores a boolean cannot have two writers.**
`SignalBus.set(name, on)` did what it looks like it does: assignment. Every piece
in the kit writes its signal **every frame**, so two pieces sharing a name did
not combine, they raced — and the loser was whichever updated first. The
`develop` beat of every switch-led dungeon is built out of exactly that pairing,
a switch on a four-second fuse *and* a plate a block can hold, either of which
should open the gate. The plate ran second, wrote `false` because nobody was
standing on it, and the switch did nothing at all in **seven of the fourteen
dungeons**. Nothing failed; the switch simply had no effect, which reads in play
as a puzzle you have not solved yet.

A signal is now on while any named **source** holds it, and the default source
keeps every single-writer piece behaving exactly as before. The general form:
*the moment a value has more than one writer, storing the value instead of the
writers makes the update order load-bearing* — and update order is the thing
nobody writes a spec about. The spec for it (`puzzle-kit.spec.mjs`) states it in
both directions, because "any holder turns it on" and "one holder releasing does
not turn it off" are two different claims and only the first is obvious.

**21. The hero is held to the telegraph law too, and was not.**
A whole session went into proving that a boss's ring must be the shape that
resolves. Nothing ever asked the same of the player, and three of the ten player
moves were lying. `ArcSmear` draws a **sector**; `hitboxCheck`'s non-radial path
resolves a **rectangle**; for a short swing those are close enough to pass for
each other and for a long thin move they have almost nothing in common. The Light
Caster's charged lance resolved over a lane 1.8 wide beginning at the player's
feet and was drawn as a wedge beginning 5.6 units in front of them (the fan's
inner radius is 35% of its outer) running out to 16 — off the edge of a top-down
frame. Its ordinary shot drew nothing whatsoever, on a comment saying the caller
would draw it, and the caller never existed. And every melee swing was drawn at a
hard-coded 110° regardless of the angle the weapon was authored at.

Two things to take from it. First, `tests/qa/smear-vs-hitbox.mjs` samples the
ground and reports **over-draw** (colour where the move cannot reach) separately
from **under-draw**; they are not the same sin, and only over-draw must be zero —
under-draw is what makes a fan read as a sword rather than a pie. Second, and
more general: **a claim of the form "at least as wide as" is not a shape claim.**
The spec that guarded the thrust asserted its drawn wedge was at least as wide as
the lane it hit, which bought over-draw at every distance and had nothing at all
to say about the fact that the drawing did not start at the player.

**20. A predicate reused for two questions answers neither.**
`puzzleFor` takes an `isBlocked` and the bake passed it one function covering
walls, props, terraces, nearby pickups and nearby enemies. That union is right for
the **vault**, which builds walls (trap 18). It is wrong for everything else: a
pressure plate three feet from a torch is simply a pressure plate, and treating
"a pickup is near" as "this cell is solid" dropped **eleven of the campaign's
forty-two puzzle beats** the moment the loose pieces started being checked at all.
Hard geometry and soft occupancy are now separate arguments — the first refuses,
the second is a preference with a fallback. If a predicate is being consulted by
two callers with different stakes, it is two predicates.

**19. Only two weapons could work a switch, and the comment said all of them.**
The puzzle switch rides `level.destructibles` with a comment stating that this is
"the one channel every weapon already routes a swing through. Charged strikes,
dash-attacks and the ray all reach it for free." Every clause of that is false:
the player-side loop is gated on `weapon.shatter`, which is true of the Tectonic
Wedge and the Heavy Mallet and nothing else. Switches are the entire puzzle
vocabulary of the seven even-numbered dungeons and three of the five weapons
could not touch one.

Two lessons, and the second is the load-bearing one. A comment asserting how
another file behaves is a **guess about that file** unless something checks it —
this one was written in the same commit as the switch and never verified against
`player.js`. And the reason no spec caught it is that every test of the switch
called `shatterAtWorld` directly, which is testing the switch's own arithmetic.
The question worth asking was never "does the switch work" but **"can the player
reach it holding each of the five things they might be holding"** — and that is a
loop over `WEAPONS`, driven through the real `tryAttack`.

**18. A system added AFTER a room is finished chooses its place blind.**
Twice in one session, and both times the thing it built over was progression.
Puzzle vaults pick a corner; rooms place their pickups inside `onBake`, which
runs long after the room mesh exists — so the first bake walled a **small key**
into beat 13 and a **scar suture** into beat 14. Terraces have the same shape of
problem from the other direction and buried **twelve** pickups including three
small keys and a boss key. Neither is visible from the chair: the pickup does not
look wrong, it is simply not there when you walk to where it should be.

Both are fixed the same way and it is the general fix: **build last, and ask the
room what it has already committed to.** `puzzleFor` takes an `isBlocked`
predicate and gives up its corner (or declines to exist) rather than clipping;
terraced pickups are LIFTED onto the new high ground rather than left inside it.
If you add anything else that places geometry from a table, run it after
`onBake` and give it the same predicate.

**17. A cap and the content it caps live in different files and drift.**
The Memory Vial cap was four. The campaign contains five vials. The fifth one a
player found returned `false`, printed nothing, paid nothing, and looked exactly
like the other four right up to the moment you counted your slots. The same
hard-coded four also sat in the load clamp, so raising the grant cap alone would
have taken the fifth chassis back off a returning player on their next launch.

The fix is not "change the 4 to a 5". It is `MEMORY_VIAL_CAP`, read in both
places, plus a spec that **counts the grant sites out of the level defs** and
fails if the two disagree. Written down twice is written down wrong eventually.

**16. A number in a survey is not a measurement.**
`ROAD-TO-TEN.md` reported fourteen Scar Sutures and a wasted remainder, and
acting on it would have added two the game did not need. Counted from the level
defs there are **eighteen** — the survey missed the four beats whose
`scoreType: 'secret'` pickups convert. The comment in `world7.js` was right and
the plan was wrong.

This cuts both ways and the other direction cost more: the same plan said the
kits declared "28 named prop kinds". There are **56**. Both numbers came from a
careful read of the source by something that could have counted instead.
**Count. Then write the number down with the command that produced it.**

**15. A boss can be alive, lethal and completely stationary.**
Two of them were. The **Kinetic Core** never bounced — `bounceArena` uses a box
of half-extent `radius` (8) and `_clampToArena` pins the body at `arenaRadius`
(7.5), so the boundary that turns it around was unreachable; it drifts to
(7.5, 7.5) in five seconds and sits there for the rest of the fight. The **Magma
Wyrm** froze whenever the player stood near a wall: the strafe ring is centred on
the PLAYER and the clamp is a box around the HOME of the boss, so most of the
ring was illegal — 92% of a sixty-second fight pressed against the clamp, 0.00
units of travel in the final five seconds. Both were invisible because the boss
was still alive, still lethal on contact, still attacking on cooldown, and the
fight still ended. **When two rules constrain the same value and neither knows
about the other, the tighter one wins silently.** `BossBase.strafe()` now injects
the clamp, the home and an orbit centre that has room for the ring; the Core
derives its bounce box from the clamp. `tests/game/boss-movesets.spec.mjs`.

**And two failed guards worth remembering**, both written for the Wyrm before
the real fix: a guard that clamped the *target* but not the *result* detected
nothing, because the step was undone several stack frames later — **a guard has
to run where the thing it guards happens**. And a refusal test that compared the
outcome against the already-truncated step passed every frame while the boss
stood still — **comparing an outcome against a budget the failure already shrank
is how a guard measures its own excuse.**

**14. Every test asks whether the player can win. Ask whether they can lose.**
`TriCompiler` — the only boss that does not extend `BossBase` — called
`this.hitPlayer(...)`, a method it does not have. Its single damage line threw on
every beam contact, so **beat 02's boss could not hurt the player at all**, and
the suite was green at 2940 with it. Nothing could have caught it: `boss-e2e`
asserts every boss can be KILLED, `time-to-kill` measures how fast, and
`boss-reach-e2e` proves you can reach it — not one assertion asked whether a boss
can land a blow. From the chair the throw is invisible; it aborts the update at
the moment the beam would connect, which looks exactly like a beam that missed.
**A fight you cannot lose reads as a fight you are good at.** `hitPlayer`'s body
is now the free function `bossHit`, shared by the base and the one class that is
not a subclass. `tests/game/boss-lethality.spec.mjs` sweeps all fourteen.
Whenever a system is only ever exercised from one side, the other side is
untested by construction — ask what the inverse claim would be.

**13. A telegraph drawn one size and resolved another is invisible.**
`startAction` forwarded to `telegraphShape` only the shape parameters the first
two shapes needed, so every boss that authored a `halfAngle` or `innerRadius`
drew the DEFAULT while its `strike` tested the AUTHORED value. Four shipped that
way: Mantis `slice` drew 90° and hit at 137°, Warden `sweep` drew 90° and hit at
120°, Wyrm `breath` drew 90° and hit at 52°, Warden `ground-crack` drew a 3.83
safe hole against a real one of 3.40. No crash, no failing assertion, and the
only symptom that reaches a player is "this boss feels unfair" — which gets
answered by nerfing damage instead of fixing the lie. Note the Wyrm: over-drawn
is **not** the merciful version, because ground painted lethal that turns out to
be safe teaches the player that the telegraphs here are approximate, and then
the honest ones stop being trusted. **A telegraph's colour is part of its
claim too.** A ring means the opposite of a circle, so it is drawn in `TELL_BAND`
+ `TELL_SAFE` and **ignores the casting boss's tint** — enforced in
`telegraphShape`, because fourteen kit authors each re-colouring the one reversed
instruction is how it stops being readable (owner's call 2026-07-27). And a
telegraph's ANIMATION is a claim: growing the ring outward painted the refuge red
for the first half of every wind-up, because scaling an annulus scales both
edges. It holds still now. **An animation that is wrong for half its life is
worth less than a shape that is right for all of it.**

**A shape parameter must exist in exactly
one place, read by both the picture and the rule** — the cones now carry it in
`aim` and `strike` reads it back out.

**And it was worse outside the boss roster.** `Enemy` — the other 119
encounters — drew its marker 0.9 units AHEAD of the body (via an option named
`reach`, which means melee reach everywhere else in that class, so 0.9 looked
right at both sites that passed it) while `_resolveMelee` measured from the body
CENTRE. Behind a sentinel was lethal and unpainted; the front edge of the
painted ground was safe. Its ring was the same middle-50%-clear donut, so the
safest-looking spot in the marker — dead centre — was fully lethal too. And even
with the offset removed, the body is nudged **0.29 units by separation inside
the very update that commits the attack**, so "measure from the body at strike
time" was never the painted ground. The marked circle is now stored as data on
the ATTACK and resolved against. This matters because the game's first coaching
line promises, verbatim: *"That ring is where the blow will land, not where it
started."*

**The near-miss inside that fix is the lesson worth keeping.** The mark was first
stored beside the ring mesh in `telegraphAt` — and a ring's life is exactly the
wind-up, so it had been disposed by the frame the strike resolved. The change did
nothing in the running game, and the spec passed because it called the resolver
by hand while the ring was still up. **A spec that pokes a resolver is not
testing the game; drive the wind-up to resolution.** `tests/game/telegraph-truth.spec.mjs`
sweeps every cone in the roster (trap 5) and asserts behaviourally: read the
wedge that was DRAWN, then ask the boss's own `strike` about a player a hair
inside and a hair outside it. Asserting "the call site passes halfAngle" would
have restated the fix and passed on a build where `inCone` ignored it.

**12. A counterfactual that no-ops launders a guess into a verified fact.**
Trap 10 says revert the fix and watch the spec fail. That is only worth
anything if the revert *happened*. Reverting `Math.max(...)` to `a * b` in
`combat-sweeper.js` reported **18/18 still passing** — which would have meant
`tests/game/weak-points.spec.mjs` could not catch the one mistake it exists for.
It hadn't: the `perl` substitution's multi-line pattern never matched, the file
was never written, and the "counterfactual" was the unchanged build passing
itself. Re-run with a patch that asserts `old in s` before writing, the product
version fails four assertions, two reading `took 4`. The same session, the
opposite failure: a habit assertion "passed" its counterfactual at 2018 vs 1982
draws — a bare `>` on two noisy counts is a coin, not a test; both claims now
demand a 1.5× margin. **Assert the patch applied before trusting the run, and
give every comparison a margin wider than its noise.** Related: an assertion
that cannot fail is not a test — `t.ok('…', true, …)` and "every stinger note is
in key" (`scaleNote` maps *any* degree onto a scale tone) were both deleted, not
fixed.

**11. Scaling a boss's art does not scale where the player can stand.**
`presenceScale` multiplies the mesh and `hitRadius` together, which is why it
looks safe. It is not, because a base `hitRadius` is usually chosen against the
boss's CORE while the silhouette is limbs — so scaling multiplies the GAP too.
Measured, the Arachnid's visible edge reached 3.79 while damage stopped at 4.10:
a 0.31-unit band in which the player is outside the model and can still land a
blow, against a campaign median of 1.49. The natural melee standoff is ~2 units,
so every comfortable place to stand was inside the boss. The two bosses that
failed were the two scaled hardest. **The number that matters is
`maxHitDistance - visibleEdge`, and neither term is visible from the other's
file.** `tests/boss-reach-e2e.spec.mjs` measures it for all fourteen.

Corollary, and the reason this trap is separate from trap 9: this is the SECOND
time "you have to stand inside it to hit it" has been reported about the same
boss, with two unrelated causes (a blanket `shielded` in phase 1, then this).
A fixed symptom is not a fixed class — when a report recurs, re-measure rather
than assuming the old fix regressed.

**10. A dev toggle that touches combat will change the rules of combat.**
God mode wrapped `player.health.damage` and returned `{accepted:false}` before
calling through. `damageFilter` lives *inside* `HealthPool.damage`, and
`damageFilter` is `GuardController.resolve` — so god mode silently disabled the
**parry**, a bulwark's plate could never drop, and a sealed room held the player
against something that could neither hurt them nor be hurt (89 wind-ups, 0
staggers, 0 damage, door shut). The same wrapper had already broken combat once
before by taking `(n, iframes)` and dropping the `meta` the directional guard
reads. **Anything that intercepts `health.damage` must let the filter run.**
God mode is immortality, not a different game. See `installGodDamageWrapper`.

**And the test lesson underneath it:** the first draft of
`tests/game/god-mode-combat.spec.mjs` reproduced the wrapper's body, because
`DevMode` builds DOM on construction. Reverting the real fix left **19 of 23
assertions green** — they were exercising the copy. The wrapper was extracted so
the spec imports it. **A spec that reproduces the logic it guards passes
whatever the shipped code does.** Always revert the fix and watch the spec fail
before believing it.

**9. Two correct rules can meet on one enemy and produce a dead fight.**
A `bulwark`'s plate refuses attacks from its front cone. A `ranged` enemy is
answered by holding the shield, not by parrying, so its bolt is reflected before
it ever reaches `health.damage`. Both are right. Authored together — which three
rooms do — they cancelled: the parry could never fire (**0 staggers in 100s of
perfect taps**, against 17 in melee), and the returned bolt arrived from the
front, where the blocking player is standing, so the plate ate it (**49 clangs,
0 damage**) while the on-screen hint promised that bolt would kill it. Neither
rule is visible from the other's file, and neither has a test that would notice.
The full suite was green throughout. **When a kind trait and an AI trait are
independently selectable, the matrix is the unit — enumerate the combinations
the campaign actually authors and play each one, rather than testing the traits
one at a time.** `tests/game/reflect-armor.spec.mjs` does this for the pairing
that bit; it is not general. Related: trap 2 — the thing being measured is the
one place that was fine.

**7. `three.js` euler order is `Rx·Rz·v` for `'XYZ'`.**
Relevant every time you touch `pose-library.js`. The arm hangs along `−Y` from
its shoulder pivot, so arm direction is
`(sin rz, −cos rz·cos rx, −cos rz·sin rx)`. Rig-local **`+Z` is forward**,
because `player.js` sets `rig.rotation.y = atan2(fv.x, fv.z)`. The arm therefore
points forward only when `rx` is **negative**, and only `rz` carries lateral
motion — a swing with `rz = 0` is a vertical chop and cannot read as an arc.

## Map

```
src/game/
  world/        room graph, keys, blockers, level builder, threat curve
  overworld/    7×7 world + screens
  audio/        score engine (theory, instruments, tracks) + sfx bank
  combat/       sweeper, weapons, grapple, guard/parry, lock-on
  characters/   actor rigs (named pivots incl. hand/handL), animator, poses
  bosses/       framework + 14 bosses
  levels/       overworld + sandbox + 14 dungeon defs + dungeon kits
  render/       material families, prewarm, surface detail, shadow roles,
                frame-luminance stats, procedural mood environment (PMREM)
  fx/           mood controller, held weapon/shield, contact shadows, smears
  ui/           HUD, story, menus, map, ending, coach hints
tests/          unit + browser E2E
tests/qa/       PRINT-ONLY probes: swing, audio envelope, score, luminance,
                time-to-kill, difficulty curve
docs/           ARCHITECTURE, CONTROLS, API, VISUAL_PLAN
```

Key documents: `CHANGELOG.md` (why things are the way they are — read the
Unreleased section), `Key.md` (design reference), `ZeldaLevel.md` (per-dungeon
audits), `docs/ARCHITECTURE.md`, `BUILD_LOG.md`.
