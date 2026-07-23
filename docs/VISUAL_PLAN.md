# Making the world look like a place

Six tickets, all **implemented**. This was a plan; it is now a record, kept in
ticket order so each change can be found, understood and reversed on its own.

Every number here came from a probe against the running game, not from reading
the code and guessing. Re-run them:

```bash
node tests/qa/contrast-probe.mjs   # mean + centre-crop contrast, all 16 levels
node tests/qa/shadow-census.mjs    # who casts, who receives, and who is exempt
node tests/qa/env-probe.mjs        # is there actually an environment map
node tests/qa/trim-cost.mjs        # triangles and draw calls, trim on vs off
```

---

## Baseline, and where it ended up

Beat 01, game booted, level loaded:

| | before | after |
|---|---|---|
| `scene.environment` | **null** | procedural PMREM, per mood |
| ambient / key (Crust) | **1.70 / 1.90** | **0.78 / 2.55** |
| ambient / key (Abyss) | **3.40 / 2.10** | **1.55 / 3.35** |
| rim | 0.65, never driven by mood | 0.80 Crust / 1.05 Abyss |
| meshes receiving shadow | **7 of 151** | **100% of solid meshes** |
| rooms inside the sun's frustum | **1 per dungeon, 0 of 49 overworld screens** | **all of them** |
| metalness ceiling | **0.12** | 0.65 metal / 0.35 polished |
| contact shadows | none | one per actor, boss and pickup |
| triangles / draw calls | 79,572 / 43 | +2% / **unchanged** |
| gate | mean luminance only | mean **and** contrast floor |

---

## Ticket 1 — Contrast floor on the luminance gate ✅

**Landed first, because it made tickets 4 and 5 legal.**

`tests/visual-sanity.spec.mjs` banded each room's **mean** frame luminance. A
mean cannot tell a well-lit room from a flat one: a room with a strong key and
deep shadows meters *lower* than the same room under a flat ambient wash. So
every time a room failed low, the cheapest legal fix was to raise ambient or add
pale geometry — both of which flatten it. That is how ambient reached 1.7 against
a key of 1.9, and why Beat 01's tomb has decorative gold-leaf seams.

**Done:** the sampler returns a distribution, not a number
(`src/game/render/luminance.js`), and the gate also bands `p90 − p10`.

**The plan said full-frame spread. The probe said otherwise, before a line of it
was written.** Measured across the whole frame the spread reads **58–160** and
would pass any floor worth setting — because `p10` comes out at **0** in nearly
every level, and that zero is the **vignette** crushing the corners, not a
shadow. Vignette strength does not move when lighting does. Cropping to the
middle half of each axis turns the same statistic into one that ranges **14 to
166** and actually separates flat levels from lit ones.

**Floor: 12, then tightened to 13** after the rebalance. It is a ratchet — set
just under the worst level so nothing can regress — and it is meant to be
tightened every time the worst level improves.

**Proven to discriminate:** `tests/game/luminance.spec.mjs` feeds synthetic
frames whose answer is known by construction. The load-bearing case is that a
flat grey frame **passes the mean band and fails the contrast floor**. It also
pins the vignette case so the measurement cannot quietly move back to full-frame.

**Rollback:** delete the `contrast` assertion in `visual-sanity.spec.mjs`.

---

## Ticket 2 — `receiveShadow`, and contact discs ✅

151 meshes, **7 receiving**. Props did not darken under an overhang, enemies did
not sit in a doorway's shade, nothing cast onto anything else. Eleven of the
fourteen bosses never had the line; no pickup cast anything; the hero's weapon
opted out of both.

**Done:** one rule in `src/game/render/shadow-roles.js` — everything solid casts;
everything solid receives unless glowing or transparent; **anything that does not
receive must say why**, in `userData.shadowExempt`. Setting the flag in more
places would have been the same bug waiting to happen.

That rule replaced an emissive-intensity cutoff, which was the wrong shape: two
boss parts and the grapple claw sat at exactly 0.4 and 0.5 against a `> 0.5` test
and looked like defects. Any emissive colour at all is a glow.

**Held weapons cast again** — the blade sweeping its own shadow across the floor
mid-strike is the best grounding cue the swing has. They still do not *receive*:
0.10 units wide against a camera 17.5 up is one or two shadow texels, which reads
as edge flicker. The shield overrides that; a plate is broad enough.

**Contact discs** (`src/game/fx/contact-shadow.js`) under every actor, boss and
pickup. A cast shadow needs caster, receiver and light to line up; a disc is
always directly beneath its owner, so it reads when the sun is behind a wall or
the shadow is off-screen. It also encodes height — spreading and thinning as an
actor rises. Ground height comes from the actor's own Y, since the collision
world is XZ-only: falling is adopted immediately, rising only once the new height
holds still, which is what tells a jump from a step onto a platform.

