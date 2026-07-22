// tests/game/traversal-legibility.spec.mjs — Z2.
//
// Reported by hand: "the player is constantly trying to climb up the walls, he
// should only climb where something is meant to be a stair."
//
// The physics body steps up exactly one voxel and there is no jump, so every
// surface in the game is either walkable or a wall — and nothing about it says
// which. The player learns the difference by walking into things. In Zelda you
// never have to: stairs are drawn as stairs.
//
// markTraversal() recolours the rim of every genuine one-cell rise. These
// specs pin the two halves of that promise:
//   1. every climbable rise IS marked  (no unmarked invitation to climb)
//   2. nothing else is marked          (no lie about where you can go)

import { markTraversal, TREAD_COLOR, KITS } from '../../src/game/levels/dungeon-kits.js';
import { fillBox } from '../../src/voxel/helpers.js';
import { stampMap } from '../../src/game/assets/props.js';
import { CRUST_COLORS, ABYSS_COLORS } from '../../src/game/assets/palettes.js';
import { buildRoomFloor } from '../../src/game/world/level-builder.js';
import { buildPerimeterWithDoors } from '../../src/game/world/room-graph.js';
import { BEAT_LIST } from './_beat-defs.mjs';

const FLOOR = 0x40444c;
const WALL = 0x30343c;

/** Reproduce a room's solid + platform maps exactly as the baker does. */
function bakeMaps(def, room) {
    const h = { fillBox, stampMap, CRUST_COLORS, ABYSS_COLORS, half: room.half };
    const map = new Map();
    buildRoomFloor(map, -room.half, room.half, -room.half, room.half, 0,
        room.floorColor || FLOOR);
    buildPerimeterWithDoors(map, room, room.wallColor || WALL);
    if (room.build) room.build(map, h);
    let pmap = null;
    if (room.platforms) { pmap = new Map(); room.platforms(pmap, h); }
    return { map, pmap };
}

/** Columns whose highest voxel sits exactly one cell above floor level. */
function risesOverFloor(map, pmap) {
    const tops = new Map();
    for (const m of [map, pmap]) {
        if (!m) continue;
        for (const k of m.keys()) {
            const p = k.split(',');
            const col = `${p[0]},${p[2]}`;
            const top = +p[1] + 1;
            if (!(tops.get(col) >= top)) tops.set(col, top);
        }
    }
    const out = [];
    for (const [col, top] of tops) {
        if (top !== 2) continue;
        const [x, z] = col.split(',').map(Number);
        const steppable = [[1, 0], [-1, 0], [0, 1], [0, -1]]
            .some(([dx, dz]) => tops.get(`${x + dx},${z + dz}`) === 1);
        if (steppable) out.push({ x, z, key: `${x},1,${z}` });
    }
    return out;
}

export function run(t) {
    // --- unit behaviour ----------------------------------------------------
    {
        // A single one-cell block on an open floor: the classic step.
        const map = new Map();
        fillBox(map, -4, 4, 0, 0, -4, 4, FLOOR);
        fillBox(map, 0, 0, 1, 1, 0, 0, 0x777777);
        const n = markTraversal(map, null, null);
        t.ok('a lone one-cell rise gets marked', n === 1, `marked=${n}`);
        t.ok('the marked voxel is the rise itself, not the floor',
            map.get('0,1,0') === TREAD_COLOR && map.get('0,0,0') === FLOOR);
    }
    {
        // A two-cell block cannot be stepped onto, so it must NOT be marked —
        // marking it would advertise a route that does not exist.
        const map = new Map();
        fillBox(map, -4, 4, 0, 0, -4, 4, FLOOR);
        fillBox(map, 0, 0, 1, 2, 0, 0, 0x777777);
        t.ok('an unclimbable two-cell block is never marked',
            markTraversal(map, null, null) === 0);
    }
    {
        // A full-height wall column: also not a step.
        const map = new Map();
        fillBox(map, -4, 4, 0, 0, -4, 4, FLOOR);
        fillBox(map, 0, 0, 1, 5, 0, 0, WALL);
        t.ok('a wall is never marked as climbable',
            markTraversal(map, null, null) === 0);
    }
    {
        // A rise with no adjacent floor to step from is decoration on top of a
        // plateau, not an entry point.
        const map = new Map();
        fillBox(map, -4, 4, 0, 0, -4, 4, FLOOR);
        fillBox(map, -2, 2, 1, 1, -2, 2, 0x777777); // a plateau
        const marked = markTraversal(map, null, null);
        // Only the plateau's rim touches floor level.
        t.ok('only the rim of a plateau is marked, not its whole top',
            marked === 16 && marked < 25, `marked=${marked}`);
        t.ok('the plateau interior keeps its own colour',
            map.get('0,1,0') === 0x777777);
    }
    {
        // The rise and the floor it steps from can live in DIFFERENT maps —
        // platform staging is meshed separately from room solids, and a pass
        // that only saw one of them would miss every platform step.
        const map = new Map();
        fillBox(map, -4, 4, 0, 0, -4, 4, FLOOR);
        const pmap = new Map();
        fillBox(pmap, 0, 0, 1, 1, 0, 0, 0x777777);
        const n = markTraversal(map, pmap, null);
        t.ok('a rise in the platform map is marked against floor in the room map',
            n === 1 && pmap.get('0,1,0') === TREAD_COLOR, `marked=${n}`);
    }
    {
        // Kits may override the tread so a dungeon keeps its own language.
        const map = new Map();
        fillBox(map, -4, 4, 0, 0, -4, 4, FLOOR);
        fillBox(map, 0, 0, 1, 1, 0, 0, 0x777777);
        markTraversal(map, null, { tread: 0x123456 });
        t.ok('a kit can override the tread colour', map.get('0,1,0') === 0x123456);
    }
    {
        t.ok('an empty room is survivable', markTraversal(new Map(), null, null) === 0);
        t.ok('a null platform map is survivable',
            markTraversal(new Map(), null, undefined) === 0);
    }

    // --- campaign sweep ----------------------------------------------------
    let rooms = 0, rises = 0, marked = 0;
    const unmarked = [];
    for (const def of BEAT_LIST) {
        for (const [rid, room] of Object.entries(def.rooms)) {
            rooms++;
            const { map, pmap } = bakeMaps(def, room);
            const expected = risesOverFloor(map, pmap);
            rises += expected.length;
            markTraversal(map, pmap, KITS[def.id]);
            const tread = (KITS[def.id] && KITS[def.id].tread) || TREAD_COLOR;
            for (const r of expected) {
                const got = (map.has(r.key) ? map.get(r.key) : pmap && pmap.get(r.key));
                if (got === tread) marked++;
                else unmarked.push(`${def.id}:${rid}@${r.x},${r.z}`);
            }
        }
    }

    t.ok('swept every room in the campaign', rooms >= 100, `rooms=${rooms}`);
    t.ok('the campaign actually contains climbable rises to mark',
        rises > 100, `rises=${rises}`);
    t.ok('every climbable rise in the game is marked as one',
        unmarked.length === 0,
        `${unmarked.length} unmarked: ${unmarked.slice(0, 6).join(' ')}`);
    t.ok('marking covered the whole set', marked === rises, `${marked}/${rises}`);
}
