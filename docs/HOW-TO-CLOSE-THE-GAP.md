# How to close each gap — the actual method

Companion to `ROAD-TO-AAA.md`, which says *what* is missing. This says *how*,
concretely enough that you can hand me one heading and I can start.

Every item follows the same house rules, because they are what has caught every
expensive bug in this project:

1. **Measure the current state first.** Never implement a target number before
   probing what the number actually is — three of six were wrong the last time.
2. **Change one thing.** Then look at a picture and re-measure.
3. **Wire the alarm to the building.** The spec imports the real thing; it never
   keeps its own copy.
4. **Break it on purpose and watch the alarm go off.** A gate that has never
   failed is decoration.
5. **Look at the frame.** Green tests are not a good-looking game, and a good
   number is not a good picture — this session proved that twice.

Items are ordered as in `ROAD-TO-AAA.md`. Sizes are honest: **afternoon** (a
few hours), **days** (2–5), **week**, **weeks**.

---

## 1. "Which one is me" — WITHDRAWN, and here is what it cost to learn

I built three things against this: a black inverted-hull outline, then a cloak,
then a bigger cloak. **All three were rejected on sight by the owner, and the
premise was wrong from the start.**

> *"The cape is pointless, and I guarantee you a player can tell the difference
> between the player and the enemies."*

They have played the game. I had screenshots. **The figure that answers the
controller is the player** — every frame, unmistakably — and no still image can
contain that cue. I spent three builds optimising a photograph.

The cloak was also just bad as an object: a `BoxGeometry` that never moved,
because nothing in this project simulates cloth. *"It does not flow like a cape,
and looks more like a massive shield on his back."* Correct, and unfixable by
resizing.

**What was kept:** the separation light, because it is a lighting repair rather
than an accessory — the old fresnel was geometrically defeated by the camera and
did nothing in the rooms that needed it most. *(That camera is **70.7°**, not
the 56° this line used to say; corrected 2026-08-16, and the defeat is worse at
the true angle, not better. See the note at the top of `AAA.md`.)*

**What it bought:** one real bug. See §1b.

### 1b. The contact shadow fix (done)

Player's shadow disc sat **0.98 units above their feet** — mid-chest — and had
since the feature shipped. Enemy discs were correct by luck (`groundOffset: 0`).
Now every rig publishes where its feet are and the shadow reads it. Gated at
both the producing and consuming end, both counterfactually proven.

### 1c. If it ever DOES need more: change the model, not the wardrobe

The owner's direction, and the right one. Not another object bolted on — the
hero's **proportions**. Concretely, and in order of cheapness:

1. **Make the hero taller and narrower than every enemy.** `bodyScale` already
   exists as a per-axis knob on `createActorRig` and is how enemy kinds get
   different silhouettes today. One line, no new art.
2. **Give the hero a distinct head shape.** `headProfileScale` is already a
   parameter; enemies all sit near one value.
3. **Change the stance.** The animator supports per-archetype gait; a hero who
   stands with more weight forward reads as a protagonist.

*Rule for all three:* change **one**, shoot the crowded room, and — the part I
skipped — **play it for two minutes** before deciding. That is the evidence this
question actually needs.

## 2. Rooms have relief but not shape (STARTED 2026-08-18 — beat 06 is shaped)

> **Status.** The capability exists and one dungeon is authored, exactly as the
> method below prescribes. `src/game/world/room-footprint.js` gives a room an
> optional `cut`; the Quarry's six non-boss rooms each lose 6–13% of their
> square. The traversal re-audit (step 3) is clean across the whole campaign:
> door-reach 0 locked in, entry-safety 0 bad of 528 arrival points,
> puzzle-reach 0, key-reachability 0. Step 4 — playing it — is still the
> owner's, and steps 5 (the other thirteen dungeons) and boss arenas are open.
>
> Two findings worth carrying into the next dungeon:
>
> * **A cut on the SOUTH side costs occlusion.** The camera is fixed-yaw and
>   looks from +Z, so near-half mass stands between the lens and the player.
>   Moving what could move to the far half took beat 06 from 26 occluded cells
>   to 20, against an uncut baseline of 13. Prefer far-half cuts.
> * **The validator reads the room table, and the table is not the room.** A
>   cut that severed the one-cell ring around `goldgash`'s blocker passed every
>   static check and islanded a door; `tests/qa/door-reach.mjs` found it in the
>   built world. Blockers now count as rock for the connectivity question, but
>   the rule stands: bake it and measure the world.
>
> Boss arenas are deliberately left square — `api.halfSize` is the arena clamp
> and it is the bounding box, so a cut would leave a fourteen-metre body a
> legal place to stand that is solid rock. That needs the clamp to learn about
> outlines first, and is its own ticket.


