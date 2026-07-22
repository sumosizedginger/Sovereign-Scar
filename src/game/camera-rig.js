// Top-down follow camera — never use engine updateCamera (belt-scroller).
// Juice shake is applied to the final camera position only, never to the
// lerp state, so trauma cannot drift the rig.

import { camera } from '../engine/renderer.js';
import { juice } from './fx/juice.js';

export class CameraRig {
    constructor(opts = {}) {
        this.height = opts.height != null ? opts.height : 18;
        this.back = opts.back != null ? opts.back : 12;
        this.lookY = opts.lookY != null ? opts.lookY : 0.5;
        this.lerp = opts.lerp != null ? opts.lerp : 8;
        this._pos = { x: 0, y: this.height, z: this.back };
        this._look = { x: 0, y: this.lookY, z: 0 };
        this._focus = null; // { t, dur, toH, toB, target } — boss-intro push-in
        this._bounds = null; // W2: room-lock rect for the look-at target
        this._second = null; // Ticket D: live second subject (boss) for two-subject framing
        this._secondW = 0; // smoothed engagement weight so framing eases in/out
    }

    /**
     * Ticket D: two-subject framing. While a live boss is engaged, the frame
     * splits its attention between player and boss — the look target slides
     * toward their midpoint and the rig pulls up/back just enough that both
     * fit, instead of the boss fighting from off-screen. Pass null to clear
     * (death, defeat, level change).
     */
    setSecondSubject(pos) {
        this._second = pos || null;
    }

    /**
     * W2: lock the look-at target inside a world rect (room bounds). The
     * clamp keeps the visible floor area inside the rect; rooms smaller than
     * the view resolve to their midpoint. Pass null to clear.
     */
    setBounds(bounds) {
        this._bounds = bounds || null;
    }

    _clampToBounds(x, z, effH, effB) {
        const b = this._bounds;
        if (!b) return { x, z };
        // Visible half-extents on the floor plane from fov/aspect/distance
        // (approximate: distance from camera to look-at point).
        const dist = Math.hypot(effH, effB);
        const halfV = Math.tan(((camera.fov || 65) * Math.PI / 180) / 2) * dist;
        const fx = Math.max(0, halfV * (camera.aspect || 1.6) * 0.8);
        const fz = Math.max(0, halfV * 0.6);
        x = (b.minX + fx > b.maxX - fx)
            ? (b.minX + b.maxX) / 2
            : Math.min(Math.max(x, b.minX + fx), b.maxX - fx);
        z = (b.minZ + fz > b.maxZ - fz)
            ? (b.minZ + b.maxZ) / 2
            : Math.min(Math.max(z, b.minZ + fz), b.maxZ - fz);
        return { x, z };
    }

    /** Snap immediately over target. */
    snapTo(target) {
        const x = target.x, y = target.y || 0, z = target.z;
        const c = this._clampToBounds(x, z, this.height, this.back);
        this._pos.x = c.x;
        this._pos.y = y + this.height;
        this._pos.z = c.z + this.back;
        this._look = { x: c.x, y: y + this.lookY, z: c.z };
        camera.position.set(this._pos.x, this._pos.y, this._pos.z);
        camera.lookAt(this._look.x, this._look.y, this._look.z);
    }

    /**
     * Temporary push-in (boss intro): dips toward {height, back} and eases
     * back out over `duration` seconds. Optional `target` {x,y,z} blends the
     * look-at toward a point of interest at peak.
     */
    focus({ height = 10, back = 6, duration = 1.8, target = null } = {}) {
        this._focus = { t: 0, dur: duration, toH: height, toB: back, target };
    }

    /** Cancel an in-flight push-in — call on level change so a boss-intro
     * dip can never bleed its height/back blend into the next level. */
    clearFocus() {
        this._focus = null;
    }

    update(dt, target) {
        if (!target) return;
        let x = target.x, y = target.y || 0, z = target.z;
        let effH = this.height, effB = this.back;

        if (this._focus) {
            const f = this._focus;
            f.t += dt;
            const u = Math.min(1, f.t / f.dur);
            const fk = Math.sin(Math.PI * u); // 0 → 1 → 0 dip
            effH = this.height + (f.toH - this.height) * fk;
            effB = this.back + (f.toB - this.back) * fk;
            if (f.target) {
                x += (f.target.x - x) * fk * 0.8;
                y += ((f.target.y || 0) - y) * fk * 0.8;
                z += (f.target.z - z) * fk * 0.8;
            }
            if (u >= 1) this._focus = null;
        }

        // Two-subject framing (Ticket D): weight eases toward 1 while a
        // second subject is set and inside engagement range, toward 0
        // otherwise, so the frame never snaps when a boss dies or leashes.
        const s2 = this._second;
        const engaged = s2 && Math.hypot(s2.x - x, s2.z - z) < 26 ? 1 : 0;
        this._secondW += (engaged - this._secondW) * Math.min(1, dt * 4);
        if (this._secondW > 0.01 && s2) {
            const w = 0.35 * this._secondW;
            const d = Math.hypot(s2.x - x, s2.z - z);
            x += (s2.x - x) * w;
            z += (s2.z - z) * w;
            // Pull up/back proportionally to separation so both subjects
            // stay inside the safe frame (capped: never a map view).
            const widen = Math.min(7, Math.max(0, d - 6) * 0.5) * this._secondW;
            effH += widen;
            effB += widen * 0.35;
        }

        const c = this._clampToBounds(x, z, effH, effB);
        const tx = c.x;
        const ty = y + effH;
        const tz = c.z + effB;
        const k = 1 - Math.exp(-this.lerp * dt);
        this._pos.x += (tx - this._pos.x) * k;
        this._pos.y += (ty - this._pos.y) * k;
        this._pos.z += (tz - this._pos.z) * k;
        // Look-at is lerped too so room transitions pan instead of snapping.
        this._look.x += (c.x - this._look.x) * k;
        this._look.y += (y + this.lookY - this._look.y) * k;
        this._look.z += (c.z - this._look.z) * k;

        const s = juice.shakeOffset();
        camera.position.set(this._pos.x + s.x, this._pos.y + s.y, this._pos.z + s.z);
        camera.lookAt(this._look.x, this._look.y, this._look.z);
    }
}
