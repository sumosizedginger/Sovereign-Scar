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
than an accessory — the old fresnel was geometrically defeated by the 56° camera
and did nothing in the rooms that needed it most.

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

## 2. Rooms have relief but not shape (weeks — the big one)

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

---

## 3. Nothing moves that you did not move (days — best value on the list)

*Method:* four small systems, each independent, each revertible.

1. **Drifting motes.** A hundred slow particles per room, tinted by the kit's
   own atmosphere colour. `fx/atmosphere.js` and `fx/soul-motes.js` both exist;
   this is mostly turning them up and binding them to the room's palette.
2. **Light flicker on emissive fixtures.** `world/room-lights.js` already places
   real lights at kit motifs. Give each a slow sine with a per-fixture phase
   offset. Torches breathe; machines pulse. One number each.
3. **Idle animation on props.** Banners, chains and vents get a 2-second sway.
   The actor animator already does procedural motion; the same approach applies
   to a prop group.
4. **Enemy idle before aggro.** Enemies currently stand perfectly still until
   you enter their radius. A slow look-around costs nothing and turns a prop
   into a creature.

*Gate:* a spec that a room's ambient systems produce non-zero motion over one
second of simulated time. *Counterfactual:* freeze the update and watch it fail.

*Order:* 2, then 4, then 1, then 3 — cheapest and most visible first.

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

---

## 5. Fights are small and the same size every time (days, authoring not code)

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

## 7. Three systems used once each (days)

Gears (beat 02), light-lines (beat 12), fluid (beat 11). Each built, tested,
used once.

*Method:* give each a **second appearance that changes the rule**, which is how
a mechanic becomes a language instead of a gimmick.

- **Gears:** beat 02 teaches "turn the gear to open the way". The second
  appearance should make a gear something an enemy can turn *back*.
- **Light-lines:** beat 12 fires a beam. The second should need the beam
  *reflected* — and `reflector_plate` already exists as an item and is granted
  by a cache, which suggests this was the original plan.
- **Fluid:** beat 11 has fluid to wade through. The second should make the level
  *rise*, so a room changes while you are in it.

~~*Do first, and it is a five-minute job:* fix or delete the phantom Line
Caster (audit pass 2 §A) so the Pyre stops advertising a reward it does not
give.~~ **Done 2026-08-12.** The phantom `line_caster` id is deleted and the
beam is gated on the Vector Staff, proven by driving the game: no staff → 0
lines, staff → 1 line. It is purely additive, so a player who never finds it
loses a flourish and never a route. The reprise work above is still open.

*Gate:* each system already has a spec; extend it to assert the mechanic is
exercised in more than one level file, from the real level defs.

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

## 9. Boss arenas are the same room as everything else (days per boss)

`world/kit-props.js` already exports `ARENA_RULES` and `shapeBossArena` — the
channel exists and is barely used.

*Method:* one boss at a time. Give the arena a feature the fight uses — pillars
the Arachnid can web between, vents the Wyrm surfaces from, a raised rim the
ranged boss retreats to. **The arena should make one of the boss's existing
moves better, not add a move.**

*Gate:* `boss-bodies.spec.mjs` and the arena-shaping spec exist; assert each
boss room differs structurally from its dungeon's ordinary rooms.

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

## 12. Nobody has played it end to end (a weekend, and it is yours)

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
