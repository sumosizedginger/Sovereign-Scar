// @ts-check
// What the weapon and the shield look like, per outfit.
//
// WHY A SECOND TABLE INSTEAD OF ONE
//
// `characters/hero-skins.js` dresses the BODY, and it does it by handing a
// palette to `createActorRig` — the same door every enemy and civilian in the
// game already walks through. Held gear is built somewhere else entirely, out
// of per-box materials in `assets/weapon-models.js`, so it needs its own table.
//
// They share an id. Owning `bonewarden` means owning the body, the blade and
// the plate; `kernel/wardrobe.js` is what knows that, and it is the only file
// that has to. Splitting the tables costs one import and buys the ability to
// author a shield without touching the hero, which is the whole point — the
// three slots are mixable.
//
// WHY THE UNLOCK IS A WHOLE OUTFIT AND THE PICKER IS PER SLOT
//
// A relic that drops one glove is a checklist. A relic that dresses you head to
// foot is a moment, and it is the only one you get for finding the thing — so
// the grant sets every slot at once and the player sees the full change without
// opening a menu. Mixing is a second-order pleasure and belongs in the
// wardrobe, where it costs nothing and disturbs no unlock.
//
// WHAT A SKIN MAY CHANGE
//
// `color`, `emissive`, `emissiveIntensity`, `metal`, `rough` — enforced by
// `SKINNABLE` in `weapon-models.js`, not by this comment. Dimensions are not
// reachable from here at all, because `weaponTipY` measures the built geometry
// and the swing the player sees is drawn from the boxes the hitbox is resolved
// against. That rule is what keeps a cosmetic from becoming a combat change.
//
// WHY THIS TABLE LEAVES `glow` ALONE
//
// The glow boxes are the charged tip, the link band and the Caster's lamp, and
// they are also the only part of a held weapon that reads at all from a camera
// 17.5 units up — a blade is 0.10 units thick. So they are simultaneously the
// most tempting thing for a skin to repaint and the most dangerous.
//
// Dangerous because the ten enemy palettes in `assets/palettes.js` already
// claim cyan (#40e0ff, #60e0ff), red, acid green (#a0ff60, #ccff60), amber,
// violet, orange, cold white (#e8f0ff) and cream between them. `hero-skins.js`
// records at length why the hero's rim is azure and not cyan: in a frost room a
// cyan-marked hero wears the accent of the things trying to kill them. A tip
// glow is smaller and briefer than a rim, but the failure is the same shape,
// and "smaller" is not an argument, it is a discount.
//
// So Bonewarden repaints the body of the weapon and leaves the light alone. The
// weapon keeps saying which weapon it is; the skin says who is holding it.
// Whether that is enough to SEE is a measurement, not an opinion, and
// `tests/qa/gear-skin-shots.mjs` takes it at play scale rather than in a still.

import { GEAR_ROLES } from './weapon-models.js';

/** Wearing nothing means wearing what shipped. Kept as an id, not as `null`. */
export const DEFAULT_GEAR = 'crustwalker';

/**
 * Per-outfit role maps.
 *
 * `weapon` and `shield` are independent: a skin may dress one and not the
 * other, and `null` means "this outfit has no art for that slot", which the
 * picker reads directly rather than showing an option that does nothing.
 *
 * The seven region relics that are not yet authored appear here as `null` for
 * the same reason their entries in `world/relics.js` do — an absent row is
 * legible, and a row full of placeholder greys is a thing somebody eventually
 * ships by accident.
 */
