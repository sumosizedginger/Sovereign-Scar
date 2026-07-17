// Beat 02 — The Eastern Spindle (Eastern Palace).
// C2: 8-room computing-vault dungeon. Bible §Beat 02: towering mechanical
// vault of grey slate, massive rotating gears. Dungeon item: Light Caster.
//
// Layout:            [spindlecrown]   Tri-Compiler (boss door)
//                    [prebosscourt]   boss key, guarded
//     [capacitor*] — [vaultrow]       locked ×2, altar, small key 2
//  [archive] — [gearworks] — [coilhall]
//     map          small key 1      Light Caster
//                    [gatehouse]      start; S exit → overworld

import { createDungeon } from '../world/room-graph.js';
import { addKeyPickup } from '../world/keys.js';
import { CRUST_COLORS } from '../assets/palettes.js';
import { GearSystem } from '../world/gear-system.js';
import { TriCompiler, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';

export const BEAT02_DEF = {
    id: 'beat-02-spindle',
    name: '02 Eastern Spindle',
    mood: 'crust',
    start: 'gatehouse',
    prebake: true,
    banner: 'The Spindle turns. Sever every Tri-Compiler core.',
    keys: [
        { room: 'gearworks', type: 'small' },
        { room: 'vaultrow', type: 'small' },
        { room: 'prebosscourt', type: 'boss' },
    ],
    onExit(game) {
        game.loadLevel?.('overworld');
    },
    rooms: {
        gatehouse: {
            grid: [0, 0],
            half: 7,
            wallH: 4,
            spawn: { x: 0, z: 4 },
            build(map, h) {
                h.fillBox(map, -5, -4, 1, 3, -3, -2, CRUST_COLORS.iron);
                h.fillBox(map, 4, 5, 1, 3, -3, -2, CRUST_COLORS.iron);
            },
            doors: [
                { to: 'gearworks', side: 'N', at: 0, type: 'open' },
                { to: '_world', side: 'S', at: 0, type: 'exit' },
            ],
        },
        gearworks: {
            grid: [0, -1],
            half: 11,
            wallH: 4,
            spawn: { x: 0, z: 0 },
            build(map, h) {
                h.fillBox(map, -9, -8, 1, 3, -9, -8, CRUST_COLORS.slate);
                h.fillBox(map, 8, 9, 1, 3, -9, -8, CRUST_COLORS.slate);
                h.fillBox(map, -1, 1, 1, 1, 8, 9, CRUST_COLORS.slateDark);
            },
            enemies: [
                { x: -5, z: 4, kind: 'sentinel', hp: 3 },
                { x: 5, z: -5, kind: 'scarab', hp: 2, ai: 'charge' },
            ],
            doors: [
                { to: 'gatehouse', side: 'S', at: 0, type: 'open' },
                { to: 'vaultrow', side: 'N', at: 0, type: 'locked' },
                { to: 'archive', side: 'W', at: 0, type: 'open' },
                { to: 'coilhall', side: 'E', at: 0, type: 'open' },
            ],
            onBake(level, origin, ctx) {
                const gears = level.addSystem(new GearSystem(ctx.collisionWorld, ctx.scene));
                gears.addGear({ x: origin.x - 4, z: origin.z, radius: 2.2, speed: 0.7, id: 'b02-gear-a' });
                gears.addGear({ x: origin.x + 4, z: origin.z, radius: 2.6, speed: -0.5, id: 'b02-gear-b' });
                addKeyPickup(level, 'beat-02-spindle', 'gearworks-key',
                    { x: origin.x - 9, y: 1.2, z: origin.z + 8 }, 'small');
            },
        },
        archive: {
            grid: [-1, -1],
            half: 7,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -5, -4, 1, 3, -5, 4, CRUST_COLORS.iron); // shelf stacks
                h.fillBox(map, -2, -1, 1, 3, -5, 4, CRUST_COLORS.iron);
                h.fillBox(map, 1, 2, 1, 3, -5, 4, CRUST_COLORS.iron);
            },
            doors: [{ to: 'gearworks', side: 'E', at: 0, type: 'open' }],
            onBake(level, origin) {
                if (!level.keyStore.mapPickup()) {
                    level.addPickup({ x: origin.x + 4, y: 1.2, z: origin.z - 4 }, {
                        color: 0x9ad0ff,
                        label: 'Vault schematics',
                        onPickup(game) {
                            level.keyStore.markMapPickup();
                            game.hud?.toast?.('Vault schematics — the map reveals the Spindle');
                        },
                    });
                }
            },
        },
        coilhall: {
            grid: [1, -1],
            half: 8,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -6, -5, 1, 2, -6, -5, CRUST_COLORS.goldLeaf);
                h.fillBox(map, 5, 6, 1, 2, -6, -5, CRUST_COLORS.goldLeaf);
            },
            enemies: [
                { x: -3, z: -3, kind: 'sentinel', hp: 3 },
                { x: 3, z: -3, kind: 'frost', hp: 2, ai: 'ranged' },
            ],
            doors: [{ to: 'gearworks', side: 'W', at: 0, type: 'open' }],
            onBake(level, origin) {
                level.addPickup({ x: origin.x, y: 1.2, z: origin.z - 5 }, {
                    color: 0xfff0a0,
                    label: 'Light Caster',
                    onPickup(game) {
                        game.player.inventory.grantItem('light_caster');
                        game.hud?.toast?.('Acquired: Light Caster (ray weapon)');
                    },
                });
            },
        },
        vaultrow: {
            grid: [0, -2],
            half: 9,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -7, -6, 1, 3, -2, 2, CRUST_COLORS.slate);
                h.fillBox(map, 6, 7, 1, 3, -2, 2, CRUST_COLORS.slate);
            },
            enemies: [
                { x: -4, z: -4, kind: 'scarab', hp: 3, ai: 'charge' },
                { x: 4, z: 4, kind: 'sentinel', hp: 3 },
            ],
            doors: [
                { to: 'gearworks', side: 'S', at: 0, type: 'locked' },
                { to: 'prebosscourt', side: 'N', at: 0, type: 'locked' },
                { to: 'capacitor', side: 'E', at: 4, type: 'open', width: 1 },
            ],
            onBake(level, origin, ctx) {
                addAltar(level, ctx, { x: origin.x + 6, z: origin.z + 6 });
                addKeyPickup(level, 'beat-02-spindle', 'vaultrow-key',
                    { x: origin.x - 6, y: 1.2, z: origin.z - 6 }, 'small');
            },
            onEnter(game) {
                if (!this._storyShown) {
                    this._storyShown = true;
                    game.hud?.story?.queue?.([
                        { speaker: 'PREDECESSOR', text: 'The gears never stopped. They just forgot what they were turning.' },
                        { speaker: 'PREDECESSOR', text: 'The Compiler crown is north. Rest at the altar first — it still honors our shards.' },
                    ]);
                }
            },
        },
        capacitor: { // secret: narrow side vault
            grid: [1, -2],
            half: 5,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -1, 1, 1, 1, -1, 1, CRUST_COLORS.goldLeaf);
            },
            doors: [{ to: 'vaultrow', side: 'W', at: 4, type: 'open', width: 1 }],
            blockers: [
                { type: 'wedge_crack', id: 'b02-capacitor-crack', at: { x: 2, z: -3 }, w: 2, h: 2 },
            ],
            onBake(level, origin) {
                level.addPickup({ x: origin.x, y: 1.2, z: origin.z }, {
                    color: 0x7fe0ff,
                    label: 'Capacitor cache',
                    onPickup(game) {
                        game.player.inventory.addShards(30);
                        game.hud?.toast?.('Capacitor cache — 30 shards');
                    },
                });
            },
            onEnter(game) {
                game?.hud?.toast?.('A humming side-vault — something dense behind the cracked wall', 2200);
            },
        },
        prebosscourt: {
            grid: [0, -3],
            half: 8,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -5, -4, 1, 2, 0, 1, CRUST_COLORS.iron);
                h.fillBox(map, 4, 5, 1, 2, 0, 1, CRUST_COLORS.iron);
            },
            enemies: [
                { x: -3, z: -3, kind: 'scarab', hp: 3, ai: 'charge' },
                { x: 3, z: -3, kind: 'scarab', hp: 3, ai: 'charge' },
                { x: 0, z: 3, kind: 'frost', hp: 2, ai: 'ranged' },
            ],
            doors: [
                { to: 'vaultrow', side: 'S', at: 0, type: 'locked' },
                { to: 'spindlecrown', side: 'N', at: 0, type: 'boss' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-02-spindle', 'court-boss-key',
                    { x: origin.x, y: 1.4, z: origin.z - 5 }, 'boss');
            },
        },
        spindlecrown: {
            grid: [0, -4],
            half: 12,
            wallH: 5,
            build(map, h) {
                h.fillBox(map, -8, -6, 1, 3, -2, 2, CRUST_COLORS.iron);
                h.fillBox(map, 6, 8, 1, 3, -2, 2, CRUST_COLORS.iron);
                h.fillBox(map, -2, 2, 1, 2, -10, -8, CRUST_COLORS.slate);
            },
            doors: [{ to: 'prebosscourt', side: 'S', at: 0, type: 'boss' }],
            boss(ctx, level, origin) {
                const boss = new TriCompiler(ctx.scene, [
                    { x: origin.x - 5, z: origin.z - 6 },
                    { x: origin.x, z: origin.z - 7 },
                    { x: origin.x + 5, z: origin.z - 6 },
                ], { hpPerCore: 4, color: CRUST_COLORS.slate, emissive: 0x40c0ff });
                attachBoss(level, boss, {
                    nextBeat: 'beat-03-sink',
                    toast: 'Tri-Compiler offline — Memory Key ready',
                    defeatStory: [
                        { speaker: 'PREDECESSOR', text: 'Three compilers, one silence. The Spindle key is yours — two remain.' },
                    ],
                    onDefeat(game) {
                        game.player.inventory.grantMemoryKey('spindle');
                        game.hud?.toast?.('Memory Key — Spindle');
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

export function loadBeat02(ctx) {
    const level = createDungeon(ctx, BEAT02_DEF);
    level.suppressBossIntro = true;
    level.musicBed = 'crust';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'Three compilers seal the spindle. Sever every core.' },
        { speaker: 'SYSTEM', text: 'Caution: linked beams activate when the construct is wounded.' },
    ];
    return level;
}
