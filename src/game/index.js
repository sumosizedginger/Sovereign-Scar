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
import { setListener } from '../audio/spatial.js';
import { world } from '../context.js';

import { Input } from './input.js';
import { CameraRig } from './camera-rig.js';
import { juice } from './fx/juice.js';
import { SoulMotes } from './fx/soul-motes.js';
import { ImpactFx } from './fx/impact.js';
import { OcclusionController } from './fx/occlusion.js';
import { LockReticle } from './fx/lock-reticle.js';
import { AnchorMarkers } from './fx/grapple-rope.js';
import { LocalLightPool } from './fx/local-light-pool.js';
import { prewarmLevel } from './render/prewarm.js';
import { bossSubtitle } from './bosses/subtitles.js';
import { Player } from './player.js';
import { HUD } from './ui/hud.js';
import { coach, setCoachSink, setCoachStore, resetCoach } from './ui/coach.js';
import { MoodController } from './fx/mood-controller.js';
import { refreshScoreVolume, setIntensity as setMusicIntensity } from './audio/score.js';
import { gsfx } from './audio/sfx-bank.js';
import { createFlickerPass, updateFlickerPass } from './fx/flicker-shader-pass.js';
import { createWrapPass, updateWrapPass } from './render/wrap-shader-pass.js';
import { createColorGradePass, applyGradePreset } from './fx/color-grade-pass.js';
import { DustMotes } from './fx/atmosphere.js';
import { KITS } from './levels/dungeon-kits.js';
import { frameLuminanceStats } from './render/luminance.js';
import { ContactShadows } from './fx/contact-shadow.js';
import { isGlowing, isSeeThrough } from './render/shadow-roles.js';
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
import { ScreenFade } from './ui/fade.js';
import { CutsceneDirector } from './narrative/cutscene.js';
import { Inventory, MEMORY_VIAL_CAP } from './kernel/inventory.js';
import { bossHeartMax } from './kernel/health.js';
import {
    tryPurchase, damageMult, dashIframeBonus, grappleRange,
    environmentalDamageMult, moteHomeSpeed, memoryVialSlots, UPGRADES,
} from './kernel/upgrades.js';
import { getWeapon } from './combat/weapons.js';
import { POISE_MAX } from './combat/guard.js';
import { dev } from './dev/dev-mode.js';
import { HeartDropManager, dropSite } from './world/heart-drops.js';
import { patchOverworld } from './world/keys.js';
import { DeathEcho } from './world/death-echo.js';
import { updateRoomLightFlicker } from './world/room-lights.js';
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
import {
    addScore, getScores, getSetting, setSetting, getProgress, setProgress,
} from '../engine/settings.js';

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
// Phase G — and somewhere to remember it. `hintsSeen` has been in the progress
// schema since it was written and was read and written by nothing, so every
// reload re-taught the whole game to a player who had been at it for hours.
setCoachStore({
    load: () => getProgress().hintsSeen || [],
    save: (ids) => setProgress({ hintsSeen: ids }),
});
// Same fix, same cause, and this one holds the screen for three seconds rather
// than a toast you can look past.
hud.story?.setStore?.({
    load: () => getProgress().storySeen || [],
    save: (ids) => setProgress({ storySeen: ids }),
});
/**
 * Seconds the control legend shows itself at the start of a brand-new run.
 *
 * Long enough to read four lines twice; short enough that it is gone before the
 * player reaches anything worth looking at. It is not restored on load — a
 * returning save has already had it, and `?` brings it back on demand.
 */
const HELP_ONBOARDING_S = 14;

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
// Budget raised 4 → 5 (top of the audited 3–5 range) now that rooms actually
// register fixtures: a hall gets up to five lamps plus a boss glow, and at a
// budget of four the boss would have evicted the room it is standing in.
const localLights = new LocalLightPool(scene, { budget: 5 });
// Z4: ground marker under the locked target.
const lockReticle = new LockReticle(scene);
// Grapple anchors within reach pulse, so the traversal layer is visible
// without a walkthrough — and the pulse teaches the range itself.
const anchorMarkers = new AnchorMarkers(scene);

