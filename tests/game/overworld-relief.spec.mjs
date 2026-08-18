// tests/game/overworld-relief.spec.mjs — the overworld gets ground too.
//
// THE MEASUREMENT THAT STARTED THIS. `tests/qa/contrast-probe.mjs` reported the
// overworld at a p10-to-p90 luminance spread of **11**, against 68 to 189 for
// every dungeon — while being BRIGHTER than all of them (centre mean 99.5).
// Not dark: flat. Everything on screen was the same value.
//
// The cause was structural, not artistic, and two probes found it between them:
//
//   1. `makeProtector` in `overworld/grammars.js` keeps a radius-6 disc clear
//      at the centre of every screen so the spawn and the door lanes always
//      work. Measured, that disc held **0 of 109 cells with any mass on them**.
//      The camera frame is about 13 units deep, so standing where the player
//      arrives, there was nothing in shot but floor.
//   2. Terracing WAS running on the overworld — the exclusion everyone assumed
//      was there never existed, because `def.overworld` is not a field the
//      overworld sets. Every terrace shape is parameterised off `half`, and at
//      the screens' half of 23 `rim` puts its shelf 21 units out. All the
//      relief existed and none of it was ever on screen.
//
// So: relief at FRAME scale for any room bigger than the camera, and per-region
// ground weathering for the level that has no kit to hang it on. Contrast 11 →
// 27, with p10 falling 95 → 81 — real shadow where there had been none.
//
// WHAT IS HELD HERE
//   1. The large-room path triggers on size, and small rooms keep the old shapes.
//   2. Relief actually lands inside a camera frame, which is the whole point.
//   3. It is DETERMINISTIC and varies between rooms.
//   4. It never places a blocked cell, and never rises more than one step at a
//      time — the rule that makes terracing safe to generate from a table.
//   5. The overworld carries its weathering name through to the room.

import fs from 'node:fs';
import {
    terraceRoom, MIN_HALF, LARGE_HALF, LARGE_PITCH,
} from '../../src/game/world/terracing.js';
import { WEATHERING } from '../../src/game/world/room-decals.js';
import { REGIONS } from '../../src/game/overworld/world7.js';

const CR = String.fromCharCode(13);
const read = (p) => fs.readFileSync(p, 'utf8').split(CR).join('');

/** The camera frame at the shipped rig, in cells — `tests/qa/arena-frame.mjs`. */
const FRAME_HALF_X = 10;
const FRAME_HALF_Z = 6;

/** Cells with any platform mass, keyed "x,z". */
function massCells(pmap) {
    const out = new Set();
    for (const k of pmap.keys()) {
        const p = k.split(',');
        out.add(`${p[0]},${p[2]}`);
    }
    return out;
}

/** Tallest platform voxel in a column, or 0. */
function topAt(pmap, x, z) {
    let top = 0;
    for (let y = 1; y <= 8; y++) if (pmap.has(`${x},${y},${z}`)) top = y;
    return top;
}

