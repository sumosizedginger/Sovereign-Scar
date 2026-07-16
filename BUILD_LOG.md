# Sovereign Scar — Build Log

Living document of what was implemented, in order. Update as work lands.

## Session 1 — Bootstrap to full spine

### Engine
- Cloned **My-Engine 0.2.0** @ `22f9904515e0f8f8c4c323e2bb95ca084de61374` into `sovereign-scar/`
- **SS-027** engine audio patch: `playDrone` / `stopDrone` / `stopAllDrones` + game SFX
- Later: **layered music beds** (`startMusicBed` / `updateMusicBed`) + `sfx.fanfare`
- Pin: [ENGINE_PIN.md](ENGINE_PIN.md)

### Phase A–F — Kernel, combat, mood, Y-physics, destructibles, 15 levels
See prior entries: player loop, inventory, weapons, friction, gears, fluid, frustum, light lines, flicker, wrap.

## Session 2 — 10/10 boss-complete campaign

### Boss framework
- `src/game/bosses/base.js` — `BossBase` multi-phase HP thresholds, telegraph rings, contact damage, `attachBoss` win wiring
- Every beat registers a boss into combat + system tick; single-fire defeat → unlock + progress + toast + story beat

### Full roster (14 unique bosses — narrative bible names)
| Beat | Boss | Signature |
|---|---|---|
| 01 | Crypt Warden | Wake + slam telegraphs; armored until approach |
| 02 | Tri-Compiler | 3 orbiting cores; phase-2 damage beams |
| 03 | Sand Spur | Segment path + burrow invuln phases + 5×5 mesh |
| 04 | Kinetic Core | Arena bounce, underside weak, phase-3 split orbs |
| 05 | The Proxy | Orbit + clones + violet bolts; phase-shift on defeat |
| 06 | Obsidian Arachnid | Armored crawl; leap telegraphs open weak window |
| 07 | Hydroid Cloud | 12-orb swarm + knockback pulse rings |
| 08 | Skeletal Mantis | Wide scythe cone telegraphs |
| 09 | Phantasm | Dematerialize cycles + mirror echos |
| 10 | Frost & Fuel | Alternating freeze/burn heads |
| 11 | Sludge Golem | Lunges drop poison pools |
| 12 | Magma Wyrm | Figure-8 chain + fire trails |
| 13 | GUMOI Witness | Tower orbit + flicker drive + bolts |
| 14 | Leviathan Core | 3 phases, decoys, wrap intensity, slam folds |

### Narrative + HUD
- `ui/story.js` dialogue queue with speaker labels; Enter advances; cleared on level load
- Boss HP bar (top center) with phase / ARMORED / PHASED
- HUD shows `Bosses: N/14`

### Audio
- Layered beds: crust / abyss / boss / leviathan
- Rhythmic soft ticks via `updateMusicBed`
- Fanfare on boss defeat

### Enemies
- AI modes: `chase` (sentinel), `charge` (scarab), `ranged` projectiles (frost)

### Tests
- Unit: bosses, music-bed, story (+ prior suite) → **190 unit**
- Browser: smoke + game-smoke + **boss-e2e** (all 14 load, defeat path) → **284/284** total

### Screenshots
- `assets/screenshots/beat-01-warden.png` — Crypt Warden bar + story + HUD
- `assets/screenshots/beat-05-proxy.png` — Proxy bar + citadel pillars
- `assets/screenshots/beat-09-phantasm.png`
- `assets/screenshots/beat-14-leviathan.png` — violet arena, Leviathan bar

### Fixes this session
- `this` before `super()` in 5 boss ctors (browser crash)
- Story queue leak across levels → `clear()` / `queue({replace:true})`
- Double-boss-update already guarded via `managedBySystem`

## Session 3 — Phase E (audio hotfix) + Phase A (juice)

Per [../EXECUTION-PLAN.md](../EXECUTION-PLAN.md). Suite: **310/310** (was 284; +26 juice/shard asserts).

