# What is actually stopping this from being AAA

Written 2026-08-12, after two wiring audits and the player-facing finishing
pass. Scope limit taken seriously: **only things two people can do inside this
repository**, with the engine folders frozen, no new art pipeline, no bundler,
no team of artists. Anything needing a studio is listed at the bottom as out of
bounds rather than pretended away.

Ordered by **what a stranger notices first**, because that is the order that
decides whether they keep playing. Every number below is measured, not
estimated, and the measuring command is named so the next reader can check.

---

## The one-line answer

The game is **built**. What it lacks is **variety and density of experience** —
almost every gap below is the same shape: a system that works, used once, at a
third of its capacity, in a space that is a box. None of it is blocked by
engineering, and none of it is blocked by performance. The frame budget is at
**2%**.

---

# TIER 1 — the first ninety seconds

### 1. ~~You still cannot tell which figure is you~~ — WITHDRAWN

**I was wrong about this, and it was the premise for three separate builds.**

The claim came entirely from **static greyscale screenshots**. The owner, who
has actually played the game: *"I guarantee you a player can tell the difference
between the player and the enemies."*

They are right, and the reason is not subtle once said out loud: **the figure
that answers the controller is the player.** Every frame, unmistakably, for
free. A still frame cannot contain that cue, so a still frame is the wrong
evidence for this question — and I built an inverted-hull outline and then a
cloak on the strength of it, and both were rejected on sight.

What survives from the three attempts:

- **The separation light stays.** It is genuinely better than the old fresnel,
  which was geometrically defeated by the camera, and it lifts the hero off the
  floor in the rooms that measured worst. It is a lighting fix, not an
  accessory.
- **A real rendering bug got found**, which is the only thing the cloak was
  actually worth — see below.
- **Both accessories are gone**, pinned off by spec so neither returns by
  accident.

**If hero readability ever does need more**, the direction is the owner's, not
mine: **change the player model** — proportions, stance, head shape, so the hero
is a different silhouette rather than a normal one wearing something. That is
art work on the frozen part builders' output and it is a real project, not an
afternoon.

### 1b. The player's contact shadow was drawn at chest height — FIXED

The cloak's one contribution. A wide flat surface finally gave the shadow disc
something to visibly cut across, and the owner spotted it immediately: *"the
shadow circle literally goes over the cape."*

Measured in the running game:

```
player feet          y = 1.001
player shadow disc   y = 1.981     ← 0.98 above the feet, i.e. mid-chest
enemy feet           y = 1.000
enemy shadow disc    y = 1.030     ← correct
```

Enemy rigs are built with `groundOffset: 0`, so their origin is already on the
floor and their discs were right **by luck**. The player's origin is the centre
of the physics body, 0.95 above the feet, and the disc followed the origin.
It has been like that since contact shadows shipped, invisible because it sat
inside the player's own silhouette.

Fixed by having every rig publish where its own feet are
(`root.userData.ssGroundOffset`) and having the shadow field read it, so a
future actor with a different origin is right without anyone remembering.
Gated at **both** ends — the first version of the spec only checked that the rig
published the value, and deleting the line that *reads* it left the suite green.

### 2. Rooms are LOW, not flat — I got this wrong and the owner caught it

**The original claim in this document was that "every room is a flat floor
inside a rectangular wall." That is false, and I never measured it before
writing it.** Measured now, across all 108 rooms, by walking the baked voxel
world and finding the standable height of every cell:

```
rooms with raised floor        100 of 108   (93%)
mean raised area per room                    17%
heights reaching 3 cells or more   34 rooms
tallest single room     beat-13 indexspire — six distinct levels (0/1/2/3/4/5)
```

Reproduce: `node tmp/measure-flat.mjs` (the probe is in `tmp/`, not committed —
the numbers above are the record).

So the terracing is real, it is everywhere, and it is doing work. What is
actually true is narrower and it is worth stating precisely, because the
imprecise version would have sent weeks in the wrong direction:

- **The steps are one or two cells.** `terracing.js` says so in its own header
  and explains why — it may only ADD, one cell at a time, so that nothing it
  generates can make anywhere unreachable. That constraint is correct and it is
  what made the feature safe to apply campaign-wide. It also caps how much
  drama it can produce.
