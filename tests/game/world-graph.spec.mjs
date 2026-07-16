// W1: pure structural tests for dungeon definitions — door symmetry, key
// economy, boss reachability. Runs the fixture now; every real Phase C
// dungeon def gets validated here too.

import { validateDungeonDef, doorCells, doorKey, ROOM_STRIDE } from '../../src/game/world/room-graph.js';
import { TEST_DUNGEON_DEF } from '../../src/game/levels/dev-test-dungeon.js';

export function run(t) {
    // doorKey is order-independent
    t.ok('doorKey sorted', doorKey('d', 'b', 'a') === doorKey('d', 'a', 'b'));

    // doorCells: 2-wide N door at 0 on a half-8 room
    const room = { half: 8, doors: [] };
    const cells = doorCells(room, { side: 'N', at: 0, width: 2 });
    t.ok('door cells count', cells.length === 2);
    t.ok('door cells on north wall', cells.every((c) => c.z === -8));
    t.ok('door cells centered', cells.map((c) => c.x).join(',') === '-1,0');

    const west = doorCells({ half: 6 }, { side: 'W', at: 2, width: 2 });
    t.ok('west door on west wall', west.every((c) => c.x === -6));

    t.ok('stride is 64', ROOM_STRIDE === 64);

    // Two-room fixture: reachable through an open door
    const twoRoom = {
        id: 'fix', start: 'a',
        rooms: {
            a: { grid: [0, 0], half: 8, doors: [{ to: 'b', side: 'N', at: 0, type: 'open' }] },
            b: { grid: [0, -1], half: 8, doors: [{ to: 'a', side: 'S', at: 0, type: 'open' }] },
        },
    };
    const r1 = validateDungeonDef(twoRoom);
    t.ok('two-room reachable', r1.ok, r1.reasons.join('; '));

    // Locked door without a key is unreachable
    const lockedNoKey = {
        id: 'fix2', start: 'a',
        rooms: {
            a: { grid: [0, 0], half: 8, doors: [{ to: 'b', side: 'N', at: 0, type: 'locked' }] },
            b: { grid: [0, -1], half: 8, doors: [{ to: 'a', side: 'S', at: 0, type: 'locked' }] },
        },
    };
    const r2 = validateDungeonDef(lockedNoKey);
    t.ok('locked-no-key fails', !r2.ok, r2.reasons.join('; '));

    // Locked door WITH an obtainable key passes
    const lockedWithKey = {
        ...lockedNoKey,
        id: 'fix3',
        keys: [{ room: 'a', x: 0, z: 0, type: 'small' }],
    };
    const r3 = validateDungeonDef(lockedWithKey);
    t.ok('locked-with-key passes', r3.ok, r3.reasons.join('; '));

    // Key behind its own lock fails (key in room b, lock between a and b)
    const keyBehindLock = {
        ...lockedNoKey,
        id: 'fix4',
        keys: [{ room: 'b', x: 0, z: 0, type: 'small' }],
    };
    const r4 = validateDungeonDef(keyBehindLock);
    t.ok('key-behind-lock fails', !r4.ok);

    // Boss door needs an obtainable boss key
    const bossDef = {
        id: 'fix5', start: 'a',
        keys: [{ room: 'a', type: 'boss' }],
        rooms: {
            a: { grid: [0, 0], half: 8, doors: [{ to: 'bossRoom', side: 'N', at: 0, type: 'boss' }] },
            bossRoom: {
                grid: [0, -1], half: 8, boss: () => {},
                doors: [{ to: 'a', side: 'S', at: 0, type: 'boss' }],
            },
        },
    };
    const r5 = validateDungeonDef(bossDef);
    t.ok('boss key opens boss door', r5.ok, r5.reasons.join('; '));

    const bossNoKey = { ...bossDef, id: 'fix6', keys: [] };
    const r6 = validateDungeonDef(bossNoKey);
    t.ok('boss door without key fails', !r6.ok);

    // Asymmetric door (no way back) is flagged
    const asym = {
        id: 'fix7', start: 'a',
        rooms: {
            a: { grid: [0, 0], half: 8, doors: [{ to: 'b', side: 'N', at: 0 }] },
            b: { grid: [0, -1], half: 8, doors: [] },
        },
    };
    const r7 = validateDungeonDef(asym);
    t.ok('asymmetric door flagged', !r7.ok);

    // The shipping test-dungeon def validates
    const rt = validateDungeonDef(TEST_DUNGEON_DEF);
    t.ok('test dungeon def valid', rt.ok, rt.reasons.join('; '));
    t.ok('test dungeon rooms reachable', rt.reachable.length === 3);
}
