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
        this._focus = null; // { t, dur, toH, toB, target } — boss-intro push-in
    }

    /** Snap immediately over target. */
    snapTo(target) {
        const x = target.x, y = target.y || 0, z = target.z;
        this._pos.x = x;
        this._pos.y = y + this.height;
        this._pos.z = z + this.back;
        camera.position.set(this._pos.x, this._pos.y, this._pos.z);
        camera.lookAt(x, y + this.lookY, z);
    }

    /**
     * Temporary push-in (boss intro): dips toward {height, back} and eases
     * back out over `duration` seconds. Optional `target` {x,y,z} blends the
     * look-at toward a point of interest at peak.
     */
    focus({ height = 10, back = 6, duration = 1.8, target = null } = {}) {
        this._focus = { t: 0, dur: duration, toH: height, toB: back, target };
    }

    update(dt, target) {
        if (!target) return;
        let x = target.x, y = target.y || 0, z = target.z;
        let effH = this.height, effB = this.back;

        if (this._focus) {
            const f = this._focus;
            f.t += dt;
            const u = Math.min(1, f.t / f.dur);
            const k = Math.sin(Math.PI * u); // 0 → 1 → 0 dip
            effH = this.height + (f.toH - this.height) * k;
            effB = this.back + (f.toB - this.back) * k;
            if (f.target) {
                x += (f.target.x - x) * k * 0.8;
                y += ((f.target.y || 0) - y) * k * 0.8;
                z += (f.target.z - z) * k * 0.8;
            }
            if (u >= 1) this._focus = null;
        }

        const tx = x;
        const ty = y + effH;
        const tz = z + effB;
        const k = 1 - Math.exp(-this.lerp * dt);
        this._pos.x += (tx - this._pos.x) * k;
        this._pos.y += (ty - this._pos.y) * k;
        this._pos.z += (tz - this._pos.z) * k;

        const s = juice.shakeOffset();
        camera.position.set(this._pos.x + s.x, this._pos.y + s.y, this._pos.z + s.z);
        camera.lookAt(x, y + this.lookY, z);
    }
}
