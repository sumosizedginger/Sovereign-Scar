// @ts-check
// Magnetic Grapple — short swept pull with cancel if path blocked.

import { gsfx } from '../audio/sfx-bank.js';

export class GrappleController {
    constructor() {
        this.active = false;
        this.target = null;
        this.t = 0;
        this.duration = 0.35;
        this.from = { x: 0, y: 0, z: 0 };
        this.to = { x: 0, y: 0, z: 0 };
        this.cooldown = 0;
    }

    /**
     * Begin pull toward world point, or cancel if already cooling down.
     *
     * @param {object} [opts]
     * @param {number}   [opts.stopShort] world units to stop short of the target.
     *   Callers that have ALREADY aimed at a landing spot rather than at the
     *   anchor itself should pass 0 — see the note below.
     * @param {(x:number,z:number)=>boolean} [opts.canStand] may the player be
     *   put down here? When given, the landing point is moved to somewhere that
     *   answers yes instead of dropping them into the hole they were crossing.
     */
    start(playerPos, targetPos, range = 10, opts = {}) {
        if (this.cooldown > 0 || this.active) return false;
        const dx = targetPos.x - playerPos.x;
        const dy = (targetPos.y || 0) - (playerPos.y || 0);
        const dz = targetPos.z - playerPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > range || dist < 0.4) return false;
        this.active = true;
        this.t = 0;
        this.from = { x: playerPos.x, y: playerPos.y, z: playerPos.z };

        // STOP SHORT OF THE TARGET — ONCE.
        //
        // `blockers.js` aims the grapple 1.2 short of the anchor post already,
        // so that the pull is not cancelled against the post. This then took
        // another 0.8 off the same ray, and the two together are what put the
        // player down 2.0 metres short of the peg. Across the windworks gap in
        // 04 Sky Monument — the campaign's grapple tutorial — that is z −69.5
        // against a hole spanning −70 to −66: the middle of the chasm. Measured
        // in the running game: fire the grapple, arrive at −69.5, fall, get
        // caught by the gap's own safety net, pay a heart, and be set down on
        // the far rim by the net rather than by the grapple. The owner's report
        // was "I should be able to grapple and land on the ledge, not fall into
        // darkness if I'm not pushing forward." They were right; holding
        // forward was covering for this, because the walk carried them the last
        // half-metre onto solid ground before gravity noticed.
        const stopShort = opts.stopShort != null ? opts.stopShort : 0.8;
        const stop = Math.max(0.6, dist - stopShort);
        const s = stop / dist;
        this.to = {
            x: playerPos.x + dx * s,
            y: playerPos.y + dy * 0.3,
            z: playerPos.z + dz * s,
        };

