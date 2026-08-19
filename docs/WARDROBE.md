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

    skin:has:bonewarden      you own it          (set by the relic)
    skin:worn                body                (the flag that already shipped)
    skin:worn:weapon         weapon
    skin:worn:shield         shield

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

Everything above can be true of something invisible. Three instruments were
built to answer *can you actually see this*, and the first two were wrong.

**The first** counted pixels that changed between a before and an after frame,
and took its noise floor from two shots 700 ms apart with the world running —
while every real reading was taken either side of a room reset. The control came
out at **12271 px, larger than every change it was the floor for**, and read
literally it declared the hero's own body skin invisible.

**The second** stopped the world with `game.paused` so both frames shared a body
pose and a dust position, and made the control a real teardown and rebuild with
identical colours. Better, and still wrong: the control moved **1521 px** with no
art change at all. Signal was above it, but a metric whose floor sits that close
to its ceiling cannot tell *faint* from *nothing*, and those are the two answers
that matter.

**The third** stopped counting change and measured the object. Each piece is
hidden and shown while everything else holds still; the pixels that appear *are*
the gear, at play scale, under the real light.

    piece                    area   changed  % of it   dRGB   dL*   contrast within
    weapon anchor_link         335       318      95%     60  -8.3   20.9 -> 2.7
    weapon tectonic_wedge     1004       654      65%     54   6.8   19.5 -> 24.8
    weapon heavy_mallet       1114       574      52%     71  12.3   14.6 -> 24.3
    weapon light_caster       1741       189      11%      5   1.4   14.9 -> 14.7
    shield                    1199       914      76%     11   1.2    8.9 -> 24.0

### I was wrong about weapons

Before measuring, I told the owner a held weapon reads as a silhouette and not
as a colour, so weapon skins would be nearly invisible and the shield was where
the money was. **The Wedge is 1004 px and the Mallet 1114 px** — comparable to
the shield, and a bigger surface than I predicted. Weapons are the most visible
gear on the character, not the least.

### And the third instrument was wrong too, in the oldest way in this repo

It reported the shield's colour moving by dRGB 11 and called it "barely moves".
The picture shows a flat grey slab becoming a dark plate with two bright bone
rails down its sides — one of the clearest changes in the set. Both are correct:
the face got darker and the bands got brighter, and a **mean cancels them
against each other exactly**. `docs/media/README.md` carries the same lesson
from the terraces, which scored 46/47/47 while the pictures went from concrete
slabs to correct.

So the probe reports three numbers. `area` is the ceiling on how much a repaint
can matter, `changed` is what it actually spent, and `contrast within` is the
standard deviation of L\* inside the outline. The shield's internal contrast went
**8.9 → 24.0**, nearly tripling. That is the number that matches the picture.

### The Light Caster cannot be skinned

11% of its pixels moved. Its 1741 px silhouette is almost entirely the emissive
lamp and its bloom halo — the rod body is a dark stick. **The Light Caster *is*
its glow**, and this table leaves `glow` alone.

That is deliberate. The ten enemy palettes in `assets/palettes.js` claim cyan
(`#40e0ff`, `#60e0ff`), red, acid green (`#a0ff60`, `#ccff60`), amber, violet,
orange, cold white (`#e8f0ff`) and cream between them. `hero-skins.js` records
at length why the hero's rim is azure and not cyan: in a frost room a
cyan-marked hero wears the accent of the things trying to kill them. A tip glow
is smaller and briefer than a rim, but the failure is the same shape, and
"smaller" is a discount, not an argument. The spec holds every skin against
every enemy accent.

The Light Caster being unskinnable is the price. It is recorded here rather than
worked around.

### One thing was tuned on the measurement

The Anchor Link came out of the first pass with 97% of its pixels repainted and
internal contrast collapsing **20.9 → 1.8** — bone blade against bone guard,
two shades of the same cream with nothing for the eye to catch. Its guard is now
horn (`#7a6f58`) rather than bone. From directly overhead the Anchor Link is
essentially one box, so the recovery is modest (2.7), and it was left there
rather than tuned further: an actor outline once improved every metric on record
and was rejected on sight.

---

## Held here

`tests/game/gear-skins.spec.mjs` — 170 assertions.

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

`tests/qa/gear-skin-shots.mjs` — the pictures and the three numbers above.
Writes `docs/media/gear-skins/`, including 4x nearest-neighbour crops, because
the hero is 34 px wide at 1280 and judging a palette off a full frame is judging
it off a rumour.

**16 counterfactuals. 0 stayed green, 0 vacuous, every file restored byte for
byte.**

---

## Still open

- **Seven outfits.** `GEAR_SKINS` has four rows and two of them are body-only on
  purpose. The engine is proven; the rest is authoring.
- **The Light Caster.** Unskinnable under the current rule. Changing that means
  picking an emissive no faction owns, and the safe part of the spectrum is
  narrow.
- **The guard pose.** Every shield number here was taken with the arm down,
  which is where the shield spends most of its time. Raised, it presents its
  face at the camera and is a much larger surface — unmeasured.
- **The Ashen outfit still has no source.**
