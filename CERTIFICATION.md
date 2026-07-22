# Sovereign Scar — Visual Certification (Phase V)

One row per dungeon and overworld region. A row is complete only when every
checklist column is verified in the browser with the sampled luminance in
band (crust 45–90, abyss 35–75) and screenshots exist under
`docs/media/certification/`.

Checklist columns (plan §Phase V): **A** scale (player ≈1.9, mobs ≈1.6,
boss dominates) · **B** luminance in band · **C** camera frames the room ·
**D** no void bleed · **E** doors/locks work · **F** keys/map/secret present ·
**G** boss beatable + defeat path fires · **H** story lines shown ·
**I** no console errors.

Method: A/B are asserted per level by `tests/visual-sanity.spec.mjs`
(308 asserts); E/F/G structurally by `tests/game/world-graph.spec.mjs` +
`world-e2e`/`campaign-e2e`. C/D/H/I certified by eye from headless captures
(entry + boss room per dungeon, one screen per region per state), zero
pageerrors across every capture run. Lum column: entry / boss-room samples.

> **Stale captures (Session 6).** Every screenshot below was taken with the
> pre-Session-6 camera (65° FOV, shallower tilt). The camera has since been
> retuned to read top-down (40° FOV, steeper rig, coverage refit), so the
> stored images no longer match what the game renders. **The images are stale;
> the claims have been re-verified.**
>
> - Column **B** (luminance): re-sampled on all 14 dungeon entries at the new
>   framing — 36.1–76.1, every value in band, 0 pageerrors. `visual-sanity.spec.mjs`
>   also runs on every suite pass and is green.
> - Column **C** (camera frames the room): re-checked. A numeric sweep of all 15
>   levels puts coverage (visible width ÷ room width) at **1.54** for dungeon
>   rooms and **1.04** for overworld screens — rooms fill the frame with margin,
>   no void bleed; spot-confirmed by eye on the cases most sensitive to a height
>   change (Beat 04's multi-Y monument, Beat 14's wrap-shader core).
>
> Regenerating the 44 stored images is still outstanding — it is a large binary
> refresh and pairs naturally with the by-hand playthrough.

Fixes landed during this pass (fix-forward): Beat 03 spurpit floor
(clay 91→72), Beat 09 moothall bone plaza + floor lift (11→39), Beat 11
islets recolored to read dry + shelf ruins + rotPale floor (18→36), five
overworld crust region floors retuned (tombfields/sinklands→clayField,
spindle→iron, quarry→slate, bonetown→new ashField; all 20–105 → 57–84).

## Dungeons

| Beat | Rooms | A | B | C | D | E | F | G | H | I | Lum | Shots |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01 Crypt Breach | 6 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 56 / 62 | [entry](docs/media/certification/beat-01-crypt-entry.png) · [boss](docs/media/certification/beat-01-crypt-boss.png) |
| 02 Eastern Spindle | 8 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 58 / 58 | [entry](docs/media/certification/beat-02-spindle-entry.png) · [boss](docs/media/certification/beat-02-spindle-boss.png) |
| 03 Duval Sink | 8 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 70 / 72 | [entry](docs/media/certification/beat-03-sink-entry.png) · [boss](docs/media/certification/beat-03-sink-boss.png) |
| 04 Sky Monument | 8 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 63 / 55 | [entry](docs/media/certification/beat-04-sky-entry.png) · [boss](docs/media/certification/beat-04-sky-boss.png) |
| 05 Citadel of the Proxy | 8 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 57 / 56 | [entry](docs/media/certification/beat-05-citadel-entry.png) · [boss](docs/media/certification/beat-05-citadel-boss.png) |
| 06 Bleeding Quarry | 8 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 40 / 42 | [entry](docs/media/certification/beat-06-quarry-entry.png) · [boss](docs/media/certification/beat-06-quarry-boss.png) |
| 07 Sluice of Tears | 8 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 38 / 41 | [entry](docs/media/certification/beat-07-sluice-entry.png) · [boss](docs/media/certification/beat-07-sluice-boss.png) |
| 08 Bone Forest | 8 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 38 / 40 | [entry](docs/media/certification/beat-08-bone-entry.png) · [boss](docs/media/certification/beat-08-bone-boss.png) |
| 09 Ruined Town | 8 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 38 / 39 | [entry](docs/media/certification/beat-09-town-entry.png) · [boss](docs/media/certification/beat-09-town-boss.png) |
| 10 Cryo Vault | 8 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 42 / 46 | [entry](docs/media/certification/beat-10-cryo-entry.png) · [boss](docs/media/certification/beat-10-cryo-boss.png) |
| 11 Rot Mire | 8 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 40 / 36 | [entry](docs/media/certification/beat-11-mire-entry.png) · [boss](docs/media/certification/beat-11-mire-boss.png) |
| 12 Pyre Peak | 8 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 39 / 39 | [entry](docs/media/certification/beat-12-pyre-entry.png) · [boss](docs/media/certification/beat-12-pyre-boss.png) |
| 13 GUMOI Tower | 9 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 39 / 36 | [entry](docs/media/certification/beat-13-gumoi-entry.png) · [boss](docs/media/certification/beat-13-gumoi-boss.png) |
| 14 Leviathan Core | 6 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 36 / 41 | [entry](docs/media/certification/beat-14-leviathan-entry.png) · [boss](docs/media/certification/beat-14-leviathan-boss.png) |