        // AND THE LANDING MUST BE SOMEWHERE A BODY MAY STAND.
        //
        // Arithmetic on a ray does not know what is underneath it. Rather than
        // tune the constant above until this one gap works — the next gap has
        // its own geometry — ask the level. Search outward from the nominal
        // landing point: first onward toward the anchor (the far rim is almost
        // always the intent), then back toward the player. If nothing along the
        // ray can be stood on, keep the nominal point and let the ordinary fall
        // handle it; a grapple that silently refuses to fire is worse than one
        // that lands badly, because the player cannot see why.
        if (typeof opts.canStand === 'function') {
            this.to = this._nearestStandingPoint(
                playerPos, dist, dx, dz, opts.canStand, range);
        }
        // The grapple was entirely silent — no launch, no bite, no reel. A
        // traversal verb the player cannot hear reads as a teleport. The hook
        // biting and the reel are scheduled from `update` on arrival, so the
        // three sounds describe the move rather than stacking on its first
        // frame.
        gsfx.grappleFire();
        this._bit = false;
        return true;
    }

    /**
     * The point along the pull ray nearest `this.to` that a body may stand on.
     * Onward first, then — only if there is nothing ahead — back toward the
     * player.
     *
     * ONWARD IS SEARCHED AS FAR AS `range`, not as far as the target. A grapple
     * exists to carry you ACROSS something, so a landing short of the far rim
     * is the failure being fixed here, and pulling the player BACKWARDS to the
     * rim they were standing on is that failure wearing a hat: the button does
     * nothing except cost a cooldown. `range` is the one distance the caller
     * has already declared this pull may cover, so it is the honest cap; the
     * search stops at the FIRST standable point regardless, which in every real
     * gap is the near edge of the far side.
     */
    _nearestStandingPoint(playerPos, dist, dx, dz, canStand, range) {
        const at = (d) => ({
            x: playerPos.x + (dx / dist) * d,
            y: this.to.y,
            z: playerPos.z + (dz / dist) * d,
        });
        const nominal = Math.hypot(this.to.x - playerPos.x, this.to.z - playerPos.z);
        if (canStand(this.to.x, this.to.z)) return this.to;
        const STEP = 0.25;
        const forwardLimit = Math.max(dist, range || dist);
        for (let d = nominal + STEP; d <= forwardLimit; d += STEP) {
            const p = at(d);
            if (canStand(p.x, p.z)) return p;
        }
        for (let d = nominal - STEP; d >= 0.6; d -= STEP) {
            const p = at(d);
            if (canStand(p.x, p.z)) return p;
        }
        return this.to;
    }

    /**
     * @returns {{ active:boolean, x?:number, y?:number, z?:number, invuln:boolean,
     *             cancelled?:boolean, arrived?:boolean }}
     */
    update(dt, collisionWorld, half = 0.4) {
        if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
        if (!this.active) return { active: false, invuln: false };

        this.t += dt;
        const u = Math.min(1, this.t / this.duration);
        if (!this._bit && u > 0.18) { this._bit = true; gsfx.grappleHit(); gsfx.grapplePull(); }
        // Ease out
        const e = 1 - (1 - u) * (1 - u);
        let x = this.from.x + (this.to.x - this.from.x) * e;
        let y = this.from.y + (this.to.y - this.from.y) * e;
        let z = this.from.z + (this.to.z - this.from.z) * e;

        if (collisionWorld && collisionWorld.resolveMove) {
            // Multi-step sweep
            const steps = 4;
            let cx = this.from.x + (this.to.x - this.from.x) * Math.max(0, e - 1 / steps);
            let cz = this.from.z + (this.to.z - this.from.z) * Math.max(0, e - 1 / steps);
            for (let i = 0; i < steps; i++) {
                // CLAMPED AT ZERO, or the early substeps sweep BACKWARDS.
                //
                // `e` starts near zero, so on the first frame of a pull this
                // was `e - 0.75` for i=0 — about −0.66 — and the swept target
                // came out two thirds of the pull distance BEHIND the player,
                // in the opposite direction to the grapple. If anything solid
                // is back there, `resolveMove` refuses, the check below sees a
                // difference of more than 0.05 and cancels the whole pull.
                //
                // So the grapple failed whenever the player had their back to a
                // wall, anywhere in the game. Measured in 04 Sky Monument's
                // windworks: the far ledge is one metre of standable ground at
                // z −70.5 with a full-height wall behind it at z −71, so the
                // return trip computed a sweep to z −73.65, straight into that
                // wall, and cancelled at z −70.6 having moved 0.10. The owner's
                // report was that you simply cannot get back across.
                //
                // It also explains why only ONE direction was broken: firing
                // south-to-north the same backwards substep lands on open
                // floor, resolves cleanly, and nothing ever noticed.
                //
                // `cx`/`cz` above already carry a `Math.max(0, …)` for exactly
                // this reason. The loop was the half that missed it.
                const t1 = Math.min(1, Math.max(0, e - (steps - 1 - i) / steps));
                const nx = this.from.x + (this.to.x - this.from.x) * t1;
                const nz = this.from.z + (this.to.z - this.from.z) * t1;
                const r = collisionWorld.resolveMove(cx, cz, nx, nz, half);
                if (Math.hypot(r.x - nx, r.z - nz) > 0.05) {
                    // Blocked — cancel into free position
                    this.active = false;
                    this.cooldown = 0.5;
                    return { active: false, x: r.x, y, z: r.z, invuln: false, cancelled: true };
                }
                cx = r.x;
                cz = r.z;
            }
            x = cx;
            z = cz;
        }

        if (u >= 1) {
            this.active = false;
            this.cooldown = 0.55;
            // `arrived`, because `active` is already false here and the caller
            // in player.js gates on `g.active || g.cancelled`. Without a flag
            // of its own the ARRIVAL FRAME — the one carrying the final landing
            // point — fell to the else branch and its x/y/z were dropped on the
            // floor. The pull therefore always ended one frame short of the
            // place it had spent 0.35s computing.
            return { active: false, arrived: true, x, y, z, invuln: true };
        }
        return { active: true, x, y, z, invuln: true };
    }
}
