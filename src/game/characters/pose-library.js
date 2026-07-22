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

// Melee attack profile per weapon id: raise = windup peak for armR.x
// (negative = raised back/up), sweep = strike end, assist = left arm join,
// dip = body crouch on the strike frame.
const WEAPON_PROFILES = {
    bare_strike: { raise: -1.3, sweep: 0.7, assist: 0, dip: 0.02 },
    anchor_link: { raise: -1.9, sweep: 0.9, assist: 0, dip: 0.03 },
    tectonic_wedge: { raise: -2.1, sweep: 1.0, assist: 0.8, dip: 0.05 },
    heavy_mallet: { raise: -2.6, sweep: 1.1, assist: 0.5, dip: 0.08 },
    light_caster: { raise: -1.45, sweep: -1.35, assist: 0, dip: 0, point: true },
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
    let armRx = 0, torsoYaw = 0, bodyY = 0, armLx = 0;
    if (phase === 'windup') {
        const u = t01 * t01; // ease-in: the raise accelerates into the peak
        armRx = prof.raise * u;
        torsoYaw = -0.35 * u;
        bodyY = -0.04 * u;
        armLx = prof.assist ? -0.4 * prof.assist * u : 0;
    } else if (phase === 'strike') {
        if (prof.point) {
            // Ray weapons point, they do not arc — no misleading melee sweep.
            armRx = prof.sweep;
            torsoYaw = -0.1;
        } else {
            const u = t01;
            armRx = prof.raise + (prof.sweep - prof.raise) * u;
            torsoYaw = -0.35 + 0.85 * u;
            bodyY = -prof.dip * u;
            armLx = prof.assist ? (-0.4 + 1.0 * u) * prof.assist : 0;
        }
    } else { // recover — ease everything home
        const u = 1 - t01;
        armRx = (prof.point ? prof.sweep : prof.sweep) * u * 0.6;
        torsoYaw = 0.5 * u * 0.6;
    }
    out.armRx = out.armRx * (1 - w) + armRx * w;
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
