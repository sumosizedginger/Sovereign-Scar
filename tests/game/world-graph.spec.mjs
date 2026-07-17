// W1: pure structural tests for dungeon definitions — door symmetry, key
// economy, boss reachability. Runs the fixture now; every real Phase C
// dungeon def gets validated here too.

import { validateDungeonDef, doorCells, doorKey, ROOM_STRIDE } from '../../src/game/world/room-graph.js';
import { TEST_DUNGEON_DEF } from '../../src/game/levels/dev-test-dungeon.js';
import { BEAT01_DEF } from '../../src/game/levels/beat-01-crypt.js';
import { BEAT02_DEF } from '../../src/game/levels/beat-02-spindle.js';
import { BEAT03_DEF } from '../../src/game/levels/beat-03-sink.js';
import { BEAT04_DEF } from '../../src/game/levels/beat-04-sky.js';
import { BEAT05_DEF } from '../../src/game/levels/beat-05-citadel.js';
import { BEAT06_DEF } from '../../src/game/levels/beat-06-quarry.js';
import { BEAT07_DEF } from '../../src/game/levels/beat-07-sluice.js';
import { BEAT08_DEF } from '../../src/game/levels/beat-08-bone.js';
import { BEAT09_DEF } from '../../src/game/levels/beat-09-town.js';
import { BEAT10_DEF } from '../../src/game/levels/beat-10-cryo.js';
import { BEAT11_DEF } from '../../src/game/levels/beat-11-mire.js';
import { BEAT12_DEF } from '../../src/game/levels/beat-12-pyre.js';

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
    t.ok('test dungeon rooms reachable', rt.reachable.length === 4, String(rt.reachable.length));

    // The real Beat 01 dungeon (Phase W gate): 6 rooms, key economy sound
    const b01 = validateDungeonDef(BEAT01_DEF);
    t.ok('beat-01 def valid', b01.ok, b01.reasons.join('; '));
    t.ok('beat-01 six rooms reachable', b01.reachable.length === 6, String(b01.reachable.length));
    t.ok('beat-01 has a boss room', Object.values(BEAT01_DEF.rooms).some((r) => r.boss));
    t.ok('beat-01 has a locked door', Object.values(BEAT01_DEF.rooms)
        .some((r) => (r.doors || []).some((d) => d.type === 'locked')));
    t.ok('beat-01 has a boss door', Object.values(BEAT01_DEF.rooms)
        .some((r) => (r.doors || []).some((d) => d.type === 'boss')));

    // Beat 02 (C2): 8 rooms, two locks, boss key economy sound
    const b02 = validateDungeonDef(BEAT02_DEF);
    t.ok('beat-02 def valid', b02.ok, b02.reasons.join('; '));
    t.ok('beat-02 eight rooms reachable', b02.reachable.length === 8, String(b02.reachable.length));
    t.ok('beat-02 two small keys', (BEAT02_DEF.keys || [])
        .filter((k) => k.type === 'small').length === 2);
    t.ok('beat-02 has boss room + door', Object.values(BEAT02_DEF.rooms).some((r) => r.boss)
        && Object.values(BEAT02_DEF.rooms).some((r) => (r.doors || []).some((d) => d.type === 'boss')));

    // Beat 03 (C2)
    const b03 = validateDungeonDef(BEAT03_DEF);
    t.ok('beat-03 def valid', b03.ok, b03.reasons.join('; '));
    t.ok('beat-03 eight rooms reachable', b03.reachable.length === 8, String(b03.reachable.length));
    t.ok('beat-03 boss room + sand friction', Object.values(BEAT03_DEF.rooms).some((r) => r.boss)
        && BEAT03_DEF.friction === 'sand');

    // Beat 04 (C2): the multi-Y tower
    const b04 = validateDungeonDef(BEAT04_DEF);
    t.ok('beat-04 def valid', b04.ok, b04.reasons.join('; '));
    t.ok('beat-04 eight rooms reachable', b04.reachable.length === 8, String(b04.reachable.length));
    t.ok('beat-04 has multi-Y platform rooms', Object.values(BEAT04_DEF.rooms)
        .filter((r) => typeof r.platforms === 'function').length >= 3);

    // Beat 05 (C2): the phase-shift citadel
    const b05 = validateDungeonDef(BEAT05_DEF);
    t.ok('beat-05 def valid', b05.ok, b05.reasons.join('; '));
    t.ok('beat-05 eight rooms reachable', b05.reachable.length === 8, String(b05.reachable.length));
    t.ok('beat-05 boss room + secret', Object.values(BEAT05_DEF.rooms).some((r) => r.boss)
        && !!BEAT05_DEF.rooms.reliquary);

    // Beat 06 (C3): first Abyss dungeon
    const b06 = validateDungeonDef(BEAT06_DEF);
    t.ok('beat-06 def valid', b06.ok, b06.reasons.join('; '));
    t.ok('beat-06 eight rooms reachable', b06.reachable.length === 8, String(b06.reachable.length));
    t.ok('beat-06 is abyss', BEAT06_DEF.mood === 'abyss');

    // Dungeon sweep: every rebuilt beat meets the per-dungeon checklist shape
    for (const [name, def] of [['b01', BEAT01_DEF], ['b02', BEAT02_DEF],
        ['b03', BEAT03_DEF], ['b04', BEAT04_DEF], ['b05', BEAT05_DEF],
        ['b06', BEAT06_DEF], ['b07', BEAT07_DEF], ['b08', BEAT08_DEF],
        ['b09', BEAT09_DEF], ['b10', BEAT10_DEF], ['b11', BEAT11_DEF],
        ['b12', BEAT12_DEF]]) {
        const rooms = Object.values(def.rooms);
        const n = rooms.length;
        t.ok(`${name} room count in band`, n >= 6 && n <= 14, String(n));
        t.ok(`${name} has locked door + small key`,
            rooms.some((r) => (r.doors || []).some((d) => d.type === 'locked'))
            && (def.keys || []).some((k) => k.type === 'small'));
        t.ok(`${name} has boss key + boss door`,
            rooms.some((r) => (r.doors || []).some((d) => d.type === 'boss'))
            && (def.keys || []).some((k) => k.type === 'boss'));
        t.ok(`${name} has an exit to the overworld`,
            rooms.some((r) => (r.doors || []).some((d) => d.type === 'exit'))
            && typeof def.onExit === 'function');
    }
}
