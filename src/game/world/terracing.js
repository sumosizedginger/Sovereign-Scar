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
 */
export function terraceRoom(pmap, room, roomId, color, isBlocked = () => false) {
    const half = room.half || 0;
    if (half < MIN_HALF) return 0;
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
