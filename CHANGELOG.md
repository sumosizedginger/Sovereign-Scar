# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### The spider you had to stand inside — a third cause for the same sentence

*"Spider boss, I need to be inside of it to hit it before it does its move, I
should be able to hit it without literally standing in it."*

The third report of that sentence, after two previous fixes (`c700307`,
`04193e1`) each aimed at a different cause. Its hitbox and its reach were both
fine. **Its armoured front turned to face you as fast as you could run around
it.**

Circling only beats a plate inside `player speed / turn rate` — 5.00 units at
the shipped 1.1 rad/s. `presenceScale(1.70)` puts this boss's legal hitting band
at **3.19 to 5.35**, so most of it sat outside that circle. Measured with the new
`tests/qa/armor-flank-reach.mjs`, which drives the shipped `tickAI` and asks the
real `inFrontArc`:

| standing at | 1.1 rad/s | 0.7 rad/s |
|---|---|---|
| body edge, 3.19 | 1.67s | **1.02s** |
| anchor link max reach, 4.95 | **never** | 2.53s |
| tectonic wedge max reach, 5.35 | **never** | 3.17s |
| webbed, at the body edge | **never** | 2.05s |

`bosses/base.js` already stated the rule its own rate had to obey — *"it must be
SLOWER than the player can orbit, or the flank the fight is built around is
geometrically unreachable"* — and the call site violated it. What the rule could
not say is at WHICH radius, and the answer is not a constant: it is
`speed / (move.range + hitRadius)`, which for a boss scaled 1.70 is a very
different number than for the 0.49-radius mobs 1.1 was chosen against.

Also: the web patch's `slow: 0.5` halved the player's ORBIT as well as their
walk, making the plate absolutely unflankable while standing in it — a stun that
did not admit to being one. Now 0.7.

And the plate now **says which state it is in** before you commit to a swing:
cold blue while it refuses, its authored hot red with a shallow pulse while it is
open. Colour rather than brightness, because `clampEmissive` already pins the
head at the 0.55 ceiling and there is no headroom to flash into.

**Swept, not spot-fixed.** The bulwark elite carries the same plate through the
same code path and had the same defect for the same reason — its 2.2 rad/s was
derived against an assumed "melee range (~1.5)" when the tectonic wedge actually
reaches 2.88. Nobody reported it. `anchor_link` and `tectonic_wedge` at max reach
both read `never`; at 1.6 they read 2.10s and 4.23s, and up close the fight is
unchanged to within 0.05s.

**Why no assertion saw it.** `boss-facing.spec.mjs` owns this exact rule and was
green throughout, because it asked the question at radii **1.5, 2 and 3** against
a default-sized `makeBoss()` — every one of them inside the spider's own legs.
It also raced against a `PLAYER_SPEED` of 6.0 when the player has been 5.5 since
`player.js:132`, in the player's favour, which is the direction that hides this.
Its radii now come from each armoured boss's real geometry, its speed is read
from `player.js` and fails loudly if that drifts, and it calls `inFrontArc`
instead of re-deriving it. Reverting the turn rate turns four assertions red.

### The Heavy Mallet announced a puzzle from across the dungeon

*"Everytime I swing the heavy mallet it says 'too dense need tectonic wedge', I
only noticed it in level 8, might have happened before that."*

It had been happening since beat 06 — the first beat where the player holds the
mallet and a crack exists at the same time. `blockers.js` checked which weapon
was equipped **before** any test of where the blow landed, with the strike
coordinates sitting right there unused, and `player.js` walks every destructible
in a prebaked level on every shattering swing. So one mallet swing anywhere in
the dungeon toasted.

`DestructibleVoxelMesh.shatterAtWorld` already contained the spatial test; the
filter returned before ever reaching it. Extracted as `nearestVoxelToWorld` and
asked first, so the message fires under exactly the condition that makes it
true: the wedge, swung from here, **would** have worked.

### You could climb any wall in the game

*"So the character climbs up the walls, and if you climb too high you fall and
take damage."*

`_surfaceTopInRange` returned the top of ANY solid cell in range without testing
what sat above it. Inside a solid column every cell has a top, so a sheer wall
offered a fresh legal "step" every frame, one cell higher than the last —
measured at **seven cells in seven frames**, roughly 60 units per second straight
up, against a wall with no ledges in it at all.

The fall damage was never the bug. It was correctly billing a fall that should
have been impossible.

This is the **second** report of the symptom. The first was diagnosed as a
legibility problem, and `traversal-legibility.spec.mjs` states in so many words
that *"the cause is not that climbing is broken"*. It was. A confident wrong
conclusion in a comment kept it alive for a second report.

The case in `voxel-physics.spec.mjs` named *"no phantom climb"* could not fail:
its own comment says *"simulate with XZ solid only + no voxels"*, and
`_tryStepUp` reads voxels — so the step-up code was never once shown a wall. It
then asserted X only, never Y. Both fixed; the full rule, including the
staircases that must still work, is `tests/game/wall-climb.spec.mjs`.

### The dash went nowhere, and drew a swing it could not deliver

*"The dash, even after picking up the dash boots, is only like 1 square and does
not hit an enemy at all, but there is a swing animation."*

Three defects behind one sentence.

**The speed was discarded.** `tryDash` handed `dashSpeed: 18` to
`physics.applyImpulse`, and `VoxelPhysicsBody.update` hard-assigns
`vx = wx * speed` on the next tick whenever there is movement input — which
there always is during a dash. The impulse never survived a frame. `dashSpeed`
existed in exactly two places: where it was defined and where it was thrown
away. What shipped was a flat `14` written inline.

**The dash was steered by live input, and this was the larger half.** The wish
vector came from `input.moveVector()` for the whole dash, so a player who
*tapped* dash and released the stick supplied zero movement and the dash covered
essentially nothing. It is the same defect the grapple was reported for in the
same playthrough — *"not fall into darkness if I'm not pushing forward."* A
committed traversal verb now owns its heading for its duration.

Measured with `tests/qa/dash-travel.mjs`, net gain over simply walking the same
window: **1.13 units before, 1.67 after** — and that is with the stick held. Held
vs released was the difference between 2.40 units and nothing.

**It drew an attack it did not have.** `arcSmear.spawn` was called with no `arc`,
falling to `ARC_ANGLE = PI * 0.61` — a 110-degree fan, the same shape a sword
swing draws, at radius 2, connected to no hitbox. Now a narrow streak that reads
as movement. `setDashing` was also called without a duration, so the pose played
against the wrong clock and only ever reached a third of its length.

> **Deliberately dormant:** `DASH_ATTACK` in `weapons.js` is a real lunge with a
> real hitbox, and it is unreachable — `player.js` resolves the attack before
> starting the dash, so a same-frame Shift+Space always yields a normal swing.
> Left that way on purpose: the dash is a movement tool and the rest of the kit
> is built around it having no damage. Recorded here so the next reader finds a
> decision rather than a trap.

### The Light Caster's standing line did nothing, and was four times too bright

*"'Light caster leaves a standing line' that does nothing. Lines from the light
caster are WAY too bright."*

Beat 12 toasts that the Light Caster leaves a standing line. Three quarters of
the mechanic were present and wired at one end only: `hitsEntity()` was written,
correct, and called by nothing; `line.hitPoints` was computed and read by
nothing; the `solid` collision branch was gated on an option no caller ever
passed. Deleting `hitsEntity` outright would have kept the suite green and the
game identical.

The line now burns what stands in it, on an interval, through `applyHit` — the
same path a sword swing takes, so it obeys shields, plates and i-frames rather
than inventing a second set of combat rules. `opts.solid` is deliberately left
alone: nothing needs it, and unused code that *looks* wired is what produced
this defect.

Brightness `2.2` → `0.5`. The bloom threshold is 0.85 and the project's ceiling
for any emissive part is `BOSS_EMISSIVE_MAX = 0.55` — a scenery effect was four
times brighter than the brightest thing a boss is allowed to be.

**That brightness fix then removed the line entirely, and the follow-up is the
more interesting half.** Reported immediately: *"now no line is being left by
the light caster."* Two bugs had been hiding each other.

`transparent` was only ever assigned inside `update()`, on a material
constructed opaque — and three.js will not move a material onto its transparent
path without `needsUpdate`. So `opacity` was silently ignored: the line held
full strength for its whole life and then popped out of existence. Setting
`transparent: true` at construction made the material honest and, in doing so,
switched on a fade that **had never once run in the shipped game** — a straight
ramp from `life / maxLife` starting on frame one. Stacked on a 4.4× brightness
cut, the line was too faint to read for most of its 1.8 seconds. A flash, not a
standing line.

So the fade now **holds full strength for 70% of the line's life and goes out
over the last 30%**, and the line is drawn at `0.35` units instead of `0.15`.
That thickness is the real lesson: at 0.15, seen from a camera seventeen units
up, the line was a hairline that was only ever visible AS BLOOM. A shape that
has to breach the bloom threshold in order to exist is not a shape — which is
why "far too bright" and "not there at all" looked like the same axis and were
not.

Found by photographing it (`tests/qa/light-line-look.mjs`, frames in
`docs/media/light-line/`). The first version of that probe pinned `life = 999`,
which forces the fade factor to 1.0 — it photographed the best frame of the
line's existence and would have reported the bug as fixed. The report was about
the other 90% of its lifetime.

### Two dungeons never asked you to fight anything

Found by playing: *"you can literally run through grab keys and skip areas, I ran
all the way from the start of dungeon 4 to the boss, didn't kill anything,
collected keys and continued."*

A sealed room is the only thing in this game that makes an encounter mandatory.
**04 Sky Monument and 12 Pyre Peak had none** — 26 arenas across the other
twelve dungeons, 0 in those two, and 0 of 3 keys behind a fight in each.

Sealing the three key rooms — the pattern beats 02, 06, 07, 08, 10 and 11 all
follow — **failed six rooms at once** on `room-seal.spec`'s *"nothing that lives
out of melee reach"*: every key room in both dungeons holds a mote, motes hover
above every melee gate, and a player without a ranged weapon would have been
locked in a room they could not clear. The mote-free rooms then failed two more
rules (a seal needs more than one door and more than one enemy). No room in
either dungeon was legally sealable as authored.

So one mote per dungeon was swapped **in place** — not moved, because
`threat-curve.spec` pins peak concurrent enemies per beat — and the **boss-key
room** sealed, since the boss cannot be reached without that key.
`12 ashgallery`'s replacement is a **bulwark**, which puts armour beside that
room's censer: the pairing the censer's puzzle needs to be posed against at all.

**28 sealed arenas, 0 dungeons with no mandatory fight, 26 of 40 keys behind
one.** Two further gates fired on the way: `elites.spec` caught that the swapped
motes were the campaign's only `mote/lunge` (rehomed to `12 ventfield`), and
`seal-holds.spec`'s hardcoded `roomsDriven === 26` now derives its expected count
from the defs, so a new seal cannot quietly turn a coverage guard into a rubber
stamp.

### The grapple grabbed the peg you were standing beside

*"standing next to the gold pillar in the wall and hitting G locks onto the gold
pillar in the wall, not the one across the gap."*

Peg choice only asked which peg you were aimed most squarely at. Both pegs in
windworks sit on one axis, so both scored 1.0, and `dot >= bestDot` handed the
tie to whichever came **last in the array** — on the return trip, the one you are
standing beside. A peg must now be **across the chasm** to be a destination
(`segmentCrossesRect`, an exact slab clip), which is symmetric and needs no
tuned constant; ties break on distance rather than array order.

**And the reason the crossing back still failed after that: the sweep ran
backwards.** `GrappleController.update` steps the pull in four substeps, and the
eased progress starts near zero — so on the first frame the first substep asked
to move to a point **two thirds of the pull distance behind the player**. With
anything solid back there the move is refused, the blocked-check fires, and the
whole pull cancels before it moves. The windworks far ledge is one metre of
floor with a full-height wall behind it, so the return trip swept into that wall
and cancelled having moved 0.10. Clamped: **arrives at z −65.7, moved 4.80.**

That was never gap-specific — the grapple failed **anywhere the player had their
back to a wall**, and only one direction was ever broken because firing the other
way the same backwards substep lands on open floor and resolves cleanly. `cx`/`cz`,
the sweep's starting point, already carried the same `Math.max(0, …)`; the loop
was the half that missed it.

### A boss two rooms away was audible at full volume

*"it's like a sound of being hit, doot doot doot even while standing still …
nothing giving any sign of what is causing me harm."* There was no sign because
nothing was there: the beat-04 boss bounces around its arena and plays the metal
guard-clang off every wall, from world z −256, while the player stood at z +4.5.

`attachBoss` already computed `awake` and then updated the boss anyway with a
`null` player — so a dormant boss kept moving and kept making noise, and only its
targeting went blind. Dormant bosses now tick inside a `silenced()` mixer scope.
Distance could not have fixed it: `MIN_DISTANCE_GAIN` is 0.35.

### Blocking a mote correctly played the sound of being wounded

The mote's burst played `hurt` whatever `damage()` answered — including when the
hit was blocked, parried, absorbed by i-frames, or refused by god mode. Blocking
a mote is the documented right answer, so the reward for reading one correctly
was the wound sound every 2.65 seconds. Now: landed → `hurt`, blocked →
`block`, parried → the guard's own parry ring, refused → silence. Fall damage
had the same defect and is fixed with it.

### The first frame of the game showed its own name three times

`#boot` (still saying "loading…"), a HUD toast, and the title screen, stacked —
the toast drawn straight through the `Credits` row. The toast is deleted, the
splash now fades on a real first-frame signal instead of a 900ms guess, and the
rule under both: **transient chrome does not paint over an open menu.**

That rule surfaced a larger bug. `MenuOverlay` and `Input` bind separate keydown
listeners, so **one Enter against the pause menu both closed it and ate a line of
dialogue**. `[` / `]` warped dungeons and `M` fired mirror travel from behind an
open menu; on a pad, `A` was attack *and* the menu's confirm. Gated at the latch
in `input.js`, draining on both edges — a guard placed at the read sites did
nothing, because the menu closes synchronously inside its own listener.

### The title screen had painted out the scene behind it

One flat wash served the title and the pause menu, and the title's backdrop
metered at mean L\* 12.3 — the "rendered scene" was painted out and the hero sat
behind the wordmark. The title now takes a vignette (p99 15.3 → 29.9, mean
unchanged); pause takes a heavier flat scrim, because its backdrop peaks at
L\* 85.6 against a p99 of 21 and a gradient would leave the bright corner exactly
where it was.


### Every lamp in the game was a painted rectangle

**Measured first, and the measurement rewrote the plan.**
`tests/qa/ambient-motion.mjs` is new: it holds the player perfectly still,
samples the whole scene twice a second apart, and reports what moved, bucketed
by what it is. Across four levels it found that of the four systems
`HOW-TO-CLOSE-THE-GAP.md` item 3 wanted built, **one was dead, one was already
working, one was half-right, and one was aimed at objects that do not exist.**

| the plan said | measured |
|---|---|
| lights do not flicker | **true** — 24 lights, max Δintensity **0.0000** |
| enemies "stand perfectly still" | bodies idle-animate; **0 of 31 roots ever turn** |
| motes need turning up | already drifting, 520 live particles |
| banners/chains/vents need sway | **no such objects** — scenery is anonymous meshes |

**The lights now breathe.** All 14 motifs declare `live: flame | machine |
water`; each fixture takes a phase from the same seeded rng that placed it, so a
room breathes identically every run and its captures stay reproducible.
`updateRoomLightFlicker(t)` runs immediately **before** `localLights.update()` —
the pool already copied `source.intensity` onto the real light every frame, so
the feature needed no change to the pool at all. Δintensity 0.0000 → **0.47**.

**The waves are sums of pure sines about zero**, so each light's time average is
exactly its old constant value (worst drift <0.5%). That is load-bearing, not
tidiness: the certification gate bands mean frame luminance and one region sits
4 under its ceiling, so any DC offset would have started failing screens for
being alive. All luminance gates still pass.

The probe was wrong twice before it was right, and both are recorded in it: it
sampled the Points object's transform (which never moves) and called a
520-particle field "still", and it bucketed by guessed `userData` flags that do
not exist, so the player control silently never ran and an enemy's held plate
counted as scenery.

`tests/game/ambient-life.spec.mjs` (17 assertions) pins registration AND
de-registration, motion over time, fixtures out of phase, the zero-mean
property, seeded reproducibility, and **the frame-loop call site including its
order** — every other assertion in it stays green if the loop never calls it.
Eleven break modes proven, including freezing the update, moving it after the
pool, and giving the wave a DC offset.

**And the enemies look around now.** `if (dist >= this.aggroRange) return;` ran
no branch at all — the bodies idle-animated the whole time, which is why this
never looked obviously broken, but **not one enemy root had ever changed
facing.** `_idleLook(dt)` picks a heading, turns to it slowly, holds, then picks
another; a sine sweep would read as a radar dish rather than as a creature.
Headings come from a position-seeded sequence, so a room does not scan in unison
and the same spawn idles identically twice. Measured: 0 → 3-of-12 and 4-of-13
turning in any given second.

Its spec caught a real bug on the first run: anchoring the glance to
`state.facingVec` snapped the body **2.72 rad** against a 1.15 rad arc, because
a rig's rotation and its logical facing are not guaranteed to agree at spawn. It
anchors to the rig — what the player can actually see — instead. Seven more
break modes proven, including letting the offsets compound and giving every
enemy one seed.

Suite: **5014/5014**.

### The app has its own icon, and three documents stop giving bad advice

**The desktop build shipped the stock Electron diamond.** `electron-builder`
logged *"default Electron icon is used"* on every run and exited 0, which is the
project's recurring shape: a thing that is wrong, says so quietly, and fails
nothing.

`scripts/make-icon.mjs` now generates `assets/icon.ico` (16/32/64/128/256) and
`assets/icon.png` with **no dependency beyond Node's own zlib** — a PNG encoder,
a CRC32, and a Vista-era ICO container. `build.win.icon` points at it and
`electron/main.cjs` wears the PNG so un-packaged `npm run desktop` stops
borrowing electron.exe's.

The art is the game's own title — the world split, two masses of rock with light
in the gap. Authored **once** on a 32×32 voxel grid, with every exported size a
whole-number rescale of it, so it is still legible at 16px; a detailed icon
downsampled to 16 is a grey smudge, and 16 is the size that actually gets looked
at. Colours are read out of `ui/menu.js` rather than invented, so the icon and
the title screen are the same object. The first two drafts read as a river and
then as a brass squiggle, which is recorded in the script because the reason
(the rock sat too near the backdrop, and the gold lip was four columns wide) is
the useful part.

**"The build stopped warning" is not "the icon shipped."** The 256px entry's
PNG payload was searched for, and found, inside all three artefacts —
`win-unpacked`, portable, and the NSIS installer.

**A committed binary with no proof it matches its generator drifts.**
`tests/game/app-icon.spec.mjs` (45 assertions) regenerates from the real script
and compares bytes, checks the ICO is well-formed rather than merely present —
every entry's IHDR agreed against its directory record, offsets contiguous and
in-bounds, a 256 entry present — and pins that `package.json` and
`electron/main.cjs` still point at it. Ten break modes proven to fail it,
restoration hash-verified.

**And it found a real trap.** `.gitattributes` opens `* text=auto` and declares
`*.png binary` but had **no rule for `.ico`**, leaving byte-exactness to git's
binary sniffing. It sniffs correctly today; had it ever not, the byte comparison
would have failed on someone else's clone for a reason invisible from inside the
checkout. Now stated explicitly, and pinned.

**Three documents were telling the next engineer to do something harmful.**
`ROAD-TO-AAA.md` §6 and `HOW-TO-CLOSE-THE-GAP.md` §6 both called filling the
weaver/censer rows of the kind × behaviour matrix *"the single cheapest content
on the list"*. It would have **deleted the abilities it was meant to showcase** —
the web and the cense live inside `_aiWeave`/`_aiCenser`, so an `ai:` override
removes a specialist's only trick. Both sections now lead with that, because a
plan that is confidently wrong is worse than no plan. The Line Caster and app
icon items are marked done, and the running order with them.

Also corrected: `README.md` and `HANDOFF.md` said **seven** enemy kinds. There
are nine — and the two they omitted are exactly the two this project had been
under-using. `assets/README.md` now says which files in that folder the build
reads and which are historical captures that nothing loads.

The new spec is pure Node, so it lands in the half CI actually runs.

Suite: **4992/4992** (unit-only **4115/4115**). A full run still leaves
`git status` showing nothing but the deliberate edits.

### The Pyre's reward is a reward, and the two specialist enemies get used

**The Vector Staff now gates the light-line.** It used to grant `vector_staff`
(checked by nothing) and `line_caster` (an id one letter from the real
`light_caster`, belonging to no weapon, no item and no reader), then tell the
narrative `markProgress('item_acquired', …)` — whose parameters are both unused.
The beam it advertised fired for anyone holding the Light Caster regardless.
Proven fixed in the running game: **no staff → 0 lines; staff → 1 line.** The
phantom id is gone. Purely additive, so a player who never finds it loses a
flourish and never a route.

**The weaver and the censer go from 3 spawns each to 6.** They are the only two
kinds whose design is entirely about the OTHER enemies in the room, and they
appeared in 6 of 47 combat rooms.

The obvious plan — "fill the empty cells in the kind × AI matrix" — turned out
to be **exactly wrong**, and measuring first is what caught it: the web and the
cense are implemented INSIDE `_aiWeave` and `_aiCenser`, so writing
`ai: 'chase'` on a weaver deletes its web and leaves it looking identical. Their
empty matrix row is correct by design, not a gap.

What was actually missing was company. **No censer had ever been placed in a
room with a bulwark** — the "a room with a live Censer cannot be ground down"
puzzle its own source describes was never once posed against something armoured.
Three now are. Verified by driving it: the bulwark healed 11 → 13 and was
shielded for 332 frames.

**And the new gate found a bug older than this session.** `bestiary.spec.mjs`
now pins that no specialist is alone, that each is within its real working
radius (`CENSE_R`, `WEB_LEN`, imported not restated), and that its AI is never
overridden. On its first run it failed two placements: one of mine, and
**beat-13's censer, authored 7.62 units from both allies against a 7.0 radius —
unable to heal or shield anyone since the day it was written.** Both fixed. All
three break-modes counterfactually proven.

**A coin-flip certification gate, fixed.** Tombfields' Abyss screens measured
129.8 / 129.9 / 130.1 against a band ceiling of exactly 130 — whether the suite
passed was decided by ±0.2 of noise. Trimmed to a stable 126 (the first sub-1.0
entry in `ABYSS_REGION_MULT`) rather than widening the band, which would have
been moving the goalposts to wherever the ball landed.

Encounters 125 → 131; rooms holding 4+ enemies 12 → 13, all in beats 8–14.
Suite: 4930/4930.

### The cape is gone, and the bug it found is fixed

**The cape is removed.** Owner's verdict: it "does not flow like a cape, and
looks more like a massive shield on his back" — correct, it was a `BoxGeometry`
that never moved, because nothing here simulates cloth. It is the third thing
this pass bolted onto the hero and the third rejected on sight.

**The premise was wrong too.** I argued the hero was hard to tell from the
enemies entirely from static greyscale screenshots. The owner, who has played
it: "I guarantee you a player can tell the difference." They are right — the
figure that answers the controller is the player, every frame, and no still
image can contain that cue. The separation LIGHT stays (a lighting repair, not
an accessory); both accessories are pinned off by spec.

**The cape's one contribution was a real bug, and it is a good one.** The
player's contact shadow disc has been drawn at CHEST height since the feature
shipped:

```
player feet   y = 1.001     player disc  y = 1.981   ← 0.98 up
enemy  feet   y = 1.000     enemy  disc  y = 1.030   ← correct
```

Enemy rigs are built with `groundOffset: 0`, so their origin sits on the floor
and their discs were right by luck. The player's origin is the centre of the
physics body. The disc was invisible inside the player's own silhouette until a
wide flat surface gave it something to slice across. Every rig now publishes
where its feet are (`root.userData.ssGroundOffset`) and the shadow field reads
it. Gated at BOTH ends — the first spec only checked the producer, and deleting
the consumer left it green.

**And a suite-wide harness bug fell out of it.** `hud-player`, `hud-toast` and
`story` each installed a fake global `document` and never removed it, so every
spec running after them inherited one. That is worse than no document: code like
`contact-shadow.js` guards `typeof document === 'undefined'` for headless runs,
and a fake defeats the guard. The first spec to build a real canvas crashed the
entire run while passing perfectly on its own. All three now restore the global.

Suite: 4914/4914.

### The hero gets a real silhouette, and two more instruments stop lying

