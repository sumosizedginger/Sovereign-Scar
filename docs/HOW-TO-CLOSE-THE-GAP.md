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

## 1. "Which one is me" — DONE THIS SESSION, and here is what actually worked

You said you did not know how to fix this, so I picked and built it rather than
ask again.

**What I did:** the hero's cloak went from 0.66 × 0.86 to **0.92 × 1.15** — wide
enough to be the widest part of the outline from every bearing, long enough to
break the round blob into a shape with a direction. Then the cloak was given the
same separation rim the body already had, so it is a dark shape *with a lit
edge* — it reads against a pale floor because it is dark and against a dark
floor because its edge is bright.

**Why the size and not the colour:** enemies are rounded lozenges built from the
same six parts. Anything that changes the hero's *outline* separates them;
anything that changes only their colour does not survive greyscale.

**What I learned doing it, which changes how you should read my numbers:**

- The dark navy cloak dropped average-brightness separation (ΔL\*) hard, for the
  same reason the rejected black outline did: a big dark mass pulls the average
  toward the floor. **The same trap, in a second costume.**
- Then the probe itself turned out to be unreliable for this comparison. Its
  "floor" sample is a ring at a radius derived from the character's *height* —
  and a cloak that grows sideways spills into that ring, so the floor reads
  brighter every time the cloak gets bigger. **ΔL\* cannot be used to A/B cloak
  sizes at all.** Documented in the probe.
- It also only ever took **one sample**, and the same build measured three times
  gave floor readings of 27.8, 30.7 and 34.5. It now takes **five and reports
  the median plus the spread**, which is the identical fix the luminance gate
  needed two sessions ago.

So the trustworthy evidence is the **edge metric** (measured on rays that cross
the boundary, so the ring problem does not touch it) and the pictures:

| | before | after |
|---|---|---|
| edge ΔL\* — Ruined Town | 32.5 | **42.8** |
| edge ΔL\* — Leviathan | 32.9 | **40.1** |
| edge ΔL\* — Crypt | 31.6 | 31.4 |

The crowded rooms — exactly where you get lost — improved most.

**Honest limit:** the hero now has a hard shape no enemy has, and in greyscale
you can point at them. It is better, not solved. If you want it *unmistakable*,
the next lever is item 1b.

### 1b. If that is still not enough — the value rule (afternoon)

Right now hero and enemies are lit identically, so the only differences are hue
and shape. The rule that fixes it permanently: **the hero is light, enemies are
dark** — or the reverse, consistently, campaign-wide.

*Method:* one multiplier on the actor material, set per rig from the same
`HERO_RIG` / enemy palette path that already carries `rimStrength`. Hero ×1.25,
enemies ×0.8. Then re-shoot the greyscale town frame; if you cannot instantly
point at yourself, revert it — it is one number.

*Gate:* extend `hero-readability.spec.mjs` — it already imports the real hero
options — to assert the hero's multiplier is strictly greater than every enemy
palette's. Break it by equalising them and watch it go red.

---

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

## 6. A third of the bestiary runs at a third of its depth (afternoon)

The weaver and the censer are each authored **three times, always on default
AI**, out of nine kinds. Everything they need is already built.

*Method:* pure authoring — add `ai:` variants to existing enemy entries in the
level files. No new code. Aim to fill perhaps ten of the fifteen empty cells in
the matrix; leave some empty, because a matrix that is 100% full usually means
combinations were added that nobody designed.

*Gate:* the probe now derives its roster from `ENEMY_PALETTES` (fixed today) and
`bestiary.spec.mjs` pins the two lists together, so a tenth kind cannot be added
without appearing in both.

*This is the single cheapest content on the list.*

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

*Do first, and it is a five-minute job:* fix or delete the phantom Line Caster
(audit pass 2 §A) so the Pyre stops advertising a reward it does not give.

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

- **App icon:** electron-builder logs *"default Electron icon is used"*. Point
  `build.win.icon` at a 256×256 `.ico`. This is where Blender earns its keep.
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

**This week:** finish item 1 by looking at the new greyscale frame and telling me
yes or no (item 1b if no) · item 6 (afternoon, free content) · the Line Caster
fix from item 7 · the app icon.

**Next:** item 3 (ambient life — best value), then item 4 (menus).

**Then:** item 5 (encounter shape), item 7 (system reprises).

**Then the big one:** item 2, one dungeon, with a playthrough after it.

**Before any of it ships:** item 12.

Hand me any heading and I will start with the measurement.
