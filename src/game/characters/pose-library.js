// Pose library (Ticket F): pure pose evaluation — no THREE, no allocation.
// Every eval* writes radians/offsets into a caller-owned flat pose object:
//   { bodyY, bodyPitch, bodyRoll, torsoPitch, torsoYaw, torsoRoll,
//     headYaw, armLx, armLz, armRx, armRz, legLx, legRx }
// The animator owns blending; these functions only produce layer targets.

export const POSE_KEYS = [
    'bodyY', 'bodyPitch', 'bodyRoll', 'torsoPitch', 'torsoYaw', 'torsoRoll',
    'headYaw', 'armLx', 'armLz', 'armRx', 'armRz', 'legLx', 'legRx',
];

export function zeroPose(out) {
    for (let i = 0; i < POSE_KEYS.length; i++) out[POSE_KEYS[i]] = 0;
    return out;
}

export function makePose() {
    return zeroPose({});
}

/** Archetype rest offsets + idle breathing/weight-shift. */
export function evalRest(out, arch, time) {
    zeroPose(out);
    const rest = arch.rest;
    if (rest.bodyPitch) out.bodyPitch = rest.bodyPitch;
    if (rest.torsoPitch) out.torsoPitch = rest.torsoPitch;
    if (rest.torsoYaw) out.torsoYaw = rest.torsoYaw;
    if (rest.armLx) out.armLx = rest.armLx;
    if (rest.armLz) out.armLz = rest.armLz;
    if (rest.armRx) out.armRx = rest.armRx;
    if (rest.armRz) out.armRz = rest.armRz;
    // Breathing (~1.2 Hz) + slow lateral weight shift; subtle by design.
    out.bodyY += Math.sin(time * 7.5) * 0.018;
    out.torsoRoll += Math.sin(time * 2.5) * 0.02;
    // Micro arm hang sway so rest never reads as a T-pose statue.
    out.armLx += Math.sin(time * 2.1) * 0.03;
    out.armRx += Math.sin(time * 2.1 + 1.7) * 0.03;
    return out;
}

/**
 * Locomotion layer: phase-driven opposing limb swing.
 * @param {number} phi   gait phase (radians, integrated by the animator)
 * @param {number} w     layer weight 0..1 (speed-derived)
 */
export function evalLocomotion(out, arch, phi, w) {
    const s = Math.sin(phi);
    out.legRx += arch.legAmp * s * w;
    out.legLx += -arch.legAmp * s * w;
    out.armRx += -arch.armAmp * s * w;
    out.armLx += arch.armAmp * s * w;
    out.bodyY += arch.bobAmp * Math.abs(s) * w;
    out.bodyPitch += arch.strideLean * w;
    if (arch.sway) out.bodyRoll += arch.sway * Math.sin(phi * 0.5) * w;
    // Torso counter-twist keeps the swing from reading as a rigid slab.
    out.torsoYaw += 0.08 * s * w;
    return out;
}

// Melee attack profiles.
//
// WHICH WAY IS FORWARD. `player.js` sets `rig.rotation.y = atan2(fv.x, fv.z)`,
// which lands rig-local **+Z** on the facing vector. The arm hangs along −Y
// from its shoulder pivot, and THREE resolves an 'XYZ' euler as Rx·Rz·v, so:
//
//     arm direction = ( sin rz , −cos rz·cos rx , −cos rz·sin rx )
//
// Read the z term: the arm only points FORWARD (+z) when `rx` is NEGATIVE.
//
// These profiles used to be signed the other way — windup −1.9, strike +0.9 —
// so the hero cocked the weapon in front of their own face and then swung it
// behind their back, on every melee weapon, in every fight. `tests/qa/
// swing-readout.mjs` measured the blade tip never getting further than 0.27
// units in front of a hero whose weapon reaches 1.8, and reaching even that
// only during RECOVER, after the hitbox had already resolved.
//
// The suite did not catch it because it asserted the SIGN of a pivot angle,
// which a hero striking backwards satisfies exactly as well as one striking
// forwards. Directions are only meaningful in world space; see
// `tests/game/actor-anim.spec.mjs` for the assertions that replaced it.
//
// Each phase is a full (rx, rz) pose rather than a single angle, because a
// slash is a LATERAL arc across the body — `rz` swings the arm sideways
// (its x term above is the only one that carries lateral motion). Without it
// the swing is a vertical chop, which cannot read as "arcing out in front of
// you" no matter which direction it points.
//
//   windup — cocked out to the weapon side, slightly back
//   strike — driven down/forward and ACROSS the body to the far side
//   assist — how much the off hand joins in (two-handed weapons)
//   dip    — body crouch on the strike frame
const WEAPON_PROFILES = {
    //                windup rx/rz        strike rx/rz        assist  dip
    bare_strike:    { wx: 0.35, wz: 0.85, sx: -0.75, sz: -0.55, assist: 0,   dip: 0.02 },
    anchor_link:    { wx: 0.50, wz: 1.20, sx: -0.85, sz: -0.80, assist: 0,   dip: 0.03 },
    tectonic_wedge: { wx: 0.60, wz: 1.30, sx: -0.95, sz: -0.85, assist: 0.8, dip: 0.05 },
    heavy_mallet:   { wx: 0.75, wz: 1.45, sx: -1.05, sz: -1.00, assist: 0.5, dip: 0.08 },
    // The ray weapon POINTS. It held the only correct pose in the old table.
    light_caster:   { wx: -1.45, wz: 0.10, sx: -1.35, sz: 0.05, assist: 0, dip: 0, point: true },
};

