# Four questions for a senior engineer

Written 2026-07-22, after the renderer pass. Self-contained: you should not need
to read the rest of the repo to answer any of these.

> If you went looking for this file and could not find it: for three sessions
> the game was being pushed to `My-Engine.git`, because that is where `origin`
> points in this clone. `Sovereign-Scar.git` was 11 commits behind. Fixed, and
> flagged at the top of `HANDOFF.md` so it does not recur.

Each one is blocked on a **judgement**, not on effort. I have deliberately not
resolved them by picking a number, because in every case the number is the thing
in question and choosing it myself would be assuming the answer.

Reproduce every figure below with:

```bash
node tests/qa/contrast-probe.mjs     # luminance + contrast, all 16 levels + boss rooms
node tests/qa/shadow-census.mjs      # shadow participation per level
```

---

## 1. Is the Abyss luminance band still the right target? — RESOLVED 2026-07-23

**Decision (owner): brightness should be the same across the board.** Not a
deliberately darker "oppressive" Abyss — Crust and Abyss should read at the
same exposure, with the Abyss's identity carried entirely by hue (violet/
charcoal) and contrast shape, never by a lower brightness floor.

Implemented: `assets/palettes.js`'s `MOOD_PRESETS.abyss` raised (ambient 1.55→
2.3, key 3.35→4.8) until Abyss dungeons measured in the same range as Crust
dungeons. `LUM_BANDS.abyss` in `tests/visual-sanity.spec.mjs` is now `[45,90]`
— identical to Crust — instead of its own darker `[35,75]`.

**Correction, same day:** the owner played it — "everything purple." Matching
the *number* was not the same as matching the *look*: cranking a saturated
ambient/key that hard flooded every surface in one uniform violet, with no
material variety left. A screenshot proved it. The fix was two-part: pull the
light intensity back down (ambient 2.3→1.85, key 4.8→3.8) and, more
importantly, desaturate `ABYSS_COLORS`' structural tones (`basalt`,
`charcoal`, `abyssFloor`, `abyssWall`) toward neutral grey — luma-preserving,
so the brightness fix still holds — while leaving the actual accent colours
(gold veins, magma, ice, neon) fully saturated. Identity now lives in those
accents standing out against a duller field, not in the field itself being
saturated. Re-measuring surfaced two more regressions from the same cause —
Beat 08-bone's dungeon-level tune and the overworld's Abyss multiplier were
both set against the original dimmer preset and compounded once it was
raised — both re-tuned down. Verified: full suite green (2968 assertions),
plus a direct screenshot comparison (`docs/media/certification/`) confirming
real tonal variety instead of a wash.

---

## 2. Should a boss arena be held to the same ceiling as an empty room? — RESOLVED 2026-07-23

**Decision (owner): yes — same brightness as everywhere else, this was a
problem.** Measuring every boss room (not just entry rooms) found ALL fourteen
running notably brighter than their own dungeon's normal-room mean, not only
the four that broke the old ceiling outright.

**The light-trim lever was re-tested and now works** — the earlier finding
that trimming Cryo's key/ambient moved luminance "by one point" was true under
the *old*, dimmer Abyss preset. Under the brighter preset from question 1, the
same lever is dramatically more effective: the scene sits far enough up the
tonemap curve that even a modest light cut pulls it back down disproportionately
(one room dropped from 149 to 53 on a 30% trim). Re-measured per room
(`tests/qa/contrast-probe.mjs`, median of 5 samples after a ~1s settle — the
first ~700ms after entering a boss room is a genuine transient, not part of
the room's steady brightness) and given each of the nine worst rooms its own
`lightTune` in its level file, found by a coarse-then-fine search against its
own dungeon's normal-room mean:

| room | beat | before | after | dungeon target |
|---|---|---|---|---|
| `spindlecrown` | 02 Spindle | 92.6 | 62.3 | 51.6 |
| `spurpit` | 03 Duval Sink | 98.8 | 77.4 | 76.1 |
| `cloudcourt` | 07 Sluice | 55.9 | 44.6 | 53.6 |
| `prayerhollow` | 08 Bone Forest | 79.7 | 53.6 | 58.3 |
| `moothall` | 09 Ruined Town | 68.4 | 50.9 | 54.4 |
| `twincage` | 10 Cryo Vault | 92.4 | 56.9 | 55.6 |
| `golemwallow` | 11 Rot Mire | 94.1 | 51.0 | 54.6 |
| `caldera` | 12 Pyre | 62.5 | 46.0 | 57.5 |
| `witnesscrown` | 13 GUMOI | 61.8 | 41.4 | 47.4 |

Three of these (`cloudcourt`, `moothall`, `caldera`) sit on a genuine knife's
edge — a 2-point change in trim swings luminance by ~35 points — so their
match is closer to "much better" than "exact"; a perfect match isn't available
from this lever alone for those three. Not gated (the measurement is still too
noisy run-to-run to assert on directly), but no longer left untouched either.

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