- **They are ledges, never pits.** Again, the file says so. A sunken middle
  would read far better and needs a per-room traversal audit by hand.
- **Three shapes, chosen by hashing the room name** — dais, rim, steps. Varied
  enough that no two neighbours match; not authored, so no room's shape means
  anything about that room.
- **The perimeter is still a rectangle** in every room. The elevation varies
  inside a box whose outline never does.

So the honest version of this item is: *the floors have relief; the SPACES do
not have shape.* The fix is not "add verticality" — that shipped. It is
authored rooms: an L, a room you enter on a balcony above, a pit you drop into
and climb out the far side.

*Cost:* real, per-dungeon design work plus a traversal re-audit — this is
`docs/OPEN_QUESTIONS.md` §3, still open and correctly identified there as the
one thing that cannot be applied globally. Weeks, not days.

*Lesson, logged:* I wrote a confident sentence about 99 rooms from looking at
about six screenshots. "Count, do not cite" applies to my own prose hardest of
all, and the owner having played the game beat my having read it.

### 3. Nothing moves that you did not move

No ambient life. Doors do not creak open, banners do not drift, dust does not
fall, water does not ripple until you touch it. The lighting is static per
room. A still frame of this game and a moving frame of this game look nearly
identical, which is the definition of a world that does not feel inhabited.

`fx/atmosphere.js` exists and is wired; it is doing very little.
*Cost:* days. Cheap and disproportionately effective — this is the classic
"looks twice as expensive for 2% of the work" lever.

### 4. The title screen and menus are the last debug surface

The HUD got fixed. The menus did not — they are still text rows in a monospace
list. It is the literal first thing anyone sees, before the game renders a
single frame.

*Cost:* days. Same information-design job the HUD just had, and the pattern
now exists to copy.

---

# TIER 2 — the first hour

### 5. Fights are small, and the same size every time

*Measured:* `node tests/qa/content-density.mjs`

```
125 enemies across 47 rooms — mean 2.66 per room
21 of 47 rooms hold exactly two
peak across the entire campaign: 5, once, in beat 13
```

Two enemies in a room is a skirmish, not an encounter. And the peak barely
moves across fourteen dungeons — beat 01 peaks at 2, beat 14 peaks at 4. The
difficulty curve rises through *statistics* (HP, damage) rather than through
*situations*, which the player experiences as the same fight getting spongier.

*Cost:* days, and it is authoring, not engineering. The encounter director,
the elites and the arena seals are all already built.

### 6. ~~A third of the bestiary runs at a third of its depth~~ — DONE, and the fix in this section was wrong

**Do not do what this section originally said.** It read:

> Seven enemy types get five behaviours between them. Two get one. […] **This
> is free content already paid for** — fill the empty cells in the kind ×
> behaviour matrix.

Writing `ai: 'chase'` on a weaver **deletes its web**. The web and the cense are
implemented *inside* `_aiWeave` and `_aiCenser`, so an `ai:` override does not
add a behaviour to a specialist — it removes the only one it had, and leaves a
monster that looks identical and does nothing special. Their empty matrix row is
**correct by design**, and the matrix was the wrong instrument for the question.

Measuring before implementing is the only reason this was caught, and it is the
whole argument for the rule: *this document was the source of the bad advice.*

**What was actually missing was company.** These two are the only kinds whose
design is about the *other* things in the room, so a specialist alone is a
specialist switched off. In particular:

> **No censer had ever been placed in a room with a bulwark.** The "a room with
> a live censer cannot be ground down" puzzle its own source describes had never
> once been posed against something armoured, in fourteen dungeons.

Fixed 2026-08-12: weavers and censers 3 → 6 spawns each, sited beside closers
and armour respectively. `bestiary.spec.mjs` now pins that no specialist is
alone, that each is inside its *real* working radius (`CENSE_R`, `WEB_LEN`,
imported rather than restated), and that its AI is never overridden. On its
first run that gate failed a pre-existing beat-13 censer authored **7.62 units
from both allies against a 7.0 radius** — unable to heal or shield anything
since the day it was written.

### 7. Three world systems each appear in exactly one dungeon

```
gear-system         beat-02 only
light-line-system   beat-12 only
fluid-plane         beat-11 only
```

