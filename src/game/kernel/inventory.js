// Key items, weapons, memory keys, flags.

import { coach } from '../ui/coach.js';

/**
 * Phase G — how many Memory Vial chassis the player can carry.
 *
 * FIVE, because the campaign contains five: four dungeon caches (beats 06, 11,
 * 12, 13) and the overworld cache at r0c0. The cap was four, so the fifth one
 * found paid out nothing and said nothing.
 *
 * Named, exported, and asserted against the grant sites in `upgrades.spec.mjs`,
 * because the whole failure was a number in one file quietly disagreeing with
 * the amount of content in five others.
 */
export const MEMORY_VIAL_CAP = 5;

const DEFAULT_STATE = () => ({
    weapons: ['bare_strike'],
    activeWeapon: 'bare_strike',
    items: {
        phase_boot: false,
        tectonic_glove: false,
        magnetic_grapple: false,
        light_caster: false,
        heavy_mallet: false,
        tectonic_wedge: false,
        vector_staff: false,
        // Guard and parry are gated on this. Found on the predecessor's body
        // in Beat 01, after two rooms that have to be dodged.
        bulwark_shield: false,
    },
    memoryKeys: {
        spindle: false,
        sink: false,
        sky: false,
    },
    flags: {},
    scarShards: 0,
    consumables: { memoryVials: 0, resonanceCharges: 0, entropyCharges: 0 },
    memoryVialSlots: 0,
    scarSutures: 0,
});

/**
 * What each gated item is FOR, said once, when it is picked up.
 *
 * The campaign hands out four traversal items and three weapons and then
 * expects the player to recognise the blockers each one opens. `docs/CONTROLS.md`
 * explains every one of these; the game said none of them.
 */
const ITEM_HINTS = {
    bulwark_shield:
        'Shield found. Hold B (or right mouse) to block a blow outright — '
        + 'tap it just as the blow lands to parry, which staggers whoever swung.',
    magnetic_grapple:
        'Magnetic Grapple. Press G facing a marked anchor to cross a gap. '
        + 'Some chasms in the world are only anchors away from being paths.',
    phase_boot:
        'Phase Boot. Your dash now covers a full ledge — dash at a gap you '
        + 'could not cross before and you will land on the far side.',
    tectonic_wedge:
        'Tectonic Wedge. Heavy, slow, and it splits cracked rock — the walls '
        + 'with fissures in them are doors now.',
    light_caster:
        'Light Caster. It fires along a line with no arc and no height limit, '
        + 'which makes it the answer to anything out of sword reach — and it '
        + 'burns back the dark patches that block the way.',
    heavy_mallet:
        'Heavy Mallet. Widest arc in the game, and it shatters ore. Broken '
        + 'stone sometimes pays, and sometimes it was holding a door shut.',
};

export class Inventory {
    constructor(initial) {
        const d = DEFAULT_STATE();
        this.weapons = initial?.weapons ? [...initial.weapons] : d.weapons;
        this.activeWeapon = initial?.activeWeapon || d.activeWeapon;
        this.items = { ...d.items, ...(initial?.items || {}) };
        this.memoryKeys = { ...d.memoryKeys, ...(initial?.memoryKeys || {}) };
        this.flags = { ...(initial?.flags || {}) };
        this.scarShards = Number.isFinite(initial?.scarShards) ? initial.scarShards : 0;
        this.consumables = { ...d.consumables, ...(initial?.consumables || {}) };
        this.scarSutures = Number.isFinite(initial?.scarSutures) ? Math.max(0, Math.floor(initial.scarSutures)) : 0;
        // The SAME hard-coded four, in a second place — a load clamp that would
        // have silently taken the fifth chassis back off a returning player
        // even after the grant cap was raised. It is the constant now, which is
        // the whole reason the constant exists.
        this.memoryVialSlots = Number.isFinite(initial?.memoryVialSlots)
            ? Math.max(0, Math.min(MEMORY_VIAL_CAP, Math.floor(initial.memoryVialSlots))) : 0;
    }

