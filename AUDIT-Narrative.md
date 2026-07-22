# Sovereign Scar Narrative, Guidance, Modes, Lives, Score, Economy, and Item Audit

Audit date: 2026-07-19

Repository reviewed: `D:\Zelda\sovereign-scar`

Narrative source reviewed: `D:\Zelda\Sovereign-Scar-Narrative-Bible.md`

Research status: Live web research checked on 2026-07-19. Sources are linked in
section 11.

Document status: partially implemented on 2026-07-19 and independently
re-audited 2026-07-20. The core modes, Survival seal, Anchor Thread, score,
banking, and functional items exist. The implementation does not satisfy the
entire specification or its verification requirements. Section 14 records the
corrected result.

## 0. Independent implementation check: 2026-07-20

Confirmed working:

- The four run modes are campaign-owned and immutable after New Game.
- The Anchor Thread, Recall, persistent hint state, score ledger, per-mode
  boards, altar banking, four Memory Vial chassis, and Survival's atomic
  death seal are present.
- The focused narrative browser contract passes 9/9, including sealed-save
  reload protection. The current unit suite passes 669/669.

Incorrect or incomplete:

1. **Expedition failure does not start a fresh expedition.** On the final
   Medium or Hard charge, `consumeDeath()` stores zero charges and
   `index.js` reloads the same dungeon. `enterExpedition()` sees the same
   `expeditionId` and returns the zero-charge state unchanged. The player is
   sent to the dungeon entrance, not the last altar, with no replenished
   expedition reserve. This contradicts sections 4.2, 4.4, and 12.3.
2. **Hard does not always destroy the prior Death Echo.** The replacement is
   made only inside `if (loss > 0)`. A second Hard death while carrying too
   few shards to produce a nonzero loss preserves and respawns the old Echo,
   contrary to section 6.5.
3. **There are fourteen automatic Scar Suture grants, not sixteen.** The
   grant hook applies to cache-labelled pickups in beats 07-14. Those files
   contain fourteen such pickups. No overworld pickup calls `collectSuture`.
   The claimed four optional hearts therefore cannot be earned from the
   authored placements as written.
4. **The item functions landed, but several acquisition stories did not.** In
   particular the Resonance Fork and Entropy Dust are direct cache-label
   rewards, not the engineer, sound-puzzle, delivery, and return chains in
   section 7. The implementation is functionally useful but not a complete
   implementation of the acquisition design.
5. **The final screen does not reconcile the score ledger.** It displays only
   the Witness Score total. No event breakdown or total-versus-ledger check is
   shown, leaving section 12.4 unmet.
6. **The leaderboard UI does not isolate score versions.** Storage supports a
   `scoreVersion` filter, but the menu filters only `runMode` and eligibility
   while labelling every board "SCORE VERSION 1". A future or migrated score
   version can appear under the wrong heading.
7. **The complete repository suite is red.** Current result is 1257/1267 due
   to nine Abyss luminance failures and one stale grapple-post assertion.
   These are not failures of the focused narrative contract, but they make
   the section 14 full-suite claim false for this worktree.

Still unproven by registered tests: replenishment and state reset after a
real Medium/Hard expedition break, Survival completion submission, complete
fixed-income affordability, final-screen ledger reconciliation, and the
full campaign acquisition count for Sutures and Vials.

## 1. Original pre-implementation verdict

Sovereign Scar already contains the bones of all five requested systems, but
several bones are not connected to the body yet.

1. The dead predecessor and Anchor Link already provide the correct fictional
   basis for player guidance. The current dialogue is useful inside individual
   rooms, but it does not persist a destination, guide overworld travel, or
   escalate when the player is stuck.
2. Easy, normal, and hard values exist in `src/engine/settings.js`, but no
   gameplay module reads `difficultyMultipliers()`. Difficulty currently does
   nothing outside its unit test.
3. Deaths are counted, but lives do not exist. Every current mode allows
   infinite reconstitution into the current room.
4. Scar Shards already exist as currency. Combat soul motes pay one shard,
   fixed caches pay larger amounts, Reconstitution Altars spend shards, and
   three two-tier upgrades exist.
5. A top-ten score store already exists in `src/engine/settings.js`, but the
   campaign never calculates or submits a score.
6. The implemented item progression diverges from the Narrative Bible. Some
   Bible items are absent, some acquisition beats moved, the Magnetic Grapple
   is granted twice, and Beat 12 grants the Light Caster a second time. The
   shipped gate graph must become the authority or be deliberately realigned.

The recommended solution is one connected structure:

- The Anchor Thread guides the player through story, world reaction, and an
  optional Recall command.
- Easy, Medium, Hard, and Survival become immutable run modes saved with the
  campaign.
- Reconstitution Charges become the fiction and rule set for lives.
- Scar Shards remain spendable currency.
- Witness Score becomes a separate, non-spendable measure of play.
- New items borrow acquisition patterns from A Link to the Past without
  copying its names, art, or exact puzzles.

## 2. Current build truth

### 2.1 Narrative delivery

The build already has:

- A `StoryPanel` with queued speaker lines and timed advancement.
- Beat banners shown in the HUD.
- PREDECESSOR, SYSTEM, GUMOI, PHANTASM, and LEVIATHAN speaker identities.
- Room-specific dialogue about dungeon mechanics.
- Entrance proximity prompts in the overworld.
- A visited-screen map.

The build does not have:

- A persistent current story objective.
- A record of the last guidance line.
- A player-requested Recall command.
- Guidance from the current overworld screen toward the next unlocked dungeon.
- Stuck detection.
- Hint escalation.
- A distinction between destination guidance, puzzle guidance, and control
  instruction.
- A stable authored data source for narrative triggers.

The current story panel is a delivery surface. It is not yet a guidance
system.

### 2.2 Difficulty

`src/engine/settings.js` defines:

| Existing setting | Enemy HP | Enemy damage |
|---|---:|---:|
| easy | 0.70 | 0.70 |
| normal | 1.00 | 1.00 |
| hard | 1.30 | 1.25 |

