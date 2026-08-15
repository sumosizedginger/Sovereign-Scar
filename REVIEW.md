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
offline. It ships two ways from one source tree: a GitHub Pages deployment
served over HTTPS from `/Sovereign-Scar/`, and an Electron shell that serves the
identical files over loopback in a window.

```bash
npm i
npm run serve          # http://127.0.0.1:8799/
npm run check          # lint + typecheck + unit suite
npm test               # everything, incl. browser E2E (needs Chrome)
```

## 2. What is actually under review

| tree | status |
|---|---|
| `src/game/` | **the product — review this.** ~130 files, tens of thousands of lines |
| `tests/` | the case for it — review this second, and read §4.2 first |
| `scripts/`, `electron/`, `.github/workflows/` | tooling, desktop shell, deployment |
| `src/engine/`, `src/voxel/`, `src/combat/`, `src/characters/`, `src/audio/`, `lib/` | **frozen vendored kit (My-Engine 0.2.0). Not written here, not under review.** |

`docs/ARCHITECTURE.md` is the map. Read it before `src/`. It now also carries
the decomposition audit of the two large files (§"The two large files") and the
dual-runtime rules.

## 3. Verifying the claims rather than believing them

Nothing below asks you to take a number on trust:

```bash
npm run lint                               # static analysis, seconds
npm run typecheck                          # the checked trees, seconds
npm test                                   # the headline count
npm run pages                              # build + validate the browser artifact
node tests/qa/content-density.mjs          # how much game there is
node tests/qa/difficulty-curve.mjs         # whether the curve is real
git status --short                         # must be empty after a full run
```

**No assertion count is written down in this repository's current-facing docs
any more**, because every one of them was false within a session or two of being
written. `npm test` prints the only figure that is true right now. Numbers
attached to past events — the twenty-fix revert audit below, HANDOFF's traps —
are left exactly as they were, because they are history and history should stay
true to when it was written.

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

> **The same day, a second session produced six more — and two of them had
> already been "fixed".** All six were invisible to a suite that stayed green
> throughout, and the two repeats are the ones a reviewer should care about:
>
> - **The Obsidian Arachnid, third occurrence of one sentence.** Twice fixed
>   before, at two different causes. The real one was that its armoured front
>   tracked the player faster than the player could circle it, so the only
>   radius that ever landed a blow was inside its own legs. `boss-facing.spec.mjs`
>   owns that exact rule, and was green because it asked at radii 1.5, 2 and 3
>   against a default-sized boss — every one of them inside a body scaled 1.70.
>   It also raced against a player speed of 6.0 when the player has been 5.5 for
>   the life of the file, in the direction that hides the bug.
> - **Wall climbing, second occurrence.** The first report — "the player is
>   constantly trying to climb up the walls" — was read as a *legibility*
>   problem, and `traversal-legibility.spec.mjs` was written to mark which rises
>   are stairs. Its header opens by asserting the physics as settled ground:
>   "the physics body steps up exactly one voxel". It did not. A body gained
>   seven cells in seven frames up a flat wall, so the investigation was built
>   on top of the bug it was investigating. The guard that should have caught
>   the physics was named "no phantom climb" and was structurally incapable of
>   seeing one — its own comment reads "simulate with XZ solid only + no
>   voxels", and the climb code reads voxels.
> - The other four: a weapon filter that announced itself from anywhere in the
>   dungeon because it checked the weapon before the location; a dash whose
>   speed was thrown at an impulse the physics body overwrote on the next tick,
>   and which was steered by live stick input so a *tapped* dash covered nothing;
>   a 110° sword arc drawn by a move with no hitbox; and an advertised mechanic
>   — the Light Caster's standing line — whose hit test was written, correct,
>   and called by nothing.
>
> **The lesson a reviewer should take is about the shape, not the count.** Three
> of the six were guarded by a spec that named the exact rule and tested it
> somewhere the rule could not fail. A confident, wrong conclusion written into
> a comment (§5) kept one of them alive across two reports. When judging this
> repo, "there is a test for that" is the beginning of the question.

**4.2 Suite size is not coverage, and this repo has the receipt.** When twenty
shipped fixes were each reverted one at a time, **six could be deleted with
4426 assertions still green.** That audit is HANDOFF trap 23 and it is the
single most useful thing in that file. A large green number here means less than
it does in most repos, which is exactly why every fix now has to be broken on
purpose before it counts.

**4.3 Static analysis exists now, and it covers less than the word implies.**
This section used to say there was none at all — no linter, no type checker, no
formatter — and that was true and fair. What is true now:

- **`npm run lint` covers the whole repository.** ESLint, correctness rules
  only: undefined identifiers, unreachable code, duplicate object keys and
  switch cases, constant conditions, self-comparison, dead private fields,
  unused variables and imports. **No formatting rules and no style rules at
  all**, deliberately — a repository-wide whitespace diff would bury the
  findings and ruin `git blame`. Every rule turned off is turned off with a
  written reason in `eslint.config.js`.
