# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### The gate that rewarded flattening the art

The certification gate banded each level's **mean** frame luminance and nothing
else. A mean cannot tell a well-lit room from a flat one — a room with a strong
key and deep shadows meters *lower* than the same room under a flat ambient
wash. So every time a room failed the band on the low side, the cheapest legal
fix was to raise ambient or add pale geometry, and the gate went green for it.
That is how ambient reached **1.7** against a key of **1.9**, and why Beat 01's
tomb grew decorative gold-leaf seams — the level file says so out loud.

- **The gate now also bands contrast**: centre-crop `p90 − p10`, floor 12.
- **It is measured on a centre crop, and that turned out to be the whole
  ticket.** Measured across the full frame the spread reads **58–160** and would
  pass any floor worth setting — because `p10` comes out at **0** in nearly
  every level, and that zero is the **vignette** crushing the corners, not a
  shadow. Vignette strength does not move when the lighting does, so a
  full-frame spread is mostly a constant with the answer buried inside it.
  Cropping to the middle half of each axis turns the same statistic into one
  that ranges **14 to 166** across the campaign and actually separates the flat
  levels from the lit ones. The plan called for a full-frame spread; the probe
  said otherwise before a line of it was written.
- **The floor is a ratchet, not a cliff** — 12, set just under the worst room
  measured (the overworld, at 14) so nothing can regress, rather than a number
  that fails on the day it lands. The two flattest levels are the open outdoor
  screens, which is the honest reading: one light, one ground plane.
- **The statistic is proven to discriminate.** `tests/game/luminance.spec.mjs`
  feeds it synthetic frames whose answer is known by construction, and the
  load-bearing case is that a flat grey frame **passes the mean band and fails
  the contrast floor**. It also pins the vignette case, so nobody can quietly
  move the measurement back to the full frame. A floor nobody has proven
  discriminates is decorative.
- The statistic moved out of the frame loop into `src/game/render/luminance.js`
  so it can be tested at all, and the dev overlay now prints spread beside the
  mean — the two disagree in exactly the direction that matters.

### Five of six rooms had no sun

The key light's shadow frustum is a ±30-unit box. It was aimed at the world
origin and it never moved. Rooms sit on a **64-unit** grid, so exactly one room
per dungeon was ever inside it.

It survived the whole project because **every dungeon starts at grid (0,0)**:
the first room you see in any level is the one room that works, so nothing ever
looked wrong until you walked somewhere. Measured against Beat 01 —
`corridor`, `predecessor`, `secret`, `antechamber` and `warden` all had no sun
shadows at all.

- **The sun now follows the active room.** The light and its target move
  together, so the *direction* never changes — moving only the light would have
  re-angled the sun per room, which looks like the world spinning around you.
  The aim is **snapped to a 16-unit grid** rather than following continuously,
  because sliding a directional shadow map a fraction of a unit per frame makes
  every shadow edge crawl.
- **The sweep is the assertion.** `tests/shadow-frustum-e2e.spec.mjs` walks
  every room of every beat — a spot check of one room would have passed against
  the broken build. It also asserts the sun keeps a single direction across
  rooms, and that room *corners* are covered, not just centres.
- **Reverting the fix fails 31 of its 50 assertions**, which is how we know the
  spec is load-bearing rather than decorative.
- **The overworld was worse than the plan recorded.** The plan documented "5 of
  6 rooms". The counterfactual run showed the overworld at **0 of 49 screens** —
  it sits at world coordinates 512–896, so the entire surface world was outside
  the frustum. Nobody had counted it.
- `src/engine/lights.js: updateShadowFollow` looks exactly like the fix for this
  and is not — it takes a single `cameraX` and pins the target's Z to zero, a
  leftover from the engine's 2.5D origins, so it would fix one axis and silently
  break the other. Locked Decision **D5** forbids editing engine code, so it
  cannot be deleted; instead the spec now fails if game code ever imports it.

### Ambient was doing 47% of the lighting

**1.70 ambient against a key of 1.90** in the Crust, and **3.40** in the Abyss —
twice as much flat light in the mood that is supposed to be the oppressive one.
Roughly half the illumination arrived from every direction at once, which by
definition cannot describe a surface: the same value on the top of a block, the
side of a block, and the inside of a corner. The voxel mesher already bakes
ambient occlusion into vertex colours, so the game computed good contact
darkening and then flooded it.

It got there honestly. The gate banded mean luminance, and raising ambient is
the cheapest way to lift a mean. That is also what every per-level `lightTune`
was doing — Beat 07 carried an ambient multiplier of **3.4×** on top of an
already-flat preset.

| | before | after |
|---|---|---|
| Crust ambient / key | 1.70 / 1.90 | **0.78 / 2.55** |
| Abyss ambient / key | 3.40 / 2.10 | **1.55 / 3.35** |
| environment | none | **0.55 / 0.60** |

- **The rim light was bound but never driven**, so it sat on the engine default
  in both moods. The Abyss needs *more* rim than the Crust, not the same: its
  key is dimmer against its background, so a silhouette separates from the fog
  on the rim or not at all.
- **Per-level trims were rebalanced from ambient toward key**, so a level that
  needs more light gets more *directional* light.
- **Contrast rose on 14 of 16 levels**, and the Abyss dungeons roughly doubled:
  Bone Forest 34 → 78, Town 43 → 82, Pyre 43 → 79, Sluice 44 → 77. Two levels
  went down and are recorded in `tests/game/luminance.spec.mjs` rather than
  hidden. The contrast floor was tightened 12 → 13 to lock the gain in.

### The world was under-detailed on purpose by nobody

79,572 triangles and 43 draw calls, on a budget with room for an order of
magnitude more. Rooms were a floor rectangle and four walls of uniform height,
and a wall whose top edge is a straight line at a constant height reads as a
box, not as a place.

- **Bake-time trim**: parapets with broken heights, pilasters every seventh
  cell, and taller corner posts, generated from the existing room definitions
  for all fourteen dungeons and the overworld at once.
- **It provably cannot change the game.** It only adds voxels *above* the wall
  top — never at `y <= 2`, the band the hero's body occupies — and only on the
  room perimeter, never on interior structures where platforms and grapple
  routes live. `tests/game/room-trim.spec.mjs` bakes each room with and without
  trim and requires the occupied cell set at `y <= 2` to be **byte-identical**;
  asserting "trim stays above y=2" from the outside would only restate the
  implementation.
- Doorways stay open: a door gap has no wall cap to build from, so nothing can
  bridge one with a floating lintel.
- **Cost: +728 triangles and +0 draw calls** in a dungeon room (~2%). It merges
  into the same voxel map the room is meshed from, which is the whole reason it
  is done at bake time rather than as props.
- The trim was shaded *darker* than the wall cap first, and the gate rejected it
  within one run: seven Abyss levels lost ~4 points of mean and fell out of
  their band. Trim stands against the **sky**, and the Abyss sky is dark violet —
  dark trim on a dark background is not moody, it is invisible. It lifts now.
