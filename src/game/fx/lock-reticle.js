// Z4 — the lock-on marker.
//
// A lock the player cannot see is a lock they will not trust. From a camera at
// height 17.5 an enemy is a small shape among several, so the reticle has to
// answer "which one" at a glance and from directly overhead: a flat ring on the
// ground under the target, which the top-down rig reads perfectly, plus a
// spinning bracket that makes it unmistakably UI rather than level geometry.

import * as THREE from 'three';

const RING_COLOR = 0xffd060;

export class LockReticle {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.visible = false;

        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.62, 0.78, 28),
            new THREE.MeshBasicMaterial({
                color: RING_COLOR, transparent: true, opacity: 0.9,
                side: THREE.DoubleSide, depthWrite: false, depthTest: false,
            })
        );
        ring.rotation.x = -Math.PI / 2;
        this.group.add(ring);

        // Four corner ticks that counter-rotate against the ring. Cheap, and
        // it is the motion — not the colour — that separates the marker from
        // the warm floor palettes half the dungeons already use.
        this.ticks = new THREE.Group();
        for (let i = 0; i < 4; i++) {
            const tick = new THREE.Mesh(
                new THREE.PlaneGeometry(0.34, 0.09),
                new THREE.MeshBasicMaterial({
                    color: RING_COLOR, transparent: true, opacity: 0.95,
                    side: THREE.DoubleSide, depthWrite: false, depthTest: false,
                })
            );
            const a = (i / 4) * Math.PI * 2;
            tick.position.set(Math.cos(a) * 1.02, 0, Math.sin(a) * 1.02);
            tick.rotation.x = -Math.PI / 2;
            tick.rotation.z = -a;
            this.ticks.add(tick);
        }
        this.group.add(this.ticks);

        // Render last so the marker is never swallowed by arena floor decals.
        this.group.renderOrder = 900;
        scene.add(this.group);
        this._t = 0;
    }

    update(dt, target) {
        this._t += dt;
        const root = target && (target.root || target.mesh);
        if (!root) {
            this.group.visible = false;
            return;
        }
        this.group.visible = true;
        // Sit on the floor beneath the target rather than at its centre: an
        // enemy rig's origin is its feet, a boss's is its middle, and a ring
        // floating at chest height reads as a halo, not a target marker.
        const footY = target.floorY != null ? target.floorY : root.position.y;
        this.group.position.set(root.position.x, footY + 0.07, root.position.z);
        const s = 1 + Math.max(0, (target.hitRadius || 0.5) - 0.5) * 0.9;
        this.group.scale.setScalar(s);
        this.ticks.rotation.y = this._t * 1.6;
    }

    dispose() {
        this.group.traverse((c) => {
            c.geometry?.dispose();
            c.material?.dispose();
        });
        if (this.group.parent) this.group.parent.remove(this.group);
    }
}
