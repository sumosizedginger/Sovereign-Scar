# Handoff

Written 2026-07-22 for whoever picks this up next. Read this before touching
anything; the traps at the bottom have each already cost this project real time.

## What this is

**Sovereign Scar** — a 14-beat Zelda-like 3D WebGL voxel labyrinth on My-Engine
0.2.0 (pinned SHA in `ENGINE_PIN.md`). Zero-build, offline-first, three.js r185,
no bundler. Version `0.3.0`.

```bash
npm run serve          # http://127.0.0.1:8799/
npm test               # unit + browser E2E
npm run test:unit      # unit only — fast, no browser
```

The suite is the contract. It is large on purpose and most of it encodes a
lesson rather than a behaviour; if something fails, read the comment above the
assertion before changing it.

## State

Everything below is committed and green. Suite: **1927 unit** + browser E2E.

| area | state |
|---|---|
| Overworld, 14 dungeons, 14 bosses, items, saves | built |
| Combat: guard / parry / lock-on / 7-enemy bestiary | built |
| Difficulty curve (`world/threat-curve.js`) | built, measured |
| Generated score, no drone | built, proved by offline render |
| **Melee swing direction + weapon mount** | **fixed this session** |
| **Bulwark Shield as a gated pickup** | **built this session** |
| **Controls unified into one table** | **built this session** |
| Renderer / lighting overhaul | **specced, NOT implemented** |
| 44 binary certification captures | **stale** — regenerate after visual work |

## What to do next

**`docs/VISUAL_PLAN.md` is the next body of work**, written as six ordered,
self-contained tickets with target values, acceptance tests and rollback notes.
It is meant to be picked up cold.

Take them **in order**. Ticket 1 (contrast floor on the luminance gate) must
land first — until it does, tickets 4 and 5 are literally illegal, because the
current gate measures *mean* luminance and the cheapest way to pass it is to
flatten the room. Tickets 1–3 are safe and additive. **Tickets 4 and 5 change
how every existing room looks and need the owner to see them before they are
accepted** — the owner said so explicitly.

Smaller things that are known-open:

- The 44 certification captures are stale and must be regenerated after tickets
  4 and 5 (`CERTIFICATION.md` has the procedure; `H` hides HUD chrome).
- The gamepad legend in `ui/hud.js` is still hand-written. The keyboard sheet
  now generates from `CONTROLS` in `src/game/input.js`; the pad one should too,
  it just needs a `pad:` field per binding.
- `src/engine/lights.js: updateShadowFollow` is dead code that cannot do its job
  (single-axis, a 2.5D leftover). Ticket 4 explains why; delete it or leave it,
  but do not try to use it.

## How the owner works

- They want the *reasoning*, not just the result. Comments in this codebase
  explain **why**, including what was wrong before — keep that. Several
  bugs this session were found by reading a comment that no longer matched the
  code.
- They ask for measurements, not assertions. "It looks better" is not an answer;
  `tests/qa/*.mjs` are print-only probes that exist to produce the numbers.
- Report failures plainly. If something is unfinished, say so.

## Traps

Each of these produced a green suite that was lying.

**1. Assert directions in world space, never as the sign of an angle.**
`tests/game/actor-anim.spec.mjs` used to assert `armR.rotation.x < -1.2` for
"windup raises the arm". That is satisfied *equally well* by a hero who winds up
in front of their own face and strikes behind their back — which is exactly what
the game shipped, on every melee weapon, until the owner noticed in a
screenshot. A radian has no opinion about which way an actor is facing. If an
assertion claims a direction, it must yaw the actor and measure a world
position. `tests/qa/swing-readout.mjs` prints the numbers.

**2. A truncated render is perfect silence.**
`tests/audio-render-e2e.spec.mjs` renders the score offline and requires the
quiet windows to fall near zero. An `OfflineAudioContext` render started before
the page has ever had a live `AudioContext` comes back truncated — and five
seconds of digital silence scores a *flawless* 5th percentile. The spec now
asserts the render reaches its intended end **before** trusting any percentile,
and waits on `window.__sovereignScar.player` first. Any statistic over a buffer
must first prove the buffer is complete.

**3. Mean luminance cannot tell "well lit" from "flat".**
A room with a strong key and deep shadows meters *lower* than the same room
under a flat wash, so the cheapest way to pass the certification gate has always
been to flatten the art. That is how ambient reached 1.7 against a key of 1.9,
and why Beat 01's tomb has decorative gold-leaf seams. Ticket 1 fixes the gate;
do not tune lighting against the current one.

**4. Deleting the call is not deleting the feature.**
When the mood drone was removed, the `drone:` field stayed in `MOOD_PRESETS` —
so the next reader would reasonably conclude it was meant to be playing and wire
it back up. Remove the data too, and add the spec that fails if it returns.

**5. `three.js` euler order is `Rx·Rz·v` for `'XYZ'`.**
Relevant every time you touch `pose-library.js`. The arm hangs along `−Y` from
its shoulder pivot, so arm direction is
`(sin rz, −cos rz·cos rx, −cos rz·sin rx)`. Rig-local **`+Z` is forward**,
because `player.js` sets `rig.rotation.y = atan2(fv.x, fv.z)`. The arm therefore
points forward only when `rx` is **negative**, and only `rz` carries lateral
motion — a swing with `rz = 0` is a vertical chop and cannot read as an arc.

## Map

```
src/game/
  world/        room graph, keys, blockers, level builder, threat curve
  overworld/    7×7 world + screens
  audio/        score engine (theory, instruments, tracks) + sfx bank
  combat/       sweeper, weapons, grapple, guard/parry, lock-on
  characters/   actor rigs (named pivots incl. hand/handL), animator, poses
  bosses/       framework + 14 bosses
  levels/       overworld + sandbox + 14 dungeon defs + dungeon kits
  render/       material families, prewarm, surface detail
  fx/           mood controller, held weapon/shield, smears, ropes
  ui/           HUD, story, menus, map, ending, coach hints
tests/          unit + browser E2E
tests/qa/       PRINT-ONLY probes: swing, audio envelope, score, luminance,
                time-to-kill, difficulty curve
docs/           ARCHITECTURE, CONTROLS, API, VISUAL_PLAN
```

Key documents: `CHANGELOG.md` (why things are the way they are — read the
Unreleased section), `Key.md` (design reference), `ZeldaLevel.md` (per-dungeon
audits), `docs/ARCHITECTURE.md`, `BUILD_LOG.md`.
