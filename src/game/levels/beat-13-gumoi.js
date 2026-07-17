// Beat 13 — GUMOI Tower (Ganon's Tower).
// C4: 9-room vertical gauntlet, room-per-room trials of the campaign's
// mechanics, flicker rising floor by floor. Multi-Y throughout.
//
// Layout:                [witnesscrown]  GUMOI Witness (boss door, flicker 0.7)
//                        [indexspire]    boss key atop a step spiral
//      [nullcell*] —     [archivegaunt]  locked, altar, key 2, mob gauntlet
//    [flickerhall] — [towerfoot] — [stairworks]
//        map           key 1          climbable trial
//                        [towergate]     start; S exit → overworld

import { createDungeon } from '../world/room-graph.js';
import { addKeyPickup } from '../world/keys.js';
import { CRUST_COLORS, ABYSS_COLORS } from '../assets/palettes.js';
import { GumoiWitness, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';

function spiral(map, h, cx, cz, height, color) {
    for (let lvl = 1; lvl <= height; lvl++) {
        const r = height - lvl;
        h.fillBox(map, cx - r, cx + r, lvl, lvl, cz - r, cz + r, color);
    }
}

export const BEAT13_DEF = {
    id: 'beat-13-gumoi',
    name: '13 GUMOI Tower',
    mood: 'abyss',
    start: 'towergate',
    prebake: true,
    floorColor: ABYSS_COLORS.abyssFloor,
    wallColor: ABYSS_COLORS.violet,
    flicker: 0.45,
    banner: 'The Tower indexes every wrong turn. Climb anyway.',
    keys: [
        { room: 'towerfoot', type: 'small' },
        { room: 'archivegaunt', type: 'small' },
        { room: 'indexspire', type: 'boss' },
    ],
    onExit(game) {
        game.loadLevel?.('overworld');
    },
    rooms: {
        towergate: {
            grid: [0, 0],
            half: 7,
            wallH: 5,
            spawn: { x: 0, z: 4 },
            build(map, h) {
                // Kintsugi seam: a gold-inlaid approach running gate to tower
                h.fillBox(map, -1, 1, 0, 0, -6, 6, ABYSS_COLORS.goldVein);
                h.fillBox(map, -3, -3, 1, 4, -5, -5, ABYSS_COLORS.violetHot);
                h.fillBox(map, 3, 3, 1, 4, -5, -5, ABYSS_COLORS.violetHot);
            },
            doors: [
                { to: 'towerfoot', side: 'N', at: 0, type: 'open' },
                { to: '_world', side: 'S', at: 0, type: 'exit' },
            ],
        },
        towerfoot: {
            grid: [0, -1],
            half: 10,
            wallH: 5,
            build(map, h) {
                h.fillBox(map, -3, 3, 1, 1, 3, 6, CRUST_COLORS.slate);
            },
            enemies: [
                { x: -4, z: 2, kind: 'sentinel', hp: 5 },
                { x: 4, z: -4, kind: 'scarab', hp: 5, ai: 'charge' },
            ],
            doors: [
                { to: 'towergate', side: 'S', at: 0, type: 'open' },
                { to: 'archivegaunt', side: 'N', at: 0, type: 'locked' },
                { to: 'flickerhall', side: 'W', at: 0, type: 'open' },
                { to: 'stairworks', side: 'E', at: 0, type: 'open' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-13-gumoi', 'foot-key',
                    { x: origin.x - 8, y: 1.2, z: origin.z - 8 }, 'small');
            },
        },
        flickerhall: {
            grid: [-1, -1],
            half: 7,
            wallH: 5,
            enemies: [{ x: 3, z: 3, kind: 'frost', hp: 4, ai: 'ranged' }],
            doors: [{ to: 'towerfoot', side: 'E', at: 0, type: 'open' }],
            onBake(level, origin) {
                if (!level.keyStore.mapPickup()) {
                    level.addPickup({ x: origin.x, y: 1.2, z: origin.z - 4 }, {
                        color: 0x9ad0ff,
                        label: 'Tower index',
                        onPickup(game) {
                            level.keyStore.markMapPickup();
                            game.hud?.toast?.('Tower index — the map reveals the floors');
                        },
                    });
                }
            },
        },
        stairworks: {
            grid: [1, -1],
            half: 8,
            wallH: 5,
            enemies: [{ x: -3, z: 3, kind: 'scarab', hp: 5, ai: 'charge' }],
            platforms(map, h) {
                spiral(map, h, -4, -4, 4, CRUST_COLORS.slate);
                spiral(map, h, 4, 2, 3, ABYSS_COLORS.violet);
            },
            doors: [{ to: 'towerfoot', side: 'W', at: 0, type: 'open' }],
            onBake(level, origin) {
                level.addPickup({ x: origin.x - 4, y: 5.4, z: origin.z - 4 }, {
                    color: 0x7fe0ff,
                    label: 'Stair cache',
                    onPickup(game) {
                        game.player.inventory.addShards(30);
                        game.hud?.toast?.('Stair cache — 30 shards');
                    },
                });
            },
        },
        archivegaunt: {
            grid: [0, -2],
            half: 9,
            wallH: 5,
            build(map, h) {
                h.fillBox(map, -7, -6, 1, 4, -3, 3, ABYSS_COLORS.violet);
                h.fillBox(map, 6, 7, 1, 4, -3, 3, ABYSS_COLORS.violet);
            },
            enemies: [
                { x: -4, z: 0, kind: 'sentinel', hp: 5 },
                { x: 4, z: 0, kind: 'scarab', hp: 5, ai: 'charge' },
                { x: 0, z: -4, kind: 'frost', hp: 5, ai: 'ranged' },
            ],
            doors: [
                { to: 'towerfoot', side: 'S', at: 0, type: 'locked' },
                { to: 'indexspire', side: 'N', at: 0, type: 'locked' },
                { to: 'nullcell', side: 'W', at: 3, type: 'open', width: 1 },
            ],
            onBake(level, origin, ctx) {
                // Act III altar — last shop before the Core
                addAltar(level, ctx, { x: origin.x + 6, z: origin.z + 6 });
                addKeyPickup(level, 'beat-13-gumoi', 'archive-key',
                    { x: origin.x - 6, y: 1.2, z: origin.z - 6 }, 'small');
            },
        },
        nullcell: { // secret: a null-indexed cell behind a ledge
            grid: [-1, -2],
            half: 5,
            wallH: 5,
            doors: [{ to: 'archivegaunt', side: 'E', at: 3, type: 'open', width: 1 }],
            blockers: [
                { type: 'boot_ledge', id: 'b13-null-ledge', rect: { x0: -4, x1: 4, z0: -1, z1: -1 } },
            ],
            onBake(level, origin) {
                level.addPickup({ x: origin.x, y: 1.2, z: origin.z - 3 }, {
                    color: 0x7fe0ff,
                    label: 'Null cache',
                    onPickup(game) {
                        game.player.inventory.addShards(35);
                        game.hud?.toast?.('Null cache — 35 shards');
                    },
                });
            },
        },
        indexspire: {
            grid: [0, -3],
            half: 8,
            wallH: 6,
            enemies: [
                { x: -3, z: -3, kind: 'frost', hp: 5, ai: 'ranged' },
                { x: 3, z: -3, kind: 'frost', hp: 5, ai: 'ranged' },
            ],
            platforms(map, h) {
                spiral(map, h, 0, -3, 5, ABYSS_COLORS.violet);
            },
            doors: [
                { to: 'archivegaunt', side: 'S', at: 0, type: 'locked' },
                { to: 'witnesscrown', side: 'N', at: 0, type: 'boss' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-13-gumoi', 'spire-boss-key',
                    { x: origin.x, y: 6.4, z: origin.z - 3 }, 'boss');
            },
        },
        witnesscrown: {
            grid: [0, -4],
            half: 10,
            wallH: 6,
            build(map, h) {
                // The original tower-top terraces, climbable to the Witness
                h.fillBox(map, -3, 3, 1, 1, 3, 6, CRUST_COLORS.slate);
                h.fillBox(map, -6, -2, 3, 3, -2, 2, CRUST_COLORS.slate);
                h.fillBox(map, 2, 6, 5, 5, -4, 0, CRUST_COLORS.slate);
                h.fillBox(map, -2, 2, 7, 7, -7, -3, ABYSS_COLORS.violet);
                h.fillBox(map, -1, 1, 9, 9, -2, 2, ABYSS_COLORS.goldVein);
            },
            doors: [{ to: 'indexspire', side: 'S', at: 0, type: 'boss' }],
            boss(ctx, level, origin) {
                const witness = new GumoiWitness(ctx.scene, {
                    x: origin.x, y: 9.5, z: origin.z,
                });
                attachBoss(level, witness, {
                    nextBeat: 'beat-14-leviathan',
                    toast: 'Witness erased — Leviathan Core stirs',
                    onDefeat(game) {
                        game.player.inventory.setFlag('gumoi_sigil', true);
                        game.hud?.toast?.('GUMOI Sigil — the Core awakens');
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
                if (game?.level) game.level.flicker = 0.7; // reality stutters up here
            },
        },
    },
};

export function loadBeat13(ctx) {
    const level = createDungeon(ctx, BEAT13_DEF);
    level.suppressBossIntro = true;
    level.musicBed = 'abyss';
    level.story = [
        { speaker: 'GUMOI', text: 'I am the index of every wrong turn you took.' },
        { speaker: 'PREDECESSOR', text: 'Climb. When flicker spikes, dash. The Witness falls to persistence.' },
    ];
    return level;
}