**You were right and I was wrong**: 93% of rooms have raised floor, averaging
17% of their area, some reaching six levels. The correction and the measurement
are in `ROAD-TO-AAA.md` §2.

The real gap is narrower: **the elevation varies inside a box whose outline
never does**, the steps are one or two cells because `terracing.js` may only add
one cell at a time (a deliberate safety rule, and the right one), and the three
shapes are picked by hashing the room's name rather than authored.

*Method, in the order that keeps the campaign safe:*

1. **Pick one dungeon.** Not all fourteen. Beat 06 (Quarry) is the natural test —
   it is thematically about being cut into rock.
2. **Author its room outlines by hand** in the level file: an L-shaped room, a
   room with a balcony you enter from above, one pit you drop into and climb out
   the far side. These are level-design decisions and they need a person.
3. **Re-run the traversal probes for that dungeon only** — `door-reach`,
   `key-reachability`, `platform-reachability`, `pickup-reachability`,
   `entry-safety`. They already exist and this is exactly the audit
   `OPEN_QUESTIONS.md` §3 says is required.
4. **Play it.** Reachability probes walk a grid; they do not tell you a room is
   annoying.
5. Only then copy the approach outward, one dungeon at a time.

*Why it costs weeks:* step 2 is authoring and step 4 is you. Nothing about it is
technically hard, which is exactly why it has been deferred twice.

*Cheaper 80% first, if you want the look without the risk (days):* keep every
floor plan exactly as it is and raise **wall height variation** and add
**ceiling-height changes** between rooms. It changes how a room feels on entry
and cannot make anywhere unreachable, so it needs no traversal re-audit.
**DONE 2026-08-17** — `src/game/world/wall-profile.js`, every kit has a
`wallRise`, and hero occlusion fell from 7.93% to 0.83% of standable cells as a
side effect of the near wall coming down.

---

## 3. Nothing moves that you did not move (partly DONE 2026-08-12)

**Measured before building, and the measurement rewrote the list.**
`tests/qa/ambient-motion.mjs` holds the player still, samples the whole scene
twice a second apart, and reports what moved. Across four levels:

| this section claimed | measured |
|---|---|
| lights do not flicker | **true** — 24 lights, max Δintensity **0.0000**, everywhere |
| enemies "stand perfectly still" | **half true** — bodies idle-animate, but **0 of 31 roots ever turn** |
| motes need turning up | **already drifting** — the 520-particle field moves every frame |
| banners, chains and vents need sway | **no such objects exist** — the only named scenery is `contact-shadow`, `room-lights`, `void-plane` |

So one of the four was dead, one was half-right, one was already done, and one
was aimed at props that were never built. Item 1 below is closed and item 3 as
written cannot be started.

*Method:* four small systems, each independent, each revertible.

1. ~~**Drifting motes.**~~ **Already working.** The `dust-motes` field is 520
   live particles and its vertices move every frame (Δ3.6–40.4 per second,
   measured). Nothing to turn up. Binding its tint to the room palette is a
   separate, much smaller job than this entry implied.
