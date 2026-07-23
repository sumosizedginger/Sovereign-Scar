// Beat 03 — The Duval Sink (Desert Palace).
// C2: 8-room sand-sunk dungeon, friction 'sand'. Dungeon item: Phase Boot.
//
// Layout:              [spurpit]      Sand Spur (boss door)
//                      [undertow]     boss key gauntlet
//        [hollow*] —   [slipway]      locked, altar, small key 2
//   [cistern] — [dunecross] — [boneyard]
//      map         small key 1     Phase Boot + ledge lesson
//                      [sinkmouth]    start; S exit → overworld

import { createDungeon } from '../world/room-graph.js';
import { addKeyPickup } from '../world/keys.js';
import { CRUST_COLORS } from '../assets/palettes.js';
import { SandSpur, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';

export const BEAT03_DEF = {
    id: 'beat-03-sink',
    name: '03 Duval Sink',
    mood: 'crust',
    start: 'sinkmouth',
    prebake: true,
    friction: 'sand',
    floorColor: CRUST_COLORS.clay,
    wallColor: CRUST_COLORS.clayDark,
    banner: 'The Sink hunts vibration. Reach the Spur\'s nest.',
    // Z6 — this dungeon's one idea, and the four rooms that carry it:
    // introduce it safely, complicate it, fuse it with combat, then examine it.
    theme: {
        id: 'sidestep',
        name: 'Out of the Lane',
        hint: "Lancers commit to a line and cannot turn. Do not run back — step aside.",
        teach: 'dunecross',
        develop: 'cistern',
        combine: 'undertow',
        test: 'spurpit',
    },
    keys: [
        { room: 'dunecross', type: 'small' },
        { room: 'slipway', type: 'small' },
        { room: 'undertow', type: 'boss' },
    ],
    onExit(game) {
        game.loadLevel?.('overworld');
    },
    rooms: {
        sinkmouth: {
            grid: [0, 0],
            half: 7,
            wallH: 4,
            spawn: { x: 0, z: 4 },
            build(map, h) {
                h.fillBox(map, -4, -3, 1, 2, -2, -1, CRUST_COLORS.slate);
                h.fillBox(map, 3, 4, 1, 2, -2, -1, CRUST_COLORS.slate);
            },
            doors: [
                { to: 'dunecross', side: 'N', at: 0, type: 'open' },
                { to: '_world', side: 'S', at: 0, type: 'exit' },
            ],
        },
        dunecross: {
            grid: [0, -1],
            half: 10,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -3, 3, 1, 1, -3, -2, CRUST_COLORS.slate); // half-buried lintel
                h.fillBox(map, -8, -7, 1, 2, 6, 7, CRUST_COLORS.iron);
            },
            enemies: [
                { x: -5, z: 3, kind: 'scarab', hp: 3, ai: 'charge' },
                { x: 5, z: -3, kind: 'lancer', hp: 2 },
            ],
            doors: [
                { to: 'sinkmouth', side: 'S', at: 0, type: 'open' },
                { to: 'slipway', side: 'N', at: 0, type: 'locked' },
                { to: 'cistern', side: 'W', at: 0, type: 'open' },
                { to: 'boneyard', side: 'E', at: 0, type: 'open' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-03-sink', 'dunecross-key',
                    { x: origin.x + 8, y: 1.2, z: origin.z + 7 }, 'small');
            },
        },
        cistern: {
            grid: [-1, -1],
            half: 7,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -4, 4, 0, 0, -4, 4, CRUST_COLORS.slateDark); // drained basin
                h.fillBox(map, -5, -4, 1, 3, -5, -4, CRUST_COLORS.iron);
            },
            enemies: [{ x: 0, z: -3, kind: 'scarab', hp: 2, ai: 'ranged' }],
            doors: [{ to: 'dunecross', side: 'E', at: 0, type: 'open' }],
            onBake(level, origin) {
                if (!level.keyStore.mapPickup()) {
                    level.addPickup({ x: origin.x - 3, y: 1.2, z: origin.z + 3 }, {
                        color: 0x9ad0ff,
                        label: 'Sink survey',
                        onPickup(game) {
                            level.keyStore.markMapPickup();
                            game.hud?.toast?.('Sink survey — the map reveals the burrows');
                        },
                    });
                }
            },
        },
        boneyard: {
            grid: [1, -1],
            half: 8,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, 2, 3, 1, 2, 2, 3, CRUST_COLORS.limestone); // ribs
                h.fillBox(map, -3, -2, 1, 2, 4, 5, CRUST_COLORS.limestone);
            },
            enemies: [
                { x: -3, z: -3, kind: 'lancer', hp: 3 },
                { x: 3, z: -4, kind: 'scarab', hp: 3, ai: 'charge' },
            ],
            doors: [{ to: 'dunecross', side: 'W', at: 0, type: 'open' }],
            // The boot you just found opens the ledge alcove behind it
            blockers: [
                { type: 'boot_ledge', id: 'b03-boneyard-ledge', rect: { x0: -7, x1: 7, z0: -6, z1: -6 } },
            ],
            onBake(level, origin) {
                level.addPickup({ x: origin.x, y: 1.2, z: origin.z + 1 }, {
                    color: 0xc9a227,
                    label: 'Phase Boot',
                    onPickup(game) {
                        game.player.inventory.grantItem('phase_boot');
                        game.hud?.toast?.('Phase Boot — dash-hop low ledges');
                    },
                });
                // z -7.5 sat inside the north wall stack; step it onto open floor.
                level.addPickup({ x: origin.x, y: 1.2, z: origin.z - 6.5 }, {
                    color: 0x7fe0ff,
                    label: 'Ledge cache',
                    onPickup(game) {
                        game.player.inventory.addShards(20);
                        game.hud?.toast?.('Ledge cache — 20 shards');
                    },
                });
            },
        },
        slipway: {
            grid: [0, -2],
            half: 9,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -7, -6, 1, 3, -3, 3, CRUST_COLORS.clayDark);
                h.fillBox(map, 6, 7, 1, 3, -3, 3, CRUST_COLORS.clayDark);
            },
            enemies: [{ x: 0, z: -4, kind: 'lancer', hp: 3 }],
            doors: [
                { to: 'dunecross', side: 'S', at: 0, type: 'locked' },
                { to: 'undertow', side: 'N', at: 0, type: 'locked' },
                { to: 'hollow', side: 'E', at: -4, type: 'open', width: 1 },
            ],
            onBake(level, origin, ctx) {
                addAltar(level, ctx, { x: origin.x - 5, z: origin.z + 6 });
                addKeyPickup(level, 'beat-03-sink', 'slipway-key',
                    { x: origin.x + 5, y: 1.2, z: origin.z + 6 }, 'small');
            },
            onEnter(game) {
                if (!this._storyShown) {
                    this._storyShown = true;
                    game.hud?.story?.queue?.([
                        { speaker: 'PREDECESSOR', text: 'The Sink swallowed the survey teams whole. Keep to the high stone.' },
                        { speaker: 'PREDECESSOR', text: 'Something segmented moves under the dust. It hunts by footfall.' },
                    ]);
                }
            },
        },
        hollow: { // secret: a sink hole spanned by a grapple gap
            grid: [1, -2],
            half: 6,
            wallH: 4,
            doors: [{ to: 'slipway', side: 'W', at: -4, type: 'open', width: 1 }],
            blockers: [
                {
                    type: 'grapple_gap', id: 'b03-hollow-gap',
                    rect: { x0: -2, x1: 2, z0: -2, z1: 2 },
                    anchor: { x: 4, z: 0 },
                    edge: { x: -4, z: 0 },
                },
            ],
            onBake(level, origin) {
                level.addPickup({ x: origin.x + 4, y: 1.2, z: origin.z - 3 }, {
                    color: 0xff7a90,
                    label: 'Scar Suture',
                    reward: { type: 'suture' },
                    onPickup(game) {
                        if (game.collectSuture?.('b03-hollow')) {
                            game.hud?.toast?.("Scar Suture recovered from the hollow.", 2600);
                        }
                    },
                });
            },
            onEnter(game) {
                game?.hud?.toast?.('The sand gives way to a hollow — mind the drop', 2200);
            },
        },
        undertow: {
            grid: [0, -3],
            half: 8,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -5, -4, 1, 2, 0, 1, CRUST_COLORS.slate);
                h.fillBox(map, 4, 5, 1, 2, 0, 1, CRUST_COLORS.slate);
            },
            enemies: [
                { x: -3, z: -3, kind: 'scarab', hp: 3, ai: 'charge' },
                { x: 3, z: -3, kind: 'lancer', hp: 3 },
                { x: 0, z: 3, kind: 'scarab', hp: 3, ai: 'ranged' },
            ],
            doors: [
                { to: 'slipway', side: 'S', at: 0, type: 'locked' },
                { to: 'spurpit', side: 'N', at: 0, type: 'boss' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-03-sink', 'undertow-boss-key',
                    { x: origin.x, y: 1.4, z: origin.z - 5 }, 'boss');
            },
        },
        spurpit: {
            grid: [0, -4],
            half: 12,
            wallH: 5,
            // V: churned nest dust — the open clay pit read 91/255 (band ≤90)
            floorColor: CRUST_COLORS.clayDark,
            // Boss rooms measure much brighter than an empty room under the
            // same lights — the boss's own bright surfaces push the frame
            // deep enough into the tonemap curve that even a modest light
            // cut pulls it back out disproportionately. Tuned by direct
            // measurement (tests/qa/contrast-probe.mjs) to land close to
            // this dungeon's own normal-room mean, not by feel.
            lightTune: { key: 0.7, ambient: 0.7, fill: 0.7, rim: 0.7 },
            build(map, h) {
                h.fillBox(map, -3, 3, 1, 1, -9, -8, CRUST_COLORS.slate);
                h.fillBox(map, -9, -8, 1, 2, 6, 8, CRUST_COLORS.iron);
            },
            doors: [{ to: 'undertow', side: 'S', at: 0, type: 'boss' }],
            boss(ctx, level, origin) {
                const spur = new SandSpur(ctx.scene, ctx.collisionWorld, ctx.particles, [
                    { x: origin.x - 5, z: origin.z - 4 },
                    { x: origin.x + 5, z: origin.z - 4 },
                    { x: origin.x + 5, z: origin.z + 4 },
                    { x: origin.x - 5, z: origin.z + 4 },
                ], { hp: 14, segments: 6 });
                attachBoss(level, spur, {
                    nextBeat: 'beat-04-sky',
                    toast: 'Sand Spur broken — Sky Monument unlocks',
                    defeatStory: [
                        { speaker: 'PREDECESSOR', text: 'The Spur is still. The Sink key surfaces — one more and the monolith opens.' },
                    ],
                    onDefeat(game) {
                        game.player.inventory.grantMemoryKey('sink');
                        game.hud?.toast?.('Memory Key — Sink');
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

export function loadBeat03(ctx) {
    const level = createDungeon(ctx, BEAT03_DEF);
    level.suppressBossIntro = true;
    level.musicBed = 'crust';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'The Sink remembers every footfall. The Spur hunts vibration.' },
        { speaker: 'SYSTEM', text: 'When it submerges, it cannot be harmed. Wait for the breach.' },
    ];
    return level;
}