No production caller imports `difficultyMultipliers()`. Enemy and boss
construction therefore use the same values on every setting. The settings UI
also does not expose difficulty. This is dormant scaffolding, not a working
feature.

### 2.3 Death and lives

The current death loop:

1. Detects zero health.
2. Plays the death presentation.
3. Increments the persisted death count.
4. Respawns the player in the current room or current overworld screen.
5. Fully restores the construct.

There is no life counter, no run failure, no expedition failure, and no
Survival slot. The present behavior is effectively infinite lives on every
setting.

### 2.4 Currency and upgrades

Scar Shards are already a working currency:

- `Inventory.addShards()` earns them.
- `Inventory.spendShards()` spends them.
- Enemy deaths release soul motes that pay one shard when collected.
- The authored overworld contains eight fixed caches worth 170 shards total.
- Authored dungeon caches contain approximately 620 additional shards.
- Reconstitution Altars open the upgrade menu.
- Inventory and purchased upgrades persist.

The existing upgrade catalogue is:

| Upgrade | Total cost | Result at maximum tier |
|---|---:|---|
| Edge | 200 | 50 percent additional weapon damage |
| Ghost-step | 170 | 0.20 seconds additional dash invulnerability |
| Long-arm | 140 | 6 additional grapple range |
| Total | 510 | All current upgrades |

The fixed authored caches alone can cover every existing upgrade and leave
roughly 280 shards, before repeatable enemy income. The economy therefore has
room for consumables and utility purchases, but prices and farming behavior
must be simulated before more permanent power is added.

The comment in `world/altar.js` says one altar per act. The actual campaign
currently places an altar in every beat. The implementation, not the stale
comment, is the present truth.

### 2.5 Points and score

`addScore()` and `getScores()` already persist a sorted top ten. No campaign
code calls `addScore()`. The run-complete screen displays time, deaths, bosses,
shards, and memory keys, but not a calculated score.

Points and currency must remain separate:

- Scar Shards are spendable and belong to campaign progression.
- Witness Score is non-spendable and measures the quality of a run.

Mixing them would encourage players to avoid useful purchases because buying
an upgrade would lower their leaderboard result. That is miserable design.

## 3. The Anchor Thread

### 3.1 Fiction

The Anchor Link contains a damaged procedural memory of its dead former owner.
It does not know the whole world. It remembers pressure, direction, sound,
pain, and unfinished obligations.

The guide is therefore not a fairy, satellite, quest arrow, or omniscient
narrator. It is a dead person remembering a road badly.

The Anchor Thread has three native voices:

| Voice | Function | Rule |
|---|---|---|
| PREDECESSOR | Direction, motive, interpretation, human cost | May be incomplete, never mechanically false |
| SYSTEM | Controls, state requirements, exact failure conditions | Short, literal, and reliable |
| GUMOI | Surveillance, pressure, mockery, late-game corruption | May manipulate emotion, never falsify a required input |

The rescued engineers add temporary voices during Act II. Each recovered core
contributes knowledge about the next region. The guide begins as one broken
voice, becomes a chorus, and is then invaded by GUMOI. Guidance itself becomes
story progression.

### 3.2 The three-layer objective

Every primary objective should contain three authored layers.

#### Layer 1: The wound

Why the player should care.

Example:

> Three memory keys open the monolith. The first is trapped inside the Eastern
> Spindle.

#### Layer 2: The pull

Where the player should go, expressed through a direction and landmark.

Example:

> The Link pulls northwest. Something enormous is still turning there.

#### Layer 3: The memory

The persistent Recall version containing destination, direction, and current
condition.

Example:

> Northwest. Follow the sound of stone gears. The Spindle rises beyond the
> tombfields.

This information must be available after the timed story panel disappears.

### 3.3 Player-facing delivery

The Anchor Thread should use five coordinated channels.

1. Story panel for new objectives and major revelations.
2. A one-sentence active Thread in the HUD beneath the beat name.
3. A Recall entry on the map that repeats the current objective and hint tier.
4. Gold pulses on plausible overworld exits when assistance escalates.
5. Audio leakage from the destination motif at a correct junction.

There should be no permanent world-space arrow. Assistance should point at the
next decision, not draw an uninterrupted line through exploration.

### 3.4 Guidance escalation

| Trigger | Response |
|---|---|
| Objective begins | Wound plus Pull |
| Correct region entered | Short confirmation |
| Required object approached | Contextual mechanical observation |
| No meaningful progress at threshold 1 | Environmental clue |
| No meaningful progress at threshold 2 | Direct predecessor hint |
| Repeated failed interaction | Precise SYSTEM instruction |
| Player selects Recall | Current objective and current hint tier |

Meaningful progress means any of the following:

- Entering a previously unvisited room or screen.
- Opening a persistent door.
- Acquiring a key, item, map, cache, or memory core.
- Activating a puzzle state.
- Advancing a boss phase.
- Defeating a required encounter.
- Reaching the correct destination region.

Walking in circles, pausing, menu time, and grinding respawned enemies must not
reset the stuck timer.

### 3.5 Hint tiers by mode

Difficulty may change when optional help appears. It must never hide the
one-time explanation of a required control.

| Mode | Automatic tier 1 | Automatic tier 2 | Recall |
|---|---:|---:|---|
| Easy | 30 seconds | 60 seconds | Full destination and mechanic |
| Medium | 60 seconds | 120 seconds | Full destination, contextual mechanic |
| Hard | None | None | Player-requested contextual hint |
| Survival | None | None | Player-requested destination only |

Accessibility settings remain independent. A player may use reduced motion,
reduced flashing, remapped input, or full text on any difficulty without score
penalty.

### 3.6 Overworld Thread sequence

The following is the recommended connective tissue between beats.

