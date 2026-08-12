# Wiring audit — 2026-08-12

Everything in `src/game`, checked from both ends: what exists but is never
called, what is called but never answered, what is written but never read, and
what the docs promise that the tree no longer contains. Every finding below was
verified by hand at both ends — the scanners that produced the candidates told
at least four lies during this audit (section I), so nothing they said was
believed without a second look.

The one regression found was fixed in this commit (A1). Everything else is
listed, not touched — deleting or wiring these is design work, not housekeeping.

Headline: **zero orphan files** (every module is imported), **zero probe↔hook
drift** (every `__sovereignScar` member probes reach for exists), **every
Settings toggle wired** (after A1), **every progress-save field read** except
one (A5). The skeleton is sound. The findings are individual nerves.

---

## A. Broken or dangling wires

### A1. "Show play timer" did nothing outside dev mode — REGRESSION, FIXED HERE

Settings has always had `Show play timer` (`ui/menu.js:66`). Yesterday's HUD
rewrite classified the timer as developer clutter and moved it into the
dev-only panel — so the toggle kept persisting, the switch case kept firing,
and the number it controls stopped existing on a player's screen. A setting a
player can flip is a promise the screen has to keep, whatever the
dashboard-vs-player classification says.

Fixed: the timer renders in the player HUD when the toggle is on (bare `mm:ss`,
no `Time:` label — a label is what made the old panel read as a dashboard).
Gated by two new assertions in `tests/game/hud-player.spec.mjs` (45/45),
counterfactually proven (unwiring it fails exactly one pair), and driven
end-to-end in a real running loop: the actual `{ type: 'set', id: 'showTimer' }`
menu event, real frame, `12:34` appears and disappears.

### A2. The destructible flood-fill exists twice, and the spec tests the copy

`world/destructible-voxel-mesh.js` — the method `shatterConnected` (line 74) is
what the game runs; the exported function `shatterConnectedKeys` (line 244) is
the same BFS re-implemented, and it is the one the spec drives. They already
disagree in small ways (the method collects `[x, y, z, color]` tuples, the
function collects keys). Fix a bug in one and the other keeps it **while the
suite stays green** — this is the drawn-90°/resolved-120° wedge disease at
function scale, and it is the highest-priority item on this list.

*Suggested shape:* the method delegates to the exported function, so there is
one algorithm and the spec is testing the one the game runs.

### A3. `KEEPOUT` is pinned by the spec and ignored by the code it describes

`world/terracing.js:29` exports `KEEPOUT = 2` — the distance terraces must keep
from walls. The spec imports and asserts against it. `terraceRoom` itself never
reads it: the body uses literal `2`s (`half - 2`, `-d + 2`, …). Change the
constant and the spec moves while the geometry does not. Two copies of one
number, one of them wearing a name.

### A4. `onChargeStrike` fires into a room where nobody is listening

`player.js:517` — every released charge strike calls `this.onChargeStrike?.()`.
No file anywhere assigns it (checked all three definition styles: `.onX =`,
option-object `onX:`, class method). The game's most deliberate attack has a
feedback hook and no feedback. Either wire it (juice/sfx cue on release — a
charged hit currently feels identical to a normal one at the moment of commit)
or delete the call. Every other `onX` in the codebase cross-checks clean.

### A5. `lastRun` is archived with care and read by nothing

`startNewGame` (`index.js`) preserves the outgoing campaign — beat reached,
bosses, playtime, deaths, `archivedAt` — into `progress.lastRun` before wiping.
Zero readers. It is the only field in the save schema nothing consumes — all
twenty-five others were counted, including the near-miss `runId`, whose single
reference turned out to be real (it is stamped into the final score record,
which is what "persists exactly once" dedups on). Either surface `lastRun` (a
"last run" line on the title or Witness Scores screen) or stop writing it.

---

## B. Ghost features — built, never called by anything, including their own file

