// tests/game/dash-commit.spec.mjs — a dash goes where it was aimed, at its speed.
//
// THE REPORT
//
// "The dash, even after picking up the dash boots, is only like 1 square and
// does not hit an enemy at all, but there is a swing animation."
//
// Three separate defects behind one sentence.
//
// 1. THE SPEED WAS DISCARDED. `tryDash` handed `PHASE_BOOT.dashSpeed` (18) to
//    `physics.applyImpulse`, and `VoxelPhysicsBody.update` hard-assigns
//    `this.vx = wx * speed` on the very next tick whenever there is movement
//    input — which there always is during a dash. The impulse never survived a
//    single frame. `dashSpeed` existed in exactly two places: where it was
//    defined and where it was thrown away. What shipped was a flat 14 written
//    inline in `update()`.
//
// 2. THE DASH WAS STEERED BY LIVE INPUT — AND THIS IS THE BIG ONE. The wish
//    vector came from `input.moveVector()` for the whole dash, so a player who
//    TAPPED dash and released the stick supplied zero movement, the body fell
//    to ground friction, and the dash covered almost nothing. Measured, this
//    is worth more than the speed fix.
//
//    It is the same defect the grapple was reported for in the same session:
//    "I should be able to grapple and land on the ledge, not fall into darkness
//    if I'm not pushing forward." A committed traversal verb that quietly
//    requires you to keep holding forward does nothing on the one input every
//    player actually uses.
//
// 3. IT DREW A SWING IT COULD NOT DELIVER. `arcSmear.spawn` was called with no
//    `arc`, falling to `ARC_ANGLE = PI * 0.61` — a 110-degree fan, the same
//    shape a sword swing draws, at radius 2, connected to no hitbox at all. The
//    plain dash has no damage by design; the animation was the lie. It is now a
//    narrow streak, which reads as movement.
//
// WHAT THIS SPEC WILL NOT ASSERT: that a dash deals damage. It does not, by
// design, and `DASH_ATTACK` — the lunge that does — remains deliberately
// dormant. See CHANGELOG.

import fs from 'fs';
import { PHASE_BOOT } from '../../src/game/combat/weapons.js';
import { VoxelPhysicsBody } from '../../src/game/physics/voxel-physics-body.js';
import { CollisionWorld } from '../../src/engine/collision.js';

const DT = 1 / 60;
const WALK = 5.5;
const FLOOR = (x, y) => y >= 0 && y < 1;

/**
 * Slide a body forward for `dur` seconds and report distance covered.
 * `wish` is what the player is holding — the whole point of case 2 is that
 * this may be zero while a dash is in flight.
 */
function slide(speed, dur, wish = { x: 1, z: 0 }) {
    const cw = new CollisionWorld();
    const position = { x: 0, y: 1.9, z: 0 };
    const body = new VoxelPhysicsBody(position, { x: 0.4, y: 0.9, z: 0.4 }, FLOOR);
    body.grounded = true;
    for (let i = 0; i < Math.round(dur / DT); i++) {
        body.update(cw, DT, { wishX: wish.x, wishZ: wish.z, speed, half: 0.4 });
    }
    return position.x;
}

export function run(t) {
    // ── 1. THE WEAPON TABLE STILL DECLARES A DASH SPEED ────────────────────
    {
        t.ok('PHASE_BOOT declares a dash speed', typeof PHASE_BOOT.dashSpeed === 'number');
        t.ok('…and a separate speed for the bare dash',
            typeof PHASE_BOOT.hopSpeed === 'number',
            'the boot must be an upgrade, not just a longer duration');
        t.ok('the boot is genuinely faster than the bare dash',
            PHASE_BOOT.dashSpeed > PHASE_BOOT.hopSpeed,
            `${PHASE_BOOT.dashSpeed} vs ${PHASE_BOOT.hopSpeed}`);
    }

    // ── 2. THE SPEED REACHES THE BODY ──────────────────────────────────────
    // A dash at `dashSpeed` must cover more ground than the flat 14 that
    // shipped, and must beat walking by enough to be a gap-closer rather than
    // a hop with a sound effect.
    {
        const dur = PHASE_BOOT.dashDuration;
        const dashed = slide(PHASE_BOOT.dashSpeed, dur);
        const shipped = slide(14, dur);
        const walked = slide(WALK, dur);

        t.ok('a dash at dashSpeed outruns the flat 14 that shipped',
            dashed > shipped + 0.3,
            `${dashed.toFixed(2)} vs ${shipped.toFixed(2)}`);
        t.ok('…and beats walking by more than a cell',
            dashed - walked > 1.2,
            `net gain ${(dashed - walked).toFixed(2)} units — shipped was `
            + `${(shipped - walked).toFixed(2)}, and the report was "about one square"`);
    }

    // ── 3. THE REPORTED CASE: LET GO OF THE STICK ──────────────────────────
    // This is the assertion that matters. With no movement input the body
    // covers essentially nothing, which is exactly what a tapped dash used to
    // do. It pins WHY the committed heading is necessary.
    {
        const dur = PHASE_BOOT.dashDuration;
        const held = slide(PHASE_BOOT.dashSpeed, dur, { x: 1, z: 0 });
        const released = slide(PHASE_BOOT.dashSpeed, dur, { x: 0, z: 0 });
        t.ok('a body with no movement input goes essentially nowhere',
            released < 0.1,
            `${released.toFixed(3)} units — this is what a tapped dash was doing`);
        t.ok('…which is why the dash must supply its own heading',
            held > released + 2,
            `held ${held.toFixed(2)} vs released ${released.toFixed(2)}`);
    }

    // ── 4. THE WIRING, READ FROM THE SHIPPED SOURCE ────────────────────────
    // Everything above is arithmetic on a physics body and would stay green if
    // `player.js` went back to reading live input, or back to throwing the
    // speed at `applyImpulse`. These read the actual file.
    {
        const src = new URL('../../src/game/player.js', import.meta.url);
        const text = fs.readFileSync(src, 'utf8');

        t.ok('tryDash captures a committed heading',
            /_dashDir\s*=\s*\{\s*x:\s*fv\.x/.test(text),
            'the dash must remember where it was aimed');
        t.ok('…and the movement vector prefers it over live input while dashing',
            /dashTimer\s*>\s*0\s*&&\s*this\._dashDir/.test(text),
            'otherwise releasing the stick still kills the dash');
        t.ok('the dash speed reaches the body through `speed`, not a dead impulse',
            /dashTimer\s*>\s*0\s*\?\s*\(this\._dashSpeed/.test(text),
            'the physics body overwrites vx every tick there is input');
        t.ok('the dead applyImpulse is gone',
            !/applyImpulse\(fv\.x \* power/.test(text),
            'it was overwritten before it moved the player a single frame');

        // The phantom swing.
        const dashBlock = text.slice(text.indexOf('tryDash()'), text.indexOf('update(dt, input'));
        t.ok('the dash smear declares a narrow arc',
            /arc:\s*0?\.\d+/.test(dashBlock),
            'with no `arc` it falls to the 110deg sword fan and promises an attack');
    }
}