- **`npm run typecheck` covers four trees out of about twenty.** TypeScript's
  `checkJs` reads the existing JSDoc. Only `src/game/kernel/`, `world/`,
  `combat/` and `physics/` carry `// @ts-check` — the save schema, the key
  economy and room graph, the damage entry point, the body that decides where
  the player may stand. `index.js`, `player.js`, `enemy.js`, the boss roster and
  everything under `fx/`, `ui/`, `render/`, `assets/` and `levels/` get **no
  type analysis whatsoever**. Whole-repository checking reports around 250
  errors, almost all of them JSDoc that under-describes an options object;
  paying that down is worth doing and was not done here, because 250 sites in
  one commit is not reviewable and closing them with `any` would produce a
  checker that passes and proves nothing.
- **The boundary is data and it is guarded.** `tests/game/typecheck-boundary.spec.mjs`
  reads `tsconfig.json`, walks those four trees, and fails if a file has lost
  its pragma or if `checkJs` gets flipped on. Otherwise the boundary could
  shrink silently, one deleted comment at a time, with the checker still green.
- **There is still no formatter.** `.editorconfig` and "match the neighbours" is
  the whole of it.

The first run found four things worth having: an assertion in
`registry.spec.mjs` that was two constants compared to each other and could
never fail; a duplicate object key in a boss fixture where the getter silently
won; a collision condition reading `if (col.maxY - col.minY >= 0 || true)`; and
a cross-module contract (`juice.onImpact`) that was assigned in one file, called
in another, and declared in neither.

**4.4 The test harness is homegrown and shares one process.** Specs are
`export function run(t)` with `t.ok(...)`, all in one Node process, no module
isolation. That is not theoretical: three specs installed a fake global
`document` and never removed it, which silently defeated
`typeof document === 'undefined'` guards in *production* code for every spec
that ran afterwards.

**The architecture is unchanged — but the runner now catches the symptom.**
`runNamed` / `runNamedAsync` in `tests/run-all.mjs` fingerprint the shared
surface before each spec and compare after: global names, `process.env` keys, a
replaced `Math.random` / `Date.now` / `console.*` / `JSON.*`, a mutated
`Object.prototype` or `Array.prototype`. A spec that dirties any of them fails
**in its own name**, not in whichever spec trips over it later. A spec that
throws is now recorded as a failure and the run continues, instead of killing
`main()` and losing every result after it — which also closes a hole in this
project's counterfactual method, because a break that crashes a spec used to
grep as zero failures and read exactly like a pass. Both were proven by
deliberately breaking a spec's teardown and confirming red.

**What it still does not see: module-level singleton state.** The coach's spoken
set, the score engine's current track, saved progress. Those live inside
modules, not on any shared object, and no general fingerprint can reach them.
That gap is real and unaddressed.

**4.5 CI runs half the suite, and now says so out loud.**
`.github/workflows/test.yml` runs lint, the type boundary, `npm run test:unit`,
and a build-and-validate of the browser artifact. **The browser/WebGL half does
not run in CI** — hosted runners have no GPU and software WebGL proved
unreliable across several attempts — and that is the half that has historically
caught the real bugs here.

> **A green Actions run proves:** the pure-logic half of the game is
> self-consistent; no undefined identifiers or unreachable branches anywhere;
> the four checked trees type-check; and the deployable artifact builds, closes
> its import graph and contains no path that escapes `/Sovereign-Scar/`.
>
> **It does not prove:** that the game renders, that a dungeon loads, that a
> boss is beatable, that the score sounds like music, or that the deployed page
> boots. Those are `npm test` locally, and the last one is
> `tests/pages-smoke-e2e.spec.mjs`.

**4.6 The QA probes print, they do not gate.** `tests/qa/` holds around sixty
of them — difficulty curve, time-to-kill, luminance, content density,
armour-flank reach. Nothing fails when a number goes bad. They are instruments,
not alarms, and a reviewer should not read them as coverage.

They have also been wrong, repeatedly, and this pass found more.
`tests/qa/README.md` is the audit; the worst of it is a probe that damages an
enemy by hand when the real attack path produces nothing, and then reports that
combat works. Nine one-off investigation harnesses now carry a banner saying
they are unmaintained and must not be cited. One defect was in a *maintained*
probe: `entry-safety.mjs` kept a duplicated constant under a comment warning
that it must never drift, long after the probe had stopped using it.

**Two things were promoted from print-only to gates**, because their thresholds
are real invariants rather than tuning values: the Pages artifact validator
(graph closure, subpath containment, no development material published) and the
type-boundary check. **Nothing subjective was promoted** — the luminance and
contrast probes, content density, difficulty curve and the audio envelope all
stay print-only, because their numbers are judgements about a picture or a feel
and a hard failure on one would only teach whoever hit it to raise the
threshold.

