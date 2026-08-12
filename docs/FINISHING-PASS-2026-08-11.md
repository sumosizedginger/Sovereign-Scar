# Player-facing finishing pass — report

Phases 0–3 of `SOVEREIGN SCAR — PLAYER-FACING FINISHING PASS`, run 2026-08-11.
Stopped at the Phase 3 human gate, as instructed. Nothing from Phase 4 onward
was started: no camera change, no boss redesign, no verticality, no region art.

The pass had two stated targets. One is done. **The other is half done, and this
report says so in section D rather than burying it.**

> "This looks like a developer build." — **fixed.**
> "Where the fuck is my character?" — **improved against the FLOOR, not yet
> against the OTHER CHARACTERS.**

---

## A. Baseline

| | before | after |
|---|---|---|
| SHA | `c5b2943` | (this branch) |
| version | 0.3.0 | 0.3.0 |
| working tree | clean | clean |
| full suite | **4826 / 4826** | **4906 / 4906** |
| unit suite | 3962 / 3962 | **4041 / 4041** |
| frame rate, 5 locations | 60 fps, p99 16.9 ms | 60 fps, p99 17.0 ms |
| draw calls | 46–49 | 47–51 |
| triangles | 37.3k–61.2k | 37.4k–61.2k |
| mean actor/floor ΔL\* | 9.5 | **15.1** |

Screenshots: `docs/media/player/before/` and `docs/media/player/after/`, 11
frames each as a player sees them, plus a greyscale twin of every AFTER frame.
The BEFORE set has not been overwritten.

The script also writes a HUD-free `-clean` twin of each frame, which is what the
greyscale versions are made from; those are gitignored (20 MB, and the
certification set already covers HUD-free frames). Regenerate any of it with
`node tests/qa/player-captures.mjs --set=<name>`.

Raw probe output: `tmp/baseline/`.

**A note on that ΔL\* row, because it is the most important number here and the
most easily misread.** The published baseline was 7.2, not 9.5. Both numbers
describe the same build; they differ because the instrument was wrong and got
fixed mid-pass (section B). 9.5 → 15.1 is the honest comparison, measured with
the same corrected probe on both sides. Anything quoting 7.2 → 15.1 is claiming
credit for repairing a ruler.

---

## B. Instrument repairs

### B1. The boss-action census counted one of two architectures

**Wrong:** `content-density.mjs` printed `CryptWarden ········ 0 action(s)` — the
tutorial boss, the first fight in the game, apparently empty.

**Why:** it counted `this.startAction(` call sites. That was the only way to
commit an attack when the probe was written. `BossBase` then grew
`defineActions()` / `chooseAction()` / `actIfReady()`, the Warden moved onto it,
and its three moves are now declared in a list and committed for it inside
`base.js`. Zero call sites in its own body. Zero reported. Nothing failed,
because a print-only probe cannot fail — it just printed a wrong number for a
session, and wrong numbers from instruments get quoted into plans. This one was
quoted into `AAA.md` and into the plan for this pass.

**Fixed:** `tests/qa/lib/boss-actions.mjs` counts action DEFINITIONS — object
literals carrying a `name:` — in both shapes, and takes the union, so a boss
that migrates between architectures does not change its count and a boss using
both does not double-count. `CryptWarden` now reads 3, matching what
`boss-movesets.spec.mjs` independently drives out of the live fight. Roster
total 32 → 35.

**A second thing fell out of it.** The old probe filtered to `extends BossBase`
and dropped everything else *silently*, which is how `TriCompiler` — a real boss
fight, beat 02 — disappeared from a census that then printed "across 13 bosses"
for a fourteen-fight campaign. It is now reported by name as not countable from
source, rather than not existing.

**Falsified:** `tests/game/boss-action-census.spec.mjs`, both directions.
Disabling recognition of the declared architecture reproduces the original bug
exactly (`CryptWarden 0`, total 32) and drops 8 assertions; disabling the staged
one drops 8 different assertions and empties ten bosses. Restored and verified
byte-identical by hash.

