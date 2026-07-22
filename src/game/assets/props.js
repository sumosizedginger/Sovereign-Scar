// Procedural prop / set dressing maps — original voxel art for Sovereign Scar.
// Each builder returns a Map of vkey -> colorHex for buildVoxelGeo.

import { vkey } from '../../voxel/core.js';
import { fillBox, fillEllipsoid } from '../../voxel/helpers.js';
import { CRUST_COLORS, ABYSS_COLORS } from './palettes.js';

/** Fallen predecessor — unmerged limbs scattered on the crypt floor. */
export function buildScatteredPredecessor(ox = 0, oz = 0) {
    const m = new Map();
    const C = CRUST_COLORS;
    // Torso remnant
    fillBox(m, ox - 1, ox + 1, 0, 2, oz - 1, oz + 1, C.slate);
    // Severed arm
    fillBox(m, ox + 3, ox + 6, 0, 0, oz + 1, oz + 1, C.clay);
    // Severed leg
    fillBox(m, ox - 4, ox - 2, 0, 0, oz - 2, oz - 1, C.clayDark);
    // Head shell
    fillEllipsoid(m, ox + 2, 1, oz - 3, 1.2, 1.2, 1.2, C.limestone);
    // Gold scar seam on torso
    m.set(vkey(ox, 1, oz), C.goldLeaf);
    m.set(vkey(ox, 2, oz), C.goldLeaf);
    return m;
}

/** Dead console pedestal with cyan flare. */
export function buildDeadConsole(ox = 0, oz = 0) {
    const m = new Map();
    const C = CRUST_COLORS;
    fillBox(m, ox - 2, ox + 2, 0, 2, oz - 1, oz + 1, C.iron);
    fillBox(m, ox - 1, ox + 1, 3, 3, oz - 1, oz + 1, C.slateDark);
    m.set(vkey(ox, 3, oz), C.consoleGlow);
    m.set(vkey(ox, 4, oz), C.consoleGlow);
    return m;
}

/** Memory key monolith shard (collectible pedestal). */
export function buildMemoryKeyPedestal(ox = 0, oz = 0, hue = 0x7fe0ff) {
    const m = new Map();
    fillBox(m, ox - 1, ox + 1, 0, 1, oz - 1, oz + 1, CRUST_COLORS.slateDark);
    m.set(vkey(ox, 2, oz), hue);
    m.set(vkey(ox, 3, oz), hue);
    m.set(vkey(ox, 4, oz), 0xffffff);
    return m;
}

/** Rotating gear slice (2D top-down ring of voxels). */
export function buildGearRing(radius = 4, thickness = 1, color = CRUST_COLORS.iron) {
    const m = new Map();
    for (let x = -radius - 1; x <= radius + 1; x++) {
        for (let z = -radius - 1; z <= radius + 1; z++) {
            const d = Math.hypot(x, z);
            if (d <= radius && d >= radius - thickness) {
                for (let y = 0; y <= 2; y++) m.set(vkey(x, y, z), color);
            }
            // Teeth
            if (Math.abs(d - radius) < 0.6 && ((x + z * 3) % 3 === 0)) {
                for (let y = 0; y <= 2; y++) m.set(vkey(x, y, z), CRUST_COLORS.goldLeaf);
            }
        }
    }
    return m;
}

/** Kintsugi basalt pillar for Abyss rooms. */
export function buildKintsugiPillar(ox = 0, oz = 0, h = 8) {
    const m = new Map();
    for (let y = 0; y < h; y++) {
        fillBox(m, ox - 1, ox + 1, y, y, oz - 1, oz + 1, ABYSS_COLORS.basalt);
        if (y % 2 === 0) m.set(vkey(ox, y, oz + 1), ABYSS_COLORS.goldVein);
        if (y % 3 === 0) m.set(vkey(ox + 1, y, oz), ABYSS_COLORS.violet);
    }
    return m;
}

