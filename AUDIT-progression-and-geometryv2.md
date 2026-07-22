# Audit v2: progression, geometry, and code-only visual reconstruction

Date: 2026-07-19. Implementation review refreshed 2026-07-20.

Status: partially implemented. Priority 0 repairs mostly exist, but the
visual reconstruction is not complete and the full automated suite is red.

This document turns the findings in
`AUDIT-progression-and-geometry.md` into a concrete repair and visual
reconstruction plan. The original audit remains the evidence record for the
reported beat-13 failure. This v2 adds the changes I would make, their order,
the files they affect, the verification required, and the limits of what
"AAA" can honestly mean for this project.

## 2026-07-20 implementation ledger

| Scope | Status | Verification |
|---|---|---|
| Ticket A, progression integrity | **Implemented** | Entrance, request, menu, migration, and boot gates exist. Focused unit/browser checks pass. |
| Ticket B, GUMOI and camera cleanup | **Partial** | Terraces use the platform map and room transitions clear focus. Static tests pass; no normal-physics GUMOI climb/fight test exists. |
| Shadow-map and WebGL2 hygiene | **Implemented, incompletely certified** | `PCFShadowMap` and a readable WebGL2 startup gate exist. Shadow recapture and forced compatibility testing are absent. |
| Exact three.js package/runtime pin | **Open** | `package.json` remains `^0.185.0`. |
| Ticket C, visual harness/profile ownership | **Partial and failing** | The harness exists, but nine Abyss levels currently measure 9.6-25.8 against the required 35-75 luminance band. Quality changes also overwrite mood values without reapplying the cap, so call order is still not deterministic. |
| Tickets D and E, camera/HUD and regional reconstruction | **Not demonstrated complete** | No new certification matrix or by-hand campaign review proves the ticket acceptance criteria. |
| Ticket F, articulated actors | **Open** | No actor rig or animator modules exist. The animation QA artifact confirms static limbs during movement and attack. |
| Ticket G, dungeon kits/material hierarchy | **Open as a reconstruction ticket** | Local presentation tuning landed, but the authored-kit and material-family acceptance package did not. |
| Ticket H, Ultra GTAO | **Open and optional** | No pass or performance evidence exists. |
| Ticket I, final recertification | **Open** | Current full result is **1257/1267**, not green. No complete by-hand campaign certification is recorded. |

Current test truth: `npm run test:unit` passes **669/669**. The full runner
passes **1257/1267**. Nine failures are Abyss luminance regressions. The tenth
is a stale `world-e2e` expectation that grapple posts are collision solids,
contradicting the new visual-only post design used to prevent rim softlocks.

The target is not photorealism. The target is a premium, authored, stylized
voxel game whose world, characters, camera, lighting, and interface all look
like they belong to the same finished product. That is achievable with code,
procedural geometry, shaders, animation, and the existing three.js stack.

## Executive decision

I would not start with GTAO.

The current renderer already has ACES tone mapping, HDR composition, bloom,
SMAA, film grain, vignette, environment lighting, shadow maps, and baked
voxel corner AO. The largest visual failures occur before post-processing:

- overworld regions share the same random slab, pillar, and stain generator;
- Crust and Abyss mostly change color and post intensity rather than form;
- the hero and all ordinary enemies share almost the same body construction;
- ordinary actors rotate as whole statues instead of posing and animating;
- boss introductions push the camera close enough for the hero to obscure
  the arena;
- HUD, story, toast, control help, and boss UI compete for the same frame;
- quality settings and mood settings both write post-processing values, so
  the final picture depends on which system ran last;
- the visual certification proves luminance, scale, grounding, and loading,
  but not art direction or composition.

The correct order is functional integrity, visual measurement, composition,
world construction, character motion, materials and lighting, then dynamic
AO. Otherwise the project spends GPU time shading an under-authored frame.

## Evidence baseline

The following was verified against the current worktree:

- `npm run test:unit`: 560/560 passed on the final 2026-07-19 audit
  worktree.
- `npm test`: 1140/1140 passed on the same worktree.
- The suite does not test an unearned overworld dungeon entrance.
- The suite does not walk the GUMOI terraces by normal player movement.
- `tests/visual-sanity.spec.mjs` checks average luminance, character height,
  grounding, and boss height dominance.
- `CERTIFICATION.md` states that its 44 stored captures use the old 65 degree
  camera and have not been regenerated for the current 40 degree camera.
- Live visual sampling measured the player at height 1.93 and every ordinary
  enemy at height 1.63.
- The same sampling placed the GUMOI Witness at minY 8.07 while the player
  remained at minY 1.0.
- The official three.js site identifies r185 as the current revision on
  2026-07-19, and a live `npm view three version` registry query returns
  0.185.1.
- `package-lock.json` resolves three.js 0.185.1. The two vendored runtime
  builds are byte-for-byte matches for the installed 0.185.1 builds and
  report `THREE.REVISION === '185'`.
- The vendored SHA-256 values are
  `86BCEE248B64F44BCFC23C331AE74619061957D59CAB040171DCB6FB5900BEB6`
  for `three.module.min.js` and
  `05B2609338C76CD65DAF74F3AC515BC9A5045E1B3B33EDC07D8C9BD55250FA90`
  for `three.core.min.js`.