The spec's own hostile fixture also caught a bug I had just written: the scan
found `this.startAction(` inside a **commented-out** line and counted a move the
boss does not have.

### B2. Running the suite dirtied the repository

**Wrong:** `tests/boss-e2e.spec.mjs` screenshotted into
`assets/screenshots/leviathan-boss.png`, which is a committed file. Every full
run left the tree dirty.

**Why it matters more than it sounds:** `git status` after a test run stopped
meaning anything, so a genuinely modified file had to be spotted inside expected
noise — and the suite normalised "dirty tree" as the resting state, which is
exactly the condition under which a half-finished change gets committed by
accident. This repository has a documented history of publishing to the wrong
place; it does not need a second way to commit the wrong thing.

**Fixed:** the capture goes to `tmp/` (gitignored), the directory is created
rather than assumed — a missing directory would have made `page.screenshot`
reject into the existing `.catch(() => {})` and silently stop taking the picture
— and the spec now asserts the file landed outside version control.

**Falsified:** a full suite run on the fixed tree left `git status` showing only
this pass's deliberate edits. The committed PNG is now orphaned; see section G.

### B3. Package metadata

Already correct — fixed in the previous session. Verified end-to-end this time by
actually building the desktop targets (section F).

### B4. The silhouette probe was aimed at the wrong pixel

Not in the plan. Found while trying to explain why a change that was plainly
visible in a screenshot barely moved the number.

**Wrong:** `silhouette-contrast.mjs` sampled a hardcoded `(640, 360)` — "the rig
centres the look-at on the player, so they land at frame centre."

**Why:** the rig looks at a point *above* the player's feet and the camera is
pitched 56°, so the player's body renders around **y = 395**. A 26-pixel disc at
360 straddles their head and a lot of open floor. Every figure the probe has ever
printed was diluted by it.

**Fixed:** the player is projected through the live camera each measurement, and
the sampling radii are derived from their measured on-screen height instead of
three constants tuned once against one room. `camera` was added to the debug hook
for this.

**Also fixed:** the edge metric compared `r − 4` against `r + 8`, straddling the
boundary by twelve pixels — an outline is one or two pixels wide, so it could not
see the thing it existed to measure. It now walks the ray a pixel at a time and
reports the **median** step as well as the max, because the max is the single
luckiest bearing out of 120 and reads 51 on a campaign whose characters dissolve
into the floor.

---

## C. HUD

### Old information architecture

One bordered black panel, top-left, eleven lines of monospace `label: value`,
rebuilt from a template string every frame — plus a permanent control sheet
nailed to the bottom-right corner for the entire game.

```
SOVEREIGN SCAR                                ← the game's own title, over the game
Beat: 01 Crypt Breach                         ← internal level id
Mode: MEDIUM · Reconstitutions: 5
HP ♥♥♥♥♥♥ (6/6)                               ← the number behind the hearts beside it
Guard: ▮▮▮
Weapon: Bare Strike
Keys: 0/3 · Shards: 0 · Mood: crust           ← lighting preset name
Witness: 0
Thread: The Crypt is north. …                 ← internal name of the objective system
Small keys: 0 · Bosses: 0/14                  ← completion counter

The Scarred Crust — fourteen wounds await     ← also toasted, on screen twice at once
```

Every line is *true*. That was never the problem.

### New player HUD

- **Health** — hearts, drawn, with half-hearts (damage is not always integral;
  a 0.5 hit used to round up and show a heart the player did not have). The
  numeric `(4/6)` is gone from normal play.
- **Guard** — pips as segments rather than `▮▯` glyphs, so a break can flash
  without the row changing width.
- **Weapon** — named, first, because it changes what the attack button does.
- **Carried things** — coloured-dot chips, and **only when carried**. `Keys: 0/3`
  was on screen for the whole first dungeon.
