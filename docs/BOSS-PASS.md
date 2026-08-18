# The boss pass — what is left, and exactly how to do it

**ALL THIRTEEN ARE REBUILT**, and the Skeletal Mantis — which needs nothing and
never did — is the fourteenth. The boss pass is finished.

This document stays as the method and the trap list, because the traps are not
about bosses: they are about this camera, this renderer and these instruments,
and the next body anyone builds in this game will meet them again.

It is the method that survived all thirteen, the traps each one cost,
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

**2b. The same rounding eats GRADIENTS, not just thin parts** (found 2026-08-17,
and it is the more expensive half). `cells()` rounds a radius to whole voxels, so
below half a unit the body grid offers three sizes and nothing between. The
Wyrm's five segments were authored 0.46 → 0.188, a body that more than halves,
and built **1.17, 0.83, 0.83, 0.83, 0.50** — three of five identical, one of them
63% wider than asked. Nothing looked thin, nothing hit the 0.5 floor, and the
taper simply was not there. *The Hydroid's orbs and the Proxy's hoop were the
same call.* **A series of sizes needs enough voxels to spell the difference
between its members**: check what was built, never what was typed.

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
the Golem was `ABYSS_COLORS.sludge` in the sludge room; the Witness was
`0xff40c8` in a room whose accent is `0xff40c8`. Check the kit in
`levels/dungeon-kits.js` before picking a palette, and go dark against it with
the accent in the seams. **Or go hotter:** the Wyrm's fix was not a different
hue but a higher temperature — gold fissures on black crust, brighter than the
ember pools it swims past rather than the same colour as them.

**Now gated across the whole roster, and the measurement was worth taking.**
`boss-bodies.spec` checks every boss against its own kit accent — the kit looked
up through `LEVELS[].bossId` rather than a typed table — and reports the share
of the body within 0.12 of it. The result is bimodal and leaves no judgement
call:

| | nearest | share |
|---|---|---|
| thirteen bosses | 0.25 – 0.97 | **0.0%** |
| Skeletal Mantis | 0.001 | 59.3% |

There is no middle ground, because the defect is always the same mechanical
act: the kit's accent constant gets typed into the boss. **Five of fourteen did
it** — the Witness, the Proxy, the Sand Spur and the Magma Wyrm are all fixed
and their entries REMOVED rather than loosened (the Spur went from 88.8% at
0.014 to 0.0% at 0.345; the Wyrm from 39.7% at 0.013 to 0.0% at 0.411). One
exemption remains, recorded with its reason.

- **Mantis — accepted.** It is the reference silhouette and the one body nobody
  has asked to change. It reads on SHAPE, which is exactly the property that
  makes sharing a hue survivable, and a bone skeleton in the Bone Forest is the
  right answer anyway. *A gate that failed the best boss on the roster would be
  the wrong gate.*
- **Wyrm — fixed 2026-08-17.** This document had listed "the Wyrm was orange on
  the magma floor" as a FIXED example of this trap while two fifths of the body
  sat within 0.013 of the pyre accent — the maw and all five dorsal fins were
  `0xff5a18` against a kit accent of `0xff5520`. The heat is gold now
  (`0xffbe3d`), 0.411 away: **hotter than the room rather than the same
  temperature as it**, which is also what lava actually looks like — black
  crust, white-hot fissures. *A doc claiming a fix is not a fix; this entry
  existed for four days because nobody measured the thing the sentence named.*
- **Sand Spur — fixed.** It was the worst on the roster at 88.8%; the rebuild
  put it at 0.0%, so the exemption is gone. An exemption that is no longer
  earned gets removed, which is the only direction a ratchet may move.

**6. Span is a fight number, not an art number.** `boss-reach-e2e` measures
whether there is anywhere to stand that is outside the body and still in range.
Widening a boss slows the player's orbit and can close a flank window. Fix by
moving the ART; a hitbox is a fight number. Held weapons count as silhouette.

**7. The probe was shooting mid-turn** (fixed 2026-08-16). It parked the player
once and ticked 40 frames; a boss needing 2 radians at 1.6 rad/s never finished,
so bodies built wide across X presented their narrow side. It now re-parks the
player every frame over 150 ticks.

**And it was lying about the Tri-Compiler in two more ways** (fixed
2026-08-17). That boss is the only one that does not extend `BossBase`: its
`root` is `cores[0].root`, so the shot framed one core of three, and it exposes
`update` rather than `tickAI`, so `boss.tickAI?.()` matched nothing and the
assembly was never ticked at all. The optional chain made the second one silent.
Corrected, the boss went from "2.93 wide, 12% of frame" to **10.33 wide, 43%** —
from the smallest thing on the roster to the largest.