2. ~~**Light flicker on emissive fixtures.**~~ **DONE 2026-08-12.** Each of the
   14 motifs in `MOTIFS` now declares `live: 'flame' | 'machine' | 'water'`,
   and each fixture gets a phase from the same seeded rng that placed it.
   `updateRoomLightFlicker(t)` runs in the frame loop immediately **before**
   `localLights.update()`, which already copied `source.intensity` onto the real
   light every frame — so the feature needed no change to the pool at all.
   Measured after: Δintensity 0.0000 → **0.47**.

   The waves are sums of pure sines about zero, so **each light's time average
   is exactly its old constant value** (worst drift measured: <0.5%). That is
   not decoration — the certification gate bands mean frame luminance and one
   region already sits 4 under its ceiling, so a wave with any DC offset would
   start failing screens for being alive. All 44 luminance gates still pass.
3. **Idle animation on props.** ~~Banners, chains and vents get a 2-second
   sway.~~ **Diagnosed three times today, each one wrong until the last. The
   earlier two are left here because the sequence is the useful part.**

   *First:* "those props do not exist" — from the ambient-motion probe finding
   that the only NAMED objects in a baked room are `contact-shadow`,
   `room-lights` and `void-plane`. That was a fact about names, not objects.

   *Second:* "props get their own mesh, but `meshAndCollide` also registers
   their collision columns, so animating one desyncs it from its own solid."
   True of the things that call `meshAndCollide` directly — but those are
   **blockers, gates and bridges**, i.e. functional geometry, not decoration.

   *Correct:* decorative props are stamped through `opts.stamp` **into the
   room's own voxel map** before it is meshed, and come out fused into a single
   room mesh. There is no per-prop object to animate at all. Collision is built
   from that same map, so nothing desyncs — the problem is that a banner is not
   a thing, it is a handful of voxels in the middle of the wall geometry.

   *So the two honest routes are:*

   a. **Split decorative props out of the room bake** into their own meshes
      that register no solids. Clean model, but it changes the bake path every
      room depends on, and it costs the draw-call saving that merging buys.
   b. **Displace them in the vertex shader.** Mark swayable voxels with a
      vertex attribute at stamp time and lean them in `makeLevelMaterial`'s
      vertex stage. This is how foliage is done everywhere, it needs no new
      meshes, and it cannot touch collision because collision reads the map and
      never the mesh.

   **(b) is the right one**, and two facts found while checking it make it
   much cheaper than it looks:

   - `render/materials.js` already installs a **sanctioned bounded
     `onBeforeCompile` hook** on the level material, and already injects at
     `#include <begin_vertex>` (that is where `vWorldPosition` is computed). A
     sway is another line in a shader stage that is already being edited, not a
     new mechanism.
   - `room-graph.js` meshes the **platform map with `collisionWorld = null`** —
     `meshAndCollide(pmap, scene, null, { origin })`. That mesh registers **no
     solids at all**, so geometry living in `pmap` can be displaced with nothing
     to desync from. That is the natural home for swayable dressing.

   **UNKNOWN NOW RESOLVED — and it rules (b) out on its own.**

   `room-graph.js:728` answers it:

   ```js
   !!built.getVoxelAt(x, y, z) || !!platformBuilt?.getVoxelAt?.(x, y, z)
   ```

   The platform mesh **is** the standing query, and `getVoxelAt` reads the voxel
   **map**, never the mesh. So a vertex-shader displacement moves the picture
   while physics keeps answering from the original cells: the player stands on
   the banner's old position and the banner is somewhere else. Silent, and no
   screenshot shows it.

   Both baked meshes are queried this way, so **there is currently no geometry
   in a room that may be displaced safely.** (b) alone is not a route.

   *The real route is (a) AND (b), and it is now specific:* add a **third mesh**
   for dressing only — built from its own map, registering no solids, and
   excluded from both `getVoxelAt` branches — then sway that in the vertex
   stage using the `onBeforeCompile` hook `render/materials.js` already
   installs. The physics exclusion is the load-bearing half; the shader is the
   easy half, which is the opposite of how this item has read all day.

   *Gate it on the physics, not the picture:* a spec that displaced dressing is
   never returned by the room's voxel query. The failure mode is standing on
   something that is not there, and it is invisible in any still frame.

