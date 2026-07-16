// Sovereign Scar — game boot and main loop.
// Architecture: all product code here; engine frozen except SS-027 drones.

import * as THREE from 'three';
import { scene, camera, renderer, composer, onResize, outputPass, vignettePass } from '../engine/renderer.js';
import { initLights } from '../engine/lights.js';
import { initQuality, setQuality, getQuality } from '../engine/quality.js';
import { ParticleSystem } from '../engine/particles.js';
import { CollisionWorld } from '../engine/collision.js';
import { updateSmears } from '../engine/smear.js';
import { initAudio, sfx, setVolumes, refreshDroneVolumes } from '../audio/synth.js';
import { world } from '../context.js';

import { Input } from './input.js';
import { CameraRig } from './camera-rig.js';
import { juice } from './fx/juice.js';
import { SoulMotes } from './fx/soul-motes.js';
import { bossSubtitle } from './bosses/subtitles.js';
import { Player } from './player.js';
import { HUD } from './ui/hud.js';
import { MoodController } from './fx/mood-controller.js';
import { createFlickerPass, updateFlickerPass } from './fx/flicker-shader-pass.js';
import { createWrapPass, updateWrapPass } from './render/wrap-shader-pass.js';
import { LEVELS, DEV_LEVELS, getLevel, nextLevelId, prevLevelId } from './levels/registry.js';
import { loadSovereignProgress, saveSovereignProgress, unlockBeat, recordBossDefeat, resetSovereignProgress } from './kernel/progress.js';
import { MenuOverlay } from './ui/menu.js';
import { MapScreen } from './ui/map-screen.js';
import { EndingSequence } from './ui/credits.js';
import { Inventory } from './kernel/inventory.js';
import { bossHeartMax } from './kernel/health.js';
import { tryPurchase, damageMult, dashIframeBonus, grappleRange, UPGRADES } from './kernel/upgrades.js';
import { getWeapon } from './combat/weapons.js';
import { dev } from './dev/dev-mode.js';

// ── Boot ──────────────────────────────────────────────────────────────────
// S4: capture the engine lights so MoodController can drive ambient/key.
const gameLights = initLights();
const ambientLight = scene.children.find((c) => c.isAmbientLight);
try { initQuality(); } catch (_) { /* quality may reference missing env maps */ }

// Hide ambient petals — fight Crust mood (buildplan risk mitigation)
const particles = new ParticleSystem(scene);
if (particles.petalMesh) particles.petalMesh.visible = false;

const collisionWorld = new CollisionWorld();
const input = new Input(window);
const hud = new HUD();
const mood = new MoodController();
mood.bindLights({
    keySun: gameLights?.keySun,
    fillNeon: gameLights?.fillNeon,
    rimWarm: gameLights?.rimWarm,
    ambient: ambientLight,
});
const camRig = new CameraRig({ height: 12, back: 8 });

// Custom passes before OutputPass
const flickerPass = createFlickerPass();
const wrapPass = createWrapPass();
{
    const passes = composer.passes;
    const outIdx = passes.indexOf(outputPass);
    if (outIdx >= 0) {
        passes.splice(outIdx, 0, flickerPass, wrapPass);
    } else {
        composer.addPass(flickerPass);
        composer.addPass(wrapPass);
    }
}

juice.bindVignette(vignettePass);

// ── Settings & volume state (E1 + A8) ─────────────────────────────────────
const bootSettings = loadSovereignProgress().settings || {};
const volState = {
    master: bootSettings.masterVol != null ? bootSettings.masterVol : 0.4,
    sfx: bootSettings.sfxVol != null ? bootSettings.sfxVol : 1,
    music: bootSettings.musicVol != null ? bootSettings.musicVol : 0.8,
    muted: !!bootSettings.muted,
    fade: 0,       // boot fade-in 0→1 over ~2s, starts at audio unlock
    fading: false,
};
juice.reduceShake = !!bootSettings.reduceShake;
juice.reduceFlash = !!bootSettings.reduceFlash;

