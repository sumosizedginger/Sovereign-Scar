# AUDIT animations.md — player & enemy motion + combat readability plan

**Status:** living audit. Animation remains unimplemented; later combat and
presentation fixes are only partially verified.  
**Last updated:** 2026-07-20  
**Scope:** walking, fighting, and other body animations for the hero, ordinary enemies, and bosses; also presentation/post-FX and boss silhouette readability.  
**Repo:** `D:\Zelda\sovereign-scar`  
**Related:** [AUDIT-progression-and-geometryv2.md](AUDIT-progression-and-geometryv2.md) Priority 5 (character rigs).

---

## 0. Standing directive

| Allowed now | Forbidden now |
|---|---|
| Read source, capture current behaviour, write this plan | Any production code change for animation |
| Design module APIs, state machines, timelines | New npm deps / skeletal libs / GLTF pipelines |
| Specify tests that *will* gate implementation later | Editing frozen trees (`src/engine/`, `src/voxel/`, `src/combat/`, `src/characters/`, `lib/`) |

When a later session implements this plan, it must stay inside **`src/game/` + `tests/`** (and optional additive audio in `src/audio/synth.js` only). Part *meshes* stay built by frozen `src/characters/builders.js`; articulation is a **game-side pivot wrap**, not a rewrite of builders.

---

## 1. Executive diagnosis

### What the player sees today

Ordinary actors are **static voxel mannequins**. Torso, head, arms, and legs are separate meshes parented under one group, but **no limb transforms are ever driven**. The only motion is:

1. **World translation** of the whole rig (physics / AI).
2. **Whole-body yaw** (`rig.rotation.y = atan2(facing.x, facing.z)`).
3. **VFX proxies** for combat (ground telegraphs, `ArcSmear` fan, material flash, i-frame blink).
4. **Audio proxies** for locomotion (footstep noise on a timer).

From the gameplay camera (≈40° top-down, fixed width), this reads as **sliding statues**: direction is correct, intent is not. Attacks especially feel weightless because the body never anticipates, commits, or recovers—the smear appears while the figure stays in T-pose-at-sides rest.

### One-line root cause

> Parts are assembled as decoration, not as an **animation hierarchy with joint origins**. Without pivots, there is nowhere safe to hang walk/attack curves.

### Confidence

| Claim | Confidence | Evidence |
|---|---|---|
| No limb animation on player | **Certain** | `player.js` update only sets `rig.rotation.y`, i-frames, smear, physics |
| No limb animation on enemies | **Certain** | `enemy.js` same: yaw + flash + translate; windup freezes translation only |
| Hero/enemy share same figure assembly | **Certain** | Duplicate `buildFigure()` + same part offsets in both files |
| Bosses mostly non-humanoid / special-case | **High** | Procedural meshes, orbit, blade spin; not shared actor rig |
| Prior audit already named this | **Certain** | v2 Priority 5: “rotate as whole statues instead of posing” |

---

## 2. Current architecture (evidence)

### 2.1 Construction — shared pattern

**Player** ([`src/game/player.js`](src/game/player.js) ~L20–L74):

```text
parts = [
  torso @ [0, 0, 0],
  head  @ [0, 24, 0],
  armR  @ [12, 15, 0],
  armL  @ [-12, 15, 0],
  legR  @ [5, 0, 0],
  legL  @ [-5, 0, 0],
]
→ buildFigure() packs each map into a Mesh with offset.position
→ all meshes parented to one Group `inner`
→ only named handle: this._inner (not individual limbs)
→ grounded via bbox shift on inner
```

**Enemy** ([`src/game/enemy.js`](src/game/enemy.js) ~L12–L64): **identical assembly**, slightly different scale (`S * 0.33` vs hero `S * 0.39`) and palette by `kind` (`sentinel` | `scarab` | `frost`).

**Builders** ([`src/characters/builders.js`](src/characters/builders.js) — **frozen**):

- `buildTorso`, `buildHead`, `buildArm(sideSign)`, `buildLeg(sideSign)`, `buildGlowEyes`
- Parts are authored in local voxel space; arms/legs are **not** authored with joint at origin-zero relative to shoulder/hip sockets used by the figure offsets. Any pivot system must **re-parent with corrective offsets** so rotation happens at shoulder/hip, not at mesh AABB centre.

### 2.2 What `update` actually animates

| Actor | Visual update | Combat / feedback |
|---|---|---|
| **Player** | `rig.rotation.y` from facing; visibility blink on i-frames | `ArcSmear.spawn` on attack/dash; `vsfx.slap` / `vsfx.step`; no attack pose |
| **Enemy** | `rig.rotation.y` from chase facing; emissive flash on hit; hide on death | Ground `RingGeometry` telegraph; windup freezes AI motion; projectiles are spheres |
| **BossBase** | Flash emissive; hide root on death | Telegraph ring/cone/line; recover cue; grammar windup→strike→recover — **body rarely mirrors phases** |
| **Crypt Warden** (example) | Blade `rotation.z` wiggle / stagger tilt | Partial exception: one prop spins; torso still statue |

