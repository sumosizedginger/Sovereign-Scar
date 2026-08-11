// Actor archetypes (Ticket F): rest-pose offsets + gait parameters that make
// hero, sentinel, scarab, and frost read as different CLASSES from silhouette
// and motion, not just palette. Angles are radians; amplitudes are peak
// rotations for the sinusoidal gait layers in actor-animator.js.

export const ARCHETYPES = {
    hero: {
        // Default "hero swing" gait: readable, medium everything.
        gaitFreqMin: 1.6, gaitFreqMax: 2.6, // Hz across the speed range
        legAmp: 0.42,   // ±24°
        armAmp: 0.28,   // ±16°
        bobAmp: 0.045,
        strideLean: 0.10,
        sway: 0,
        // The hero is the only actor who holds something, so the weapon arm
        // carries a slight ready angle. With the arm hanging dead straight the
        // blade's own length put its point below the hero's feet while they
        // stood still; this lifts the tip clear and reads as "weapon up".
        rest: { armRx: -0.18 },
    },
    sentinel: {
        // Tall, deliberate guard: slow gait, left arm forward in a shield-side
        // guard, slightly wide stance.
        gaitFreqMin: 1.2, gaitFreqMax: 1.8,
        legAmp: 0.30,
        armAmp: 0.16,
        bobAmp: 0.03,
        strideLean: 0.06,
        sway: 0,
        rest: { armLx: -0.55, armLz: 0.12, torsoYaw: -0.08 },
    },
    scarab: {
        // Low forward scuttle: permanent body pitch, fast small steps,
        // lateral sway; charge compression comes from the combat layer.
        gaitFreqMin: 2.4, gaitFreqMax: 3.4,
        legAmp: 0.24,
        armAmp: 0.14,
        bobAmp: 0.025,
        strideLean: 0.10,
        sway: 0.09,
        rest: { bodyPitch: 0.17, armLx: 0.25, armRx: 0.25 },
    },
    frost: {
        // Narrow upright caster: restrained arms, right arm raised in a
        // staff-hold aim rest; release snap lives in the combat layer.
        gaitFreqMin: 1.4, gaitFreqMax: 2.0,
        legAmp: 0.26,
        armAmp: 0.10,
        bobAmp: 0.03,
        strideLean: 0.05,
        sway: 0,
        rest: { armRx: -0.95, torsoPitch: -0.04 },
    },
    // Z5. Silhouette is the first thing the player reads and the last thing
    // they forget, so each new kind gets a rest pose that states its rule
    // before it has done anything: the bulwark is turned side-on behind a
    // raised plate, the mote hangs slack, the lancer is wound back around a
    // long weapon, the brood is hunched and ready to come apart.
    bulwark: {
        // Immovable plate: slowest gait in the game, minimal arm swing, body
        // bladed away so the armoured face is what you are looking at.
        gaitFreqMin: 0.9, gaitFreqMax: 1.3,
        legAmp: 0.22,
        armAmp: 0.08,
        bobAmp: 0.018,
        strideLean: 0.04,
        sway: 0,
        rest: { armLx: -1.15, armLz: 0.35, torsoYaw: -0.34, bodyPitch: 0.05 },
    },
    mote: {
        // Floats. Legs barely move because they are not carrying anything;
        // the sway does the work so it reads as drifting, not walking.
        gaitFreqMin: 0.8, gaitFreqMax: 1.2,
        legAmp: 0.08,
        armAmp: 0.22,
        bobAmp: 0.12,
        strideLean: 0,
        sway: 0.16,
        rest: { armLx: 0.55, armRx: 0.55, armLz: 0.4, armRz: -0.4, bodyPitch: -0.12 },
    },
    lancer: {
        // Long strides, weapon cocked far back on the right. The reach is
        // legible from the pose alone, which is the whole point of the kind.
        gaitFreqMin: 1.3, gaitFreqMax: 2.2,
        legAmp: 0.5,
        armAmp: 0.1,
        bobAmp: 0.035,
        strideLean: 0.16,
        sway: 0,
        rest: { armRx: -1.35, armRz: -0.2, torsoYaw: 0.2 },
    },
    brood: {
        // Scarab's cousin: same low scuttle, but hunched tighter and quivering
        // faster — it is holding two more of itself in.
        gaitFreqMin: 2.8, gaitFreqMax: 4.0,
        legAmp: 0.2,
        armAmp: 0.18,
        bobAmp: 0.05,
        strideLean: 0.08,
        sway: 0.13,
        rest: { bodyPitch: 0.3, armLx: 0.45, armRx: 0.45 },
    },
    // Phase D3's two kinds shipped with a palette and a body and no archetype,
    // so archetypeFor() handed both of them the sentinel's gait: a guard's
    // slow deliberate stride on two back-line kiters that never close. Both
    // are written here against what their AI actually does.
    weaver: {
        // Kites sideways and lays strands ACROSS your path (_aiWeave backs off
        // inside 4.5 and drifts back in past 9). The gait is a busy sidelong
        // shuffle, arms held wide and low where the work happens, head down —
        // the body says "occupied with the room", not "coming for you".
        gaitFreqMin: 2.0, gaitFreqMax: 2.8,
        legAmp: 0.18,
        armAmp: 0.26,
        bobAmp: 0.03,
        strideLean: 0.04,
        sway: 0.14,
        rest: { armLx: 0.30, armRx: 0.30, armLz: 0.52, armRz: -0.52, bodyPitch: 0.12, torsoYaw: 0.22 },
    },
    censer: {
        // The support you are meant to kill first, so it must be pickable out
        // of a crowd while moving. Big head, narrow frame, and a slow hovering
        // drift with almost no leg travel — nothing else in the bestiary moves
        // like this, which is the same job its gold palette is doing.
        gaitFreqMin: 1.0, gaitFreqMax: 1.4,
        legAmp: 0.10,
        armAmp: 0.12,
        bobAmp: 0.10,
        strideLean: 0.02,
        sway: 0.07,
        rest: { armLx: 0.20, armRx: 0.20, armLz: 0.30, armRz: -0.30, torsoPitch: -0.10 },
    },
};

export function archetypeFor(kind) {
    return ARCHETYPES[kind] || ARCHETYPES.sentinel;
}