function applyVolumes() {
    setVolumes({
        master: volState.muted ? 0 : volState.master * volState.fade,
        sfx: volState.sfx,
        music: volState.music,
    });
    refreshDroneVolumes();
}
function persistAudioSettings() {
    const cur = loadSovereignProgress().settings || {};
    saveSovereignProgress({
        settings: {
            ...cur,
            masterVol: volState.master,
            sfxVol: volState.sfx,
            musicVol: volState.music,
            muted: volState.muted,
        },
    });
}
applyVolumes();

const player = new Player(scene, collisionWorld, () => false);
const soulMotes = new SoulMotes(scene);

// Juice feeds (A1–A3, A5)
player.health.onDamage = () => {
    juice.addTrauma(0.3);
    juice.hitstop(0.09);
    juice.spikeDamageVignette();
};
juice.onKill = (defender) => {
    const p = defender?.root?.position;
    if (p) soulMotes.burst(p);
};

// C3: apply purchased upgrades to the player's derived stats
function applyUpgradeStats() {
    const ups = loadSovereignProgress().upgrades || {};
    player.damageMult = damageMult(ups);
    player.dashIframeBonus = dashIframeBonus(ups);
    player.grappleRange = grappleRange(ups);
}
applyUpgradeStats();

// Shared game context
const game = {
    scene,
    camera,
    renderer,
    particles,
    collisionWorld,
    player,
    input,
    hud,
    mood,
    level: null,
    levelId: 'beat-01-crypt',
    paused: false,
    atTitle: false,
    playTime: 0,
    loadLevel, // W4: levels can trigger cross-level travel (dungeon ⇄ overworld)
    unlockAndSave(id) {
        unlockBeat(id);
        hud.toast(`Unlocked: ${id}`);
    },
    recordBoss(id) {
        const p = recordBossDefeat(id);
        sfx.fanfare?.();
        // C2: heart cap grows every 3rd boss
        const target = bossHeartMax((p.bossesDefeated || []).length);
        if (target > player.health.max) {
            player.health.setMax(target);
            saveSovereignProgress({ maxHp: player.health.max });
            hud.toast(`Heart gained — construct integrity ${player.health.max}`, 3000);
        }
    },
    activeBoss: null,
};

world.game = game;
world.player = player;
world.collision = collisionWorld;

// Dev mode (Phase D): gate + badge + god mode; inert unless enabled
dev.init(game, { loadLevel, LEVELS, DEV_LEVELS, applyUpgradeStats, input });

// ── Level lifecycle ───────────────────────────────────────────────────────
function unloadLevel() {
    if (game.level) {
        try { game.level.dispose(); } catch (e) { console.warn('level dispose', e); }
        game.level = null;
    }
    collisionWorld.clear();
    // Keep border-safe empty world
}