### 2.3 Combat feedback that *substitutes* for animation

These systems are **good** and must remain; animation should **agree with** them, not replace them:

| System | File | Role |
|---|---|---|
| 8-way attack fan | `src/game/fx/arc-smear.js` | Shows swing volume in XZ for 0.12s |
| Enemy/boss telegraphs | `enemy.js`, `bosses/base.js` | Ground ring/cone/line; windup timing |
| Boss action grammar | `bosses/base.js` `startAction` / `runAction` | windup → active → recover; `vulnerableMult` |
| Juice | `fx/juice.js` | trauma, hitstop |
| Footstep audio | `player.js` `_stepAcc` + `vsfx.step` | 0.32s cadence while grounded + moving |
| Facing | `combat/facing.js` via `makeFacing` | 8-way discrete facing vec |

**Mismatch today:** telegraph and smear commit to a strike; the body does not. A correct plan **binds body poses to the same phase clocks** (player attack CD / dash timer; enemy `_windupT` / `_pendingStrike`; boss `action.phase`).

### 2.4 State fields that exist but are unused for pose

| Field | Set to | Read for pose? |
|---|---|---|
| `player.state.current` | `'IDLE'`, `'DEAD'` | No |
| `enemy.state.current` | `'IDLE'`, `'DEAD'` | Death hide only |
| `enemy._windupT` | countdown | Freezes locomotion only |
| `enemy.ai` | chase / charge / ranged | AI branch only |
| `player.attackCd`, `dashTimer` | timers | Gameplay only |
| Boss `action` | `{ phase, t, dur, … }` | Grammar + damage mult only |

These are the **natural hooks** for an animator: no new save schema required for visual-only state.

### 2.5 Camera and scale constraints (must not break)

- Top-down ~40° camera, fixed orthographic-ish feel via camera rig width (~24 units).
- Hero height ≈ 1.9 world units; enemies shorter.
- No jump button; vertical motion is steps / fall / grapple.
- Animations must read from **above and three-quarter**, not side-scroller profile.

Acceptance: silhouette and limb arcs must stay readable at current camera; do not “solve” motion by enlarging characters.

### 2.6 Frozen boundaries (implementation constraint)

| Path | Status | Implication for animation work |
|---|---|---|
| `src/characters/builders.js` | Frozen | Keep using `buildArm`/`buildLeg`/…; do not retarget voxel authors |
| `src/combat/*`, `src/engine/*` | Frozen | Do not put pose logic in hitbox/smear engine |
| `src/game/player.js`, `enemy.js`, `bosses/*` | Mutable | Wire animator here |
| New under `src/game/characters/` | Allowed | Preferred home for rig + animator |

---

## 3. Design principles for the upgrade

1. **Pivots over skeletons.** `THREE.Group` joints + local Euler/quaternion slerp. No bone libraries, no FBX/GLTF, no new deps.
2. **One animator, many drivers.** Same `ActorAnimator` for hero and humanoid enemies; bosses opt-in if humanoid enough, else keep custom prop motion.
3. **Gameplay clock is truth.** Pose phase is derived from existing timers (move wish, attack CD, windup, boss action). Never invent a second clock that can desync telegraphs.
4. **Readable exaggeration over realism.** Top-down Zelda-like: bigger arm arc, clearer lean, short strike hold, obvious recover drop.
5. **Archetype silhouettes.** Palette alone is not enough (scarab/sentinel/frost share the same mannequin). Animation *and* optional rest-pose offsets must diverge by kind.
6. **Zero allocation steady-state.** Reuse scratch vectors; no `new THREE.Vector3` per limb per frame.
7. **Deterministic under fixed dt.** Puppeteer e2e can assert limb Euler ranges after N steps of fixed 0.05 dt.
8. **Fail safe.** If animator missing, rig still yaws and plays—as today—so levels never softlock.

---

## 4. Target architecture

### 4.1 New modules (game-side only)

```text
src/game/characters/
  actor-rig.js        # assemble named pivots from builder maps
  actor-animator.js   # state machine + procedural pose evaluation
  pose-library.js     # rest / walk / attack / hurt / death pose tables
  archetypes.js       # hero + sentinel + scarab + frost rest offsets & gait params
  materials.js        # optional: rim, emissive eye tune (later ticket)
```

### 4.2 `ActorRig` contract

```js
// Conceptual API — implement later, do not code now
createActorRig({ palette, profileScale, meshScale, clothingMode, archetype }) → {
  root,          // THREE.Group — same role as current this.rig
  body,          // vertical bob / lean parent
  torso, head,
  armL, armR,    // rotation.x swing; rotation.z for lateral raise
  legL, legR,
  weapon,        // optional attachment socket on armR
  eyes,          // existing glow eyes re-parented under head
  setFacingYaw(y),
  dispose(),
}
```

**Joint placement rules:**

| Pivot | Parent | Local origin intent |
|---|---|---|
| legL/R | body | hip socket (~ pelvis) |
| armL/R | torso | shoulder socket |
| head | torso | neck |
| torso | body | mid-spine |
| body | root | ground-aligned; carries bob |

