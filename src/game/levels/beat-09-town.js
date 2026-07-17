// Beat 09 — The Ruined Town (Thieves' Town).
// C3: 8-room ghost township. Frustum-gated phantom walls carry over; the
// Phantasm wears your facing in the old moot hall.
//
// Layout:                [moothall]      Phantasm (boss door)
//                        [belltower]     boss key on the tower steps
//      [cellar*] —       [highstreet]    locked, altar, key 2
//    [chapel] — [townsquare] — [market]
//      map           key 1           phantom-wall alley cache
//                        [towngate]      start; S exit → overworld

import * as THREE from 'three';
import { createDungeon } from '../world/room-graph.js';
import { addKeyPickup } from '../world/keys.js';
import { ABYSS_COLORS } from '../assets/palettes.js';
import { FrustumWallSystem } from '../world/frustum-walls.js';
import { PhantasmBoss, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';

function addPhantomWalls(level, ctx, origin, spots, prefix) {
    const frustum = new FrustumWallSystem([], ctx.collisionWorld, ctx.camera);
    for (const [x, z] of spots) {
        const wx = origin.x + x, wz = origin.z + z;
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 3, 0.4),
            new THREE.MeshStandardMaterial({
                color: ABYSS_COLORS.violet,
                emissive: ABYSS_COLORS.violetHot,
                emissiveIntensity: 0.6,
                transparent: true,
                opacity: 0.85,
            })
        );
        mesh.position.set(wx, 1.5, wz);
        ctx.scene.add(mesh);
        frustum.addWall(mesh, {
            minX: wx - 0.7, maxX: wx + 0.7,
            minZ: wz - 0.3, maxZ: wz + 0.3,
        }, `${prefix}-${x}-${z}`);
    }
    level.addSystem({
        update(dt) { frustum.update(dt); },
        dispose() { frustum.dispose?.(); },
    });
}