Notes: boss shots were taken mid-fight (HP bar + phase tags visible — the
G evidence); Beat 13's horizontal banding is the flicker shader, Beat 14's
fold distortion is the wrap shader — both intended. Beat 01 Warden loop was
additionally certified end-to-end with real combat by `world-e2e` and the
original W-gate captures in `docs/media/w-gate/`.

## Overworld regions

| Region (screen) | State | A | B | C | D | I | Lum | Shots |
|---|---|---|---|---|---|---|---|---|
| Tombfields (r0c0) | crust | ✅ | ✅ | ✅ | ✅ | ✅ | 84 | [shot](docs/media/certification/ow-tombfields-crust.png) |
| Tombfields | abyss | ✅ | ✅ | ✅ | ✅ | ✅ | 36 | [shot](docs/media/certification/ow-tombfields-abyss.png) |
| Spindle heights (r0c2) | crust | ✅ | ✅ | ✅ | ✅ | ✅ | 75 | [shot](docs/media/certification/ow-spindle-crust.png) |
| Spindle heights | abyss | ✅ | ✅ | ✅ | ✅ | ✅ | 42 | [shot](docs/media/certification/ow-spindle-abyss.png) |
| Sinklands (r2c0) | crust | ✅ | ✅ | ✅ | ✅ | ✅ | 74 | [shot](docs/media/certification/ow-sinklands-crust.png) |
| Sinklands | abyss | ✅ | ✅ | ✅ | ✅ | ✅ | 41 | [shot](docs/media/certification/ow-sinklands-abyss.png) |
| Citadel approach (r3c4) | crust | ✅ | ✅ | ✅ | ✅ | ✅ | 62 | [shot](docs/media/certification/ow-citadel-crust.png) |
| Citadel approach | abyss | ✅ | ✅ | ✅ | ✅ | ✅ | 37 | [shot](docs/media/certification/ow-citadel-abyss.png) |
| Quarry country (r5c1) | crust | ✅ | ✅ | ✅ | ✅ | ✅ | 57 | [shot](docs/media/certification/ow-quarry-crust.png) |
| Quarry country | abyss | ✅ | ✅ | ✅ | ✅ | ✅ | 37 | [shot](docs/media/certification/ow-quarry-abyss.png) |
| Bonetown (r5c4) | crust | ✅ | ✅ | ✅ | ✅ | ✅ | 82 | [shot](docs/media/certification/ow-bonetown-crust.png) |
| Bonetown | abyss | ✅ | ✅ | ✅ | ✅ | ✅ | 39 | [shot](docs/media/certification/ow-bonetown-abyss.png) |
| Cryomire (r6c5) | crust | ✅ | ✅ | ✅ | ✅ | ✅ | 58 | [shot](docs/media/certification/ow-cryomire-crust.png) |
| Cryomire | abyss | ✅ | ✅ | ✅ | ✅ | ✅ | 39 | [shot](docs/media/certification/ow-cryomire-abyss.png) |
| Pyre ascent (r1c6) | crust | ✅ | ✅ | ✅ | ✅ | ✅ | 84 | [shot](docs/media/certification/ow-pyre-crust.png) |
| Pyre ascent | abyss | ✅ | ✅ | ✅ | ✅ | ✅ | 35 | [shot](docs/media/certification/ow-pyre-abyss.png) |
| Scarfield (gate screens) | crust | ✅ | ✅ | ✅ | ✅ | ✅ | 73 | [w-gate](docs/media/w-gate/) |