**The cloak is now 0.92 × 1.15** (was 0.66 × 0.86) — wide enough to be the
widest part of the outline from every bearing, long enough to break the round
blob into a shape with a direction. Enemies stay rounded and cloakless, so at
thirty pixels the hero is the only figure in a room that is not a lozenge. The
cloak also takes the separation rim now, so it is a dark shape with a lit edge:
readable against a pale floor because it is dark, against a dark floor because
its edge is bright. Edge contrast in the crowded rooms — where you actually get
lost — went 32.5 → 42.8 (Town) and 32.9 → 40.1 (Leviathan).

Getting there caught the same trap twice more. The first, dark version of the
bigger cloak **dropped** average-brightness separation for exactly the reason
the rejected black outline did: a big dark mass pulls the average toward the
floor. Numbers down, picture better.

**And then ΔL\* turned out not to measure this at all.** The probe's "floor"
ring sits at a radius derived from the character's HEIGHT, so a cloak that grows
sideways spills into the ring and the floor reads brighter every time the cloak
gets bigger — the floor climbed 30.7 → 34.5 → 36.9 across three cloak sizes of
the same room. ΔL\* cannot A/B a silhouette change. Documented in the probe;
the edge metric, measured on rays that cross the boundary, is unaffected.

**The probe also only ever took one sample.** The same build measured three
times gave floor readings of 27.8, 30.7 and 34.5 — a spread wider than most
differences worth testing. It now takes five and prints the median plus the
spread, which is the identical fix the luminance gate needed two sessions ago.

**Correction, owner-caught: rooms are not flat.** `ROAD-TO-AAA.md` claimed "every
room is a flat floor inside a rectangular wall". Measured across all 108 rooms
by walking the baked voxel world: **100 of 108 have raised floor**, averaging
17% of their area, 34 rooms reaching three or more levels, one reaching six. The
real gap is narrower and is now stated precisely — the steps are one or two
cells by design, they are ledges rather than pits, the three shapes are chosen
by hashing the room name, and the perimeter is always a rectangle. Floors have
relief; spaces do not have shape.

New: `docs/HOW-TO-CLOSE-THE-GAP.md` — the method for every item on the AAA list,
with sizes, gates and a running order.

Suite: 4911/4911.

### Wiring audit, pass 2 — content this time, and the Pyre's reward is a prop

Full findings: `docs/WIRING-AUDIT-2026-08-12-PASS2.md`. Pass 1 checked modules;
this checked authored data against the code meant to consume it.

**The Pyre hands you a reward that grants nothing.** Beat 12's "Vector Staff"
pickup grants an item nothing checks, a second id (`line_caster`) that is not a
weapon, not in the items map, has no hint and no reader, and calls
`markProgress('item_acquired', …)` — whose parameters are both unused. The
light-line ability it advertises fires on `activeWeapon === 'light_caster'`
alone, with no staff test anywhere. Proven in the running game: with neither
item held, one swing takes the line count 0 → 1. Left unfixed on purpose —
which of the three repairs to make is a design call.

**Fixed: the density probe was reporting on seven of the game's nine enemy
types.** A hardcoded roster in `content-density.mjs` omitted the weaver and the
censer entirely — both of which ship with palettes, AI branches and six
authored spawns — and printed a coverage percentage against the short grid:
"37 of 42 (88%)" where the truth is 39 of 54 (72%). The identical hardcoded
seven had already been found and fixed one file over in `bestiary.spec.mjs`;
the probe was never swept. Now derived from `ENEMY_PALETTES`, with three
assertions in `bestiary.spec.mjs` pinning the two lists together
(counterfactually proven).

That fix exposed a content fact nothing could previously see: the weaver and
censer are each authored three times and **only ever on default AI**.

Also found: `tectonic_glove` declared in the inventory and appearing exactly
once in the repo (its own declaration); `gumoi_sigil` set by beat 13 and read
by nothing; five real items riding the `hasItem` flags fallback because they
are absent from the `items` map.

Clean bills: all 110 spec files registered and running, all 34 sound effects
wired both ways, all 11 score events awarded, every level-authoring call
provided, and the desktop build packaging everything the game loads.

Suite: 4911/4911.

### Wiring audit — everything checked from both ends

Full findings: `docs/WIRING-AUDIT-2026-08-12.md`. One regression fixed, the
rest catalogued for decisions rather than touched.

**Fixed: "Show play timer" did nothing outside dev mode.** The HUD rewrite had
filed the timer under developer clutter; the Settings toggle (`ui/menu.js`)
kept firing into a panel players never see. The timer now renders in the player
HUD when the toggle is on — proven by spec (counterfactually failed, restored),
and end-to-end in a running loop via the real menu event.

**The five findings that matter most, unfixed by design:** the destructible
flood-fill exists twice and the spec tests the copy the game does not run
(`destructible-voxel-mesh.js:74` vs `:244`); `KEEPOUT` is pinned by the
terracing spec while `terraceRoom` uses literal `2`s; `onChargeStrike` fires on
every released charge and nothing anywhere listens; `lastRun` is archived on
every New Game and read by nothing; and `validateDungeonDef` guards the test
suite but not the actual loader. Plus seven ghost features (a music-ducker, an
objective-destination query, an unplaced key pedestal…), ten dead imports, and
a table of doc citations pointing at renamed files.

Clean bills: zero orphan modules, zero probe↔hook drift, every Settings toggle
wired (post-fix), every save field read except `lastRun`.

### Player-facing finishing pass — the debug HUD became a game HUD

Full report: `docs/FINISHING-PASS-2026-08-11.md`. Suite 4826 → 4906.

**The HUD.** Eleven lines of monospace `label: value` in a bordered black panel,
plus a control sheet nailed permanently to the corner, became hearts, guard
pips, a weapon name, coloured chips for what you are actually carrying, and one
objective line. `Beat:`, `Mood:`, `Bosses: 0/14`, the raw `(6/6)` behind the
hearts, and the game's own title printed over the game all moved into
`#ss-hud-dev`, which renders only in dev mode — none of it deleted. The controls
now appear for the first 14 seconds of a new run and while `?` is held.
`tests/game/hud-player.spec.mjs` gates the split, including a deliberate check
that narrative prose containing those same words is still shippable.

Two layout bugs surfaced by looking at real frames rather than at the code: the
toast sat at `bottom: 48px` under a story panel at `bottom: 96px` that is
routinely taller than 48px — three overlapping boxes of text on the first frame
of the game — and the boss bar's phase line overlapped the bar it describes.

**The hero.** Measured, the player separated from the floor by ΔL\* 2.1 in the
Crust and 4.5 in the Pyre. Three changes, in the order readability actually
works: a cloak (nothing else in the game has one), a separation light with a
fixed key that survives the 56° camera where the old `pow(1 − n·v, 3.2)` fresnel
was geometrically defeated by it, and a reserved azure accent. Mean ΔL\* 9.5 →
15.1 on the same corrected probe, at a cost of two draw calls and still 60 fps.

**An inverted-hull outline was built, measured, and rejected.** It improved every
number it touched (7.2 → 14.3 on the then-current probe) and made the game
visibly worse — at thirty pixels tall the outline is a quarter of the
character's width and the hero becomes a black blob. Kept behind `outline: true`.
Trap 35.

**Instruments.** `content-density.mjs` counted `this.startAction(` call sites and
reported the Crypt Warden — which had migrated to `defineActions()` — as having
**zero** moves; it now counts action definitions in both architectures and also
stops silently dropping the Tri-Compiler from a "13 bosses" total in a
fourteen-fight campaign. `silhouette-contrast.mjs` sampled a hardcoded frame
centre while the player renders 35 pixels lower, and its edge test straddled the
boundary by twelve pixels while measuring a two-pixel band; both fixed, so its
historical figures — including the table in `AAA.md` — were diluted. And the
boss E2E stopped screenshotting over a committed PNG, so a test run no longer
leaves the tree dirty.

**Still open, deliberately.** In greyscale the player is legible against the
floor and still not distinguishable from the other figures in a crowded room.
Section D5 of the report; not guessed at.

### The seal was a shove with a cooldown, and you could walk out of the world

The owner: *"rooms are supposed to stop you from leaving if you try while
enemies are still up, and I have died twice to the room bumping me back."*

Both halves of that sentence are one bug. The bump **was** the seal, and it did
not work.

A locked door bakes a solid plug into its gap. A sealed door bakes nothing — the
doorway stays an open hole — so the entire barrier was `refuseDoor` shoving the
player 1.1 units back, zeroing their velocity, and then going **completely
quiet for 0.7 seconds**. That cooldown is correct where it was written: at a
plugged door, geometry does the holding and the cooldown only stops the bounce
becoming a cage. At a sealed door there is no geometry, and 0.7 seconds at a
walk speed of 5.5 is four times what it takes to cover the 1.1 and step through.

Measured in the running game, beat-01 `antechamber`, holding south into its
`open` door — no key, no trick, one direction on the stick:

| | before | after |
|---|---|---|
| shoves in 5s | 7 | 0 (clamped) |
| final z | **-171.63** (14 units past the wall at -183.5) | **-183.50** |
| final y | **-29.34** | **1.95** |
| `currentRoomId()` | `antechamber` the whole way | `antechamber` |

Past the wall there is no floor — the neighbouring room is 47 units away and is
not baked until you transition — so the player fell until `index.js` fired its
`y < -12` void kill, toast *"Fell into the Scar…"*. The room that would not let
them leave is what killed them. Twice.

**All 26 sealed rooms had it, on every door.** 18 have an `open` door and need
no key at all; the other 8 are plugged only until you unlock them, and the
`keyStore` outlives the bake, so they open up on the next visit too. The
counterfactual run failed **79** assertions across every one of them.

The fix separates two jobs the shove was doing badly at once:

* **Holding the player in** is now `holdSeal`, a per-frame positional clamp to
  the door's wall plane. It gates on nothing, so there is no frame on which the
  wall is not there. Being a clamp and not a teleport, it also cannot fling the
  player back into the enemies they were retreating from, and it takes away no
  velocity and no input — you slide along the doorway instead of being launched
  through the pack. That is the *"bumping me back"* half, gone as a side effect
  of fixing the escape.
* **Telling the player no** keeps the 0.7s cooldown, which is the only thing a
  cooldown was ever the right tool for. You may still stand in the doorway and
  get *"Sealed — 2 still standing"* and the locked-door sound.

`refuseDoor` is untouched and still used by locked, boss and exit doors, where
a plug is behind it. (Checked: all 14 dungeons define `onExit`, so the
exit-door fallback into `refuseDoor` — the one case with a gap and no plug — is
unreachable.)

**What the suite was asking.** `room-seal.spec.mjs` has 26 rooms' worth of
assertions and every one of them is about the player getting *out*: are there
enemies, are they reachable, is there a stalemate valve, is there a ceiling
under the valve. Not one asked whether the room could keep the player *in*. The
same shape as the boss specs that asked fourteen times whether the player could
kill each boss and never whether a boss could kill the player.

New `tests/game/seal-holds.spec.mjs` drives the real `level.update` for every
sealed room and every door: line up on the door, walk at it for five seconds,
assert you never pass the wall plane, never transition, and the seal is still
on afterwards. 26 rooms, 78 doors. Play-verified in both directions — held at
the wall with the toast firing, then cleared the room and walked out the same
door into `predecessor`.

Suite: **4743/4743** (unit **3879/3879**).

### Standing on a roof is not standing anywhere — arrival, swept

The owner, fourth report on this: *"I spawned under the ground due to the raised
land right next to the entrance"* and *"I became stuck on a raised area when I
entered the room from the east side."* The previous entry below fixed one of
these paths and reported itself as suite-green but not play-verified. It was not
enough, and this time the reason is measured rather than reasoned.

**Two questions were being answered by one function.** `surfaceTop` asks *is
there a solid here with head room above it?* It never asks *may the player's body
be at this (x,z) at all?* `CollisionWorld` answers that one and is **height-blind
by design** — `blocked()` has no Y in it — so a column registered as an XZ solid
stops the body at every height, including standing on its roof. The top of a
perimeter wall and the top of an authored slab both sailed through `standable()`,
`nearestFreeEntry` returned them, and the hero was placed somewhere every
horizontal move is refused. Worse, a door's landing point is `doorWorldCenter`
(a half-cell) minus a whole 2.5, so **every door in the game landed on a cell
seam**: body half in each neighbour, and when one was solid the two collision
boxes ejected it toward opposite faces on alternate frames. That fight is what
"stuck" felt like.

Terraces were never implicated and are untouched: `terraceRoom` writes into the
platform map, which `bakeRoom` meshes with a null collision world, so no terrace
of any height is ever a solid.

**And the other half — seven placement sites, one of them fixed.** The hero's
rest height was spelled out at seven places. Last session fixed `startTransition`
and left six saying `1.95`, including `respawnPoint`, which called `standable()`,
computed a real surface top, and then threw it away. There is now one `groundY`
and one `canStand`, both on the level, and every site calls them.

Measured across all 14 dungeons **and the overworld** by `tests/qa/entry-safety.mjs`:

    arrival points 528        before -> after
    body inside a solid    30 -> 0
    buried in geometry     33 -> 0
    wrong height           33 -> 0
    landed on a cell seam 526 -> 0

    save-and-return, 49 overworld screens, all with raised ground
    buried on return       49 -> 0

That last row is the owner's first report, driven end to end: stand on raised
ground, walk into a dungeon, walk back out. `overworld.js` restored x and z
exactly and forced y to 1.95 — **11,034 standable cells across the 49 screens
buried you**, and the ones beside a dungeon arch are the cells you leave from.

Three further things fell out of it:

* **`nearestFreeEntry` preferred any perch to the floor.** Every standable
  surface is a legal answer, including the roof of the thing being escaped — the
  overworld's monolith is three cells tall and carries no XZ solid, so a mirror
  swap that returned the player inside it stepped one cell sideways onto its own
  roof. It now ranks candidates by ground height first and distance second.
* **The overworld hand-rolled a second search** with its own idea of "free"
  (cell 1 empty, cell 0 solid — the flat-floor question). It calls the room
  graph's `safeSpot` now. One search.
* **`world-e2e`'s own trap assertion was the same stale assumption**, asking
  `getVoxelAt(p.x, 1.5, p.z)` — which since Phase E2 means "standing on a step"
  exactly as often as "buried in a wall". It measures the two cells the body
  occupies, from the feet, and it now carries a detail message; it had been
  debugged twice from a bare true/false.

Play-verified, which the previous attempt was not: walked west out of
`brinepocket`, the real door trigger fired at frame 18, landed in `drownedway` at
**y = 1.95 on the floor** (was 4.95 on the slab roof) and then moved 2.7 units in
each of the four directions. Not stuck.

`beat-07-sluice`'s east slab was left alone: the plan assumed it walled its door
off, and measurement says row z=4 is clear from x=4 to x=8 and `door-reach.mjs`
still reports 0 doors that lock you in. The stuck report was the placement bug,
not the geometry.

### A green gate because the camera was looking away

Fixing the above turned `visual-sanity`'s overworld sweep red, and the number was
right. The `sink` screen's centre slab is nine by nine, you stand on it, and it
was built in the **shared** `build` in `CRUST_COLORS.clayDark` (0x9a8b78, ~140/255)
in *both* states — so in the Abyss a crust-clay platform sat under the Abyss light
multiplier, the exact compounding `OVERWORLD_BASE_TUNE`'s comment warns about. On
the slab it measures **175** against a ceiling of 130; ten cells away on real
Abyss ground the same screen reads **88**.

It had been invisible for the life of the screen because the old spawn code
shoved the player off the slab, so the sampler never stood on the bright thing.
The slab moved into per-mood `crust`/`abyss` variants (`ABYSS_COLORS.basalt` in
the Abyss), geometry identical in both. **The gate was green because the camera
was somewhere else, not because the picture was good.**

### Room entry still believed the floor was at y=1

Chasing the three rooms the door sweep could not seed found something bigger than
the rooms themselves.

`enterRoom` already had a guard against materialising inside geometry, added the
last time this happened. It asked: *is cell 0 solid, and are cells 1 and 2 clear?*
That is the flat-floor game this was before Phase E2 put terraces in every room.
**On a terrace cells 1 and 2 are solid because it is a step**, so every raised
surface in the campaign read as unusable: `nearestFreeEntry` rejected its whole
search space, fell through to a null fallback, and left the player at the unsafe
point the guard exists to prevent. Then the line immediately below set them down
at a hardcoded `y = 1.95` — *inside* whatever they were standing on.

`standable` and `clearForBody` now scan for the surface (bottom-up, with head
room) instead of assuming where it is, and the entry places the hero at that
surface. On flat ground the scan returns 1 and nothing changes; on raised ground
it finally works. Landing spots the entry search can use:

    beat-03-sink/hollow        97 -> 140  (of 169 cells)
    beat-05-citadel/monolith  244 -> 330  (of 361)
    beat-12-pyre/ashgallery   165 -> 285  (of 289)

`ashgallery` is terraced end to end and the old predicate rejected 43% of its own
floor. This is trap 24 for the third time: a system added in one phase does not
know about the phase before it.

The three rooms themselves, for the record: `monolith`'s spawn column reads
`111111111` — solid rock top to bottom, the room's centre is the monolith;
`ashgallery`'s reads `111100000`, inside a four-high pillar; `hollow`'s reads
`000000000`, open void. Room entry no longer lands anyone there, but the authored
`spawn` coordinates are still those points and are used by paths this pass did not
audit. **Left open, not closed.**

**Honest about verification.** This one is reasoned, measured on the predicate,
and suite-green — it is *not* play-verified. The probe written to drive real door
transitions never fired one (0 of 188: the placement lives in `startTransition`,
which needs a door trigger and a camera the harness did not supply), and a probe
reporting "0 buried" while driving nothing is worse than no probe, so it was
deleted rather than shipped. The counter that caught it was added for exactly that
reason, one commit after learning it the hard way.

### The switch was inside the player

The owner, on beat 08: *"Switch does not work in one room, the other room does not
even have a switch."*

Both rooms have one. **`gravecanopy`'s was at local 0,0 — the room's own spawn
point.** The player materialises standing inside the post. That is not a switch
you fail to operate, it is a switch you cannot see, because you are in it.

The soft-occupancy predicate that `settle` consults has always accounted for
pickups and enemy spawns and **never for the hero**. The `develop` switch is
authored five units diagonally out from the vault, which in a half-7 room is
exactly 0,0. Swept across the campaign: **10 pieces standing on a spawn**, two of
them dead centre (beat 08's `gravecanopy`, beat 12's `slagworks`), the other eight
a diagonal step away. Now 0 — the spawn is soft-occupied out to 2.0, so a piece
prefers anywhere else and may still land there if the room leaves no choice, the
same trade the predicate already makes for torches.

**New probe: `tests/qa/switch-works.mjs`.** Three questions no probe had asked:
does every gate have something in its own room that can drive its signal (0 of 38
unwired); can a body stand within the 2.0 a strike needs (0 of 14 unreachable);
and does striking it actually drop the gate (0 dead). Plus the spawn count above.

Two of my own errors in it, both the same shape as the ones this file keeps
recording:

- **It struck the switch at distance zero.** Calling `shatterAtWorld` at the
  post's own coordinates always passes the 2.0 gate and tests nothing a player
  does. It now throws the hit from standable ground, projected 1.2 ahead the way
  `_strike` does.
- **The first spec for the fix ran on a dungeon that never had the bug.**
  `BEAT_LIST[0]` is plate-flavoured and had nothing on a spawn, so the assertion
  passed with the fix reverted. It now bakes beat 08 and beat 02 and fails
  naming `gravecanopy:switch@0,0 (0.00)`. **A fixture that cannot fail is not a
  fixture.**

Not reproduced, and said plainly: with the switch struck from a real stance, all
14 open their gate. `bonegrove`'s switch is 2 cells from the gate it opens, and
`gravecanopy`'s now sits 7 units from its own. If "does not work" was about
finding it rather than hitting it, that is a legibility problem in a half-11 room
whose puzzle lives in one far corner, and it is not fixed here.

### Locked in on the way IN — the alcove was built across a door

The owner, fourth time, in capitals: *"I AM LOCKED IN WHEN I ENTER THE ROOM.
YOU NEED TO MAKE SURE YOUR HIDDEN SPOTS GIVE ROOM TO GET IN AND GIVE ROOM TO
ENTER THE ROOM AND NOT GET STUCK. ACTUALLY MEASURE WHAT I AM TELLING YOU TO."*

They were right, and the reason three rounds of probes missed it is that none of
them measured the sentence. Every one asked *can the player reach the puzzle*.
None asked *can the player get off the doormat*.

**`tearwell` built its reward alcove at gap 0 from its east door.** Walk in from
`weepinghall` and you stand in a pocket of **five lattice points** — a third of a
square unit — with a raised gate beside you. `beat-07-sluice` is the beat in every
screenshot.

The corner search tests the footprint plus an apron against props, terraces,
pickups and reachability, and **it had never once looked at a door**. It could not
have caught this by accident either: the apron is deliberately inward-only,
because an outward apron of solid-geometry tests hits the room's own perimeter
wall and disqualifies every corner in every room. Doors live on that perimeter.
So the footprint landed beside a threshold with nothing testing the one side that
mattered.

`puzzleFor` now takes an `isDoorway` predicate, `room-graph` fills it from the
room's real `doorCells`, and a corner is given up if a doorway falls within two
cells of the footprint on **any** side — all four, which is safe for this test
where it was not for the geometry one, because the predicate answers true for door
cells and nothing else.

**New probe: `tests/qa/door-reach.mjs`** — for all 108 rooms and 196 doors, flood
from **one seed at a time** with the real body, the real ground and the gate up,
and ask whether each threshold is connected to the room. Flooding from one seed is
the whole point: `puzzle-solve.mjs` seeded the spawn *and every door* into a
single merged field, which turned a sealed doorway into a "reachable" island and
is exactly how this survived a sweep I had already written.

    before:  DOORS THAT LOCK YOU IN 5
    after:   DOORS THAT LOCK YOU IN 0   (needs a traversal 4)

Island size is what separates a bug from a design: `tearwell`'s was **5 points**,
while `weepinghall`'s three doors report **2161** — 135 square units, the far bank
of a grapple chasm whose own room hint reads "Cross on the anchors". A coffin is
not a bank. The four remaining are large open ground and are listed separately for
a human to check against each room's hint, not counted as failures.

Verified live: `tearwell`'s alcove now bakes at x −6..−4, the far corner, and the
whole door arrival row reads clear at both body heights.

Honest about which half does what — **looking at doors at all** is what removes
the lock-in, and a footprint-only test achieves it (the predicate marks the cell
inside a threshold, which is inside the footprint); `door-reach` reports zero
either way. The two-cell halo buys the *other* thing that was asked for, room to
enter the room, and a binary connectivity sweep cannot tell one cell of floor
(1.0 around a 0.8 body — 0.10 a side, the number this project keeps shipping)
from enough to turn around in.

Also surfaced and **not** fixed: three rooms whose spawn is not standable by this
probe's reckoning — `beat-03-sink/hollow`, `beat-05-citadel/monolith`,
`beat-12-pyre/ashgallery`. They may be water, a platform or a probe artefact.
Unmeasured is unmeasured; they are written down rather than waved off.

### The gate came up underneath you — the actual softlock

Three play reports said the same thing and I read it as geometry twice. It was
not geometry, it was the gate lifting the player onto its own roof.

**Reproduced live before it was fixed.** In `tearwell`: the hero at local
(5.4, −4.4), *inside* the alcove, at y **3.94**, with the voxel column beneath
them reading `[1,0,0,0,0,0,0]` — floor and nothing else. Feet at y 2.99 on a gate
whose top is y 3, `grounded: false`, `vy: −0.37`. Falling into a sealed box, with
the block still parked at its spawn and the plate unpressed.

**The cause is the half-cell, one more time.** A cell rect `x0..x1` spans world
`[x0, x1 + 1]`. The guard that stops the gate closing on the player read:

```js
lx >= clear.x0 - 1 && lx <= clear.x1 + 1
```

which *looks* like a cell of slack either side and is not: `x1 + 1` is the
footprint's exact world edge, so the low side got 1.0 of margin and the high side
got **zero** — before adding a 0.4 body to it. A hero at local z −2.9 sits
outside `lz <= z1 + 1` (−3) while their body spans −3.3 to −2.5 and overlaps the
gate's own cell `[−4, −3]` by 0.3. The gate rose through them, lifted them two
cells, and they slid off the inner side into an alcove whose walls are two high
against a one-cell step — with the plate that opens it outside.

It hit **two of every three puzzles**: `CORNER.teach` and `CORNER.develop` are
both `sz: -1`, so `gateZ` is `z1`, the edge with no margin. Only `combine`
(`sz: +1`) hung its gate on the padded side. The existing spec had the gate on
that padded edge too, which is why it passed throughout.

