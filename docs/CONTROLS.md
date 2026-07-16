# Sovereign Scar — Controls

| Input | Action |
|---|---|
| **W A S D** / Arrows | Move (8-way) |
| **Mouse** | Aim facing |
| **LMB** / **Space** / **J** | Attack (active weapon) |
| **Shift** / **K** | Phase Boot dash |
| **Q** / **R** | Cycle weapon |
| **E** / **F** | Interact / push block |
| **G** | Magnetic Grapple (when owned) |
| **M** | Toggle Crust ↔ Abyss mood |
| **[** / **]** or PageUp/PageDown | Previous / next beat |
| **P** / **Esc** | Pause |
| **Enter** | Advance / skip story line |

## HUD

- **Top-left**: beat name, hearts, weapon, memory keys, mood, bosses defeated count
- **Top-center**: active boss name + HP bar + phase (shows ARMORED / PHASED when relevant)
- **Bottom-center**: story dialogue (speaker + text) and transient toasts
- **Bottom-right**: control cheat sheet

## Debug hooks

```js
__sovereignScar.loadLevel('beat-14-leviathan')
__sovereignScar.player.inventory.grantItem('heavy_mallet')
__sovereignScar.mood.setMusicProfile('boss')
__sovereignScar.game.activeBoss   // live boss entity
__sovereignScar.save()
```
