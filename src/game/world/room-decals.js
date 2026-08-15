// @ts-check
// Bake-time weathering — scorch, moss, frost, staining, dust.
//
// Every dungeon already declares an `atmosphere` in its kit ('drips', 'vapor',
// 'heat_shimmer', 'grit'), and every one of those was a particle effect in the
// air with nothing on the ground to match it. The Mire has bubbles rising off a
// floor with no algae on it; the Pyre has heat shimmer over unscorched stone;
// the Cryo Vault has vapour above ice that has never frosted. The atmosphere
// said what the place was and the surfaces did not agree.
//
// This is COLOUR ONLY. It recolours voxels that already exist and never adds,
// removes or moves one, so it is gameplay-neutral by construction — no
// collision, no traversal, no `getVoxelAt` answer changes. That is what makes it
// safe to run across all fourteen dungeons at once, and
// `tests/game/room-decals.spec.mjs` asserts the cell SET is untouched rather
// than trusting the claim.
//
// Two things it has to get right beyond looking like dirt:
//
// **Patches, not static.** A per-cell random threshold gives salt-and-pepper
// noise, which reads as compression artefacts. Weathering pools — it collects in
// corners and runs down surfaces. The strength here comes from a value-noise
// field sampled on a coarse lattice and smoothly interpolated, so cells near
// each other get similar values and the result is blobs.
//
// **It must not drift the luminance band.** `applyKit` solved this by being
// brighten-only, which cannot work here: scorch is dark and that is the point.
// Instead each decal declares a `bias` — how much darker it is allowed to make
// the room on average — and coverage is kept low enough that the product stays
// inside the noise floor of the certification gate. The numbers below were set
// with `tests/qa/contrast-probe.mjs` open, not guessed.

/**
 * Per-kit weathering. `color` is what the surface tends toward, `coverage` is
 * the fraction of eligible cells that receive any, `strength` is the maximum
 * blend at the centre of a patch, and `where` picks floor / wall / both.
 *
 * Keyed by kit name so a kit and its weathering cannot drift apart silently.
 */
export const WEATHERING = {
    // Grave dust settling on a floor nobody has walked in a long time.
    Crypt: { color: 0x8a8270, coverage: 0.30, strength: 0.30, where: 'floor' },
    // Oil and scorch around machinery.
    Spindle: { color: 0x3a3020, coverage: 0.22, strength: 0.34, where: 'floor' },
    // Wind-driven sand piling against the walls.
    Sink: { color: 0xc8a870, coverage: 0.34, strength: 0.30, where: 'both' },
    // Sun-bleaching on exposed stone.
    Sky: { color: 0xe0e4ea, coverage: 0.26, strength: 0.22, where: 'both' },
    // Gold leaf and tarnish, the Citadel's own decay.
    Citadel: { color: 0xa8905c, coverage: 0.24, strength: 0.26, where: 'wall' },
    // Iron bleed off cut rock.
    Quarry: { color: 0x8a4a28, coverage: 0.26, strength: 0.34, where: 'both' },
    // Waterline staining — the kit's atmosphere is literally 'drips'.
    Sluice: { color: 0x3a5a68, coverage: 0.32, strength: 0.34, where: 'both' },
    // Bone dust.
    Bone: { color: 0xd8d0bc, coverage: 0.28, strength: 0.26, where: 'floor' },
    // Long-abandoned grime.
    Town: { color: 0x60584a, coverage: 0.26, strength: 0.28, where: 'both' },
    // Frost creeping up the walls, matching 'vapor'.
    Cryo: { color: 0xc8ecff, coverage: 0.34, strength: 0.30, where: 'both' },
    // Algae, matching 'bubbles'.
    Mire: { color: 0x5c7a34, coverage: 0.36, strength: 0.36, where: 'both' },
    // Scorch, matching 'heat_shimmer'.
    Pyre: { color: 0x2e1c14, coverage: 0.28, strength: 0.36, where: 'both' },
    // Burn-in from the index scan.
    GUMOI: { color: 0x7a2a60, coverage: 0.24, strength: 0.28, where: 'wall' },
    // Deep-water staining.
    Leviathan: { color: 0x2c2a48, coverage: 0.28, strength: 0.30, where: 'both' },
};