- E1 audio fix: master defaults 0.4, 2s fade-in on unlock, `N` mute toggle, volumes persist under `sovereignProgress.settings`. Synth SS-027 addition: `refreshDroneVolumes()` (drones baked gain at creation; live volume changes now re-apply) + drone base-vol tracked.
- A1 `fx/juice.js`: trauma-based screen shake (trauma² amplitude, 1.6/s decay, three-octave noise), applied in `camera-rig.js` at final position only (no lerp drift). Feeds: player hurt 0.3, kill 0.2, boss phase 0.45, boss death 0.6, player death 0.8.
- A2 hitstop: `juice.timeScale` (0.05 during stop) multiplies gameplay dt in `index.js`; raw dt keeps juice/HUD/death timers honest. Feeds: melee connect 0.05s, player hurt 0.09s, boss phase 0.12s, boss defeat 0.25s, player death 0.3s.
- A3 hit flash: white emissive flash (80ms) on struck targets via `applyHit`; red vignette pulse on player damage (baseline captured/restored so moods aren't fought). `reduceShake`/`reduceFlash` settings honored (A8).
- A4 `fx/vsfx.js`: ±15% randomized step/slap/hurt/kill/shatter/pickup; game call sites swapped, engine `sfx` presets untouched.
- A5 `fx/soul-motes.js`: pooled (48) emissive motes burst on kill, scatter 0.25s, home 0.7s, pay 1 Scar Shard each. `Inventory.scarShards` + add/spend + JSON round-trip; HUD `Shards:` readout; 10s autosave so pickups survive a tab close.
- A6 boss intro: name card (`hud.bossCard`) + camera push-in (`CameraRig.focus`, sine dip toward boss) 0.6s after level load, once per load, skipped if boss already defeated. Subtitles in `bosses/subtitles.js` (bible-grounded).
- A7 death sequence: hitstop + trauma + "THE SCAR RECLAIMS YOU" fade overlay; any key after 0.6s skips; respawn logic unchanged.
- Browser-verified: card+subtitle, kill→motes→6 shards→HUD, death overlay→respawn→fade, mute persist, zero console errors.

## Session 3 (cont.) — Phase B: shell

Suite: **353/353**.

- B1/B2 `ui/menu-state.js` (pure machine, 20 asserts) + `ui/menu.js` (DOM overlay): pause menu (Resume/Beat Select/Settings/Controls/Quit), settings live-apply (volumes w/ drone refresh, engine quality tier, reduce shake/flash, show-timer), beat select with locks + boss ✓s, keyboard+mouse+pad nav.
- B3 title screen v2: logo over live drifting scene, Continue w/ run summary, New Game (confirm → archives `lastRun`, keeps settings), gameplay chrome hidden at title.
- B4 ending: Leviathan defeat → 3.2s kintsugi shard collapse + wrap ramp → whiteout → 5 epilogue slides (bible-voiced) → stats card (time/deaths/bosses/shards/keys) → scrolling credits → `campaignComplete` → title. e2e asserts ending phase + flag.
- B5 gamepad: standard mapping (A attack, B dash, X interact, Y grapple, LB/RB weapon, Start pause, Select mute, D-up mood), analog left stick w/ deadzone, right-stick aim priority, d-pad/A/B menu nav codes, HUD legend swap. 17 asserts w/ injected fake pad.

## Session 3 (cont.) — Phase C started: C2 + C8

Suite: **364/364**.

- C2 boss hearts: `HealthPool.setMax` (cap 12, raising fills gained hearts) + `bossHeartMax` (+1 max HP per 3 bosses on base 6); wired into `recordBoss`, persisted as `maxHp`, restored at boot.
- C8 smear fix: `fx/arc-smear.js` — pooled flat-XZ fan rotated to the true 8-way facing (`rotation.y = atan2(-fz, fx)`); player attack + dash swapped off the engine's side-view ±X smear. All 8 headings browser-verified (found and fixed an `x || 1` zero-heading bug in the process).

- C3 Scar Shard economy: `kernel/upgrades.js` (Edge +25% dmg ×2, Ghost-step +0.1s dash i-frames ×2, Long-arm +3 grapple ×2; pure + 22 asserts) · `world/altar.js` kintsugi shrine prop w/ interact prompt in beats 01/06/13 · altar shop screen in the menu · upgrades persist and live-apply (`applyHit` attacker.damageMult, dash i-frames, global grapple reach). Browser-verified: E opens shop, buy deducts + applies + persists, Esc resumes. Suite: **388/388**.

## Known remaining polish (not blockers)
- Character smear still ±X-biased (engine side-view heritage)
- Boss fights are arena-scripted phases (not full cinematic cutscenes / unique OST stems)
- Some arena floors share shell scale — visual variety is props + boss mesh + mood, not bespoke terrain tools

## How to run
```bash
cd sovereign-scar
npm test          # full 284
npm run test:unit
npm run serve     # http://127.0.0.1:8799/
```
Controls: [docs/CONTROLS.md](docs/CONTROLS.md) · Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
