// src/combat/hitbox.js
// Purpose: World-unit hitbox checks (NOT pixels).
// Dependencies: none

/**
 * Returns true if attacker can hit defender with the given move.
 * All tolerances are in WORLD UNITS.
 *
 * Facing is a unit vector in the XZ plane (state.facingVec). The reach test is
 * done in that frame: `forward` is the component along facing, `lateral` the
 * component across it. For a belt-scroller the vector is always ±X, and then
 * forward === signed dx and |lateral| === |dz| — i.e. this is exactly the old
 * X-signed test, bit-for-bit. A free-roam game that aims facing on both axes
 * gets a cone that turns with it, for free.
 */
export function hitboxCheck(attacker, defender, move) {
    if (!attacker || !defender || !move) return false;
    if (defender.state && defender.state.current === 'DEAD') return false;

    // All distances are center-to-center, so the defender's body size widens
    // every window. Without this, a scale-2.0 boss's surface can be touching
    // the attacker while its center is still out of range.
    const r = defender.hitRadius || 0;

    // Facing frame. Plain fake-attacker objects (destructibles, boss minions)
    // carry only a scalar `facing`, so derive the vector when it is absent.
    const s = attacker.state || {};
    const fv = s.facingVec || { x: (s.facing || 1), z: 0 };
    let fx = fv.x, fz = fv.z || 0;
    const flen = Math.hypot(fx, fz) || 1;
    fx /= flen; fz /= flen;

    const ox = defender.root.position.x - attacker.root.position.x;
    const oz = defender.root.position.z - attacker.root.position.z;
    const forward = ox * fx + oz * fz;   // reach toward the enemy
    const lateral = -ox * fz + oz * fx;  // sideways offset (the "lane" gap)

    // Phase C — `radial`: a true circle around the attacker, facing ignored.
    //
    // `omni` already existed for spin attacks, but it is a SQUARE: it keeps the
    // lateral gate and only drops the sign of the forward test, so a move with
    // range === depthTolerance reaches 1.41x further into its corners than the
    // circle the smear draws. A player-side move whose shape is "everything
    // around me" has to actually be a disc, or the answer to "why did that
    // miss" is "you were at 4 o'clock".
    if (move.radial) {
        const dyR = defender.root.position.y - attacker.root.position.y;
        if (Math.abs(dyR) > move.vertical + r) return false;
        return Math.hypot(ox, oz) <= move.range + r;
    }

    // Lateral (depth) gate. For ±X facing this is the classic dz check.
    if (Math.abs(lateral) > move.depthTolerance + r) return false;

    if (move.omni) {
        // Omnidirectional moves (spin attack) sweep both ways along facing —
        // facing sign is irrelevant, only the magnitude of the reach matters.
        if (Math.abs(forward) > move.range + r) return false;
    } else {
        // A large boss should not become a two-and-a-half-unit backstab
        // allowance merely because its body is wide. Keep the tiny bit of
        // forgiveness that makes close scrambles feel fair, then clamp it.
        if (forward < -Math.min(r, 0.6)) return false;
        if (forward > move.range + r) return false;
    }

    const dy = defender.root.position.y - attacker.root.position.y;
    if (Math.abs(dy) > move.vertical + r) return false;

    return true;
}