Two changes. The margin is now symmetric about the true world span and includes
the body (`PAD = 0.55`). And the net that was missing entirely: **a gate opens
for a player standing behind it.** With the signal off and the player inside,
the old code ran *neither* branch — not `drop`, not `raise` — so a gate that had
already shut stayed shut for good. That silent third case was the softlock.

Verified in the running game: the gate drops while the hero is in the alcove,
stays down as they pass through the doorway, and re-seals once they are clear at
local z −1.8. The puzzle still works; it just cannot hold anyone in. Each half is
counterfactual-verified separately — zeroing `PAD` fails the far-face spec,
removing the release fails two others.

### Fixes from the third play — the room behind the door

The owner, still stuck: *"YOU NEED TO MAKE SURE THERE IS ROOM FOR THE PLAYER TO
ENTER THE ROOM, MOVE THE BLOCK ONTO THE PAD, AND ENTER THE SPACE WITHOUT ISSUE!
Right now there are too many areas where they are too close."*

**The alcove interior was still a one-cell slot.** Last play widened the *mouth*
from one cell to three and measured it: 0.10 of clearance a side became 1.10.
That fixed the door and left the room behind it alone. The side walls stand on
the **outermost columns**, so a three-wide alcove still enclosed a single cell —
the player came through a 3.0 doorway into a 1.0 space, and a 0.8 body has
**0.10 of clearance a side** in it. The same number, one step further in.

The fix costs nothing, because the wall was never doing anything. The corner
search puts the footprint hard against the room edge (`x0` is `-half + 1`, the
first walkable column, with the perimeter wall at `-half`), so one of the two
side walls is built one cell in front of a wall that already exists. The vault
def now carries `flush`, naming that side, and `blockers.js` does not build it.
The interior is two cells — **0.60 a side, six times the room** — the footprint
is unchanged, and all 38 puzzles survive.

Widening the footprint instead was tried first and measured worse: at five cells
the route in went 1.40 → 2.00, but three corners were disqualified outright and
a fourth puzzle became unsolvable. An optional cache that cannot be solved is
worse than one that is merely snug. Also learned, the hard way: **the width must
be odd.** `cx` is the footprint's midpoint and every loose piece is placed
against it; an even width puts it on a half-integer and `settle` is integer-grid
end to end. Width four does not misplace a few pieces — the campaign bakes
**zero**.

**New probe: `tests/qa/puzzle-solve.mjs`.** The first one that drives the real
`PushableBlock` through the real `tryPush` (0.9 units a shove, continuous space,
half-extent 0.7) instead of modelling it as 1-cell grid steps, and the first that
asks whether the *player* can stand where the shove has to come from. It reports
38 puzzles, 0 unreachable, 0 unshovable, 0 unsolvable, 0 un-enterable, 0 trapped.

It was wrong three times first, and each was a lesson worth keeping:

- **It sampled the seam.** `level-builder` registers cell `(x,z)` as the box
  `[x, x+1]`, so a cell's centre is `x + 0.5`, and `blockers.js` knows this for
  rectangles (`rectW` maps `x0..x1` to `[x0, x1+1]`) but not for points (`W` is
  `origin + local`, a cell **corner**). Sampling a row at `origin + z` samples
  the boundary between two rows: every doorway in the campaign read as 0.25 wide
  while the same probe reported the player could walk through it. Two
  measurements disagreeing is the tell.
- **It stood in the crate.** The push stance was tested at one point, 0.05 clear
  of the block; the 0.25 lattice rounded it 0.05 *inside*. 25 of 38 puzzles
  looked unshovable. `tryPush` accepts a whole band out to `half + 0.9`, so the
  probe now tests the band.
- **It walked across a chasm.** The collision world holds XZ solids only, and
  **a hole is not a solid**. Beat 07's `weepinghall` is split end to end by a
  grapple gap with the puzzle on the far bank; a width-only probe strolled over
  it and pronounced the campaign clean. It is now height-aware — ground under
  the body, one-cell climbs, free falls — and seeded from the spawn *and every
  door*, which is the same correction `puzzle-reach.mjs` needed against this
  same room.

**Also new: `tests/qa/room-map.mjs`**, which draws a room twice — the voxel field
and the collision world's answer for a 0.4 body. Both findings this session
appeared as a disagreement between those two pictures before they appeared as a
number, which is the point.

### Fixes from the second play

Five more reports, and the two that mattered most were the same bug wearing
different clothes.

**Enemies had no Y at all.** `Enemy._move` resolved X and Z against the
collision world and *nothing* wrote `rig.position.y` after the spawn set it to a
flat 1.0 — while Phase E2 put terraces in every room, in the PLATFORM map, which
is meshed deliberately without XZ solids so a step stays standable and can never
wall anything off. So the one kind of geometry an enemy could walk into was
precisely the kind its mover could not see: it did not climb a terrace, it
walked *inside* one and stood there submerged. Bodies now sit on the ground,
climb exactly as high as the hero does (one cell) and take a drop of any height.
Measured with a new probe (`tests/qa/enemy-ground.mjs`) over all 118 walking
enemies in the campaign, driven in eight directions across their rooms:
**submerged bodies went from 5 at spawn and 5 after walking, to zero and zero.**

Placement and locomotion had to be separated to get the last four. A body
already standing inside a three-high terrace is not trying to climb it, and the
step limit that correctly stops a chaser scaling a cliff also correctly refuses
to lift that body out — forever.

**A sealed room could hold you forever.** The stalemate valve keys on total HP,
player included, which is right — an enemy hitting you means the fight is still
resolving, so you cannot open the door by standing back from a fight you are
losing. It has one hole, and it is the hole the bug above opens: a room that can
still *hurt* you but can never be *resolved* resets the timer every time it lands
a hit, so the seal held hardest exactly when the player was helpless. The valve
keeps its shape and a second, much longer clock now runs underneath it that
nothing resets while the room is still sealed.

**The attacks looked like construction paper.** One flat additive polygon at a
single colour and a single opacity, in front of a renderer doing ACES, HDR
bloom, PMREM ambient and contact shadows. They are shaded now — the Light Caster
is an actual beam with a hot core, a falloff either side, a muzzle-bright
gradient and a discharge pulse; melee is a rim of light with a bright edge and a
trail that wipes across its own life.

The constraint that shaped the fix: **the shape drawn is the shape that hits.**
Making a swing look better by making it bigger is the exact lie the previous
session removed, so the geometry is untouched and every pixel of new character
is shaded *inside* the hitbox. Over-draw is still **0% on all ten player moves**.

**The side rooms had a one-cell door.** The reward alcove's side walls ran its
full depth, met the open face and pinched the way in down to the single middle
cell. The hero's collision half-extent is 0.4, so entering meant threading a 1.0
gap with **0.10 of clearance per side** — the tightest doorway in the game by
about a factor of five, on every alcove in the campaign, in all four
orientations. The side walls stop one cell short now: **0.10 → 1.10 per side.**
The gate already spanned the whole face, so a closed vault is exactly as closed
as it was.

Worth recording *why this survived so long*: every cell-level check in the
puzzle probes passed throughout, and kept passing after the fix. Each cell in
that doorway was empty, standable and reachable. Not one of them asked how much
room a **body** has, which is a different question from whether a cell is free —
and it is the question a player asks with the stick in their hand.

**Two reports were not reproducible from the table.** Sweeping every puzzle
piece the campaign actually bakes — reading the settled layout out of the bake
rather than re-deriving it from the authored offsets — finds no piece that is
unstandable, unreachable on foot, jammed against the vault it opens, or sealed
away from the floor; and no room whose spawn or respawn lands inside a vault.
`tests/qa/puzzle-reach.mjs` is the sweep, and it floods each room from its spawn
*and every door* at the hero's own one-cell step height. Two false alarms it
raised on the way are recorded in its header, because both were instructive: a
top-down surface scan puts you on the roof of Beat 08's canopy instead of the
floor under it, and a spawn-only flood calls Beat 07's far bank unreachable when
the room is a `grapple_gap` whose own hint says "Cross on the anchors".

### Fixes from the first play of Phases C–G

Three things the owner hit in play, and the sweep each one opened up. Every fix
below was reverted afterwards to confirm a spec fails without it.

That last step is not a formality this time. **Six of the twenty fixes could be
reverted with the whole suite green**, and finding out why was worth more than
any single fix: two specs had installed the thing under test by hand (one of
them hard-coding into its fake switch the exact flag the real switch was
missing); one compared the smear against a reimplementation of the smear rather
than against the mesh; one asserted a distance with a `>` that its own boundary
case satisfied; and two guarded lines turned out to be **unreachable** through
the public entry point on all 42 rooms, which is a fact about the code and not a
gap in the specs. See HANDOFF trap 23.

Also new: `tests/qa/telegraph-shots.mjs` photographed all fourteen bosses and
none of the hero, which is the gap this bug lived in. It now takes ten player
shots as well — five swings, five charges — and the first look at them found
something no number in the project was asking about: **nothing in combat has
line of sight.** `hitboxCheck` takes two positions and a move and holds no
reference to the world, so the lance leaves the player, crosses the room's wall
and keeps going, and so does every other attack in the game. Left unfixed on
purpose; it is a design call, not a defect. Suite: **4426**, unit **3562**.

**The Light Caster was drawn nowhere near where it hits.** Two separate faults
in the same weapon. Its ordinary shot drew **nothing at all** — `tryAttack`'s ray
branch returned before reaching the smear, on a comment that the caller would
draw it with the `LightLineSystem`, and the caller never did; the game's only
ranged weapon had no visual for its entire existence. Its charged lance was drawn
as a sector of radius 16 — and `ArcSmear`'s fan starts at 35% of its radius, so
the picture began **5.6 units in front of the player** and ran out to 16, which
on a top-down camera is most of the way off the screen. The lance actually
resolves as a lane 1.8 wide starting at the player's feet. Nothing was drawn
where it hit, and everything drawn was somewhere it could not reach.

The fix is a lane primitive in `ArcSmear`: any non-radial move resolves as a
rectangle — that is literally what `hitboxCheck` computes — so it is now drawn as
one, at the hitbox's own length and width, and it does not creep outward over its
lifetime the way a fan does.

**Sweeping that found a third.** Every melee swing was drawn at a hard-coded 110°
whatever the weapon was authored at, so the Bare Strike promised more than twice
the ground its 50° swing could reach. `arcMove` now carries the authored angle and
the smear uses it. Measured over the whole kit with a new probe
(`tests/qa/smear-vs-hitbox.mjs`): colour on ground a move cannot reach has gone
from 13–25% of every melee swing to **zero across all ten player moves**. The
swings look narrower, because they always were.

**Puzzle pieces were placed without looking.** `puzzleFor` asked whether the
*vault's* corner was clear and asked nothing at all about the block, the plate,
the socket, the switch or the beam — each of which is placed at a fixed offset
from that vault. Kit props go into the room map and terraces into the platform
map long before the puzzle picks a corner. A sweep of all fourteen dungeons
(`tests/qa/puzzle-placement.mjs`) found **four pieces baked inside solid
geometry**, two of them pushable blocks that could not be shoved a single cell in
any direction — which is the "some rooms you can't place blocks" this started
from. Pieces now settle: nearest free cell within three, and a beat that cannot
be laid out honestly is dropped rather than shown. The campaign bakes 38 sealed
caches with every piece verified standable and every block verified able to reach
what it fills.

Separating *geometry* from *the room's own content* mattered here: passing both as
one hard rule cost eleven of the forty-two beats, because a plate three feet from
a torch is simply a plate. The vault still respects both, because it builds walls.

**Five more, found by pulling on that thread.**

- **The gate could close on the player.** The alcove behind a timed gate has three
  permanent walls, so a gate that re-raised while the player stood in it sealed
  them in a one-cell box with no exit, no reachable switch and no reset. On the
  seven switch-led dungeons the sequence producing it is "hit the switch, walk in,
  take the cache, wait six seconds". The signal now decides when the gate *may*
  close; the player's position decides whether it does.
- **Only two weapons could work a switch.** The switch rides the destructible
  list on the stated assumption that every weapon routes a swing through it. The
  player-side loop is gated on `weapon.shatter`, which is true of the Tectonic
  Wedge and the Heavy Mallet and nothing else — so switches, the entire puzzle
  vocabulary of every even-numbered dungeon, were unusable with three of the five
  weapons. Targets may now opt in to being struck by anything; ore does not, and
  still needs the heavy weapons.
- **Beat 12's beam fired through its own vault.** The light ran along the vault's
  centre row, so the mirror's resting place was *inside* the alcove. Every piece
  fitted and the puzzle could not be solved. It runs five units out now. Its
  mirror's reflection direction was also hard-coded for one corner and derived
  wrong for the other three — the corners a puzzle only falls back to when the
  room already filled the first, i.e. exactly the case nobody would have played.
- **Blocks could be shoved into terraces, and lied about moving.** Terraces live
  in the platform map, meshed deliberately without XZ solids, so `resolveMove`
  could not see them. And `tryPush` returned true whenever the reach and facing
  gates passed, so a block wedged against a wall still burned the push cooldown
  and grunted, five times a second, forever.
- **The last writer of the frame won the signal.** `SignalBus.set` stored a bare
  boolean, so two pieces holding the same name fought over it. The `develop` beat
  of every switch-led dungeon is built out of exactly that pairing — a switch on
  a fuse and a plate a block can hold, either of which should open the gate — and
  the plate updated second, wrote `false` because nobody was standing on it, and
  cancelled the switch in seven of the fourteen dungeons. A signal is now on while
  *any* named source holds it.

Also: a lit lens now latches like a filled socket, which the file's own rule
already said it should. And the two moves with no front — the Mallet's spin and
the mid-dash lunge — sample where the player *is* rather than ahead of them, so a
move that turns all the way round can set off a switch behind your back.

### Phases C–G of ROAD-TO-TEN — the player's side, the encounters, the dungeons, the art direction, and the cut list

The plan's remaining five phases, in one pass. What follows is the short version;
each system's own file carries the long one.

**Phase C — the player got two verbs.** Holding attack past `CHARGE_TIME` buys a
committed strike per weapon: a 360° spin for the Mallet, a 4.6-long lane thrust
for the Wedge, a knockback shockwave for the Anchor Link, a wider piercing lance
for the Caster. Attacking mid-dash converts the dash into a lunge — before this,
dash was purely defensive and had no answer at all to something shooting at you.

Two design rules held throughout. The charged move **does not resolve on
release**: it pins the body for `CHARGE_WINDUP` and lands from where you stood,
because this game asks every boss in it to keep that promise and the player does
not get an exemption. And charging is a **choice, not an upgrade** — damage per
second over the full commitment is at or below tapping for every weapon, so what
you buy is shape (every direction at once, or reach) and what you pay is
standing still.

`hitbox.js` gained `radial`. `omni` already existed for spin attacks and is a
SQUARE — it keeps the lateral gate and only drops the sign of the forward test,
so a move with `range === depthTolerance` reaches 1.41× further into its corners
than the circle the smear draws.

**Phase D1 — the encounter director.** There was no coordination layer at all:
every enemy committed the instant its own cooldown allowed, which produced either
three overlapping wind-ups with no ground left to stand on (the game's "every
attack is dodgeable" promise silently broken, in exactly the rooms where it
matters most) or a conga line. `N` enemies may be committed at once — 1 in beats
01-04, 2 through 10, 3 in the finale — and the rest **pressure**: close, hold
their kind's range, and circle.

Two things it took two attempts to get right, both measured:

- A fixed pressure window **yo-yoed**: 0.7s of backing off, then chase walking
  straight back into melee to be refused again. The window re-arms while the room
  is still full and drops the moment your turn comes up.
- First-come-first-served **is not a queue**. Over twenty seconds in a
  five-enemy room at one token, two enemies attacked twenty-nine times between
  them and two never attacked at all. With the queue: `8, 8, 8, 8, 8`.

**Phase D2/D3 — elites, and the bestiary grid.** The score system has defined an
`elite` award worth 250 since it was written and nothing had ever fired it. Five
elites, one per dungeon from beat 05, each an existing kind with one twist: the
Lance Captain lunges twice with the second lane perpendicular to the first, the
Plated Warden's plate covers 120° instead of 75 (with its turn rate dropped, or
it is the unkillable-bulwark bug wearing a health bar), the Frost Chorus fires a
three-shot fanned volley, the Brood Mother's children split once more, and the
Mote Cluster is three bodies sharing one health pool.

The kind × AI matrix was **18 of 35 cells authored**. It is 35 of 35 now, and it
cost no new enemies — seventeen existing ones were retuned, so encounter counts
and the threat curve are untouched. Plus two genuinely new kinds: the **Weaver**,
which lays slow strands across the floor and changes the room rather than
attacking you, and the **Censer**, which heals and shields its neighbours and
cannot save itself — the first enemy in this game whose answer is target
priority.

**Phase E1 — the puzzle kit.** All four blocker types the game shipped with ask
the same question: *do you have the item?* That is a lock. Seven new primitives
(pushable, pressure plate, socket, switch, timed gate, beam source, beam target
with pushable mirrors) talking through a per-dungeon signal bus, and **forty
authored puzzle beats** across all fourteen dungeons, up from a campaign-wide 1.5
blockers each.

Two decisions worth stating plainly. **Every one guards a reward, never a
route** — a gate across a corridor has to know the corridor is not the only way
to a door, and this pass authors fourteen dungeons' worth from a table without
reading fourteen dungeons' worth of layouts. And **every pushable resets when you
leave the room**, which is a rule rather than a list of corners somebody thought
of.

The plan's `test` slot turned out to be the boss room in all fourteen dungeons,
so the exam moved to `combine` — which is also where the elite now stands.

**Phase E2 — vertical interest**, ticketed twice before and dropped twice because
it was filed as a graphics ticket. Terraces go in the PLATFORM map, which is
meshed without XZ solids, so a terrace is standable and never blocking and a
one-cell step is exactly what the physics body climbs. Nothing this can generate
is able to make anywhere unreachable — which is the traversal audit that stopped
it the last two times.

**Phase E3 — the people.** Zero NPCs, in forty-nine overworld screens and
ninety-nine rooms; beat 09 is called *Ruined Town* and had nobody in it. Three
settlements with a fire, a crowd and somebody who talks; beat 09 gets its dead,
frozen mid-task and silent.

**Phase F — the four dead kit channels.** `dungeon-kits.js` declares seven design
channels per dungeon and only three were read by anything. Now built: 56 named
prop kinds as actual voxel geometry, 14 arena shapes for `bossRule`, 14 distinct
atmospheres (embers over the Pyre, vapour in the Cryo Vault, drips in the
Sluice — all sixteen regions shared one grey dust field before), and the 14
authored `accent` colours, which the props are the thing that finally reads.
Plus the receiving end of a hit: sparks thrown along the blow and debris keyed
to the target's material, and a short pull-in on the killing blow.

**Phase G — cut and fix.** The three endings are gone from the save schema
(written by nothing; `setSetting`, their only writer, was called nowhere).
`legacy-factories.js` is deleted. Coach hints and story lines now persist, so a
returning player is not re-taught the whole game. `reduceMotion` and
`reduceHorrorAudio` had **working engine logic in six files and no switch
anywhere** — they have rows in the settings menu now. The menu's `reduceFlash`
and the engine's `reduceFlashing` were different keys that looked like one
setting; one press writes both. The fifth Memory Vial paid nothing against a cap
of four (the same hard-coded four lived in a load clamp too). And `map_memory`
no longer awards 500 points for pressing Tab.

One "fix" the specs stopped: ROAD-TO-TEN's survey reported 14 Scar Sutures with a
wasted remainder. Counted from the level defs, there are **18**. The comment in
`world7.js` was right and the survey was wrong, and adding two would have been
content the game did not need.

### Added — sounds now come from somewhere

`grep -r StereoPanner src/` came back empty. Every sound in the game played dead
centre: the wind-up whoosh of an enemy committing at the left edge of the frame,
a boss changing phase behind you, a sword landing across the room. In a top-down
game the threat that matters is usually the one you are not looking at, and its
only warning is a sound — so the single most useful thing that sound could carry,
*which way*, was being thrown away at the mixer.

New `src/audio/spatial.js`. A listener (the camera's focus point and the frame's
half-width, pushed once per frame) plus a scope:

```js
audioAt(this.rig.position, () => sfx.whoosh());
```

Outside a scope, `spatialize()` hands back the destination unchanged and **not
one node is added to the graph** — unplaced is the default and costs nothing, so
menus, the player's own sword and the low-health heartbeat build exactly the
graph they always did.

**The placement lives in the two frameworks, not at the call sites.** `BossBase`
wraps `onWindup`, `strike` and `onRecover`; `Enemy` wraps `_beginWindup` and its
pending strike. That covers all fourteen bosses and every enemy kind — including
the ones written next year — without a single roster file mentioning audio. The
alternative was ~20 hand-edits and a permanent invitation to forget one, which is
this project's most expensive recurring bug.

Measured in the live game, frame half-width 8.8 world units, rendered through a
two-channel `OfflineAudioContext` (`node tests/qa/stereo-field.mjs`):

| source offset | pan | gain | L rms | R rms | balance |
|---|---|---|---|---|---|
| −17.5 (two frames left) | −0.850 | 0.480 | 0.275 | 0.033 | −0.788 |
| −4.4 (half a frame left) | −0.425 | 0.870 | 0.450 | 0.218 | −0.346 |
| 0 | 0.000 | 1.000 | 0.406 | 0.406 | 0.000 |
| +8.8 (frame edge) | +0.850 | 0.675 | 0.046 | 0.387 | +0.788 |
| unplaced control | — | — | 0.576 | 0.576 | **0.0000** |

Two limits are deliberate and both are guarded by specs. Pan stops at **0.85**,
not 1: a fully-panned sound is silent in one ear and stops reading as *over
there*, it reads as broken. Distance gain rests on a floor of **0.35** — the
rolloff exists to give distance a voice, not to hide things, and an enemy
committing just off-screen is the exact cue the feature was built for. Turning
that floor down is how you would delete the feature while every other assertion
stayed green, so there is a test that says so.

**Found by measuring, not by reading:** a `playTone(..., 'music')` made inside a
placement scope panned to 0.62 like anything else. Nothing calls it that way
today — which is precisely why it needed a rule rather than a comment. The music
bus is now short-circuited in the mixer itself.

#### `monoAudio` — because the feature above is a subtraction for some players

Stereo placement makes a wind-up easier to locate for most players and **deletes
it** for a player with one-sided hearing. That is not a hypothetical: this
game's owner hears in one ear, reported it the day the feature landed, and the
numbers are worse than "harder to place". A cue at the left frame edge, as heard
by a right-ear-only player:

| | R rms | vs an unplaced sound |
|---|---|---|
| stereo | 0.046 | 8.0% — **−22.0 dB, effectively gone** |
| mono | 0.390 | 68.2% — −3.3 dB, audible |

`monoAudio` (Settings → *Mono audio*, off by default) collapses the pan to
centre. **The distance rolloff is deliberately kept**: loudness carries distance
perfectly well in one channel, so a mono player keeps half the information
rather than none — measured, gain still falls 1.000 → 0.415 across the same
walk, with channel balance 0.00000 in *every* row.

Structurally, a pan of exactly zero now builds **no panner at all** rather than a
panner set to 0, so the mono path cannot put signal in one channel even by
accident. That also means a source standing dead centre adds nothing to the
graph, and a context with no `StereoPannerNode` still gets its rolloff.

The setting lives in `engine/settings.js`, not in the `sovereignProgress.settings`
mirror its three menu neighbours use. Those two parallel stores are why the
menu's `reduceFlash` and the engine's `reduceFlashing` are different keys that
look like one setting — a real bug, and phase G's job. A fourth toggle in the
wrong store would only have made that job bigger.

### Added — the score answers a boss phase change

`sfx.phase()` fired on every phase change in the game and the music never
noticed. It does now: `scoreStinger(phase)` schedules a four-note figure on the
**next beat** — prompt, but in time, so it reads as the score responding rather
than as the score being interrupted. `sfx.phase()` remains the instant alarm;
this is the follow-through.

The notes are scale *degrees*, so the figure lands in whatever key the track is
in — and the 26 tracks span a dozen keys and six modes. Phase 2 closes on the octave
(consonant: *it stood up*). Phase 3 stops one degree short and lands on the
leading tone, unresolved — the fight is not over and the tune says so. Verified
in the live game against the boss theme in D harmonic minor: **D–F–A–D** for
phase 2, **D–F–A–C♯** for phase 3.

**One half of this ticket was not implementable as written.** The plan called for
a layer bump alongside the stinger via `setMusicIntensity`. There is nothing to
bump: `index.js` re-derives intensity from the live scene *every frame*, and any
live boss pins it at 3 — already the maximum. A phase-change bump would be
overwritten on the next frame and was never going to be audible. The stinger is
the reaction; no intensity call was added.