Part meshes keep current voxel content; **mesh.position** is adjusted so visual mass matches today’s silhouette after pivot re-parenting (regression: grounded feet, same overall height within ±5%).

### 4.3 `ActorAnimator` contract

```js
// Conceptual
animator = createActorAnimator(rig, { archetype, isHero })
animator.setLocomotion({ speed, wishX, wishZ, grounded, dashing })
animator.setCombat({ phase: 'idle'|'windup'|'strike'|'recover', t01, weaponId, facingVec })
animator.setHit({ flash, stagger })
animator.setDead(bool)
animator.update(dt)
// Internally writes only local rotations/positions on pivots — never world root XZ
```

**State priority (highest wins):**

1. `DEAD`  
2. `HURT` (short override, ≤0.2s)  
3. `ATTACK` / enemy windup-strike-recover  
4. `DASH`  
5. `GRAPPLE` (hero)  
6. `MOVE` if horizontal speed > threshold  
7. `IDLE`

### 4.4 Pose evaluation model

Prefer **layered procedural** poses over keyframe clips:

- **Base layer:** rest pose from archetype (stance width, arm hang, torso lean).
- **Locomotion layer:** phase `φ = ∫ gaitFreq(speed) dt`, then  
  - `legR.x = +A sin φ`, `legL.x = -A sin φ`  
  - `armR.x = -B sin φ`, `armL.x = +B sin φ` (opposing)  
  - `body.y = bobAmp |sin φ|`  
  - optional torso yaw counter-twist `±twist * sin φ`
- **Combat layer:** time-warped envelopes for windup/strike/recover (see §5–6).
- **Hit layer:** impulse decay on torso pitch/roll and opposing arm flinch.

Blend with smoothstep weights; combat layer dominates limbs during strike.

### 4.5 Integration points (where to call later)

| Call site | Wire-in |
|---|---|
| `Player` constructor | Replace `buildFigure` with `createActorRig`; store `this.animator` |
| `Player.update` | After facing/physics: feed locomotion + attack/dash/grapple timers → `animator.update` |
| `Player.tryAttack` / `tryDash` | Set combat phase start times (or let animator derive from CD rising edges) |
| `Enemy` constructor | `createActorRig` + archetype from `kind` |
| `Enemy.update` | Feed speed, windup phase (`_windupT`, `_pendingStrike`), flash → animator |
| `Enemy._beginWindup` / resolve | Start/end combat phases so pose matches telegraph |
| Bosses (phase 2 of work) | Optional: humanoid bosses only; others keep prop animation |

**Do not** move hit detection into the animator. Sweeps stay in `combat-sweeper.js` / existing enemy resolve functions.

---

## 5. Player animation plan

### 5.1 Idle

| Element | Spec |
|---|---|
| Breathing | Torso Y scale micro-pulse or body.y ±0.02 at ~1.2 Hz |
| Weight shift | Slow lateral body.x oscillation ±0.03 over 2.5s |
| Arms | Slight hang + micro sway; not T-pose rigid |
| Head | Optional micro look-around only if cheap; default still |

### 5.2 Walk / run (8-way)

| Element | Spec |
|---|---|
| Trigger | Grounded and `hypot(wishX,wishZ) > 0.15` |
| Gait frequency | Lerp 1.6–2.6 Hz by speed (dash excluded) |
| Leg swing | Primary pitch ±18–28° |
| Arm swing | Opposing ±12–20° |
| Stride lean | Body pitch toward move dir 4–8° |
| Foot plant audio | Keep `_stepAcc`; optionally sync to phase zero-cross of leg sin for better feel |

**Facing:** keep LttP rule (face walk dir; pad aim override). Animator uses **facing for upper body**, move vector for lean when they differ (strafe readability).

### 5.3 Dash

| Phase | Duration cue | Pose |
|---|---|---|
| Anticipation | first ~20% of `dashTimer` max | crouch compress (legs bend, body dip) |
| Travel | middle | long lean into facing; arms back; trailing smear already exists |
| Recovery | last ~25% after timer ends | stand-up ease |

Use `dashTimer` + `dashCd` edges already on the player. Phase Boot vs short hop: scale lean exaggeration with ownsBoot.

### 5.4 Attack (weapon-specific envelopes)

Shared structure timed to `weapon.cooldown` and smear lifetime (0.12s):

| Phase | Fraction of attack window | Pose intent |
|---|---|---|
| Anticipation | 0–25% | armR raises; torso winds opposite swing |
| Strike | 25–55% | armR arcs through facing; torso follows; matches ArcSmear direction |
| Overshoot | 55–75% | arm past centreline |
| Settle | 75–100% | return toward idle/move |

**Per weapon (gameplay identity):**

| Weapon id | Motion note |
|---|---|
| `bare_strike` | Short snap; small windup |
| `anchor_link` | Medium arc; default “hero swing” |
| `tectonic_wedge` | Heavier windup; two-hand lean (left arm assists) |
| `heavy_mallet` | High raise overhead → downchop bias (readable from top as vertical dip + arm pitch) |
| `light_caster` | No big arm arc; staff/forearm point along facing; slight recoil after ray |
| `phase_boot` / grapple | Not melee: use dash/grapple poses |

