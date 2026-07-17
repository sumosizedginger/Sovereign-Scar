// Beat 06 — The Bleeding Quarry (Dark Palace).
// C3: first Abyss dungeon, 8 rooms. Dungeon item: Heavy Mallet (shatters
// ore). Destructible boulders + gold-vein walls carry over from the arena.
//
// Layout:               [molthall]      Obsidian Arachnid (boss door)
//                       [veinworks]     boss key behind an ore wall
//      [goldgash*] —    [deepcut]       locked, altar, key 2
//   [orecrush] — [quarryfloor] — [siftery]
//    Heavy Mallet      key 1           map
//                       [pitgate]       start; S exit → overworld

import * as THREE from 'three';
import { createDungeon } from '../world/room-graph.js';
import { addKeyPickup } from '../world/keys.js';
import { CRUST_COLORS, ABYSS_COLORS } from '../assets/palettes.js';
import { DestructibleVoxelMesh } from '../world/destructible-voxel-mesh.js';
import { buildBoulder } from '../assets/props.js';
import { fillBox } from '../../voxel/helpers.js';
import { abyssTint } from '../world/level-builder.js';
import { ObsidianArachnid, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';

function addBoulders(level, ctx, origin, spots, prefix) {
    for (let i = 0; i < spots.length; i++) {
        const [ox, oz] = spots[i];
        const m = buildBoulder(0, 0, 0, 2, CRUST_COLORS.slate);
        const dest = new DestructibleVoxelMesh(
            m,
            new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
            ctx.particles,
            ctx.collisionWorld,
            `${prefix}-${i}`,
            { origin: { x: origin.x + ox, y: 0.5, z: origin.z + oz }, scene: ctx.scene, voxelSize: 0.45 }
        );
        level.destructibles.push(dest);
        level.addSystem({ update() {}, dispose: () => dest.dispose() });
    }
}

export const BEAT06_DEF = {
    id: 'beat-06-quarry',
    name: '06 Bleeding Quarry',
    mood: 'abyss',
    start: 'pitgate',
    prebake: true,
    banner: 'The quarry bleeds gold. Something larger molts in the dark.',
    keys: [
        { room: 'quarryfloor', type: 'small' },
        { room: 'deepcut', type: 'small' },
        { room: 'veinworks', type: 'boss' },
    ],
    onExit(game) {
        game.loadLevel?.('overworld');
    },
    rooms: {
        pitgate: {
            grid: [0, 0],
            half: 7,
            wallH: 4,
            spawn: { x: 0, z: 4 },
            build(map, h) {
                abyssTint(map);
                h.fillBox(map, -5, -4, 1, 3, -3, -2, ABYSS_COLORS.basalt);
                h.fillBox(map, 4, 5, 1, 3, -3, -2, ABYSS_COLORS.basalt);
            },
            doors: [
                { to: 'quarryfloor', side: 'N', at: 0, type: 'open' },
                { to: '_world', side: 'S', at: 0, type: 'exit' },
            ],
        },
        quarryfloor: {
            grid: [0, -1],
            half: 11,
            wallH: 4,
            build(map, h) {
                abyssTint(map);
                h.fillBox(map, 4, 8, 1, 3, -2, 2, ABYSS_COLORS.basalt);
            },
            enemies: [
                { x: -5, z: 4, kind: 'scarab', hp: 4, ai: 'charge' },
                { x: 5, z: -5, kind: 'sentinel', hp: 4 },
            ],
            doors: [
                { to: 'pitgate', side: 'S', at: 0, type: 'open' },
                { to: 'deepcut', side: 'N', at: 0, type: 'locked' },
                { to: 'orecrush', side: 'W', at: 0, type: 'open' },
                { to: 'siftery', side: 'E', at: 0, type: 'open' },
            ],
            onBake(level, origin, ctx) {
                addBoulders(level, ctx, origin, [[-4, -3], [0, -5], [3, 3]], 'b06-floor');
                addKeyPickup(level, 'beat-06-quarry', 'floor-key',
                    { x: origin.x - 9, y: 1.2, z: origin.z + 9 }, 'small');
            },
        },
        orecrush: {
            grid: [-1, -1],
            half: 8,
            wallH: 4,
            build(map, h) {
                abyssTint(map);
            },
            enemies: [{ x: 3, z: -3, kind: 'scarab', hp: 4, ai: 'charge' }],
            doors: [{ to: 'quarryfloor', side: 'E', at: 0, type: 'open' }],
            onBake(level, origin, ctx) {
                addBoulders(level, ctx, origin, [[-3, 2], [2, -4]], 'b06-crush');
                level.addPickup({ x: origin.x - 5, y: 1.2, z: origin.z + 5 }, {
                    color: 0xc9a227,
                    label: 'Heavy Mallet',
                    onPickup(game) {
                        game.player.inventory.grantItem('heavy_mallet');
                        game.hud?.toast?.('Heavy Mallet — shatter ore veins');
                    },
                });
            },
        },
        siftery: {
            grid: [1, -1],
            half: 7,
            wallH: 4,
            build(map, h) {
                abyssTint(map);
                h.fillBox(map, -4, 4, 0, 0, -4, 4, ABYSS_COLORS.goldVein); // sifting pans
            },
            enemies: [{ x: 0, z: -3, kind: 'frost', hp: 3, ai: 'ranged' }],
            doors: [{ to: 'quarryfloor', side: 'W', at: 0, type: 'open' }],
            onBake(level, origin) {
                if (!level.keyStore.mapPickup()) {
                    level.addPickup({ x: origin.x + 4, y: 1.2, z: origin.z + 4 }, {
                        color: 0x9ad0ff,
                        label: 'Quarry ledger',
                        onPickup(game) {
                            level.keyStore.markMapPickup();
                            game.hud?.toast?.('Quarry ledger — the map reveals the cuts');
                        },
                    });
                }
            },
        },
        deepcut: {
            grid: [0, -2],
            half: 9,
            wallH: 4,
            build(map, h) {
                abyssTint(map);
                h.fillBox(map, -7, -6, 1, 3, -3, 3, ABYSS_COLORS.basalt);
                h.fillBox(map, 6, 7, 1, 3, -3, 3, ABYSS_COLORS.basalt);
            },
            enemies: [
                { x: -4, z: 0, kind: 'scarab', hp: 4, ai: 'charge' },
                { x: 4, z: 0, kind: 'sentinel', hp: 4 },
            ],
            doors: [
                { to: 'quarryfloor', side: 'S', at: 0, type: 'locked' },
                { to: 'veinworks', side: 'N', at: 0, type: 'locked' },
                { to: 'goldgash', side: 'W', at: -3, type: 'open', width: 1 },
            ],
            onBake(level, origin, ctx) {
                addAltar(level, ctx, { x: origin.x + 6, z: origin.z + 6 });
                addKeyPickup(level, 'beat-06-quarry', 'deepcut-key',
                    { x: origin.x - 6, y: 1.2, z: origin.z - 6 }, 'small');
            },
        },
        goldgash: { // secret: a gold seam behind a caster shroud
            grid: [-1, -2],
            half: 5,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -3, 3, 0, 0, -3, 3, ABYSS_COLORS.goldVein);
            },
            doors: [{ to: 'deepcut', side: 'E', at: -3, type: 'open', width: 1 }],
            blockers: [
                { type: 'caster_dark', id: 'b06-gash-dark', rect: { x0: -3, x1: 3, z0: -3, z1: 3 } },
            ],
            onBake(level, origin) {
                level.addPickup({ x: origin.x, y: 1.2, z: origin.z }, {
                    color: 0x7fe0ff,
                    label: 'Gold seam',
                    onPickup(game) {
                        game.player.inventory.addShards(35);
                        game.hud?.toast?.('Gold seam — 35 shards');
                    },
                });
            },
        },
        veinworks: {
            grid: [0, -3],
            half: 8,
            wallH: 4,
            build(map, h) {
                abyssTint(map);
            },
            enemies: [
                { x: -3, z: -3, kind: 'scarab', hp: 4, ai: 'charge' },
                { x: 3, z: -3, kind: 'scarab', hp: 4, ai: 'charge' },
            ],
            doors: [
                { to: 'deepcut', side: 'S', at: 0, type: 'locked' },
                { to: 'molthall', side: 'N', at: 0, type: 'boss' },
            ],
            onBake(level, origin, ctx) {
                // The boss key hides behind a destructible gold-vein wall
                const wallMap = new Map();
                fillBox(wallMap, 0, 4, 0, 3, 0, 1, ABYSS_COLORS.basalt);
                for (let y = 0; y <= 3; y++) wallMap.set(`2,${y},0`, ABYSS_COLORS.goldVein);
                const wall = new DestructibleVoxelMesh(
                    wallMap,
                    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.15 }),
                    ctx.particles,
                    ctx.collisionWorld,
                    'b06-vein-wall',
                    { origin: { x: origin.x + 3, y: 0.5, z: origin.z - 4 }, scene: ctx.scene, voxelSize: 0.5 }
                );
                level.destructibles.push(wall);
                level.addSystem({ update() {}, dispose: () => wall.dispose() });
                addKeyPickup(level, 'beat-06-quarry', 'vein-boss-key',
                    { x: origin.x + 4, y: 1.4, z: origin.z - 6 }, 'boss');
            },
        },
        molthall: {
            grid: [0, -4],
            half: 12,
            wallH: 5,
            build(map, h) {
                abyssTint(map);
                h.fillBox(map, -8, -7, 1, 3, -8, 7, ABYSS_COLORS.basalt);
                h.fillBox(map, 7, 8, 1, 3, -8, 7, ABYSS_COLORS.basalt);
            },
            doors: [{ to: 'veinworks', side: 'S', at: 0, type: 'boss' }],
            boss(ctx, level, origin) {
                const spider = new ObsidianArachnid(ctx.scene, {
                    x: origin.x, y: 1, z: origin.z - 3,
                });
                attachBoss(level, spider, {
                    nextBeat: 'beat-07-sluice',
                    toast: 'Arachnid crushed — Sluice of Tears opens',
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

export function loadBeat06(ctx) {
    const level = createDungeon(ctx, BEAT06_DEF);
    level.suppressBossIntro = true;
    level.musicBed = 'abyss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'The quarry bleeds gold. Something larger molts in the dark.' },
        { speaker: 'SYSTEM', text: 'Armor fails only during leaps. Time your swings.' },
    ];
    return level;
}
