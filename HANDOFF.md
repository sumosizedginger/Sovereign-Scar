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

Everything below is committed and green. Suite: **2136 unit / 2898 total**.

| area | state |
|---|---|
| Overworld, 14 dungeons, 14 bosses, items, saves | built |
| Combat: guard / parry / lock-on / 7-enemy bestiary | built |
| Difficulty curve (`world/threat-curve.js`) | built, measured |
| Generated score, no drone | built, proved by offline render |
| Melee swing direction + weapon mount | fixed |
| Bulwark Shield as a gated pickup | built |
| Controls unified into one table | built |
| **Renderer / lighting: all six VISUAL_PLAN tickets** | **implemented** |
| Ticket 6's vertical interest inside rooms | **not done — needs design, see below** |
| 44 binary certification captures | **regenerated** (`tests/qa/certification-captures.mjs`) |
| Boss-room luminance | **measured, not gated** — see below |

## What to do next

**Two open questions that need a person, not an implementer:**

1. **Should boss rooms be held to the entry-room band?** Boss rooms have never
   been measured by the gate, and sampling them found four of fourteen outside
   their band (`spurpit` 98.8 vs a ceiling of 90; `prayerhollow` 79.7,
   `twincage` 92.4, `golemwallow` 94.1 vs 75). It is not gated because the
   numbers move 20+ points between runs — the boss's emissive pulses — and
   because the bands were calibrated on *empty* entry rooms. An arena containing
   a deliberately glowing boss may legitimately belong above that ceiling. Do
   not settle it by loosening the number. `node tests/qa/contrast-probe.mjs`
   prints the figures.
2. **Is the Abyss band still right?** `[35,75]` was set when the mood was flat
   (ambient 3.4 against a key of 2.1). The lighting has changed underneath it,
   so the target was chosen by the model that has since been replaced. Look at a
   Crust and an Abyss room side by side.

Then, if you want to keep going on looks, **ticket 6 of `docs/VISUAL_PLAN.md` is
the only one not finished**. It delivered bake-time silhouette trim and per-kit
weathering; **vertical interest inside rooms** is what remains, and it is the
item worth a designer rather than an implementer.

Understand why before you start. Both things that landed are safe to apply to
all fifteen levels in one pass *because of a structural argument*, not because
they were tested carefully: the trim only adds geometry **above the wall top**
and only on the **room perimeter**, which is provably nowhere the player can
stand; the weathering is **colour only**, so the cell set is byte-identical
before and after. Each has a spec that checks the argument rather than the
output. **Vertical interest can make neither claim** — changing floor heights
changes where the player can walk, so it needs per-level design and a traversal
re-audit. Do not try to do it globally.

Smaller things that are known-open:

- `src/engine/lights.js: updateShadowFollow` is a trap, not a tool — see Trap 6.

**7. One list left un-generated is one list free to be wrong.**
The keyboard cheat sheet was unified into `CONTROLS` and the **gamepad** legend
was left hand-written in `ui/hud.js` — and it had already drifted, labelling
D-up as "mood" when the button does mirror travel. Both sheets and both doc
tables now generate from the same entries, and `controls.spec.mjs` reads BOTH
handlers (`_onKeyDown` and `pollGamepad`) and checks coverage in both
directions. If you add a fourth surface — a remap screen, a touch overlay —
generate it from the table too, or it will be wrong within a session.

## Measuring before changing

`tests/qa/*.mjs` are **print-only probes**. They exist because this project has
repeatedly been wrong about its own numbers, and they are how each of the
lighting tickets was sized. Run the relevant one before and after any visual
change:

```bash
node tests/qa/contrast-probe.mjs   # mean + centre-crop contrast, all 16 levels
node tests/qa/shadow-census.mjs    # who casts, who receives, who is exempt
node tests/qa/env-probe.mjs        # is the environment map actually installed
node tests/qa/trim-cost.mjs        # triangles + draw calls, trim on vs off
node tests/qa/swing-readout.mjs    # blade tip world position through a strike
node tests/qa/certification-captures.mjs   # re-shoot the 44 cert images
```