Ray weapons must **not** spawn a misleading melee smear pose if the smear is skipped—point pose only.

### 5.5 Grapple

| Phase | Pose |
|---|---|
| Aim / fire | armR forward along facing; free hand brace |
| Pull | both arms forward; torso lean to line; legs trail |
| Landing | short crouch recover |

Driven by `GrappleController` active flags already in `Player.update`.

### 5.6 Hurt / death

| Event | Pose |
|---|---|
| Damage accepted | Torso pitch/roll flinch away from attacker if known; arms asymmetric 0.15–0.2s |
| i-frames | Keep blink **or** reduce blink once body flinch exists (avoid double-noise) |
| Death | Collapse: knees in, torso fold, arms drop; then hold or fade—must remain grounded (no underground mesh) |

### 5.7 Interact / pickup (optional polish ticket)

Short reach on interact key when near altar/door/pickup: armR extend 0.2s. Low priority vs walk/fight.

---

## 6. Enemy animation plan

### 6.1 Shared (all AI types)

| State | Visual |
|---|---|
| Idle | Slow breathe; scan yaw optional |
| Alert | When player enters aggro: short torso lean / head snap before chase |
| Move | Archetype gait (§6.2) |
| Windup | **Freeze feet** (already) + raise weapon/arms + crouch; **must peak as ring opacity peaks** |
| Strike | Snap limbs through attack; 1–2 frames of stretch ok |
| Recover | Drop arms, open chest (readable “safe to hit” alongside lack of ring) |
| Hit | Flash **plus** stagger lean |
| Death | Collapse or “disassemble” (scale squash + hide); scarab can curl |

### 6.2 Archetype locomotion & fight (must read as different classes)

#### Sentinel (`ai` chase default)

- Tall upright rest; shield-side asymmetry (left arm forward guard).
- Slow deliberate walk (lower gait amp, lower freq).
- Melee: horizontal slash bias; windup pulls arm back clearly.
- Optional: slightly wider stance.

#### Scarab (`ai` charge)

- Low, forward lean rest (body pitch permanent +6–12°).
- Scuttle: higher frequency, smaller limb amp; lateral body sway.
- Charge windup: compress (legs gather, body dips) **matching** 0.5s windup.
- Charge travel: elongated lean; arms tucked.
- Strike resolve: lunge extend then recover.

#### Frost (`ai` ranged)

- Narrow upright; “caster” armR raised rest.
- Walk: restrained arms; staff-like hold.
- Ranged windup: armR to aim pose; torso brace; **release snap** on projectile spawn frame.
- Recoil: arm kick-up after shot so projectile ownership is obvious.

### 6.3 Synchronisation rules (hard requirements)

1. `_beginWindup` → animator combat phase `windup` with same duration as ring life.  
2. Windup resolve → phase `strike` for ≤0.12s then `recover` for remaining `attackCd`.  
3. If player whiffs (distance check fails), still play strike+recover (whiff readable).  
4. Death clears windup pose immediately (same as `clearTelegraph`).

### 6.4 DummyTarget / non-humanoids

`DummyTarget` is a simple mesh—**out of scope** for actor animator. Leave as-is.

---

## 7. Boss animation plan (secondary)

Bosses are mostly **bespoke meshes**, not shared humanoid parts. Do **not** force ActorRig onto Leviathan / Hydroid / etc.

### Phase A (with ordinary actors)

Document and lightly extend **prop-level** motion already present:

- Crypt Warden blade swing amplitude tied to action phase (windup raise, strike arc, recover drop).
- Multi-core bosses: core spin rate by phase.
- Ensure `startAction` phases can drive existing prop rotations via a small `boss.setAnimPhase(phase, t01)` optional hook on subclasses that want it.

### Phase B (after hero/enemy ship)

Per-boss “signature motion” pass (one ticket each), e.g.:

| Boss | Motion idea |
|---|---|
| Crypt Warden | Full body lean + blade; death shatter already juice-driven |
| Tri-Compiler | Core orbit speed / height by phase |
| Sand Spur | Burrow squash/stretch on submerge/emerge |
| Kinetic Core | Pulse scale with telegraph |
| Proxy | Mirror-lag pose / afterimage |
| Phantasm | Flicker offset clones already present—sync to action |
| GUMOI / Leviathan | Prefer VFX + camera; body is architectural |

Priority order for boss polish: **Warden first** (tutorial boss, humanoid-adjacent), then Proxy, then the rest.

---

## 8. Silhouette & rest-pose differentiation (pairs with animation)

Animation alone will not fix “three palette swaps.” In the same implementation track (or immediately after pivots land), set **archetype rest offsets**:

