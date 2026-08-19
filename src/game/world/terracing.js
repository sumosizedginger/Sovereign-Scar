// @ts-check
// Phase E2 — vertical interest.
//
// WHY THIS KEEPS GETTING UNDONE
//
// Flat floors have been ticketed twice (`VISUAL_PLAN.md` 6,
// `GRAPHICS-OVERHAUL.md` 4) and dropped both times, because both times it was
// filed as a graphics ticket. It is not. It is a level-design ticket with a
// graphics symptom: the soft shadows and contact darkening this project already
// paid for have nothing to fall on, every room is traversally identical, and
// there are no ledges or high ground for the ranged enemies to want.
//
// THE ONE RULE THAT MAKES THIS SAFE TO DO FROM A TABLE
//
// **Only ever ADD, one cell at a time, and never on the platform map's own
// terms.** Rises go in the PLATFORM map, which `bakeRoom` meshes without XZ
// solids — so a terrace is standable but never blocking, and a one-cell step is
// exactly what `VoxelPhysicsBody` climbs. That means no arrangement this file
// can produce is able to make anywhere unreachable, which is the audit
// (`OPEN_QUESTIONS.md` §3) that stopped it the last two times.
//
// The cost of the rule is that these are LEDGES, not pits. A room with a sunken
// middle would be better looking and would need the traversal re-audit done by
// hand, per room, which is real work and the right work — it is just not work
// that can be done blind from a table without gambling with the campaign.

import { fillBox } from '../../voxel/helpers.js';

/** Nothing is terraced closer than this to a door, spawn, or authored prop. */
export const KEEPOUT = 2;
/** Rooms below this get nothing — a ledge in a corridor is an obstacle. */
export const MIN_HALF = 8;
/**
 * At or above this, a room is tiled with several small rises instead of given
 * one shape.
 *
 * 16 rather than a round number: the camera frame reaches about 10.8 units to
 * the side and 6.8 away, so a room whose half-extent is 16 is already wider
 * than anything the player can see at once. Below that a single shape still
 * reads as the shape of the room, which is what it is for.
 */
export const LARGE_HALF = 16;
/**
 * Spacing of the rises on a large room, in cells.
 *
 * Smaller than the frame's shallow axis (13 cells deep) on purpose, so there is
 * always relief in shot however the player is standing. Larger than a body, so
 * the result is terrain rather than rubble.
 */
export const LARGE_PITCH = 11;

/**
 * Which shape a room gets, derived from its id so a dungeon is varied but a
 * room is always the same on every visit and in every spec run.
 */