Discs are reconciled from the live entity lists each frame rather than attached
at spawn sites, so a new enemy kind cannot ship without one.

**Gate:** `solidRecv === solid` per level — equality, not a threshold, because a
threshold invites the next person to add an unshadowed mesh and stay under it.

**Rollback:** per-site, independently.

---

## Ticket 3 — A procedural environment map ✅

`scene.environment` was null. `src/engine/environment.js` builds PMREM maps and
nothing ever called it; `src/engine/skybox.js` likewise. So every PBR material
in the game did its specular maths against no environment, and `materials.js`
capped metalness at **0.12** with the note *"this engine has little environment
light, so a strongly metallic surface would read dark"* — a correct workaround
for a missing input that stayed long enough to look like an art decision.

**Done:** `src/game/render/mood-environment.js` generates a 64×32 equirectangular
gradient per mood on a canvas (zenith → horizon → nadir), PMREMs it, caches per
mood and rebuilds on mood flip. No new asset files — the zero-build,
offline-first promise holds. At this scale IBL is about the *direction* of the
reflection, not its detail.

Metalness ceiling raised: **metal 0.65, polished 0.35, energy 0.24, matte 0.04**,
via soft bands mirroring `classifyFamily`'s thresholds (bands not steps, or a
hard cut at a luminance boundary shows as a seam across a gradient wall).

**Finding, recorded rather than papered over:** the plan predicted this would
move specular response without moving albedo. **It did not.** `scene.environment`
feeds MeshStandardMaterial a diffuse irradiance term as well as a specular one —
it is ambient light by another name. At 0.85 it behaved exactly like raising
ambient: the overworld went 79 → 96 and broke its band, and contrast *fell*
across the board. So the ticket landed conservative on its own and the rest of
the budget was spent in ticket 5, where trading flat ambient for directional
environment is a strict improvement.

No per-material `envMapIntensity`: it multiplies with `scene.environmentIntensity`
and would make walls reflect less than the props standing against them, for a
reason nobody could later reconstruct. One knob, in one file.

**Rollback:** `scene.environment = null` and restore the 0.12 cap. The two are a
pair, and `material-hierarchy.spec.mjs` fails if one moves without the other.

---

## Ticket 4 — The sun follows the active room ✅

The shadow frustum is a ±30 box aimed at the world origin that never moved.
Rooms sit on a **64-unit** grid, so only grid (0,0) was ever inside it. Every
dungeon starts at (0,0) — **the first room you see in any level is the one room
that works**, which is why this survived for the life of the project.

The plan recorded "5 of 6 rooms". The counterfactual run found the overworld at
**0 of 49 screens**: it sits at world coordinates 512–896, so the entire surface
world was outside the frustum, and nobody had counted it.

**Done:** `MoodController.aimKeyLight(x, z)`, driven from the frame loop with
`level.currentRoomOrigin()` (falling back to the player for the overworld and
sandbox). The light and its target move **together**, preserving the offset, so
the sun's direction never changes — moving only the light would re-angle the sun
per room, which looks like the world spinning around the player. The aim is
**snapped to a 16-unit grid**, because sliding a directional shadow map a
fraction of a unit per frame makes every shadow edge crawl.

**Gate:** `tests/shadow-frustum-e2e.spec.mjs` walks every room of every beat,
checks corners as well as centres, and asserts the sun keeps one direction
across rooms. **Reverting the fix fails 31 of its 50 assertions.**

`src/engine/lights.js: updateShadowFollow` looks exactly like the fix for this
and is not — single-axis, pins target Z to zero, a 2.5D leftover. Locked Decision
**D5** forbids editing engine code, so it cannot be deleted; the spec fails if
game code ever imports it.

**Rollback:** stop calling `aimKeyLight`. **Certification captures must be
regenerated** — nearly every room gains shadows.

---

## Ticket 5 — Rebalance ambient against the key ✅

**Do ticket 1 first** — this was illegal against the old gate, which would have
scored the flat version higher.

Ambient 1.70 against a key of 1.90 in the Crust; **3.40** in the Abyss, twice the
Crust's flat light in the mood that is meant to be oppressive. Every per-level
`lightTune` was an ambient multiplier too — Beat 07 carried **3.4×** on top of an
already-flat preset. All of it arrived honestly: the gate banded means, and
ambient is the cheapest way to lift a mean.