| Archetype | Rest offsets |
|---|---|
| Hero | Asymmetric shoulder / pack socket (even a small second mesh), weapon in hand when not bare |
| Sentinel | Broader shoulders (profileScale), guard arm |
| Scarab | Permanent forward lean; legs wider; lower body.y visual |
| Frost | ArmR elevated; taller head offset; thinner profileScale |

Optional later: unique prop attachments (shield slab, carapace plate, emitter crystal) as child meshes—still game-side, not frozen builders.

**Readability test:** black-and-white capture at gameplay camera; class identity ≥80% in informal side-by-side (human QA) or automated bbox aspect-ratio thresholds as a weak proxy.

---

## 9. Implementation ticket order (when coding is allowed)

| Ticket | Name | Deliverable | Depends |
|---|---|---|---|
| **A0** | Spec freeze | This document reviewed; no code | — |
| **A1** | `ActorRig` assembler | Named pivots; ground height parity; dispose | A0 |
| **A2** | Hero idle + walk | Player uses rig+animator; steps still sound | A1 |
| **A3** | Hero attack + dash + hurt | Phases bound to CD/timers; smear still fires | A2 |
| **A4** | Enemy animator shared path | All kinds use rig; yaw preserved | A1 |
| **A5** | Enemy combat sync | Windup/strike/recover poses ↔ telegraphs | A4 |
| **A6** | Archetype gaits + rest poses | Sentinel/scarab/frost distinct motion | A5 |
| **A7** | Grapple + death polish | Hero grapple; both death collapses | A3 |
| **A8** | Boss prop phase hooks | Warden blade + optional grammar hook | A3 |
| **A9** | Visual certification captures | Update docs/media samples; BUILD_LOG entry | A6–A8 |

**Do not start A6 before A5**—distinct walks without fight sync still leaves combat feeling dead.

**Suite rule (project standing):** after each ticket, `npm test` must not drop assertion count; add focused unit/e2e asserts per ticket.

---

## 10. Acceptance criteria

### 10.1 Functional (must)

- [ ] Hero limbs move during walk; left/right opposition visible in frozen screenshot mid-stride.
- [ ] Hero attack shows arm/torso commitment overlapping ArcSmear lifetime.
- [ ] Enemy windup pose is visible for full telegraph duration; strike pose occurs at damage resolve frame ±1 tick at 0.05 dt.
- [ ] Charge scarab compresses before launch; frost aims before projectile spawn.
- [ ] Death does not leave T-pose standing.
- [ ] No change to damage numbers, ranges, cooldowns, or door/key logic.
- [ ] Grounding: feet remain on floor plane (no float/sink > 0.05).
- [ ] Performance: 20 on-screen enemies + hero at med quality stays within prior frame budget on reference hardware (or no worse than +10% CPU of update path in headless sampling).

### 10.2 Explicit non-goals (this plan)

- Full skeletal IK, ragdoll, or motion-capture.
- Per-frame morph targets / vertex animation of voxel meshes.
- Replacing ArcSmear or ground telegraphs.
- Rewriting frozen builders or engine smear.
- Making bosses share the humanoid actor rig in v1.

### 10.3 Regression surfaces to guard

| System | Risk if animation careless |
|---|---|
| Hitboxes | Moving meshes must **not** move `root.position` XZ; combat uses root |
| Camera bounds | Bob must stay on local body, not root |
| Shadows | Limb swing ok; avoid exploding bounds every frame |
| Save/load | No new required save fields |
| Multi-room bake | dispose rig materials/geometries with enemy dispose |

---

## 11. Test plan (write when implementing; not now)

### 11.1 Unit (`tests/game/actor-animator.spec.mjs` — proposed)

- Rest pose: all limb Euler ≈ 0 (or archetype baseline) at t=0 idle.
- Walk: after 0.5s at speed 5.5, `legR.rotation.x` and `legL.rotation.x` have opposite signs at a sample phase.
- Attack: force combat phase strike at t01=0.4 → `armR` pitch beyond idle threshold.
- Priority: DEAD suppresses walk updates.
- No throw if archetype unknown (fallback hero-like).

### 11.2 Browser e2e (`tests/actor-anim-e2e.spec.mjs` — proposed)

1. Load sandbox or beat-01 with `?dev=1`.  
2. Hold move north N frames at fixed dt via physics/input injection.  
3. Read `player.rig` child Euler via `page.evaluate` (expose `window.__sovereignScar.player.animator.debugPose()` if needed).  
4. Spawn enemy, force `_beginWindup`, assert arm raise > threshold before resolve.  
5. Screenshot mid-walk and mid-windup under `docs/media/anim/` for human read-back.

### 11.3 Visual read-back checklist (human or agent with screenshots)

| Capture | Must see |
|---|---|
| Hero walk | Alternating legs, not pure slide |
| Hero slash | Arm arc + smear together |
| Sentinel windup | Guard open / arm cocked + red ring |
| Scarab charge windup | Squash before movement burst |
| Frost shot | Aim pose then projectile |

### 11.4 Suite integration

Register e2e in `tests/run-all.mjs` next to combat-feel tests. Keep `visual-sanity` height/grounding asserts green.

---

## 12. Performance & quality budget

