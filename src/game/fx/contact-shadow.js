// Contact shadows — a soft dark disc on the floor under every actor and pickup.
//
// This is the cheapest grounding cue there is, and it does a job the real
// shadow map cannot. A cast shadow needs the caster, the receiver and the light
// to line up; miss any of those and the object floats. A contact disc is always
// directly beneath the thing it belongs to, so it reads even when the sun is
// behind a wall, even when the shadow falls off-screen, and even in the rooms
// the key light's frustum never reached.
//
// It also encodes height, which the shadow map does not do legibly at this
// camera angle: the disc shrinks and lightens as the actor rises, so a dashing
// player and a hovering mote both tell you how far off the ground they are.
//
// Cost: one shared geometry, one shared material, one shared 64×64 texture. The
// discs are separate meshes (one draw call each, ~8 in a busy room) because a
// disc has to sit at its own ground height, which instancing would not make
// cheaper at this count.

import * as THREE from 'three';

/** Disc radius as a multiple of the actor's hit radius. */
const RADIUS_SCALE = 1.35;
/** Height above the actor's ground at which the disc has faded out entirely. */
const FADE_HEIGHT = 4.0;
/** Lift above the floor, to stay out of z-fighting range. */
const LIFT = 0.03;
/** How long the actor's Y must hold steady before it counts as new ground. */
const SETTLE_TIME = 0.15;

let sharedGeo = null;
let sharedMat = null;
let sharedTex = null;

/** 64×64 radial gradient, opaque in the middle, transparent at the rim. */
function buildFalloffTexture() {
    if (typeof document === 'undefined') return null; // headless unit runs
    const N = 64;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    // Not linear: a linear ramp reads as a grey plate with a hard edge. The
    // squared falloff keeps the core dark and lets the rim vanish.
    grad.addColorStop(0.00, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.72)');
    grad.addColorStop(0.75, 'rgba(255,255,255,0.26)');
    grad.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, N, N);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function getGeo() {
    if (!sharedGeo) {
        sharedGeo = new THREE.CircleGeometry(1, 24);
        // Built in XY, laid flat once here so no disc pays for its own rotation.
        sharedGeo.rotateX(-Math.PI / 2);
    }
    return sharedGeo;
}

function getMat() {
    if (!sharedMat) {
        sharedTex = buildFalloffTexture();
        sharedMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.42,
            alphaMap: sharedTex || undefined,
            depthWrite: false,   // never occlude what stands on it
            polygonOffset: true, // and never fight the floor it sits on
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
        });
    }
    return sharedMat;
}

export class ContactShadows {
    /**
     * @param {THREE.Scene} scene
     * @param {{enabled?: boolean}} opts
     */
    constructor(scene, opts = {}) {
        this.scene = scene;
        this.enabled = opts.enabled !== false;
        /** @type {Map<object, object>} target object -> entry */
        this.entries = new Map();
    }

    /** Number of live discs. */
    get count() {
        return this.entries.size;
    }

    /**
     * Attach a disc to `target` (any Object3D). Idempotent — calling twice for
     * the same target returns the existing entry.
     */
    add(target, { radius = 0.55 } = {}) {
        if (!target || this.entries.has(target)) return this.entries.get(target) || null;
        const mesh = new THREE.Mesh(getGeo(), getMat());
        mesh.renderOrder = 2;
        mesh.frustumCulled = true;
        mesh.name = 'contact-shadow';
        const pos = target.position;
        mesh.position.set(pos.x, pos.y + LIFT, pos.z);
        this.scene.add(mesh);
        const entry = {
            target,
            mesh,
            radius: radius * RADIUS_SCALE,
            groundY: pos.y,
            lastY: pos.y,
            steadyT: 0,
        };
        this.entries.set(target, entry);
        return entry;
    }

    remove(target) {
        const e = this.entries.get(target);
        if (!e) return;
        if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
        this.entries.delete(target);
    }

    /**
     * Reconcile the disc set against what is currently alive, then move every
     * disc. Driven from the frame loop rather than from each spawn site, so a
     * new enemy kind cannot be added without a shadow by forgetting a call.
     */
    sync(dt, { player, enemies = [], pickups = [], boss = null } = {}) {
        if (!this.enabled) return;
        const live = new Set();

        const want = (obj, radius) => {
            if (!obj) return;
            live.add(obj);
            if (!this.entries.has(obj)) this.add(obj, { radius });
        };

        if (player?.rig) want(player.rig, 0.5);
        for (const e of enemies) {
            if (!e || e.state?.current === 'DEAD') continue;
            const root = e.rig || e.root || e.mesh;
            want(root, e.hitRadius || 0.55);
        }
        if (boss) want(boss.root || boss.mesh, (boss.hitRadius || 1.1) * 1.1);
        for (const p of pickups) {
            if (!p || p.taken) continue;
            want(p.mesh, 0.34);
        }

        for (const target of [...this.entries.keys()]) {
            if (!live.has(target) || !target.parent) this.remove(target);
        }

        for (const e of this.entries.values()) this._step(e, dt);
    }

    _step(e, dt) {
        const p = e.target.position;

        // Resolve the ground the disc should sit on.
        //
        // There is no height query in the collision world — it is XZ-only — so
        // the actor's own Y is the only evidence available. Falling to a lower
        // surface is unambiguous and adopted immediately. RISING is not: it is
        // either a jump (the disc must stay down, which is what sells the jump)
        // or stepping onto a platform (the disc must come up). They are told
        // apart by how long the new height holds — a jump does not hold still.
        if (p.y <= e.groundY) {
            e.groundY = p.y;
            e.steadyT = 0;
        } else if (Math.abs(p.y - e.lastY) < 0.01) {
            e.steadyT += dt;
            if (e.steadyT > SETTLE_TIME) e.groundY = p.y;
        } else {
            e.steadyT = 0;
        }
        e.lastY = p.y;

        const height = Math.max(0, p.y - e.groundY);
        if (height >= FADE_HEIGHT) {
            e.mesh.visible = false;
            return;
        }
        e.mesh.visible = e.target.visible !== false;
        // Grows a little and thins a lot with height — a shadow spreading as it
        // softens is what altitude looks like.
        const t = height / FADE_HEIGHT;
        const s = e.radius * (1 + t * 0.55);
        e.mesh.scale.set(s, 1, s);
        e.mesh.position.set(p.x, e.groundY + LIFT, p.z);
    }

    clear() {
        for (const target of [...this.entries.keys()]) this.remove(target);
    }

    dispose() {
        this.clear();
    }
}

/** Release the module-level shared resources (test teardown). */
export function disposeContactShadowResources() {
    sharedGeo?.dispose();
    sharedMat?.dispose();
    sharedTex?.dispose();
    sharedGeo = sharedMat = sharedTex = null;
}