**And a third instrument had the same blind spot, in the game's own debug
hook.** `__ssDebug.measure()` did `out.boss = box(b.root)`, which
`visual-sanity`'s "boss silhouette dominates" gate reads — so for the same two
bosses that gate has been asking whether a THIRD of a boss out-spans the trash
mobs. Corrected, the Tri-Compiler reports 10.79 where it used to report one
core. The Sand Spur also needed its MOUND included, because while it is burrowed
every segment is hidden and the mound is the only thing on screen.

**So the same defect appeared in three separate instruments, written at three
different times, and every one of them was `root`-only.** `TriCompiler.root` is
`cores[0].root`; `SandSpur.root` is `segments[0]`. Anything that measures a boss
must collect `root` **plus** `cores` / `segments` / `segs`, and the Spur's
`mound`.

*If a boss looks inexplicably wrong, suspect the instrument before the model.
Across this pass that has been the answer more often than not, and every time it
was, the instrument was quietly measuring something other than the boss.*

**8. Same IDEA as the room is invisible too.** Trap 5 one level up, and it cost
a whole discarded design. The first Witness rebuild was glyph plates with a scan
bar; the kit for that room is already `index_rails`, `glyph_stacks`,
`scan_lines` and an `index_scan` atmosphere. *Read the kit's `structural` and
`dressing` lists before designing the boss, not just before picking its colours
— whatever is in them is what the boss must not be made of.*

**9. A body with a front needs an axis to keep it.** The Witness rolled on X and
Y at once, which is fine for a featureless disc and fatal for anything with a
face: with an X roll no direction stays "up", so nothing can be aimed and half
of it always looks at the floor. Spend the second axis on aiming and keep one
slow turn.

**10. `bodyRadius` is a p85 over VERTICES, on a body warmed for 2s.** Two traps
in one. Mass distribution decides it, not size: a ring of parts puts every
vertex at the rim and fails at the same overall width a solid body passes at,
and adding mass at the centre does nothing unless it also outvotes the existing
vertices. And because `boss-bodies.spec` runs 40 `update` steps first, a boss
that changes shape when it attacks is graded in its ATTACKING pose — which is
right, but it is not what `boss-silhouette.mjs` reports. *Tune against the spec.*

**11. A gate that reads `material.color` on a voxel mesh reads white.** Every
`boss-models` builder is `vertexColors: true` with no `color` set, so colour
lives in the geometry's `color` attribute. The first room-clash check walked
materials, found white fourteen times, and passed a boss painted the room's
exact magenta on purpose. `THREE.Color(hex)` already converts sRGB to linear —
converting again moved the accent 0.27 away from itself and let the same
counterfactual through a second time. *Break every new gate before trusting it.*

**12. A part that must be SEEN has to sit past the surface it is mounted on.**
Enlarging Frost & Fuel's skulls left the glow mesh inside the skull, and the one
light that tells you which head is armed silently disappeared. Nothing errors,
nothing dims — the mesh is simply interior. *When a body part grows, re-check
every child that was flush against it.*

---

## 3. The rest, in the order to do them

Sizes are from the roster shoot; bands are from `boss-reach-e2e` (floor 0.6).

### 13 — GUMOI Witness · **DONE** (2026-08-16)

*Was:* a plain bright-magenta ball, 5.63 wide, 24% of frame — and the room's
accent is `0xff40c8`, **the same magenta**. The second-to-last boss in the game
was painted the colour of its own arena, and every gate in `boss-bodies.spec`
passed it.

*Does:* `index-sweep` (a scanning lane), `cite-slam` / `cite-cone` /
`cite-breath` — it performs telegraphs **borrowed from earlier bosses**, quoted
from those bosses' own exported constants — and `bolt`. It hovers ~9 units up
and drops to head height only to cast, which is why it is exempt in
`boss-reach-e2e`; `boss-quality-e2e` covers it instead.

*Built:* **seven heads fused into one clenched mass, every one of them a draft
of the player's face at a different stage of being forgotten.** Not invented —
assembled out of three things the source already said:

- the overworld line for this beat is *"Seven voices aggregate"*
  (`narrative/thread-data.js`);
- GUMOI is the thing that has rebuilt the player after every death in the
  campaign, out of a memory that degrades — `reconstitution-copy.js` runs from
  *"Again. I still remember enough of you"* to *"One clean memory remains"*;
- the kit for `beat-13-gumoi` builds the room itself out of `displaced_copies`.

`WITNESS_DRAFTS` is that reconstitution ladder turned into four palettes: the
hero's own skin, then the warmth leaving it, then the eyes going out, then a
face most of the way back into the core that was trying to build it. Three more
heads never got a face at all. The remembered ones are built by
`createActorRig(HERO_RIG)` — the hero's actual head, same as the Phantasm, so a
re-proportioned player carries through instead of drifting.

