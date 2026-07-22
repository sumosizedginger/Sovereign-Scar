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
    // Z6 — this dungeon's one idea, and the four rooms that carry it:
    // introduce it safely, complicate it, fuse it with combat, then examine it.
    theme: {
        id: 'mastery',
        name: 'The Index of Wrong Turns',
        hint: "The Tower has nothing new to teach you. It only asks whether you learned it.",
        teach: 'towerfoot',
        develop: 'stairworks',
        combine: 'indexspire',
        test: 'witnesscrown',
    },
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
                { x: -4, z: 2, kind: 'bulwark', hp: 5 },
                { x: 4, z: -4, kind: 'lancer', hp: 5 },
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
            enemies: [{ x: 3, z: 3, kind: 'mote', hp: 4, ai: 'ranged' }],
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
            enemies: [{ x: -3, z: 3, kind: 'bulwark', hp: 5, ai: 'charge' }],
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
                { x: -4, z: 0, kind: 'lancer', hp: 5 },
                { x: 4, z: 0, kind: 'mote', hp: 5 },
                { x: 0, z: -4, kind: 'bulwark', hp: 5 },
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
            onEnter(game) {
                if (!this._storyShown) {
                    this._storyShown = true;
                    game.hud?.story?.queue?.([
                        { speaker: 'GUMOI', text: 'Filed: your hesitation. Filed: your dead. Climb anyway — the index is patient.' },
                        { speaker: 'PREDECESSOR', text: 'Last altar before the crown. Spend what you carry; the Tower keeps no change.' },
                    ]);
                }
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
                    color: 0x9ad0ff,
                    label: 'Memory Vial chassis',
                    reward: { type: 'vial' },
                    onPickup(game) {
                        if (game.collectMemoryVial?.('b13-null')) {
                            game.hud?.toast?.("A Memory Vial chassis, filed under nothing.", 2600);
                        }
                    },
                });
            },
        },
        indexspire: {
            grid: [0, -3],
            half: 8,
            wallH: 6,
            enemies: [
                { x: -3, z: -3, kind: 'lancer', hp: 5 },
                { x: 3, z: -3, kind: 'mote', hp: 5 },
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
                // The crown sampled 32.6 — below the Abyss band floor (35). Lift
                // it with PALE ACCENT GEOMETRY rather than lighting: an index
                // lattice burnt into the arena floor, which also reads as the
                // beat's kit motif (index rails / scan lines). Floor-level only
                // (y=0), so it adds no collision and no climbable step.
                for (let x = -9; x <= 9; x++) {
                    for (let z = -9; z <= 9; z++) {
                        if (x % 4 === 0 || z % 4 === 0) {
                            h.fillBox(map, x, x, 0, 0, z, z, 0x6e7488);
                        }
                    }
                }
            },
            platforms(map, h) {
                // Multi-Y arena geometry belongs in the platform map. Putting
                // it in build() turns every occupied XZ column into a wall of
                // infinite effective height for planar collision.
                //
                // This arena stays FLAT. Two earlier passes got it wrong in
                // opposite directions: first five slabs stacked two cells apart
                // (the 1-cell step could never climb them, so they were scenery),
                // then a climbable spiral ten cells tall — which fought the
                // camera. The rig sits at height 17.5 looking down, so any mass
                // that far off the floor lands between the lens and the fight
                // and eclipses the combat space. The Witness descends to the
                // floor to fight, so altitude buys nothing here: a low index
                // dais gives the crown its shape and keeps the whole arena, the
                // boss, and its telegraphs readable from above.
                h.fillBox(map, -5, 5, 1, 1, -5, 5, CRUST_COLORS.slate);
                h.fillBox(map, -2, 2, 1, 1, -2, 2, ABYSS_COLORS.goldVein);
            },
            doors: [{ to: 'indexspire', side: 'S', at: 0, type: 'boss' }],
            boss(ctx, level, origin) {
                const witness = new GumoiWitness(ctx.scene, {
                    x: origin.x, y: 9.5, z: origin.z,
                });
                attachBoss(level, witness, {
                    nextBeat: 'beat-14-leviathan',
                    toast: 'Witness erased — Leviathan Core stirs',
                    defeatStory: [
                        { speaker: 'GUMOI', text: 'Index closed. I was only ever the door\'s way of watching you knock.' },
                        { speaker: 'PREDECESSOR', text: 'The Core is below everything now. Bring the Wedge home.' },
                    ],
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
