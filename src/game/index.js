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
import { OcclusionController } from './fx/occlusion.js';
import { LockReticle } from './fx/lock-reticle.js';
import { AnchorMarkers } from './fx/grapple-rope.js';
import { LocalLightPool } from './fx/local-light-pool.js';
import { prewarmLevel } from './render/prewarm.js';
import { bossSubtitle } from './bosses/subtitles.js';
import { Player } from './player.js';
import { HUD } from './ui/hud.js';
import { setCoachSink } from './ui/coach.js';
import { MoodController } from './fx/mood-controller.js';
import { refreshScoreVolume, setIntensity as setMusicIntensity } from './audio/score.js';
import { gsfx } from './audio/sfx-bank.js';
import { createFlickerPass, updateFlickerPass } from './fx/flicker-shader-pass.js';
import { createWrapPass, updateWrapPass } from './render/wrap-shader-pass.js';
import { LEVELS, DEV_LEVELS, getLevel, nextLevelId, prevLevelId } from './levels/registry.js';
import {
    loadSovereignProgress,
    saveSovereignProgress,
    unlockBeat,
    isBeatUnlocked,
    recordBossDefeat,
    resetSovereignProgress,
    sealSurvivalRun,
} from './kernel/progress.js';
import { MenuOverlay } from './ui/menu.js';
import { MapScreen } from './ui/map-screen.js';
import { EndingSequence } from './ui/credits.js';
import { Inventory } from './kernel/inventory.js';
import { bossHeartMax } from './kernel/health.js';
import {
    tryPurchase, damageMult, dashIframeBonus, grappleRange,
    environmentalDamageMult, moteHomeSpeed, memoryVialSlots, UPGRADES,
} from './kernel/upgrades.js';
import { getWeapon } from './combat/weapons.js';
import { POISE_MAX } from './combat/guard.js';
import { dev } from './dev/dev-mode.js';
import { HeartDropManager } from './world/heart-drops.js';
import { DeathEcho } from './world/death-echo.js';
import { AnchorThread } from './narrative/anchor-thread.js';
import { getRunMode, setActiveRunMode } from './kernel/run-mode.js';
import {
    chargeLabel,
    breakExpedition,
    consumeDeath,
    deathShardLoss,
    enterExpedition,
    refillCharges,
} from './kernel/lives.js';
import { SCORE_VERSION, WitnessScore } from './kernel/score.js';
import { addScore, getScores } from '../engine/settings.js';

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
// Let combat code speak without holding a HUD reference (see ui/coach.js).
setCoachSink((text, ms) => hud.toast(text, ms));
const mood = new MoodController();
mood.bindLights({
    keySun: gameLights?.keySun,
    fillNeon: gameLights?.fillNeon,
    rimWarm: gameLights?.rimWarm,
    ambient: ambientLight,
});

// The one sanctioned way to change quality at runtime. Engine setQuality
// writes raw tier post values, which used to make the final frame depend on
// whether quality or mood was set last; re-deriving the mood-capped
// composition right after makes any call order land on identical numbers
// (Ticket C determinism gate).
function applyQualitySetting(name) {
    try { setQuality(name); } catch (_) {}
    try { mood.reapplyVisual(); } catch (_) {}
}
// Narrower FOV cuts the wide-lens perspective distortion (converging walls,
// near/far scale mismatch) that reads as "3D game at an angle" rather than
// classic top-down Zelda; a steeper height:back ratio (below) pushes the
// tilt closer to a bird's-eye look.
camera.fov = 40;
camera.updateProjectionMatrix();
// One camera distance for the whole game (see loadLevel). At 40° FOV with
// back = 0.35·height this frames ~24 world units across a 16:9 viewport —
// wide enough that a 14-unit dungeon room sits inside the frame with its
// walls visible, tight enough that the hero still reads at overworld scale.
const CAM_HEIGHT = 17.5;
const camRig = new CameraRig({ height: CAM_HEIGHT, back: CAM_HEIGHT * 0.35 });
// Ticket D: fades registered foreground occluders (userData.occluder) that
// stand between camera and the player/boss. No-op until a level tags props.
const occlusion = new OcclusionController();
// Ticket G: pooled local lights — only the nearest few motivated sources
// (userData.localLight) cast real light; the rest keep bloom without a light.
const localLights = new LocalLightPool(scene, { budget: 4 });
// Z4: ground marker under the locked target.
const lockReticle = new LockReticle(scene);
// Grapple anchors within reach pulse, so the traversal layer is visible
// without a walkthrough — and the pulse teaches the range itself.
const anchorMarkers = new AnchorMarkers(scene);

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
    // The score runs its own persistent bus, so it does not pick up a volume
    // change the way one-shot nodes do — it has to be told.
    refreshScoreVolume();
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
const heartDrops = new HeartDropManager(scene);
let deathEcho = null;
let anchorThread = null;
let witnessScore = null;
player.onCombatHit = () => witnessScore?.extendChain?.();

// Juice feeds (A1–A3, A5)
player.health.onDamage = () => {
    juice.addTrauma(0.3);
    juice.hitstop(0.09);
    juice.spikeDamageVignette();
    witnessScore?.resetChain?.();
    if (game?.activeBoss) game._bossPhaseDamaged = true;
};
juice.onKill = (defender) => {
    const p = defender?.root?.position;
    if (p) soulMotes.burst(p);
};