#### Three faults in the tests, found by attacking them

Every half of the above was reverted and the spec re-run (trap 10). Five
counterfactuals — the framework wrappers, the strike/recover/phase wrappers, the
pan sign, the rolloff floor, the scope's `finally` — each fail loudly. Getting
there took three corrections, all to the *tests*:

- **The spec crashed instead of failing.** With the framework wrapper removed,
  a derived `.pan` read threw and took the whole rest of the file with it,
  including a boss section that was still perfectly able to report. A spec has
  to survive its own subject being broken; every claim now fails alone.
- **"Every stinger note is in its track's key" could not fail.** `scaleNote`
  maps *any* integer degree onto a scale tone by construction, so the assertion
  was testing `scaleNote` and reporting the result as a fact about the stingers.
  Replaced with the thing that is actually a choice — that the figures are
  degrees and not semitones, `[0,3,7,12]` being the natural way to write a minor
  triad if you think in semitones, silently legal, and most of two octaves wrong.
- **The QA probe measured against the wrong listener.** `tests/qa/stereo-field.mjs`
  read its pan/gain figures *after* `await ctx.startRendering()` — by which point
  the game's own frame loop had republished the listener from the live camera at
  x=640. It printed −0.850 / 0.350 for all thirteen rows while the audio being
  rendered underneath was correct. Placement is now read in the same synchronous
  run as the graph it describes.

Same family as trap 10 throughout: a green assertion is not automatically
measuring the thing it names, and a printed number is not automatically about
the thing in the column heading.

### Added — the glowing weak points now mean something

Two bosses model a weak point and light it on a real condition. Both were
decoration:

- **Kinetic Core** — a bright underside, lit while it is reachable at the top of
  its bob. Measured: reachable **254 frames in 600** (42% of the fight), paying a
  flat **1×** for every one of them. A genuine timing test that rewarded nothing
  for passing it, signposted in gold the whole time.
- **Sand Spur** — a gold seam on its head, lit while it is beached.

**The plan's mechanic did not fit the geometry.** It proposes "a hit inside a
weak-point radius counts double", but both weak points sit at their body's XZ
centre — the Spur's is on `segments[0]`, which *is* the root; the Core's is
directly underneath. In a top-down game "inside the radius" reduces to "any hit".
These are windows in *time*, and the light was already telling the truth about
when they were open. So `weakOpen` is set from whatever already drives the glow,
and the cue and the rule are one condition that cannot drift apart.

**Multipliers take the max, never the product** — a design decision, not an
implementation detail. On the Spur, beaching *is* its recovery, so the weak
window and the punish window are the same window; multiplying would silently
make it 4×, which is not a new mechanic, it is the fight ending early. Under
max, the Core gets its spike (1× → 2×) and the Spur's damage is unchanged. What
the Spur gains is a hit that *sounds* different: the seam finally tells the truth
about a window that was always there. (Owner's call, 2026-07-27 — spike the core,
leave the worm alone.)

New `gsfx.weakPoint()` is built from `hitFlesh` plus a bright rising fifth rather
than as a new voice, because it must read as *the same hit landing better*. A
wholly different sound would say "different weapon".

`tests/game/weak-points.spec.mjs` asserts **4× is unreachable**, not merely
unused — a test that only checked "the Spur does 2×" would pass just as happily
on a build where nothing had been wired up.

#### A counterfactual that silently did nothing

Reverting `max` to `*` reported **18/18 still passing**, which would have meant
the spec could not catch the exact mistake it was written for. It hadn't: the
`perl` substitution's multi-line pattern never matched, so the file was never
modified and the "result" was the unchanged build passing itself. Re-run with a
patch that *asserts its pattern matched first*, the product version fails four
assertions, two of them reading `took 4`.

A counterfactual that no-ops is worse than no counterfactual, because it
launders a guess into a verified fact. **Assert the patch applied before trusting
the run.**

### Added — bosses now choose, and they read how you play

The last piece of the phase B framework. Every boss picked its move the same
way: one `if` on a cooldown, one action, forever. Fourteen bosses, fourteen
patterns, each solved once and then executed. `chooseAction` replaces that with
a weighted draw, and the rules live in `BossBase` rather than in fourteen
subclasses that would each drift.

A move is declared, not coded:

```js
this.defineActions([
    { name: 'slam',  weight: 3, range: [0, 9],   prefers: 'close' },
    { name: 'sweep', weight: 2, range: [0, 4.5], prefers: 'close', phase: 1 },
]);
```

Four rules, all in the base:

- **distance is a gate, not a rule.** Ranges overlap on purpose. A boss that
  always answers a given range the same way is a lookup table.
- **never the same move three times running** — its weight goes to zero on the
  third draw, so a run is possible and a rut is not.
- **it reads your habit.** An exponential moving average of your distance over
  `HABIT_WINDOW = 4` s becomes one number in [−1, 1], which shifts the weights by
  up to `HABIT_STRENGTH = 0.6`. Camp in its face and the pressure moves come out;
  kite and the gap-closers do. One number, and it is the whole difference between
  a pattern and an opponent.
- **it chains out of recovery ~25% of the time** at `CHAIN_COOLDOWN = 0.35` of
  the usual gap, phase-gated. Recovery being an *unconditional* free hit is why
  fights resolve to wait-hit-repeat.

Selection runs on a **seeded LCG per boss**, so a spec can drive two hundred
draws and get the same histogram twice while the fight itself still varies run to
run. `actIfReady` is the one call a boss's `tickAI` makes.

**It ships wired to a real boss, not as a framework awaiting a customer.** This
session found four separate things that were built, documented and called by
nothing (`measureBody`, `legacy-factories.js`, four dead kit channels, three
unreachable endings), so the Crypt Warden gets its second move now: **`sweep`**,
a short frontal cone that must be blocked or stepped. Beat 01 hands the player
the Bulwark Shield and its own boss never once asked them to raise it.

Two mistakes worth recording, both caught by the spec rather than by reading:

- **The moveset landed in `onPhaseChange()` instead of the constructor.** I
  anchored the edit on `this.contactDamage = 2; this.slamCd = 1.6;` — which lives
  in the phase-2 handler. The Warden would have had *no moves at all* until half
  health. The integration section caught it as `actionSet: null`.
- **A habit assertion that passed on a coin flip.** Counterfactual B (habit
  ignored) failed only one of two claims; the camper case "passed" at 2018 vs
  1982 draws, which a bare `>` will do half the time by chance. Both claims now
  require a 1.5× margin, and both fail correctly. An assertion with no margin is
  not testing a bias, it is testing a coin.

One assertion was also deleted rather than fixed: `t.ok('and it is the same
question, asked from the same range', true, …)`. A comment wearing a test's
clothes.

`tests/game/choose-action.spec.mjs` — 39 claims. Three counterfactuals (no-repeat
removed, habit ignored, distance gate ignored) each fail it, using python patches
that assert their pattern matched before writing.

### Added — phase B is complete: all fourteen bosses have kits

`content-density.mjs` measured the roster at **1.00 committed telegraphed
attacks per boss** across all fourteen. Every fight in the game was one move on
a cooldown — a fight you solve once and then execute. All fourteen now carry a
punish, a pressure move and something that changes in a later phase.

| # | boss | punish (kept) | added | phase |
|---|---|---|---|---|
| 01 | Crypt Warden | slam | sweep | **ground-crack** (ring: get IN) |
| 02 | Tri-Compiler | beam sweep, now lane-marked | converge | **triangulate** (beams become walls) |
| 03 | Sand Spur | erupt | sand-wake | **breach** (it stays up and sweeps) |
| 04 | Kinetic Core | charge | shockring | **fission** (orbs on a cooldown) |
| 05 | The Proxy | bolt | mirror-volley | **proxy-swap** (it leaves the ring behind) |
| 06 | Obsidian Arachnid | leap | web-spit | **carapace-flare** (six lanes, gaps between) |
| 07 | Hydroid Cloud | pulse | orb-shed | **rainfall** (the rain, finally announced) |
| 08 | Skeletal Mantis | slice | scythe-hook (it pulls you IN) | **double-harvest** |
| 09 | Phantasm | echo | after-image | **recollect** |
| 10 | Frost & Fuel | cast-fuel | cast-frost, and the two now CANCEL | **twinned** |
| 11 | Sludge Golem | lunge | sling | **split** |
| 12 | Magma Wyrm | breath | tail-lash (ring: get IN) | **dive** |
| 13 | GUMOI Witness | bolt | index-sweep | **cite** (it quotes earlier bosses) |
| 14 | Leviathan Core | slam | wrapfield | **chorus** |

Eighteen counterfactuals, one per added move, each asserting its patch matched
before the run. Every one fails the spec.

#### What was built once instead of fourteen times

- **`spawnPatch` / `tickPatches` / `clearPatches` on `BossBase`.** Five kits
  needed lingering ground hazards — the Arachnid's web, the Cloud's orbs, both
  of Frost & Fuel's elements, the Golem's pools, the Wyrm's dive. Five private
  implementations of "a circle on the floor that does something while you stand
  in it" is the exact shape of every telegraph bug in this file's history. One
  implementation, and the drawn radius IS the tested radius by construction.
- **`laneMesh`, `discMesh`, `haloMesh`, `bossHit`** pulled out of `BossBase` as
  free functions, because the one boss that is not a subclass needs them too.
- **`player.hazardSlow`**, written by patches and read in `player.js`, so the
  player still owns its own speed and a boss never reaches into it. A dash
  ignores it deliberately: dashing out of a web is the answer to being in one,
  and a slow that also slowed the escape is just damage with extra steps.

#### Two design calls that departed from the plan

**Frost & Fuel's elements now cancel each other**, which the plan asks for and
which is the fight's whole reason to have two heads. What it replaced is worth
naming: the only difference between the heads was a damage number and a friction
tweak that expired on a **`setTimeout`** — a wall-clock timer, so it also kept
running while the game was paused.

**`mirror-volley` is the only telegraph in the game that is allowed to lie**, and
it is documented as such at the call site. Everywhere else a marked patch of
floor is a promise; the Proxy's decoys bluff. It is permitted because reading
which body is real IS that fight, and because the tell is present before the
volley resolves — the real body carries the bright ring, and its marker is drawn
in the bolt's violet while the decoys' are dim and cold. **If that tell is ever
removed this move becomes unfair and must go with it.** A bluff the player cannot
call is not a mechanic, it is a coin.

#### And one more drawn-vs-resolved gap, found in passing

The Hydroid Cloud's pulse drew a radius of 4.2 and resolved at 4.3 (3.4 against
3.5 in phase 1). A tenth of a unit, in the same family as trap 13, with even less
excuse — the two numbers sat nine lines apart in the same object. One number now,
read by both.

`tests/game/boss-movesets.spec.mjs` names every move per boss rather than
counting them, because a generic "at least three" loop that passes tells you a
number and nothing else; when a kit regresses, the useful failure names the move
that vanished. The standoff distance is per boss too — several gate a move on
range, and a probe parked in melee would report those missing on a boss behaving
correctly.

### Added — bosses 03 and 04, and two bosses that had stopped moving

**03 - Sand Spur.** Keeps `erupt` and its beached opening. Gains **sand-wake**:
the burrow mound is now a hazard. That mound is the best tell in the game — it
crosses the floor toward you at a speed you can see, and you can outrun it — and
it did *nothing*. Standing directly in its path cost exactly as much as standing
anywhere else, so the entire HUNT phase, most of the running time of the fight,
was a countdown with no decisions in it. **The exact inverse of this session's
other bug: a perfectly honest picture carrying no threat.** Cheap on purpose —
one damage, a full second between bites, only while it is under. And **breach**
(phase 3): it comes up on *itself* and sweeps a full turn, the one time you
fight it above ground. Telegraphed as the whole circle it will cover, because
the damage rotates through it and a marker that rotated with it would re-aim.

**04 - Kinetic Core.** Keeps `charge` and its slump. Gains **shockring** — each
wall bounce throws a low ring outward, so the corner you were about to retreat
into has a timer on it. It expands, which every telegraph in this game is now
forbidden from doing, and the distinction is the justification: **a telegraph is
a promise about where damage will be, so it may not move; a shockwave is the
damage, and the ring you see is the ring that hits.** And **fission** (phase 3),
which promotes the split orbs from a silent one-off spawn into a staged action
on a cooldown, so the arena stays live instead of stepping up once and settling.

#### Two bosses had stopped moving, and building on them is the only reason it came up

**The Kinetic Core had never bounced.** `bounceArena` is a box of half-extent
`radius` (8); `BossBase._clampToArena` pins the body to `arenaRadius` (7.5) at
the end of every update. The boundary that turns it around was unreachable.
Measured: from the centre it drifts to **(7.5, 7.5) in five seconds and sits in
that corner for the rest of the fight**, velocity unchanged, pressing into a
wall. The first line of `kinetic-core.js` calls it a "bouncing spiked sphere".
It bounced zero times. Nothing caught it because it was still alive, still lethal
on contact, still charging on cooldown, and the fight still ended — it was just
standing in a corner while it did. The bounce box is derived from the clamp now,
so a level passing its own `arenaRadius` cannot re-open the gap.

**The Magma Wyrm froze if you backed into a corner.** The strafe ring is centred
on the *player*; the arena clamp is a box around the boss's *home*. Neither knew
about the other, so a player near a wall put most of the ring outside the legal
area of the boss. Measured with the player at (5, 5): **92% of a sixty-second
fight pressed against the clamp, and 0.00 units of travel over the final five
seconds.** Backing into a corner made beat 12 stand still — the single most
natural thing a struggling player does.

Three fixes were written for it and the first two are worth recording because
both were *correct* and both were useless:

1. **Orbit the other way when blocked.** Detected nothing: the guard clamped the
   target but not the result, so the step "succeeded" inside `circleStrafe` and
   `confineToArena` undid it several stack frames later. Pinned time: 92% before
   and after. **A guard has to run where the thing it guards happens.**
2. **Measure refusal properly, then close the distance.** Still nothing: the
   refusal test compared the outcome against `step`, which is already the
   clamped, truncated version — the Wyrm crept 0.0026 units per frame toward a
   target the clamp had cut to 0.0026 units away, and passed a "did you move a
   tenth of your step" test every frame while standing still. **Comparing an
   outcome against a budget the failure already shrank is how a guard measures
   its own excuse.** Fixed to compare against the arc the strafe *wanted*;
   travel went 10 to 48 units, and it still froze in the endgame, because by then
   it was jammed 2.94 units from a player whose ring it wanted to hold at 3.0 —
   both arcs outside the arena *and* already inside its own minimum radius, so
   "orbit the other way" and "close the distance" both correctly refused.
3. **Orbit a centre that has room for the ring.** The actual fix. Circle the
   nearest point to the player around which a legal ring exists. Final-five-
   seconds travel: **0.00 to 3.92, and identical whether the player stands in
   the open or jammed in a corner.** Hugging a wall to freeze the boss stops
   working; the fight the Wyrm was written for starts.

`BossBase.strafe()` now wraps the helper and injects the clamp, the home and the
orbit centre, and all six roster call sites were swept onto it — a strafe that
each boss has to remember to contain is a strafe that some boss will not.

Four counterfactuals: unclamp the orbit centre, put the bounce box of the Core
back outside the clamp, remove sand-wake, remove breach. All fail.

`npm test` — unit plus browser E2E — **3839/3839**.

### Added — boss 02 is finished: the Tri-Compiler has a kit

The plan says port it onto `startAction`. Reading it first said otherwise: its
cycle is already `pattern → windup → strike → recover` with a real opening, and
the beam net flaring white is a genuine telegraph. **What it lacked was not
structure. It was an answerable wind-up.**

#### The fight's actual defect

Measured, between the white flare (the warning) and the sweep (the damage), the
cores travelled **1.69, 2.65 and 2.88 units** — against a beam that hits within
**0.55** of its line. The net announced itself up to five beam-widths away from
where it would land. That is not a hard tell, it is **no tell**: there was no
information in it about where to stand.

The trio was the only thing in Sovereign Scar that announced an attack and then
walked away from it. `Enemy._beginWindup` states the house rule in its own
comment — *"the enemy holds still while winding up (that pause IS the tell)"*.
The assembly now freezes for the charge: spin, hub drift and ring radius all
stop. Drift from flare to sweep is now **0.03–0.06 units**.

**The first attempt at that fix made it worse, and only measuring caught it.**
Setting the spin rate to zero moved the drift to **7.85 units**. The orbit angle
was computed as `this.t * spin`, so changing the rate does not slow the ring — it
*teleports* it to wherever `t × newRate` happens to point, and the whole assembly
snapped to angle zero the instant it committed. The angle accumulates now.

#### The kit

- **Lane telegraph.** The beams are drawn at core height, and from a top-down
  camera a bright line floating a metre and a half up does not tell you which
  floor tiles it covers. Every other committed attack in this game marks the
  *ground*; this one now does too — three strips, one per live beam, at
  `BEAM_HALF * 2` because the hit test is a distance from the segment and the
  dangerous strip is half-width *either side*. Drawing it at `BEAM_HALF` would
  have painted half the danger. Honest by construction, because the assembly is
  frozen for exactly the window the lanes are up.
- **`converge`.** Every third cycle the trio marks a patch of floor and the
  three bodies arrive in it. The sweep asks one question — *are you standing on
  a line* — and asked it every 5.6 seconds forever; this asks the other one. The
  target is locked when the charge begins and never re-aimed.
- **`triangulate`.** Phase 2 was the same fight 25% faster. The ring now widens
  to 6.4 against an `arenaRadius` of 7.5, which stretches each beam from 7.3 to
  **11.1 units** — the net stops being something you step around and becomes
  three walls crossing the whole floor. Phase 1 asks *where is the net*; phase 2
  asks *where is the gap*. It also makes the fight's own reward legible for the
  first time: at this radius a dead core does not remove a bit of net, it removes
  a **wall**, and the room visibly opens.
- **The brown-out is announced.** `spent` has always doubled the damage each core
  takes and said nothing. Three halos now, one per live core, because on this
  boss the thing you hit is a core rather than a body.

Two more free functions out of `BossBase` — `laneMesh`, `discMesh`, `haloMesh` —
for the same reason `bossHit` came out: the one boss that is not a subclass has
to mark ground too, and a fourth private implementation of "lay a rectangle on
the floor and yaw it" is exactly how this file's telegraph bugs happened.

Six counterfactuals, each asserting its patch matched first: unfreeze the
wind-up (drift 2.37), derive the angle from elapsed time again (7.87), remove
the lanes, remove converge, and put phase 2 back on the tight ring. All fail.

**Three of my own assertions were wrong before they were right**, all the same
way — they compared a mark taken in one cycle against a mark taken in another,
and reported the boss re-aiming when it was behaving perfectly. Claims about a
thing that is rebuilt every cycle have to be scoped to a cycle.

`npm test` — unit plus browser E2E — **3815/3815**. Captures in
`docs/media/telegraphs/`: `tri-sweep`, `tri-slam`, `tri-walls`.

### Fixed — beat 02's boss could not hurt you

Starting boss 02 meant reading the Tri-Compiler first instead of porting it, and
the first thing in it is this:

```js
this.hitPlayer(player, 1, 0.6);
```

`TriCompiler` is the **only** boss in the roster that does not extend
`BossBase`. It is three orbiting cores sharing one HP pool, so it was
hand-rolled — and it called a method it does not have. Driven with a player
parked on a live beam for fifty seconds: **0 damage, and
`this.hitPlayer is not a function` on the first contact.** Its single damage
line has never worked. The beam net was scenery for the entire fight.

**Nothing in a green 2940 said so, and nothing could have.** The suite asks the
opposite question everywhere: `boss-e2e` drives all fourteen and asserts each can
be *killed*, `time-to-kill.mjs` measures how long that takes, `boss-reach-e2e`
proves there is somewhere to stand and still land a blow. **Not one assertion
asked whether a boss can land one.** And from the chair it is invisible — the
throw aborts the update at exactly the moment the beam would have connected,
which looks precisely like a beam that missed. *A fight you cannot lose reads as
a fight you are good at.*

`hitPlayer`'s body is now the exported free function `bossHit`, called by both
`BossBase.hitPlayer` and the Tri-Compiler. `from` is what makes the player's
guard directional and `attacker` is what the parry and the score read, so this
is exactly the thing that must not be re-implemented per boss. One body, two
callers.

New `tests/game/boss-lethality.spec.mjs` sweeps **all fourteen** (trap 5), gluing
a sandbag player to each one for sixty seconds, walking it down through its
phases, and requiring damage. It deliberately does *not* claim how much or how
fast — that is tuning and it lives in `time-to-kill.mjs`; pinning it here would
make every balance change a failure. The one question is whether a damage path
exists at all, which is the question that was never asked:

```
crypt warden           93 hits, first at 0.0s
tri-compiler           10 hits, first at 4.0s
sand spur              70 hits, first at 2.3s
kinetic core          114 hits, first at 0.0s
sludge golem          183 hits, first at 0.0s
...all fourteen lethal
```

Also `tests/game/tri-compiler.spec.mjs`, on the fight's own rules: the beam bites
only on the sweep and never during the wind-up (the flare is a warning, not the
damage), it does not hit once per frame, the brown-out really is a 2x window, and
killing a core takes its beams down and stops them biting.

**One of those assertions was wrong before it was right.** The dead-beam claim
first parked the player midway between the dead core and a live one and demanded
zero hits — it got one, correctly. A dead core stops being repositioned while the
others keep orbiting, so that midpoint wanders onto the beam still live. The
assertion was measuring the test's own arithmetic. Killing a *second* core
removes every beam there is and leaves nothing for a stray position to land on.

`npm test` — unit plus browser E2E — **3804/3804**.

### Added — boss 01 is finished: a telegraph that means "get in"

The Crypt Warden's third move, and the first of the plan's fourteen kits closed
out. `ground-crack` is a band that travels **outward** from the Warden's feet,
and the safe ground is the middle.

Every telegraph in the game up to this point has said the same thing — *not
here* — so a player who has learned only that has learned to run away from
coloured ground. This one asks for the opposite instinct, which is the entire
reason it exists. It arrives with phase 2, so the Warden's second half is a
different fight rather than the same one faster.

New `'ring'` telegraph shape in `BossBase`, with `inRing` as its hit test — the
only test in the game whose centre is the safe ground, and the exact inverse of
`inBlast`. Unlike every other telegraph it also **grows**: it starts at a quarter
size and arrives full-size on the frame it resolves, because a band already
sitting where it will land is just a circle with a hole and says nothing about
direction.

Deliberately the gentlest phase move in the game, and the numbers are the design:

| | |
|---|---|
| the Warden's own contact ring | 2.18 |
| inner edge — safe centre | 3.40 |
| outer edge — safe again beyond | 8.50 |
| worst-case travel (mid-band, nearer exit) | 2.55 units |
| travel available in the wind-up (5.5 u/s × 0.95 s) | 5.22 units |

Two exits, so the worst case is half the band, not all of it — about twice the
time you need. It does one damage in a phase where the slam does two. It is a
lesson with a consequence, not a test. It is also never offered at a player
already standing in the safe hole, which would be a turn where the boss does
nothing and reads as the fight stalling.

### Fixed — four boss telegraphs were drawn one size and resolved another

Found by reading the ring's geometry back out to check it, which is the only
reason it was found at all.

`BossBase.startAction` forwarded to `telegraphShape` only the parameters the
first two shapes happened to need. **Every boss that authored a `halfAngle` or
an `innerRadius` had it silently dropped and drew the default instead**, while
its `strike` went on testing against the authored value:

| boss | move | drawn | resolved |
|---|---|---|---|
| Skeletal Mantis | `slice` | 90° | **137°** |
| Crypt Warden | `sweep` | 90° | **120°** |
| Magma Wyrm | `breath` | 90° | **52°** |
| Crypt Warden | `ground-crack` | 3.83 safe hole | **3.40** |

The under-drawn ones hit you on ground the game painted safe. **The over-drawn
one is not the merciful version** — ground painted lethal that turns out to be
safe teaches the player that this game's telegraphs are approximate, and then
the honest ones stop being trusted too. The whole combat design rests on that
promise. There is no crash and no failing assertion in any of it; the only
symptom reaching a player is "this boss feels unfair", which gets answered by
nerfing damage instead of fixing the lie.

Worst of the four is the Mantis, whose dungeon theme is *"Lock on, then circle —
that is how you get behind armour."* It was hitting 24° a side outside the wedge
it showed, on the exact read four rooms spend their time teaching.

Two fixes, because forwarding alone would leave the trap armed:

- `startAction` now spreads the **whole** aim, not a chosen subset; and
- the three cones now carry their half-angle **in `aim`**, with `strike` reading
  it back out, so the shape drawn and the shape resolved are literally one
  number. They were two literals in two places, which is what allowed them to
  drift apart without either file looking wrong.