4. ~~**Enemy idle before aggro.**~~ **DONE 2026-08-12.** Stated exactly, because
   the original wording was imprecise: enemy *bodies* already idle-animated
   (87–94% of parts moving), but **no enemy root ever changed facing** — 0 of 31
   across four levels. `if (dist >= this.aggroRange) return;` ran no branch at
   all. It now runs `_idleLook(dt)`: pick a heading, turn to it slowly, hold,
   pick another — a creature turns and holds; a sine sweep reads as a radar
   dish. Headings come from a position-seeded sequence, so a room does not scan
   in unison and the same spawn idles the same way twice. Measured after:
   **0 → 3-of-12 and 4-of-13 turning in any given second**, max 0.98 rad.

   The spec caught a real bug on its first run: anchoring the arc to
   `state.facingVec` snapped the body **2.72 rad** on the first glance, because
   the rig's rotation and the logical facing are not guaranteed to agree at
   spawn. It anchors to the rig — what the player can actually see — instead.

*Gate:* `tests/game/ambient-life.spec.mjs` (17 assertions) — registration and
de-registration, motion over time, fixtures out of phase, the zero-mean
property, seeded reproducibility, and **the frame-loop call site including its
order**, because every other assertion stays green if the loop never calls it.
*Counterfactual:* eleven break modes, all caught, including freezing the update,
moving it after the pool, and giving the wave a DC offset.

*Order:* ~~2~~, then 4, then ~~1~~, then 3 — cheapest and most visible first.

---

## 4. The menus are the last debug surface (days)

*Method:* exactly the job the HUD just had, and the pattern now exists to copy
from `ui/hud.js`.

1. **Inventory the title screen first** — every row, and whether a player needs
   it. `Altar Travel` and `Witness Scores` are player-facing; the beat list
   showing internal ids is not.
2. **Kill the monospace.** The HUD's system font + heavy text-shadow, no panel
   box, is the whole recipe.
3. **Give the title screen one image.** Right now it is text on a rendered
   scene. A single piece of key art behind the menu is the largest single
   improvement available for the smallest work — and it is the one job Blender
   is genuinely right for.
4. **The pause menu is a different problem to the title menu.** Pause must be
   readable *over* gameplay: dim the scene behind it rather than drawing a box.

*Gate:* extend `hud-player.spec.mjs`'s dev-string check to the menu screens —
it already knows how to assert "this vocabulary never reaches a player".

### Done 2026-08-13 — and the section missed the worst of it

**1, 2 and 4 are done. 3 is not, and is still the biggest single item here.**

Nothing in the suite can look at a menu, so `tests/qa/menu-captures.mjs` was
written first and photographed all eight screens plus the untouched boot frame.
**The first picture found something this section had not thought to look for.**

At t=1.5s, no input, **three layers were drawing the game's own name at once**:

```
boot     z=5   [0,0 1280x720]     ...and still saying "loading..."
div      z=25  [479,497 323x37]   a HUD toast
ss-menu  z=40  [0,0 1280x720]     the title screen itself
```

The toast is a bordered box drawn through the last menu row, so on the literal
first frame `Credits` was illegible under a duplicate of the title. Fixed three
ways — the toast deleted, the splash re-pointed off a 900ms guess and onto an
`ss:first-frame` event, and **the rule under both**: `toast()` has 35 call sites
that know nothing about menus, so `HUD.setMenuOpen` suppresses the layer. The
previous attempt at this had *moved* the box from `bottom: 48px` to `186px` to
dodge the story panel, which traded one collision for another.

**The same rule found a bug worth more than the picture.** `MenuOverlay` and
`Input` bind separate `window` keydown listeners, so one Enter against an open
pause menu both closed it *and* advanced the conversation behind it — a line
spent unread. `[` / `]` reach `loadLevel`, `M` reaches Mirror travel, and on a
pad `A` is attack *and* the menu's Enter. The gate is now in `input.js` at latch
time; putting it at the four read sites in the frame loop did nothing, because
the menu closes synchronously inside its own listener. Pinned by
`menu-input-capture.spec.mjs` (45 assertions, both directions, five break modes
proven), plus a vocabulary scan over all eight screens in `menu.spec.mjs`.

