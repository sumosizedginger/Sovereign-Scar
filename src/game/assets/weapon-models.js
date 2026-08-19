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
import { markShadowRoles } from '../render/shadow-roles.js';

/**
 * ROLES — what a box IS, rather than what colour it happens to be.
 *
 * Every colour below was a literal typed at the point of use, which meant each
 * weapon's palette existed only as a scatter of numbers inside its geometry and
 * could not be re-authored without editing dimensions. Naming the roles splits
 * the two apart: a spec keeps its dimensions and declares what part it plays,
 * and a skin supplies colours per role.
 *
 * The `Dark` variants are not decoration. The shield's bands (#8a94a4) and its
 * edge rails (#4a5058) are both guard furniture in two shades; collapsing them
 * onto one role would have flattened the shield the first time anybody skinned
 * it. Same reason `HERO_PALETTE` carries `shirt` and `shirtDark`.
 */
export const GEAR_ROLES = Object.freeze([
    'grip', 'guard', 'guardDark', 'blade', 'bladeDark', 'glow', 'accent',
]);

/**
 * The only material properties a skin is allowed to reach.
 *
 * THIS LIST IS THE SAFETY RULE, not a style preference. `weaponTipY` measures
 * the built geometry, and `actor-anim.spec.mjs` uses that measurement to locate
 * the blade tip in world space — the swing the player watches is drawn from the
 * same boxes the hitbox is resolved against. A skin able to write `w` or `y`
 * could move the drawn blade off the arc that actually connects, which is a
 * failure this project has shipped five times and cannot catch by reading.
 *
 * Restricting the override to colour keys makes "a skin cannot change shape"
 * true by construction instead of by discipline, and `gear-skins.spec.mjs`
 * checks the tip and the bounding box across every skin anyway, because a rule
 * enforced in exactly one place is one refactor from being enforced in none.
 */
const SKINNABLE = Object.freeze(['color', 'emissive', 'emissiveIntensity', 'metal', 'rough']);

/**
 * Merge a skin's entry for this box's role over the box. Colours only.
 *
 * A skin names the roles it changes and nothing else, so a partial skin keeps
 * the shipped colour everywhere it stays quiet — the same contract as a hero
 * skin merging over `HERO_PALETTE`.
 */
function dress(spec, skin) {
    const over = skin && spec.role ? skin[spec.role] : null;
    if (!over) return spec;
    const out = { ...spec };
    for (const k of SKINNABLE) {
        if (over[k] !== undefined) out[k] = over[k];
    }
    return out;
}

/** Assemble a group from box specs, in the same units the actor rig uses. */
function boxes(specs, skin) {
    const g = new THREE.Group();
    for (const raw of specs) {
        const s = dress(raw, skin);
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
        // A held weapon CASTS. The blade sweeping its own shadow across the
        // floor during a strike is the single best grounding cue the swing has,
        // and it comes free — the shadow map is already being rendered.
        //
        // It does not RECEIVE. The blade is 0.10 units wide against a camera
        // 17.5 units up, so it covers one or two shadow-map texels; shading it
        // produces flicker along the edge, not shading. The shield overrides
        // this below, because a plate is broad enough for the shadow to read.
        m.castShadow = true;
        m.receiveShadow = false;
        m.userData.shadowExempt = 'held blade — too thin to receive legibly';
        // Which role painted this box, kept on the mesh so a probe can ask the
        // built object what it is rather than counting children in order. The
        // order is an implementation detail; the role is the part that means
        // something.
        if (s.role) m.userData.gearRole = s.role;
        g.add(m);
    }
    return g;
}

/**
 * One builder per weapon id. Dimensions are in world units and sized against
 * the hero, who stands 1.95 tall — a blade a little under a metre reads as a
 * sword from a camera 17.5 units up without dominating the character.
 *
 * Each takes an optional resolved role map. Passing nothing builds the weapon
 * exactly as it has always shipped, which is not a courtesy — it is what makes
 * the default a skin like any other rather than a special case, so the skin
 * path is exercised by the weapon every player is already carrying.
 */