| light | Crust before → after | Abyss before → after |
|---|---|---|
| ambient | 1.70 → **0.78** | 3.40 → **1.55** |
| key | 1.90 → **2.55** | 2.10 → **3.35** |
| fill | 0.70 → **0.85** | 1.10 → **1.25** |
| rim | 0.65 (never driven) → **0.80** | 0.65 → **1.05** |
| environment | — → **0.55** | — → **0.60** |

The **rim was bound but never driven** by either preset, so it sat on the engine
default in both moods. The Abyss needs more of it, not the same: its key is
dimmer against its background, so a silhouette separates on the rim or not at
all — the failure that produced the unreadable 9–26 rooms originally.

Per-level trims were rebalanced from ambient toward key. The overworld got a
`lightTune` of its own: it is the one place with no ceiling and no walls, so it
takes the key across its whole floor plane and hit 97 against a ceiling of 90
while every dungeon sat at 55–79. Trimming one exterior beats re-darkening
fourteen interiors.

**Result: contrast rose on 14 of 16 levels**, Abyss dungeons roughly doubling
(Bone 34 → 78, Town 43 → 82, Pyre 43 → 79, Sluice 44 → 77). The two that fell are
recorded in `tests/game/luminance.spec.mjs`, not hidden.

**Rollback:** restore the table above. Regenerate certification captures.

---

## Ticket 6 — Spend the budget ✅ (partly — see below)

**79,572 triangles. 43 draw calls.** Room for roughly an order of magnitude more
before anything hurts. The world was not under-detailed for a technical reason;
nothing had asked it for more.

**Done — silhouette:** `src/game/world/room-trim.js` adds parapets with broken
heights, pilasters every seventh cell, and taller corner posts, generated from
the existing room definitions for all fourteen dungeons and the overworld.

Two rules make it safe to apply everywhere at once without re-auditing a single
level: it only adds voxels **above the wall top** (never `y <= 2`, the band the
hero's body occupies), and only on the **room perimeter** (never interior
structures, where platforms and grapple routes live).
`tests/game/room-trim.spec.mjs` bakes each room with and without trim and
requires the occupied cell set at `y <= 2` to be **byte-identical** — asserting
"trim stays above y=2" from the outside would only restate the implementation.

**Cost: +728 triangles, +0 draw calls** in a dungeon room. It merges into the
same voxel map the room is meshed from, which is the whole reason it is done at
bake time rather than as props.

Two things worth knowing:

- The trim was shaded **darker** than the wall cap first. The gate rejected it in
  one run: seven Abyss levels lost ~4 points of mean and fell out of band. Trim
  stands against the **sky**, and the Abyss sky is dark violet — dark trim on a
  dark background is invisible, not moody. It lifts now.
- Taller walls cast more real shadow into rooms, which only works because of
  tickets 2 and 4. The light was raised to hold the mean while keeping the
  contrast. That trade is exactly what the contrast floor exists to arbitrate,
  and this was the first time it did.

**Still open, and deliberately so.** The plan listed four items and this delivered
one and a half. Remaining, in value order:

1. **Vertical interest inside rooms.** Floors are flat. Height variation is the
   main thing separating "a room" from "a place", and it is also the item that
   *cannot* follow the two safety rules above — it changes where the player can
   walk, so it needs per-level design work and a traversal re-audit, not a
   global pass.
2. **Trim and edge geometry at the floor/wall junction** — a visible plinth. Same
   caveat, smaller: it eats a cell of floor around the perimeter, so door
   triggers and pickup reachability need checking.
3. **Decals** — scorch, water staining, moss in the Mire, frost in the Cryo — as
   vertex-colour work at bake time. Free at runtime and gameplay-neutral by
   construction, so this is the cheapest of the three.

The headroom is still there: the campaign runs at ~37k triangles per dungeon
against a budget that will take several hundred thousand.

---

## Order, and what each one costs to undo

| # | ticket | risk | changes existing rooms? |
|---|---|---|---|
| 1 | Contrast floor on the gate | low | no — a new assertion |
| 2 | `receiveShadow` + contact discs | low | yes, subtly — everything is shaded now |
| 3 | Procedural PMREM + real metalness | low | specular only |
| 4 | Sun follows the active room | medium | **yes — nearly every room gains shadows** |
| 5 | Ambient/key rebalance | medium | **yes, everywhere** |
| 6 | Bake-time trim | low | additive, above the wall line |

**The 44 certification captures are stale and must be regenerated.** They were
stale before this work started; tickets 4 and 5 guarantee it. Procedure is in
`CERTIFICATION.md`; press `H` to hide HUD chrome for clean frames.
