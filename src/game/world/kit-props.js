// @ts-check
// Phase F1 — the kit channels that had nothing behind them.
//
// `dungeon-kits.js` declares seven design channels per dungeon. `applyKit`
// read TWO of them (floorPattern, capShade) and `room-lights.js` read a third
// (emissive). The other four — `structural`, `dressing`, `bossRule`, `accent` —
// were **28 named prop kinds, 14 arena rules and 14 accent colours that nothing
// anywhere ever looked at**. Roughly 84 authored design declarations, three
// channels live.
//
// That is the highest-yield visual work available in this project, and it is
// specifically NOT "adding effects". The art direction was written down years
// of commits ago; this builds the game the designer already specified.
//
// HOW THE PROPS ARE BUILT
//
// Voxel maps, stamped into the room map at bake time, which means they are
// free: they mesh into the room's own geometry and cost no extra draw call, no
// extra material, and no update. The trade is that they are static — which is
// correct, because these are the things the room is MADE of, not things that
// happen in it.
//
// Structural props are big and go against walls; dressing props are small and
// scatter. Both are refused any cell the room has already committed to, so a
// rib vault cannot grow through a door and a pile of bones cannot bury a key.

import { fillBox } from '../../voxel/helpers.js';
import { CRUST_COLORS, ABYSS_COLORS } from '../assets/palettes.js';

/**
 * Every declared prop kind, as a builder over a local voxel map.
 *
 * `(map, x, z, accent, base)` — `x`/`z` are the prop's anchor, `accent` is this
 * dungeon's authored accent colour (the fourth dead channel, finally read), and
 * `base` is the room's own wall colour so a prop reads as the same stone the
 * room is cut from.
 *
 * Every one of these is a SILHOUETTE first. From a camera 17 units up, what
 * distinguishes a gear bay from a rib vault is its outline against the floor,
 * not its detail — so each builder commits to one clear shape and stops.
 */