function loadLevel(id) {
    unloadLevel();
    const meta = getLevel(id);
    game.levelId = meta.id;
    const ctx = {
        scene,
        collisionWorld,
        particles,
        player,
        camera,
        renderer,
    };
    const level = meta.load(ctx);
    game.level = level;

    player.setGetVoxelAt(level.getVoxelAt || (() => false));
    player.setFriction(level.friction || 'default');
    player.collisionWorld = collisionWorld;
    player.physics.collisionWorld = collisionWorld;

    const sp = level.spawn || { x: 0, y: 1.2, z: 0 };
    player.setSpawn(sp.x, sp.y != null ? sp.y : 1.2, sp.z);
    // S5: fit the camera to the room size
    camRig.height = 8 + (level.halfSize || 12) * 0.35;
    camRig.back = camRig.height * 0.66;
    camRig.snapTo(player.root.position);

    const moodName = level.mood || meta.mood || 'crust';
    mood.apply(moodName, {
        audio: true,
        music: level.musicBed || (level.boss ? 'boss' : (moodName === 'abyss' ? 'abyss' : 'crust')),
    });
    if (level.boss || level.musicBed === 'boss' || level.musicBed === 'leviathan') {
        mood.setMusicProfile(level.musicBed || 'boss');
    }
    updateFlickerPass(flickerPass, 0, level.flicker || 0);
    updateWrapPass(wrapPass, 0, level.wrap || 0);
    game.activeBoss = level.boss || null;

    // Boss intro moment (A6): name card + camera push shortly after load
    game.bossIntro = (level.boss && !level.boss.defeated)
        ? { t: 0.6, boss: level.boss, fired: false }
        : null;

    if (level.onEnter) {
        try { level.onEnter(game); } catch (e) { console.warn(e); }
    }
    try { hud.story?.clear?.(); } catch (_) {}
    if (level.story) {
        try { hud.story.queue(level.story, { replace: true }); } catch (_) {}
    }
    if (level.banner) hud.toast(level.banner, 3200);

    saveSovereignProgress({
        currentBeat: meta.id,
        inventory: player.inventory.toJSON(),
        hp: player.health.hp,
        mood: mood.mood,
    });

    console.info('[Sovereign Scar] loaded', meta.id, meta.name);
}

// ── Menu system (B1/B2/B3) ────────────────────────────────────────────────
let showTimer = !!bootSettings.showTimer;

function persistSetting(key, value) {
    const cur = loadSovereignProgress().settings || {};
    saveSovereignProgress({ settings: { ...cur, [key]: value } });
}

function startNewGame() {
    const cur = loadSovereignProgress();
    saveSovereignProgress({
        lastRun: {
            currentBeat: cur.currentBeat,
            bossesDefeated: cur.bossesDefeated || [],
            playTime: cur.playTime || 0,
            deaths: cur.deaths || 0,
            archivedAt: Date.now(),
        },
    });
    resetSovereignProgress(); // merge keeps settings + lastRun
    player.inventory = new Inventory();
    player.health.max = 6;
    player.health.fullRestore();
    game.playTime = 0;
    menu.close();
    game.atTitle = false;
    game.paused = false;
    loadLevel('beat-01-crypt');
}

function goToTitle() {
    saveSovereignProgress({
        inventory: player.inventory.toJSON(),
        hp: player.health.hp,
        playTime: game.playTime,
    });
    game.paused = true;
    game.atTitle = true;
    menu.openTitle();
}

const mapScreen = new MapScreen(); // W6