// C3: apply purchased upgrades to the player's derived stats only.
// Never touch mood/post/quality here — altar buys must not change graphics.
function applyUpgradeStats() {
    const ups = loadSovereignProgress().upgrades || {};
    const mode = getRunMode(loadSovereignProgress().runMode);
    player.damageMult = damageMult(ups);
    player.dashIframeBonus = dashIframeBonus(ups);
    player.grappleRange = grappleRange(ups)
        + (player.inventory.hasItem('deep_pull_coil') ? 4 : 0);
    player.health.incomingDamageMult = mode.enemyDamage;
    player.health.environmentDamageMult = mode.environmentDamage * environmentalDamageMult(ups);
    soulMotes.homeSpeed = moteHomeSpeed(ups);
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
    anchorThread: null,
    witnessScore: null,
    hasUpgrade(id) {
        return (loadSovereignProgress().upgrades?.[id] || 0) > 0;
    },
    persistInventory() {
        saveSovereignProgress({ inventory: player.inventory.toJSON(), hp: player.health.hp });
    },
    progressSnapshot() {
        return loadSovereignProgress();
    },
    replayThreadMotif() {
        const beat = anchorThread?.destination?.()?.beat;
        if (beat) mood.setMusicTrack(beat);
    },
    // Player-facing travel is progression-gated. The raw loadLevel function
    // remains available only to the test and developer hook below.
    loadLevel: requestLevel,
    isLevelUnlocked,
    cameraRig: camRig,
    unlockAndSave(id) {
        unlockBeat(id);
        witnessScore?.award?.('beat', id);
        anchorThread?.sync?.(loadSovereignProgress(), true);
        hud.toast(`Unlocked: ${id}`);
    },
    recordBoss(id) {
        const p = recordBossDefeat(id);
        witnessScore?.award?.('boss', id);
        const beatNo = Number(String(game.levelId).match(/beat-(\d+)/)?.[1] || 0);
        if (beatNo >= 6 && beatNo <= 12) witnessScore?.award?.('engineer', game.levelId);
        sfx.fanfare?.();
        // C2: heart cap grows every 3rd boss
        const target = Math.min(12, bossHeartMax((p.bossesDefeated || []).length)
            + Math.floor((player.inventory.scarSutures || 0) / 4));
        if (target > player.health.max) {
            player.health.setMax(target);
            saveSovereignProgress({ maxHp: player.health.max });
            hud.toast(`Heart gained — construct integrity ${player.health.max}`, 3000);
        }
    },
    activeBoss: null,
};

game.collectSuture = (stableId) => {
    const flag = `suture:${stableId}`;
    if (player.inventory.getFlag(flag)) return false;
    player.inventory.setFlag(flag);
    const result = player.inventory.grantScarSuture();
    if (result.heartEarned) {
        player.health.setMax(Math.min(12, player.health.max + 1));
        hud.toast(`Four Scar Sutures bind. Integrity rises to ${player.health.max}.`, 2800);
    } else {
        hud.toast(`Scar Suture ${result.towardNext}/4`, 1800);
    }
    saveSovereignProgress({
        inventory: player.inventory.toJSON(),
        hp: player.health.hp,
        maxHp: player.health.max,
    });
    return true;
};

game.collectMemoryVial = (stableId) => {
    const flag = `memory-vial:${stableId}`;
    if (player.inventory.getFlag(flag)) return false;
    player.inventory.setFlag(flag);
    if (!player.inventory.grantMemoryVialSlot()) return false;
    witnessScore?.award?.('optional_item', flag);
    saveSovereignProgress({ inventory: player.inventory.toJSON() });
    hud.toast(`Memory Vial found. ${player.inventory.memoryVialSlots}/4 chassis recovered.`, 2600);
    return true;
};

game.collectOptionalItem = (id, name, stableId) => {
    const flag = `optional-item:${stableId}`;
    if (player.inventory.getFlag(flag)) return false;
    player.inventory.setFlag(flag);
    player.inventory.grantItem(id);
    if (id === 'entropy_dust') player.inventory.consumables.entropyCharges = 3;
    witnessScore?.award?.('optional_item', id);
    saveSovereignProgress({ inventory: player.inventory.toJSON() });
    applyUpgradeStats();
    hud.toast(`${name} acquired`, 2600);
    return true;
};

function activateCampaignServices(progress) {
    setActiveRunMode(progress.runMode);
    anchorThread = new AnchorThread({
        progress,
        mode: progress.runMode,
        story: hud.story,
        hasItem: (id) => player.inventory.hasItem(id),
        persist: (thread) => saveSovereignProgress({ thread }),
    });
    witnessScore = new WitnessScore(progress.score, progress.runMode,
        (score) => saveSovereignProgress({ score }));
    game.anchorThread = anchorThread;
    game.witnessScore = witnessScore;
    game._lastScoreBark = Math.floor((witnessScore.state.total || 0) / 10000);
    applyUpgradeStats();
}

world.game = game;
world.player = player;
world.collision = collisionWorld;

// Dev mode (Phase D): gate + badge + god mode; inert unless enabled
dev.init(game, { loadLevel, LEVELS, DEV_LEVELS, applyUpgradeStats, input });

// ── Level lifecycle ───────────────────────────────────────────────────────
function unloadLevel() {
    if (deathEcho) {
        deathEcho.dispose();
        deathEcho = null;
    }
    if (game.level) {
        try { game.level.dispose(); } catch (e) { console.warn('level dispose', e); }
        game.level = null;
    }
    heartDrops.clear(); // loose hearts must not survive into the next level
    collisionWorld.clear();
    // Keep border-safe empty world
}