| Budget | Target |
|---|---|
| Extra groups per actor | ≤ 8 (root/body/torso/head/2arm/2leg) |
| Extra GPU draw calls | 0 if materials shared; prefer one material per part as today |
| Animator CPU | &lt; 0.05 ms/actor average in isolation (microbench optional) |
| GC | No per-frame allocations in `animator.update` |
| Quality tiers | Animation always on; do not gate limbs behind ultra—motion is gameplay readability |

If mobile/low ever matters: reduce gait sin evaluations for off-screen enemies (already disposed far rooms help).

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Pivot origins wrong → limbs orbit wildly | Unit golden poses; visual sandbox; A1 height parity tests |
| Attack pose desyncs damage | Drive solely from existing CD/windup clocks |
| Smear + arm double-count visual noise | Tune arm arc slightly inside smear radius; shorten settle |
| Scarab lean clips floor | Clamp body pitch; raise pivot |
| Boss work expands forever | Cap A8 to Warden + hook; defer roster |
| Frozen builders joint-unfriendly | Corrective mesh offsets in ActorRig only |
| Agents “fix” by scaling characters | Explicit non-goal; visual-sanity height asserts |

---

## 14. File-level change map (future PR surface)

| File | Change type |
|---|---|
| `src/game/characters/actor-rig.js` | **New** |
| `src/game/characters/actor-animator.js` | **New** |
| `src/game/characters/pose-library.js` | **New** |
| `src/game/characters/archetypes.js` | **New** |
| `src/game/player.js` | Wire rig + animator; remove local `buildFigure` |
| `src/game/enemy.js` | Wire rig + animator; remove local `buildFigure` |
| `src/game/bosses/roster.js` (Warden) | Optional phase-driven blade |
| `src/game/bosses/base.js` | Optional `onActionPhase` callback |
| `tests/game/actor-animator.spec.mjs` | **New** unit |
| `tests/actor-anim-e2e.spec.mjs` | **New** e2e |
| `tests/run-all.mjs` | Register specs |
| `BUILD_LOG.md` / `CHANGELOG.md` | Session notes when implemented |
| `docs/media/anim/*` | Certification stills |

**Must not touch:** `src/characters/builders.js`, `src/engine/smear.js`, hitbox math, weapon damage tables (unless a pose exposes a bug unrelated to numbers).

---

## 15. Suggested pose parameter tables (starting values)

Tunable constants for implementers (not sacred):

### Hero walk

```text
gaitFreqMin = 1.7 Hz @ speed 2
gaitFreqMax = 2.5 Hz @ speed 5.5
legPitchAmp = 0.40 rad
armPitchAmp = 0.28 rad
bobAmp = 0.035
torsoTwistAmp = 0.08 rad
moveLean = 0.12 rad
```

### Hero attack (anchor_link)

```text
windup: armR pitch -0.8, torso yaw -0.25
strike: armR pitch +0.6, torso yaw +0.35  (along facing)
recover: ease to locomotion layer over 0.15s
```

### Enemy windup shared

```text
armR pitch -1.0 (cocked)
knee bend via leg pitch +0.25
body dip -0.05
```

Tune in sandbox with `?dev=1` after A2/A5; bake final numbers into `archetypes.js`.

---

## 16. Relationship to other audits

| Document | Overlap |
|---|---|
| `AUDIT-progression-and-geometryv2.md` §Priority 5 | Same problem statement; this file expands tickets, evidence, tests, and boss scope |
| `AUDIT-progression-and-geometry.md` | Geometry/collision—not animation; do not conflate |
| `CERTIFICATION.md` / visual captures | Will need refresh after A9; current stills show statue actors |
| Combat-feel session notes | Telegraphs/hearts fixed combat **readability without body motion**; this plan supplies the missing body layer |

---

## 17. Definition of done (for a future implementation goal)

A future “implement animations” goal is complete only when:

1. Tickets **A1–A6** merged with suite green and no assertion count regression.  
2. Hero walk + attack and all three enemy kinds demonstrate synchronized combat poses in e2e or recorded captures.  
3. `AUDIT animations.md` updated with “Status: implemented” and links to commits/PRs.  
4. Optional A7–A9 tracked separately if time-boxed.

**This audit session’s definition of done:** this file exists, is complete, and requires **no code**.

---

## 18. Appendix — quick reference: “what moves today?”

```text
Player
  ✓ root XZ via VoxelPhysicsBody
  ✓ root yaw from facing
  ✓ ArcSmear / i-frame blink / footstep SFX
  ✗ arms, legs, torso, head local motion
  ✗ attack anticipation / recover body
  ✗ dash body lean
  ✗ hurt pose / death collapse

Enemy (sentinel / scarab / frost)
  ✓ root XZ AI move / knockback
  ✓ root yaw toward player
  ✓ telegraph ring + hit flash + projectiles
  ✗ any limb motion
  ✗ windup body pose
  ✗ distinct gaits per kind (move speed only)

Bosses
  ✓ mostly custom mesh translation / simple prop spin
  ✓ grammar phases for damage windows
  ~ partial prop motion (e.g. Warden blade)
  ✗ unified body language across roster
```