- **Objective** — kept, with a `›` marker instead of the label `Thread:`.
- **No panel box.** No background, no border, no radius, no drop shadow —
  legibility comes from text-shadow instead. That single change did more for
  "does this look like a game" than any of the content edits.

### What moved into dev mode

`#ss-hud-dev`, monospace, rendered only while dev mode is on: beat id and name,
mood preset, run mode, raw hp, raw poise, parry count, key state, score, chain,
boss counter, timer, paused. **Nothing was deleted.** A gate that rewarded
deleting instrumentation would be a worse project to work on and the fields would
be back inside the player's panel within a month.

### Controls

No longer permanent. Shown for the first 14 seconds of a **new** run, and while
`?` is held (`Slash`, added to the binding table and to `docs/CONTROLS.md`, so
`controls.spec.mjs` covers it). The pause menu has always had a Controls screen.
Discoverability preserved; permanence removed.

### Two layout bugs found by looking at the pictures

1. **Three overlapping boxes of text on the first frame of the game.** The story
   panel sits at `bottom: 96px` and is routinely taller than 48px; the toast sat
   at `bottom: 48px` and was drawn straight through it. Visible in
   `before/04-combat.png` — a coach tip written across a dialogue box. Toasts
   moved above the dialogue.
2. The boss bar's phase line had `margin-top: 3px` under a 12px bar with a 12px
   label above it, and overlapped the bar it describes.

### Tests added

`tests/game/hud-player.spec.mjs`, 43 assertions. Asserts the developer labels
never reach a player, that the player still sees everything they need, that dev
mode still shows all of it, and — deliberately — that a hostile objective
containing every forbidden label **does not** trip the gate, so narrative prose
stays shippable.

**Falsified:** putting `Mood: crust` back into the player's panel turns two
assertions red. Restored and verified byte-identical by hash.

### Before / after

`docs/media/player/before/02-first-frame.png` vs `after/02-first-frame.png`.

---

## D. Actor readability — broken down, and honest about the part that failed

### D1. Inverted-hull outline — built, measured, **rejected**

It works by the numbers: mean ΔL\* 7.2 → 14.3 on the then-current probe, the
Crypt at 34.9, every actor cleanly off the floor.

It was rejected on sight, and correctly. The player is **about thirty pixels
tall** at this camera. An outline wide enough to register is roughly two of those
pixels per side — a quarter of the character's width — so the figure stops being
a character with an outline and becomes a black blob with some colour trapped
inside it. Owner's verdict, unprompted: *"it was better before."*

Numbers up, game worse. That is the whole lesson, and it is the reason the
measurement gate below is not a hard threshold.

The code is kept, off, behind `outline: true`, with the finding written next to
it: a hard outline is the wrong instrument at **this character size** and would
become the right one if the camera ever came closer.

**Contribution: 0. Not shipped.**

### D2. Separation light — shipped

The old rim was `pow(1 − n·v, 3.2) * 0.28`. Textbook, and geometrically defeated
by this camera: at 56° the view looks almost straight down the normals of the
head, shoulders and upper arms — most of the character's visible area — so
`1 − n·v` is near zero across nearly all of it, and an exponent of 3.2 crushes
the rest into a hairline. It was doing nothing in exactly the rooms that needed
it.

Two changes, both about making the lit band **wide** rather than bright:
exponent 3.2 → 1.5, so the falloff reaches the sloped shoulder and upper-arm
faces; plus a fixed view-space key, upper-left and toward the viewer,
deliberately **not** the room's light — the room is what the character has to
separate *from*, so a term that tracks it cannot separate anything.

**Contribution: most of the ΔL\* gain.** The hero's body lightness rises
consistently, and it rises by the same amount in every dungeon, which is the
point.

### D3. Hero silhouette — shipped

A cloak, hung from the shoulders, swinging on the waist pivot. Priority one in
top-down readability is silhouette, and this game had none: player and enemies
come out of the same six part builders, so from above every figure was the same
rounded blob.

Two bugs found by looking, both worth recording:

