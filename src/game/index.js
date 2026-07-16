// Sovereign Scar — game boot and main loop.
// Architecture: all product code here; engine frozen except SS-027 drones.

import * as THREE from 'three';
import { scene, camera, renderer, composer, onResize, outputPass, vignettePass } from '../engine/renderer.js';
import { initLights } from '../engine/lights.js';
import { initQuality } from '../engine/quality.js';
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
import { LEVELS, getLevel, nextLevelId, prevLevelId } from './levels/registry.js';
import { loadSovereignProgress, saveSovereignProgress, unlockBeat, recordBossDefeat } from './kernel/progress.js';
import { Inventory } from './kernel/inventory.js';
import { getWeapon } from './combat/weapons.js';

// ── Boot ──────────────────────────────────────────────────────────────────
initLights();
try { initQuality(); } catch (_) { /* quality may reference missing env maps */ }

// Hide ambient petals — fight Crust mood (buildplan risk mitigation)
const particles = new ParticleSystem(scene);
if (particles.petalMesh) particles.petalMesh.visible = false;

const collisionWorld = new CollisionWorld();
const input = new Input(window);
const hud = new HUD();
const mood = new MoodController();
const camRig = new CameraRig({ height: 18, back: 12 });

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
    playTime: 0,
    unlockAndSave(id) {
        unlockBeat(id);
        hud.toast(`Unlocked: ${id}`);
    },
    recordBoss(id) {
        recordBossDefeat(id);
        sfx.fanfare?.();
    },
    activeBoss: null,
};

world.game = game;
world.player = player;
world.collision = collisionWorld;

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

// Restore progress
const progress = loadSovereignProgress();
if (progress.inventory) {
    player.inventory = Inventory.fromJSON(progress.inventory);
}
if (progress.hp) player.health.hp = progress.hp;
const startId = progress.currentBeat || 'beat-01-crypt';
loadLevel(startId);

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

// ── Main loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let deathTimer = 0;
let deathShown = false;
let saveAcc = 0;

function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    renderer.info.reset();

    // Juice ticks on RAW dt so hitstop can end itself and flashes restore
    juice.update(dt);
    const sdt = dt * juice.timeScale;

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
        game.paused = !game.paused;
        hud.toast(game.paused ? 'Paused' : 'Resumed', 900);
    }

    if (input.consumeLevelNext()) {
        const nid = nextLevelId(game.levelId);
        const prog = loadSovereignProgress();
        const unlocked = new Set(prog.unlockedBeats || []);
        // Always allow sandbox + currently unlocked; also allow free roam if already visited
        if (unlocked.has(nid) || nid === 'sandbox-combat' || prog.currentBeat === nid) {
            loadLevel(nid);
        } else {
            // Soft gate: still allow skip with toast so playtests aren't bricked,
            // but require either unlock OR holding Shift (dev bypass).
            if (input.keys.has('ShiftLeft') || input.keys.has('ShiftRight')) {
                loadLevel(nid);
                hud.toast(`Dev skip → ${nid}`);
            } else {
                // Progressive unlock is real; offer unlock toast
                hud.toast(`Locked: defeat prior boss or Shift+] to force`);
            }
        }
    }
    if (input.consumeLevelPrev()) {
        const pid = prevLevelId(game.levelId);
        loadLevel(pid); // always allow backtracking
    }
    if (input.consumeMoodToggle()) {
        mood.toggle();
        hud.toast(`Mood: ${mood.mood}`);
    }
    if (input.consumeStoryAdvance()) {
        hud.story?.advance?.();
    }

    if (!game.paused) {
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
                    camRig.focus({ height: 10, back: 6, duration: 1.8, target: b.root?.position || null });
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

        // Global grapple fallback (levels without anchors)
        if (input.consumeGrapple() && player.inventory.hasItem('magnetic_grapple')) {
            if (!player.grapple.active) {
                const fv = player.state.facingVec;
                const target = {
                    x: player.root.position.x + fv.x * 8,
                    y: player.root.position.y,
                    z: player.root.position.z + fv.z * 8,
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
        hp: player.health.hp,
        maxHp: player.health.max,
        weapon: wpn.name || player.inventory.activeWeapon,
        memoryKeys: player.inventory.memoryKeyCount,
        scarShards: player.inventory.scarShards,
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
    save() {
        return saveSovereignProgress({
            currentBeat: game.levelId,
            inventory: player.inventory.toJSON(),
            hp: player.health.hp,
            playTime: game.playTime,
            mood: mood.mood,
        });
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
