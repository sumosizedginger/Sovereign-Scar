// @ts-check
// src/game/world/room-footprint.js
// A room outline that is not a square.
//
// ── THE GAP THIS CLOSES ────────────────────────────────────────────────────
//
// 108 rooms, 108 squares. `buildPerimeterWithDoors` walked a ring derived from
// a single `half`, so a square was not a choice any room made — it was the only
// thing the builder could produce. Ten distinct sizes, zero distinct shapes,
// and it is the thing that most reads as "engine" rather than "designed place".
// `docs/HOW-TO-CLOSE-THE-GAP.md` §2 calls it the big one and had deferred it
// twice.
//
// ── HOW IT WORKS, AND WHY THAT SHAPE ───────────────────────────────────────
//
// A room keeps its `half`, which stays the BOUNDING half-extent, and gains an
// optional `cut`: rectangles of the playable area that are not floor. The
// bounding box is untouched, so `roomRect`, `cameraBounds`, `halfSize`, the
// enemy confinement rect and the room-stride layout all keep working and keep
// meaning what they meant. The room gets smaller inside its box, never larger.
//
// THE CUT IS FILLED WITH SOLID ROCK, not left as a hole, and that one decision
// is what makes this safe to land on a shipped campaign. Every placement check
// in this codebase already asks the voxel map whether a cell is occupied —
// props (`map.has(x,1,z)`), the terrace lift, the dressing's `isBlocked`, the
// reachability probes' body-column test, `walkableCells`, `nearestFreeEntry`.
// Filling the cut means all of them refuse it without being told about
// footprints at all. The alternative — a hole the perimeter routes around —
// would have required finding and changing every one of those, which is this
// project's most expensive recurring bug: the sweep that fixes one place and
// misses the other five.
//
// ── WHAT THE VALIDATION IS FOR ─────────────────────────────────────────────
//
// A cut can strand a door, bury a key, wall off a spawn, or split a room in
// two. `validateFootprint` refuses all four, and `tests/game/room-footprint.spec.mjs`
// runs it over the whole campaign, so an unsafe outline cannot be authored
// quietly.
//
// THE CONNECTIVITY FLOOD USES ONE SEED. Seeding from every door at once and
// asking "did we reach every door" is a check that cannot fail: each door
// reaches itself. It has to flood from ONE and require the others. This
// project has already shipped that exact mistake once, on room connectivity,
// and it is written down as a rule rather than rediscovered.

/** Sides, matching `room-graph.js` DOOR_DIRS. */
const INWARD = { N: { x: 0, z: 1 }, S: { x: 0, z: -1 }, W: { x: 1, z: 0 }, E: { x: -1, z: 0 } };

/** Door gap width, restated from `room-graph.js` DOOR_WIDTH. */
const DOOR_WIDTH = 2;

/**
 * Clear cells a door needs on its inward side before the cut may take the rest.
 *
 * Two, not one. One leaves a doorway you can enter and then be standing in the
 * only free cell with rock on three sides — legal by every check and useless to
 * play. Two is a threshold you can turn around in.
 */
export const DOOR_APRON = 2;

/** Fewest playable cells an outline may leave. Below this it is a corridor, not a room. */
export const MIN_AREA = 24;

/**
 * Normalised cut rectangles for a room, in LOCAL inclusive cell coordinates.
 *
 * Accepts two authoring forms, because an L-shape is nearly always a corner and
 * writing it as one is far harder to get wrong than four coordinates:
 *
 *     cut: [{ corner: 'NE', w: 5, d: 4 }]
 *     cut: [{ x0: 2, x1: 6, z0: -6, z1: -3 }]
 *
 * `w` runs along X and `d` along Z, both measured inward from the corner.
 */