| After beat | Next pull |
|---|---|
| New game | “The Crypt is north. Something inside is still using my name.” |
| Crypt Breach | “The Link pulls northwest. Find the tower whose gears never stopped.” |
| Eastern Spindle | “The second key drowned south of here. The Sink still listens.” |
| Duval Sink | “White stone cuts the northeastern sky. The final key waits above it.” |
| Sky Monument | “Three keys answer far to the south. The Citadel has begun to notice us.” |
| Citadel of the Proxy | “The Crust is above us now. Seven minds remain buried in the Abyss.” |
| Bleeding Quarry | “The freed core hears water to the south. It calls the sound weeping.” |
| Sluice of Tears | “Roots scrape east through the floor. The Bone Forest is growing downward.” |
| Bone Forest | “The next voice is east. A town is pretending its people never left.” |
| Ruined Town | “Cold storage hums north. Something preserved there has learned to burn.” |
| Cryo Vault | “The fifth voice points southeast. The Mire is counting rainfall like pages.” |
| Rot Mire | “The last engineer burns north of us. Pyre Peak is writing in magma.” |
| Pyre Peak | “Seven voices aggregate. GUMOI has opened its Tower in the northwest.” |
| GUMOI Tower | “The Core is east. The Leviathan has nowhere left to fold.” |

Directions should be derived from authored world data rather than duplicated
inside dialogue logic. The line can be authored, but the map pulse should
calculate the next step across the screen graph.

### 3.7 Dungeon hint grammar

Every mechanic gets three lines.

Example for the Duval Sink:

| Tier | Line |
|---|---|
| Poetic | “The Spur listens beneath the dust.” |
| Contextual | “Keep to the high stone. It cannot strike what it cannot feel.” |
| Explicit | “SYSTEM: Remain on raised platforms while the Spur is submerged. Attack after it breaches.” |

Example for the Rot Mire:

| Tier | Line |
|---|---|
| Poetic | “The Mire rises on the tick. The dead shelves count with it.” |
| Contextual | “The Golem reforms while the vents keep feeding it.” |
| Explicit | “SYSTEM: Block every active vent, then strike the dried core.” |

The poetic line must still contain actionable information. Atmosphere that
communicates nothing is decoration, not guidance.

### 3.8 Persistence model

Add the following run state under `sovereignProgress`:

```js
thread: {
    objectiveId: 'reach_spindle',
    stage: 0,
    destinationBeat: 'beat-02-spindle',
    destinationScreen: 'r1c1',
    hintTier: 0,
    lastProgressAt: 0,
    failedActions: {},
    heard: [],
}
```

Authored thread definitions should live in one data module rather than being
scattered through fourteen level files. Level code emits semantic events such
as `item_acquired`, `room_entered`, `interaction_failed`, `boss_phase`, and
`beat_cleared`. The Thread system chooses the appropriate line.

## 4. Run modes that actually change play

### 4.1 Naming and save ownership

Expose four choices when beginning a new campaign:

- Easy
- Medium
- Hard
- Survival

Rename the existing internal `normal` label to `medium`, with a save migration
that maps old `normal` values to `medium`.

Run mode belongs to `sovereignProgress.runMode`, not global settings. It is
chosen at New Game and locked for that save. A player may copy a campaign into
a different mode, but changing a live Survival slot into Easy is forbidden.

Display the mode:

- On the New Game confirmation screen.
- On Continue.
- In the pause menu.
- In the HUD when Survival is active.
- On the run-complete and leaderboard screens.

### 4.2 Recommended gameplay matrix

The values below are initial tuning targets. They require automated checks and
human playtesting.

| Rule | Easy | Medium | Hard | Survival |
|---|---:|---:|---:|---:|
| Enemy HP | 0.70 | 1.00 | 1.20 | 1.10 |
| Boss HP | 0.75 | 1.00 | 1.15 | 1.10 |
| Enemy damage | 0.60 | 1.00 | 1.35 | 1.50 |
| Hostile action frequency | 0.75 | 1.00 | 1.20 | 1.25 |
| Projectile speed | 0.85 | 1.00 | 1.15 | 1.20 |
| Telegraph duration | 1.35 | 1.00 | 0.85 | 0.80 |
| Boss recovery duration | 1.40 | 1.00 | 0.80 | 0.75 |
| Heart drop chance | 1.80 | 1.00 | 0.65 | 0.50 |
| Environmental damage | 0.50 | 1.00 | 1.25 | 1.50 |
| Reconstitution Charges | Infinite | 5 per expedition | 3 per expedition | 1 for the campaign |
| Shards lost on ordinary death | 0 | 10 percent carried | 20 percent carried | Run ends |
| Score multiplier | 0.75 | 1.00 | 1.50 | 2.50 |

Do not turn Hard into a health-sponge mode. HP rises modestly. The greater
pressure comes from damage, timing, attack frequency, shorter recovery, and
resource loss.

### 4.3 Easy

Easy is the story mode.

- Infinite lives.
- Death restores the player in the current room.
- No shard loss.
- Faster automatic Anchor Thread escalation.
- Longer telegraphs and recovery windows.
- More recovery hearts.
- Lower enemy, boss, and environmental damage.
- Critical pickups emit a stronger visual and audio pulse.
- Locked objective prompts state the missing item by name.
- Boss phase dialogue may repeat after death.

Easy still requires the player to perform the mechanics. It does not solve
puzzles, remove bosses, or play the game by itself.

### 4.4 Medium

Medium is the intended first playthrough.

- Five Reconstitution Charges at the start of each dungeon expedition.
- Entering a new dungeon or resting at an altar refills the expedition to five.
- A death consumes one charge and respawns in the current room.
- Losing the fifth charge breaks the expedition and returns the player to the
  dungeon entrance or last altar.
- Persistent keys, items, opened doors, maps, caches, and defeated bosses stay
  saved.
- Ordinary enemies and temporary puzzle state reset after expedition failure.
- Ten percent of carried shards are left as a recoverable Echo at the death
  location.

This supplies consequence without erasing hours of campaign progress.

### 4.5 Hard

Hard is for players who already understand the combat grammar.

