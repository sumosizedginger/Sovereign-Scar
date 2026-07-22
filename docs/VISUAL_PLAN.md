# Making the world look like a place

Six tickets, ordered, each self-contained enough to pick up cold. Every number
came from a probe against the running game, not from reading the code and
guessing — re-run them with `tests/qa/lum-probe.mjs` and the snippets below.

**Status: none of these are implemented.** Tickets 1–3 are safe and additive.
Tickets 4–5 change how every existing room looks and will invalidate the 44
binary certification captures; that is the owner's call, not the implementer's.

---

## Measured baseline

Beat 01, game booted, level loaded, `beat-01-crypt`:

| | measured | |
|---|---|---|
| `scene.environment` | **null** | no image-based lighting anywhere |
| `scene.background` | flat `#353028` | no sky, no gradient, no horizon |
| ambient | **1.7** | |
| key (directional, casts) | **1.9** | frustum ±30, target fixed at world origin |
| fill / rim | 0.7 / 0.65 | |
| player point light | 6.0 | rides the hero |
| meshes | **151** | |
| …casting shadows | 37 | |
| …**receiving** shadows | **7** | |
| triangles | **79,572** | |
| draw calls | **43** | |
| tone mapping | ACESFilmic, exposure 1.25 | |
| shadow map | PCF (`type 1`) | |

Two of those are the whole problem (`recv 7`, `environment null`) and two are
the whole opportunity (`79k tris`, `43 calls`).

---

## Ticket 1 — Contrast floor on the luminance gate

**Must land first.** It currently makes tickets 4 and 5 illegal.

`tests/visual-sanity.spec.mjs` bands each room's **mean** frame luminance
(Crust `[45,90]`, Abyss `[35,75]`). Mean cannot tell a well-lit room from a flat
one: a room with a strong key and deep shadows has a *lower* mean than the same
room under a flat ambient wash. So every time a room failed low, the cheapest
legal fix was to raise ambient or add pale geometry — both of which flatten it.
That is how ambient reached 1.7, and the Beat 01 tomb's gold-leaf seams were
added for exactly this reason (it says so in the level file).

The gate is doing real work — it caught Abyss rooms metering 9–26 — so it is
joined, not replaced.

**Do:** sample the framebuffer as now, but also compute the p10 and p90
luminance percentiles and assert `p90 − p10 >= CONTRAST_FLOOR`.

**Target:** start at `CONTRAST_FLOOR = 28` (0–255 scale). Measure all 14 beats
first with the probe and set it just under the current worst room, so it is a
ratchet that cannot regress rather than a cliff that fails on day one.

**Acceptance:** a synthetic flat-grey frame fails the new assertion while
passing the old mean band. Add that as a unit case so the gate is proven to
discriminate.

**Rollback:** delete the assertion; nothing else depends on it.

---

## Ticket 2 — `receiveShadow` on the other 144 meshes

151 meshes, **7 receive**. So even in the one room whose shadows work, almost
nothing can be shadowed. Props do not darken under an overhang, enemies do not
sit in a doorway's shadow, nothing casts onto anything else — which is the
single biggest reason objects read as pasted on top of the world rather than
standing in it.

**Do:** set `receiveShadow = true` alongside the existing `castShadow = true` at
each construction site:

- `src/game/characters/actor-rig.js` → `partMesh()` (covers hero + every enemy)
- `src/game/assets/props.js` → prop/destructible/pushable builders
- `src/game/world/level-builder.js` → gears, platforms, doors
- `src/game/bosses/*.js` → boss body meshes
- `src/game/assets/weapon-models.js` → currently explicitly `false`; leave the
  weapon a caster only, it is too small to receive usefully

**Cost:** near zero. Shadow-map rendering is already paying for the casters;
receiving is a fragment-shader tap.

**Pair with contact shadows.** A small dark disc under each character and
pickup: one shared `MeshBasicMaterial`, radial-gradient alpha texture generated
at runtime, `depthWrite: false`, `renderOrder` below the actor. It is the
cheapest grounding cue there is and it works even when the real shadow is soft
or off-screen. ~10 lines and one shared material.

**Acceptance:** a spec asserting `receiveShadow` count > 120 of the scene's
meshes after a level load. Contact discs: assert one exists per actor and that
it tracks the actor's XZ within a frame.

**Rollback:** per-site, independently.

---

## Ticket 3 — A procedural environment map, so metal can be metal

`scene.environment` is null. `src/engine/environment.js` builds PMREM maps and
**nothing ever calls it**; `src/engine/skybox.js` is likewise unused.

The consequence is already written down in the code. From
`src/game/render/materials.js`:

> Metalness is kept small: this engine has little environment light, so a
> strongly metallic surface would read dark

So the material-family system correctly classifies every voxel colour as matte,
polished, metal or energy — and then caps metalness at **0.12** because there is
nothing to reflect. Gold seams, iron, ice and the whole Cryo Vault are doing an
impression of painted plaster.

**Do:**
1. Generate a 64×32 equirectangular gradient on a canvas per mood (Crust: warm
   floor → cool zenith; Abyss: cold floor → violet zenith). No new asset files —
   this keeps the zero-build / offline-first promise.
2. `PMREMGenerator.fromEquirectangular(...)`, assign `scene.environment`,
   rebuild on mood change, dispose the old one.
3. Raise the metalness ceiling in `materials.js`: metal family `0.65`, polished
   `0.35`, matte unchanged, energy unchanged. Add `envMapIntensity` ~`0.8`.

