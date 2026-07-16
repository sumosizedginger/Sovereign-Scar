# Engine pin

| Field | Value |
|---|---|
| Upstream | https://github.com/sumosizedginger/My-Engine |
| Version | **0.2.0** |
| Commit SHA | `22f9904515e0f8f8c4c323e2bb95ca084de61374` |
| Pinned on | 2026-07-15 (bootstrap) |

## Authorized engine patches

Per Locked Decision **D5** in the integration plan, the **only** intentional engine edit is:

| Ticket | File | Change |
|---|---|---|
| SS-027 | `src/audio/synth.js` | `playDrone` / `stopDrone` / `stopAllDrones` + game SFX presets |

All other product code lives under `src/game/`.

## How to re-sync

1. Fetch upstream at a newer tag/SHA.
2. Diff against this pin; re-apply SS-027 if upstream has not absorbed drones.
3. Update this file’s SHA and re-run `npm run test:unit`.
