# AAA.md — an honest assessment of Sovereign Scar

Written 2026-08-11, after playing the shipped build on a real GPU, running the
suite, and measuring the frames rather than reading the plans. Every number
below I took today; none of it is quoted from a doc. Where a doc and my
measurement disagreed, the measurement wins.

You asked for brutal. Here it is, and then here is what to do about it.

> ## ⚠ CORRECTION 2026-08-16 — EVERY "56°" IN THIS FILE IS WRONG
>
> **The camera is at 70.7°, not 56°, and has been for some time.** This document
> says "the rig sits at height 18, back 12" in §3 and reasons from it three more
> times (§4 item 3, §5 Tier 1 item 3). Measured from the source today:
>
> ```
> src/game/index.js:  camera.fov = 40
>                     const CAM_HEIGHT = 17.5
>                     new CameraRig({ height: CAM_HEIGHT, back: CAM_HEIGHT * 0.35 })
>                  →  back 6.13,  pitch atan2(17.5, 6.13) = 70.7°,  dist 18.54
> ```
>
> **Where the wrong number comes from, because it will catch the next reader
> too:** `camera-rig.js` still declares `height = 18` and `back = 12` as its
> class DEFAULTS — the old rig — and `index.js` overrides both at the call site.
> Read the rig file alone and you get 56°. That is exactly how this error
> survived into a document, and out of the document into a probe:
> `tests/qa/boss-portraits.mjs` was written this week with a hardcoded 56° taken
> from the prose below, and spent a whole session photographing fourteen bosses
> at an angle the game does not use. It now reads fov, height and back ratio out
> of `index.js` rather than restating them.
>
> **What the correction changes, and what it does not.** The *conclusion* of §3
> survives — a fresnel rim still fails here, and it fails HARDER at 70.7° than
> at 56°, because the camera is even closer to looking straight down the
> normals it needs to graze. What does NOT survive is §5's "drop the pitch from
> 56° toward ~40°": that was written about a rig that no longer exists, the
> owner has since said the framing is correct as-is, and `ROAD-TO-AAA.md` lists
> the camera under *what is not stopping it*.
>
> **The rule this file keeps proving on itself:** a number written into prose
> stops being measured the moment it is written down. Derive it from source, or
> expect to be reasoning about a build that has moved on.

The four pictures this report argues from are in `docs/media/aaa/`, kept out of
the certification set on purpose because they show the game **with the HUD on**,
which the certification captures deliberately hide:

| | |
|---|---|
| [`01-first-frame-hud.png`](docs/media/aaa/01-first-frame-hud.png) | the literal first frame of a new game |
| [`02-dungeon-hud.png`](docs/media/aaa/02-dungeon-hud.png) | the Crypt, mid-play |
| [`03-map-with-pickup.png`](docs/media/aaa/03-map-with-pickup.png) | the map, correctly drawn (see §4 — I was wrong about this one) |
| [`04-boss-silhouette.png`](docs/media/aaa/04-boss-silhouette.png) | the Magma Wyrm |

Look at the first one before reading any further. It makes the argument faster
than I can.

---

## 1. The score

You gave me three points on a scale. I need two numbers, because this project
does not sit at one point — and the gap between the two numbers *is* the
finding.

| | where it sits | what that means |
|---|---|---|
| **The machine under the hood** | **~8.5/10** — comfortably past "independent solo developer" | Rigour that would survive a code review at a real studio. This is the top few percent of solo game projects I could look at. |
| **The thing a player actually touches** | **~3/10** — below "independent solo developer" | Opens like an internal developer build. A stranger would call it unfinished in the first ten seconds and never reach the good part. |
| **What a stranger would score it** | **~3/10** | Because players score the lower number. Always. They cannot see the other one. |

**So: not "damn this sucks."** Nothing here is bad work. But it is not yet
"independent solo developer" *in the eyes of someone who downloads it*, and the
reason is not the reason you'd expect.

### The one-sentence diagnosis

> **This project has world-class engineering discipline pointed at the half of
> the game a test can see, and almost none pointed at the half a test cannot.**