function isLevelUnlocked(id, progress = loadSovereignProgress()) {
    // Developer fixtures are not campaign beats and remain reachable through
    // the dev panel and automated world tests.
    if (DEV_LEVELS.some((meta) => meta.id === id)) return true;
    return isBeatUnlocked(id, progress);
}

function requestLevel(id) {
    if (!isLevelUnlocked(id)) {
        hud.toast(`${getLevel(id).name} is still sealed`, 2200);
        return false;
    }
    loadLevel(id);
    return true;
}

function loadLevel(id) {
    unloadLevel();
    const meta = getLevel(id);
    let runProgress = loadSovereignProgress();
    setActiveRunMode(runProgress.runMode);
    if (/^beat-\d+/.test(meta.id)) {
        const lives = enterExpedition(runProgress.lives, runProgress.runMode, meta.id);
        runProgress = saveSovereignProgress({ lives });
    } else if (meta.id === 'overworld' && runProgress.lives?.expeditionId) {
        runProgress = saveSovereignProgress({
            lives: { ...runProgress.lives, expeditionId: null },
        });
    }
    game.levelId = meta.id;
    const ctx = {
        scene,
        collisionWorld,
        particles,
        player,
        camera,
        renderer,
    };
    occlusion.clear(); // drop the previous level's occluders before rebuilding
    localLights.clear();
    const level = meta.load(ctx);
    game.level = level;
    occlusion.scan(scene); // register any props this level tagged as occluders
    localLights.scan(scene); // register any motivated lights this level tagged

    for (const [i, enemy] of (level.enemies || []).entries()) {
        if (!enemy._witnessId) {
            const p = enemy.root?.position || {};
            enemy._witnessId = `${meta.id}:${i}:${enemy.kind || enemy.bossId || 'hostile'}:${Math.round(p.x || 0)}:${Math.round(p.z || 0)}`;
        }
    }

    player.setGetVoxelAt(level.getVoxelAt || (() => false));
    player.setFriction(level.friction === 'sludge' && player.inventory.hasItem('buoyancy_mesh')
        ? 'default' : (level.friction || 'default'));
    player.collisionWorld = collisionWorld;
    player.physics.collisionWorld = collisionWorld;

    const sp = level.spawn || { x: 0, y: 1.2, z: 0 };
    player.setSpawn(sp.x, sp.y != null ? sp.y : 1.2, sp.z);
    // Camera scale is CONSTANT everywhere — the world is drawn at one size
    // whether you are on the overworld or inside a dungeon, exactly like A
    // Link to the Past. It used to scale with level.halfSize, which meant a
    // dungeon room (half 7) framed ~21 world units wide while an overworld
    // screen (half 23) framed ~47: walking through a dungeon arch jerked the
    // camera to less than half its previous scale. Rooms narrower than the
    // view are centred by the room-lock clamp; wider screens scroll.
    camRig.clearFocus(); // a boss-intro push-in must not bleed into the next level
    camRig.setSecondSubject(null); // Ticket D framing resets with the level
    camRig.height = CAM_HEIGHT;
    camRig.back = camRig.height * 0.35;
    camRig.snapTo(player.root.position);

    const moodName = level.mood || meta.mood || 'crust';
    // Each dungeon and overworld region names its own composition (key, mode,
    // tempo, progression, melody — see audio/tracks.js); the level may override
    // with `initialTrack`, which the overworld uses for its starting region.
    mood.musicTrack = level.initialTrack || meta.id || null;
    mood.apply(moodName, {
        audio: true,
        music: level.musicBed || (level.boss ? 'boss' : (moodName === 'abyss' ? 'abyss' : 'crust')),
        tune: level.lightTune || meta.lightTune || null,
    });
    // Only a level that IS a boss arena opens on a boss piece. `level.boss`
    // used to be enough, but every dungeon prebakes its boss so the arena
    // exists at load — which meant this fired for all fourteen and overwrote
    // each dungeon's own composition with the generic mood bed, recreating the
    // exact "every dungeon sounds the same" fault the score was written to fix.
    // The boss rooms themselves call setMusicProfile('boss') on entry.
    if (level.musicBed === 'boss' || level.musicBed === 'leviathan') {
        mood.setMusicProfile(level.musicBed);
    }
    updateFlickerPass(flickerPass, 0, level.flicker || 0);
    updateWrapPass(wrapPass, 0, level.wrap || 0);
    game.activeBoss = level.boss || null;

    // Boss intro moment (A6): name card + camera push shortly after load.
    // Multi-room dungeons suppress this and fire it on boss-room entry.
    game.bossIntro = (level.boss && !level.boss.defeated && !level.suppressBossIntro)
        ? { t: 0.6, boss: level.boss, fired: false }
        : null;

    if (level.onEnter) {
        try { level.onEnter(game); } catch (e) { console.warn(e); }
    }
    try { hud.story?.clear?.(); } catch (_) {}
    if (level.story) {
        try { hud.story.queue(level.story, { replace: true }); } catch (_) {}
    }
    anchorThread?.onLevelEnter?.(meta.id);
    if (level.banner) hud.toast(level.banner, 3200);

    saveSovereignProgress({
        currentBeat: meta.id,
        inventory: player.inventory.toJSON(),
        hp: player.health.hp,
        mood: mood.mood,
    });

    const echo = loadSovereignProgress().deathEcho;
    if (echo && echo.levelId === meta.id && echo.amount > 0) {
        deathEcho = new DeathEcho(scene, echo, (amount) => {
            player.inventory.addShards(amount);
            saveSovereignProgress({ deathEcho: null, inventory: player.inventory.toJSON() });
            hud.toast(`Death Echo recovered: ${amount} shards`, 2400);
        });
    }

    // Ticket G: compile the level's material-family shader variants now, during
    // the transition, so the first combat frame never hitches on compilation.
    prewarmLevel(renderer, scene, camera);

    console.info('[Sovereign Scar] loaded', meta.id, meta.name);
}

