# Improving the look of the world

A plan, written after measuring the live renderer rather than after looking at
screenshots. Nothing here has been implemented yet — every item is costed and
ordered, and the ones that would change how every existing room looks are
flagged, because those are the owner's call and not mine.

Every number below came from a probe against the running game, not from reading
the code and guessing.

---

## What the renderer is actually doing right now

Measured in Beat 01 with the game booted and a level loaded:

| | measured | what it means |
|---|---|---|
| `scene.environment` | **null** | no image-based lighting anywhere |
| `scene.background` | flat `#353028` | no sky, no gradient, no horizon |
| lights | ambient **1.7**, key **1.9**, fill 0.7, rim 0.65 | see below |
| meshes casting shadows | **13** of 96 | |
| meshes *receiving* shadows | **1** of 96 | |
| triangles | **38,456** | |
| draw calls | **28** | |

Two of those numbers are the whole problem, and the last two are the whole
opportunity.

---

## Finding 1 — five rooms out of six have no sun shadows at all

The key light's shadow frustum is a ±30-unit box aimed at the world origin. It
is never moved. Rooms are laid out on a grid with a stride of **64 units**
(`room-graph.js: ROOM_STRIDE`), so only the room at grid `[0,0]` is inside it.

Measured against Beat 01's own room definitions:

```
tomb           (0,0)      lit
corridor       (0,-64)    NO SUN SHADOWS
predecessor    (0,-128)   NO SUN SHADOWS
secret         (-64,-128) NO SUN SHADOWS
antechamber    (0,-192)   NO SUN SHADOWS
warden         (0,-256)   NO SUN SHADOWS
```

**This is why it was never noticed: every dungeon starts in the room at the grid
origin.** The first room you ever see in any level is the one room that works.

There is a function in the engine that exists to fix this — `updateShadowFollow`
in `src/engine/lights.js` — and it is **never called by anything**. It also
could not fix it if it were: it takes a single `cameraX` and pins the target's Z
to zero, which is a leftover from the engine's 2.5D side-scroller origins. This
game is top-down on a two-dimensional room grid.

**The fix** is in game code, not the frozen engine: `mood.bindLights` already
hands `keySun` to `src/game/fx/mood-controller.js`, so the game can re-centre
the light and its target on the active room whenever a room loads. Roughly
fifteen lines.

**The catch, and why this is not already done:** turning shadows on in 83% of
the game's rooms changes the mean luminance of nearly every certification
capture. See Finding 5 — the gate and this fix are in direct conflict, and the
gate has to move first.

---

## Finding 2 — only one object in the scene receives shadows

96 meshes; one `receiveShadow`. That one is the merged level voxel mesh.

So even in the room that does have working shadows, the only thing that can be
shadowed is the terrain. Props do not darken under an overhang. Enemies do not
sit in a doorway's shadow. Nothing casts onto anything else, so nothing looks
like it is *in* the room — everything looks pasted on top of it. This is the
single biggest reason objects fail to feel grounded.

**Fix:** set `receiveShadow` on props, destructibles, pushables, gears, bosses
and actor rigs — they already set `castShadow`, so this is a one-word addition
at each of about eight construction sites. Near-zero cost: shadow-map rendering
is already paying for the casters; receiving is a fragment-shader tap.

Worth pairing with a **contact shadow** — a small dark disc under each character
and pickup. It is the cheapest possible grounding cue and it works even when the
real shadow is soft or off-screen. Ten lines and one shared material.

---

## Finding 3 — half the light in the game has no direction

Ambient **1.7** against a key of **1.9**. Roughly 47% of the illumination in the
Crust arrives from every direction at once, which by definition cannot describe
a surface. It puts exactly the same value on the top of a block, the side of a
block, and the inside of a corner.

The voxel geometry already bakes ambient occlusion into vertex colours
(`voxel/core.js`, `AO_LEVELS`), and a high flat ambient is precisely what washes
that work out. The game is computing good contact darkening and then flooding it.

**Fix:** shift the balance toward the key and the two fills — same total energy,
much more form. This is a tuning pass over `MOOD_PRESETS`, done with the
luminance probe open, and it is the highest ratio of visible improvement to
lines changed on this entire page.