- Three Reconstitution Charges per dungeon expedition.
- The expedition breaks when all three are spent.
- Twenty percent of carried shards are left as a recoverable Echo.
- Faster hostile decisions, shorter telegraphs, and shorter boss openings.
- Less healing and more environmental damage.
- Automatic hints are disabled, but Recall remains available.
- Enemy placement may add authored elite variants. Do not randomly inflate
  every room.

Hard must be severe but legible. An unreadable attack is a bug, not difficulty.

### 4.6 Survival

Survival is a separate run format, not Hard with a scarier label.

- One life for the entire campaign.
- No reconstitution after lethal damage.
- Death writes the score result first, then seals the Survival save as dead.
- No Beat Select.
- No developer shortcuts while the run is score-eligible.
- Quitting is allowed and autosaves the exact run state.
- Reloading a living run is allowed.
- A dead run cannot be resumed.
- The leaderboard records completion state, beat reached, time, bosses,
  secrets, score, and a verification version.
- Healing items work normally.
- Automatic revival items are disabled or converted into immediate healing.
- Tutorials and accessibility features remain available.

The atomic order on lethal damage is essential:

1. Mark the slot dead.
2. Persist the final score payload.
3. Flush storage.
4. Begin the death presentation.

If presentation occurs before persistence, closing the page can resurrect a
dead run.

### 4.7 Reconstitution fiction

Lives should not be represented as little player heads. They are
Reconstitution Charges held by the Anchor Link.

Death lines can change as the reserve falls:

| Remaining | PREDECESSOR line |
|---:|---|
| 4 or more | “Again. I still remember enough of you.” |
| 2 or 3 | “The Link is losing detail. Stop making me rebuild your hands.” |
| 1 | “One clean memory remains.” |
| 0, expedition broken | “I can rebuild you, but not here. This place has eaten the route.” |
| Survival death | “I remember you. The world does not.” |

## 5. Witness Score

### 5.1 Purpose

Witness Score answers a different question from Scar Shards.

- Shards ask what the player can afford.
- Score asks what the player accomplished and how cleanly they did it.

Score is never spent. Purchases never reduce it.

### 5.2 Recommended scoring events

| Event | Base points |
|---|---:|
| Standard hostile defeated | 100 |
| Elite hostile defeated | 250 |
| First clear of a combat room | 500 |
| Secret cache discovered | 750 |
| Map memory recovered | 500 |
| Optional item acquired | 1,500 |
| Boss phase cleared without damage | 1,000 |
| Boss defeated | 5,000 |
| Beat cleared | 2,000 |
| Engineer core rescued | 2,500 |
| Campaign completed | 25,000 |

Apply the run-mode multiplier after summing an event. Display the multiplier
when a run begins and on the final result.

### 5.3 Combat chain

A small Witness Chain makes skilled play visible without turning the game into
an arcade cabinet.

- A valid hit or kill extends an eight-second chain.
- The multiplier rises from 1.0 to a maximum of 3.0.
- Taking damage resets the chain.
- Repeated attacks on invulnerable or shielded targets do not extend it.
- Environmental cheese against trapped enemies does not award a chain bonus.
- The chain affects points, never shard payout or damage.

### 5.4 Anti-farming rules

Enemies can respawn and continue paying shards, but score needs stable
integrity.

- Every authored encounter gets a stable encounter ID.
- Enemy score pays once per encounter generation.
- Reloading or leaving and returning does not repay first-clear points.
- Summoned boss adds pay no base points unless explicitly authored.
- A score version is stored with every leaderboard entry.
- Any balance change that affects score increments the score version.
- Developer mode makes the run ineligible and visibly marks it unranked.

### 5.5 Final score payload

Extend the existing score entry with:

```js
{
    score: 84250,
    runMode: 'survival',
    completed: false,
    beatReached: 'beat-09-town',
    bosses: 8,
    secrets: 19,
    deaths: 1,
    playTime: 9284,
    scoreVersion: 1,
    date: '2026-07-19',
}
```

The score store should retain separate top-ten boards for Medium, Hard, and
Survival. Easy results can be recorded locally but should not compete with
other modes because its assistance and combat curve are deliberately
different.

## 6. Scar Shard economy

### 6.1 Currency identity

Scar Shards are fragments of world-state that the player carries back to a
Reconstitution Altar. An altar spends them by rewriting a small part of the
construct.

That fiction already fits the name, visual language, and upgrade menu.

### 6.2 Income

Keep these income types:

- One-shard soul motes from combat.
- Larger fixed caches for exploration.
- First-clear rewards for optional rooms.
- Boss and engineer-core rewards.
- Small challenge rewards for races, no-hit rooms, and mirror-state puzzles.

Fixed rewards should dominate progression. Repeatable combat income should let
a struggling player finish a purchase, not make running one room for an hour
the optimal economy.

Recommended anti-grind curve:

- First clear of an encounter pays full soul motes plus a room bonus.
- Repeat clears pay normal one-shard motes but no room bonus.
- Easy may receive a 1.25 shard income multiplier rounded through a fractional
  accumulator.
- Hard and Survival use the same shard income as Medium. Difficulty score
  multipliers are enough reward.

### 6.3 Permanent purchases

Retain the current upgrades and add utility before adding more raw damage.

| Purchase | Tiers | Suggested costs | Effect |
|---|---:|---|---|
| Edge | 2 | 60, 140 | Existing weapon damage upgrade |
| Ghost-step | 2 | 50, 120 | Existing dash invulnerability upgrade |
| Long-arm | 2 | 40, 100 | Existing grapple range upgrade |
| Shard Magnet | 2 | 35, 90 | Increases soul-mote attraction radius |
| Anchor Reservoir | 2 | 70, 160 | Adds one Memory Vial slot per tier |
| Kintsugi Shell | 2 | 90, 200 | Reduces environmental damage by 15 percent per tier |
| Echo Lens | 1 | 80 | Reveals nearby optional memory seams on the map |

Do not stack another large universal damage multiplier on top of Edge. It
would erase boss timing and make difficulty impossible to tune.

### 6.4 Consumable purchases

