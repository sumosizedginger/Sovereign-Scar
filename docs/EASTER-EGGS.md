# Easter eggs, relics and skins

Written 2026-08-18, from the owner: *"we have a lot of useless overworld where
there is no reason to explore."*

This is a design doc, not a build log. **Nothing in it has shipped yet.** The
numbers are measured and the command that measures them is named, so the next
reader can check rather than trust.

---

## The measured problem is not emptiness

The obvious reading of "useless overworld" is that the screens are empty. They
are not. Of the 49 screens in `WORLD7`, only **11** carry no declared feature at
all. Here is what the other 38 have:

| what is on the 49 screens | count | is it a reason to go there? |
|---|---|---|
| dungeon entrances | 14 | no — a door the plot sends you to |
| item-gated blockers | 9 | no — a wall you look at until you have the item |
| monoliths | 5 | partly |
| settlements | 3 | yes |
| **secret shard caches** | **8** | yes |
| **Scar Sutures** | **2** | yes |

So the count of things you can find *because you chose to look* is **10, across
49 screens**. And all eight caches are the same cyan `addPickup` paying the same
currency through the same toast — `Hidden cache — 20 shards` — authored in one
table at `src/game/overworld/world7.js:156`.

**The overworld does not have too few secrets. It has one secret, eight times.**

That distinction decides everything downstream. A ninth shard cache is worth
less than the eighth was, because shards feed upgrades and upgrades have a
ceiling. What the world is short of is *kinds* of payoff.

Reproduce the census:

```bash
node -e "import('./src/game/overworld/world7.js').then(m=>{const s=m.WORLD7.screens;const t={};let e=[];for(const[id,sc]of Object.entries(s)){const f=[];if(sc.entrances?.length)f.push('entrance');if(sc.monolith)f.push('monolith');if(sc.blockers?.length)f.push('blocker');if(sc.secret)f.push('secret');if(sc.onBake)f.push('onBake');for(const k of f)t[k]=(t[k]||0)+1;if(!f.length)e.push(id)}console.log(Object.keys(s).length,JSON.stringify(t));console.log('featureless',e.length,e.join(' '))})"
```

---

## Two constraints the code has already decided

Both are load-bearing. Ignore either and the work costs several times what it
should.

### 1. The centre of every screen is guaranteed empty — use it

`makeProtector` in `src/game/overworld/grammars.js:31` opens with:

```js
const circles = [{ x: 0, z: 0, r: 6 }]; // spawn + screen centre
```

Every grammar box that would land inside that disc is refused whole. Measured on
the start screen: **0 of 109 cells with mass** inside it.

For terrain this has been a liability — that disc is exactly what the camera
frames, which is a large part of why the overworld meters flat and uniform
(`tests/qa/overworld-lum.mjs`). For a set piece it is the opposite, and it is
free: **screen centre is the one place in the overworld where a prop is
guaranteed to be seen, unoccluded, at full size, on every screen, forever.**

The corollary matters as much. The rig is fixed-yaw at **70.7° pitch**
(`CAM_HEIGHT = 17.5`, `back = CAM_HEIGHT * 0.35`), so the south wall sits
permanently between the lens and the hero and near-half mass costs occlusion.
An easter egg placed near a screen edge is half-eaten by geometry the player
cannot move around. **Set pieces go in the middle.** That is not a preference,
it is the only place the camera will show them.

### 2. Hero skins are cheap; weapon skins are not

`src/game/player.js:67` is one line:

```js
palette: HERO_PALETTE,
```

and `createActorRig` already takes `opts.palette` as a parameter
(`src/game/characters/actor-rig.js:240`), because that is how every enemy and
every civilian in the game is built. A hero skin is therefore **a table of
palettes and a save field**. No new rendering, no new geometry, no new tests
beyond the table itself.