// ── Menu system (B1/B2/B3) ────────────────────────────────────────────────
let showTimer = !!bootSettings.showTimer;

function persistSetting(key, value) {
    const cur = loadSovereignProgress().settings || {};
    saveSovereignProgress({ settings: { ...cur, [key]: value } });
}

function startNewGame(mode = 'medium') {
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
    const fresh = resetSovereignProgress(mode);
    activateCampaignServices(fresh);
    player.inventory = new Inventory();
    player.health.max = 6;
    player.health.fullRestore();
    game.playTime = 0;
    shardIncomeRemainder = 0;
    menu.close();
    game.atTitle = false;
    game.paused = false;
    loadLevel('overworld'); // C1: new game starts on the Scarred Crust
    anchorThread?.sync?.(loadSovereignProgress(), false);
    const first = anchorThread?.currentText?.();
    if (first) hud.story.queue({
        id: 'thread:new-run', speaker: 'PREDECESSOR', text: first, priority: 'critical',
    });
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
                || p.currentBeat !== 'overworld'
                || (p.playTime || 0) > 60
                || (p.deaths || 0) > 0;
        },
        shards: () => loadSovereignProgress().bankedShards || 0,
        upgrades: () => loadSovereignProgress().upgrades || {},
        hasItem: (id) => player.inventory.hasItem(id),
        healthFull: () => player.health.hp >= player.health.max,
        hasVialSlot: () => {
            const slots = player.inventory.memoryVialSlots
                + memoryVialSlots(loadSovereignProgress().upgrades || {});
            return (player.inventory.consumables?.memoryVials || 0) < slots;
        },
        chargeCost: () => loadSovereignProgress().runMode === 'hard' ? 90 : 60,
        canBuyCharge: () => {
            const p = loadSovereignProgress();
            if (!['medium', 'hard'].includes(p.runMode)) return false;
            return Number.isFinite(p.lives?.charges)
                && p.lives.charges < p.lives.maxCharges;
        },
        canBuyBuoyancy: () => {
            const p = loadSovereignProgress();
            return !player.inventory.hasItem('buoyancy_mesh')
                && new Set(p.unlockedBeats || []).has('beat-07-sluice');
        },
        settings: () => ({
            masterVol: volState.master,
            musicVol: volState.music,
            sfxVol: volState.sfx,
            quality: getQuality(),
            reduceShake: juice.reduceShake,
            reduceFlash: juice.reduceFlash,
            showTimer,
        }),
        scores: () => getScores(),
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
                    applyQualitySetting(ev.value);
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
                menu.state.push('runMode');
                menu.render();
                break;
            case 'startMode':
                startNewGame(ev.arg);
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
                let banked = loadSovereignProgress().bankedShards || 0;
                const wallet = { spendShards(n) {
                    if (n > banked) return false;
                    banked -= n;
                    return true;
                } };
                const res = tryPurchase(wallet, ups, ev.arg);
                if (res.ok) {
                    saveSovereignProgress({
                        upgrades: ups,
                        bankedShards: banked,
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
            case 'service': {
                const p = loadSovereignProgress();
                let cost = ev.arg === 'repair' ? 20 : ev.arg === 'vial' ? 25
                    : (p.runMode === 'hard' ? 90 : 60);
                if ((p.bankedShards || 0) < cost) break;
                let lives = p.lives;
                if (ev.arg === 'repair') player.health.fullRestore();
                if (ev.arg === 'vial') player.inventory.consumables.memoryVials += 1;
                if (ev.arg === 'charge') {
                    lives = { ...p.lives, charges: Math.min(p.lives.maxCharges, p.lives.charges + 1) };
                }
                saveSovereignProgress({
                    bankedShards: p.bankedShards - cost,
                    lives,
                    hp: player.health.hp,
                    inventory: player.inventory.toJSON(),
                });
                hud.toast(`Altar rewrite accepted: ${cost} shards`, 2000);
                break;
            }
            case 'buyItem': {
                const p = loadSovereignProgress();
                const cost = ev.arg === 'buoyancy_mesh' ? 180 : Infinity;
                if ((p.bankedShards || 0) < cost || player.inventory.hasItem(ev.arg)) break;
                player.inventory.grantItem(ev.arg);
                witnessScore?.award?.('optional_item', ev.arg);
                saveSovereignProgress({
                    bankedShards: p.bankedShards - cost,
                    inventory: player.inventory.toJSON(),
                });
                hud.toast('Buoyancy Mesh installed. Deep fluid no longer drags the construct.', 2600);
                break;
            }
        }
    },
});