**It opens when it comes down.** The fight's only vulnerable window is the
descent, and that was legible *only as altitude*, which at a 70.7° pitch is
close to unreadable. The heads now splay and the core lights whenever `busy` is
true — one condition driving the descent and the tell, so they cannot drift
apart. Deliberately **not** wired to `BossBase.weakOpen`: that pays a real 2x
and would roughly halve the fight, since the descent is the only window there
is. It says *"your sword works now"*, which is already true. Wiring it is one
line and is the owner's call.

*Measured:* **5.50 wide shut (23% of frame), 6.89 open (29%)** — the heads
travel +42%, which is unmistakable at gameplay size. Hitbox ratio **0.79**
against a 0.75 floor.

⚠ **That margin is thin, and the gate is subtler than it looks.**
`boss-bodies.spec` warms every boss for 2s of `update` before measuring, so for
this body it grades the **open** pose, not the resting one — correct (a swing at
an extended head should connect) but easy to misread. The QA probe measures the
resting body and reports 2.45 where the spec reports 2.63; tuning against the
probe over-clenched this boss by two passes. **Re-run the spec, not the probe,
after any change to `r0` or the open factor.**

*What it cost — four traps, three of them new:*

1. **The first idea was worse and had to be thrown out.** It was an exploded
   card catalogue: glyph plates on a dark core with a scan bar. The kit for this
   room is *already* `index_rails`, `glyph_stacks`, `scan_lines` and an
   `index_scan` atmosphere — the boss would have been built out of its own
   wallpaper. **This is trap 5 one level up: same IDEA as the room is invisible
   too, not just the same hue.** Read the kit before designing, not just before
   picking colours.
2. **Trap 1 caught me with the warning about trap 1 in the comment above it.**
   A `0x241b3a` core under 0.30 of violet emissive photographed as a flat
   lavender ball — albedo lands near 0.02 in linear light and the emissive near
   0.16, eight times stronger.
3. **A two-axis tumble and a face cannot coexist.** With an X roll there is no
   direction that stays "up", so heads cannot be aimed and half of them always
   look at the floor; the first shoot came back as a cluster of dark blue
   craniums. The X rate was spent on aiming the faces up 45° instead, leaving a
   slow survey turn. **A body with a front needs an axis to keep it.**
4. **`bodyRadius` is a p85 over vertices, so mass distribution decides it, not
   size.** A ring of heads put every vertex out at the rim: ratio 0.67 against a
   0.75 floor at the *same overall width* the old ball passed at. Growing the
   core did nothing — the four rig heads carry most of the vertices. The heads
   had to come in, which the design wanted anyway (shut is a knot; the span
   belongs to the open).

*Guarded by:* `runWitness` in `boss-bodies.spec.mjs` — seven heads, the clean
draft is `HERO_PALETTE.skin` itself, **no material within 0.22 linear of the
room's accent** (the gate the old body should have failed), and the open drives
`tickAI` for real and asserts the heads travel >20%, the core lights, and it
shuts again.

### 10 — Frost & Fuel · **DONE** (2026-08-17)

*Was:* two separate balls, one orange one cyan, floating 2.8 apart with nothing
between them, 5.57 wide. The subtitle is *Two Heads, Two Hungers* and the whole
fight is about where the two elements MEET, and the body said "two enemies".

*Does:* alternating `cast-frost` / `cast-fuel`, and `twinned` (phase 2) fires
both at once to either side of you with a safe seam pointing at you. The hazards
**interact** — fire melts ice, ice quenches fire.

*Built:* **one creature cleaved down its length.** A small low trunk, ice-rimed
on one side and charred on the other, split by a steaming seam plate; two necks
arcing outward and forward in three segments each; two heads with glowing maws.
Spined along each half's back. 7.63 wide, 32% of frame, hitbox ratio 0.89.

**Band 1.75 at 45°, up from 1.62** — visible edge 3.46 against 3.59 before, so
the fight got MORE room to stand in while the boss got wider. That is the trunk
shrinking: the span moved out into the heads, and `edgeAlong` traverses a lane
rather than a bounding box. Trap 6 says widening a boss closes flank windows,
and it usually does; this is what it looks like when the anatomy pays for the
size instead of the player.

**Both halves are dark and the two maws carry the read.** The frost half used to
be `0x80c0e0` under a `0x40e0ff` glow — and `beat-10-cryo`'s kit accent is
`0xa0e8ff`. The ice half of an ice boss, painted the colour of its own ice room.
`this.frost` / `this.fuel` now point at the two MAWS rather than two spheres, so
the 2.5:1 armed/idle emissive contrast that is the fight's entire read carries
over untouched.

**It faces you now.** `strafe` only moves — it never sets rotation — so the only
rotation this boss had was a free `rotation.y += dt * 0.4` spin. For a fight
whose read is *which head is lit*, that put one head directly behind the other
at half the angles in the cycle. It now lerps to face the player, with the sway
moved onto an inner frame so it cannot fight the facing.

