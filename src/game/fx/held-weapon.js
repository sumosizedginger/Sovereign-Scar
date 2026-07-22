// Puts the equipped weapon in the hero's hand and keeps it there.
//
// Parented to the rig's `armR` shoulder pivot, which the actor animator already
// rotates for every swing, walk cycle and hit reaction. Hanging the weapon off
// that pivot means it inherits all of that animation for free and can never
// drift out of sync with the arm — the failure mode you get from animating a
// weapon separately and matching it to the body by hand.

import * as THREE from 'three';
import { buildWeaponModel, HAND_OFFSET, HAND_TILT } from '../assets/weapon-models.js';

export class HeldWeapon {
    /** @param {THREE.Object3D} rigRoot the actor's root group */
    constructor(rigRoot) {
        this.rigRoot = rigRoot;
        this.current = null;
        this.model = null;
        this.mount = null;
        this._findMount();
    }

    _findMount() {
        if (!this.rigRoot) return;
        // The pivot is named by the rig builder; searching by name rather than
        // by traversal index keeps this working if the rig gains parts.
        this.rigRoot.traverse((o) => {
            if (!this.mount && o.name === 'armR') this.mount = o;
        });
    }

    /** Swap to `id`. Cheap to call every frame — a no-op unless it changed. */
    set(id) {
        if (id === this.current) return;
        this.current = id;
        this.clear();
        if (!this.mount) this._findMount();
        if (!this.mount) return;
        const model = buildWeaponModel(id);
        if (!model) return;               // bare hands are a real state
        model.position.set(HAND_OFFSET.x, HAND_OFFSET.y, HAND_OFFSET.z);
        model.rotation.set(HAND_TILT.x, 0, HAND_TILT.z);
        this.mount.add(model);
        this.model = model;
    }

    clear() {
        if (!this.model) return;
        this.model.parent?.remove(this.model);
        this.model.traverse((o) => {
            o.geometry?.dispose?.();
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
            else o.material?.dispose?.();
        });
        this.model = null;
    }

    dispose() {
        this.clear();
        this.mount = null;
    }
}
