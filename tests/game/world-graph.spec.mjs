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
import { BEAT13_DEF } from '../../src/game/levels/beat-13-gumoi.js';
import { BEAT14_DEF } from '../../src/game/levels/beat-14-leviathan.js';
import { fillBox } from '../../src/voxel/helpers.js';
import { OVERWORLD_SUTURES } from '../../src/game/overworld/world7.js';

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

    // GUMOI's raised arena geometry must stay out of build(), whose y>=1
    // columns become infinite-height planar collision solids.
    const crown = BEAT13_DEF.rooms.witnesscrown;
    t.ok('GUMOI terraces use the platform map', typeof crown.platforms === 'function');
    const crownPlatforms = new Map();
    crown.platforms(crownPlatforms, { fillBox });
    // The arena must stay FLAT. The rig looks down from height 17.5, so mass
    // more than a cell or two off the floor sits between the lens and the fight:
    // the old crown platform at y=9 eclipsed the whole boss arena. (It was also
    // stacked two cells per step, which the 1-cell step-up could never climb.)
    const crownMaxY = Math.max(
        ...[...crownPlatforms.keys()].map((key) => Number(key.split(',')[1])));
    t.ok('GUMOI arena stays camera-readable (no tall staging)', crownMaxY <= 2,
        `maxY=${crownMaxY}`);
    const crownSolids = new Map();
    crown.build?.(crownSolids, { fillBox });
    t.ok('GUMOI solid map has no raised terrace columns',
        ![...crownSolids.keys()].some((key) => Number(key.split(',')[1]) >= 1));

    // Beat-07: post-boss return across the weeping-hall chasm.
    // Dual rim anchors + Hydroid onDefeat must clear blocker:b07-hall-gap
    // so blockers.js can spawn a physics-registered floor bridge.
    {
        const hall = BEAT07_DEF.rooms.weepinghall;
        const gap = (hall.blockers || []).find((b) => b.id === 'b07-hall-gap');
        t.ok('b07 hall has grapple_gap', !!gap && gap.type === 'grapple_gap');
        t.ok('b07 hall gap has reverseAnchor for return trip',
            gap && gap.reverseAnchor && gap.anchor
            && gap.reverseAnchor.z < gap.rect.z0
            && gap.anchor.z > gap.rect.z1);
        const cross = Math.abs((gap?.anchor?.z ?? 0) - (gap?.reverseAnchor?.z ?? 0));
        t.ok('b07 hall peg span within base grapple reach (≤10)',
            cross > 0 && cross <= 10, `span=${cross}`);
        // onDefeat is closed over attachBoss; smoke the source contract via
        // cloudcourt.boss factory presence (runtime e2e walks the bridge).
        t.ok('b07 cloudcourt defines boss factory',
            typeof BEAT07_DEF.rooms.cloudcourt.boss === 'function');
    }

    // Dungeon sweep: every rebuilt beat meets the per-dungeon checklist shape
    for (const [name, def] of [['b01', BEAT01_DEF], ['b02', BEAT02_DEF],
        ['b03', BEAT03_DEF], ['b04', BEAT04_DEF], ['b05', BEAT05_DEF],
        ['b06', BEAT06_DEF], ['b07', BEAT07_DEF], ['b08', BEAT08_DEF],
        ['b09', BEAT09_DEF], ['b10', BEAT10_DEF], ['b11', BEAT11_DEF],
        ['b12', BEAT12_DEF], ['b13', BEAT13_DEF], ['b14', BEAT14_DEF]]) {
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

    // ── Scar Suture ledger.
    //
    // Z7 moved the authoritative count to secret-taxonomy.spec.mjs, which
    // reads the explicit `reward: { type }` field instead of guessing from
    // display labels, and which counts Sutures across the WHOLE campaign
    // rather than only beats 07-14 (heart pieces now start in Beat 01 — a
    // player who never learns that looking around pays will not start looking
    // in the ninth dungeon).
    //
    // What survives here is the narrower thing this file is actually about:
    // the legacy cache-label hook still works for pickups that have not
    // declared a reward, so old content keeps paying out.
    {
        const sutureBeats = [
            [7, BEAT07_DEF], [8, BEAT08_DEF], [9, BEAT09_DEF], [10, BEAT10_DEF],
            [11, BEAT11_DEF], [12, BEAT12_DEF], [13, BEAT13_DEF], [14, BEAT14_DEF],
        ];
        let dungeonGrants = 0;
        for (const [, def] of sutureBeats) {
            for (const room of Object.values(def.rooms)) {
                if (typeof room.onBake !== 'function') continue;
                const picked = [];
                const stubLevel = {
                    addPickup(pos, data) { picked.push(data || {}); return {}; },
                    addSystem() {},
                    addVoxelQuery() { return () => {}; },
                    destructibles: [],
                    keyStore: {
                        isOpen: () => false,
                        isPickupTaken: () => false,
                        markPickupTaken() {},
                        grantSmallKey() {},
                        grantBossKey() {},
                        mapPickup: () => false,
                        markMapPickup() {},
                    },
                };
                const stubCtx = {
                    scene: { add() {}, remove() {} },
                    particles: {},
                    collisionWorld: { addSolid() {}, removeSolid() {} },
                };
                try {
                    room.onBake(stubLevel, { x: 0, y: 0, z: 0 }, stubCtx);
                } catch (err) {
                    // A room whose onBake needs deeper runtime than the stub
                    // provides still surfaces its pickups first or fails
                    // loudly here — either way the ledger stays honest.
                    t.ok(`${def.id} onBake bakeable with stub`, false, String(err));
                    continue;
                }
                dungeonGrants += picked.filter((p) => p.scoreType === 'secret'
                    || (!p.scoreType && /cache/i.test(p.label || ''))).length;
            }
        }
        t.ok('the legacy cache-label Suture hook still pays out',
            dungeonGrants > 0, String(dungeonGrants));
        t.ok('two item-gated overworld Suture grants authored',
            Object.keys(OVERWORLD_SUTURES).length === 2,
            JSON.stringify(OVERWORLD_SUTURES));
    }
}