**And the sides mean something.** `_twinned` fires fuel to `+perp` of the
boss→player line and frost to `-perp`; a root facing the player maps local `+X`
onto `-perp`, so frost sits on local `+X` and **the head on your left is the head
that burns the ground on your left.** It was the other way round before, which
nothing could notice while the body free-spun.

*What it cost:*

1. **The halves were mirrored against the heads** for two passes — ice trunk
   with the fuel head on it. Invisible in code, obvious in one photograph.
2. **A bigger trunk made it worse, twice.** The heads sank into the mass and the
   shadow test came back as one solid oval. The fix was to make the trunk
   *smaller* and give the necks three segments with gaps, because the Mantis
   reads for exactly one reason: background between the limbs.
3. **The skull ate the maw.** Enlarging the head left the glow mesh inside it,
   and the fight's signal light silently vanished. *A part that must be seen has
   to sit past the surface it is mounted on.*

*Guarded by:* `runFrostAndFuel` in `boss-bodies.spec.mjs` — the armed/idle
contrast, the twinned volley landing one patch of each element, **each head on
the side its own element lands** (driven through the real move and read as a
world-space cross product, never as the sign of a rotation angle), and the
room-colour gate with the two maws exempted. Swapping the heads' sides fails it.

### 07 — Hydroid Cloud · **DONE** (2026-08-17)

*Was:* twelve orbs on a ring, 4.7 wide — and at radii up to 0.51 on a spread of
1.2 they sat 0.63 apart centre-to-centre, so they **intersected**. The swarm
photographed as one solid blue kidney bean. The subtitle is *The Weeping Swarm*.

*Does:* `pulse` / `storm_pulse` centred on the cloud, `orb-shed` (three motes
seeded around the *player*), `rainfall` (phase 2), plus falling droplets.

*Built:* **a jellyfish.** The shape came from the move, not from taste: the
pulse is centred on the cloud and its own comment says the answer is *"get out
from under it"* — so the body is a thing you are UNDER. A pale bell, the twelve
drops ringing it, five uneven tendrils trailing out. 5.81 wide, 24% of frame,
hitbox ratio 0.78, **band 1.23** (down from 3.37 — the old visible edge was
0.91 because the body was one small lump; it is 3.05 now, and 1.23 is still
twice the floor).

**The bell is a ring with a small cap, not a dome**, and that is trap 4
verbatim: a solid canopy over twelve orbs is a roof, and at this pitch a roof
deletes everything under it. `runHydroid` asserts the bell stays *inside* the
orbit rather than over it.

**The bell gathers before it rains** — it narrows and deepens off the same
`action.name` that fires the move, so the tell cannot drift from the thing it
tells.

*What it cost:*

1. **The orbit was pre-squashed on the axis the camera already crushes.** The
   positions ran `sin(a) * r * 0.7`, foreshortening Z twice, so the ring
   photographed as a horizontal line with a clump at each end. Removed — the
   70.7° pitch supplies the ellipse for free. **See trap 3: that `* 0.7` is the
   same mistake as pushing a limb "forward to use the depth", written as maths
   instead of as a position.**
2. **Six equal spokes is a snowflake.** Straight tendrils at even spacing read
   as a crystal; five at uneven lengths never resolve into a symmetry. A
   tangential sweep was tried and reverted — bending the run spaced the segments
   apart and the strands photographed as loose dice. *Contiguity beats curve.*
3. **The spacing arithmetic was only true if the radii were true.** Phase 2 still
   overlapped by 0.016 after the numbers said it would not, because on the
   6-per-unit grid `cells()` rounds 0.27 and 0.32 to the same two cells — both
   build at 0.333. Moving the orbs to `LIMB_VOX_PER_UNIT` made the requested
   radius the built radius and fixed both phases without touching the spread.
4. **Thirty tendril segments at limb resolution are a lot of vertices, all at
   the far end of the body**, which dragged the p85 to a 0.70 ratio against a
   0.75 floor. Trailing threads the player cannot hit are precisely what that
   statistic exists to catch, so the tendrils shortened and the ring came inside
   the hitbox — and then the *bell* shrank rather than the swarm, because the
   bell is the part that is not the mechanic.

*Guarded by:* `runHydroid` in `boss-bodies.spec.mjs` — **the swarm has
background between its drops** (smallest surface-to-surface gap over every pair,
in both phases, which is the defect this rebuild existed to fix and was
invisible to the whole suite before), the bell sits inside the ring, phase 2
grows the swarm without re-fusing it, and the bell gathers before it sheds.

### 05 — The Proxy · **DONE** (2026-08-17)

*Was:* a violet ball wearing an enormous gold hoop, 5.47 wide. The hoop was
`CRUST_COLORS.goldLeaf` = `0xd4a84b`; the `beat-05-citadel` kit accent is
`0xd4a84b`. **The identical hex, on the boss's most prominent feature, in its
own room** — the same defect as the Witness's magenta, and the second time this
pass a boss turned out to be painted its own arena.

