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
import { wallProfile, wallTopAt } from './wall-profile.js';

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

    // ── The overworld's eight regions ──────────────────────────────────────
    //
    // HEAVIER THAN ANY DUNGEON'S, deliberately, and the reason is geometry
    // rather than taste. `makeProtector` keeps a radius-6 disc clear at the
    // centre of every screen so the spawn and the door lanes always work —
    // measured, that disc holds **0 of 109 cells with any mass on them**. The
    // camera frame reaches 6.2 units toward the lens and 6.8 away, so standing
    // where the player arrives, the entire vertical extent of the frame is
    // inside the empty disc. There is no wall, no ceiling and no prop in shot.
    //
    // Nothing SOLID may go there, by design. Weathering is colour only — it
    // recolours voxels that already exist and never adds, removes or moves one
    // — so it is the one thing that can put variation where the player is
    // actually standing without touching a route.
    //
    // Coverage and strength were set with `tests/qa/contrast-probe.mjs` open,
    // and capped at the 0.45 this table's own spec enforces — past that a decal
    // stops being weathering and becomes the floor colour.
    // Each colour is chosen for VALUE separation from its region floor, not for
    // hue: a wash the same brightness as the ground is invisible from 17 metres
    // up, which is the mistake the Abyss palette already made once.
    // NAMESPACED, and not for tidiness. Three of the eight region ids are one
    // capital letter away from a dungeon kit — `quarry`/`Quarry`,
    // `spindle`/`Spindle`, `pyre`/`Pyre` — and a lookup that silently found the
    // wrong one would put iron bleed on a clay field and be very hard to see.
    'ow:tombfields': { color: 0x4a4438, coverage: 0.40, strength: 0.44, where: 'both' },
    'ow:spindle': { color: 0x22262c, coverage: 0.38, strength: 0.44, where: 'both' },
    'ow:sinklands': { color: 0x6a4a2c, coverage: 0.42, strength: 0.44, where: 'both' },
    'ow:citadel': { color: 0x3e3628, coverage: 0.36, strength: 0.44, where: 'both' },
    'ow:quarry': { color: 0x241e26, coverage: 0.40, strength: 0.44, where: 'both' },
    'ow:bonetown': { color: 0x4a4636, coverage: 0.40, strength: 0.44, where: 'both' },
    'ow:cryomire': { color: 0x24323c, coverage: 0.40, strength: 0.44, where: 'both' },
    // PYRE IS THE ONE THAT HAD TO BE PULLED BACK, and the certification gate
    // is what said so: at 0x3a2018 / 0.42 / 0.44 — the darkest colour of the
    // eight at the highest coverage — the ABYSS state of this region metered
    // 71.5 against a band floor of 76, while every other region sat at 81 to
    // 107. The abyss floors are already dark, so the same scorch that reads as
    // weathering on rust reads as underexposure on basalt.
    'ow:pyre': { color: 0x5a4038, coverage: 0.34, strength: 0.36, where: 'both' },
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
    // A ROOM MAY NAME ITS OWN, and that is what lets the overworld have any.
    //
    // Weathering was keyed on the KIT, and the overworld has no kit — so all
    // forty-nine screens fell through this function untouched, which is a large
    // part of why the overworld metered a p10-to-p90 spread of 11 against 68 to
    // 189 in the dungeons. Its eight regions are not one kit and never will be,
    // so the name comes off the screen instead.
    const name = room?.weathering || kit?.name;
    const spec = WEATHERING[name];
    if (!spec || !map?.size) return 0;
    const prof = wallProfile(room || {});
    const half = room?.half || 8;
    const seed = seedOf(`${name}:${roomId}`);
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
        const isWall = y >= 1 && y < wallTopAt(prof, z, half);
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