- Hung centred near the shoulder, its top edge cleared the shoulder — and
  because the camera looks down at 56°, that overhang projected **up-screen over
  the hero's own head**. Walking toward the camera showed a blue slab across the
  hero's chest. A cape must never be visible from the front.
- The tip was inverted, which made that overhang worse.

It is also, deliberately, added **after** the bounding box that grounds the feet
and feeds `radius` to combat. A cloak reaching past the heels would otherwise
have lifted the hero off the floor by its own overhang, and nobody would ever
have traced that back to a cape.

**Contribution: the only thing that separates the player from an ENEMY rather
than from the floor.** It is also the weakest of the three at this size — see
D5.

### D4. Reserved accent — shipped, and the first choice was wrong

Cold cyan `#58e8ff`. The gate failed it on sight: the **frost** faction's accent
is `#60e0ff`. In a frost room the player would have been marked out in exactly
the shade worn by the things trying to kill them.

Azure `#4a86ff` is what is actually free. The bestiary's nine accents run red,
orange, amber, two yellow-greens, a pale violet, a near-white and that one cyan;
saturated blue is the only cool region nobody occupies, and it sits opposite both
the tan Crust and the red Pyre.

**Contribution: identity, not legibility.** It is deliberately last in priority
order and it is not the only mechanism.

### D5. The part that is NOT finished

Open `docs/media/player/after/09-town-grey.png` — the crowded room, desaturated.

**The player is legible against the floor. The player is not distinguishable
from the eight other figures in the room without colour.** The cloak helps; at
thirty pixels tall it is not decisive.

The pass's own grayscale gate says: *"if the only way to locate the player is by
colour, the solution is incomplete."* By that standard this is incomplete, and I
am not going to describe it as anything else. Options, cheapest first — this is a
taste call and it is yours:

1. **Make the cloak bigger / longer.** Free, and the most likely to work; risks
   looking silly.
2. **Push the hero's VALUE away from every enemy** — enemies notably darker,
   hero notably lighter, as a rule rather than per-palette.
3. **A subtle ground ring under the player.** Reliable, standard, and the one
   most likely to read as "gamey".

---

## E. Certification

Current ΔL\*, both columns measured with the corrected probe:

| place | before | after | median edge before | after |
|---|---|---|---|---|
| overworld crust | 2.1 | **10.5** | 27.7 | 27.3 |
| beat-01 crypt | 4.3 | **13.3** | 30.0 | 31.6 |
| beat-09 town | 14.6 | **18.2** | 44.7 | 32.5 |
| beat-12 pyre | 4.5 | **7.0** | 16.8 | 16.2 |
| beat-14 leviathan | 21.8 | **26.4** | 42.4 | 32.9 |
| **mean** | **9.5** | **15.1** | 32.3 | 28.1 |

**A hard ΔL\* ≥ 20 gate was NOT adopted, and the provisional target was not
met.** Three reasons, in order of weight:

1. **We are at 15.1, not 20.** Saying otherwise would be a lie, and moving the
   threshold to whatever we happen to score is worse than having no threshold.
2. **The metric is not the goal.** The black outline scored *better* on it than
   what shipped, and looked worse. A number that prefers the rejected build is
   not a number to gate on.
3. **The probe needs a real GPU.** Headless here is software GL at ~1.5 fps, so
   it cannot live in the suite at all. It stays print-only.

What was adopted instead is `tests/game/hero-readability.spec.mjs` — the cheaper,
harder question: are the three treatments actually **installed**, on the hero and
only the hero. That is the failure mode this project keeps having (a system
built, tested, and wired to nothing), and it runs in the suite.

**Counterfactually proven — the second time.** The first version of that spec
declared its own copy of the hero's rig options under a comment claiming they
were "exactly the options `player.js` passes". They were a copy, so the
counterfactual could not touch them: deleting the cloak, dropping the rim to the
default, and handing the hero the frost faction's colour each left it passing
**15 out of 15**. It was pinning its own constant with great rigour.