*Does:* `bolt`, `mirror-volley`, and `proxy-swap` (phase 3) — *it changes bodies
mid-wind-up*. Its own note: **the BODY lies, the GROUND never does.** The
subtitle is *Voice of the Leviathan*.

*Built:* **a death mask with nothing behind it.** Bone plate, hollow sockets, a
drape where a body would be, and **the mouth is the light**. That last part is
the whole design: `_markRealBody` already marked the true body by brightness, so
putting the brightness on a mouth makes the fairness cue anatomical — *the one
that is speaking is the one you can hit.* Ringed by the hoop, kept because
`bolt` uses its brightness as the wind-up tell, but thinned to a hoop and
recoloured to the Leviathan's violet. 7.19 wide, 30% of frame, hitbox ratio 0.79.

**The decoys are now the same body.** They were 0.9 blobs against a 1.1 core
wearing a ring, so *"which one is real"* was answered by silhouette before
brightness ever mattered — the mechanic was decoration on a question nobody had
to ask. Real and decoy are built by the same `buildProxyMask()`.

*What it cost:*

1. **`voxRing` had no `res` parameter**, so its tube clamped at one body cell —
   the thinnest possible hoop was half a world unit before presence scaling,
   which is why the old one dominated the boss. Threaded through, like every
   other builder.
2. **A hoop stood upright and rolled on Z tumbles**, and the portrait caught it
   slicing diagonally across the face. Laid flat and spun about its own axis it
   reads as an ellipse from this pitch, never crosses the mask, and is the same
   width in every frame.
3. **The core spun on two axes**, which is fine for a ball and impossible for a
   face. Trap 9 again.
4. **I reintroduced the exact defect I was removing, one line later.**
   `buildProxyMask` scales its group to 1.5 and `_spawnClones` then *assigned*
   presence over the top instead of multiplying, so every decoy came out 1.5×
   smaller than the body it is meant to be indistinguishable from. The spec
   caught it on its first run.

*Guarded by:* `runProxy` in `boss-bodies.spec.mjs` — decoys the same size as the
real body, only the real one's mouth lit, **no decoy sharing a material with the
real body** (they come from shared builders and `_markRealBody` writes opacity
straight onto them, so an uncloned decoy would make the Proxy fade itself out
every time it marked its own doubles), the real face unchanged by that marking,
and the room-colour gate on `0xd4a84b`.

### 02 — Tri-Compiler · **DONE** (2026-08-17)

⚠ **THE PROBE WAS LYING ABOUT THIS BOSS, TWICE.** It is the one boss that does
not extend `BossBase`: it sets `this.root = this.cores[0].root` and exposes
`update` rather than `tickAI`. So every portrait ever taken of it framed **one
core of three**, and `boss.tickAI?.()` matched nothing and silently skipped it,
meaning the assembly was never ticked — cores parked at their spawn points,
never gathered onto their ring. *"2.93 wide, 12% of frame, they do not read as
bosses mainly because they are small"* was a measurement of a third of a boss
that had never moved. Photographed properly it is **10.33 wide, 43% of frame**,
the largest thing on the roster. Both defects are fixed in
`tests/qa/boss-portraits.mjs`; the optional chain is why the second one was
quiet.

*Was:* three identical featureless slate spheres, emissive over their whole
surface at 0.55 of the cap — trap 1 in its purest form, a body lit everywhere
has no form, only a colour.

*Does:* the trio orbits a hub, widens its ring until the beam net is about to
cross you, holds (that freeze is the tell), sweeps, then browns out at double
damage. `converge` every third cycle. Phase 2 parks them wide so the three beams
become sweeping walls, and killing a core removes a wall.

*Built:* **three spindle whorls spinning one thread.** The dungeon is the
Eastern Spindle and the subtitle is *Three Minds, One Sentence*, so each core is
a cut-stone whorl on a shaft with a single hot **aperture** — the one lit part,
and the point the beam leaves from. Hitbox ratio 0.86.

**The aperture aims at the core its beam runs to**, which is trap 9 for the
third time this pass: they used to free-spin at `rotation.y += dt * (1 + i*0.3)`,
so nothing on them could be aimed. And it buys a consequence the fight always
had and never showed — **killing a core visibly swings its neighbour onto the
next one still standing.**

*Note on the room:* first pass gave the whorls six evenly spaced rim ribs, which
is a **cog** — in a kit dressed with `gear_bays` and `rails`. Trap 8, caught in
the photograph. Three fins instead: cut stone, and it echoes what the boss is.

*Guarded by:* `runTriCompiler` in `boss-bodies.spec.mjs` — each aperture aimed at
its beam's destination as a **dot product against the real bearing, never the
sign of an angle**, the re-aim on a core's death, and only the aperture lit.
Restoring the free spin fails the first two; lighting the whorl fails the third.

