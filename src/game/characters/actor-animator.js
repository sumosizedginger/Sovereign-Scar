// ActorAnimator (Ticket F): layered procedural pose evaluation driven by the
// GAMEPLAY clock — locomotion wish/speed, attack cooldown edges, enemy
// windup timers. It writes ONLY local rotations/positions on ActorRig
// pivots; the root (position + yaw) belongs to physics/AI, so hitboxes stay
// aligned through every state by construction.
//
// State priority (highest wins): DEAD > HURT > ATTACK > DASH > GRAPPLE >
// MOVE > IDLE. Steady-state allocates nothing: the pose object and every
// intermediate is preallocated at construction.

import {
    makePose, evalRest, evalLocomotion, evalCombat, evalDash, evalGrapple,
    evalGuard, evalHurt, evalDead, weaponProfile,
} from './pose-library.js';
import { archetypeFor } from './archetypes.js';

const TAU = Math.PI * 2;

export function createActorAnimator(rig, opts = {}) {
    const arch = typeof opts.archetype === 'string'
        ? archetypeFor(opts.archetype)
        : (opts.archetype || archetypeFor('hero'));

    const pose = makePose();
    let time = 0;
    let phi = 0;              // gait phase
    let moveW = 0;            // locomotion layer weight (smoothed)
    let speed01 = 0;
    let dashing = false;
    let dashT = 0;
    let dashDur = 0.42;
    let grappleActive = false;
    let guarding = false;
    let guardW = 0;           // guard layer weight (smoothed, so it raises)
    let hurtT = 0;            // remaining flinch time
    let dead = false;
    let deadW = 0;

    // Combat phase machine: null | {phase, t, dur, prof}
    const combat = { phase: null, t: 0, dur: 0, prof: weaponProfile('anchor_link') };
    let recoverDur = 0.3;

    const input = { speed: 0, wishX: 0, wishZ: 0, grounded: true };

    function startWindup(duration, weaponId) {
        combat.phase = 'windup';
        combat.t = 0;
        combat.dur = Math.max(0.05, duration || 0.45);
        combat.prof = weaponProfile(weaponId);
    }

    function strike(duration = 0.12, recover = 0.35) {
        combat.phase = 'strike';
        combat.t = 0;
        combat.dur = Math.max(0.04, duration);
        recoverDur = Math.max(0.08, recover);
    }

    /** Hero attacks have no long telegraph: short snap windup, then strike. */
    function attack(weaponId, { windup = 0.07, strikeDur = 0.12, recover = 0.3 } = {}) {
        startWindup(windup, weaponId);
        recoverDur = recover;
        combat._autoStrike = { strikeDur };
    }

    function update(dt) {
        time += dt;

        // ── layer clocks ──
        const moving = input.grounded !== false
            && Math.hypot(input.wishX, input.wishZ) > 0.15 && !dead;
        const targetW = moving ? 1 : 0;
        moveW += (targetW - moveW) * Math.min(1, dt * 10);
        speed01 += ((moving ? Math.min(1, input.speed / 7) : 0) - speed01) * Math.min(1, dt * 8);
        const freq = arch.gaitFreqMin + (arch.gaitFreqMax - arch.gaitFreqMin) * speed01;
        if (moveW > 0.01 && !dashing) phi += TAU * freq * dt;

        if (dashing) dashT += dt;
        // ~0.12s to raise or drop. Instant would read as a pop, and the parry
        // window is 0.18s — the shield has to be visibly moving inside it.
        guardW += ((guarding && !dead ? 1 : 0) - guardW) * Math.min(1, dt * 8);
        if (hurtT > 0) hurtT -= dt;
        deadW += ((dead ? 1 : 0) - deadW) * Math.min(1, dt * 6);

        if (combat.phase) {
            combat.t += dt;
            if (combat.t >= combat.dur) {
                if (combat.phase === 'windup' && combat._autoStrike) {
                    const a = combat._autoStrike;
                    combat._autoStrike = null;
                    strike(a.strikeDur, recoverDur);
                } else if (combat.phase === 'windup') {
                    // Enemy windups resolve externally (strike()); if the
                    // resolve never lands (death interrupted it), fall home.
                    combat.phase = 'recover';
                    combat.t = 0;
                    combat.dur = recoverDur;
                } else if (combat.phase === 'strike') {
                    combat.phase = 'recover';
                    combat.t = 0;
                    combat.dur = recoverDur;
                } else {
                    combat.phase = null;
                }
            }
        }

        // ── compose layers into the pose object (priority via weights) ──
        evalRest(pose, arch, time);
        if (moveW > 0.01 && !dashing) evalLocomotion(pose, arch, phi, moveW);
        // Guard sits above locomotion (you can walk behind the shield) and
        // below combat (a swing overrides it).
        if (guardW > 0.01 && !dead) evalGuard(pose, guardW);
        if (grappleActive && !dead) evalGrapple(pose, 1);
        if (dashing && !dead) evalDash(pose, Math.min(1, dashT / dashDur), 0.38, 1);
        if (combat.phase && !dead) {
            evalCombat(pose, combat.phase, Math.min(1, combat.t / combat.dur), combat.prof, 1);
        }
        if (hurtT > 0 && !dead) evalHurt(pose, Math.min(1, hurtT / 0.2));
        if (deadW > 0.01) evalDead(pose, deadW);

        // ── write pivots ──
        rig.body.position.y = pose.bodyY;
        rig.body.rotation.x = pose.bodyPitch;
        rig.body.rotation.z = pose.bodyRoll;
        rig.torso.rotation.x = pose.torsoPitch;
        rig.torso.rotation.y = pose.torsoYaw;
        rig.torso.rotation.z = pose.torsoRoll;
        rig.head.rotation.y = pose.headYaw;
        rig.armL.rotation.x = pose.armLx;
        rig.armL.rotation.z = pose.armLz;
        rig.armR.rotation.x = pose.armRx;
        rig.armR.rotation.z = pose.armRz;
        rig.legL.rotation.x = pose.legLx;
        rig.legR.rotation.x = pose.legRx;
    }

    return {
        pose, // exposed for tests/QA — read-only by convention
        setLocomotion({ speed = 0, wishX = 0, wishZ = 0, grounded = true } = {}) {
            input.speed = speed;
            input.wishX = wishX;
            input.wishZ = wishZ;
            input.grounded = grounded;
        },
        setDashing(active, duration) {
            if (active && !dashing) dashT = 0;
            dashing = !!active;
            if (duration) dashDur = duration;
        },
        setGrapple(active) { grappleActive = !!active; },
        setGuarding(active) { guarding = !!active; },
        guardWeight: () => guardW,
        hit() { hurtT = 0.2; },
        setDead(v) {
            dead = !!v;
            if (dead) {
                combat.phase = null;
                combat._autoStrike = null;
            }
        },
        attack,
        startWindup,
        strike,
        clearCombat() {
            combat.phase = null;
            combat._autoStrike = null;
        },
        combatPhase: () => combat.phase,
        update,
    };
}