export const BEAT09_DEF = {
    id: 'beat-09-town',
    name: '09 Ruined Town',
    mood: 'abyss',
    start: 'towngate',
    prebake: true,
    floorColor: ABYSS_COLORS.abyssFloor,
    wallColor: ABYSS_COLORS.abyssWall,
    banner: 'The town remembers its people. Something wears their faces.',
    keys: [
        { room: 'townsquare', type: 'small' },
        { room: 'highstreet', type: 'small' },
        { room: 'belltower', type: 'boss' },
    ],
    onExit(game) {
        game.loadLevel?.('overworld');
    },
    rooms: {
        towngate: {
            grid: [0, 0],
            half: 7,
            wallH: 4,
            spawn: { x: 0, z: 4 },
            build(map, h) {
                h.fillBox(map, -5, -4, 1, 3, -3, -2, ABYSS_COLORS.basalt);
                h.fillBox(map, 4, 5, 1, 3, -3, -2, ABYSS_COLORS.basalt);
            },
            doors: [
                { to: 'townsquare', side: 'N', at: 0, type: 'open' },
                { to: '_world', side: 'S', at: 0, type: 'exit' },
            ],
        },
        townsquare: {
            grid: [0, -1],
            half: 11,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -8, -6, 1, 3, -4, 4, ABYSS_COLORS.basalt); // ruined rows
                h.fillBox(map, 6, 8, 1, 3, -4, 4, ABYSS_COLORS.basalt);
                h.fillBox(map, -1, 1, 1, 2, 0, 1, ABYSS_COLORS.charcoal); // dry fountain
            },
            enemies: [
                { x: -5, z: 5, kind: 'sentinel', hp: 4 },
                { x: 5, z: -5, kind: 'frost', hp: 3, ai: 'ranged' },
            ],
            doors: [
                { to: 'towngate', side: 'S', at: 0, type: 'open' },
                { to: 'highstreet', side: 'N', at: 0, type: 'locked' },
                { to: 'chapel', side: 'W', at: 0, type: 'open' },
                { to: 'market', side: 'E', at: 0, type: 'open' },
            ],
            onBake(level, origin, ctx) {
                addPhantomWalls(level, ctx, origin, [[-4, -6], [4, -6]], 'b09-square');
                addKeyPickup(level, 'beat-09-town', 'square-key',
                    { x: origin.x + 9, y: 1.2, z: origin.z + 9 }, 'small');
            },
        },
        chapel: {
            grid: [-1, -1],
            half: 7,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -1, 1, 1, 4, -5, -4, ABYSS_COLORS.bone); // altar wall
            },
            enemies: [{ x: 3, z: 3, kind: 'sentinel', hp: 4 }],
            doors: [{ to: 'townsquare', side: 'E', at: 0, type: 'open' }],
            onBake(level, origin) {
                if (!level.keyStore.mapPickup()) {
                    level.addPickup({ x: origin.x, y: 1.2, z: origin.z - 3 }, {
                        color: 0x9ad0ff,
                        label: 'Parish record',
                        onPickup(game) {
                            level.keyStore.markMapPickup();
                            game.hud?.toast?.('Parish record — the map reveals the town');
                        },
                    });
                }
            },
        },
        market: {
            grid: [1, -1],
            half: 8,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -5, -3, 1, 2, -3, -2, ABYSS_COLORS.charcoal); // stalls
                h.fillBox(map, 2, 4, 1, 2, 2, 3, ABYSS_COLORS.charcoal);
            },
            enemies: [{ x: 0, z: -4, kind: 'scarab', hp: 4, ai: 'charge' }],
            doors: [{ to: 'townsquare', side: 'W', at: 0, type: 'open' }],
            onBake(level, origin, ctx) {
                // A phantom-wall alley hides the market cache
                addPhantomWalls(level, ctx, origin, [[5, -5], [6, -4]], 'b09-market');
                level.addPickup({ x: origin.x + 6, y: 1.2, z: origin.z - 6 }, {
                    color: 0x7fe0ff,
                    label: 'Market cache',
                    onPickup(game) {
                        game.player.inventory.addShards(25);
                        game.hud?.toast?.('Market cache — 25 shards');
                    },
                });
            },
        },
        highstreet: {
            grid: [0, -2],
            half: 9,
            wallH: 4,
            build(map, h) {
                h.fillBox(map, -7, -6, 1, 3, -5, 5, ABYSS_COLORS.basalt);
                h.fillBox(map, 6, 7, 1, 3, -5, 5, ABYSS_COLORS.basalt);
            },
            enemies: [
                { x: -4, z: 0, kind: 'frost', hp: 3, ai: 'ranged' },
                { x: 4, z: 0, kind: 'scarab', hp: 4, ai: 'charge' },
            ],
            doors: [
                { to: 'townsquare', side: 'S', at: 0, type: 'locked' },
                { to: 'belltower', side: 'N', at: 0, type: 'locked' },
                { to: 'cellar', side: 'W', at: 3, type: 'open', width: 1 },
            ],
            onBake(level, origin, ctx) {
                addAltar(level, ctx, { x: origin.x + 5, z: origin.z + 6 });
                addKeyPickup(level, 'beat-09-town', 'street-key',
                    { x: origin.x - 5, y: 1.2, z: origin.z - 7 }, 'small');
            },
        },
        cellar: { // secret: a shrouded cellar under the high street
            grid: [-1, -2],
            half: 5,
            wallH: 4,
            doors: [{ to: 'highstreet', side: 'E', at: 3, type: 'open', width: 1 }],
            blockers: [
                { type: 'caster_dark', id: 'b09-cellar-dark', rect: { x0: -3, x1: 3, z0: -3, z1: 3 } },
            ],
            onBake(level, origin) {
                level.addPickup({ x: origin.x, y: 1.2, z: origin.z }, {
                    color: 0x7fe0ff,
                    label: 'Cellar cache',
                    onPickup(game) {
                        game.player.inventory.addShards(30);
                        game.hud?.toast?.('Cellar cache — 30 shards');
                    },
                });
            },
        },
        belltower: {
            grid: [0, -3],
            half: 8,
            wallH: 5,
            enemies: [
                { x: -3, z: -3, kind: 'sentinel', hp: 4 },
                { x: 3, z: -3, kind: 'frost', hp: 3, ai: 'ranged' },
                { x: 0, z: 3, kind: 'scarab', hp: 4, ai: 'charge' },
            ],
            platforms(map, h) {
                for (let lvl = 1; lvl <= 4; lvl++) {
                    const r = 4 - lvl;
                    h.fillBox(map, -r, r, lvl, lvl, -4 - r, -4 + r, ABYSS_COLORS.charcoal);
                }
            },
            doors: [
                { to: 'highstreet', side: 'S', at: 0, type: 'locked' },
                { to: 'moothall', side: 'N', at: 0, type: 'boss' },
            ],
            onBake(level, origin) {
                addKeyPickup(level, 'beat-09-town', 'bell-boss-key',
                    { x: origin.x, y: 5.4, z: origin.z - 4 }, 'boss');
            },
        },
        moothall: {
            grid: [0, -4],
            half: 12,
            wallH: 5,
            build(map, h) {
                h.fillBox(map, -8, -6, 1, 3, -4, 4, ABYSS_COLORS.basalt);
                h.fillBox(map, 6, 8, 1, 3, -4, 4, ABYSS_COLORS.basalt);
                h.fillBox(map, -3, 3, 1, 2, -8, -6, ABYSS_COLORS.charcoal);
            },
            doors: [{ to: 'belltower', side: 'S', at: 0, type: 'boss' }],
            boss(ctx, level, origin) {
                const phantasm = new PhantasmBoss(ctx.scene, {
                    x: origin.x, y: 1.5, z: origin.z - 4,
                });
                attachBoss(level, phantasm, {
                    nextBeat: 'beat-10-cryo',
                    toast: 'Phantasm dispelled — the Cryo Vault thaws',
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

export function loadBeat09(ctx) {
    const level = createDungeon(ctx, BEAT09_DEF);
    level.suppressBossIntro = true;
    level.musicBed = 'abyss';
    level.story = [
        { speaker: 'PHANTASM', text: 'I wear your facing. I wear your fear.' },
        { speaker: 'PREDECESSOR', text: 'Wait for opacity. Echo strikes punish hesitation — keep moving.' },
    ];
    return level;
}