New `tests/game/telegraph-truth.spec.mjs` sweeps **every** cone in the roster
rather than the one that was broken (trap 5). It does not assert that a call
site passes `halfAngle` — that would restate the fix and pass on a build where
`inCone` ignored the argument. It drives each boss until it commits, reads the
wedge that was actually **drawn** out of the telegraph geometry, and then asks
the boss's own `strike` whether a player a hair inside that edge is hit and one
a hair outside is not. Reverting the forward fails six assertions across all
four telegraphs.

One thing the fix quietly repaired on its way past: the Kinetic Core's charge
lane authored `width: 2.0` and had been drawing the 1.4 default since it was
written.

### Changed — opposite instructions, opposite colours

Owner's call, 2026-07-27, on seeing the captures: *"If they mean opposite things
then they need to be different colored."* Correct, and the ring was gold like
everything else.

Every other telegraph in the game says *not here, go somewhere else*, and they
are all warm and tinted per boss — gold, amber, orange, one violet. That
vocabulary is consistent and it works. A ring says the reverse. It now gets its
own pair, `TELL_BAND` (0xff4038, the hottest red in the palette — nothing else
in the game is this red) and `TELL_SAFE` (0x50f0d0, the only colour in Sovereign
Scar that ever means *stand here*, which is why it is not spent on anything
else).

**A ring ignores the casting boss's tint, and that is enforced in the base.** A
shape whose instruction is reversed must not be something fourteen kit authors
each get to re-colour to taste, or the one telegraph that means "get in" ends up
wearing thirteen shades of the colour that means "get out". Passing `color` to a
ring now does nothing, and the Warden stopped passing one.

The refuge is also **drawn**, not merely left unpainted. The first capture showed
a dark gap, and a dark gap reads as a pit as readily as a shelter — absence of
hazard is not an instruction, and this is the one move whose answer is to
deliberately run into the middle of it.

#### And the animation was a lie, so it went

The band used to grow outward from the boss's feet. That sounds like the perfect
way to say "come inward", and opening the capture killed it: **scaling an annulus
scales both of its edges**, so at quarter size the band covered 0.85 to 2.13 —
entirely inside the 3.40 refuge. For the first half of every wind-up the safe
ground was painted red, on the one telegraph in the game whose instruction is to
stand in the middle of it. A player obeying the colour would have run out of the
only safe ground there was.

There is no honest way to scale it — a fixed inner edge with a growing outer one
is a different annulus every frame, not a transform. So the band states the truth
and holds it from the first frame, and the rising tension moved to the refuge
brightening instead, which points the right way anyway: the thing getting louder
is the thing to run to. **An animation that is wrong for half its life is worth
less than a shape that is right for all of it.**

Three more counterfactuals, each asserting its patch matched first: let a boss
re-colour the ring, oversell the refuge by 30%, and give the ring back the
standard pulse. All three fail. Unit suite **2940/2940**.

### Fixed — and it was worse in the other 119 fights

Photographing the boss telegraphs (above) meant photographing the *slam*, and
the picture showed the player standing in a clear hole at its centre — on an
attack `inBlast` resolves across the whole disc. Every circle telegraph in the
game drew a donut from 55% of the radius outward while hitting all of it. A
circle telegraph is aimed **at the player**, so that hole was centred on
wherever they were standing when it was cast, every time, on the oldest and
most-used attack shape in the game. They are filled now.

Which pointed at `Enemy`, where the same shape is drawn — and where it carries
the game's first coaching line, verbatim:

> That ring is where the blow will land, not where it started.

It was not, for three independent reasons:

1. **The marker was drawn 0.9 units ahead of the body** while `_resolveMelee`
   measured from the body centre — two discs of equal size half a body apart.
   Behind a sentinel was lethal and unpainted; the front edge of the painted
   ground was safe. The option that did it was named `reach`, which in every
   other line of that class means melee reach, so `0.9` looked correct at both
   sites that passed it. It is `offset` now, and melee passes none.
2. **Its ring was the same donut**, middle 50% clear, so the safest-looking spot
   in the whole marker was fully lethal.
3. **The body moves 0.29 units inside the update that commits the attack** —
   separation, not AI; the docstring is right that it holds still *through* the
   wind-up, measured drift 0.000 over 200 frames. So "measure from the body at
   strike time" was never going to be the painted ground, offset or no offset.

The marked circle is now remembered as data on the **attack** and resolved
against. The promise is structural rather than two call sites agreeing.

**The near-miss inside this fix is the part worth writing down.** The mark was
first stored next to the ring mesh — and a ring's life is exactly the wind-up,
so it had already been disposed by the frame the strike resolved. `_strikeMark`
was `null` at the only moment it was ever read. **The change did nothing in the
running game**, and the spec passed, because the spec called the resolver by
hand while the ring was still up. Trap 12 in a new coat: the assertion and the
game were not doing the same thing. `tests/game/telegraph-truth.spec.mjs` now
drives a real wind-up to resolution, with the player parked on ground that is
inside the ring and outside a body-centred disc of the same radius — the one
position that separates the two implementations, and one nothing short of a
real wind-up reaches. It also asserts the ring and the body are *not* the same
point, because if that ever stops being true the whole section stops testing
anything.

Five counterfactuals, each with a patch that asserts its pattern matched first:
drop the forwarded shape params (6 failures), resolve from the body, never store
the mark, restore the forward shove, and draw the ring away from the mark. The
fourth one earned its keep — it caught the offset default having been written
out twice inside the fix itself, which is the exact failure this whole entry is
about, reproduced in its own repair.

`npm test` — unit plus full browser E2E — is **3755/3755** after all of it. This
changes real melee hit geometry across every fight in the game, so the E2E half
was not optional.

New print-only probe `node tests/qa/telegraph-shots.mjs` photographs all four
telegraph shapes on the bosses that draw them, to `docs/media/telegraphs/`.
Trap 8 says look at the captures when you change how the game looks, and until
now the only way to see a new telegraph was to play to the boss that draws it —
which does not survive phase B adding a move to fourteen bosses. It cost two
wrong pictures to get right: six identical dark rectangles (the death fade — a
boss driven for fifty seconds kills a stationary player), then a correctly-lit
room with the ring scaled to about minus a million (freezing `_telegraphLife`
without `_telegraphMax` sends the growth term negative).

### Not done — `measureBody` as a bake-time assertion was already covered

Phase B's framework list asks for `measureBody()` (`boss-models.js`, written and
called by nothing) to be wired in as a bake-time check that each authored
`hitRadius` clears the measured silhouette. **That assertion already exists**, in
`tests/game/boss-bodies.spec.mjs`, and is better than the proposal in two ways
that matter:

- it measures a **p85** horizontal radius rather than a bounding box, so one
  outlying scythe or trailing tail segment cannot set the whole number; and
- it measures **after ticking the boss for two seconds**, with documented
  exemptions for the Sand Spur (mostly burrowed) and the Magma Wyrm (fights
  through its head, not its tail).

Building a second, cruder version would only have produced a competing opinion.
No assertion was added. `measureBody`'s docstring — which claimed "bosses derive
`hitRadius` from this rather than carrying a hand-written number", a thing that
was never true and got quoted into the plan as though it were the mechanism —
now says what it actually is.

New print-only probe `node tests/qa/boss-silhouette.mjs` covers the other lens:
whole-silhouette extents, cold and running, so it is visible which bosses change
size at runtime. **It also caught its own first answer being wrong**, which is the
finding worth keeping:

| | Hydroid Cloud ratio | bosses reaching past their body |
|---|---|---|
| measured cold | 2.74 — worst in the table | 1 |
| measured running | **0.76 — unremarkable** | **0** |

The Cloud builds its twelve orbs *at the origin* and only flies them apart on the
first tick, so a fresh one is twelve spheres in a heap. Every boss lands in
0.51–0.99 once running: hitboxes at or inside the silhouette, which is the
correct direction. **There was no bug here to fix.**

### Fixed — two bosses turned their bodies without turning their guard

Phase B framework work, done before any individual boss, because it is the piece
that stops phase B shipping a bug the project has already shipped once.

`BossBase.state.facingVec` is what `inFrontArc` reads to decide whether a hit
landed on a boss's plate or behind it. The Crypt Warden and the Skeletal Mantis
set `this.root.rotation.y = Math.atan2(dx, dz)` directly, which turned the
**mesh** and never touched `facingVec` — it sat on its constructor default of
`{x:0, z:-1}`, due south, for the entire fight. It was also instant.

Neither had shown up in play, and it is worth being exact about why: the only
consumer of a boss's `facingVec` is directional armour, and the only boss that
has any is the Obsidian Arachnid — which already used `faceToward`. Boss
knockback does not read it either (bosses damage through `hitPlayer` →
`health.damage`, not the `applyHit` path). **So this was a trap, not a live bug.**
It arms the moment a second boss gets an armour arc, which is precisely what the
plan does to the Mantis at boss 08 — whose dungeon theme is *"Lock on, then
circle — that is how you get behind armour."* Shipped as-is, its plate would have
pointed due south while the body visibly tracked you, and been unflankable even
if aimed correctly.

**A correction to the plan.** ROAD-TO-TEN says *"Only ObsidianArachnid calls it;
eleven others reimplement atan2 inline."* Measured, that is wrong: there were
exactly **two** such sites. Most of the roster never faces anything — those
bosses spin freely (`rotation.y += dt * k`) because they are radially symmetric
constructs. The count was overstated; the hazard was understated, because it
lands on exactly the boss the plan wants to change.

Both now go through `faceToward`, and the Mantis's scythe cone takes its
direction from `state.facingVec` rather than the mesh, so the cone it swings and
the plate it will present are derived from one number.

**The turn rate is a race, so it is measured rather than asserted.** Seconds for
a player orbiting at 6 units/s to clear a ±60° plate:

| rate \ radius | 1.5 | 2 | 3 | 4 | 4.5 | 6 |
|---|---|---|---|---|---|---|
| 0.6 | 0.30 | 0.43 | 0.73 | 1.15 | 1.42 | 2.62 |
| 0.9 | 0.33 | 0.48 | 0.95 | 1.73 | 2.40 | 10.47 |
| **1.1** | 0.35 | 0.55 | 1.15 | 2.62 | 4.48 | **never** |
| 1.4 | 0.40 | 0.65 | 1.73 | 10.47 | never | never |

The "never" is not a fault, it is the rule: at 6 units the player's own angular
speed is 1.00 rad/s, so a boss turning at 1.1 simply wins. **This fight asks you
to close the distance to get behind it** — a real decision, because close range
is where the scythe is. The Mantis keeps the Arachnid's 1.1; the Warden gets 4.0,
since it has no armour and is the tutorial boss, so its turn is readability
rather than counterplay.

`tests/game/boss-facing.spec.mjs` holds both ends: the flank opens inside one
attack cooldown at knife range, and an *instant* turn can never be flanked at any
radius. Reverting either `faceToward` call fails it with `facingVec=(0, -1)`.

### Fixed — the game threw away one press in three

`consumeAttack()` returned a boolean and cleared it unconditionally, and
`Player.update` read it *before* knowing whether anything could act on it:

```js
const attackPressed = input.consumeAttack();   // gone, used or not
if (!this.guard.broken) {
    if (attackPressed) this.tryAttack(...);    // returns early if attackCd > 0
}
```

So every press landing inside a weapon's cooldown — 0.28 s on the Anchor Link,
0.35 s on bare fists, 0.50 s on the Heavy Mallet — was read, found the gate
shut, and binned. It does not read as a mistimed press. It reads as the game
ignoring you.

Presses are now timestamps honoured for `INPUT_BUFFER = 0.15 s`, and the caller
**only consumes when it can act**, so a press made slightly early stays on
record and fires the moment the cooldown ends. It is a window, not a queue: a
second press replaces the first rather than banking a swing.

Measured in the shipped browser bundle, mashing every 0.30 s against the 0.35 s
bare-fist cooldown, 12 presses:

| | swings | lost against the 11-swing ceiling |
|---|---|---|
| before | 6 | 5 |
| after | **9** | **2** |

**The asymmetry is deliberate and load-bearing.** A cooldown is a rhythm and
gets the buffer; a guard break is a *punishment* and does not — those presses
are still drained and discarded, because buffering a punishment deletes it.

`tests/game/input-buffer.spec.mjs` drives the real `Input` and the real
`Player` with an injected clock. **Its first draft passed with the fix
reverted**, because it counted calls to `tryAttack` and the old code still
called it — the early-return lives *inside*. It now counts swings, defined as
what starts a fresh cooldown. Reverting the fix fails it with `swings=1`.
Same family as trap 10: a green assertion is not automatically measuring the
thing it names.

**Not done, and deliberately left for a play session:** the plan also called for
splitting the attack cooldown so a dash cancels recovery but not windup. On
reading the code there is no commitment window to split — `tryDash` never
consulted `attackCd`, so a dash has always been free during *both* the windup
and the recovery. Adding the lock would make the game meaningfully heavier
rather than more responsive, which is a balance change the owner should feel
before it is baked in.

### Added — a probe that measures how much game is in the game

`tests/qa/content-density.mjs`, print-only, no browser. Every other probe in
that directory asks whether something is **correct**; this one asks whether
there is **enough of it**. A green suite can confirm that seven enemy kinds
behave exactly as designed while the campaign only ever puts two of them in a
room at once, and nothing would say so.

It reads the authored campaign source and reports encounter sizes per beat, the
kind × AI matrix, boss moveset sizes, puzzle-primitive counts, systems with no
importers, room topology and player verbs. What it found on its first run is
the substance of the new `docs/ROAD-TO-TEN.md`:

| measured | value |
|---|---|
| committed attacks per boss | **1.00** — all thirteen have exactly one |
| enemy group coordination | **none** — every enemy commits on its own cooldown |
| puzzle blockers per dungeon | **1.5**, and all four types ask "do you have the item?" |
| `pushable-block.js` importers | **0** — a finished 87-line system never used |
| input buffering | **none** — a press during cooldown is read, cleared, discarded |

`docs/ROAD-TO-TEN.md` is the assessment and plan built on it — nine tickets in
priority order with designs, acceptance tests and the traps that apply to each.
Nothing in it is implemented.

Also corrected in `HANDOFF.md`, in both places it appeared: "the `bulwark` kind
is never spawned in any campaign level" was false, and had been sitting on the
"what to do next" list as priority 4. The probe counts **20 bulwark spawns**
across beats 05, 08, 11, 13 and 14. It cannot ever have been true — trap 9, the
armoured-shooter deadlock fixed last session, *is* that kind paired with
`ai:'ranged'` in three of those rooms. A "still open" list is a measurement and
decays like one.

### Changed — the credits name the person who made this

The roll read `['GAME', 'Sovereign Scar team']` — a team that does not exist and
never did — while the author's name appeared exactly once, on the **ENGINE**
line, directly above `MADE WITH Claude`. The last name a player read on their
way out of fourteen dungeons was the tool's. Anyone finishing the game would
have concluded a studio built it with some help.

One person built it. Every dungeon, every boss, every rule about how a fight
reads, and the call on all of it, is theirs. The roll now credits
`sumosizedginger` as creator and across design, direction, world and dungeon
design, combat, bestiary and bosses, art direction, lighting, narrative, sound
direction, engine, production and QA — 14 credits against 1 for the tool, which
is still acknowledged, last, under `MADE WITH`. `package.json`'s author field
loses the phantom team too.

The roll is also paced against its own length now (46s for 27 rows) rather than
a fixed 24s: the scroll is a CSS keyframe whose SPEED depends on content height,
so every line added to the old roll silently sped it up.
`tests/game/credits.spec.mjs` pins attribution the same way the combat rules are
pinned — it does not get to drift.

### Fixed — nowhere to stand on two bosses, and a door that bounced you into a wall

Two reports from Beat 12 play.

**"You have to stand inside of the body to hit it."** On the Obsidian Arachnid,
and it had been reported once before and fixed once before — the boss used to
be flatly `shielded` in phase 1, so the only frames that damaged it were its own
leap, and the leap lands it on top of you. Directional armour replaced the
shield, and the sentence came back anyway for a completely different reason.

`presenceScale` grows the mesh and `hitRadius` together, which looks safe. It is
not, when the base radius was chosen against the boss's **core** and the
silhouette is mostly limbs. Measured from the root:

| boss | scale | visible edge | damage stops at | room to stand |
|---|---|---|---|---|
| Obsidian Arachnid | 1.70 | 3.79 | 4.10 | **0.31** |
| Skeletal Mantis | 1.85 | 3.67 | 4.20 | **0.53** |
| campaign median | — | — | — | 1.49 |

A 0.31-unit band is the entire region where the player is outside the model and
can still land a blow. The natural melee standoff — the one that works on every
0.49-radius mob in the game — is about two units, which is deep inside the legs.
The two bosses that failed are the two scaled hardest last session, which is the
tell: this is a property of the **relationship** between art and hitbox, and
nothing that inspects either alone can see it.

`hitRadius` 1.4 → 1.85 (Arachnid) and 1.3 → 1.6 (Mantis), both with `collHalf`
pinned to its old value so a wider hitbox does not silently widen the boss's
wall probe and change how it moves. Bands are now 1.11 and 1.03.
`tests/boss-reach-e2e.spec.mjs` measures all fourteen in the running game and
floors the worst bearing at 0.6, with the median held above 1.0; the GUMOI
Witness is exempt by name because it fights from seven units up, where a
floor-level probe cannot reach it, and `boss-quality-e2e` already proves it
falls to a sword.

Also: a boss whose armour refused a hit played a sound and said nothing.
`ui/coach.js` opens by stating that a mechanic which can silently refuse input
has to be able to say so; the bulwark has explained its plate since Z5, and the
boss that borrowed the bulwark's armour never borrowed its explanation. It does
now, once, and only for **directional** armour — telling a flatly-shielded boss's
victim to go around it would be a lie.

**"I got stuck trying to go through a door but I didn't have a key and it
bounced me back to being stuck."** All three refusal paths — the seal, the exit
fallback, and the locked/boss door — did the same three lines inline: a raw
write to the player's position, with no collision resolution, of a fixed 1.4,
against a locked door whose trigger reaches 1.2. Two ways to be trapped, and
both are real:

* the 1.4 goes wherever it points. Measured across every refusable door in the
  campaign, `beat-10-cryo/coldstore:N` embeds the player **0.40 into geometry** —
  exactly their own half-extent;
* if the push is blocked or simply too short, the player is still inside the
  trigger next frame. `checkDoorTriggers` runs every frame with no cooldown, so
  the door refuses again, and each refusal calls `resetVelocity()` — **10
  refusals in two seconds** of walking into one door. The bounce becomes the cage.

Now one `refuseDoor` helper: the push is resolved against the collision world,
its distance is derived from the trigger it has to clear rather than a magic
number, and a refusal cannot repeat for `DOOR_REFUSE_COOLDOWN` (0.7s). The
cooldown gates the **bounce**, not the door check — gating the check was the
first attempt and it broke seven `world-e2e` assertions by skipping doors the
player could now open, so a key was never spent. `tests/door-refusal-e2e.spec.mjs`
sweeps all 79 locked and boss doors.

Full suite **3532/3532**.

### Fixed — god mode silently switched off the parry, and sealed a room shut

Reported from play, in Beat 05: *"cannot parry enemy, enemy cannot hit me, stuck
due to this."* The `DEV · GOD` badge in the corner of the screenshot was the
whole answer.

Dev god mode wrapped `player.health.damage` and returned before calling
through — one line, and it looks obviously correct:

```js
if (this.enabled && this.god) return { accepted: false };
```

But `HealthPool.damage` is where `damageFilter` runs, and `damageFilter` **is**
`GuardController.resolve`. Returning early therefore switched off the **parry**
— the verb the entire defensive kit is built around. The consequence is not
"the dev takes no damage". A bulwark's plate opens two ways, by flanking or by
a parry, and its plate refuses the Light Caster from the front exactly as it
refuses a blade. So a god-mode player who parried was fighting something that
could not be opened at all, and could not hurt them either. In a **sealed** room
that is a softlock.

Measured in beat-05 greathall, a sealed room holding a bulwark:

| | wind-ups | parries | damage taken | killed | door |
|---|---|---|---|---|---|
| god off, blade | 7 | 3 | 4 | yes | released |
| god off, Light Caster | 4 | 2 | 2 | yes | released |
| **god on, either** | **89** | **0** | **0** | **no** | **still shut** |

God mode now runs the real damage path with both multipliers pinned to zero, so
the filter resolves — a parry still staggers whoever swung, poise still spends,
the guard arc still matters, i-frames still arm — and `dealt` is 0, so the pool
returns before it can touch `hp`. `onDamage` is muted for that call, because a
hurt flash for zero damage is a lie in the other direction. **Both**
multipliers: `damage()` picks `environmentDamageMult` for environmental sources,
so zeroing only the hostile one would have left lava killing a god-mode player.
This wrapper has broken combat in the same shape once before, by dropping
arguments and eating the `meta.from` the directional guard reads.

The wrapper is now `installGodDamageWrapper`, extracted from `DevMode` (which
builds DOM on construction) so `tests/game/god-mode-combat.spec.mjs` drives the
shipped code rather than a copy of it.

**And a valve on the seal.** Room seals landed last session, and this is the
failure they are most dangerous for. `tests/game/room-seal.spec.mjs` checks the
seal against level *data* — never the entry room, never one with an overworld
exit, never one holding something unreachable — which is everything a static
check can see, and it could not see a runtime state where the fight stops
resolving. A sealed room now releases after `SEAL_STALEMATE_RELEASE` (45s) in
which **no HP changes in either direction**. The condition is a mutual
stalemate rather than a timer on the room, so it cannot be used to wait out a
fight you are losing — an enemy hitting you counts as the fight still
resolving and resets it. The tradeoff is honest: a player who kites perfectly
for 45 straight seconds gets the door, which is a far better failure than a
ruined save. `tests/seal-stalemate-e2e.spec.mjs` drives the real room graph and
includes the control that a fight taking one chip of damage every five seconds
is still held.

Full suite **3509/3509**.

### Fixed — the armoured shooter that nothing could hurt

Reported from play: *"cannot parry enemy, enemy cannot hit me, stuck due to
this."* A `bulwark` with `ai: 'ranged'` — authored in three rooms (Beat 05
westgallery, Beat 08 gravecanopy, Beat 11 cardfile) — was a stalemate that the
game actively taught the player to lose. Two good rules met on one enemy:

* the plate refuses blades **and rays** inside a ±75° front cone, which is the
  only angle a shooter lets you approach from;
* a bolt already in flight is **reflected** by a raised guard rather than routed
  through the parry — deliberate, because frame-accuracy on something you cannot
  walk out of is a read the game never showed you.

So the parry verb never fired against it: **0 staggers over 100 seconds of
perfectly-timed taps**, against 17 for the same enemy in melee. And the reflect
— the one answer left — came back from directly in front, because that is where
the player who blocked it is standing, and the plate ate it: **49 clangs, 0
damage**, while the `reflect-bolt` hint promised on screen that a blocked bolt
kills the thing that fired it. Nothing could hurt anything, in either direction.

A reflect now **staggers** the shooter before resolving, which is what a parry
does and what a reflect is the ranged half of — the same rule `stagger()` was
written for: whatever makes this enemy hard to hit, the read undoes. Applied to
every reflect, not just armoured ones, so it cannot special-case; an unarmoured
shooter already died to the bolt outright, so it is invisible there.

The `armor-front` hint told a bulwark's victim to *"parry its swing"*. A ranged
bulwark has no swing, so that was the only instruction those three fights ever
gave, and it could not be followed. The shooter gets its own line under its own
id — a shared id would have let the melee bulwark, which every route meets
first, silence it permanently.

Measured in-game before and after, with the real player and the real guard:
`hp 3 → 3, killed: false, 49 plate blocks` became `hp 3 → 0, killed: true, 0
plate blocks`. The plate itself is unchanged: a melee bulwark still refuses
frontal melee, still opens from behind, and a player who stands still swinging
at one still gets nowhere. New spec `tests/game/reflect-armor.spec.mjs`; its two
behavioural assertions were confirmed to fail with the fix reverted, while every
control in it stays green in both directions. Full suite **3478/3478**.

### Bestiary, bosses, and light — the four things the pictures showed

Everything below started from looking at `docs/media/certification/`, and
every number in it was measured before it was tuned. Full suite **3466/3466**,
including all browser E2E.

