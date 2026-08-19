// Puts the equipped weapon in the hero's hand and keeps it there.
//
// Parented to the rig's `armR` shoulder pivot, which the actor animator already
// rotates for every swing, walk cycle and hit reaction. Hanging the weapon off
// that pivot means it inherits all of that animation for free and can never
// drift out of sync with the arm — the failure mode you get from animating a
// weapon separately and matching it to the body by hand.

import { buildWeaponModel, HAND_OFFSET, HAND_TILT } from '../assets/weapon-models.js';
import { gearRoleMap, DEFAULT_GEAR } from '../assets/gear-skins.js';

export class HeldWeapon {
    /** @param {import('three').Object3D} rigRoot the actor's root group */
    constructor(rigRoot) {
        this.rigRoot = rigRoot;
        // The cache key is the weapon AND the skin. It used to be the weapon
        // alone, which was correct while a weapon had exactly one look —
        // afterwards it would have swallowed every skin change silently, since
        // the id does not move when you re-dress the blade you are holding.
        this.current = null;
        this.skin = DEFAULT_GEAR;
        this.model = null;
        this.mount = null;
        this._findMount();
    }

    _findMount() {
        if (!this.rigRoot) return;
        // The pivot is named by the rig builder; searching by name rather than
        // by traversal index keeps this working if the rig gains parts.
        // `hand` is the far end of the arm and the correct socket; `armR` is
        // the shoulder, kept as a fallback so rigs built before the hand pivot
        // existed still hold their weapon rather than throwing.
        let hand = null;
        let arm = null;
        this.rigRoot.traverse((o) => {
            if (!hand && o.name === 'hand') hand = o;
            if (!arm && o.name === 'armR') arm = o;
        });
        this.mount = hand || arm;
    }

    /**
     * Swap to `id` wearing `skinId`. Cheap to call every frame — a no-op
     * unless one of the two actually changed.
     */
    set(id, skinId = DEFAULT_GEAR) {
        if (id === this.current && skinId === this.skin) return;
        this.current = id;
        this.skin = skinId;
        this.clear();
        if (!this.mount) this._findMount();
        if (!this.mount) return;
        const model = buildWeaponModel(id, gearRoleMap(skinId, 'weapon'));
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