---

## 19. Recommended first implementation PR (when allowed)

**Title:** `feat(anim): actor rig pivots + hero walk cycle`  
**Includes:** A1 + A2 only.  
**Why thin:** validates joint math and grounding before combat layering.  
**Demo:** sandbox north-walk capture; unit opposition test.  
**Follow-up PR:** A3 hero attack/dash.  
**Third PR:** A4–A6 enemies.

Do not ship hero combat animation without enemy windup sync in the same milestone if the milestone is marketed as “combat animation”—players will notice one-sided liveliness.

---

---

## 20. Combat presentation & altar upgrades (playtest, 2026-07-20)

### Report

Players reported graphics changing after buying altar upgrades (example: Kintsugi Shell -15% environmental damage), making combat hard to see. They want presentation stable for the entire run.

### Code check (what upgrades actually do)

| Upgrade | Gameplay | Post / materials / quality? |
|---|---|---|
| Edge / Ghost / Long-arm / Magnet / Reservoir | Damage, i-frames, grapple, motes, vials | **No** |
| **Kintsugi Shell** (-15% env dmg / tier) | `environmentalDamageMult` only | **No** |
| Echo Lens | Map secret reveal flag | Map UI only, not world post |
| Altar `buy` handler | `tryPurchase` + `applyUpgradeStats` | **No** renderer/mood calls |

**Conclusion:** altar purchases are stats-only. The perceived graphics change after shopping is almost always **mood/quality post-FX** (level load / Abyss entry / phase shift) coinciding with altar progression, not Kintsugi itself.

### Presentation changes applied in-tree (certification still open)

| Issue | Evidence | Fix (applied) |
|---|---|---|
| Abyss bloom washed the frame | `MOOD_PRESETS.abyss.bloom` was **2.4** vs quality high cap **0.9** | Cap mood bloom/film/vignette; abyss bloom ~0.7 |
| Mood overwrote quality every `loadLevel` | `mood.apply` set `bloomPass.strength = preset.bloom` after `setQuality` | `presentationPost()` mins mood vs quality tier |
| Heavy film grain | abyss `film: 0.45` | film <= 0.14, crust/abyss ~0.08-0.10 |
| Damage vignette blackout | juice depth 0.55 | reduced to ~0.22 (0.12 if reduceFlash) |
| Policy | — | upgrades.js + applyUpgradeStats documented **stats only** |

### Standing presentation rules (do not regress)

1. **Upgrades never touch graphics** — no bloom/film/vignette/fog/material side effects in `tryPurchase` / `applyUpgradeStats`.
2. **Mood may recolour** lights/fog/background for Crust vs Abyss identity.
3. **Post intensity stays moderate** for the whole run; quality tier is the ceiling.
4. **Bosses and pickups must stay above floor plates** and use readable emissives (see §21).

---

## 21. Beat 04 Kinetic Core disappeared mid-fight (Sky Monument)

### Report

Boss 4 (Kinetic Core) was hard to see / vanished mid combat.

### Root causes (code)

| Cause | Detail |
|---|---|
| **Buried in arena plate** | Corona plate is y=1 voxels (top ≈ **2.0**). Core AI set `position.y = 1.2 + bob` (charge slump **0.9**). Radius 0.95 → bottom under the plate. |
| **Dark material** | Body `0x4a5060`, emissive `0x201008` @ 0.5 — low contrast on slate + bloom. |
| **Y reset fight** | Level stamped `y = 2.2` once; AI overwrote to 1.2 every frame. |
| **Weak-point only dims** | `canHit`/`shielded` gate damage, not visibility — burial + darkness hid the mesh. |

### Fix (applied)

- `hoverY` default **2.95**; bob/charge/slump orbit that height only.
- Brighter body + stronger emissive; weak point always at least dimly lit.
- Phase-3 splits ride hover height and stay visible.
- Beat-04 spawn no longer stamps a conflicting one-shot Y.

### Animation / readability follow-ups

- Charge line telegraph stays high-contrast orange.
- Optional later: dash trail ribbon for motion continuity.
- Humanoid ActorAnimator work does not replace Core height discipline.

---

## 22. Related locomotion note (steps)

Platforms were intended to climb via `getVoxelAt` step-up; that logic was missing and 1-high `build()` columns were infinite XZ walls. Fixed in `voxel-physics-body.js` + `level-builder.js`. Animation work must not reintroduce infinite solids for walkable steps.

---


---

## 23. Beat 07 Hydroid Cloud — missing Phase 2 (Sluice of Tears)

### Report

Dungeon 7 boss HUD listed a second phase, but combat never felt like it entered one.

### Code diagnosis

| Item | Detail |
|---|---|
| Thresholds | `phaseThresholds: [0.4]` → `maxPhase = 2` (HUD `PHASE 1/2`) |
| Transition | BossBase `_checkPhase` **does** advance at ≤40% HP remaining |
| Why players missed it | **No `onPhaseChange`**. Phase 2 only shaved windup/cooldown by ~0.15s and nudged move speed — same pulse, same 12 orbs, same silhouette |
| Not a dead phase counter | Unlike a stuck `phase === 1` bug, the integer advanced; the **behaviour** did not |