Everything that can be *asserted* is excellent. Everything that can only be
*looked at* is a prototype. The suite is the project's greatest strength and it
has quietly become its blind spot: **4,826 passing checks**, a certification
gate, a whole document of traps that have each cost real time — and in the
final dungeon your character is measurably the same brightness as the floor.
No assertion in that suite can see a frame, so no assertion caught it.

That is the entire distance to "holy shit."

---

## 2. What "AAA" can honestly mean for two people

Let me kill the fantasy first, because chasing it would waste a year.

**AAA is a budget, not a quality level.** *Elden Ring* was ~300 people for five
years. *Tears of the Kingdom*, ~400. You and I cannot buy that, and any plan
that pretends otherwise is lying to you. If "AAA" means content volume,
motion-captured animation, voice acting, and a marketing budget — that door is
closed, and it was closed before we started.

But there is a real target that is *not* closed, and it is the one people
actually mean when they say "holy shit":

> **"Wait — this was made by one person?"**

That is *Tunic*. *Animal Well*. *Stardew Valley*. *Dead Cells*' first release.
*Rain World*. Those games do not out-budget AAA; they out-*focus* it. They pick
a small number of things and make those things immaculate, and the immaculate
finish is what reads as "expensive."

**That target is reachable from here.** Genuinely. Closer than you'd think —
and that is the good news buried in a harsh report.

---

## 3. The evidence, measured today

### What's genuinely excellent

| what I measured | result |
|---|---|
| Unit suite | **3,962 / 3,962 passing** |
| Full suite (unit + browser E2E) | **4,826 / 4,826 passing** |
| A full played session, boot → overworld → dungeon → combat → menus | **0 page errors, 0 console errors** |
| Frame rate on a real GPU (RTX 3060 Ti, 1280×720) | **locked 60 fps**, p99 **16.9 ms** — vsync-capped, never missed a frame |
| Draw calls / triangles | **46–49 calls, 37k–61k triangles** |
| Content authored | 14 dungeons · **108 rooms** · 49 overworld screens · **28 sealed arenas** · **153 enemies** · 42 puzzle beats · 21 item locks · 37 of 42 enemy-behaviour combinations · ~35 committed boss attacks |
| Codebase | ~38,600 lines of game source across ~300 files, no build step, no bundler |

Read that frame-rate line again, because it changes everything that follows.

**The game is using roughly 2% of the graphics budget available to it.** A card
like that will happily push several hundred thousand triangles and a thousand
draw calls at 60 fps. Sovereign Scar asks it for 46 calls. It is idling.

> **Nothing I recommend below is blocked by performance.** Not one thing. The
> headroom is enormous and completely unspent. This also closes
> `OPEN_QUESTIONS.md` §4, which has been waiting on exactly this measurement.

Also worth saying plainly, because it is rare: **there are no crashes, no
errors, and no broken systems.** I went looking. The thing works. In a
hand-built 38,000-line 3D game with no bundler, that is not normal, and it is
the direct product of the discipline in `HANDOFF.md`.

### What I measured that is genuinely bad

**Can you see your own character?** The actor material carries a fresnel rim
whose stated job (`actor-rig.js:29`) is *"silhouette separation regardless of
the floor colour."* I measured whether it works, by photographing real frames
and comparing the pixels covering the character against the floor just outside
them.

`ΔL*` is a perceptual lightness difference on a 0–100 scale. Below 10, a shape
is legible only by its colour and dissolves the moment it stops moving. Around
20 is readable at a glance. Above 30 reads instantly.

```
overworld crust      ΔL* 10.1
beat-01 crypt        ΔL* 16.9
beat-09 town         ΔL*  6.7
beat-12 pyre         ΔL*  1.7      <-- character and floor are the same brightness
beat-14 leviathan    ΔL*  0.4      <-- the final dungeon of the game

mean across 5 places: 7.2
```

**In the last dungeon of your game, your character has 0.4 lightness difference
from the ground they are standing on.** They are, in value terms, invisible.