After a capture run, `md5sum docs/media/certification/ow-*.png | sort -u | wc -l`
must be 16. The first run produced sixteen identical pictures of one screen
filed under eight region names, because `createOverworld` only honours a saved
position when `pos.world === levelId` and the script had omitted `world`.

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
under a flat wash, so the cheapest way to pass the certification gate was to
flatten the art. That is how ambient reached 1.7 against a key of 1.9 (and 3.4
in the Abyss), and why Beat 01's tomb has decorative gold-leaf seams. The gate
now bands contrast as well — but note the second half of the lesson: the
statistic has to be measured somewhere the answer actually lives. Measured over
the **full frame**, `p90 − p10` is dominated by the vignette crushing the
corners, reads 58–160 across the campaign, and would pass any floor worth
setting. On a **centre crop** the same statistic reads 14–166 and discriminates.
A new metric is not automatically a better one; check what it responds to.

**4. Deleting the call is not deleting the feature.**
When the mood drone was removed, the `drone:` field stayed in `MOOD_PRESETS` —
so the next reader would reasonably conclude it was meant to be playing and wire
it back up. Remove the data too, and add the spec that fails if it returns.

**5. The place being measured is the one place that is fine.**
This project's most expensive recurring bug, and it has now happened three
times:

- The sun's shadow frustum sat on the world origin and never moved, so exactly
  one room per dungeon had sun shadows — and every dungeon starts at grid (0,0),
  so it was always the first room you saw. The overworld was worse: **0 of 49
  screens**, at world coordinates 512–896, never counted by anything.
- The luminance gate samples the room a level **loads into**. Boss rooms — half
  the campaign's most-looked-at rooms — had never been measured at all, and four
  of fourteen turned out to be outside their band.
- The gate samples the overworld on its **start screen in its default state**.
  That screen is one of the pale crust ones, so the Spindle sitting at 32
  against a floor of 45, and every Abyss screen sitting at 18–27 against a floor
  of 35, were invisible for the life of the project.

Whenever you check a property that varies by place, sweep **every** place. A
spot check lands on the sample that was chosen because it was convenient, and
convenient usually means representative of nothing.
`tests/shadow-frustum-e2e.spec.mjs` is the shape to copy; reverting that fix
fails 31 of its 50 assertions.

**6. `src/engine/lights.js: updateShadowFollow` is bait.**
It looks exactly like the fix for trap 5 and it is not: it takes a single
`cameraX` and pins the target's Z to zero, a leftover from the engine's 2.5D
side-scroller origins. Wiring it up fixes one axis and silently breaks the other.
Locked Decision **D5** in `ENGINE_PIN.md` forbids editing engine code, so it
cannot be deleted — `tests/shadow-frustum-e2e.spec.mjs` fails if game code
imports it. Aim the sun from game code (`MoodController.aimKeyLight`).

**7. `three.js` euler order is `Rx·Rz·v` for `'XYZ'`.**
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
  render/       material families, prewarm, surface detail, shadow roles,
                frame-luminance stats, procedural mood environment (PMREM)
  fx/           mood controller, held weapon/shield, contact shadows, smears
  ui/           HUD, story, menus, map, ending, coach hints
tests/          unit + browser E2E
tests/qa/       PRINT-ONLY probes: swing, audio envelope, score, luminance,
                time-to-kill, difficulty curve
docs/           ARCHITECTURE, CONTROLS, API, VISUAL_PLAN
```

Key documents: `CHANGELOG.md` (why things are the way they are — read the
Unreleased section), `Key.md` (design reference), `ZeldaLevel.md` (per-dungeon
audits), `docs/ARCHITECTURE.md`, `BUILD_LOG.md`.
