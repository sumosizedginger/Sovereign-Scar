// Original Sovereign Scar palettes — Crust / Abyss / prop materials.
// Distinct from engine SUMO_PALETTE; authored for mood identity.

/** Low-entropy Crust: slate, bone limestone, pale clay. */
export const CRUST_COLORS = {
    slate: 0x6b7280,
    slateDark: 0x3f4550,
    limestone: 0xe8e0d0,
    clay: 0xc4b5a0,
    clayDark: 0x9a8b78,
    ash: 0x9ca3af,
    iron: 0x4b5563,
    rust: 0x8b5a3c,
    goldLeaf: 0xd4a84b,
    tombMoss: 0x5a6b4a,
    consoleGlow: 0x7fe0ff,
    bloodStain: 0x5c2030,
    floor: 0x6a707a,
    wall: 0x949aa4,
    accent: 0xc9b896,
    clayField: 0x877b68, // C1: overworld field tone (clayDark reads ~92/255 in full frame)
    ashField: 0x848b96, // V: bonetown field tone (ash reads ~105/255 in full frame)
};

/** High-entropy Abyss: basalt, charcoal, neon violet, kintsugi gold. */
// Structural tones (basalt/charcoal/floor/wall) were certification-retuned
// 2026-07-20: the old values sat at ~2% linear reflectance after sRGB→linear,
// so no sane light level could pull Abyss frames into the [35,75] band —
// beats 07/09/12 metered under 14 even at 4× ambient. Hue identity is kept;
// only reflectance rose (~2× sRGB ≈ 4× linear).
export const ABYSS_COLORS = {
    basalt: 0x544060,
    charcoal: 0x3c3048,
    violet: 0x8b5cf6,
    violetHot: 0xc084fc,
    goldVein: 0xffd060,
    goldHot: 0xffe8a0,
    neon: 0xff40c8,
    abyssFloor: 0x4c3c60,
    abyssWall: 0x5c4878,
    magma: 0xff5520,
    ice: 0xa0e8ff,
    iceDark: 0x3a6a8a,
    bone: 0xefe6d0,
    rot: 0x527c46,
    rotPale: 0x5f7a52,
    sludge: 0x66803c,
    pyre: 0xff6a20,
};

/** Hero construct — scarred salvage scavenger, not the engine sumo. */
export const HERO_PALETTE = {
    skin: 0xc8a88a,
    skinDark: 0xa07858,
    skinD2: 0x7a5840,
    hair: 0x2a2030,
    hairDark: 0x140e18,
    hairLight: 0x4a3a50,
    beard: 0x2a2030,
    beardDark: 0x140e18,
    freck: 0xb08060,
    belt: 0x3a4a5c,
    beltDark: 0x1e2834,
    eyeWhite: 0xf0ebe4,
    pupil: 0x101018,
    brow: 0x2a2030,
    mouth: 0x5c2030,
    teeth: 0xe8e0d0,
    eyeGlow: 0x40e0ff,
    clothingMode: 'casual',
};

