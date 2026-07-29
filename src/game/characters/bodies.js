// Per-kind body proportions.
//
// Before this file, every enemy in Sovereign Scar was the same body at the same
// size. `Enemy` built its rig at torsoProfileScale 0.65 / meshScale 0.33 and no
// level ever passed anything else, so the armoured bulwark, the floating mote,
// the long-reach lancer and the scuttling brood were one silhouette in seven
// palettes. The archetypes gave them different rest poses and gaits, which is
// real work and does read — but only once the thing is already moving, and only
// if you are looking at it. Silhouette reads first, from across a room, before
// the animation has told you anything.
//
// Two things were measured on the way in, and both changed the design:
//
//  1. `torsoProfileScale` does NOT change a rig's width. Sweeping it from 0.42
//     to 1.15 moved the depth from 0.39 to 0.80 and left the width at 0.98 the
//     whole way, because the width of a rig is its ARM SPAN, not its torso.
//     That is why the knob that existed could never have solved this.
//  2. The default rig measures xzRadius 0.490, and `Enemy`'s hitRadius default
//     was 0.5. The hand-written constant was already the measured body — so
//     deriving the hitbox from the body (see `Enemy`) keeps the sentinel
//     bit-for-bit as tuned and lets every other kind follow by construction.
//
// `bodyScale` is per-axis and is applied to the leaf meshes, never to a parent
// group, so limb rotations stay rigid (see actor-rig.js `partMesh`).
//
// The design rule for the numbers themselves: from a camera looking down, what
// the player reads is FOOTPRINT and HEIGHT. So every kind differs from the
// sentinel reference on at least one of those by a margin the eye can catch,
// and no two kinds share a footprint. `tests/game/bodies.spec.mjs` asserts that
// rather than trusting it.

export const SENTINEL_BODY = {
    meshScale: 0.33,
    torsoProfileScale: 0.65,
    headProfileScale: 0.85,
    bodyScale: { x: 1, y: 1, z: 1 },
};

export const BODIES = {
    // The reference. Everything else is described relative to this.
    sentinel: SENTINEL_BODY,

    // Low forward scuttle. Wide and squat: the archetype already pitches the
    // body forward, and a short wide frame is what makes that read as "close
    // to the ground" instead of "leaning".
    scarab: {
        meshScale: 0.30,
        torsoProfileScale: 0.85,
        headProfileScale: 0.95,
        bodyScale: { x: 1.16, y: 0.76, z: 1.18 },
    },

    // Narrow upright caster. Tall and thin, so the raised staff arm is the
    // widest thing about it and the silhouette says "reaching, not charging".
    frost: {
        meshScale: 0.32,
        torsoProfileScale: 0.50,
        headProfileScale: 0.80,
        bodyScale: { x: 0.86, y: 1.14, z: 0.88 },
    },

    // The plate. The biggest footprint in the bestiary by a wide margin —
    // "which of these is the armoured one" has to be answerable in one glance,
    // and mass is the answer the eye reaches for first.
    bulwark: {
        meshScale: 0.37,
        torsoProfileScale: 1.15,
        headProfileScale: 0.90,
        bodyScale: { x: 1.24, y: 0.94, z: 1.34 },
    },

    // Weightless. The smallest body in the game — it has to read as something
    // that could plausibly be up there, and small is most of that read.
    mote: {
        meshScale: 0.25,
        torsoProfileScale: 0.60,
        headProfileScale: 1.05,
        bodyScale: { x: 0.94, y: 0.92, z: 0.94 },
    },

    // Long, thin, arterial. The tallest and narrowest thing you will fight;
    // the reach is legible from the outline before it has moved.
    lancer: {
        meshScale: 0.35,
        torsoProfileScale: 0.45,
        headProfileScale: 0.78,
        bodyScale: { x: 0.82, y: 1.24, z: 0.84 },
    },

    // Scarab's cousin, deliberately close to it — mistaking one for the other
    // is a fair mistake the bestiary wants you to make once. Smaller and
    // rounder, so the difference is there for a player who looks twice.
    brood: {
        meshScale: 0.28,
        torsoProfileScale: 0.95,
        headProfileScale: 1.0,
        bodyScale: { x: 1.20, y: 0.70, z: 1.22 },
    },

    // Phase D3 — the Weaver. Broad-shouldered and low-headed, because what it
    // does is reach sideways and spin: the silhouette has to say "this one is
    // busy with the room", not "this one is coming for you".
    weaver: {
        meshScale: 0.31,
        torsoProfileScale: 0.72,
        headProfileScale: 0.62,
        bodyScale: { x: 1.10, y: 0.82, z: 1.02 },
    },

    // Phase D3 — the Censer. Big head, narrow frame: the first enemy in the
    // game whose answer is target priority, so it has to be pickable out of a
    // crowd at a glance or the lesson never lands.
    censer: {
        meshScale: 0.325,
        torsoProfileScale: 0.55,
        headProfileScale: 1.35,
        bodyScale: { x: 0.78, y: 0.90, z: 0.80 },
    },
};

/** Body for a kind, falling back to the sentinel reference. */
export function bodyFor(kind) {
    return BODIES[kind] || SENTINEL_BODY;
}

/**
 * A brood split-child: the parent's proportions at a fraction of its size.
 *
 * Derived rather than hand-written. The child used to be `meshScale: 0.24,
 * hitRadius: 0.38` — two literals that had to be kept agreeing with each other
 * by hand, and which silently stopped describing the parent the moment the
 * parent's body changed.
 */
export const CHILD_SCALE = 0.76;

export function childBody(kind) {
    const b = bodyFor(kind);
    return { ...b, meshScale: b.meshScale * CHILD_SCALE };
}