| what | where | what it was for |
|---|---|---|
| `duckScore(amount, seconds)` | `audio/score.js:218` | Duck the music for a dramatic beat. Boss cards, the death overlay and story lines currently play over an unbothered score. A finished presentation lever, unpulled. |
| `isThreadDestination(beatId)` | `narrative/anchor-thread.js:126` | "Is this level where the objective points?" — the query a map marker or a glowing dungeon entrance would ask. The navigation aid it implies was never built. |
| `buildMemoryKeyPedestal()` | `assets/props.js:38` | A pedestal for the game's most important pickups. Never placed; keys sit on bare floor. |
| `buildSandMound()` | `assets/props.js:144` | Never placed (the Spur's mound is drawn by the boss itself). |
| `voxRadial()` | `bosses/boss-models.js:181` | A radial voxel builder no boss model uses. |
| `cellToWorld()`, `buildWallBox()` | `world/level-builder.js:15,30` | Dead helpers in an otherwise live module. |
| `_scoreBuses()`, `_sfxBus()` | `audio/score.js`, `audio/sfx-bank.js` | The documented analyser tap points for audio QA. The probes that used them are gone; the seams remain. **Keep** — they are the reason audio complaints can be measured instead of argued — but they earn a comment saying so. |

## C. Dead imports — ten, confirmed by per-file count

`bosses/roster.js`: `bounceArena`, `circleStrafe`, `DestructibleVoxelMesh`,
`fillBox` · `bosses/sand-spur.js`: `discMesh` · `fx/mood-controller.js`:
`stopScore`, `currentScore` · `levels/sandbox-combat.js`: `CRUST_COLORS` ·
`overworld/overworld.js`: `doorCells` · `world/room-graph.js`: `VS`.

Not cosmetic in a zero-build project: an import executes its module. An unused
import has already moved a certification number by 3 once in this repo's
history (`HANDOFF` fixture lesson). Cheap to delete; delete them.

## D. The validator is not at the door

`validateDungeonDef` (`world/room-graph.js:253`) is thorough and runs only in
the test suite. `createDungeon` itself never calls it, so a malformed def —
generated, dev-authored, or future-DLC'd — loads unvalidated at runtime and
fails somewhere downstream instead of at the door with a named reason. It is
fast; the loader could simply run it.

## E. Mirrors — deliberate, but they can drift

- `classifyFamily` / `response` (`render/materials.js`) are the documented CPU
  mirrors of the GLSL family chunks; the spec asserts against the mirror, the
  game runs the shader. Accepted pattern, flagged so nobody edits one side.
- `weaponTipY` (`assets/weapon-models.js:162`) — spec-side geometry helper;
  runtime hangs weapons off the measured hand socket. Fine as is.

## F. Paper ghosts — docs citing files that do not exist

Verified missing on disk. The dated audits are historical records — the fix is
this table, not editing history.

| cited | reality |
|---|---|
| `fx/motifs.js` (BUILD_LOG, CHANGELOG, Key.md) | became `world/room-lights.js` |
| `overworld/region-grammars.js` (AUDIT-progression-v2) | is `overworld/grammars.js` |
| `characters/materials.js` (AUDIT-progression-v2) | is `render/materials.js` |
| `narrative/scenes.js` (Getting close.md) | shipped as `narrative/cutscene.js` |
| `kernel/consumables.js` (AUDIT-Narrative) | consumables live on `Inventory` |
| `tests/boss-variety-e2e.spec.mjs`, `encounter-e2e`, `puzzle-solvable-e2e` (ROAD-TO-TEN) | planned names; shipped as `boss-movesets.spec.mjs`, `encounter-director.spec.mjs`, the puzzle probes + `puzzle-kit.spec.mjs` |
| `tests/game/actor-animator.spec.mjs`, `tests/actor-anim-e2e.spec.mjs` (AUDIT animations) | actual file is `tests/game/actor-anim.spec.mjs` |
| `tests/qa/_tmp-verify-playtest.mjs` (PLAYTEST-2026-07-23) | underscore one-off, deleted by policy — the doc's "reproduce with" step is gone |
| GTAO / addons paths (AUDIT-progression-v2) | proposals never vendored into `lib/` |

## G. Judgment calls surfaced — not bugs, owner's taste

- **Banked shards** are now visible only at altars (the HUD chip shows carried
  only; the old panel showed both). The altar shop shows the balance where it
  is spent. If you want it ambient, it is a one-line chip.
- **Witness score** is dev-panel + menu-screen only, per the finishing plan's
  classification. Noted because it used to be on the HUD every frame.

## H. Cleared suspects — checked and wired, so the next hunt can skip them

`overlays.toggle` (dev-panel:114) · elites (`eliteSpawns` ← room-graph) ·
puzzles (`puzzleFor`) · grammars (`runGrammar`) · tracks (`resolveTrack`) ·
pose-library (actor-animator) · threat-curve (room-graph) · the three shader
passes (index.js:32–34) · enemy-props (`attachEnemyProp`) · `world7`/
`buildWorld7` (self-consumed into `WORLD7`) · `nextScreenToward`
(overworld:96) · `monoAudio` — real and wired · `reduceMotion`,
`reduceHorrorAudio`, `quality`, `showTimer` (post-A1) all cased ·
`suppressBossIntro` (levels set, index reads) · `padStickHeld` hint
(index:1114) · `bossCard`/`showDeath`/`hideDeath` · every progress field except
`lastRun` · zero orphan files · zero probe↔hook drift.

## I. The instruments lied four times — notes for the next goblin

1. The unused-import scanner's body-stripping regex ate code between a comment
   containing "import" and the next `from '…'`, producing six false positives
   (`audioAt` et al). Every candidate was re-counted with a plain per-file grep.
2. Path-pattern greps (`world/elites`) miss same-directory imports
   (`'./elites.js'`) — half the "unwired files" were wired one directory over.
3. A `grep` with no match exits 1 and aborts the rest of a `&&` chain — the
   first "overlays.toggle has no caller" result was the chain dying, not the
   codebase.
4. The hook-drift scan cannot see aliased access (`const s = __sovereignScar;
   s.shadowCensus()`), so its "unused hook members" list was withdrawn rather
   than reported.

And the standing one: the Browser pane throttles `requestAnimationFrame`
(`document.hidden` stays true), so the live game's loop freezes there — the
timer fix read as broken in the pane while being fine. End-to-end verification
of anything frame-driven belongs in the headless harness, where the loop runs.

224 exports have zero references from live game code; almost all are the
project's pin-this-in-a-spec convention and only the `self-refs=1` residue was
pursued. The raw scan output is in `tmp/` (not committed); the scanners are
`tmp/scan-*.mjs` if anyone wants to re-run the hunt.