- Official three.js documentation still supports `GTAOPass` in the existing
  WebGL `EffectComposer` pipeline. No WebGPU migration is required.

## Historical live verification update: 2026-07-19

At that snapshot the original findings still stood. The live pass found four actionable
renderer and dependency details, plus one release-boundary warning, that
should be added to the durable work record.

### Do not mistake forward migration notes for a released r186

The official migration guide now contains a `185 -> 186` section, but the
official site still identifies r185 as current and the live npm registry
still returns 0.185.1. Treat those r186 notes as forward-looking until the
official release and package exist. Do not vendor r186 addon files into the
current r185 runtime merely because the migration page mentions them.

### New current defect: deprecated shadow-map selection

`src/engine/renderer.js` sets:

```js
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
```

The official migration guide deprecated `PCFSoftShadowMap` for
`WebGLRenderer` in r182. Current r185 code warns and converts it to
`PCFShadowMap` at runtime. Change the assignment to `THREE.PCFShadowMap`,
then recapture shadow-heavy scenes to confirm that the intended softness and
bias still hold. This is cleanup of an active deprecation, not a visual
feature request.

### Current package and offline runtime are aligned, but the pin is soft

`package.json` declares `three: ^0.185.0`, while `package-lock.json` and
`node_modules` resolve 0.185.1. The vendored core and module files match that
installed package exactly, so the shipped offline runtime is coherent today.

If the project means "pinned" literally, change the dependency to exact
`0.185.1`, record the vendored file hashes, and require dependency version,
vendored runtime, and addon files to move as one reviewed unit. A caret range
and a hand-vendored runtime can otherwise drift without changing the import
map.

### WebGL2 needs an explicit failure path

Current `WebGLRenderer` requires WebGL2. The game constructs the renderer
without a capability gate or a human-readable fallback. Vendor the matching
`addons/capabilities/WebGL.js`, check `WebGL.isWebGL2Available()` before game
initialization, and show `getWebGL2ErrorMessage()` or an equivalent branded
message when unavailable. A dead canvas is not a support strategy.

### Preserve the existing multi-pass metrics reset

`src/engine/renderer.js` correctly sets `renderer.info.autoReset = false`,
and `src/game/index.js` resets the counters once at the start of each game
frame. Official documentation recommends this custom reset pattern when
post-processing performs multiple render calls per frame. Do not turn
automatic reset back on. GTAO and later passes should remain inside the same
per-frame accounting window so draw-call and triangle budgets measure the
whole composed frame.

### Precompile the material families added by this plan

The current renderer does not call `compile()` or `compileAsync()`. The
official r185 API recommends `compileAsync()` when possible so the
`KHR_parallel_shader_compile` extension can avoid first-use shader stalls.
After a level has installed its lights, environment, and generated material
families, precompile that level during the transition state. Measure this
before and after. Do not block every transition for no proven gain.

### Keep GTAOPass and GTAONode advice separate

The current r185 migration note about wider, darker AO concerns `GTAONode`
in the WebGPU and TSL stack. This project proposes `GTAOPass` in the WebGL
`EffectComposer` stack. Do not copy `GTAONode` tuning or migration snippets
into `GTAOPass`. Tune the pass from paired captures and frame measurements.

The decision not to migrate renderers is also current. Official guidance
still calls WebGPURenderer experimental, does not support the existing
`EffectComposer` passes or custom `ShaderMaterial` path without a TSL rewrite,
and continues to recommend WebGLRenderer for pure WebGL2 applications.

## Constraints I would preserve

- Zero build step and offline-first loading.
- No new npm runtime dependencies.
- The offline runtime stays on the current r185 line during reconstruction.
- The npm declaration, lockfile, vendored builds, and vendored addons resolve
  to one exact reviewed package version.
- WebGLRenderer and EffectComposer stay in place.
- Existing save data remains readable.
- Runtime quality tiers `low`, `med`, `high`, and `ultra` remain switchable.
- Reduced motion, reduced flashing, and other accessibility settings remain
  authoritative.
- `src/engine/`, `src/voxel/`, `src/combat/`, `src/characters/`, and `lib/`
  remain frozen unless a ticket explicitly authorizes the minimum required
  change.
- Gameplay geometry and visible geometry must agree. Decorative detail may
  not silently create new collision.
- Every ticket must keep the assertion count from decreasing and must add a
  focused test when it fixes a behavior defect.

## Priority 0: repair the two confirmed gameplay defects

Visual work should not begin on top of a corrupted progression path or a
boss arena that lies about where the player can walk.

### Change 0.1: gate every overworld dungeon entrance

Current defect:

`src/game/overworld/overworld.js` calls `game.loadLevel(en.to)` when the
player interacts with an entrance. It never checks `unlockedBeats`. A direct
load then persists the destination as `currentBeat`, which makes Beat Select
treat the illegally reached beat as open on later sessions.

I would make one small policy function the authority for player-initiated
travel, with an explicit distinction between resuming the currently loaded
beat and authorizing an overworld entrance:

```js
function canEnterBeat(id, { allowCurrent = false } = {}) {
    const progress = loadSovereignProgress();
    const unlocked = new Set(progress.unlockedBeats || []);
    return unlocked.has(id)
        || id === 'sandbox-combat'
        || (allowCurrent && id === progress.currentBeat)
        || dev.enabled;
}
```

