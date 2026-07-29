// What the enemies are holding.
//
// They were holding nothing. All of them, for the whole campaign. The lancer's
// entire identity is reach — its archetype rest pose is commented "weapon cocked
// far back on the right", `_aiLunge` commits it down a lane, and the hand at the
// end of that cocked arm was empty. The bulwark's identity is a front plate you
// have to flank, and it had no plate: it was a brass-tinted person standing
// side-on. The rule the game asks you to learn was invisible on the thing that
// enforces it.
//
// This is not decoration. Every prop here is the VISIBLE STATEMENT of a rule the
// combat code already enforces:
//
//   lance   → `attackRange` + the lunge lane. Length is derived from the reach,
//             not chosen, so a longer lunge grows the weapon that sells it.
//   plate   → `frontArmor`. Carried on the LEFT arm, which is the arm the
//             bulwark archetype raises (`rest.armLx = -1.15`), so the plate is
//             between you and the body exactly when the armour is refusing you.
//   focus   → `ai: 'ranged'`. A caster with empty hands reads as a melee enemy
//             that will not close.
//
// Boxes, like `weapon-models.js`, and for the same stated reason: everything
// else in this game is voxels and a smooth prop in a blocky world reads as a bug.

import * as THREE from 'three';

/** Assemble a group from box specs, in the actor rig's units. */
function boxes(specs) {
    const g = new THREE.Group();
    for (const s of specs) {
        const m = new THREE.Mesh(
            new THREE.BoxGeometry(s.w, s.h, s.d),
            new THREE.MeshStandardMaterial({
                color: s.color,
                roughness: s.rough != null ? s.rough : 0.75,
                metalness: s.metal != null ? s.metal : 0.15,
                emissive: s.emissive || 0x000000,
                // Held props sit at or below 0.5 emissive on purpose. Anything
                // higher clears the bloom threshold and the prop stops being a
                // silhouette and becomes a smear — which is the exact failure
                // the boss roster shipped.
                emissiveIntensity: s.emissiveIntensity || 0,
            })
        );
        m.position.set(s.x || 0, s.y || 0, s.z || 0);
        if (s.rx) m.rotation.x = s.rx;
        if (s.rz) m.rotation.z = s.rz;
        m.castShadow = true;
        // A prop is thin against a camera this far up; shading it produces edge
        // flicker rather than shade. The plate is the exception — it is broad
        // enough for the shadow to read, and it is the one the player must see.
        m.receiveShadow = !!s.receive;
        if (!s.receive) m.userData.shadowExempt = 'held enemy prop — too thin to receive legibly';
        g.add(m);
    }
    return g;
}

/**
 * Prop builders. Each takes the enemy's measured body so the prop is sized
 * against the actual rig rather than against an assumed one.
 *
 * @param {{radius:number, height:number, reach:number}} body
 */
const BUILDERS = {
    // Lancer: a long haft with a bright head. `reach` is the enemy's own
    // attackRange, so the point sits at the end of the lunge it is about to
    // commit to — the weapon and the hitbox describe the same distance.
    lance: (body) => {
        // Clamped against the BODY as well as derived from the reach. A prop
        // longer than about one and a half times its wielder stops reading as a
        // weapon and starts reading as a bug — and this clamp is a backstop
        // against a caller passing a distance that is not a melee reach, which
        // has happened once already (a ranged lancer's attackRange of 7 came
        // through here and produced a 6.4-metre pike).
        const len = Math.min(
            Math.max(1.1, body.reach * 0.92),
            Math.max(1.3, body.height * 1.5)
        );
        return boxes([
            { y: -len * 0.5, w: 0.06, h: len, d: 0.06, color: 0x2a1418, rough: 0.9 },
            { y: -len * 0.9, w: 0.10, h: len * 0.22, d: 0.10, color: 0xb0555a, metal: 0.45 },
            {
                y: -len * 1.02, w: 0.07, h: len * 0.14, d: 0.07,
                color: 0xff6040, emissive: 0xff5533, emissiveIntensity: 0.45, metal: 0.3,
            },
        ]);
    },

    // Bulwark: a broad slab, wider than the body it hides. It must read as
    // "this side is closed" from directly above, which is the only angle the
    // player ever sees it from.
    plate: (body) => {
        const w = Math.max(0.75, body.radius * 1.65);
        const h = Math.max(0.85, body.height * 0.62);
        return boxes([
            { w, h, d: 0.14, y: -h * 0.15, z: 0.05, color: 0x574a2c, rough: 0.65, metal: 0.5, receive: true },
            { w: w * 0.92, h: h * 0.16, d: 0.17, y: h * 0.24, z: 0.05, color: 0xd4a84b, metal: 0.7, receive: true },
            { w: w * 0.92, h: h * 0.16, d: 0.17, y: -h * 0.5, z: 0.05, color: 0xd4a84b, metal: 0.7, receive: true },
            { w: 0.09, h: h * 0.9, d: 0.18, y: -h * 0.12, z: 0.06, color: 0x8a7a52, metal: 0.6 },
        ]);
    },

    // Frost: a short rod with a cold head. Small, because the caster's read is
    // "narrow and upright" and a big prop would fight the silhouette.
    focus: (body) => {
        const len = Math.max(0.7, body.height * 0.52);
        return boxes([
            { y: -len * 0.5, w: 0.055, h: len, d: 0.055, color: 0x3b4654, rough: 0.85 },
            {
                y: -len * 1.02, w: 0.16, h: 0.16, d: 0.16,
                color: 0x9fd8ec, emissive: 0x6fc8e8, emissiveIntensity: 0.5, metal: 0.2,
            },
        ]);
    },
};

/**
 * Which kinds carry what, and in which hand.
 *
 * `hand` is the right-arm socket, `handL` the left. The bulwark's plate goes
 * left because that is the arm its archetype raises; putting it in the swinging
 * hand would have shown the armour moving away from you exactly as the armour
 * refused you.
 */
export const ENEMY_PROPS = {
    lancer: { build: 'lance', socket: 'hand' },
    bulwark: { build: 'plate', socket: 'handL' },
    frost: { build: 'focus', socket: 'hand' },
    // The Censer holds a focus like the frost caster does, because what it is
    // doing IS casting — it just points it at its own side. The Weaver carries
    // nothing on purpose: its product is the thing it leaves on the floor, and
    // a tool in its hand would be saying something false about where the webs
    // come from.
    censer: { build: 'focus', socket: 'hand' },
};

// Hung off the hand socket the same way the hero's weapon is: just past
// perpendicular to the arm, so the business end leads.
const PROP_TILT = { lance: 1.72, plate: 1.62, focus: 1.78 };

/**
 * Attach this kind's prop to its rig. Returns the prop group, or null for the
 * kinds that carry nothing (which is most of them, and correct — a scarab with
 * a weapon would be saying something false about how it attacks).
 *
 * @param {object} actor  the rig from createActorRig
 * @param {string} kind
 * @param {{radius:number, height:number, reach:number}} body measured dimensions
 */
export function attachEnemyProp(actor, kind, body) {
    const spec = ENEMY_PROPS[kind];
    if (!spec || !actor) return null;
    const socket = actor[spec.socket];
    if (!socket) return null;
    const prop = BUILDERS[spec.build](body);
    prop.rotation.x = PROP_TILT[spec.build] ?? 1.7;
    prop.name = `prop:${kind}`;
    socket.add(prop);
    return prop;
}