// Custom passes before OutputPass
const flickerPass = createFlickerPass();
const wrapPass = createWrapPass();
const colorGradePass = createColorGradePass();
{
    const passes = composer.passes;
    const outIdx = passes.indexOf(outputPass);
    if (outIdx >= 0) {
        // Grade sits just before output so it sees the composed frame.
        passes.splice(outIdx, 0, flickerPass, wrapPass, colorGradePass);
    } else {
        composer.addPass(flickerPass);
        composer.addPass(wrapPass);
        composer.addPass(colorGradePass);
    }
}
const dustMotes = new DustMotes(scene);

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
// Phase G — and reconcile the two stores at boot, so a save made before the
// key mismatch was closed comes back consistent instead of half-on.
if (bootSettings.reduceFlash != null) setSetting('reduceFlashing', !!bootSettings.reduceFlash);

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
// Phase F2 — sparks and material debris on the receiving end of every hit.
// Installed on `juice` rather than reached for inside `applyHit`, so the combat
// layer stays free of anything that owns a scene and every headless spec keeps
// running with the hook simply absent.
const impactFx = new ImpactFx(scene);
juice.onImpact = (defender, dir) => {
    impactFx.burst(defender?.root?.position, dir, defender);
};
const heartDrops = new HeartDropManager(scene);
const contactShadows = new ContactShadows(scene);
let deathEcho = null;
let anchorThread = null;
let witnessScore = null;
player.onCombatHit = () => witnessScore?.extendChain?.();
// Playtest issue 1: minerals that break must pay something. Loot is low-rate
// so shatter is *sometimes* worth walking over to, not a farm; a `hidden`
// pickup on the destructible fires once the island is gone (isEmpty).
player.onShatter = (dest, _n) => {
    const o = dest?.origin || { x: 0, y: 1, z: 0 };
    heartDrops.dropAt(o.x, o.y + 0.4, o.z, { heart: 0.22 });
    const lvl = game.level;
    if (dest?.hiddenPickup && dest.isEmpty && lvl?.addPickup) {
        lvl.addPickup(
            { x: o.x, y: (o.y || 1) + 0.35, z: o.z },
            dest.hiddenPickup
        );
        dest.hiddenPickup = null;
    }
};

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
    // Phase F2 — a short pull-in on the killing blow. Small (0.35s, half a
    // metre) on purpose: this is punctuation, and a camera that lunges on every
    // trash kill is a camera the player fights. It is skipped for bosses, whose
    // deaths already have their own staging.
    if (!defender?.bossId) camRig.kick(0.35, 0.5);
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
/**
 * The controls, held still.
 *
 * Exactly the surface `Player.update` reads — attackHeld, guardHeld,
 * moveVector, padAim and the five consume* latches — and nothing else, so a
 * new input the player starts reading will fail loudly here rather than
 * quietly staying live through a cutscene.
 */