Weapons are the reverse. `BUILDERS[id]` in
`src/game/assets/weapon-models.js:56` takes no arguments and bakes `color:` into
per-box `MeshStandardMaterial`s. A weapon skin means threading a palette through
five builders that also carry shadow roles and a measured reach — `weaponTipY`
reads the built geometry, and the swing specs read that.

This flips the intuitive priority:

- **The hero is on screen 100% of the time and is 34 px wide at 1280.** A
  palette swap on a 34 px figure is the most visible cosmetic change available
  in this game, and the cheapest to build. **Do it first.**
- **The shield is second.** It is a broad flat plate and the only held object
  that *receives* shadow (`weapon-models.js:115`), so colour actually lands on
  it.
- **Blades are last and may never be worth it.** They are ~0.10 units across and
  read as a silhouette, not a colour.

---

## The plan: prove the chain once, then it is content

Build **one** relic end to end before authoring eight. Not because eight is
hard, but because every link below is cheap to change while only one thing
depends on it, and expensive to change once eight do.

The chain to prove:

```
prop at screen centre
  → player walks into range
  → interact prompt
  → story panel lines
  → cosmetic unlock written to inventory flags
  → persists across save/load
  → appears on the world map as the ● secret mark
  → the hero visibly changes
```

**The first one is the dragon skeleton, in the tombfields.** That region is the
NW corner, it is beat 01–02 country, its palette is slate and bone, and a dragon
skeleton is the most impressive silhouette that can be made out of boxes. Ribs
arching over the road so the player walks *through* it.

Everything it needs already exists and is already tested. The template is
`addForkDigSite` at `src/game/narrative/item-chains.js:95` — read it before
writing anything. It is a `level.addSystem({ update(dt, game), dispose() })`
that measures distance to the player, calls `game.input.consumeInteract()`,
queues `game.hud.story.queue([{ speaker, text }])`, sets an inventory flag and
calls `game.persistInventory()`. A relic is that with different words.

The screens are already hooked for it: `screenFeatures()` at `world7.js:169`
collects the per-screen anchors the grammar must keep clear, and `s.onBake` is
where `world7.js` already places caches, sutures and chain props. A relic is a
fourth entry in that same shape.

The map is already hooked too. `map-screen.js:87` reads
`game.hasUpgrade('echo_lens')`, and the legend shipped on 2026-08-17 already has
a `● secret` entry gated behind it. The discovery loop exists.

**Then the other seven are content, not engineering** — one relic per region,
because the world already has exactly eight regions (`REGIONS` in
`world7.js:40`), each with its own floor colour, accent and weathering. The
count is decided for you, the regions already look different, and finding all
eight is a real completion goal that touches every corner of the map without
adding a single point of combat power.

---

## The catalogue

### Confirmed — The Dry Well

The owner picked this variant out of four:

> It offers to heal you if you throw something in. It takes the shards. It does
> not heal you.

A fairy well that does not heal is native to this world rather than pasted onto
it. The premise of the whole game is a wound that will not close; a healing
spring that declines belongs there. It is also, mechanically, the cheapest
content available — `inventory.spendShards(n)` already exists
(`src/game/kernel/inventory.js:99`), and the interact-and-talk path is the dig
site's, unchanged.

**The one design risk, stated plainly: a trap that takes your currency with no
counterplay reads as a bug, not a joke.** A player who loses 20 shards to an
unexplained hole files an issue. The fix is not to soften it — it is to make the
transaction *informed*:

- The well must be **visibly dry before you pay**. Empty basin, dust, no water
  and no glow. The player can see exactly what they are buying.
- The prompt says what it costs and promises nothing. The *well* promises; the
  UI does not.
- Paying a second time gets a different line. It knows.
- It must never be able to take shards the player cannot spare — floor it, or
  let the well decline a broke player with contempt, which is funnier anyway.

Done that way it is not a trap, it is a joke the player agreed to. That is the
difference between an easter egg and a bug report.

A second variant is worth keeping in the drawer: **the basin is dry, and there
is a small pile of shards at the bottom that other people threw in, and you can
take them.** Same premise, opposite direction, no risk at all. It may be the
better one. It is not the one that was picked, and both can exist on different
screens.

