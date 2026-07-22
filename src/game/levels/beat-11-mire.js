// Beat 11 — The Rot Mire (Misery Mire).
// C3: 8-room drowned library, sludge friction. Fluid pools with dry-islet
// paths; the Sludge Golem is what remains of the shelves.
//
// Layout:                [golemwallow]   Sludge Golem (boss door)
//                        [stacksump]     boss key gauntlet
//      [inkwell*] —      [readingroom]   locked, altar, key 2
//    [cardfile] — [mirefloor] — [shelfrow]
//        map          key 1          islet cache over sludge
//                        [lichgate]      start; S exit → overworld

import { createDungeon } from '../world/room-graph.js';
import { addKeyPickup } from '../world/keys.js';
import { ABYSS_COLORS } from '../assets/palettes.js';
import { FluidPlane } from '../world/fluid-plane.js';
import { SludgeGolem, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';

// V: dry islets must READ dry against the sludge (0x4a4030 sank the arena
// to 18/255) — parched clay, clearly walkable
const ISLET = 0x8a7a58;

function addSludge(level, ctx, origin, size) {
    const fluid = new FluidPlane(ctx.scene, {
        width: size, depth: size, y: 0.35, amp: 0.18,
        x: origin.x, z: origin.z,
        wind: { x: 1.5, z: 0.4 },
        color: ABYSS_COLORS.sludge,
    });
    level.addSystem({
        update(dt, game) {
            fluid.update(dt);
            const p = game.player.root.position;
            if (fluid.contains(p.x, p.z) && p.y < 1.5) {
                game.player.physics.setFrictionProfile({
                    groundDrag: 0.35, airDrag: 0.97, windVector: fluid.wind,
                });
            }
        },
        dispose() { fluid.dispose(); },
    });
}

export const BEAT11_DEF = {
    id: 'beat-11-mire',
    name: '11 Rot Mire',
    mood: 'abyss',
    // Per-level luminance trim into the Abyss certification band [35,75]
    // (see tests/qa/lum-probe.mjs); multiplies the mood preset's light levels.
    lightTune: { ambient: 1.2 },
    start: 'lichgate',
    prebake: true,
    friction: 'sludge',
    floorColor: ABYSS_COLORS.rot,
    wallColor: 0x4c6238, // certification retune: brighter moss-green, same hue
    banner: 'The mire was a library once. Keep to the dry islets.',
    // Z6 — this dungeon's one idea, and the four rooms that carry it:
    // introduce it safely, complicate it, fuse it with combat, then examine it.
    theme: {
        id: 'armor_swarm',
        name: 'Plate and Spawn',
        hint: "Armour in front, numbers behind. Break the plate first — the swarm will not wait.",
        teach: 'mirefloor',
        develop: 'cardfile',
        combine: 'stacksump',
        test: 'golemwallow',
    },
    keys: [
        { room: 'mirefloor', type: 'small' },
        { room: 'readingroom', type: 'small' },
        { room: 'stacksump', type: 'boss' },
    ],
    onExit(game) {
        game.loadLevel?.('overworld');
    },
    rooms: {
        lichgate: {
            grid: [0, 0],
            half: 7,
            wallH: 4,
            spawn: { x: 0, z: 4 },
            // Islets are walkable platforms (y>=1 in build() becomes an XZ wall).
            platforms(map, h) {
                h.fillBox(map, -2, 2, 1, 1, -2, 0, ISLET);
            },
            doors: [
                { to: 'mirefloor', side: 'N', at: 0, type: 'open' },
                { to: '_world', side: 'S', at: 0, type: 'exit' },
            ],
        },
        mirefloor: {
            grid: [0, -1],
            half: 11,
            wallH: 4,
            platforms(map, h) {
                h.fillBox(map, -3, 3, 1, 1, -3, 3, ISLET);
                h.fillBox(map, -9, -6, 1, 1, 4, 8, ISLET);
                h.fillBox(map, 6, 9, 1, 1, -8, -5, ISLET);
                h.fillBox(map, -1, 1, 1, 1, 6, 9, ISLET);
            },
            enemies: [
                { x: -5, z: 4, kind: 'bulwark', hp: 4 },
                { x: 5, z: -5, kind: 'brood', hp: 5 },
            ],
            doors: [
                { to: 'lichgate', side: 'S', at: 0, type: 'open' },
                { to: 'readingroom', side: 'N', at: 0, type: 'locked' },
                { to: 'cardfile', side: 'W', at: 0, type: 'open' },
                { to: 'shelfrow', side: 'E', at: 0, type: 'open' },
            ],
            onBake(level, origin, ctx) {
                addSludge(level, ctx, origin, 21);
                addKeyPickup(level, 'beat-11-mire', 'floor-key',
                    { x: origin.x + 7, y: 2.4, z: origin.z - 6 }, 'small');
            },
        },
        cardfile: {
            grid: [-1, -1],
            half: 7,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -5, -4, 1, 3, -5, 4, 0x3a4428); // rotted drawers
                h.fillBox(map, -1, 0, 1, 3, -5, 4, 0x3a4428);
            },
            enemies: [{ x: 3, z: 3, kind: 'bulwark', hp: 4, ai: 'ranged' }],
            doors: [{ to: 'mirefloor', side: 'E', at: 0, type: 'open' }],
            onBake(level, origin) {
                if (!level.keyStore.mapPickup()) {
                    level.addPickup({ x: origin.x + 4, y: 1.2, z: origin.z - 4 }, {
                        color: 0x9ad0ff,
                        label: 'Card catalogue',
                        onPickup(game) {
                            level.keyStore.markMapPickup();
                            game.hud?.toast?.('Card catalogue — the map reveals the stacks');
                        },
                    });
                }
            },
        },
        shelfrow: {
            grid: [1, -1],
            half: 8,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -6, -5, 1, 3, -6, 6, 0x3a4428); // sunken shelves
                h.fillBox(map, -2, -1, 1, 3, -6, 6, 0x3a4428);
            },
            platforms(map, h) {
                h.fillBox(map, 2, 3, 1, 1, -2, 2, ISLET);
            },
            enemies: [{ x: 5, z: -4, kind: 'brood', hp: 4, ai: 'charge' }],
            doors: [{ to: 'mirefloor', side: 'W', at: 0, type: 'open' }],
            onBake(level, origin, ctx) {
                addSludge(level, ctx, origin, 15);
                level.addPickup({ x: origin.x + 2, y: 2.4, z: origin.z }, {
                    color: 0x7fe0ff,
                    label: 'Shelf cache',
                    onPickup(game) {
                        game.player.inventory.addShards(25);
                        game.hud?.toast?.('Shelf cache — 25 shards');
                    },
                });
            },
        },
        readingroom: {
            grid: [0, -2],
            half: 9,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -7, -6, 1, 3, -3, 3, 0x3a4428);
                h.fillBox(map, 6, 7, 1, 3, -3, 3, 0x3a4428);
            },
            platforms(map, h) {
                h.fillBox(map, -2, 2, 1, 1, -2, 2, ISLET); // lectern islet
            },
            enemies: [
                { x: -4, z: 0, kind: 'bulwark', hp: 5 },
                { x: 4, z: 0, kind: 'brood', hp: 4 },
            ],
            doors: [
                { to: 'mirefloor', side: 'S', at: 0, type: 'locked' },
                { to: 'stacksump', side: 'N', at: 0, type: 'locked' },
                { to: 'inkwell', side: 'W', at: 3, type: 'open', width: 1 },
            ],
            onBake(level, origin, ctx) {
                addAltar(level, ctx, { x: origin.x + 6, z: origin.z + 6 });
                addKeyPickup(level, 'beat-11-mire', 'reading-key',
                    { x: origin.x - 6, y: 1.2, z: origin.z - 6 }, 'small');
            },
            onEnter(game) {
                if (!this._storyShown) {
                    this._storyShown = true;
                    game.hud?.story?.queue?.([
                        { speaker: 'PREDECESSOR', text: 'The Mire rises on the tick. Count with it and you will not sink.' },
                        { speaker: 'PREDECESSOR', text: 'The Golem reforms after every strike. Dry it out first.' },
                    ]);
                }
            },
        },
        inkwell: { // secret: wedge-cracked ink cistern
            grid: [-1, -2],
            half: 5,
            wallH: 4,
            doors: [{ to: 'readingroom', side: 'E', at: 3, type: 'open', width: 1 }],
            blockers: [
                { type: 'wedge_crack', id: 'b11-ink-crack', at: { x: -2, z: -2 }, w: 2, h: 2 },
            ],
            onBake(level, origin) {
                level.addPickup({ x: origin.x + 2, y: 1.2, z: origin.z + 2 }, {
                    color: 0x9ad0ff,
                    label: 'Memory Vial chassis',
                    reward: { type: 'vial' },
                    onPickup(game) {
                        if (game.collectMemoryVial?.('b11-inkwell')) {
                            game.hud?.toast?.("A Memory Vial chassis, pickled in the inkwell.", 2600);
                        }
                    },
                });
            },
        },
        stacksump: {
            grid: [0, -3],
            half: 8,
            wallH: 4,
            platforms(map, h) {
                h.fillBox(map, -3, 3, 1, 1, -1, 1, ISLET);
            },
            enemies: [
                { x: -3, z: -3, kind: 'bulwark', hp: 4 },
                { x: 3, z: -3, kind: 'brood', hp: 4 },
                { x: 0, z: 3, kind: 'bulwark', hp: 4 },
            ],
            doors: [
                { to: 'readingroom', side: 'S', at: 0, type: 'locked' },
                { to: 'golemwallow', side: 'N', at: 0, type: 'boss' },
            ],
            onBake(level, origin, ctx) {
                addSludge(level, ctx, origin, 13);
                addKeyPickup(level, 'beat-11-mire', 'sump-boss-key',
                    { x: origin.x, y: 2.4, z: origin.z - 5 }, 'boss');
            },
        },
        golemwallow: {
            grid: [0, -4],
            half: 13,
            wallH: 5,
            // V: arena read 30/255 — paler wet-rot floor + more dry islets
            floorColor: ABYSS_COLORS.rotPale,
            build(map, h) {
                // Drowned shelf rows — bone-pale ruins of the library
                h.fillBox(map, -11, -10, 1, 2, -9, 0, ABYSS_COLORS.bone);
                h.fillBox(map, 10, 11, 1, 2, -3, 7, ABYSS_COLORS.bone);
                h.fillBox(map, -4, 4, 1, 2, -11, -10, ABYSS_COLORS.bone);
            },
            platforms(map, h) {
                h.fillBox(map, -3, 3, 1, 1, -3, 3, ISLET);
                h.fillBox(map, -9, -6, 1, 1, 4, 8, ISLET);
                h.fillBox(map, 6, 9, 1, 1, -8, -5, ISLET);
                h.fillBox(map, -1, 1, 1, 1, 6, 9, ISLET);
                h.fillBox(map, -10, -7, 1, 1, -7, -4, ISLET);
                h.fillBox(map, 7, 10, 1, 1, 3, 6, ISLET);
                h.fillBox(map, -6, -3, 1, 1, 9, 11, ISLET);
            },
            doors: [{ to: 'stacksump', side: 'S', at: 0, type: 'boss' }],
            boss(ctx, level, origin) {
                const golem = new SludgeGolem(ctx.scene, {
                    x: origin.x, y: 1.4, z: origin.z - 4,
                });
                attachBoss(level, golem, {
                    nextBeat: 'beat-12-pyre',
                    toast: 'Golem dissolved — Pyre Peak burns above',
                    defeatStory: [
                        { speaker: 'PREDECESSOR', text: 'The Golem dries to stone. Stone we can work with — six of seven free.' },
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

export function loadBeat11(ctx) {
    const level = createDungeon(ctx, BEAT11_DEF);
    level.suppressBossIntro = true;
    level.musicBed = 'abyss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'The mire was a library once. The golem is what remains of the shelves.' },
        { speaker: 'SYSTEM', text: 'Pools steal footing. Lunge telegraphs mark impact sites.' },
    ];
    return level;
}