The exact function location should avoid circular imports. My preferred
shape is to expose `game.canEnterBeat(id, options)` from `src/game/index.js`,
where both progress and dev mode already exist. The overworld calls it with
`allowCurrent: false` before saving a return position or calling `loadLevel`.
Beat Select may use `allowCurrent: true` only to preserve legitimate resume
behavior.

This distinction matters for old saves already damaged by the current bug.
If a save says `currentBeat: 'beat-13-gumoi'` but `unlockedBeats` does not
contain beat 13, the overworld entrance must remain locked. `currentBeat` is
navigation state, not proof of progression.

Blocked interaction behavior:

- do not call `loadLevel`;
- do not overwrite the saved overworld return position;
- do not change `currentBeat`;
- play a restrained locked sound if one exists;
- show `Locked: defeat the prior boss first`;
- allow dev mode to bypass the lock.

I would not put the lock inside the low-level `loadLevel()` function. Tests,
developer tools, campaign setup, save restoration, and scripted transitions
legitimately call that function directly. The gate belongs on
player-initiated travel paths.

Files:

- `src/game/index.js`
- `src/game/overworld/overworld.js`
- `tests/world-e2e.spec.mjs` or a dedicated progression E2E spec

Required tests:

1. A new save can enter beat 01.
2. A new save cannot enter beat 02 or beat 13 from the overworld.
3. A blocked attempt leaves the level and `currentBeat` unchanged.
4. A legacy or corrupted save with `currentBeat: 'beat-13-gumoi'` but no
   beat-13 unlock still cannot enter its overworld arch.
5. Defeating the required prior boss allows the entrance.
6. Dev mode bypasses the lock.
7. Returning from a legal dungeon still restores the correct overworld
   screen and position.

Acceptance gate:

Walk a real physics body into both an allowed and disallowed overworld arch,
press interact, and assert the resulting level and persisted progress.

### Change 0.2: make the GUMOI terraces actual platforms

Current defect:

The five terrace boxes in `witnesscrown.build()` are registered as 2D XZ
collision solids. Collision has no Y extent, so every terrace footprint acts
as a wall at all heights.

I would move all five terrace `fillBox` calls from `build(map, h)` to a new
`platforms(map, h)` function in the same room definition. The existing
room-graph path meshes platforms without adding XZ solids while still
including them in `level.getVoxelAt()`. That is exactly what the vertical
physics body needs for stepping and grounding.

I would then retune the encounter as one coherent vertical design rather
than assuming the collision move solves everything:

- verify a continuous one-cell ascent route from the south door;
- verify the boss key remains collectable at its authored height;
- decide whether the intended fight happens on the base, terraces, crown,
  or across all three;
- align the Witness hover height, strike height, hit radius, and camera target
  with that decision;
- ensure the boss cannot damage the player through a terrace while visually
  separated by several vertical units;
- prevent the introduction camera from intersecting the crown geometry.

Files:

- `src/game/levels/beat-13-gumoi.js`
- possibly `src/game/bosses/roster.js` for height and strike alignment
- `tests/world-e2e.spec.mjs`
- `tests/boss-quality-e2e.spec.mjs`

Required tests:

1. No witnesscrown terrace footprint appears in `CollisionWorld.solids`.
2. Every terrace remains present in `level.getVoxelAt()`.
3. A normal player body can ascend from floor to crown without teleporting.
4. The player can descend without becoming embedded or falling forever.
5. The Witness can be damaged from the intended combat elevation.
6. A Witness strike cannot hit through an unintended vertical separation.
7. The full boss can still be defeated through normal combat.

Acceptance gate:

Record a deterministic traversal trace containing player X, Y, Z, grounded
state, and current terrace for the complete ascent and descent.

### Change 0.3: cancel room-specific camera focus on room exit

`camRig.clearFocus()` currently runs on full level load, not every room
transition. A player can backtrack during a boss reveal while the camera
continues blending toward the boss.

I would clear transient focus whenever `enterRoom()` changes the current
room, before applying any new room-specific focus. A room may then start its
own reveal after the transition completes.

This is a small cosmetic defect, but it belongs beside the GUMOI fix because
both affect the same reported experience.

## Priority 1: replace visual certification with a real visual gate

The existing checks are useful regression guards. They are not an art
quality gate. Average luminance can declare a featureless field acceptable.
Object height can prove that three enemies have exactly the same silhouette
without recognizing that sameness as a problem.

### Change 1.1: regenerate a deterministic current-camera capture matrix

I would add one maintained capture script that produces:

- all eight overworld regions in Crust;
- all eight overworld regions in Abyss;
- one entry room for every dungeon;
- one representative traversal room for every dungeon;
- every boss arena before the introduction;
- every boss arena at the reveal peak;
- every boss arena during active combat;
- menu, map, story, pause, death, and ending overlays at 1280x720 and
  1920x1080.

Captures should use fixed seeds, fixed player positions, fixed animation
times, the current 40 degree camera, hidden dev overlays, and no stale save
state. The script should write to a generated QA directory first. Reviewed
captures can then replace documentation images intentionally.

### Change 1.2: add composition metrics, not pixel-perfect goldens

Pixel-perfect screenshot comparison is unreliable across GPUs. I would add
stable semantic and projected-space measurements instead:

