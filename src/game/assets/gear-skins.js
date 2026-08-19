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
            // THIS VALUE WAS CHANGED ONCE AND CHANGED BACK, and the round
            // trip is worth more than the colour.
            //
            // The probe reported the Anchor Link losing nearly all internal
            // contrast under this skin - 20.9 collapsing to 1.8 - which reads
            // as bone blade against bone guard with nothing for the eye to
            // catch. So the guard went to horn (#7a6f58) to break it up.
            //
            // The reading was an artefact. `gear-skin-shots.mjs` was re-posing
            // the hero between the baseline and the skinned frame, so the
            // silhouette mask no longer covered a blade 0.10 units thick and
            // was sampling the ground beside it. Measured without the re-pose,
            // this weapon's contrast under bone is 20.8 -> 25.3: it GAINS
            // definition, and always did.
            //
            // Bone is back because it was never wrong, and because it is the
            // colour the outfit's own story asks for. The horn was a fix for a
            // defect in the instrument, which is the most expensive kind of
            // art direction there is.
            guard: { color: 0xc4b896, metal: 0.10, rough: 0.70 },
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

    // PAID OUT OF THE DRY WELL, to the player who kept paying it.
    //
    // Verdigris: bronze that has been under water long enough to stop being
    // bronze. The joke the well is telling is that there is no water anywhere in
    // this region and has not been for a very long time, so gear that has
    // obviously drowned is the punchline worn rather than explained.
    //
    // The guard is a long way off the blade on purpose. Bonewarden's first pass
    // put bone against bone and the Anchor Link measured as a flat stick —
    // internal contrast 20.9 collapsing to 1.8 — because from directly overhead
    // that weapon is almost entirely blade and guard. Every palette written
    // after that one keeps those two roles apart by construction.
    drowned: Object.freeze({
        id: 'drowned',
        name: 'The Drowned',
        weapon: Object.freeze({
            grip: { color: 0x1a2a2a, rough: 0.98, metal: 0.03 },
            guard: { color: 0x4a6b60, metal: 0.25, rough: 0.75 },
            guardDark: { color: 0x24393a, metal: 0.20, rough: 0.85 },
            blade: { color: 0x7fa196, metal: 0.35, rough: 0.60 },
            bladeDark: { color: 0x4e6f68, metal: 0.30, rough: 0.70 },
            accent: { color: 0xa8bfae, metal: 0.15, rough: 0.80 },
        }),
        // Same structure as the bone shield and for a measured reason: dark
        // face, bright bands, near-black rails took the plate's internal
        // contrast from 8.9 to 24.0. What the player mostly sees of a shield is
        // its edge — the arm is down and the face points away — so the bands and
        // rails are the shield, and the face is what keeps it from flaring.
        shield: Object.freeze({
            blade: { color: 0x203a3a, metal: 0.20, rough: 0.72 },
            guard: { color: 0x9dc0b2, metal: 0.30, rough: 0.58 },
            guardDark: { color: 0x16292b, metal: 0.12, rough: 0.88 },
            accent: { color: 0xc8d8c0, metal: 0.20, rough: 0.55 },
            grip: { color: 0x2a2420, rough: 0.95, metal: 0.04 },
        }),
    }),

    // GIVEN FOR SPEAKING TO ALL THREE SETTLEMENTS.
    //
    // The only cosmetic in the set that means something: `CIVILIAN_PALETTE`
    // dresses the hero as the people they are failing to save. So the gear is
    // deliberately the POOREST in the game — rag-wrapped grip, brass gone dark,
    // a blade the colour of something that has been carried through smoke. It
    // is the one outfit where looking worse is the point, which is a thing a
    // cosmetic axis is normally incapable of.
    //
    // The single warm note is the boss and the accent, taken from the belt in
    // the body palette (#8a6830). One warm mark on a dust-coloured figure reads
    // as firelight; two would read as decoration.
    ashen: Object.freeze({
        id: 'ashen',
        name: 'Ashen',
        // NO WEAPON, ON PURPOSE, AND THE ART FOR ONE WAS WRITTEN AND CUT.
        //
        // Two reasons, and the design one came first.
        //
        // The civilians at the three fires carry nothing. A hero in their
        // clothes, holding their battered plate, and still swinging their own
        // real weapon reads as somebody who joined them. A matched three-piece
        // set reads as a costume. This outfit is the one place in the game
        // where looking like you belong to somebody else is the entire point,
        // and a full kit undoes that.
        //
        // It also follows the rule this project set itself in
        // `docs/WARDROBE.md`: region relics are full sets because they are the
        // payoff for exploring; behaviour unlocks are single-slot standouts,
        // because a wardrobe with nothing but matching sets is a wardrobe with
        // nothing to mix.
        //
        // The second reason is that a table where EVERY row fills EVERY slot
        // silently retires the rule that a slot is only offered outfits it has
        // art for. The filter would still be there, and nothing would be able
        // to tell whether it worked. Keeping one genuine gap in the data is
        // what keeps that guard honest - see `gear-skins.spec.mjs`.
        weapon: null,
        shield: Object.freeze({
            blade: { color: 0x3f382c, metal: 0.10, rough: 0.85 },
            guard: { color: 0xc0ae8c, metal: 0.15, rough: 0.70 },
            guardDark: { color: 0x241f18, metal: 0.08, rough: 0.92 },
            accent: { color: 0xd8b45c, metal: 0.35, rough: 0.50 },
            grip: { color: 0x2c261e, rough: 0.96, metal: 0.03 },
        }),
    }),

    // THE FIRE THAT WENT OUT. A region relic, so a full set - see the rule in
    // `docs/WARDROBE.md`: relics are the payoff for exploring and dress you
    // head to foot; behaviour unlocks are single-slot standouts.
    //
    // Cold iron with an ember trim, and no emissive anywhere. The prop this
    // comes off makes the same refusal for the same reason: in the one region
    // whose ground glows, the thing worth looking at is the thing that stopped.
    //
    // Blade and guard are far apart in value on purpose. That is the rule every
    // palette after Bonewarden's first pass follows - from directly overhead
    // the Anchor Link is almost entirely those two roles, so two neighbours of
    // the same shade leave nothing for the eye to catch.
    unanswered: Object.freeze({
        id: 'unanswered',
        name: 'The Unanswered',
        weapon: Object.freeze({
            grip: { color: 0x1c1618, rough: 0.98, metal: 0.03 },
            guard: { color: 0x6b4030, metal: 0.30, rough: 0.68 },
            guardDark: { color: 0x33201a, metal: 0.22, rough: 0.82 },
            blade: { color: 0x8c827c, metal: 0.50, rough: 0.50 },
            bladeDark: { color: 0x4a433f, metal: 0.42, rough: 0.62 },
            accent: { color: 0xc0522a, metal: 0.35, rough: 0.55 },
        }),
        // Black plate, hot bands. The same structure the bone and verdigris
        // shields use, because it is the one that measured: dark face, bright
        // bands, near-black rails took the plate's internal contrast from 9.1
        // to 24.3. What a player mostly sees of a shield is its edge.
        shield: Object.freeze({
            blade: { color: 0x2e2825, metal: 0.18, rough: 0.78 },
            guard: { color: 0x9a5a34, metal: 0.35, rough: 0.55 },
            guardDark: { color: 0x1a1614, metal: 0.12, rough: 0.90 },
            accent: { color: 0xd06a30, metal: 0.40, rough: 0.48 },
            grip: { color: 0x1c1618, rough: 0.96, metal: 0.03 },
        }),
    }),

    // ── the six remaining region relics ─────────────────────────────────────
    //
    // All full sets. Region relics are the payoff for exploring and dress you
    // head to foot; behaviour unlocks are the single-slot standouts. The Ashen
    // is the only one of those so far, and its missing weapon is what keeps the
    // slot filter testable - see its entry above.
    //
    // Each takes its colours from its own body palette, key for key, so the
    // three slots read as one find rather than three items that happen to be
    // the same temperature. And in every one of them `blade` and `guard` sit a
    // long way apart in value: from directly overhead the Anchor Link is almost
    // entirely those two roles, and two neighbours of the same shade leave
    // nothing for the eye to catch.

    // Iron and violet, off the fallen survey mast.
    surveyor: Object.freeze({
        id: 'surveyor',
        name: 'The Surveyor',
        weapon: Object.freeze({
            grip: { color: 0x1b2028, rough: 0.95, metal: 0.10 },
            guard: { color: 0x54606e, metal: 0.45, rough: 0.55 },
            guardDark: { color: 0x353e49, metal: 0.38, rough: 0.68 },
            blade: { color: 0x9aa6b2, metal: 0.62, rough: 0.38 },
            bladeDark: { color: 0x66717d, metal: 0.55, rough: 0.50 },
            accent: { color: 0x6a4d8c, metal: 0.35, rough: 0.42 },
        }),
        shield: Object.freeze({
            blade: { color: 0x2e3440, metal: 0.35, rough: 0.60 },
            guard: { color: 0x8b98a6, metal: 0.50, rough: 0.45 },
            guardDark: { color: 0x1b2028, metal: 0.30, rough: 0.75 },
            accent: { color: 0x7d5aa4, metal: 0.40, rough: 0.38 },
            grip: { color: 0x22262a, rough: 0.95, metal: 0.06 },
        }),
    }),

    // Bleached canvas, tar and rope, off the ship in the dust.
    landlocked: Object.freeze({
        id: 'landlocked',
        name: 'The Landlocked',
        weapon: Object.freeze({
            grip: { color: 0x171412, rough: 0.98, metal: 0.03 },
            guard: { color: 0x8a6a3c, metal: 0.12, rough: 0.85 },
            guardDark: { color: 0x54401f, metal: 0.10, rough: 0.90 },
            blade: { color: 0xc4bcac, metal: 0.22, rough: 0.62 },
            bladeDark: { color: 0x8a8171, metal: 0.18, rough: 0.72 },
            accent: { color: 0x7a4a2c, metal: 0.30, rough: 0.60 },
        }),
        shield: Object.freeze({
            blade: { color: 0x2a2622, metal: 0.10, rough: 0.88 },
            guard: { color: 0xc4bcac, metal: 0.18, rough: 0.66 },
            guardDark: { color: 0x171412, metal: 0.08, rough: 0.92 },
            accent: { color: 0xa8763c, metal: 0.35, rough: 0.52 },
            grip: { color: 0x3d382f, rough: 0.96, metal: 0.04 },
        }),
    }),

    // Gilt and deep violet, from beside the empty chair. The only ornate set in
    // the game, and the only one whose brightest note is on the WEAPON rather
    // than the shield - a courtier's blade is meant to be looked at.
    attendant: Object.freeze({
        id: 'attendant',
        name: 'The Attendant',
        weapon: Object.freeze({
            grip: { color: 0x140d1b, rough: 0.92, metal: 0.10 },
            guard: { color: 0x8c6f18, metal: 0.68, rough: 0.38 },
            guardDark: { color: 0x54410c, metal: 0.60, rough: 0.50 },
            blade: { color: 0xd8be5e, metal: 0.78, rough: 0.28 },
            bladeDark: { color: 0x9c8430, metal: 0.70, rough: 0.40 },
            accent: { color: 0x6a3f84, metal: 0.42, rough: 0.40 },
        }),
        shield: Object.freeze({
            // LIGHTER THAN IT WAS. At #2e1a39 this plate measured dRGB 6 from
            // the Unanswered's charcoal — two near-black shields, and the one
            // that is supposed to be the ornate outfit in the game was reading
            // as the austere one. Violet has to be legible AS violet.
            blade: { color: 0x4a3a58, metal: 0.34, rough: 0.52 },
            guard: { color: 0xc9a227, metal: 0.72, rough: 0.34 },
            guardDark: { color: 0x251733, metal: 0.25, rough: 0.78 },
            accent: { color: 0xf0dc94, metal: 0.65, rough: 0.30 },
            grip: { color: 0x241830, rough: 0.94, metal: 0.06 },
        }),
    }),

    // Pale cold and sludge, off the figure in the mire ice. NOT ice blue: the
    // frost faction owns #60e0ff and the hero's rim is azure, so a blue outfit
    // in a blue region would be three shades of the same idea and one of them
    // belongs to the enemy.
    thaw: Object.freeze({
        id: 'thaw',
        name: 'The Thaw',
        weapon: Object.freeze({
            grip: { color: 0x232b28, rough: 0.95, metal: 0.06 },
            guard: { color: 0x6a7040, metal: 0.20, rough: 0.78 },
            guardDark: { color: 0x424626, metal: 0.15, rough: 0.86 },
            blade: { color: 0xbccacc, metal: 0.40, rough: 0.34 },
            bladeDark: { color: 0x7f8e90, metal: 0.32, rough: 0.48 },
            accent: { color: 0x8a9a5a, metal: 0.22, rough: 0.66 },
        }),
        shield: Object.freeze({
            blade: { color: 0x3d4a44, metal: 0.22, rough: 0.66 },
            guard: { color: 0xbccacc, metal: 0.38, rough: 0.36 },
            guardDark: { color: 0x1c2320, metal: 0.14, rough: 0.88 },
            accent: { color: 0x9fb0b4, metal: 0.30, rough: 0.44 },
            grip: { color: 0x2b3032, rough: 0.95, metal: 0.05 },
        }),
    }),

    // Moss, limestone and worked wood, out of the furnished house. The one set
    // in the game whose colours came off furniture rather than off stone, bone
    // or iron.
    tenant: Object.freeze({
        id: 'tenant',
        name: 'The Tenant',
        // LED BY MOSS AND BRASS, NOT BY LIMESTONE, and the change came out of a
        // measurement rather than a preference.
        //
        // With ten outfits in the table the probe started reporting closest
        // pairs instead of comfortable gaps, and this one was in three of them:
        // dRGB 5 from the Landlocked on the Wedge, 5 from the Unfinished on the
        // Mallet, 6 from the Ashen on the shield. Its blade was #b0a894, which
        // sits between the Landlocked's bleached canvas and the Unfinished's
        // stone dust - three pale putty blades that were one blade at 34 px.
        //
        // A wardrobe of ten is a different problem from a wardrobe of three: it
        // is not enough for each outfit to differ from what SHIPPED, they have
        // to differ from each other, and nothing but measuring every pair says
        // whether they do.
        weapon: Object.freeze({
            grip: { color: 0x40311f, rough: 0.96, metal: 0.03 },
            guard: { color: 0x5e6b42, metal: 0.16, rough: 0.80 },
            guardDark: { color: 0x3a4328, metal: 0.12, rough: 0.88 },
            // MOSS-STAINED BRONZE, and this value has moved twice.
            //
            // It started as limestone (#b0a894) and collided with the
            // Landlocked and the Unfinished. Moved to brass (#a8874a) it
            // stopped colliding with those and immediately collided with the
            // Attendant's gilt instead — dRGB 8 on the Anchor Link, which is
            // one outfit with two names. Stepping out of a crowd into the only
            // other warm neighbourhood in the table is not a fix.
            //
            // Green is the direction nothing else in the wardrobe occupies. The
            // Drowned is verdigris and reads blue-green; this is yellow-green,
            // and the pair are further apart than either is from anything else.
            blade: { color: 0x7d8a4e, metal: 0.40, rough: 0.55 },
            bladeDark: { color: 0x525c31, metal: 0.32, rough: 0.66 },
            accent: { color: 0xb0a894, metal: 0.22, rough: 0.66 },
        }),
        shield: Object.freeze({
            blade: { color: 0x3a4328, metal: 0.12, rough: 0.82 },
            guard: { color: 0x93a06a, metal: 0.20, rough: 0.64 },
            guardDark: { color: 0x241f18, metal: 0.10, rough: 0.90 },
            accent: { color: 0xc0a860, metal: 0.45, rough: 0.48 },
            grip: { color: 0x40311f, rough: 0.96, metal: 0.03 },
        }),
    }),

    // Stone dust over basalt, off the carving nobody finished. Greyscale, which
    // nothing else in the wardrobe is - the cheapest way to be unmistakable
    // among bone, verdigris, dust, charcoal, canvas and gilt. The one warm note
    // is the mallet handle left on the block.
    unfinished: Object.freeze({
        id: 'unfinished',
        name: 'The Unfinished',
        weapon: Object.freeze({
            grip: { color: 0x1d1b1a, rough: 0.96, metal: 0.05 },
            guard: { color: 0x585450, metal: 0.30, rough: 0.72 },
            guardDark: { color: 0x35322f, metal: 0.22, rough: 0.84 },
            // Colder and a step darker than it started. At #b6b0a6 this blade
            // measured dRGB 9 from the Thaw's, which is two pale greys sharing
            // one silhouette.
            blade: { color: 0x9a9690, metal: 0.30, rough: 0.60 },
            bladeDark: { color: 0x656260, metal: 0.24, rough: 0.70 },
            accent: { color: 0x9c6a3c, metal: 0.20, rough: 0.72 },
        }),
        shield: Object.freeze({
            blade: { color: 0x33302e, metal: 0.20, rough: 0.80 },
            guard: { color: 0x968f86, metal: 0.28, rough: 0.58 },
            guardDark: { color: 0x1d1b1a, metal: 0.14, rough: 0.90 },
            accent: { color: 0xc8c0b4, metal: 0.30, rough: 0.52 },
            grip: { color: 0x2c2a29, rough: 0.96, metal: 0.04 },
        }),
    }),
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