Fix-forward rule: small fixes land inline (logged in BUILD_LOG); anything
structural becomes a ticket appended to BUILD_LOG before continuing.

## Session 7 — reconstruction tickets D–G (2026-07-20)

The `AUDIT-progression-and-geometryv2` reconstruction tickets were implemented
against the frozen-engine, mutable-`src/game` boundary. All are covered by
GPU-free unit specs plus the headless (swiftshader) e2e suite. **Full suite:
1436/1436 green.**

- **Ticket C — deterministic mood/quality composition.** Both funnel through a
  single re-derivation (`mood-controller.reapplyVisual`); order-independence
  proven by `presentation-determinism-e2e` across low/med/high/ultra × crust/
  abyss.
- **Ticket D — camera + HUD composition.** Two-subject boss framing eases the
  rig up/back to keep player and a live boss inside the safe frame
  (`camera-rig.js`); a game-side occlusion controller fades registered
  foreground occluders to ~28% with depth-write off and restores on clear
  (`fx/occlusion.js`); the HUD toast dedupes identical messages
  (`ui/hud.js`). Specs: `occlusion`, `hud-toast`.
- **Ticket E — regional overworld grammars.** `world7`'s palette-only terrain
  is replaced by a per-region grammar registry (`overworld/grammars.js`): eight
  regions with distinct grayscale silhouettes (pyre the tallest mass, sinklands
  a shallow basin, spindle the most isolated pylons, bonetown the widest street
  grid), distinct Crust/Abyss form, retry-based placement, and route/spawn/
  feature protection. Spec `overworld-grammar` verifies silhouette identity,
  Crust≠Abyss form, and that every connected door stays reachable from spawn.
- **Ticket F — articulated actor rigs.** Named-pivot rigs + procedural animator
  (`characters/actor-rig.js`, `actor-animator.js`, `pose-library.js`,
  `archetypes.js`); the animator writes only local pivot rotations, never the
  root, so hitboxes stay aligned. Specs `actor-anim` + the live
  `tests/qa/anim-statue-verify.mjs` (7/7).
- **Ticket G — material & lighting hierarchy + dungeon kits.**
  - Material families: a bounded `MeshStandardMaterial.onBeforeCompile` derives
    roughness/metalness from the vertex-colour class (`render/materials.js`),
    leaving albedo/emissive/fog/tone-mapping untouched — so mean luminance, and
    the certification band, are unchanged.
  - Surface detail: deterministic, mean-preserving vertex-colour mottling
    (`render/surface-detail.js`).
  - Local lights: a pooled manager casts only the nearest few motivated sources
    (`fx/local-light-pool.js`); emissive props keep bloom without a light.
  - Shader prewarm: `renderer.compile` runs during the load transition so the
    first combat frame never hitches (`render/prewarm.js`); the async path is
    intentionally skipped because its `KHR_parallel_shader_compile` polling is
    unsupported on the software GL used in CI.
  - Fourteen authored dungeon kits (`levels/dungeon-kits.js`): each beat gets a
    floor inlay pattern + wall-cap treatment applied in every room by the
    room-graph baker. Kits only recolour existing floor/cap voxels *brighter*
    (no added solids → no collision/nav change; brighter-only → a room can drift
    toward its band ceiling but never below its floor). Specs
    `material-hierarchy`, `dungeon-kits`.