| Purchase | Suggested cost | Rule |
|---|---:|---|
| Full repair | 20 | Restore health at an altar |
| Vial refill | 25 | Fill one owned Memory Vial with healing |
| Resonance Charge | 12 | One consumable blast for optional cracked seams |
| Secret rumor | 10 | Reveal one optional cache disturbance in the current region |
| Reconstitution Charge | 60 Medium, 90 Hard | Restore one expedition charge up to mode maximum |

Primary story direction and required control hints are always free. Charging
currency for basic navigation would punish the exact player who needs help.

Survival cannot purchase a Reconstitution Charge. Its one-life contract is the
mode.

### 6.5 Banking and death loss

To make death loss fair, distinguish carried shards from banked shards.

- Spending and banking occur at Reconstitution Altars.
- Purchases may draw from banked shards.
- Death loss applies only to carried shards.
- A recoverable Echo holds the lost amount at the death location.
- Dying again before recovery destroys the old Echo on Hard.
- Medium keeps one outstanding Echo and replaces it only when the new loss is
  greater.
- Easy never drops shards.

This creates danger without making the player regret buying things.

## 7. Item acquisition lessons from A Link to the Past

The useful inheritance is not a list of famous nouns. It is a set of
acquisition patterns.

### 7.1 What A Link to the Past does well

1. A major dungeon item is found before the dungeon finishes, then the same
   dungeon immediately teaches it.
2. Some items are rewards for completing a prior objective, such as the
   Pegasus Boots after the Eastern Palace pendant.
3. Some are paid overworld investments, such as the Flippers.
4. Some come from kindness or escort, such as the Magic Mirror after guiding
   the Lost Old Man.
5. Some require a short dependency chain, such as Shovel to buried Flute to
   activated fast travel.
6. Some are optional but transformative, such as armor, bottles, and the Cane
   of Byrna.
7. Equipment upgrades are stories. Reuniting smiths and finding a hidden fairy
   are more memorable than clicking Damage Tier 2.
8. Four Heart Pieces make exploration accumulate into permanent survivability.

### 7.2 Pattern translation table

| A Link to the Past reference | How it is obtained | Design lesson | Sovereign Scar translation |
|---|---|---|---|
| Fighter's Sword | Received from Link's uncle during the castle rescue | Put the first verb inside the opening relationship | Anchor Link salvaged from the predecessor |
| Master Sword | Claimed after obtaining three pendants | A major weapon can embody an act objective | Tectonic Wedge answers the three Memory Keys |
| Pegasus Boots | Rewarded after the Eastern Palace objective | A reward can reopen old routes instead of merely raising damage | Phase Boot exposes cracked dash seams across the overworld |
| Power Glove and Titan's Mitt | Dungeon items, with the later item upgrading the same world verb | Upgrade a learned verb rather than adding redundant controls | Tectonic Glove then Heavy Mallet manipulation tiers |
| Hookshot | Found inside Swamp Palace and immediately used on gaps | Teach an item in the room where it is earned | Magnetic Grapple test peg, safe gap, moving target, then real hazard |
| Magic Mirror | Reward for escorting the Lost Old Man | Kindness and navigation can earn a world-scale verb | Escort a damaged engineer echo to unlock controlled mirror travel |
| Moon Pearl | Found in the Tower of Hera before sustained Dark World travel | Give the player protection before changing world rules | Phase Seal stabilizes the construct during involuntary Crust and Abyss shifts |
| Flippers | Purchased for 500 Rupees after reaching Zora's domain | A costly optional investment can open broad traversal | Buoyancy Mesh purchased with shards opens deep-fluid routes and caches |
| Bottles | Four copies earned through purchase, secret access, traversal, and a chained chest task | One utility item can support several acquisition stories | Four Memory Vials earned four different ways |
| Book of Mudora | Retrieved from a library shelf using the Pegasus Boots | Let an older item unlock knowledge, not only loot | Cipher Lens reached with the Phase Boot translates scar inscriptions and secret routes |
| Magic Powder | Mushroom found, delivered to a witch, then collected after returning | Short trade chains make the overworld feel inhabited | Entropy Spores delivered to a freed engineer become transformative Dust |
| Flute | Shovel received from a character, buried Flute found, then activated at the village vane | A two-step side story can unlock fast travel | Resonance Fork recovered from a buried signal and activated at GUMOI relay ruins |
| Cane of Somaria | Found in Misery Mire, then becomes critical in Turtle Rock | Seed the next dungeon's grammar before it becomes mandatory | Vector Staff learned before Pyre's largest light-line crossings |
| Heart Pieces | Four pieces form a permanent Heart Container | Small secrets can accumulate into meaningful durability | Four Scar Sutures form one permanent heart |
| Tempered and Golden Swords | Smith reunion and hidden fairy transformation | Put upgrade tiers behind character stories | Freed engineers reforge the Anchor Link at specific altars |
| Blue and Red Mail | Optional dungeon treasures that reduce damage | Optional defense is valuable without blocking completion | Kintsugi Shell layers hidden in Cryo and GUMOI challenge rooms |

### 7.3 Recommended new Sovereign Scar items

#### Memory Vials

Function:

- Store one full repair, cleansing pulse, or temporary damage ward.
- Easy may auto-use a healing vial at zero HP before death.
- Medium and Hard require manual use or may offer an accessibility toggle for
  automatic use.
- Survival converts any auto-revive content into healing before lethal damage.
  Nothing revives the player after death.

Four acquisition stories:

1. Purchase one from an Abyss scavenger.
2. Find one behind a cracked Crypt wall.
3. Earn one by escorting an engineer echo through a mirror-state route.
4. Recover one from a locked chest that must be carried to a GUMOI indexer.

#### Cipher Lens

Function:

- Translates scar inscriptions.
- Reveals optional history and precise landmark names.
- Converts some vague Anchor Thread lines into clearer memories.
- Opens lore chambers and shortcuts, never the only route to the main story.

Acquisition:

- Visible early in an archive.
- Reachable only after returning with the Phase Boot.

#### Resonance Fork

Function:

