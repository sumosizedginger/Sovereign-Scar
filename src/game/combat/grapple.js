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
     */
    start(playerPos, targetPos, range = 10) {
        if (this.cooldown > 0 || this.active) return false;
        const dx = targetPos.x - playerPos.x;
        const dy = (targetPos.y || 0) - (playerPos.y || 0);
        const dz = targetPos.z - playerPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > range || dist < 0.4) return false;
        this.active = true;
        this.t = 0;
        this.from = { x: playerPos.x, y: playerPos.y, z: playerPos.z };
        // Stop short of target
        const stop = Math.max(0.6, dist - 0.8);
        const s = stop / dist;
        this.to = {
            x: playerPos.x + dx * s,
            y: playerPos.y + dy * 0.3,
            z: playerPos.z + dz * s,
        };
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
     * @returns {{ active:boolean, x?:number, y?:number, z?:number, invuln:boolean, cancelled?:boolean }}
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
                const t1 = Math.min(1, e - (steps - 1 - i) / steps);
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
            return { active: false, x, y, z, invuln: true };
        }
        return { active: true, x, y, z, invuln: true };
    }
}