`player.js` now exports `HERO_RIG` and the spec imports it. Re-run, the same
three breaks fail 3, 1 and 2 assertions respectively. Restored, verified
byte-identical by hash, green.

---

## F. Performance

| | before | after |
|---|---|---|
| overworld | 60 fps, p99 16.9 | 60 fps, p99 16.9 |
| beat-01 crypt | 60 fps, p99 16.9 | 60 fps, p99 17.0 |
| beat-07 sluice | 60 fps, p99 16.9 | 60 fps, p99 17.0 |
| beat-14 leviathan | 60 fps, p99 16.9 | 60 fps, p99 16.9 |
| draw calls | 46–49 | 47–51 |
| triangles | 37,920–61,168 | 37,944–61,168 |
| shader programs | 35–57 | 35–58 |

Two extra draw calls and one extra program — the hero's cloak, and the hero's
stronger rim compiling as its own program. Everything still vsync-locked with no
dropped frames. One 18.7 ms outlier on a single Leviathan frame, not repeated.

**The rejected outline would have cost far more** (six extra meshes per actor,
every actor), which is worth knowing if it is ever reconsidered.

Desktop packaging (Phase 0.4): NSIS installer and portable EXE both built
clean, 100 MB each. The auto-updater config generated into the build now reads
`repo: Sovereign-Scar` — the previous session's `package.json` fix verified in
the artifact rather than in the source.

---

## G. Found, not changed

1. **The greyscale gate does not pass.** Section D5. The biggest open item, and
   deliberately left for a decision rather than guessed at.
2. **`assets/screenshots/leviathan-boss.png` is now an orphan.** Nothing reads
   it and nothing writes it any more. Four other PNGs in that directory are
   likewise referenced nowhere. Deleting committed files is your call.
3. **The desktop build has no application icon** — electron-builder logs
   *"default Electron icon is used"*, so the installer and the taskbar entry ship
   with the stock Electron diamond. Cheap to fix, very visible at release.
4. **The installer is unsigned**, so Windows will show an "unknown publisher"
   warning to anyone who downloads it. Flagged last session; still true.
5. **The boss capture frames the arena, not the fight.** In both capture sets the
   player is off-frame in the boss shot. Possibly the intro camera not fully
   releasing after `bossIntro` is nulled; possibly only an artefact of how the
   fixture teleports. Not investigated — it is a capture-harness question, not a
   gameplay one, but it should be ruled out before those frames are used to judge
   boss fights.
6. **The new run's objective is on screen twice** for the first few seconds — in
   the HUD's objective line and in the opening dialogue box that delivers it.
   Transient and arguably correct; noted because it is visible in the very first
   frame.
7. **`AAA.md`'s ΔL\* table is diluted** by the probe-aiming bug (B4). Annotated
   in place with the corrected figures rather than rewritten, because the
   original numbers are what the decisions of that session were made on.

---

## H. Recommendation for the next phase

**Option 3: address a newly discovered blocker before further art work.**

Not option 1 (keep the camera, start reference-boss work) and not option 2 (run a
camera experiment).

The camera is not the blocker and a camera experiment would not answer the open
question. Section D5 is the blocker: the hero is now readable against the
GROUND and still not readable against the OTHER FIGURES, and every remaining
item on the art list — boss work, region rollout, verticality, telegraph
overhaul — puts *more* things on screen for the player to be lost among. Doing
any of it first means doing it against a hero you cannot pick out, and then
re-judging all of it afterwards.

It is also small. One of the three options in D5, an afternoon, and the same
greyscale frame re-shot to check. The instruments to judge it now exist and are
aimed correctly, which was not true this morning.

**The specific ask:** look at `docs/media/player/after/09-town-grey.png` and
`after/02-first-frame.png`, and pick which of D5's three you want. I have a
recommendation — bigger cloak first, because it is free and reversible, then the
value rule if that is not enough — but you have already caught me once this
session preferring a number to a picture, so this one is yours.
