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
    floor: 0x5a5f68,
    wall: 0x8a909a,
    accent: 0xc9b896,
};

/** High-entropy Abyss: basalt, charcoal, neon violet, kintsugi gold. */
export const ABYSS_COLORS = {
    basalt: 0x1a1218,
    charcoal: 0x0d0a10,
    violet: 0x8b5cf6,
    violetHot: 0xc084fc,
    goldVein: 0xffd060,
    goldHot: 0xffe8a0,
    neon: 0xff40c8,
    abyssFloor: 0x140e18,
    abyssWall: 0x221828,
    magma: 0xff5520,
    ice: 0xa0e8ff,
    iceDark: 0x3a6a8a,
    bone: 0xefe6d0,
    rot: 0x3d5c34,
    sludge: 0x4a5c28,
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
};

export const MOOD_PRESETS = {
    crust: {
        background: 0x1a1c22,
        fog: 0x1a1c22,
        fogDensity: 0.012,
        bloom: 0.6,
        film: 0.18,
        vignette: 1.0,
        ambient: 0x8890a0,
        key: 0xd0d8e8,
        drone: { type: 'square', freq: 80, vol: 0.22, id: 'mood' },
    },
    abyss: {
        background: 0x0a0514,
        fog: 0x0a0514,
        fogDensity: 0.008,
        bloom: 2.4,
        film: 0.55,
        vignette: 0.4,
        ambient: 0x3a2060,
        key: 0xffc0e0,
        drone: { type: 'triangle', freq: 220, vol: 0.16, id: 'mood' },
        noisePulse: true,
    },
};

// 1 world unit per level-map cell so authored spawns/enemies (cell coords)
// match meshAndCollide / getVoxelAt without a second scale pass.
export const VOXEL_SCALE = 1;
