# Graphics overhaul — plan and tickets

Written 2026-07-24. Companion to `docs/PLAYTEST-2026-07-23.md` (gameplay bugs).
This document is about how the game *looks*.

Read `HANDOFF.md` first for the project's traps. One that applies here more than
anywhere else:

> **`origin` is the wrong repo.** `git push` sends this game to My-Engine.
> Push with the URL spelled out and verify with `git ls-remote`.

Everything below was measured against commit `acd8138`, either by running the
project's own modules in node or by reading the 44 certification captures in
`docs/media/certification/`. Where a claim is measured, the measurement is
printed. Where it is a judgement call about art, it says so.

---

## The short version

The renderer is not missing features. It has ACES tone mapping, bloom, SMAA,
PMREM image-based lighting, per-family roughness/metalness, baked ambient
occlusion, contact-shadow discs, decals, and a four-tier quality system. On
paper it is a modern pipeline.

It still looks flat, and there are four reasons, in order of how much they cost:

1. **Ambient occlusion is being spent as albedo instead of as shading.** It is
   baked into vertex colour, which means the lights wash it out *and* it
   corrupts the material classifier downstream. Measured: **10 of 11 palette
   swatches change material family purely from sitting in a corner.**
2. **There is no surface texture of any kind.** Not a stylistic choice — the
   texture loader is dead code. Large flat areas read as untextured primitives.
3. **The shadows are the hard-edged variant**, and they land on those flat
   areas as aliased black staircases.
4. **Several rooms are one hue at one value.** Beat 07 is the clearest case and
   the one the player complained about.

Ticket 1 will change the look of this game more than everything in
`VISUAL_PLAN.md` did combined, and it is a bug fix, not a taste change.

### The camera is correct — and that decides where the effort goes

An earlier draft of this document claimed the camera was "2.5× too far away"
and wanted it pulled in. **That was wrong and the recommendation is withdrawn.**

