// Beat 12 — Pyre Peak (Turtle Rock).
// C3: 8-room volcanic ascent. Magma vents, the Vector Staff (light-line
// casts carried over via the tryAttack patch), the Magma Wyrm's caldera.
//
// Layout:                [caldera]      Magma Wyrm (boss door)
//                        [ashgallery]   boss key gauntlet
//      [cinderpocket*] — [ventfield]    locked, altar, key 2
//    [slagworks] — [pyreterrace] — [emberrun]
//        map           key 1         Vector Staff + vents
//                        [scoriagate]   start; S exit → overworld

import { createDungeon } from '../world/room-graph.js';
import { addKeyPickup } from '../world/keys.js';
import { ABYSS_COLORS } from '../assets/palettes.js';
import { LightLineSystem } from '../world/light-line-system.js';
import { buildMagmaVent, stampMap } from '../assets/props.js';
import { MagmaWyrm, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';

export const BEAT12_DEF = {
    id: 'beat-12-pyre',
    name: '12 Pyre Peak',
    mood: 'abyss',
    // Per-level luminance trim into the Abyss certification band [35,75]
    // (see tests/qa/lum-probe.mjs); multiplies the mood preset's light levels.
    lightTune: { ambient: 2.3, key: 2.05 },
    start: 'scoriagate',
    prebake: true,
    floorColor: 0x5c3a26, // certification retune: ember-brown lifted out of the near-black
    wallColor: 0x6a4434, // reflectance floor that kept pyre frames under lum 12
    banner: 'A dragon of ore and spite rivers through the peak.',
    // Z6 — this dungeon's one idea, and the four rooms that carry it:
    // introduce it safely, complicate it, fuse it with combat, then examine it.
    theme: {
        id: 'lanes_air',
        name: 'Lane and Sky',
        hint: "One threat runs at you in a straight line, one hangs where you cannot swing. Never solve them in the same order twice.",
        teach: 'pyreterrace',
        develop: 'slagworks',
        combine: 'ashgallery',
        test: 'caldera',
    },
    keys: [
        { room: 'pyreterrace', type: 'small' },
        { room: 'ventfield', type: 'small' },
        { room: 'ashgallery', type: 'boss' },
    ],
    onExit(game) {
        game.loadLevel?.('overworld');
    },
    rooms: {
        scoriagate: {
            grid: [0, 0],
            half: 7,
            wallH: 4,
            spawn: { x: 0, z: 4 },
            build(map, h) {
                stampMap(map, buildMagmaVent(-3, -3), 0, 1, 0);
                stampMap(map, buildMagmaVent(3, -3), 0, 1, 0);
            },
            doors: [
                { to: 'pyreterrace', side: 'N', at: 0, type: 'open' },
                { to: '_world', side: 'S', at: 0, type: 'exit' },
            ],
        },
        pyreterrace: {
            grid: [0, -1],
            half: 11,
            wallH: 4,
            build(map, h) {
                stampMap(map, buildMagmaVent(-5, -4), 0, 1, 0);
                stampMap(map, buildMagmaVent(5, 3), 0, 1, 0);
                h.fillBox(map, -2, 2, 1, 2, 6, 8, ABYSS_COLORS.basalt);
            },
            enemies: [
                { x: -5, z: 4, kind: 'lancer', hp: 5 },
                { x: 5, z: -5, kind: 'mote', hp: 4 },
            ],
            doors: [
                { to: 'scoriagate', side: 'S', at: 0, type: 'open' },
                { to: 'ventfield', side: 'N', at: 0, type: 'locked' },
                { to: 'slagworks', side: 'W', at: 0, type: 'open' },
                { to: 'emberrun', side: 'E', at: 0, type: 'open' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-12-pyre', 'terrace-key',
                    { x: origin.x + 9, y: 1.2, z: origin.z + 9 }, 'small');
            },
        },
        slagworks: {
            grid: [-1, -1],
            half: 7,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -5, -4, 1, 3, -5, 4, 0x3a2018);
            },
            enemies: [{ x: 3, z: 3, kind: 'lancer', hp: 4, ai: 'charge' }],
            doors: [{ to: 'pyreterrace', side: 'E', at: 0, type: 'open' }],
            onBake(level, origin) {
                if (!level.keyStore.mapPickup()) {
                    // x -4 sat inside a basalt fan; step it clear onto open floor.
                    level.addPickup({ x: origin.x - 3, y: 1.2, z: origin.z - 4 }, {
                        color: 0x9ad0ff,
                        label: 'Slag charts',
                        onPickup(game) {
                            level.keyStore.markMapPickup();
                            game.hud?.toast?.('Slag charts — the map reveals the vents');
                        },
                    });
                }
            },
        },
        emberrun: {
            grid: [1, -1],
            half: 8,
            wallH: 4,
            build(map, h) {
                stampMap(map, buildMagmaVent(-3, -3), 0, 1, 0);
                stampMap(map, buildMagmaVent(3, 2), 0, 1, 0);
            },
            enemies: [{ x: 0, z: -4, kind: 'mote', hp: 4, ai: 'ranged' }],
            doors: [{ to: 'pyreterrace', side: 'W', at: 0, type: 'open' }],
            onBake(level, origin) {
                level.addPickup({ x: origin.x + 6, y: 1.2, z: origin.z - 6 }, {
                    color: 0xff7a90,
                    label: 'Scar Suture',
                    reward: { type: 'suture' },
                    onPickup(game) {
                        if (game.collectSuture?.('b12-emberrun')) {
                            game.hud?.toast?.('Scar Suture recovered from the ember run.', 2600);
                        }
                    },
                });
                level.addPickup({ x: origin.x, y: 1.2, z: origin.z + 4 }, {
                    color: 0xffa040,
                    label: 'Vector Staff',
                    onPickup(game) {
                        game.player.inventory.grantItem('vector_staff');
                        game.player.inventory.grantItem('line_caster');
                        game.hud?.toast?.('Vector Staff and Line Caster — light lines now hold');
                        game.anchorThread?.markProgress?.('item_acquired', 'line_caster');
                    },
                });
            },
        },
        ventfield: {
            grid: [0, -2],
            half: 9,
            wallH: 4,
            build(map, h) {
                stampMap(map, buildMagmaVent(-5, 0), 0, 1, 0);
                stampMap(map, buildMagmaVent(5, 0), 0, 1, 0);
                stampMap(map, buildMagmaVent(0, -5), 0, 1, 0);
            },
            enemies: [
                { x: -4, z: 4, kind: 'lancer', hp: 4 },
                { x: 4, z: 4, kind: 'mote', hp: 5 },
            ],
            doors: [
                { to: 'pyreterrace', side: 'S', at: 0, type: 'locked' },
                { to: 'ashgallery', side: 'N', at: 0, type: 'locked' },
                { to: 'cinderpocket', side: 'W', at: -3, type: 'open', width: 1 },
            ],
            onBake(level, origin, ctx) {
                addAltar(level, ctx, { x: origin.x + 6, z: origin.z + 6 });
                addKeyPickup(level, 'beat-12-pyre', 'vent-key',
                    { x: origin.x - 6, y: 1.2, z: origin.z + 6 }, 'small');
            },
            onEnter(game) {
                if (!this._storyShown) {
                    this._storyShown = true;
                    game.hud?.story?.queue?.([
                        { speaker: 'PREDECESSOR', text: 'Draw your light quickly. The Peak eats what lingers.' },
                        { speaker: 'PREDECESSOR', text: 'The last of the seven is held past the lava sea. The Wyrm circles it.' },
                    ]);
                }
            },
        },
        cinderpocket: { // secret: a shrouded cinder hollow
            grid: [-1, -2],
            half: 5,
            wallH: 4,
            doors: [{ to: 'ventfield', side: 'E', at: -3, type: 'open', width: 1 }],
            blockers: [
                { type: 'caster_dark', id: 'b12-cinder-dark', rect: { x0: -3, x1: 3, z0: -3, z1: 3 } },
            ],
            onBake(level, origin) {
                level.addPickup({ x: origin.x, y: 1.2, z: origin.z }, {
                    color: 0x9ad0ff,
                    label: 'Memory Vial chassis',
                    reward: { type: 'vial' },
                    onPickup(game) {
                        if (game.collectMemoryVial?.('b12-cinder')) {
                            game.hud?.toast?.("A Memory Vial chassis, annealed in the cinder pocket.", 2600);
                        }
                    },
                });
            },
        },
        ashgallery: {
            grid: [0, -3],
            half: 8,
            wallH: 4,
            build(map, h) {
                stampMap(map, buildMagmaVent(0, 0), 0, 1, 0);
            },
            enemies: [
                { x: -3, z: -3, kind: 'lancer', hp: 5 },
                { x: 3, z: -3, kind: 'mote', hp: 4 },
                { x: 0, z: 3, kind: 'lancer', hp: 5 },
            ],
            doors: [
                { to: 'ventfield', side: 'S', at: 0, type: 'locked' },
                { to: 'caldera', side: 'N', at: 0, type: 'boss' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-12-pyre', 'ash-boss-key',
                    { x: origin.x, y: 1.4, z: origin.z - 5 }, 'boss');
            },
        },
        caldera: {
            grid: [0, -4],
            half: 12,
            wallH: 5,
            build(map, h) {
                stampMap(map, buildMagmaVent(-5, -4), 0, 1, 0);
                stampMap(map, buildMagmaVent(5, 3), 0, 1, 0);
                stampMap(map, buildMagmaVent(0, -7), 0, 1, 0);
                h.fillBox(map, -2, 2, 1, 2, 6, 8, ABYSS_COLORS.basalt);
            },
            doors: [{ to: 'ashgallery', side: 'S', at: 0, type: 'boss' }],
            boss(ctx, level, origin) {
                const wyrm = new MagmaWyrm(ctx.scene, {
                    x: origin.x, y: 1.3, z: origin.z - 4,
                });
                attachBoss(level, wyrm, {
                    nextBeat: 'beat-13-gumoi',
                    toast: 'Wyrm ash settles — GUMOI Tower beckons',
                    defeatStory: [
                        { speaker: 'PREDECESSOR', text: 'The Wyrm circles no more. Seven of seven — their memory cores aggregate.' },
                        { speaker: 'GUMOI', text: 'Aggregation noted. The Tower is open, construct. It was always open.' },
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

export function loadBeat12(ctx) {
    const level = createDungeon(ctx, BEAT12_DEF);
    level.suppressBossIntro = true;
    level.musicBed = 'abyss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'A dragon of ore and spite. Its body is a river of heat.' },
        { speaker: 'SYSTEM', text: 'Do not stand in fire trails. Aim for the head of the chain.' },
    ];

    // Vector Staff light-lines: Light Caster casts also fire a light line
    const lines = new LightLineSystem(ctx.scene, ctx.collisionWorld);
    let patched = false;
    let originalTryAttack = null;
    let gameRef = null;

    function restoreAttack() {
        if (patched && gameRef?.player && originalTryAttack) {
            gameRef.player.tryAttack = originalTryAttack;
            patched = false;
            originalTryAttack = null;
        }
    }

    level.addSystem({
        update(dt) { lines.update(dt); },
        dispose() {
            restoreAttack();
            lines.dispose();
        },
    });
    level.lightLines = lines;

    level.onEnter = (game) => {
        gameRef = game;
        restoreAttack();
        originalTryAttack = game.player.tryAttack.bind(game.player);
        game.player.tryAttack = (enemies, destructibles) => {
            const hits = originalTryAttack(enemies, destructibles);
            if (game.player.inventory.activeWeapon === 'light_caster' && lines) {
                try {
                    lines.fire(game.player.root.position, game.player.state.facingVec, {
                        range: 10, life: 1.8, color: 0xffa040,
                    });
                } catch (_) {}
            }
            return hits;
        };
        patched = true;
    };

    return level;
}