const BUILDERS = {
    // The salvaged chain-blade. Cyan, like its smear.
    anchor_link: (skin) => boxes([
        { role: 'grip', y: 0.10, w: 0.07, h: 0.20, d: 0.07, color: 0x3b4654, rough: 0.85 },       // grip
        { role: 'guard', y: 0.23, w: 0.20, h: 0.05, d: 0.09, color: 0x8a94a4, metal: 0.5 },       // guard
        { role: 'blade', y: 0.56, w: 0.10, h: 0.62, d: 0.04, color: 0xcfe6f5, metal: 0.65, rough: 0.3 }, // blade
        { role: 'glow', y: 0.90, w: 0.06, h: 0.14, d: 0.04, color: 0x7fe0ff, metal: 0.3,          // charged tip
            emissive: 0x7fe0ff, emissiveIntensity: 0.8 },
        { role: 'glow', y: 0.40, w: 0.13, h: 0.06, d: 0.05, color: 0x7fe0ff,                      // link band
            emissive: 0x7fe0ff, emissiveIntensity: 0.5 },
    ], skin),

    // Heavy splitting wedge. Gold, top-weighted — it should look like it hurts
    // to hold, because it swings slowly and hits for two.
    tectonic_wedge: (skin) => boxes([
        { role: 'grip', y: 0.12, w: 0.08, h: 0.30, d: 0.08, color: 0x4a3c22, rough: 0.9 },
        { role: 'guard', y: 0.34, w: 0.14, h: 0.08, d: 0.12, color: 0x6b5a2e, metal: 0.4 },
        { role: 'blade', y: 0.60, w: 0.30, h: 0.44, d: 0.16, color: 0xffd060, metal: 0.7, rough: 0.35 },
        { role: 'glow', y: 0.86, w: 0.18, h: 0.14, d: 0.12, color: 0xfff0b0, metal: 0.6,
            emissive: 0xffd060, emissiveIntensity: 0.35 },
        { role: 'accent', y: 0.60, x: 0.20, w: 0.12, h: 0.20, d: 0.10, color: 0xd4a84b, metal: 0.6 },
        { role: 'accent', y: 0.60, x: -0.20, w: 0.12, h: 0.20, d: 0.10, color: 0xd4a84b, metal: 0.6 },
    ], skin),

    // Brass mallet: the widest arc in the game, so the widest silhouette.
    heavy_mallet: (skin) => boxes([
        { role: 'grip', y: 0.14, w: 0.08, h: 0.34, d: 0.08, color: 0x3a2f1c, rough: 0.95 },
        { role: 'blade', y: 0.62, w: 0.42, h: 0.30, d: 0.26, color: 0xc9a227, metal: 0.75, rough: 0.4 },
        { role: 'bladeDark', y: 0.62, x: 0.24, w: 0.08, h: 0.24, d: 0.22, color: 0x8c6f18, metal: 0.7 },
        { role: 'bladeDark', y: 0.62, x: -0.24, w: 0.08, h: 0.24, d: 0.22, color: 0x8c6f18, metal: 0.7 },
        { role: 'accent', y: 0.80, w: 0.30, h: 0.05, d: 0.20, color: 0xe8cf72, metal: 0.6 },
    ], skin),

    // Emitter rod — no blade at all, so its silhouette says "this one shoots".
    light_caster: (skin) => boxes([
        { role: 'grip', y: 0.12, w: 0.07, h: 0.24, d: 0.07, color: 0x2f3a44, rough: 0.8 },
        { role: 'guardDark', y: 0.34, w: 0.11, h: 0.22, d: 0.11, color: 0x55636f, metal: 0.55 },
        { role: 'blade', y: 0.58, w: 0.07, h: 0.28, d: 0.07, color: 0x8f9aa4, metal: 0.6 },
        { role: 'glow', y: 0.78, w: 0.15, h: 0.10, d: 0.15, color: 0xfff0a0, metal: 0.2,
            emissive: 0xfff0a0, emissiveIntensity: 1.2 },
        { role: 'glow', y: 0.88, w: 0.06, h: 0.10, d: 0.06, color: 0xffffff, metal: 0.1,
            emissive: 0xfff0a0, emissiveIntensity: 1.6 },
    ], skin),

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
 *
 * IT IS ALSO THE LARGEST COSMETIC SURFACE IN THE GAME. 0.62 x 0.74, held flat
 * toward the camera, against a hero 34 px wide and a blade 0.10 units thick. A
 * weapon skin is mostly a claim about the glow; a shield skin is a claim you
 * can read from across the room.
 */
export function buildShieldModel(skin) {
    const g = boxes([
        { role: 'blade', w: 0.62, h: 0.74, d: 0.07, color: 0x6d7480, metal: 0.45, rough: 0.55 }, // face
        { role: 'guard', y: 0.30, w: 0.52, h: 0.10, d: 0.09, color: 0x8a94a4, metal: 0.55 },     // top band
        { role: 'guard', y: -0.30, w: 0.52, h: 0.10, d: 0.09, color: 0x8a94a4, metal: 0.55 },    // bottom band
        { role: 'accent', z: 0.06, w: 0.20, h: 0.22, d: 0.06, color: 0xd4a84b, metal: 0.7,       // boss sigil
            rough: 0.35 },
        { role: 'guardDark', x: -0.26, w: 0.08, h: 0.62, d: 0.08, color: 0x4a5058, rough: 0.8 }, // edge rail
        { role: 'guardDark', x: 0.26, w: 0.08, h: 0.62, d: 0.08, color: 0x4a5058, rough: 0.8 },
        { role: 'grip', z: -0.09, w: 0.10, h: 0.30, d: 0.06, color: 0x3a2f1c, rough: 0.95 },     // grip strap
    ], skin);
    g.name = 'shield:bulwark_shield';
    // Unlike a blade, the shield is a broad flat plate held out in front of the
    // hero — wide enough that a shadow falling across it resolves into shading
    // rather than into edge flicker. It is also the one held object the player
    // deliberately points at things, so it is worth the fragment tap.
    markShadowRoles(g);
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

/**
 * Build a weapon mesh, or null for weapons that are meant to be invisible.
 *
 * @param {string} id     weapon id
 * @param {object} [skin] resolved role map — `{ blade: { color }, ... }`. This
 *   file takes the MAP rather than a skin id on purpose: it is a model file and
 *   knows nothing about unlocks, the same way `heroSkinPalette` is handed
 *   `HERO_PALETTE` instead of importing it.
 */
export function buildWeaponModel(id, skin) {
    const make = BUILDERS[id];
    if (!make) return null;
    const g = make(skin);
    g.name = `weapon:${id}`;
    return g;
}

/**
 * Distance from the grip origin to the business end, along the blade axis.
 *
 * Measured off the built geometry rather than written down, because a hand-kept
 * number is one edit away from lying — and the swing specs use this to find the
 * tip in world space. If it drifts, they stop testing the tip.
 *
 * Deliberately takes no skin. The tip is a combat fact and a cosmetic must not
 * be able to move it; building the default here means that if a skin ever did
 * change geometry, this number and the drawn blade would visibly disagree
 * rather than quietly agree on the wrong answer.
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
