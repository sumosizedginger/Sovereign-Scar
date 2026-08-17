# The boss pass — what is left, and exactly how to do it

Six of fourteen are rebuilt and owner-approved: Crypt Warden, Obsidian
Arachnid, Magma Wyrm, Leviathan Core, Phantasm, Sludge Golem. The Skeletal
Mantis needs nothing and never did. **Seven remain.**

This document is the method that survived those six, the traps each one cost,
and a per-boss plan with the numbers already measured. It exists because the
first three bosses took four to six passes each and the last three took two —
almost all of the difference was knowing the things written down here.

Reproduce every current-state figure with:

```bash
node tests/qa/boss-portraits.mjs --set=roster     # all fourteen, 3 images each
node tests/qa/boss-portraits.mjs --only=13        # one, for a single sitting
node tests/qa/boss-silhouette.mjs                 # hitbox vs body, print-only
```

---

## 1. The recipe, in the order that works

Every step here exists because skipping it cost a rebuild.

1. **Shoot it first and look.** Never design from the source. "They are all
   blobs" was wrong in both directions — the Mantis already read, and the
   Arachnid had eight legs nobody could see.
2. **Read the boss class and list the moves it actually has.** `ROAD-TO-AAA`
   once proposed building vents for a Wyrm with no burrow move. Shape for what
   it does.
3. **Get the ANATOMY right before any detail.** This is the whole game. Thin
   legs did nothing for the spider until its legs moved onto its thorax; the
   Golem stayed a teapot until it got shoulders and two arms.
4. **Then thin the limbs, at `LIMB_VOX_PER_UNIT`.** See trap 2.
5. **Check the `-ingame` frame, not the portrait.** They disagree, and the
   portrait is the liar — it is shot close, so perspective magnifies whatever
   is nearest the lens.
6. **Re-run `boss-reach-e2e` before believing you are finished.** Art changes
   have broken combat rules three times in this pass. The unit suite cannot see
   any of it.

---

## 2. The traps, with the numbers that found them

**1. Colour is baked in LINEAR light.** `0x2b2015` — a reasonable dark brown on
a picker — arrives in the mesh as **(6, 4, 2) of 255**. Against an albedo that
near black, 0.05 of emissive is not a tint, it is the dominant hue: the Golem
was painted brown and rendered olive, twice. *Keep emissive off the mass. Light
belongs in seams, cores and eyes.*

**2. There is a 0.5-unit floor on every dimension.** `cells()` clamps at one
voxel, so at `VOX_PER_UNIT = 6` everything from 0.12 to 0.34 comes out at
**exactly 0.500**. Three "thin the legs" passes on the spider and four
"reposition the arms" passes on the Golem were literal no-ops. Pass
`LIMB_VOX_PER_UNIT` (18) to `voxBox` / `voxBlob` / `voxSphere` / `voxSpike` for
anything meant to read as a line.

**3. Width across the screen is the only free axis.** A boss facing the player
sits at `rotation.y = 0`, so world **+X runs across frame at full length** while
**+Z runs at the lens** and is crushed by the 70.7° pitch. Three separate limbs
have been lost to being pushed "forward to use the depth": the Warden's blade,
the Wyrm's snout, the Golem's arms.

**4. A wide plate at the top of a body is a roof.** At this pitch the shoulder
yoke occludes everything under it. The Golem's first humanoid build hung both
arms *inside* a plate that spanned wider than they did, and photographed as a
bare slab with a head on it. **Every limb must break the silhouette of whatever
is above it.**

**5. Same hue as the room = invisible.** The Wyrm was orange on the magma floor;
the Golem was `ABYSS_COLORS.sludge` in the sludge room; the Witness is magenta
in a magenta room *right now*. Check the kit in `levels/dungeon-kits.js` before
picking a palette, and go dark against it with the accent in the seams.

**6. Span is a fight number, not an art number.** `boss-reach-e2e` measures
whether there is anywhere to stand that is outside the body and still in range.
Widening a boss slows the player's orbit and can close a flank window. Fix by
moving the ART; a hitbox is a fight number. Held weapons count as silhouette.

**7. The probe was shooting mid-turn** (fixed 2026-08-16). It parked the player
once and ticked 40 frames; a boss needing 2 radians at 1.6 rad/s never finished,
so bodies built wide across X presented their narrow side. It now re-parks the
player every frame over 150 ticks. *If a boss looks inexplicably wrong, suspect
the instrument before the model — that has been the answer more often than not.*

---

## 3. The seven, in the order to do them

Sizes are from the roster shoot; bands are from `boss-reach-e2e` (floor 0.6).

### 13 — GUMOI Witness · **do this first**

*Now:* a plain bright-magenta ball, 5.63 wide, 24% of frame. **The room's accent
is `0xff40c8` — the same magenta.** The second-to-last boss in the game is
painted the colour of its own arena.

*Does:* `index-sweep` (a scanning lane), `cite-slam` / `cite-cone` /
`cite-breath` — it performs telegraphs **borrowed from earlier bosses** — and
`bolt`. Its own comment calls it *The Eye That Renders*. It hovers ~7 units up,
which is why it is exempt in `boss-reach-e2e` (a floor-level probe cannot reach
it); `boss-quality-e2e` covers it instead.

*Build:* **an index, not an eye** — the Leviathan is already the eye and two in
a row would read as one boss twice. A suspended **card catalogue mid-explosion**:
a dense dark core with flat glyph-plates hanging around it at different radii and
angles, held in place by nothing. A hard bright **scan bar** across the plates is
the `index-sweep` drawn on the body. When it cites, plates turn edge-on and
flare — the quotation made visible.