### Fix (applied)

- `onPhaseChange(2)`: grow swarm 12→20 orbs, hotter cyan materials, contact damage 2, larger hit/contact radii
- Phase-2 `storm_pulse`: larger telegraph (4.2), 2 damage burst, **rain volley** of falling orbs
- Faster spin/spread so the cloud reads denser after the transition
- Unit coverage in `tests/game/bosses.spec.mjs` (phase 2 + orb growth + contact dmg)
- Beat-07 load story notes the storm half

### Rule for future bosses

If the HUD shows `PHASE n/m` with `m > 1`, **each threshold must change readable behaviour** (spawn, pattern, silhouette, or telegraph). Cooldown-only phase bumps are treated as bugs.

---

## 24. Beat 07 post-boss gap softlock (Sluice of Tears)

### Report

After defeating Hydroid Cloud there was no reliable way back across the weeping-hall chasm to the floodgate exit.

### Root causes

| Cause | Detail |
|---|---|
| **One-way peg** | Gap only had a south copper post. Return from the north door is ~13u to that post; base grapple reach is ~10. |
| **Post solids** | Anchor posts registered as XZ walls (`maxY ≥ 2`) and blocked rim landing / walk-off. |
| **No floor fill** | Even after a clear flag, the carved chasm had no runtime voxels in `getVoxelAt`, so any “bridge” was visual-only and feet fell through. |

### Fix (applied)

- `grapple_gap` supports `reverseAnchor` (auto-mirrors when omitted); posts are **visual-only** (no collisionWorld solids).
- Cleared gaps (`keyStore` `blocker:<id>`) spawn a basalt floor bridge registered via `level.addVoxelQuery` so physics stands on it.
- Beat-07 hall gap: dual rim pegs; Hydroid `onDefeat` opens `blocker:b07-hall-gap` and toasts the channel seal.
- Live QA: `tests/qa/b07-post-boss-gap.mjs` — open gap → bridge voxels → walk north→south without fall damage.

### Rule

Boss-routed exits that cross a `grapple_gap` must either (a) keep **both** rims in base grapple reach, or (b) **clear the blocker and physics-register a bridge** on defeat. Grapple-only return from >reach is a softlock.

---

## 25. Independent verification update, 2026-07-20

### Animation plan

Still open. No `src/game/characters/actor-rig.js`,
`actor-animator.js`, pose library, or animation test exists. The generated
`tests/qa/out/anim-statue-verify.json` confirms the player root translates and
yaws while all sampled limb rotations remain unchanged during movement and
attack. Acceptance criteria 10.1 remain unchecked.

### Presentation claim in section 20

The post values were changed as documented, but the result does not pass the
project's own visual gate. The 2026-07-20 complete test run measured these
Abyss levels below the required 35-75 luminance band:

| Level | Measured luminance |
|---|---:|
| beat-06-quarry | 16.1 |
| beat-07-sluice | 9.7 |
| beat-08-bone | 11.2 |
| beat-09-town | 9.6 |
| beat-10-cryo | 18.9 |
| beat-11-mire | 15.2 |
| beat-12-pyre | 10.6 |
| beat-13-gumoi | 25.8 |
| beat-14-leviathan | 20.6 |

Accordingly, "Real presentation bugs (fixed in-tree)" means the conflicting
writers and extreme preset values were changed. It does **not** mean combat
readability is certified. Abyss presentation remains open.

Quality and mood are also still call-order dependent. `mood.apply()` caps the
active preset against the quality tier, but a later `setQuality()` writes the
tier's raw bloom strength without reapplying the mood cap. For example, an
Abyss scene capped to 0.7 becomes 0.9 after selecting High. The standing rule
that mood and quality compose deterministically is not yet met.

### Kinetic Core and Hydroid

- Kinetic Core height and material code match section 21. The full suite did
  not report a boss scale or grounding failure, but no focused live visibility
  capture was added after the change. Treat the fix as implemented, awaiting
  visual certification.
- Hydroid's phase-two swarm growth and contact damage are covered by passing
  unit assertions. The changed storm pattern is implemented. No dedicated
  screenshot or behavior timing gate proves its visual readability.

### Beat 07 post-boss gap

The dedicated QA artifact reports a bridged gap, dual pegs, and a successful
north-to-south physics walk with no damage. That supports the section 24 fix.
However, the registered `world-e2e` suite still asserts that an anchor post is
a planar collision solid. The implementation deliberately made posts
visual-only to prevent rim blocking, so that assertion now fails. Update the
test contract and register the post-boss bridge scenario in the main runner.

### Current verification truth

- Unit suite: **669/669 passed**.
- Complete suite: **1257/1267 passed**, overall failure.
- Open failures: nine Abyss luminance checks and one stale grapple-post
  collision assertion.

---

*Living document — update when playtests surface motion or readability issues.*