const CINEMATIC_INPUT = {
    attackHeld: false,
    guardHeld: false,
    moveVector: () => ({ x: 0, z: 0 }),
    padAim: null, // a property on Input, not a call — right-stick facing
    consumeAttack: () => false,
    consumeDash: () => false,
    consumeLockCycle: () => false,
    consumeLockToggle: () => false,
    consumeWeaponCycle: () => false,
};

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
    // Control gate for scripted scenes. CutsceneDirector is the only thing that
    // sets it, and `_release` is the only thing that clears it — a stuck
    // `cinematic` is a softlock whose only exit is a reload, so it has exactly
    // one owner. Read in frame() where the player is stepped.
    cinematic: false,
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
    hud.toast(
        `Memory Vial found. ${player.inventory.memoryVialSlots}/${MEMORY_VIAL_CAP} `
        + 'chassis recovered.', 2600);
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
    // A scene must never outlive the level it was playing in. `stop` runs the
    // director's single release path, which clears `cinematic`, eases the
    // camera home and wipes the fade — so a level change during a cutscene
    // cannot strand the player behind a black screen with no controls, which
    // is the one failure this whole subsystem is written around.
    cutscene.stop(game);
    screenFade.clear();
    if (deathEcho) {
        deathEcho.dispose();
        deathEcho = null;
    }
    if (game.level) {
        try { game.level.dispose(); } catch (e) { console.warn('level dispose', e); }
        game.level = null;
    }
    heartDrops.clear(); // loose hearts must not survive into the next level
    contactShadows.clear(); // ditto — a disc outlives its actor by a frame otherwise
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
        // Rooms bake lazily — the one-shot `localLights.scan(scene)` below only
        // ever saw the room the level loaded into, so a fixture in any other
        // room would have been registered never. Handing the pool to the baker
        // lets each room register its own light at the moment it exists.
        localLights,
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
        // The room the level opens INTO wins over the level default: the
        // overworld trims light per screen (its regions are different rock),
        // and the first screen is entered before there is a `game` to push the
        // trim through, so it has to be pulled here.
        tune: level.currentRoomTune?.() || level.lightTune || meta.lightTune || null,
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
    // Per-region grade: cryo/pyre get identity tints; abyss/crust defaults.
    {
        const id = meta.id || '';
        let grade = level.mood || 'crust';
        if (/cryo/.test(id)) grade = 'cryo';
        else if (/pyre/.test(id)) grade = 'pyre';
        else if (level.mood === 'abyss') grade = 'abyss';
        applyGradePreset(colorGradePass, grade);
    }
    {
        const ro = level.currentRoomOrigin?.() || level.spawn || { x: 0, z: 0 };
        dustMotes.setCenter(ro.x || 0, ro.z || 0);
        // Phase F1 — the `atmosphere` channel, at last. Every dungeon has
        // declared its own since the kits were written; all sixteen regions and
        // all fourteen dungeons shared one grey dust field because nothing ever
        // read the tag. Embers over the Pyre, vapour in the Cryo Vault, drips
        // in the Sluice, an index scan in the Tower.
        const kit = KITS[level.id];
        if (kit?.atmosphere) {
            dustMotes.setAtmosphere(kit.atmosphere);
        } else {
            dustMotes.setProfile(null);
            dustMotes.setColor(level.mood === 'abyss' ? 0xb0a0d0 : 0xd8c8a0);
        }
    }
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
    // A NEW GAME MUST BE NEW. resetSovereignProgress only rewrites the
    // Sovereign store; the onboarding ledgers live one level up in engine
    // progress (`hintsSeen`, `storySeen`, wired near the top of this file), so
    // a second campaign on the same browser profile used to start with all 18
    // coach hints and every story panel already marked as seen — including the
    // opening line queued twelve lines below, which was filtered out before it
    // could be shown. resetCoach() has existed the whole time and was called
    // only from a spec.
    resetCoach();
    hud.story?.resetSeen?.();
    activateCampaignServices(fresh);
    player.inventory = new Inventory();
    player.health.max = 6;
    player.health.fullRestore();
    game.playTime = 0;
    // Onboarding, not furniture. The control legend shows itself for the first
    // stretch of a brand-new run and then gets out of the way; `?` brings it
    // back, and the pause menu has always had a Controls screen. A permanent
    // cheat sheet is the same information delivered forever to a player who
    // stopped reading it in the first minute.
    game.helpUntil = HELP_ONBOARDING_S;
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

// The full-screen wash and the scene clock. Both were written, complete, and
// imported by nothing — `ScreenFade` replaced three hardcoded lines inside
// EndingSequence that never got deleted, and `CutsceneDirector` had no caller
// at all. They are wired here rather than left as a promise: `game.fade` is
// what a beat's `fade` step drives, and `game.cutscene` owns `game.cinematic`.
const screenFade = new ScreenFade();
const cutscene = new CutsceneDirector();
game.fade = screenFade;
game.cutscene = cutscene;
game.sfx = gsfx; // a beat's `sfx: 'name'` step resolves against this
/**
 * Play a scripted scene. Returns false if refused — mid-boss, sealed room, or
 * one already running. Beats: { at, camera, story, fade, sfx, fn }.
 */
