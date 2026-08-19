# The wardrobe

Three cosmetic slots — body, weapon, shield — one shared unlock, and a picker.

`docs/EASTER-EGGS.md` built the first half: a dragon in the tombfields that
gives you the Bonewarden, a well that lies to you and eventually pays out the
Drowned. Those dressed the hero and nothing else. This is the rest: the held
gear, the rule that keeps a cosmetic from becoming a combat change, and the
measurements that decided what the first outfit actually looks like.

---

## Why the held gear was the easy half

The hero was expensive. `createActorRig` merges every voxel of a body part into
one geometry with the colours **baked into a vertex buffer**, so a live skin
swap meant proving that a repaint moves no socket, then writing `recolorActor`
to touch nothing but colour. That proof is in `hero-skins.js` and it took a
counterfactual to trust.

Held gear is the opposite shape of problem. `boxes()` in `weapon-models.js`
gives every box its own mesh and its own `MeshStandardMaterial`, and both
holders already tear the model down and rebuild it whenever the equipped item
changes. So a gear skin is a lookup, not a mechanism — there is no live-recolour
path to keep correct, because the object is remade anyway.

The blast radius is two files. `buildWeaponModel` and `buildShieldModel` are
called by `fx/held-weapon.js`, `fx/held-shield.js` and the specs. **Nothing
else.** No enemy, no boss, no civilian builds one, so a weapon skin cannot leak
onto something trying to kill you.

---

## Roles, and the one rule

Every colour in `weapon-models.js` used to be a literal typed at the point of
use — 21 weapon boxes and 7 shield boxes, each carrying a hex nobody had ever
chosen as a *set*. Same situation the hero's shirt was in before
`INHERITED_CLOTHING` named it.

Each box now declares a role, and a skin supplies colours per role:

    grip · guard · guardDark · blade · bladeDark · glow · accent

The `Dark` variants are load-bearing. The shield's bands (`#8a94a4`) and its
edge rails (`#4a5058`) are both guard furniture in two shades; collapsing them
onto one role would have flattened the shield the first time anybody skinned it.

**A skin may write `color`, `emissive`, `emissiveIntensity`, `metal`, `rough`.
That is the whole list, and it is enforced by `SKINNABLE`, not by convention.**

The reason is not tidiness. `weaponTipY` measures the built geometry, and
`actor-anim.spec.mjs` uses that measurement to place the blade tip in world
space — the swing the player watches is drawn from the same boxes the hitbox is
resolved against. A skin able to write `w` or `y` could separate the two, which
is the failure this project has shipped five times and cannot catch by reading.
Restricting the override to colour keys makes *a skin cannot change shape* true
by construction. `gear-skins.spec.mjs` checks the tip and the bounding box under
every skin anyway, because a rule enforced in one place is one refactor from
being enforced in none.

The refactor was held to producing **byte-identical output**: every weapon and
the shield, built with no skin, match what shipped mesh for mesh — dimensions,
positions, rotations, colours, emissive, metalness, roughness, shadow flags.

---