game.openAltar = () => {
    const p = loadSovereignProgress();
    const deposited = player.inventory.scarShards;
    player.inventory.scarShards = 0;
    const lives = refillCharges(p.lives, p.runMode);
    if (player.inventory.hasItem('entropy_dust')) {
        player.inventory.consumables.entropyCharges = 3;
    }
    player.inventory.setFlag(`altar:${game.levelId}`);
    saveSovereignProgress({
        bankedShards: (p.bankedShards || 0) + deposited,
        lives,
        inventory: player.inventory.toJSON(),
        hp: player.health.hp,
    });
    anchorThread?.markProgress?.('altar_rest');
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
    witnessScore?.award?.('campaign', 'campaign-complete');
    const p = saveSovereignProgress({
        campaignComplete: true,
        runStatus: 'complete',
        lives: { ...(loadSovereignProgress().lives || {}), status: 'complete' },
        inventory: player.inventory.toJSON(),
        playTime: game.playTime,
    });
    const scoreEntry = finalScorePayload(p, true);
    if (!p.finalScoreSubmitted) {
        addScore(scoreEntry);
        saveSovereignProgress({ finalScore: scoreEntry, finalScoreSubmitted: true });
    }
    ending.start({
        playTime: game.playTime,
        deaths: p.deaths || 0,
        bosses: (p.bossesDefeated || []).length,
        shards: player.inventory.scarShards,
        keys: player.inventory.memoryKeyCount,
        score: witnessScore?.state?.total || 0,
        // 12.4: the final screen must reconcile the event ledger against the
        // displayed total, not just print a number.
        ledger: witnessScore ? witnessScore.snapshot().ledger : {},
        events: witnessScore ? witnessScore.snapshot().awarded.length : 0,
        runMode: p.runMode,
    });
};

function finalScorePayload(progress, completed) {
    return {
        score: witnessScore?.state?.total || 0,
        runMode: progress.runMode,
        completed: !!completed,
        beatReached: game.levelId,
        bosses: (progress.bossesDefeated || []).length,
        secrets: Number(progress.score?.ledger?.secret || 0) > 0
            ? (progress.score?.awarded || []).filter((id) => id.startsWith('secret:')).length : 0,
        deaths: progress.deaths || 0,
        playTime: game.playTime,
        scoreVersion: SCORE_VERSION,
        eligible: witnessScore?.state?.eligible !== false,
        runId: progress.runId,
    };
}

function reconstitutionLine(progress, outcome) {
    if (outcome === 'run_end') return 'I remember you. The world does not.';
    if (outcome === 'expedition_break') {
        return 'I can rebuild you, but not here. This place has eaten the route.';
    }
    const charges = progress.lives?.charges;
    if (charges == null || charges >= 4) return 'Again. I still remember enough of you.';
    if (charges >= 2) return 'The Link is losing detail. Stop making me rebuild your hands.';
    return 'One clean memory remains.';
}

