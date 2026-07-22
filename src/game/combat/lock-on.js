// Z4 — Z-targeting.
//
// Facing in this game is derived from the movement vector (player.js, the
// A Link to the Past model). That is exactly right for a 2D Zelda and exactly
// wrong for this one: the camera is a perspective rig at height 17.5, and in
// 3D "you point where you walk" means you cannot circle anything. Backing away
// from a boss points your sword at the far wall. Strafing points it sideways.
//
// Every 3D Zelda since Ocarina shipped with Z-targeting on day one, because it
// is not a convenience feature — it is the thing that makes 3D melee legible.
// Lock a target and facing decouples from movement: walk any direction, stay
// pointed at the thing trying to kill you. It is also what makes the Z3 guard
// usable, since the guard only covers a frontal cone.

/** Furthest a target can be and still be acquired. */
export const LOCK_RANGE = 18;
/** Lock breaks past this — hysteresis so a target does not flicker at the edge. */
export const LOCK_BREAK_RANGE = 24;

function alive(e) {
    if (!e || !e.root) return false;
    if (e.state && e.state.current === 'DEAD') return false;
    if (e.defeated) return false;
    if (e.hp != null && e.hp <= 0) return false;
    if (e.mesh && e.mesh.visible === false) return false;
    return true;
}

/**
 * Score candidates by distance, biased toward whatever the player is already
 * facing, so tapping lock in a crowded room grabs the one you meant.
 * `exclude` lets a cycle press skip the current target.
 */
export function pickTarget(from, facing, candidates, exclude = null, range = LOCK_RANGE) {
    let best = null, bestScore = Infinity;
    for (const c of candidates || []) {
        if (!alive(c) || c === exclude) continue;
        const dx = c.root.position.x - from.x;
        const dz = c.root.position.z - from.z;
        const d = Math.hypot(dx, dz);
        if (d > range || d < 1e-6) continue;
        // 0 when dead ahead, 1 when directly behind — a half-range penalty, so
        // facing matters but a much closer enemy behind you still wins.
        const aim = facing
            ? (1 - ((dx / d) * facing.x + (dz / d) * facing.z)) / 2
            : 0;
        const score = d * (1 + aim);
        if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
}

export class LockOnController {
    constructor() {
        this.target = null;
        this.getCandidates = null; // () => Array<enemy-like>
        this.onAcquire = null;
        this.onRelease = null;
    }

    get active() {
        return !!this.target;
    }

    /** Toggle press: acquire if free, release if already locked. */
    toggle(from, facing) {
        if (this.target) { this.release(); return null; }
        return this.acquire(from, facing);
    }

    acquire(from, facing) {
        const t = pickTarget(from, facing, this._candidates());
        if (t) {
            this.target = t;
            if (this.onAcquire) this.onAcquire(t);
        }
        return t;
    }

    /** Switch to the next-best target without dropping the lock entirely. */
    cycle(from, facing) {
        const t = pickTarget(from, facing, this._candidates(), this.target);
        if (t) {
            this.target = t;
            if (this.onAcquire) this.onAcquire(t);
        }
        return t;
    }

    release() {
        if (this.target && this.onRelease) this.onRelease(this.target);
        this.target = null;
    }

    _candidates() {
        return this.getCandidates ? (this.getCandidates() || []) : [];
    }

    /**
     * Drop the lock when the target dies or leaves. Returns the facing the
     * player should adopt this frame, or null to leave facing alone.
     */
    update(from) {
        const t = this.target;
        if (!t) return null;
        if (!alive(t)) { this.release(); return null; }
        const dx = t.root.position.x - from.x;
        const dz = t.root.position.z - from.z;
        const d = Math.hypot(dx, dz);
        if (d > LOCK_BREAK_RANGE) { this.release(); return null; }
        if (d < 1e-6) return null;
        return { x: dx / d, z: dz / d };
    }
}