> **UPDATE 2026-08-11 — and the probe above was aimed at the wrong pixel.**
>
> It sampled a fixed (640, 360), on the reasoning that the camera centres the
> player. The rig looks at a point ABOVE the feet and the camera is pitched 56
> degrees, so the player's body actually renders around y = 395: the disc was
> straddling their head and a lot of open floor. Every number in the table is
> diluted by that. Re-measured with the player PROJECTED through the live
> camera, the same build reads:
>
> ```
> overworld crust      ΔL*  2.1     (not 10.1 — worse than reported)
> beat-01 crypt        ΔL*  4.3
> beat-09 town         ΔL* 14.6
> beat-12 pyre         ΔL*  4.5
> beat-14 leviathan    ΔL* 21.8
> mean: 9.5
> ```
>
> The verdict does not change — the hero was unreadable in the Crust, the Crypt
> and the Pyre — but the shape of it does, and the honest lesson is the one this
> project keeps re-learning: a constant in an instrument is a hypothesis. See
> the finishing-pass report for what was done about the readability itself.
The only thing separating them from the floor is the dark contact disc drawn
underneath them — which is why in every screenshot the player reads as *a
smudge with something on it* rather than as a person.

And here is the part that stings, because it is a good idea defeated by a
different good idea:

> The rim light is written correctly. It cannot work at this camera angle.
>
> Fresnel is brightest where a surface turns away from the camera and vanishes
> where it faces the camera. The rig sits at height 18, back 12 — a **56°
> pitch**, nearly straight down. So the camera is looking directly down the
> normals of the head and shoulders, which is most of what it can see. The rim
> appears on the character's *sides*, which the camera barely sees.
>
> *(**Corrected 2026-08-16:** height 17.5 / back 6.13, a **70.7°** pitch — see
> the note at the top of this file. The argument holds and gets stronger: the
> steeper the camera, the more of the actor is presented normal-on and the less
> rim there is to see.)*
>
> The silhouette system and the camera angle are each defensible. Together they
> cancel.

---

## 4. What is actually wrong, in plain language

Ranked by how much a stranger's opinion moves per hour of our work.

### 1. The HUD is a debug readout, and it never goes away

This is the single most damaging thing in the project and it is also the
easiest to fix.

Here is what covers the top-left corner of the screen at all times:

```
SOVEREIGN SCAR
Beat: The Scarred Crust
Mode: MEDIUM · Reconstitutions: 5
HP ▼▼▼▼▼▼ (6/6)
Guard: ▪▪▪
Weapon: Bare Strike
Keys: 0/3 · Shards: 0 · Mood: crust
Witness: 0
Thread: The Crypt is north. Something inside is still using my name.
Small keys: 0 · Bosses: 0/14
```

In monospace text. Plus a **permanent controls cheat sheet** pasted in the
bottom-right that also never goes away. Together they occupy roughly a third of
the screen, forever.