- projected player height as a percentage of viewport height;
- projected boss height and distance from the player;
- percentage of the central safe frame covered by foreground geometry;
- HUD coverage percentage and overlap between panels;
- local contrast around player, boss, doors, pickups, and telegraphs;
- visible floor percentage;
- edge-density range to catch empty fields and unreadable noise;
- distinct palette-distance checks between adjacent actor classes;
- draw calls, triangles, geometries, textures, and frame-time samples.

These metrics should flag gross regression. Human review remains the final
authority for composition and art direction.

### Change 1.3: define performance budgets before adding density

Starting budgets for High at 1920x1080 on a desktop GPU:

- target 60 frames per second during traversal;
- target 60 frames per second during ordinary combat;
- no sustained frame below 30 frames per second during boss effects;
- target fewer than 140 draw calls in a normal room;
- target fewer than 200 draw calls in the heaviest boss room;
- target fewer than 220,000 visible triangles in a normal room;
- target fewer than 320,000 visible triangles in the heaviest boss room;
- no per-frame geometry or material allocation in steady-state gameplay.

These are starting budgets, not sacred numbers. They should be calibrated on
real hardware and recorded by quality tier. SwiftShader is suitable for
correctness, not performance certification.

## Priority 2: fix camera composition before adding more geometry

The current gameplay camera is broadly usable. The boss reveal is the major
failure. It drops from the normal 17.5 height to 6 with a back distance of
3.5. At that distance the hero can dominate the frame and obscure the boss,
arena, and telegraph space.

### Change 2.1: reframe boss reveals as two-subject shots

I would replace the current single-target push with a framing function that
considers both player and boss:

1. Compute the midpoint between player and boss in XZ.
2. Compute their separation and vertical bounds.
3. Choose a camera height that keeps both inside a safe rectangle.
4. Clamp that height against room geometry and the normal gameplay scale.
5. Ease toward the shot, hold briefly, then ease back.

Starting values for tuning:

- minimum reveal height: 12;
- minimum back distance: 4.5;
- maximum reveal duration: 1.4 seconds;
- player projected height at reveal peak: no more than 14 percent;
- both player and boss inside the central 70 percent of the viewport;
- never target a boss Y coordinate directly when it would pull the camera
  into a tall platform.

Reduced motion should cut directly to a restrained wide framing or skip the
camera move while retaining the title card.

### Change 2.2: add foreground occlusion handling

The camera always sits south of its look target, so south walls and tall
objects can predictably stand between camera and player.

I would add a game-side occlusion controller that raycasts or projects from
camera to player and fades only registered foreground occluders. It should
not make arbitrary gameplay objects disappear.

Eligible objects:

- room foreground walls;
- decorative columns and arches explicitly marked as occluders;
- large non-interactive props.

Rules:

- fade to 20 to 35 percent opacity over 100 to 160 milliseconds;
- disable depth writing while substantially faded;
- restore when the line of sight clears;
- never fade doors, hazards, enemies, pickups, or telegraphs;
- reduced transparency mode may instead lower or hide designated wall caps.

### Change 2.3: establish camera-safe construction zones

Every room grammar should receive a camera-facing side and safe-frame bounds.
Large decorative forms may frame the edges, but may not occupy the central
combat rectangle or the player-to-camera corridor unless they support
occlusion fading.

## Priority 3: rebuild the overworld from regional grammars

`world7.js` currently gives every generated screen the same vocabulary:
random slabs, single-cell pillars, and flat stains. Region identity is a
palette table layered over that shared shape grammar.

I would preserve the seeded generation and replace `buildTerrain()` with a
grammar registry. Every region gets macro, middle, and micro scale rules.

Each screen should contain:

- one dominant landmark or directional mass;
- three to six middle-scale structures forming paths and negative space;
- twenty to forty decorative instances;
- one region-specific ground pattern;
- a clear route between every connected edge;
- protected spawn, door, blocker, secret, and combat spaces;
- different geometry in Crust and Abyss, not merely different colors.

### Tombfields grammar

Crust:

- eroded grave rows aligned into broken processional lanes;
- leaning memorial slabs with varied height and yaw;
- low rib vaults and collapsed crypt mouths;
- pale root channels and moss pockets;
- one distant mausoleum silhouette per landmark screen.

Abyss:

- graves split and lifted into discontinuous shelves;
- gold seams bridging broken stones;
- violet ossuary growths replacing some memorials;
- missing ground strips that imply depth without creating accidental chasms.

### Spindle grammar

Crust:

- vertical pylons, broken gear teeth, rails, and cable trenches;
- repeated machine foundations with consistent axial alignment;
- stepped silhouettes that suggest increasing elevation.

Abyss:

- misregistered duplicate pylons;
- suspended gold index bars;
- violet phase gaps and rotated machinery;
- controlled flicker on small accents, not the full frame.

### Sinklands grammar

Crust:

- eroded basins, sediment shelves, drainage cuts, and wind-carved ribs;
- lower silhouettes near the center with raised banks around the edges;
- dust plumes and sparse dead brush made from instanced geometry.

Abyss:

- black glass basins;
- gold contour lines following erosion channels;
- partially inverted sediment shelves;
- slow vertical motes that reveal depth.

### Citadel grammar

Crust:

- axial roads, collapsed facades, buttresses, gate fragments, and plazas;
- repeated architectural proportions so the region feels constructed;
- gold repair seams used as navigation lines rather than random decoration.