- Taller walls also cast more real shadow into rooms (which only works at all
  because of the two tickets above), so the light was raised to hold the mean
  while keeping the contrast. That trade is what the contrast floor exists to
  arbitrate, and this is the first time it did.

### The gate now sweeps the overworld, and has two contrast floors

Having just proved the overworld's eight regions differ by 2.4×, the gate was
still sampling **one** of them — the start screen, in whichever mirror state the
save happened to hold. `visual-sanity.spec.mjs` now sweeps all eight regions in
both states, sixteen samples, using the same screens the certification captures
shoot so a failure has a picture next to it.

That sweep immediately showed the contrast floor was the wrong shape:

| | measured contrast |
|---|---|
| walled dungeon rooms | **70 – 172** |
| open outdoor screens | **12 – 16** |

A single floor of 13 was doing almost nothing for the fourteen dungeons — one
could regress from 95 to 14 and still pass — and it sat *inside* the overworld's
own sample noise, which is the randomly-failing gate this suite already learned
to avoid once. An open field with one ground plane, no walls to shadow it and no
ceiling to occlude it cannot have a walled room's contrast; that is what open
space **is**, not a defect to tune away.

So there are two floors now, each a ratchet under the measured worst of its
kind: **60 for dungeons** (worst: Cryo Vault at 70) and **10 for open levels**
(worst: Bonetown at 12). The dungeon floor finally bites.

### Auditing this session's own work against its own rule

Trap 4 in `HANDOFF.md` says: deleting the call is not deleting the feature —
remove the data too, or the next reader will conclude it was meant to be wired
up. Running that rule over the code *this session* added found three violations
of it, all mine:

- **`padAxes` was decorative.** The gamepad table carried the stick axis
  indices and nothing checked them. It is load-bearing now: the spec reads
  `gp.axes?.[N]` out of `pollGamepad` and requires the table and the handler to
  agree in both directions, exactly as it already did for buttons.
- **`disposeMoodEnvironments()` and `disposeContactShadowResources()` had no
  callers.** Both deleted. An exported teardown nothing calls reads as a
  contract somebody forgot to honour, and sends the next reader looking for a
  leak that is not there — in both cases the resources (two PMREM targets; one
  geometry, one material, one 64×64 canvas) are cached for the life of the page
  on purpose, and the comments now say so.
- `buildSkyTexture` was exported and used only internally; it is private now.

A sweep of every symbol the session exported confirms none is unreferenced.

### The one list left un-generated was wrong

The keyboard cheat sheet was unified into `CONTROLS` last session. The **gamepad**
legend was left hand-written in `ui/hud.js` — and it had already drifted. It
labelled **D-up** as "mood", when that button sets `_moodToggle`, the same flag
**M** sets, which the binding table and the docs both call **mirror travel**.

One list left un-generated is one list free to be wrong. That is the whole
lesson and it took four months to demonstrate itself twice.

- `padSheet()` generates the pad legend from the same `CONTROLS` entries as the
  keyboard sheet, via new `pad` / `padButtons` / `padAxes` fields.
- **The spec reads `pollGamepad` itself**, extracting every button index the
  handler tests (`pressed(N)` for edges, `b[N]` for held state) and checking it
  both ways: no button the game responds to may be missing from the table, and
  the table may not claim a button the handler ignores. Same discipline the
  keyboard half already had — the table is not allowed to be its own evidence.
- **Keyboard-only verbs stay keyboard-only, and the legend does not invent
  buttons for them.** The Memory Vial, the Entropy Dust, the beat cycle and Mute
  have no binding; a legend claiming one would be worse than a legend omitting
  it. Asserted, along with the reason Mute has none: it gave up its trigger slot
  to LT lock-on and RT guard.
- `docs/CONTROLS.md` gained a real gamepad table — it had been one prose
  paragraph carrying the same D-up error.

### Same lights, different rock

Regenerating the 44 certification captures — the first time anyone had looked at
all of them since the Session 6 camera retune — turned up something the gate
could not see. The overworld's eight regions are deliberately different stone,
sitting in one level, under one set of lights, with **one level-wide light
trim**. So identical lighting produced wildly different frames:

| region | floor | lum |
|---|---|---|
| Bonetown | ashField | 87 |
| Pyre | clayDark | 82 |
| Tombfields | clayField | 76 |
| Quarry / Cryomire | slate | 52 / 53 |
| **Spindle** | **iron** | **32** ← floor is 45 |

And in the Abyss, where every region shares one dark floor, **all eight sat at
18–27 against a floor of 35** — dark enough that an enemy standing next to the
player was hard to pick out, which is the exact failure the band exists to
prevent.

None of it was caught because `visual-sanity.spec.mjs` samples the overworld in
its **default state on its start screen**, and that screen is one of the pale
crust ones. The same shape as the shadow-frustum bug: the one place being
measured was the one place that was fine.

- **Light trim can now be set per room, not just per level.** A room falls back
  to the level's trim, so nothing without one changes.
- **The overworld's trim is derived, not hand-tuned.** Brightness is a product
  of light and albedo, so `render/albedo-trim.js` computes a region's
  compensation *from its floor colour*: half the reflectance gets twice the
  light. Sixteen hand-tuned numbers would have gone stale the first time
  somebody changed a floor; this follows it.
- **Computed in linear light, which is the whole trick.** Iron and clay differ
  by 1.5× as stored bytes and by **2.2×** as light. Compensating on the sRGB
  values would have under-corrected by nearly half — and the linear ratio
  predicts the measured 76/32 = 2.4 almost exactly.
- **Result: crust 61–77 (was 32–87), abyss 41–59 (was 18–27).** All sixteen
  screens in band.
- One more bug it surfaced: the first room of a level is entered *while the
  level is still being constructed*, with no `game` to reach the mood
  controller through, so a per-room trim only took effect once you walked
  somewhere. A level loaded directly into a dark region stayed dark — which is
  exactly what a certification capture does. The loader pulls the trim now.

### The captures were showing one screen eight times

The overworld half of the capture run was wrong in a way worth writing down.
`createOverworld` only honours a saved position when `pos.world === levelId`
(the dev test grid and the real world share screen names but not geography), so
omitting `world` silently fell back to the start screen — producing **sixteen
identical pictures of one screen, filed under eight region names**. Two files
being byte-for-byte identical is what gave it away. `md5sum` on the set is now
part of checking a capture run.

### Boss rooms have never been measured

The gate samples only the room a level *loads into*, so half the campaign's
most-looked-at rooms have never been measured. Sampling them found four of
fourteen outside their band — `spurpit` 98.8 against a ceiling of 90,
`prayerhollow` 79.7, `twincage` 92.4 and `golemwallow` 94.1 against 75.