- Fast travel among activated Reconstitution Altars.
- Replays the destination motif for the active Anchor Thread.
- Can wake a few optional memory constructs.

Acquisition:

- Receive a Buried Frequency from an engineer core.
- Locate it through a small overworld sound puzzle.
- Activate the recovered Fork at a broken weather relay.

Fast travel should unlock after the player has crossed enough of the map to
understand its scale, approximately after Beat 6 or Beat 7.

#### Scar Sutures

Function:

- Four Sutures create one permanent heart.
- Place sixteen in the world for four optional hearts.
- Keep the existing boss-heart progression, but cap total health after both
  systems are combined.

Acquisition variety:

- Item-gated overworld secrets.
- Mirror-state spatial puzzles.
- Short timed routes.
- Optional dungeon rooms.
- NPC or engineer memory tasks.

#### Reflector Plate

Function:

- Facing-based passive defense against weak projectiles.
- A later Kintsugi upgrade reflects beam attacks.
- Supports spatial puzzles without adding another active button.

Acquisition:

- Optional challenge chest in the Cryo Vault.

#### Entropy Dust

Function:

- Temporarily converts selected enemies, plants, or corrupted terminals.
- Creates surprising alternate solutions and recovery drops.
- Uses a limited charge refilled at altars.

Acquisition:

- Find an unstable spore in the Bone Forest.
- Deliver it to a rescued systems engineer.
- Return after one beat for the refined Dust.

#### Buoyancy Mesh

Function:

- Opens deep-fluid travel and reduces Mire sinking.
- Provides optional shortcuts, caches, and one Memory Vial.
- Does not replace the Gravity Boots if that Bible item is restored.

Acquisition:

- Expensive shard purchase in the Sluice region.
- The player can see valuable deep-fluid routes before deciding to buy it.

### 7.4 Current item continuity problem

The Narrative Bible currently states:

| Beat | Bible item |
|---|---|
| 02 | Light Caster |
| 03 | Tectonic Glove |
| 04 | Phase Boot |
| 05 | Tectonic Wedge |
| 06 | Heavy Mallet |
| 07 | Magnetic Grapple |
| 08 | Thermal Torch |
| 09 | Distortion Cloak |
| 10 | Heat Core |
| 11 | Gravity Boots |
| 12 | Vector Staff |

The current runtime grants:

| Beat | Runtime grant |
|---|---|
| 02 | Light Caster |
| 03 | Phase Boot |
| 04 | Magnetic Grapple |
| 05 | Tectonic Wedge |
| 06 | Heavy Mallet |
| 07 | Magnetic Grapple again |
| 08 | No new inventory item |
| 09 | No new inventory item |
| 10 | No new inventory item |
| 11 | No new inventory item |
| 12 | Vector Staff and Light Caster again |

This must be resolved before the Anchor Thread narrates acquisitions. Two safe
options exist:

1. Runtime-authoritative option. Update the Bible to match the implemented
   gate graph, remove duplicate grants, and explain upgraded versions through
   story.
2. Bible-authoritative option. Restore the intended item sequence, then rebuild
   every affected dungeon and overworld blocker around the corrected graph.

Recommendation: make the runtime graph authoritative for the next playtest,
remove or reinterpret duplicate grants, and schedule the six absent Bible
items as later content. A large item shuffle immediately before testing would
create progression breakage for little short-term value.

Possible reinterpretations:

- Beat 04 grants the Magnetic Grapple chassis.
- Beat 07 grants the Deep-Pull Coil upgrade rather than the same Grapple again.
- Beat 12 upgrades the existing Light Caster into a Line Caster while granting
  the Vector Staff.

This preserves current geometry while making the rewards honest.

## 8. Narrative integration of modes and economy

These systems should speak the same language.

### 8.1 Mode selection scene

Do not present a sterile list of damage percentages first. Let the Anchor Link
ask how tightly it should preserve the construct.

| Mode | Story framing |
|---|---|
| Easy | “Hold every version of me. Do not let the story end because the body fails.” |
| Medium | “Keep five clean memories. Enough mercy to learn. Enough loss to matter.” |
| Hard | “Three reconstructions. Preserve only what survives contact.” |
| Survival | “One body. One memory. No second draft.” |

The confirmation screen then states the exact mechanical rules in plain text.
Poetry never replaces informed consent for a one-life mode.

### 8.2 The altar as character

Reconstitution Altars should not be silent vending machines. Each altar stores
a fragment of an engineer or predecessor memory.

First visit:

> The altar recognizes the Link. It does not recognize you.

Purchase:

> Rewrite accepted. Scar mass reduced. The hand remembers a sharper edge.

Insufficient shards:

> Not enough of the world is loose yet.

Hard-mode charge purchase:

> You are buying another death before it happens.

### 8.3 Score as GUMOI surveillance

Witness Score exists because GUMOI indexes action.

- Early in the game the number is labelled Index Trace.
- In Act II the predecessor realizes the world is measuring the player.
- In Act III GUMOI speaks the score aloud at thresholds.
- After completion the player reclaims the index and it becomes Witness Score.

This makes an abstract score counter belong to the fiction.

GUMOI bark examples:

> Efficient violence. Filed without admiration.

> No damage recorded. Do not mistake cleanliness for innocence.

> Chain broken. The index prefers honest failure.

Score barks must be sparse and separately mutable. They cannot bury combat
audio or critical guidance.

## 9. Implementation map

### 9.1 New modules

| Module | Responsibility |
|---|---|
| `src/game/narrative/thread-data.js` | Authored objectives, lines, triggers, destinations, hint tiers |
| `src/game/narrative/anchor-thread.js` | Active objective state, event handling, stuck detection, Recall |
| `src/game/kernel/run-mode.js` | Immutable mode definitions and scalar accessors |
| `src/game/kernel/lives.js` | Reconstitution Charges, expedition failure, Survival death |
| `src/game/kernel/score.js` | Event ledger, chain, finalization, eligibility, versioning |
| `src/game/world/death-echo.js` | Recoverable carried-shard loss |
| `src/game/kernel/consumables.js` | Vials, charges, and altar consumable rules |