## One unlock, three slots

    skin:has:<id>            you own it
    skin:worn                body                (the flag that already shipped)
    skin:worn:weapon         weapon
    skin:worn:shield         shield
    met:<settlement id>      spoken to that one  (the Ashen's condition)

Ownership arrives three ways. The dragon and the well hand it over on an
interact. The Ashen is **earned**: `met:` flags accumulate across three screens
that are never loaded at the same time, and the third one pays out.

Ownership is shared; wear is per slot. Finding the dragon dresses you head to
foot in one moment — a relic that drops a single glove is a checklist, and the
unlock is the only payoff you get for finding the thing. Mixing afterwards is a
second-order pleasure and lives in the wardrobe, where it costs nothing.

`kernel/wardrobe.js` is the only file that knows one id spans three slots. The
two tables stay tables: `characters/hero-skins.js` owns body palettes,
`assets/gear-skins.js` owns held gear, and neither imports the other.

Three rules the wardrobe enforces:

- **An edited save cannot dress you in something you never found.** Every read
  goes through `unlockedSkins`, so a `skin:worn:shield` naming an unowned outfit
  resolves to the default instead of being honoured.
- **A slot is only offered outfits that have art for it.** The Drowned dresses
  you and arms you with nothing, so it does not appear in the weapon row — a
  menu entry that changes no pixel is worse than an absent one.
- **An unlock adds, it does not tidy.** Picking up an outfit with no gear leaves
  the bone shield you chose on purpose exactly where it is.

The body slot deliberately keeps the flag name that already shipped rather than
migrating to `skin:worn:hero` for symmetry. A rename would have silently
undressed everyone who had already found the dragon.

---

## The picker

`menu-state.js` already implemented `select` — left/right adjusts, Enter cycles,
`menu.js` renders it — so the Appearance screen is three rows and a submenu
link, with no new widget code. It lives on the **pause** menu only: there is no
body to dress before a save is loaded.

Rows show names, not ids, because `bonewarden` in a menu looks like a debug
build. `wardrobeView` does that translation and `outfitIdFromName` undoes it, so
neither the menu nor the event handler holds a second copy of the table, and the
spec asserts the trip is lossless for every outfit.

A slot with one option is **disabled, not hidden**. A player who has found the
dragon should be able to see that a Shield row exists and is waiting on
something — a different message from the row not being there.

The change lands on the hero the instant it is made, and the hero is standing
behind the panel. There is no preview doll on purpose: a doll under menu
lighting is not what the character looks like in the room you are standing in.

---

## What looking at it changed

Everything above can be true of something invisible. **Five instruments were
built to answer *can you actually see this*, and the first four were wrong** — three of them by reaching for a mean.

**The first** counted pixels that changed between a before and an after frame,
and took its noise floor from two shots 700 ms apart with the world running —
while every real reading straddled a room reset. The control came out at
**12271 px, larger than every change it was the floor for**, and read literally
it declared the hero's own body skin invisible.

**The second** stopped the world with `game.paused` so both frames shared a body
pose and a dust position, and made the control a real teardown and rebuild with
identical colours. Better, and still wrong: the control moved **1521 px** with no
art change at all. A metric whose floor sits that close to its ceiling cannot
tell *faint* from *nothing*, and those are the two answers that matter.

**The third** stopped counting change and measured the object: hide the piece,
show it, and the pixels that appear *are* the gear. That was the right idea, and
it reported the shield's mean colour moving by dRGB 9 out of 255 — "barely
moves" — while the picture showed a flat grey slab becoming a dark plate with
two bright bone rails. Both were correct. The face darkened by as much as the
bands brightened, and **a mean cancels them against each other exactly.** So it
grew two more numbers: how many of the piece's own pixels moved, and how much
contrast it carries inside its own outline. The shield's internal contrast goes
**9.1 → 24.3**, which is the number that matches the picture.

**The fourth fixed the thing all three had in common: it stopped moving the
target.**

Adding a second and third outfit is what exposed it. Three completely different
palettes — bone cream, verdigris, dust tan — came back within **dRGB 1 of each
other** on the Anchor Link, all reporting a mean near `121,95,65`. That is the
colour of dirt. The probe was calling `pose()` again for every skin, which
re-entered the room and let the idle animation land a few pixels elsewhere; for
the wide weapons the silhouette mask still mostly overlapped and the numbers
looked plausible, and for a blade 0.10 units thick it did not overlap at all.
**It was measuring the ground beside the weapon.**

The fix is to change the skin *without* re-posing — the world is already stopped
and the holders rebuild on demand — and, more importantly, to add the control
that would have caught it: put the shipped gear back at the end and measure it
against its own baseline. If the mask still describes the object, that lands
near zero. It now reports 0.6–3.2% on every piece, and **prints VOID for any
piece that drifts** instead of quietly publishing dirt.

### One outfit was tuned on the broken instrument, and tuned back

The bad readings said the Bonewarden Anchor Link collapsed to almost no internal
contrast (20.9 → 1.8), so its guard was changed from bone to horn to break it
up. Measured without the re-pose, that weapon's contrast under the original bone
guard is **20.8 → 25.3** — it gains definition, and always did. The guard is bone
again. Art directed around a defect in a measuring tool is the most expensive
kind there is, and the value carries the whole story in a comment so the next
person does not redo it.

### The table, measured

    piece            outfit        area  changed  % of it   dRGB   contrast within
    anchor_link      bonewarden     344      213      62%     32   20.8 -> 25.3
                     drowned        344      210      61%     35   20.8 -> 22.1
    tectonic_wedge   bonewarden    1037      591      57%     52   19.3 -> 24.9
                     drowned       1037      581      56%     46   19.3 -> 20.2
    heavy_mallet     bonewarden    1114      568      51%     72   13.7 -> 24.1
                     drowned       1114      546      49%     44   13.7 -> 16.8
    light_caster     bonewarden    1804      108       6%      2   14.4 -> 14.5
                     drowned       1804       90       5%      2   14.4 -> 15.5
    shield           bonewarden    1176      870      74%     10    9.1 -> 24.3
                     drowned       1176      847      72%     26    9.1 -> 21.1
                     ashen         1176      887      75%     28    9.1 -> 20.9

    control - shipped gear put back, measured against its own baseline
    anchor_link 3.2%   wedge 1.1%   mallet 1.0%   caster 0.6%   shield 0.8%

### I was wrong about weapons

Before measuring, I said a held weapon reads as a silhouette and not as a
colour, so weapon skins would be near-invisible and the shield was where the
money was. **The Wedge is 1037 px and the Mallet 1114** — comparable to the
shield, and over half their pixels repaint. Weapons are the most visible gear on
the character, not the least.

And the outfits are distinct from one another, not just from the default: the
closest pair on any real weapon is **dRGB 41**.

### The Light Caster still cannot be skinned

5–6% of its pixels move, and the three outfits land within dRGB 5 of each other.
Its 1804 px silhouette is almost entirely the emissive lamp and its bloom — the
rod body is a dark stick. **The Light Caster *is* its glow**, and this table
leaves `glow` alone.

That is deliberate. The ten enemy palettes in `assets/palettes.js` claim cyan
(`#40e0ff`, `#60e0ff`), red, acid green (`#a0ff60`, `#ccff60`), amber, violet,
orange, cold white (`#e8f0ff`) and cream between them, and `hero-skins.js`
records at length why the hero's rim is azure and not cyan: in a frost room a
cyan-marked hero wears the accent of the things trying to kill them. The spec
holds every skin against every enemy accent. The Caster is the price, recorded
rather than worked around.

---

## Can you still see the hero?

A cosmetic that makes the player figure hard to find is not a cosmetic, it is a
difficulty setting. The rim light that separates the hero from the ground is
pinned to azure and **a skin may never touch it** — that is the safety net, and
a net is a thing you test.

The probe hides the rig and shows it. The pixels that appear are the hero's exact
silhouette; the *same* pixels in the hidden frame are the ground that was
actually behind it. So this compares the character against the specific dirt it
is standing on, not against an annulus that hopes to have found some.

    outfit         figure L*   ground L*     dL*   dRGB   contrast within
    crustwalker         30.2        38.5    -8.3     30   16.5
    bonewarden          33.7        38.5    -4.8     21   23.2
    drowned             28.3        38.4   -10.1     44   18.5
    ashen               29.5        38.5    -9.0     32   17.7

**Two of my own impressions were overruled here.**

The Ashen looked, in its first picture, like it had gone missing into the clay —
it is dust-coloured on purpose, since the whole idea is to look like the
civilians. Measured, it separates *better* than the character the game ships
with: **dL\* 9.0 against 8.3, dRGB 32 against 30.** If the Ashen is hard to see,
so is the default hero, and that is a pre-existing property of this game rather
than something the outfit introduced.

And an earlier claim in this project needs correcting. With the older
disc-and-annulus sampler the Bonewarden measured as having the *best* separation
of the set. With the exact silhouette it is the **weakest** — dL\* −4.8 against
the shipped hero's −8.3. It is still clearly visible, and it carries the highest
internal contrast of the four (23.2), which is most of what makes a small figure
read. It has not been changed: it looks right, the owner has seen it, and
re-tuning art because a better instrument moved a number by four points is how
you get the actor outline back.

---

## Held here

`tests/game/gear-skins.spec.mjs` — 236 assertions, plus 143 in
`tests/game/relics.spec.mjs` covering the two props.

1. A skin cannot change shape. Every piece built under every skin, compared box
   for box, plus the blade tip measured off the built object.
2. The default is not a special case — built through the skin path, it is
   identical to what shipped.
3. A misspelt role is a failing assertion, not a half-painted skin.
4. A skin repaints at least three boxes of everything it claims to dress.
5. No skin's emissive matches an enemy faction accent.
6. The holders' caches cannot swallow a skin change — the cache key is the item
   *and* the skin, because re-dressing a blade does not rename it.
7. Ownership, slots, mixing, forged saves, and the picker's name round trip.
8. The Ashen's source, driven through the REAL `addSettlement` system rather
   than by restating its rule: one settlement grants nothing, **two grants
   nothing**, three grants and dresses, and a fourth visit does not re-announce
   it. The two-of-three case is the interesting one, and a spec that only walks
   the loop to the end never asks it.
9. That a gap survives in the table at all — see above.

`tests/qa/gear-skin-shots.mjs` — the pictures and the three numbers above.
Writes `docs/media/gear-skins/`, including 4x nearest-neighbour crops, because
the hero is 34 px wide at 1280 and judging a palette off a full frame is judging
it off a rumour.

**35 counterfactuals across the two sweeps. 0 stayed green, 0 vacuous, every
file restored byte for byte** — and three of them found assertions that were
too weak rather than code that was wrong, which is the point of running them.

---

## What actually exists

Counted rather than remembered, because a number in a plan is a hypothesis:

    region relic slots    8   all eight filled
    outfits in the table 11   Crustwalker plus ten
    with held gear       10   nine full sets; Ashen is shield-only on purpose
    relic props built     8   one per region
    outfits with a source 10  eight relics, the well, the three fires

The roadmap below is finished. What is left is on the last page.

---

## What eight props cost, and what caught it

The plan asked whether *the dragon* was expensive or the *pipeline* was. Two
props answered it and eight confirmed it: **it is the pipeline.** Building
anything for a camera fixed at 70.7 degrees is the cost, and the failure is
almost always the same one — a shape that is perfectly good from the side and
means nothing from above.

Every prop after the first inherited a shared `grounded()` helper, so the one
piece of arithmetic that had already gone wrong twice was written once:

> A box centred at `h / 2` rests on the floor only while it is level. Give it a
> tilt and the low corner drops by half the span times the sine of the angle.
> The cold fire's toppled stones went 6.8 cm under; a 3.4-metre beam at 0.16 rad
> would go 27 cm under.

Every one of the six new props came out resting at **exactly 0.000**. That
particular bug is now structurally impossible, which is the return on writing a
helper instead of six careful copies.

### What the photographs changed

Four of the six needed real work after they were built, and **not one of those
four was visible in any number.**

| prop | what the numbers said | what the picture said |
|---|---|---|
| **survey mast** | fine | fine — the only one that landed first time |
| **empty throne** | fine | fine |
| **shipwreck** | fine | a herringbone with a black stripe through it. Separated planks left no closed shape, and the tar keel was the darkest thing in frame — the one element meant to be hidden under the hull was the one that read. Rebuilt as a continuous elliptical outline with a pinched bow and a decked front. |
| **furnished house** | fine | two of the four walls were **0.115 thick instead of 0.44**. The wall helper divided `w` by the block count for every wall, which is right when the run is along X and chops up the *thickness* when it runs along Z. A stick is still a wall as far as a bounding box is concerned. |
| **frozen figure** | fine | a white box with nothing in it. The ice had a lid. "Open toward the camera" had been reasoned about as if this game has a side view; the camera is 17.5 units up, so the TOP is the face the player sees. Even after the lid came off, the walls stood taller than the figure and it read as a well with something at the bottom. |
| **half-carved figure** | fine | a small ziggurat. A standing figure seen from directly above is a head with a ring of shoulder round it. Laid down as a **recumbent effigy** it became unmistakable in one glance — and it is the better idea, since a tomb figure is what a quarry in this region would be cutting. |

Two of those are now assertions, because they can be: *nothing roofs the figure
in the ice*, and *the figure stands proud of the ice around it*. The wall
thickness is not, and that is recorded rather than papered over — it was caught
by looking, which is the method, and inventing a fragile assertion to re-catch a
bug already fixed is how a suite fills up with things nobody trusts.

---

## The anchor was delivering two less than it asked for

Placing six new relics surfaced a bug that had been in the world since the first
one.

`world7.js` publishes a feature anchor per relic and both the grammar and the
terracing pass refuse to build inside one. They honour it. But terracing raises
ground by up to two, and its **skirt steps down outside the cell it was refused
at** — so an anchor of `r` delivers a clearing of about `r − 2`, and the relic's
radius-7 clearing was really a five.

Measured across all eight relics, counting raised cells inside the anchor:

    r=7   6 relics affected, 19 cells      r=10   0 relics, 0 cells
    r=8   1 relic affected,   3 cells      r=11   0 relics, 0 cells
    r=9   0 relics affected,  0 cells      r=12   0 relics, 0 cells

Nine is the first value that delivers the seven it asks for. **The dragon was
affected too** — it has been standing in a slightly terraced clearing since the
day it was placed, and nobody could see it because the prop itself was never
buried. `mass` inside the prop's own footprint was zero the whole time; the
question that found this was a different and stricter one.

The probe now measures both, and the spec pins the radius at 9, because a
measured number with no test is a number that drifts back.

---

## Ten outfits is a different problem from three

With three outfits it is enough for each to differ from what shipped. With ten
they have to differ **from each other**, and the probe started reporting closest
pairs instead of comfortable gaps:

    thaw vs unfinished    dRGB 9   on the Anchor Link
    landlocked vs tenant  dRGB 5   on the Wedge
    tenant vs unfinished  dRGB 5   on the Mallet
    ashen vs tenant       dRGB 6   on the shield

The Tenant was in three of the four. Its blade sat at `#b0a894`, between the
Landlocked's bleached canvas and the Unfinished's stone dust — three pale putty
blades that were one blade at 34 pixels.

Moving it to brass fixed those three and **immediately created a fourth**: brass
landed on the Attendant's gilt at dRGB 8. Stepping out of a crowd into the only
other warm neighbourhood in the table is not a fix. It is moss-stained bronze
now — green is the direction nothing else occupies, and the Drowned's verdigris
reads blue-green while this reads yellow-green, so the pair sit further apart
than either does from anything else.

### And then the mean lied for a third time

Asked the obvious next question — *are the whole outfits tellable apart?* — the
probe averaged each figure's colour and reported the **shipped hero six points
from a figure dressed entirely in grey.** The shipped hero wears a red shirt and
blue trousers. Red and blue average to something close to grey.

That is the same failure as the bone shield, whose face darkened by exactly as
much as its bands brightened, and it is the third time in this document a mean
has been the thing that was wrong. The lesson is not "be careful with means", it
is that **a mean answers "what colour is this on average" and is never the
answer to "can you tell these apart".**

The figures share a rig and a pose, so their silhouettes almost coincide and the
pixels can simply be compared. What comes back is the fraction of the character
that actually looks different, which nothing can hide inside:

    55 pairs. Closest: surveyor vs unfinished    27%
                       unfinished vs ashen       28%
                       unanswered vs attendant   28%
                       bonewarden vs thaw        28%
              widest:  crustwalker vs drowned    43%

**Every pair differs across at least a quarter of the character.** The palettes
were fine; the question had been asked with the wrong instrument.

The per-piece numbers above were *not* the same mistake, and the palette moves
they prompted stand: a blade is close to one colour, so a mean over its
silhouette is a fair summary of it. A whole character wearing four garments is
not, and that distinction is the whole of it.

---

## The eight regions

Each region has a colour identity in `overworld/world7.js`, and every outfit is
made of the ground it was found on rather than invented beside it.

| region | the thing you find | the outfit |
|---|---|---|
| tombfields | the dragon skeleton | **Bonewarden** — bone over slate |
| spindle | a toppled survey mast, dish still on the end | **The Surveyor** — iron and violet |
| sinklands | a shipwreck, where there has been no water in a very long time | **The Landlocked** — bleached canvas over tar |
| citadel | a throne with nobody in it | **The Attendant** — gilt and deep violet |
| quarry | a recumbent figure somebody stopped carving | **The Unfinished** — stone dust over basalt |
| bonetown | a house in the ruined town, table still laid | **The Tenant** — moss, brass and limestone |
| cryomire | somebody caught mid-stride in the ice | **The Thaw** — pale cold and sludge |
| pyre | a signal fire that went out | **The Unanswered** — charcoal and one ember |

Two more come from elsewhere: **The Drowned** out of the dry well on the third
throw, and **The Ashen** for speaking to all three settlements.

**Cryomire was the constrained one and the constraint made it better.** Its
enemies are the frost faction, and `gear-skins.spec.mjs` fails any outfit whose
emissive matches an enemy accent — so the ice region is the one place an
ice-coloured outfit is forbidden. Sludge against ice is a better idea than ice
against ice, and the rule is what forced it. Nothing in the prop glows either:
the pyre and the cryomire are the two regions whose ground is lit, and both of
their relics are things that stopped.

---

## Order of work — finished

Sequenced by what each step *proved*, not by which region was nicest. All nine
are done; what each one actually taught is above.

| | | what it was for |
|---|---|---|
| 1 | **Finish the Drowned** | no prop at all — pure palette on a source that already worked |
| 2 | **Wire the Ashen** | no prop — the first *earned* outfit, and the first single-slot one |
| 3 | **Pyre: the cold signal fire** | the second prop, deliberately small: was it the dragon or the pipeline? |
| 4 | **Spindle: the toppled mast** | a second cheap silhouette before committing to a big one |
| 5 | **Sinklands: the shipwreck** | the first real set piece — and the one that had to be rebuilt |
| 6 | **Citadel: the empty throne** | the highest-traffic square on the map |
| 7 | **Cryomire: the frozen figure** | held late: its palette was the hardest, because the obvious answer is banned |
| 8 | **Bonetown: the furnished house** | held late: density 0.9, the worst placement risk in the world |
| 9 | **Quarry: the half-carved figure** | last, and the weakest idea until it was laid down |

Steps 3 and 4 answered their question — the small props hit the same problems
the big one did — so 5 through 9 were built knowing the visual pass was the
cost, and were budgeted for it.

---

## Two decisions worth making before more art

**Does every outfit need all three slots?** ~~Open.~~ **Settled, and applied.**
Region relics are full sets; behaviour unlocks are single-slot standouts. The
Ashen is the first one built that way — body and shield, no weapon — and it
turned out to carry a second job, since one genuine gap in the table is what
keeps the slot filter testable at all.

**Should `glow` ever be skinnable?** It is the only reason the Light Caster
cannot be re-dressed, and the ten enemy accents leave a narrow safe band. If it
is ever opened, the spec that holds every skin against every enemy accent is
already written and is the thing that makes it survivable.

---

## Still open

- **The no-damage boss kill.** Named from the start as the cheapest source in
  the plan — a flag the combat code could already set, needing no prop, able to
  grant any outfit. It is the only item on the original roadmap not built, and
  it is a source rather than a look.
- **The Light Caster still cannot be skinned.** All ten outfits land within a
  few points of each other on it, because its silhouette is almost entirely the
  emissive lamp and its bloom, and this table leaves `glow` alone. The probe
  labels it rather than flagging it every run.
- **The guard pose.** Every shield number here was taken with the arm down,
  which is where the shield spends most of its time. Raised, it presents its
  face at the camera and is a much larger surface — still unmeasured.
- **The house's wall thickness has no test.** It was caught by looking, which
  is the method; an assertion invented afterwards to re-catch a bug already
  fixed is how a suite fills up with things nobody trusts.