export function roomCuts(room) {
    const half = room?.half || 0;
    const play = half - 1;              // the wall ring is not playable
    const out = [];
    for (const c of room?.cut || []) {
        if (!c) continue;
        if (c.corner) {
            const w = Math.max(1, c.w | 0), d = Math.max(1, c.d | 0);
            const east = c.corner.includes('E'), north = c.corner.includes('N');
            out.push({
                x0: east ? play - w + 1 : -play,
                x1: east ? play : -play + w - 1,
                z0: north ? -play : play - d + 1,
                z1: north ? -play + d - 1 : play,
            });
            continue;
        }
        out.push({
            x0: Math.min(c.x0, c.x1), x1: Math.max(c.x0, c.x1),
            z0: Math.min(c.z0, c.z1), z1: Math.max(c.z0, c.z1),
        });
    }
    // Clamp into the playable square. A cut that runs past the wall is an
    // authoring convenience ("take the whole corner"), not an error.
    return out.map((r) => ({
        x0: Math.max(-play, r.x0), x1: Math.min(play, r.x1),
        z0: Math.max(-play, r.z0), z1: Math.min(play, r.z1),
    })).filter((r) => r.x0 <= r.x1 && r.z0 <= r.z1);
}

/** True when this room's outline is anything other than the full square. */
export function isShaped(room) {
    return roomCuts(room).length > 0;
}

/**
 * The room's outline.
 *
 * `has(lx,lz)` answers "is this local cell playable floor" — inside the wall
 * ring and not inside a cut. `blocks(lx,lz)` is its complement WITHIN the
 * bounding box, which is exactly the set of cells the perimeter has to fill:
 * the wall ring and the cut together, in one predicate, so the builder cannot
 * treat them as two different kinds of thing and get one of them wrong.
 */
export function roomFootprint(room, { withBlockers = false } = {}) {
    const half = room?.half || 0;
    const play = half - 1;
    const cuts = roomCuts(room);
    // BLOCKERS COUNT AS ROCK WHEN THE QUESTION IS CONNECTIVITY, and finding
    // that out cost a real bug. `goldgash` in beat 06 is a 9x9 secret whose
    // floor is a ONE-CELL RING around a `caster_dark` blocker filling x-3..3
    // by z-3..3. Two corner cuts severed that ring, islanding the door — and
    // `validateFootprint` passed it, because a blocker is not in the outline
    // and this function had never been told to look at one. `door-reach` found
    // it in the built world, which is the only place it was visible.
    //
    // Off by default: for DRAWING the room a blocker is a separate system that
    // stamps its own voxels, and treating it as outline here would build walls
    // twice. On for validation, where the question is "can the player get from
    // this door to that one on the day they arrive".
    const walls = withBlockers
        ? (room?.blockers || []).filter((b) => b && b.rect).map((b) => ({
            x0: Math.min(b.rect.x0, b.rect.x1), x1: Math.max(b.rect.x0, b.rect.x1),
            z0: Math.min(b.rect.z0, b.rect.z1), z1: Math.max(b.rect.z0, b.rect.z1),
        }))
        : [];
    const solid = cuts.concat(walls);
    const inCut = (lx, lz) => solid.some(
        (c) => lx >= c.x0 && lx <= c.x1 && lz >= c.z0 && lz <= c.z1,
    );
    const has = (lx, lz) => Math.abs(lx) <= play && Math.abs(lz) <= play && !inCut(lx, lz);
    let area = 0;
    for (let lx = -play; lx <= play; lx++) {
        for (let lz = -play; lz <= play; lz++) if (has(lx, lz)) area++;
    }
    return {
        half,
        play,
        cuts,
        has,
        blocks: (lx, lz) => Math.abs(lx) <= half && Math.abs(lz) <= half && !has(lx, lz),
        area,
        fullArea: (2 * play + 1) * (2 * play + 1),
        shaped: cuts.length > 0,
    };
}