**In layman's terms:** the game is showing the player its diagnostics. `Mood:
crust` is an internal variable name. `Reconstitutions: 5` is how many lives you
have. This is what a developer looks at while debugging, and it was never
replaced with what a player looks at while playing.

No shipped game does this. Not one. It is *the* signal that reads "unfinished,"
and it fires in the first half-second, before the player has seen a single good
thing you built.

The whole UI layer is **1,585 lines** — against 38,600 lines of game. That
ratio tells the story on its own.

### 2. You cannot see yourself, and you cannot tell yourself from an enemy

Measured above: mean ΔL* 7.2, worst 0.4.

There is a second half to this. In the Ruined Town screenshot, the player and
four enemies are all *pale head, red torso, small.* At the size they render, I
genuinely could not identify which one I was without moving. In an action game
whose entire combat thesis is *reading telegraphs and answering them*, not
being able to locate yourself is not a polish issue — it is a design failure
that silently taxes every fight in the game.

### 3. The camera is showing you the least interesting angle of everything

*(**Corrected 2026-08-16: 70.7°, not 56°** — top of file. This section's
complaint is therefore understated rather than wrong, and its prescription is
withdrawn: the owner has since called the framing correct, and dropping the
pitch is no longer on any plan.)*

56° pitch means you are looking at the tops of hats and the tops of boxes. A
Link to the Past cheats this: its camera is top-down but its *art* is drawn at
three-quarters, so you see Link's face. Here it is a real 3D camera, so you get
what a real camera at 56° gives you — scalps and roofs.

**This one fix pays three ways at once:** you'd see characters' faces, the rim
light you already wrote would start working, and height in the world would
finally be visible — which is why item 5 keeps failing.

### 4. The map is fine — I was wrong about this one

I photographed the map after teleporting straight into a dungeon, saw a single
square, and had "the map is one rectangle" written down as a major failure.

It isn't. `map-screen.js` filters to rooms you have visited unless you are
holding that dungeon's map pickup — correct Zelda fog-of-war. My fixture had
visited exactly one room, so it correctly drew exactly one room. I re-shot it
with the map held, and the real screen draws all six rooms of the Crypt with
connecting corridors, a **red** locked door, a **gold** boss door, a skull on
the boss room, and the current room ringed in gold. It works, and it encodes
more information than most indie dungeon maps do.

It is *plain* — flat slate rectangles, no room shapes, no key or item markers —
so it belongs in the art pass at Tier 3, not on a list of things that are
broken. **Nothing here needs fixing before the game ships.**

I'm leaving this section in rather than deleting it, for two reasons: the
correction is more useful to you than a clean-looking report, and it is the
second time in one afternoon that *my own test setup*, not the game, produced
the defect I was about to report. That is the same trap your `HANDOFF.md`
already documents twice.

### 5. The overworld is 49 empty fields

A typical screen is a flat brown plane, four grey boxes, and one enemy. No
height, no landmark, no composition, nothing to walk *toward*.

Verticality has been ticketed **three separate times** (`VISUAL_PLAN.md` 6,
`GRAPHICS-OVERHAUL.md` 4, `ROAD-TO-TEN.md` E2) and dropped all three times.
`ROAD-TO-TEN` correctly diagnosed why — *it keeps getting filed as a graphics
ticket when it is a level-design ticket* — and then didn't do it either.

**It is the largest single content gap in the project**, and the flat-floor
problem is also why all the expensive shadow work you paid for has nothing to
fall on.

### 6. The bosses do not look like anything

I looked at all 14 boss captures. The Magma Wyrm is an orange blob. The Proxy
is a purple blob with a gold crescent. The Leviathan is off-frame behind a
telegraph. They have no head, no limbs, no readable silhouette — the enemies
have *better* models than the bosses do, because the enemies at least use the
humanoid rig.

You have fourteen bosses with distinct names, distinct movesets, distinct
themes, and real mechanical identity. **None of that identity reaches the
player's eyes.**

### 7. Telegraphs look like debug gizmos

Flat opaque coloured shapes stamped on the floor. They are perfectly *readable*
— the design is right, and the discipline about where they're drawn versus
where they resolve is genuinely good. But a solid purple circle reads as
programmer art. The same shape with an edge, a pulse, and a fill that animates
toward its strike time reads as magic, costs nothing, and communicates *more*
(you'd see the timing, not just the area).

---

## 5. The plan

Four tiers. Each is independently shippable and each makes the game visibly
better on its own. **Tier 1 alone moves a stranger's score more than Tiers 3
and 4 combined**, which is the whole point of ranking them this way.

### Tier 1 — Stop looking like a debug build (~1 week)

*The highest return in the entire project. Nothing here is hard.*

1. **Build a real HUD.** Hearts as drawn shapes, not `▼▼▼▼▼▼ (6/6)`. A guard
   meter as a bar. Keys as an icon and a count. Delete `Mood:`, `Beat:`,
   `Witness:`, `Reconstitutions:` and `Small keys:` from the player's view
   entirely — they belong behind `?dev=1`, where you already have an excellent
   dev panel to put them in.
2. **Kill the permanent cheat sheet.** Show it on pause, on first boot, and on
   a held key. Never during play.
3. **Fix the character silhouette.** Three moves, do all three:
   - Add a genuine dark outline on actors only (inverted-hull is ~30 lines and
     costs one extra draw call per actor — you have 46 and room for a thousand).
   - ~~Drop the camera pitch from 56° toward ~40°.~~ **Withdrawn 2026-08-16.**
     The pitch was never 56° (it is 70.7° — top of this file), and the owner
     has since confirmed the framing is right; `ROAD-TO-AAA.md` files the
     camera under *what is NOT stopping it*. Do not act on this line.
   - Add a **certification gate for character contrast**, exactly like the
     luminance gate you already have: every region must clear a minimum ΔL*
     between actors and their floor. You already know how to build these gates
     and they already caught two real bugs. This one would have caught a 0.4.
4. *(The map needed nothing. See §4 above — I was wrong about it.)*

### Tier 2 — Make the world look lived in (~2–3 weeks)

5. **Verticality.** Do it per-dungeon, with a traversal re-audit each time, the
   way `ROAD-TO-TEN` E2 correctly describes. Stop filing it as graphics. This
   is the one that makes the game stop looking like a blockout.
6. **Give the overworld landmarks.** Each of the 8 regions gets one silhouette
   visible from several screens away — a tower, a wreck, a bone arch. Something
   to walk toward. This is what makes an overworld feel like a place instead of
   a grid.
7. **Redraw the 14 bosses.** Give each a silhouette you could identify as a
   black shape on a white page. This is the single biggest "AAA feel" item in
   the project, because bosses are what people remember and screenshot.

### Tier 3 — Make it feel expensive (~2 weeks)

8. **Telegraph art pass.** Edge, pulse, and a fill that animates toward the
   strike. Keep the geometry identical — it is already correct.
9. **Impact on the receiving end.** Sparks along the blow, debris keyed to
   material, a real hit-stop. `ArcSmear` does the swing beautifully; nothing
   answers it.
10. **Camera dynamics.** A short pull-in on a killing blow. A held frame on a
    boss's death.
11. ~~The four dead art channels.~~ **Correction (2026-08-11): I was wrong —
    they are not dead.** I copied ROAD-TO-TEN's *diagnosis* table without
    checking it against its *status* line, which marks Phase F implemented.
    Verified in code today: `room-graph.js:31` imports `stampKitProps` and
    `shapeBossArena` from `kit-props.js`, and `index.js:579` drives
    `setAtmosphere(kit.atmosphere)`. All four channels are wired. What remains
    from F is only what the CHANGELOG already records as cut: volumetric light
    shafts and arena destruction. A short audit that each dungeon's channel
    values actually *show up* in a capture is still worth an afternoon —
    test the bake, not the table — but there is no build work here.

### Tier 4 — Depth (ongoing)

12. Bosses average ~2.5 committed attacks; four still have two. Finish them.
13. **Fix the density probe before trusting it again** — see below.
14. A proper ending sequence and credits.

#### A measurement tool that has quietly started lying — FIXED 2026-08-11

`content-density.mjs` prints `CryptWarden ········ 0 action(s)` — the tutorial
boss, the first fight in the game, apparently empty.

**It isn't.** I checked the source. The Warden has three actions (`slam`,
`sweep`, and a phase-2 expanding `ring`), and it is the *only* boss in the
roster built the newest and best way: `defineActions()` + `actIfReady()` +
`chooseAction()`, with the base class making the commit. The other thirteen
still call `this.startAction(` inline.

The probe counts the string `this.startAction(` per class body. Its own comment
says *"`startAction` is the ONLY way a boss commits to a telegraphed attack"* —
which was true when it was written and is false now.

So: **the probe scores zero for the one boss that was refactored properly, and
its comment asserts the thing that makes it wrong.** Left alone, it will keep
telling every future session that the first boss in the game is empty, and
someone will eventually "fix" a boss that was already finished.

Nothing about the game is broken here. But this project's whole method is
*measure, don't cite*, and one of the measuring instruments has drifted.

> **Fixed.** The counter now reads action DEFINITIONS rather than one call site,
> so both architectures count and the union is the moveset — a boss migrating
> from one to the other no longer changes its number. `CryptWarden` reads 3, the
> roster total went 32 → 35, and the census surfaced a second omission nobody
> had noticed: `TriCompiler` is not a `BossBase` subclass, so the old probe
> filtered it out silently and then printed *"across 13 bosses"* for a
> fourteen-fight campaign. It is now named as unmeasurable instead of vanishing.
> `tests/game/boss-action-census.spec.mjs` is the alarm, and it has been shown
> to fail in both directions.
Re-point it at `defineActions` as well, and correct the comment.

Two small things in the same family, found while running all this:

- **`npm test` dirties your working tree.** `boss-e2e.spec.mjs` writes
  `assets/screenshots/leviathan-boss.png`, which is a committed file, so every
  full suite run leaves a modified asset in `git status`. Harmless, but it
  trains you to ignore a dirty tree — which is exactly the habit that lets a
  real accidental change ride along in a commit. Write it to `tmp/` instead.
- **The certification captures are the only place the game is looked at, and
  they deliberately hide the HUD** (`hud.setHidden(true)`, for good reasons —
  you cannot judge camera framing through a dialogue box). Which means the
  single worst-looking thing in the project is invisible to the one process
  that exists to look at it. Add two captures per release that keep the HUD on.

---

## 6. What NOT to do

I want to be as clear about this as about the rest, because this project's
failure mode is *not* laziness — it is doing more excellent work in the place
where excellent work is already done.

- **Do not write more tests before Tier 1.** The suite is not the problem. It
  is at 3,962 and the map is a rectangle. Tests cannot see any of this.
- **Do not add systems.** You have more machinery than authored content that
  uses it. `pushable-block`, `gear-system`, `light-line-system` and
  `fluid-plane` are each imported by exactly one file.
- **Do not add post-processing.** No depth of field, no motion blur, no
  chromatic aberration. `ROAD-TO-TEN` F3 already made this call and it was the
  right one. The frame does not need more filters; it needs things in it.
- **Do not refactor anything.** The architecture is fine. It is not what is
  holding you back.
- **Do not start Tier 2 before Tier 1 ships.** A gorgeous world seen through a
  debug overlay is still a debug overlay.

---

## 7. Where this lands if we do the work

| | now | after Tier 1 | after Tier 2 | after Tier 3 |
|---|---|---|---|---|
| Stranger's first-10-seconds verdict | "unfinished" | "oh, this is a real game" | "who made this?" | "wait, *two* people?" |
| Honest score | 3/10 | 6/10 | 7.5/10 | **8.5/10** |

**8.5 is the ceiling for two people, and 8.5 is** ***Tunic***. That is not a
consolation prize. It is the actual target and it is four to six weeks of
focused work away, because — and this is the genuinely good news — **the hard
part is already done.**

You have a working 3D engine, 14 dungeons, 14 bosses, a generated score, a
combat system with honest rules, a 49-screen overworld, and 60 fps with 98% of
the GPU unused. Almost everything I have listed is *finishing*, not building.
Most projects that look like this from the outside are hollow inside. This one
is the exact opposite, which is a much better problem to have and a much
cheaper one to fix.

**The renderer is done. The rules are good. What is thin is the last five
percent — and the last five percent is the only part the player ever sees.**

---

## 8. How we'll know it worked

Same way you've checked everything else here: measure it, don't claim it.

- `ΔL*` between actor and floor **≥ 20 in every region**, as a certification
  gate, failing the build like the luminance gate does.
- **Zero developer-facing strings** on screen during normal play.
- The 44 certification captures re-shot, and — trap 8 — **looked at**.
- One measured pass on real hardware after Tier 2, since verticality and props
  are the first things in this project's history that will actually cost frame
  time. You have 98% headroom, so I expect it to be free; measure anyway.

---

### Appendix — how I got these numbers

Everything above is reproducible:

```bash
npm test                                  # 4826/4826 (unit + browser E2E)
npm run test:unit                         # 3962/3962
node tests/qa/content-density.mjs         # encounters, bosses, puzzles, bestiary
node tests/qa/silhouette-contrast.mjs     # actor/floor separation in shipped frames
node tests/qa/frame-rate-real-gpu.mjs     # headed Chrome, real GPU, frame percentiles
node tmp/_playtest-capture.mjs            # a played session -> tmp/playtest/*.png
node tmp/_map-recheck.mjs                 # the map, with the map pickup held
```

All four of the new ones were written today and are print-only. I promoted
`silhouette-contrast.mjs` into `tests/qa/` because it is the measurement that
would have caught the 0.4, and because it belongs beside the other probes
rather than in scratch. It re-runs stable (7.1 / 7.2 across two runs; the
difference is screenshot antialiasing).

**It is a probe, not a gate.** Turning it into a gate is Tier 1 item 3 — pick
the floor value, wire it into the suite, then break the rim on purpose and
watch it fail before believing it (`HANDOFF.md` trap 10).

The three in `tmp/` are throwaway and `tmp/` is already gitignored. Nothing in
the game was modified to produce any of this — the only file I added outside
scratch is the probe, and it neither imports into nor is imported by the game.