const menu = new MenuOverlay({
    ctx: {
        levels: () => LEVELS,
        progress: () => loadSovereignProgress(),
        beatName: (id) => getLevel(id).name,
        hasProgress: () => {
            const p = loadSovereignProgress();
            return (p.bossesDefeated || []).length > 0
                || p.currentBeat !== 'beat-01-crypt'
                || (p.playTime || 0) > 60
                || (p.deaths || 0) > 0;
        },
        shards: () => player.inventory.scarShards,
        upgrades: () => loadSovereignProgress().upgrades || {},
        settings: () => ({
            masterVol: volState.master,
            musicVol: volState.music,
            sfxVol: volState.sfx,
            quality: getQuality(),
            reduceShake: juice.reduceShake,
            reduceFlash: juice.reduceFlash,
            showTimer,
        }),
    },
    onEvent: (ev) => {
        if (ev.type === 'set') {
            switch (ev.id) {
                case 'masterVol':
                    volState.master = ev.value;
                    volState.fade = 1; volState.fading = false;
                    applyVolumes(); persistAudioSettings();
                    break;
                case 'musicVol':
                    volState.music = ev.value;
                    applyVolumes(); persistAudioSettings();
                    break;
                case 'sfxVol':
                    volState.sfx = ev.value;
                    applyVolumes(); persistAudioSettings();
                    break;
                case 'quality':
                    try { setQuality(ev.value); } catch (_) {}
                    persistSetting('quality', ev.value);
                    break;
                case 'reduceShake':
                    juice.reduceShake = ev.value;
                    persistSetting('reduceShake', ev.value);
                    break;
                case 'reduceFlash':
                    juice.reduceFlash = ev.value;
                    persistSetting('reduceFlash', ev.value);
                    break;
                case 'showTimer':
                    showTimer = ev.value;
                    persistSetting('showTimer', ev.value);
                    break;
            }
            return;
        }
        switch (ev.id) {
            case 'resume':
                menu.close();
                game.paused = false;
                break;
            case 'continue':
                menu.close();
                game.atTitle = false;
                game.paused = false;
                break;
            case 'newgame':
                menu.state.push('confirmNew');
                menu.render();
                break;
            case 'confirmNewYes':
                startNewGame();
                break;
            case 'back':
                menu.back();
                break;
            case 'beat':
                menu.close();
                game.atTitle = false;
                game.paused = false;
                loadLevel(ev.arg);
                break;
            case 'quitTitle':
                goToTitle();
                break;
            case 'buy': {
                const ups = { ...(loadSovereignProgress().upgrades || {}) };
                const res = tryPurchase(player.inventory, ups, ev.arg);
                if (res.ok) {
                    saveSovereignProgress({
                        upgrades: ups,
                        inventory: player.inventory.toJSON(),
                    });
                    applyUpgradeStats();
                    sfx.pickup?.();
                    hud.toast(`${UPGRADES[ev.arg].name} tier ${res.level} — ${res.cost} shards`, 2600);
                } else if (res.reason === 'shards') {
                    hud.toast('Not enough Scar Shards', 1600);
                }
                break;
            }
        }
    },
});

game.openAltar = () => {
    game.paused = true;
    menu.openAltar();
};

// ── Ending sequence (B4) ──────────────────────────────────────────────────
const ending = new EndingSequence({
    onDone: () => {
        goToTitle();
    },
});
game.startEnding = () => {
    if (ending.isActive) return;
    const p = saveSovereignProgress({
        campaignComplete: true,
        inventory: player.inventory.toJSON(),
        playTime: game.playTime,
    });
    ending.start({
        playTime: game.playTime,
        deaths: p.deaths || 0,
        bosses: (p.bossesDefeated || []).length,
        shards: player.inventory.scarShards,
        keys: player.inventory.memoryKeyCount,
    });
};

// Restore progress
const progress = loadSovereignProgress();
if (progress.inventory) {
    // S-extra migration: pre-Bare-Strike saves with zero progress started
    // holding the Anchor Link (the Beat 01 objective) — reset to new default.
    if ((progress.bossesDefeated || []).length === 0
        && progress.inventory.weapons?.length === 1
        && progress.inventory.weapons[0] === 'anchor_link') {
        progress.inventory.weapons = ['bare_strike'];
        progress.inventory.activeWeapon = 'bare_strike';
    }
    player.inventory = Inventory.fromJSON(progress.inventory);
}
if (progress.maxHp) player.health.setMax(progress.maxHp);
if (progress.hp) player.health.hp = Math.min(progress.hp, player.health.max);
if (progress.playTime) game.playTime = progress.playTime;
if (bootSettings.quality) {
    try { setQuality(bootSettings.quality); } catch (_) {}
}
const startId = progress.currentBeat || 'beat-01-crypt';
loadLevel(startId);

// Boot lands at the title screen over the live scene (B3)
game.atTitle = true;
game.paused = true;
menu.openTitle();

// Audio unlock on first gesture
function unlockAudio() {
    initAudio();
    mood.apply(mood.mood, { audio: true });
    // E1: swell in over ~2s instead of slamming to full volume
    volState.fade = 0;
    volState.fading = true;
    applyVolumes();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
}
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
window.addEventListener('resize', onResize);
// S3 (P0-3): the engine sized itself once at import; the window may have
// changed since (or reported 0×0 in a background tab).
onResize();
document.addEventListener('visibilitychange', () => { if (!document.hidden) onResize(); });