**Same catch as Finding 1.** Ambient light is the cheapest way to raise a mean
luminance reading, which is why it drifted this high.

---

## Finding 4 — no environment map, so metal cannot look like metal

`scene.environment` is null. `src/engine/environment.js` builds PMREM
environment maps from the skybox textures and **nothing in the game ever calls
it**. `src/engine/skybox.js` is likewise unused.

The consequence is already written down in the code. From
`src/game/render/materials.js`:

> Metalness is kept small: this engine has little environment light, so a
> strongly metallic surface would read dark

So the material-family system — which classifies every voxel colour as matte,
polished, metal or energy — is capping metalness at 0.12 because there is
nothing for metal to reflect. Gold seams, iron, ice and the Cryo Vault's
surfaces are all currently doing an impression of painted plaster.

**Fix:** generate a small PMREM from a procedural gradient (no new asset files,
which keeps the zero-build / offline-first promise) per mood, assign
`scene.environment`, then let material families use a real metalness range. A
64×32 equirectangular gradient is enough; IBL at this scale is about the
*direction* of the reflection, not its detail.

This one is additive and does **not** fight the luminance gate — it changes
specular response, not albedo — so it can land before the lighting work.

---

## Finding 5 — the certification gate is shaping the art, and not in a good direction

`tests/visual-sanity.spec.mjs` requires each room's **mean** frame luminance to
sit in a band (Crust `[45,90]`, Abyss `[35,75]`).

Mean luminance cannot tell a well-lit room from a flat one. A room with a strong
key, deep shadows and bright highlights has a *lower* mean than the same room
under a flat ambient wash — so every time a room has failed low, the cheapest
legal fix has been to raise ambient or add pale geometry. Both of those flatten
it. (The Beat 01 tomb's gold-leaf seams were added for exactly this reason, and
they are documented as such in the level file.)

The gate is doing real work — it caught genuinely unreadable Abyss rooms that
metered 9–26 — and it should not be deleted. But it should be **joined by a
contrast floor**: a percentile spread (p90 − p10) that a flat room cannot pass.
Then "readable" and "flat" stop being the same measurement, and Findings 1 and 3
become possible instead of prohibited.

**This is the keystone.** It is listed fifth because it is the least visible
change on the page and it must land first.

---

## Finding 6 — the budget is almost entirely unspent

38,456 triangles. 28 draw calls. On a machine that can run this at 4K.

There is room for something like fifty times the geometric detail before
anything starts to hurt. The world is not under-detailed because of a technical
constraint; it is under-detailed because nothing has asked it for more. Cheap
things that would spend the budget well:

- **Trim and edge geometry.** A wall meeting a floor with a visible plinth reads
  as built; a wall meeting a floor at a clean 90° reads as a box. Generated at
  bake time from the existing room definitions — no hand authoring.
- **Silhouette breakers** along the tops of walls, so the roomline is not a
  ruler edge.
- **Vertical interest.** Rooms are currently 4–5 voxels tall with flat ceilings.
  Height variation is the main thing separating "a room" from "a place".
- **Decals** — scorch, water staining, moss in the Mire, frost in the Cryo — as
  vertex-colour work at bake time, which is free at runtime.

---

## Order of work

| # | change | risk | changes existing rooms? |
|---|---|---|---|
| 1 | Contrast floor added to the luminance gate | low | no — a new assertion |
| 2 | `receiveShadow` on the other 95 meshes, plus contact discs | low | slightly |
| 3 | Procedural PMREM environment + real metalness range | low | specular only |
| 4 | Sun follows the active room | medium | **yes — 5 of 6 rooms gain shadows** |
| 5 | Ambient/key rebalance per mood | medium | **yes, everywhere** |
| 6 | Bake-time trim, silhouette and decal work | low | additive |

1–3 are safe and can be done in one pass. 4 and 5 are the ones that make the
game look different, and they need the owner to see them before they are
accepted — which is why this is a document and not a commit.

The 44 stale binary certification captures will need regenerating after 4 and 5
regardless; that was already outstanding.