**Seven enemies instead of one in seven colours.** Every enemy in the game was
built at the same two numbers — `torsoProfileScale 0.65, meshScale 0.33` —
because no level ever passed anything else, so the armoured bulwark, the
floating mote and the long-reach lancer were the same body at the same size.
The knob that existed could never have fixed it: sweeping `torsoProfileScale`
from 0.42 to 1.15 was measured to move a rig's DEPTH from 0.39 to 0.80 and
leave its width at 0.98 the whole way, because a rig's width is its arm span.
`characters/bodies.js` adds per-axis proportions applied to the leaf meshes
(never to a parent group, or limb rotations shear). The bestiary now spans a
0.97 brood to a 2.15 lancer, and the closest pair differs by 14%.

**Hitboxes derive from the body.** `hitRadius` was a hand-typed 0.5 against a
rig that measures 0.490 — right by coincidence, and it would have stayed 0.5
for a bulwark 1.4× as wide. It is now the measured rig radius, with
`attackRange` (0.9 + radius), the wall probe, the telegraph ring and the split
child's placement probe all following from it. The sentinel is unchanged to
three decimal places, so nothing that was tuned against it moved.
`tests/game/bodies.spec.mjs` resolves every claim through the real
`hitboxCheck` at world positions, including the counterfactual that the old
fixed 0.5 would refuse a hit on the bulwark's own surface.

**Enemies carry the rules they enforce.** The lancer's identity is reach and
its hand was empty; the bulwark's identity is a front plate and it had none.
Both now hold something, sized from the reach that resolves damage.

**Glowing things light the room.** `userData.localLight` — the tag the pooled
light manager scans for — had exactly one occurrence in the codebase: the line
inside the pool that reads it. Zero producers. `dungeon-kits.js` had declared
an `emissive` motif for all fourteen dungeons since it was written and nothing
read that either. So the game had an authored plan for what glows in every
room, a working budgeted point-light system, and no wire between them: the
Pyre's lava sat two metres from unlit violet stone. Rooms now place their kit's
motif as real fixtures at bake time and register the lights, deduped against
the level-load scan, freed with the room, and range-culled so a lamp 60 units
away in another room cannot hold a shader light slot.

**Bosses are made of the same stuff as the game.** Twelve spheres, seven boxes,
three icosahedrons, a torus, two dodecahedrons and two cones — smooth analytic
solids in a voxel world, including a final boss that was a plain sphere.
`bosses/boss-models.js` replaces them with voxel builders taking the same
arguments, so all fourteen `tickAI` implementations keep their animated part
references. Two were also modelled for a view this game does not have: the
Mantis's scythes stood 2.4 units straight up (two thin bars from above) and now
sweep forward, opening in yaw where the camera can see it; the Warden's blade
was a 0.2-wide vertical slab and now has a footprint. Presence up 1.4–1.85×,
through `presenceScale`, which grows the radii with the mesh.

**Bloom stopped eating the boss fights.** The roster ran emissive at 1.1–2.4
against a bloom threshold of 0.85; `beat-10-cryo-boss.png` was the arena as one
white blob. Capped at 0.55 in the base constructor AND at the six runtime sites
that raised it again afterwards — including the Tri-Compiler, which is the one
boss that does not extend `BossBase` and so slipped the constructor fix
entirely. Bosses now light their arena with a real point light instead.

**Rooms that hold you.** Nothing in the game sealed: you could walk past the
whole bestiary and finish the campaign without using the guard, the parry or
lock-on. 26 rooms (24%) now hold their doors until cleared. Authored per room,
never the entry room, never a room with an overworld exit, never one containing
a hovering mote — a sealed room is a promise that it is clearable, and a room
that seals around something the player cannot reach is a ruined save, not a
difficulty spike.

**The coach went from 3 hints to 13.** Guard, poise, guard-break, the telegraph
ring, lock-on, weapon cycling, reflected bolts, room seals, and one per gated
item, said at the moment the player first meets the thing.

**The luminance gate was measuring the vignette.** The band was `[45,90]` on
FULL-FRAME mean. Measured A/B on the same scenes with only the vignette
changed: full-frame mean moved 58→111 while the centre-crop mean moved 84→98.
Nearly all of the number the gate watched was the post stack crushing corners
to black, so it would have demanded the lighting be halved to compensate for a
change that never touched the lighting. The band is now on the centre crop.

**And the correction that matters most.** Easing the vignette and wiring the
fixtures both raised the measurement; the band was re-derived from the result;
every level passed comfortably — and the frames were flat, milky and worse than
what they replaced. Global light had been raised on top of adding local light,
and the normal perturbation was strong enough to read as smoke. Fixtures came
down 45%, thirteen dungeon tunes came down, the boss glow came down, the
vignette came back half way, the noise frequency moved twice (clouds at 0.55,
static at 1.7, surface at 1.15) and its bump amplitude fell to a third. None of
that was decided by the statistic. A gate is a ratchet against regression; it
is not evidence that the art is good, and this project has now been wrong about
that in the same way three times.

**Found by the new assertions, while they ran:** a lancer carrying a 6.4-metre
pike (the prop was sized from `attackRange`, which is 7 for a ranged lancer, so
it hung five metres through the floor); two bosses re-assigning `hitRadius`
from a bare literal every frame and silently discarding their own presence
scale — one of which made the Hydroid's hitbox SHRINK at the phase where the
swarm grows; and a shadow softness of 3.5 texels that worked out to a tenth of
one voxel, i.e. the "soft shadows" ticket shipped shadows that were not.


### Playtest 2026-07-23 — seven issues closed

Real run of beats 06 → 12 (EASY, Heavy Mallet). Every item below has a
spec proven against the pre-fix behaviour.

**6 / 7 — Bosses walk through walls and leave rooms.** `BossBase` never
received a `collisionWorld`, so `circleStrafe` / `moveToward` wrote straight
to the transform. Threaded collision into the base class, bound resolvers on
the position so every helper call site picks them up, and end every update
with an arena clamp around `home` so leaps and direct writes still cannot
leave the room. `attachBoss` wires `collisionWorld` and derives
`arenaRadius` from the room half. Enemies now get `roomBounds` at bake time
and clamp `_move` (and knockback, and brood children) so a doorway is not an
exit.

**5 — Flying mote unreachable by melee.** Cruise height stays above every
melee vertical gate (identity). On burst windup it dives to `strikeHeight`
where a sword connects; a parry still grounds it fully. `coach('mote-air')`
teaches the window on first sight.

**4 — Held-shield reflect never killed.** Damage is now a fraction of the
shooter's own max HP (`1.0` held, `1.5` parry), so "your own shot kills you"
is true at every beat by construction. Parry stays strictly better.

**2 / 3 — Sluice blown out; pickups featureless white.** Retrimmed lightTune
on beats 07, 09 and 12 (sweep every place, not only the named one). Dropped
pickup `emissiveIntensity` from 2.0+ into the "glowing and still shaped"
band so the silhouettes this file was written to protect actually survive
ACES at exposure 1.25. Sluice kit `capShade` 1.3 → 1.12.

**1 — Breakable minerals paid nothing.** `HeartDropManager.dropAt` +
`player.onShatter`: shattering rolls a low-rate heart, and a boulder's
`hiddenPickup` reveals when the island is empty. Beat 06 has one authored
reveal.

### Graphics overhaul tickets 1–7

**1 — AO out of the albedo channel (bug).** `buildVoxelGeo` writes clean
albedo to `color` and occlusion to a new `aoLevel` attribute. The level
material applies it to indirect light only (three.js aoMap contract). Deepest
level 0.5 → 0.35. Material classifier no longer flips families in corners.
CPU mottle disabled by default — grain lives in the shader.

**2 — Soft shadows.** `shadow.radius = 3.5`, prefer `PCFSoftShadowMap`, high
tier shadow map 4096, contact discs warmed and softened.

**3 — Triplanar surface detail.** Mean-preserving value noise in the level
material shader, family-scaled (stone / ice / metal / energy).

**4 — Vertical interest prototype.** Beat 01 tomb: corner pillars, west
plinth, SE platform. Outside the spawn walk path so traversal is unchanged.

**5 — Colour grade + palette.** Split-tone `ColorGradePass` before
OutputPass, per-region presets (crust / abyss / cryo / pyre). Sluice accent
desaturated toward the structural-neutral rule.

**6 — Rim light on actors.** Fresnel rim on actor materials only, keyed to
palette `eyeGlow` so factions stay colour-coded at room-framed distance.

**7 — Atmosphere.** `DustMotes` field follows the current room origin.

### The Arachnid could only be hit from inside itself

Reported from play: "the arachnid boss I had to stand inside in order to
hit." Measured before touching anything, and reach was never the cause —
`anchor_link` connects out to **3.6 m** against a **2.24 m** visual edge, so
there was over a metre of legal swing outside the body the whole time.

The cause was `shielded = true`. That flag is an **absolute** gate: `applyHit`
refuses a shielded defender from every bearing, at every range. In phase 1 the
Arachnid set it whenever it was not mid-action, so the only frames that could
damage it at all were its own leap — and the leap lands the spider **on the
player**. Those two facts compose into precisely the reported experience: the
one place in space and time where damage ever registered was inside the model.
The fight taught "stand in it and stab", because nothing else worked.

Replaced with **directional** armour, via the same `armorUp` + `inFrontArc`
path the bulwark already uses. Head-on is a clang; the flank and the back are
open; the leap is still a full opening from any angle; a parry drops the plate,
the same single rule the rest of the bestiary follows. `applyHit` now reads an
optional `defender.armorArc`, so the spider can declare a ±60° face where the
bulwark keeps its default ±75° — a boss you must circle needs a shorter walk to
the flank than a trash mob does. Verified by bearing sweep: 0–60° refused,
90–180° wound it, all from 3.0 m — outside the body.

**And bosses could not turn.** `state.facingVec` has been on `BossBase` since it
was written, fixed at `{x:0,z:-1}`, never once updated — dead data nothing read.
Directional armour is meaningless against a plate welded to due south, so
`faceToward()` is new: capped turn rate, mesh yaw kept in step, deliberately
**slower than the player can orbit** so circling to the flank is a race the
player wins in about a second and a half. (The bulwark was once unkillable by
melee for exactly the opposite reason — facing that snapped, pinning the
armoured cone on whoever attacked.)

First sight of the player **snaps** rather than eases. Measured on the way
through: easing from the due-south default at the new slow turn rate left the
Arachnid opening every fight rotating on the spot for ~1.4 s with its plate
aimed at nothing, and every swing in that window landing free. A boss should be
oriented when the doors shut. The HUD's `· ARMORED` tag now reads `armorUp` as
well as `shielded`, or it would have gone blank on exactly the boss whose
armour most needs explaining.

### Guard, shooters, motes, and drops — four things play found

All four came from the owner actually playing the game, and three of them
were mechanics that were *implemented* and did not *work*. Every fix below
has a spec proven to fail on the previous code.

**Holding block still hurt you.** `GUARD_CHIP` was 0.25, so the shield leaked
a quarter of every blow it stopped. That is not what a shield does, and worse,
it made the shield useless exactly where it was the only answer (see motes,
below). Now `0`: a held guard stops the hit outright. Blocking is still not
free — the cost was always meant to be **poise**, a three-point pool that
refills four times slower with the shield up and ends in a 0.9 s guard break.
Turtling through a combo still loses; it now loses to the mechanic built for
it rather than to an invisible damage leak.

**A shooter demanded a parry.** A wind-up is a read you can see; a bolt in
flight gives you its travel time and nothing else, so requiring frame accuracy
against one asks for a read the game never showed. Holding the shield so a
bolt lands in the frontal cone now **sends it back at whoever fired it** for
double damage, homed at the shooter's current position rather than merely
negated — "the shot came back" is the feedback that teaches the verb, and a
bolt that just vanished never told the player facing a shooter was offence.
A parry-timed deflection doubles again, as a bonus and never a requirement.
Turn your back and it lands as before. `reflector_plate` — which previously
was the only way to bounce anything, and only deleted the bolt — is now the
*passive* version of the same verb.

**Motes could not be avoided or defended against.** Both halves were true.
The burst drew a ring at radius 3.2 while the mote parked at 2.4, so the tell
described a circle the mote never committed from, and the wind-up was 0.5 s.
And the only defence was a shield that still chipped you, on the one kind a
sword cannot reach at all. The three numbers that must agree are now named
constants (`MOTE_HOLD` / `MOTE_BURST` / `MOTE_WINDUP`) instead of three loose
literals: the mote commits from **inside** the circle it paints, the escape is
0.6 units, and the wind-up is 0.85 s. A spec now asserts the ring damages
inside its own radius and *not* outside it — a telegraph that lies is not a
telegraph.

**Drops landed in the air.** `dropSite()` is new and is the one rule every
drop site shares. Drops spawned at `enemy.root.position`, which for a hovering
enemy is `flyHeight` (3.4) above the floor; `HeartDrop.update` collects within
2.0 units of vertical, so a slain mote's heart was not merely floating, it was
**uncollectable** — killing one paid nothing. Measured in the counterfactual at
`dy=2.95` against a 2.0 window. Fixed at both drop sites (the kill roll and the
Entropy Dust conversion), not just the one that was reported.

**`Enemy.loot` was dead code.** Assigned in the constructor since the class was
written; read by nothing. Now honoured in `HeartDropManager.update`, the one
place that already detects a fresh kill, dropping to the floor via the same
`dropSite`. A level that supplies no `addPickup` is skipped rather than
throwing.

Also: one existing guard spec was using chip damage as a proxy for "that was a
block, not a parry". The proxy died with the chip. It now asserts the thing it
actually cared about — a parry refunds poise in full and staggers; a block
spends poise and does neither.

### Parry window widened, guard moved to B

Played and reported too strict: the parry press had to land inside 0.18s,
which read as requiring frame-perfect timing. Widened `PARRY_WINDOW` in
`combat/guard.js` to 0.3s — real reaction room instead of a twitch check.

Guard's keyboard binding moved from `L` to `B` — the requested spot, right
next to Space/J (attack) — in `src/game/input.js`'s single `CONTROLS` table,
which `docs/CONTROLS.md` and the in-game cheat sheet both generate from, so
nothing else needed a separate edit. Right mouse and the RT pad trigger are
unchanged.

### Correction: "similar brightness" is not "everything purple"

The Abyss brightness fix above hit its luminance target by raising the
Abyss's ambient/key light intensity — and the owner played it and said so
plainly: "everything purple." A screenshot proved it: floor, wall and shadow
all read as one solid violet with no material variety, against the Crust's
real tonal range in the same shot. Neutralizing the light's own colour
(`MOOD_PRESETS.abyss`'s `ambient`/`key` hex, pulled toward white) barely
moved it — the wash was coming from `ABYSS_COLORS`' own structural tones
(`basalt`, `charcoal`, `abyssFloor`, `abyssWall`), which were already
saturated violet before this pass and simply got hit with much more light.

Fixed by desaturating those four structural colours toward a neutral grey,
luma-preserving so the brightness work still holds, while leaving the actual
accent colours (gold veins, magma, ice, neon) fully saturated — those are
supposed to stand out against a duller field, not blend into a uniformly
saturated one. Dungeons with a `wallColor` override (GUMOI's `violet`,
Leviathan's own accent) keep their pre-existing, more saturated character —
that's deliberate per-dungeon design predating this session, not the wash
being fixed here.

Re-measuring afterward turned up two further, unrelated regressions from the
same root cause: Beat 08-bone's own dungeon-level light boost and the
overworld's Abyss multiplier were both tuned against the *original*, dimmer
Abyss preset from before this session's brightness work. Once that shared
preset was raised, both of these per-level/per-region boosts compounded on
top of an already-brighter base and pushed their rooms over the certification
ceiling (Beat 08 to 96 mean; two overworld regions to 95–99). Both re-tuned
down to land back in band. Full suite green (2968/2968) after all three
fixes; certification captures and `CERTIFICATION.md` regenerated again.

### Investigated: overworld fog-of-war reported resetting after a dungeon exit

Reported by the owner, reproduced 3/3 times on their end: previously-explored
overworld screens show as unexplored again on the map after leaving a
dungeon. Could not reproduce it directly: a real dungeon entry/exit round
trip through `loadLevel`, and a full page reload, both left the `visited`
screen list intact in `sovereignProgress.overworld` every time. The Browser
tooling used to test this session's synthetic key events arrive with an
empty `.code`, so `input.js`'s `e.code === 'KeyW'`-style checks never match —
real walking couldn't be exercised through it either, only the same
functions the owner's own play calls.

Hardened `engine/settings.js`'s `getProgress`/`setProgress` anyway:
`setProgress` now re-reads disk before merging a patch. Previously it merged
straight into the in-memory `progress` object, which is normally never stale
because every write goes through here — except a tab restored from the
back/forward cache resumes with whatever `progress` held at the moment it was
frozen, not what's on disk now. The next `setProgress` call from that tab
would silently overwrite anything saved in the meantime, including recently
explored screens. This is a plausible cause, not a confirmed one — the
report may still recur, in which case the next session needs a repro that
survives an actual playthrough rather than the direct-call tests used here.

### Brightness unified: no more deliberately-darker Abyss, no more exempt boss rooms

The owner played the game and reported two things directly: the Abyss and the
Crust should read at the same brightness (not the Abyss being measurably
darker as a mood choice), and boss rooms running brighter than everything
else "is a problem" — both resolve `docs/OPEN_QUESTIONS.md` questions 1 and 2
by explicit decision rather than guesswork.

**Abyss brought up to match Crust.** `MOOD_PRESETS.abyss` in
`assets/palettes.js` raised (ambient 1.55→2.3, key 3.35→4.8) until Abyss
dungeons measured in Crust's range (was 37–43, now 44–58 against Crust's
50–76) and the overworld's Abyss screens did too (citadel 27→78, cryomire
18→89). `LUM_BANDS.abyss` in `tests/visual-sanity.spec.mjs` collapsed into
Crust's `[45,90]` — one shared band for both moods, where there used to be
two.

**Boss rooms brought down to match their own dungeon.** Every boss room ran
notably brighter than its dungeon's normal-room mean, not only the four that
broke the old ceiling. The earlier finding that light-trimming a boss room
barely moves its luminance was re-tested and no longer held: under the
brighter Abyss preset above, the same lever is now dramatically effective —
the scene sits far enough up the tonemap curve that a modest cut pulls it back
disproportionately (one room dropped 149→53 on a 30% trim). Measured each of
the nine worst rooms against its own dungeon's mean (median of 5 samples,
after confirming the first ~700ms after entering a boss room is a genuine
transient and not the room's steady brightness) and gave each a `lightTune` in
its level file. See `docs/OPEN_QUESTIONS.md` question 2 for the full
before/after table.

### Collision: a body already touching a thin wall passed straight through it

Reported as "enemies clipping through walls as they try to move away from me."
`CollisionWorld.resolveMove` (`src/engine/collision.js`) resolves each axis by
checking whether the mover crossed a solid's face *cleanly*, from a position
with full clearance (`px + half <= s.minX`, etc.). The fallback for a mover
that starts already touching only handled the case where `px` itself was
cleanly on one side. It never handled a mover whose own half-extent already
straddles the face — which is the ordinary case here, since walls are baked
as single 1-voxel-wide columns (`level-builder.js`) barely wider than an
actor's 0.4 half-extent. Once an enemy's centre so much as touched a wall
face, neither branch matched, no clamp applied, and every subsequent small
step walked straight through with zero resistance until it emerged the other
side.

Chasing/charging AI rarely showed it, since that AI beelines for the player
and stops at attack range, away from walls. Retreating (`_aiRanged`'s
keep-distance behaviour) is the one AI mode that deliberately drives an enemy
toward whatever wall is behind it, so it was the one place the bug reliably
surfaced — but the defect is in the shared resolver, not the AI, and applies
to any push (knockback, separation) that starts a mover flush against a thin
solid.

Fixed by resolving the ambiguous case against which side of the **solid's own
centre** `px` sits on, instead of demanding full clearance from it. Verified
with a counterfactual: reverting the fix reproduces the tunnel (mover ends up
completely on the far side of the wall) and two new specs in
`tests/collision.spec.mjs` catch it from both approach directions.

### The gate that rewarded flattening the art

The certification gate banded each level's **mean** frame luminance and nothing
else. A mean cannot tell a well-lit room from a flat one — a room with a strong
key and deep shadows meters *lower* than the same room under a flat ambient
wash. So every time a room failed the band on the low side, the cheapest legal
fix was to raise ambient or add pale geometry, and the gate went green for it.
That is how ambient reached **1.7** against a key of **1.9**, and why Beat 01's
tomb grew decorative gold-leaf seams — the level file says so out loud.

- **The gate now also bands contrast**: centre-crop `p90 − p10`, floor 12.
- **It is measured on a centre crop, and that turned out to be the whole
  ticket.** Measured across the full frame the spread reads **58–160** and would
  pass any floor worth setting — because `p10` comes out at **0** in nearly
  every level, and that zero is the **vignette** crushing the corners, not a
  shadow. Vignette strength does not move when the lighting does, so a
  full-frame spread is mostly a constant with the answer buried inside it.
  Cropping to the middle half of each axis turns the same statistic into one
  that ranges **14 to 166** across the campaign and actually separates the flat
  levels from the lit ones. The plan called for a full-frame spread; the probe
  said otherwise before a line of it was written.
- **The floor is a ratchet, not a cliff** — 12, set just under the worst room
  measured (the overworld, at 14) so nothing can regress, rather than a number
  that fails on the day it lands. The two flattest levels are the open outdoor
  screens, which is the honest reading: one light, one ground plane.
- **The statistic is proven to discriminate.** `tests/game/luminance.spec.mjs`
  feeds it synthetic frames whose answer is known by construction, and the
  load-bearing case is that a flat grey frame **passes the mean band and fails
  the contrast floor**. It also pins the vignette case, so nobody can quietly
  move the measurement back to the full frame. A floor nobody has proven
  discriminates is decorative.
- The statistic moved out of the frame loop into `src/game/render/luminance.js`
  so it can be tested at all, and the dev overlay now prints spread beside the
  mean — the two disagree in exactly the direction that matters.

### Five of six rooms had no sun

The key light's shadow frustum is a ±30-unit box. It was aimed at the world
origin and it never moved. Rooms sit on a **64-unit** grid, so exactly one room
per dungeon was ever inside it.

It survived the whole project because **every dungeon starts at grid (0,0)**:
the first room you see in any level is the one room that works, so nothing ever
looked wrong until you walked somewhere. Measured against Beat 01 —
`corridor`, `predecessor`, `secret`, `antechamber` and `warden` all had no sun
shadows at all.

- **The sun now follows the active room.** The light and its target move
  together, so the *direction* never changes — moving only the light would have
  re-angled the sun per room, which looks like the world spinning around you.
  The aim is **snapped to a 16-unit grid** rather than following continuously,
  because sliding a directional shadow map a fraction of a unit per frame makes
  every shadow edge crawl.
- **The sweep is the assertion.** `tests/shadow-frustum-e2e.spec.mjs` walks
  every room of every beat — a spot check of one room would have passed against
  the broken build. It also asserts the sun keeps a single direction across
  rooms, and that room *corners* are covered, not just centres.
- **Reverting the fix fails 31 of its 50 assertions**, which is how we know the
  spec is load-bearing rather than decorative.
- **The overworld was worse than the plan recorded.** The plan documented "5 of
  6 rooms". The counterfactual run showed the overworld at **0 of 49 screens** —
  it sits at world coordinates 512–896, so the entire surface world was outside
  the frustum. Nobody had counted it.
- `src/engine/lights.js: updateShadowFollow` looks exactly like the fix for this
  and is not — it takes a single `cameraX` and pins the target's Z to zero, a
  leftover from the engine's 2.5D origins, so it would fix one axis and silently
  break the other. Locked Decision **D5** forbids editing engine code, so it
  cannot be deleted; instead the spec now fails if game code ever imports it.

### Ambient was doing 47% of the lighting

**1.70 ambient against a key of 1.90** in the Crust, and **3.40** in the Abyss —
twice as much flat light in the mood that is supposed to be the oppressive one.
Roughly half the illumination arrived from every direction at once, which by
definition cannot describe a surface: the same value on the top of a block, the
side of a block, and the inside of a corner. The voxel mesher already bakes
ambient occlusion into vertex colours, so the game computed good contact
darkening and then flooded it.

It got there honestly. The gate banded mean luminance, and raising ambient is
the cheapest way to lift a mean. That is also what every per-level `lightTune`
was doing — Beat 07 carried an ambient multiplier of **3.4×** on top of an
already-flat preset.

| | before | after |
|---|---|---|
| Crust ambient / key | 1.70 / 1.90 | **0.78 / 2.55** |
| Abyss ambient / key | 3.40 / 2.10 | **1.55 / 3.35** |
| environment | none | **0.55 / 0.60** |

- **The rim light was bound but never driven**, so it sat on the engine default
  in both moods. The Abyss needs *more* rim than the Crust, not the same: its
  key is dimmer against its background, so a silhouette separates from the fog
  on the rim or not at all.
- **Per-level trims were rebalanced from ambient toward key**, so a level that
  needs more light gets more *directional* light.
