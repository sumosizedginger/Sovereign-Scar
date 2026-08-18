# `tests/qa/` — instruments, not alarms

Nothing in this directory fails a build. These are **print-only probes**: they
measure something and put a number on stdout. `REVIEW.md` §4.6 says so, and it
matters, because a reviewer who counts these as coverage will over-credit the
suite by a lot.

They also have a track record of being wrong. Several published confidently
incorrect numbers for months. The lesson this project keeps re-learning is
that **a measuring instrument is code, and code has bugs** — with the extra
hazard that a broken instrument reports success rather than failing.

---

## Three tiers, and only one of them is evidence

### 1. Maintained instruments

The probes cited by name from `HANDOFF.md`. These are kept in step with the code
and are the ones to run when you want a number:

`content-density` · `difficulty-curve` · `time-to-kill` · `entry-safety` ·
`swing-readout` · `smear-vs-hitbox` · `silhouette-contrast` · `contrast-probe` ·
`boss-silhouette` · `shadow-census` · `stereo-field` · `audio-envelope` ·
`score-readout` · `env-probe` · `puzzle-solve` · `room-map` · `trim-cost` ·
`certification-captures` · `armor-flank-reach` · `ambient-motion` · `wall-climb` ·
`dash-travel` · `light-line-look`

### 2. Working probes, not yet cited

Everything else without a leading `_` and without the UNMAINTAINED banner. Fine
to run, fine to trust for the afternoon you run them in.

Three added 2026-08-18, all of which changed a decision rather than confirming
one — which is the only reason a probe is worth writing:

- **`arena-frame`** — how much of a fight is on screen. It was written to pick
  how far the arena camera should push IN and reported that the plan was
  backwards: the frame is 13 world units deep against arenas 17 to 23 across,
  and a lancer (7), a censer (9) and a weaver (11) all attack from outside it.
  Prints hero pixels beside frame reach, because they are the same knob.
- **`hero-scale`** — what making the hero bigger would cost. Hero height ×
  frame depth is constant at 1206 across every fov and distance. Pitch is the
  one lever that is not a straight trade and it is a cliff: occlusion is ~1%
  from 78° down to 66° and **8.29% at 60°**.
- **`overworld-lum`** — the sixteen overworld certification samples (one screen
  per region × both mirror states) against `visual-sanity`'s own bands, in two
  minutes instead of a twenty-minute suite run. Written because the relief pass
  put pyre's Abyss state 4.5 points under the floor and iterating on that
  against the full suite would have cost hours.
- **`overworld-shots`** — before/after pairs of overworld screens, into
  `docs/media/overworld/<label>/`. It corrected the claim it was built to
  illustrate: "the overworld is flat" came from a probe that samples the START
  screen, and three of the four screens shot already had spreads of 97 to 136.

### 3. Unmaintained one-off investigation harnesses — **do not cite**

Nine files carry a banner saying so at the top:

`independent-e2e` · `independent-key-order-qa` ·
`independent-playtest-graphics-qa` · `independent-runtime-deep` ·
`reverify-prior-bugs` · `recheck-spawn-ground` · `recheck3` · `recheck4-final` ·
`strict-independent-qa`

They are kept as a record of investigations that happened. They are not
instruments and their output is not evidence. Files prefixed with `_` are the
same thing and are `.gitignore`d.

---

## What the audit found in tier 3

These are recorded because the failure *shapes* are worth knowing, not to
re-litigate the investigations they came from.

**A probe that manufactured the evidence it was reporting.**
`independent-e2e.mjs` tries to damage an enemy through the real attack path; if
that produces nothing it falls through to `target.hp -= 2; manualHit = true`,
and the assertion beneath it passes on `hpAfter < hpBefore || manualHit`. So the
probe subtracts the hit points itself and then reports that combat works. This
is the purest form of the failure this directory is prone to: a fallback added
to stop a probe being noisy, which converts it into a probe that cannot fail.

**Four probes that only run on one machine.** `independent-runtime-deep`,
`independent-playtest-graphics-qa`, `reverify-prior-bugs` and
`strict-independent-qa` write their reports to a hardcoded `D:\tmp\…`. On any
other computer they crash on the first `mkdirSync`. Nothing had noticed, which
is itself the finding — nobody had run them anywhere else.

**A probe measuring a different three.js from the one the game uses.**
`independent-runtime-deep` imports three from
`/node_modules/three/build/three.module.js` in three places. The game imports
the *vendored* build at `lib/three/three.module.min.js` via the import map.
They are pinned to the same version today, which is exactly why this would
survive the day they stop being.

**A scene walk with an empty callback.** The same file opened its shadow probe
with `s.scene?.traverse?.(() => {})` — a full walk of the scene graph doing
nothing — beside two variables nothing ever wrote. Removed.

**A helper full of guesses about an API that does not exist.**
`independent-playtest-graphics-qa` carried a `loadLevel` that tried
`s.loadLevel`, then `s.goToLevel`, then `s.dev.loadLevel`, then `s.setLevel`.
Nothing called it. A fallback chain like that is how a probe ends up silently
exercising a code path the game does not have.

**A constant whose comment described work the probe stopped doing.**
`entry-safety.mjs` — a maintained tier-1 probe — kept a private copy of
room-graph's `SIDE_NORMAL` under a comment warning that the two must never
disagree, long after the probe had been rewritten to ask `level.arrivalPoint`
for the real answer. The constant was dead; the warning described a calculation
that no longer happened. Both removed. **This one is the important find**,
because it was in the maintained tier.

Every one of the above was surfaced by `npm run lint` — `no-unused-vars` and
`no-constant-condition` on a directory nobody had statically analysed before.

---

## Writing a probe that can be believed

The rules are the ones the traps in `HANDOFF.md` were paid for:

- **Drive the shipped code path.** If the probe reimplements the thing it is
  measuring, it only proves the probe agrees with itself.
- **Derive inputs from the subject at runtime.** Never type a radius, a speed or
  a reach that describes another module — read it, or assert it matches.
- **No fallbacks that fabricate.** If the real path produces nothing, the answer
  is "nothing", not a substitute number. A probe that cannot report failure is
  not a probe.
- **Make the fixture reproduce the defect.** If it passes with the fix reverted,
  it is measuring the wrong thing.
- **Write output relative to the repo**, not to an absolute path on your disk.
- **Prove skipped setup cannot look like success.** A missing browser must be
  loud; `harness.mjs`'s `skip()` exists because "chrome available (skipped)"
  used to be recorded as a *passing* assertion.