    addShards(n = 1) {
        this.scarShards = Math.max(0, this.scarShards + n);
        return this.scarShards;
    }

    spendShards(n) {
        if (n > this.scarShards) return false;
        this.scarShards -= n;
        return true;
    }

    hasItem(id) {
        if (this.items[id]) return true;
        if (this.weapons.includes(id)) return true;
        return !!this.flags[id];
    }

    grantItem(id) {
        if (id in this.items) this.items[id] = true;
        if (id === 'light_caster' || id === 'heavy_mallet' || id === 'tectonic_wedge') {
            this.addWeapon(id);
        }
        this.flags[id] = true;
        // Teach the verb at the moment the player is handed it. An item that
        // opens the world is useless if the player does not know it opens
        // anything, and the toast that announces the pickup says what it is
        // called, not what it does.
        const line = ITEM_HINTS[id];
        if (line) coach(`item:${id}`, line, 5200);
    }

    addWeapon(id) {
        const first = this.weapons.length > 0 && !this.weapons.includes(id);
        if (!this.weapons.includes(id)) this.weapons.push(id);
        this.activeWeapon = id;
        // The moment a second weapon exists, cycling becomes a control the
        // player needs and has never been told about.
        if (first) {
            coach('weapon-cycle',
                'You are carrying more than one weapon now — Q and R cycle them. '
                + 'They differ in reach and arc, not just damage.');
        }
    }

    cycleWeapon(dir = 1) {
        if (this.weapons.length === 0) return this.activeWeapon;
        const i = this.weapons.indexOf(this.activeWeapon);
        const n = (i + dir + this.weapons.length * 10) % this.weapons.length;
        this.activeWeapon = this.weapons[n];
        return this.activeWeapon;
    }

    setWeapon(id) {
        if (this.weapons.includes(id)) this.activeWeapon = id;
        return this.activeWeapon;
    }

    grantMemoryKey(which) {
        if (which in this.memoryKeys) this.memoryKeys[which] = true;
    }

    get memoryKeyCount() {
        return Object.values(this.memoryKeys).filter(Boolean).length;
    }

    get hasAllMemoryKeys() {
        return this.memoryKeyCount >= 3;
    }

    setFlag(k, v = true) {
        this.flags[k] = v;
    }

    getFlag(k) {
        return !!this.flags[k];
    }

    grantScarSuture() {
        this.scarSutures += 1;
        return {
            total: this.scarSutures,
            heartEarned: this.scarSutures % 4 === 0,
            towardNext: this.scarSutures % 4,
        };
    }

    /**
     * Phase G — the cap is five, because there are five vials in the game.
     *
     * It was four, and there are five grant sites, so the fifth Memory Vial
     * you find — after however much exploration it took — silently returned
     * `false`, printed nothing, and paid nothing. Not a bug you can see: the
     * pickup vanishes exactly as the other four did. A player who found all
     * five would have been left believing the fifth was a duplicate, or that
     * they had miscounted.
     *
     * The cap is now the content, rather than the content being wrong about
     * the cap: `MEMORY_VIAL_CAP` is asserted against the number of grant sites
     * in `upgrades.spec.mjs`, so the two cannot drift apart again.
     */
    grantMemoryVialSlot() {
        if (this.memoryVialSlots >= MEMORY_VIAL_CAP) return false;
        this.memoryVialSlots += 1;
        this.consumables.memoryVials += 1;
        return true;
    }

    toJSON() {
        return {
            weapons: [...this.weapons],
            activeWeapon: this.activeWeapon,
            items: { ...this.items },
            memoryKeys: { ...this.memoryKeys },
            flags: { ...this.flags },
            scarShards: this.scarShards,
            consumables: { ...this.consumables },
            scarSutures: this.scarSutures,
            memoryVialSlots: this.memoryVialSlots,
        };
    }

    static fromJSON(data) {
        return new Inventory(data || {});
    }
}
