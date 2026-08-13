// tests/game/fall-anchor.spec.mjs — a fall is measured from where you left the
// ground, and from nowhere else.
//
// WHAT THIS GUARDS
//
// `VoxelPhysicsBody` bills a landing as `_fallStartY - landingY`. The only
// place that anchor was ever written was a check at the top of `update()`:
//
//     if (!this.grounded && this._wasGrounded) this._fallStartY = position.y;
//
// and the last line of `update()` is `this._wasGrounded = this.grounded`, with
// nothing in between frames touching `grounded`. So at the top of any frame the
// two are equal and that condition reads `!g && g` — false. It fired only when
// something OUTSIDE the class cleared `grounded` between frames, which is what
// `applyImpulse` and the blockers' teleports do.
//
// Walking off a ledge is not that. It clears `grounded` inside the substep
// loop, so the transition was consumed in the same frame and the anchor kept
// whatever it last held. Measured in the running game, an anchor set by a
// knockback on a step tower in 04 Sky Monument survived a full level change
// into 03 Duval Sink. From then on every ordinary one-cell step down was billed
// against a tower in another dungeon.
//
// The owner's report was "why am I losing health with a 1 square drop".
//
// THE SHAPE OF THE TEST
//
// Nothing here writes `_fallStartY` or `_wasGrounded`. That is the whole point:
// the shipped fall-damage assertion in `voxel-physics.spec.mjs` hand-installed
// both fields to the exact values the production path never produced, so it
// passed while the mechanism underneath it was dead. A test that sets up the
// state under test proves only that arithmetic works.

import { VoxelPhysicsBody, FALL_DAMAGE_THRESHOLD }
    from '../../src/game/physics/voxel-physics-body.js';
import { CollisionWorld } from '../../src/engine/collision.js';

/**
 * A plateau, a main floor, and a one-cell shelf, walked west to east:
 *
 *   x < -5        plateau,  surface top 10   (a 9-cell drop off its east face)
 *   -5 .. 20      floor,    surface top  1
 *   x > 20        shelf,    surface top  0   (an ordinary ONE CELL step down)
 */
const world = (x, y) => {
    if (x < -5) return y >= 0 && y < 10;
    if (x > 20) return y >= -1 && y < 0;
    return y >= 0 && y < 1;
};

/** Run `frames` of simulation, collecting every landing. `wishX` 0 = stand still. */
function walk(body, pos, frames, wishX = 1) {
    const cw = new CollisionWorld();
    const landings = [];
    for (let i = 0; i < frames; i++) {
        const r = body.update(cw, 1 / 60, {
            wishX, wishZ: 0, speed: 6, half: 0.4,
        });
        if (r.landed) {
            landings.push({
                x: +pos.x.toFixed(2),
                y: +pos.y.toFixed(2),
                fall: +r.fallDistance.toFixed(2),
                damage: +r.damage.toFixed(2),
            });
        }
    }
    return landings;
}

export function run(t) {
    const pos = { x: -8, y: 10.95, z: 0 };
    const body = new VoxelPhysicsBody(pos, { x: 0.4, y: 0.95, z: 0.4 }, world);
    body.grounded = true;

    // A knockback while up on the plateau. This is the real combat path —
    // `combat-sweeper.js` hits the player with applyImpulse(kx, 1.5, kz) — and
    // it is the one route that always DID set the anchor. It is here to make
    // the anchor high and legitimate, not as the thing under test.
    body.applyImpulse(0, 1.5, 0);
    walk(body, pos, 40, 0); // settle in place — walking here would leave the plateau
    t.ok('the knockback left the body up on the plateau',
        pos.y > 9 && pos.x < -5, `x=${pos.x.toFixed(2)} y=${pos.y.toFixed(2)}`);
    t.ok('and the knockback anchored the fall height up there',
        body._fallStartY > 9, `anchor=${body._fallStartY.toFixed(2)}`);

    // ── Leg 1: off the plateau. A genuine 9-cell fall, and it must hurt. ──
    // Stops short of the shelf at x=20, so leg 2 owns the one-cell step.
    const off = walk(body, pos, 180);
    t.ok('the body reached the main floor and stopped short of the shelf',
        pos.x > -4 && pos.x < 20 && pos.y > 1.5 && pos.y < 2.5,
        `x=${pos.x.toFixed(2)} y=${pos.y.toFixed(2)}`);
    const bigFall = off.find((l) => l.fall > 1);
    t.ok('a nine-cell drop registers as a real fall', !!bigFall && bigFall.fall > 8,
        JSON.stringify(off));
    t.ok('and a nine-cell drop costs health',
        !!bigFall && bigFall.damage > 0, JSON.stringify(bigFall));

    // ── Leg 2: THE REPORT. An ordinary one-cell step down, later, lower. ──
    // Without the fix the anchor is still up on the plateau and this bills the
    // player ~1.75 for stepping off a kerb.
    const startX = pos.x;
    const shelf = walk(body, pos, 200);
    t.ok('the body actually crossed the shelf edge during THIS leg',
        startX < 20 && pos.x > 20 && pos.y < 1.5,
        `startX=${startX.toFixed(2)} x=${pos.x.toFixed(2)} y=${pos.y.toFixed(2)}`);
    t.ok('the one-cell step registered as a landing at all',
        shelf.length > 0, `${shelf.length} landings`);

    const step = shelf[shelf.length - 1];
    t.ok('a one-cell step down is measured as one cell',
        step.fall < 1.6,
        `measured ${step.fall} cells for a 1-cell drop — anchor is stale`);
    t.ok('a one-cell step down costs nothing',
        step.damage === 0,
        `took ${step.damage} damage stepping down one cell (fall read as ${step.fall})`);

    // ── The anchor must not be a run-wide constant. ──────────────────────────
    // It survived a level change in the running game; here it must simply have
    // moved down with the body rather than staying up on the plateau.
    t.ok('the fall anchor followed the body down',
        body._fallStartY < 3,
        `anchor sits at ${body._fallStartY.toFixed(2)} while the body is at `
        + `${pos.y.toFixed(2)}`);

    // ── And the threshold is still the threshold. ────────────────────────────
    // A drop just under it is free; the plateau drop above cleared it. This
    // pins that the fix did not simply disable fall damage.
    t.ok('fall damage threshold unchanged', FALL_DAMAGE_THRESHOLD === 5,
        `threshold=${FALL_DAMAGE_THRESHOLD}`);
}
