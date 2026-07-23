// tests/game/room-trim.spec.mjs — detail that cannot touch the game.
//
// The world was not under-detailed for a technical reason. Measured live it ran
// at **79,572 triangles and 43 draw calls**, with room for roughly an order of
// magnitude more before anything hurts. It was under-detailed because nothing
// had asked it for more: a room was a floor rectangle and four walls of uniform
// height, and a wall whose top edge is a straight line at a constant height
// reads as a box rather than as a built place.
//
// Adding geometry to all fourteen dungeons plus the overworld at once is only
// defensible if it provably cannot change what the player can do. That is what
// this file is for. The trim obeys two rules:
//
//   1. it only adds voxels ABOVE the wall top — never at y <= 2, the band the
//      hero's body occupies
//   2. it only touches the room PERIMETER — never interior structures, which is
//      where platforms, arches and grapple routes live
//
// The load-bearing assertion is the DIFF: bake a room with and without trim and
// require the occupied cell set at y <= 2 to be byte-identical. Asserting "trim
// stays above y=2" from the outside would only re-state the implementation; the
// diff proves the room the player walks through is the same room.

import { applyRoomTrim } from '../../src/game/world/room-trim.js';
import { buildRoomFloor } from '../../src/game/world/level-builder.js';
import { fillBox } from '../../src/voxel/helpers.js';
import { CRUST_COLORS } from '../../src/game/assets/palettes.js';

/** A plain rectangular room with a perimeter wall and one door gap. */
function bakeRoom({ half = 12, wallH = 4, door = true } = {}) {
    const map = new Map();
    buildRoomFloor(map, -half, half, -half, half, 0, CRUST_COLORS.floor);
    // North / South
    fillBox(map, -half, half, 1, wallH, -half, -half, CRUST_COLORS.wall);
    fillBox(map, -half, half, 1, wallH, half, half, CRUST_COLORS.wall);
    // West / East
    fillBox(map, -half, -half, 1, wallH, -half, half, CRUST_COLORS.wall);
    fillBox(map, half, half, 1, wallH, -half, half, CRUST_COLORS.wall);
    if (door) {
        // Carve a 3-wide doorway in the north wall, the way the room graph does.
        for (let x = -1; x <= 1; x++) {
            for (let y = 1; y <= wallH; y++) map.delete(`${x},${y},${-half}`);
        }
    }
    return map;
}

const cellsAtOrBelow = (map, maxY) => {
    const out = new Set();
    for (const k of map.keys()) {
        const y = +k.split(',')[1];
        if (y <= maxY) out.add(k);
    }
    return out;
};

const sameSet = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));

