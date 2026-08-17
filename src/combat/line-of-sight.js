// src/combat/line-of-sight.js
// Purpose: does solid matter sit between two points? World units, no THREE.
// Dependencies: none
//
// WHY THIS EXISTS. Nothing in combat had line of sight. `hitboxCheck` takes two
// positions and a move and holds no reference to the world, so no attack in the
// game — the player's or a boss's — could consider a wall. It does not matter
// at 1.2 units and it is very visible at 16: `docs/media/telegraphs/
// player-caster-lance.png` shows the beam leaving the player, crossing the
// room's east wall and continuing out of frame. The drawing and the hit agreed
// with each other; they agreed about something that goes through walls.
//
// WHAT IT ASKS THE WORLD, AND WHY IT IS NOT THE COLLISION WORLD. `CollisionWorld`
// is a flat list of XZ boxes with no height at all: it is what stops you WALKING
// somewhere. Sight is a different question, and using the movement world would
// answer it wrong in both directions — a terrace you can stand on is a solid box,
// so a shot from on top of one would be blocked by the thing you are standing on,
// and a wall's overhead lintel is deliberately not a solid, so an arch would not
// occlude. This marches the 3D voxel occupancy (`level.getVoxelAt`) instead,
// which is the actual matter in the room, terraces and platforms included.
//
// IT FAILS OPEN, DELIBERATELY. With no world query the answer is "clear". Almost
// every spec in this repo builds a boss with no level attached, and a module that
// answered "blocked" would silently switch off combat in several thousand
// assertions while every one of them still passed. `levelHasSight` below is the
// gate that keeps fail-open honest: it asserts the real dungeons DO supply the
// query, so a missing wire fails loudly in the one place it matters.

/**
 * World units between samples. `VS` is 1 and the thinnest wall in the game is
 * one voxel, so 0.4 puts at least two samples inside anything solid. Sampling
 * at the voxel size itself can step over a wall entirely when the line is
 * diagonal.
 */
export const LOS_STEP = 0.4;

/**
 * Distance skipped at BOTH ends before sampling starts.
 *
 * Half a voxel, and it is not a fudge. Bodies routinely overlap geometry at
 * their own edges: a boss shoved against a wall by its arena clamp, a player
 * whose radius touches the pillar they are hugging. Sampling from the exact
 * endpoint would report those as blocked from themselves, which reads as a
 * weapon that has stopped working for no visible reason.
 */
export const LOS_MARGIN = 0.5;

/**
 * True when nothing solid stands between `from` and `to`.
 *
 * `solidAt(x, y, z) -> boolean` is the world's occupancy query, in world units;
 * pass `level.getVoxelAt`. A missing or non-function query means "clear" — see
 * the fail-open note at the top of this file.
 */
export function hasLineOfSight(solidAt, from, to, opts) {
    if (typeof solidAt !== 'function' || !from || !to) return true;
    const step = (opts && opts.step) || LOS_STEP;
    const margin = (opts && opts.margin != null) ? opts.margin : LOS_MARGIN;

    const dx = to.x - from.x;
    const dy = (to.y || 0) - (from.y || 0);
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    // Shorter than the two margins: there is no span left to occlude.
    if (len <= margin * 2) return true;

    const n = Math.ceil((len - margin * 2) / step);
    for (let i = 0; i <= n; i++) {
        // Walk from `margin` to `len - margin`, inclusive of both, so a wall
        // sitting exactly at the far margin is still found.
        const d = margin + (i / n) * (len - margin * 2);
        const t = d / len;
        if (solidAt(from.x + dx * t, (from.y || 0) + dy * t, from.z + dz * t)) return false;
    }
    return true;
}

/**
 * The point at which the sight line first meets something solid, or `null` when
 * it is clear.
 *
 * Separate from `hasLineOfSight` because a projectile wants to STOP and burst
 * where it hit the wall, not merely to learn that it would have. Returning the
 * last clear sample rather than the first solid one puts the burst in the air
 * against the wall instead of inside it.
 */
export function sightHit(solidAt, from, to, opts) {
    if (typeof solidAt !== 'function' || !from || !to) return null;
    const step = (opts && opts.step) || LOS_STEP;
    const margin = (opts && opts.margin != null) ? opts.margin : LOS_MARGIN;

    const dx = to.x - from.x;
    const dy = (to.y || 0) - (from.y || 0);
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len <= margin * 2) return null;

    const n = Math.ceil((len - margin * 2) / step);
    let last = null;
    for (let i = 0; i <= n; i++) {
        const d = margin + (i / n) * (len - margin * 2);
        const t = d / len;
        const p = {
            x: from.x + dx * t,
            y: (from.y || 0) + dy * t,
            z: from.z + dz * t,
        };
        if (solidAt(p.x, p.y, p.z)) return last || p;
        last = p;
    }
    return null;
}

/**
 * Sight between two BODIES, which is not the same as sight between two points.
 *
 * A root position is a mesh origin, not an eye. The Sand Spur's is at y 0.6 and
 * the floor's top surface is at y 1.0, so a line drawn from the player's chest
 * to that root passes THROUGH THE FLOOR before it arrives — and the first build
 * of this did exactly that, taking all thirteen bosses in `boss-reach-e2e` from
 * a healthy band to a negative one. The player could not damage the Spur or the
 * Kinetic Core from any distance at all, and the reason was the ground.
 *
 * So the line is LEVELLED, run horizontally at the higher of the two bodies.
 * That answers the question this game actually needs — "is there a wall between
 * these two columns at body height" — and it is deliberately the fail-open
 * choice on the vertical axis: a terrace never gives cover to or from something
 * standing on it. Cover here is walls and pillars, which is what the reported
 * defect was about. Height-aware cover would need real body extents, and
 * inventing them from a mesh origin is how the floor became a wall.
 */
export function sightBetweenBodies(solidAt, a, b, opts) {
    if (typeof solidAt !== 'function' || !a || !b) return true;
    const y = Math.max(a.y || 0, b.y || 0);
    return hasLineOfSight(solidAt, { x: a.x, y, z: a.z }, { x: b.x, y, z: b.z }, opts);
}

/**
 * Does this level supply an occupancy query at all?
 *
 * The one assertion that stops fail-open from becoming fail-silent. A dungeon
 * that answers `false` here has no occlusion in it and nothing else would say so.
 */
export function levelHasSight(level) {
    return !!level && typeof level.getVoxelAt === 'function';
}