export function run(t) {
    const SCREEN = { half: 23 };     // overworld SCREEN_HALF
    const ROOM = { half: 10 };       // a large dungeon room

    // ── 1. THE SIZE SWITCH ─────────────────────────────────────────────────
    {
        t.ok('a screen is larger than the threshold', SCREEN.half >= LARGE_HALF);
        t.ok('…and a dungeon room is not', ROOM.half < LARGE_HALF,
            `room half ${ROOM.half} vs LARGE_HALF ${LARGE_HALF}`);
        t.ok('the threshold is above the frame, so a single shape still reads',
            LARGE_HALF > FRAME_HALF_X, `${LARGE_HALF} vs frame ${FRAME_HALF_X}`);
        t.ok('…and above the minimum that gets anything at all',
            LARGE_HALF > MIN_HALF);
        // The pitch has to be tighter than the frame's SHALLOW axis or a player
        // can stand between two rises and see neither.
        t.ok('the rise spacing fits inside the frame the player is looking at',
            LARGE_PITCH < FRAME_HALF_Z * 2, `pitch ${LARGE_PITCH} vs depth ${FRAME_HALF_Z * 2}`);
    }

    // ── 2. IT LANDS WHERE THE CAMERA IS POINTING ───────────────────────────
    //
    // The failure this replaces: all the relief was real, and 21 units away.
    {
        const pmap = new Map();
        const placed = terraceRoom(pmap, SCREEN, 'r2c2', 0x808080,
            (x, z) => Math.hypot(x, z) < 3);   // the spawn keepout, as bakeRoom passes
        t.ok('a screen gets relief', placed > 0, `${placed} cells`);

        const cells = massCells(pmap);
        let inFrame = 0, frameCells = 0;
        for (let x = -FRAME_HALF_X; x <= FRAME_HALF_X; x++) {
            for (let z = -FRAME_HALF_Z; z <= FRAME_HALF_Z; z++) {
                frameCells++;
                if (cells.has(`${x},${z}`)) inFrame++;
            }
        }
        t.ok('and it is inside the frame the player arrives looking at',
            inFrame > 0, `${inFrame} of ${frameCells} frame cells`);
        // A real amount, not one cell in a corner. Below ~8% it reads as flat.
        t.ok('…enough of it to change what the frame looks like',
            inFrame / frameCells > 0.08,
            `${(100 * inFrame / frameCells).toFixed(1)}% of the frame has relief`);
        // …and not so much that the screen is a staircase.
        t.ok('…without paving the whole thing',
            inFrame / frameCells < 0.75,
            `${(100 * inFrame / frameCells).toFixed(1)}%`);

        const small = new Map();
        terraceRoom(small, { half: 10 }, 'r2c2', 0x808080, () => false);
        t.ok('a normal room still gets a shape', small.size > 0, `${small.size}`);
    }

    // ── 2b. ALL FORTY-NINE SCREENS, NOT ONE ────────────────────────────────
    //
    // THE ASSERTION THAT ACTUALLY CATCHES THE REGRESSION, and the one screen
    // above does not. `shapeFor` picks between three shapes by hashing the room
    // id, and only one of them — `rim` — puts everything at the room's edge. So
    // a single screen sampled at random has a two-in-three chance of looking
    // fine under the old code, and the counterfactual sweep duly removed the
    // whole large-room path and stayed green.
    //
    // Measured across all forty-nine:
    //
    //     path            min in-frame   median   screens under 8%
    //     one shape           0.0%        16.1%        17 of 49
    //     frame-scale         5.1%        22.3%         4 of 49
    //
    // A third of the overworld had NOTHING on screen. That is the bug, and it
    // is only visible when every screen is asked.
    {
        const ids = [];
        for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) ids.push(`r${r}c${c}`);

        const fracs = ids.map((id) => {
            const pmap = new Map();
            terraceRoom(pmap, SCREEN, id, 0x808080, (x, z) => Math.hypot(x, z) < 3);
            const cells = massCells(pmap);
            let n = 0, tot = 0;
            for (let x = -FRAME_HALF_X; x <= FRAME_HALF_X; x++) {
                for (let z = -FRAME_HALF_Z; z <= FRAME_HALF_Z; z++) {
                    tot++;
                    if (cells.has(`${x},${z}`)) n++;
                }
            }
            return n / tot;
        });
        const bare = fracs.filter((f) => f === 0).length;
        const thin = fracs.filter((f) => f < 0.08).length;
        t.ok('no screen arrives with a completely empty frame',
            bare === 0, `${bare} of ${ids.length} screens have zero relief in shot`);
        t.ok('…and only a handful are even thin',
            thin <= 6, `${thin} of ${ids.length} screens under 8%`);
        const median = [...fracs].sort((a, b) => a - b)[Math.floor(fracs.length / 2)];
        t.ok('the typical screen has real relief in shot',
            median > 0.18, `median ${(100 * median).toFixed(1)}%`);
    }

    // ── 2c. THE FLAT GAPS ARE PART OF IT ───────────────────────────────────
    //
    // A quarter of the lattice cells are skipped on purpose. Relief everywhere
    // is its own kind of uniform, and the gaps are where a fight has room to
    // happen. Measured screen-wide the skip is the difference between a median
    // of 15.7% covered and 21.7%, so the bound is set between them: this fails
    // if the skip is dropped, and it is not satisfied by the skip merely
    // existing.
    {
        const covers = [];
        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                const pmap = new Map();
                terraceRoom(pmap, SCREEN, `r${r}c${c}`, 0x808080, () => false);
                const cells = massCells(pmap);
                const span = 2 * (SCREEN.half - 1) + 1;
                covers.push(cells.size / (span * span));
            }
        }
        const worst = Math.max(...covers);
        t.ok('most of every screen is still flat ground to fight on',
            worst < 0.24, `worst screen is ${(100 * worst).toFixed(1)}% raised`);
    }

    // ── 3. DETERMINISM AND VARIETY ─────────────────────────────────────────
    {
        const a = new Map(); terraceRoom(a, SCREEN, 'r2c2', 0x808080, () => false);
        const b = new Map(); terraceRoom(b, SCREEN, 'r2c2', 0x808080, () => false);
        let same = a.size === b.size;
        for (const k of a.keys()) if (!b.has(k)) same = false;
        t.ok('the same screen terraces identically twice', same, 'no Math.random');

        const c = new Map(); terraceRoom(c, SCREEN, 'r3c5', 0x808080, () => false);
        let differs = 0;
        for (const k of a.keys()) if (!c.has(k)) differs++;
        t.ok('a different screen terraces differently', differs > 0,
            'otherwise all forty-nine screens are one screen');

        // Neighbours especially — a 7x7 grid of identical relief is worse than
        // none, because it tells the player the world is generated.
        const d = new Map(); terraceRoom(d, SCREEN, 'r2c3', 0x808080, () => false);
        let neighbourDiff = 0;
        for (const k of a.keys()) if (!d.has(k)) neighbourDiff++;
        t.ok('…including its immediate neighbour', neighbourDiff > 0);
    }

    // ── 4. THE RULE THAT MAKES THIS SAFE ───────────────────────────────────
    //
    // Terraces go in the PLATFORM map, meshed without XZ solids, so they are
    // standable and never blocking — no arrangement can make anywhere
    // unreachable. That holds only while the steps stay climbable.
    {
        const pmap = new Map();
        terraceRoom(pmap, SCREEN, 'r4c1', 0x808080, () => false);

        let tallest = 0;
        for (const k of pmap.keys()) tallest = Math.max(tallest, +k.split(',')[1]);
        t.ok('nothing rises more than two cells', tallest <= 2, `tallest ${tallest}`);

        // Every raised column must be reachable from a neighbour one step down
        // — a 2-high cell with only 0-high neighbours is a plinth, not a step.
        const bad = [];
        for (const key of massCells(pmap)) {
            const [xs, zs] = key.split(',');
            const x = +xs, z = +zs;
            const top = topAt(pmap, x, z);
            if (top < 2) continue;
            const climbable = [[1, 0], [-1, 0], [0, 1], [0, -1]]
                .some(([dx, dz]) => topAt(pmap, x + dx, z + dz) >= top - 1);
            if (!climbable) bad.push(key);
        }
        t.ok('every two-cell rise is reachable one step at a time',
            bad.length === 0, `${bad.length} plinths: ${bad.slice(0, 4).join(' ')}`);

        // And the keepout is obeyed cell by cell.
        //
        // THE KEEPOUT IS DERIVED FROM THE OUTPUT, not chosen. The first version
        // guarded a fixed box at the room's centre, that box happened to contain
        // none of this screen's rises, and the assertion that the guard removed
        // anything compared 335 against 335. A keepout that guards empty floor
        // proves nothing about a keepout.
        const anchor = [...massCells(pmap)][0].split(',').map(Number);
        const blocked = (x, z) => Math.abs(x - anchor[0]) <= 2 && Math.abs(z - anchor[1]) <= 2;
        const guarded = new Map();
        terraceRoom(guarded, SCREEN, 'r4c1', 0x808080, blocked);
        let violations = 0;
        for (const key of massCells(guarded)) {
            const [xs, zs] = key.split(',');
            if (blocked(+xs, +zs)) violations++;
        }
        t.ok('a blocked cell is never terraced', violations === 0, `${violations}`);
        // …and the guard has to have been doing something.
        t.ok('…and that keepout removed real cells',
            massCells(guarded).size < massCells(pmap).size,
            `${massCells(guarded).size} vs ${massCells(pmap).size} `
            + `around (${anchor[0]},${anchor[1]})`);
    }

    // ── 5. THE WEATHERING REACHES THE ROOM ─────────────────────────────────
    //
    // The overworld builds its rooms field by field rather than spreading the
    // screen, so anything not named in that object is dropped silently — which
    // is exactly how the first attempt at this landed with no effect and no
    // error anywhere.
    {
        const ow = read('src/game/overworld/overworld.js');
        t.ok('the screen-to-room mapping carries the weathering name',
            /^ {12}weathering: s\.weathering,$/m.test(ow));
        const w7 = read('src/game/overworld/world7.js');
        t.ok('…and every generated screen sets one',
            /weathering: `ow:\$\{region\}`/.test(w7));
        t.ok('…including the hand-authored gate screens',
            (w7.match(/weathering: `ow:\$\{region\}`/g) || []).length >= 2,
            `${(w7.match(/weathering: `ow:\$\{region\}`/g) || []).length} sites`);

        const decals = read('src/game/world/room-decals.js');
        t.ok('a room may name its own weathering, not only its kit',
            /const name = room\?\.weathering \|\| kit\?\.name;/.test(decals));
        t.ok('…and the seed follows the name rather than the kit',
            /seedOf\(`\$\{name\}:\$\{roomId\}`\)/.test(decals));

        for (const region of Object.keys(REGIONS)) {
            const spec = WEATHERING[`ow:${region}`];
            t.ok(`${region} has ground weathering`, !!spec);
            if (spec) {
                t.ok(`…${region} covers floor and the low masses on it`,
                    spec.where === 'both', spec.where);
            }
        }
    }
}
