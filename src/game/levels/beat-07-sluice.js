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
    // Per-level luminance trim into the Abyss certification band [35,75]
    // (see tests/qa/lum-probe.mjs); multiplies the mood preset's light levels.
    lightTune: { ambient: 3.4, key: 1.4 },
    start: 'floodgate',
    prebake: true,
    floorColor: ABYSS_COLORS.abyssFloor,
    wallColor: ABYSS_COLORS.abyssWall,
    banner: 'Tears fall upward here. Cross on the anchors.',
    // Z6 — this dungeon's one idea, and the four rooms that carry it:
    // introduce it safely, complicate it, fuse it with combat, then examine it.
    theme: {
        id: 'spacing',
        name: 'Current and Reach',
        hint: "Lancers want the long line, casters want the far one. Stand where neither gets it.",
        teach: 'weepinghall',
        develop: 'tearwell',
        combine: 'surgechamber',
        test: 'cloudcourt',
    },
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
                { x: -6, z: 5, kind: 'lancer', hp: 3 },
                { x: 6, z: 5, kind: 'frost', hp: 4 },
            ],
            // Full-width weeping chasm. Pegs sit on both rims so the gap is
            // crossable IN (south→north) and OUT (north→south). Hydroid defeat
            // also clears the blocker and spawns a walkable basalt bridge —
            // post-boss softlock if return grapple is out of reach from the
            // north door (~13u vs base grapple ~10).
            blockers: [
                {
                    type: 'grapple_gap', id: 'b07-hall-gap',
                    rect: { x0: -10, x1: 10, z0: -3, z1: -1 },
                    // Rims: gap z∈[-3,-1]; posts just outside so landings are solid.
                    anchor: { x: 0, z: 0 },
                    reverseAnchor: { x: 0, z: -4 },
                    edge: { x: 0, z: 0 },
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
            enemies: [{ x: 3, z: 3, kind: 'lancer', hp: 3, ai: 'ranged' }],
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
            enemies: [{ x: 0, z: 4, kind: 'frost', hp: 4, ai: 'charge' }],
            blockers: [
                {
                    type: 'grapple_gap', id: 'b07-cascade-gap',
                    rect: { x0: -2, x1: 2, z0: -6, z1: -3 },
                    anchor: { x: 0, z: -1 },
                    reverseAnchor: { x: 0, z: -7 },
                    edge: { x: 0, z: -1 },
                },
            ],
            doors: [{ to: 'weepinghall', side: 'W', at: -6, type: 'open' }],
            onBake(level, origin) {
                // Spare grapple if the player reached the Sluice without the
                // Sky Monument drop (or lost inventory mid-run).
                level.addPickup({ x: origin.x - 5, y: 1.2, z: origin.z + 5 }, {
                    color: 0x40e0ff,
                    label: 'Deep-Pull Coil',
                    onPickup(game) {
                        if (!game.player.inventory.hasItem('magnetic_grapple')) {
                            game.player.inventory.grantItem('magnetic_grapple');
                            game.hud?.toast?.('Magnetic Grapple salvaged — hold G at copper pegs');
                        }
                        game.player.inventory.grantItem('deep_pull_coil');
                        game.player.grappleRange = (game.player.grappleRange || 8) + 4;
                        game.hud?.toast?.('Deep-Pull Coil — grapple range increased');
                        game.anchorThread?.markProgress?.('item_acquired', 'deep_pull_coil');
                    },
                });
                level.addPickup({ x: origin.x + 5, y: 1.2, z: origin.z - 6 }, {
                    color: 0x7fe0ff,
                    label: 'Cascade cache',
                    reward: { type: 'currency' },
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
                { x: -4, z: 0, kind: 'lancer', hp: 3 },
                { x: 4, z: 0, kind: 'frost', hp: 4 },
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
            onEnter(game) {
                if (!this._storyShown) {
                    this._storyShown = true;
                    game.hud?.story?.queue?.([
                        { speaker: 'PREDECESSOR', text: 'Every tear the Crust ever shed drains through here. Do not drink.' },
                        { speaker: 'PREDECESSOR', text: 'The Grapple crosses what the acid keeps. Copper pegs hold true.' },
                    ]);
                }
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
                    color: 0xff7a90,
                    label: 'Scar Suture',
                    reward: { type: 'suture' },
                    onPickup(game) {
                        if (game.collectSuture?.('b07-brine')) {
                            game.hud?.toast?.("Scar Suture recovered from the brine pocket.", 2600);
                        }
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
                { x: -3, z: -3, kind: 'lancer', hp: 3 },
                { x: 3, z: -3, kind: 'frost', hp: 3, ai: 'ranged' },
                { x: 0, z: 3, kind: 'lancer', hp: 4 },
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
                    defeatStory: [
                        { speaker: 'PREDECESSOR', text: 'The Cloud disperses. The Sluice runs clear for the first time in an age — two of seven free.' },
                    ],
                    onDefeat(game) {
                        // Bridge the weeping-hall chasm so the exit is walkable
                        // without a reverse grapple (post-boss softlock).
                        game.level?.keyStore?.open?.('blocker:b07-hall-gap');
                        game.hud?.toast?.('The weeping channel seals — a basalt path home', 2800);
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

export function loadBeat07(ctx) {
    const level = createDungeon(ctx, BEAT07_DEF);
    level.suppressBossIntro = true;
    level.musicBed = 'abyss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'Tears fall upward here. The cloud drinks them.' },
        { speaker: 'SYSTEM', text: 'Magnetic Grapple (G) crosses the weeping gaps. At half-death the Cloud storms — wider pulse, raining orbs.' },
    ];
    return level;
}
