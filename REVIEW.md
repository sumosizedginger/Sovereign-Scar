# Reviewing Sovereign Scar

`HANDOFF.md` is written for someone **continuing** this work. This file is for
someone **judging** it — a reviewer who did not write any of it and has an hour,
not a week.

It is deliberately unflattering. The weaknesses are listed by the person who
built it, because a review that has to rediscover them from scratch is a review
that spends its hour on the wrong things.

---

## 1. What it is, in four lines

A 14-beat Zelda-like 3D voxel action-adventure. Plain ES modules, **no build
step, no bundler, no transpiler**, three.js r185 vendored under `lib/` so it runs
offline. Runs in a browser, and in an Electron shell that serves the same files
over loopback.

```bash
npm i
npm run serve          # http://127.0.0.1:8799/
npm test               # everything (needs Chrome)
npm run test:unit      # pure-node half, no browser
```

## 2. What is actually under review

| tree | lines | status |
|---|---|---|
| `src/game/` | ~36k across 129 files | **the product — review this** |
| `tests/` | ~33k | the case for it — review this second |
| `scripts/`, `electron/` | small | tooling and desktop shell |
| `src/engine/`, `src/voxel/`, `src/combat/`, `src/characters/`, `src/audio/`, `lib/` | — | **frozen vendored kit (My-Engine 0.2.0). Not written here, not under review.** |

`docs/ARCHITECTURE.md` is the map. Read it before `src/`.

## 3. Verifying the claims rather than believing them

Nothing below asks you to take a number on trust:

```bash
npm test                                   # the headline count
node tests/qa/content-density.mjs          # how much game there is
node tests/qa/difficulty-curve.mjs         # whether the curve is real
git status --short                         # must be empty after a full run
```

That last one matters more than it looks. For most of this project's life a full
test run **modified a committed PNG**, so `git status` was never clean and
nobody could tell test output from real edits. It is clean now, and it should
stay clean — if a run dirties the tree, that is a finding.

## 4. What I would flag if I were reviewing this

In rough order of how much they should worry you.

**4.1 Most of the game has never been played.** This is the real risk and
everything else is a footnote to it. Phases B–G — fourteen boss kits, an
encounter director, forty puzzle beats, terracing, three settlements — landed
*at once*, behind the suite and some headless probes and nothing else. Every
genuinely important defect in this project's history was found by **playing**,
not by the suite: the one recorded playthrough turned three reported symptoms
into nine defects, two of them hard softlocks, over a suite that was 4343 green
at the time. Treat any claim of the form "the tests pass" accordingly.

> **2026-08-13 makes the point again, harder.** A single session of the owner
> actually playing 04 Sky Monument produced six defects, **none of which any
> assertion could see**, over a suite that was green throughout:
>
> - a boss two rooms away audible at full volume, from world z −256
> - blocking a mote — the documented correct answer — playing the *wound* sound
> - the grapple picking the peg you were standing beside over the one across the gap
> - the grapple's collision sweep running **backwards** on its first frame, so the
>   pull cancelled whenever the player had their back to a wall — anywhere in the
>   game, and invisible because only one of the two directions is ever obstructed
> - one `Enter` both closing the pause menu and eating a line of dialogue
> - **two dungeons in which no fight was mandatory at all**, walkable start to boss
>
> Five of the six began with the owner's own words before anyone looked at code
> — the sixth, the menu swallowing an `Enter`, was found only while fixing
> another. In two cases my first diagnosis from reading the source was WRONG and
> was killed by their next sentence. The suite's role here was real but
> secondary: it caught the softlock my fix for the last one would have shipped,
> and it caught a behaviour combination that fix quietly deleted.

**4.2 Suite size is not coverage, and this repo has the receipt.** When twenty
shipped fixes were each reverted one at a time, **six could be deleted with
4426 assertions still green.** That audit is HANDOFF trap 23 and it is the
single most useful thing in that file. A large green number here means less than
it does in most repos, which is exactly why every fix now has to be broken on
purpose before it counts.