Abyss:

- facades separated into hovering courses;
- mirrored arch fragments;
- violet interior volumes where walls have peeled open;
- more symmetry near the Proxy approach, then deliberate breaks.

### Quarry grammar

Crust:

- stepped excavation cuts;
- spoil banks, fractured boulders, rails, braces, and suspended hooks;
- exposed material bands showing the direction of extraction.

Abyss:

- cuts descending into glossy basalt;
- gold fracture networks;
- impossible cantilevered shelves;
- sparse red mineral light from below.

### Bonetown grammar

Crust:

- recognizable streets and intersections;
- roofless building shells;
- bone arches used as bridges and canopies;
- fences, signs, carts, and collapsed interiors as instanced dressing.

Abyss:

- street fragments drifting out of alignment;
- vertebral towers and bone lattices;
- doors without walls and rooms with missing exterior faces;
- pale bone as the primary readability color against dark ground.

### Cryomire grammar

Crust:

- ice shelves, frozen pools, reeds, pipes, and half-buried machinery;
- directional cracks leading toward Cryo and Mire entrances;
- low vapor cards near cold surfaces.

Abyss:

- translucent-looking crystal clusters built from emissive geometry;
- sludge channels cutting through ice;
- suspended frost fragments;
- cyan local lights limited to landmarks and hazards.

### Pyre grammar

Crust:

- a visible ascent using terraced basalt fans;
- lava drainage channels, vents, clinker fields, and broken retaining walls;
- larger forms toward the mountain side to establish direction.

Abyss:

- fractured basalt plates separated by glowing seams;
- reversed ember fall near phase wounds;
- restrained heat distortion around vents;
- red and gold light concentrated at navigational landmarks.

### Implementation shape

I would add a game-side module such as:

`src/game/overworld/region-grammars.js`

Each grammar would expose deterministic functions:

```js
{
    buildCollision(map, context),
    buildSurface(map, context),
    buildVariant(map, context),
    createDressing(scene, context),
}
```

Collision-bearing structures stay in voxel maps. Decorative repetition uses
`THREE.InstancedMesh` with shared geometry and material. Diverse but static
decorative shapes may use `THREE.BatchedMesh` after measurement proves it is
worth the added complexity.

All dressing must implement `dispose()` and must be owned by the baked room
record so room streaming cannot leak GPU resources.

## Priority 4: give every dungeon an authored visual kit

The dungeon definitions contain useful bespoke ideas, but many rooms still
read as differently colored rectangular shells. I would define a small kit
for every beat and use it consistently across that dungeon:

- floor pattern;
- wall course and cap;
- doorway treatment;
- two structural props;
- two small dressing props;
- one animated or emissive motif;
- one region-specific atmospheric behavior;
- one boss-arena composition rule.

The kit should be visible in the entry room, developed in traversal rooms,
and transformed in the boss room. That creates visual progression without
external assets.

Examples:

- Crypt: burial rows, broken consoles, predecessor remains, cold shaft light.
- Spindle: gears, rails, capacitors, repeating machine bays.
- Sink: sediment ribs, wind trenches, buried frames, drifting dust.
- Sky: stepped monuments, open edges, cloud cards, vertical light shafts.
- Citadel: buttresses, kintsugi seams, false facades, proxy doubles.
- Quarry: cut strata, braces, rubble, bleeding mineral seams.
- Sluice: channels, gates, wet reflections, hanging chains.
- Bone: rib vaults, marrow roots, bone piles, pale particulate.
- Town: streets, rooms, signage, domestic debris, phantom duplicates.
- Cryo: ice fins, pipes, condensers, vapor.
- Mire: shelves, drowned furniture, roots, sludge bubbles.
- Pyre: vents, basalt fans, ember pools, heat shimmer.
- GUMOI: index rails, displaced copies, scan lines localized to geometry.
- Leviathan: folded architecture, recursion markers, spatial seams.

## Priority 5: rebuild ordinary characters as articulated actor rigs

The procedural voxel sculptures contain more detail than the gameplay camera
can currently communicate. The main problem is not voxel count. It is pose,
silhouette, motion, and material hierarchy.

The hero and every normal enemy currently assemble the same torso, head,
arms, and legs with small profile and palette differences. Their body parts
are meshes, but they are not organized as animation pivots. Whole rigs turn
to face movement.

### Change 5.1: add named pivots without changing frozen builders

I would keep the existing voxel part builders and replace the game-side
`buildFigure()` helpers with an actor-rig assembler returning:

```js
{
    root,
    body,
    torso,
    head,
    armL,
    armR,
    legL,
    legR,
    weapon,
    attachments,
}
```

Each pivot owns its voxel mesh with its origin placed at an anatomical joint.
This permits animation using transforms only. No skeletal library or external
animation data is required.

Suggested new game-side modules:

- `src/game/characters/actor-rig.js`
- `src/game/characters/actor-animator.js`
- `src/game/characters/archetypes.js`
- `src/game/characters/materials.js`

### Change 5.2: procedural animation states

Hero states:

- idle breathing and weight shift;
- eight-direction walk with opposing arm and leg swing;
- dash anticipation, compression, travel lean, and recovery;
- weapon-specific attack anticipation, strike, overshoot, and settle;
- grapple brace and pull;
- hurt recoil and brief asymmetry;
- death collapse that preserves the grounded silhouette;
- interaction reach and pickup response.