### 03 — Sand Spur · **DONE** (2026-08-17)

⚠ **And the probe was lying about this one too — worse than about the
Tri-Compiler.** `SandSpur.root` is `segments[0]`, so the shot framed one segment
of six; and the boss constructs `submerged = true` with every segment hidden, so
the portrait came back as **an entirely blank frame**. This boss had never been
photographed at all. It is shot with `--open` now, which surfaces it, and the
probe keeps the player orbiting for bosses that trail — parking the player stops
the head, floods the 38-entry trail with one repeated point and collapses the
whole animal into a single cube, which is exactly what the first corrected shot
produced.

*Was:* six identical `voxBox(0.9, 0.7, 0.9)` cubes scaled 3.1 — the least
designed body on the roster — and **88.8% of it within 0.014 of the sink's own
accent**, the worst colour score of the fourteen.

*Does:* HUNT (a mound crosses the floor at you) → ERUPT → **BEACHED** (arched
out of the sand, motionless, weak seam lit, double damage — its own source calls
this "the whole fight") → DIVE, a little faster each time.

*Built:* **a sandworm.** Dark umber carapace, a head that is four splayed
mandibles around a dark maw — a star, which has an unmistakable centre from
directly above and is the only silhouette shaped like that on the roster — and
tapering body rings with back plates. 4.84 wide, 20% of frame. **Colour now 0.0%
within 0.12, nearest 0.345**, so its entry came out of the exemption list
entirely rather than being loosened.

**THE CHAIN NEVER SPREAD, AND THAT WAS THE REAL DEFECT.** Segments sampled
`trail[i * 5]` — five FRAMES of history each. At ~3.4 units/s that is 0.28 world
units between bodies two units across, so the whole serpent occupied 1.4 units
and sat inside itself. **This is the Magma Wyrm's bug exactly**, which was found
and fixed on the Wyrm by widening its stride, and never swept across to the
second body in the game built the same way.

Frames were the wrong unit regardless: this boss's speed runs 3.9 → 5.7 across
its phases, so a fixed frame stride silently stretches the animal apart as the
fight escalates. It samples by **arc length** now (`SEG_GAP = 2.5`, a little
over one body), which is speed-independent.

**And the fix left the same units error in the buffer behind it** (found
2026-08-17, while fixing the Wyrm). The trail was capped at 400 SAMPLES — 2.8
seconds at 144fps, which is 10.8 units of path against a 12.5-unit animal, so
the tail clamped short at high frame rates. Worse, `_surfaceAt` refilled the
trail with `segments.length * 6` copies of one point, which has **zero arc
length**: `trailAt` walks off the end of it and hands every segment the head, so
the Spur came up as a stack of six bodies after *every dive* — which is most of
the fight. Both are gone; the trail lives in `base.js` now and gates on
distance, so 260 samples is 20+ units of path at any frame rate.

**The weak seam was inside the head.** Authored at `y = 0.42`, within the maw
blob — the "hit here" sign for the window the entire fight is built around was
interior geometry. Trap 12, the same way Frost & Fuel's skulls swallowed their
own maws.

*Band 1.74 at 225°, up from 0.74. Hitbox ratio 1.30.*

*Guarded by:* `runSandSpur` in `boss-bodies.spec.mjs` — `trailAt` sampling by
distance (tested against a straight line whose answer is known exactly, rather
than by driving a boss), the shipped chain not sitting inside itself, the chain
still spread on the frame after it surfaces, and the seam proud of the head.
Restoring the five-frame stride fails the first; restoring the six-copies seed
fails the third; returning the seam to `y = 0.42` fails the last.

### 04 — Kinetic Core · **DONE** (2026-08-17)

*Was:* a plain pale-blue ball, 2.88 wide, the smallest on the roster — in a file
whose **first line** calls it a "bouncing spiked sphere". It had no spikes. Its
weak lamp sat at `y = -0.78`, **directly underneath**, where a 70.7° camera
never sees it: the one light that says *hit here* was occluded by the boss it
belongs to for the entire fight.

*Does:* ricochets off the arena walls throwing a `shockring` from each impact,
and `fission` (phase 3) sheds orb pairs.

*Built:* **a spiked iron mine that points where it is going.** The subtitle is
*Momentum Made Hunger* — this thing is only dangerous because it is moving, so
the fact its body must carry is WHICH WAY. `vx`/`vz` are already the truth of
that, so the shell aims along them and every wall bounce becomes a **visible
flip** instead of a change of address. Dark iron against the Sky's pale
`0xbfe0ff`, blunt spurs, two swept fins, and the weak lamp riding the trailing
face where it can be seen. 3.66 wide, band 1.03, hitbox ratio 0.77.