### 9.2 Existing modules to change

| File | Required change |
|---|---|
| `src/game/kernel/progress.js` | Save version migration, run mode, Thread state, lives, score ledger, banked shards |
| `src/engine/settings.js` | Remove run difficulty ownership, extend score schema and boards |
| `src/game/index.js` | Construct mode services, route semantic events, replace unconditional respawn, submit score |
| `src/game/ui/menu.js` | New Game mode selection, Recall screen, score boards, economy details |
| `src/game/ui/hud.js` | Active Thread, lives, score chain, carried and banked shard presentation |
| `src/game/ui/map-screen.js` | Recall command and approximate destination disturbance |
| `src/game/ui/story.js` | Priority queues so critical guidance is not overwritten by flavor barks |
| `src/game/enemy.js` | Apply mode HP, damage, cadence, and projectile scalars |
| `src/game/bosses/base.js` | Apply boss HP, timing, recovery, and scoring events |
| `src/game/world/heart-drops.js` | Apply mode drop scalar |
| `src/game/world/altar.js` | Banking, consumables, charge refill, altar memory |
| `src/game/overworld/overworld.js` | Destination routing pulse and correct-region events |
| Beat level modules | Emit semantic events, remove duplicate item grants, authored hint hooks |

### 9.3 Story queue priority

Add three priorities:

| Priority | Content |
|---|---|
| Critical | New objective, required control, Survival warning |
| Context | Puzzle hint, destination confirmation, boss phase advice |
| Flavor | GUMOI score bark, environmental memory, optional lore |

Critical lines may replace flavor. Flavor never replaces critical or context.
A queued line needs a stable ID so it cannot repeat every frame.

### 9.4 Mode scalar application

Mode values should be consumed at the narrowest owning system:

- Enemy constructor owns initial HP.
- Enemy attack resolution owns damage.
- AI cooldown generation owns action frequency.
- Projectile creation owns speed.
- Telegraph creation owns duration.
- Boss recovery state owns recovery duration.
- HeartDropManager owns drop chance.
- Hazard modules own environmental damage.

Do not take one giant `dt` multiplier to speed up Hard. That would also alter
animation, collision, particles, fluid timing, story timers, and camera motion.

## 10. Delivery order

### Phase N0: Lock the truth

1. Choose runtime-authoritative or Bible-authoritative item progression.
2. Rename normal to Medium.
3. Define whether existing saves default to Medium. Recommendation: yes.
4. Define score version 1.
5. Define Survival save behavior and show it before confirmation.

### Phase N1: Anchor Thread foundation

1. Add persistent Thread state.
2. Add semantic narrative events.
3. Add active HUD objective.
4. Add Recall to the map.
5. Author the fourteen overworld pulls.
6. Add story queue priority.

### Phase N2: Real modes

1. Add immutable run mode to save creation.
2. Apply combat, boss, timing, healing, and hazard scalars.
3. Expose exact rules in the UI.
4. Add tests proving the modes create measurably different encounters.

### Phase N3: Lives and Survival

1. Add Reconstitution Charges.
2. Add expedition failure for Medium and Hard.
3. Keep infinite current-room reconstitution on Easy.
4. Add atomic one-life failure for Survival.
5. Disable Beat Select and developer eligibility in Survival.

### Phase N4: Score and economy

1. Wire score events into existing kill, room, boss, secret, and completion
   events.
2. Add separate boards by mode.
3. Add shard banking and Death Echoes.
4. Expand altar purchases with utility and consumables.
5. Simulate total income and required spending.

### Phase N5: Item expansion

1. Remove or reinterpret duplicate item grants.
2. Add Memory Vials.
3. Add Scar Sutures.
4. Add Cipher Lens and Resonance Fork side stories.
5. Add optional defensive equipment.
6. Only then consider restoring the absent Bible items.

## 11. Research sources checked 2026-07-19

The research below was used for acquisition structure, not copied content.