// Restore progress
const progress = loadSovereignProgress();
activateCampaignServices(progress);
if (progress.runMode === 'survival' && progress.runStatus === 'dead'
    && progress.finalScore && !progress.finalScoreSubmitted) {
    addScore(progress.finalScore);
    saveSovereignProgress({ finalScoreSubmitted: true });
}
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
applyUpgradeStats();
if (progress.maxHp) player.health.setMax(progress.maxHp);
if (progress.hp) player.health.hp = Math.min(progress.hp, player.health.max);
if (progress.playTime) game.playTime = progress.playTime;
if (bootSettings.quality) {
    applyQualitySetting(bootSettings.quality);
}
const requestedStartId = progress.currentBeat || 'overworld';
const startId = isLevelUnlocked(requestedStartId, progress) ? requestedStartId : 'overworld';
if (startId !== requestedStartId) saveSovereignProgress({ currentBeat: startId });
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
let _stickHintShown = false; // one-shot off-centre-stick hint (see pollGamepad)
let deathTimer = 0;
let deathShown = false;
let deathOutcome = null;
let saveAcc = 0;
let shardIncomeRemainder = 0;
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
    // One-shot hint when a stick is off-centre at connect and being ignored.
    // Without it the controller just silently does nothing (see input.js).
    if (input.padStickHeld && !_stickHintShown) {
        _stickHintShown = true;
        hud.toast('Controller stick is off-centre — release/recentre it to use the pad', 3600);
    }
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
        input.consumeVial();
        input.consumeDust();
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
        input.consumeVial();
        input.consumeDust();
        if (input.consumePause()) mapScreen.close(game); // Esc closes
    }

    // Dev mode (Phase D): one gate — when disabled every dev key is a no-op
    if (input.consumeDevToggle()) {
        dev.toggle(game);
        if (dev.enabled) witnessScore?.markUnranked?.();
    }
    {
        const dk = input.consumeDevKey();
        if (dk && dev.enabled) dev.handleKey(dk, game);
    }
    if (dev.enabled) dev.update(dt, game);
    if (dev.enabled) witnessScore?.markUnranked?.();

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
        if (isLevelUnlocked(nid)) {
            loadLevel(nid);
        } else {
            // D7: force-skip requires dev mode. Normal play has no bypass.
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
        if (isLevelUnlocked(pid)) {
            loadLevel(pid);
        } else if (dev.enabled) {
            loadLevel(pid);
            hud.toast(`Dev skip → ${pid}`);
        } else {
            hud.toast('Locked: defeat the prior boss first');
        }
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
        anchorThread?.update?.(dt);
        witnessScore?.update?.(dt);
        const scoreBand = Math.floor((witnessScore?.state?.total || 0) / 10000);
        if (scoreBand > (game._lastScoreBark || 0)
            && (game.levelId === 'beat-13-gumoi' || game.levelId === 'beat-14-leviathan')) {
            game._lastScoreBark = scoreBand;
            hud.story?.queue?.({
                id: `gumoi-score:${scoreBand}`,
                speaker: 'GUMOI', priority: 'flavor',
                text: 'Efficient violence. Filed without admiration.',
            });
        }
        // Adaptive score layering. The tune never changes; it thickens, so a
        // fight starting costs nothing musically and the player feels the room
        // turn dangerous without noticing why. Derived from the live scene
        // rather than from events, so it decays on its own when a room clears.
        {
            const boss = game.activeBoss;
            let level = 0;
            if (boss && !boss.defeated) {
                level = 3;
            } else if (!player.health.dead) {
                const p = player.root.position;
                let near = 0;
                for (const e of game.level?.enemies || []) {
                    if (!e || e.state?.current === 'DEAD' || e.hp <= 0) continue;
                    const d = Math.hypot(e.root.position.x - p.x, e.root.position.z - p.z);
                    if (d < 9) near++;
                    else if (d < 20) near += 0.34;
                }
                level = near >= 2.5 ? 2 : (near > 0 ? 1 : 0);
            }
            setMusicIntensity(level);
        }
        // Low health is a heartbeat rather than a beep: it carries the same
        // information and raises tension instead of only nagging.
        {
            const h = player.health;
            const critical = !h.dead && h.hp > 0 && h.hp / h.maxHp <= 0.25;
            game._hbAcc = (game._hbAcc || 0) + (critical ? sdt : 0);
            if (!critical) game._hbAcc = 0;
            else if (game._hbAcc >= 1.15) { game._hbAcc = 0; gsfx.lowHealth(); }
        }
        {
            const reach = grappleRange(progress.upgrades);
            const owns = player.inventory.has?.('magnetic_grapple');
            const pp = player.root.position;
            const inRange = owns
                ? (game.level?.grappleAnchors?.() || []).filter((a) =>
                    Math.hypot(a.x - pp.x, a.z - pp.z) <= reach)
                : [];
            anchorMarkers.update(sdt, inRange);
        }
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
                    sfx.stinger(); // C7 boss reveal stinger
                }
            }
        }

        const enemies = game.level?.enemies || [];
        const destructibles = game.level?.destructibles || [];
        // Z4: the lock's candidate pool is whatever is alive in the room right
        // now, plus the engaged boss — which lives outside level.enemies.
        player.lockOn.getCandidates = () => {
            const b = game.activeBoss;
            return (b && !b.defeated) ? [...enemies, b] : enemies;
        };
        player.update(sdt, input, enemies, destructibles, camera, renderer);
        lockReticle.update(sdt, player.lockOn.target);

        if (input.consumeVial()) {
            const vials = player.inventory.consumables?.memoryVials || 0;
            if (vials > 0 && player.health.hp < player.health.max && !player.health.dead) {
                player.inventory.consumables.memoryVials -= 1;
                player.health.fullRestore();
                saveSovereignProgress({ inventory: player.inventory.toJSON(), hp: player.health.hp });
                hud.toast('Memory Vial consumed. Construct restored.', 1800);
            } else if (vials <= 0) {
                hud.toast('No filled Memory Vials', 1000);
            }
        }

        if (input.consumeDust()) {
            const charges = player.inventory.consumables?.entropyCharges || 0;
            if (!player.inventory.hasItem('entropy_dust') || charges <= 0) {
                hud.toast('No refined Entropy Dust', 1100);
            } else {
                const target = enemies
                    .filter((enemy) => enemy && enemy.state?.current !== 'DEAD'
                        && !enemy.bossId && enemy !== game.activeBoss)
                    .map((enemy) => ({
                        enemy,
                        distance: Math.hypot(
                            enemy.root.position.x - player.root.position.x,
                            enemy.root.position.z - player.root.position.z
                        ),
                    }))
                    .filter((entry) => entry.distance <= 5)
                    .sort((a, b) => a.distance - b.distance)[0]?.enemy;
                if (!target) {
                    hud.toast('Entropy Dust finds nothing convertible', 1100);
                } else {
                    player.inventory.consumables.entropyCharges -= 1;
                    target._witnessScored = true;
                    target.hp = 0;
                    if (target.state) target.state.current = 'DEAD';
                    target.onDeath?.();
                    const pos = target.root.position;
                    heartDrops.spawn(pos.x, pos.y, pos.z);
                    saveSovereignProgress({ inventory: player.inventory.toJSON() });
                    hud.toast('Entropy converted into repair mass', 1600);
                }
            }
        }

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

        // Hearts from slain enemies — the only in-run way to recover HP
        heartDrops.update(sdt, enemies, player);

        for (const [i, enemy] of enemies.entries()) {
            if (!enemy || enemy._witnessScored || enemy.state?.current !== 'DEAD') continue;
            enemy._witnessScored = true;
            const boss = game.activeBoss || game.level?.boss;
            if (enemy === boss || boss?.cores?.includes?.(enemy)) continue;
            if (!enemy._witnessId) enemy._witnessId = `${game.levelId}:spawn:${i}`;
            witnessScore?.award?.(enemy.elite ? 'elite' : 'enemy', enemy._witnessId);
        }

        const locationKey = `${game.levelId}:${game.level?.currentRoomId?.() || 'root'}`;
        if (game._lastThreadLocation && game._lastThreadLocation !== locationKey) {
            anchorThread?.markProgress?.('room_entered', locationKey);
        }
        game._lastThreadLocation = locationKey;

        if (deathEcho) {
            const keep = deathEcho.update(sdt, player);
            if (!keep) {
                deathEcho.dispose();
                deathEcho = null;
            }
        }

        // Boss arenas have no trash mobs to farm, so walking in at 1 HP was
        // unwinnable with no way to recover. Each phase change drops a heart.
        {
            const b = game.activeBoss;
            const phase = b && !b.defeated ? (b.phase || 1) : 0;
            if (phase > 0 && game._lastBossPhase && phase > game._lastBossPhase) {
                const bp = b.root?.position;
                if (bp) heartDrops.spawn(bp.x, player.root.position.y - 0.95, bp.z);
                if (!game._bossPhaseDamaged) {
                    witnessScore?.award?.('flawless_phase', `${b.bossId}:${game._lastBossPhase}`);
                }
                anchorThread?.markProgress?.('boss_phase', `${b.bossId}:${phase}`);
                game._bossPhaseDamaged = false;
            }
            if (phase > 0 && !game._lastBossPhase) game._bossPhaseDamaged = false;
            game._lastBossPhase = phase;
        }

        if (particles.update) particles.update(sdt);
        updateSmears(sdt);
        camRig.setBounds(game.level?.cameraBounds || null); // W2 room-lock
        // Ticket D: while a live boss is engaged, frame BOTH subjects.
        {
            const b = game.activeBoss;
            const bRoot = b && !b.defeated && b.state?.current !== 'DEAD'
                ? (b.root || b.cores?.[0]?.root) : null;
            // Z4: a lock is an explicit statement of what the player wants in
            // frame, so it outranks the automatic boss framing. Falls back to
            // the boss the moment the lock drops.
            const lockRoot = player.lockOn.target?.root || null;
            camRig.setSecondSubject(lockRoot ? lockRoot.position
                : (bRoot ? bRoot.position : null));
            // Ticket D: fade foreground occluders standing over the player or the
            // engaged boss so neither reveal is obstructed.
            occlusion.setCamera(camera.position);
            occlusion.setSubjects([player.root.position, bRoot ? bRoot.position : null]);
            occlusion.update(sdt);
        }
        localLights.update(player.root.position); // Ticket G: budget nearest lights
        camRig.update(sdt, player.root.position);

        // Soul motes home to the player and pay out shards (A5)
        soulMotes.update(
            sdt,
            player.health.dead ? null : player.root.position,
            () => {
                shardIncomeRemainder += loadSovereignProgress().runMode === 'easy' ? 1.25 : 1;
                const payout = Math.floor(shardIncomeRemainder);
                shardIncomeRemainder -= payout;
                if (payout) player.inventory.addShards(payout);
            },
            soulMotes.homeSpeed || 1
        );

        // Autosave inventory/hp every 10s so shard pickups survive a close
        saveAcc += dt;
        if (saveAcc > 10) {
            saveAcc = 0;
            saveSovereignProgress({
                inventory: player.inventory.toJSON(),
                hp: player.health.hp,
                playTime: game.playTime,
                thread: anchorThread ? { ...anchorThread.state } : null,
            });
        }

        // Void kill — freefall below arena
        if (!player.health.dead && player.root.position.y < -12) {
            player.health.kill();
            hud.toast('Fell into the Scar…');
        }

        // Death → sequence → respawn (A7)
        if (player.health.dead) {
            if (!deathShown) {
                const before = loadSovereignProgress();

                // Easy can turn an owned vial into a last-moment repair. This
                // is healing before death resolution, never a post-death revive.
                if (before.runMode === 'easy'
                    && (player.inventory.consumables?.memoryVials || 0) > 0) {
                    player.inventory.consumables.memoryVials -= 1;
                    player.health.fullRestore();
                    saveSovereignProgress({
                        inventory: player.inventory.toJSON(),
                        hp: player.health.hp,
                    });
                    hud.toast('The Link spent a Memory Vial before the pattern broke.', 2200);
                    deathTimer = 0;
                    deathShown = false;
                    deathOutcome = null;
                    return;
                }

                const resolved = consumeDeath(before.lives, before.runMode);
                deathOutcome = resolved.outcome;
                const loss = deathShardLoss(player.inventory.scarShards, before.runMode);
                let nextEcho = before.deathEcho || null;
                // Hard never preserves an earlier Echo (spec 6.5): each death
                // claims the previous one even when the new death carries too
                // few shards to leave anything behind.
                if (before.runMode === 'hard') nextEcho = null;
                if (loss > 0) {
                    const candidate = {
                        levelId: game.levelId,
                        roomId: game.level?.currentRoomId?.() || null,
                        x: player.root.position.x,
                        y: player.root.position.y,
                        z: player.root.position.z,
                        amount: loss,
                    };
                    if (before.runMode === 'hard' || !nextEcho || loss > nextEcho.amount) {
                        nextEcho = candidate;
                    }
                    player.inventory.scarShards -= loss;
                }

                const deathPatch = {
                    deaths: (before.deaths || 0) + 1,
                    lives: resolved.state,
                    deathEcho: nextEcho,
                    inventory: player.inventory.toJSON(),
                    hp: 0,
                    playTime: game.playTime,
                };

                if (deathOutcome === 'run_end') {
                    const projected = { ...before, ...deathPatch, runStatus: 'dead' };
                    const final = finalScorePayload(projected, false);
                    sealSurvivalRun(final, deathPatch);
                    addScore(final);
                    saveSovereignProgress({ finalScoreSubmitted: true });
                } else {
                    saveSovereignProgress(deathPatch);
                }

                if (deathEcho) {
                    deathEcho.dispose();
                    deathEcho = null;
                }
                if (nextEcho && nextEcho.levelId === game.levelId) {
                    deathEcho = new DeathEcho(scene, nextEcho, (amount) => {
                        player.inventory.addShards(amount);
                        saveSovereignProgress({ deathEcho: null, inventory: player.inventory.toJSON() });
                        hud.toast(`Death Echo recovered: ${amount} shards`, 2400);
                    });
                }

                deathShown = true;
                juice.hitstop(0.3);
                juice.addTrauma(0.8);
                hud.showDeath(deathOutcome === 'run_end'
                    ? 'I REMEMBER YOU. THE WORLD DOES NOT.'
                    : (deathOutcome === 'expedition_break'
                        ? 'THE EXPEDITION BREAKS'
                        : 'THE SCAR RECLAIMS YOU'));
                input.consumeAnyKey(); // drain stale presses so skip needs a fresh key
            }
            deathTimer += dt; // raw dt — hitstop must not stretch the sequence
            if (deathTimer > 0.6 && input.consumeAnyKey()) deathTimer = 1.5;
            if (deathTimer > 1.4) {
                deathTimer = 0;
                deathShown = false;
                if (deathOutcome === 'run_end') {
                    hud.hideDeath();
                    deathOutcome = null;
                    goToTitle();
                    return;
                }
                if (deathOutcome === 'expedition_break') {
                    const restart = game.levelId;
                    hud.hideDeath();
                    deathOutcome = null;
                    // The broken expedition is over: clear its id so the
                    // reload below starts a FRESH expedition with full
                    // charges (4.4/12.3) instead of resuming a zero-charge
                    // one that re-breaks on the next death.
                    {
                        const cur = loadSovereignProgress();
                        saveSovereignProgress({
                            lives: breakExpedition(cur.lives, cur.runMode),
                        });
                    }
                    loadLevel(restart);
                    hud.toast('The route broke. Reconstituted at the expedition entrance.', 3000);
                    hud.story?.queue?.({
                        id: `death:${loadSovereignProgress().deaths}`,
                        speaker: 'PREDECESSOR', priority: 'critical',
                        text: reconstitutionLine(loadSovereignProgress(), 'expedition_break'),
                    });
                    return;
                }
                // Respawn into the room the player actually died in. The
                // load-time spawn can be on a different overworld screen, and
                // teleporting there lands in unbaked void — the player then
                // falls forever, is re-killed below y=-12, and respawns into
                // the void again in an unbreakable loop.
                const rp = game.level?.respawnPoint?.();
                if (rp) {
                    if (rp.roomId && game.level.enterRoom
                        && game.level.currentRoomId?.() !== rp.roomId) {
                        game.level.enterRoom(rp.roomId, game);
                    }
                    player.setSpawn(rp.x, rp.y, rp.z); // setSpawn respawns
                    camRig.setBounds(game.level?.cameraBounds || null);
                    camRig.snapTo(player.root.position);
                } else {
                    player.respawn();
                    // Levels without a room graph: fall back to the level's
                    // own spawn, never world origin (void in most levels).
                    const sp = player.spawnPoint;
                    if (player.physics.getVoxelAt
                        && !player.physics.getVoxelAt(sp.x, sp.y - 1.0, sp.z)) {
                        const ls = game.level?.spawn;
                        if (ls) {
                            player.rig.position.set(ls.x, ls.y != null ? ls.y : 1.95, ls.z);
                            player.physics.resetVelocity();
                            player.physics.grounded = true;
                        }
                    }
                }
                hud.hideDeath();
                const charges = chargeLabel(loadSovereignProgress().lives, loadSovereignProgress().runMode);
                hud.toast(`Reconstituting construct. ${charges} charge${charges === '1' ? '' : 's'} remain.`);
                hud.story?.queue?.({
                    id: `death:${loadSovereignProgress().deaths}`,
                    speaker: 'PREDECESSOR', priority: 'context',
                    text: reconstitutionLine(loadSovereignProgress(), 'respawn'),
                });
                deathOutcome = null;
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
        guard: {
            poise: player.guard.poise,
            poiseMax: POISE_MAX,
            raised: player.guard.raised,
            broken: player.guard.broken,
            parries: player.guard.parries,
        },
        weapon: wpn.name || player.inventory.activeWeapon,
        memoryKeys: player.inventory.memoryKeyCount,
        scarShards: player.inventory.scarShards,
        bankedShards: prog.bankedShards || 0,
        vials: player.inventory.consumables?.memoryVials || 0,
        vialSlots: player.inventory.memoryVialSlots
            + memoryVialSlots(prog.upgrades || {}),
        entropyCharges: player.inventory.hasItem('entropy_dust')
            ? (player.inventory.consumables?.entropyCharges || 0) : null,
        sutures: player.inventory.scarSutures || 0,
        runMode: prog.runMode,
        charges: chargeLabel(prog.lives, prog.runMode),
        score: witnessScore?.state?.total || 0,
        chain: witnessScore?.state?.chain || 1,
        thread: anchorThread?.currentText?.() || '',
        // W3: small-key count while inside a room-graph dungeon
        smallKeys: game.level?.keyStore ? game.level.keyStore.smallKeys() : null,
        hasBossKey: game.level?.keyStore ? game.level.keyStore.hasBossKey() : false,
        mood: mood.mood,
        beatId: game.levelId,
        beatName: game.level?.name || getLevel(game.levelId).name,
        paused: game.paused,
        banner: game.level?.banner || '',
        // Boss bar only when the fight is actually near (prebaked dungeons
        // keep the boss alive rooms away)
        boss: (() => {
            const b = game.activeBoss || game.level?.boss || null;
            if (!b || !b.root) return b;
            const p = player.root.position;
            const d = Math.hypot(b.root.position.x - p.x, b.root.position.z - p.z);
            return d < 30 ? b : null;
        })(),
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
    requestLevel,
    isLevelUnlocked,
    applyQualitySetting,
    cameraRig: camRig,
    progress: loadSovereignProgress,
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
    heartDrops,
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