**Two groups, because the spin had to survive the aim.** The rotor keeps every
existing spin including the `rotation.x += dt * 18` charge tell; the shell
carries the fins, the lamp, and the heading. Aiming the whole body would have
eaten that tell — spinning the whole body is what stopped anything being
aimable, which is trap 9 for the **fourth** time this pass.

⚠ **Its fight numbers cap how spiky it can be, and that is the honest limit
here.** `hitRadius` is 0.95. Spikes reaching 2.0 from the centre put the player
among them unable to connect — the Crypt Warden's "stand inside it to hit it"
defect — and measured, that body came in at a p85 radius of 1.45 against 0.95,
a ratio of 0.67 well under the floor. Growing the ball to outvote them does not
work either: eight spikes at limb resolution carry enough vertices to drag the
percentile out on their own. So the spurs are short and thick. **A properly
bristling Core needs a larger `hitRadius`, which is a fight number and the
owner's call, not an art decision.**

*Guarded by:* `runKineticCore` in `boss-bodies.spec.mjs` — the shell aimed along
its own velocity as a world-space dot product, and the weak lamp clear of the
mass rather than slung under it, checked against the ball's measured radius
instead of a magic number. Removing the aim fails the first; returning the lamp
to `y = -0.78` fails the second.

*Does:* the Tri-Compiler is a three-core assembly with a beam cycle and a
`converge` slam; the Spur burrows and surfaces (`sand-wake`, `breach`); the Core
bounces off walls (`shockring`, `fission`).

*Build:* presence before detail. Each needs to occupy more of its arena before
any shaping is worth doing — and each has room: the Spur's band is 0.74 (tight,
careful), but the Tri-Compiler sits at **1.49** and the Kinetic Core at **1.67**
with edges of only 1.46 and 1.08. Grow first, measure, then shape.

*Risk:* medium — these are the three with the most unusual movement, and two are
outside `roster.js`. **Effort: one sitting each, three total.**

### 12 — Magma Wyrm · **REVISITED** (2026-08-17)

Not a rebuild — the body was owner-approved. Three defects, all of them a number
in the wrong UNITS, and all three invisible to every gate in the suite.

**It wore the room.** The maw and all five dorsal fins were `0xff5a18` against a
pyre accent of `0xff5520` — 0.013 apart in linear space, which is the same
colour, on two fifths of the body. Repainted gold (`0xffbe3d`, 0.411 away):
**hotter than the room instead of the same temperature as it**, which is what
lava is anyway — black crust, white-hot fissures.

**The taper was rounded away by the voxel grid.** The five segment radii are
authored 0.46 → 0.188 and they built 1.17, 0.83, 0.83, 0.83, 0.50 units wide:
`cells()` rounds a radius to whole voxels, and under half a unit the 6-per-unit
body grid has three of them to round to. **Segments 2, 3 and 4 were identical**
and segment 3 was 63% wider than it asked for — the taper that gives the shape a
direction existed only in the source. At limb resolution it is 2.18, 1.92, 1.67,
1.41, 0.90 world units, strictly narrowing. *Third time this pass: the Hydroid's
orbs and the Proxy's hoop were rounded into the wrong body by the same call.*

**The chain counted frames.** `_wake[i * 22]` is twenty-two TICKS of history per
segment. Measured, the six bodies spanned **3.92 units at 30fps, 2.85 at 60fps
and 0.70 at 144fps** — the same animal, one a serpent and one a pile inside its
own skull, with several segments at exactly 0.00 from each other because the
clamp handed them all the same sample. This boss had been "fixed" once by
widening the stride from 5 to 22, which moved the frame rate at which it looks
right rather than removing the dependence on one. It samples by arc length now
(`WYRM_ARC`), and `_dive` re-lays the wake where it surfaces so the body does not
stay draped over the hole it came out of.

**Two things the pictures caught that the numbers approved.** The first arc I
chose spaced the segments to CLEAR each other — the spider rule — and it
photographed as five rocks with a head parked nearby. Continuity is correct for a
serpent; the gaps are shorter than the bodies they join now, so it overlaps into
one animal. Then the fins, at `r * 1.55`, were **longer than the gaps between
them** and merged into a single unbroken gold bar down the back — the exact
opposite of their job, which is to say where one body ends. Shortened to
`r * 0.78`, there is dark between them.

*Guarded by:* `runMagmaWyrm` in `boss-bodies.spec.mjs`. The placement assertion
measures each segment's arc distance back along **a path the test records
itself**, at 30/60/144fps in both phases — worst error 0.22 units. Note what it
does *not* measure: head-to-tail distance is a chord, and a chord reads 8.81 at
30fps and 7.92 at 144fps for a chain behaving perfectly, because the wyrm turns
a slightly different curve when the integrator is stepped differently. *Two
plausible instruments were wrong before the third one was right.*

### 03 — Sand Spur · **body REBUILT** (2026-08-17)