Enemy states:

- alert acquisition;
- locomotion appropriate to archetype;
- readable attack anticipation that agrees with the ground telegraph;
- committed strike pose;
- recovery vulnerability pose;
- hit recoil and stagger;
- death or disassembly.

Animations should use state time, velocity, facing, and attack phase. Avoid
allocating new vectors or tweens every frame.

### Change 5.3: distinct ordinary-enemy silhouettes

Sentinel:

- taller upright stance;
- heavy shoulder mass and shield-side asymmetry;
- short, deliberate stride;
- red horizontal eye line;
- weapon or guard shape visible from above.

Scarab:

- low, wide, forward-leaning body;
- carapace plates and lateral legs or outriggers;
- compressed charge anticipation;
- green rear accent distinct from the face direction.

Frost:

- narrow torso and taller back apparatus;
- ranged emitter, staff, or forearm cannon;
- cyan crown or antenna silhouette;
- recoil pose that clearly marks projectile release.

The goal is to identify class from a black silhouette at gameplay scale. A
palette swap is not sufficient.

### Change 5.4: improve hero readability

The hero needs one unmistakable top-down signature:

- asymmetric salvage pack or shoulder plate;
- weapon visible while equipped;
- brighter face and hand values than the torso;
- cool eye glow kept below bloom clipping;
- compact contact shadow;
- short rim response against Abyss floors;
- damage and upgrade changes visible on the model where practical.

The hero should remain approximately the current world height. The solution
is readable shape and motion, not making the character larger.

## Priority 6: establish material and lighting hierarchy

The default level mesh uses one `MeshStandardMaterial` with vertex colors,
roughness 0.88, and metalness 0.04. Player and ordinary enemy parts use one
rough material at roughness 0.85. This makes stone, cloth, skin, iron, bone,
ice, and painted machinery respond too similarly.

### Change 6.1: create game-side material families

Minimum families:

- dry stone;
- polished or wet stone;
- iron and machinery;
- bone and limestone;
- ice and crystal;
- cloth and skin;
- emissive energy;
- sludge and magma.

The simplest implementation may partition a generated voxel map by palette
class and mesh two or three subsets with shared materials. Collision should
still be registered from the combined occupancy map exactly once.

If partitioning raises draw calls too far, a carefully bounded
`MeshStandardMaterial.onBeforeCompile` hook can derive roughness and subtle
surface response from vertex color classes. That path needs shader compile
tests and must preserve fog, shadows, tone mapping, and environment lighting.

### Change 6.2: lower flat ambient and use motivated local light

Current mood presets raise ambient intensity to 1.7 in Crust and 2.2 in
Abyss. That flattens form while bloom and grain attempt to manufacture mood
afterward.

Starting tuning range:

- Crust ambient: 0.55 to 0.9;
- Abyss ambient: 0.35 to 0.7;
- preserve a readable key direction;
- keep global fill restrained;
- allow local lights to describe doors, hazards, altars, machinery, ice,
  magma, and boss weak points.

I would add a pooled local-light manager with a strict visible-light budget.
Only the closest or most important three to five sources cast actual local
light. Additional emissive props retain bloom without adding lights.

### Change 6.3: add code-generated surface detail

Without image assets, surface richness can come from:

- deterministic vertex-color mottling;
- palette-aware edge and course variation;
- floor inlays and cracks generated into the voxel map;
- simple projected stain meshes;
- instanced rubble, grass, reeds, bones, bolts, and shards;
- animated dust, vapor, embers, and spores;
- restrained procedural shader noise in world space.

Noise must operate below the level of navigational contrast. It should make
surfaces tactile, not turn the entire image into television snow.

### Change 6.4: prewarm new shader variants during level transition

The material-family work will create more shader variants. Once a level has
installed its final lights, environment, fog, and generated meshes, call
`await renderer.compileAsync(levelRoot, camera, scene)` from the transition
path where practical. If the level does not expose one root, compile the
smallest stable group that covers its new materials.

Acceptance requires evidence:

- first combat input is never delayed waiting for compilation;
- transition time remains bounded and visibly communicates progress;
- unsupported `KHR_parallel_shader_compile` behavior falls back cleanly;
- material or light changes made after compilation still render correctly;
- measurements show lower first-frame stalls on at least one real GPU.

If measurements show no useful improvement, remove the added lifecycle
complexity. This is a hitch-control tool, not a ritual.

## Priority 7: make quality and mood compose instead of overwrite

There is currently no single owner for the final post stack.

`setQuality()` writes bloom strength and pass enablement. `MoodController`
then writes bloom strength, film intensity, vignette offset, and lights on
level load. Changing quality after a level load produces one result. Loading
another level produces another.

I would replace direct writes with a resolved visual profile:

```js
resolved = resolveVisualProfile({
    tier,
    mood,
    region,
    encounter,
    accessibility,
});
```

Ownership rules:

- quality decides whether a pass exists or is enabled and sets its maximum
  cost;
- mood supplies bounded aesthetic multipliers;
- region supplies color and atmosphere within the mood;
- encounter supplies temporary, time-limited accents;
- accessibility has final authority to disable motion, flashing, grain, or
  distortion;
- one function applies the resolved values.

