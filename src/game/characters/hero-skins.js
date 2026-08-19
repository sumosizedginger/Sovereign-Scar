// @ts-check
// What the hero looks like, and where each look comes from.
//
// WHY THIS EXISTS
//
// `docs/EASTER-EGGS.md` measured the overworld and found the problem is not
// that it is empty — 38 of 49 screens carry something — but that the only
// discretionary reward in it is one cyan shard cache, authored eight times.
// Shards feed upgrades, upgrades have a ceiling, and a ninth cache is worth
// less than the eighth was.
//
// A cosmetic axis has no ceiling and cannot disturb balance, because nothing
// here touches a number. That is a rule, not a habit: the moment one skin
// grants a point of anything, every skin enters the balance conversation and
// the eight region relics stop being free.
//
// WHY THE HERO AND NOT THE WEAPONS
//
// `player.js` builds the hero with one line — `palette: HERO_PALETTE` inside
// `HERO_RIG` — and `createActorRig` already takes a palette as a parameter,
// because that is how every enemy and every civilian in the game is built.
// `bosses/roster.js:2279` already ships `createActorRig({ ...HERO_RIG, palette:
// GHOST_PALETTE })`. So a hero skin is a table and a merge.
//
// Weapons are the opposite. `assets/weapon-models.js:56` bakes `color:` into
// per-box materials, `weaponTipY` measures the built geometry, and the swing
// specs read that measurement. And a blade is ~0.10 units wide against a camera
// 17.5 units up: it reads as a silhouette, not a colour. The hero is on screen
// 100% of the time and is 34 px wide at 1280, which makes a palette swap on the
// hero the most visible cosmetic change available in this game and the cheapest
// to build.
//
// WHAT A SKIN MAY AND MAY NOT CHANGE
//
// MAY: every colour the six part builders read — skin, hair, beard, shirt,
// trousers, belt, boots.
//
// MAY NOT: `rimColor` or `rimStrength`. Those live in `HERO_RIG`, not in the
// palette, and `hero-readability.spec.mjs` pins the rim to azure #4a86ff for a
// reason recorded there at length — the first pick was a cold cyan and it was
// rejected on sight because the frost faction's accent is #60e0ff, so in a
// frost room the hero would have been marked out in the exact shade worn by the
// things trying to kill them. A cosmetic must never be able to reach that.
//
// MAY NOT: anything that changes the SHAPE. Proven rather than assumed —
// building every part under two different palettes gives byte-identical cell
// keys and identical vertex counts, colours only:
//
//     torso  cells 3903 3903 | same keys true | verts 11352 11352
//     head   cells  993  993 | same keys true | verts  5268  5268
//     armR   cells  819  819 | same keys true | verts  4404  4404
//     legR   cells 1233 1233 | same keys true | verts  5736  5736
//
// That is what makes the live swap safe: only the colour buffer is replaced, so
// no socket moves, no hitbox changes, and the weapon in the hero's hand cannot
// come loose. `hero-skins.spec.mjs` asserts it rather than trusting this note.

/**
 * The clothing colours the hero has been wearing since launch.
 *
 * THESE WERE NEVER AUTHORED. `HERO_PALETTE` defines skin, hair, beard, belt and
 * eyes, and defines no clothing at all — so the two largest colour areas on the
 * character came from fallbacks inside `src/characters/builders.js`, which is a
 * frozen engine file:
 *
 *     const shirt = palette.shirt || 0xb03030;
 *     const jeans = palette.jeans || palette.pants || 0x2a3a60;
 *
 * Naming them here does not change a pixel. It moves the hero's most visible
 * colours out of a default nobody chose and into a table somebody can. It also
 * means the base skin is a skin like any other rather than a special case, so
 * the swap path is exercised by the default rather than only by unlocks.
 *
 * `hero-skins.spec.mjs` holds these against what the frozen builder actually
 * produces, so if that file's defaults ever move, the game says so instead of
 * quietly redressing the hero.
 */
export const INHERITED_CLOTHING = Object.freeze({
    shirt: 0xb03030,
    shirtDark: 0x802020,
    jeans: 0x2a3a60,
    jeansDark: 0x1a2a40,
});

/** Worn when nothing else is. */
export const DEFAULT_SKIN = 'crustwalker';

/**
 * The skins, in the order a picker should show them.
 *
 * `from` is player-facing and appears in the unlock toast, so it says where the
 * thing came from rather than describing the colours — the player can see the
 * colours.
 *
 * `palette` is merged OVER `HERO_PALETTE`, so a skin only names what it
 * changes. A skin that omits a key keeps the hero's.
 */