The measurement was real — the hero is **5.5% of frame height, ~40px at 720p** —
but it was benchmarked against the wrong genre. 12–18% is what a character-scale
action game (Hades, Death's Door) uses. A top-down Zelda deliberately frames the
**room**: you must read the whole space, every enemy in it, and the puzzle, in
one glance. A Link to the Past puts Link at roughly 10% of frame height. This
game's framing is right, and the owner has confirmed it plays correctly.

Keep the camera. But take the consequence seriously, because it redirects the
whole plan:

**The room is the subject of every frame, not the hero.** At this distance the
player is reading silhouette, colour, and motion — not faces, not blade geometry,
not surface finish on a pauldron. Two things follow:

- **Room-scale quality is nearly the entire visual budget.** Ticket 1 (contact
  shading on architecture), Ticket 3 (soft shadows across large floors), Ticket 4
  (surface detail on big flat planes), and Ticket 7 (rooms that aren't empty) all
  act at exactly the scale the camera is pointed at. They matter more here than
  they would in a close-framed game, not less. **Ticket 7 in particular is
  promoted** — an empty floor is most of the picture.
- **Character work must be spent on legibility, not fidelity.** Detail below
  roughly 40px of hero is invisible by construction and always will be. The
  return is in silhouette separation (Ticket 6), colour-coded factions (already
  done, and correct), telegraph clarity, and animation arcs large enough to read
  at a glance. `palettes.js:146` already states this constraint — "which of these
  is the armoured one" must be answerable from a distant camera mid-fight. That
  is the right standard. Judge future character work against it rather than
  against how it looks in a close-up.

---

## Severity

| # | Ticket | What it buys | Evidence | Risk |
|---|---|---|---|---|
| 1 | AO out of albedo | Solidity, correct materials | **Measured** | Medium — touches the mesher |
| 2 | Soft shadows | Removes the biggest "cheap" tell | Read from code | Low |
| 3 | Real surface detail | Kills the flat-plastic read | Read from code | Low |
| 4 | Fill the empty rooms | Scale, depth, somewhere for light to fall | Judgement | High effort |
| 5 | Colour grade + palette fix | Art direction, per-region identity | Judgement | Low |
| 6 | Rim light on actors | Hero never lost against the floor | Judgement | Low |
| 7 | Atmosphere | Showpiece | Judgement | Low |

Do 1 → 2 → 3 in order. They compound, and all three act on architecture, which
is what a room-framed camera actually shows: solid geometry under soft light
with real surface detail is a different game. Ticket 4 is the one with real
authoring cost, and it is where the remaining ceiling lives. 5–7 are polish and
can be reordered freely.

---

## Ticket 1 — Get ambient occlusion out of the albedo channel

**This is the most valuable change in the document and it is a bug fix.**

### What is happening

`src/voxel/core.js:34` (`buildVoxelGeo`) computes per-vertex ambient occlusion —
proper Minecraft-style corner darkening, `AO_LEVELS = [1.0, 0.82, 0.66, 0.5]` —
and then at line 73 multiplies it straight into the vertex **colour**:

```js
const a = ao[ti];
col.push(cr * a, cg * a, cb * a);
```

That single line causes three separate problems.

**Problem A — the lights erase it.** Vertex colour is albedo. Albedo is
multiplied by incoming light. So AO here darkens the *surface*, not the
*ambient light reaching* the surface, and a bright ambient term flattens it
back out. `src/game/assets/palettes.js:256` already documents this happening:

> the voxel mesher bakes ambient occlusion into vertex colours […] so the game
> computed good contact darkening and then flooded it.

The response at the time was to lower ambient (Crust 1.7 → 0.78). That treated
the symptom. The AO is still in the wrong channel; it is just less washed out.

**Problem B — it corrupts the material system.** `src/game/render/materials.js`
derives roughness and metalness *from `vColor`* — it reads the vertex colour's
luminance and saturation to decide whether a surface is stone, metal, ice, or
energy. But `vColor` now carries AO. So the same block of limestone is
classified as one material in the open and a different material in a corner:

```
name        open face            deepest corner (AO 0.5)   flips?
limestone   polished m=0.35 r=0.43   metal m=0.65 r=0.88     YES  polished -> metal
clay        polished m=0.35 r=0.63   metal m=0.65 r=0.88     YES  polished -> metal
wall        polished m=0.35 r=0.81   metal m=0.56 r=0.88     YES  polished -> metal
floor       metal    m=0.65 r=0.88   matte m=0.04 r=0.88     YES  metal -> matte
slate       metal    m=0.65 r=0.88   matte m=0.04 r=0.88     YES  metal -> matte
iron        metal    m=0.65 r=0.88   matte m=0.04 r=0.88     YES  metal -> matte
bone        polished m=0.35 r=0.43   metal m=0.65 r=0.88     YES  polished -> metal
abyssWall   metal    m=0.55 r=0.88   matte m=0.04 r=0.88     YES  metal -> matte
ice         polished m=0.35 r=0.78   metal m=0.36 r=0.88     YES  polished -> metal
basalt      matte    m=0.22 r=0.88   matte m=0.04 r=0.88     no
goldVein    energy   m=0.24 r=0.58   matte m=0.04 r=0.88     YES  energy -> matte

10 of 11 swatches change material family purely from sitting in a corner.
```

Read the gold line: **a gold vein stops being `energy` and becomes `matte`
wherever it meets another surface.** The metalness swing on iron is 0.65 → 0.04
— from "metal" to "painted plaster" — decided by geometry rather than material.
This is why Ticket 3 of `VISUAL_PLAN.md` (PMREM + real metalness) delivered less
than it should have: the classifier feeding it is noisy.

**Problem C — grain rides the same channel.** `render/surface-detail.js`
(`mottleColors`) *also* multiplies vertex colour, so it also perturbs the
classifier. Three signals — albedo, occlusion, grain — are being carried on one
wire, and a fourth consumer reads that wire as if it were pure albedo.

### The fix

Split the channels. In `buildVoxelGeo`:

- Keep `color` as **albedo only** (`cr, cg, cb`, no `* a`).
- Write AO to its own attribute. Two viable routes:
  - **Route A (simplest, recommended):** a custom `float` attribute `aoLevel`,
    passed to the shader via the existing `onBeforeCompile` hook in
    `materials.js`, and applied to the *indirect/ambient* term only.
  - **Route B (idiomatic three.js):** write AO into `uv2` and use the standard
    `aoMap` slot. Free correctness — three.js already applies `aoMap` to
    indirect light only — but `aoMap` needs a texture bound, so it fits less
    well with a texture-free renderer. Route A is the better match here.

With AO on its own wire you can then raise it well past what was previously
possible, because it no longer fights the exposure or the classifier. The
current deepest level of 0.5 is conservative; on the ambient term alone,
0.35 or lower will read as genuine contact shadow.

Move `mottleColors` off the colour attribute too — fold it into the same shader
hook as a detail term.

### Watch out for

- `materials.js` currently reads `vColor` and will now be reading clean albedo.
  Its thresholds were tuned against *polluted* input, so they will need
  re-checking after the split. Expect the world to get more metallic overall,
  because the corners that were being demoted to `matte` will stop being.
- The certification gate bands mean luminance. Removing AO from albedo **raises
  mean luminance** — you are deleting a multiplier that was only ever below 1.0.
  Expect every frame to meter brighter and the gate to fail until lighting is
  retrimmed. This is the correct outcome, not a regression; budget for a
  recapture of all 44 frames.

### How to prove it

- Unit: build a small voxel map with a known corner, assert the `color`
  attribute at a deep-corner vertex equals the palette hex exactly (currently it
  is 0.5×), and assert the `aoLevel` attribute carries the occlusion instead.
- Unit: re-run the table above and assert **zero** family flips between an open
  face and a corner.
- Visual: capture Beat 01 entry before and after. The wall/floor junction should
  go from invisible to a clear soft seam.

---

## Ticket 2 — Soft shadows

`src/engine/renderer.js:46` uses `THREE.PCFShadowMap` — the hard variant. In
`ow-quarry-crust.png` the shadows are aliased black staircases with a visible
one-texel edge, and in `beat-12-pyre-entry.png` the cast shadows have the same
stair-stepped border.

- Switch to `THREE.PCFSoftShadowMap`. One line, immediate improvement.
- Raise `shadow.radius` for a wider penumbra.
- The shadows are also *too dark* — near-black. That is the ambient/AO problem
  from Ticket 1 showing up again; re-evaluate after Ticket 1 lands rather than
  compensating twice.
- The `ultra` tier already goes to a 4096 map. Consider making `high` do the
  same; 2048 across a ±30 frustum is ~68 texels per world unit, which is thin
  for geometry this blocky.
- Contact-shadow discs (`fx/contact-shadow.js`) currently read as hard black
  ellipses under characters. Soften and warm them once real AO exists.

---

## Ticket 3 — Give surfaces something to look at

`src/engine/textures.js` is **dead code** — zero importers, and its URLs point
at `ground-asphalt-wet.png`, `wall-lab-panel.png`, `ground-alen-flesh.png`:
leftovers from the engine kit this game was forked from. Nothing in Sovereign
Scar samples a texture map.

The only surface variation is `mottleColors` at amplitude **0.06** — ±6%
per-voxel brightness, deliberately kept "sub-navigational". It is doing its job
and its job is too small to see.

The project is zero-build and offline-first, so the answer is not to ship PNGs.
Generate detail in the shader, in the hook `materials.js` already owns:

- **Triplanar procedural noise** on albedo — two or three octaves of value noise
  projected on world axes, so it does not swim when geometry moves and needs no
  UVs. Voxel geometry has no UVs, which is exactly why triplanar is the right
  tool.
- **Normal perturbation** from the same noise — cheap, and the thing that
  actually makes a flat face catch light unevenly.
- **Scale the detail per family.** Stone gets coarse grain, ice gets fine
  crackle, metal gets brushed streaks. The classifier already exists — after
  Ticket 1 it will finally be reliable enough to drive this.
- Keep it mean-preserving so the certification band survives, the same
  discipline `mottleColors` already documents.

---

## Ticket 4 — Fill the rooms

**Promoted, because the camera frames the room.** At this distance an empty
floor is not background — it is most of the picture. Every capture shows a large
flat expanse with a few boxes pushed to the edges. That is why the rooms read as
big and cheap rather than big and impressive: there is nothing for light to fall
across, nothing to occlude anything, and nothing to give scale.

It is also what makes the other tickets pay off. Soft shadows need something to
cast them; contact darkening needs surfaces that meet; a colour grade needs more
than one surface to separate. An empty room defeats all three.

This is already tracked as pending task #18, "prototype vertical interest in one
safe room." Do it as one room first, capture before/after, and only roll it out
if the frame genuinely improves.

`VISUAL_PLAN.md` measured the budget at **38,456 triangles / 28 draw calls**,
which is enormous headroom on any hardware from the last decade. The geometry
budget is not the constraint. Authoring time is — this is the one ticket here
that costs days rather than hours, and it is also the one with the highest
remaining ceiling.

---

## Ticket 5 — Colour grading, and fix the monochrome rooms

### The palette problem

`beat-07-sluice-entry.png` is one hue — lavender — across floor, walls, props,
and shadow, at a narrow range of values. That is the "FUCKING BRIGHT" complaint:
the frame is not merely bright, it is *undifferentiated*, so the eye has nothing
to anchor on and reads the whole thing as glare.

`palettes.js:26-41` already tells this exact story about the Abyss structural
tones and fixes it by desaturating them and letting accents carry identity. That
lesson was applied to `ABYSS_COLORS` but **the per-level kits were not swept** —
see `levels/dungeon-kits.js`. Beat 07 still reads as a solid wash.

The rule that worked, applied consistently: **structural surfaces stay near
neutral; identity lives in the accents.** Beat 12 (Pyre) shows the target — a
desaturated salmon field with hot orange basins and violet rims reads far better
than Beat 07, from the same renderer.

### The grade

Add a final grading pass before `OutputPass`:

- **Split-toning** — push shadows cool and highlights warm (or per-region
  inverse). This is the single most recognisable "art directed" move in real-time
  rendering and it is a handful of shader lines.
- **Per-region grade**, driven from `MOOD_PRESETS` / `tune`, so Cryo is genuinely
  cold and Pyre genuinely hot at the *grade* level rather than only in albedo.
- Consider trading `FilmPass` grain for grade; film grain on flat untextured
  surfaces adds noise without adding texture, which is the worst of both.

Note the exposure interaction: `toneMappingExposure` is 1.25 with ACES. ACES
compresses its shoulder hard, so pale palettes under a high `lightTune` slide
into a desaturated grey — a second, independent cause of the Beat 07 look.
Verify the grade against the beats with the highest trim values, not just one.

---

## Ticket 6 — Rim light on actors

In `beat-07-sluice-entry.png` the hero's pale head sits against a pale floor with
almost no separation. `palettes.js:288-292` already identifies rim light as what
separates a silhouette from its background, and drives `rimIntensity` per mood —
but it is a scene-wide directional light, so it lifts walls as readily as
characters.

Add a fresnel rim term to *actor* materials only. The hero and every enemy get a
thin bright edge that guarantees separation regardless of what they stand on.
Key it to the enemy palette's `eyeGlow` so factions stay colour-coded, and it
doubles as a readability win in combat, not just a beauty pass.

---

## Ticket 7 — Atmosphere

Once the above lands:

- **Dust motes** — a few hundred slow-drifting particles catching the key light.
  Cheap, and it makes a room feel like it contains air.
- **Light shafts** from the existing emissive sources.
- **Wet floors** in the Sluice — screen-space reflection, or a cheap planar
  reflection given the fixed camera. The `ultra` tier already has a
  `reflections` flag that nothing reads.
- **Emissive discipline.** The telegraph rings and pickup glows currently read as
  flat decals painted on the floor (visible in `ow-quarry-crust.png`) rather than
  as things emitting light. Pair each with a real point light from the existing
  `fx/local-light-pool.js`.

---

## Suggested work order

1. **Ticket 1** — AO split. Bug fix, unlocks the material system, changes every frame.
2. **Retrim lighting + recapture the 44 frames.** Ticket 1 will break the gate. Expect it.
3. **Ticket 2** — soft shadows. One line plus tuning, and the retrim is still fresh.
4. **Ticket 3** — triplanar detail. Now that the classifier is trustworthy.
5. **Ticket 4** — fill one room as a prototype. Capture before/after before committing to more.
6. **Ticket 5** — grade and the Beat 07 palette sweep.
7. **Tickets 6, 7** — in whatever order appetite allows.

Steps 1–4 are all architecture, which is what the camera is pointed at. Do them
before touching anything character-scale.

Stop after any ticket and the game is still shippable. That is deliberate.

---

## What this document does not know

- **Nothing here was verified in a running browser.** Headless Chrome runs this
  project at roughly 1.5 fps, so every visual claim comes from the committed
  certification captures or from reading the code. The captures are 1280×720
  stills at fixed camera positions; they cannot show motion, shimmer, shadow
  crawl, or how any of this reads at 60 fps.
- **Frame cost is unmeasured.** Tickets 3 and 7 add per-pixel work. The triangle
  budget has room; the *shading* budget has not been profiled.
- **Ticket 1's downstream reach is the biggest unknown.** Vertex colour is read
  in more places than `materials.js` — `render/luminance.js`,
  `render/albedo-trim.js`, and `world/room-trim.js` all touch colour, and this
  project's most expensive recurring bug is fixing one site out of several.
  **Sweep every consumer of the colour attribute before changing it.**
- Tickets 4 through 7 are taste. They are informed by what the captures show,
  but they are not measurements and should not be treated as such.
- **One recommendation in this document has already been withdrawn.** The first
  draft called the camera "2.5× too far away" on the strength of a real
  measurement compared against the wrong genre — character-scale action games
  rather than top-down Zelda. The number was right and the conclusion was wrong,
  which is the more dangerous combination, because a measurement makes a
  judgement look like a fact. Treat the taste calls here accordingly.
