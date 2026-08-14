// tests/game/grapple-backsweep.spec.mjs — a grapple does not sweep backwards.
//
// THE BUG THIS EXISTS TO PIN
//
// `GrappleController.update` sweeps the pull in four substeps:
//
//     const t1 = Math.min(1, e - (steps - 1 - i) / steps);
//
// `e` is the eased progress and starts near zero, so on the FIRST FRAME of a
// pull this is `e - 0.75` for i = 0 — about −0.66. The swept target therefore
// came out two thirds of the pull distance BEHIND the player, in the opposite
// direction to the grapple. If anything solid is back there, `resolveMove`
// refuses to go, the "blocked" check sees a difference of more than 0.05, and
// the entire pull is cancelled before it has moved.
//
// So the grapple failed whenever the player had their back to a wall — anywhere
// in the game, not just at one gap.
//
// MEASURED in 04 Sky Monument's windworks. The far ledge is one metre of
// standable ground at z −70.5 with a full-height wall behind it at z −71:
//
//     before   start ok, target z −65.7 …then CANCELLED at z −70.6, moved 0.10
//     after    start ok, target z −65.7 …ARRIVED  at z −65.7, moved 4.80
//
// It also explains why only one direction was ever broken. Firing the other way
// the same backwards substep lands on open floor, resolves cleanly, and nothing
// noticed — which is why this survived a grapple fix earlier the same day.
//
// `cx`/`cz`, the sweep's starting point, already carried `Math.max(0, …)`. The
// loop was the half that missed it.
//
// BOTH DIRECTIONS. Clamping the sweep must not stop the grapple being blocked
// by something genuinely in the WAY — a pull that ignores walls is a worse bug
// than one that cancels too eagerly, because it puts the player inside geometry.

import { GrappleController } from '../../src/game/combat/grapple.js';
import { CollisionWorld } from '../../src/engine/collision.js';

/** Run a whole pull to completion and report how it ended. */
function pull(cw, from, to, opts = {}) {
    const g = new GrappleController();
    const started = g.start(from, to, 14, { stopShort: 0, ...opts });
    let last = null;
    let frames = 0;
    // 0.35s duration; 40 frames at 1/60 is comfortably past the end.
    for (let i = 0; i < 40 && (g.active || i === 0); i++) {
        last = g.update(1 / 60, cw, 0.4);
        frames++;
        if (last.cancelled || last.arrived) break;
    }
    return { started, last, frames };
}

export function run(t) {
    // ── 1. THE REPORTED CASE: a wall BEHIND, open ground ahead ─────────────
    // The windworks ledge, to scale: the player on a metre of floor at z −70.5
    // with the wall's south face at z −71, pulling south to z −65.7.
    {
        const cw = new CollisionWorld();
        cw.addSolid({ minX: -8, maxX: 8, minZ: -75, maxZ: -71 }); // the wall behind
        const r = pull(cw, { x: 0, y: 1.95, z: -70.5 }, { x: 0, y: 1.95, z: -65.7 });
        t.ok('the pull starts', r.started);
        t.ok('a wall BEHIND the player does not cancel the pull',
            !r.last.cancelled, `cancelled at z ${r.last.z?.toFixed?.(2)}`);
        t.ok('…and it arrives', !!r.last.arrived, JSON.stringify(r.last));
        t.ok('…at the far side', r.last.z > -66,
            `z ${r.last.z?.toFixed?.(2)} — must clear the chasm at −66`);
    }

    // ── 2. THE CONTROL: same pull, nothing behind ──────────────────────────
    // This is the direction that always worked, and it must keep working —
    // otherwise assertion 1 could pass because the sweep stopped colliding at
    // all.
    {
        const cw = new CollisionWorld();
        const r = pull(cw, { x: 0, y: 1.95, z: -65.5 }, { x: 0, y: 1.95, z: -70.3 });
        t.ok('with nothing behind, the pull still arrives', !!r.last.arrived,
            JSON.stringify(r.last));
        t.ok('…at the far side', r.last.z < -70, `z ${r.last.z?.toFixed?.(2)}`);
    }

    // ── 3. THE DIRECTION THAT MATTERS: a wall IN THE WAY still blocks ──────
    // A pull that ignores geometry is worse than one that cancels too eagerly,
    // because it sets the player down inside a solid.
    {
        const cw = new CollisionWorld();
        cw.addSolid({ minX: -8, maxX: 8, minZ: -68.5, maxZ: -67.5 }); // across the path
        const r = pull(cw, { x: 0, y: 1.95, z: -70.5 }, { x: 0, y: 1.95, z: -65.7 });
        t.ok('a wall ACROSS the path still cancels the pull',
            !!r.last.cancelled, JSON.stringify(r.last));
        t.ok('…and leaves the player short of it, not inside it',
            r.last.z < -68.5, `z ${r.last.z?.toFixed?.(2)} vs wall at −68.5`);
    }

    // ── 4. WALLS ON BOTH SIDES: behind is ignored, ahead is obeyed ─────────
    // The two rules have to hold at once, or one of them is just the other
    // one's side effect.
    {
        const cw = new CollisionWorld();
        cw.addSolid({ minX: -8, maxX: 8, minZ: -75, maxZ: -71 });
        cw.addSolid({ minX: -8, maxX: 8, minZ: -68.5, maxZ: -67.5 });
        const r = pull(cw, { x: 0, y: 1.95, z: -70.5 }, { x: 0, y: 1.95, z: -65.7 });
        t.ok('with walls both sides, the pull is blocked by the one ahead',
            !!r.last.cancelled, JSON.stringify(r.last));
        t.ok('…having actually set off first',
            r.last.z > -70.5 - 0.05, `z ${r.last.z?.toFixed?.(2)} — moved forward, not back`);
    }

    // ── 5. THE SUBSTEP ARITHMETIC ITSELF ───────────────────────────────────
    // Every assertion above depends on one clamp. Pin the arithmetic directly,
    // so a reader can see the −0.66 rather than infer it from a wall.
    {
        const steps = 4;
        const tAt = (e, i) => Math.min(1, Math.max(0, e - (steps - 1 - i) / steps));
        const unclamped = (e, i) => Math.min(1, e - (steps - 1 - i) / steps);
        const eFirst = 1 - (1 - (1 / 60) / 0.35) ** 2;  // the real first frame

        t.ok('the eased progress on the first frame is small', eFirst < 0.12,
            `e = ${eFirst.toFixed(3)}`);
        t.ok('unclamped, substep 0 of the first frame points BACKWARDS',
            unclamped(eFirst, 0) < -0.6, `t1 = ${unclamped(eFirst, 0).toFixed(3)}`);
        for (let i = 0; i < steps; i++) {
            t.ok(`clamped, substep ${i} never points backwards`,
                tAt(eFirst, i) >= 0, `t1 = ${tAt(eFirst, i).toFixed(3)}`);
        }
        // …and the clamp must not change the END of the pull, or the grapple
        // would stop short of where it aimed.
        t.ok('at full progress the last substep still reaches 1',
            tAt(1, steps - 1) === 1, `${tAt(1, steps - 1)}`);
    }
}