/** The cells just inside a door — where the player stands on arrival. */
export function doorApron(room, door) {
    const half = room?.half || 0;
    const w = door.width || DOOR_WIDTH;
    const dir = INWARD[door.side] || INWARD.N;
    const cells = [];
    for (let i = 0; i < w; i++) {
        const c = door.at - Math.floor(w / 2) + i;
        const base = door.side === 'N' ? { x: c, z: -half }
            : door.side === 'S' ? { x: c, z: half }
                : door.side === 'W' ? { x: -half, z: c } : { x: half, z: c };
        for (let step = 1; step <= DOOR_APRON; step++) {
            cells.push({ x: base.x + dir.x * step, z: base.z + dir.z * step });
        }
    }
    return cells;
}

/**
 * Everything a cut is forbidden to bury, with reasons naming the thing.
 *
 * `extra` lets a caller add points a level file knows about and this module
 * cannot see — a key drop, a puzzle plate, an elite spawn ring.
 */
export function validateFootprint(room, extra = []) {
    const reasons = [];
    // The DRAWING footprint, for area and for reporting…
    const fp = roomFootprint(room);
    if (!fp.shaped) return { ok: true, reasons, footprint: fp };
    // …and the WALKING one, which also counts blockers as rock. A cut that is
    // harmless on an empty floor can sever a room whose middle is already
    // occupied by a shroud, a vault or a caster wall. See `roomFootprint`.
    const walk = roomFootprint(room, { withBlockers: true });

    if (fp.area < MIN_AREA) {
        reasons.push(`only ${fp.area} playable cells left (min ${MIN_AREA})`);
    }

    // 1. Doors, and room enough to stand inside one.
    for (const door of room.doors || []) {
        for (const c of doorApron(room, door)) {
            if (!fp.has(c.x, c.z)) {
                reasons.push(`door ${door.side}->${door.to} apron (${c.x},${c.z}) is cut away`);
            }
        }
    }

    // 2. The spawn, and every authored body.
    const points = [];
    if (room.spawn) points.push(['spawn', room.spawn.x || 0, room.spawn.z || 0]);
    for (const e of room.enemies || []) points.push([`enemy ${e.kind || '?'}`, e.x, e.z]);
    for (const p of extra) points.push([p.what || 'placed', p.x, p.z]);
    for (const [what, px, pz] of points) {
        const cx = Math.round(px), cz = Math.round(pz);
        if (!fp.has(cx, cz)) reasons.push(`${what} at (${px},${pz}) is inside the cut`);
    }

    // 3. CONNECTIVITY, FROM ONE SEED.
    //
    // Seeding every door and asking whether every door was reached is a check
    // that passes by construction — each seed reaches itself. Flood from the
    // first apron cell only; every other door has to be found.
    const doors = room.doors || [];
    const seedCell = doors.length
        ? doorApron(room, doors[0]).find((c) => walk.has(c.x, c.z))
        : (room.spawn ? { x: Math.round(room.spawn.x || 0), z: Math.round(room.spawn.z || 0) } : null);
    if (seedCell && walk.has(seedCell.x, seedCell.z)) {
        const seen = new Set([`${seedCell.x},${seedCell.z}`]);
        const queue = [seedCell];
        while (queue.length) {
            const c = queue.pop();
            for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = c.x + d[0], nz = c.z + d[1];
                const k = `${nx},${nz}`;
                if (seen.has(k) || !walk.has(nx, nz)) continue;
                seen.add(k);
                queue.push({ x: nx, z: nz });
            }
        }
        if (seen.size < walk.area) {
            reasons.push('outline is in two or more pieces: '
                + `${seen.size} of ${walk.area} walkable cells reachable from the first door`);
        }
        for (const door of doors) {
            const apron = doorApron(room, door);
            if (!apron.some((c) => seen.has(`${c.x},${c.z}`))) {
                reasons.push(`door ${door.side}->${door.to} is walled off from the rest of the room`);
            }
        }
        if (room.spawn) {
            const sx = Math.round(room.spawn.x || 0), sz = Math.round(room.spawn.z || 0);
            if (!seen.has(`${sx},${sz}`)) reasons.push('spawn is walled off from the doors');
        }
    } else {
        reasons.push('no door apron survived the cut, so nothing can be seeded');
    }

    return { ok: reasons.length === 0, reasons, footprint: fp };
}
