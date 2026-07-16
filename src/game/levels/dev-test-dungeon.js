// Phase W test dungeon — dev-teleport only (never in player-facing LEVELS).
// Exercises: open-door transition (W1/W2), locked door + key + boss door (W3).

import { createDungeon } from '../world/room-graph.js';
import { CRUST_COLORS } from '../assets/palettes.js';

export const TEST_DUNGEON_DEF = {
    id: 'w-test-dungeon',
    name: 'W Test Dungeon',
    mood: 'crust',
    start: 'entry',
    banner: 'Dev: room-graph test dungeon',
    keys: [
        { room: 'hall', x: 4, z: 0, type: 'small' },
    ],
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
            doors: [{ to: 'hall', side: 'N', at: 0, type: 'open' }],
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
            doors: [{ to: 'hall', side: 'E', at: 0, type: 'locked' }],
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
    },
};

export function loadTestDungeon(ctx) {
    const level = createDungeon(ctx, TEST_DUNGEON_DEF);
    // W1 test affordance: the hall contains one small key pickup.
    const hallOrigin = { x: 0, z: -64 };
    level.addPickup({ x: hallOrigin.x + 4, y: 1.2, z: hallOrigin.z }, {
        color: 0xffd060,
        label: 'Small key',
        onPickup(game) {
            level.keyStore.grantSmallKey();
            game.hud?.toast?.('Small key acquired');
        },
    });
    return level;
}