game.playCutscene = (scene) => cutscene.play(game, scene);

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
            // Phase G — the two accessibility settings that had working engine
            // logic in six files and no switch, plus the key mismatch that made
            // the flash toggle a half-toggle. Read from engine settings, which
            // is where `smear.js`, `renderer.js`, `flicker-shader-pass.js` and
            // `mood-controller.js` all look.
            reduceMotion: getSetting('reduceMotion'),
            reduceHorrorAudio: getSetting('reduceHorrorAudio'),
            monoAudio: getSetting('monoAudio'),
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
                    // THE KEY MISMATCH, closed. The menu wrote `reduceFlash`
                    // into the progress mirror; the flicker shader reads
                    // `reduceFlashing` out of engine settings. Two names, one
                    // apparent switch, and the toggle labelled "Reduce flashes"
                    // did not touch the flicker pass it most obviously names.
                    // One press now writes both, because they are one setting.
                    setSetting('reduceFlashing', ev.value);
                    break;
                case 'reduceMotion':
                    setSetting('reduceMotion', ev.value);
                    break;
                case 'reduceHorrorAudio':
                    setSetting('reduceHorrorAudio', ev.value);
                    break;
                case 'monoAudio':
                    // setSetting persists on its own; no persistSetting mirror.
                    setSetting('monoAudio', ev.value);
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
            // Replay the roll from the title. Deliberately NOT startEnding():
            // that awards the campaign score, stamps campaignComplete and
            // submits a leaderboard entry, none of which may happen twice. This
            // reads the run that was already recorded and just plays it back.
            case 'credits': {
                const p = loadSovereignProgress();
                if (!p.campaignComplete) break;
                const fs = p.finalScore || {};
                menu.close();
                game.paused = true;
                ending.start({
                    playTime: fs.playTime != null ? fs.playTime : (p.playTime || 0),
                    deaths: fs.deaths != null ? fs.deaths : (p.deaths || 0),
                    bosses: fs.bosses != null ? fs.bosses : (p.bossesDefeated || []).length,
                    shards: fs.shards || 0,
                    keys: fs.keys || 0,
                    score: fs.score || 0,
                    ledger: fs.ledger || {},
                    events: fs.events || 0,
                    runMode: fs.runMode || p.runMode,
                });
                break;
            }
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
// Ambient clock, accumulated from the same scaled dt the world uses so the
// lamps stop breathing when the world stops. Not `clock.getElapsedTime()`:
// that would keep running through a pause and through the death overlay.
let ambientT = 0;

