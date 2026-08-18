// Dungeon visual kits (Ticket G / Priority 4).
//
// Every beat gets a small, declared kit so its rooms read as one authored place
// instead of differently colored rectangular shells. The kit is data — a floor
// inlay PATTERN, a wall-cap treatment, an accent, two structural and two
// dressing prop kinds, an emissive motif, a region atmosphere, and a boss-arena
// rule — and it is applied consistently in every room by the room-graph baker
// (applyKit), so the same visual language shows in entry, traversal, and boss
// rooms.
//
// The floor inlay and wall cap recolor EXISTING floor/cap voxels to a brighter
// shade of the room's own palette. They never add solids (no collision or
// navigation change) and only ever brighten, so a room can drift toward its
// luminance-band ceiling but never below its floor — safe for the Abyss beats
// that sit just above the dark end of the band.

import { shadeHex } from '../../voxel/helpers.js';
import { wallProfile, wallTopAt } from '../world/wall-profile.js';

// ── Floor inlay patterns: pure (x,z) predicates over local room coords ──────
export const FLOOR_PATTERNS = {
    checker: (x, z) => ((x + z) & 3) === 0,
    stripesNS: (x, z) => (((z % 5) + 5) % 5) === 0,
    stripesEW: (x, z) => (((x % 5) + 5) % 5) === 0,
    grid: (x, z) => (x % 6 === 0) || (z % 6 === 0),
    rings: (x, z) => (Math.round(Math.hypot(x, z)) % 5) === 0,
    diagonal: (x, z) => (((x + z) % 6) + 6) % 6 === 0,
    weave: (x, z) => ((x & 3) === 0 && (z & 1) === 0) || ((z & 3) === 0 && (x & 1) === 0),
    lanes: (x, z) => (((x % 8) + 8) % 8) < 2,
    cross: (x, z) => Math.abs(x) < 2 || Math.abs(z) < 2 || (((x + z) % 7) + 7) % 7 === 0,
    scatter: (x, z) => (((x * 7 + z * 13) % 9) + 9) % 9 === 0,
    fans: (x, z) => (((Math.abs(x) + Math.abs(z)) % 4)) === 0,
};

/**
 * Each beat's kit. floorPattern keys FLOOR_PATTERNS; the rest documents the
 * authored language (structural/dressing props + emissive motif + atmosphere +
 * boss-arena rule) so entry/traversal/boss development stays consistent.
 */
