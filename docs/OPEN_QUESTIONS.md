# Four questions for a senior engineer

Written 2026-07-22, after the renderer pass. Self-contained: you should not need
to read the rest of the repo to answer any of these.

Each one is blocked on a **judgement**, not on effort. I have deliberately not
resolved them by picking a number, because in every case the number is the thing
in question and choosing it myself would be assuming the answer.

Reproduce every figure below with:

```bash
node tests/qa/contrast-probe.mjs     # luminance + contrast, all 16 levels + boss rooms
node tests/qa/shadow-census.mjs      # shadow participation per level
```

---

## 1. Is the Abyss luminance band still the right target?

**Answer this one first — the other two lighting questions are downstream of it.**

The certification gate holds every Abyss level to a mean frame luminance of
`[35, 75]`, and Crust to `[45, 90]`. Those bands were set when the Abyss ran
**ambient 3.40 against a key of 2.10** — roughly 62% of its light arriving from
every direction at once, which cannot describe a surface.

That lighting model has since been replaced (ambient **1.55**, key **3.35**,
plus a real environment map and working shadows). The band was chosen to make
the *old* model survivable. I have spent this pass tuning fourteen dungeons
toward it.

**The risk:** if `[35, 75]` was a workaround for flat lighting rather than a
statement about readability, then some of that tuning is aimed at the wrong
place — and the Abyss may now be brighter than it should be, having been pulled
up to clear a floor that existed for a different reason.

**What would settle it:** open a Crust room and an Abyss room side by side and
say whether the Abyss reads as *oppressive* or merely as *dim Crust*. Current
values are in `CERTIFICATION.md`; captures are in `docs/media/certification/`.

---

## 2. Should a boss arena be held to the same ceiling as an empty room?

Boss rooms had **never been measured** — the gate samples only the room a level
loads into. Measuring them found four of fourteen above their ceiling:

| room | beat | lum | ceiling |
|---|---|---|---|
| `spurpit` | 03 Duval Sink | 98.8 | 90 |
| `golemwallow` | 11 Rot Mire | 94.1 | 75 |
| `twincage` | 10 Cryo Vault | 92.4 | 75 |
| `prayerhollow` | 08 Bone Forest | 79.7 | 75 |

**I did not gate this**, for two reasons:

1. **The statistic does not hold still.** Sampled on separate runs the same room
   disagrees with itself by 20+ points in both directions (Spindle 92.7 then
   69.2; Cryo 81.2 then 91.3) because the boss's emissive pulses and flashes. A
   gate built on that would fail randomly, which this suite has already learned
   is worse than no gate.
2. **The bands were calibrated on empty entry rooms.** An arena containing a
   deliberately glowing boss may legitimately belong above that ceiling.

**A light trim is the wrong lever, and this is measured, not assumed:** cutting
Cryo's key 3.35 → 2.68 and its ambient 2.02 → 1.24 moved the room's luminance by
**one point**. The brightness is coming from emissive boss bodies and bloom, not
from the light rig.

**What I need:** either (a) a boss-room ceiling that reflects what a boss fight
should look like, and I will find a stable statistic to gate it with, or (b) a
decision that boss arenas are exempt and why — which I will write down so nobody
re-opens it. Please do not settle it by loosening the existing number.

---

## 3. Vertical interest inside rooms — the last of ticket 6

Everything else in the renderer pass was safe to apply to all fifteen levels in
one pass **because of a structural argument**, not because it was tested
carefully:

- the bake-time trim only adds voxels **above the wall top** and only on the
  **room perimeter** — provably nowhere the player can stand
- the weathering is **colour only** — the occupied cell set is byte-identical
  before and after

Each has a spec that checks *the argument* rather than the output.

**Vertical interest can make neither claim.** Changing floor heights changes
where the player can walk, so it needs per-level design work and a traversal
re-audit (camera contract, platform reachability, pickup reachability, door
triggers). It is the one item I would not do globally, and the one most likely
to make the game look different.

Budget is not the constraint: the campaign runs at ~37k triangles and ~41 draw
calls per dungeon, against a renderer that will take several hundred thousand.

---

## 4. Frame rate and the playthrough — needs hardware

Headless Chrome here runs software GL at **~1.5 fps**, so nothing automated can
certify frame rate or feel. Outstanding since Phase R:

- a by-hand fresh-save, dev-off playthrough
- an overlays-on ≥60 FPS pass on a real GPU

Note for whoever picks this up: the 44 certification **captures** were held back
for a session on the mistaken belief they needed a GPU too. They do not —
`CERTIFICATION.md` says they are headless captures by design, and they are now
regenerated and scripted (`tests/qa/certification-captures.mjs`). Only the frame
rate genuinely needs hardware.

---

## What is NOT open

So there is no ambiguity about where the line is: all six tickets of
`docs/VISUAL_PLAN.md` are implemented, along with per-kit weathering, the
capture script, the generated gamepad legend, and the gate improvements that
came out of doing them. Suite 2575 → 2966. The reasoning behind each change is
in `CHANGELOG.md`, and the traps worth knowing before touching any of it are in
`HANDOFF.md`.
