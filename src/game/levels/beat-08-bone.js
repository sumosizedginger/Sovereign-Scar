// Beat 08 — The Bone Forest (Skull Woods).
// C3: 8-room ossuary grove under a dead god's ribs. Bone arches, elevated
// bone decks (multi-Y platforms), a caged cache to shatter.
//
// Layout:                [prayerhollow]   Skeletal Mantis (boss door)
//                        [ribvault]       boss key on a bone deck
//      [marrowcyst*] —   [ossuary]        locked, altar, key 2
//    [gravecanopy] — [bonegrove] — [femurstand]
//        map            key 1          caged cache + mallet play
//                        [rootgate]       start; S exit → overworld

import * as THREE from 'three';
import { createDungeon } from '../world/room-graph.js';
import { addKeyPickup } from '../world/keys.js';
import { ABYSS_COLORS } from '../assets/palettes.js';
import { buildBoneArch, stampMap, buildBoulder } from '../assets/props.js';
import { DestructibleVoxelMesh } from '../world/destructible-voxel-mesh.js';
import { SkeletalMantis, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';
import { collectUnstableSpore } from '../narrative/item-chains.js';

export const BEAT08_DEF = {
    id: 'beat-08-bone',
    name: '08 Bone Forest',
    mood: 'abyss',
    // This dungeon's own boost, set when the shared Abyss preset was much
    // dimmer. That preset was later raised on its own (2026-07-23, to match
    // the Crust's brightness) — this boost is now compounding on top of an
    // already-brighter base and needs to come back down. Re-tune from here,
    // not from feel: node tests/qa/contrast-probe.mjs.
    lightTune: { ambient: 1.25, key: 1.2 },
    start: 'rootgate',
    prebake: true,
    floorColor: 0x544c34, // certification retune: old 0x2a2618 sat under 2% linear reflectance
    wallColor: ABYSS_COLORS.abyssWall,
    banner: 'Ribs of a dead god form this canopy. Something prays with blades.',
    // Z6 — this dungeon's one idea, and the four rooms that carry it:
    // introduce it safely, complicate it, fuse it with combat, then examine it.
    theme: {
        id: 'flanking',
        name: 'Behind the Plate',
        hint: "Lock on with T, then circle. Facing stops following your feet — that is how you get behind armour.",
        teach: 'bonegrove',
        develop: 'gravecanopy',
        combine: 'ribvault',
        test: 'prayerhollow',
    },
    keys: [
        { room: 'bonegrove', type: 'small' },
        { room: 'ossuary', type: 'small' },
        { room: 'ribvault', type: 'boss' },
    ],
    onExit(game) {
        game.loadLevel?.('overworld');
    },
    rooms: {
        rootgate: {
            grid: [0, 0],
            half: 7,
            wallH: 4,
            spawn: { x: 0, z: 4 },
            build(map, h) {
                stampMap(map, buildBoneArch(0, -3, 4, 5), 0, 1, 0);
            },
            doors: [
                { to: 'bonegrove', side: 'N', at: 0, type: 'open' },
                { to: '_world', side: 'S', at: 0, type: 'exit' },
            ],
        },
        bonegrove: {
            grid: [0, -1],
            half: 11,
            wallH: 4,
            build(map, h) {
                stampMap(map, buildBoneArch(0, 0, 5, 6), 0, 1, 0);
                stampMap(map, buildBoneArch(-6, 4, 3, 4), 0, 1, 0);
                stampMap(map, buildBoneArch(6, -4, 3, 5), 0, 1, 0);
            },
            enemies: [
                { x: -5, z: 4, kind: 'bulwark', hp: 4 },
                { x: 5, z: -5, kind: 'lancer', hp: 4 },
            ],
            doors: [
                { to: 'rootgate', side: 'S', at: 0, type: 'open' },
                { to: 'ossuary', side: 'N', at: 0, type: 'locked' },
                { to: 'gravecanopy', side: 'W', at: 0, type: 'open' },
                { to: 'femurstand', side: 'E', at: 0, type: 'open' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-08-bone', 'grove-key',
                    { x: origin.x + 9, y: 1.2, z: origin.z + 9 }, 'small');
            },
        },
        gravecanopy: {
            grid: [-1, -1],
            half: 7,
            wallH: 4,
            build(map, h) {
                stampMap(map, buildBoneArch(0, 0, 3, 4), 0, 1, 0);
            },
            enemies: [{ x: 3, z: 3, kind: 'bulwark', hp: 3, ai: 'ranged' }],
            doors: [{ to: 'bonegrove', side: 'E', at: 0, type: 'open' }],
            onBake(level, origin) {
                if (!level.keyStore.mapPickup()) {
                    level.addPickup({ x: origin.x - 4, y: 1.2, z: origin.z - 4 }, {
                        color: 0x9ad0ff,
                        label: 'Grave rubbings',
                        onPickup(game) {
                            level.keyStore.markMapPickup();
                            game.hud?.toast?.('Grave rubbings — the map reveals the grove');
                        },
                    });
                }
            },
        },
        femurstand: {
            grid: [1, -1],
            half: 8,
            wallH: 4,
            enemies: [{ x: -3, z: -3, kind: 'lancer', hp: 4, ai: 'charge' }],
            platforms(map, h) {
                // A bone deck reached by 1-high vertebra steps
                for (let lvl = 1; lvl <= 3; lvl++) {
                    const r = 3 - lvl;
                    h.fillBox(map, -4 - r, -4 + r, lvl, lvl, -4 - r, -4 + r, ABYSS_COLORS.bone);
                }
            },
            doors: [{ to: 'bonegrove', side: 'W', at: 0, type: 'open' }],
            onBake(level, origin, ctx) {
                // The caged cache: shatter the bone boulder to reach it
                const cage = buildBoulder(0, 0, 0, 2, ABYSS_COLORS.bone);
                const dest = new DestructibleVoxelMesh(
                    cage,
                    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
                    ctx.particles,
                    ctx.collisionWorld,
                    'b08-bone-cage',
                    { origin: { x: origin.x + 4, y: 0.5, z: origin.z + 3 }, scene: ctx.scene, voxelSize: 0.4 }
                );
                level.destructibles.push(dest);
                level.addSystem({ update() {}, dispose: () => dest.dispose() });
                level.addPickup({ x: origin.x + 4, y: 1.2, z: origin.z + 3 }, {
                    color: 0x7fe0ff,
                    label: 'Caged cache',
                    reward: { type: 'currency' },
                    onPickup(game) {
                        game.player.inventory.addShards(25);
                        game.hud?.toast?.('Caged cache — 25 shards');
                    },
                });
            },
        },
        ossuary: {
            grid: [0, -2],
            half: 9,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -7, -6, 1, 3, -3, 3, ABYSS_COLORS.bone);
                h.fillBox(map, 6, 7, 1, 3, -3, 3, ABYSS_COLORS.bone);
            },
            enemies: [
                { x: -4, z: 0, kind: 'bulwark', hp: 4 },
                { x: 4, z: 0, kind: 'lancer', hp: 3 },
            ],
            doors: [
                { to: 'bonegrove', side: 'S', at: 0, type: 'locked' },
                { to: 'ribvault', side: 'N', at: 0, type: 'locked' },
                { to: 'marrowcyst', side: 'W', at: 3, type: 'open', width: 1 },
            ],
            onBake(level, origin, ctx) {
                addAltar(level, ctx, { x: origin.x + 6, z: origin.z + 6 });
                addKeyPickup(level, 'beat-08-bone', 'ossuary-key',
                    { x: origin.x - 6, y: 1.2, z: origin.z - 6 }, 'small');
            },
            onEnter(game) {
                if (!this._storyShown) {
                    this._storyShown = true;
                    game.hud?.story?.queue?.([
                        { speaker: 'PREDECESSOR', text: 'The forest grew down, not up. Roots know things branches never will.' },
                        { speaker: 'PREDECESSOR', text: 'The bladed one prunes the canopy. Bait its scythes into iron.' },
                    ]);
                }
            },
        },
        marrowcyst: { // secret: wedge-cracked marrow pocket
            grid: [-1, -2],
            half: 5,
            wallH: 4,
            doors: [{ to: 'ossuary', side: 'E', at: 3, type: 'open', width: 1 }],
            blockers: [
                { type: 'wedge_crack', id: 'b08-marrow-crack', at: { x: -2, z: -2 }, w: 2, h: 2 },
            ],
            onBake(level, origin) {
                level.addPickup({ x: origin.x + 2, y: 1.2, z: origin.z + 2 }, {
                    color: 0xff7a90,
                    label: 'Scar Suture',
                    reward: { type: 'suture' },
                    onPickup(game) {
                        if (game.collectSuture?.('b08-marrow')) {
                            game.hud?.toast?.("Scar Suture recovered from the marrow.", 2600);
                        }
                    },
                });
                // §7 Entropy Dust chain, step 1: the unstable spore grows in
                // the same wedge-cracked pocket. No 'cache' label — this is a
                // quest object, not a Suture-eligible secret.
                level.addPickup({ x: origin.x - 2, y: 1.2, z: origin.z + 2 }, {
                    color: 0xa0ff60,
                    label: 'Unstable spore',
                    onPickup(game) { collectUnstableSpore(game); },
                });
            },
        },
        ribvault: {
            grid: [0, -3],
            half: 8,
            wallH: 5,
            enemies: [
                { x: -3, z: -3, kind: 'bulwark', hp: 4 },
                { x: 3, z: -3, kind: 'lancer', hp: 4 },
                { x: 0, z: 3, kind: 'bulwark', hp: 3 },
            ],
            platforms(map, h) {
                for (let lvl = 1; lvl <= 3; lvl++) {
                    const r = 3 - lvl;
                    h.fillBox(map, -r, r, lvl, lvl, -4 - r, -4 + r, ABYSS_COLORS.bone);
                }
            },
            doors: [
                { to: 'ossuary', side: 'S', at: 0, type: 'locked' },
                { to: 'prayerhollow', side: 'N', at: 0, type: 'boss' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-08-bone', 'rib-boss-key',
                    { x: origin.x, y: 4.4, z: origin.z - 4 }, 'boss');
            },
        },
        prayerhollow: {
            grid: [0, -4],
            half: 13,
            wallH: 5,
            // See beat-02-spindle's spindlecrown for why boss rooms need
            // their own trim: measured via tests/qa/contrast-probe.mjs.
            lightTune: { key: 0.7, ambient: 0.7, fill: 0.7, rim: 0.7 },
            build(map, h) {
                stampMap(map, buildBoneArch(0, 0, 5, 6), 0, 1, 0);
                stampMap(map, buildBoneArch(-6, 4, 3, 4), 0, 1, 0);
                stampMap(map, buildBoneArch(6, -4, 3, 5), 0, 1, 0);
            },
            doors: [{ to: 'ribvault', side: 'S', at: 0, type: 'boss' }],
            boss(ctx, level, origin) {
                const mantis = new SkeletalMantis(ctx.scene, {
                    x: origin.x, y: 1.3, z: origin.z - 3,
                });
                attachBoss(level, mantis, {
                    nextBeat: 'beat-09-town',
                    toast: 'Mantis broken — Ruined Town stirs',
                    defeatStory: [
                        { speaker: 'PREDECESSOR', text: 'The Mantis folds. The roots breathe out — three of seven walk free.' },
                    ],
                });
            },
            onEnter(game) {
                const boss = game?.level?.boss;
                if (boss && !boss.defeated && !this._introFired) {
                    this._introFired = true;
                    game.bossIntro = { t: 0.6, boss, fired: false };
                    game.mood?.setMusicProfile?.('boss');
                }
            },
        },
    },
};

export function loadBeat08(ctx) {
    const level = createDungeon(ctx, BEAT08_DEF);
    level.suppressBossIntro = true;
    level.musicBed = 'abyss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'Ribs of a dead god form this canopy. Something still prays with blades.' },
        { speaker: 'SYSTEM', text: 'Sidestep scythe telegraphs. Upper decks are safer for ranged.' },
    ];
    return level;
}