Reported from play: *"sand boss model looks weird."* Measured, three things,
and the third had been true since the boss shipped.

**It was six round barrels.** Every segment built at **x/z = 1.00** — a sphere
squashed slightly in Y. Round is the one shape that cannot say which way an
animal points, and this camera reads width and nothing else (trap 3). They are
ribs now: 0.52 as deep as they are wide, which is the proportion a segmented
animal reads by from overhead.

**The taper was quantised away** — authored 1.18 → 0.66 and built 2.17, 2.17,
1.83, 1.83, 1.50. Two pairs of identical twins, trap 2b again, three days after
the same call did it to the Magma Wyrm. Built at limb resolution the five
widths are 2.11, 1.85, 1.64, 1.38, 1.16.

**The pale plates read as windows.** Three light rectangles laid flat on a dark
barrel is a porthole, which is why the owner's screenshot looks like oil drums.
The pale is spent on paired lateral **spurs** now — what the boss is named
after, and from overhead a spine is a line where a plate is a smudge.

**AND NOTHING HAD EVER TURNED IT.** Every segment sat at `rotation.y = 0` for
the entire fight, including the head — so the mandible star that is this boss's
whole identity faced due south whatever direction it was swimming. A sphere does
not care, which is why it survived; a rib is broadside to its own travel. The
chain follows the wake now and the head faces where it is going.

That fix found a second heading writer at the end of `tickAI`, un-normalised
(magnitude 0.65, not 1) and 4.5° off the mesh on a curve. **A heading belongs to
one layer** — same lesson as the grapple's margin. One writer now.

`SEG_GAP` went 2.5 → **0.65**: it meant "a little over one body" when a body was
a 2.2-deep barrel, and the ribs are 0.85 deep. They have to OVERLAP rather than
touch, because the chain turns hard and adjacent ribs pivot their outer corners
apart — which is exactly how a woodlouse's tergites are built.

*Guarded by:* `runSandSpur` — ribs measurably wider than deep, a taper with a
real step between every pair, the head still widest, every rib pointing at the
one ahead, and `facingVec` in step with the mesh. Five counterfactuals, all red.

*Still open:* the head's skull swallows its own mandibles (trap 12) — the star
reads lit but the silhouette is a bulb with bristles. Not reported, not touched.

### 08 — Skeletal Mantis · **do nothing**

It reads instantly and always did. It is the reference: splayed scythes with
background between them and the body. Leave it.

---

## 4. Where this sits against v1

The boss pass is one of eight items on the agreed v1 list. It is **not** the most
valuable one and should not be allowed to crowd out the rest:

| item | state |
|---|---|
| Distribution live (Pages + a release) | **pushed, still dark** — `v0.4.0` is on the remote and `enablement: true` is in `pages.yml`, but `sumosizedginger.github.io/Sovereign-Scar/` still 404s (checked 2026-08-16). Next check is the Actions log for `pages.yml`; if it is still refusing, the fallback is one click in Settings → Pages → Source: GitHub Actions |
| Boss silhouettes | **DONE** — 13 rebuilt, 1 (Mantis) needed nothing, Wyrm revisited 08-17 |
| Occlusion | **DONE 2026-08-17** — combat line of sight (`src/combat/line-of-sight.js`); attacks, boss cones and bolts all stop at walls. Landed before the combo work as agreed |
| Combo system | **DONE 2026-08-17** — three-step string (opener / backhand / finisher) derived per weapon; `src/game/combat/combo.js` |
| 80% room variation (wall/ceiling height) | not started |
| In-engine key art + composed title camera | not started |
| Ambient sway (dressing mesh + vertex displacement) | not started |
| Doc truth pass + licence line | camera correction done; licence line outstanding |
| Tester round folded back in | waiting on distribution |

**The campaign has been played start to finish, and everything that
playthrough turned up is fixed.** More testers are being lined up by the owner;
that is in hand and is not a reason to hold up the roster. Do not keep
re-proposing it.

*Suggested interleave:* ~~the Witness~~ ~~Frost & Fuel~~ ~~Hydroid Cloud~~
the boss pass is **finished**, and so are ~~occlusion~~ and the ~~combo
system~~. What is left on the v1 list is presentation and release: 80% room
variation, in-engine key art, ambient sway, the licence line, and getting Pages
to actually serve.

**Two arena findings fell out of the occlusion work**, and they are placement,
not bodies, so they are recorded here rather than fixed unasked. Measured at
each boss's spawn, the player has open ground to attack from on all eight sides
for eight of the bosses — but only **three** for the Proxy (beat 05) and
**two** for the Magma Wyrm (beat 12). Both spawn with arena wall or room
dressing inside a weapon's reach on most sides. It is not a softlock: bosses
circle away from their spawn in the first second. It does mean the opening
exchange of those two fights is fought in a corner.
