// One rule for who casts and who receives.
//
// This used to be decided at every construction site independently, and the
// result was 37 casters and 7 receivers out of 151 meshes: eleven of the
// fourteen bosses received nothing, no pickup cast anything, and the hero's
// weapon opted out of both. Objects read as pasted on top of the world because
// most of them were not participating in its light at all.
//
// The rule:
//
//   * everything solid CASTS — the shadow map is already being rendered, so a
//     caster is close to free
//   * everything solid RECEIVES, unless it is glowing or transparent
//   * anything that does not receive must say WHY, in `userData.shadowExempt`
//
// That last line is the part that matters. `shadowCensus()` counts any solid,
// non-glowing mesh without a written reason as a miss, so the way to leave
// something out is to state the case for it — not to forget it. Chasing an
// emissive-intensity threshold instead was how two boss parts and a grapple
// claw sat just under the cutoff and looked like defects.

/**
 * A material that is emitting light. Shading it with the room's shadows makes
 * it read as a painted highlight rather than as something lit from inside, so
 * glowing surfaces cast but do not receive.
 */
export function isGlowing(material) {
    if (!material) return false;
    const hex = material.emissive?.getHex?.() ?? 0;
    return hex !== 0 && (material.emissiveIntensity ?? 1) > 0;
}

/** A material that light passes through — motes, smears, rings, fog planes. */
export function isSeeThrough(material) {
    if (!material) return true;
    if (material.transparent || material.wireframe) return true;
    return material.opacity != null && material.opacity < 1;
}

/**
 * Apply the rule to `root` and everything under it.
 *
 * @param {THREE.Object3D} root
 * @param {{exempt?: string, cast?: boolean}} opts
 *   `exempt` marks the whole subtree as a deliberate non-receiver with a
 *   reason; `cast` can be set false for things that should not appear in the
 *   shadow map at all.
 */
export function markShadowRoles(root, opts = {}) {
    if (!root?.traverse) return;
    const { exempt = null, cast = true } = opts;
    root.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        const seeThrough = isSeeThrough(m);
        o.castShadow = cast && !seeThrough;
        if (exempt) {
            o.receiveShadow = false;
            o.userData.shadowExempt = exempt;
            return;
        }
        if (seeThrough) {
            o.receiveShadow = false;
            o.userData.shadowExempt = 'transparent — light passes through it';
            return;
        }
        if (isGlowing(m)) {
            o.receiveShadow = false;
            o.userData.shadowExempt = 'emissive — it is the light, not the lit';
            return;
        }
        o.receiveShadow = true;
        delete o.userData.shadowExempt;
    });
}