**1 (inventory)** — clean. Dev levels were already filtered on an explicit flag,
and the scan now proves no screen shows an internal id, a dev label, or an
`undefined`. Worth a second look by a person: Altar Travel lists beats as
`01 Crypt Breach`, `04 Sky Monument` — the numeric prefix is chapter numbering
or a build artefact depending on who is reading it. Left alone; that is an
authoring call, not a bug.

**4 (pause)** — done, and **the measurement changed the instruction.** "Dim the
scene rather than drawing a box" is right, but the backdrop behind a pause menu
in the Crypt peaks at **L\* 85.6 while its p99 is 21** — one percent of the frame
is far brighter than the rest, so a gradient would leave the bright corner
exactly where it was. Pause takes a heavier *flat* scrim (0.72 → 0.78, p99
21 → 16.8); the title takes the vignette.

**3 (one image)** — **still open, and still the biggest item on this list.** The
title's backdrop metered at mean L\* 12.3, p99 15.3: the "rendered scene" had
been painted out by the shared wash, and the hero sat behind the wordmark. A
vignette now lets the world through (p99 15.3 → **29.9**, mean unchanged), which
is composition, **not art**. Two things remain and neither is CSS:

- **Key art.** Genuinely the Blender job this section names. Nothing was made.
- **A composed camera.** The title orbits the player at radius 5 with the
  gameplay rig, so the only subject in the frame sits dead centre *behind* the
  44px title. Framing the hero off-centre needs the camera, not the scrim.

---

## 5. Fights are small and the same size every time (curve fixed 2026-08-12; ceiling still low)

**Measured.** Peak concurrent enemies per beat ran:

```
2 3 3 3 3 2 4 3 4 3 4 4 3 4      <- before
2 3 3 3 3 3 4 4 4 4 4 4 4 4      <- after
```

Only three distinct values in fourteen dungeons, and **the peak went DOWN four
times as the game went on** — beat 06 peaked at 2, the same as beat 01, a third
of the way in. Four enemies added to the four sagging peak rooms, at positions
mirrored from spawns already proven good; `tests/qa/enemy-ground.mjs` confirms
128 walking enemies with **0 buried at spawn and 0 after walking**.

`threat-curve.spec.mjs` now gates it: the peak never shrinks, the finale is
bigger than the tutorial, and no dungeon is without a real fight. Two break
modes proven. Everything else in that spec scales HP — none of it could ever
have said the campaign asks the same question every time.

**The ceiling is raised too (same day).** Final curve:

```
2 3 3 3 3 2 4 3 4 3 4 4 3 4      <- at the start of the day
3 3 3 4 4 4 5 5 5 6 6 6 6 7      <- now
```

Five distinct peak values instead of three, 124 -> 153 authored enemies, and it
matches this section's own target (early 3, middle 5, late 7) everywhere the
game allows it. New spawns were placed at the same radius from the room centre
as a spawn already proven walkable; `enemy-ground.mjs` reports 143 walking
enemies, **0 buried at spawn, 0 after walking**.

**One target was refused, and correctly.** Beat 13's peak room is SEALED, and
`room-seal.spec.mjs` caps a sealed fight at 6 — *"a fight, not a hunt"*. That is
a considered design rule and it outranks the number in this document, so beat 13
stops at 6. The rule found the conflict on the first full run; the doc did not
know the rule existed.


*Method:* do not raise every count. Build a **shape** per dungeon.

1. **Measure first:** `node tests/qa/content-density.mjs` prints the per-beat
   histogram. Today beat 01 peaks at 2 and beat 14 peaks at 4 — that is the
   thing to fix, not the mean.
2. **Set a target curve:** early beats peak at 3, middle at 5, late at 7. Write
   it into the level files as authored encounters.
3. **Use the arena seals you already have** (26 rooms, 26%) — a sealed room with
   six enemies is an event; the same six unsealed is a corridor.
