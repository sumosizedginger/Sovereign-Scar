// Foreground occlusion controller (Ticket D / Change 2.2).
//
// The follow camera always sits south of and above its look target, so tall
// forms between the camera and a subject (player or engaged boss) can hide the
// fight. This controller fades ONLY meshes explicitly registered as occluders
// — decorative columns, arches, and large non-interactive props that opt in via
// `userData.occluder === true`. Doors, hazards, enemies, pickups, telegraphs,
// and the merged room shell are never registered, so they are never faded.
//
// It "projects from camera to subject" (the audit's sanctioned alternative to
// scene raycasting): each occluder's cached world centre is projected onto the
// camera→subject segment and fades when it lands in front of the subject and
// within its own radius of the sightline. This is allocation-free per frame and
// runs without a GL context, so the decision + fade math are unit-testable.

import * as THREE from 'three';

const FADE_TARGET = 0.28;        // faded opacity — inside the audit's 20–35% band
const FADE_IN_RATE = 1 / 0.13;   // ~130 ms to fade a fresh occluder down
const FADE_OUT_RATE = 1 / 0.16;  // ~160 ms to restore once the line of sight clears
const DEPTH_CUTOFF = 0.6;        // "substantially faded" → stop writing depth
const EPS = 0.001;

/**
 * True when `occ` (centre + radius) sits between `cam` and `subject` on the
 * sightline. t is the projection parameter along the segment: values at or past
 * the ends are behind the camera or beyond the subject and never occlude.
 */
export function isOccluding(cam, subject, occ, radius) {
    const ax = subject.x - cam.x, ay = subject.y - cam.y, az = subject.z - cam.z;
    const len2 = ax * ax + ay * ay + az * az;
    if (len2 < 1e-6) return false;
    const bx = occ.x - cam.x, by = occ.y - cam.y, bz = occ.z - cam.z;
    const t = (bx * ax + by * ay + bz * az) / len2;
    if (t <= 0.02 || t >= 0.98) return false;
    const dx = bx - ax * t, dy = by - ay * t, dz = bz - az * t;
    return (dx * dx + dy * dy + dz * dz) <= radius * radius;
}

/** Advance a 0 (clear/opaque) → 1 (fully faded) progress value toward its goal. */
export function stepFade(f, occluding, dt) {
    f += (occluding ? FADE_IN_RATE : -FADE_OUT_RATE) * dt;
    return f < 0 ? 0 : f > 1 ? 1 : f;
}

export function opacityFor(f) {
    return 1 - f * (1 - FADE_TARGET);
}

export function depthWriteFor(f) {
    return f < DEPTH_CUTOFF;
}

export class OcclusionController {
    constructor() {
        this._occ = [];         // registered occluders + saved material state
        this._subjects = [];     // {x,y,z} tracked this frame (player, boss)
        this._cam = { x: 0, y: 0, z: 0 };
    }

    /**
     * Register a mesh (or group) as a fadeable occluder. Its world centre and a
     * bounding radius are cached once — occluders are static decoration, so we
     * never recompute them per frame. Original material flags are stored so
     * `clear()`/restore is exact.
     */
    register(mesh, opts = {}) {
        if (!mesh) return;
        const center = opts.center || this._worldCenter(mesh);
        const radius = opts.radius != null ? opts.radius : this._worldRadius(mesh, center);
        const mats = [];
        mesh.traverse ? mesh.traverse((o) => this._collectMats(o, mats))
            : this._collectMats(mesh, mats);
        if (!mats.length) return;
        this._occ.push({ mesh, center, radius, f: 0, mats });
    }

    _collectMats(o, out) {
        if (!o || !o.isMesh || !o.material) return;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of list) {
            out.push({
                mat,
                opacity: mat.opacity,
                transparent: mat.transparent,
                depthWrite: mat.depthWrite,
            });
        }
    }

    _worldCenter(mesh) {
        if (mesh.getWorldPosition) {
            mesh.updateWorldMatrix?.(true, false);
            _w.set(0, 0, 0);
            mesh.getWorldPosition(_w);
            return { x: _w.x, y: _w.y, z: _w.z };
        }
        const p = mesh.position || { x: 0, y: 0, z: 0 };
        return { x: p.x, y: p.y, z: p.z };
    }

    _worldRadius(mesh, center) {
        // Prefer a real bounding sphere; fall back to a generous default so a
        // registered occluder always has some coverage.
        try {
            if (mesh.geometry) {
                mesh.geometry.computeBoundingSphere?.();
                const bs = mesh.geometry.boundingSphere;
                if (bs) {
                    const s = mesh.scale ? Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z) : 1;
                    return Math.max(0.6, bs.radius * s);
                }
            }
        } catch (_) { /* fall through */ }
        return 1.2;
    }

    /** Scan a scene subtree and register everything tagged `userData.occluder`. */
    scan(root) {
        if (!root || !root.traverse) return;
        root.traverse((o) => {
            if (o.isMesh && o.userData && o.userData.occluder) this.register(o);
        });
    }

    setCamera(pos) {
        if (pos) { this._cam.x = pos.x; this._cam.y = pos.y; this._cam.z = pos.z; }
    }

    /** Replace the tracked subjects (skips null entries — e.g. no live boss). */
    setSubjects(list) {
        this._subjects.length = 0;
        for (const s of list) if (s) this._subjects.push(s);
    }

    /** Restore every occluder and forget them (call on level change). */
    clear() {
        for (const o of this._occ) this._restore(o);
        this._occ.length = 0;
        this._subjects.length = 0;
    }

    _restore(o) {
        for (const m of o.mats) {
            m.mat.opacity = m.opacity;
            m.mat.transparent = m.transparent;
            m.mat.depthWrite = m.depthWrite;
        }
    }

    update(dt) {
        if (!this._occ.length) return;
        for (const o of this._occ) {
            let occluding = false;
            for (let i = 0; i < this._subjects.length; i++) {
                if (isOccluding(this._cam, this._subjects[i], o.center, o.radius)) {
                    occluding = true;
                    break;
                }
            }
            o.f = stepFade(o.f, occluding, dt);
            if (o.f <= EPS) {
                this._restore(o);
                continue;
            }
            const op = opacityFor(o.f);
            const dw = depthWriteFor(o.f);
            for (const m of o.mats) {
                m.mat.transparent = true;
                m.mat.opacity = op;
                m.mat.depthWrite = dw;
            }
        }
    }
}

// Scratch vector reused by _worldCenter so registration allocates nothing extra
// per call. Kept module-local and never returned.
const _w = new THREE.Vector3();
