// Beat 05 — Citadel of the Proxy (Agahnim's Tower / the phase-shift beat).
// C2: 9-room kintsugi citadel. The three memory keys (Spindle/Sink/Sky)
// gate the central monolith; claiming the Tectonic Wedge — or felling the
// Proxy — folds the world into the Abyss.
//
// Layout:               [proxythrone]   the Proxy (boss door)
//                       [sanctum]       boss key, guarded
//     [reliquary*] —    [monolith]      locked, altar, the Wedge (3 keys)
//    [westgallery] — [greathall] — [eastgallery]
//        map           small key 1     small key 2 (steps)
//                       [approach]      start; S exit → overworld

import { createDungeon } from '../world/room-graph.js';
import { addKeyPickup } from '../world/keys.js';
import { CRUST_COLORS } from '../assets/palettes.js';
import { triggerPhaseShift } from '../fx/phase-shift.js';
import { buildKintsugiPillar, stampMap } from '../assets/props.js';
import { ProxyBoss, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';

export const BEAT05_DEF = {
    id: 'beat-05-citadel',
    name: '05 Citadel of the Proxy',
    mood: 'crust',
    start: 'approach',
    prebake: true,
    banner: 'Three memory keys open the Wedge. The Proxy guards the fold.',
    // Z6 — this dungeon's one idea, and the four rooms that carry it:
    // introduce it safely, complicate it, fuse it with combat, then examine it.
    theme: {
        id: 'guard',
        name: 'The Plate',
        hint: "A Bulwark eats anything you swing at its face. Get behind it, or parry and take the opening.",
        teach: 'greathall',
        develop: 'westgallery',
        combine: 'sanctum',
        test: 'proxythrone',
    },
    keys: [
        { room: 'greathall', type: 'small' },
        { room: 'eastgallery', type: 'small' },
        { room: 'sanctum', type: 'boss' },
    ],
    onExit(game) {
        game.loadLevel?.('overworld');
    },
    rooms: {
        approach: {
            grid: [0, 0],
            half: 8,
            wallH: 5,
            spawn: { x: 0, z: 5 },
            build(map, h) {
                stampMap(map, buildKintsugiPillar(-5, -4, 5), 0, 1, 0);
                stampMap(map, buildKintsugiPillar(5, -4, 5), 0, 1, 0);
            },
            doors: [
                { to: 'greathall', side: 'N', at: 0, type: 'open' },
                { to: '_world', side: 'S', at: 0, type: 'exit' },
            ],
        },
        greathall: {
            grid: [0, -1],
            half: 11,
            wallH: 6,
            build(map, h) {
                stampMap(map, buildKintsugiPillar(-8, -8, 6), 0, 1, 0);
                stampMap(map, buildKintsugiPillar(8, -8, 6), 0, 1, 0);
                stampMap(map, buildKintsugiPillar(-8, 8, 6), 0, 1, 0);
                stampMap(map, buildKintsugiPillar(8, 8, 6), 0, 1, 0);
            },
            enemies: [
                { x: -5, z: 3, kind: 'bulwark', hp: 4 },
                { x: 5, z: 3, kind: 'sentinel', hp: 4 },
            ],
            doors: [
                { to: 'approach', side: 'S', at: 0, type: 'open' },
                { to: 'monolith', side: 'N', at: 0, type: 'locked' },
                { to: 'westgallery', side: 'W', at: 0, type: 'open' },
                { to: 'eastgallery', side: 'E', at: 0, type: 'open' },
            ],
            onBake(level, origin) {
                // Clear of the SW kintsugi pillar (-8±1) so the key is not buried
                // inside a collision solid.
                addKeyPickup(level, 'beat-05-citadel', 'hall-key',
                    { x: origin.x - 5, y: 1.2, z: origin.z - 9 }, 'small');
            },
        },
        westgallery: {
            grid: [-1, -1],
            half: 7,
            wallH: 5,
            build(map, h) {
                h.fillBox(map, -5, -4, 1, 4, -5, 4, CRUST_COLORS.iron);
            },
            enemies: [{ x: 2, z: -2, kind: 'bulwark', hp: 3, ai: 'ranged' }],
            doors: [{ to: 'greathall', side: 'E', at: 0, type: 'open' }],
            onBake(level, origin) {
                if (!level.keyStore.mapPickup()) {
                    level.addPickup({ x: origin.x, y: 1.2, z: origin.z - 4 }, {
                        color: 0x9ad0ff,
                        label: 'Citadel plans',
                        onPickup(game) {
                            level.keyStore.markMapPickup();
                            game.hud?.toast?.('Citadel plans — the map reveals the seal');
                        },
                    });
                }
            },
        },
        eastgallery: {
            grid: [1, -1],
            half: 7,
            wallH: 5,
            enemies: [
                { x: -2, z: -2, kind: 'sentinel', hp: 3, ai: 'charge' },
                { x: 3, z: 2, kind: 'bulwark', hp: 3 },
            ],
            platforms(map, h) {
                for (let lvl = 1; lvl <= 3; lvl++) {
                    const r = 3 - lvl;
                    h.fillBox(map, 4 - r, 4 + r, lvl, lvl, -4 - r, -4 + r, CRUST_COLORS.slate);
                }
            },
            doors: [{ to: 'greathall', side: 'W', at: 0, type: 'open' }],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-05-citadel', 'gallery-key',
                    { x: origin.x + 4, y: 4.4, z: origin.z - 4 }, 'small');
            },
        },
        monolith: {
            grid: [0, -2],
            half: 9,
            wallH: 6,
            build(map, h) {
                h.fillBox(map, -2, 2, 1, 6, -2, 2, CRUST_COLORS.iron);      // the monolith
                h.fillBox(map, -1, 1, 7, 8, -1, 1, CRUST_COLORS.goldLeaf); // its crown
            },
            enemies: [{ x: 5, z: 5, kind: 'sentinel', hp: 4 }],
            doors: [
                { to: 'greathall', side: 'S', at: 0, type: 'locked' },
                { to: 'sanctum', side: 'N', at: 0, type: 'locked' },
                { to: 'reliquary', side: 'W', at: 2, type: 'open', width: 1 },
            ],
            onBake(level, origin, ctx) {
                addAltar(level, ctx, { x: origin.x + 6, z: origin.z + 6 });
                let shifted = false;
                level.addPickup({ x: origin.x, y: 1.5, z: origin.z + 5 }, {
                    color: 0xffd060,
                    label: 'Tectonic Wedge',
                    baseY: 1.5,
                    onPickup(game) {
                        if (!game.player.inventory.hasAllMemoryKeys) {
                            game.hud?.toast?.('The monolith rejects you — need 3 memory keys');
                            this.taken = false;
                            this.mesh.visible = true;
                            return;
                        }
                        game.player.inventory.grantItem('tectonic_wedge');
                        game.hud?.toast?.('Tectonic Wedge claimed — phase shift!');
                        if (!shifted) {
                            shifted = true;
                            triggerPhaseShift(game.mood, 'abyss', 1.5);
                        }
                    },
                });
            },
            onEnter(game) {
                if (!this._storyShown) {
                    this._storyShown = true;
                    game.hud?.story?.queue?.([
                        { speaker: 'PREDECESSOR', text: 'The Wedge waits inside the monolith. So does the thing wearing our permissions.' },
                        { speaker: 'PREDECESSOR', text: 'Three keys, one crown. Whatever happens up there — hold on to something real.' },
                    ]);
                }
            },
        },
        reliquary: { // secret: cracked reliquary — the Wedge you just claimed opens it
            grid: [-1, -2],
            half: 5,
            wallH: 5,
            doors: [{ to: 'monolith', side: 'E', at: 2, type: 'open', width: 1 }],
            blockers: [
                { type: 'wedge_crack', id: 'b05-reliquary-crack', at: { x: -2, z: -2 }, w: 2, h: 2 },
            ],
            onBake(level, origin) {
                level.addPickup({ x: origin.x + 2, y: 1.2, z: origin.z + 2 }, {
                    color: 0xff7a90,
                    label: 'Scar Suture',
                    reward: { type: 'suture' },
                    onPickup(game) {
                        if (game.collectSuture?.('b05-reliquary')) {
                            game.hud?.toast?.("Scar Suture recovered from the reliquary.", 2600);
                        }
                    },
                });
            },
        },
        sanctum: {
            grid: [0, -3],
            half: 8,
            wallH: 6,
            enemies: [
                { x: -3, z: -3, kind: 'bulwark', hp: 4 },
                { x: 3, z: -3, kind: 'sentinel', hp: 4, ai: 'charge' },
                { x: 0, z: 3, kind: 'bulwark', hp: 3 },
            ],
            doors: [
                { to: 'monolith', side: 'S', at: 0, type: 'locked' },
                { to: 'proxythrone', side: 'N', at: 0, type: 'boss' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-05-citadel', 'sanctum-boss-key',
                    { x: origin.x, y: 1.4, z: origin.z - 5 }, 'boss');
            },
        },
        proxythrone: {
            grid: [0, -4],
            half: 12,
            wallH: 6,
            build(map, h) {
                stampMap(map, buildKintsugiPillar(-7, -7, 6), 0, 1, 0);
                stampMap(map, buildKintsugiPillar(7, -7, 6), 0, 1, 0);
                stampMap(map, buildKintsugiPillar(-7, 7, 6), 0, 1, 0);
                stampMap(map, buildKintsugiPillar(7, 7, 6), 0, 1, 0);
            },
            doors: [{ to: 'sanctum', side: 'S', at: 0, type: 'boss' }],
            boss(ctx, level, origin) {
                const proxy = new ProxyBoss(ctx.scene, { x: origin.x, y: 1.5, z: origin.z - 3 });
                attachBoss(level, proxy, {
                    nextBeat: 'beat-06-quarry',
                    toast: 'Proxy defeated — the Abyss opens',
                    defeatStory: [
                        { speaker: 'SYSTEM', text: 'PHASE SHIFT. Coordinate authority revoked.' },
                        { speaker: 'PREDECESSOR', text: 'That was not a victory. That was a door. The Abyss keeps the seven — go get them.' },
                    ],
                    onDefeat(game) {
                        if (!game.player.inventory.hasItem('tectonic_wedge')) {
                            game.player.inventory.grantItem('tectonic_wedge');
                        }
                        game.player.inventory.setFlag('mirror_free', true); // W5 free swap
                        triggerPhaseShift(game.mood, 'abyss', 1.5);
                        game.hud?.toast?.('Phase shift — welcome to the Wound');
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

export function loadBeat05(ctx) {
    const level = createDungeon(ctx, BEAT05_DEF);
    level.suppressBossIntro = true;
    level.musicBed = 'crust';
    level.story = [
        { speaker: 'PROXY', text: 'You climb with borrowed keys. I am the seal between crust and wound.' },
        { speaker: 'PREDECESSOR', text: 'Strike the true body. Clones only delay the fold.' },
    ];
    return level;
}