4. **Vary the composition, not the count.** Four sentinels is one fight. Two
   sentinels plus a censer that heals them is a *problem*.

*Gate:* `threat-curve.spec.mjs` already exists and tests scaling; add an
assertion that peak concurrent enemies is monotonically non-decreasing across
the fourteen beats. It will fail today, which is the point.

### 5b. Two dungeons asked for no fight at all — fixed 2026-08-13

Every number above is about how BIG the fights are. None of them asks the prior
question: **is any fight mandatory?** Found by playing, not by measuring:

> *"you can literally run through grab keys and skip areas, I ran all the way
> from the start of dungeon 4 to the boss, didn't kill anything, collected keys
> and continued."*

Counted from the defs — `tests/qa/_seal-census.mjs`, and note that `grep seal`
gives the wrong answer, because several levels carry three copies of the comment
*explaining* sealing and would inflate the count by exactly the number of sealed
rooms:

```
                    sealed rooms   keys behind a fight
the other twelve       26              mostly 2/3 or 3/3
04 Sky Monument         0              0 / 3
12 Pyre Peak            0              0 / 3
```

A sealed room is the only thing that makes an encounter mandatory. Those two
dungeons had none, so nothing in them ever had to be fought.

**The obvious fix was a softlock and the suite caught it.** Sealing the three key
rooms — which is what beats 02, 06, 07, 08, 10 and 11 all do — failed six rooms
at once on `room-seal.spec`'s *"nothing that lives out of melee reach"*. Every
key room in both dungeons holds a **mote**, motes hover above every melee gate,
and a player with no ranged weapon would have been locked in a room they could
not clear. The mote-free rooms then failed two further rules: a sealed room needs
more than one door and more than one enemy.

**Not one room in either dungeon was legally sealable as authored** — and the
good candidates all failed on exactly one thing, the mote. So one mote per
dungeon was swapped IN PLACE (not moved — `threat-curve` pins peak concurrent
enemies per beat and relocating one would shrink it) and the boss-key room
sealed, since you cannot reach the boss without that key:

- `04 galleria`: mote → sentinel, `seal: true`
- `12 ashgallery`: mote → **bulwark**, second mote → lancer, `seal: true`

The bulwark is deliberate: it puts armour beside that room's censer, which is the
pairing §6 says the censer's puzzle needs to be posed against at all.

Result: **28 sealed arenas, 0 dungeons with no mandatory fight, 26 of 40 keys
behind one.**

*Two more gates earned their keep on the way through.* `elites.spec` failed with
`missing: mote/lunge` — the two motes swapped out were the only place in
fourteen dungeons that behaviour was authored; it now lives on `12 ventfield`.
And `seal-holds.spec` asserted `roomsDriven === 26` as a literal, which any new
seal breaks and which invites being "fixed" to whatever just ran; it now derives
the expected count from the defs, so it stays a coverage guard instead of a
rubber stamp.

---

## 6. ~~A third of the bestiary runs at a third of its depth~~ (DONE 2026-08-12)

**The method this section gave was wrong. Read this before trusting any other
"cheapest item on the list" in this document.**

It said: *add `ai:` variants to the weaver and censer entries in the level
files.* Doing that **deletes the ability it was meant to showcase.** The web and
the cense live inside `_aiWeave` and `_aiCenser`, so an `ai:` override does not
give a specialist a second behaviour — it takes away the only one it had, and
leaves a monster that looks the same and does nothing. Their empty row in the
matrix is correct by design; the matrix could not tell the difference between
"combination not authored" and "combination is nonsense", so it was the wrong
instrument and this document read it as gospel.

*What the gap actually was:* **company.** These two are the only kinds whose
design is about the other things in the room, and the sharpest case had never
been authored at all — **no censer had ever shared a room with a bulwark**, so
the "you cannot grind this down, kill the healer" puzzle its own source
describes had never once been posed against armour.

*What was done:* weaver and censer 3 → 6 spawns each, sited beside closers and
armour. Verified by driving the game, not by reading it — the bulwark healed
11 → 13 and was shielded for 332 frames.