- [Zelda Dungeon, A Link to the Past Items](https://www.zeldadungeon.net/wiki/index.php?mobileaction=toggle_view_desktop&title=A_Link_to_the_Past_Items)
  covers the major item list, acquisition locations, the three-pendant Master
  Sword requirement, the Pegasus Boots reward, dungeon equipment, Magic
  Mirror, Moon Pearl, and Flippers.
- [StrategyWiki, A Link to the Past Items](https://strategywiki.org/wiki/The_Legend_of_Zelda%3A_A_Link_to_the_Past/Items)
  provides a compact location and function cross-check for equipment,
  selectable items, and continuous items.
- [Zelda Dungeon, A Link to the Past Bottles](https://www.zeldadungeon.net/wiki/A_Link_to_the_Past_Bottles)
  documents the four distinct bottle acquisition methods and their storage
  role.
- [Zelda Dungeon, A Link to the Past Upgrades](https://www.zeldadungeon.net/wiki/A_Link_to_the_Past_Upgrades)
  documents sword, shield, armor, capacity, glove, and fairy-fountain upgrade
  patterns.
- [Zelda Dungeon, A Link to the Past Heart Pieces](https://www.zeldadungeon.net/wiki/index.php?title=A_Link_to_the_Past_Heart_Pieces)
  documents the twenty-four overworld pieces and the four-piece health upgrade
  structure.
- [Zelda Dungeon, Lost Old Man](https://www.zeldadungeon.net/wiki/Lost_Old_Man)
  documents the escort through Death Mountain and Magic Mirror reward.
- [Zelda Wiki, Magic Powder](https://zeldawiki.wiki/wiki/Magic_Powder)
  documents the Mushroom delivery and return-trip acquisition chain.
- [Zelda Dungeon, Cane of Somaria](https://www.zeldadungeon.net/wiki/index.php?mobileaction=toggle_view_desktop&section=0&title=Cane_of_Somaria)
  documents its Misery Mire acquisition and later block and traversal uses.
- [Zelda Dungeon, Flippers](https://www.zeldadungeon.net/wiki/index.php?mobileaction=toggle_view_desktop&title=Flippers)
  documents the 500-Rupee purchase and deep-water traversal unlock.
- [Zelda Dungeon, Flute](https://www.zeldadungeon.net/wiki/Flute)
  documents the Haunted Grove item and activated fast-travel function.

## 12. Verification requirements

### 12.1 Narrative

- Every main objective can be recovered after its timed dialogue expires.
- Every unlocked beat has a valid overworld route from the current screen.
- Recall never names a locked or already completed destination incorrectly.
- Critical guidance cannot be displaced by flavor dialogue.
- Stuck timers ignore pause and menu time.
- Hint lines do not repeat after their stable ID is recorded.

### 12.2 Modes

- An identical enemy has different measured HP and damage on all four modes.
- Attack cadence, projectile speed, telegraph duration, and recovery duration
  match the mode table within deterministic test tolerances.
- Accessibility toggles do not change score eligibility.
- Old `normal` saves migrate to `medium`.
- A run cannot change mode after creation.

### 12.3 Lives

- Easy can die repeatedly without exhausting lives or losing shards.
- Medium begins each expedition with five charges.
- Hard begins each expedition with three charges.
- Expedition failure preserves persistent campaign state and resets temporary
  room state.
- Survival death seals the save before the death presentation begins.
- Closing and reopening during a Survival death cannot restore the player.
- Survival completion writes one eligible score entry.

### 12.4 Score

- Re-entering a cleared room cannot repay first-clear points.
- Summoned adds cannot inflate score.
- Purchases do not lower score.
- Developer mode marks the run unranked.
- Boards sort correctly within each mode and score version.
- The final screen reconciles the event ledger with the displayed total.

### 12.5 Economy

- Every purchase is persisted immediately.
- Death loss applies only to carried shards.
- Echo recovery restores the exact persisted amount once.
- Survival cannot buy lives.
- The campaign guarantees enough fixed shard income for at least two meaningful
  permanent purchases without grinding.
- No required item or primary story hint can become unaffordable.

## 13. Final recommendation

Build the Anchor Thread first. It solves the immediate player-guidance problem
and creates the event vocabulary needed by modes, score, economy, and items.

Then make difficulty real before adding Survival. Survival cannot be balanced
against a difficulty system that currently does nothing.

Keep Scar Shards as currency. Wake up the existing score store as Witness
Score. Never merge the two.

Finally, add fewer items with better acquisition stories. A bought item, an
escort reward, a four-part collectible, a transformed found object, and a
dungeon tool each feel different even when they share the same inventory
screen. That variety is the lesson worth taking from A Link to the Past.

The guiding principle is simple:

> Every instruction should reveal the world. Every reward should remember how
> the player earned it.

## 14. Corrected implementation result

The major runtime systems were implemented in the 2026-07-19 worktree, but
the audit is **not fully implemented**. The gaps in section 0 remain open.

- Save version 3 owns an immutable campaign run mode, Reconstitution state,
  Anchor Thread state, Witness Score ledger, banked shards, Death Echo, run ID,
  and sealed or completed status. Old `normal` campaigns migrate to Medium.
- The New Game flow exposes Easy, Medium, Hard, and Survival with their real
  health, damage, life, and shard-loss rules before selection.
- Enemy and boss health, incoming damage, hostile cadence, projectile speed,
  telegraph time, recovery time, healing chance, environmental damage, hint
  timing, shard risk, and score multiplier now consume the selected mode.
- Easy retains infinite reconstitution and loses no shards. Medium uses five
  charges. Hard uses three. Survival uses one campaign life and writes its
  sealed save plus final score payload before showing the death presentation.
- The Anchor Thread now supplies fourteen persistent objectives through the
  HUD, mode-aware automatic escalation, player-requested map Recall, precise
  repeated-failure instructions, map disturbance, graph-routed exit pulses,
  and destination motif leakage. Critical guidance preempts flavor dialogue.
- Witness Score now records stable one-time combat, room, secret, map, boss,
  beat, engineer, flawless-phase, and completion events. Valid hits and kills
  build an eight-second chain, damage clears it, purchases never reduce it,
  developer use marks it unranked, and mode plus score version own separate
  top-ten boards.
- Altars now bank carried shards, refill expedition and Entropy reserves, sell
  repairs, Vial refills, Reconstitution Charges where legal, permanent
  upgrades, and the Buoyancy Mesh. Medium and Hard deaths can leave a
  recoverable one-use Death Echo holding the exact carried-shard loss.
- Fixed pickups persist immediately. The world contains four reachable Memory
  Vial chassis. The automatic Suture hook currently reaches fourteen authored
  cache pickups, not sixteen, so it supports three complete optional hearts
  plus two spare Sutures rather than the promised four hearts.
- The Cipher Lens clarifies Recall, the Resonance Fork enables travel among
  activated altars and replays the destination motif, the Reflector Plate
  blocks faced weak projectiles, Entropy Dust converts nearby ordinary threats
  into repair mass with altar-refilled charges, and the Buoyancy Mesh removes
  Mire sludge drag.
- Beat 07 now grants the Deep-Pull Coil instead of a duplicate Magnetic
  Grapple. Beat 12 grants the Line Caster upgrade instead of a duplicate Light
  Caster. The working progression graph therefore remains intact while its
  rewards tell the truth.

Historical verification recorded on 2026-07-19:

- 653 of 653 unit assertions were reported after the final completion checks.
- 1243 of 1243 full-suite assertions were reported before the final two pure
  unit assertions were added.
- The focused Survival browser contract passes 9 of 9 checks, including a
  page reload proving a sealed one-life run cannot resurrect or duplicate its
  score.
- `git diff --check` reports no patch whitespace errors.

Independent verification on 2026-07-20:

- 669 of 669 unit assertions pass.
- The complete runner passes 1257 of 1267 and therefore fails overall.
- The focused Survival browser contract still passes all 9 checks.
- `git diff --check` reports no patch whitespace errors.
