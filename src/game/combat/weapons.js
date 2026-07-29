// Weapon move templates. depthTolerance = range * sin(arcDeg/2) in engine units.

/**
 * Arc helper: range + arc degrees → depthTolerance.
 *
 * `arcRad` is kept as well, and it is not decoration. `ArcSmear` drew every
 * melee swing at a hard-coded 110 degrees no matter what the weapon was
 * authored at, so the Bare Strike promised a 110-degree sweep and resolved a
 * 50-degree one — more than a fifth of the picture was ground the swing could
 * never reach. Carrying the authored angle on the move means the drawing is
 * derived from the same number the hit test is.
 */
export function arcMove(range, arcDeg, vertical = 1.2, extra = {}) {
    const arcRad = (arcDeg * Math.PI) / 180;
    const depthTolerance = range * Math.sin(arcRad / 2);
    return { range, depthTolerance, arcRad, vertical, ...extra };
}

/**
 * Phase C — the charge.
 *
 * Hold the attack button this long and releasing it spends a committed move
 * instead of nothing. The press itself still swings normally on the frame it
 * lands, so this is strictly additive: a player who taps the button forever
 * never meets it and loses nothing.
 *
 * `CHARGE_WINDUP` is the part that matters for design. The charged move does not
 * resolve on release — it locks the player in place for a beat first, which
 * makes the HERO readable. This game's whole combat thesis is that a committed
 * attack is a promise about where damage will be; a player move that ignored
 * that would be the one dishonest telegraph in the game.
 */
export const CHARGE_TIME = 0.45;
export const CHARGE_WINDUP = 0.18;
/** Walking speed while winding a charge — slowed, not frozen. */
export const CHARGE_MOVE_MULT = 0.55;

/**
 * Phase C — the dash-attack.
 *
 * Attacking during a dash converts it into a committed lunge: extra impulse,
 * a longer dash, and everything the body crosses is hit once. It is the
 * gap-closer the kit lacked — before this, dash was purely defensive and had no
 * answer at all to a shooter standing across the room.
 */
export const DASH_ATTACK = {
    /** Extra forward impulse on top of whatever the dash already carried. */
    impulse: 7,
    /** How much longer the dash runs once it becomes a lunge. */
    extend: 0.14,
    /** How long the body stays lethal. */
    active: 0.2,
    /** A lunge trades control for damage; it should not also trade damage. */
    damageMult: 1.25,
    /** Body radius of the lunge — it hits what it runs through, not a cone. */
    radius: 1.15,
    /** Added to the weapon cooldown, so lunging is not free DPS. */
    recover: 0.16,
};

// S-extra (P1-4): starting weapon — the player salvages the Anchor Link from
// the Crypt Warden in Beat 01, so they begin with bare fists.
export const BARE_STRIKE = arcMove(1.2, 50, 1.0, {
    id: 'bare_strike',
    name: 'Bare Strike',
    damage: 0.5,
    cooldown: 0.35,
    knockback: 1.2,
    smearColor: 0x9aa8bc,
    heavy: false,
    // Even bare-handed, so the verb exists from the first room of the game
    // rather than arriving as a surprise five dungeons in.
    charge: {
        id: 'bare_spin', name: 'Bare Spin', kind: 'spin',
        radial: true, range: 1.5, depthTolerance: 1.5, vertical: 1.4,
        damage: 1, knockback: 2.5, recover: 0.45,
        smearColor: 0xc8d4e4,
    },
});

export const ANCHOR_LINK = arcMove(1.8, 60, 1.2, {
    id: 'anchor_link',
    name: 'Anchor Link',
    damage: 1,
    cooldown: 0.28,
    knockback: 2.2,
    smearColor: 0x7fe0ff,
    heavy: false,
    // A shockwave, not a damage move: 1.2 dps against the link's own 3.6, but
    // it clears a ring and staggers what it clears. This is the weapon you
    // charge because you are surrounded, not because you want the kill.
    charge: {
        id: 'anchor_shock', name: 'Anchor Shock', kind: 'shock',
        radial: true, range: 3.4, depthTolerance: 3.4, vertical: 1.6,
        damage: 1.5, knockback: 7, recover: 0.6, stagger: 0.55,
        smearColor: 0x7fe0ff,
    },
});

export const TECTONIC_WEDGE = arcMove(2.2, 70, 1.4, {
    id: 'tectonic_wedge',
    name: 'Tectonic Wedge',
    damage: 2,
    cooldown: 0.4,
    knockback: 4.5,
    smearColor: 0xffd060,
    heavy: true,
    // W7: the wedge splits rock — wedge_crack blockers filter on attacker id
    shatter: true,
    shatterRadius: 2,
    // Reach. The wedge's normal swing is 2.2 long; the thrust is 4.6 in a lane
    // half a unit wide, which is a different question — it asks you to line
    // something up rather than to stand next to it.
    charge: {
        // No `arc`: a non-radial move resolves as a RECTANGLE (`hitboxCheck`'s
        // lateral gate plus its forward reach), so it is drawn as one, and
        // `depthTolerance` is the only thing that decides how wide.
        id: 'wedge_thrust', name: 'Wedge Thrust', kind: 'thrust',
        range: 4.6, depthTolerance: 0.55, vertical: 1.4,
        damage: 5, knockback: 6, recover: 0.65,
        shatter: true, shatterRadius: 3,
        smearColor: 0xffd060,
    },
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
    // The spin. Exactly break-even on damage per second against the mallet's
    // own swing (4 over 1.33s vs 1.5 over 0.5s) — what you actually buy is
    // every direction at once, and what you pay is standing still to do it.
    charge: {
        id: 'mallet_spin', name: 'Mallet Spin', kind: 'spin',
        radial: true, range: 2.6, depthTolerance: 2.6, vertical: 1.7,
        damage: 4, knockback: 4, recover: 0.72,
        shatter: true, shatterRadius: 3.5,
        smearColor: 0xc9a227,
    },
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
    // The ray already crosses the room; charging widens it and makes it pierce
    // properly, which is the only thing left to give a weapon that has no arc.
    charge: {
        id: 'caster_lance', name: 'Caster Lance', kind: 'beam',
        ray: true, range: 16, depthTolerance: 0.9, vertical: 2.2,
        damage: 3, knockback: 1, recover: 0.6,
        smearColor: 0xfff0a0,
    },
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
    bare_strike: BARE_STRIKE,
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