export const PROP_BUILDERS = {
    // ── beat 01 crypt ──────────────────────────────────────────────────────
    burial_rows: (m, x, z, a, base) => {
        for (let i = 0; i < 3; i++) {
            fillBox(m, x, x + 2, 1, 1, z + i * 2, z + i * 2, base);
            fillBox(m, x + 2, x + 2, 2, 2, z + i * 2, z + i * 2, a);
        }
    },
    broken_consoles: (m, x, z, a, base) => {
        fillBox(m, x, x + 1, 1, 2, z, z, base);
        fillBox(m, x, x, 3, 3, z, z, a);
    },
    predecessor_remains: (m, x, z, a, base) => {
        fillBox(m, x, x + 1, 1, 1, z, z, base);
        fillBox(m, x, x, 2, 2, z, z, a);
    },
    grave_dust: (m, x, z, a, base) => {
        fillBox(m, x, x + 1, 1, 1, z, z + 1, base);
    },

    // ── beat 02 spindle ────────────────────────────────────────────────────
    gear_bays: (m, x, z, a, base) => {
        fillBox(m, x, x + 3, 1, 1, z, z + 3, base);
        fillBox(m, x + 1, x + 2, 2, 3, z + 1, z + 2, a);
    },
    rails: (m, x, z, a, base) => {
        fillBox(m, x, x + 5, 1, 1, z, z, base);
        fillBox(m, x, x + 5, 2, 2, z, z, a);
    },
    capacitors: (m, x, z, a, base) => {
        fillBox(m, x, x, 1, 3, z, z, base);
        fillBox(m, x, x, 4, 4, z, z, a);
    },
    cable_coils: (m, x, z, a, base) => {
        fillBox(m, x, x + 2, 1, 1, z, z, base);
        fillBox(m, x + 1, x + 1, 2, 2, z, z, a);
    },

    // ── beat 03 sink ───────────────────────────────────────────────────────
    sediment_ribs: (m, x, z, a, base) => {
        for (let i = 0; i < 4; i++) fillBox(m, x + i, x + i, 1, 1 + (i % 2), z, z + 2, base);
    },
    wind_trenches: (m, x, z, a, base) => {
        fillBox(m, x, x + 6, 1, 1, z, z, base);
        fillBox(m, x + 3, x + 3, 2, 2, z, z, a);
    },
    buried_frames: (m, x, z, a, base) => {
        fillBox(m, x, x + 2, 1, 2, z, z, base);
        fillBox(m, x + 1, x + 1, 3, 3, z, z, a);
    },
    drift_dust: (m, x, z, a, base) => fillBox(m, x, x + 2, 1, 1, z, z, base),

    // ── beat 04 sky ────────────────────────────────────────────────────────
    stepped_monuments: (m, x, z, a, base) => {
        fillBox(m, x, x + 3, 1, 1, z, z + 3, base);
        fillBox(m, x + 1, x + 2, 2, 2, z + 1, z + 2, base);
        fillBox(m, x + 1, x + 1, 3, 4, z + 1, z + 1, a);
    },
    open_edges: (m, x, z, a, base) => {
        fillBox(m, x, x + 4, 1, 1, z, z, base);
        fillBox(m, x, x + 4, 2, 2, z, z, a);
    },
    cloud_cards: (m, x, z, a, base) => fillBox(m, x, x + 2, 3, 3, z, z + 1, base),
    prayer_flags: (m, x, z, a) => {
        fillBox(m, x, x, 1, 4, z, z, a);
        fillBox(m, x + 1, x + 3, 4, 4, z, z, a);
    },

    // ── beat 05 citadel ────────────────────────────────────────────────────
    buttresses: (m, x, z, a, base) => {
        for (let i = 0; i < 3; i++) fillBox(m, x + i, x + i, 1, 4 - i, z, z, base);
        fillBox(m, x, x, 5, 5, z, z, a);
    },
    false_facades: (m, x, z, a, base) => {
        fillBox(m, x, x + 4, 1, 4, z, z, base);
        fillBox(m, x + 2, x + 2, 2, 3, z, z, a);
    },
    kintsugi_seams: (m, x, z, a) => {
        fillBox(m, x, x + 3, 1, 1, z, z, a);
    },
    proxy_doubles: (m, x, z, a, base) => {
        fillBox(m, x, x, 1, 3, z, z, base);
        fillBox(m, x, x, 4, 4, z, z, a);
    },

    // ── beat 06 quarry ─────────────────────────────────────────────────────
    cut_strata: (m, x, z, a, base) => {
        for (let i = 0; i < 4; i++) fillBox(m, x, x + 4 - i, 1 + i, 1 + i, z, z + 1, base);
    },
    braces: (m, x, z, a, base) => {
        fillBox(m, x, x, 1, 4, z, z, base);
        fillBox(m, x + 3, x + 3, 1, 4, z, z, base);
        fillBox(m, x, x + 3, 4, 4, z, z, a);
    },
    rubble: (m, x, z, a, base) => {
        fillBox(m, x, x + 1, 1, 1, z, z + 1, base);
        fillBox(m, x, x, 2, 2, z, z, base);
    },
    ore_carts: (m, x, z, a, base) => {
        fillBox(m, x, x + 2, 1, 2, z, z + 1, base);
        fillBox(m, x + 1, x + 1, 3, 3, z, z, a);
    },

    // ── beat 07 sluice ─────────────────────────────────────────────────────
    channels: (m, x, z, a, base) => {
        fillBox(m, x, x + 6, 1, 1, z, z, base);
        fillBox(m, x, x + 6, 1, 1, z + 2, z + 2, base);
        fillBox(m, x + 3, x + 3, 2, 2, z + 1, z + 1, a);
    },
    gates: (m, x, z, a, base) => {
        fillBox(m, x, x, 1, 4, z, z, base);
        fillBox(m, x + 3, x + 3, 1, 4, z, z, base);
        fillBox(m, x, x + 3, 3, 3, z, z, a);
    },
    hanging_chains: (m, x, z, a) => fillBox(m, x, x, 2, 5, z, z, a),
    wet_debris: (m, x, z, a, base) => fillBox(m, x, x + 1, 1, 1, z, z, base),

    // ── beat 08 bone ───────────────────────────────────────────────────────
    rib_vaults: (m, x, z, a, base) => {
        for (let i = 0; i < 3; i++) {
            fillBox(m, x + i * 2, x + i * 2, 1, 4, z, z, base);
            fillBox(m, x + i * 2, x + i * 2, 5, 5, z, z, a);
        }
    },
    marrow_roots: (m, x, z, a, base) => {
        fillBox(m, x, x + 3, 1, 1, z, z, base);
        fillBox(m, x + 1, x + 1, 2, 3, z, z, a);
    },
    bone_piles: (m, x, z, a, base) => {
        fillBox(m, x, x + 1, 1, 1, z, z + 1, base);
        fillBox(m, x, x, 2, 2, z, z, a);
    },
    pale_particulate: (m, x, z, a, base) => fillBox(m, x, x, 1, 1, z, z, base),

    // ── beat 09 town ───────────────────────────────────────────────────────
    streets: (m, x, z, a, base) => {
        fillBox(m, x, x + 7, 1, 1, z, z, base);
        fillBox(m, x, x + 7, 1, 1, z + 3, z + 3, base);
    },
    room_shells: (m, x, z, a, base) => {
        fillBox(m, x, x + 4, 1, 3, z, z, base);
        fillBox(m, x, x, 1, 3, z, z + 4, base);
        fillBox(m, x + 4, x + 4, 1, 3, z, z + 2, base);
    },
    signage: (m, x, z, a, base) => {
        fillBox(m, x, x, 1, 3, z, z, base);
        fillBox(m, x, x + 1, 4, 4, z, z, a);
    },
    domestic_debris: (m, x, z, a, base) => fillBox(m, x, x + 1, 1, 1, z, z, base),

    // ── beat 10 cryo ───────────────────────────────────────────────────────
    ice_fins: (m, x, z, a, base) => {
        for (let i = 0; i < 4; i++) fillBox(m, x + i, x + i, 1, 2 + (i % 3), z, z, base);
        fillBox(m, x + 1, x + 2, 5, 5, z, z, a);
    },
    pipes: (m, x, z, a, base) => {
        fillBox(m, x, x + 5, 3, 3, z, z, base);
        fillBox(m, x + 2, x + 2, 1, 3, z, z, a);
    },
    condensers: (m, x, z, a, base) => {
        fillBox(m, x, x + 1, 1, 2, z, z + 1, base);
        fillBox(m, x, x, 3, 3, z, z, a);
    },
    frost_crust: (m, x, z, a) => fillBox(m, x, x + 2, 1, 1, z, z, a),

    // ── beat 11 mire ───────────────────────────────────────────────────────
    shelves: (m, x, z, a, base) => {
        fillBox(m, x, x + 4, 1, 1, z, z + 2, base);
        fillBox(m, x, x + 4, 2, 2, z, z, a);
    },
    drowned_furniture: (m, x, z, a, base) => {
        fillBox(m, x, x + 2, 1, 2, z, z, base);
        fillBox(m, x, x, 3, 3, z, z, a);
    },
    roots: (m, x, z, a, base) => {
        fillBox(m, x, x + 3, 1, 1, z, z, base);
        fillBox(m, x + 2, x + 2, 2, 2, z, z, a);
    },
    sludge_bubbles: (m, x, z, a) => fillBox(m, x, x, 1, 1, z, z, a),

    // ── beat 12 pyre ───────────────────────────────────────────────────────
    vents: (m, x, z, a, base) => {
        fillBox(m, x, x + 2, 1, 1, z, z + 2, base);
        fillBox(m, x + 1, x + 1, 2, 2, z + 1, z + 1, a);
    },
    basalt_fans: (m, x, z, a, base) => {
        for (let i = 0; i < 5; i++) fillBox(m, x + i, x + i, 1, 1 + (i % 3), z, z, base);
    },
    ember_pools: (m, x, z, a) => fillBox(m, x, x + 1, 1, 1, z, z + 1, a),
    scoria: (m, x, z, a, base) => fillBox(m, x, x, 1, 2, z, z, base),

    // ── beat 13 gumoi ──────────────────────────────────────────────────────
    index_rails: (m, x, z, a, base) => {
        fillBox(m, x, x + 6, 2, 2, z, z, base);
        fillBox(m, x, x + 6, 3, 3, z, z, a);
    },
    displaced_copies: (m, x, z, a, base) => {
        fillBox(m, x, x, 1, 3, z, z, base);
        fillBox(m, x + 2, x + 2, 1, 3, z + 2, z + 2, base);
        fillBox(m, x + 2, x + 2, 4, 4, z + 2, z + 2, a);
    },
    scan_lines: (m, x, z, a) => fillBox(m, x, x + 4, 1, 1, z, z, a),
    glyph_stacks: (m, x, z, a, base) => {
        fillBox(m, x, x, 1, 2, z, z, base);
        fillBox(m, x, x, 3, 3, z, z, a);
    },

    // ── beat 14 leviathan ──────────────────────────────────────────────────
    folded_architecture: (m, x, z, a, base) => {
        fillBox(m, x, x + 3, 1, 3, z, z, base);
        fillBox(m, x, x, 1, 3, z, z + 3, base);
        fillBox(m, x + 3, x + 3, 4, 4, z, z, a);
    },
    recursion_markers: (m, x, z, a, base) => {
        fillBox(m, x, x + 4, 1, 1, z, z + 4, base);
        fillBox(m, x + 1, x + 3, 2, 2, z + 1, z + 3, base);
        fillBox(m, x + 2, x + 2, 3, 3, z + 2, z + 2, a);
    },
    spatial_seams: (m, x, z, a) => fillBox(m, x, x + 3, 1, 1, z, z, a),
    echo_frames: (m, x, z, a, base) => {
        fillBox(m, x, x + 2, 1, 3, z, z, base);
        fillBox(m, x + 1, x + 1, 2, 2, z, z, a);
    },
};