*Gate:* `bestiary.spec.mjs` pins that no specialist is alone, that each is
within its **real** working radius (`CENSE_R`, `WEB_LEN`, imported not
restated), and that its AI is never overridden. It failed on its first run
against a beat-13 censer authored 7.62 units from both allies against a 7.0
radius — dead weight since the day it was written.

---

## 7. ~~Three systems used once each~~ — ALL THREE REPRISED 2026-08-12

Each of `gear-system.js`, `fluid-plane.js` and `light-line-system.js` was built,
tested, and used in exactly one dungeon. All three now return, **changed** — a
mechanic met once is a curiosity; one that returns different is a language.

| system | first use | reprise |
|---|---|---|
| gears | beat 02 — a timing puzzle you stand still and read | beat 13 stairworks — one faster gear between two spirals, an obstacle you cross while climbing |
| fluid | beat 11 — sludge that **slows** you (drag 0.35, wind 1.5) | beat 10 crystalgarden — meltwater that makes you **slide** (drag 0.96, wind 0.35) |
| light lines | beat 12 — fires only with the Light Caster equipped | beat 14 — fires with the staff and **any** weapon, longer, colder, cyan |

**The fluid reprise is deliberately not what this section asked for.** It wanted
a second fluid that makes the level *rise* while the player stands in it. That
moves a surface underneath them and needs every traversal probe re-run against a
moving floor. Changing how the floor *feels* rather than where it *is* cannot
strand anyone — the same "cheaper 80% first" trade this document already
recommends for room shapes.

