// Held weapon meshes.
//
// The player carries five weapons and, until now, held none of them. The hero
// swung an empty fist whether they had the Anchor Link, the Tectonic Wedge, or
// the Light Caster; the only way to know what was equipped was to read a line
// of text in the corner of the HUD.
//
// That is a real cost, not a cosmetic one. Weapon identity is a combat-legibility
// problem: the Wedge has a 2.2 reach and the Mallet a 90° arc, so a player who
// cannot see which one is in their hand cannot predict what their own attack is
// about to do. The silhouette is the fastest possible readout, and it is the
// only one that stays visible while you are looking at the thing you are hitting.
//
// Built from boxes on purpose — everything else in this game is voxels, and a
// smooth sword in a blocky world reads as a bug.

import * as THREE from 'three';

/** Assemble a group from box specs, in the same units the actor rig uses. */
function boxes(specs) {
    const g = new THREE.Group();
    for (const s of specs) {
        const mat = new THREE.MeshStandardMaterial({
            color: s.color,
            roughness: s.rough != null ? s.rough : 0.7,
            metalness: s.metal != null ? s.metal : 0.15,
            emissive: s.emissive || 0x000000,
            emissiveIntensity: s.emissiveIntensity || 0,
        });
        const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), mat);
        m.position.set(s.x || 0, s.y || 0, s.z || 0);
        if (s.rx) m.rotation.x = s.rx;
        if (s.rz) m.rotation.z = s.rz;
        m.castShadow = false;
        m.receiveShadow = false;
        g.add(m);
    }
    return g;
}

/**
 * One builder per weapon id. Dimensions are in world units and sized against
 * the hero, who stands 1.95 tall — a blade a little under a metre reads as a
 * sword from a camera 17.5 units up without dominating the character.
 */
const BUILDERS = {
    // The salvaged chain-blade. Cyan, like its smear.
    anchor_link: () => boxes([
        { y: 0.10, w: 0.07, h: 0.20, d: 0.07, color: 0x3b4654, rough: 0.85 },       // grip
        { y: 0.23, w: 0.20, h: 0.05, d: 0.09, color: 0x8a94a4, metal: 0.5 },        // guard
        { y: 0.56, w: 0.10, h: 0.62, d: 0.04, color: 0xcfe6f5, metal: 0.65, rough: 0.3 }, // blade
        { y: 0.90, w: 0.06, h: 0.14, d: 0.04, color: 0x7fe0ff, metal: 0.3,          // charged tip
            emissive: 0x7fe0ff, emissiveIntensity: 0.8 },
        { y: 0.40, w: 0.13, h: 0.06, d: 0.05, color: 0x7fe0ff,                      // link band
            emissive: 0x7fe0ff, emissiveIntensity: 0.5 },
    ]),

    // Heavy splitting wedge. Gold, top-weighted — it should look like it hurts
    // to hold, because it swings slowly and hits for two.
    tectonic_wedge: () => boxes([
        { y: 0.12, w: 0.08, h: 0.30, d: 0.08, color: 0x4a3c22, rough: 0.9 },
        { y: 0.34, w: 0.14, h: 0.08, d: 0.12, color: 0x6b5a2e, metal: 0.4 },
        { y: 0.60, w: 0.30, h: 0.44, d: 0.16, color: 0xffd060, metal: 0.7, rough: 0.35 },
        { y: 0.86, w: 0.18, h: 0.14, d: 0.12, color: 0xfff0b0, metal: 0.6,
            emissive: 0xffd060, emissiveIntensity: 0.35 },
        { y: 0.60, x: 0.20, w: 0.12, h: 0.20, d: 0.10, color: 0xd4a84b, metal: 0.6 },
        { y: 0.60, x: -0.20, w: 0.12, h: 0.20, d: 0.10, color: 0xd4a84b, metal: 0.6 },
    ]),

    // Brass mallet: the widest arc in the game, so the widest silhouette.
    heavy_mallet: () => boxes([
        { y: 0.14, w: 0.08, h: 0.34, d: 0.08, color: 0x3a2f1c, rough: 0.95 },
        { y: 0.62, w: 0.42, h: 0.30, d: 0.26, color: 0xc9a227, metal: 0.75, rough: 0.4 },
        { y: 0.62, x: 0.24, w: 0.08, h: 0.24, d: 0.22, color: 0x8c6f18, metal: 0.7 },
        { y: 0.62, x: -0.24, w: 0.08, h: 0.24, d: 0.22, color: 0x8c6f18, metal: 0.7 },
        { y: 0.80, w: 0.30, h: 0.05, d: 0.20, color: 0xe8cf72, metal: 0.6 },
    ]),

    // Emitter rod — no blade at all, so its silhouette says "this one shoots".
    light_caster: () => boxes([
        { y: 0.12, w: 0.07, h: 0.24, d: 0.07, color: 0x2f3a44, rough: 0.8 },
        { y: 0.34, w: 0.11, h: 0.22, d: 0.11, color: 0x55636f, metal: 0.55 },
        { y: 0.58, w: 0.07, h: 0.28, d: 0.07, color: 0x8f9aa4, metal: 0.6 },
        { y: 0.78, w: 0.15, h: 0.10, d: 0.15, color: 0xfff0a0, metal: 0.2,
            emissive: 0xfff0a0, emissiveIntensity: 1.2 },
        { y: 0.88, w: 0.06, h: 0.10, d: 0.06, color: 0xffffff, metal: 0.1,
            emissive: 0xfff0a0, emissiveIntensity: 1.6 },
    ]),

    // bare_strike has no model on purpose: empty hands are the readable state
    // for "you have not found a weapon yet", and Beat 01 depends on it.
};

