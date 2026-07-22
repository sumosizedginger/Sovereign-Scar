// Beat 04 — The Sky Monument (Tower of Hera).
// C2: 8-room ascent, the campaign's first true multi-Y dungeon (G5: platform
// voxels meshed without XZ solids; 1-cell steps climb via VoxelPhysicsBody).
// Dungeon item: Magnetic Grapple.
//
// Layout:              [corona]       Kinetic Core on the raised plate
//                      [galleria]     boss key on a high platform
//       [aerie*] —     [ascent]       locked, altar, key 2, stepped towers
//   [observatory] — [terrace] — [windworks]
//        map          key 1        Magnetic Grapple (grapple gap)
//                      [plaza]        start; S exit → overworld

import { createDungeon } from '../world/room-graph.js';
import { addKeyPickup } from '../world/keys.js';
import { CRUST_COLORS } from '../assets/palettes.js';
import { KineticCore, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';

// A square stepped pyramid of climbable 1-high steps, top at `height`
function steps(map, h, cx, cz, height, color) {
    for (let lvl = 1; lvl <= height; lvl++) {
        const r = height - lvl;
        h.fillBox(map, cx - r, cx + r, lvl, lvl, cz - r, cz + r, color);
    }
}

export const BEAT04_DEF = {
    id: 'beat-04-sky',
    name: '04 Sky Monument',
    mood: 'crust',
    start: 'plaza',
    prebake: true,
    banner: 'Climb the Monument. Ground the war-sphere.',
    // Z6 — this dungeon's one idea, and the four rooms that carry it:
    // introduce it safely, complicate it, fuse it with combat, then examine it.
    theme: {
        id: 'altitude',
        name: 'What You Cannot Reach',
        hint: "Motes hang above your blade. Shoot them down — or parry the pulse and drop them.",
        teach: 'terrace',
        develop: 'observatory',
        combine: 'galleria',
        test: 'corona',
    },
    keys: [
        { room: 'terrace', type: 'small' },
        { room: 'ascent', type: 'small' },
        { room: 'galleria', type: 'boss' },
    ],
    onExit(game) {
        game.loadLevel?.('overworld');
    },
    rooms: {
        plaza: {
            grid: [0, 0],
            half: 7,
            wallH: 4,
            spawn: { x: 0, z: 4 },
            build(map, h) {
                h.fillBox(map, -5, -4, 1, 3, -4, -3, CRUST_COLORS.limestone);
                h.fillBox(map, 4, 5, 1, 3, -4, -3, CRUST_COLORS.limestone);
            },
            doors: [
                { to: 'terrace', side: 'N', at: 0, type: 'open' },
                { to: '_world', side: 'S', at: 0, type: 'exit' },
            ],
        },
        terrace: {
            grid: [0, -1],
            half: 10,
            wallH: 4,
            enemies: [
                { x: -4, z: 2, kind: 'frost', hp: 3 },
                { x: 5, z: -4, kind: 'mote', hp: 2 },
            ],
            // Key 1 sits on a 3-step platform — the climbing tutorial
            platforms(map, h) {
                steps(map, h, 7, 7, 3, CRUST_COLORS.slate);
            },
            doors: [
                { to: 'plaza', side: 'S', at: 0, type: 'open' },
                { to: 'ascent', side: 'N', at: 0, type: 'locked' },
                { to: 'observatory', side: 'W', at: 0, type: 'open' },
                { to: 'windworks', side: 'E', at: 0, type: 'open' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-04-sky', 'terrace-key',
                    { x: origin.x + 7, y: 4.4, z: origin.z + 7 }, 'small');
            },
        },
        observatory: {
            grid: [-1, -1],
            half: 7,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -1, 1, 1, 3, -5, -4, CRUST_COLORS.iron); // scope mount
            },
            enemies: [{ x: 3, z: 3, kind: 'sentinel', hp: 3 }],
            doors: [{ to: 'terrace', side: 'E', at: 0, type: 'open' }],
            onBake(level, origin) {
                if (!level.keyStore.mapPickup()) {
                    level.addPickup({ x: origin.x, y: 1.2, z: origin.z }, {
                        color: 0x9ad0ff,
                        label: 'Monument survey',
                        onPickup(game) {
                            level.keyStore.markMapPickup();
                            game.hud?.toast?.('Monument survey — the map reveals the ascent');
                        },
                    });
                }
            },
        },
        windworks: {
            grid: [1, -1],
            half: 8,
            wallH: 4,
            enemies: [{ x: 0, z: -4, kind: 'frost', hp: 3, ai: 'ranged' }],
            doors: [{ to: 'terrace', side: 'W', at: 0, type: 'open' }],
            // The Grapple waits across a wind-torn gap — its own lesson
            blockers: [
                {
                    type: 'grapple_gap', id: 'b04-windworks-gap',
                    rect: { x0: -2, x1: 2, z0: -6, z1: -3 },
                    anchor: { x: 0, z: -1 },
                    edge: { x: 0, z: -7 },
                },
            ],
            onBake(level, origin) {
                // The grapple sits on the NEAR side; the gap guards a cache
                level.addPickup({ x: origin.x + 5, y: 1.2, z: origin.z - 6 }, {
                    color: 0x40c0ff,
                    label: 'Magnetic Grapple',
                    onPickup(game) {
                        game.player.inventory.grantItem('magnetic_grapple');
                        game.hud?.toast?.('Magnetic Grapple — G pulls you to anchors');
                    },
                });
                level.addPickup({ x: origin.x, y: 1.2, z: origin.z + 2 }, {
                    color: 0x7fe0ff,
                    label: 'Wind cache',
                    onPickup(game) {
                        game.player.inventory.addShards(20);
                        game.hud?.toast?.('Wind cache — 20 shards');
                    },
                });
            },
        },
        ascent: {
            grid: [0, -2],
            half: 9,
            wallH: 5,
            enemies: [
                { x: -4, z: 0, kind: 'mote', hp: 3 },
                { x: 4, z: 0, kind: 'sentinel', hp: 3 },
            ],
            platforms(map, h) {
                steps(map, h, -6, -6, 4, CRUST_COLORS.slate);
                steps(map, h, 6, -6, 3, CRUST_COLORS.slate);
            },
            doors: [
                { to: 'terrace', side: 'S', at: 0, type: 'locked' },
                { to: 'galleria', side: 'N', at: 0, type: 'locked' },
                { to: 'aerie', side: 'W', at: -4, type: 'open', width: 1 },
            ],
            onBake(level, origin, ctx) {
                addAltar(level, ctx, { x: origin.x + 6, z: origin.z + 6 });
                // Key 2 crowns the taller step tower
                addKeyPickup(level, 'beat-04-sky', 'ascent-key',
                    { x: origin.x - 6, y: 5.4, z: origin.z - 6 }, 'small');
            },
            onEnter(game) {
                if (!this._storyShown) {
                    this._storyShown = true;
                    game.hud?.story?.queue?.([
                        { speaker: 'PREDECESSOR', text: 'They built the Monument to look down on the Scar. The Scar looked back.' },
                        { speaker: 'PREDECESSOR', text: 'Falling is allowed here. Landing is the lesson.' },
                    ]);
                }
            },
        },
        aerie: { // secret: a shrouded nest high on the west face
            grid: [-1, -2],
            half: 6,
            wallH: 4,
            doors: [{ to: 'ascent', side: 'E', at: -4, type: 'open', width: 1 }],
            blockers: [
                { type: 'caster_dark', id: 'b04-aerie-dark', rect: { x0: -4, x1: 2, z0: -4, z1: 2 } },
            ],
            onBake(level, origin) {
                level.addPickup({ x: origin.x - 1, y: 1.2, z: origin.z - 1 }, {
                    color: 0xff7a90,
                    label: 'Scar Suture',
                    reward: { type: 'suture' },
                    onPickup(game) {
                        if (game.collectSuture?.('b04-aerie')) {
                            game.hud?.toast?.("Scar Suture recovered from the aerie.", 2600);
                        }
                    },
                });
            },
            onEnter(game) {
                game?.hud?.toast?.('A lightless nest — the Caster would burn this shroud away', 2200);
            },
        },
        galleria: {
            grid: [0, -3],
            half: 8,
            wallH: 5,
            enemies: [
                { x: -3, z: -3, kind: 'frost', hp: 3, ai: 'ranged' },
                { x: 3, z: -3, kind: 'mote', hp: 3 },
                { x: 0, z: 3, kind: 'sentinel', hp: 3, ai: 'charge' },
            ],
            platforms(map, h) {
                steps(map, h, 0, -4, 3, CRUST_COLORS.limestone);
            },
            doors: [
                { to: 'ascent', side: 'S', at: 0, type: 'locked' },
                { to: 'corona', side: 'N', at: 0, type: 'boss' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-04-sky', 'galleria-boss-key',
                    { x: origin.x, y: 4.4, z: origin.z - 4 }, 'boss');
            },
        },
        corona: {
            grid: [0, -4],
            half: 11,
            wallH: 5,
            spawn: { x: 0, z: 5 },
            build(map, h) {
                // The proven raised arena plate from the original beat
                h.fillBox(map, -6, 6, 1, 1, -6, 6, CRUST_COLORS.slate);
                h.fillBox(map, -7, -7, 1, 3, -7, 7, CRUST_COLORS.iron);
                h.fillBox(map, 7, 7, 1, 3, -7, 7, CRUST_COLORS.iron);
            },
            doors: [{ to: 'galleria', side: 'S', at: 0, type: 'boss' }],
            boss(ctx, level, origin) {
                // hoverY keeps the sphere above the y=1 arena plate (top ≈ 2).
                const core = new KineticCore(ctx.scene, ctx.collisionWorld,
                    { x: origin.x, z: origin.z - 2 }, {
                        arenaRadius: 5.5, hp: 12, hoverY: 2.95, floorY: 2.0,
                    });
                attachBoss(level, core, {
                    nextBeat: 'beat-05-citadel',
                    toast: 'Kinetic Core shattered — Citadel awaits',
                    defeatStory: [
                        { speaker: 'PREDECESSOR', text: 'The Core spins down. Three keys now — the monolith will open for you.' },
                    ],
                    onDefeat(game) {
                        game.player.inventory.grantMemoryKey('sky');
                        game.hud?.toast?.('Memory Key — Sky');
                    },
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

export function loadBeat04(ctx) {
    const level = createDungeon(ctx, BEAT04_DEF);
    level.suppressBossIntro = true;
    level.musicBed = 'crust';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'The Monument still spins a war-sphere from the old siege.' },
        { speaker: 'SYSTEM', text: 'Phase 3 splits the core. Clear the shards.' },
    ];
    return level;
}