Starting post values for visual tuning:

- High bloom strength: 0.65 to 0.95;
- Ultra bloom strength: 0.8 to 1.15;
- Crust film intensity: 0.03 to 0.07;
- Abyss film intensity: 0.05 to 0.10;
- chromatic aberration disabled during ordinary play;
- vignette restrained enough that corners retain navigation information;
- GUMOI flicker localized or reduced so geometry does not dissolve into
  black bands;
- Leviathan wrap limited by safe-frame and reduced-motion settings.

These are starting values. Final values require side-by-side captures on a
real GPU.

## Priority 8: simplify and subordinate the interface

Current captures can show HUD, boss bar, story panel, repeated toast text,
and control help simultaneously. The 3D scene becomes the background of its
own interface.

I would change the HUD as follows:

- replace the large permanent debug-like status panel with a compact combat
  HUD showing health, weapon, keys, and contextual objective;
- move detailed beat, mood, shard, and boss counts to the pause screen;
- show control help only during onboarding or after relevant inactivity;
- never repeat the same story line in both story panel and toast;
- reserve the bottom center for one transient message system;
- keep boss name, phase, and health in one compact top-center component;
- establish safe areas used by both camera framing and UI layout;
- test at 16:9, 16:10, ultrawide, and narrow mobile aspect ratios.

The monospace terminal identity can remain. It needs hierarchy, restraint,
and timing rather than replacement with generic fantasy chrome.

## Priority 9: add dynamic contact AO on Ultra only

After composition, world density, actors, materials, and lighting are in
place, GTAO becomes worthwhile.

This means WebGL `GTAOPass`. It does not mean WebGPU `GTAONode`. They belong
to different renderer and post-processing stacks, and current migration
notes for one must not be treated as tuning instructions for the other.

### Required vendored files

The current offline import map points `three/addons/` at
`lib/three/addons/`. That directory does not contain GTAO. The matching r185
versions of these files must be vendored:

- `addons/postprocessing/GTAOPass.js`
- `addons/shaders/GTAOShader.js`
- `addons/shaders/PoissonDenoiseShader.js`
- `addons/math/SimplexNoise.js`

Existing local dependencies already include `Pass.js` and `CopyShader.js`.

This ticket requires explicit authorization to change frozen `lib/` and
`src/engine/` paths.

### Composer placement and ownership

I would create the pass beside the existing render pass and insert it before
bloom and final color output. The quality resolver owns enablement:

- `low`: off;
- `med`: off;
- `high`: off by default, optional diagnostic toggle only;
- `ultra`: on if the device supports the required buffers and measured frame
  time remains inside budget.

The pass must resize correctly, dispose its render targets, survive runtime
quality changes, and fall back cleanly when allocation fails.

### GTAO acceptance criteria

- visible contact improvement beneath the hero, enemies, and bosses;
- visible improvement where actors approach walls and props;
- no broad gray veil over flat floors;
- no halo around silhouettes;
- no temporal crawling under camera movement;
- no effect on UI;
- no measurable behavior change;
- Ultra remains inside its agreed frame budget.

If GTAO cannot meet those criteria at acceptable cost, keep the baked voxel
AO and use inexpensive actor contact shadows instead. The pass is optional.
The frame is not.

## Live technical references checked on 2026-07-19