This is **reported and not gated**, on purpose. Sampled on separate runs the
same room disagrees with itself by 20+ points in both directions (Spindle 92.7
then 69.2; Cryo 81.2 then 91.3), because a boss room contains a boss whose
emissive pulses and flashes — and a gate needs a statistic that holds still. The
bands were also calibrated on *empty entry rooms*, so whether an arena
containing a deliberately glowing boss belongs under the same ceiling is a
judgement call, not something to settle by loosening a number.

A light trim was tried and rejected: cutting Cryo's key from 3.35 to 2.68 and
its ambient from 2.02 to 1.24 moved the room by **one point**, which is how we
know that brightness is coming from emissive bosses and bloom rather than from
the light rig. `node tests/qa/contrast-probe.mjs` prints the current figures.

### The atmosphere and the floor disagreed

Every dungeon kit declared an `atmosphere` — `drips`, `vapor`, `heat_shimmer`,
`grit` — and every one of them was a particle effect **in the air with nothing
on the ground agreeing with it**. The Mire had bubbles rising off a floor with
no algae on it. The Pyre had heat shimmer over unscorched stone. The Cryo Vault
had vapour above ice that had never frosted.

- **One weathering per kit**, at bake time: grave dust in the Crypt, oil and
  scorch in the Spindle, wind-driven sand in the Sink, waterline staining in the
  Sluice, algae in the Mire, scorch in the Pyre, frost creeping up the Cryo
  Vault's walls.
- **It is colour only.** It recolours voxels that already exist and never adds,
  removes or moves one — so the safety proof is just that the cell set is
  identical before and after. No collision, no traversal, no `getVoxelAt`
  answer changes.
- **Patches, not speckle.** A per-cell random threshold reads as compression
  artefacts; weathering pools. Strength comes from smooth value noise on a
  6-cell lattice. The spec walks a floor row and counts how often "weathered"
  flips — random at 36% coverage would flip ~11 times across 25 cells, patches
  flip six or fewer.
- **Walls stain vertically.** Sampling a wall on `(x, z)` gives it the floor's
  pattern smeared sideways, which reads as a texture bug rather than as dirt.
  The wall *cap* is skipped entirely: the kit brightens it as a lit inlay, and
  staining over that removes the one piece of shading the room already had.
- `applyKit` keeps off the certification band by being brighten-only. That
  cannot work here — scorch is dark and that is the point — so coverage and
  strength are bounded instead, and **the bound is asserted**: under 8 points of
  albedo drift against bands 40–45 wide. Measured live, no level left its band
  and contrast held or rose. Beat 08 went **78 → 102** — bone dust on a bone
  floor is exactly the case where a decal earns its place.

### Nothing in the world could be shadowed

151 meshes in a room. **37 cast. 7 received.** Props did not darken under an
overhang, enemies did not sit in a doorway's shade, nothing cast onto anything
else — which is most of the reason objects read as pasted on top of the world
rather than standing in it. It happened because the decision was made
independently at every construction site, so **eleven of the fourteen bosses**
simply never had the line, no pickup cast anything at all, and the hero's weapon
explicitly opted out of both.

- **One rule, in one place** (`src/game/render/shadow-roles.js`): everything
  solid casts; everything solid receives unless it is glowing or transparent;
  and **anything that does not receive has to say why**, in
  `userData.shadowExempt`. The census counts an unexplained non-receiver as a
  failure, so opting out means writing the case for it rather than forgetting.
  Setting the flag in more places would have been the same bug waiting to happen.
- That rule replaced an emissive-intensity cutoff, which was the wrong shape:
  two boss parts and the grapple claw sat at exactly `0.4` and `0.5` against a
  `> 0.5` test and showed up as defects. Any emissive colour at all is a glow.
- **Every solid mesh in all 16 levels now receives** — 100%, measured, with
  `tests/qa/shadow-census.mjs` printing the breakdown. The gate asserts equality
  rather than a threshold, because a threshold invites the next person to add an
  unshadowed mesh and stay under it.
- **Held weapons cast again.** The blade sweeping its own shadow across the
  floor mid-strike is the best grounding cue the swing has and it was switched
  off. It still does not *receive*: 0.10 units wide against a camera 17.5 up is
  one or two shadow texels, which reads as edge flicker. The shield overrides
  that — a plate is broad enough for a shadow to resolve on.
- **Contact shadow discs** under every actor, boss and pickup. A cast shadow
  needs caster, receiver and light to line up; a disc is always directly beneath
  the thing it belongs to, so it reads when the sun is behind a wall or the
  shadow falls off-screen — including in the five-of-six rooms the key light's
  frustum never reached. It also encodes height: the disc spreads and thins as
  an actor rises, so a dash and a hovering mote both tell you how far up they
  are. Ground height is inferred from the actor's own Y, since the collision
  world is XZ-only — falling is adopted immediately, rising only once the new
  height holds still, which is what tells a jump from a step onto a platform.
- Discs are reconciled from the live entity lists each frame rather than
  attached at spawn sites, so a new enemy kind cannot ship without one.
- Cost: **draw calls unchanged** (41 → 41 in a dungeon room). Receiving is a
  fragment-shader tap on a shadow map that was already being rendered.

### The shield is a thing you find

Asked by the owner: *"is there a point at which you collect a shield you can
use?"* There was not. Guard and parry — a 0.18 s window, a poise economy, a
120° arc, the deepest mechanic in the combat system — were innate from the first
frame of a new save, and had **no visual at all**: no mesh, no pose, nothing on
screen but three pips in the corner. The hero's off hand was empty while
blocking.

- **The Bulwark Shield is now an item**, found on the predecessor's body in
  Beat 01. `GuardController.raised` is false without it.
- **It is placed to teach.** Beat 01's declared theme is already `telegraph` —
  *"Read the Wind-Up"*. A player handed a shield on frame one answers every
  telegraph by holding a button and never learns to read one. So the route is
  now: `tomb` (empty) → `corridor` (one sentinel, dodge it) → `predecessor`
  (one charger, **and the shield**) → `antechamber` (two enemies, both answers)
  → `warden`. Introduce → develop → combine → test, with the item as the hinge.
  `tests/game/shield-gate.spec.mjs` fails if anyone moves the shield earlier or
  stacks a second enemy into the dodge-only stretch — the gate is only
  defensible while the rooms in front of it are honestly clearable without it.
  It comes off the predecessor's body, so the gate and the story beat are the
  same moment.
- **Guard has a pose now.** `evalGuard` puts the shield arm up and across, drops
  the weapon hand, blades the torso and crouches slightly, weighted in over
  ~0.12 s — the parry window is 0.18 s, so the shield has to be visibly moving
  inside it. The shield model hangs off the new `handL` pivot, so it inherits
  the raise and can never be up while the arm is down.
- **Save v4 migrates.** A save already past Beat 01 has walked through the room
  the shield now sits in without being offered it, so migrating it unshielded
  would silently delete a verb the player had been using for six dungeons — it
  is granted. A save still *inside* Beat 01 is left alone; the pickup is on its
  route.

