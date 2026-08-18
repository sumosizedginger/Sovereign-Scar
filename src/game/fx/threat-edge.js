// @ts-check
// src/game/fx/threat-edge.js
// A mark at the edge of the frame for an attack you cannot see.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
//
// `tests/qa/arena-frame.mjs` measured the gameplay frame and found that three
// of the five enemy kinds attack from beyond it:
//
//     kind                     acts at   frame reaches (shallow axis)
//     melee (sentinel/scarab)     1.4         6.18   on screen
//     bulwark charge              3.5         6.18   on screen
//     lancer (ranged)             7.0         6.18   OFF SCREEN
//     censer burst                9.0         6.18   OFF SCREEN
//     weaver strand              11.0         6.18   OFF SCREEN
//
// The camera is pitched 70.7°, which maps the screen's vertical axis onto a
// short run of world Z, so the frame is only about 13 units deep. The arena
// widen opens it to 13.8 and no further, because past that the cost comes out
// of a hero who is already only 34 px wide — and `tests/qa/hero-scale.mjs`
// shows hero size and frame depth are the same knob, so there is no camera
// setting that fixes this. Being hit by something you were never shown is a
// camera problem the camera cannot solve.
//
// So it is solved where it actually lives: the game already telegraphs every
// committed attack with a ring on the ground, and `Enemy._beginWindup` is the
// one choke point every one of them routes through. When the attacker is
// outside the frame, this puts a mark on the edge of the screen pointing at
// them, for exactly as long as the wind-up lasts. The player gets the same
// information in the same window — the promise the telegraph system already
// makes, extended to the attacks it could not keep it for.
//
// ── WHAT IT DELIBERATELY IS NOT ────────────────────────────────────────────
//
// Not a radar. It appears only for an attack that is ALREADY COMMITTED and
// disappears when that attack resolves, so it says "something is about to hit
// you from there" and never "there is an enemy over there". A permanent
// off-screen enemy indicator would remove the reason to look around a room,
// which is most of what exploring one is.

/** How far in from the frame edge the mark sits, as a fraction of the frame. */
const INSET = 0.045;
/**
 * NDC magnitude past which a subject counts as off screen.
 *
 * Slightly inside 1.0 — a body exactly on the boundary is half-drawn and half
 * cut, which is the worst case to leave unmarked because the player can see
 * something is there and not what it is doing.
 */
const EDGE = 0.94;
/** Never more than this many at once; past it the screen is a warning light. */
const MAX_MARKS = 4;

/**
 * Screen-edge warnings for committed attacks from outside the frame.
 *
 * DOM rather than scene geometry, and that is the cheap correct answer rather
 * than a compromise: the mark belongs to the FRAME, not to the world. Putting
 * it in the scene would mean solving for where the frame edge is in world space
 * every frame — bisection against the real projection, which the probe does and
 * which has no business in a hot loop — and it would then be occluded by the
 * very wall the attacker is standing behind.
 */
export class ThreatEdge {
    constructor() {
        this.enabled = true;
        this._marks = [];       // { pos, until, kind, el }
        this._root = null;
        this._pool = [];
    }

    _ensureRoot() {
        if (this._root || typeof document === 'undefined') return this._root;
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:6;'
            + 'overflow:hidden;';
        document.body.appendChild(el);
        this._root = el;
        return el;
    }

    _take() {
        const root = this._ensureRoot();
        if (!root) return null;
        const el = this._pool.pop() || (() => {
            const d = document.createElement('div');
            // A chevron, not a dot. A dot at the edge of the screen reads as a
            // UI blemish; a wedge pointing outward reads as a direction, and
            // direction is the entire payload.
            d.style.cssText = 'position:absolute;width:0;height:0;'
                + 'border-left:9px solid transparent;border-right:9px solid transparent;'
                + 'border-bottom:15px solid #ff5533;'
                + 'filter:drop-shadow(0 0 4px rgba(0,0,0,0.85));'
                + 'transform-origin:50% 66%;will-change:transform,opacity;';
            root.appendChild(d);
            return d;
        })();
        el.style.display = 'block';
        return el;
    }

    _release(el) {
        if (!el) return;
        el.style.display = 'none';
        this._pool.push(el);
    }