export const HERO_SKINS = Object.freeze({
    crustwalker: {
        id: 'crustwalker',
        name: 'Crustwalker',
        from: 'what you woke up in',
        palette: { ...INHERITED_CLOTHING },
    },

    // The first relic. Tombfields is bone-and-slate country and the dragon it
    // comes off is the biggest thing in the region, so the skin is the animal's
    // colours rather than the region's: pale bone over dark slate.
    bonewarden: {
        id: 'bonewarden',
        name: 'Bonewarden',
        from: 'the dragon in the tombfields',
        palette: {
            shirt: 0xd8d2bc,
            shirtDark: 0xa39c86,
            jeans: 0x3d4450,
            jeansDark: 0x272c35,
            belt: 0x6e6450,
            beltDark: 0x443d30,
        },
    },

    // Paid out of the dry well, to the player who kept paying it. Waterlogged
    // in a place with no water — the joke wearing the joke.
    drowned: {
        id: 'drowned',
        name: 'The Drowned',
        from: 'the well, on the third coin',
        palette: {
            shirt: 0x2f5a52,
            shirtDark: 0x1c3a35,
            jeans: 0x24343e,
            jeansDark: 0x141d24,
            skin: 0xa9b0a4,
            skinDark: 0x7d857c,
            skinD2: 0x585f57,
            hair: 0x1e2a28,
            hairDark: 0x0e1615,
            hairLight: 0x354441,
            beard: 0x1e2a28,
            beardDark: 0x0e1615,
        },
    },

    // Costs nothing and means the most. `CIVILIAN_PALETTE` already exists in
    // `world/settlements.js` for the survivors standing around the three
    // settlement fires; wearing it makes the hero look like the people they are
    // failing to save. Deliberately NOT a copy of that object — a copy cannot
    // notice the original changed — see `heroSkinPalette` below.
    ashen: {
        id: 'ashen',
        name: 'Ashen',
        from: 'all three fires still burning',
        palette: {
            shirt: 0x8a7a62,
            shirtDark: 0x5e5242,
            jeans: 0x4a4034,
            jeansDark: 0x2e2820,
            skin: 0xb09070,
            skinDark: 0x7a6048,
            skinD2: 0x4c3c2c,
            hair: 0x4a3a28,
            hairDark: 0x241c10,
            hairLight: 0x6a5638,
            beard: 0x4a3a28,
            beardDark: 0x241c10,
            belt: 0x8a6830,
            beltDark: 0x54401c,
        },
    },
});

/** Ids in display order. */
export function heroSkinIds() {
    return Object.keys(HERO_SKINS);
}

/** `true` if `id` names a skin that exists. */
export function isHeroSkin(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(HERO_SKINS, id);
}

/** The skin record, or the default's if `id` is unknown. */
export function heroSkin(id) {
    return HERO_SKINS[id] || HERO_SKINS[DEFAULT_SKIN];
}

/**
 * The full palette to build the hero with.
 *
 * @param {string} id            skin id; anything unknown falls back to the default
 * @param {object} basePalette   `HERO_PALETTE` — passed in rather than imported
 *   so this module stays free of the asset graph and a spec can hand it a stub.
 */
export function heroSkinPalette(id, basePalette) {
    return { ...(basePalette || {}), ...heroSkin(id).palette };
}

/** Inventory flag holding the worn skin. A string, so it round-trips as one. */
export const SKIN_WORN_FLAG = 'skin:worn';

/** Inventory flag prefix marking a skin as unlocked. */
export const SKIN_FLAG_PREFIX = 'skin:has:';

/** The flag that records `id` as unlocked. */
export function skinFlag(id) {
    return SKIN_FLAG_PREFIX + id;
}

/**
 * Which skins the player has.
 *
 * The default is always in the list. A player who has unlocked nothing still
 * owns what they are wearing, and a picker that can show an empty list is a
 * picker with a state nobody designed.
 */
export function unlockedSkins(inventory) {
    const out = [DEFAULT_SKIN];
    for (const id of heroSkinIds()) {
        if (id !== DEFAULT_SKIN && inventory?.getFlag?.(skinFlag(id))) out.push(id);
    }
    return out;
}

/** What the hero should be wearing, given the save. Always a real skin id. */
export function wornSkin(inventory) {
    const worn = inventory?.flags?.[SKIN_WORN_FLAG];
    if (isHeroSkin(worn) && unlockedSkins(inventory).includes(worn)) return worn;
    return DEFAULT_SKIN;
}

/**
 * Grant `id` and wear it. Idempotent — returns `false` if already owned, so a
 * relic can be interacted with twice without repeating its unlock toast.
 */
export function grantSkin(inventory, id) {
    if (!inventory || !isHeroSkin(id) || id === DEFAULT_SKIN) return false;
    if (inventory.getFlag(skinFlag(id))) return false;
    inventory.setFlag(skinFlag(id));
    inventory.setFlag(SKIN_WORN_FLAG, id);
    return true;
}

/**
 * Wear an already-unlocked skin. Returns `false` for one that is not owned, so
 * an edited save cannot dress the hero in something it never found.
 */
export function wearSkin(inventory, id) {
    if (!inventory || !unlockedSkins(inventory).includes(id)) return false;
    inventory.setFlag(SKIN_WORN_FLAG, id);
    return true;
}

/** The next owned skin after the worn one, wrapping. For a picker. */
export function nextSkin(inventory) {
    const owned = unlockedSkins(inventory);
    const i = owned.indexOf(wornSkin(inventory));
    return owned[(i + 1) % owned.length];
}