*Palette:* near-black indigo plates, edges lit in the room's magenta so it reads
*against* the arena rather than into it. Cold white for the scan bar.

*Constraints:* it hovers, so the plate spread is cheap — no floor-level reach
band to protect. Keep the core small; the plates carry the silhouette. Watch the
bloom cap (0.55) since this one wants a lot of edge light.

*Risk:* low. No reach gate, no directional armour. **Effort: one sitting.**

### 10 — Frost & Fuel

*Now:* two separate balls, one orange one cyan, 5.57 wide. Band **1.62**, edge
3.59, damage stops 5.21 — lots of headroom.

*Does:* two heads that cast opposing hazards, and `twinned` (phase 2) fires both
at once into opposite halves. The two hazards **interact** — fire melts ice, ice
quenches fire — and its source says that interaction is the whole reason it has
two heads.

*Build:* **one creature cleaved down its length.** A single body, ice-rimed and
cracked on one side, molten and scorched on the other, joined by a seam that
steams where they meet. Two heads on one neck-line rather than two floating
orbs. The seam glows hottest during `twinned`.

*Constraints:* the `CONTRAST` comment pins a 2.5:1 emissive ratio between the
halves inside the bloom cap — preserve it, it is what keeps the two hazards
readable apart. Keep the two heads' world positions where they are if anything
aims from them.

*Risk:* low-medium — check nothing aims from the individual head meshes before
merging them onto one body. **Effort: one sitting.**

### 07 — Hydroid Cloud

*Now:* twelve orbs, 4.7 wide, reading as a cloud/ring. Band **3.37**, the most
generous on the roster.

*Does:* `orb-shed` (a pulse centred on the cloud) and `rainfall` (phase 2). The
orbs are real and are animated individually.

*Build:* **a jellyfish.** Keep all twelve orbs — they are the mechanic — but
give them something to hang from: a translucent bell above, with the orbs slung
beneath as a curtain. The bell contracts before `rainfall`, which turns the
tell into anatomy. From overhead you read a bright ring with beads under it.

*Constraints:* the orbs are positioned by `tickAI` every frame; the bell must be
a sibling, not a parent, or it will fight the orbit maths. Same lesson as the
Wyrm's chain.

*Risk:* low. **Effort: one sitting.**

### 05 — The Proxy

*Now:* a blob with a gold ring, 5.47 wide. Band **0.84** at 90° — the tightest
of the remaining, so this one has the least room to grow.

*Does:* `bolt`, `mirror-volley`, and `proxy-swap` (phase 3) — *it changes bodies
mid-wind-up*. Its own note: **the BODY lies, the GROUND never does.**

*Build:* **a funeral mask with nobody behind it** — a hanging gold face inside
its existing tilted ring, with a dark drape suggesting a body that is not there.
The decoys are identical masks, so "which one is real" becomes a question you
can ask by looking. The mask is the lie; the telegraph on the floor stays honest.

*Constraints:* band 0.84 leaves **0.24 of growth** before the floor. This is a
re-shape, not an enlargement. Keep the ring — it is already the best part.

*Risk:* medium, purely because of the tight band. Measure after every change.
**Effort: one sitting.**

### 02 · 03 · 04 — Tri-Compiler, Sand Spur, Kinetic Core

*Now:* 2.93, 3.62 and 2.88 wide — **12–15% of frame**, the three smallest on the
roster. They do not read as bosses mainly because they are *small*, and two of
them live in their own files (`sand-spur.js`, `kinetic-core.js`).

*Does:* the Tri-Compiler is a three-core assembly with a beam cycle and a
`converge` slam; the Spur burrows and surfaces (`sand-wake`, `breach`); the Core
bounces off walls (`shockring`, `fission`).

*Build:* presence before detail. Each needs to occupy more of its arena before
any shaping is worth doing — and each has room: the Spur's band is 0.74 (tight,
careful), but the Tri-Compiler sits at **1.49** and the Kinetic Core at **1.67**
with edges of only 1.46 and 1.08. Grow first, measure, then shape.

*Risk:* medium — these are the three with the most unusual movement, and two are
outside `roster.js`. **Effort: one sitting each, three total.**

### 08 — Skeletal Mantis · **do nothing**

It reads instantly and always did. It is the reference: splayed scythes with
background between them and the body. Leave it.

---

## 4. Where this sits against v1

The boss pass is one of eight items on the agreed v1 list. It is **not** the most
valuable one and should not be allowed to crowd out the rest:

| item | state |
|---|---|
| Distribution live (Pages + a release) | **blocked on a push** — the only item nothing else can substitute for |
| Boss silhouettes | 6 of 14 done; 7 planned here; 1 exempt |
| Occlusion | not started — agreed to land BEFORE the combo work |
| Combo system | not started, riskiest item in v1 |
| 80% room variation (wall/ceiling height) | not started |
| In-engine key art + composed title camera | not started |
| Ambient sway (dressing mesh + vertex displacement) | not started |
| Doc truth pass + licence line | camera correction done; licence line outstanding |
| Tester round folded back in | waiting on distribution |

**Seven sittings of boss work is a lot of runway.** If the choice is between
finishing the roster and getting the game in front of testers, testers win —
five of the six rebuilt bosses have never been seen by anyone in an actual
fight, and this project's entire history says the fight is where the real
defects are.

*Suggested interleave:* the Witness (worst offender, one sitting) → push and
tester round → occlusion → the remaining six bosses in the gaps.
