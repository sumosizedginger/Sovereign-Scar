// tests/game/wall-profile.spec.mjs — a room's four walls do four different jobs.
//
// WHAT THIS PINS
//
// The camera is fixed-yaw. `camera-rig.js` never rotates about Y and `index.js`
// puts the lens at `look + (0, 17.5, +6.125)`, so the S wall of every room in
// the game is permanently between the lens and the hero and the N wall is
// permanently the one you look at. Every room built them the same height.
//
// Measured before the change, with `tests/qa/hero-occlusion.mjs`: **1826 of
// 23015 standable cells in the campaign — 7.9% — put something between the lens
// and the hero's head.** Nobody had ever counted it, because nothing in the
// suite renders a room and asks what can be seen from where the player stands.
//
// So the profile is not decoration. Raking the walls — tall at the back, low at
// the lip you look over, the sides ramping between — is a composition change
// that happens to delete most of a visibility defect, and both halves of that
// need holding down.
//
// THE ASSERTIONS RUN AGAINST THE BAKE, NOT THE TABLE. `wallProfile` returning
// the right numbers proves nothing: this project has shipped a data table that
// nothing consumed and stayed green for weeks. Sections 4-6 build all fourteen
// dungeons and read the voxel field and the collision world the game asks.

import * as THREE from 'three';
import {
    wallProfile, wallTopAt, trimBudgetAt, rakeRoom,
    NEAR_MAX, WALL_MIN, FAR_MAX, DEFAULT_WALL_H,
} from '../../src/game/world/wall-profile.js';
import { createDungeon, ROOM_STRIDE } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { KITS } from '../../src/game/levels/dungeon-kits.js';
import { BEAT_LIST } from './_beat-defs.mjs';

const CAM_HEIGHT = 17.5;              // index.js CAM_HEIGHT
const CAM_BACK = CAM_HEIGHT * 0.35;   // index.js — a 70.7 degree pitch
const ROOT_Y = 1.95;                  // the rig root, at chest height
const HEAD_UP = 0.95;                 // head above the root

/**
 * The occluded fraction measured on the day the rake landed was 0.83%. The
 * ratchet sits at 2%: loose enough that re-dressing a room does not trip it,
 * tight enough that reverting the rake (7.9%) or raising a near wall does.
 */
const OCCLUSION_MAX = 0.02;

function keyStoreStub() {
    const open = new Set();
    return {
        isOpen: (id) => open.has(id), open: (id) => open.add(id),
        mapPickup: () => false, takeMapPickup() {},
        isPickupTaken: () => false, takePickup() {},
        visited: () => [], visit() {},
    };
}

const built = [];
for (const def of BEAT_LIST) {
    const cw = new CollisionWorld();
    try {
        const level = createDungeon(
            { scene: new THREE.Scene(), collisionWorld: cw, particles: null },
            { ...def, prebake: true }, { keyStore: keyStoreStub() },
        );
        built.push({ def, level, cw });
    } catch (e) {
        built.push({ def, err: e.message });
    }
}

/** Top occupied cell of the column at world (wx, wz), or -1 if empty. */
function columnTop(level, wx, wz) {
    let top = -1;
    for (let y = 0; y <= 20; y++) if (level.getVoxelAt(wx, y + 0.5, wz)) top = y;
    return top;
}