/** Breakable quarry boulder cluster. */
export function buildBoulder(ox = 0, oy = 0, oz = 0, r = 2, color = CRUST_COLORS.slate) {
    const m = new Map();
    for (let x = -r; x <= r; x++) {
        for (let y = 0; y <= r; y++) {
            for (let z = -r; z <= r; z++) {
                if (x * x + (y - r * 0.3) * (y - r * 0.3) + z * z <= r * r + 0.5) {
                    m.set(vkey(ox + x, oy + y, oz + z), color);
                }
            }
        }
    }
    // Gold fracture lines
    m.set(vkey(ox, oy + 1, oz), CRUST_COLORS.goldLeaf);
    m.set(vkey(ox + 1, oy + 1, oz), CRUST_COLORS.goldLeaf);
    return m;
}

/** Ice crystal formation (Cryo Vault). */
export function buildIceCrystal(ox = 0, oz = 0) {
    const m = new Map();
    fillBox(m, ox, ox, 0, 5, oz, oz, ABYSS_COLORS.ice);
    fillBox(m, ox - 1, ox + 1, 2, 3, oz, oz, ABYSS_COLORS.iceDark);
    fillBox(m, ox, ox, 2, 3, oz - 1, oz + 1, ABYSS_COLORS.ice);
    m.set(vkey(ox, 6, oz), 0xffffff);
    return m;
}

/** Magma vent (Pyre Peak). */
export function buildMagmaVent(ox = 0, oz = 0) {
    const m = new Map();
    fillBox(m, ox - 2, ox + 2, 0, 1, oz - 2, oz + 2, ABYSS_COLORS.basalt);
    fillBox(m, ox - 1, ox + 1, 1, 1, oz - 1, oz + 1, ABYSS_COLORS.magma);
    m.set(vkey(ox, 2, oz), ABYSS_COLORS.pyre);
    return m;
}

/** Bone arch (Bone Forest). */
/**
 * Z1: the arch is BROKEN at the crown, and deliberately so.
 *
 * It used to close: a solid lintel across the full span, which from a camera
 * at height 17.5 is a roof — walk under one and the player vanishes. That was
 * the last outstanding violation of the camera contract in the campaign.
 *
 * Two ribs that corbel inward and stop short read as the same silhouette (a
 * dead god's ribs never met either; a spine would have) while leaving the
 * crown open, so each side contributes only a two-cell overhang and the play
 * space underneath stays visible from above.
 */
export function buildBoneArch(ox = 0, oz = 0, w = 4, h = 5) {
    const m = new Map();
    const bone = ABYSS_COLORS.bone;
    for (let y = 0; y < h; y++) {
        m.set(vkey(ox - w, y, oz), bone);
        m.set(vkey(ox + w, y, oz), bone);
    }
    // Corbel: one cell in at the shoulder, two at the tip. The gap between the
    // tips is what keeps this a rib and not a lintel.
    for (const s of [-1, 1]) {
        m.set(vkey(ox + s * (w - 1), h - 1, oz), bone);
        m.set(vkey(ox + s * (w - 1), h, oz), bone);
        if (w >= 3) m.set(vkey(ox + s * (w - 2), h, oz), bone);
    }
    return m;
}

/** Sand mound / trench marker. */
export function buildSandMound(ox = 0, oz = 0, r = 3) {
    const m = new Map();
    for (let x = -r; x <= r; x++) {
        for (let z = -r; z <= r; z++) {
            const d = Math.hypot(x, z);
            if (d <= r) {
                const h = Math.max(0, Math.floor((r - d) * 0.6));
                for (let y = 0; y <= h; y++) m.set(vkey(ox + x, y, oz + z), CRUST_COLORS.clay);
            }
        }
    }
    return m;
}

/** Offset-copy a map into another. */
export function stampMap(dest, src, ox = 0, oy = 0, oz = 0) {
    for (const [k, c] of src) {
        const [x, y, z] = k.split(',').map(Number);
        dest.set(vkey(x + ox, y + oy, z + oz), c);
    }
    return dest;
}