/** How much floor a prop kind is allowed to take, so placement can keep clear. */
const FOOTPRINT = 8;

/** Deterministic per-room stream, so a room looks the same on every visit. */
function streamFor(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return () => {
        h ^= h << 13; h >>>= 0;
        h ^= h >> 17;
        h ^= h << 5; h >>>= 0;
        return h / 4294967296;
    };
}

/**
 * Stamp this dungeon's authored props into a room.
 *
 * Structural props hug the walls (they are what the room is built OF); dressing
 * scatters through the middle (it is what was left in it). Both refuse any cell
 * `isBlocked` claims, cell-group by cell-group, so a prop is skipped rather
 * than clipped.
 *
 * Returns how many were placed, so a probe can measure the dressing density
 * rather than trusting it.
 */
/** @param {(x: number, z: number) => boolean} [isBlocked] */
export function stampKitProps(map, kit, room, roomId, isBlocked = () => false) {
    if (!kit || !room) return 0;
    const half = room.half || 0;
    if (half < 6) return 0;
    const accent = kit.accent || CRUST_COLORS.goldLeaf;
    const base = room.wallColor || CRUST_COLORS.slate;
    const rand = streamFor(`${kit.name}:${roomId}`);
    let placed = 0;

    const tryStamp = (kind, x, z) => {
        const build = PROP_BUILDERS[kind];
        if (!build) return false;
        for (let dx = -1; dx <= FOOTPRINT; dx++) {
            for (let dz = -1; dz <= FOOTPRINT; dz++) {
                if (isBlocked(x + dx, z + dz)) return false;
            }
        }
        build(map, x, z, accent, base);
        placed++;
        return true;
    };

    // Structural: along the four walls, two per wall, inset far enough that a
    // prop is a thing you walk past rather than a thing you walk into.
    const structural = kit.structural || [];
    if (structural.length) {
        const inset = half - 4;
        const spots = [
            { x: -inset, z: -inset }, { x: inset - 6, z: -inset },
            { x: -inset, z: inset - 4 }, { x: inset - 6, z: inset - 4 },
        ];
        for (const [i, s] of spots.entries()) {
            tryStamp(structural[i % structural.length], s.x, s.z);
        }
    }

    // Dressing: scattered, and the count scales with the room so a small room
    // does not end up as a junk shop.
    const dressing = kit.dressing || [];
    if (dressing.length) {
        const n = Math.max(2, Math.round(half * 0.6));
        for (let i = 0; i < n; i++) {
            const x = Math.round((rand() * 2 - 1) * (half - 3));
            const z = Math.round((rand() * 2 - 1) * (half - 3));
            tryStamp(dressing[i % dressing.length], x, z);
        }
    }
    return placed;
}

