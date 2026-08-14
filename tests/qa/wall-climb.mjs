// tests/qa/wall-climb.mjs — run at a sheer wall. How high do you get?
//
//   node tests/qa/wall-climb.mjs
//
// PRINT-ONLY. This is an instrument, not a gate.
//
// THE REPORT
//
// "So the character climbs up the walls, and if you climb too high you fall and
// take damage. That should not happen."
//
// This is the SECOND time that symptom has been reported. The first time it was
// diagnosed as a LEGIBILITY problem — `traversal-legibility.spec.mjs` says in so
// many words that "the cause is not that climbing is broken" — and that
// conclusion was wrong. Nothing in the game intends a climb mechanic: the only
// vertical assist is `_tryStepUp`, whose entire contract is ONE cell.
//
// So this measures the thing itself. Hold forward against a flat wall taller
// than the player and report the height gained per frame. A body that gains
// more than `MAX_STEP_HEIGHT` in total, against a wall with no ledges in it, is
// climbing.
//
// THE FALL DAMAGE IS NOT THE BUG and is deliberately reported alongside. The
// arithmetic that bills the player is honest — it is correctly charging for a
// fall they should never have been able to take. Fixing the damage would hide
// the climb; fixing the climb removes the fall. Anything this prints under
// `damage` is a consequence, not a cause.

import { VoxelPhysicsBody } from '../../src/game/physics/voxel-physics-body.js';
import { CollisionWorld } from '../../src/engine/collision.js';

const DT = 1 / 60;
const FLOOR_TOP = 1;        // floor occupies y in [0,1)
const WALL_X = 2;           // wall occupies x >= 2
const WALL_TOP = 8;         // …from the floor up to y = 8. Sheer, no ledges.

/** Floor everywhere; a solid wall east of WALL_X. Nothing else. */
const getVoxelAt = (x, y, z) => {
    if (y < FLOOR_TOP && y >= 0) return true;
    if (x >= WALL_X && y >= FLOOR_TOP && y < WALL_TOP) return true;
    return false;
};

/**
 * A one-cell step with open sky above it. This MUST still be climbed, or the
 * fix has traded a wall-climbing bug for every staircase in the game reading as
 * a wall — which is the exact defect `_tryStepUp` was written to remove
 * ("stairs read as low walls the player walked into", per the file header).
 */
const stepVoxelAt = (x, y, z) => {
    if (y < FLOOR_TOP && y >= 0) return true;
    if (x >= WALL_X && y >= FLOOR_TOP && y < FLOOR_TOP + 1) return true;
    return false;
};

function runStep(label) {
    const cw = new CollisionWorld();
    cw.addSolid({ id: 'step', minX: WALL_X, maxX: WALL_X + 20, minZ: -20, maxZ: 20 });
    const position = { x: WALL_X - 0.6, y: FLOOR_TOP + 0.9, z: 0 };
    const extents = { x: 0.4, y: 0.9, z: 0.4 };
    const body = new VoxelPhysicsBody(position, extents, stepVoxelAt);
    body.grounded = true;
    const startFeet = position.y - extents.y;
    let peakFeet = startFeet;
    for (let i = 0; i < 240; i++) {
        body.update(cw, DT, { wishX: 1, wishZ: 0, speed: 5.5, half: extents.x });
        peakFeet = Math.max(peakFeet, position.y - extents.y);
    }
    const gained = peakFeet - startFeet;
    console.log(`\n── ${label}`);
    console.log(`    HEIGHT GAINED: ${gained.toFixed(2)} units (want exactly 1.00)`);
    console.log(`    verdict: ${Math.abs(gained - 1) < 0.05
        ? 'stepped up, as designed'
        : '*** THE STEP-UP IS BROKEN — stairs are now walls ***'}`);
    return gained;
}

function run(label) {
    const cw = new CollisionWorld();
    // The wall exists in BOTH worlds, which is the point. The spec that let
    // this ship put it only in CollisionWorld and never in `getVoxelAt`, so
    // `_tryStepUp` — which reads voxels, not solids — was never once asked
    // about a wall.
    cw.addSolid({ id: 'wall', minX: WALL_X, maxX: WALL_X + 20, minZ: -20, maxZ: 20 });

    const position = { x: WALL_X - 0.6, y: FLOOR_TOP + 0.9, z: 0 };
    const extents = { x: 0.4, y: 0.9, z: 0.4 };
    const body = new VoxelPhysicsBody(position, extents, getVoxelAt);
    body.grounded = true;

    const startFeet = position.y - extents.y;
    let peakFeet = startFeet;
    let damage = 0;
    body.onFallDamage = (amount) => { damage += amount; };

    const trace = [];
    for (let i = 0; i < 240; i++) {
        body.update(cw, DT, { wishX: 1, wishZ: 0, speed: 5.5, half: extents.x });
        const feet = position.y - extents.y;
        if (feet > peakFeet) peakFeet = feet;
        if (i < 12 || i % 30 === 0) {
            trace.push(`    frame ${String(i).padStart(3)}  `
                + `feet ${feet.toFixed(2)}  x ${position.x.toFixed(2)}  `
                + `vy ${body.vy.toFixed(2)}  grounded ${body.grounded ? 'y' : 'n'}`);
        }
    }

    const gained = peakFeet - startFeet;
    console.log(`\n── ${label}`);
    console.log(trace.join('\n'));
    console.log(`    start feet ${startFeet.toFixed(2)}   peak feet ${peakFeet.toFixed(2)}`);
    console.log(`    HEIGHT GAINED: ${gained.toFixed(2)} units `
        + `(MAX_STEP_HEIGHT is 1 — anything above that is a climb)`);
    console.log(`    fall damage billed: ${damage.toFixed(2)} hearts`);
    console.log(`    verdict: ${gained > 1.05 ? '*** CLIMBING ***' : 'held at the wall'}`);
    return gained;
}

console.log('=== running at a sheer wall, holding forward ===');
console.log(`  wall at x >= ${WALL_X}, solid from y ${FLOOR_TOP} to ${WALL_TOP}, no ledges`);
console.log('  player starts on the floor with their nose against it');
run('holding forward into the wall for 4 seconds');
runStep('and the control: a one-cell step with sky above it');

console.log('\nA wall with nothing to stand on must yield NOTHING. One cell of');
console.log('give is the documented step-up; a body that keeps rising is');
console.log('finding a new "surface" inside the wall on every frame.\n');
