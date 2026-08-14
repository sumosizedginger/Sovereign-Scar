// tests/game/wall-climb.spec.mjs — a wall with nothing to stand on yields nothing.
//
// THE BUG THIS EXISTS TO PIN
//
// `_surfaceTopInRange` returned the top of ANY solid cell in its search range,
// with no test of what sat above that top. Inside a solid column every cell has
// a top, so a sheer wall offered the body a fresh legal "step" every frame, one
// cell higher than the last. `_tryStepUp` runs once per FRAME rather than per
// substep, so it compounded:
//
//     before   feet 1.00 -> 8.00 in seven frames (~60 units/second, straight up)
//     after    feet 1.00, held, for four solid seconds of walking into it
//
// The owner reported it as "the character climbs up the walls, and if you climb
// too high you fall and take damage".
//
// THE FALL DAMAGE WAS NEVER THE BUG. That arithmetic is honest — it was
// correctly billing a fall that should have been impossible. This spec asserts
// nothing about damage on purpose: fix the climb and the fall stops existing.
//
// WHY IT SHIPPED, AND WHY THAT MATTERS MORE THAN THE FIX
//
// Two guards should have caught this and both were looking elsewhere.
//
//   1. `voxel-physics.spec.mjs` has a walk-into-a-wall case, but the wall is
//      registered ONLY in `CollisionWorld` and never in `getVoxelAt` — and
//      `_tryStepUp` reads voxels, not solids. So the step-up code was never
//      once asked about a wall. It then asserts X only, never Y, so even a body
//      that rocketed skyward would have passed.
//
//   2. The FIRST report of this exact symptom was diagnosed as a legibility
//      problem, and `traversal-legibility.spec.mjs` states that "the cause is
//      not that climbing is broken". That was wrong. Climbing was broken, and a
//      confident wrong conclusion in a comment kept it alive for a second
//      report.
//
// So the rule below is stated flatly and in world units, with no reference to
// any internal: A BODY MAY NOT GAIN MORE THAN `MAX_STEP_HEIGHT` AGAINST
// GEOMETRY THAT HAS NOTHING TO STAND ON. Nothing in this game intends a climb.

import { VoxelPhysicsBody } from '../../src/game/physics/voxel-physics-body.js';
import { CollisionWorld } from '../../src/engine/collision.js';

const DT = 1 / 60;
const FLOOR_TOP = 1;
const WALL_X = 2;
const EXT = { x: 0.4, y: 0.9, z: 0.4 };

/**
 * Walk a body at +X into whatever `voxelAt` describes, for `frames`, and report
 * the most height its feet ever gained.
 *
 * The obstacle is put in BOTH worlds — `CollisionWorld` so the horizontal move
 * is refused, and `getVoxelAt` so the step-up code can see it. Registering it
 * in only one is the hole that let this ship.
 */
function walkInto(voxelAt, frames = 240) {
    const cw = new CollisionWorld();
    cw.addSolid({ id: 'obstacle', minX: WALL_X, maxX: WALL_X + 20, minZ: -20, maxZ: 20 });
    const position = { x: WALL_X - 0.6, y: FLOOR_TOP + EXT.y, z: 0 };
    const body = new VoxelPhysicsBody(position, EXT, voxelAt);
    body.grounded = true;
    const startFeet = position.y - EXT.y;
    let peak = startFeet;
    for (let i = 0; i < frames; i++) {
        body.update(cw, DT, { wishX: 1, wishZ: 0, speed: 5.5, half: EXT.x });
        peak = Math.max(peak, position.y - EXT.y);
    }
    return { gained: peak - startFeet, body, position };
}

const floor = (y) => y < FLOOR_TOP && y >= 0;

/** A sheer wall, `height` cells of solid with no ledge anywhere in it. */
const sheerWall = (height) => (x, y, z) =>
    floor(y) || (x >= WALL_X && y >= FLOOR_TOP && y < FLOOR_TOP + height);

export function run(t) {
    // ── 1. THE REPORTED CASE ───────────────────────────────────────────────
    {
        const { gained } = walkInto(sheerWall(7));
        t.ok('walking into a sheer wall gains no height at all',
            gained <= 1.0001,
            `gained ${gained.toFixed(2)} units — MAX_STEP_HEIGHT is 1`);
        t.ok('…and specifically does not climb it',
            gained < 1.05,
            `gained ${gained.toFixed(2)} — seven cells was the shipped behaviour`);
    }

    // ── 2. THE HEIGHT DOES NOT MATTER, WHICH IS THE POINT ──────────────────
    // A guard that happened to work at one wall height and not another would be
    // a coincidence. Sweep several; a solid column is a solid column.
    for (const h of [2, 3, 5, 10, 20]) {
        const { gained } = walkInto(sheerWall(h), 180);
        t.ok(`a ${h}-cell wall still yields nothing`, gained < 1.05,
            `gained ${gained.toFixed(2)}`);
    }

    // ── 3. THE OTHER DIRECTION: STAIRS MUST STILL WORK ─────────────────────
    // `_tryStepUp` exists because "stairs read as low walls the player walked
    // into" — its own file header says so. A fix that stops the climb by
    // refusing every step has recreated the defect it was written to remove,
    // and would be strictly worse than the bug: unreachable rooms rather than
    // an exploit.
    {
        const { gained } = walkInto(sheerWall(1));
        t.ok('a one-cell step with sky above it is still climbed',
            Math.abs(gained - 1) < 0.05,
            `gained ${gained.toFixed(2)} — want exactly 1.00`);
    }

    // ── 4. A LEDGE PART-WAY UP IS NOT A LADDER ─────────────────────────────
    // The nastiest shape: a wall with a genuine standable shelf at one cell.
    // The shelf must be climbable and the wall above it must not be.
    {
        const shelfAt1 = (x, y, z) => {
            if (floor(y)) return true;
            if (x < WALL_X) return false;
            if (y >= FLOOR_TOP && y < FLOOR_TOP + 1) return true;        // the shelf
            if (y >= FLOOR_TOP + 2 && y < FLOOR_TOP + 8) return true;    // wall above, gap between
            return false;
        };
        const { gained } = walkInto(shelfAt1);
        t.ok('a shelf one cell up is reached, and the wall above it is not',
            gained >= 0.95 && gained < 2.05,
            `gained ${gained.toFixed(2)} — want ~1, and certainly not 7`);
    }

    // ── 5. THE GUARD ITSELF, AT THE UNIT ───────────────────────────────────
    // Assertions 1–4 all run through `update`, where a dozen things could mask
    // the result. Ask `_surfaceTopInRange` directly: inside a column there is
    // no surface, on top of one there is.
    {
        const body = new VoxelPhysicsBody(
            { x: 0, y: 2, z: 0 }, EXT, sheerWall(7));
        t.ok('no surface is reported inside a solid column',
            body._surfaceTopInRange(WALL_X + 0.5, 0, 0.95, 2.05) == null,
            'every cell in a wall has a top; none of them is somewhere to stand');

        const shallow = new VoxelPhysicsBody(
            { x: 0, y: 2, z: 0 }, EXT, sheerWall(1));
        t.ok('…but the top of a one-cell block is a surface',
            shallow._surfaceTopInRange(WALL_X + 0.5, 0, 0.95, 2.05) === FLOOR_TOP + 1,
            `got ${shallow._surfaceTopInRange(WALL_X + 0.5, 0, 0.95, 2.05)}`);
    }
}