export function run(t) {
    const ROOM = { half: 12, wallH: 4 };

    // ---------------------------------------------------------------
    // THE LOAD-BEARING CASE: the playable room is untouched
    // ---------------------------------------------------------------
    {
        const plain = bakeRoom();
        const trimmed = bakeRoom();
        const added = applyRoomTrim(trimmed, ROOM, 'tomb');

        t.ok('trim actually added geometry', added > 0, `added=${added}`);
        t.ok('the hero-height cell set is byte-identical',
            sameSet(cellsAtOrBelow(plain, 2), cellsAtOrBelow(trimmed, 2)),
            `plain=${cellsAtOrBelow(plain, 2).size} trimmed=${cellsAtOrBelow(trimmed, 2).size}`);
        t.ok('the floor is byte-identical',
            sameSet(cellsAtOrBelow(plain, 0), cellsAtOrBelow(trimmed, 0)));

        // Nothing existing was recoloured either — trim adds, it never edits.
        let repainted = 0;
        for (const [k, c] of plain) if (trimmed.get(k) !== c) repainted++;
        t.ok('no existing voxel was recoloured', repainted === 0, `${repainted} repainted`);

        // And every added cell is where it claims to be.
        let below = 0, offEdge = 0;
        for (const k of trimmed.keys()) {
            if (plain.has(k)) continue;
            const [x, y, z] = k.split(',').map(Number);
            if (y <= ROOM.wallH) below++;
            if (Math.abs(x) !== ROOM.half && Math.abs(z) !== ROOM.half) offEdge++;
        }
        t.ok('no added voxel sits at or below the wall top', below === 0, `${below} too low`);
        t.ok('no added voxel leaves the perimeter ring', offEdge === 0,
            `${offEdge} inside the room — interior is where traversal lives`);
    }

    // ---------------------------------------------------------------
    // doorways stay open to the sky
    // ---------------------------------------------------------------
    {
        // A door gap has no wall cap, so there is nothing to trim from — which
        // is also what stops trim bridging a doorway with a floating lintel the
        // player walks under and wonders about.
        const map = bakeRoom({ door: true });
        applyRoomTrim(map, ROOM, 'corridor');
        let overDoor = 0;
        for (let x = -1; x <= 1; x++) {
            for (let y = ROOM.wallH + 1; y <= ROOM.wallH + 5; y++) {
                if (map.has(`${x},${y},${-ROOM.half}`)) overDoor++;
            }
        }
        t.ok('nothing is built over a doorway', overDoor === 0, `${overDoor} voxels`);
    }

    // ---------------------------------------------------------------
    // it does what it is for: the top edge is no longer a ruler
    // ---------------------------------------------------------------
    {
        const map = bakeRoom();
        applyRoomTrim(map, ROOM, 'antechamber');
        // Heights along the north wall.
        const heights = [];
        for (let x = -ROOM.half; x <= ROOM.half; x++) {
            let top = 0;
            for (let y = 0; y <= ROOM.wallH + 6; y++) {
                if (map.has(`${x},${y},${ROOM.half}`)) top = y;
            }
            heights.push(top);
        }
        const distinct = new Set(heights);
        t.ok('a wall run has more than one height', distinct.size > 1,
            `heights seen: ${[...distinct].sort((a, b) => a - b).join(',')}`);
        t.ok('but it is not sawtooth noise', distinct.size <= 5,
            `${distinct.size} distinct heights — a wall should read as built, not as static`);
        t.ok('the corner is the tallest thing on the wall',
            heights[0] === Math.max(...heights),
            `corner=${heights[0]} max=${Math.max(...heights)}`);
    }

    // ---------------------------------------------------------------
    // determinism — presentation-determinism-e2e requires identical frames
    // ---------------------------------------------------------------
    {
        const a = bakeRoom(); applyRoomTrim(a, ROOM, 'warden');
        const b = bakeRoom(); applyRoomTrim(b, ROOM, 'warden');
        t.ok('the same room trims identically twice',
            sameSet(new Set(a.keys()), new Set(b.keys())), 'no Math.random anywhere');

        const c = bakeRoom(); applyRoomTrim(c, ROOM, 'a-different-room');
        t.ok('a different room trims differently',
            !sameSet(new Set(a.keys()), new Set(c.keys())),
            'otherwise every room in the game wears the same pattern');
    }

    // ---------------------------------------------------------------
    // it can be switched off, and it declines silly input
    // ---------------------------------------------------------------
    {
        const off = bakeRoom();
        const n = applyRoomTrim(off, ROOM, 'tomb', { enabled: false });
        t.ok('trim can be disabled per level', n === 0);
        t.ok('and adds nothing when disabled',
            sameSet(new Set(off.keys()), new Set(bakeRoom().keys())));

        t.ok('a room with no half is skipped', applyRoomTrim(new Map(), {}, 'x') === 0);
        t.ok('a tiny room is skipped', applyRoomTrim(new Map(), { half: 1 }, 'x') === 0);
        t.ok('an empty map yields nothing to trim',
            applyRoomTrim(new Map(), { half: 12 }, 'x') === 0,
            'no wall cap to build on');
    }

    // ---------------------------------------------------------------
    // cost
    // ---------------------------------------------------------------
    {
        const map = bakeRoom();
        const before = map.size;
        const added = applyRoomTrim(map, ROOM, 'sizing');
        const ratio = added / before;
        t.ok('trim is a modest fraction of the room', ratio < 0.25,
            `+${added} on ${before} voxels (${(ratio * 100).toFixed(1)}%)`);
        t.ok('and it is not trivial either', added > 20, `added=${added}`);
        // It merges into the same map, so it costs no extra draw call — that is
        // the whole reason it is done at bake time rather than as props.
    }
}
