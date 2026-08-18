// @ts-check
// Per-side wall heights — how tall a room's walls are, and where.
//
// WHY A ROOM'S FOUR WALLS SHOULD NOT BE THE SAME HEIGHT
//
// The camera is FIXED-YAW. `camera-rig.js` never rotates about Y: it places the
// lens at `look + (0, height, +back)` and looks straight back down at the
// target, and `index.js` passes `height: 17.5, back: 6.125` — a 70.7° pitch.
// Nothing in the game turns it. That single fact gives each of a room's four
// walls a permanently different job:
//
//   N (z = -half)  THE FAR WALL. You look AT it. Its inner face is the back of
//                  the frame and it can never come between the lens and the
//                  hero, so it can be as tall as you like. This is where height
//                  is free, and it is the wall that decides whether a room
//                  reads as a hall or a yard.
//   S (z = +half)  THE NEAR WALL. It is ALWAYS between the lens and the hero.
//                  Measured (`tests/qa/wall-height-probe.mjs`), a hero standing
//                  against the south wall of beat 01's tomb is already hidden
//                  today — not by the wall, which tops out at y=5, but by a
//                  trim merlon at y=7 grazing the sight line. This wall has no
//                  headroom at all and wants LESS, not more.
//   E/W            The sides. They fill the left and right thirds of the frame
//                  and are the largest wall area on screen at this pitch.
//
// So a room is described by TWO numbers, `far` and `near`, and the side walls
// ramp between them. One formula covers all four walls, because along the N and
// S walls `z` is constant and the ramp degenerates to a flat course:
//
//     t = (z + half) / (2 * half)          0 at the far wall, 1 at the near
//     h = round(far + (near - far) * t)
//
// A raked room reads as a place with a back and a lip you look over, instead of
// a box with the frame cutting off all four identical sides.
//
// COMPATIBILITY IS THE POINT OF `wallH` STAYING A NUMBER. Every room that has
// not been converted passes a scalar and gets `far === near`, which makes the
// ramp constant and every downstream consumer produce byte-identical geometry.
// This file cannot change a room nobody converted, which is what makes it safe
// to land under a 5000-assertion suite and fourteen luminance gates at once.

/**
 * The tallest a near (south) wall may be, whatever a room asks for.
 *
 * MEASURED, not chosen. With the camera fully back — `look + (0, 17.5, +6.125)`,
 * which is where it sits in any room big enough that `_clampToBounds` does not
 * pull it in — the sight line to a hero's head standing hard against the south
 * wall passes y = 4.25 at the wall's inner face. A wall occupying cells 1..h
 * has its top surface at y = h + 1, so h = 3 clears it and h = 4 does not. In
 * a small room the clamp steepens the line and 4 would just fit; the cap has to
 * hold in the worst room, not the average one.
 */
export const NEAR_MAX = 3;

/**
 * The shortest any wall may be — and this one is a COLLISION rule, not a
 * composition one.
 *
 * `meshAndCollide` promotes a column to a solid only when `maxY >= 2`, because
 * a one-cell rise is a step the body walks up rather than a wall. A perimeter
 * course of height 1 would therefore mesh as scenery and let the player stroll
 * out of the room and off the world. Lowering the near wall is the whole point
 * of this file, so the floor under it needs saying out loud.
 */
export const WALL_MIN = 2;

/** The tallest a far (north) wall may be. Beyond this it leaves the frame. */
export const FAR_MAX = 12;

/** Default when a room says nothing at all — the historical `room.wallH || 4`. */
export const DEFAULT_WALL_H = 4;

/**
 * Resolve a room's authored wall height into `{ far, near, raked }`.
 *
 * `room.wallH` is either a number (all four sides, unchanged behaviour) or
 * `{ far, near }`. `raked` says which of those it was, because several
 * consumers deliberately keep their old behaviour for unraked rooms rather
 * than re-deriving a value they would only round back to the same number.
 *
 * @param {{wallH?: number | {far?: number, near?: number}}} room
 */