IBL at this scale is about the *direction* of the reflection, not its detail;
64×32 is plenty.

**Acceptance:** `scene.environment !== null` after load; a metal-family material
reports `metalness > 0.5`; the luminance gate still passes (this changes
specular response, not albedo, so it should not move the mean much — if it
does, that is a finding worth writing down).

**Rollback:** set `scene.environment = null` and restore the 0.12 cap. Safe:
nothing else reads it.

---

## Ticket 4 — The sun follows the active room

**Changes how 5 of 6 rooms look. Owner sign-off required.**

The key light's shadow frustum is a ±30-unit box aimed at the world origin, and
it never moves. Rooms sit on a **64-unit** grid (`room-graph.js: ROOM_STRIDE`),
so only the room at grid `[0,0]` is inside it. Measured live against Beat 01:

```
tomb           (0,    0)   LIT
corridor       (0,  -64)   NO SUN SHADOWS
predecessor    (0, -128)   NO SUN SHADOWS
secret       (-64, -128)   NO SUN SHADOWS
antechamber    (0, -192)   NO SUN SHADOWS
warden         (0, -256)   NO SUN SHADOWS
```

**5 of 6.** It was never noticed because every dungeon starts in the room at the
grid origin — the first room you ever see in any level is the one room that
works.

There is a function in the engine that exists to fix this — `updateShadowFollow`
in `src/engine/lights.js` — and it is **never called by anything**. It also
could not fix it: it takes a single `cameraX` and pins the target's Z to zero, a
leftover from the engine's 2.5D side-scroller origins. This game is top-down on
a two-dimensional room grid. Do not try to use it; fix this in game code.

**Do:** `mood.bindLights` already hands `keySun` to
`src/game/fx/mood-controller.js`. On room load, move both the light and its
target by the active room's origin, preserving the light's offset from its
target (the direction of the sun must not change, only where it is aimed).
Roughly fifteen lines. Snap to the room origin rather than following the camera
continuously, or shadow texels will crawl as the player walks.

**Acceptance:** for every room of every beat, assert the room origin is inside
the key light's shadow frustum after `loadLevel` + room transition. That is a
14-beat × ~7-room sweep and it is the assertion that would have caught this.

**Rollback:** stop moving the target. Note that **the 44 certification captures
must be regenerated** after this lands — 5 of 6 rooms gain shadows, so nearly
every capture's mean luminance moves.

---

## Ticket 5 — Rebalance ambient against the key

**Changes how every room looks. Owner sign-off required. Do ticket 1 first.**

Ambient **1.7** against a key of **1.9**: roughly 47% of the illumination
arrives from every direction at once, which by definition cannot describe a
surface. It puts the same value on the top of a block, the side of a block, and
the inside of a corner. Worse, the voxel mesher already bakes ambient occlusion
into vertex colours (`voxel/core.js`, `AO_LEVELS`) — a high flat ambient is
precisely what washes that work out. The game computes good contact darkening
and then floods it.

**Do:** shift the balance toward the key and the two fills, holding total energy
roughly constant so the luminance band still passes.

| light | now | target |
|---|---|---|
| ambient | 1.70 | **0.75** |
| key | 1.90 | **2.60** |
| fill | 0.70 | **0.85** |
| rim | 0.65 | **0.80** |

Per mood, tuned with `tests/qa/lum-probe.mjs` open. Abyss wants a lower ambient
than Crust (it is meant to be oppressive) but needs its rim raised further or
silhouettes vanish — that is the failure that produced the 9–26 rooms the gate
originally caught.

**Acceptance:** every room passes both the mean band **and** the new contrast
floor. Contrast should rise materially; if it does not, the rebalance is not
doing what it claims.

**Rollback:** restore the table above. Regenerate certification captures.

---

## Ticket 6 — Spend the budget

**79,572 triangles. 43 draw calls.** There is room for roughly an order of
magnitude more geometry before anything hurts. The world is not under-detailed
because of a technical constraint; it is under-detailed because nothing has
asked it for more. All of these are bake-time work — free at runtime:

- **Trim and edge geometry.** A wall meeting a floor with a visible plinth reads
  as built; a clean 90° reads as a box. Generate from the existing room
  definitions; no hand authoring.
- **Silhouette breakers** along wall tops, so the roomline is not a ruler edge.
- **Vertical interest.** Rooms are 4–5 voxels tall with flat ceilings. Height
  variation is the main thing separating "a room" from "a place".
- **Decals** — scorch, water staining, moss in the Mire, frost in the Cryo — as
  vertex-colour work at bake time.

**Acceptance:** triangle count rises substantially with draw calls roughly flat
(if calls scale with detail, the batching is wrong). Frame time in the perf
overlay must not regress.

---

## Order

| # | ticket | risk | changes existing rooms? |
|---|---|---|---|
| 1 | Contrast floor on the gate | low | no — a new assertion |
| 2 | `receiveShadow` + contact discs | low | slightly |
| 3 | Procedural PMREM + real metalness | low | specular only |
| 4 | Sun follows the active room | medium | **yes — 5 of 6 rooms gain shadows** |
| 5 | Ambient/key rebalance | medium | **yes, everywhere** |
| 6 | Bake-time trim / silhouette / decals | low | additive |

1–3 can be done in one pass. 4 and 5 are the ones that make it look like a
different game.

**After 4 and 5: regenerate the 44 certification captures.** That was already
outstanding before this plan existed. Procedure is in `CERTIFICATION.md`; use
`H` to hide HUD chrome for clean frames.