// ── Main loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let deathTimer = 0;
let deathShown = false;
let saveAcc = 0;
let titleDrift = 0;

function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    renderer.info.reset();

    // S3: continuous size guard — hidden-tab boot can leave the canvas at
    // 0×0 with no resize event ever firing (cheap integer compare per frame).
    if (window.innerWidth > 0) {
        const want = Math.floor(window.innerWidth * renderer.getPixelRatio());
        if (renderer.domElement.width !== want) onResize();
    }

    // Juice ticks on RAW dt so hitstop can end itself and flashes restore
    juice.update(dt);
    const sdt = dt * juice.timeScale;

    // Gamepad (B5): poll once per frame; d-pad/A/B nav feeds menus + ending
    input.pollGamepad();
    const menuCodes = input.consumeMenuCodes();
    if (menuCodes.length) {
        for (const code of menuCodes) {
            if (ending.isActive) {
                if (code === 'Enter') ending.advance();
            } else if (menu.isOpen) {
                menu.handleCode(code);
            }
        }
    }

    // E1: boot audio fade-in
    if (volState.fading) {
        volState.fade = Math.min(1, volState.fade + dt / 2);
        applyVolumes();
        if (volState.fade >= 1) volState.fading = false;
    }
    if (input.consumeMuteToggle()) {
        volState.muted = !volState.muted;
        volState.fade = 1;
        volState.fading = false;
        applyVolumes();
        persistAudioSettings();
        hud.toast(volState.muted ? 'Muted' : 'Sound on', 900);
    }

    if (input.consumePause()) {
        if (menu.isOpen) {
            menu.back(); // pops a submenu; resumes from pause root; inert on title root
        } else {
            game.paused = true;
            menu.openPause();
        }
    }

    // While a menu is up, gameplay inputs must not leak through
    if (menu.isOpen) {
        input.consumeAttack();
        input.consumeDash();
        input.consumeInteract();
        input.consumeWeaponCycle();
        input.consumeMoodToggle();
        input.consumeGrapple();
        input.consumeStoryAdvance();
        input.consumeLevelNext();
        input.consumeLevelPrev();
        input.consumeAnyKey();
        input.consumeDevKey();
        input.consumeMapToggle();
    }

    // W6: Tab map (inert on title / during the ending)
    if (input.consumeMapToggle()) {
        if (!game.atTitle && !ending.isActive) mapScreen.toggle(game);
    }
    if (mapScreen.isOpen) {
        // map is modal: drain gameplay inputs like the menu does
        input.consumeAttack();
        input.consumeDash();
        input.consumeInteract();
        input.consumeWeaponCycle();
        input.consumeGrapple();
        input.consumeStoryAdvance();
        if (input.consumePause()) mapScreen.close(game); // Esc closes
    }

    // Dev mode (Phase D): one gate — when disabled every dev key is a no-op
    if (input.consumeDevToggle()) dev.toggle(game);
    {
        const dk = input.consumeDevKey();
        if (dk && dev.enabled) dev.handleKey(dk, game);
    }
    if (dev.enabled) dev.update(dt, game);

    // Title attract: slow orbit around the player while the world is frozen
    if (game.atTitle) {
        titleDrift += dt;
        const c = player.root.position;
        camRig.update(dt * 0.5, {
            x: c.x + Math.sin(titleDrift * 0.1) * 5,
            y: c.y,
            z: c.z + Math.cos(titleDrift * 0.1) * 5,
        });
    }

    if (input.consumeLevelNext()) {
        const nid = nextLevelId(game.levelId);
        const prog = loadSovereignProgress();
        const unlocked = new Set(prog.unlockedBeats || []);
        // Always allow sandbox + currently unlocked; also allow free roam if already visited
        if (unlocked.has(nid) || nid === 'sandbox-combat' || prog.currentBeat === nid) {
            loadLevel(nid);
        } else {
            // D7: force-skip requires dev mode — no Shift bypass in normal play
            if (dev.enabled) {
                loadLevel(nid);
                hud.toast(`Dev skip → ${nid}`);
            } else {
                // Progressive unlock is real; offer unlock toast
                hud.toast(`Locked: defeat the prior boss first`);
            }
        }
    }
    if (input.consumeLevelPrev()) {
        const pid = prevLevelId(game.levelId);
        loadLevel(pid); // always allow backtracking
    }
    if (input.consumeMoodToggle()) {
        // W5: the overworld can claim the toggle (mirror travel); otherwise
        // D7: mood flip is a dev tool, not a player verb
        if (game.level?.onMoodToggle?.(game)) {
            // handled by the level
        } else if (dev.enabled) {
            mood.toggle();
            hud.toast(`Mood: ${mood.mood}`);
        }
    }
    if (input.consumeStoryAdvance()) {
        if (ending.isActive) ending.advance();
        else hud.story?.advance?.();
    }

    // Ending sequence runs on raw dt and freezes gameplay while active
    ending.update(dt);

    if (!game.paused && !ending.isActive) {
        game.playTime += dt;
        mood.update(sdt);
        // Story timer advanced once from HUD.update({dt}) — do not double-tick here.

        // Boss intro (A6)
        if (game.bossIntro && !game.bossIntro.fired) {
            game.bossIntro.t -= sdt;
            if (game.bossIntro.t <= 0) {
                game.bossIntro.fired = true;
                const b = game.bossIntro.boss;
                if (b && !b.defeated) {
                    hud.bossCard(b.bossName, bossSubtitle(b.bossId));
                    camRig.focus({ height: 6, back: 3.5, duration: 1.8, target: b.root?.position || null });
                    sfx.phase();
                }
            }
        }

        const enemies = game.level?.enemies || [];
        const destructibles = game.level?.destructibles || [];
        player.update(sdt, input, enemies, destructibles, camera, renderer);

        // Levels first so beat-specific G handlers (anchors / shield strip) can
        // consume grapple before the global facing pull.
        if (game.level) game.level.update(sdt, game);

        // Global grapple fallback (levels without anchors); range scales with
        // the Long-arm upgrade (C3)
        if (input.consumeGrapple() && player.inventory.hasItem('magnetic_grapple')) {
            if (!player.grapple.active) {
                const fv = player.state.facingVec;
                const reach = player.grappleRange || 8;
                const target = {
                    x: player.root.position.x + fv.x * reach,
                    y: player.root.position.y,
                    z: player.root.position.z + fv.z * reach,
                };
                player.grapple.start(player.root.position, target, 10);
                sfx.whoosh();
            }
        }

        // Level-driven FX
        updateFlickerPass(flickerPass, sdt, game.level?.flicker || 0);
        updateWrapPass(wrapPass, sdt, game.level?.wrap || 0);

        if (particles.update) particles.update(sdt);
        updateSmears(sdt);
        camRig.setBounds(game.level?.cameraBounds || null); // W2 room-lock
        camRig.update(sdt, player.root.position);

        // Soul motes home to the player and pay out shards (A5)
        soulMotes.update(
            sdt,
            player.health.dead ? null : player.root.position,
            () => { player.inventory.addShards(1); }
        );

        // Autosave inventory/hp every 10s so shard pickups survive a close
        saveAcc += dt;
        if (saveAcc > 10) {
            saveAcc = 0;
            saveSovereignProgress({
                inventory: player.inventory.toJSON(),
                hp: player.health.hp,
                playTime: game.playTime,
            });
        }

        // Void kill — freefall below arena
        if (!player.health.dead && player.root.position.y < -12) {
            player.health.damage(player.health.max, 0);
            hud.toast('Fell into the Scar…');
        }

        // Death → sequence → respawn (A7)
        if (player.health.dead) {
            if (!deathShown) {
                deathShown = true;
                juice.hitstop(0.3);
                juice.addTrauma(0.8);
                hud.showDeath();
                input.consumeAnyKey(); // drain stale presses so skip needs a fresh key
            }
            deathTimer += dt; // raw dt — hitstop must not stretch the sequence
            if (deathTimer > 0.6 && input.consumeAnyKey()) deathTimer = 1.5;
            if (deathTimer > 1.4) {
                deathTimer = 0;
                deathShown = false;
                const p = loadSovereignProgress();
                saveSovereignProgress({ deaths: (p.deaths || 0) + 1 });
                player.respawn();
                // Snap to solid if spawn still bad
                if (player.physics.getVoxelAt) {
                    const sp = player.spawnPoint;
                    if (!player.physics.getVoxelAt(sp.x, sp.y - 1.0, sp.z)) {
                        player.rig.position.set(0, 1.5, 0);
                        player.physics.resetVelocity();
                        player.physics.grounded = true;
                    }
                }
                hud.hideDeath();
                hud.toast('Reconstituting construct…');
            }
        } else {
            deathTimer = 0;
        }
    }

    const wpn = getWeapon(player.inventory.activeWeapon);
    const prog = loadSovereignProgress();
    hud.update({
        hidden: game.atTitle,
        pad: input.padActive,
        showTimer,
        playTime: game.playTime,
        hp: player.health.hp,
        maxHp: player.health.max,
        weapon: wpn.name || player.inventory.activeWeapon,
        memoryKeys: player.inventory.memoryKeyCount,
        scarShards: player.inventory.scarShards,
        // W3: small-key count while inside a room-graph dungeon
        smallKeys: game.level?.keyStore ? game.level.keyStore.smallKeys() : null,
        hasBossKey: game.level?.keyStore ? game.level.keyStore.hasBossKey() : false,
        mood: mood.mood,
        beatId: game.levelId,
        beatName: game.level?.name || getLevel(game.levelId).name,
        paused: game.paused,
        banner: game.level?.banner || '',
        boss: game.activeBoss || game.level?.boss || null,
        bossesDefeated: (prog.bossesDefeated || []).length,
        dt,
    });

    composer.render();

    // S6: luminance sampler — must run in the same task as the render (no
    // preserveDrawingBuffer, so readPixels elsewhere returns black).
    if (window.__ssLumRequest) {
        const gl = renderer.getContext();
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let sum = 0, n = 0;
        for (let i = 0; i < px.length; i += 64) { // every 16th pixel
            sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
            n++;
        }
        window.__ssLumRequest(sum / n);
        window.__ssLumRequest = null;
    }
}

