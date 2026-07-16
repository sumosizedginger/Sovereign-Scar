// Key items, weapons, memory keys, flags.

const DEFAULT_STATE = () => ({
    weapons: ['anchor_link'],
    activeWeapon: 'anchor_link',
    items: {
        phase_boot: false,
        tectonic_glove: false,
        magnetic_grapple: false,
        light_caster: false,
        heavy_mallet: false,
        tectonic_wedge: false,
        vector_staff: false,
    },
    memoryKeys: {
        spindle: false,
        sink: false,
        sky: false,
    },
    flags: {},
    scarShards: 0,
});

export class Inventory {
    constructor(initial) {
        const d = DEFAULT_STATE();
        this.weapons = initial?.weapons ? [...initial.weapons] : d.weapons;
        this.activeWeapon = initial?.activeWeapon || d.activeWeapon;
        this.items = { ...d.items, ...(initial?.items || {}) };
        this.memoryKeys = { ...d.memoryKeys, ...(initial?.memoryKeys || {}) };
        this.flags = { ...(initial?.flags || {}) };
        this.scarShards = Number.isFinite(initial?.scarShards) ? initial.scarShards : 0;
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
    }

    addWeapon(id) {
        if (!this.weapons.includes(id)) this.weapons.push(id);
        this.activeWeapon = id;
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

    toJSON() {
        return {
            weapons: [...this.weapons],
            activeWeapon: this.activeWeapon,
            items: { ...this.items },
            memoryKeys: { ...this.memoryKeys },
            flags: { ...this.flags },
            scarShards: this.scarShards,
        };
    }

    static fromJSON(data) {
        return new Inventory(data || {});
    }
}
