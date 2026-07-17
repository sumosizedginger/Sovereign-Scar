// Beat 10 — The Cryo Vault (Ice Palace).
// C3: 8-room frozen archive, ice friction throughout. Meltable ice walls
// (destructibles) and crystal fields carry over.
//
// Layout:                [twincage]      Frost & Fuel (boss door)
//                        [coldstore]     boss key behind meltable ice
//      [icecomb*] —      [glacierhall]   locked, altar, key 2
//    [frostbite] — [vaultfloor] — [crystalgarden]
//        map           key 1          crystals + cache
//                        [ventgate]      start; S exit → overworld

import * as THREE from 'three';
import { createDungeon } from '../world/room-graph.js';
import { addKeyPickup } from '../world/keys.js';
import { ABYSS_COLORS } from '../assets/palettes.js';
import { DestructibleVoxelMesh } from '../world/destructible-voxel-mesh.js';
import { buildIceCrystal, stampMap } from '../assets/props.js';
import { fillBox } from '../../voxel/helpers.js';
import { FrostAndFuel, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';

function addIceWall(level, ctx, origin, at, size, id) {
    const ice = new Map();
    fillBox(ice, 0, size.w, 0, size.h, 0, size.d, ABYSS_COLORS.ice);
    const melt = new DestructibleVoxelMesh(
        ice,
        new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.3, metalness: 0.2,
            transparent: true, opacity: 0.85,
        }),
        ctx.particles,
        ctx.collisionWorld,
        id,
        { origin: { x: origin.x + at.x, y: 0.5, z: origin.z + at.z }, scene: ctx.scene, voxelSize: 0.5 }
    );
    level.destructibles.push(melt);
    level.addSystem({ update() {}, dispose: () => melt.dispose() });
    return melt;
}

