// Puts the Bulwark Shield on the hero's off hand once they have found it.
//
// Parented to the rig's `handL` pivot, which the actor animator raises for the
// guard pose, so the shield inherits the raise for free and can never be up
// while the arm is down. Same reasoning as HeldWeapon: animating a prop
// separately and matching it to the body by hand is how the two drift apart.

import { buildShieldModel, SHIELD_OFFSET, SHIELD_TILT } from '../assets/weapon-models.js';
import { gearRoleMap, DEFAULT_GEAR } from '../assets/gear-skins.js';

export class HeldShield {
    /** @param {THREE.Object3D} rigRoot the actor's root group */
    constructor(rigRoot) {
        this.rigRoot = rigRoot;
        this.shown = false;
        // Same reasoning as HeldWeapon: visibility alone is not enough to
        // decide whether the prop in the hand is still the right prop.
        this.skin = DEFAULT_GEAR;
        this.model = null;
        this.mount = null;
        this._findMount();
    }

    _findMount() {
        if (!this.rigRoot) return;
        let handL = null;
        let arm = null;
        this.rigRoot.traverse((o) => {
            if (!handL && o.name === 'handL') handL = o;
            if (!arm && o.name === 'armL') arm = o;
        });
        this.mount = handL || arm;
    }

    /** Show or hide, in `skinId`. A no-op unless one of the two changed. */
    set(visible, skinId = DEFAULT_GEAR) {
        const want = !!visible;
        if (want === this.shown && skinId === this.skin) return;
        this.shown = want;
        this.skin = skinId;
        if (!want) {
            this.clear();
            return;
        }
        if (!this.mount) this._findMount();
        if (!this.mount) return;
        // Rebuilt rather than repainted. The shield is torn down and remade
        // every time it is raised anyway, so there is no live-recolour path to
        // keep correct — unlike the hero, who is on screen continuously and had
        // to grow one.
        this.clear();
        const model = buildShieldModel(gearRoleMap(skinId, 'shield'));
        model.position.set(SHIELD_OFFSET.x, SHIELD_OFFSET.y, SHIELD_OFFSET.z);
        model.rotation.set(SHIELD_TILT.x, 0, SHIELD_TILT.z);
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
        this.shown = false;
        this.mount = null;
    }
}