export const KITS = {
    'beat-01-crypt': {
        name: 'Crypt', floorPattern: 'stripesNS', capShade: 1.25, accent: 0x7fe0ff,
        // Wall rake, 4 cells: a crypt is BURIED — the back wall climbs toward
        // the cold shaft the kit already declares, and the near lip stays low
        // so the room reads as a hole you are looking down into.
        // See world/wall-profile.js — the far wall is the one you look at.
        wallRise: 4,
        structural: ['burial_rows', 'broken_consoles'], dressing: ['predecessor_remains', 'grave_dust'],
        emissive: 'cold_shaft', atmosphere: 'cold_motes', bossRule: 'sunken_dais',
    },
    'beat-02-spindle': {
        name: 'Spindle', floorPattern: 'grid', capShade: 1.3, accent: 0xffd060,
        // Wall rake, 5 cells: a spindle is a tower seen from inside; the gear
        // bays want a back wall that runs off the top of the frame.
        // See world/wall-profile.js — the far wall is the one you look at.
        wallRise: 5,
        structural: ['gear_bays', 'rails'], dressing: ['capacitors', 'cable_coils'],
        emissive: 'capacitor_arc', atmosphere: 'sparks', bossRule: 'central_machine',
    },
    'beat-03-sink': {
        name: 'Sink', floorPattern: 'rings', capShade: 1.2, accent: 0xc8a060,
        // Wall rake, 2 cells: a sink is open sky and a low horizon —
        // `basin_low` is the boss rule, and a tall back wall would contradict
        // the one idea the dungeon has.
        // See world/wall-profile.js — the far wall is the one you look at.
        wallRise: 2,
        structural: ['sediment_ribs', 'wind_trenches'], dressing: ['buried_frames', 'drift_dust'],
        emissive: 'trench_glow', atmosphere: 'drifting_dust', bossRule: 'basin_low',
    },
    'beat-04-sky': {
        name: 'Sky', floorPattern: 'lanes', capShade: 1.35, accent: 0xbfe0ff,
        // Wall rake, 2 cells: `open_edges` and `open_platform`: this is a
        // monument standing in air, so the walls are parapets, not
        // architecture.
        // See world/wall-profile.js — the far wall is the one you look at.
        wallRise: 2,
        structural: ['stepped_monuments', 'open_edges'], dressing: ['cloud_cards', 'prayer_flags'],
        emissive: 'vertical_shaft', atmosphere: 'light_shafts', bossRule: 'open_platform',
    },
    'beat-05-citadel': {
        name: 'Citadel', floorPattern: 'diagonal', capShade: 1.3, accent: 0xd4a84b,
        // Wall rake, 5 cells: buttresses and false facades. The tallest thing a
        // pretender builds is the front of the building.
        // See world/wall-profile.js — the far wall is the one you look at.
        wallRise: 5,
        structural: ['buttresses', 'false_facades'], dressing: ['kintsugi_seams', 'proxy_doubles'],
        emissive: 'seam_gold', atmosphere: 'motes', bossRule: 'mirrored_hall',
    },
    'beat-06-quarry': {
        name: 'Quarry', floorPattern: 'stripesEW', capShade: 1.25, accent: 0xff6030,
        // Wall rake, 6 cells: cut strata — the back of every room is a rock
        // face somebody quarried down through, and it should read as sheer.
        // See world/wall-profile.js — the far wall is the one you look at.
        wallRise: 6,
        structural: ['cut_strata', 'braces'], dressing: ['rubble', 'ore_carts'],
        emissive: 'mineral_seam', atmosphere: 'grit', bossRule: 'stepped_pit',
    },
    'beat-07-sluice': {
        // capShade was 1.3 — stacked on a pale palette and a high lightTune it
        // helped blow the floor into the ACES shoulder. Structural surfaces stay
        // nearer neutral; identity lives in the accent (ticket 5).
        name: 'Sluice', floorPattern: 'lanes', capShade: 1.12, accent: 0x4a9fd4,
        // Wall rake, 4 cells: lock gates: high enough to hold water back, and
        // the channels run toward the camera.
        // See world/wall-profile.js — the far wall is the one you look at.
        wallRise: 4,
        structural: ['channels', 'gates'], dressing: ['hanging_chains', 'wet_debris'],
        emissive: 'wet_reflection', atmosphere: 'drips', bossRule: 'flooded_channel',
    },
    'beat-08-bone': {
        name: 'Bone', floorPattern: 'fans', capShade: 1.25, accent: 0xe8e0d0,
        // Wall rake, 6 cells: `rib_cathedral`. Ribs are vertical or they are
        // not ribs.
        // See world/wall-profile.js — the far wall is the one you look at.
        wallRise: 6,
        structural: ['rib_vaults', 'marrow_roots'], dressing: ['bone_piles', 'pale_particulate'],
        emissive: 'marrow_glow', atmosphere: 'pale_dust', bossRule: 'rib_cathedral',
    },
    'beat-09-town': {
        name: 'Town', floorPattern: 'checker', capShade: 1.25, accent: 0xb0a890,
        // Wall rake, 2 cells: street shells. The town is RUINED — nothing here
        // should stand tall enough to have survived.
        // See world/wall-profile.js — the far wall is the one you look at.
        wallRise: 2,
        structural: ['streets', 'room_shells'], dressing: ['signage', 'domestic_debris'],
        emissive: 'window_glow', atmosphere: 'phantom_duplicates', bossRule: 'plaza',
    },
    'beat-10-cryo': {
        name: 'Cryo', floorPattern: 'weave', capShade: 1.35, accent: 0xa0e8ff,
        // Wall rake, 5 cells: an ice atrium is a shaft you are standing at the
        // bottom of.
        // See world/wall-profile.js — the far wall is the one you look at.
        wallRise: 5,
        structural: ['ice_fins', 'pipes'], dressing: ['condensers', 'frost_crust'],
        emissive: 'condenser_glow', atmosphere: 'vapor', bossRule: 'ice_atrium',
    },
    'beat-11-mire': {
        name: 'Mire', floorPattern: 'scatter', capShade: 1.2, accent: 0x8fb060,
        // Wall rake, 2 cells: drowned and choked. A mire has no architecture
        // left above the waterline.
        // See world/wall-profile.js — the far wall is the one you look at.
        wallRise: 2,
        structural: ['shelves', 'drowned_furniture'], dressing: ['roots', 'sludge_bubbles'],
        emissive: 'bubble_glow', atmosphere: 'bubbles', bossRule: 'sunken_shelf',
    },
    'beat-12-pyre': {
        name: 'Pyre', floorPattern: 'fans', capShade: 1.4, accent: 0xff5520,
        // Wall rake, 3 cells: the peak is open to the sky; the basalt fans
        // stand up but the vents look out.
        // See world/wall-profile.js — the far wall is the one you look at.
        wallRise: 3,
        structural: ['vents', 'basalt_fans'], dressing: ['ember_pools', 'scoria'],
        emissive: 'ember_pool', atmosphere: 'heat_shimmer', bossRule: 'vent_ring',
    },
    'beat-13-gumoi': {
        name: 'GUMOI', floorPattern: 'grid', capShade: 1.3, accent: 0xff40c8,
        // Wall rake, 6 cells: the index court is a library the size of a tower
        // and the shelves go up.
        // See world/wall-profile.js — the far wall is the one you look at.
        wallRise: 6,
        structural: ['index_rails', 'displaced_copies'], dressing: ['scan_lines', 'glyph_stacks'],
        emissive: 'scan_line', atmosphere: 'index_scan', bossRule: 'index_court',
    },
    'beat-14-leviathan': {
        name: 'Leviathan', floorPattern: 'cross', capShade: 1.35, accent: 0x8b5cf6,
        // Wall rake, 5 cells: folded architecture, and the fold you notice is
        // the one above you.
        // See world/wall-profile.js — the far wall is the one you look at.
        wallRise: 5,
        structural: ['folded_architecture', 'recursion_markers'], dressing: ['spatial_seams', 'echo_frames'],
        emissive: 'seam_violet', atmosphere: 'recursion', bossRule: 'folded_core',
    },
};