/** Hostile constructs — distinct silhouettes per faction. */
export const ENEMY_PALETTES = {
    sentinel: {
        skin: 0x7a8090,
        skinDark: 0x4a5060,
        skinD2: 0x303848,
        hair: 0x2a3040,
        hairDark: 0x101820,
        hairLight: 0x4a5060,
        belt: 0x5a3040,
        beltDark: 0x301820,
        eyeGlow: 0xff4040,
        freck: 0x6a7080,
        beard: 0x2a3040,
        beardDark: 0x101820,
        eyeWhite: 0xe0e0e8,
        pupil: 0x100808,
        brow: 0x2a3040,
        mouth: 0x401018,
        teeth: 0xd0d0d8,
    },
    scarab: {
        skin: 0x3a5a40,
        skinDark: 0x1e3020,
        skinD2: 0x142018,
        hair: 0x1a2818,
        hairDark: 0x0a1008,
        hairLight: 0x2a3a28,
        belt: 0xd4a84b,
        beltDark: 0x8a6830,
        eyeGlow: 0xa0ff60,
        freck: 0x2a4a30,
        beard: 0x1a2818,
        beardDark: 0x0a1008,
        eyeWhite: 0xd0e8d0,
        pupil: 0x081008,
        brow: 0x1a2818,
        mouth: 0x203018,
        teeth: 0xc0d8c0,
    },
    frost: {
        skin: 0xa0c8e0,
        skinDark: 0x6088a8,
        skinD2: 0x406080,
        hair: 0xe0f0ff,
        hairDark: 0x80a0c0,
        hairLight: 0xffffff,
        belt: 0x40a0ff,
        beltDark: 0x2060a0,
        eyeGlow: 0x60e0ff,
        freck: 0x90b8d0,
        beard: 0xc0d8f0,
        beardDark: 0x6088a8,
        eyeWhite: 0xf0f8ff,
        pupil: 0x102030,
        brow: 0x6088a8,
        mouth: 0x305060,
        teeth: 0xe8f0f8,
    },
    // Z5 — four archetypes that exist to ask questions the original three
    // could not. Each reads as a distinct silhouette AND a distinct hue family,
    // because "which of these is the armoured one" has to be answerable from a
    // camera 17.5 units up, mid-fight, in one glance.
    bulwark: {
        // Plated slab: heavy warm brass over dark iron. Reads as ARMOUR.
        skin: 0x8a7a52,
        skinDark: 0x574a2c,
        skinD2: 0x332c1a,
        hair: 0x3a3226,
        hairDark: 0x1c1810,
        hairLight: 0x5c503a,
        belt: 0xd4a84b,
        beltDark: 0x8a6830,
        eyeGlow: 0xffb040,
        freck: 0x6e6244,
        beard: 0x3a3226,
        beardDark: 0x1c1810,
        eyeWhite: 0xe8e0c8,
        pupil: 0x120c04,
        brow: 0x3a3226,
        mouth: 0x40301c,
        teeth: 0xd8d0b8,
    },
    mote: {
        // Weightless pale violet with a hot core — the only floating hostile,
        // and the palette says "do not try to hit this with a sword".
        skin: 0xc8b0e8,
        skinDark: 0x8868b8,
        skinD2: 0x584080,
        hair: 0xe8d8ff,
        hairDark: 0x9878c8,
        hairLight: 0xffffff,
        belt: 0xc084fc,
        beltDark: 0x7040a8,
        eyeGlow: 0xe0a0ff,
        freck: 0xb098d8,
        beard: 0xd8c8f0,
        beardDark: 0x8868b8,
        eyeWhite: 0xf8f0ff,
        pupil: 0x200830,
        brow: 0x8868b8,
        mouth: 0x503060,
        teeth: 0xe8e0f8,
    },
    lancer: {
        // Long, thin, arterial red. Signals reach before it ever moves.
        skin: 0x9a4a4a,
        skinDark: 0x5e2a2c,
        skinD2: 0x381818,
        hair: 0x2a1418,
        hairDark: 0x140809,
        hairLight: 0x4a2428,
        belt: 0xff5533,
        beltDark: 0xa02a18,
        eyeGlow: 0xff6040,
        freck: 0x7a3a3a,
        beard: 0x2a1418,
        beardDark: 0x140809,
        eyeWhite: 0xf0d8d0,
        pupil: 0x180404,
        brow: 0x2a1418,
        mouth: 0x481818,
        teeth: 0xe0c8c0,
    },
    brood: {
        // Sickly chitinous yellow-green. Deliberately close to scarab: they
        // are cousins, and mistaking one for the other is a fair mistake that
        // teaches you to check before you commit to a killing blow.
        skin: 0x7a8a3a,
        skinDark: 0x4a5820,
        skinD2: 0x2c3614,
        hair: 0x3a4418,
        hairDark: 0x1a2008,
        hairLight: 0x5a6a28,
        belt: 0xaacc40,
        beltDark: 0x5a7020,
        eyeGlow: 0xccff60,
        freck: 0x6a7a30,
        beard: 0x3a4418,
        beardDark: 0x1a2008,
        eyeWhite: 0xe0e8c8,
        pupil: 0x101804,
        brow: 0x3a4418,
        mouth: 0x2c3814,
        teeth: 0xc8d8a8,
    },
};

// Presentation policy: mood may tint colour/fog/lights, but bloom/film/vignette
// stay moderate so combat stays readable for the whole run. Abyss used to push
// bloom 2.4 + film 0.45 and wash out bosses/pickups (players reported this
// after altar purchases, which often precede Abyss beats).
//
// A mood preset carries NO `drone` field, and adding one back is a regression
// the music spec fails on. Both moods used to define a sustained oscillator
// here — crust a square at 80 Hz, abyss a triangle at 220 Hz — which the mood
// controller started and never stopped. Deleting the call was not enough on its
// own: as long as the data existed, the next person to read this file would
// reasonably conclude the drone was meant to be playing and wire it back up.
export const MOOD_PRESETS = {
    crust: {
        background: 0x353028,
        fog: 0x353028,
        fogDensity: 0.008,
        bloom: 0.55,
        film: 0.08,
        vignette: 1.05,
        ambient: 0x9a8f78,
        ambientIntensity: 1.7,
        key: 0xffe8c0,
        keyIntensity: 1.9,
        fillIntensity: 0.7, // engine default — stated so mood switches can't leak the other preset's fill
    },
    abyss: {
        // Certification band for Abyss frames is [35,75] mean luminance.
        // The old 2.0/1.55 lighting metered 9-26 on the shipped beats —
        // moody in stills, unreadable in motion. Identity lives in the
        // violet hue and gold veins, not in crushing the exposure.
        background: 0x2e2246,
        fog: 0x2e2246,
        fogDensity: 0.005,
        bloom: 0.7,
        film: 0.1,
        vignette: 1.08,
        ambient: 0x9078c0,
        ambientIntensity: 3.4,
        key: 0xd8b0ff,
        keyIntensity: 2.1,
        fillIntensity: 1.1,
        noisePulse: true,
    },
};

// 1 world unit per level-map cell so authored spawns/enemies (cell coords)
// match meshAndCollide / getVoxelAt without a second scale pass.
export const VOXEL_SCALE = 1;