/**
 * The Bulwark Shield — prised off the predecessor's body in Beat 01.
 *
 * Guard and parry were innate and invisible: you held a button and nothing on
 * screen changed except three pips in the corner. A defensive verb the player
 * cannot see themselves performing is one they cannot learn the timing of, so
 * the shield exists to be *looked at* — wide enough to read as cover from the
 * overhead camera, and battered, because its last owner did not survive it.
 *
 * Built face-on in the XY plane so the guard pose can simply present it forward.
 */
export function buildShieldModel() {
    const g = boxes([
        { w: 0.62, h: 0.74, d: 0.07, color: 0x6d7480, metal: 0.45, rough: 0.55 }, // face
        { y: 0.30, w: 0.52, h: 0.10, d: 0.09, color: 0x8a94a4, metal: 0.55 },     // top band
        { y: -0.30, w: 0.52, h: 0.10, d: 0.09, color: 0x8a94a4, metal: 0.55 },    // bottom band
        { z: 0.06, w: 0.20, h: 0.22, d: 0.06, color: 0xd4a84b, metal: 0.7,        // boss sigil
            rough: 0.35 },
        { x: -0.26, w: 0.08, h: 0.62, d: 0.08, color: 0x4a5058, rough: 0.8 },     // edge rail
        { x: 0.26, w: 0.08, h: 0.62, d: 0.08, color: 0x4a5058, rough: 0.8 },
        { z: -0.09, w: 0.10, h: 0.30, d: 0.06, color: 0x3a2f1c, rough: 0.95 },    // grip strap
    ]);
    g.name = 'shield:bulwark_shield';
    return g;
}

/**
 * Where the shield sits on the off hand. It hangs off `handL`, so the guard
 * pose raises it by moving the arm rather than by animating the prop — the same
 * reason weapons hang off `hand`.
 */
export const SHIELD_OFFSET = { x: 0.0, y: -0.16, z: 0.10 };
export const SHIELD_TILT = { x: 1.35, z: -0.12 };

/** Ids that draw something. */
export const MODELLED_WEAPONS = Object.keys(BUILDERS);

/** Build a weapon mesh, or null for weapons that are meant to be invisible. */
export function buildWeaponModel(id) {
    const make = BUILDERS[id];
    if (!make) return null;
    const g = make();
    g.name = `weapon:${id}`;
    return g;
}

/**
 * Distance from the grip origin to the business end, along the blade axis.
 *
 * Measured off the built geometry rather than written down, because a hand-kept
 * number is one edit away from lying — and the swing specs use this to find the
 * tip in world space. If it drifts, they stop testing the tip.
 */
export function weaponTipY(id) {
    const m = buildWeaponModel(id);
    if (!m) return 0;
    const box = new THREE.Box3().setFromObject(m);
    const top = box.max.y;
    m.traverse((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
    });
    return top;
}

/**
 * Attach point on the actor rig, in the `hand` pivot's local space.
 *
 * The weapon parents to a rig pivot the animator already rotates, so it
 * inherits every swing for free and cannot drift out of sync with the arm.
 * It hangs off `hand` (the far end of the arm) rather than `armR` (the
 * shoulder) — mounted at the shoulder it swung on a radius twice the length of
 * the arm and read as growing out of the collarbone.
 *
 * THE TILT IS NOT COSMETIC. Every model here is built blade-up, +Y from the
 * grip, while the arm runs −Y from the shoulder. Mounted raw, the blade points
 * 180° away from the limb in every pose: at rest it stood straight up past the
 * hero's head, and through a swing the tip TRAILED the hand instead of leading
 * it. `HAND_TILT.x` past π/2 lays the blade back along the arm's line and then
 * cants it forward, so the tip is the leading edge of the arc — which is what
 * makes a swing legible, and what makes the visible blade agree with the
 * hitbox `combatSweep` actually resolves.
 */
// Just past perpendicular to the arm: far enough that the tip leads the hand
// through a sweep, shallow enough that a hero standing still is not holding
// the point through the floor. `tests/qa/swing-readout.mjs` prints both.
export const HAND_OFFSET = { x: 0.0, y: -0.04, z: 0.06 };
export const HAND_TILT = { x: 1.85, z: 0.10 };