// Test / debug hooks
window.__sovereignScar = {
    game,
    player,
    loadLevel,
    LEVELS,
    mood,
    collisionWorld,
    particles,
    renderer,
    composer,
    scene,
    menu,
    ending,
    dev,
    mapScreen,
    save() {
        return saveSovereignProgress({
            currentBeat: game.levelId,
            inventory: player.inventory.toJSON(),
            hp: player.health.hp,
            playTime: game.playTime,
            mood: mood.mood,
        });
    },
    measure() {
        const box = (o) => {
            const b = new THREE.Box3().setFromObject(o);
            return { h: b.max.y - b.min.y, minY: b.min.y };
        };
        const out = { player: box(player.rig), mobs: [], boss: null };
        for (const e of game.level?.enemies || []) {
            if (e === game.level?.boss || e.bossId) continue;
            if (e.rig) out.mobs.push(box(e.rig));
        }
        const b = game.level?.boss;
        if (b?.root) out.boss = box(b.root);
        return out;
    },
    sampleLuminance() {
        return new Promise((resolve) => { window.__ssLumRequest = resolve; });
    },
};

// Soft title toast
hud.toast('SOVEREIGN SCAR — The Wound That Remembers', 2800);
frame();

console.info(
    '%cSovereign Scar %c0.1.0%c — engine My-Engine 0.2.0 pinned',
    'color:#7fe0ff;font-weight:bold',
    'color:#ffd060',
    'color:#9aa8bc'
);