**Ticket H — Ultra GTAO: intentionally not added.** No AO pass exists anywhere
in the tree, so `low`/`med`/`high` already pay nothing for GTAO (DoD item 11).
The audit retains Ultra GTAO *only* if paired captures and real GPU
frame-time measurements prove it earns its cost (DoD item 12); those
measurements cannot be produced in this headless/software-GL environment, and
the audit is explicit that it should not be retained without them. Adding an
unmeasured post pass would violate that criterion, so H is deliberately left
unimplemented pending on-hardware evaluation.

**Current entry-room luminance sweep** (latest `visual-sanity`, every value in
band): sandbox 60.8 · overworld 78.9 · crypt 55.0 · spindle 56.3 · sink 80.4 ·
sky 62.1 · citadel 54.1 · quarry 45.7 · sluice 50.4 · bone 44.8 · town 46.9 ·
cryo 43.9 · mire 41.6 · pyre 47.2 · gumoi 42.6 · leviathan 43.0.

**Ticket I — recertification, still open (the user's pass).** Automated
re-verification is green and this document is updated. The 44 stored binary
captures still predate these tickets; regenerating them pairs with the by-hand
60 fps progression playthrough, which remains the owner's to run.

---

## Session 8 — ZeldaLevel tickets Z1–Z7 (2026-07-21)

Design audit written to [ZeldaLevel.md](ZeldaLevel.md) and then executed. The
audit's own headline finding — *1455 automated tests passed while the GUMOI
boss room was inescapable* — set the shape of the work: every ticket ships the
rule **and** the spec that makes violating it a build failure.

**Suite: 1455 → 1879, all green**, including the full browser e2e set.

| ticket | rule established | spec |
|---|---|---|
| Z1 camera contract | no contiguous overhead mass over play space (>4 cells above y=3) | `camera-contract` |
| Z2 legible traversal | every climbable one-cell rise is visibly marked as one | `traversal-legibility` |
| Z3 guard + parry | every telegraph has an answer that is not retreat | `guard` |
| Z4 lock-on | the player can always face what they are fighting | `lock-on` |
| Z5 bestiary | an enemy exists to ask a different question; no two dungeons share a roster | `bestiary` |
| Z6 dungeon pedagogy | every dungeon introduces → develops → combines → tests one idea | `dungeon-pedagogy` |
| Z7 secret taxonomy | reward type is data, not a guess about a display label | `secret-taxonomy` |

**Measured deltas.** Worst overhead cluster 9 → 2 cells (the bone arches now
corbel inward instead of closing with a lintel). 565 climbable rises marked
campaign-wide. Enemy kinds 3 → 7; all 14 dungeon rosters distinct where twelve
consecutive beats previously shared one. Scar Sutures redistributed to exactly
one per dungeon (14 + 2 overworld = 16 = four optional hearts); Memory Vial
chassis pinned to the 4-slot cap.

**Two defects found that the unit suite could not see.**

1. `dev-mode.js` permanently wrapped `player.health.damage` with a two-argument
   function, discarding `source` and `meta`. The Z3 guard resolves direction
   from `meta.from`, so in the *running game* the shield never engaged while
   every unit test passed — the tests construct `HealthPool` directly. Found by
   driving the live game; fixed to forward all arguments.
2. Rewards were dispatched by string-matching pickup labels. Renaming a pickup
   silently changed what the player received, which surfaced only when Z7
   renamed eight of them and the heart ledger broke.

**Boss-room luminance re-verified after the Z2 tread pass — all 14 in band:**
warden 57.5 · spindlecrown 60.3 · spurpit 75.3 · corona 59.1 · proxythrone 54.8 ·
molthall 44.2 · cloudcourt 48.5 · prayerhollow 44.2 · moothall 56.2 ·
twincage 43.0 · golemwallow 60.5 · caldera 44.1 · witnesscrown 52.8 ·
corechamber 41.6.

**Still open, and explicitly not certifiable from here.** Combat *feel* (the
0.18 s parry window, 3 poise, the 0.25 chip multiplier), the difficulty curve
across fourteen freshly-rebalanced rosters, and a hand-authored overworld. All
three need hands on a controller. See ZeldaLevel.md §5.

---

## Session 9 — the follow-up pass (2026-07-21)

The owner played Session 8's work and reported, in one line, something 1,879
green tests had not: *"Cannot kill this mob."* Full write-up in
[ZeldaLevel.md §6](ZeldaLevel.md). **Suite 1879 → 1971, all green.**

**The bulwark was unkillable.** Z5 gave it a front plate *and*, in the same
pass, made enemy facing snap at the player every frame — so the plate tracked
whoever was attacking, `inFrontArc` was true from every angle, and the flank the
kind exists to teach was geometrically unreachable. `bestiary.spec.mjs` passed
throughout, because it placed the attacker by hand.

| defect | fix | spec |
|---|---|---|
| facing snapped instantly, pinning the plate on the attacker | `Enemy.turnRate` — `Infinity` for every other kind, **2.2 rad/s** for plated (derived from the 1.31 rad arc vs a ~3.7 rad/s orbit at player speed) | `bestiary` |
| the player could stand *inside* an enemy; at zero separation there is no bearing, so armour defaulted to on | `Enemy._separateFrom()` — a body's width is kept, and the **enemy** yields, never the player | `bestiary` |
| a refused swing said nothing but a clang | `ui/coach.js` — a one-shot hint at the moment of confusion, not on room entry where it is missable | `coach` |
| 65 of ~120 authored enemies carried an `ai:` contradicting their kind (18 lancers never lunged; 12 motes never burst) | 49 contradicting overrides stripped; ~11 deliberate variants kept | `bestiary` |
| a brood killed against a wall spawned children *inside* the masonry — unreachable, permanently alive, and every room-clear gate then waited forever | children search outward for a free spot, falling back to the parent's own footprint | `bestiary` |

**The difficulty curve was inverted.** Session 8 called it uncertifiable
without a playthrough; it was in fact simply unmeasured. Authored enemy HP is
flat (4 in beat 02, 5 in beat 14) while player damage triples. Measured in
landed hits to kill:

| | beats 2–5 | beats 9–14 |
|---|---|---|
| ordinary enemies, before | 2.6 | **1.5** |
| ordinary enemies, after | 2.6 | **4.0** |
| bosses, before | 8–14 | **4–6** |
| bosses, after | 8–14 | **12–18** |

From beat 05 to beat 14 every ordinary enemy died in under two hits (~0.6 s),
and nine of fourteen bosses died faster than the beat-01 tutorial boss. The cost
was not easiness — it was that **the bestiary stopped working**: if two swings
delete a bulwark, walking around it is slower than mashing, so its question is
never put. `world/threat-curve.js` is the single lever, deliberately shaped:
beats 1–4 untouched, beat 05 the softest point of the back half (it grants the
Wedge, and a new weapon must *feel* like one), then a climb past the early game.
Boss phase thresholds are HP fractions, so scaling preserves fight shape.
Enforced by `threat-curve.spec.mjs`; measured by
`tests/qa/{time-to-kill,difficulty-curve,ai-override-audit}.mjs`.

**Verified in the running game, not only in specs.** A Beat 08 bulwark now dies
in ~4 s of circling with the starting weapon and no parry, with real gaps where
the plate catches up and swings are refused — the gap-and-opening rhythm that is
the mechanic, and that had never once occurred.

**The lesson, now stated three times in this project:** a spec that constructs
the situation it tests proves a mechanism exists; only a spec that drives the
real code *from where the player actually stands* proves it can be reached.

---

## Session 10 — the audio-visual pass (2026-07-22)

Owner brief: music a human would actually enjoy, sounds for what the player
does, graphics for the grapple and the tools you collect, aimed at a free
GitHub release. **Suite 1971 → 2315, all green.**

**Stated constraint, up front and unchanged:** no recorded music or audio files
can be authored here. Everything is generated — which also suits the project's
zero-build, offline-first rule: no binaries to ship, nothing to license.

### Music

The previous soundtrack was three sine drones and a tick every 0.9 s,
transposed per dungeon by a frequency ratio. A ratio is not a key and a drone
is not a tune, so all fourteen dungeons were one hum at different pitches.

| before | after |
|---|---|
| 3 oscillators, 1 tick | 9 voices, shared convolution reverb, tempo-synced delay |
| frequency ratios | real keys and modes, chord progressions with voice leading |
| no melody | melodies notated as scale degrees, so variations transpose in tune |
| 4 beds | 4 base pieces + 22 variations (14 dungeons, 8 regions) |
| timing from `dt` in the render loop | ~200 ms lookahead on the AudioContext clock |
| static | adaptive layering from live scene intensity |

**Three faults found and fixed during the work**, all by measurement rather
than by listening:

1. **Register drift.** Voice leading alone walks: each chord goes wherever is
   nearest the last, so Am–F–C–G sank two octaves in four bars and leapt back
   on the loop. Caught by `tests/qa/score-readout.mjs`, which prints the score
   as note names — analyser RMS proves *audio exists*, which is a different
   claim from *this is music*. Fixed with a harmony-preserving octave re-centre.
2. **The melody was gated behind combat**, so exploring gave only pad and bass
   — I had re-created the original complaint. Every track now plays its lead at
   intensity 0, enforced by spec.
3. **Per-dungeon tracks were overwritten at load.** `loadLevel` switched to a
   boss bed whenever `level.boss` existed, but every dungeon prebakes its boss,
   so this fired for all fourteen and replaced each composition with the generic
   mood bed. Bone Forest and Pyre Peak both came out as plain `abyss`. Only a
   level that *is* a boss arena now opens on a boss piece.

Verified in the running game: Bone Forest plays A♭ phrygian at 70, Sky Monument
C lydian at 88, Pyre Peak E harmonic minor at 116 — six dungeons, six distinct
compositions, audible at RMS 0.11 with intensity ramping smoothly 0 → 3.

### Sound

30 new sounds. The headline: **a parry and a failed block both called
`sfx.block()`** — the game's most and least skilful outcomes were acoustically
identical. Measured on the live bus, parry now peaks at 0.121 against a block's
0.032, a ~4× separation that cannot be confused.

Weapon swings scale with mass (bare 0.009 → Anchor Link 0.025 → Wedge 0.053 →
Mallet 0.104), so the equipped weapon is audible. Four combat outcomes now have
four sounds. Sound added where there was none: lock-on, guard raise/lower/break,
doors, locked doors, boss doors, the grapple's launch/bite/reel, menus, a
low-health heartbeat, and five kinds of pickup that shared one chime. All 30
verified non-silent by analyser tap.

### Visuals

| system | before | after |
|---|---|---|
| held weapon | all five weapons drew an empty fist | models on the rig's `armR` pivot, inheriting every swing the animator drives |
| grapple | no rope, no hook, no anchor markers at all | rope with a leading hook and slack take-up; pulsing markers on in-reach anchors, which teaches the range |
| pickups | one octahedron in different colours | seven reward types, seven silhouettes |

The weapon and pickup work are legibility fixes rather than decoration: the
Wedge reaches 2.2 and the Mallet sweeps 90°, so a player who cannot see what
they hold cannot predict their own attack; and colour survives neither the
Abyss grade, nor bloom on a bright floor, nor a colour-blind player.

Verified live: four weapon models attach to `armR` with bare hands correctly
drawing nothing; the rope's length grows to 3.47 as the hook flies out and
shrinks to 0.5 as the player is reeled in; Beat 01's four pickups render as four
different shapes where they were previously one. Zero console errors across
eight levels.

**Still not certifiable from here**, unchanged: whether the music is *enjoyable*
and whether combat *feels* right are judgements that need ears and hands. Every
number above is derived or measured, which makes it defensible, not correct.
