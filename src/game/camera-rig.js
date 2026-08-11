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
        this._kick = null;  // { t, dur, depth } — Phase F2 killing-blow pull-in
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

    /**
     * The point the frame is centred on, in world XZ.
     *
     * This is the look-at target, NOT the player. They are the same thing almost
     * always — but during two-subject boss framing the frame deliberately slides
     * toward the midpoint, and during a `focus()` push-in it slides toward the
     * point of interest. Audio placement reads this rather than the player so
     * that what you hear on the left is what is drawn on the left. Panning off
     * the player instead would put a boss dead centre of the screen slightly to
     * one side of your ears, which is worse than not panning at all.
     */
    focusPoint() {
        return { x: this._look.x, z: this._look.z };
    }

    /**
     * Half the frame's width on the floor plane, in world units.
     *
     * Derived from the LIVE rig position rather than from `height`/`back`, so it
     * follows the push-in and the two-subject widen — both of which change how
     * much world is on screen, and therefore what "at the edge of the frame"
     * means for a pan. Shake is excluded on purpose: a sound source should not
     * wobble across the stereo field because the camera got hit.
     */
    viewHalfWidth() {
        const dist = Math.hypot(
            this._pos.x - this._look.x,
            this._pos.y - this._look.y,
            this._pos.z - this._look.z,
        );
        const halfV = Math.tan(((camera.fov || 65) * Math.PI / 180) / 2) * dist;
        return Math.max(1, halfV * (camera.aspect || 1.6));
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

    /**
     * Go somewhere and STAY there, until `releaseHold` lets go.
     *
     * Deliberately not `focus()`, for the same reason `kick()` is not: `focus`
     * is a `sin()` dip that always comes home, which is exactly right for a boss
     * card and useless for a cutscene. A scripted shot has to point at a thing
     * and remain pointed at it for as long as the beat lasts.
     *
     * It also takes the look-at all the way to the target rather than `focus`'s
     * 0.8 — a held shot that only mostly looks at the thing is a mistake, not a
     * style. `bounds` still clamps: a cutscene must not be the one place in the
     * game that shows the void past a room wall.
     */
    hold({ target = null, height = null, back = null, duration = 1.2 } = {}) {
        this._hold = {
            t: 0,
            dur: Math.max(0.01, duration),
            toH: height != null ? height : this.height,
            toB: back != null ? back : this.back,
            target,
            releasing: false,
        };
    }

    /** Ease back to the player. Safe to call when nothing is held. */
    releaseHold(duration = 0.8) {
        const h = this._hold;
        if (!h || h.releasing) return;
        h.releasing = true;
        h.t = 0;
        h.dur = Math.max(0.01, duration);
    }

    /** Cancel an in-flight push-in — call on level change so a boss-intro
     * dip can never bleed its height/back blend into the next level.
     *
     * Drops a held shot too, and that is not tidiness. A hold survives by
     * design until something releases it, so a level change or room transition
     * during a cutscene would otherwise leave the camera parked on a point in a
     * world that no longer exists, with no one left holding the reference to
     * let go of it. The camera's version of a stuck flag. */
    clearFocus() {
        this._focus = null;
        this._kick = null;
        this._hold = null;
    }

    /**
     * Phase F2 — a brief pull-in on the killing blow.
     *
     * Deliberately NOT `focus()`. A kick must never cancel or be cancelled by a
     * boss intro: those two events can and do land on the same frame (the blow
     * that clears the last add as the boss card fires), and whichever one wrote
     * `_focus` last would have silently eaten the other. It is its own tiny
     * channel, it only ever subtracts height, and it cannot move the look-at —
     * so a camera that is already framing two subjects keeps framing them.
     */
    kick(duration = 0.35, depth = 0.5) {
        // A kick already in flight is REFRESHED, not stacked. Three kills in
        // half a second is a good moment, not three times the camera move.
        this._kick = { t: 0, dur: Math.max(0.05, duration), depth };
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

        if (this._kick) {
            const k = this._kick;
            k.t += dt;
            const u = Math.min(1, k.t / k.dur);
            const dip = Math.sin(Math.PI * u);
            effH -= k.depth * dip;
            effB -= k.depth * 0.35 * dip;
            if (u >= 1) this._kick = null;
        }

        // A held shot (cutscene). Eases in and then STAYS at full weight — no
        // `u >= 1` teardown here on purpose, that is what `releaseHold` is for.
        if (this._hold) {
            const h = this._hold;
            h.t += dt;
            const u = Math.min(1, h.t / h.dur);
            const w = h.releasing ? 1 - u : u;
            const k = w * w * (3 - 2 * w); // smoothstep, both directions
            effH = this.height + (h.toH - this.height) * k;
            effB = this.back + (h.toB - this.back) * k;
            if (h.target) {
                x += (h.target.x - x) * k;
                y += ((h.target.y || 0) - y) * k;
                z += (h.target.z - z) * k;
            }
            if (h.releasing && u >= 1) this._hold = null;
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