/**
 * Recolor existing floor (y=0) and wall-cap (y=wallH) voxels to a brighter shade
 * of their own colour, in the kit's floor pattern. Adds no voxels. Deterministic.
 */
/**
 * Brightening that fades out as the source gets lighter, so a kit can lift a
 * dark floor without blowing an already-pale one to clipping white. `amount` is
 * the lift applied to black; a near-white cell is left alone.
 */
function lift(color, amount) {
    const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return shadeHex(color, 1 + amount * (1 - lum));
}

export function applyKit(map, kit, room) {
    if (!kit) return;
    const pattern = FLOOR_PATTERNS[kit.floorPattern] || FLOOR_PATTERNS.checker;
    // The cap course is the TOP of the wall, and in a raked room that height
    // changes along the ramp. Testing against one number would paint a stripe
    // across the middle of the side walls and leave their real tops unlit.
    const prof = wallProfile(room);
    const capShade = (kit.capShade || 1.25) - 1;
    for (const [k, color] of map) {
        const p = k.split(',');
        const x = +p[0], y = +p[1], z = +p[2];
        if (y === 0) {
            if (pattern(x, z)) map.set(k, lift(color, 0.16)); // floor inlay seam
        } else if (y === wallTopAt(prof, z, room.half)) {
            map.set(k, lift(color, capShade)); // brighter wall cap course
        }
    }
}

/** Count of declared kits — 14 authored dungeons. */
export const KIT_COUNT = Object.keys(KITS).length;

// ── Z2: legible traversal ──────────────────────────────────────────────────
//
// The player reported "constantly trying to climb up the walls". The cause is
// not that climbing is broken — it is that climbability is INVISIBLE. The
// physics body steps up exactly one voxel and there is no jump, so a surface
// is either walkable or it is a wall, and nothing in the geometry says which.
// In Zelda you always know, because stairs are drawn as stairs.
//
// This marks the rim of every genuine one-cell rise — the cells you actually
// step onto — with a consistent tread colour. Only the rim, never the whole
// platform top: a tread is an edge, and recolouring whole surfaces would drag
// rooms toward their luminance-band ceiling for no extra legibility.

/** The one colour in the game that means "you can stand up there". */
export const TREAD_COLOR = 0x8a9bb0;

/** Highest occupied cell +1 per column, across both the room and platform maps. */
function surfaceTops(maps) {
    const tops = new Map();
    for (const map of maps) {
        if (!map) continue;
        for (const k of map.keys()) {
            const p = k.split(',');
            const col = `${p[0]},${p[2]}`;
            const top = +p[1] + 1;
            if (!(tops.get(col) >= top)) tops.set(col, top);
        }
    }
    return tops;
}

/**
 * Recolour the rim of each climbable one-cell rise. `map` is the room's solid
 * geometry and `pmap` its platform staging; a rise may live in either, and the
 * floor it rises from may live in the other, so both are considered together
 * and the write goes back to whichever map actually owns the voxel.
 *
 * @returns {number} cells marked — the spec asserts this is non-trivial.
 */
export function markTraversal(map, pmap, kit) {
    const tops = surfaceTops([map, pmap]);
    const tread = (kit && kit.tread) || TREAD_COLOR;
    let marked = 0;
    for (const [col, top] of tops) {
        // top === 2 means the highest voxel in this column sits at y = 1:
        // exactly one cell above a floor whose surface is y = 1.
        if (top !== 2) continue;
        const [x, z] = col.split(',').map(Number);
        const steppable = [[1, 0], [-1, 0], [0, 1], [0, -1]]
            .some(([dx, dz]) => tops.get(`${x + dx},${z + dz}`) === 1);
        if (!steppable) continue;
        const key = `${x},1,${z}`;
        if (map && map.has(key)) { map.set(key, tread); marked++; }
        else if (pmap && pmap.has(key)) { pmap.set(key, tread); marked++; }
    }
    return marked;
}