- **Contrast rose on 14 of 16 levels**, and the Abyss dungeons roughly doubled:
  Bone Forest 34 → 78, Town 43 → 82, Pyre 43 → 79, Sluice 44 → 77. Two levels
  went down and are recorded in `tests/game/luminance.spec.mjs` rather than
  hidden. The contrast floor was tightened 12 → 13 to lock the gain in.

### The world was under-detailed on purpose by nobody

79,572 triangles and 43 draw calls, on a budget with room for an order of
magnitude more. Rooms were a floor rectangle and four walls of uniform height,
and a wall whose top edge is a straight line at a constant height reads as a
box, not as a place.

- **Bake-time trim**: parapets with broken heights, pilasters every seventh
  cell, and taller corner posts, generated from the existing room definitions
  for all fourteen dungeons and the overworld at once.
- **It provably cannot change the game.** It only adds voxels *above* the wall
  top — never at `y <= 2`, the band the hero's body occupies — and only on the
  room perimeter, never on interior structures where platforms and grapple
  routes live. `tests/game/room-trim.spec.mjs` bakes each room with and without
  trim and requires the occupied cell set at `y <= 2` to be **byte-identical**;
  asserting "trim stays above y=2" from the outside would only restate the
  implementation.
- Doorways stay open: a door gap has no wall cap to build from, so nothing can
  bridge one with a floating lintel.
- **Cost: +728 triangles and +0 draw calls** in a dungeon room (~2%). It merges
  into the same voxel map the room is meshed from, which is the whole reason it
  is done at bake time rather than as props.
- The trim was shaded *darker* than the wall cap first, and the gate rejected it
  within one run: seven Abyss levels lost ~4 points of mean and fell out of
  their band. Trim stands against the **sky**, and the Abyss sky is dark violet —
  dark trim on a dark background is not moody, it is invisible. It lifts now.
- Taller walls also cast more real shadow into rooms (which only works at all
  because of the two tickets above), so the light was raised to hold the mean
  while keeping the contrast. That trade is what the contrast floor exists to
  arbitrate, and this is the first time it did.

### A level says what kind of space it is, instead of being guessed at

The two contrast floors below were selected with `id.startsWith('beat-')`. That
is a guess about a naming convention, not a fact about the level: **a dungeon
added under any other name would have silently received the lax open-ground
floor** and been free to go flat forever. It survived exactly one commit.

Levels declare `space: 'open'` in `levels/registry.js` now, and the default is
`'enclosed'` — the *stricter* floor — so forgetting the field makes a level
harder to pass rather than easier. A default that fails safe is the whole reason
this is data rather than a guess. `registry.spec.mjs` checks that only the two
genuinely open levels claim it, and that the default is the strict one.

### The gate now sweeps the overworld, and has two contrast floors

Having just proved the overworld's eight regions differ by 2.4×, the gate was
still sampling **one** of them — the start screen, in whichever mirror state the
save happened to hold. `visual-sanity.spec.mjs` now sweeps all eight regions in
both states, sixteen samples, using the same screens the certification captures
shoot so a failure has a picture next to it.

That sweep immediately showed the contrast floor was the wrong shape:

| | measured contrast |
|---|---|
| walled dungeon rooms | **70 – 172** |
| open outdoor screens | **12 – 16** |

A single floor of 13 was doing almost nothing for the fourteen dungeons — one
could regress from 95 to 14 and still pass — and it sat *inside* the overworld's
own sample noise, which is the randomly-failing gate this suite already learned
to avoid once. An open field with one ground plane, no walls to shadow it and no
ceiling to occlude it cannot have a walled room's contrast; that is what open
space **is**, not a defect to tune away.

So there are two floors now, each a ratchet under the measured worst of its
kind: **60 for dungeons** (worst: Cryo Vault at 70) and **10 for open levels**
(worst: Bonetown at 12). The dungeon floor finally bites.

### Auditing this session's own work against its own rule

Trap 4 in `HANDOFF.md` says: deleting the call is not deleting the feature —
remove the data too, or the next reader will conclude it was meant to be wired
up. Running that rule over the code *this session* added found three violations
of it, all mine:

- **`padAxes` was decorative.** The gamepad table carried the stick axis
  indices and nothing checked them. It is load-bearing now: the spec reads
  `gp.axes?.[N]` out of `pollGamepad` and requires the table and the handler to
  agree in both directions, exactly as it already did for buttons.
- **`disposeMoodEnvironments()` and `disposeContactShadowResources()` had no
  callers.** Both deleted. An exported teardown nothing calls reads as a
  contract somebody forgot to honour, and sends the next reader looking for a
  leak that is not there — in both cases the resources (two PMREM targets; one
  geometry, one material, one 64×64 canvas) are cached for the life of the page
  on purpose, and the comments now say so.
- `buildSkyTexture` was exported and used only internally; it is private now.

A sweep of every symbol the session exported confirms none is unreferenced.

### The one list left un-generated was wrong

The keyboard cheat sheet was unified into `CONTROLS` last session. The **gamepad**
legend was left hand-written in `ui/hud.js` — and it had already drifted. It
labelled **D-up** as "mood", when that button sets `_moodToggle`, the same flag
**M** sets, which the binding table and the docs both call **mirror travel**.

One list left un-generated is one list free to be wrong. That is the whole
lesson and it took four months to demonstrate itself twice.

- `padSheet()` generates the pad legend from the same `CONTROLS` entries as the
  keyboard sheet, via new `pad` / `padButtons` / `padAxes` fields.
- **The spec reads `pollGamepad` itself**, extracting every button index the
  handler tests (`pressed(N)` for edges, `b[N]` for held state) and checking it
  both ways: no button the game responds to may be missing from the table, and
  the table may not claim a button the handler ignores. Same discipline the
  keyboard half already had — the table is not allowed to be its own evidence.
- **Keyboard-only verbs stay keyboard-only, and the legend does not invent
  buttons for them.** The Memory Vial, the Entropy Dust, the beat cycle and Mute
  have no binding; a legend claiming one would be worse than a legend omitting
  it. Asserted, along with the reason Mute has none: it gave up its trigger slot
  to LT lock-on and RT guard.
- `docs/CONTROLS.md` gained a real gamepad table — it had been one prose
  paragraph carrying the same D-up error.

### Same lights, different rock

Regenerating the 44 certification captures — the first time anyone had looked at
all of them since the Session 6 camera retune — turned up something the gate
could not see. The overworld's eight regions are deliberately different stone,
sitting in one level, under one set of lights, with **one level-wide light
trim**. So identical lighting produced wildly different frames:

| region | floor | lum |
|---|---|---|
| Bonetown | ashField | 87 |
| Pyre | clayDark | 82 |
| Tombfields | clayField | 76 |
| Quarry / Cryomire | slate | 52 / 53 |
| **Spindle** | **iron** | **32** ← floor is 45 |

And in the Abyss, where every region shares one dark floor, **all eight sat at
18–27 against a floor of 35** — dark enough that an enemy standing next to the
player was hard to pick out, which is the exact failure the band exists to
prevent.

None of it was caught because `visual-sanity.spec.mjs` samples the overworld in
its **default state on its start screen**, and that screen is one of the pale
crust ones. The same shape as the shadow-frustum bug: the one place being
measured was the one place that was fine.

- **Light trim can now be set per room, not just per level.** A room falls back
  to the level's trim, so nothing without one changes.
- **The overworld's trim is derived, not hand-tuned.** Brightness is a product
  of light and albedo, so `render/albedo-trim.js` computes a region's
  compensation *from its floor colour*: half the reflectance gets twice the
  light. Sixteen hand-tuned numbers would have gone stale the first time
  somebody changed a floor; this follows it.
- **Computed in linear light, which is the whole trick.** Iron and clay differ
  by 1.5× as stored bytes and by **2.2×** as light. Compensating on the sRGB
  values would have under-corrected by nearly half — and the linear ratio
  predicts the measured 76/32 = 2.4 almost exactly.
- **Result: crust 61–77 (was 32–87), abyss 41–59 (was 18–27).** All sixteen
  screens in band.
- One more bug it surfaced: the first room of a level is entered *while the
  level is still being constructed*, with no `game` to reach the mood
  controller through, so a per-room trim only took effect once you walked
  somewhere. A level loaded directly into a dark region stayed dark — which is
  exactly what a certification capture does. The loader pulls the trim now.

### The captures were showing one screen eight times

The overworld half of the capture run was wrong in a way worth writing down.
`createOverworld` only honours a saved position when `pos.world === levelId`
(the dev test grid and the real world share screen names but not geography), so
omitting `world` silently fell back to the start screen — producing **sixteen
identical pictures of one screen, filed under eight region names**. Two files
being byte-for-byte identical is what gave it away. `md5sum` on the set is now
part of checking a capture run.

### Boss rooms have never been measured

The gate samples only the room a level *loads into*, so half the campaign's
most-looked-at rooms have never been measured. Sampling them found four of
fourteen outside their band — `spurpit` 98.8 against a ceiling of 90,
`prayerhollow` 79.7, `twincage` 92.4 and `golemwallow` 94.1 against 75.

This is **reported and not gated**, on purpose. Sampled on separate runs the
same room disagrees with itself by 20+ points in both directions (Spindle 92.7
then 69.2; Cryo 81.2 then 91.3), because a boss room contains a boss whose
emissive pulses and flashes — and a gate needs a statistic that holds still. The
bands were also calibrated on *empty entry rooms*, so whether an arena
containing a deliberately glowing boss belongs under the same ceiling is a
judgement call, not something to settle by loosening a number.

A light trim was tried and rejected: cutting Cryo's key from 3.35 to 2.68 and
its ambient from 2.02 to 1.24 moved the room by **one point**, which is how we
know that brightness is coming from emissive bosses and bloom rather than from
the light rig. `node tests/qa/contrast-probe.mjs` prints the current figures.

### The atmosphere and the floor disagreed

Every dungeon kit declared an `atmosphere` — `drips`, `vapor`, `heat_shimmer`,
`grit` — and every one of them was a particle effect **in the air with nothing
on the ground agreeing with it**. The Mire had bubbles rising off a floor with
no algae on it. The Pyre had heat shimmer over unscorched stone. The Cryo Vault
had vapour above ice that had never frosted.

- **One weathering per kit**, at bake time: grave dust in the Crypt, oil and
  scorch in the Spindle, wind-driven sand in the Sink, waterline staining in the
  Sluice, algae in the Mire, scorch in the Pyre, frost creeping up the Cryo
  Vault's walls.
- **It is colour only.** It recolours voxels that already exist and never adds,
  removes or moves one — so the safety proof is just that the cell set is
  identical before and after. No collision, no traversal, no `getVoxelAt`
  answer changes.
- **Patches, not speckle.** A per-cell random threshold reads as compression
  artefacts; weathering pools. Strength comes from smooth value noise on a
  6-cell lattice. The spec walks a floor row and counts how often "weathered"
  flips — random at 36% coverage would flip ~11 times across 25 cells, patches
  flip six or fewer.
- **Walls stain vertically.** Sampling a wall on `(x, z)` gives it the floor's
  pattern smeared sideways, which reads as a texture bug rather than as dirt.
  The wall *cap* is skipped entirely: the kit brightens it as a lit inlay, and
  staining over that removes the one piece of shading the room already had.
- `applyKit` keeps off the certification band by being brighten-only. That
  cannot work here — scorch is dark and that is the point — so coverage and
  strength are bounded instead, and **the bound is asserted**: under 8 points of
  albedo drift against bands 40–45 wide. Measured live, no level left its band
  and contrast held or rose. Beat 08 went **78 → 102** — bone dust on a bone
  floor is exactly the case where a decal earns its place.

### Nothing in the world could be shadowed

151 meshes in a room. **37 cast. 7 received.** Props did not darken under an
overhang, enemies did not sit in a doorway's shade, nothing cast onto anything
else — which is most of the reason objects read as pasted on top of the world
rather than standing in it. It happened because the decision was made
independently at every construction site, so **eleven of the fourteen bosses**
simply never had the line, no pickup cast anything at all, and the hero's weapon
explicitly opted out of both.

- **One rule, in one place** (`src/game/render/shadow-roles.js`): everything
  solid casts; everything solid receives unless it is glowing or transparent;
  and **anything that does not receive has to say why**, in
  `userData.shadowExempt`. The census counts an unexplained non-receiver as a
  failure, so opting out means writing the case for it rather than forgetting.
  Setting the flag in more places would have been the same bug waiting to happen.
- That rule replaced an emissive-intensity cutoff, which was the wrong shape:
  two boss parts and the grapple claw sat at exactly `0.4` and `0.5` against a
  `> 0.5` test and showed up as defects. Any emissive colour at all is a glow.
- **Every solid mesh in all 16 levels now receives** — 100%, measured, with
  `tests/qa/shadow-census.mjs` printing the breakdown. The gate asserts equality
  rather than a threshold, because a threshold invites the next person to add an
  unshadowed mesh and stay under it.
- **Held weapons cast again.** The blade sweeping its own shadow across the
  floor mid-strike is the best grounding cue the swing has and it was switched
  off. It still does not *receive*: 0.10 units wide against a camera 17.5 up is
  one or two shadow texels, which reads as edge flicker. The shield overrides
  that — a plate is broad enough for a shadow to resolve on.
- **Contact shadow discs** under every actor, boss and pickup. A cast shadow
  needs caster, receiver and light to line up; a disc is always directly beneath
  the thing it belongs to, so it reads when the sun is behind a wall or the
  shadow falls off-screen — including in the five-of-six rooms the key light's
  frustum never reached. It also encodes height: the disc spreads and thins as
  an actor rises, so a dash and a hovering mote both tell you how far up they
  are. Ground height is inferred from the actor's own Y, since the collision
  world is XZ-only — falling is adopted immediately, rising only once the new
  height holds still, which is what tells a jump from a step onto a platform.
- Discs are reconciled from the live entity lists each frame rather than
  attached at spawn sites, so a new enemy kind cannot ship without one.
- Cost: **draw calls unchanged** (41 → 41 in a dungeon room). Receiving is a
  fragment-shader tap on a shadow map that was already being rendered.

### The shield is a thing you find

Asked by the owner: *"is there a point at which you collect a shield you can
use?"* There was not. Guard and parry — a 0.18 s window, a poise economy, a
120° arc, the deepest mechanic in the combat system — were innate from the first
frame of a new save, and had **no visual at all**: no mesh, no pose, nothing on
screen but three pips in the corner. The hero's off hand was empty while
blocking.

- **The Bulwark Shield is now an item**, found on the predecessor's body in
  Beat 01. `GuardController.raised` is false without it.
- **It is placed to teach.** Beat 01's declared theme is already `telegraph` —
  *"Read the Wind-Up"*. A player handed a shield on frame one answers every
  telegraph by holding a button and never learns to read one. So the route is
  now: `tomb` (empty) → `corridor` (one sentinel, dodge it) → `predecessor`
  (one charger, **and the shield**) → `antechamber` (two enemies, both answers)
  → `warden`. Introduce → develop → combine → test, with the item as the hinge.
  `tests/game/shield-gate.spec.mjs` fails if anyone moves the shield earlier or
  stacks a second enemy into the dodge-only stretch — the gate is only
  defensible while the rooms in front of it are honestly clearable without it.
  It comes off the predecessor's body, so the gate and the story beat are the
  same moment.
- **Guard has a pose now.** `evalGuard` puts the shield arm up and across, drops
  the weapon hand, blades the torso and crouches slightly, weighted in over
  ~0.12 s — the parry window is 0.18 s, so the shield has to be visibly moving
  inside it. The shield model hangs off the new `handL` pivot, so it inherits
  the raise and can never be up while the arm is down.
- **Save v4 migrates.** A save already past Beat 01 has walked through the room
  the shield now sits in without being offered it, so migrating it unshielded
  would silently delete a verb the player had been using for six dungeons — it
  is granted. A save still *inside* Beat 01 is left alone; the pickup is on its
  route.

### Three lists of controls, all of them wrong

The on-screen cheat sheet never mentioned **guard, lock-on, switch-target,
mirror travel or the beat cycle**, and `docs/CONTROLS.md` never mentioned the
**Memory Vial or the Entropy Dust**. The HUD also kept *two* hardcoded copies of
its own sheet — the one shown at boot and the one restored when a gamepad
disconnects — which had already drifted apart from each other.

The shield work makes this worse than an omission: the game now gates a verb
behind an item, tells you so in a toast, and then shows you a control list with
no guard key on it.

- **`CONTROLS` in `src/game/input.js` is the single source of truth.** The HUD
  sheet is generated from it; `docs/CONTROLS.md` is written from it.
- **`tests/game/controls.spec.mjs` reads the input handler's own source**,
  extracts every `e.code` the game actually responds to, and fails if any is
  missing from the table or the docs — and fails the other way too, if the
  table advertises a key the handler ignores. Adding a binding without
  documenting it is now a test failure rather than something the player finds
  out years later.

### The hero was swinging backwards

Reported by the owner from a screenshot: *"when you swing this weapon and your
sword it does not arc out and animate in front of you, the sword does not move,
and this actually points backwards."* All three observations were correct, and
they were three separate defects stacked on top of each other.

**Which way is forward.** `player.js` sets `rig.rotation.y = atan2(fv.x, fv.z)`,
which lands rig-local **+Z** on the facing vector. The arm hangs along −Y from
its shoulder pivot and THREE resolves an `'XYZ'` euler as `Rx·Rz·v`, so the arm
direction is `(sin rz, −cos rz·cos rx, −cos rz·sin rx)` — it points forward only
when `rx` is **negative**.