function shapeFor(roomId) {
    let h = 2166136261;
    for (let i = 0; i < roomId.length; i++) {
        h ^= roomId.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ['dais', 'rim', 'steps'][(h >>> 0) % 3];
}

/**
 * Add this room's terracing to `pmap` (the platform map, local coords).
 *
 * `isBlocked(x, z)` reports everything the room has already committed to —
 * geometry, doorways, spawns, the puzzle vault. Anything it refuses is skipped
 * cell by cell rather than cancelling the whole shape, so a terrace flows around
 * a pillar instead of vanishing because of one.
 *
 * @param {Map<string, number>} pmap
 * @param {{half?: number}} room
 * @param {string} roomId
 * @param {number} color
 * @param {(x: number, z: number) => boolean} [isBlocked]
 */
export function terraceRoom(pmap, room, roomId, color, isBlocked = () => false) {
    const half = room.half || 0;
    if (half < MIN_HALF) return 0;
    // A SCREEN IS NOT A ROOM, and one shape stretched across it is invisible.
    //
    // Every shape below is parameterised off `half`, which is right for the
    // dungeons they were written for (half 8-11: `rim` lands at d=6..9, just
    // inside the frame edge). The overworld's screens are half 23. At that size
    // `rim` puts its shelf 21 units out and `dais` makes a fifteen-wide plateau
    // — measured, the overworld carried 0 of 109 cells with any mass on them
    // within radius 6 of where the player arrives, while the camera frame is
    // only 13 units deep. All the relief existed and none of it was ever on
    // screen, which is a large part of why the overworld metered a p10-to-p90
    // spread of 11 against 68 to 189 in the dungeons.
    if (half >= LARGE_HALF) return terraceLarge(pmap, half, roomId, color, isBlocked);
    const shape = shapeFor(roomId);
    let placed = 0;
    const put = (x, z, top) => {
        if (Math.abs(x) > half - 1 || Math.abs(z) > half - 1) return;
        if (isBlocked(x, z)) return;
        fillBox(pmap, x, x, 1, top, z, z, color);
        placed++;
    };

    if (shape === 'dais') {
        // A raised centre with a one-cell lip, so the middle of the room is
        // somewhere you stand ON rather than walk through. The boss-arena
        // motif, borrowed for the ordinary rooms.
        const r = Math.max(2, Math.floor(half * 0.34));
        for (let x = -r; x <= r; x++) {
            for (let z = -r; z <= r; z++) {
                if (Math.abs(x) === r || Math.abs(z) === r) put(x, z, 1);
                else put(x, z, 1);
            }
        }
    } else if (shape === 'rim') {
        // A shelf along two walls. High ground for whatever is shooting at you,
        // and a silhouette for the key light to break against.
        const d = half - 2;
        for (let x = -d; x <= d; x++) {
            put(x, -d, 1);
            put(x, -d + 1, 1);
        }
        for (let z = -d + 2; z <= d; z++) {
            put(-d, z, 1);
            put(-d + 1, z, 1);
        }
    } else {
        // Two terraces stepping up into one corner. The only shape here that
        // gets two cells high, and it gets there one step at a time.
        const d = half - 2;
        for (let x = 1; x <= d; x++) {
            for (let z = 1; z <= d; z++) {
                const step = Math.min(x, z);
                if (step >= 4) put(x, z, 2);
                else if (step >= 2) put(x, z, 1);
            }
        }
    }
    return placed;
}

/**
 * Relief for a room bigger than the camera can see at once.
 *
 * A grid of small rises at `LARGE_PITCH`, each one seeded from the room id and
 * its own grid cell, so a screen is varied, a cell is stable across visits and
 * across spec runs, and neighbouring screens do not repeat.
 *
 * Same rule as everything else in this file: platform map, one cell at a time,
 * `isBlocked` obeyed per cell. Nothing here can make anywhere unreachable.
 */
function terraceLarge(pmap, half, roomId, color, isBlocked) {
    let placed = 0;
    const put = (x, z, top) => {
        if (Math.abs(x) > half - 1 || Math.abs(z) > half - 1) return;
        if (isBlocked(x, z)) return;
        fillBox(pmap, x, x, 1, top, z, z, color);
        placed++;
    };
    const lim = Math.floor((half - 2) / LARGE_PITCH);
    for (let gx = -lim; gx <= lim; gx++) {
        for (let gz = -lim; gz <= lim; gz++) {
            const seed = hashOf(`${roomId}:${gx}:${gz}`);
            // A quarter of the cells stay flat. Relief everywhere is its own
            // kind of uniform, and the gaps are where a fight has room.
            if ((seed >>> 3) % 4 === 0) continue;
            // Jittered off the lattice so the result is not visibly a grid.
            const cx = gx * LARGE_PITCH + ((seed >>> 5) % 7) - 3;
            const cz = gz * LARGE_PITCH + ((seed >>> 9) % 7) - 3;
            const r = 2 + ((seed >>> 13) % 3);          // 2..4
            const two = ((seed >>> 17) % 3) === 0;      // a third get a second step
            for (let x = -r; x <= r; x++) {
                for (let z = -r; z <= r; z++) {
                    const d = Math.max(Math.abs(x), Math.abs(z));
                    if (d > r) continue;
                    // Stepped, not a plinth: the outer ring is one cell, the
                    // core of a taller rise is two. A one-cell step is what the
                    // body climbs, so every ring is reachable from the one
                    // outside it.
                    put(cx + x, cz + z, two && d <= r - 2 ? 2 : 1);
                }
            }
        }
    }
    return placed;
}

/** FNV-1a, matching `shapeFor` — one hash in this file, not two. */
function hashOf(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** How high a body climbs without jumping. `MAX_STEP_HEIGHT`, voxel-physics-body.js. */
const WALK_STEP = 1;

/**
 * Put a step against anything the player can see the top of and cannot reach.
 *
 * THE REPORT THIS ANSWERS, from play: *"if these pieces of land are of equal
 * height, shouldn't I be able to walk on them?"* Measured on the overworld's
 * start screen: **2025 standable cells, 2006 reachable, 19 raised cells cut
 * off** — two flat-topped plateaus at heights 3 and 4 sitting on a floor at 1.
 *
 * They are grammar masses (`g.box(x, x+2, 2, 3, ...)`), not terraces, and they
 * predate this pass. But a two-cell mass with a flat top, in the same rock as
 * the ground, at a height the eye reads as a step, is a thing the player walks
 * up to and tries to stand on. Either it should look like a cliff or it should
 * be climbable, and adding a step is far cheaper than re-authoring the eight
 * grammars.
 *
 * SAFE BY THE SAME RULE AS EVERYTHING ELSE HERE: it only ever ADDS to the
 * platform map, one cell at a time, obeying `isBlocked`. Platform voxels mesh
 * without XZ solids, so nothing this places can block a route — it can only
 * make more of the room reachable than before.
 *
 * @param {Map<string, number>} map        the room's own voxels
 * @param {Map<string, number>} pmap       the platform map, written to
 * @param {number} half                    room bounding half-extent
 * @param {number} color                   step colour
 * @param {(x: number, z: number) => boolean} [isBlocked]
 * @returns {number} cells added
 */
export function rampIsolatedRises(map, pmap, half, color, isBlocked = () => false) {
    const solid = (x, y, z) => map.has(`${x},${y},${z}`) || pmap.has(`${x},${y},${z}`);
    /** Lowest surface with a body's worth of room above it — matches walkableCells. */
    const surf = (x, z) => {
        for (let y = 1; y <= 10; y++) {
            if (!solid(x, y - 1, z)) continue;
            if (solid(x, y, z) || solid(x, y + 1, z)) continue;
            return y;
        }
        return null;
    };
    const H = half - 1;
    const height = new Map();
    for (let x = -H; x <= H; x++) {
        for (let z = -H; z <= H; z++) {
            const y = surf(x, z);
            if (y != null) height.set(`${x},${z}`, y);
        }
    }
    if (!height.has('0,0')) return 0;

    // Flood from the centre with the body's real step limit.
    const reach = () => {
        const seen = new Set(['0,0']);
        const q = ['0,0'];
        while (q.length) {
            const k = q.pop();
            const p = k.split(',');
            const x = +p[0], z = +p[1], y = height.get(k);
            for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nk = `${x + d[0]},${z + d[1]}`;
                if (seen.has(nk) || !height.has(nk)) continue;
                if (Math.abs(height.get(nk) - y) > WALK_STEP) continue;
                seen.add(nk);
                q.push(nk);
            }
        }
        return seen;
    };

    let added = 0;
    // Iterate: one course of steps can expose the next one up a tall plateau.
    for (let pass = 0; pass < 6; pass++) {
        const seen = reach();
        let placedThisPass = 0;
        for (const [k, y] of height) {
            if (seen.has(k)) continue;
            const p = k.split(',');
            const x = +p[0], z = +p[1];
            for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + d[0], nz = z + d[1];
                const nk = `${nx},${nz}`;
                if (!seen.has(nk)) continue;
                const ny = height.get(nk);
                if (y - ny <= WALK_STEP) continue;
                // Raise the REACHED neighbour by one, never the plateau: the
                // step is built on the ground you are standing on, so the mass
                // keeps the silhouette its grammar authored.
                if (Math.abs(nx) > H || Math.abs(nz) > H) continue;
                if (isBlocked(nx, nz)) continue;
                fillBox(pmap, nx, nx, 1, ny, nz, nz, color);
                height.set(nk, ny + 1);
                added++;
                placedThisPass++;
                break;
            }
        }
        if (!placedThisPass) break;
    }
    return added;
}