export function weaponProfile(weaponId) {
    return WEAPON_PROFILES[weaponId] || WEAPON_PROFILES.anchor_link;
}

/**
 * Combat layer. Phases: 'windup' | 'strike' | 'recover', each with t01 0→1.
 * Writes ABSOLUTE limb targets; the animator blends this layer over the
 * others with weight `w` (combat dominates limbs during strike).
 */
export function evalCombat(out, phase, t01, prof, w) {
    let armRx = 0, armRz = 0, torsoYaw = 0, bodyY = 0, armLx = 0;
    if (phase === 'windup') {
        const u = t01 * t01; // ease-in: the raise accelerates into the peak
        armRx = prof.wx * u;
        armRz = prof.wz * u;
        // Torso winds up WITH the arm (toward the weapon side) so the strike
        // has something to unwind out of.
        torsoYaw = 0.30 * u;
        bodyY = -0.04 * u;
        armLx = prof.assist ? -0.4 * prof.assist * u : 0;
    } else if (phase === 'strike') {
        if (prof.point) {
            // Ray weapons point, they do not arc — no misleading melee sweep.
            armRx = prof.sx;
            armRz = prof.sz;
            torsoYaw = -0.1;
        } else {
            // Ease-OUT: the blade is fastest at the start of the strike, which
            // is where the hitbox resolves, and settles into the follow-through.
            const u = 1 - (1 - t01) * (1 - t01);
            armRx = prof.wx + (prof.sx - prof.wx) * u;
            armRz = prof.wz + (prof.sz - prof.wz) * u;
            torsoYaw = 0.30 - 0.70 * u;
            bodyY = -prof.dip * u;
            armLx = prof.assist ? (-0.4 + 1.0 * u) * prof.assist : 0;
        }
    } else { // recover — ease everything home from where the strike ended
        const u = 1 - t01;
        armRx = prof.sx * u * 0.6;
        armRz = prof.sz * u * 0.6;
        torsoYaw = -0.40 * u * 0.6;
    }
    out.armRx = out.armRx * (1 - w) + armRx * w;
    out.armRz = out.armRz * (1 - w) + armRz * w;
    out.armLx = out.armLx * (1 - w) + armLx * w;
    out.torsoYaw = out.torsoYaw * (1 - w) + torsoYaw * w;
    out.bodyY += bodyY * w;
    return out;
}

/** Dash: crouch anticipation → long lean → stand-up ease. */
export function evalDash(out, t01, lean, w) {
    let pitch, y;
    if (t01 < 0.2) { // anticipation compress
        const u = t01 / 0.2;
        pitch = lean * 0.3 * u;
        y = -0.08 * u;
    } else if (t01 < 0.75) { // travel lean, arms trail
        pitch = lean;
        y = -0.05;
        out.armLx += 0.6 * w;
        out.armRx += 0.6 * w;
    } else { // recovery
        const u = (1 - t01) / 0.25;
        pitch = lean * u;
        y = -0.05 * u;
    }
    out.bodyPitch += pitch * w;
    out.bodyY += y * w;
    return out;
}

/** Grapple pull: both arms forward along facing, torso committed to the line. */
export function evalGrapple(out, w) {
    out.armRx = out.armRx * (1 - w) + (-1.35) * w;
    out.armLx = out.armLx * (1 - w) + (-1.25) * w;
    out.torsoPitch += 0.22 * w;
    return out;
}

/**
 * Guard: shield arm up and across the front, weapon hand dropped out of the
 * way, torso bladed toward the threat so the cover reads as cover.
 *
 * This layer sits above locomotion and below combat, so you can walk while
 * guarding (at GUARD_SPEED_MULT) but a swing still overrides the pose.
 * `w` carries the raise/lower so the shield does not teleport up.
 */
export function evalGuard(out, w) {
    out.armLx = out.armLx * (1 - w) + (-1.45) * w;   // shield arm forward
    out.armLz = out.armLz * (1 - w) + (0.55) * w;    // ...and across the body
    out.armRx = out.armRx * (1 - w) + (0.25) * w;    // weapon hand drops back
    out.armRz = out.armRz * (1 - w) + (0.30) * w;
    out.torsoYaw = out.torsoYaw * (1 - w) + (0.28) * w;
    out.torsoPitch += 0.10 * w;
    out.bodyY += -0.05 * w;                          // slight crouch behind it
    return out;
}

/** Hurt flinch: short asymmetric impulse, decays with the layer weight. */
export function evalHurt(out, w) {
    out.torsoPitch += 0.18 * w;
    out.torsoRoll += 0.3 * w;
    out.armLx += -0.5 * w;
    out.armRx += 0.3 * w;
    return out;
}

/** Death collapse: knees fold, torso drops, arms go slack. Stays grounded —
 * the drop must not exceed what the folded legs shorten (~leg·(1−cos 0.95)),
 * or the pelvis clips through the floor plane. */
export function evalDead(out, w) {
    out.bodyY = out.bodyY * (1 - w) + (-0.26) * w;
    out.torsoPitch = out.torsoPitch * (1 - w) + 1.15 * w;
    out.legLx = out.legLx * (1 - w) + 0.95 * w;
    out.legRx = out.legRx * (1 - w) + 0.8 * w;
    out.armLx = out.armLx * (1 - w) + 0.35 * w;
    out.armRx = out.armRx * (1 - w) + 0.35 * w;
    out.headYaw = out.headYaw * (1 - w) + 0.3 * w;
    return out;
}
