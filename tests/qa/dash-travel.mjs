// tests/qa/dash-travel.mjs — how far does a dash actually carry you?
//
//   node tests/qa/dash-travel.mjs
//
// PRINT-ONLY. This is an instrument, not a gate.
//
// THE REPORT: "The dash, even after picking up the dash boots, is only like 1
// square and does not hit an enemy at all, but there is a swing animation."
//
// WHAT MATTERS IS THE NET GAIN, NOT THE TRAVEL. A dash that moves you 2 units
// while walking would have moved you 1.5 in the same time is not a gap-closer,
// it is a 0.5-unit hop with a sound effect. So this walks the same body over
// the same window and subtracts. The number the player feels is the difference.
//
// `PHASE_BOOT.dashSpeed` was 18 and the player moved at 14, because the speed
// was delivered through `physics.applyImpulse` and `VoxelPhysicsBody.update`
// hard-assigns `vx = wx * speed` on the next tick while there is movement
// input — which there always is during a dash. The impulse never survived a
// single frame.

import { VoxelPhysicsBody } from '../../src/game/physics/voxel-physics-body.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { PHASE_BOOT } from '../../src/game/combat/weapons.js';

const DT = 1 / 60;
const WALK = 5.5;                 // src/game/player.js
const FLOOR = (x, y) => y >= 0 && y < 1;

/** Slide a body forward at `speed` for `dur` seconds; return distance covered. */
function travel(speed, dur) {
    const cw = new CollisionWorld();
    const position = { x: 0, y: 1.9, z: 0 };
    const body = new VoxelPhysicsBody(position, { x: 0.4, y: 0.9, z: 0.4 }, FLOOR);
    body.grounded = true;
    const frames = Math.round(dur / DT);
    for (let i = 0; i < frames; i++) {
        body.update(cw, DT, { wishX: 1, wishZ: 0, speed, half: 0.4 });
    }
    return position.x;
}

console.log('\n=== dash travel ===');
console.log(`  walk speed ${WALK}   dashSpeed ${PHASE_BOOT.dashSpeed}   `
    + `hopSpeed ${PHASE_BOOT.hopSpeed}   duration ${PHASE_BOOT.dashDuration}\n`);
console.log('  case                       speed   dur     travel   walking   NET GAIN');

for (const [label, speed, dur] of [
    ['with Phase Boot', PHASE_BOOT.dashSpeed, PHASE_BOOT.dashDuration],
    ['without the boot', PHASE_BOOT.hopSpeed, PHASE_BOOT.dashDuration * 0.6],
    ['SHIPPED (flat 14)', 14, PHASE_BOOT.dashDuration],
]) {
    const d = travel(speed, dur);
    const w = travel(WALK, dur);
    console.log(`  ${label.padEnd(24)}${String(speed).padStart(5)}`
        + `${dur.toFixed(3).padStart(7)}${d.toFixed(2).padStart(9)}`
        + `${w.toFixed(2).padStart(10)}${(d - w).toFixed(2).padStart(11)}`);
}

console.log('\n  A voxel cell is 1 unit. "About one square" was the report, and');
console.log('  the shipped net gain was 1.19 — the report was exact.\n');