**The light-line reprise needed a refactor first, and that refactor found a
bug.** Beat 12 wired it by monkey-patching `player.tryAttack` in `onEnter` and
restoring in `dispose` — the single most dangerous shape in this codebase to
copy, and the exact bug already suffered once when three specs installed a fake
`document` and never removed it. It now lives once, in
`world/light-lines-on-cast.js`, which restores **only if the installed function
is still its own** (an unconditional restore would delete a later level's patch).

Writing its spec caught a real defect inherited from the original: `.bind()`
returns a *new* function, so "restore the original" restored a copy, identity
was lost, and every enter/dispose cycle wrapped another bind layer around the
chain. `tests/game/light-lines.spec.mjs` (21 assertions) pins patch, restore,
non-stacking, out-of-order teardown, both gates, and — because the sweep found
this hole — **that the two call sites are not the same call**. Seven break
modes, all caught.

*Verified after each:* key-reachability 0 issues, door-reach 0 doors that lock
you in, enemy-ground 143 walking with 0 buried.

---

## 8. One attack button, no combo (week — riskiest item here)

*Method, smallest first, stopping when it feels good:*

1. **Two-hit string.** A second press inside the recovery window plays a
   different swing with different reach. `INPUT_BUFFER` already exists.
2. **Different stagger for a parry than for a hit.** The parry already staggers;
   make it *look* different — bigger recoil, longer hitstop, a distinct sound.
   The sound bank is fully wired (verified today), so this is one call.
3. **Directional finisher.** A third hit that moves the player forward.

*Why it is risky:* combat is the most-tested code in the repo, and every timing
number is load-bearing. Change one thing, run the full suite, look at the swing
readout (`tests/qa/swing-readout.mjs`) — and remember trap 1: **assert
directions in world space, never as the sign of an angle.** That trap exists
because a backwards swing shipped green.

---

## 9. ~~Boss arenas are the same room as everything else~~ — the premise was wrong

**Measured, and this section was wrong twice.** It said `ARENA_RULES` and
`shapeBossArena` were "barely used". In fact **all fourteen** kits declare a
`bossRule`, every boss room clears the `half >= 8` guard, and every one places
voxels. The channel was fully wired.

What WAS true is that the placement was wildly uneven:

```
stepped_pit   272      basin_low      80      sunken_dais  64
sunken_shelf   88      plaza          42      open_platform 38
mirrored_hall  34      flooded_channel 34     vent_ring    24
folded_core    24      central_machine 16     ice_atrium   16
rib_cathedral   6  <-- index_court     6  <--
```

`colonnade` put **six single cells** into a room 26 units across, so the Bone
Cathedral and the Index Court were the only two boss arenas a player could not
tell from an ordinary room. A rule that is declared, reached, and then places
nothing worth seeing fails exactly like one that is never called; only the
symptom differs.

Rebuilt as paired 2-wide columns marching down the long axis, spaced by room
size so a bigger hall gets a longer nave: both now place 20.

**Height 2, not 3 — and the suite is why.** The first version used 3-voxel
columns and `platform-reachability` immediately flagged nine cells stranded
above the player's step height in the Index Court. Every other rule here tops
out at 2 for that reason.

`room-lights.spec.mjs` now gates it: every boss arena is shaped, and none is
shaped so thinly it reads as an ordinary room.

**Still open, and it is the interesting half:** this section also asks that the
arena *make one of the boss's existing moves better*. That is per-boss design
work, fourteen times, and none of it is done. What is fixed here is that all
fourteen arenas are now visibly arenas.

**Warning for whoever picks it up: the two examples in this section were wrong.**
"Vents the Wyrm surfaces from" — the Magma Wyrm has no burrow or surface move at
all. It is a six-segment chain that follows a path and lays fire trails
(`roster.js`, `class MagmaWyrm`: `pathT`, `fireCd`, `trails`). Building vents for
it would be **adding a move**, which is precisely what the sentence above it
forbids. Its `vent_ring` arena is already the right shape for what it does — a
ring is something a snaking chain weaves through.

So the method holds and the examples do not. **Read the boss class first and
list the moves it actually has**, then shape for one of those. Every time this
document has offered a specific target this session, measuring first has
contradicted it — the enemy-AI advice would have deleted abilities, three of
four ambient claims were false, the encounter target collided with a sealed-room
rule, and "barely used" described a fully wired channel.

---

## 10–11. Release credibility (afternoon each)

- ~~**App icon**~~ **— DONE 2026-08-12.** `scripts/make-icon.mjs` generates
  `assets/icon.ico` (16/32/64/128/256) and `assets/icon.png` with nothing but
  Node's zlib, and `build.win.icon` points at it. The art is authored once on a
  32×32 voxel grid and every export is a whole-number rescale of that, so it is
  still legible at 16px — which is the only size that gets looked at daily.
  Colours are lifted from `ui/menu.js`, so the icon and the title screen are the
  same object. Blender turned out not to be needed. `tests/game/app-icon.spec.mjs`
  regenerates from the script and compares bytes, so the committed binary cannot
  drift from its source; verified present in all three shipped `.exe`s.
- **Signing:** costs money, not time. A certificate removes the "unknown
  publisher" warning. Nothing in this repo can substitute for it.
- **Key art and a store page:** the only images this project has of itself are
  30-pixel characters in rooms. One rendered hero at full size is a different
  object entirely.

---

## 12. Nobody has played it end to end — DONE, owner report 2026-08-16 (notes not yet filed; see below for what they should capture)

*Method:* fresh save, dev mode off, no teleporting, start to finish, with a
notepad. Write down **the minute** anything is confusing, boring or annoying —
not the fix, just the minute and the feeling.

Every automated thing in this repository — 4,900+ assertions, the probes, the
certification captures — exists to tell you the game is *correct*. **None of
them can tell you the second hour is boring.** This is the largest unknown in
the project and it is the only item on this list I cannot do for you.

---

# If you want a running order

**Done 2026-08-12:** ~~item 6~~ (and its stated method was wrong — read it) ·
~~the Line Caster fix from item 7~~ · ~~the app icon~~.

**Next:** item 3 (ambient life — best value), then item 4 (menus).

**Then:** item 5 (encounter shape), item 7 (system reprises).

**Then the big one:** item 2, one dungeon, with a playthrough after it.

**Before any of it ships:** item 12.

Hand me any heading and I will start with the measurement.