Each was built, tested, and used once. A mechanic a player meets once is a
curiosity; a mechanic that returns, changed, is a *language*. This is the
cheapest content-per-hour on the entire list because the hard part is done.

(The light-line one used to reward you with nothing — audit pass 2 §A. Fixed
2026-08-12: the Vector Staff now gates the beam, proven in the running game as
no staff → 0 lines, staff → 1 line. The system still appears in one dungeon.)

### 8. One attack button, no combo, no reaction

*Measured:* the probe's PLAYER VERBS section — four melee weapons, one attack
each, no combo strings, no directional finishers. Enemies have wind-ups and
telegraphs; the player has a swing.

Hit-stop and impact FX exist (`fx/juice.js`, `fx/impact.js`). What is missing is
*conversation*: a two-hit string, a heavy follow-up, an enemy that visibly
staggers differently to a parry than to a hit.

*Cost:* a week, and it touches the most-tested code in the repo, so it is the
riskiest item here. Worth doing after Tier 1.

### 9. Boss arenas are the same room as everything else

Fourteen bosses, all with real movesets (35 committed attacks, mean 2.7 —
`content-density`). They fight in the same rectangular box as the trash mobs.
A boss arena that is shaped *by* the boss — pillars for the Arachnid, vents for
the Wyrm — does more for a fight than another attack would.

---

# TIER 3 — release credibility

### 10. The installer is unsigned ~~and has no icon~~

**The icon is done (2026-08-12).** `npm run icon` builds `assets/icon.ico` at
16/32/64/128/256 from `scripts/make-icon.mjs`, `build.win.icon` points at it,
and its bytes were confirmed embedded in all three shipped `.exe`s rather than
merely "the build stopped warning". `tests/game/app-icon.spec.mjs` regenerates
from the script and compares, so the binary cannot drift from its source.

**Signing is still open, and it is the bigger half.** Windows shows an "unknown
publisher" warning to everyone who downloads it. Nothing in this repo can
substitute for a certificate.

*Cost:* signing costs money, not time.

### 11. There is no store page, and the screenshots would not sell it

Every image the project has of itself is a 30-pixel character in a room. Key
art — a rendered hero at full size — is a completely different object and the
one thing Blender is genuinely the right tool for.

### 12. The game has never been played start to finish by a human

`docs/OPEN_QUESTIONS.md` §4, open since Phase R, and the single largest unknown
in the project. 4,911 automated assertions cannot tell you whether the second
hour is boring. **Nothing on this list should be trusted over one playthrough.**

---

# What is NOT stopping it

Worth saying plainly, because it is where effort would be wasted:

- **Performance.** 60 fps locked, 47–51 draw calls, ~2% of the budget. Every
  item above is affordable several times over.
- **Engineering quality.** 4,911 assertions, counterfactually proven gates, a
  documented trap list. This is better instrumented than most shipped games.
- **Systems coverage.** Guard, parry, lock-on, 9 enemy kinds, 14 bosses, item
  chains, puzzles, scoring, three run modes, saves, Electron packaging — built.
- **The camera.** 56° is a deliberate, defensible choice and the owner likes it.
  Leave it.
- **Audio.** A generated adaptive score with proven dynamics. It needs more
  variety, not repair.

---

# Honest verdict

Against the `AAA.md` scale:

| | then (2026-08-11) | now |
|---|---|---|
| engineering | 8.5 / 10 | 8.5 / 10 |
| presentation | 3 / 10 | **5.5 / 10** |
| content density | — | 4 / 10 |

The presentation number moved because the HUD stopped looking like a debug
build and the hero stopped dissolving into the floor. It stops at 5.5 because
the *world* has not changed: boxes, still, empty.

**"Holy shit AAA" is not reachable by two people, and it is not the target.**
What is reachable — and what Tier 1 plus items 5–7 would buy — is a game that a
stranger cannot immediately tell was made by two people. That is roughly 7/10
presentation, and on this evidence it is maybe six focused weeks away, of which
**the first afternoon is item 1**.

---

# Out of bounds (for honesty, not for the list)

Motion-captured animation · voice acting · hand-modelled or hand-painted art ·
cinematics · localisation · console certification · a marketing budget. Each is
a genuine gap between this and a commercial release, and none is a thing this
repository can close.