/** Lattice size for the noise field, in cells. Bigger = broader patches. */
const LATTICE = 6;

/** Deterministic 0..1 at a lattice node. No Math.random — determinism gate. */
function nodeVal(gx, gz, seed) {
    let h = (gx * 374761393) ^ (gz * 668265263) ^ (seed * 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return ((h >>> 0) % 100000) / 100000;
}

const fade = (t) => t * t * (3 - 2 * t);

/** Smooth value noise in 0..1 — this is what turns speckle into patches. */
function noise2(x, z, seed) {
    const fx = x / LATTICE, fz = z / LATTICE;
    const gx = Math.floor(fx), gz = Math.floor(fz);
    const tx = fade(fx - gx), tz = fade(fz - gz);
    const a = nodeVal(gx, gz, seed), b = nodeVal(gx + 1, gz, seed);
    const c = nodeVal(gx, gz + 1, seed), d = nodeVal(gx + 1, gz + 1, seed);
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
}

function seedOf(id) {
    let h = 2166136261;
    const s = String(id);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % 65536;
}

/** Blend a colour toward `target` by t in 0..1. */
function mixHex(from, target, t) {
    const fr = (from >> 16) & 255, fg = (from >> 8) & 255, fb = from & 255;
    const tr = (target >> 16) & 255, tg = (target >> 8) & 255, tb = target & 255;
    const r = Math.round(fr + (tr - fr) * t);
    const g = Math.round(fg + (tg - fg) * t);
    const b = Math.round(fb + (tb - fb) * t);
    return (r << 16) | (g << 8) | b;
}

/**
 * Weather a baked room map in place.
 *
 * @param {Map<string, number>} map  vkey -> colour
 * @param {object} room  needs `half`, optionally `wallH`
 * @param {object|null} kit  the dungeon kit (its `name` selects the weathering)
 * @param {string} roomId  deterministic seed
 * @param {{enabled?: boolean}} opts
 * @returns {number} how many voxels were recoloured
 */
export function applyRoomDecals(map, room, kit, roomId = 'room', opts = {}) {
    if (opts.enabled === false) return 0;
    const spec = WEATHERING[kit?.name];
    if (!spec || !map?.size) return 0;
    const wallH = room?.wallH || 4;
    const seed = seedOf(`${kit.name}:${roomId}`);
    // The cut-off that produces `coverage`: value noise is roughly uniform, so
    // taking the top `coverage` fraction of the field is just a threshold.
    const cut = 1 - spec.coverage;
    let touched = 0;

    for (const [k, color] of map) {
        const p = k.split(',');
        const x = +p[0], y = +p[1], z = +p[2];

        const isFloor = y === 0;
        // The wall cap is left alone: `applyKit` deliberately brightens it as a
        // lit inlay, and weathering over the top of that would undo the one
        // piece of shading the room already had.
        const isWall = y >= 1 && y < wallH;
        if (spec.where === 'floor' && !isFloor) continue;
        if (spec.where === 'wall' && !isWall) continue;
        if (spec.where === 'both' && !isFloor && !isWall) continue;

        // Walls are sampled on (x+z, y) so staining runs VERTICALLY down a
        // face. Sampling a wall on (x, z) gives it the floor's pattern smeared
        // sideways, which reads as a texture error rather than as weathering.
        const n = isFloor ? noise2(x, z, seed) : noise2(x + z, y * 2, seed + 991);
        if (n < cut) continue;

        // Ramp from 0 at the patch edge to `strength` at its centre, so patches
        // have soft boundaries instead of a visible contour line.
        const t = ((n - cut) / spec.coverage) * spec.strength;
        map.set(k, mixHex(color, spec.color, t));
        touched++;
    }

    return touched;
}

/** Kit names that declare weathering — used by the spec to require coverage. */
export const WEATHERED_KITS = Object.keys(WEATHERING);