    /**
     * An attack has been committed from `pos`, resolving in `windup` seconds.
     *
     * Takes the live position object rather than a copy: the enemy holds still
     * through a wind-up by design, but a brood that splits or a body nudged by
     * separation would leave a copied mark pointing at where it used to be —
     * and pointing confidently at the wrong place is worse than not pointing.
     */
    mark(pos, windup, color) {
        if (!this.enabled || !pos || !(windup > 0)) return;
        // Refresh rather than stack: an enemy that re-telegraphs mid-wind-up is
        // one threat, not two.
        const found = this._marks.find((m) => m.pos === pos);
        if (found) { found.t = 0; found.dur = windup; return; }
        if (this._marks.length >= MAX_MARKS) return;
        this._marks.push({ pos, t: 0, dur: windup, color: color || '#ff5533', el: null });
    }

    /** Drop everything — room change, death, level load. */
    clear() {
        for (const m of this._marks) this._release(m.el);
        this._marks.length = 0;
    }

    /**
     * @param {number} dt
     * @param {{ project: Function }} camera a THREE camera, already updated
     * @param {{ x: number, y: number }} [size] frame size in CSS px
     */
    update(dt, camera, size) {
        if (!this._marks.length) return;
        const w = size?.x || (typeof window !== 'undefined' ? window.innerWidth : 1280);
        const h = size?.y || (typeof window !== 'undefined' ? window.innerHeight : 720);

        for (let i = this._marks.length - 1; i >= 0; i--) {
            const m = this._marks[i];
            m.t += dt;
            if (m.t >= m.dur) {
                this._release(m.el);
                m.el = null;
                this._marks.splice(i, 1);
                continue;
            }
            const ndc = this.project(m.pos, camera);
            if (!ndc || (Math.abs(ndc.x) < EDGE && Math.abs(ndc.y) < EDGE && !ndc.behind)) {
                // On screen: the telegraph ring is doing the job and a second
                // marker for the same attack is noise.
                this._release(m.el);
                m.el = null;
                continue;
            }
            const el = m.el || (m.el = this._take());
            if (!el) continue;

            // Push the direction out to the frame boundary, then inset.
            const k = 1 / Math.max(Math.abs(ndc.x), Math.abs(ndc.y) || 1e-6);
            const ex = ndc.x * k * (1 - INSET);
            const ey = ndc.y * k * (1 - INSET);
            const px = (ex * 0.5 + 0.5) * w;
            const py = (0.5 - ey * 0.5) * h;
            // The chevron's own art points up (+Y screen), so the rotation is
            // measured from that rather than from +X.
            const deg = Math.atan2(ex, ey) * 180 / Math.PI;
            // Ramp in over the first fifth of the wind-up so it does not pop,
            // and hold full through the dangerous part rather than fading out —
            // the last moment before a hit is the one that has to be legible.
            const a = Math.min(1, m.t / (m.dur * 0.2));
            el.style.borderBottomColor = m.color;
            el.style.opacity = String(0.35 + 0.65 * a);
            el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) `
                + `translate(-50%, -66%) rotate(${deg.toFixed(1)}deg)`;
        }
    }

    /**
     * World point to NDC, with the behind-camera case named.
     *
     * `Vector3.project` on a point behind the lens returns a value whose sign is
     * flipped on both axes, so a naive caller draws the mark on the opposite
     * edge from the threat. It cannot happen at this game's fixed 70.7° rig, and
     * it is handled anyway because the one thing worse than no arrow is an arrow
     * pointing away from the thing about to hit you.
     */
    project(pos, camera) {
        if (!camera?.matrixWorldInverse || !camera.projectionMatrix) return null;
        const e = camera.matrixWorldInverse.elements;
        const x = pos.x, y = pos.y, z = pos.z;
        const vx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const vy = e[1] * x + e[5] * y + e[9] * z + e[13];
        const vz = e[2] * x + e[6] * y + e[10] * z + e[14];
        const p = camera.projectionMatrix.elements;
        const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12];
        const cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13];
        const cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15];
        if (Math.abs(cw) < 1e-6) return null;
        const behind = cw < 0;
        const s = behind ? -1 : 1;
        return { x: (cx / cw) * s, y: (cy / cw) * s, behind };
    }

    dispose() {
        this.clear();
        for (const el of this._pool) el.remove?.();
        this._pool.length = 0;
        this._root?.remove?.();
        this._root = null;
    }
}

export const threatEdge = new ThreatEdge();