let firstFrameAnnounced = false;

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

    // A MENU OWNS THE SCREEN AND THE KEYBOARD WHILE IT IS OPEN.
    //
    // Both of these are set at the TOP of the frame, before input is polled
    // and before anything can raise a toast. Down at the bottom with the rest
    // of the HUD update they would be a frame late, and a frame late is the
    // whole bug: a message raised by gameplay in the first half of the frame
    // paints over the menu that was already open when the frame began, and a
    // verb latched against an open menu fires after it has closed.
    //
    // `setUiCapture` drains the pending one-shots on both transitions, which
    // is what makes the CLOSING keypress safe — the menu closes synchronously
    // inside its own listener, so the key that closed it has already latched a
    // gameplay verb by the time this runs. Draining here, above every
    // `consume*` call below, is what stops that verb from being spent.
    hud.setMenuOpen(menu.isOpen);
    input.setUiCapture(menu.isOpen);

    // Juice ticks on RAW dt so hitstop can end itself and flashes restore
    juice.update(dt);
    const sdt = dt * juice.timeScale;

    // Tell the mixer where the frame is looking, so placed sounds land on the
    // side of the stereo field they are drawn on.
    //
    // Once, here, rather than after each `camRig.update` — the rig is updated
    // from two branches (title attract, gameplay) and a third would eventually
    // be added without this. That makes the listener one frame stale, which is
    // the right trade: 16 ms of camera drift is centimetres, and the
    // alternative is a placement that silently stops following the camera the
    // next time somebody adds a mode.
    const listenAt = camRig.focusPoint();
    setListener(listenAt.x, listenAt.z, camRig.viewHalfWidth());

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
        // The map is modal and outranks the pause menu here. This drain is
        // unconditional, so the map's own `consumePause` check further down
        // could never see the flag: Esc stacked the pause menu on top of the
        // map instead of closing it, and quitting to title from that state
        // left the map undismissable (the Tab toggle is gated on !atTitle).
        if (mapScreen.isOpen) {
            mapScreen.close(game);
        } else if (menu.isOpen) {
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
        // Esc is handled by the pause block above, which closes the map first.
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
        if (game.helpUntil > 0) game.helpUntil -= dt;
        // Before the player is stepped, so a beat that takes the controls this
        // frame takes them this frame. Pausing still works during a scene —
        // consumePause is deliberately not drained by the director.
        cutscene.update(dt, game);
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
            // Both of these must match the grapple-throw block below (the
            // `consumeGrapple` branch): `hasItem` is the Inventory method —
            // there is no `has`, and the optional call hid that — and
            // `player.grappleRange` is refreshed by applyUpgradeStats, where
            // the boot-time `progress` snapshot never sees an altar purchase.
            const reach = player.grappleRange || 8;
            const owns = player.inventory.hasItem('magnetic_grapple');
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
        // Lock-on is the control that turns "back away and swing" into
        // "circle it", and the game never mentioned it. Say so the first time
        // the player is outnumbered, which is the first time it matters.
        if (!player.lockOn.target) {
            let near = 0;
            const pp = player.root.position;
            for (const e of enemies) {
                if (e.state?.current === 'DEAD' || e.defeated) continue;
                if (Math.hypot(e.root.position.x - pp.x, e.root.position.z - pp.z) < 9) near++;
            }
            if (near >= 2) {
                coach('lock-on',
                    'More than one. Press T to lock on — you keep facing your '
                    + 'target and movement becomes a strafe, so you can circle '
                    + 'instead of backing away. Y switches target.');
            }
        }
        // During a scripted scene the player is stepped with a NEUTRAL input,
        // not skipped. Skipping the update would freeze physics and animation
        // mid-stride; this keeps gravity, the gait and every timer running
        // while the hands come off the controls. CutsceneDirector already
        // drains the action latches, but movement is polled (`moveVector`),
        // not latched, so draining alone would leave WASD live.
        player.update(sdt, game.cinematic ? CINEMATIC_INPUT : input,
            enemies, destructibles, camera, renderer);
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
                    // Same floor rule as a normal kill — converting a MOTE put
                    // its heart 3.4 units up, out of collection range.
                    heartDrops.spawn(...dropSite(target));
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
                // Same landing guarantee as the anchor-post pull in
                // `blockers.js`: this one aims at nothing in particular — a
                // fixed reach along the facing — so without a standing check it
                // will happily set the player down over a chasm. Keeps the
                // default `stopShort`, because unlike the blocker this target
                // has not been trimmed by anyone.
                player.grapple.start(player.root.position, target, 10, {
                    canStand: game.level?.canStand
                        ? (x, z) => game.level.canStand(x, z)
                        : undefined,
                });
                sfx.whoosh();
            }
        }

        // Level-driven FX
        updateFlickerPass(flickerPass, sdt, game.level?.flicker || 0);
        updateWrapPass(wrapPass, sdt, game.level?.wrap || 0);

        // Hearts from slain enemies — the only in-run way to recover HP
        heartDrops.update(sdt, enemies, player, game.level);

        // Aim the sun at the room the player is standing in. Prefer the room
        // origin — it is stable, so the frustum does not move at all while you
        // walk around inside one room. Levels without a room graph (the
        // overworld, the sandbox) fall back to the player, snapped to the same
        // grid so it still cannot crawl.
        {
            const ro = game.level?.currentRoomOrigin?.();
            const p = player.root.position;
            mood.aimKeyLight(ro ? ro.x : p.x, ro ? ro.z : p.z);
            if (ro) dustMotes.setCenter(ro.x, ro.z);
            else dustMotes.setCenter(p.x, p.z);
        }
        dustMotes.update(sdt);

        // Contact shadows are reconciled from the live entity lists rather than
        // attached at each spawn site, so a new enemy kind cannot ship without
        // one by forgetting a call.
        contactShadows.sync(sdt, {
            player,
            enemies,
            pickups: game.level?.pickups || [],
            boss: game.activeBoss || game.level?.boss || null,
        });

        // Phase D2 — name the elite once, the first time you are close enough
        // to be fighting it. Reusing the boss card rather than inventing a
        // second announcement widget: a named thing arriving is one event, and
        // the game already knows how to say it.
        for (const e of enemies) {
            if (!e?.elite || e._eliteAnnounced || e.state?.current === 'DEAD') continue;
            const p = player.root.position;
            if (Math.hypot(e.root.position.x - p.x, e.root.position.z - p.z) > 12) continue;
            e._eliteAnnounced = true;
            hud.bossCard(e.eliteName || 'ELITE', 'ELITE', 1.3);
            sfx.stinger();
        }

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
        // Breathe the room's fixtures, then let the pool copy their intensities
        // onto the real lights. Order is the whole trick: the pool already does
        // `light.intensity = source.intensity` every frame, so animating the
        // source here needs no change to the pool at all. Move this below and
        // the flicker is a frame late; delete it and every lamp goes back to
        // being a painted rectangle.
        ambientT += sdt;
        updateRoomLightFlicker(ambientT);
        localLights.update(player.root.position); // Ticket G: budget nearest lights
        camRig.update(sdt, player.root.position);

        impactFx.update(sdt);

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
                // Dying mid-scene ends the scene. Same reason as unloadLevel:
                // the death flow takes the controls itself, and two owners of
                // `cinematic` is how it gets stuck on.
                cutscene.stop(game);
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
                            // Ask the level where its ground is. `ls.y` is
                            // measured now, but a level with no room graph has
                            // neither, and dropping in beats burying.
                            const gy = game.level?.groundY?.(ls.x, ls.z);
                            player.rig.position.set(ls.x, gy ?? ls.y ?? 9.95, ls.z);
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
    // The legend appears while `?` is held, and on its own for the opening
    // stretch of a new run. Both, never permanently — see `HUD.setHelpVisible`.
    hud.setHelpVisible(!game.atTitle && !game.paused
        && (input.helpHeld() || game.helpUntil > 0));

    hud.update({
        hidden: game.atTitle,
        pad: input.padActive,
        // Developer-facing fields render into their own element, and only when
        // this is true. They used to sit in the middle of the player's panel.
        dev: dev.enabled,
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
            const p = player.root.position;
            if (b && b.root) {
                const d = Math.hypot(b.root.position.x - p.x, b.root.position.z - p.z);
                if (d < 30) return b;
            }
            // Phase D2 — an elite borrows the boss bar when there is no boss to
            // use it. It is the same widget answering the same question ("what
            // is the named thing I am fighting, and how much of it is left"),
            // and an elite with no health bar is just an enemy that takes a
            // surprising number of hits.
            let near = null;
            let bestD = 18;
            for (const e of (game.level?.enemies || [])) {
                if (!e?.elite || !e.root || e.state?.current === 'DEAD') continue;
                const d = Math.hypot(e.root.position.x - p.x, e.root.position.z - p.z);
                if (d < bestD) { bestD = d; near = e; }
            }
            return near;
        })(),
        bossesDefeated: (prog.bossesDefeated || []).length,
        dt,
    });

    composer.render();

    // TELL THE BOOT SPLASH THE TRUTH ABOUT WHEN THE GAME APPEARED.
    //
    // `index.html` used to fade `#boot` 900ms after the module import
    // resolved, under a comment reading "once the first frame has LIKELY
    // painted". A module resolving is not a frame; the first frame costs a
    // renderer init, a level bake and a shader compile, and none of that is
    // 900ms on every machine. Photographed under software GL the splash was
    // still painting over the open title menu — two copies of the game's name
    // stacked, one of them saying "loading…" under a screen already offering
    // `Begin`. Guess low and the splash covers the menu; guess high and the
    // menu waits behind a splash for nothing.
    //
    // This fires once, from below `composer.render()`, so it means exactly one
    // thing: a frame has been drawn. The listener keeps a timeout of its own,
    // because a signal the page waits on forever is worse than a bad guess.
    if (!firstFrameAnnounced) {
        firstFrameAnnounced = true;
        window.dispatchEvent(new CustomEvent('ss:first-frame'));
    }

    // S6: luminance sampler — must run in the same task as the render (no
    // preserveDrawingBuffer, so readPixels elsewhere returns black).
    //
    // This returns a DISTRIBUTION, not just a mean. The mean alone cannot tell
    // a well-lit room from a flat one — a strong key with deep shadows meters
    // *lower* than the same room under a flat ambient wash, so for as long as
    // the certification gate banded the mean, the cheapest way to pass it was
    // to flatten the art. That is how ambient reached 1.7 against a key of 1.9.
    // p90 − p10 is the statistic that can tell them apart: it is large when the
    // frame has both lit and shadowed surfaces and collapses toward zero when
    // everything sits at one value.
    //
    // Returns a DISTRIBUTION, not just a mean — see render/luminance.js for why
    // the mean alone let the build get flat, and why the contrast is measured on
    // a centre crop rather than the whole frame.
    if (window.__ssLumRequest) {
        const gl = renderer.getContext();
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        window.__ssLumRequest(frameLuminanceStats(px, w, h, 16));
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
    // Begin a run explicitly, so a test never has to MIME one.
    //
    // The visual specs used to leave the title with `click, ArrowDown, Enter`
    // and that quietly coupled every luminance and contrast reading in the
    // certification gate to the title menu's exact row order and to which rows
    // happened to be disabled. Adding one row (Credits) moved what ArrowDown
    // selected: the same three keystrokes that started a run before now opened
    // Settings, the sweep ran with no run ever started, and sandbox-combat's
    // contrast read 7 instead of 14-62 — a "rendering regression" that was
    // nothing of the kind. A fixture should say what it wants.
    startNewGame,
    applyQualitySetting,
    cameraRig: camRig,
    // The camera itself, not just the rig that drives it. Probes that need to
    // know WHERE ON SCREEN something is have to project it; the silhouette probe
    // was assuming the player lands at frame centre and sampling a disc that
    // actually straddled their head and the floor above it.
    camera,
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
    contactShadows,
    // Needed to regenerate the certification captures headlessly: the HUD has
    // to be hidden for a clean frame, and the overworld cannot be teleported
    // across (an unbaked screen is void), so its position and mirror state are
    // written to the save and the level reloaded. See
    // tests/qa/certification-captures.mjs.
    hud,
    patchOverworld,
    /**
     * Is world point (x, z) inside the key light's shadow frustum?
     *
     * The whole of ticket 4. The frustum is a ±30-unit box; rooms sit 64 apart.
     * Before the sun started following the active room, this answered false for
     * five of Beat 01's six rooms — and for the equivalent rooms in all
     * fourteen dungeons. Returns null if there is no key light bound.
     */
    keyLightCovers(x, z, y = 1) {
        const sun = mood._lights?.keySun;
        if (!sun) return null;
        sun.updateMatrixWorld();
        sun.target.updateMatrixWorld();
        const cam = sun.shadow.camera;
        cam.updateMatrixWorld();
        cam.updateProjectionMatrix();
        const f = new THREE.Frustum().setFromProjectionMatrix(
            new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
        );
        return f.containsPoint(new THREE.Vector3(x, y, z));
    },
    /** Where the key light is currently aimed, for diagnostics. */
    keyLightAim() {
        const sun = mood._lights?.keySun;
        if (!sun) return null;
        return {
            target: { x: sun.target.position.x, z: sun.target.position.z },
            light: { x: sun.position.x, y: sun.position.y, z: sun.position.z },
            offset: {
                x: +(sun.position.x - sun.target.position.x).toFixed(3),
                y: +(sun.position.y - sun.target.position.y).toFixed(3),
                z: +(sun.position.z - sun.target.position.z).toFixed(3),
            },
        };
    },
    /** Shadow participation of the live scene — what ticket 2 is measured on. */
    shadowCensus() {
        let meshes = 0, cast = 0, recv = 0, discs = 0;
        // Meshes that opt out of shadows entirely, grouped by why. Most of the
        // scene is not solid geometry — telegraph rings, smears, motes and
        // glows are light, and light does not receive shadows.
        const inert = {};
        scene.traverse((o) => {
            if (!o.isMesh) return;
            if (o.name === 'contact-shadow') { discs++; return; }
            meshes++;
            if (o.castShadow) cast++;
            if (o.receiveShadow) recv++;
            if (!o.castShadow && !o.receiveShadow) {
                const m = o.material;
                const key = o.name || [
                    o.geometry?.type || '?',
                    m?.type || '?',
                    m?.transparent ? 'transparent' : 'opaque',
                    m?.emissiveIntensity > 0.5 ? 'emissive' : '',
                    o.parent?.name ? `in:${o.parent.name}` : '',
                ].filter(Boolean).join(' ');
                inert[key] = (inert[key] || 0) + 1;
            }
        });
        return { meshes, cast, recv, discs, inert };
    },
    /**
     * The population ticket 2 is actually about: meshes that are opaque AND not
     * emissive. Everything else in the scene is legitimately exempt —
     * transparent meshes are motes, smears and telegraph rings, and emissive
     * ones are glows, eyes and energy cores. Shading a light source with the
     * room's shadows makes it read as a painted highlight, not as something lit
     * from inside. Counting those in the denominator is how "151 meshes, 7
     * receive" became the headline number: most of that 151 was never solid.
     */
    solidShadowCensus() {
        let solid = 0, recv = 0;
        const missing = [];
        scene.traverse((o) => {
            if (!o.isMesh) return;
            // Exempt by intent, not by omission — each of these is named at its
            // construction site precisely so it can be excluded here.
            if (o.name === 'contact-shadow' || o.name === 'void-plane') return;
            if (o.userData?.shadowExempt) return; // reason is stored on the mesh
            const m = o.material;
            if (isSeeThrough(m) || isGlowing(m)) return;
            solid++;
            if (o.receiveShadow) recv++;
            else {
                const p = o.getWorldPosition(new THREE.Vector3());
                missing.push(o.name || `${o.geometry?.type} `
                    + `#${o.material.color?.getHexString?.() || '?'} `
                    + `y=${p.y.toFixed(1)} in:${o.parent?.name || o.parent?.type || '?'}`);
            }
        });
        return { solid, recv, missing };
    },
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
        // Width and depth as well as height. The visual gate used to judge
        // "does the boss dominate?" on height alone, which quietly assumed
        // every boss towers — and the roster contains creatures that sprawl.
        const box = (o) => {
            const b = new THREE.Box3().setFromObject(o);
            return {
                h: b.max.y - b.min.y,
                w: b.max.x - b.min.x,
                d: b.max.z - b.min.z,
                minY: b.min.y,
            };
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
    /** Full frame-luminance distribution: { mean, p10, p50, p90, spread }. */
    sampleLuminanceStats() {
        return new Promise((resolve) => { window.__ssLumRequest = resolve; });
    },
    /** Mean frame luminance. Kept because probes and older specs call it. */
    sampleLuminance() {
        return this.sampleLuminanceStats().then((s) => s.mean);
    },
};

// THE TITLE SCREEN ALREADY SAYS THIS, IN 44px LETTERS.
//
// This line fired a 2800ms HUD toast reading "SOVEREIGN SCAR — The Wound That
// Remembers" at module load — while the title menu, which carries exactly that
// title and exactly that subtitle, is open. Photographed at t=1.5s with no
// input, THREE layers said the same words at once: `#boot` (z 5), the toast
// (z 25) and `#ss-menu` (z 40). The toast is a 323×37 bordered box at
// [479,497], which on a 1280×720 title screen is drawn straight through the
// last menu row — so on the literal first frame of the game, `Credits` was
// illegible under a duplicate of the game's own name.
//
// It predates the title screen. Nothing in the suite or the docs referenced it.
frame();

console.info(
    '%cSovereign Scar %c0.3.0%c — engine My-Engine 0.2.0 pinned',
    'color:#7fe0ff;font-weight:bold',
    'color:#ffd060',
    'color:#9aa8bc'
);