export const BEAT10_DEF = {
    id: 'beat-10-cryo',
    name: '10 Cryo Vault',
    mood: 'abyss',
    start: 'ventgate',
    prebake: true,
    friction: 'ice',
    floorColor: ABYSS_COLORS.iceDark,
    wallColor: 0x2a4058,
    banner: 'Two hearts share one cage: freeze and feed.',
    keys: [
        { room: 'vaultfloor', type: 'small' },
        { room: 'glacierhall', type: 'small' },
        { room: 'coldstore', type: 'boss' },
    ],
    onExit(game) {
        game.loadLevel?.('overworld');
    },
    rooms: {
        ventgate: {
            grid: [0, 0],
            half: 7,
            wallH: 4,
            spawn: { x: 0, z: 4 },
            build(map, h) {
                stampMap(map, buildIceCrystal(-3, -3), 0, 1, 0);
                stampMap(map, buildIceCrystal(3, -3), 0, 1, 0);
            },
            doors: [
                { to: 'vaultfloor', side: 'N', at: 0, type: 'open' },
                { to: '_world', side: 'S', at: 0, type: 'exit' },
            ],
        },
        vaultfloor: {
            grid: [0, -1],
            half: 11,
            wallH: 4,
            build(map, h) {
                stampMap(map, buildIceCrystal(-5, -3), 0, 1, 0);
                stampMap(map, buildIceCrystal(5, 2), 0, 1, 0);
                h.fillBox(map, -2, 2, 1, 2, 6, 8, ABYSS_COLORS.ice);
            },
            enemies: [
                { x: -5, z: 4, kind: 'frost', hp: 4, ai: 'ranged' },
                { x: 5, z: -5, kind: 'sentinel', hp: 4 },
            ],
            doors: [
                { to: 'ventgate', side: 'S', at: 0, type: 'open' },
                { to: 'glacierhall', side: 'N', at: 0, type: 'locked' },
                { to: 'frostbite', side: 'W', at: 0, type: 'open' },
                { to: 'crystalgarden', side: 'E', at: 0, type: 'open' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-10-cryo', 'floor-key',
                    { x: origin.x + 9, y: 1.2, z: origin.z - 9 }, 'small');
            },
        },
        frostbite: {
            grid: [-1, -1],
            half: 7,
            wallH: 4,
            build(map, h) {
                stampMap(map, buildIceCrystal(0, 0), 0, 1, 0);
            },
            enemies: [{ x: 3, z: 3, kind: 'frost', hp: 4, ai: 'ranged' }],
            doors: [{ to: 'vaultfloor', side: 'E', at: 0, type: 'open' }],
            onBake(level, origin) {
                if (!level.keyStore.mapPickup()) {
                    level.addPickup({ x: origin.x - 4, y: 1.2, z: origin.z - 4 }, {
                        color: 0x9ad0ff,
                        label: 'Vault manifest',
                        onPickup(game) {
                            level.keyStore.markMapPickup();
                            game.hud?.toast?.('Vault manifest — the map reveals the stores');
                        },
                    });
                }
            },
        },
        crystalgarden: {
            grid: [1, -1],
            half: 8,
            wallH: 4,
            build(map, h) {
                stampMap(map, buildIceCrystal(-3, -3), 0, 1, 0);
                stampMap(map, buildIceCrystal(3, 0), 0, 1, 0);
                stampMap(map, buildIceCrystal(0, 4), 0, 1, 0);
            },
            enemies: [{ x: 0, z: -4, kind: 'scarab', hp: 4, ai: 'charge' }],
            doors: [{ to: 'vaultfloor', side: 'W', at: 0, type: 'open' }],
            onBake(level, origin) {
                level.addPickup({ x: origin.x + 5, y: 1.2, z: origin.z - 5 }, {
                    color: 0x7fe0ff,
                    label: 'Crystal cache',
                    onPickup(game) {
                        game.player.inventory.addShards(25);
                        game.hud?.toast?.('Crystal cache — 25 shards');
                    },
                });
            },
        },
        glacierhall: {
            grid: [0, -2],
            half: 9,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -7, -6, 1, 3, -3, 3, ABYSS_COLORS.ice);
                h.fillBox(map, 6, 7, 1, 3, -3, 3, ABYSS_COLORS.ice);
            },
            enemies: [
                { x: -4, z: 0, kind: 'frost', hp: 4, ai: 'ranged' },
                { x: 4, z: 0, kind: 'sentinel', hp: 4 },
            ],
            doors: [
                { to: 'vaultfloor', side: 'S', at: 0, type: 'locked' },
                { to: 'coldstore', side: 'N', at: 0, type: 'locked' },
                { to: 'icecomb', side: 'W', at: -3, type: 'open', width: 1 },
            ],
            onBake(level, origin, ctx) {
                addAltar(level, ctx, { x: origin.x + 6, z: origin.z + 6 });
                addKeyPickup(level, 'beat-10-cryo', 'glacier-key',
                    { x: origin.x - 6, y: 1.2, z: origin.z - 6 }, 'small');
            },
            onEnter(game) {
                if (!this._storyShown) {
                    this._storyShown = true;
                    game.hud?.story?.queue?.([
                        { speaker: 'PREDECESSOR', text: 'Frost preserves what it cannot save. The vault remembers warmth.' },
                        { speaker: 'PREDECESSOR', text: 'Two heads argue over the floor state. Let them — then strike the fuel.' },
                    ]);
                }
            },
        },
        icecomb: { // secret: honeycombed ice pocket behind a ledge
            grid: [-1, -2],
            half: 5,
            wallH: 4,
            doors: [{ to: 'glacierhall', side: 'E', at: -3, type: 'open', width: 1 }],
            blockers: [
                { type: 'boot_ledge', id: 'b10-comb-ledge', rect: { x0: -4, x1: 4, z0: -1, z1: -1 } },
            ],
            onBake(level, origin) {
                level.addPickup({ x: origin.x, y: 1.2, z: origin.z - 3 }, {
                    color: 0x7fe0ff,
                    label: 'Ice-comb cache',
                    onPickup(game) {
                        game.player.inventory.addShards(30);
                        game.hud?.toast?.('Ice-comb cache — 30 shards');
                    },
                });
            },
        },
        coldstore: {
            grid: [0, -3],
            half: 8,
            wallH: 4,
            enemies: [
                { x: -3, z: -3, kind: 'frost', hp: 4, ai: 'ranged' },
                { x: 3, z: -3, kind: 'frost', hp: 4, ai: 'ranged' },
                { x: 0, z: 3, kind: 'scarab', hp: 4, ai: 'charge' },
            ],
            doors: [
                { to: 'glacierhall', side: 'S', at: 0, type: 'locked' },
                { to: 'twincage', side: 'N', at: 0, type: 'boss' },
            ],
            onBake(level, origin, ctx) {
                // The boss key waits behind a meltable ice wall
                addIceWall(level, ctx, origin, { x: -2, z: -6 }, { w: 4, h: 3, d: 1 }, 'b10-store-ice');
                addKeyPickup(level, 'beat-10-cryo', 'store-boss-key',
                    { x: origin.x, y: 1.4, z: origin.z - 7 }, 'boss');
            },
        },
        twincage: {
            grid: [0, -4],
            half: 12,
            wallH: 5,
            build(map, h) {
                stampMap(map, buildIceCrystal(-5, -3), 0, 1, 0);
                stampMap(map, buildIceCrystal(5, 2), 0, 1, 0);
                stampMap(map, buildIceCrystal(0, -6), 0, 1, 0);
            },
            doors: [{ to: 'coldstore', side: 'S', at: 0, type: 'boss' }],
            boss(ctx, level, origin) {
                const twins = new FrostAndFuel(ctx.scene, {
                    x: origin.x, y: 1.6, z: origin.z - 3,
                });
                attachBoss(level, twins, {
                    nextBeat: 'beat-11-mire',
                    toast: 'Twins quenched — the Rot Mire festers on',
                    defeatStory: [
                        { speaker: 'PREDECESSOR', text: 'Twin heads, one quiet. The ice is only water waiting — five of seven free.' },
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

export function loadBeat10(ctx) {
    const level = createDungeon(ctx, BEAT10_DEF);
    level.suppressBossIntro = true;
    level.musicBed = 'abyss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'Two hearts share one cage: freeze and feed.' },
        { speaker: 'SYSTEM', text: 'Watch the bright head — that mode dictates the next blast.' },
    ];
    return level;
}