export const GEAR_SKINS = Object.freeze({
    // What the hero woke up holding. No overrides at all, on purpose: the
    // default has to travel the same code path as every unlock, or the path is
    // only ever exercised by content most players never find.
    crustwalker: Object.freeze({
        id: 'crustwalker',
        name: 'Crustwalker',
        weapon: null,
        shield: null,
    }),

    // THE DRAGON IN THE TOMBFIELDS.
    //
    // Bone over slate, matched to the hero skin key for key — `blade` takes the
    // shirt's bone (#d8d2bc), `grip` takes the trousers' darkest slate
    // (#272c35), `guardDark` takes the belt (#6e6450). Sampling the body's own
    // palette rather than inventing a parallel one is what makes the three
    // slots read as one outfit instead of three items that happen to be beige.
    //
    // The metalness drop is doing as much work as the colour. Steel at 0.65
    // with roughness 0.30 throws a specular streak down the blade; bone at 0.08
    // and 0.72 does not. From directly overhead that streak is most of what you
    // see of a weapon, so killing it changes the silhouette's behaviour in
    // motion — which is the only place a held weapon is ever really looked at.
    bonewarden: Object.freeze({
        id: 'bonewarden',
        name: 'Bonewarden',
        weapon: Object.freeze({
            grip: { color: 0x272c35, rough: 0.95, metal: 0.05 },
            // Horn, not bone. This was 0xc4b896 and the Anchor Link measured
            // as a flat stick — its whole visible length is blade and guard, so
            // two shades of the same cream left nothing for the eye to catch.
            // The shield's bands are also `guard` and want the opposite, which
            // is why the two slots carry separate maps.
            guard: { color: 0x7a6f58, metal: 0.10, rough: 0.70 },
            guardDark: { color: 0x6e6450, metal: 0.06, rough: 0.85 },
            blade: { color: 0xd8d2bc, metal: 0.08, rough: 0.72 },
            bladeDark: { color: 0xa39c86, metal: 0.05, rough: 0.80 },
            accent: { color: 0x8a7f66, metal: 0.08, rough: 0.75 },
        }),
        // The face goes DARK and the bands go bone, rather than the other way
        // round. A pale plate the size of this one flares under the overhead
        // key light and swallows the hero's own contrast — the shield is 0.62 x
        // 0.74 held flat at the camera, which is a bigger unbroken area than
        // any part of the character. Dark face with two bright bands and a bone
        // boss keeps the plate legible as a shape without letting it become the
        // brightest thing on screen.
        shield: Object.freeze({
            blade: { color: 0x3d4450, metal: 0.20, rough: 0.70 },
            guard: { color: 0xd8d2bc, metal: 0.12, rough: 0.66 },
            guardDark: { color: 0x272c35, metal: 0.10, rough: 0.85 },
            accent: { color: 0xe8e2cc, metal: 0.10, rough: 0.60 },
            grip: { color: 0x443d30, rough: 0.95, metal: 0.05 },
        }),
    }),

    // Paid out of the dry well. Body only so far — the well gives you a look,
    // not a loadout, and inventing gear for it here would be authoring content
    // nobody has looked at yet.
    drowned: Object.freeze({ id: 'drowned', name: 'The Drowned', weapon: null, shield: null }),

    // Not yet wired to a source at all; see `docs/EASTER-EGGS.md`.
    ashen: Object.freeze({ id: 'ashen', name: 'Ashen', weapon: null, shield: null }),
});

/** `true` if `id` names a row here. */
export function isGearSkin(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(GEAR_SKINS, id);
}

/** The row for `id`, or the default's. */
export function gearSkin(id) {
    return GEAR_SKINS[id] || GEAR_SKINS[DEFAULT_GEAR];
}

/**
 * The resolved role map for one slot, or `null` for "build it as it shipped".
 *
 * @param {string} id     outfit id
 * @param {'weapon'|'shield'} slot
 */
export function gearRoleMap(id, slot) {
    const row = gearSkin(id);
    return (slot === 'shield' ? row.shield : row.weapon) || null;
}

/** `true` if this outfit actually draws something different in `slot`. */
export function hasGearArt(id, slot) {
    return !!gearRoleMap(id, slot);
}

/**
 * Ids that have art for `slot`, in table order, default first.
 *
 * The default is always present even though its map is `null` — a picker whose
 * list can be empty has a state nobody designed, and "back to what shipped"
 * must always be reachable. Same rule as `unlockedSkins`.
 */
export function gearSkinIds(slot) {
    const out = [DEFAULT_GEAR];
    for (const id of Object.keys(GEAR_SKINS)) {
        if (id !== DEFAULT_GEAR && hasGearArt(id, slot)) out.push(id);
    }
    return out;
}

/**
 * Every role name a skin map mentions that is not a real role.
 *
 * A typo in a role key is silent — `dress` simply never matches it and the box
 * keeps its shipped colour, so the skin ships half-painted and looks like a
 * design choice. This is what turns that into a failing assertion.
 */
export function unknownRoles(map) {
    if (!map) return [];
    return Object.keys(map).filter((k) => !GEAR_ROLES.includes(k));
}