### Three lists of controls, all of them wrong

The on-screen cheat sheet never mentioned **guard, lock-on, switch-target,
mirror travel or the beat cycle**, and `docs/CONTROLS.md` never mentioned the
**Memory Vial or the Entropy Dust**. The HUD also kept *two* hardcoded copies of
its own sheet — the one shown at boot and the one restored when a gamepad
disconnects — which had already drifted apart from each other.

The shield work makes this worse than an omission: the game now gates a verb
behind an item, tells you so in a toast, and then shows you a control list with
no guard key on it.

- **`CONTROLS` in `src/game/input.js` is the single source of truth.** The HUD
  sheet is generated from it; `docs/CONTROLS.md` is written from it.
- **`tests/game/controls.spec.mjs` reads the input handler's own source**,
  extracts every `e.code` the game actually responds to, and fails if any is
  missing from the table or the docs — and fails the other way too, if the
  table advertises a key the handler ignores. Adding a binding without
  documenting it is now a test failure rather than something the player finds
  out years later.

### The hero was swinging backwards

Reported by the owner from a screenshot: *"when you swing this weapon and your
sword it does not arc out and animate in front of you, the sword does not move,
and this actually points backwards."* All three observations were correct, and
they were three separate defects stacked on top of each other.

**Which way is forward.** `player.js` sets `rig.rotation.y = atan2(fv.x, fv.z)`,
which lands rig-local **+Z** on the facing vector. The arm hangs along −Y from
its shoulder pivot and THREE resolves an `'XYZ'` euler as `Rx·Rz·v`, so the arm
direction is `(sin rz, −cos rz·cos rx, −cos rz·sin rx)` — it points forward only
when `rx` is **negative**.

