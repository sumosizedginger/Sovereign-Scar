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

Everything above can be true of something invisible. **Four instruments were
built to answer *can you actually see this*, and the first three were wrong.**

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

`tests/game/gear-skins.spec.mjs` — 211 assertions.

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

**24 counterfactuals. 0 stayed green, 0 vacuous, every file restored byte for
byte.**

---

## What actually exists

Counted rather than remembered, because a number in a plan is a hypothesis:

    region relic slots     8   tombfields filled, seven null
    outfits in the table   4   Crustwalker, Bonewarden, Drowned, Ashen
    with held gear         3   Bonewarden, Drowned (full), Ashen (shield only)
    relic props built      1   the dragon
    outfits with a source  3   Bonewarden (dragon), Drowned (well), Ashen (three fires)
    outfits with none      0   Crustwalker is the default and needs none

**The prop is the cost, not the palette.** The Bonewarden palette took an
afternoon. The dragon took five separate fixes that no probe found and only
pictures did — the skull was a fine side view and a pile of rectangles at 70.7
degrees, the well could not be seen from inside its own interact radius, the
horns barred the arch at 1.07 against a hero of 1.95. Any plan that treats a new
region as "write six hex values" is a plan that has not read
`docs/EASTER-EGGS.md`.

The two palette-only steps are done. Everything below costs a prop.

---

## Not every outfit fills every slot

The Ashen has a body and a shield and **no weapon**, and that is a decision
rather than an omission.

The civilians at the three fires carry nothing. A hero in their clothes, holding
their battered plate, still swinging their own real weapon reads as somebody who
*joined* them; a matched three-piece set reads as a costume. This is the one
outfit in the game whose whole point is looking like you belong to somebody
else, and a full kit undoes it.

It is also the only thing keeping one of the wardrobe's rules honest. `slotOptions`
filters an outfit out of a slot it has no art for — and if every row filled every
slot, deleting that filter would change nothing and no test could tell. One
genuine gap in the data is what makes the guard testable, and `gear-skins.spec.mjs`
asserts that **at least one gap always survives** rather than leaving it to
whoever authors the next outfit.

The general rule this settles, and the one the remaining seven should follow:

> **Region relics are full sets** — they are the payoff for exploring.
> **Behaviour unlocks are single-slot standouts** — cheaper, and they give the
> wardrobe something to mix that is not a matching set.

---

## The eight regions

Each region already has a colour identity in `overworld/world7.js`, so an
outfit found there can be made of the ground it was found on rather than
invented beside it.

| region | ground | the thing you find | the look |
|---|---|---|---|
| tombfields | slate + bone | **the dragon** — built | bone over slate |
| spindle | iron + slate, violet | a toppled survey mast, still pointing | iron and violet |
| sinklands | clay + rust | a shipwreck, where there has been no water in a very long time | bleached canvas and tar |
| citadel | gold-veined slate | a throne with nobody in it | gold leaf and deep violet |
| quarry | dark slate, basalt | a half-carved figure somebody abandoned | basalt and stone dust |
| bonetown | limestone + moss | a house in the ruined town, still furnished | moss over limestone |
| cryomire | ice + sludge | something frozen mid-stride | sludge green — **not ice** |
| pyre | rust + magma | a signal fire that went out | soot and ember |

**Cryomire is the constrained one and that is the good news.** Its enemies are
the frost faction, and `gear-skins.spec.mjs` fails any outfit whose emissive
matches an enemy accent — so the ice region is the one place an ice-coloured
outfit is forbidden. Sludge against ice is a better idea than ice against ice
anyway, and the rule is what forced it.

---

## Order of work

Sequenced by what each step *proves*, not by which region is nicest.

**1 — Finish the Drowned. DONE.** It has a working source already (the well pays out
on the third throw) and it is body-only. Weapon and shield art for it is pure
palette: no prop, no placement, no new interact. It also doubles every row of
the picker from two options to three, which is the first point at which mixing
is worth opening a menu for.

**2 — Wire the Ashen. DONE** — speak to all three keepers; the flags survive
because the reward spans three screens that are never loaded at once. Needs a trigger — all three settlement fires still
burning — and full art. Still no prop. It is the only cosmetic in the whole set
that *means* something: `CIVILIAN_PALETTE` dresses you as the people you are
failing to save.

Those two take the table from one geared outfit to three and cost no new art
pipeline at all. Everything after them costs a prop.

**3 — Pyre: the dead signal fire.** Deliberately the SECOND prop and
deliberately a small one. The dragon is 22 spine segments and a ribcage; a
burnt-out fire is a handful of boxes. The question this answers is whether the
prop cost was the dragon or the pipeline, and it is much cheaper to find that
out on something small.

**4 — Spindle: the toppled mast.** The other cheap silhouette — one long
diagonal, vertical where the dragon was horizontal. Two small props in a row
before committing to a big one.

**5 — Sinklands: the shipwreck.** The best idea in `EASTER-EGGS.md` and the
first real set piece. A hull is a large horizontal mass on a screen whose
density is the lowest in the world (0.35), so there is room for it, and the joke
carries itself without a line of dialogue.

**6 — Citadel: the empty throne.** The centre screen — the highest-traffic
square on the map, so the most value per unit of work — and the most ornate
outfit, so the most art risk. Worth doing once five palettes' worth of evidence
exists about what actually reads at 34 px.

**7 — Cryomire: the frozen figure.** Held late on purpose. Its palette is the
hardest in the set because the obvious answer is banned, and it should be
attempted with the most evidence in hand, not the least.

**8 — Bonetown: the furnished house.** Density 0.9, the highest in the world.
Placement risk is at its worst here, and the feature-anchor system should have
the most mileage under it before it is asked to keep a house clear.

**9 — Quarry: the half-carved figure.** Last because it is the one whose idea is
weakest, and by then there will be seven better ones to steal from.

### Not on this list, and cheap

**A source that costs no prop at all.** Beating a boss without taking damage is
a flag the combat code could already set, and it can grant any outfit above
rather than needing its own. Same for finding all three settlements, which is
Ashen. Sources and outfits are separate axes and do not have to be built
together.

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

- **The Light Caster.** Unskinnable under the current rule; 8–13% of its pixels
  move because its silhouette is almost all bloom. Recorded rather than worked
  around.
- **The guard pose.** Every shield number here was taken with the arm down,
  which is where the shield spends most of its time. Raised, it presents its
  face at the camera and is a much larger surface — unmeasured.
- **A second prop has never been built.** Everything above about "the pipeline"
  is a hypothesis until step 3.
- **The no-damage boss kill.** Named as the cheapest remaining source — a flag
  the combat code could already set — and still not wired. It needs no prop and
  can grant any outfit, so it is the obvious companion to the next relic rather
  than a job of its own.
