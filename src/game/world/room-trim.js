// Bake-time room trim — parapets, pilasters and corner posts.
//
// The world was not under-detailed because of a technical constraint. Measured
// live: **79,572 triangles and 43 draw calls**, on a renderer that will take an
// order of magnitude more before anything hurts. It was under-detailed because
// nothing had ever asked it for more. A room was a floor rectangle and four
// walls of uniform height, and a wall whose top edge is a perfectly straight
// line at a constant height reads as a box, not as a built place.
//
// Two rules make this safe to apply to all fourteen dungeons plus the overworld
// at once, without re-auditing a single level:
//
//  1. **It only ever adds voxels ABOVE the wall top.** The hero occupies cells
//     y=1 and y=2 standing on a floor whose top is y=1. Nothing here is placed
//     below y = wallH + 1, so no column's collision classification can change,
//     no `getVoxelAt` answer in the body band can change, and no route, door
//     trigger, spawn point or pickup can be blocked. `tests/game/room-trim.spec.mjs`
//     asserts exactly that by diffing the occupied cell set at y <= 2.
//
//  2. **It only touches the room PERIMETER** (|x| == half or |z| == half) —
//     never interior structures. Interior geometry is where platforms, arches
//     and grapple routes live, and adding to it would mean re-checking every
//     traversal spec in the campaign. The perimeter is wall by definition.
//
// It costs no draw calls: the voxels go into the same Map the room is meshed
// from, so they merge into the existing geometry. Triangles go up, calls do not.
//
// Everything is derived from a deterministic hash of the cell coordinate and a
// per-room seed — no Math.random, because `presentation-determinism-e2e.spec.mjs`
// requires two loads of the same room to produce the same frame.

import { vkey } from '../../voxel/core.js';
import { shadeHex } from '../../voxel/helpers.js';

/**
 * Deterministic 0..1 hash. Integer mixing rather than a float trick so it is
 * stable across engines and across runs.
 */
function hash01(x, z, seed) {
    let h = (x * 374761393) ^ (z * 668265263) ^ (seed * 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return ((h >>> 0) % 100000) / 100000;
}

/** Stable small integer seed from a room id, so a room always trims the same. */
function seedOf(id) {
    let h = 2166136261;
    for (let i = 0; i < String(id).length; i++) {
        h ^= String(id).charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % 65536;
}

/** How much of the perimeter gets a raised merlon. */
const MERLON_RATE = 0.42;
/** Every Nth perimeter cell gets a taller pilaster. */
const PILASTER_EVERY = 7;
/** Extra height on a corner post, above the pilaster height. */
const CORNER_EXTRA = 2;

/**
 * Add trim to a baked room map, in place.
 *
 * @param {Map<string, number>} map  vkey -> colour, as built by buildRoomFloor
 *   and buildPerimeterWithDoors
 * @param {object} room  the room definition (needs `half`, optionally `wallH`)
 * @param {string} roomId  used only as a deterministic seed
 * @param {{enabled?: boolean, wallColor?: number}} opts
 * @returns {number} how many voxels were added (0 if disabled or not applicable)
 */
export function applyRoomTrim(map, room, roomId = 'room', opts = {}) {
    if (opts.enabled === false) return 0;
    const half = room?.half;
    if (!Number.isFinite(half) || half < 2) return 0;
    const wallH = room.wallH || 4;
    const seed = seedOf(roomId);
    let added = 0;

    /** Place a voxel only if the cell is empty and safely above the body band. */
    const put = (x, y, z, color) => {
        if (y <= 2) return; // rule 1 — never inside the band the hero occupies
        const k = vkey(x, y, z);
        if (map.has(k)) return;
        map.set(k, color);
        added++;
    };

    // Walk the perimeter ring once. A door gap has no wall cap at (x, wallH, z),
    // so testing for the cap is also what keeps trim from bridging a doorway
    // with a floating lintel the player would walk under and wonder about.
    for (let x = -half; x <= half; x++) {
        for (let z = -half; z <= half; z++) {
            const onEdge = Math.abs(x) === half || Math.abs(z) === half;
            if (!onEdge) continue;

            const capColor = map.get(vkey(x, wallH, z));
            if (capColor == null) continue; // doorway, carved gap, or no wall here

            const corner = Math.abs(x) === half && Math.abs(z) === half;
            // Position along the ring, so pilasters space evenly on all sides
            // instead of clustering where x and z happen to line up.
            const along = Math.abs(x) === half ? z + half : x + half;
            const pilaster = along % PILASTER_EVERY === 0;

            // Colours are slight LIFTS of the cap course.
            //
            // They were darkenings first, on the reasoning that trim above a
            // brightened cap is plain unlit stone and the new shadows should do
            // the work. The certification gate disagreed, immediately and
            // specifically: seven Abyss levels dropped ~4 points of mean
            // luminance and fell out of the bottom of their band. Trim stands
            // proud of the wall against the SKY, and the Abyss sky is dark
            // violet — dark trim against a dark background is not moody, it is
            // invisible, which is the exact failure that produced the
            // unreadable 9–26 rooms this project has fixed once already.
            //
            // Lifting instead makes the merlons read as stone tops catching
            // light, separates the silhouette from the background, and costs
            // nothing on the contrast floor because the lift is on the small
            // added area rather than across the whole room.
            if (corner) {
                // Corner posts. A room's corners are the first thing the eye
                // uses to read its shape, and four identical 90° verticals is
                // exactly what makes a room read as a box.
                const h = 2 + CORNER_EXTRA;
                for (let i = 1; i <= h; i++) {
                    put(x, wallH + i, z, shadeHex(capColor, i === h ? 1.18 : 1.09));
                }
            } else if (pilaster) {
                for (let i = 1; i <= 2; i++) {
                    put(x, wallH + i, z, shadeHex(capColor, 1.12));
                }
            } else if (hash01(x, z, seed) < MERLON_RATE) {
                // Merlons: a broken top edge. Randomised height, because a
                // regular crenellation is just a different ruler.
                const h = hash01(x + 977, z, seed) < 0.3 ? 2 : 1;
                for (let i = 1; i <= h; i++) {
                    put(x, wallH + i, z, shadeHex(capColor, i === 2 ? 1.14 : 1.07));
                }
            }
        }
    }

    return added;
}