- **The melee profiles were signed the wrong way.** `anchor_link` wound up at
  `rx = −1.9` (up and *in front of the hero's face*) and struck at `rx = +0.9`
  (down and *behind their back*). Every melee weapon, every swing, since the
  pose library was written. `tests/qa/swing-readout.mjs` — added here — measured
  the blade tip never getting further than **0.27 units in front** of a hero
  whose weapon reaches 1.8, and reaching even that only during *recover*, after
  the hitbox had already resolved. It is now **1.32**.
- **The blade pointed 180° away from the arm.** Weapon models are built
  blade-up (`+Y` from the grip); they were mounted raw on an arm running `−Y`.
  At rest the blade stood straight up past the hero's head — that is the white
  glow above the shoulder in the owner's screenshot, the Light Caster's emissive
  tip aimed at the ceiling. Through a swing the tip *trailed* the fist instead
  of leading it. Fixed with a grip orientation (`HAND_TILT`) that lays the blade
  along the limb and cants it forward.
- **Weapons now hang off a `hand` pivot**, added to `actor-rig.js` at the
  measured far end of each arm, instead of off the shoulder — mounted at the
  shoulder a weapon swings on a radius twice the length of the arm and reads as
  growing out of the collarbone. `HeldWeapon` falls back to `armR` if a rig has
  no hand, so nothing that predates the pivot throws.
- **There was no arc.** `evalCombat` only ever wrote `armRx` — a vertical chop.
  A slash is a *lateral* sweep, and only `armRz` carries lateral motion. Each
  phase is now a full `(rx, rz)` pose: the strike travels ~2.3 units across the
  hero's front, so the pose finally describes the same arc the smear draws and
  `combatSweep` resolves. The strike also eases *out* rather than in, so the
  blade is fastest on the frames the hitbox actually lands.
- **The hero rest pose gained a slight ready angle** (`armRx: −0.18`). With the
  arm hanging dead straight, the blade's own length put its point below the
  hero's feet while they stood still.
- **The Light Caster was already correct** and is unchanged in character: it
  holds a point pose down the facing line and does not sweep.

**Why a green suite missed it.** `tests/game/actor-anim.spec.mjs` asserted the
**sign of a pivot angle** (`armR.rotation.x < −1.2`). A hero striking backwards
satisfies that exactly as well as one striking forwards, because a radian has no
opinion about which way the actor is facing. The replacement assertions are all
**world-space**: mount a marker at the measured blade tip, yaw the hero to face
world +Z, and require that the tip end up in front, travel forward across the
strike, and sweep laterally. Restoring the old orientation fails eight of them,
including *"furthest forward z=−0.13"*. This is the same failure mode as the
truncated audio render last session — a spec that passes for the wrong reason —
and it is now written down in `HANDOFF.md` as a standing trap.

### The drone under the music

Reported by the owner after the soundtrack landed: *"your sound is still a drone
under the music."* They were right, and the reason writing a real score had not
fixed it is that **two of the three sustained sources were not in the score at
all**.

- **Removed the mood drone.** `MoodController.apply` started a raw oscillator on
  every mood change — a square at 80 Hz in the Crust, a triangle at 220 Hz in
  the Abyss — with no envelope, no reverb and no end, wired straight to the
  destination. It predated the score and survived the rewrite that was supposed
  to replace it, so the game shipped an actual soundtrack playing on top of the
  exact hum the soundtrack existed to remove. The Abyss one was the worse of the
  two: 220 Hz sits in the middle of the melody's register.
- **The `drone` field is gone from `MOOD_PRESETS` entirely**, and
  `tests/game/music.spec.mjs` fails if one comes back. Deleting the call was not
  enough on its own — while the data existed, the next reader would reasonably
  conclude the drone was meant to be playing and wire it up again.
- **The pad became a chord.** `padVoice` held each chord for 105% of a bar — so
  consecutive chords overlapped — with a one-second attack into a three-second
  reverb at 0.9 return. A progression played that way is not heard as harmony;
  it is heard as a hum that changes colour, and the melody over it is heard as
  part of the hum. Replaced by `compVoice`: hard attack, short tail, struck on a
  per-track rhythm (`comp`, using the same sixteen-step grid as the drums).
- **Chord length is derived from the gap to the next strike**, not fixed, so the
  Pyre's dense off-beat stabs are short and a Leviathan chord a whole bar apart
  rings — and neither can run into the next one. Chords now sound for 28–62% of
  a bar where they used to sound for over 100%.
- **The bass was the same mistake an octave down**, and harder to notice because
  a sustained low sine stops being heard as a note and starts being heard as the
  room. It held 1.8 beats against strikes two beats apart; now 0.9.
- **Reverb return cut from 0.9 to 0.55.** A hot return is the other way to build
  a drone by accident: the decay of one bar was still louder than the attack of
  the next, so the gaps got filled back in with a smear of everything already
  played.
- **The Abyss noise pulse moved to the effects bus** and from every 2.8 s to
  every 9 s. On the music bus at that spacing it was a texture layer nobody
  wrote. It is a room sound, not a part.

#### Proving it, rather than asserting it

- New `tests/audio-render-e2e.spec.mjs` renders the **real** scheduler through
  the **real** voices into an `OfflineAudioContext` and measures the signal.
  Every audio check before this could only prove sound was being produced, which
  is not the claim that was in dispute. A drone has a floor that never drops;
  music breathes.
- The gate: in the quietest 5% of 20 ms windows the music must be under 8% of
  peak. Measured against the previous arrangement it fails at **11.4%**; it now
  passes at **1.1–3.7%**, with dynamic range up from 7.4× to 21–70×.
- `renderOffline` in `score.js` and `buses.ctx` in `instruments.js` are the seam
  that makes this possible. A voice that reaches for a module-level live context
  can only ever be verified by listening to it.
- New `tests/qa/audio-envelope.mjs` draws the loudness envelope as a bar chart.
  It earned its place immediately: the first version of the spec **passed for
  the wrong reason** — an offline render started before the page has ever had a
  live AudioContext comes back truncated, and five seconds of digital silence is
  an outstanding 5th percentile. `renders to the end` is now asserted first.
- `music.spec.mjs` gained the structural rule — no voice may still be sounding
  when its next articulation arrives — checked per strike against the real
  scheduling function. It caught four overlapping comp patterns on its first
  run, which is exactly what it was written for.

### A real soundtrack, a real sound bank, and the three invisible systems

#### Music

- **Replaced the drone bed with a generated score.** The old "soundtrack" was
  three sine oscillators and a tick every 0.9 s, transposed per dungeon by a
  frequency ratio. A ratio is not a key and a drone is not a tune, so all
  fourteen dungeons were the same hum at a different pitch.
- New `src/game/audio/{theory,instruments,tracks,score}.js`: real keys and
  modes, chord progressions with voice leading, melodies written as scale
  degrees so they transpose in tune, nine synth voices, a shared convolution
  reverb and a tempo-synced feedback delay.
- **Four base pieces, twenty-two variations.** Each dungeon and overworld
  region is a reading of one base piece in a different key, mode and tempo, so
  the campaign shares musical DNA instead of being fourteen unrelated loops.
  The campaign walks down a circle of fifths as it descends.
- **Timing moved off the render loop.** The old pulse advanced by `dt`, so its
  rhythm was quantised to the frame rate and a dropped frame was a late note.
  Notes are now scheduled ~200 ms ahead on the AudioContext clock and are
  sample-accurate regardless of what the GPU is doing.
- **Adaptive layering.** Intensity (exploring → enemies awake → combat → boss)
  is derived from the live scene and fades layers in. The tune never changes,
  it thickens, so a fight starting costs nothing musically.
- Fixed the per-dungeon tracks being overwritten at load. `loadLevel` switched
  to a boss bed whenever `level.boss` existed — but every dungeon prebakes its
  boss so the arena is ready on arrival, so this fired for all fourteen and
  replaced each dungeon's composition with the generic mood bed. Bone Forest
  and Pyre Peak both came out as plain `abyss`, recreating the exact fault the
  score was written to fix. Only a level that *is* a boss arena now opens on a
  boss piece; the boss rooms already switch on entry.
- Fixed a register bug found by reading the score back as note names: voice
  leading alone made the Am–F–C–G pad sink two octaves across four bars and
  then leap back on the loop. Voicings are now re-centred after leading.

#### Sound effects

- New `src/game/audio/sfx-bank.js` — 30 game-specific sounds layered over the
  kit's generic primitives.
- **A parry no longer sounds identical to a failed block.** Both previously
  called `sfx.block()`, so the most skilful outcome in the game and the most
  routine one gave the same feedback. Parry is now the loudest single sound in
  the bank, at roughly 4× a block.
- **Every weapon swings differently**, weighted by mass — bare strike through
  to the Heavy Mallet, with the Light Caster electrical rather than physical.
- **Four combat outcomes, four sounds**: blocked, armoured, wounded, killed.
- Sound added to things that were silent: lock-on and release, guard raise,
  lower and break, doors opening, locked doors refusing, boss doors, the
  grapple's launch/bite/reel, menus, and a low-health heartbeat.
- **Pickups sound like what they are** — a shard, a key, a heart piece, a
  secret, and a real item are five different sounds where they were one.
- Footsteps vary per step and by surface.

#### Graphics

- **The equipped weapon is now visible in the hero's hand.** All five weapons
  previously looked identical — an empty fist. This is a combat legibility
  fault rather than a cosmetic one: the Wedge reaches 2.2 and the Mallet sweeps
  90°, so a player who cannot see what they are holding cannot predict their
  own attack. Models parent to the rig's `armR` pivot, so they inherit every
  swing and hit reaction for free.
- **The grapple is visible at all.** It previously had no rope, no hook and no
  anchor markers — you pressed G and were somewhere else, with nothing on
  screen to explain a failed pull. There is now a rope whose hook leads the
  player and whose slack takes up as you close, plus pulsing markers on
  anchors that are actually in reach, which teaches the range itself.
- **Pickups have silhouettes.** Every pickup in the game was the same 0.35
  octahedron in a different colour — a shard, a small key, a Memory Vial and a
  quarter of a heart container all identical in shape. Colour is the weakest
  signal available from a camera 17.5 units up: it washes out under the Abyss
  grade, it is the first thing lost to bloom, and it is unavailable to a
  colour-blind player entirely. Seven reward types now have seven shapes.

#### Test reliability

- **Fixed an intermittently-failing certification gate.** The luminance check
  took two samples and kept the **max**, which is the wrong statistic for a
  signal that oscillates: Beat 13 runs the flicker shader at 0.45 and Beat 14
  the wrap shader, so their frame brightness swings by design and the peak was
  being caught — the gate failed at 96.6 against a ceiling of 75 for a level
  that sits at ~36 when you look at it. Now the median of five samples, which
  discards both the dark settling frame the max was guarding against and the
  bright flicker peak, without needing to know which levels flicker. A randomly
  failing gate is worse than no gate, because it trains you to re-run.
- Gave the Beat 01 tomb gold-leaf wall seams, matching the predecessor chamber
  and the Warden's arena. The room sat ~0.2 above the crust luminance floor,
  which made the same gate flake under software GL; pale accent geometry is the
  documented remedy, since a lighting change would fight the mood preset.

Removed the now-dead `fx/motifs.js` ratio tables and their spec: nothing
imported them once real tracks landed, and a passing spec over dead code makes
it look maintained.

Specs `music` and `game-feel-visuals` added; probe
`tests/qa/score-readout.mjs` prints the score as note names so harmony can be
judged without listening. Suite 1971 → 2315.

### Combat reachability and the difficulty curve

Prompted by a one-line playtest report — *"Cannot kill this mob"* — against a
tree with 1,879 passing tests. Written up in [ZeldaLevel.md](ZeldaLevel.md) §6.

#### Fixed

- **A bulwark could not be killed.** Its front plate refuses melee outright, but
  enemy facing snapped at the player every frame, so the plate tracked whoever
  was attacking and the flank the kind exists to teach was geometrically
  unreachable. Enemies now turn at a finite `turnRate` — `Infinity` for every
  kind that never needed one, so their behaviour is bit-for-bit unchanged, and
  2.2 rad/s for plated enemies, which opens the back after about a second of
  committed strafing.
- **Enemies could occupy the player's own footprint.** Nothing stopped the
  player from walking through them. Beyond looking wrong, it broke the maths
  every directional rule depends on: at zero separation there is no bearing, so
  armour checks defaulted to "protected". A body's width is now kept between
  them, and the enemy is what yields, never the player.
- **A brood killed against a wall could softlock its dungeon.** Split children
  were placed blind at a fixed radius, so half a litter could spawn inside solid
  masonry — unreachable, permanently alive, and every room-clear gate in that
  dungeon then waited on them forever. Children now search outward for a free
  spot and fall back to the parent's own footprint.
- **65 of ~120 authored enemies were not the kind they claimed to be.** Explicit
  `ai:` overrides contradicted their kind — 18 lancers that never lunged, 12
  motes that never burst — so the four kinds added in the previous pass existed
  in the roster tables and almost nowhere in the actual levels. 49 contradicting
  overrides removed; ~11 deliberate variants kept.
- Beat 09 was the only dungeon in which a kind never behaved like itself, and
  the only significant dip in the difficulty curve. Both closed.

#### Changed

- **Enemy and boss HP now scale with the beat they spawn in**
  (`src/game/world/threat-curve.js`). Authored HP was nearly flat across the
  campaign (4 in beat 02, 5 in beat 14) while the player's best weapon damage
  triples, so from beat 05 to beat 14 every ordinary enemy died to fewer than
  two landed hits, in about six tenths of a second — ten dungeons in which the
  back half was mechanically *softer* than the front. The cost was not
  difficulty but that the bestiary stopped working: if two swings delete a
  bulwark, walking around it is slower than mashing, so its question is never
  put. Late-game durability goes from 1.5 to 4.0 landed hits.
- **Bosses were inverted harder still** — authored 12–18 flat, so nine of
  fourteen died in 4–6 hits against the beat-01 tutorial boss's 8, and the
  previous point left beat 13's ordinary enemies outlasting most bosses. Boss
  durability is now a monotone 8 → 18 hits. Phase thresholds are HP fractions,
  so multi-phase fights keep their shape exactly.
- The curve is deliberately shaped rather than flat: beats 1–4 are untouched
  (they were tuned against a 1-damage weapon and play correctly), and **beat 05
  is the softest point of the back half on purpose**, because it grants the
  Tectonic Wedge and a new weapon has to *feel* like one.

#### Added

- `src/game/ui/coach.js` — one-shot hints delivered at the moment a mechanic
  refuses input, rather than on room entry where they are missable. A blocked
  swing now explains the plate instead of only clanging.
- Specs `threat-curve`, `coach`; measurement probes
  `tests/qa/{time-to-kill,difficulty-curve,ai-override-audit}.mjs`.
- Bestiary coverage that **simulates a player moving at player speed** rather
  than placing the attacker by hand — the omission that let the unkillable
  bulwark ship green.

Suite 1879 → **1971**, all passing.

### Design pass — ZeldaLevel Z1–Z7

Design audit written to [ZeldaLevel.md](ZeldaLevel.md) and executed. Every
ticket ships the rule **and** the spec that makes violating it a build failure.

- **Camera contract** — no contiguous overhead mass (>4 cells above y=3) over
  play space. Bone arches corbel inward instead of closing with a lintel; worst
  cluster 9 → 2 cells.
- **Legible traversal** — every climbable one-cell rise is visibly marked as
  one; 565 marked campaign-wide.
- **Guard and parry** — the defensive half of the combat verb set. A 120°
  frontal block, a 0.18 s parry window, three points of poise, and a guard
  break. Added a `damageFilter` hook to `HealthPool` as the single interception
  point for 25+ damage call sites.
- **Lock-on** — decouples facing from movement, with a ground reticle and
  camera integration. Bound to **T** / gamepad **LT**.
- **A real bestiary** — enemy kinds 3 → 7 (bulwark, mote, lancer, brood), each
  asking a question the others do not. All 14 dungeon rosters are now distinct,
  where twelve consecutive beats previously shared one.
- **Dungeon pedagogy** — every beat declares a `theme` and the four rooms that
  introduce, develop, combine, and test it, plus an in-game teaching hint.
- **Secret taxonomy** — reward type became explicit data (`reward: { type }`).
  Rewards had been dispatched by string-matching a pickup's *display label*, so
  renaming one silently changed what the player received. Scar Sutures are now
  exactly one per dungeon (14 + 2 overworld = 16 = four optional hearts).

#### Fixed

- `dev-mode.js` permanently wrapped `player.health.damage` with a two-argument
  function, discarding `source` and `meta`. The guard resolves hit direction
  from `meta.from`, so in the running game the shield never engaged — while
  every unit test passed, because the tests construct `HealthPool` directly.
  Pass-through wrappers now use `(...args)`.

Suite 1436 → 1879.

### Reconstruction — AUDIT-progression-and-geometry v2

- Deterministic mood/quality re-derivation (`mood-controller.reapplyVisual`), so
  the final frame no longer depends on whether quality or mood was set last.
- Two-subject boss framing in `camera-rig.js`, foreground occlusion fade
  (`fx/occlusion.js`), and HUD toast dedupe.
- Per-region overworld grammars (`overworld/grammars.js`) — eight silhouettes
  that read apart in grayscale, with Crust and Abyss differing in *form* rather
  than palette; replaces the palette-only terrain builder.
- Named-pivot actor rigs and an archetype animator, so sentinel, scarab, and
  frost diverge in rest pose and gait rather than only in colour.
- Material families via a bounded `onBeforeCompile` — roughness and metalness by
  vertex-colour class, albedo untouched so luminance bands hold. Mean-preserving
  surface mottling, a pooled local-light system, synchronous shader prewarm, and
  14 per-dungeon material kits.

Ticket H (Ultra GTAO) was deliberately **not** taken: no AO pass exists, so the
lower tiers would pay nothing, and the audit only retains it if paired on-GPU
captures prove its worth — which headless CI cannot produce.

Suite 995 → 1436.

### Narrative systems

- Added campaign-owned Easy, Medium, Hard, and Survival modes with distinct
  enemy health, incoming damage, hostile cadence, projectile speed,
  telegraphs, boss recovery, healing drops, environmental damage, shard risk,
  score multipliers, and hint timing. Old `normal` saves migrate to Medium.
- Added Reconstitution Charges. Easy has infinite lives, Medium has five per
  expedition, Hard has three, altars refill the expedition, and Survival has
  one life for the full campaign. Survival death seals the save and records
  its final result before the death presentation begins.
- Added the Anchor Thread with fourteen authored destinations, a persistent
  HUD objective, mode-aware stuck escalation, prioritized dialogue, map
  Recall, destination disturbance, and overworld exit pulses calculated from
  the live screen graph.
- Activated Witness Score with versioned per-mode boards, one-time encounter
  awards, combat chains, damage resets, boss and beat rewards, engineer
  rescues, secrets, map memories, flawless phases, campaign completion, and
  automatic unranked status when developer mode is used.
- Split Scar Shards into carried and altar-banked currency. Medium and Hard
  deaths can leave a recoverable Death Echo. The altar now banks shards,
  refills charges, sells repairs and Memory Vial refills, and offers four new
  permanent utility upgrade lines.
- Reinterpreted the repeated Beat 07 Magnetic Grapple as the Deep-Pull Coil
  range upgrade and the repeated Beat 12 Light Caster as the Line Caster
  upgrade, preserving the working gate graph without lying about duplicate
  rewards.
- Added sixteen persistent Scar Sutures that bind into four optional hearts,
  four persistent Memory Vial chassis with manual and Easy emergency use, the
  Cipher Lens for clearer Recall, Resonance Fork altar travel and motif
  replay, projectile-facing Reflector Plate, limited Entropy Dust conversion,
  and the purchasable Buoyancy Mesh for Mire traversal. Fixed pickups now
  persist immediately and cannot be farmed by reloading.
- Added focused unit coverage for run-mode scalars, infinite Easy lives,
  expedition breaks, one-life Survival, shard loss, Witness Score integrity,
  immutable run modes, and Anchor Thread escalation. Current unit result is
  653 of 653 unit assertions passing. The full browser and unit suite passed
  1243 of 1243 before two final pure completion assertions were added and
  verified in the unit run. The focused Survival browser contract passes 9 of
  9, including sealed-save reload protection.

### Documentation

- Added `AUDIT-Narrative.md`, checked against the 2026-07-19 worktree and live
  A Link to the Past item-acquisition sources. The audit specifies the Anchor
  Thread story-guidance system, functional Easy, Medium, Hard, and one-life
  Survival modes, Reconstitution Charges, Witness Score, the existing Scar
  Shard economy and new spending paths, item-acquisition proposals, save
  migrations, implementation order, and verification criteria.

By-hand playtest feedback, fixed.

### Fixed
- Closed the overworld progression hole. Dungeon entrances now reject locked
  beats before changing the return position or loading the level, all
  player-facing cross-level requests pass through the same gate, Beat Select
  no longer trusts a stray `currentBeat`, and boot repairs an old invalid
  `currentBeat` back to the overworld.
- Moved the GUMOI Witness terraces into the room graph's multi-Y platform map,
  removing the infinite-height XZ collision columns that could wall off the
  arena.
- Room transitions now cancel an active boss camera focus before beginning the
  pan, so focus height and targeting cannot bleed into the next room.
- Replaced the deprecated three.js `PCFSoftShadowMap` setting with
  `PCFShadowMap`, which owns the soft PCF behavior in r185.
- Added a WebGL2 compatibility gate and a visible startup failure screen. A
  browser without WebGL2 now gets an actionable message instead of a dead boot
  overlay and console-only wreckage.

### Known issues (diagnosed, not yet fixed)
- Refreshed both progression and geometry audits against the 2026-07-19
  worktree and current official three.js sources. The refresh corrects stale
  WebGPU guidance, separates WebGL GTAOPass from WebGPU GTAONode, and records
  the soft three.js pin and measured shader-prewarm opportunity that remain
  open. It also marks the migration guide's 185 to 186 section as
  forward-looking while r185 and package 0.185.1 remain current, and preserves
  the existing whole-frame renderer metrics reset as the correct multi-pass
  accounting pattern. The progression, GUMOI collision, shadow-map, and WebGL2
  failures diagnosed by the audits are now fixed above.
  The older audit's stale transient task tracker and unsupported third-party
  claims were removed, and its formatting now matches the current audit.
  Implementation verification is green at 567/567 unit assertions and
  1150/1150 full-suite assertions.

### Added
- **Boss fights are fights.** Every boss now runs one loop: a readable pattern,
  a wind-up that commits and marks the ground, a strike resolved against where
  you are at that moment, and a **recovery window** where it is motionless,
  lit, and taking double damage. Reading a boss now buys you something; before,
  attacks fired off bare cooldowns and hitting the boss was equally good at
  every instant, so mashing was optimal in all 14 fights.
- Telegraph shapes: rings ("move"), cones ("get behind it") and lanes ("leave
  the line"), instead of one identical ring for every attack in the game.
- `boss-quality-e2e` and `boss-grammar` specs (+84 assertions, 1056 → 1140)
  asserting the things "the boss reaches 0 HP" cannot see: that each boss
  reacts to where the player stands, opens a real window, and dies to a melee
  weapon from floor level.
- Enemy attack telegraphs. Every hostile action now winds up: the enemy holds
  still, a ring marks the ground it is about to strike, and damage resolves
  only when the ring expires — against where you are at that moment. Walking
  clear or dashing through makes the blow whiff. Previously enemies dealt
  damage the instant their cooldown expired while you were in range, with no
  tell and no way to avoid it.
- Heart recovery. Slain enemies drop hearts (odds rise the more hurt you
  are), and boss phase changes always drop one. `HealthPool.heal()` existed
  but nothing in the game had ever called it — dying was the only way to get
  HP back.

### Changed
- The game is keyboard-driven. You face the way you walk, A Link to the Past
  style, and standing still holds your last facing. Mouse aim (which
  overwrote facing every frame) and LMB-attack are gone.
- Camera scale is constant everywhere. Entering a dungeon no longer zooms in:
  overworld and every dungeon now frame the same 24 world units, where
  dungeons previously framed 21 against the overworld's 47.
- Dash grants at least 0.3s of invulnerability (was 0.13s, shorter than a
  human reaction) so it works as a dodge.
- Gameplay camera reads top-down instead of 3/4-perspective: FOV 65° → 40°
  and a steeper rig tilt (visible floor area preserved at the tighter FOV).

### Fixed
- A gamepad stick that is off-centre when it connects (held, drifting, or
  stuck) no longer pins movement in one direction. Sticks are trusted only
  once seen at rest; the pad otherwise overrode the keyboard every frame and
  made the game unplayable. A one-shot HUD hint now explains the suppression
  instead of the controller silently doing nothing.
  This also resolved a reported "locked door won't open with a valid key":
  the player was being shoved sideways and could never line up with the
  2-unit-wide centred door gap.
- The boss-intro camera push-in is now cancelled on level change; it could
  previously bleed into the next level and leave the camera inside a wall.
- Locked and boss doors can be opened. The gold plug filling a locked doorway
  is a solid collider, but the unlock trigger sat 0.3 past the wall line —
  behind that solid matter. The plug stopped the player ~0.9 short, so the
  trigger never fired and the key was never spent: **no locked or boss door
  in the campaign could be opened on foot.** Plugged doors now unlock on
  approach. All 80 locked/boss doors verified by walking a physics body into
  each one.
- Boss attack telegraphs are visible. Rings were drawn at an absolute height
  of y≈0.08 while room floors sit at y=1, so every boss telegraph in the game
  had been rendering a full unit underground since the boss framework landed.
- Dying no longer respawns you into empty space. Respawn uses the room you
  died in rather than the spawn point captured at level load.
- **8 of the 14 bosses ignored the player completely.** Their movement was a
  function of the clock alone — byte-identical paths no matter where you
  stood. The Sand Spur traced the same four corners forever; the Magma Wyrm
  swam a fixed figure-8 dribbling fire on its own track; the Tri-Compiler,
  Frost & Fuel, GUMOI Witness and Leviathan Core orbited fixed points, and the
  Leviathan did not move at all until phase 2. Four of them had no
  player-targeted attack of any kind, so the only way to be hurt was to walk
  into one. All 14 now read and respond to the player.
- **The GUMOI Witness could not be hit by any melee weapon, in any phase.** It
  hovered ~7 units above the player's head, where the vertical gate in
  `hitboxCheck` rejects every sword in the game. It was killable only by the
  Light Caster, and only because a ray move carries no `vertical` field — so
  the gate compared against `undefined`, produced `NaN`, and let the hit
  through by accident. It now descends to head height to attack.
- **The Obsidian Arachnid deadlocked at close range.** Armoured except
  mid-leap, and it only leapt at targets more than 3 units away — so a player
  who walked up and stayed there swung forever into a boss that could take no
  damage and would never open. It now also leaps to make space when crowded.
- Leviathan decoys orbited the world origin instead of the Core, which put
  them in a different part of the dungeon entirely (beat-14's arena is nowhere
  near 0,0).
- The Kinetic Core's charge teleported to the far wall instead of crossing the
  floor between, so it could not be dodged, blocked or even seen.
- Bosses that keep their distance now spiral inward rather than holding a fixed
  radius, which would have made them literally uncatchable — backing away
  exactly as fast as the player approaches.

## [0.3.0] — 2026-07-17

The "LttP scope" release: the fifteen single arenas became a connected world.
Executes the Completion Plan (Phases S/D/W/C) via the Builder Guide.

### Added
- **World architecture**: room-graph dungeons on a 64-unit world grid (door
  gaps, locked/boss-door plugs, camera room-lock panning, prebake, multi-Y
  platform meshes), persistent per-dungeon key/door/visited state (save v2 +
  one-shot migration), overworld screens with edge transitions, mirror travel
  (monolith swaps between per-screen Crust/Abyss layouts), Tab map (overworld
  grid + dungeon room graph), item-gating blockers (grapple gap, wedge crack,
  boot ledge, caster shroud).
- **Content**: 7×7 overworld (49 screens × 2 states, 8 regions, 14 dungeon
  entrances, monoliths, secrets); all 14 beats rebuilt as 6–8-room dungeons
  with keys, locks, boss keys, maps, secrets, altars, and their signature
  systems; new game starts on the overworld; Bare Strike starting weapon —
  the Anchor Link is salvaged from the Crypt Warden.
- **Dev mode** (`?dev=1` / Ctrl+Shift+D): god/one-hit, F2 boss kill, F3 phase
  force, teleport/grant panel, perf + luminance overlays, hitbox geometry.
- Visual-sanity and campaign/world e2e suites (388 → 995 assertions),
  per-level luminance sampler, character `measure()` hook, Phase V
  certification captures (`CERTIFICATION.md` + `docs/media/certification/`),
  and a real-combat boss gauntlet (all 14 bosses fall through the actual
  `tryAttack` path, not the `hp=0` shortcut).
- Per-dungeon story pass (intro/mid/post-boss lines), per-beat/region music
  motifs, boss-reveal stinger, economy audit.

### Fixed
- P0-1: characters were ~7× world scale with feet below the floor (player
  14.85 → 1.93 units, grounded via bounding-box shift).
- P0-2: near-black scenes — the abyss vignette preset was crushing the frame
  (13–32/255); lights now driven by mood presets, all 15+ scenes read
  35–90/255.
- P0-3: 0×0 canvas on hidden-tab boot (continuous size guard).
- P1-4: no longer start holding the weapon Beat 01 says to salvage (plus the
  `grantItem('anchor_link')` no-op).
- P1-5: boss silhouettes now dominate trash mobs (presence scaling with
  matched combat radii).
- Bosses that orbit/patrol anchor to their arena, not the world origin.
- Boss HP bar only shows when the fight is near.

## [0.2.0-engine] — 2026-07-13 (kit changelog below)

## [0.2.0] — 2026-07-13

Professionalization pass: the kit went from "code that works" to a real
public project — tests, CI, examples, docs, and a standalone identity.

### Added
- Full test suite: pure-node unit specs for `collision.js`, `hitbox.js` +
  `facing.js` (including the equivalence proof that a vectorized facing
  matches the classic X-signed cone bit-for-bit), and `settings.js`
  (storage-absent/throwing degradation, persistence, reset semantics), plus
  a browser smoke spec covering `index.html` and both examples.
- GitHub Actions CI running the unit suite on every push/PR to `main`.
- Two genre-neutral examples: `examples/topdown-8way.html` (top-down camera,
  8-way movement, melee arc, wall collision) and `examples/voxel-showcase.html`
  (six bespoke voxel builds, live quality-tier switching).
- `docs/API.md` — a hand-curated reference for every export in `src/`,
  including the implicit `world` contract.
- README screenshots ("See it" section) for the smoke test and both examples.
- `package.json` identity fields (`repository`, `author`, `license`) and a
  standalone description no longer framed as an extraction of a specific game.
- `.editorconfig`, `.gitattributes`, `CONTRIBUTING.md`.

### Changed
- README rewritten to stand on its own: leads with what the kit *is*, closes
  with a "Built with this kit" section linking an example project instead of
  a "lifted out of" provenance framing.

### Known limitations
- CI runs the pure-node unit suite only (44 assertions, <1s). The browser
  smoke test (`npm test`, full suite) needs a real GPU — GitHub's hosted
  runners don't have one, and headless Chrome + SwiftShader software
  rendering proved unreliable there across several attempts. Run `npm test`
  locally before tagging a release; see CONTRIBUTING.md.

## [0.1.0] — Initial extraction

The kit as pulled out of its origin game: renderer + HDR bloom/vignette/film
composer, voxel meshing with baked ambient occlusion, character-part
builders, particle and motion-smear FX, a WebAudio synth, localStorage-backed
settings, quality tiers, skybox/environment, and the two combat primitives
that motivated the extraction — swept AABB collision and a vectorized
(8-way) hitbox, first proven in real belt-scroller combat with `facingVec`
pinned to `±X`. No tests, no CI, no examples yet.