/**
 * Phase F1 — `bossRule`: fourteen arena shapes, as terraces in the platform map.
 *
 * Arena shape is boss design as much as moveset is, and every one of these was
 * authored (`sunken_dais`, `central_machine`, `open_platform`, …) and read by
 * nothing. They go in the PLATFORM map for the same reason the ordinary
 * terracing does: standable, never blocking, and no arrangement can strand a
 * boss or a player.
 *
 * `sunken` shapes are built as a raised RIM rather than a dug pit, because
 * digging the floor out from under a fourteen-boss roster is a traversal audit
 * per arena, and every one of those bosses clamps itself to the arena already.
 */
export const ARENA_RULES = {
    sunken_dais: 'rim',
    central_machine: 'pillar',
    basin_low: 'rim',
    open_platform: 'edge',
    mirrored_hall: 'aisle',
    stepped_pit: 'steps',
    flooded_channel: 'aisle',
    rib_cathedral: 'colonnade',
    plaza: 'edge',
    ice_atrium: 'pillar',
    sunken_shelf: 'rim',
    vent_ring: 'ring',
    index_court: 'colonnade',
    folded_core: 'ring',
};

export function shapeBossArena(pmap, kit, room, color) {
    const rule = ARENA_RULES[kit?.bossRule];
    const half = room?.half || 0;
    if (!rule || half < 8) return 0;
    let placed = 0;
    const put = (x, z, top) => {
        if (Math.abs(x) > half - 1 || Math.abs(z) > half - 1) return;
        fillBox(pmap, x, x, 1, top, z, z, color);
        placed++;
    };
    const d = half - 2;

    if (rule === 'rim') {
        // A raised lip all the way round: the arena floor reads as sunken
        // without a single voxel being removed.
        for (let x = -d; x <= d; x++) { put(x, -d, 1); put(x, d, 1); }
        for (let z = -d + 1; z <= d - 1; z++) { put(-d, z, 1); put(d, z, 1); }
    } else if (rule === 'pillar') {
        // Four standing masses. Cover, and something for a charge to slam into.
        for (const [px, pz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
            put(px, pz, 2); put(px + 1, pz, 2); put(px, pz + 1, 2); put(px + 1, pz + 1, 2);
        }
    } else if (rule === 'edge') {
        // A rim only on two sides, so the arena has a front and a back.
        for (let x = -d; x <= d; x++) put(x, -d, 1);
        for (let z = -d; z <= d; z++) put(-d, z, 1);
    } else if (rule === 'aisle') {
        // Two long benches down the middle: lanes, which is what a boss that
        // fights in lines wants underfoot.
        for (let z = -d + 2; z <= d - 2; z++) { put(-3, z, 1); put(3, z, 1); }
    } else if (rule === 'steps') {
        for (let r = d; r >= d - 3; r--) {
            const h = d - r + 1;
            for (let x = -r; x <= r; x++) { put(x, -r, h); put(x, r, h); }
            for (let z = -r + 1; z <= r - 1; z++) { put(-r, z, h); put(r, z, h); }
        }
    } else if (rule === 'colonnade') {
        // Measured (tests/qa, arena census): this placed SIX single cells in a
        // room 26 across — every other rule places 16 to 272 — so the Bone
        // Cathedral and the Index Court were the only two boss arenas a player
        // could not tell from an ordinary room. A colonnade is a row of columns;
        // three lonely cells a side is a rounding error.
        //
        // Paired 2-wide columns marching down the long axis, spaced by room
        // size so a bigger hall gets a longer nave rather than the same six
        // stubs. Height 2, not 3: `platform-reachability` caught 3-tall columns
        // stranding nine cells above the player's step height in the Index
        // Court. Every other rule here tops out at 2 for the same reason.
        const cx = Math.max(4, half - 5);
        const step = Math.max(3, Math.floor(half / 3));
        for (let i = -2; i <= 2; i++) {
            const z = i * step;
            if (Math.abs(z) > half - 3) continue;
            for (const sx of [-cx, cx]) { put(sx, z, 2); put(sx + 1, z, 2); }
        }
    } else if (rule === 'ring') {
        const r = Math.max(4, Math.floor(half * 0.55));
        for (let a = 0; a < 24; a++) {
            const th = (a / 24) * Math.PI * 2;
            put(Math.round(Math.cos(th) * r), Math.round(Math.sin(th) * r), 1);
        }
    }
    return placed;
}

export { ABYSS_COLORS };
