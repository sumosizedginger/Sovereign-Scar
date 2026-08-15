// Phase W test dungeon — dev-teleport only (never in player-facing LEVELS).
// Exercises: open-door transition (W1/W2), locked door + key + boss door (W3).

import { createDungeon } from '../world/room-graph.js';
import { addKeyPickup } from '../world/keys.js';

export const TEST_DUNGEON_DEF = {
    id: 'w-test-dungeon',
    name: 'W Test Dungeon',
    mood: 'crust',
    start: 'entry',
    banner: 'Dev: room-graph test dungeon',
    keys: [
        { room: 'hall', x: 4, z: 0, type: 'small' },
    ],
    onExit(game) {
        game.loadLevel?.('w-test-overworld');
    },
    rooms: {
        entry: {
            grid: [0, 0],
            half: 8,
            wallH: 4,
            spawn: { x: 0, z: 5 },
            build(map, h) {
                h.fillBox(map, -2, 2, 1, 1, -2, -2, h.CRUST_COLORS.slateDark);
            },
            enemies: [{ x: -3, z: -1, kind: 'sentinel', hp: 2 }],
            doors: [
                { to: 'hall', side: 'N', at: 0, type: 'open' },
                { to: '_world', side: 'S', at: 0, type: 'exit' },
            ],
        },
        hall: {
            grid: [0, -1],
            half: 10,
            wallH: 4,
            spawn: { x: 0, z: 0 },
            build(map, h) {
                h.fillBox(map, -6, -5, 1, 2, -6, -5, h.CRUST_COLORS.iron);
            },
            enemies: [{ x: 3, z: -3, kind: 'scarab', hp: 2, ai: 'charge' }],
            doors: [
                { to: 'entry', side: 'S', at: 0, type: 'open' },
                { to: 'vault', side: 'W', at: 0, type: 'locked' },
            ],
        },
        vault: {
            grid: [-1, -1],
            half: 6,
            wallH: 4,
            spawn: { x: 0, z: 0 },
            doors: [
                { to: 'hall', side: 'E', at: 0, type: 'locked' },
                { to: 'gauntlet', side: 'S', at: 0, type: 'open' },
            ],
            // W7: crack + shroud in the vault
            blockers: [
                { type: 'wedge_crack', id: 'td-crack', at: { x: -4, z: -4 }, w: 2, h: 2 },
                { type: 'caster_dark', id: 'td-dark', rect: { x0: 1, x1: 5, z0: 2, z1: 5 } },
            ],
            onBake(level, origin) {
                level.addPickup({ x: origin.x, y: 1.2, z: origin.z - 2 }, {
                    color: 0xffd060,
                    label: 'Vault prize',
                    onPickup(game) {
                        game.player.inventory.addShards(25);
                        game.hud?.toast?.('Vault prize — 25 shards');
                    },
                });
            },
        },
        gauntlet: {
            grid: [-1, 0],
            half: 10,
            wallH: 4,
            spawn: { x: 0, z: -7 },
            doors: [{ to: 'vault', side: 'N', at: 0, type: 'open' }],
            // W7: full-width chasm (grapple) then a 2-high ledge (boot hop)
            blockers: [
                {
                    type: 'grapple_gap', id: 'td-gap',
                    rect: { x0: -9, x1: 9, z0: -4, z1: -2 },
                    anchor: { x: 0, z: 0 },
                    edge: { x: 0, z: -6 },
                },
                {
                    type: 'boot_ledge', id: 'td-ledge',
                    rect: { x0: -9, x1: 9, z0: 4, z1: 4 },
                },
            ],
        },
    },
};

export function loadTestDungeon(ctx) {
    const level = createDungeon(ctx, TEST_DUNGEON_DEF);
    // W3: persistent small-key pickup in the hall (never respawns once taken)
    addKeyPickup(level, TEST_DUNGEON_DEF.id, 'hall-key', { x: 4, y: 1.2, z: -64 }, 'small');
    return level;
}
