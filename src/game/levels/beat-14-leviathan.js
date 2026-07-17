// Beat 14 — The Leviathan Core (the finale).
// C4: 6-room descent to the OS heart. The core chamber preserves the B4
// collapse cascade → whiteout → ending sequence wiring intact.
//
// Layout:            [corechamber]   Leviathan (boss door, wrap ramp)
//                    [coregate]      boss key gauntlet
//   [foldpocket*] — [recursion]      locked, altar, map
//                    [wraithway]     key 1 gauntlet
//                    [threshold]     start; S exit → overworld

import { createDungeon } from '../world/room-graph.js';
import { addKeyPickup } from '../world/keys.js';
import { ABYSS_COLORS } from '../assets/palettes.js';
import { abyssTint } from '../world/level-builder.js';
import { LeviathanBoss, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';

export const BEAT14_DEF = {
    id: 'beat-14-leviathan',
    name: '14 Leviathan Core',
    mood: 'abyss',
    start: 'threshold',
    prebake: true,
    floorColor: 0x1a1424,
    wallColor: ABYSS_COLORS.violet,
    wrap: 0.35,
    banner: 'The wound that remembers waits below. End the OS.',
    keys: [
        { room: 'wraithway', type: 'small' },
        { room: 'coregate', type: 'boss' },
    ],
    onExit(game) {
        game.loadLevel?.('overworld');
    },
    rooms: {
        threshold: {
            grid: [0, 0],
            half: 7,
            wallH: 5,
            spawn: { x: 0, z: 4 },
            build(map, h) {
                abyssTint(map);
                h.fillBox(map, -1, 1, 1, 4, -5, -4, ABYSS_COLORS.neon);
            },
            doors: [
                { to: 'wraithway', side: 'N', at: 0, type: 'open' },
                { to: '_world', side: 'S', at: 0, type: 'exit' },
            ],
        },
        wraithway: {
            grid: [0, -1],
            half: 10,
            wallH: 5,
            build(map, h) {
                abyssTint(map);
                h.fillBox(map, -8, -7, 1, 3, -4, 4, ABYSS_COLORS.basalt);
                h.fillBox(map, 7, 8, 1, 3, -4, 4, ABYSS_COLORS.basalt);
            },
            enemies: [
                { x: -5, z: 3, kind: 'sentinel', hp: 5, ai: 'charge' },
                { x: 5, z: 3, kind: 'frost', hp: 5, ai: 'ranged' },
                { x: 0, z: -5, kind: 'scarab', hp: 5, ai: 'charge' },
            ],
            doors: [
                { to: 'threshold', side: 'S', at: 0, type: 'open' },
                { to: 'recursion', side: 'N', at: 0, type: 'locked' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-14-leviathan', 'wraith-key',
                    { x: origin.x + 8, y: 1.2, z: origin.z - 8 }, 'small');
            },
        },
        recursion: {
            grid: [0, -2],
            half: 9,
            wallH: 5,
            build(map, h) {
                abyssTint(map);
                h.fillBox(map, -3, 3, 1, 1, -3, 3, ABYSS_COLORS.basalt);
            },
            enemies: [
                { x: -4, z: 0, kind: 'frost', hp: 5, ai: 'ranged' },
                { x: 4, z: 0, kind: 'sentinel', hp: 5 },
            ],
            doors: [
                { to: 'wraithway', side: 'S', at: 0, type: 'locked' },
                { to: 'coregate', side: 'N', at: 0, type: 'open' },
                { to: 'foldpocket', side: 'W', at: 0, type: 'open', width: 1 },
            ],
            onBake(level, origin, ctx) {
                addAltar(level, ctx, { x: origin.x + 6, z: origin.z + 6 });
                if (!level.keyStore.mapPickup()) {
                    level.addPickup({ x: origin.x - 6, y: 1.2, z: origin.z + 6 }, {
                        color: 0x9ad0ff,
                        label: 'Core schematic',
                        onPickup(game) {
                            level.keyStore.markMapPickup();
                            game.hud?.toast?.('Core schematic — the recursion mapped');
                        },
                    });
                }
            },
        },
        foldpocket: { // secret: a wedge-cracked fold in the recursion
            grid: [-1, -2],
            half: 5,
            wallH: 5,
            doors: [{ to: 'recursion', side: 'E', at: 0, type: 'open', width: 1 }],
            blockers: [
                { type: 'wedge_crack', id: 'b14-fold-crack', at: { x: -2, z: -2 }, w: 2, h: 2 },
            ],
            onBake(level, origin) {
                level.addPickup({ x: origin.x + 2, y: 1.2, z: origin.z + 2 }, {
                    color: 0x7fe0ff,
                    label: 'Fold cache',
                    onPickup(game) {
                        game.player.inventory.addShards(40);
                        game.hud?.toast?.('Fold cache — 40 shards');
                    },
                });
            },
        },
        coregate: {
            grid: [0, -3],
            half: 8,
            wallH: 5,
            build(map, h) {
                abyssTint(map);
                h.fillBox(map, -6, -5, 1, 2, -6, -5, ABYSS_COLORS.neon);
                h.fillBox(map, 5, 6, 1, 2, -6, -5, ABYSS_COLORS.neon);
            },
            enemies: [
                { x: -3, z: -3, kind: 'scarab', hp: 5, ai: 'charge' },
                { x: 3, z: -3, kind: 'scarab', hp: 5, ai: 'charge' },
                { x: 0, z: 3, kind: 'frost', hp: 5, ai: 'ranged' },
            ],
            doors: [
                { to: 'recursion', side: 'S', at: 0, type: 'open' },
                { to: 'corechamber', side: 'N', at: 0, type: 'boss' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-14-leviathan', 'core-boss-key',
                    { x: origin.x, y: 1.4, z: origin.z - 5 }, 'boss');
            },
        },
        corechamber: {
            grid: [0, -4],
            half: 14,
            wallH: 6,
            spawn: { x: 0, z: 10 },
            build(map, h) {
                abyssTint(map);
                h.fillBox(map, -3, 3, 1, 1, -3, 3, ABYSS_COLORS.basalt);
                h.fillBox(map, -10, -8, 1, 2, -10, -8, ABYSS_COLORS.neon);
                h.fillBox(map, 8, 10, 1, 2, 8, 10, ABYSS_COLORS.neon);
            },
            doors: [{ to: 'coregate', side: 'S', at: 0, type: 'boss' }],
            boss(ctx, level, origin) {
                const levi = new LeviathanBoss(ctx.scene, {
                    x: origin.x, y: 2.5, z: origin.z,
                });
                attachBoss(level, levi, {
                    toast: 'Leviathan Core terminated — the Scar is quiet',
                    onDefeat(game) {
                        game.unlockAndSave?.('sandbox-combat');
                        // B4: collapse cascade → whiteout → ending sequence
                        level._collapse = 0.0001;
                        level._collapseBurst = 0;
                    },
                });
                level.addSystem({
                    update(dt, game) {
                        if (levi.state.current !== 'DEAD') {
                            level.wrap = levi.wrapAmount;
                        } else if (level._collapse != null && !level._endingFired) {
                            // Collapse: escalating shard bursts + wrap ramp
                            level._collapse += dt;
                            level.wrap = Math.min(1, 0.35 + level._collapse * 0.22);
                            level._collapseBurst -= dt;
                            if (level._collapseBurst <= 0 && game.particles?.spawnShard) {
                                level._collapseBurst = Math.max(0.06, 0.25 - level._collapse * 0.05);
                                const bp = levi.root?.position || { x: origin.x, y: 2.5, z: origin.z };
                                const n = 4 + Math.floor(level._collapse * 3);
                                for (let i = 0; i < n; i++) {
                                    const a = Math.random() * Math.PI * 2;
                                    const r = Math.random() * (1 + level._collapse);
                                    game.particles.spawnShard(
                                        { x: bp.x + Math.cos(a) * r, y: bp.y + Math.random() * 2, z: bp.z + Math.sin(a) * r },
                                        Math.random() < 0.5 ? 0xd4a84b : 0x60ffe0, // kintsugi + neon
                                        { x: bp.x, y: bp.y, z: bp.z }
                                    );
                                }
                            }
                            if (level._collapse >= 3.2) {
                                level._endingFired = true;
                                level.wrap = 0;
                                game.startEnding?.();
                            }
                        } else if (!level._collapse && !level._won && levi.state.current === 'DEAD') {
                            level._won = true;
                            level.wrap = 0;
                        }
                    },
                    dispose() {},
                });
            },
            onEnter(game) {
                const boss = game?.level?.boss;
                if (boss && !boss.defeated && !this._introFired) {
                    this._introFired = true;
                    game.bossIntro = { t: 0.6, boss, fired: false };
                    game.mood?.setMusicProfile?.('leviathan');
                }
            },
        },
    },
};

export function loadBeat14(ctx) {
    const level = createDungeon(ctx, BEAT14_DEF);
    level.suppressBossIntro = true;
    level.musicBed = 'leviathan';
    level.story = [
        { speaker: 'LEVIATHAN', text: 'I am the wound that remembers. You are a patch note.' },
        { speaker: 'PREDECESSOR', text: 'Three phases: Core, Loop, Fold. The bright sphere is truth.' },
        { speaker: 'SYSTEM', text: 'Decoys do not bleed. Only the luminous heart ends the recursion.' },
    ];
    return level;
}