- [three.js official site, current r185](https://threejs.org/)
- [npm three package](https://www.npmjs.com/package/three?activeTab=versions),
  verified as 0.185.1 with a live registry query
- [three.js migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- [WebGLRenderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html)
- [WebGL capability documentation](https://threejs.org/docs/pages/WebGL.html)
- [WebGPURenderer status and migration guide](https://threejs.org/manual/en/webgpurenderer)
- [GTAOPass documentation](https://threejs.org/docs/pages/GTAOPass.html)
- [EffectComposer documentation](https://threejs.org/docs/pages/EffectComposer.html)
- [InstancedMesh documentation](https://threejs.org/docs/pages/InstancedMesh.html)
- [BatchedMesh documentation](https://threejs.org/docs/pages/BatchedMesh.html)

The recommendations above use the current WebGL renderer and addon model.
They do not depend on speculative APIs or a WebGPU migration.

## Proposed ticket sequence

### Ticket A: progression integrity

Changes:

- central player-travel gate;
- overworld entrance enforcement;
- persistence assertions;
- dev bypass.

Gate:

- focused E2E tests;
- full 1140 baseline must not decrease.

### Ticket B: GUMOI traversal and camera cleanup

Changes:

- terraces moved to `platforms()`;
- vertical combat alignment;
- room-exit focus cancellation;
- traversal and combat tests.

Gate:

- automated ascent and descent;
- normal-combat boss defeat;
- fresh current-camera capture.

### Ticket C: visual harness and profile ownership

Changes:

- maintained capture matrix;
- composition metrics;
- resolved quality and mood profile;
- initial post and light retune;
- replace deprecated `PCFSoftShadowMap` with `PCFShadowMap`;
- add a WebGL2 capability failure screen;
- make the three.js package and vendored runtime pin exact.

Gate:

- no quality-order dependence;
- updated captures reviewed at High and Ultra;
- accessibility settings retain final control;
- no shadow-map deprecation warning at startup;
- unsupported WebGL2 receives a useful message instead of a dead canvas.

### Ticket D: camera and HUD composition

Changes:

- two-subject boss framing;
- foreground occluder handling;
- compact HUD hierarchy;
- duplicate message removal.

Gate:

- all boss reveals fit the safe frame;
- no critical geometry hidden by HUD;
- aspect-ratio matrix reviewed.

### Ticket E: regional overworld reconstruction

Changes:

- eight region grammars;
- divergent Crust and Abyss geometry;
- instanced decorative dressing;
- disposal and performance instrumentation.

Gate:

- each region identifiable from grayscale silhouette;
- all edges, entrances, secrets, monoliths, and blockers remain reachable;
- no collision or navigation regression;
- draw-call and triangle budgets hold.

### Ticket F: articulated ordinary actors

Changes:

- named actor pivots;
- procedural state animation;
- three enemy silhouettes;
- visible hero equipment and grounding.

Gate:

- actor class identifiable from silhouette;
- telegraph and attack pose agree;
- hitboxes remain aligned through every state;
- no per-frame allocations in the animator.

### Ticket G: dungeon kits and material hierarchy

Changes:

- fourteen dungeon visual kits;
- material families;
- local-light pool;
- procedural surface detail and atmosphere;
- measured shader prewarming for the added material variants.

Gate:

- entry, traversal, and boss rooms show coherent visual development;
- hazards and interactables retain stronger contrast than decoration;
- performance budgets hold on all tiers;
- the first rendered encounter does not hitch on shader compilation.

### Ticket H: Ultra GTAO

Changes:

- vendor matching r185 addon code;
- composer integration;
- Ultra quality gate;
- resize, disposal, fallback, and performance tests;
- confirm that WebGPU `GTAONode` migration advice was not applied to the
  WebGL pass.

Gate:

- documented contact improvement in paired captures;
- no halo or gray veil;
- stable runtime quality switching;
- no regression on lower tiers.

### Ticket I: final recertification

Changes:

- regenerate every maintained capture;
- update `CERTIFICATION.md` honestly;
- archive before and after comparisons;
- full by-hand progression playthrough.

Gate:

- every claimed visual check points to current evidence;
- all automated tests pass;
- no known progression, collision, camera, or save defect remains open;
- worktree documentation and implementation agree.

## What I would not do

- I would not migrate to WebGPU or TSL during this reconstruction.
- I would not add a pile of post-processing passes before fixing composition.
- I would not increase character scale to compensate for weak silhouettes.
- I would not use random noise as a substitute for authored regional form.
- I would not give every emissive voxel a point light.
- I would not make decorative geometry collide unless gameplay requires it.
- I would not use pixel-perfect screenshots as the only visual test.
- I would not claim photorealistic AAA output without authored textures,
  animation data, models, and a much larger content budget.
- I would not erase the existing visual identity. The clove-black terminal
  interface, scarred voxel bodies, gold repair seams, Crust/Abyss duality,
  and hostile procedural theology are the good blood in this thing.

## Definition of done

**Current verdict: not met.** Items 1, 2, 17, and 18 have implementation in
the worktree, though 2, 17, and 18 still lack the complete live/visual tests
called for here. Items 4-16 and 19 remain incomplete or unproven, and item 15
currently fails at 1257/1267.

This reconstruction is complete only when all of the following are true:

1. A normal player cannot enter a locked beat from any overworld entrance.
2. A blocked attempt cannot corrupt `currentBeat` or Beat Select state.
3. The GUMOI arena can be traversed and fought through normal physics.
4. Every stored certification image uses the current camera and current code.
5. Every overworld region is recognizable from geometry before color.
6. Crust and Abyss versions differ in spatial form as well as palette.
7. Hero, sentinel, scarab, and frost enemy are recognizable from silhouette
   and motion at gameplay scale.
8. Every boss reveal frames player, boss, and combat space without foreground
   obstruction.
9. UI never repeats the same message or hides critical combat information.
10. Quality and mood settings resolve deterministically in any call order.
11. `low`, `med`, and `high` do not pay for GTAO.
12. Ultra GTAO is retained only if paired captures and frame measurements
    prove that it earns its cost.
13. No quality tier violates its calibrated frame, draw-call, or memory
    budget.
14. Accessibility settings remain authoritative.
15. The complete automated suite passes with no reduced assertion count.
16. A full by-hand campaign playthrough confirms progression, traversal,
    combat readability, save restoration, and visual continuity.
17. Startup emits no `PCFSoftShadowMap` deprecation and shadows pass fresh
    visual review with `PCFShadowMap`.
18. A browser without WebGL2 receives a useful compatibility message.
19. `package.json`, `package-lock.json`, vendored three.js builds, and every
    newly vendored addon identify one exact reviewed package version.

## Final assessment

The project does not need a new renderer to look dramatically better. It
needs a stricter visual hierarchy and more authored procedural content.

The engine is already capable of drawing a premium stylized voxel game. The
world generator currently gives it sparse generic blocks. The character
builders give it detailed sculptures but the runtime gives them nearly no
pose language. The post stack then pushes bloom, grain, and darkness hard
enough to disguise rather than resolve those weaknesses.

Fix the truth of the world first. Doors must mean locked. Terraces must mean
climbable. Regions must have different bones. Enemies must move like the
things they claim to be. The camera must show the fight instead of eating it.

Then add GTAO.
