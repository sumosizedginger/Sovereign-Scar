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

### 1. You still cannot tell which figure is you

The only item from the finishing pass that did not close. In greyscale, in a
crowded room, the hero is legible against the *floor* and not against the eight
other figures. Colour is currently the only thing separating you, and colour is
the weakest of the three cues and the one that fails for colour-blind players.

*Measured:* `docs/media/player/after/09-town-grey.png`.
*Cost:* an afternoon. Three costed options in
`docs/FINISHING-PASS-2026-08-11.md` §D5 — bigger cloak first, it is free and
reversible.
**Nothing else on this list should start before this one.** Every remaining
item puts *more* things on screen to lose yourself among.

### 2. Rooms are boxes

Ninety-nine rooms, and every one is a flat floor inside a rectangular wall. It
is the single largest visual difference between this and a commercial
top-down game, and it is visible in literally every screenshot.

The verticality work exists — `world/terracing.js` is written, tested, and
applied. It is just quiet: raised steps and pits, no ledges you climb to, no
sightlines that hide a room's second half until you walk in.

*Cost:* real, per-dungeon design work plus a traversal re-audit (this is
`docs/OPEN_QUESTIONS.md` §3, still open and correctly identified there as the
one thing that cannot be applied globally). Weeks, not days — but it is the
highest-value week on this list.

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

### 6. A third of the bestiary runs at a third of its depth

*Measured:* the matrix in the same probe — **and it was lying until today**, see
`docs/WIRING-AUDIT-2026-08-12-PASS2.md` §B.

```
39 of 54 kind × behaviour combinations authored (72%)
weaver:  3 spawns, default AI only
censer:  3 spawns, default AI only
```

Seven enemy types get five behaviours between them. Two get one. The weaver's
web and the censer's heal/shield are fully implemented — constants, AI branches,
coach lines and all — and the campaign asks for neither more than three times.
**This is free content already paid for.**

### 7. Three world systems each appear in exactly one dungeon

```
gear-system         beat-02 only
light-line-system   beat-12 only
fluid-plane         beat-11 only
```

Each was built, tested, and used once. A mechanic a player meets once is a
curiosity; a mechanic that returns, changed, is a *language*. This is the
cheapest content-per-hour on the entire list because the hard part is done.

(And the light-line one currently rewards you with nothing — audit pass 2 §A.)

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

### 10. The installer is unsigned and has no icon

Windows shows an "unknown publisher" warning to everyone who downloads it, and
the taskbar entry is the stock Electron diamond. This is the first impression
*before the game runs*, and it currently says "hobby project" as loudly as
anything in Tier 1.

*Cost:* the icon is an afternoon. Signing costs money, not time.

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