### Confirmed — The Dragon Skeleton

See the plan above. Half-buried, ribs over the road, built in the tombfields
palette. Grants the first hero skin.

Worth doing partly because the world is already built twice: every screen has a
`crust` and an `abyss` variant (`s.crust` / `s.abyss` in `world7.js`). The bones
lit in the abyss mirror are a second set piece for the cost of a colour.

### Approved in principle — the miner

The owner asked for Steve from Minecraft. I pushed back, the near-miss was
accepted, and the reasoning belongs in the record.

A direct Steve is the only reference in the set that names another **product**
rather than a **genre**. A dragon skeleton is folklore. A fairy well is Zelda as
vocabulary. Steve is somebody's IP with a face — and this game's voice is more
serious than Steve survives. `src/game/world/settlements.js` argues at length
that the dead of Beat 09 must never turn around, because the moment one does it
is a jump scare instead of a place. Steve is that same failure in the other
direction.

The version that works uses exactly that restraint: **a blocky figure in a blue
shirt and purple trousers, at the bottom of a hand-dug 1×1 shaft, holding a
stone pick, facing the wall.** He does not turn around. He cannot be interacted
with. He is clearly not from here. Everyone gets it in half a second, nobody has
to defend it, and it is funnier deadpan.

### Not yet chosen — set pieces that pay the eye

The "a view" half of the empty-room problem. All of these are cheap *because*
the protected centre disc is doing the work.

- A **shipwreck in the sinklands**, where there has been no water for a very
  long time.
- **Monolith fragments across three adjacent screens** that spell something if
  you read them in map order. The map screen makes this legible, and nothing
  else in the game currently rewards holding two screens in your head at once.
- One screen where **the enemies are already dead** when you arrive, and
  something very large made the tracks leading away.
- A **second dry basin** with the shard pile in it (above).

### Not yet chosen — where skins come from

Eight region relics are the backbone. Other sources worth arguing about:

- A palette for beating a boss without taking damage.
- **A palette from the Dry Well, obtained by paying it.** You get a skin instead
  of the heal. This may be the best version of the well: it removes the
  bug-report risk entirely, because the transaction was real — it just was not
  the one advertised.
- One for finding all three settlements.
- **The civilian palette itself** — `CIVILIAN_PALETTE` in `settlements.js:38`,
  dust-coloured with a warm dim rim. Wearing it makes you look like the people
  you are failing to save. It costs one line and it is the only cosmetic in the
  list that means something.

---

## What this deliberately is not

- **Not more shard caches.** See the top of this document.
- **Not more enemies.** `docs/ROAD-TO-AAA.md` warns against this and is right. A
  screen with a second sentinel on it is not more interesting than a screen with
  one.
- **Not a cosmetic that touches a number.** Skins grant nothing mechanical,
  ever. The moment one does, every one of them enters the balance conversation
  and the eight relics stop being free.
- **Not a shop, a currency, or a UI screen.** An unlock is a flag and a line of
  toast. If a skin picker is ever needed it belongs in the pause menu next to
  what is already there, and that is a later decision.
- **Not dialogue trees.** Same reasoning as `settlements.js`: a figure who says
  one true thing is worth more than a branch about nothing.

---

## Open questions

1. **Where does skin selection live?** An unlock is a flag; *choosing* one needs
   a surface. Cheapest honest answer: the newest unlock is worn automatically
   and the pause menu cycles. Not decided.
2. **Do relics show on the map before the Echo Lens?** The `●` mark is currently
   lens-gated. If relics are the reason to buy the lens, that is a good gate. If
   they are the reason to explore, the gate works against them.
3. **Does the miner get a map mark?** Probably not. A joke you find is better
   than a joke you are sent to.
4. **Eight relics or eight regions?** They are the same number today. If a
   region ever splits, the relic count should follow the *regions*, since the
   palette is the point.