**4.7 One contributor, no review history.** Nothing in this repo has been read
by a second engineer before now. That is the reason this file exists.

**4.8 The installer is unsigned.** Windows shows "unknown publisher". A
certificate costs money, not effort, and nothing in the repo can substitute.
`.github/workflows/release.yml` builds both executables on a version tag and
attaches them to a **draft** Release — draft rather than published because this
repository has no versioning policy: `package.json` says 0.3.0, nothing keeps it
in step with the tag, and nothing says what a version number means here. That is
an owner decision, not a workflow line.

**4.9 The licence is ambiguous and this pass did not resolve it.** `LICENSE` is
MIT with no carve-out, `package.json` says `MIT`, and `README.md` adds "Game
content © project authors" — which reserves nothing, because MIT already leaves
copyright with the author. A reader would reasonably conclude the narrative, the
fourteen dungeons and the score are MIT too. If that is the intent, one sentence
should change; if it is not, the split has to be defined in `LICENSE` by path
and `package.json` has to stop claiming MIT. `docs/LICENSING.md` sets out both
options and what each requires. **Nothing about the licence was changed** — it
alters what people may do with the work, and that is the owner's call. It
matters more now than it did last week, because the game is about to be
published at a URL.

**4.10 Presentation, not correctness, is the remaining gap.** Ranked with method
and cost in `docs/ROAD-TO-AAA.md` and `docs/HOW-TO-CLOSE-THE-GAP.md`. The
headline item is that almost nothing in the world moves unless the player moves
it.

## 4b. The two large files, and why they are still large

External review flagged `src/game/index.js` and `src/game/enemy.js` as ~90 KB
each. Both were audited for decomposition this pass. **One function came out of
`index.js` and nothing came out of `enemy.js`**, and the full candidate-by-
candidate reasoning is in `docs/ARCHITECTURE.md`.

The short version, because "someone should split these up" is otherwise a free
opinion: the test applied was *does the extraction move state, or only move
code?* `enemy.js` is one class whose thirty-eight methods all read and write the
same mutable bag — the AI behaviour families each touch a dozen fields of
`this`, so as free functions they would mutate another object's privates from
outside. That is the same coupling, further away, wearing a boundary. `index.js`
is orchestration over module-scope singletons, and its frame loop's *order* is
gameplay behaviour: `hud.setMenuOpen` and `input.setUiCapture` sit at the top of
the frame because a frame late was a real, recent bug.

The one thing extracted — `reconstitutionLine`, the line GUMOI speaks when it
rebuilds you — is the shape a justified extraction has here: a pure function of
saved progress, no singletons, no mutation, and **untested for its whole life**
because reaching it meant booting the renderer and dying with the right number
of charges left. It now has ten assertions.

A reviewer is entitled to disagree with any of those calls. They are written
down so the disagreement can be about the reasoning rather than the file size.

## 5. The shapes of bug this project actually produces

`HANDOFF.md` ends with a numbered list of traps, each one a real defect that
shipped behind a green suite. They are worth skimming even if you review nothing else, because
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

## 7. Distribution

One source tree, two containers. There is no web-specific gameplay code and no
Electron-specific gameplay code, no second copy of the game in a `docs/` folder,
and nothing in `src/` knows where it is hosted.

| | browser | desktop |
|---|---|---|
| where | GitHub Pages, `/Sovereign-Scar/` | GitHub Releases, Windows x64 |
| how | `scripts/build-pages.mjs` stages a derived file list; Actions deploys it | `electron-builder`, installer + portable |
| serving | HTTPS, static | loopback HTTP inside the window |
| gated on | lint, typecheck, unit suite, artifact validation | the same three, on a version tag |
| proven by | `tests/pages-smoke-e2e.spec.mjs` — boots the staged artifact under a `/Sovereign-Scar/` prefix in a real browser and 404s anything requested outside it | local `npm run desktop:build`; the packaged `app.asar` was inspected file-by-file |

The one guard worth knowing about is `tests/game/dual-runtime.spec.mjs`. The
Pages file list is *derived* by walking the import graph; the Electron file list
is *authored* in `package.json`. That spec uses the derivation to check the
authored globs cover it, so a module added to the game cannot ship to one
container and be forgotten in the other — which is how two containers quietly
become two games.

`.nojekyll` is load-bearing and non-obvious: GitHub Pages runs Jekyll unless it
is present, and Jekyll silently drops every path beginning with `_`. Exactly one
file in the runtime graph starts with one — `src/game/levels/_common.js` — and
`room-graph.js` reaches it through `encounter-director.js`, so it is on the path
to loading any level at all.

## 8. What is deliberately not here

No multiplayer, no controller remapping UI, no localisation, no analytics, no
accessibility audit, no save-file encryption or anti-cheat. None were scoped.
No macOS or Linux desktop packaging either — possible future targets, not
current scope, and adding them would mean signing and notarisation problems on
top of the unsigned-Windows one that already exists.
