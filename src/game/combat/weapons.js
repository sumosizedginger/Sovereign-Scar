// Weapon move templates. depthTolerance = range * sin(arcDeg/2) in engine units.

/** Arc helper: range + half-angle degrees → depthTolerance. */
export function arcMove(range, arcDeg, vertical = 1.2, extra = {}) {
    const depthTolerance = range * Math.sin(((arcDeg * Math.PI) / 180) / 2);
    return { range, depthTolerance, vertical, ...extra };
}

export const ANCHOR_LINK = arcMove(1.8, 60, 1.2, {
    id: 'anchor_link',
    name: 'Anchor Link',
    damage: 1,
    cooldown: 0.28,
    knockback: 2.2,
    smearColor: 0x7fe0ff,
    heavy: false,
});

export const TECTONIC_WEDGE = arcMove(2.2, 70, 1.4, {
    id: 'tectonic_wedge',
    name: 'Tectonic Wedge',
    damage: 2,
    cooldown: 0.4,
    knockback: 4.5,
    smearColor: 0xffd060,
    heavy: true,
});

export const HEAVY_MALLET = arcMove(1.6, 90, 1.5, {
    id: 'heavy_mallet',
    name: 'Heavy Mallet',
    damage: 1.5,
    cooldown: 0.5,
    knockback: 1.5,
    smearColor: 0xc9a227,
    heavy: true,
    shatter: true,
    shatterRadius: 3,
});

export const LIGHT_CASTER = {
    id: 'light_caster',
    name: 'Light Caster',
    damage: 1,
    cooldown: 0.35,
    knockback: 0.5,
    range: 12,
    ray: true,
    smearColor: 0xfff0a0,
    heavy: false,
};

export const PHASE_BOOT = {
    id: 'phase_boot',
    name: 'Phase Boot',
    dashSpeed: 18,
    dashDuration: 0.14,
    cooldown: 0.7,
    smearColor: 0xffd060,
};

export const MAGNETIC_GRAPPLE = {
    id: 'magnetic_grapple',
    name: 'Magnetic Grapple',
    range: 10,
    pullSpeed: 14,
    cooldown: 0.8,
};

export const WEAPONS = {
    anchor_link: ANCHOR_LINK,
    tectonic_wedge: TECTONIC_WEDGE,
    heavy_mallet: HEAVY_MALLET,
    light_caster: LIGHT_CASTER,
    phase_boot: PHASE_BOOT,
    magnetic_grapple: MAGNETIC_GRAPPLE,
};

export function getWeapon(id) {
    return WEAPONS[id] || ANCHOR_LINK;
}
