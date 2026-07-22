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

- W3: `src/game/world/keys.js` — per-dungeon `{smallKeys, bossKey, opened[], visited[], taken[], mapPickup}` persisted under `sovereignProgress.dungeons[id]` (read-modify-write per G13); `makeKeyStore` write-through cache adapter (HUD polls per frame); `addKeyPickup` persistent key pickups (never respawn); createDungeon defaults to the persistent store; HUD shows small-key count + BOSS KEY inside dungeons; `dungeons: {}` added to DEFAULT_SOVEREIGN so New Game clears it. `tests/game/keys.spec.mjs` (24 asserts) + reload-persistence asserts in world-e2e. Suite **581/581**.

## Session 4 (cont.) — Phase W3–W8

- W3: `world/keys.js` persistent per-dungeon lock state (see above). **581/581**
- W4: `overworld/overworld.js` + `screens.js` — screens as rooms with wide edge doors on the same 64 grid; entrance arches (E to enter, position saved), dungeon `type:'exit'` doors return to the saved screen/pos; visited tracking; reload restore. 2×2 dev grid; `'overworld'` in DEV_LEVELS until C1. `game.loadLevel` exposed for cross-level travel. **591/591**
- W5: mirror travel — per-screen `crust:`/`abyss:` layout variants; monolith interact → `sovereignProgress.overworld.state` flip + 1.5 s mood ramp + overworld rebuild at exact position; ring-search un-trap nudge; free swap (M) for `mirror_free`/post-Proxy via `level.onMoodToggle` claim in index.js. **602/602**
- W6: Tab map (`ui/map-screen.js`, canvas overlay) fed by `level.mapData()`: overworld visited grid (entrance ▼ / monolith ◆) and dungeon room graph (door links colored by lock state, boss ☠, `mapPickup` reveals all); modal drain; Esc closes; Tab drained in menus. **612/612**
- W7: `world/blockers.js` — grapple_gap / wedge_crack / boot_ledge / caster_dark, each a build-time map edit + runtime; wired into room defs + overworld screens; TECTONIC_WEDGE gains shatter (cracks filter on attacker id, persist as `blocker:<id>`); ledge is hop-OVER (2-D collision means solids block at every height — G5). Dev gauntlet room + r1c1 placements; behavior e2e'd item-gated both ways. **640/640**
- W8: save `version: 2` + one-shot v1 migration (fills `dungeons`/`overworld`, wipes nothing, persists on first load); migration spec. World state is write-through at mutation time, so the 10 s autosave needs no extension. **651/651**

## Session 4 (cont.) — Phase W gate: Beat 01 vertical slice ✅

- **Beat 01 rebuilt as a real 6-room dungeon** (`beat-01-crypt.js` → `BEAT01_DEF` on the room graph, `prebake: true`): tomb (awakening + S exit to overworld) → debris corridor (swept-AABB slalom, small key in a nook) → locked door → predecessor chamber (scattered-predecessor props, altar, story) → W secret room (boss key + shard cache, rubble-concealed door) → antechamber (guarded) → boss door → Crypt Warden (kill grants + equips the Anchor Link per S-extra). Boss intro/boss-bed fire on arena entry; boss HP bar gated to 30-unit proximity (prebaked bosses were showing it from four rooms away).
- **CRUST_REGION overworld** (4 screens: scarfield w/ Crypt entrance arch, ridge w/ monolith, flats, sink w/ a grapple-gap): registry id `'overworld'` (DEV_LEVELS until C1); test grid moved to `'w-test-overworld'`; `createOverworld` takes `levelId` (mirror-swap was reloading the wrong overworld).
- Full loop e2e'd in `world-e2e` (14 gate asserts): overworld → arch → tomb → corridor key → locked door → secret boss key → boss door → Warden kill fires the real defeat path → Anchor Link equipped → exit lands at the arch. `BEAT01_DEF` structurally validated in `world-graph.spec`. Certified by eye via headless captures in `docs/media/w-gate/` (tomb, corridor, predecessor, warden, scarfield, Tab map). **Suite 674/674.** This slice is the Phase C template.

## Session 4 (cont.) — Phase C started: C1 overworld 7×7 ✅

