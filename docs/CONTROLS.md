# Sovereign Scar — Controls

| Input | Action |
|---|---|
| **W A S D** / Arrows | Move (8-way) — you always face the way you walk |
| **Space** / **J** | Attack (active weapon) |
| **Shift** / **K** | Dash — grants ~0.3s of invulnerability (full distance with the Phase Boot) |
| **Q** / **R** | Cycle weapon |
| **E** / **F** | Interact (altars, dungeon entrances, monoliths) |
| **G** | Magnetic Grapple at anchors (when owned) |
| **Tab** | World / dungeon map |
| **M** | Mirror travel (after the Proxy falls; otherwise inert) |
| **[** / **]** or PageUp/PageDown | Previous / next unlocked beat |
| **N** | Mute |
| **P** / **Esc** | Pause |
| **Enter** | Advance / skip story line |

The mouse does not control the game. Facing follows movement (A Link to the
Past style), so attacking while standing still swings in the direction you
last walked.

## Combat

Every enemy attack winds up before it lands: the enemy stops, a ring marks the
ground it is about to strike, and damage is resolved only when that ring
expires — against where you are *then*. Walk out of the ring or dash through it
and the blow whiffs. Slain enemies drop hearts, more often when you are hurt.

Gamepad (standard mapping): left stick move, right stick aim, **A** attack,
**B** dash, **X** interact, **Y** grapple, **LB/RB** weapon, **Select** map,
**D-up** mirror travel, **LT** mute, **Start** pause.

A stick that is already off-centre when the pad connects (held, drifting, or
stuck) is ignored until it has been seen at rest once — otherwise it would pin
movement in one direction and override the keyboard. The HUD says so when it
happens; recentre the stick to enable it.

## HUD

- **Top-left**: beat name, hearts, weapon, memory keys, shards, mood — plus
  small-key count and BOSS KEY while inside a dungeon
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
| **F2** | Defeat the current boss (fires the real defeat path) |
| **F3** | Force the boss's next phase |
| **`** / **F10** | Dev panel: teleport, grants, unlocks, reset |
| **H** | Hide all HUD chrome (clean captures) |
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
