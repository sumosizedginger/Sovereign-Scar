// @ts-check
// The three cosmetic slots, and which flag holds each one.
//
// WHY A THIRD FILE
//
// `characters/hero-skins.js` owns the body palettes and, until now, also owned
// the single "what am I wearing" flag. `assets/gear-skins.js` owns the held
// gear. Neither should own the OTHER'S slot, and something has to know that one
// unlock id dresses all three — so that knowledge lives here, alone, and the
// two tables stay tables.
//
// The import runs one way: wardrobe knows about both tables, neither table
// knows about wardrobe. That is what keeps `hero-skins.spec.mjs` meaningful —
// it tests the hero table against the frozen builder without any of this in the
// way.
//
// OWNERSHIP IS SHARED, WEAR IS PER SLOT
//
// One flag says you own `bonewarden` (`skin:has:bonewarden`, set by the relic).
// Three flags say what you have on. So finding the dragon gives you a complete
// look in one moment, and the wardrobe afterwards lets you put the bone plate
// with the clothes you woke up in if that is what you want. Neither behaviour
// costs the other anything.
//
// AN EDITED SAVE CANNOT DRESS YOU IN SOMETHING YOU NEVER FOUND. Every read goes
// through `unlockedSkins`, so a `skin:worn:shield` naming an unowned outfit
// resolves to the default rather than being honoured — the same rule
// `wornSkin` already applied to the body, extended to the other two slots
// rather than reimplemented beside them.

import {
    DEFAULT_SKIN, SKIN_WORN_FLAG, unlockedSkins, wornSkin, grantSkin,
    heroSkin, heroSkinIds,
} from '../characters/hero-skins.js';
import { hasGearArt, DEFAULT_GEAR } from '../assets/gear-skins.js';

/** Slot order is display order: body, then what each hand is holding. */
export const SLOTS = Object.freeze(['hero', 'weapon', 'shield']);

/**
 * Which inventory flag holds each slot.
 *
 * `hero` reuses the flag that already shipped rather than migrating to a
 * `skin:worn:hero` for symmetry's sake. A save written before this file existed
 * has to keep working, and a rename would have silently undressed anyone who
 * had already found the dragon.
 */
export const SLOT_FLAG = Object.freeze({
    hero: SKIN_WORN_FLAG,
    weapon: 'skin:worn:weapon',
    shield: 'skin:worn:shield',
});

/** Player-facing slot names, for the picker. */
export const SLOT_LABEL = Object.freeze({
    hero: 'Body', weapon: 'Weapon', shield: 'Shield',
});

/** `true` for a real slot name. */
export function isSlot(slot) {
    return SLOTS.includes(slot);
}

/**
 * The outfits selectable in `slot`: owned, and with art for that slot.
 *
 * The body accepts any owned outfit, because every outfit has a body palette by
 * construction. Held gear does not — `drowned` dresses you and arms you with
 * nothing — so offering it in the weapon row would be a menu entry that changes
 * no pixel, which is worse than an absent one.
 */
export function slotOptions(inventory, slot) {
    const owned = unlockedSkins(inventory);
    if (slot === 'hero') return owned;
    return owned.filter((id) => id === DEFAULT_GEAR || hasGearArt(id, slot));
}

/** What is worn in `slot`. Always a real id the player actually owns. */
export function wornIn(inventory, slot) {
    if (slot === 'hero') return wornSkin(inventory);
    if (!isSlot(slot)) return DEFAULT_SKIN;
    const worn = inventory?.flags?.[SLOT_FLAG[slot]];
    return slotOptions(inventory, slot).includes(worn) ? worn : DEFAULT_SKIN;
}

/** All three at once. What the player and their gear should be built from. */
export function outfitOf(inventory) {
    return {
        hero: wornIn(inventory, 'hero'),
        weapon: wornIn(inventory, 'weapon'),
        shield: wornIn(inventory, 'shield'),
    };
}

/** Put `id` on in `slot`. `false` if it is not a legal choice there. */
export function wearIn(inventory, slot, id) {
    if (!inventory || !isSlot(slot)) return false;
    if (!slotOptions(inventory, slot).includes(id)) return false;
    inventory.setFlag(SLOT_FLAG[slot], id);
    return true;
}

/**
 * Wear `id` in every slot it has art for.
 *
 * Slots it cannot fill are left alone rather than reset to the default. Picking
 * up the Drowned should not quietly strip a bone shield you chose on purpose —
 * an unlock adds, it does not tidy.
 */
export function wearOutfit(inventory, id) {
    let n = 0;
    for (const slot of SLOTS) if (wearIn(inventory, slot, id)) n++;
    return n;
}

/**
 * Grant `id` and put the whole thing on.
 *
 * Idempotent, and returns `false` when already owned — a relic can be walked
 * into twice without repeating its toast. Callers that grant a look should use
 * this rather than `grantSkin`, which only knows about the body.
 */
export function grantOutfit(inventory, id) {
    if (!grantSkin(inventory, id)) return false;
    wearOutfit(inventory, id);
    return true;
}

// THERE IS NO `nextInSlot` HERE ON PURPOSE. Cycling a picker row is
// `MenuState.adjust`'s job and it already did it; a second implementation
// living beside the first is two answers to one question, and the one nothing
// calls is the one that rots. `hero-skins.js` still carries `nextSkin` from
// before the picker existed, which is the same wart one file over.

/**
 * The display name for an outfit.
 *
 * Taken from the hero table on purpose, even for the two held slots. One outfit
 * has ONE name; `gear-skins.js` carries its own `name` only so that file reads
 * on its own, and if the two ever disagree the spec says so rather than the
 * menu showing "Bonewarden" beside "Bone Warden" and looking like two things.
 */
export function outfitName(id) {
    return heroSkin(id).name;
}

/** Where the player got it. Player-facing, shown under the picker. */
export function outfitFrom(id) {
    return heroSkin(id).from;
}

/**
 * Resolve a display name back to an id.
 *
 * The picker shows names because "bonewarden" in a menu looks like a debug
 * build. That means something has to map back, and doing it here — against the
 * same table that produced the name — is the only version that cannot drift.
 * Names are asserted unique in `gear-skins.spec.mjs`; if two ever collided,
 * this would quietly pick the first and the menu would stop being able to
 * select the second.
 */
export function outfitIdFromName(name) {
    for (const id of heroSkinIds()) if (outfitName(id) === name) return id;
    return DEFAULT_SKIN;
}

/**
 * Everything the picker needs, per slot.
 *
 * Returns names rather than ids because the menu renders `value` straight into
 * the row, and `options.length < 2` is handed over as `only` so the screen can
 * disable a row that cannot go anywhere instead of offering a choice of one.
 */
export function wardrobeView(inventory) {
    return SLOTS.map((slot) => {
        const ids = slotOptions(inventory, slot);
        const worn = wornIn(inventory, slot);
        return {
            slot,
            label: SLOT_LABEL[slot],
            id: worn,
            value: outfitName(worn),
            options: ids.map(outfitName),
            only: ids.length < 2,
            from: outfitFrom(worn),
        };
    });
}
