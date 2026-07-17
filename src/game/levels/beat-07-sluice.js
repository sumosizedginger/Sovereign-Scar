// Beat 07 — The Sluice of Tears (Swamp Palace).
// C3: 8-room abyss waterworks built around grapple traversal — carved pools
// and chasms crossed on anchor posts (W7 grapple gaps).
//
// Layout:                [cloudcourt]    Hydroid Cloud (boss door)
//                        [surgechamber]  boss key gauntlet
//     [brinepocket*] —   [drownedway]    locked, altar, key 2
//    [tearwell] — [weepinghall] — [cascades]
//       map        key 1 + gap      grapple (spare) + gap cache
//                        [floodgate]     start; S exit → overworld

import { createDungeon } from '../world/room-graph.js';
import { addKeyPickup } from '../world/keys.js';
import { ABYSS_COLORS } from '../assets/palettes.js';
import { abyssTint } from '../world/level-builder.js';
import { HydroidCloud, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';

export const BEAT07_DEF = {
    id: 'beat-07-sluice',
    name: '07 Sluice of Tears',
    mood: 'abyss',
    start: 'floodgate',
    prebake: true,
    floorColor: ABYSS_COLORS.abyssFloor,
    wallColor: ABYSS_COLORS.abyssWall,
    banner: 'Tears fall upward here. Cross on the anchors.',
    keys: [
        { room: 'weepinghall', type: 'small' },
        { room: 'drownedway', type: 'small' },
        { room: 'surgechamber', type: 'boss' },
    ],
    onExit(game) {
        game.loadLevel?.('overworld');
    },
    rooms: {
        floodgate: {
            grid: [0, 0],
            half: 7,
            wallH: 4,
            spawn: { x: 0, z: 4 },
            build(map, h) {
                h.fillBox(map, -4, 4, 0, 0, -4, -2, ABYSS_COLORS.basalt); // spill channel
            },
            doors: [
                { to: 'weepinghall', side: 'N', at: 0, type: 'open' },
                { to: '_world', side: 'S', at: 0, type: 'exit' },
            ],
        },
        weepinghall: {
            grid: [0, -1],
            half: 11,
            wallH: 4,
            build(map, h) {
                abyssTint(map);
            },
            enemies: [
                { x: -6, z: 5, kind: 'frost', hp: 3, ai: 'ranged' },
                { x: 6, z: 5, kind: 'sentinel', hp: 4 },
            ],
            // The hall is split by a weeping chasm — grapple across
            blockers: [
                {
                    type: 'grapple_gap', id: 'b07-hall-gap',
                    rect: { x0: -10, x1: 10, z0: -3, z1: -1 },
                    anchor: { x: 0, z: 2 },
                    edge: { x: 0, z: -5 },
                },
            ],
            doors: [
                { to: 'floodgate', side: 'S', at: 0, type: 'open' },
                { to: 'drownedway', side: 'N', at: 0, type: 'locked' },
                { to: 'tearwell', side: 'W', at: -6, type: 'open' },
                { to: 'cascades', side: 'E', at: -6, type: 'open' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-07-sluice', 'hall-key',
                    { x: origin.x + 9, y: 1.2, z: origin.z - 9 }, 'small');
            },
        },
        tearwell: {
            grid: [-1, -1],
            half: 7,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -3, 3, 0, 0, -3, 3, ABYSS_COLORS.basalt); // the well
            },
            enemies: [{ x: 3, z: 3, kind: 'frost', hp: 3, ai: 'ranged' }],
            doors: [{ to: 'weepinghall', side: 'E', at: -6, type: 'open' }],
            onBake(level, origin) {
                if (!level.keyStore.mapPickup()) {
                    level.addPickup({ x: origin.x, y: 1.2, z: origin.z }, {
                        color: 0x9ad0ff,
                        label: 'Sluice charts',
                        onPickup(game) {
                            level.keyStore.markMapPickup();
                            game.hud?.toast?.('Sluice charts — the map reveals the channels');
                        },
                    });
                }
            },
        },
        cascades: {
            grid: [1, -1],
            half: 8,
            wallH: 4,
            build(map, h) {
                abyssTint(map);
            },
            enemies: [{ x: 0, z: 4, kind: 'scarab', hp: 4, ai: 'charge' }],
            blockers: [
                {
                    type: 'grapple_gap', id: 'b07-cascade-gap',
                    rect: { x0: -2, x1: 2, z0: -6, z1: -3 },
                    anchor: { x: 0, z: -1 },
                    edge: { x: 0, z: -7 },
                },
            ],
            doors: [{ to: 'weepinghall', side: 'W', at: -6, type: 'open' }],
            onBake(level, origin) {
                level.addPickup({ x: origin.x - 5, y: 1.2, z: origin.z + 5 }, {
                    color: 0x40e0ff,
                    label: 'Magnetic Grapple',
                    onPickup(game) {
                        game.player.inventory.grantItem('magnetic_grapple');
                        game.hud?.toast?.('Magnetic Grapple — press G at the anchors');
                    },
                });
                level.addPickup({ x: origin.x + 5, y: 1.2, z: origin.z - 6 }, {
                    color: 0x7fe0ff,
                    label: 'Cascade cache',
                    onPickup(game) {
                        game.player.inventory.addShards(25);
                        game.hud?.toast?.('Cascade cache — 25 shards');
                    },
                });
            },
        },
        drownedway: {
            grid: [0, -2],
            half: 9,
            wallH: 4,
            build(map, h) {
                abyssTint(map);
                h.fillBox(map, -7, -6, 1, 3, -3, 3, ABYSS_COLORS.abyssWall);
                h.fillBox(map, 6, 7, 1, 3, -3, 3, ABYSS_COLORS.abyssWall);
            },
            enemies: [
                { x: -4, z: 0, kind: 'frost', hp: 3, ai: 'ranged' },
                { x: 4, z: 0, kind: 'sentinel', hp: 4 },
            ],
            doors: [
                { to: 'weepinghall', side: 'S', at: 0, type: 'locked' },
                { to: 'surgechamber', side: 'N', at: 0, type: 'locked' },
                { to: 'brinepocket', side: 'E', at: 3, type: 'open', width: 1 },
            ],
            onBake(level, origin, ctx) {
                addAltar(level, ctx, { x: origin.x - 6, z: origin.z + 6 });
                addKeyPickup(level, 'beat-07-sluice', 'drowned-key',
                    { x: origin.x + 6, y: 1.2, z: origin.z + 6 }, 'small');
            },
        },
        brinepocket: { // secret: a ledge-guarded brine hollow
            grid: [1, -2],
            half: 5,
            wallH: 4,
            doors: [{ to: 'drownedway', side: 'W', at: 3, type: 'open', width: 1 }],
            blockers: [
                { type: 'boot_ledge', id: 'b07-brine-ledge', rect: { x0: -4, x1: 4, z0: -1, z1: -1 } },
            ],
            onBake(level, origin) {
                level.addPickup({ x: origin.x, y: 1.2, z: origin.z - 3 }, {
                    color: 0x7fe0ff,
                    label: 'Brine cache',
                    onPickup(game) {
                        game.player.inventory.addShards(30);
                        game.hud?.toast?.('Brine cache — 30 shards');
                    },
                });
            },
        },
        surgechamber: {
            grid: [0, -3],
            half: 8,
            wallH: 4,
            build(map, h) {
                abyssTint(map);
            },
            enemies: [
                { x: -3, z: -3, kind: 'frost', hp: 3, ai: 'ranged' },
                { x: 3, z: -3, kind: 'frost', hp: 3, ai: 'ranged' },
                { x: 0, z: 3, kind: 'scarab', hp: 4, ai: 'charge' },
            ],
            doors: [
                { to: 'drownedway', side: 'S', at: 0, type: 'locked' },
                { to: 'cloudcourt', side: 'N', at: 0, type: 'boss' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-07-sluice', 'surge-boss-key',
                    { x: origin.x, y: 1.4, z: origin.z - 5 }, 'boss');
            },
        },
        cloudcourt: {
            grid: [0, -4],
            half: 12,
            wallH: 5,
            build(map, h) {
                // Carved pools around the arena rim
                h.fillBox(map, -10, -4, 0, 0, -2, 2, ABYSS_COLORS.basalt);
                h.fillBox(map, 4, 10, 0, 0, -2, 2, ABYSS_COLORS.basalt);
                h.fillBox(map, -2, 2, 0, 0, -10, -6, ABYSS_COLORS.basalt);
            },
            doors: [{ to: 'surgechamber', side: 'S', at: 0, type: 'boss' }],
            boss(ctx, level, origin) {
                const cloud = new HydroidCloud(ctx.scene, {
                    x: origin.x, y: 2, z: origin.z - 6,
                });
                attachBoss(level, cloud, {
                    nextBeat: 'beat-08-bone',
                    toast: 'Hydroid dispersed — Bone Forest awaits',
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

export function loadBeat07(ctx) {
    const level = createDungeon(ctx, BEAT07_DEF);
    level.suppressBossIntro = true;
    level.musicBed = 'abyss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'Tears fall upward here. The cloud drinks them.' },
        { speaker: 'SYSTEM', text: 'Magnetic Grapple (G) crosses the weeping gaps. Avoid pulse rings.' },
    ];
    return level;
}