export function wallProfile(room) {
    const w = room?.wallH;
    if (w && typeof w === 'object') {
        const far = clamp(w.far != null ? w.far : DEFAULT_WALL_H, WALL_MIN, FAR_MAX);
        const near = clamp(w.near != null ? w.near : DEFAULT_WALL_H, WALL_MIN, NEAR_MAX);
        return { far, near, raked: true };
    }
    const h = Number.isFinite(w) ? /** @type {number} */ (w) : DEFAULT_WALL_H;
    return { far: h, near: h, raked: false };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * The top occupied cell of the perimeter wall at `z`, in room-local coords.
 *
 * Depends on `z` alone: the ramp runs from the far wall to the near wall, and
 * a cell's x never enters into it. That is what makes the N and S walls come
 * out flat without being special-cased, and what makes a corner agree with both
 * of the walls that meet there.
 *
 * @param {{far:number, near:number}} prof
 * @param {number} z     room-local z of the cell
 * @param {number} half  room half-extent
 */
export function wallTopAt(prof, z, half) {
    if (prof.far === prof.near) return prof.far;
    const t = clamp((z + half) / (2 * half), 0, 1);
    const h = Math.round(prof.far + (prof.near - prof.far) * t);
    // The ramp cannot dip below the collision floor either. Both ends are
    // already clamped, so this only ever matters if someone changes the curve.
    return Math.max(WALL_MIN, h);
}

/**
 * How many cells of trim may stand above the wall top at `z`, as a fraction of
 * whatever the trim wanted to add.
 *
 * The near wall gets nothing. Trim is the only thing in a room that reaches high
 * enough to graze the sight line to a hero standing against the south wall, and
 * it buys almost nothing there: at this pitch the south wall is off the bottom
 * of the frame whenever the hero is anywhere but pressed against it. Trading it
 * away costs a few merlons nobody sees and returns a hero who is never hidden.
 *
 * UNRAKED ROOMS ARE UNTOUCHED — they return 1 everywhere, so a room that has
 * not opted in keeps the exact silhouette its certification capture shows.
 *
 * @param {{far:number, near:number, raked:boolean}} prof
 * @param {number} z
 * @param {number} half
 * @returns {number} 0..1
 */
export function trimBudgetAt(prof, z, half) {
    if (!prof.raked) return 1;
    const t = clamp((z + half) / (2 * half), 0, 1);
    // Full trim across the far half, fading to nothing over the near half.
    return t <= 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) * 2);
}

/** The tallest wall course anywhere on this room's perimeter. */
export function maxWallTop(prof) {
    return Math.max(prof.far, prof.near);
}

/**
 * Apply a dungeon's authored wall rise to one room, without touching the def.
 *
 * The room keeps the height it already authored — that number becomes the NEAR
 * wall, and the kit's `wallRise` is how much further the FAR wall goes up. Doing
 * it that way preserves every per-room decision already in the level files: the
 * four rooms of beat 05 authored at 6 stay taller than the four authored at 5,
 * and they stay taller in the wall you can actually see. Replacing `wallH` with
 * a per-dungeon constant would have thrown all of that away and called it a
 * style.
 *
 * A room may still author `wallH: { far, near }` directly, and that wins — a
 * dungeon-wide rise is a default, not a decree.
 *
 * Returns a SHALLOW COPY. `def.rooms` is a module-level constant shared across
 * every load of the level, and writing a resolved height back into it would make
 * the second load of a dungeon see a different room than the first — the class
 * of bug that only appears after the player dies once.
 *
 * @param {object} room
 * @param {{wallRise?: number}|undefined|null} kit
 */
export function rakeRoom(room, kit) {
    if (!room) return room;
    if (room.wallH && typeof room.wallH === 'object') return room;   // authored
    const rise = kit?.wallRise;
    if (!Number.isFinite(rise) || rise <= 0) return room;            // opted out
    const base = Number.isFinite(room.wallH) ? room.wallH : DEFAULT_WALL_H;
    return { ...room, wallH: { far: base + rise, near: base } };
}