- **The melee profiles were signed the wrong way.** `anchor_link` wound up at
  `rx = −1.9` (up and *in front of the hero's face*) and struck at `rx = +0.9`
  (down and *behind their back*). Every melee weapon, every swing, since the
  pose library was written. `tests/qa/swing-readout.mjs` — added here — measured
  the blade tip never getting further than **0.27 units in front** of a hero
  whose weapon reaches 1.8, and reaching even that only during *recover*, after
  the hitbox had already resolved. It is now **1.32**.
- **The blade pointed 180° away from the arm.** Weapon models are built
  blade-up (`+Y` from the grip); they were mounted raw on an arm running `−Y`.
  At rest the blade stood straight up past the hero's head — that is the white
  glow above the shoulder in the owner's screenshot, the Light Caster's emissive
  tip aimed at the ceiling. Through a swing the tip *trailed* the fist instead
  of leading it. Fixed with a grip orientation (`HAND_TILT`) that lays the blade
  along the limb and cants it forward.
- **Weapons now hang off a `hand` pivot**, added to `actor-rig.js` at the
  measured far end of each arm, instead of off the shoulder — mounted at the
  shoulder a weapon swings on a radius twice the length of the arm and reads as
  growing out of the collarbone. `HeldWeapon` falls back to `armR` if a rig has
  no hand, so nothing that predates the pivot throws.
- **There was no arc.** `evalCombat` only ever wrote `armRx` — a vertical chop.
  A slash is a *lateral* sweep, and only `armRz` carries lateral motion. Each
  phase is now a full `(rx, rz)` pose: the strike travels ~2.3 units across the
  hero's front, so the pose finally describes the same arc the smear draws and
  `combatSweep` resolves. The strike also eases *out* rather than in, so the
  blade is fastest on the frames the hitbox actually lands.
- **The hero rest pose gained a slight ready angle** (`armRx: −0.18`). With the
  arm hanging dead straight, the blade's own length put its point below the
  hero's feet while they stood still.
- **The Light Caster was already correct** and is unchanged in character: it
  holds a point pose down the facing line and does not sweep.

**Why a green suite missed it.** `tests/game/actor-anim.spec.mjs` asserted the
**sign of a pivot angle** (`armR.rotation.x < −1.2`). A hero striking backwards
satisfies that exactly as well as one striking forwards, because a radian has no
opinion about which way the actor is facing. The replacement assertions are all
**world-space**: mount a marker at the measured blade tip, yaw the hero to face
world +Z, and require that the tip end up in front, travel forward across the
strike, and sweep laterally. Restoring the old orientation fails eight of them,
including *"furthest forward z=−0.13"*. This is the same failure mode as the
truncated audio render last session — a spec that passes for the wrong reason —
and it is now written down in `HANDOFF.md` as a standing trap.

### The drone under the music

Reported by the owner after the soundtrack landed: *"your sound is still a drone
under the music."* They were right, and the reason writing a real score had not
fixed it is that **two of the three sustained sources were not in the score at
all**.

- **Removed the mood drone.** `MoodController.apply` started a raw oscillator on
  every mood change — a square at 80 Hz in the Crust, a triangle at 220 Hz in
  the Abyss — with no envelope, no reverb and no end, wired straight to the
  destination. It predated the score and survived the rewrite that was supposed
  to replace it, so the game shipped an actual soundtrack playing on top of the
  exact hum the soundtrack existed to remove. The Abyss one was the worse of the
  two: 220 Hz sits in the middle of the melody's register.
- **The `drone` field is gone from `MOOD_PRESETS` entirely**, and
  `tests/game/music.spec.mjs` fails if one comes back. Deleting the call was not
  enough on its own — while the data existed, the next reader would reasonably
  conclude the drone was meant to be playing and wire it up again.
- **The pad became a chord.** `padVoice` held each chord for 105% of a bar — so
  consecutive chords overlapped — with a one-second attack into a three-second
  reverb at 0.9 return. A progression played that way is not heard as harmony;
  it is heard as a hum that changes colour, and the melody over it is heard as
  part of the hum. Replaced by `compVoice`: hard attack, short tail, struck on a
  per-track rhythm (`comp`, using the same sixteen-step grid as the drums).
- **Chord length is derived from the gap to the next strike**, not fixed, so the
  Pyre's dense off-beat stabs are short and a Leviathan chord a whole bar apart
  rings — and neither can run into the next one. Chords now sound for 28–62% of
  a bar where they used to sound for over 100%.
- **The bass was the same mistake an octave down**, and harder to notice because
  a sustained low sine stops being heard as a note and starts being heard as the
  room. It held 1.8 beats against strikes two beats apart; now 0.9.
- **Reverb return cut from 0.9 to 0.55.** A hot return is the other way to build
  a drone by accident: the decay of one bar was still louder than the attack of
  the next, so the gaps got filled back in with a smear of everything already
  played.
- **The Abyss noise pulse moved to the effects bus** and from every 2.8 s to
  every 9 s. On the music bus at that spacing it was a texture layer nobody
  wrote. It is a room sound, not a part.

#### Proving it, rather than asserting it

- New `tests/audio-render-e2e.spec.mjs` renders the **real** scheduler through
  the **real** voices into an `OfflineAudioContext` and measures the signal.
  Every audio check before this could only prove sound was being produced, which
  is not the claim that was in dispute. A drone has a floor that never drops;
  music breathes.
- The gate: in the quietest 5% of 20 ms windows the music must be under 8% of
  peak. Measured against the previous arrangement it fails at **11.4%**; it now
  passes at **1.1–3.7%**, with dynamic range up from 7.4× to 21–70×.
- `renderOffline` in `score.js` and `buses.ctx` in `instruments.js` are the seam
  that makes this possible. A voice that reaches for a module-level live context
  can only ever be verified by listening to it.
- New `tests/qa/audio-envelope.mjs` draws the loudness envelope as a bar chart.
  It earned its place immediately: the first version of the spec **passed for
  the wrong reason** — an offline render started before the page has ever had a
  live AudioContext comes back truncated, and five seconds of digital silence is
  an outstanding 5th percentile. `renders to the end` is now asserted first.
- `music.spec.mjs` gained the structural rule — no voice may still be sounding
  when its next articulation arrives — checked per strike against the real
  scheduling function. It caught four overlapping comp patterns on its first
  run, which is exactly what it was written for.

### A real soundtrack, a real sound bank, and the three invisible systems

#### Music

- **Replaced the drone bed with a generated score.** The old "soundtrack" was
  three sine oscillators and a tick every 0.9 s, transposed per dungeon by a
  frequency ratio. A ratio is not a key and a drone is not a tune, so all
  fourteen dungeons were the same hum at a different pitch.
- New `src/game/audio/{theory,instruments,tracks,score}.js`: real keys and
  modes, chord progressions with voice leading, melodies written as scale
  degrees so they transpose in tune, nine synth voices, a shared convolution
  reverb and a tempo-synced feedback delay.
- **Four base pieces, twenty-two variations.** Each dungeon and overworld
  region is a reading of one base piece in a different key, mode and tempo, so
  the campaign shares musical DNA instead of being fourteen unrelated loops.
  The campaign walks down a circle of fifths as it descends.
- **Timing moved off the render loop.** The old pulse advanced by `dt`, so its
  rhythm was quantised to the frame rate and a dropped frame was a late note.
  Notes are now scheduled ~200 ms ahead on the AudioContext clock and are
  sample-accurate regardless of what the GPU is doing.
- **Adaptive layering.** Intensity (exploring → enemies awake → combat → boss)
  is derived from the live scene and fades layers in. The tune never changes,
  it thickens, so a fight starting costs nothing musically.
- Fixed the per-dungeon tracks being overwritten at load. `loadLevel` switched
  to a boss bed whenever `level.boss` existed — but every dungeon prebakes its
  boss so the arena is ready on arrival, so this fired for all fourteen and
  replaced each dungeon's composition with the generic mood bed. Bone Forest
  and Pyre Peak both came out as plain `abyss`, recreating the exact fault the
  score was written to fix. Only a level that *is* a boss arena now opens on a
  boss piece; the boss rooms already switch on entry.
- Fixed a register bug found by reading the score back as note names: voice
  leading alone made the Am–F–C–G pad sink two octaves across four bars and
  then leap back on the loop. Voicings are now re-centred after leading.

#### Sound effects

- New `src/game/audio/sfx-bank.js` — 30 game-specific sounds layered over the
  kit's generic primitives.
- **A parry no longer sounds identical to a failed block.** Both previously
  called `sfx.block()`, so the most skilful outcome in the game and the most
  routine one gave the same feedback. Parry is now the loudest single sound in
  the bank, at roughly 4× a block.
- **Every weapon swings differently**, weighted by mass — bare strike through
  to the Heavy Mallet, with the Light Caster electrical rather than physical.
- **Four combat outcomes, four sounds**: blocked, armoured, wounded, killed.
- Sound added to things that were silent: lock-on and release, guard raise,
  lower and break, doors opening, locked doors refusing, boss doors, the
  grapple's launch/bite/reel, menus, and a low-health heartbeat.
- **Pickups sound like what they are** — a shard, a key, a heart piece, a
  secret, and a real item are five different sounds where they were one.
- Footsteps vary per step and by surface.

#### Graphics

- **The equipped weapon is now visible in the hero's hand.** All five weapons
  previously looked identical — an empty fist. This is a combat legibility
  fault rather than a cosmetic one: the Wedge reaches 2.2 and the Mallet sweeps
  90°, so a player who cannot see what they are holding cannot predict their
  own attack. Models parent to the rig's `armR` pivot, so they inherit every
  swing and hit reaction for free.
- **The grapple is visible at all.** It previously had no rope, no hook and no
  anchor markers — you pressed G and were somewhere else, with nothing on
  screen to explain a failed pull. There is now a rope whose hook leads the
  player and whose slack takes up as you close, plus pulsing markers on
  anchors that are actually in reach, which teaches the range itself.
- **Pickups have silhouettes.** Every pickup in the game was the same 0.35
  octahedron in a different colour — a shard, a small key, a Memory Vial and a
  quarter of a heart container all identical in shape. Colour is the weakest
  signal available from a camera 17.5 units up: it washes out under the Abyss
  grade, it is the first thing lost to bloom, and it is unavailable to a
  colour-blind player entirely. Seven reward types now have seven shapes.

#### Test reliability

- **Fixed an intermittently-failing certification gate.** The luminance check
  took two samples and kept the **max**, which is the wrong statistic for a
  signal that oscillates: Beat 13 runs the flicker shader at 0.45 and Beat 14
  the wrap shader, so their frame brightness swings by design and the peak was
  being caught — the gate failed at 96.6 against a ceiling of 75 for a level
  that sits at ~36 when you look at it. Now the median of five samples, which
  discards both the dark settling frame the max was guarding against and the
  bright flicker peak, without needing to know which levels flicker. A randomly
  failing gate is worse than no gate, because it trains you to re-run.
- Gave the Beat 01 tomb gold-leaf wall seams, matching the predecessor chamber
  and the Warden's arena. The room sat ~0.2 above the crust luminance floor,
  which made the same gate flake under software GL; pale accent geometry is the
  documented remedy, since a lighting change would fight the mood preset.

Removed the now-dead `fx/motifs.js` ratio tables and their spec: nothing
imported them once real tracks landed, and a passing spec over dead code makes
it look maintained.

Specs `music` and `game-feel-visuals` added; probe
`tests/qa/score-readout.mjs` prints the score as note names so harmony can be
judged without listening. Suite 1971 → 2315.

### Combat reachability and the difficulty curve

Prompted by a one-line playtest report — *"Cannot kill this mob"* — against a
tree with 1,879 passing tests. Written up in [ZeldaLevel.md](ZeldaLevel.md) §6.

#### Fixed

- **A bulwark could not be killed.** Its front plate refuses melee outright, but
  enemy facing snapped at the player every frame, so the plate tracked whoever
  was attacking and the flank the kind exists to teach was geometrically
  unreachable. Enemies now turn at a finite `turnRate` — `Infinity` for every
  kind that never needed one, so their behaviour is bit-for-bit unchanged, and
  2.2 rad/s for plated enemies, which opens the back after about a second of
  committed strafing.
- **Enemies could occupy the player's own footprint.** Nothing stopped the
  player from walking through them. Beyond looking wrong, it broke the maths
  every directional rule depends on: at zero separation there is no bearing, so
  armour checks defaulted to "protected". A body's width is now kept between
  them, and the enemy is what yields, never the player.
- **A brood killed against a wall could softlock its dungeon.** Split children
  were placed blind at a fixed radius, so half a litter could spawn inside solid
  masonry — unreachable, permanently alive, and every room-clear gate in that
  dungeon then waited on them forever. Children now search outward for a free
  spot and fall back to the parent's own footprint.
- **65 of ~120 authored enemies were not the kind they claimed to be.** Explicit
  `ai:` overrides contradicted their kind — 18 lancers that never lunged, 12
  motes that never burst — so the four kinds added in the previous pass existed
  in the roster tables and almost nowhere in the actual levels. 49 contradicting
  overrides removed; ~11 deliberate variants kept.
- Beat 09 was the only dungeon in which a kind never behaved like itself, and
  the only significant dip in the difficulty curve. Both closed.

#### Changed

- **Enemy and boss HP now scale with the beat they spawn in**
  (`src/game/world/threat-curve.js`). Authored HP was nearly flat across the
  campaign (4 in beat 02, 5 in beat 14) while the player's best weapon damage
  triples, so from beat 05 to beat 14 every ordinary enemy died to fewer than
  two landed hits, in about six tenths of a second — ten dungeons in which the
  back half was mechanically *softer* than the front. The cost was not
  difficulty but that the bestiary stopped working: if two swings delete a
  bulwark, walking around it is slower than mashing, so its question is never
  put. Late-game durability goes from 1.5 to 4.0 landed hits.
- **Bosses were inverted harder still** — authored 12–18 flat, so nine of
  fourteen died in 4–6 hits against the beat-01 tutorial boss's 8, and the
  previous point left beat 13's ordinary enemies outlasting most bosses. Boss
  durability is now a monotone 8 → 18 hits. Phase thresholds are HP fractions,
  so multi-phase fights keep their shape exactly.
- The curve is deliberately shaped rather than flat: beats 1–4 are untouched
  (they were tuned against a 1-damage weapon and play correctly), and **beat 05
  is the softest point of the back half on purpose**, because it grants the
  Tectonic Wedge and a new weapon has to *feel* like one.

#### Added

- `src/game/ui/coach.js` — one-shot hints delivered at the moment a mechanic
  refuses input, rather than on room entry where they are missable. A blocked
  swing now explains the plate instead of only clanging.
- Specs `threat-curve`, `coach`; measurement probes
  `tests/qa/{time-to-kill,difficulty-curve,ai-override-audit}.mjs`.
- Bestiary coverage that **simulates a player moving at player speed** rather
  than placing the attacker by hand — the omission that let the unkillable
  bulwark ship green.

Suite 1879 → **1971**, all passing.

### Design pass — ZeldaLevel Z1–Z7

Design audit written to [ZeldaLevel.md](ZeldaLevel.md) and executed. Every
ticket ships the rule **and** the spec that makes violating it a build failure.

- **Camera contract** — no contiguous overhead mass (>4 cells above y=3) over
  play space. Bone arches corbel inward instead of closing with a lintel; worst
  cluster 9 → 2 cells.
- **Legible traversal** — every climbable one-cell rise is visibly marked as
  one; 565 marked campaign-wide.
- **Guard and parry** — the defensive half of the combat verb set. A 120°
  frontal block, a 0.18 s parry window, three points of poise, and a guard
  break. Added a `damageFilter` hook to `HealthPool` as the single interception
  point for 25+ damage call sites.
- **Lock-on** — decouples facing from movement, with a ground reticle and
  camera integration. Bound to **T** / gamepad **LT**.
- **A real bestiary** — enemy kinds 3 → 7 (bulwark, mote, lancer, brood), each
  asking a question the others do not. All 14 dungeon rosters are now distinct,
  where twelve consecutive beats previously shared one.
- **Dungeon pedagogy** — every beat declares a `theme` and the four rooms that
  introduce, develop, combine, and test it, plus an in-game teaching hint.
- **Secret taxonomy** — reward type became explicit data (`reward: { type }`).
  Rewards had been dispatched by string-matching a pickup's *display label*, so
  renaming one silently changed what the player received. Scar Sutures are now
  exactly one per dungeon (14 + 2 overworld = 16 = four optional hearts).

#### Fixed

- `dev-mode.js` permanently wrapped `player.health.damage` with a two-argument
  function, discarding `source` and `meta`. The guard resolves hit direction
  from `meta.from`, so in the running game the shield never engaged — while
  every unit test passed, because the tests construct `HealthPool` directly.
  Pass-through wrappers now use `(...args)`.

Suite 1436 → 1879.

### Reconstruction — AUDIT-progression-and-geometry v2

- Deterministic mood/quality re-derivation (`mood-controller.reapplyVisual`), so
  the final frame no longer depends on whether quality or mood was set last.
- Two-subject boss framing in `camera-rig.js`, foreground occlusion fade
  (`fx/occlusion.js`), and HUD toast dedupe.
- Per-region overworld grammars (`overworld/grammars.js`) — eight silhouettes
  that read apart in grayscale, with Crust and Abyss differing in *form* rather
  than palette; replaces the palette-only terrain builder.
- Named-pivot actor rigs and an archetype animator, so sentinel, scarab, and
  frost diverge in rest pose and gait rather than only in colour.
- Material families via a bounded `onBeforeCompile` — roughness and metalness by
  vertex-colour class, albedo untouched so luminance bands hold. Mean-preserving
  surface mottling, a pooled local-light system, synchronous shader prewarm, and
  14 per-dungeon material kits.

Ticket H (Ultra GTAO) was deliberately **not** taken: no AO pass exists, so the
lower tiers would pay nothing, and the audit only retains it if paired on-GPU
captures prove its worth — which headless CI cannot produce.

Suite 995 → 1436.

### Narrative systems

- Added campaign-owned Easy, Medium, Hard, and Survival modes with distinct
  enemy health, incoming damage, hostile cadence, projectile speed,
  telegraphs, boss recovery, healing drops, environmental damage, shard risk,
  score multipliers, and hint timing. Old `normal` saves migrate to Medium.
- Added Reconstitution Charges. Easy has infinite lives, Medium has five per
  expedition, Hard has three, altars refill the expedition, and Survival has
  one life for the full campaign. Survival death seals the save and records
  its final result before the death presentation begins.
- Added the Anchor Thread with fourteen authored destinations, a persistent
  HUD objective, mode-aware stuck escalation, prioritized dialogue, map
  Recall, destination disturbance, and overworld exit pulses calculated from
  the live screen graph.
- Activated Witness Score with versioned per-mode boards, one-time encounter
  awards, combat chains, damage resets, boss and beat rewards, engineer
  rescues, secrets, map memories, flawless phases, campaign completion, and
  automatic unranked status when developer mode is used.
- Split Scar Shards into carried and altar-banked currency. Medium and Hard
  deaths can leave a recoverable Death Echo. The altar now banks shards,
  refills charges, sells repairs and Memory Vial refills, and offers four new
  permanent utility upgrade lines.
- Reinterpreted the repeated Beat 07 Magnetic Grapple as the Deep-Pull Coil
  range upgrade and the repeated Beat 12 Light Caster as the Line Caster
  upgrade, preserving the working gate graph without lying about duplicate
  rewards.
- Added sixteen persistent Scar Sutures that bind into four optional hearts,
  four persistent Memory Vial chassis with manual and Easy emergency use, the
  Cipher Lens for clearer Recall, Resonance Fork altar travel and motif
  replay, projectile-facing Reflector Plate, limited Entropy Dust conversion,
  and the purchasable Buoyancy Mesh for Mire traversal. Fixed pickups now
  persist immediately and cannot be farmed by reloading.
- Added focused unit coverage for run-mode scalars, infinite Easy lives,
  expedition breaks, one-life Survival, shard loss, Witness Score integrity,
  immutable run modes, and Anchor Thread escalation. Current unit result is
  653 of 653 unit assertions passing. The full browser and unit suite passed
  1243 of 1243 before two final pure completion assertions were added and
  verified in the unit run. The focused Survival browser contract passes 9 of
  9, including sealed-save reload protection.

### Documentation

- Added `AUDIT-Narrative.md`, checked against the 2026-07-19 worktree and live
  A Link to the Past item-acquisition sources. The audit specifies the Anchor
  Thread story-guidance system, functional Easy, Medium, Hard, and one-life
  Survival modes, Reconstitution Charges, Witness Score, the existing Scar
  Shard economy and new spending paths, item-acquisition proposals, save
  migrations, implementation order, and verification criteria.

By-hand playtest feedback, fixed.

### Fixed
- Closed the overworld progression hole. Dungeon entrances now reject locked
  beats before changing the return position or loading the level, all
  player-facing cross-level requests pass through the same gate, Beat Select
  no longer trusts a stray `currentBeat`, and boot repairs an old invalid
  `currentBeat` back to the overworld.
- Moved the GUMOI Witness terraces into the room graph's multi-Y platform map,
  removing the infinite-height XZ collision columns that could wall off the
  arena.
- Room transitions now cancel an active boss camera focus before beginning the
  pan, so focus height and targeting cannot bleed into the next room.
- Replaced the deprecated three.js `PCFSoftShadowMap` setting with
  `PCFShadowMap`, which owns the soft PCF behavior in r185.
- Added a WebGL2 compatibility gate and a visible startup failure screen. A
  browser without WebGL2 now gets an actionable message instead of a dead boot
  overlay and console-only wreckage.

### Known issues (diagnosed, not yet fixed)
- Refreshed both progression and geometry audits against the 2026-07-19
  worktree and current official three.js sources. The refresh corrects stale
  WebGPU guidance, separates WebGL GTAOPass from WebGPU GTAONode, and records
  the soft three.js pin and measured shader-prewarm opportunity that remain
  open. It also marks the migration guide's 185 to 186 section as
  forward-looking while r185 and package 0.185.1 remain current, and preserves
  the existing whole-frame renderer metrics reset as the correct multi-pass
  accounting pattern. The progression, GUMOI collision, shadow-map, and WebGL2
  failures diagnosed by the audits are now fixed above.
  The older audit's stale transient task tracker and unsupported third-party
  claims were removed, and its formatting now matches the current audit.
  Implementation verification is green at 567/567 unit assertions and
  1150/1150 full-suite assertions.

### Added
- **Boss fights are fights.** Every boss now runs one loop: a readable pattern,
  a wind-up that commits and marks the ground, a strike resolved against where
  you are at that moment, and a **recovery window** where it is motionless,
  lit, and taking double damage. Reading a boss now buys you something; before,
  attacks fired off bare cooldowns and hitting the boss was equally good at
  every instant, so mashing was optimal in all 14 fights.
- Telegraph shapes: rings ("move"), cones ("get behind it") and lanes ("leave
  the line"), instead of one identical ring for every attack in the game.
- `boss-quality-e2e` and `boss-grammar` specs (+84 assertions, 1056 → 1140)
  asserting the things "the boss reaches 0 HP" cannot see: that each boss
  reacts to where the player stands, opens a real window, and dies to a melee
  weapon from floor level.
- Enemy attack telegraphs. Every hostile action now winds up: the enemy holds
  still, a ring marks the ground it is about to strike, and damage resolves
  only when the ring expires — against where you are at that moment. Walking
  clear or dashing through makes the blow whiff. Previously enemies dealt
  damage the instant their cooldown expired while you were in range, with no
  tell and no way to avoid it.
- Heart recovery. Slain enemies drop hearts (odds rise the more hurt you
  are), and boss phase changes always drop one. `HealthPool.heal()` existed
  but nothing in the game had ever called it — dying was the only way to get
  HP back.

### Changed
- The game is keyboard-driven. You face the way you walk, A Link to the Past
  style, and standing still holds your last facing. Mouse aim (which
  overwrote facing every frame) and LMB-attack are gone.
- Camera scale is constant everywhere. Entering a dungeon no longer zooms in:
  overworld and every dungeon now frame the same 24 world units, where
  dungeons previously framed 21 against the overworld's 47.
- Dash grants at least 0.3s of invulnerability (was 0.13s, shorter than a
  human reaction) so it works as a dodge.
- Gameplay camera reads top-down instead of 3/4-perspective: FOV 65° → 40°
  and a steeper rig tilt (visible floor area preserved at the tighter FOV).

### Fixed
- A gamepad stick that is off-centre when it connects (held, drifting, or
  stuck) no longer pins movement in one direction. Sticks are trusted only
  once seen at rest; the pad otherwise overrode the keyboard every frame and
  made the game unplayable. A one-shot HUD hint now explains the suppression
  instead of the controller silently doing nothing.
  This also resolved a reported "locked door won't open with a valid key":
  the player was being shoved sideways and could never line up with the
  2-unit-wide centred door gap.
- The boss-intro camera push-in is now cancelled on level change; it could
  previously bleed into the next level and leave the camera inside a wall.
- Locked and boss doors can be opened. The gold plug filling a locked doorway
  is a solid collider, but the unlock trigger sat 0.3 past the wall line —
  behind that solid matter. The plug stopped the player ~0.9 short, so the
  trigger never fired and the key was never spent: **no locked or boss door
  in the campaign could be opened on foot.** Plugged doors now unlock on
  approach. All 80 locked/boss doors verified by walking a physics body into
  each one.
- Boss attack telegraphs are visible. Rings were drawn at an absolute height
  of y≈0.08 while room floors sit at y=1, so every boss telegraph in the game
  had been rendering a full unit underground since the boss framework landed.
- Dying no longer respawns you into empty space. Respawn uses the room you
  died in rather than the spawn point captured at level load.
- **8 of the 14 bosses ignored the player completely.** Their movement was a
  function of the clock alone — byte-identical paths no matter where you
  stood. The Sand Spur traced the same four corners forever; the Magma Wyrm
  swam a fixed figure-8 dribbling fire on its own track; the Tri-Compiler,
  Frost & Fuel, GUMOI Witness and Leviathan Core orbited fixed points, and the
  Leviathan did not move at all until phase 2. Four of them had no
  player-targeted attack of any kind, so the only way to be hurt was to walk
  into one. All 14 now read and respond to the player.
- **The GUMOI Witness could not be hit by any melee weapon, in any phase.** It
  hovered ~7 units above the player's head, where the vertical gate in
  `hitboxCheck` rejects every sword in the game. It was killable only by the
  Light Caster, and only because a ray move carries no `vertical` field — so
  the gate compared against `undefined`, produced `NaN`, and let the hit
  through by accident. It now descends to head height to attack.
- **The Obsidian Arachnid deadlocked at close range.** Armoured except
  mid-leap, and it only leapt at targets more than 3 units away — so a player
  who walked up and stayed there swung forever into a boss that could take no
  damage and would never open. It now also leaps to make space when crowded.
- Leviathan decoys orbited the world origin instead of the Core, which put
  them in a different part of the dungeon entirely (beat-14's arena is nowhere
  near 0,0).
- The Kinetic Core's charge teleported to the far wall instead of crossing the
  floor between, so it could not be dodged, blocked or even seen.
- Bosses that keep their distance now spiral inward rather than holding a fixed
  radius, which would have made them literally uncatchable — backing away
  exactly as fast as the player approaches.

## [0.3.0] — 2026-07-17

The "LttP scope" release: the fifteen single arenas became a connected world.
Executes the Completion Plan (Phases S/D/W/C) via the Builder Guide.

### Added
- **World architecture**: room-graph dungeons on a 64-unit world grid (door
  gaps, locked/boss-door plugs, camera room-lock panning, prebake, multi-Y
  platform meshes), persistent per-dungeon key/door/visited state (save v2 +
  one-shot migration), overworld screens with edge transitions, mirror travel
  (monolith swaps between per-screen Crust/Abyss layouts), Tab map (overworld
  grid + dungeon room graph), item-gating blockers (grapple gap, wedge crack,
  boot ledge, caster shroud).
- **Content**: 7×7 overworld (49 screens × 2 states, 8 regions, 14 dungeon
  entrances, monoliths, secrets); all 14 beats rebuilt as 6–8-room dungeons
  with keys, locks, boss keys, maps, secrets, altars, and their signature
  systems; new game starts on the overworld; Bare Strike starting weapon —
  the Anchor Link is salvaged from the Crypt Warden.
- **Dev mode** (`?dev=1` / Ctrl+Shift+D): god/one-hit, F2 boss kill, F3 phase
  force, teleport/grant panel, perf + luminance overlays, hitbox geometry.
- Visual-sanity and campaign/world e2e suites (388 → 995 assertions),
  per-level luminance sampler, character `measure()` hook, Phase V
  certification captures (`CERTIFICATION.md` + `docs/media/certification/`),
  and a real-combat boss gauntlet (all 14 bosses fall through the actual
  `tryAttack` path, not the `hp=0` shortcut).
- Per-dungeon story pass (intro/mid/post-boss lines), per-beat/region music
  motifs, boss-reveal stinger, economy audit.

### Fixed
- P0-1: characters were ~7× world scale with feet below the floor (player
  14.85 → 1.93 units, grounded via bounding-box shift).
- P0-2: near-black scenes — the abyss vignette preset was crushing the frame
  (13–32/255); lights now driven by mood presets, all 15+ scenes read
  35–90/255.
- P0-3: 0×0 canvas on hidden-tab boot (continuous size guard).
- P1-4: no longer start holding the weapon Beat 01 says to salvage (plus the
  `grantItem('anchor_link')` no-op).
- P1-5: boss silhouettes now dominate trash mobs (presence scaling with
  matched combat radii).
- Bosses that orbit/patrol anchor to their arena, not the world origin.
- Boss HP bar only shows when the fight is near.

## [0.2.0-engine] — 2026-07-13 (kit changelog below)

## [0.2.0] — 2026-07-13

Professionalization pass: the kit went from "code that works" to a real
public project — tests, CI, examples, docs, and a standalone identity.

### Added
- Full test suite: pure-node unit specs for `collision.js`, `hitbox.js` +
  `facing.js` (including the equivalence proof that a vectorized facing
  matches the classic X-signed cone bit-for-bit), and `settings.js`
  (storage-absent/throwing degradation, persistence, reset semantics), plus
  a browser smoke spec covering `index.html` and both examples.
- GitHub Actions CI running the unit suite on every push/PR to `main`.
- Two genre-neutral examples: `examples/topdown-8way.html` (top-down camera,
  8-way movement, melee arc, wall collision) and `examples/voxel-showcase.html`
  (six bespoke voxel builds, live quality-tier switching).
- `docs/API.md` — a hand-curated reference for every export in `src/`,
  including the implicit `world` contract.
- README screenshots ("See it" section) for the smoke test and both examples.
- `package.json` identity fields (`repository`, `author`, `license`) and a
  standalone description no longer framed as an extraction of a specific game.
- `.editorconfig`, `.gitattributes`, `CONTRIBUTING.md`.

### Changed
- README rewritten to stand on its own: leads with what the kit *is*, closes
  with a "Built with this kit" section linking an example project instead of
  a "lifted out of" provenance framing.

### Known limitations
- CI runs the pure-node unit suite only (44 assertions, <1s). The browser
  smoke test (`npm test`, full suite) needs a real GPU — GitHub's hosted
  runners don't have one, and headless Chrome + SwiftShader software
  rendering proved unreliable there across several attempts. Run `npm test`
  locally before tagging a release; see CONTRIBUTING.md.

## [0.1.0] — Initial extraction

The kit as pulled out of its origin game: renderer + HDR bloom/vignette/film
composer, voxel meshing with baked ambient occlusion, character-part
builders, particle and motion-smear FX, a WebAudio synth, localStorage-backed
settings, quality tiers, skybox/environment, and the two combat primitives
that motivated the extraction — swept AABB collision and a vectorized
(8-way) hitbox, first proven in real belt-scroller combat with `facingVec`
pinned to `±X`. No tests, no CI, no examples yet.
