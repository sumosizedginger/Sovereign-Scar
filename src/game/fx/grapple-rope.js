// The grapple, made visible.
//
// The Magnetic Grapple had no visuals whatsoever — no rope, no hook, no anchor
// highlight. The player pressed G and was somewhere else. A traversal verb you
// cannot see reads as a teleport, and worse, an *unreliable* teleport: when the
// pull failed because the path was blocked, nothing on screen explained why.
//
// Three parts, each answering a question the player was left to guess:
//   the hook      — did it fire, and at what?
//   the rope      — what is it attached to right now?
//   the anchor    — what can I even grapple from here?
//
// Drawn with additive lines and small boxes so it reads over dark dungeon
// floors without needing a light.

import * as THREE from 'three';

const ROPE_COLOR = 0x9ad0ff;
const ANCHOR_COLOR = 0x7fe0ff;

export class GrappleRope {
    constructor(scene) {
        this.scene = scene;

        // Rope: a two-point line, rebuilt each frame from the live positions.
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        this.rope = new THREE.Line(geo, new THREE.LineBasicMaterial({
            color: ROPE_COLOR,
            transparent: true,
            opacity: 0.9,
            depthTest: false,           // never lost behind a wall mid-flight
            blending: THREE.AdditiveBlending,
        }));
        this.rope.renderOrder = 890;
        this.rope.visible = false;
        this.rope.frustumCulled = false;
        scene.add(this.rope);

        // Hook: a small claw that travels the rope.
        this.hook = new THREE.Group();
        const metal = new THREE.MeshStandardMaterial({
            color: 0xcfe6f5, metalness: 0.7, roughness: 0.3,
            emissive: ANCHOR_COLOR, emissiveIntensity: 0.5,
        });
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.34), metal);
        this.hook.add(shaft);
        for (const s of [-1, 1]) {
            const prong = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.2), metal);
            prong.position.set(s * 0.1, 0, 0.2);
            prong.rotation.y = s * 0.4;
            this.hook.add(prong);
        }
        this.hook.visible = false;
        this.hook.renderOrder = 891;
        scene.add(this.hook);

        this._t = 0;
    }

    /**
     * @param {object|null} state `{ from, to, u }` while a pull is running,
     *   where `u` is 0..1 progress; null when idle.
     */
    update(dt, state) {
        this._t += dt;
        if (!state) {
            this.rope.visible = false;
            this.hook.visible = false;
            return;
        }
        const { from, to, u } = state;

        // The hook leads the player: it reaches the anchor in the first third
        // of the move, and the body follows. That ordering is what makes the
        // pull read as a pull rather than as a slide.
        const reach = Math.min(1, u / 0.33);
        const hx = from.x + (to.x - from.x) * reach;
        const hy = (from.y || 0) + ((to.y || 0) - (from.y || 0)) * reach + 0.6;
        const hz = from.z + (to.z - from.z) * reach;

        // The near end tracks the player as they are dragged in.
        const px = from.x + (to.x - from.x) * u;
        const py = (from.y || 0) + ((to.y || 0) - (from.y || 0)) * u + 1.1;
        const pz = from.z + (to.z - from.z) * u;

        const pos = this.rope.geometry.attributes.position;
        pos.setXYZ(0, px, py, pz);
        pos.setXYZ(1, hx, hy, hz);
        pos.needsUpdate = true;
        this.rope.geometry.computeBoundingSphere();
        this.rope.visible = true;
        // The line thins out as the slack is taken up.
        this.rope.material.opacity = 0.55 + 0.45 * (1 - u);

        this.hook.position.set(hx, hy, hz);
        this.hook.lookAt(px, py, pz);
        this.hook.visible = true;
    }

    dispose() {
        this.rope.geometry.dispose();
        this.rope.material.dispose();
        this.scene.remove(this.rope);
        this.hook.traverse((o) => {
            o.geometry?.dispose?.();
            o.material?.dispose?.();
        });
        this.scene.remove(this.hook);
    }
}

/**
 * A pulsing marker on every anchor within range.
 *
 * Grapple points were indistinguishable from ordinary scenery, so the item's
 * whole traversal layer was invisible until a walkthrough told you where to
 * stand. Highlighting them only inside range also teaches the range itself,
 * which no toast ever managed to.
 */
export class AnchorMarkers {
    constructor(scene, budget = 12) {
        this.scene = scene;
        this.pool = [];
        for (let i = 0; i < budget; i++) {
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.45, 0.07, 6, 16),
                new THREE.MeshBasicMaterial({
                    color: ANCHOR_COLOR,
                    transparent: true,
                    opacity: 0.7,
                    depthTest: false,
                    blending: THREE.AdditiveBlending,
                })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.renderOrder = 880;
            ring.visible = false;
            scene.add(ring);
            this.pool.push(ring);
        }
        this._t = 0;
    }

    /** @param {Array<{x,y,z}>} anchors world positions already filtered by range */
    update(dt, anchors = []) {
        this._t += dt;
        const pulse = 0.55 + Math.sin(this._t * 3.2) * 0.25;
        for (let i = 0; i < this.pool.length; i++) {
            const ring = this.pool[i];
            const a = anchors[i];
            if (!a) { ring.visible = false; continue; }
            ring.position.set(a.x, (a.y || 1) + 0.12, a.z);
            ring.material.opacity = pulse;
            ring.scale.setScalar(0.9 + Math.sin(this._t * 3.2 + i) * 0.08);
            ring.visible = true;
        }
    }

    dispose() {
        for (const r of this.pool) {
            r.geometry.dispose();
            r.material.dispose();
            this.scene.remove(r);
        }
        this.pool.length = 0;
    }
}