**4.3 No type checking, no linter, no formatter.** 36k lines of plain
JavaScript with zero static analysis. There is no `tsconfig`, no `eslint`, no
`prettier`, and no `jsconfig`. Every error class those tools catch is caught
here by a runtime test or not at all. This is the most obvious thing a reviewer
will want to change and it is a fair criticism.

**4.4 The test harness is homegrown and shares one process.** Specs are
`export function run(t)` with `t.ok(...)`, all in one Node process, no
isolation, no per-spec teardown. That is not theoretical: three specs installed
a fake global `document` and never removed it, which silently defeated
`typeof document === 'undefined'` guards in *production* code for every spec
that ran afterwards. Fixed, but the architecture that allowed it is unchanged.

**4.5 CI runs half the suite.** `.github/workflows/test.yml` runs
`npm run test:unit` only. The browser half is local-only because GitHub's
runners have no GPU and software WebGL proved unreliable. That half is the half
that has historically caught the real bugs, so **CI green is a weak signal
here.** The reasoning is in the workflow file; the consequence is that a PR can
be green and broken.

**4.6 The QA probes print, they do not gate.** `tests/qa/*.mjs` (51 of them)
measure things like difficulty curve, time-to-kill, luminance and content
density, and they are **print-only** — nothing fails when a number goes bad. They
are instruments, not alarms, and a reviewer should not read them as coverage.
They have also been wrong: four of them were repaired in the last two sessions
after publishing confidently incorrect numbers for months.

**4.7 One contributor, no review history.** Nothing in this repo has been read
by a second engineer before now. That is the reason this file exists.

**4.8 The installer is unsigned.** Windows shows "unknown publisher". A
certificate costs money, not effort, and nothing in the repo can substitute.

**4.9 Presentation, not correctness, is the remaining gap.** Ranked with method
and cost in `docs/ROAD-TO-AAA.md` and `docs/HOW-TO-CLOSE-THE-GAP.md`. The
headline item is that almost nothing in the world moves unless the player moves
it.

## 5. The shapes of bug this project actually produces

`HANDOFF.md` ends with **36 traps**, each one a real defect that shipped behind
a green suite. They are worth skimming even if you review nothing else, because
they are not generic advice — they are this codebase's specific recurring
failures. The pattern behind most of them:

- **A test that models the code instead of reading the world.** A spec compared
  a telegraph's drawn size against a recomputation of the same arithmetic — two
  copies of one formula agreeing with each other.
- **A fixture built from the fixed case rather than the broken one.** It passes
  with the fix reverted.
- **An alarm wired to one end of a wire.** The producer is asserted, the
  consumer is not, and deleting the consumer stays green.
- **One place swept instead of every place.** The most expensive recurring bug
  here: the thing being measured is reliably the one place that was already fine.
- **A guard written for a world that has since changed** — an anti-burial check
  that assumed a floor height that no longer held, so it passed everything and
  prevented nothing.
- **Counting cells instead of measuring clearance.** Four probes called a route
  clean because a cell was free; a body did not fit through it.

If you are looking for a bug in an hour, look for one of those.

## 6. Where an hour is best spent

1. `docs/ARCHITECTURE.md`, then `src/game/world/` — the room graph, keys and
   blockers are where a softlock would live.
2. HANDOFF traps 23–36 — the recent, unfixed-class ones.
3. Pick any one spec in `tests/game/` and ask *"what would I have to break for
   this to fail?"* If the answer is "nothing", that is a finding, and it has
   been the right answer here before.
4. Run the game and walk into things. It remains the highest-yield activity
   available, and Section 4.1 is why.

## 7. What is deliberately not here

No multiplayer, no controller remapping UI, no localisation, no analytics, no
accessibility audit, no save-file encryption or anti-cheat. None were scoped.
