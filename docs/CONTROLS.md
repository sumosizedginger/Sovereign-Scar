# Sovereign Scar — Controls

This table is the same data the game draws in the corner of the screen: both
are generated from `CONTROLS` in `src/game/input.js`, and
`tests/game/controls.spec.mjs` reads the input handler's own source and fails if
a key it responds to is missing from either. They used to be three separate
hand-written lists that disagreed — the on-screen sheet never mentioned guard
or lock-on, and this file never mentioned the Vial or the Dust.

| Input | Action |
|---|---|
| **W A S D** / Arrows | Move + face (8-way) — you face the way you walk unless locked on |
| **Space** / **J** | Attack (active weapon) |
| **Shift** / **K** | Dash — grants ~0.3s of invulnerability (full distance with the Phase Boot) |
| **Right mouse** / **L** | **Guard** — hold to block, tap to parry. Needs the Bulwark Shield |
| **T** | **Lock on** — toggle the nearest target |
| **Y** | Switch target while locked on |
| **Q** / **R** | Cycle weapon |
| **E** / **F** | Interact (altars, dungeon entrances, monoliths) |
| **G** | Grapple at anchors (Magnetic Grapple, when owned) |
| **V** | Memory Vial — heal, if you are carrying one |
| **C** | Entropy Dust — consumable, if you are carrying one |
| **Tab** | World / dungeon map |
| **M** | Mirror travel (after the Proxy falls; otherwise inert) |
| **[** / **]** or PageUp/PageDown | Previous / next beat (unlocked ones only) |
| **N** | Mute |
| **P** / **Esc** | Pause |
| **Enter** | Advance story (skip the current line) |

Facing follows movement (A Link to the Past style), so attacking while standing
still swings in the direction you last walked — unless you are locked on, in
which case you keep facing the target and movement becomes a strafe.

## Combat

Every enemy attack winds up before it lands: the enemy stops, a ring marks the
ground it is about to strike, and damage is resolved only when that ring
expires — against where you are *then*. Walk out of the ring or dash through it
and the blow whiffs. Slain enemies drop hearts, more often when you are hurt.

### Guard and parry

**You have to find the shield first.** The Bulwark Shield lies on the
predecessor's body partway through the Crypt Breach, and until you pick it up
the guard button does nothing. That is deliberate: Beat 01 exists to teach you
to read a wind-up, and a player who can block from the first frame answers every
telegraph by holding a button and never learns to read one. The two rooms before
the shield hold one enemy each and are meant to be dodged.

Holding guard raises a **120° frontal** block and slows you to 45% speed. A
blocked hit costs 25% of its damage instead of all of it. It does not protect
against anything with no direction to it — a pit does not care that you have a
shield up.

**Tapping** guard opens a **0.18 s parry window** on the way up. A parry inside
that window negates the hit entirely and staggers the attacker. Poise is the
budget: three points, spent by blocking, refilled quickly when you are not
guarding and slowly when you are. Run out and your guard breaks, which stuns you
for ~0.9 s and is the worst thing that can happen to you in a fight.

One rule covers every hard-to-hit enemy:

> **A parry undoes whatever makes an enemy hard to hit.**

A bulwark drops its front plate; a hovering mote drops out of the air. That is
one thing to learn rather than seven, and it means no enemy can become
unkillable because you skipped the item that was "meant" to answer it.

### Lock-on

Locking on decouples where you face from where you walk, which is what makes
circling possible. It is how you get behind a **bulwark**: its front plate
refuses melee outright, it turns at a finite rate, and about a second of
committed strafing opens its back. Targets are scored by distance with a mild
bias toward whatever you are already facing — something behind you only wins if
it is less than half as far. The lock breaks on its own at 24 units.

Gamepad (standard mapping): left stick move, right stick aim, **A** attack,
**B** dash, **X** interact, **Y** grapple, **LB/RB** weapon, **LT** lock on,
**RT** guard, **L3** cycle target, **Select** map, **D-up** mirror travel,
**Start** pause. Mute is keyboard-only (**N**) — it gave up its trigger slot to
the defensive verbs, because it is a settings toggle, not something you reach
for mid-fight.

A stick that is already off-centre when the pad connects (held, drifting, or
stuck) is ignored until it has been seen at rest once — otherwise it would pin
movement in one direction and override the keyboard. The HUD says so when it
happens; recentre the stick to enable it.

## Sound and music

The score is generated, not streamed — there are no audio files. Each dungeon
and overworld region is a composition in its own key, mode and tempo, and the
music **layers up** rather than switching when a fight starts: exploring gives
you chords, bass, arpeggio and melody; enemies nearby and combat add percussion
and weight; a boss adds everything.

Nothing hums underneath it. Chords are struck on a rhythm and stop before the
next one arrives, so there is silence in every bar for the tune to sit in — an
earlier build held them through the bar and ran a sustained oscillator under the
whole game, which is a drone with a soundtrack on top of it.

Sound tells you what happened, so most of combat is readable with your eyes
shut:

| you hear | it means |
|---|---|
| a dull wooden thud | you guarded, and took chip damage |
| a bright metal ring resolving upward | **you parried** — the attacker is staggered |
| a hard double clang | you hit a plate; that side is armoured |
| a low crunch | you wounded something |
| a short descending figure | you killed it |
| a heartbeat | you are at or below a quarter health |

Each weapon swings with its own weight, so you can hear which one is equipped.
Pickups sound like what they are — a shard, a key, a heart piece, a secret and
a real item are five different sounds.

## HUD

- **Top-left**: beat name, hearts, weapon, memory keys, shards, mood — plus
  small-key count and BOSS KEY while inside a dungeon, and the guard poise pips
  + parry counter once you have been in a fight
- **Around a locked-on target**: a flat gold ground ring with four counter-
  rotating ticks, drawn over everything so it is never lost behind geometry
- **Top-center**: boss name + HP bar + phase (ARMORED / PHASED when relevant),
  shown when the fight is near
- **Bottom-center**: story dialogue (speaker + text) and transient toasts
- **Bottom-right**: control cheat sheet

## Dev mode (Phase D)

Enable with `?dev=1` or **Ctrl+Shift+D** (persists in settings). Amber `DEV`
badge shows bottom-left.

| Input | Action |
|---|---|
| **F1** | God mode (**Shift+F1**: one-hit kills) |
| **F2** | Defeat current boss (fires the real defeat path) |
| **F3** | Force boss's next phase |
| **`** / **F10** | Dev panel: teleport, grants, unlocks, reset |
| **H** | Hide HUD chrome (clean captures) |
| **M** | Mood flip (dev only, outside the overworld) |
| **]** | Force-skip beat locks |

## Debug hooks

```js
__sovereignScar.loadLevel('beat-14-leviathan')
__sovereignScar.player.inventory.grantItem('heavy_mallet')
__sovereignScar.mood.setMusicProfile('boss')
__sovereignScar.game.activeBoss     // live boss entity
__sovereignScar.measure()           // player/mob/boss heights + grounding
__sovereignScar.sampleLuminance()   // avg frame luminance (Promise)
__sovereignScar.dev                 // dev-mode singleton
__sovereignScar.save()
```
