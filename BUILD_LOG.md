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

## Session 4 — Completion Plan Phase S (Scale & Sight) + Phase D (Dev Mode)

Per [../Sovereign-Scar-Builder-Guide.md](../Sovereign-Scar-Builder-Guide.md). Baseline 388 → **521/521**.

### Phase S
- S1: player rescale `S*3.0 → S*0.39` (h 14.85 → 1.93), Box3-grounded inner group (feet at physics bottom −0.95), eyes moved into inner, spawn y 1.95; suite 391/391
- S2: enemy rescale `S*2.6 → S*0.33` (h 12.9 → 1.63), grounded (minY 0 at rig origin = floor top), eye positions re-placed at head height (buildGlowEyes bakes unscaled part-unit positions — pre-existing bug)
- S3: boot resize — `onResize()` at boot + visibilitychange + continuous per-frame size guard (first-frame-only guard failed when the pane reported 0×0 with no later resize event)
- S4: lights bound — `initLights()` return captured, ambient found via scene, `MoodController.bindLights` + preset `ambient/ambientIntensity/key/keyIntensity` applied in `apply()` and lerped in ramps. **Root cause of P0-2 was the vignette pass**: abyss `vignette: 0.4→0.7` blackened ~everything (offset 0.7 → lum 3.1; 2.0 → 76). Retuned: crust vignette 1.15/ambient 1.7/key 1.9; abyss vignette 1.4/ambient 2.2/key 1.5; lifted near-black albedos (crust floor/wall, abyssFloor/Wall, basalt, charcoal). Final: crust 46–83, abyss 37–70, all 15 in band
- S5: camera `height 18→12, back 12→8` + per-level fit from `level.halfSize`; boss-intro focus 6/3.5; void dressing plane (mood background color, r200, y −0.5) in `createLevelShell`
- S6: `measure()` + `sampleLuminance()` on `__sovereignScar` (same-task readPixels), `tests/visual-sanity.spec.mjs` (~109 asserts: lum bands, scale ratios, grounding, boss silhouette ≥ max(1.3×mob, player)); retroactivity check confirmed the spec fails on the old `S*3.0`
- S6/P1-5: boss presence — `BossBase.presenceScale(k)` (mesh + radii together): proxy 1.15, arachnid 1.3, hydroid 1.35, mantis 1.1, phantasm 1.25 (baseHitRadius for its per-frame reset), frost&fuel 1.35, gumoi 1.15; tri-compiler cores ×1.35; magma wyrm per-segment ×1.65 (root scale would distort chain math) + radii resets updated; sand spur segments ×3.1 + emerged yBase 1.9. All bosses now 2.17–4.32 vs 1.63 mobs
- S-extra/P1-4: `BARE_STRIKE` starting weapon; inventory default `bare_strike`; save migration at restore (zero-progress `['anchor_link']` saves reset); Beat 01 `onDefeat` now actually `addWeapon('anchor_link')` (grantItem only set a flag — pre-existing bug) + salvage toast; onEnter toast reworded; QA/unit specs updated
- tests/qa/visual-report.mjs — standalone per-level metrics table (tuning loop tool)

### Phase D
- D1: `src/game/dev/dev-mode.js` — singleton gate (`?dev=1` / Ctrl+Shift+D), amber badge, persists `settings.devMode`; Input gains `consumeDevToggle`/`consumeDevKey` (F1/ShiftF1/F2/F3/F10/Backquote/KeyH) + `devActive` F-key preventDefault; single gate block in index.js discards all dev keys when off; menu drain covers dev keys
- D2: god mode (F1) — permanent `health.damage` wrapper checking flag (no double-wrap); one-hit (Shift+F1) via `damageMult=1000`, restored by `applyUpgradeStats()`
- D3: `dev-panel.js` (` `/F10) — teleport all LEVELS, grant-all, +100 shards, +3 keys, unlock all, max hearts, hitbox/overlay toggles, reset save; pauses + restores
- D4: F2 per-core-aware boss kill via hp=0+onDeath (attachBoss fires the real defeat path), F3 phase force via thresholds
- D5: `dev-overlays.js` — 4 Hz FPS/draw-calls/tris/luminance(1 s cadence)/pos/boss/level; `H` chrome-free via `hud.setHidden`
- D6: `dev-geometry.js` — pooled hit-radius rings + red mesh-Box3 vs green physics-box helpers (P0-1 detector), disposed on level change/toggle
- D7: M mood-flip and ]-force-skip now require dev mode; help text → 3 player-facing lines ([ ] documented in pause-menu Controls); P2-7 HP integer display folded in
- `tests/campaign-e2e.spec.mjs` — fresh save → dev on → teleport all 14 → F2 each → ending + `campaignComplete`, zero pageerrors. **Suite 521/521**

## Session 4 (cont.) — Phase W started: W1 + W2

- W1: `src/game/world/room-graph.js` — `createDungeon(ctx, def)` (G9-compatible level API), `ROOM_STRIDE = 64` world grid, `buildPerimeterWithDoors`, locked/boss door voxel plugs, bake-on-enter + dispose-at-graph-distance-2 (boss room sticky), composite `getVoxelAt` over baked rooms, IDLE→SLIDING (0.35 s, player pinned, camera-bounds lerp), pure `validateDungeonDef` BFS with key economy. `tests/game/world-graph.spec.mjs` (15 asserts) + `tests/world-e2e.spec.mjs` (18 asserts, deterministic tick-driven — realtime input starves under swiftshader ~1.5 fps + dt clamp). Dev-only registry lane: `DEV_LEVELS` (+ `w-test-dungeon` 3-room fixture) reachable via teleport but excluded from menus/e2e sweeps.
- W2: `CameraRig.setBounds` — look-at clamp with fov/aspect-derived margins, midpoint resolution for small rooms, lerped look-at (transitions pan instead of snapping); frame loop feeds `level.cameraBounds`.
- Visual-sanity hardening: double-sample max with 600 ms settle (first frames after a load can read dark — beat-06 was bimodal 27/44); Obsidian Arachnid albedo lifted from near-black. 3× report runs stable, all levels in band. Suite **554/554**.

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