- `src/game/overworld/world7.js` — the full 49-screen world generated from a region table (8 regions mapped to the bible's mood geography: tombfields/spindle/sinklands/citadel/quarry/bonetown/cryomire/pyre) with seeded-deterministic terrain per screen × state, plus hand-authored gate screens folded in at their original grids (scarfield stays [10,10] — gate e2e coordinates hold). 14 dungeon entrances (one per beat), 4 monolith sites, 8 region secret caches, ≥2 overworld blockers per gating item (C4 budget pre-satisfied on the overworld side).
- `'overworld'` promoted into LEVELS (16 total); new game + fresh saves start on the Scarred Crust (`currentBeat: 'overworld'`, unlocked by default). Overworld saved positions now scoped by `pos.world` (the dev test grid shares screen names with the real world — unscoped restore crashed the gate flow).
- Overworld screens support `floorColor`/`onBake` pass-throughs; new `CRUST_COLORS.clayField` field tone (clayDark read 92/255 full-frame, just over band). `tests/game/world7.spec.mjs`: 49 unique cells, edge symmetry (side/at/width), full BFS connectivity, 14 entrance targets valid, monolith/secret/blocker budgets. Suite **693/693**.

## Session 4 (cont.) — C3 complete ✅ (Act II, beats 06–12)

- Beats 07–12 rebuilt as 8-room abyss dungeons on the room-graph template, each with 2 small keys + locks, boss key + boss door, map pickup, secret room, altar, and their signature systems carried over: 07 Sluice (grapple-gap traversal, spare grapple), 08 Bone Forest (bone-arch decks, shatter cage, wedge marrowcyst), 09 Ruined Town (phantom frustum walls, belltower spiral), 10 Cryo Vault (ice friction, meltable ice walls, boot-ledge icecomb), 11 Rot Mire (per-room sludge FluidPlanes + islets, wedge inkwell), 12 Pyre Peak (magma vents, Vector Staff light-line patch, caster cinderpocket). **Boss arena-home fix**: `BossBase.home` — Proxy/Frost&Fuel/GUMOI/Leviathan orbits, Phantasm mirror-chase, MagmaWyrm figure-8 all anchored to placement instead of the world origin. Suite **923/923**.

- Beat 06 rebuilt as an 8-room abyss Quarry (`BEAT06_DEF`): pitgate → quarryfloor (boulders, key 1) with orecrush (Heavy Mallet + boulders) and siftery (map) wings → locked → deepcut (altar, key 2, narrow secret door) → goldgash secret (caster-shroud gold seam) → locked → veinworks (boss key behind a destructible gold-vein wall) → boss door → molthall (Obsidian Arachnid). Suite **809/809**.

## Session 4 (cont.) — C2 complete ✅ (Act I, beats 01–05)

- Beat 05 rebuilt as an 8-room Citadel (`BEAT05_DEF`): approach → greathall (kintsugi pillars, key 1) with westgallery (map) and eastgallery (stepped-platform key 2) wings → locked → monolith room (altar, the Tectonic Wedge gated on all 3 memory keys + phase shift, narrow secret door) → reliquary secret (wedge-crack cache — the Wedge you just claimed opens it) → locked → sanctum (boss-key gauntlet) → boss door → proxythrone (Proxy; defeat grants the Wedge fallback, `mirror_free` for W5 free swaps, and the abyss phase shift). C2 sweep assert: every Act I def has 6–14 rooms, locked door + small key, boss key + boss door, overworld exit. Suite **788/788**.

- Beat 04 rebuilt as an 8-room multi-Y tower (`BEAT04_DEF`): room-graph gains `room.platforms(map, h)` — voxels meshed **without** XZ solids (G5) so 1-high steps are climbable via `VoxelPhysicsBody`; keys perch on stepped pyramids (terrace tutorial 3-step, ascent twin towers, galleria boss-key platform). Wings: observatory (map), windworks (Magnetic Grapple + its own grapple-gap lesson), aerie secret (caster-dark shroud cache). Corona keeps the proven raised-plate Kinetic Core arena; defeat grants the Sky memory key. Suite **751/751**.
- Beat 03 rebuilt as an 8-room Sink dungeon (`BEAT03_DEF`, sand friction, clay palette): sinkmouth → dunecross (key 1) with cistern (map) and boneyard (Phase Boot + boot-ledge lesson cache) wings → locked → slipway (altar, key 2, narrow secret door) → hollow secret (grapple-gap sinkhole cache) → locked → undertow (boss-key gauntlet) → boss door → spurpit (Sand Spur; grants the Sink memory key). Suite **732/732**.
- Beat 02 rebuilt as an 8-room Spindle dungeon (`BEAT02_DEF`): gatehouse → gearworks (GearSystem gears, small key 1) with archive (map pickup) and coilhall (Light Caster, guarded) wings → locked → vaultrow (altar, small key 2, narrow secret door) → capacitor secret (30-shard cache + wedge-crack bonus wall) → locked → prebosscourt (boss key, 3-mob gauntlet) → boss door → spindlecrown (Tri-Compiler; defeat grants the Spindle memory key). Def validated (8 rooms, 2-key economy). Suite **713/713**.

## Session 5 — C4 complete ✅ (finale, beats 13–14) — all 14 beats are dungeons

- Beat 13 rebuilt as a 9-room vertical GUMOI Tower (`BEAT13_DEF`, prebaked): towergate (kintsugi gold approach seam, overworld exit) → towerfoot (key 1) with flickerhall (map) and stairworks (spiral step-pyramids via `room.platforms`, shard cache) wings → locked → archivegaunt (Act III altar, key 2, 3-mob gauntlet) with nullcell secret (boot-ledge cache) → locked → indexspire (boss key atop a 5-step spiral) → boss door → witnesscrown (terraced climb to the GUMOI Witness at y 9.5; entry forces flicker 0.7 + boss bed).
- Beat 14 rebuilt as a 6-room descent (`BEAT14_DEF`): threshold → wraithway → recursion (wedge-crack foldpocket secret) → coregate → boss door → corechamber. The B4 ending is preserved exactly — Leviathan wrap-drive, defeat → collapse cascade (`_collapse` timer, shard bursts at the dying core, wrap wind-down) → `startEnding()` → `sandbox-combat` unlock; dungeon exit returns to the overworld.
- **Prebaked-boss wake gate** (`attachBoss`): bosses at grid origins were ticking against the player from anywhere in the dungeon — the Witness sniped bolts (and forced flicker ≈0.5 dungeon-wide) four rooms down. Bosses now animate always but see `player: null` outside a 40-unit radius of their arena anchor (`boss.home`); every roster tickAI verified null-safe. Win-condition/HUD wiring still runs asleep, so dev F2 kills keep firing the real defeat path.
- Beat 13 luminance: entry read 32/255 (abyss band floor 35) — bare charcoal floor; fixed with the gold approach seam + `abyssFloor` base (39.4 in band). The wake gate initially froze idle animations and 3 boss silhouettes shrank below the 1.3×-mob bar — the animate-asleep design above fixed both at once.
- **C4 item-gating budget check ✓**: real overworld carries exactly 2 blockers per item (world7 BLOCKERS); dungeon-side — grapple 03/04/07×2, boot 03/07/10/13, wedge 02/05/08/11/14, caster 04/06/09/12. Every item gates ≥2 overworld blockers + ≥1 dungeon shortcut.
- world-graph sweep extended to BEAT13_DEF/BEAT14_DEF; the "plain arena has no map" e2e now points at `sandbox-combat` — the last non-dungeon level. Suite **955/955**.

- C5 story pass ✅: every dungeon now has intro (load) + mid (altar-room `onEnter`, once-guarded) + post-boss lines (`attachBoss` gains `defeatStory`, queued after the SYSTEM defeat line). Arc threads carried through: Act I counts memory keys 1→3, the Proxy defeat announces the phase shift, Act II counts the seven engineers freed 1→7, GUMOI speaks from Beat 12's defeat onward, Beat 14 hands off to the ending. Epilogue expanded 5→9 lines (committed with the docs refresh). Suite **955/955**.

- C6 economy & tuning ✅: audit — full-clear income ≈ 620 (dungeon caches) + 170 (8 overworld secrets) + 1/kill ≈ 850+, vs 510 to max all upgrades (edge 60/140, ghost 50/120, longarm 40/100) → ~1.6× margin, cheapest tier (40) affordable by Beat 02–03. Hits-to-kill curve: Act I 10–16 @ Anchor 1.0 · Act II 6–9 @ Wedge 2.0 (5–7 with Edge) · Witness 9 · Leviathan 14 (10 at Edge max). One outlier fixed: **Crypt Warden 10 → 8 hp** — he's fought with the 0.5-dmg Bare Strike (his defeat grants the Link), 20 hits → 16. Automated playthroughs stay green (world-e2e real-combat Beat 01 loop + campaign-e2e all-14 sweep); the by-hand dev-off run is the Phase R gate. Suite **955/955**.

- C7 audio pass ✅: `src/game/fx/motifs.js` — per-beat + per-region motifs (`{transpose, pattern}`, just-intonation ratios); `startMusicBed`/`updateMusicBed` gain an optional motif param (additive synth change — transposes the bed layers, pulse walks the ratio cycle), `MoodController.setMusicMotif` restarts the live bed; index.js applies `BEAT_MOTIFS[id]` at load (boss beds inherit the beat's motif), overworld screens carry their region motif (applied on `onRoomEnter` + `level.initialMotif` at load). New `sfx.stinger` boss-reveal hit replaces the generic phase whoosh on the boss card. Consistency: room-graph pickups now play `sfx.pickup` (dungeon caches/keys/maps were silent; rejected pickups — keyless Wedge — stay silent). Browser-probed: b02→1.125 spindle motif, b11→0.79 mire, overworld screen walk tombfields 1.0 → pyre 1.33, 0 pageerrors. Suite **955/955**.

## Session 5 — Phase V complete ✅ (visual certification)

- Headless capture sweep → `docs/media/certification/` (44 shots): entry + mid-fight boss room per dungeon (via `level.enterRoom` warp — raw position teleports trip the current room's door trigger and snap the player to the adjacent doorway), one screen per overworld region per mirror state (via saved-pos loads — cross-screen teleports fall into unbaked void and capture the death screen). All rows in [CERTIFICATION.md](CERTIFICATION.md) now ✅ with lum + shot links; zero pageerrors across every run.
- Fix-forward fixes: Beat 03 spurpit clay floor 91→72 (clayDark) · Beat 09 moothall 11→39 (bone flagstone plaza + abyssWall floor) · Beat 11 golemwallow 18→36 (islets recolored parched-clay so "keep to the dry islets" reads, +3 islets, bone shelf ruins, new `rotPale` floor) · five crust region floors retuned (tombfields/sinklands→clayField, spindle→iron, quarry→slate, bonetown→new `ashField`; screens read 20–105 → 57–84, abyss all 35–42). Suite **955/955**.

## Session 5 — Phase R: release gate (v0.3.0)

- Gate item 3 ✅: `npm test` green — final count **955/955** (baseline 388 at guide start).
- Gate item 4 ✅: README (955 count, scope, layout), CHANGELOG `[0.3.0] — 2026-07-17`, `package.json` 0.1.0 → **0.3.0**, tag `v0.3.0`.
- Gate items 1–2 (⚠ human QA outstanding): the fresh-save dev-off manual playthrough and the overlays-on 60 FPS pass need real hands + a real GPU — headless swiftshader runs at ~1.5 FPS, so an agent cannot meaningfully certify frame rate or feel. Automated stand-ins are green: `world-e2e` full real-combat Beat 01 loop (overworld → arch → keys → locks → secret → Warden kill → exit), `campaign-e2e` fresh-save all-14 sweep to credits, Phase V luminance sweep in band everywhere. **Log timer/deaths here after the by-hand run.**

## Session 5 (cont.) — post-release docs-truth pass

- ARCHITECTURE.md brought current: layer tree gains `overworld/`/`dev/` + world subsystems, boss contract documents `defeatStory`, `boss.home` anchoring, and the 40-unit wake gate; progress schema shows `pos.world`. CHANGELOG suite count finalized; stale "smear still ±X-biased" polish bullet removed (C8 fixed it in Session 3).
- New `tests/game/motifs.spec.mjs` (25 asserts): every beat and region has a valid, distinct motif; no orphan table entries. Suite **955 → 980/980**.

## Session 5 (cont.) — real-combat boss gauntlet

- New `tests/boss-combat-e2e.spec.mjs` (15 asserts): warps into each of the 14 boss rooms (`enterRoom`) and kills the boss through the **real** player path — `player.tryAttack` with swept arcs, honoring every shield/armor/phase-window/multi-core, weapon-rotating when a fight stalls. This is the automated stand-in for the "boss beatable" half of the Phase R manual gate; `boss-e2e` only ever set `hp=0`. God-heal each tick — we certify killability, not survivability.
- Two findings, both **design confirmations, not bugs**: (1) the **Obsidian Arachnid** is unhittable at point-blank — that's the intended leap-bait (shielded except mid-leap, and the leap only triggers at player distance 3–12). The spec now plays it like a player: kite at range 6 while `shielded`/`canHit===false`, dart to 1.2 and swing when the window opens. (2) the **GUMOI Witness** orbits at y≈9.2 and is melee-immune by design — it falls to the Light Caster ray (the spec's weapon-rotation lands on `light_caster` and kills it in ~31s). All 12 others fall to the Tectonic Wedge in <4s.
- Wired into `run-all.mjs` before visual-sanity. Suite **980 → 995/995**.

## Session 6 — first real playtest: camera + input fixes

The first by-hand play session produced two reports: "the levels look 2.5D, not LttP" and "found the first small key but the gold door wouldn't open." Both are now closed — and the second turned out not to be a door bug at all.

- **Camera read (`fix(camera)`)** ✅: the gameplay rig is `src/game/camera-rig.js` (product code — `engine/renderer.js`'s belt-scroller camera is frozen and unused here). Narrowed FOV **65° → 40°** to kill the wide-lens convergence that made rooms read as "a 3D scene at an angle," and steepened the rig (`back = height * 0.66 → 0.35`, per-room height `8 + half*0.35 → 16 + half*0.7`, rebalanced so visible floor area is preserved at the tighter FOV).
- **Boss-intro focus leak (same commit)** ✅: a real latent bug surfaced while verifying the new framing — `CameraRig.focus()` (the boss push-in) was never cancelled on level change, so a lingering dip blended into the next level's rig. Repro: warden arena → overworld left the camera buried in a wall. Added `clearFocus()`, called from `loadLevel`.
- **Gamepad stick arming (`fix(input)`)** ✅ — *the root cause of BOTH playtest reports*. A DualSense was reporting `axes[0] = 0.937` (hard right) against a `0.18` deadzone; `Input.moveVector()` falls back to `padMove` whenever no key is held, so the pad beat the keyboard every frame. The player was shoved east constantly — which also meant they could never line up with the corridor's **2-unit-wide, centred** door gap (`|p.x - doorCx| < 1.5`). Hence "the gold door won't open" with a valid key, and hence every door test passing. Fix: each stick is armed only once **seen at rest**; off-centre-at-connect (held/drifting/stuck) reads zero. Healthy sticks are neutral on first poll and arm instantly. Different pad id ⇒ re-arm.
- **Off-centre hint (`feat(input)`)** ✅: arming alone failed silently, indistinguishable from "pad unsupported". `input.padStickHeld` now reports the suppressed state and the main loop shows a one-shot HUD toast.
- **Camera coverage refit (`fix(camera)`, follow-up)** ✅ — *self-caught regression*. The FOV commit claimed its height coefficients preserved visible area but only ever eyeballed four screenshots. A numeric sweep of all 15 levels (visible width ÷ room width) showed dungeon rooms at **2.00×** vs the original camera's **1.65×** — a 21% zoom-out shipped under a "no change" claim, rooms adrift in void at half the frame width. Refitted: dungeon **1.54**, overworld **1.04** (originals 1.65 / 0.93) — zoom within ~7% of historical, only the tilt changed. Deliberately *not* pushed to a tighter ~1.3 "fills the frame" value: perceived zoom is a subjective call for the player, and the report was about angle, not zoom. Measured values are recorded in the code comment. **Lesson: framing changes need a measured sweep, not sample screenshots — a handful of shots hid a 21% error.**
- Suite **995 → 1006/1006** (11 new gamepad asserts). Verified end-to-end through the real main loop with an injected pinned stick: 0 drift while held, normal analog motion after it centres once; toast render confirmed by screenshot.
- **Hermetic specs (`test:`)** ✅ — the drift was corrupting the **test suite**, not just gameplay. Headless Chrome enumerates the host's real controllers, and every browser spec runs the real main loop, which polls the pad and feeds `moveVector()` (stick fallback whenever no key is held) — so the controller on the desk was driving the player mid-assertion. This is the actual cause of the intermittent `phase boot hops the ledge` failure: it dashes north asserting `z > O.z + 5`, and a stick at `x=0.937` diverted the dash sideways. It appeared to self-heal once stick-arming suppressed the drift and was **wrongly written off as an unrelated flake**. All seven browser specs were exposed. `harness.disableGamepads(page)` now runs after every `newPage()`; guard verified (`padsSeen 0`). Real pad behaviour stays covered by the unit spec's injected pads.
- **Triage lessons:** (1) headless Chrome enumerates the host's real controllers, so the automated suite sees them too — a stray gamepad legend in a captured screenshot was the tell. On any movement-adjacent bug report, dump `navigator.getGamepads()` axes first. (2) Test environments must be hermetic against attached hardware — a suite whose result depends on what is plugged into the desk is not a suite. (3) "It passes now" is not a diagnosis: the flake was real and had a cause.

## Session 6 (cont.) — playtest fixes from the first real by-hand run

- **Camera** ✅ confirmed by the user in motion ("much better camera angle"). See the tilt/FOV retune and coverage refit above.
- **Death respawn (`fix(death)`)** ✅ — *"when I died I kept falling through the map."* `respawn()` used the spawn captured at **level load**; on the overworld that is a different screen, so dying elsewhere teleported the player into unbaked void, and the unsafe-spawn fallback hardcoded `(0, 1.5, 0)` — also void out there. Player fell past `y=-12`, was re-killed by the void guard, respawned into void again: **unbreakable loop** (measured `y=-18`, `vy=-28`, permanently dead). Dungeons were broken more quietly — dying in the Warden room left the player sinking at `y=-1.5` with `currentRoomId()` still on the death room, so door triggers and camera bounds ran on stale state. Fix: `level.respawnPoint()` returns the **current** room's entry point, falling back to the nearest standable cell (`standable`/`nearestStandable`) when it sits on carved geometry; world-origin fallback deleted. 5 regression asserts in `world-e2e`.
- **Map reachability** ✅ — user asked for "a map that keeps track of where you are… fog of war lifted as you travel". **It already existed and worked**: `mapData()` tracks `visited`/`current`, map-screen filters to `visited || current || mapAll`. Verified live: 1→2→3→4 of 6 rooms revealed while walking. The real defect was access — bound to **Tab** but absent from the on-screen legend, and **no gamepad binding at all** (unreachable on a controller). Added to both legends; bound to **Select**, mute moved to **LT**. **Lesson: "feature missing" reports can be discoverability bugs — check the binding and the legend before building anything.**

## Session 7 — second playtest: combat legibility, healing, keyboard-first

Five reports from the second by-hand run: no way to avoid enemy hits, no way
to tell where they will hit, no way to get hearts back, dungeons zoom in
relative to the overworld, and the game is mouse-driven when it should play
like A Link to the Past. All five closed.

- **Enemy telegraphs (`feat(combat)`)** ✅ — *"no way to tell where they are going to hit."* Regular enemies had **no wind-up whatsoever**: `_aiChase` called `player.health.damage()` on the frame its cooldown expired and you were inside `attackRange`. There was nothing to read and nothing to react to. Every hostile action now commits first — the enemy freezes, a ring marks the ground, and damage resolves only when the ring expires. Melee re-checks distance at strike time (`_resolveMelee`), the charger locks its lane at wind-up, and the ranged shot leads where you *were*.
- **Avoidable hits (same)** ✅ — *"no way to avoid enemy hits."* Because the strike resolves against your position at resolve time, walking clear whiffs it (0.45 s wind-up vs 5.5 u/s move speed ⇒ ~2.5 units of escape, against a 1.8-unit reach). Dash i-frames were also useless as a defence at **0.13 s** (0.084 s dash + 0.05) — shorter than a human reaction. Floored at **0.3 s**.
- **Telegraphs rendered underground (`fix(combat)`)** ✅ — *caught by screenshot, not by tests.* Rings were pinned at an absolute `y ≈ 0.08`, but room floors have their top face at **y = 1**, so every telegraph rendered a full unit below the ground. This had been true of **every boss fight in the game since the boss framework landed** — the wind-ups existed and were simply invisible. Enemy rings now sit at `rig.y + 0.06`; `BossBase` gained a `floorY` (default 1.0). **Lesson: asserting the telegraph object exists is not asserting the player can see it — the unit tests passed while nothing was on screen.**
- **Heart recovery (`feat(hearts)`)** ✅ — *"no way to get hearts back."* `HealthPool.heal()` existed and was **never called by anything in the codebase**: the only way to restore HP was to die. New `src/game/world/heart-drops.js` — slain enemies roll a drop (odds scale with enemy max HP and, more strongly, with how hurt you are), and **boss phase changes always drop one**, since arenas have no trash mobs and walking in at 1 HP was otherwise unwinnable. Drops are polled off enemy death state rather than hooking `Enemy.onDeath`, which levels already use for their own scripting.
- **Constant camera scale (`fix(camera)`)** ✅ — *"entering a dungeon zooms in instead of staying at the same angle."* Rig height scaled with `level.halfSize`, so a dungeon room (half 7) framed **21 world units** while an overworld screen (half 23) framed **47** — walking through an arch more than halved the scale. Now one `CAM_HEIGHT` for the whole game; measured **24.07 units in every level** (overworld, crypt, citadel, leviathan). Rooms narrower than the view are centred by the room-lock clamp, wider screens scroll. The tilt the user approved last session is unchanged (`back = 0.35 · height`).
- **Keyboard-first controls (`feat(input)`)** ✅ — *"everything is mapped to the mouse, it should be keyboard driven like LttP."* Facing was recomputed from the cursor **every frame** (`aimAtScreen`), so the keyboard never actually controlled where you pointed — you swung wherever the mouse happened to sit. Removed entirely: you now face the way you walk and standing still holds your last facing. LMB no longer attacks; the pad's right stick is the only remaining aim override. Legends, `menu.js`, and `docs/CONTROLS.md` updated.
- Suite **1012 → 1053/1053**: `tests/game/combat-feel.spec.mjs` (27 asserts — telegraph, whiff-on-dodge, i-frame absorb, floor height, drop odds, facing model) and `tests/combat-feel-e2e.spec.mjs` (14 asserts through the real browser loop — measured camera width per level, live keyboard facing with a cursor sweep, telegraph on a real enemy, heart pickup, boss-phase heart).
- **Verification note:** camera parity was proven by unprojecting the frustum onto the floor plane per level, not by eyeballing shots — the Session 6 lesson held up, and the screenshot pass then caught two *rendering* faults (buried rings, hearts modelled in the XY plane reading as flat bars under a top-down camera) that every numeric assert had missed. Both classes of check were necessary.

## Session 7 (cont.) — the golden door was a real bug all along

- **Locked doors were impassable campaign-wide (`fix(doors)`)** ✅ — *"first golden door, blocked"*, reported at beat-03 and, in Session 6, at beat-01. `bakePlug` fills a locked doorway with solid `goldLeaf` voxels registered in the **collision world** (not in the room's voxel map — which is why probing `getVoxelAt` showed an empty gap while the player was physically stopped). The unlock trigger required `p.z < wallZ + 0.3`; the plug halts the player at `wallZ + 0.9`. **The trigger line sat behind solid matter, so it could never fire, the key was never spent, and not one locked or boss door in the game could be opened on foot.** Plugged doors now react at 1.2 (approach), then drop back to 0.3 once the plug is removed so the next step walks through.
- **Why every prior test missed it:** all 80 locked/boss doors had coverage, and all of it either called `enterRoom()` directly or teleported the player past the wall line. Not one test drove the physics body into a door. `world-e2e`'s "boss key opens the Warden arena" passed throughout.
- **New `tests/locked-doors-e2e.spec.mjs`** — walks the real `VoxelPhysicsBody` into **all 80** locked/boss doors across all 14 dungeons and asserts each opens. Approach starts 2 units from the wall so the spec measures the trigger-vs-plug interaction rather than cross-room pathing (terraces, magma vents and meltable ice walls sit on some door centre lines; widening offsets until the suite went green would have proven nothing). **Verified the guard bites: reverting the fix turns it red, and the first door it names is `beat-01-crypt corridor->predecessor` — precisely the door reported in Session 6.**
- **Correction to the Session 6 entry.** That session attributed the beat-01 "gold door won't open" report *entirely* to gamepad stick drift. The drift was real and did break the suite, but it was never the whole story: the door was independently impassable for every player, pad or no pad. A plausible root cause that explained the symptom was accepted without ever walking a player into that specific door. **Lesson: a confirmed bug that explains a symptom is not proof it is the only cause — reproduce the exact reported action, not an adjacent one.**
- Suite **1053 → 1056/1056**.

## Session 8 — boss fights (`feat(bosses)`)

Reported by hand at the Sand Spur: *"This is not a very Zelda like fight, it literally just goes in a square. You need to assess all boss fights, treat them like a true Zelda boss fight."*

**Assessment (measured, not read).** Two probes, each loading a level twice and parking the player at two different vantage points:
- **8 of 14 bosses produced byte-identical paths regardless of where the player stood** (max divergence 0.00): beats 02, 03, 04, 05, 10, 12, 13, 14. Their movement was a pure function of the clock. **4 of them (02, 03, 04, 12) had no player-targeted attack at all** — the only way to be hurt was to walk into one. The Leviathan Core, the campaign's final boss, did not move until phase 2.
- **beat-13 GUMOI Witness: 0 melee connections, 0 damage, from floor level, in every phase.** It hovers at y≈9.2 (y=5 in phase 3); the player's centre is y=1.95 and `hitboxCheck` rejects `|dy| > move.vertical + hitRadius` (≈2.7). It was killable *only* by the Light Caster — and only because `LIGHT_CASTER` is a `ray` move with no `vertical` field, so the gate evaluated `Math.abs(dy) > undefined + r` → `NaN` → false, and passed the hit through by accident. **Unkillable with a sword; killable by a bug.**
- **beat-06 Obsidian Arachnid: 600 swings, 600 registered hits, 0 damage.** Armoured except mid-leap, and `leapCd` gated on `d > 3`, so standing next to it meant it never leapt, never opened, and never took a point of damage.
- **No boss anywhere had a recovery window.** Attacks fired off bare cooldowns; hitting a boss was equally good at every instant, so there was no reason to read anything and no reward for having read it.

**The fix — one grammar, applied to all 14.** `BossBase` gained a committed-action state machine: PATTERN → WINDUP (telegraph marks the ground, boss stops doing anything else) → STRIKE (resolved against where the player *is*, so stepping off always works) → **RECOVER** (motionless, haloed, `vulnerableMult = 2`). `applyHit` now honours a defender-side multiplier. Telegraphs gained shapes — ring, cone, lane — so different attacks teach different lessons.

**Bugs found while doing it:**
- Leviathan decoys orbited the **world origin**, not the Core — beat-14's arena is nowhere near (0,0), so they circled empty space in another part of the dungeon.
- The Kinetic Core's new charge initially **teleported** to the far wall. A hit that never occupies the ground between here and there cannot be dodged or seen; it now travels.
- A naive "orbit the player at radius R" made four bosses **literally uncatchable** — they backed off exactly as fast as the player approached. `circleStrafe` only ever shrinks its radius.
- The Sand Spur first only surfaced within 1.6 units, so a player who kept walking was never attacked and never given an opening. It now also surfaces on a patience timer.
- **`telegraphShape` drew every cone and lane rotated away from the attack it announced.** Caught by a spec that transforms the mesh's own vertices to world space and checks where the drawn mass sits — *not* by eye. A telegraph that lies is worse than none: the player is punished for reading it correctly. Same failure class as the Session 7 rings drawn a metre underground, rotated instead of buried.

**Verification discipline.** The probe was wrong three times before it was right, and each time it was the probe that was wrong, not the game: (1) forcing `attackCd = 0` killed a 14 hp boss in under a second, before its first action could start, which read as "no window ever opens"; (2) teleporting the player to a fixed offset from the boss every tick put the Sand Spur on a treadmill it could never close; (3) a swing gate of `d < 2.2` was tighter than several bosses' standoff, scoring them "0 connections" when the bot simply never swung. **A red result on a new probe is a claim about the probe until proven otherwise.**

**New specs (+84):** `tests/game/boss-grammar.spec.mjs` (the loop in isolation, plus drawn-telegraph orientation) and `tests/boss-quality-e2e.spec.mjs`, which asserts per boss what "it reaches 0 HP" cannot see — that it **reacts to where the player stands**, that it **opens a vulnerability window**, and that it **falls to a melee weapon from floor level** (no ray weapon, no climbing, no NaN). `boss-combat-e2e`'s kiting heuristic was corrected in the same pass: its 6-unit standoff sat outside the Crypt Warden's 7-unit wake radius, which deadlocked it.

Suite **1056 → 1140/1140**. All 14 bosses: react ✅ · open a window ✅ · die to melee from the floor ✅.

## Session 9 — gremlin audit (diagnosed, not yet fixed)

Reported by hand at beat-13 GUMOI Tower: *"I was able to just run to whatever
level this is without issue, and I might have won if I didn't get stuck in
the boss fight. Be a gremlin, scan the codebase, provide a detailed write-up
on everything you find that could cause similar issues."* Explicitly
audit-only — no code touched this session.

**Two confirmed root causes plus one graphics opportunity**, full detail +
code citations in [AUDIT-progression-and-geometry.md](AUDIT-progression-and-geometry.md):

- **Progression gating has a hole at the one path players actually use.**
  The pause-menu Beat Select (`ui/menu.js:46`) and the `[`/`]` beat-cycle
  keys (`index.js:616-628`) both correctly check `unlockedBeats` — but
  walking up to a dungeon door on the overworld and pressing E
  (`overworld.js:144-151`) calls `game.loadLevel?.(en.to)` with **no check
  at all**. Worse, `loadLevel()` unconditionally persists `currentBeat` to
  the save on every load (`index.js:262-267`), and the menu's own gate
  treats `meta.id === prog.currentBeat` as sufficient to unlock — so one
  un-gated walk through any door **permanently clears that beat's 🔒**,
  independent of `unlockedBeats`/boss kills. This is the entire explanation
  for reaching beat 13 with Bare Strike / 0 keys / Bosses 0/14: no exploit,
  just ordinary overworld exploration.
- **beat-13's boss arena has unclimbable "climbable" terraces.** The engine's
  `CollisionWorld` is 2D XZ-only (no Y at all); `meshAndCollide()` registers
  *any* column with a voxel at y≥1 as a full-height wall forever
  (`level-builder.js:61-75`, comment says as much). The project's own fix
  for this is the `platforms()` builder path, meshed with `collisionWorld:
  null` specifically so tops are standable (`room-graph.js:236-243`) — used
  correctly everywhere else, including beat-13's own `stairworks` room. But
  `witnesscrown` (the GUMOI Witness's own room) puts its five-tier "tower-top
  terraces, climbable to the Witness" inside `build()` instead
  (`beat-13-gumoi.js:199-206`) — every tier registers as an impassable wall.
  Bosses never touch `CollisionWorld` (`bosses/base.js` has zero references),
  so the Witness can freely corner the player against these accidentally-
  solid faces while the player can't step around them — plausible root cause
  for both "stuck in the boss fight" and "camera clipped into large geometry
  blocks" (worsened by the boss-intro camera dip, `index.js:666`, pulling
  the camera tight the instant the room is entered).
- **Graphics opportunity (informational, not a bug):** live research
  (2026-07-19) found `GTAOPass` — dynamic contact AO, unlike the existing
  baked per-vertex voxel AO which can't darken where a moving character
  presses against static geometry — drops into the existing
  `EffectComposer` pipeline in `renderer.js` with no WebGPU/TSL migration
  needed. Gateable behind the `ultra` quality tier. Touches frozen
  `src/engine/`, so it needs explicit sign-off separate from the audit-only
  directive covering the two findings above.

Checked and ruled out: dev mode (`dev-mode.js:18`, off by default), the Tab
map (`ui/map-screen.js`, read-only, no travel calls), mirror travel
(`startSwap`, mood-only). Checked for recurrence: swept every `build()` body
across all 14 beats for the same "climbable terrain in the wrong builder"
mistake — `witnesscrown` is the only occurrence.

Suite unchanged: **1140/1140** (no code modified, no new tests added yet —
neither finding is currently covered by the existing suite).

**New:** [Key.md](Key.md) — a hand-curated data-dictionary source of truth
(save schema, beat/boss/weapon/upgrade ids, door/blocker types, quality
tiers, mood/palette keys, menu screens, input bindings), gathered to make
cross-file key mismatches like Finding 1 above checkable against one doc
instead of a grep sweep.

## AUDITv2 reconstruction, tickets C–G (2026-07-20) — suite 1140 → 1436

Full audit in [AUDIT-progression-and-geometryv2.md](AUDIT-progression-and-geometryv2.md);
visual sign-off in [CERTIFICATION.md](CERTIFICATION.md) Session 7.

- **C** — deterministic presentation. `mood-controller.reapplyVisual` re-derives
  the post stack from (quality, mood) together, so the final frame no longer
  depends on which was set last.
- **D** — two-subject boss framing in `camera-rig.js`; foreground occlusion fade
  (`fx/occlusion.js`); HUD toast dedupe.
- **E** — per-region overworld grammars (`overworld/grammars.js`): eight
  silhouettes that read apart in grayscale, Crust and Abyss differing in *form*
  rather than palette, with route/spawn/feature protection. Replaced the
  palette-only `buildTerrain`.
- **F** — named-pivot actor rigs (`characters/{actor-rig,actor-animator,pose-library,archetypes}.js`),
  so enemy kinds diverge in rest pose and gait, not only colour.
- **G** — material families via a bounded `onBeforeCompile` (`render/materials.js`):
  roughness/metalness by vertex-colour class with albedo untouched so luminance
  bands hold; mean-preserving mottling; pooled local lights; synchronous shader
  prewarm; 14 per-dungeon material kits.

**Ticket H (Ultra GTAO) deliberately not taken** — no AO pass exists, so low/med/
high would pay nothing for it, and the audit only retains it if paired on-GPU
captures and frame measurements prove its worth, which headless CI cannot
produce. **Ticket I is the owner's:** regenerating the 44 stale binary captures,
which pairs with the by-hand 60 fps playthrough.

Two engine-adjacent lessons worth keeping: raising `metalness` *darkens* geometry
under this engine's minimal environment lighting (metals have no diffuse and
there is no envmap), which pushed the metal-heavy Abyss beats below their
luminance floor — keep the boost ≤ ~0.15. And `renderer.compileAsync` is
unusable in CI: it polls `KHR_parallel_shader_compile` and throws under software
GL, so prewarm uses the synchronous `renderer.compile`.

## ZeldaLevel design pass, tickets Z1–Z7 (2026-07-21) — suite 1436 → 1879

Design audit written to [ZeldaLevel.md](ZeldaLevel.md) and then executed. The
audit's headline finding — *1,455 automated tests passed while the GUMOI boss
room was inescapable* — set the shape of the work: **every ticket ships the rule
and the spec that makes violating it a build failure.**

| ticket | rule established | spec |
|---|---|---|
| Z1 camera contract | no contiguous overhead mass over play space (>4 cells above y=3) | `camera-contract` |
| Z2 legible traversal | every climbable one-cell rise is visibly marked as one | `traversal-legibility` |
| Z3 guard + parry | every telegraph has an answer that is not retreat | `guard` |
| Z4 lock-on | the player can always face what they are fighting | `lock-on` |
| Z5 bestiary | an enemy exists to ask a different question; no two dungeons share a roster | `bestiary` |
| Z6 dungeon pedagogy | every dungeon introduces → develops → combines → tests one idea | `dungeon-pedagogy` |
| Z7 secret taxonomy | reward type is data, not a guess about a display label | `secret-taxonomy` |

Measured deltas: worst overhead cluster 9 → 2 cells; 565 climbable rises marked;
enemy kinds 3 → 7 with all 14 rosters distinct; Scar Sutures redistributed to
exactly one per dungeon (14 + 2 overworld = 16 = four optional hearts).

**Two defects the unit suite could not see.** `dev-mode.js` permanently wrapped
`player.health.damage` with a two-argument function, discarding `source` and
`meta` — the guard resolves direction from `meta.from`, so the shield never
engaged in the *running game* while every unit test passed, because the tests
construct `HealthPool` directly. And rewards were dispatched by string-matching
pickup labels, which surfaced only when Z7 renamed eight of them and the heart
ledger broke.

## ZeldaLevel follow-up pass (2026-07-21) — suite 1879 → 1971

Owner playtest of the Z1–Z7 work produced one line — *"Cannot kill this mob"* —
that 1,879 green tests had missed. Full write-up in [ZeldaLevel.md](ZeldaLevel.md) §6,
certification in [CERTIFICATION.md](CERTIFICATION.md) Session 9.

- **`enemy.js` — `turnRate`.** Z5 gave the bulwark a front plate and, in the
  same pass, made facing snap at the player every frame, so the plate tracked
  its attacker and the kind was unkillable by melee. `Infinity` for every other
  kind (bit-for-bit unchanged); 2.2 rad/s for plated.
- **`enemy.js` — `_separateFrom()`.** Nothing stopped the player standing inside
  an enemy, and at zero separation `inFrontArc` has no bearing to work from. The
  enemy yields, never the player.
- **`enemy.js` — `freeSpotNear()`.** Brood children were placed blind at radius
  1.1; killing one against a wall buried half the litter in masonry, where
  nothing could reach it and every room-clear gate waited forever.
- **`ui/coach.js` (new).** One-shot hints fired at the moment a mechanic refuses
  input, via an injected sink — combat code has no HUD handle.
- **49 `ai:` overrides stripped** from `beat-*.js`: 65 of ~120 authored enemies
  contradicted their own kind (18 lancers that never lunged, 12 motes that never
  burst). ~11 deliberate variants kept.
- **`world/threat-curve.js` (new).** Enemy and boss HP scale with the beat they
  spawn in. Authored HP was flat while player damage tripled, so beats 05–14 all
  died in under two hits and nine of fourteen bosses died faster than the beat-01
  tutorial boss. Beats 1–4 untouched; beat 05 deliberately the softest of the
  back half (it grants the Wedge). Applied in `room-graph.bakeRoom` and after the
  boss factory.
- New specs `threat-curve`, `coach`; probes `tests/qa/{time-to-kill,difficulty-curve,ai-override-audit}.mjs`.

## Audio-visual pass (2026-07-22) — suite 1971 → 2315

Owner brief: *"All music needs to be changed to music that a human will
actually enjoy listening to, we need sounds for attacks and other things the
player does, we need graphics for grappling and other tools you collect."*

**Music — `src/game/audio/{theory,instruments,tracks,score}.js` (new).**
The previous soundtrack was three sine drones and a tick every 0.9 s,
transposed per dungeon by a frequency ratio; a ratio is not a key and a drone
is not a tune. Replaced with a generated score: real modes, chord progressions
with voice leading, melodies notated as scale degrees, nine synth voices, a
shared convolution reverb and a tempo-synced delay. Four base pieces with
twenty-two variations, so the campaign shares musical DNA. Timing moved off the
render loop onto a ~200 ms lookahead against the AudioContext clock — the old
pulse advanced by `dt`, so a dropped frame was a late note. Layers fade in on a
scene-derived intensity, so combat thickens the tune rather than switching it.

Register bug caught by `tests/qa/score-readout.mjs`, which prints the score as
note names: voice leading alone walked the Am–F–C–G pad down two octaves across
four bars and then leapt back on the loop. `theory.recenter` shifts voicings by
whole octaves (harmony-preserving) to hold the register.

**Sound — `src/game/audio/sfx-bank.js` (new).** 30 sounds over the kit's
generic primitives. The headline fix: a parry and a failed block both called
`sfx.block()`, so the game's most and least skilful outcomes were acoustically
identical. Parry is now the loudest sound in the bank at ~4× a block. Per-weapon
swings weighted by mass; four distinct combat outcomes; and audio added to
lock-on, guard raise/lower/break, doors, locked doors, boss doors, the grapple's
launch/bite/reel, menus, low health, and five kinds of pickup that previously
shared one chime.

**Visuals.**
- `assets/weapon-models.js` + `fx/held-weapon.js` — all five weapons rendered as
  an empty fist. Models parent to the rig's `armR` pivot so they inherit every
  swing the animator already drives. A legibility fix, not a cosmetic one: the
  Wedge reaches 2.2 and the Mallet sweeps 90°.
- `fx/grapple-rope.js` — the grapple had no rope, hook or anchor markers at all.
  Rope with a leading hook and slack take-up, plus pulsing markers on anchors in
  reach (which teaches the range). `blockers.js` exposes `anchorPoints`;
  room-graph exposes `grappleAnchors()`.
- `assets/pickup-shapes.js` — every pickup was the same octahedron in a
  different colour. Seven reward types, seven silhouettes. Colour alone does not
  survive the Abyss grade, bloom, or a colour-blind player.

**Suite reliability.** The luminance certification gate took max-of-two
samples, which catches flicker peaks rather than rejecting them — Beat 13
(flicker 0.45) failed intermittently at 96.6 against a 75 ceiling while
actually sitting at ~36. Now median-of-five. Beat 01's tomb also gained
gold-leaf wall seams: it sat ~0.2 above the crust floor, and pale accent
geometry is the documented remedy rather than a lighting change. Full suite now
passes twice consecutively at 2315/2315.

New specs `music` (309 assertions) and `game-feel-visuals`; probes
`tests/qa/score-readout.mjs`. One additive engine export under SS-027:
`synth.channelGain(channel)`, so game-side persistent buses honour the same
volume settings.

### Session 12 — the hero was swinging backwards

**Reported from a screenshot:** the sword did not arc out in front, did not
appear to move, and pointed backwards. Three separate defects stacked on top of
each other, which is why it looked so comprehensively broken.

Rig-local **+Z** is forward (`player.js` sets `rig.rotation.y = atan2(fv.x,
fv.z)`), the arm hangs along −Y, and THREE resolves an `'XYZ'` euler as `Rx·Rz·v`
— so the arm points forward only when `rx` is negative. **The melee profiles
were signed the other way**: every weapon wound up in front of the hero's face
and struck behind their back. The blade was independently 180° out, because
models are built blade-up (`+Y`) and were mounted raw on an arm running `−Y`;
at rest the blade stood straight up past the head, which is the white glow above
the shoulder in the owner's screenshot. And there was no arc at all — `evalCombat`
only ever wrote `armRx`, a vertical chop, while `ArcSmear` drew a fan and
`combatSweep` resolved a cone.

Measured with a new probe (`tests/qa/swing-readout.mjs`): the blade tip used to
reach **0.27 units** in front of a hero whose weapon reaches 1.8, and only during
*recover*, after the hitbox had resolved. It now reaches **1.32**, with 2.3 units
of lateral travel. Verified again end-to-end in the running game.

**Why a green suite missed it:** the spec asserted the *sign of a pivot angle*,
which a backwards swing satisfies exactly as well as a forwards one. Replaced
with world-space assertions — yaw the actor, mount a marker at the measured tip,
require it to end up in front and sweep laterally. Restoring the old orientation
fails eight of them.

**The shield became a real item.** Guard and parry were innate and completely
invisible — no mesh, no pose, the off hand empty. The Bulwark Shield is now
found on the predecessor's body partway through Beat 01, whose declared theme is
`telegraph` / "Read the Wind-Up": the two rooms before it hold one enemy each and
must be dodged, the shield arrives as a second answer, and the antechamber
combines both. `evalGuard` gives it a pose; save v4 grants it to anyone already
past Beat 01 so nobody loses a verb they had.

**Controls had three disagreeing lists** — and the on-screen sheet, which never
mentioned guard or lock-on, kept two hardcoded copies of itself that had drifted
apart. `CONTROLS` in `input.js` is now the source of truth for both the HUD and
the docs, and `tests/game/controls.spec.mjs` reads the input handler's own source
to fail on drift in either direction.

`docs/VISUAL_PLAN.md` was rewritten from an audit into six executable tickets,
and `HANDOFF.md` added. Suite 1927 unit / **2575 total**.

### Session 11 — the drone under the music, and a look at the renderer

**The hum the score was written to remove was still playing.** The owner
reported a drone under the new soundtrack, and they were right three times
over — but only one of the three was in the score engine. `MoodController`
started a raw oscillator on every mood change (square 80 Hz in the Crust,
triangle 220 Hz in the Abyss) that predated the score and survived the rewrite;
the chord voice held 105% of a bar so consecutive chords overlapped; and the
reverb return at 0.9 filled the remaining gaps back in. Chords are now *struck*
on a per-track `comp` rhythm with their length derived from the distance to the
next strike, the mood drone and its preset data are gone, and the Abyss noise
pulse moved to the effects bus.

**The measurement mattered more than the fix.** Every audio check the project
had could only prove sound was being produced, which was never the claim in
dispute. `score.renderOffline` renders the real scheduler through the real
voices into an `OfflineAudioContext`, and `tests/audio-render-e2e.spec.mjs`
asserts the signal falls to near-silence between notes: the previous
arrangement measures 11.4% of peak in its quietest windows and fails; the
current one measures 1.1–3.7%. Dynamic range went from 7.4× to 21–70×.

The envelope probe (`tests/qa/audio-envelope.mjs`) earned its keep on the first
run by catching the spec **passing for the wrong reason** — an offline render
started before the page has ever had a live AudioContext returns truncated, and
five seconds of digital silence is a superb 5th percentile. `renders to the end`
is asserted before anything else now. Suite 2478/2478.

**Renderer audit.** Measured, not guessed, and written up in
[docs/VISUAL_PLAN.md](docs/VISUAL_PLAN.md) rather than acted on: the sun's
shadow frustum is a ±30 box at the world origin and never moves, while rooms sit
on a 64-unit grid — so **five of Beat 01's six rooms have no sun shadows**, and
the reason nobody noticed is that every dungeon starts in the room at the grid
origin. Only 1 of 96 meshes receives shadows. `scene.environment` is null and
the engine's PMREM builder is never called, which is why `materials.js`
deliberately caps metalness at 0.12. Ambient sits at 1.7 against a key of 1.9.
And the luminance certification gate measures the *mean*, which cannot tell a
well-lit room from a flat one — so it has been quietly rewarding flatness. The
gate needs a contrast floor before the lighting work can happen.

## Known remaining polish (not blockers)
- Boss fights are arena-scripted phases (not full cinematic cutscenes / unique OST stems)
- Music is generated in-engine rather than composed and recorded — deliberate (zero-build, offline, no binaries), but whether it is *enjoyable* is a judgement only ears make
- Some arena floors share shell scale — visual variety is props + boss mesh + mood, not bespoke terrain tools

## Known issues (not yet fixed)
- Overworld dungeon entrances skip beat-unlock gating, and `loadLevel` retro-unlocks the Beat Select entry as a side effect — see Session 9 above and [AUDIT-progression-and-geometry.md](AUDIT-progression-and-geometry.md).
- beat-13 `witnesscrown` boss-arena terraces are built as solid walls instead of climbable platforms — same doc.

## How to run
```bash
cd sovereign-scar
npm test          # full suite (2478)
npm run test:unit
npm run serve     # http://127.0.0.1:8799/
```
Controls: [docs/CONTROLS.md](docs/CONTROLS.md) · Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Rendering roadmap: [docs/VISUAL_PLAN.md](docs/VISUAL_PLAN.md)