export function run(t) {
    // ── 1. A scalar wallH is untouched ─────────────────────────────────────
    //
    // The compatibility rule the whole change rests on. Every room that did not
    // opt in has to bake identically, or landing this under fourteen luminance
    // gates and 5600 assertions at once would have been a gamble rather than a
    // refactor. Verified independently by hashing every mesh in every dungeon
    // against the same tree before the rake was authored; this keeps it true.
    {
        const flat = wallProfile({ wallH: 5 });
        t.ok('a scalar wallH is flat', flat.far === 5 && flat.near === 5);
        t.ok('…and is not marked raked', flat.raked === false);
        t.ok('…and its ramp is constant',
            [-9, -4, 0, 4, 9].every((z) => wallTopAt(flat, z, 9) === 5));
        t.ok('…and it keeps full trim everywhere',
            [-9, 0, 9].every((z) => trimBudgetAt(flat, z, 9) === 1));
        const none = wallProfile({});
        t.ok('a room with no wallH gets the historical default',
            none.far === DEFAULT_WALL_H && none.near === DEFAULT_WALL_H);
    }

    // ── 2. The ramp, and the two clamps that are not cosmetic ──────────────
    {
        const p = wallProfile({ wallH: { far: 10, near: 3 } });
        t.ok('a raked room is marked raked', p.raked === true);
        t.ok('the far wall is at the N end', wallTopAt(p, -9, 9) === 10);
        t.ok('the near wall is at the S end', wallTopAt(p, 9, 9) === 3);

        let mono = true;
        let prev = Infinity;
        for (let z = -9; z <= 9; z++) {
            const h = wallTopAt(p, z, 9);
            if (h > prev) mono = false;
            prev = h;
        }
        t.ok('and it descends the whole way, never rising', mono);

        // WALL_MIN is a COLLISION rule, not a composition one. `meshAndCollide`
        // promotes a column to a solid only at maxY >= 2, so a 1-high perimeter
        // is scenery the body walks through and off the world.
        //
        // THE NUMBER IS WRITTEN OUT HERE ON PURPOSE. The first draft asserted
        // `sunk.near >= WALL_MIN`, which is the constant compared against
        // itself: dropping WALL_MIN to 1 moved both sides of the comparison and
        // the counterfactual stayed green. `2` below is `meshAndCollide`'s rule,
        // not this module's opinion of it, and the two are allowed to disagree
        // — which is the whole point of checking.
        const SOLID_AT = 2;   // level-builder.js: `if (c.maxY < 2) continue`
        const sunk = wallProfile({ wallH: { far: 8, near: 1 } });
        t.ok('a near wall cannot be clamped below the collision floor',
            sunk.near >= SOLID_AT, `near=${sunk.near}, meshAndCollide walls at >=${SOLID_AT}`);
        t.ok('…nor can any course along the ramp',
            [-9, -4, 0, 4, 9].every((z) => wallTopAt(sunk, z, 9) >= SOLID_AT));
        t.ok('and the module agrees with the collision rule it is protecting',
            WALL_MIN >= SOLID_AT, `WALL_MIN=${WALL_MIN} SOLID_AT=${SOLID_AT}`);

        // NEAR_MAX is a SIGHT-LINE rule, measured rather than chosen.
        const greedy = wallProfile({ wallH: { far: 20, near: 9 } });
        t.ok('a near wall cannot exceed the measured sight-line cap',
            greedy.near === NEAR_MAX, `near=${greedy.near} cap=${NEAR_MAX}`);
        t.ok('and a far wall is capped too', greedy.far === FAR_MAX);

        t.ok('trim is full at the far wall', trimBudgetAt(p, -9, 9) === 1);
        t.ok('trim is gone at the near wall', trimBudgetAt(p, 9, 9) === 0);
    }

    // ── 3. `rakeRoom` does not write to the level definition ───────────────
    //
    // `def.rooms` is a module-level constant shared by every load of a level.
    // Resolving a height INTO it would make the second visit to a dungeon build
    // a different room from the first — a bug that only appears after a death.
    {
        const room = { half: 8, wallH: 4, doors: [] };
        const before = JSON.stringify(room);
        const out = rakeRoom(room, { wallRise: 5 });
        t.ok('rakeRoom leaves the definition alone', JSON.stringify(room) === before);
        t.ok('…and returns a different object', out !== room);
        t.ok('…carrying the rise on the far wall only',
            out.wallH.far === 9 && out.wallH.near === 4, JSON.stringify(out.wallH));
        t.ok('a room that authored its own profile keeps it',
            rakeRoom({ half: 8, wallH: { far: 6, near: 2 } }, { wallRise: 9 }).wallH.far === 6);
        t.ok('a dungeon with no rise is left flat',
            rakeRoom({ half: 8, wallH: 4 }, {}).wallH === 4);
    }

    // ── 4. Every dungeon declares a rise ───────────────────────────────────
    for (const [id, kit] of Object.entries(KITS)) {
        t.ok(`${kit.name} declares a wall rise`, Number.isFinite(kit.wallRise),
            `${id} wallRise=${kit.wallRise}`);
    }

    // ── 5. …and every room actually BAKES one ──────────────────────────────
    //
    // Sampled at a cell chosen to miss every door. A doorway has no wall at
    // all, and measuring one would report a rake that is really a hole.
    for (const { def, level, err } of built) {
        if (err) { t.ok(`${def.id} bakes`, false, err); continue; }
        let checked = 0, raked = 0, nearOver = 0, nearUnder = 0;
        for (const room of Object.values(def.rooms)) {
            const half = room.half;
            const ox = (room.grid?.[0] || 0) * ROOM_STRIDE;
            const oz = (room.grid?.[1] || 0) * ROOM_STRIDE;
            const doorX = new Set();
            for (const d of room.doors || []) {
                if (d.side === 'N' || d.side === 'S') {
                    for (let i = -3; i <= 3; i++) doorX.add(d.at + i);
                }
            }
            let x = null;
            for (let c = -half + 1; c <= half - 1; c++) if (!doorX.has(c)) { x = c; break; }
            if (x == null) continue;
            const farTop = columnTop(level, ox + x + 0.5, oz - half + 0.5);
            const nearTop = columnTop(level, ox + x + 0.5, oz + half + 0.5);
            if (farTop < 0 || nearTop < 0) continue;   // carved away by a build fn
            checked++;
            if (farTop > nearTop) raked++;
            if (nearTop > NEAR_MAX) nearOver++;
            if (nearTop < WALL_MIN) nearUnder++;
        }
        t.ok(`${def.id} has rooms to measure`, checked > 0, `${checked} rooms`);
        t.ok(`${def.id} bakes a taller far wall than near wall`,
            checked > 0 && raked === checked, `${raked} of ${checked} rooms raked`);
        t.ok(`${def.id} never bakes a near wall above the sight-line cap`,
            nearOver === 0, `${nearOver} rooms over ${NEAR_MAX}`);
        t.ok(`${def.id} never bakes a near wall the body walks through`,
            nearUnder === 0, `${nearUnder} rooms under ${WALL_MIN}`);
    }

    // ── 5b. …and the far wall still carries its trim ───────────────────────
    //
    // The budget removes trim from the near half deliberately. NOTHING checked
    // that the far half kept any, and a counterfactual proved it: making the
    // trim read one height instead of the local wall silently deleted trim from
    // every side wall in the game — the cap voxel it looks for is simply not
    // there at the wrong height, so it skipped the cell — and 106 assertions
    // stayed green. Trim is the only thing breaking the top edge of a wall, and
    // a room whose walls end in a perfectly straight line is the box this whole
    // ticket exists to stop building.
    for (const { def, level, err } of built) {
        if (err) continue;
        let withTrim = 0, perim = 0;
        for (const room of Object.values(def.rooms)) {
            const half = room.half;
            const ox = (room.grid?.[0] || 0) * ROOM_STRIDE;
            const oz = (room.grid?.[1] || 0) * ROOM_STRIDE;
            const prof = wallProfile(rakeRoom(room, KITS[def.id]));
            // Walk the far half of the ring only — the near half is meant to be
            // bare, so counting it would let a bare far wall hide in the average.
            for (let lz = -half; lz <= 0; lz++) {
                for (const lx of [-half, half]) {
                    const wx = ox + lx + 0.5, wz = oz + lz + 0.5;
                    const wall = wallTopAt(prof, lz, half);
                    if (!level.getVoxelAt(wx, wall + 0.5, wz)) continue;   // door gap
                    perim++;
                    if (level.getVoxelAt(wx, wall + 1.5, wz)) withTrim++;
                }
            }
        }
        const rate = perim ? withTrim / perim : 0;
        t.ok(`${def.id} still breaks its far wall's top edge`,
            perim > 0 && rate > 0.15,
            `${withTrim}/${perim} far-half wall cells carry trim (${(100 * rate).toFixed(0)}%)`);
    }

    // ── 6. The near wall still WALLS ───────────────────────────────────────
    //
    // The point of the change is a lower south wall, and the failure mode of a
    // lower south wall is a room the player can leave sideways. Asked of the
    // COLLISION WORLD, not of the voxel field: "is there something here" and
    // "may my body be here" are different questions, and only the second one
    // keeps anybody in the room.
    for (const { def, level, cw, err } of built) {
        if (err) continue;
        const room = def.rooms[def.start];
        const half = room.half;
        const ox = (room.grid?.[0] || 0) * ROOM_STRIDE;
        const oz = (room.grid?.[1] || 0) * ROOM_STRIDE;
        const doorCell = new Set();
        for (const d of room.doors || []) {
            if (d.side === 'S') for (let i = -3; i <= 3; i++) doorCell.add(d.at + i);
        }
        let leaks = 0, tested = 0;
        for (let x = -half; x <= half; x++) {
            if (doorCell.has(x)) continue;
            const wx = ox + x + 0.5;
            const wz = oz + half + 0.5;
            if (!level.getVoxelAt(wx, 1.5, wz)) continue;  // gap a build fn cut
            tested++;
            // `blocked` is the query the body itself uses when it moves.
            if (!cw.blocked(wx, wz, 0.4)) leaks++;
        }
        t.ok(`${def.id} start room's near wall is solid to a body`,
            tested > 0 && leaks === 0, `${leaks} leaks of ${tested} cells`);
    }

    // ── 7. The campaign-wide sight line ────────────────────────────────────
    //
    // The behaviour, measured the way `tests/qa/hero-occlusion.mjs` measures it.
    // Everything above can be true while a room full of interior scenery still
    // buries the hero, so the last assertion is the one a player would make:
    // stand anywhere you can stand, and be visible.
    {
        let cells = 0, hidden = 0;
        const STEP = 0.18;
        for (const { def, level, err } of built) {
            if (err) continue;
            for (const room of Object.values(def.rooms)) {
                const half = room.half;
                const ox = (room.grid?.[0] || 0) * ROOM_STRIDE;
                const oz = (room.grid?.[1] || 0) * ROOM_STRIDE;
                for (let lx = -half + 1; lx <= half - 1; lx++) {
                    for (let lz = -half + 1; lz <= half - 1; lz++) {
                        const wx = ox + lx + 0.5, wz = oz + lz + 0.5;
                        if (!level.getVoxelAt(wx, 0.5, wz)) continue;
                        if (level.getVoxelAt(wx, 1.5, wz)) continue;
                        if (level.getVoxelAt(wx, 2.5, wz)) continue;
                        cells++;
                        const hy = ROOT_Y + HEAD_UP;
                        const dy = (ROOT_Y + CAM_HEIGHT) - hy;
                        const len = Math.hypot(dy, CAM_BACK);
                        for (let s = STEP; s < len; s += STEP) {
                            const f = s / len;
                            if (level.getVoxelAt(wx, hy + dy * f, wz + CAM_BACK * f)) {
                                hidden++;
                                break;
                            }
                        }
                    }
                }
            }
        }
        const frac = cells ? hidden / cells : 1;
        t.ok('the census actually walked the campaign', cells > 20000, `${cells} cells`);
        t.ok('the hero is visible from almost everywhere they can stand',
            frac <= OCCLUSION_MAX,
            `${hidden}/${cells} = ${(100 * frac).toFixed(2)}% hidden, ceiling ${(100 * OCCLUSION_MAX).toFixed(0)}%`);
    }

    for (const b of built) b.level?.dispose?.();
}
