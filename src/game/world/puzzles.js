// Phase E1 — the authored puzzle beats.
//
// WHAT THIS PLACES, AND THE ONE BIG DESIGN DECISION IN IT
//
// Every level def already declares `theme: { teach, develop, combine, test }`
// naming four rooms, and that structure has been sitting there describing a
// pedagogy the game only ever applied to its combat. This gives each of those
// four rooms one puzzle beat, in that order: the mechanic alone, then a twist,
// then the same idea with a fight on top of it, then the exam.
//
// **Every one of these guards a REWARD, never a route.** That is the decision,
// and it is not timidity — it is the only honest thing to do from a table.
// A gate placed across a corridor has to know that the corridor is not the only
// way to a door, and this pass authors fourteen dungeons' worth of puzzles
// without reading fourteen dungeons' worth of room layouts. Get an alcove wrong
// and the player misses a pickup they can come back for. Get a corridor gate
// wrong and the run is over. This project has already shipped two softlocks.
//
// The consequence is honest and worth stating plainly: these are OPTIONAL
// puzzles. Making them mandatory is a per-room authoring job — real work, and
// the right work — but it is layout work, not systems work, and doing it blind
// from a table would be gambling with the campaign.
//
// THE SECOND DECISION: TWO SHAPES, NOT SIX
//
// A plate-led dungeon and a switch-led dungeon, alternating. Not because more
// shapes would be worse, but because a dungeon whose four puzzle beats are four
// unrelated mechanics has taught nothing — the `teach → develop → combine →
// test` structure only means something if the four beats are the SAME idea
// getting harder. Beat 12, whose item is the light, gets the beam and mirror in
// its exam room as a showcase for the primitive.

/** Signal names are per-dungeon, so two rooms cannot cross wires by accident. */
const sig = (beatNo, slot) => `pz:${beatNo}:${slot}`;

/**
 * THREE slots, not four, and the missing one is `test`.
 *
 * Measured, not assumed: in all fourteen dungeons `theme.test` IS the boss
 * room. The plan read that slot as "the exam, before the boss"; the campaign
 * has always used it as the boss itself. So the exam moves to `combine` — which
 * is also where the dungeon's elite now stands, and a permanent puzzle next to
 * the hardest fight in the dungeon is a better exam than a quiet room anyway.
 */
export const SLOTS = ['teach', 'develop', 'combine'];

/** Which corner each slot prefers, so two slots in one room cannot overlap. */
const CORNER = {
    teach: { sx: -1, sz: -1 },
    develop: { sx: 1, sz: -1 },
    combine: { sx: -1, sz: 1 },
};

const CORNERS = [
    { sx: -1, sz: -1 }, { sx: 1, sz: -1 }, { sx: -1, sz: 1 }, { sx: 1, sz: 1 },
];

/**
 * The smallest room a puzzle fits in.
 *
 * Also measured rather than assumed. The first version wanted half 9 for a 4x4
 * vault and qualified sixteen rooms out of fifty-six — the campaign's rooms are
 * mostly half 7 and 8. The vault is 3x3 now and sits against the room wall, and
 * the furniture stands three units in front of it, which fits a half-7 room
 * with the middle still clear to fight in.
 */
export const MIN_HALF = 7;

/**
 * How wide the alcove is ACROSS ITS MOUTH, in cells.
 *
 * Five, and the two that were shaved off are the whole reason. The side walls
 * stand on the outermost columns, so a three-wide alcove has a **one-cell
 * interior**: the player came through a three-cell doorway into a 1.0 slot with
 * 0.10 of clearance either side of a 0.8 body. That is the same 0.10 that made
 * the doorway itself unusable last time, moved one step further in — the door
 * was widened and the room behind it was left a slot.
 *
 * At five the interior is three cells across, so the space the reward sits in is
 * as wide as the way into it. Measured by `tests/qa/puzzle-solve.mjs`, which
 * drives the real body through the real geometry.
 *
 * The depth stays three. Depth costs nothing — nothing has to squeeze past
 * anything along it — and growing the footprint is what disqualifies corners.
 *
 * IT MUST BE ODD. `cx` is the midpoint of the footprint and every loose piece is
 * placed relative to it; an even width puts `cx` on a half-integer, and `settle`
 * is integer-grid from end to end — cell keys, the ring search, `canPush`. Width
 * four does not misplace a few pieces, it places NONE: the whole campaign bakes
 * zero puzzles. Three and five are the choices.
 *
 * It stays at THREE, and the interior is widened instead by dropping the wall
 * that was never doing anything — see `flush` below. Five measured well (the
 * route in went from 1.40 to 2.00) but the bigger footprint lost three corners
 * outright and left a fourth puzzle unsolvable, and an optional cache that
 * cannot be solved is worse than one that is merely snug.
 */
const VAULT_W = 3;

/** Plate-led on odd beats, switch-led on even ones. */
export function flavourFor(beatNo) {
    return beatNo % 2 === 1 ? 'plate' : 'switch';
}

/**
 * Build the blocker defs for one room's puzzle beat.
 *
 * Returns `[]` when the room is too small, is the boss room, or is not one of
 * the four named theme rooms — so this is safe to call for every room.
 */
function layoutPuzzle(def, roomId, room, beatNo, isBlocked = () => false) {
    if (!def?.theme || !room || room.boss) return [];
    const half = room.half || 0;
    if (half < MIN_HALF) return [];
    const slot = SLOTS.find((s) => def.theme[s] === roomId);
    if (!slot) return [];

    // The slot's own corner first, then the others.
    //
    // A puzzle authored from a table does not know what the room put where, and
    // the first version found out the hard way: its vault walls closed over a
    // small key in beat 13 and a scar suture in beat 14, both of which the room
    // places in `onBake` long after the layout was decided. `isBlocked` is the
    // room answering for itself, and if all four corners are taken the room
    // simply does not get a puzzle. Missing one beat is a cost; walling a key
    // into the scenery is a broken campaign.
    const first = CORNER[slot];
    const order = [first, ...CORNERS.filter((c) => c.sx !== first.sx || c.sz !== first.sz)];
    let corner = null;
    let box = null;
    for (const c of order) {
        const bx0 = c.sx > 0 ? half - VAULT_W : -half + 1;
        const bz0 = c.sz > 0 ? half - 3 : -half + 1;
        const rect = { x0: bx0, x1: bx0 + VAULT_W - 1, z0: bz0, z1: bz0 + 2 };
        // The footprint plus a one-cell apron on the two INWARD sides, so the
        // furniture in front of the gate has somewhere to stand.
        //
        // Inward only, and that is not a nicety. An apron on all four sides
        // reaches the room's own perimeter wall, which is solid by definition —
        // so every corner failed, in every room, and the first bake placed
        // exactly zero puzzles while the table said forty-two.
        const xLo = c.sx > 0 ? rect.x0 - 1 : rect.x0;
        const xHi = c.sx > 0 ? rect.x1 : rect.x1 + 1;
        const zLo = c.sz > 0 ? rect.z0 - 1 : rect.z0;
        const zHi = c.sz > 0 ? rect.z1 : rect.z1 + 1;
        let clash = false;
        for (let x = xLo; x <= xHi && !clash; x++) {
            for (let z = zLo; z <= zHi; z++) {
                if (isBlocked(x, z)) { clash = true; break; }
            }
        }
        if (!clash) { corner = c; box = rect; break; }
    }
    if (!corner) return [];

    const { sx, sz } = corner;
    const { x0, x1, z0, z1 } = box;
    // The side facing the middle of the room is the one that opens.
    const open = sz > 0 ? 'N' : 'S';
    const gateZ = sz > 0 ? z0 : z1;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    // Everything else sits between the vault and the centre.
    const inward = (n) => cz - sz * n;

    const id = `pz-${beatNo}-${slot}`;
    const signal = sig(beatNo, slot);
    const out = [
        // `flush` is the side that is already backed by the room's own perimeter
        // wall, and it is the side whose vault wall is therefore pointless.
        //
        // The corner search puts the footprint hard against the room edge — x0 is
        // `-half + 1`, the first walkable column, with the perimeter at `-half` —
        // so one of the two side walls is built one cell in front of a wall that
        // was already there. It seals nothing and it costs the whole interior:
        // the side walls stand on the outermost columns, so with both of them up
        // a three-wide alcove has a ONE-CELL interior. The hero is 0.8 across, so
        // the reward sat in a 1.0 slot with 0.10 of clearance a side — the same
        // 0.10 that made the doorway unusable last time, one step further in.
        //
        // Dropping it makes the interior two cells (0.60 a side) at no cost to
        // the footprint, so no corner is disqualified and no puzzle is lost.
        { type: 'vault', id: `${id}-vault`, rect: { x0, x1, z0, z1 }, open, flush: sx > 0 ? 'E' : 'W' },
        {
            type: 'timed_gate', id: `${id}-gate`,
            rect: { x0, x1, z0: gateZ, z1: gateZ }, signal,
            // The ground the gate refuses to close on: its own row and the
            // alcove behind it. Standing anywhere in here means the gate waits.
            clear: { x0, x1, z0, z1 },
        },
    ];

    const flavour = flavourFor(beatNo);

    // The exam, in every dungeon: a socket, in the room that also holds the
    // elite. It is the only piece that LATCHES — the exam is the one puzzle
    // whose answer stays answered, which is the whole reason it is the exam.
    if (slot === 'combine') {
        // Beat 12's item is the light, and this is the one room in the game
        // where a beam, a mirror you push, and a lens to aim it into are all in
        // play at once. Its exam is aiming rather than shoving.
        if (beatNo === 12) {
            // THE BEAM RUNS IN FRONT OF THE VAULT, NOT THROUGH IT.
            //
            // The first version fired along `cz` — the vault's own centre row —
            // so the mirror's resting place was inside the vault and the light
            // had to cross two of its walls to get there. Every piece fitted;
            // the puzzle was not solvable. It ran on the row five units out
            // instead, which is clear floor by construction (that is what the
            // vault's inward apron guarantees), and turns toward the vault into
            // a lens standing three units out.
            const beamRow = inward(5);
            out.push(
                {
                    type: 'beam_source', id: `${id}-src`,
                    at: { x: -sx * (half - 2), z: beamRow }, dir: { x: sx, z: 0 }, range: 40,
                },
                { type: 'beam_target', id: `${id}-lens`, at: { x: cx, z: inward(3) }, signal },
                // Off the beam line, two axes away. Push it on.
                //
                // The spin is DERIVED, not authored. The beam travels along
                // (sx, 0) and has to leave the mirror along (0, sz) to reach the
                // lens. `traceBeam` turns a "/" (even spin) to (0, -dx) and a
                // "\" (odd spin) to (0, dx), so "\" is the one that works when
                // sx and sz agree. Hard-coding it was right for the corner this
                // slot prefers and silently wrong for the other three — and a
                // puzzle only falls back to another corner when the room put
                // something in the first one, which is exactly the case nobody
                // would ever have played.
                {
                    type: 'pushable', id: `${id}-mirror`, mirror: true,
                    spin: sx === sz ? 1 : 0,
                    at: { x: cx - sx * 3, z: beamRow - sz * 2 }, roomHalf: half,
                },
            );
            return out;
        }
        out.push(
            { type: 'block_socket', id: `${id}-socket`, at: { x: cx, z: inward(3) }, signal },
            {
                type: 'pushable', id: `${id}-block`,
                at: { x: cx - sx * 3, z: inward(5) }, roomHalf: half,
            },
        );
        return out;
    }

    if (flavour === 'plate') {
        if (slot === 'teach') {
            // The mechanic alone, and it is meant to be TRIED and to fail:
            // standing on the plate opens the gate, and the gate is three units
            // away. Discovering that walking off it shuts the gate is the
            // lesson, and the block is right there to be the answer.
            out.push(
                { type: 'pressure_plate', id: `${id}-plate`, at: { x: cx, z: inward(3) }, signal },
                {
                    type: 'pushable', id: `${id}-block`,
                    at: { x: cx - sx * 3, z: inward(3) }, roomHalf: half,
                },
            );
        } else {
            // `develop` — the twist: this one will not take a person at all.
            // Only weight. A player who solved the teach room by pushing the
            // block already knows the answer; one who stood on it has to think.
            out.push(
                {
                    type: 'pressure_plate', id: `${id}-plate`, accepts: 'block',
                    at: { x: cx, z: inward(4) }, signal,
                },
                {
                    type: 'pushable', id: `${id}-block`,
                    at: { x: cx - sx * 4, z: inward(4) }, roomHalf: half,
                },
            );
        }
        return out;
    }

    // Switch-led: the gate is on a clock, and the clock is the puzzle.
    if (slot === 'teach') {
        out.push({ type: 'switch', id: `${id}-sw`, at: { x: cx, z: inward(3) }, signal });
    } else {
        // `develop` — further away, and on a shorter fuse. Now the walk is the
        // problem, and there is a block to hold the plate if the walk is too
        // long. Two answers, and the slow one always works.
        out.push(
            {
                type: 'switch', id: `${id}-sw`, hold: 4.0,
                at: { x: cx - sx * 5, z: inward(5) }, signal,
            },
            {
                type: 'pressure_plate', id: `${id}-plate`, accepts: 'block',
                at: { x: cx, z: inward(3) }, signal,
            },
            {
                type: 'pushable', id: `${id}-block`,
                at: { x: cx - sx * 3, z: inward(5) }, roomHalf: half,
            },
        );
    }
    return out;
}

/** Pieces that hold a signal down — settled before the block that reaches them. */
const TARGETS = new Set(['pressure_plate', 'block_socket', 'switch', 'beam_target']);

/**
 * Can the block at `from` be shoved onto `to`?
 *
 * A push-search, not a straight line. The player may shove along either axis in
 * any order, and one shove needs the cell BEHIND the block to be standable as
 * well as the cell in front to be free — which is the rule that makes a block
 * in a corner unrecoverable, and the reason every pushable in this game also
 * has a reset.
 */
function canPush(from, to, free) {
    const goal = `${to.x},${to.z}`;
    const start = `${from.x},${from.z}`;
    if (start === goal) return true;
    const seen = new Set([start]);
    const queue = [[from.x, from.z]];
    while (queue.length) {
        const [bx, bz] = queue.shift();
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (!free(bx - dx, bz - dz)) continue;
            if (!free(bx + dx, bz + dz)) continue;
            const k = `${bx + dx},${bz + dz}`;
            if (seen.has(k)) continue;
            if (k === goal) return true;
            seen.add(k);
            queue.push([bx + dx, bz + dz]);
        }
    }
    return false;
}

/** Is the straight axis-aligned run between two cells free of obstruction? */
function clearRun(from, to, free) {
    if (from.x !== to.x && from.z !== to.z) return false;
    const dx = Math.sign(to.x - from.x);
    const dz = Math.sign(to.z - from.z);
    const n = Math.abs(to.x - from.x) + Math.abs(to.z - from.z);
    for (let i = 1; i < n; i++) {
        if (!free(from.x + dx * i, from.z + dz * i)) return false;
    }
    return true;
}

/**
 * Put every loose piece somewhere it can actually stand, or give up the puzzle.
 *
 * WHY THIS EXISTS
 *
 * The corner search above asks `isBlocked` about the vault footprint and its
 * apron. It asks about NOTHING ELSE. Every other piece — the block, the plate,
 * the socket, the switch, the beam source — is placed at a fixed offset from
 * that vault and, until now, was never asked whether the room already put
 * something there. It usually had. Kit props are stamped into the room map and
 * terraces into the platform map, both of them long before the puzzle picks its
 * corner, and a sweep of all fourteen dungeons found four pieces baked inside
 * solid geometry: two pushable blocks that could not be shoved a single cell in
 * any direction (`resolveMove` clamps them against the thing they are already
 * inside), and two switches buried in scenery.
 *
 * Two rules, and the second is the important one:
 *
 *   NUDGE, don't redesign. A piece looks for the nearest free cell within three,
 *   in a deterministic ring, so a puzzle that has to move stays the puzzle it
 *   was authored as rather than becoming a different one.
 *
 *   If it cannot be honest, DON'T BUILD IT. If a piece has nowhere to go, or if
 *   the block cannot reach what it fills, the whole beat is dropped. Missing one
 *   optional cache is a cost; a room that shows the player a puzzle it is not
 *   possible to solve is worse than a room with no puzzle in it, and this file
 *   already takes that trade once for the corner search.
 */
function settle(out, { half, isBlocked, isSoft }) {
    const taken = new Set();
    const vault = out.find((b) => b.type === 'vault');
    if (vault) {
        for (let x = vault.rect.x0; x <= vault.rect.x1; x++) {
            for (let z = vault.rect.z0; z <= vault.rect.z1; z++) taken.add(`${x},${z}`);
        }
    }
    const inRoom = (x, z) => Math.abs(x) <= half - 1 && Math.abs(z) <= half - 1;
    // HARD vs SOFT, and the distinction is what decides how much of the campaign
    // survives this pass. Hard is geometry: a wall, a prop, a terrace, another
    // piece of this puzzle — a plate under one of those is a plate nobody can
    // step on. Soft is the room's own content: a pickup or an enemy spawn
    // standing nearby. The vault has to respect both, because it BUILDS WALLS
    // and walling a key in is how this system broke the first time. A plate, a
    // switch or a block resting three feet from a torch is fine, and treating
    // the two the same threw away a quarter of the campaign's puzzles.
    const free = (x, z) => inRoom(x, z) && !taken.has(`${x},${z}`) && !isBlocked(x, z);
    const clean = (x, z) => free(x, z) && !isSoft(x, z);

    const place = (piece) => {
        // Preferred: a cell that is clear of the room's content as well.
        // Accepted: a cell that is merely not solid. Better a plate beside a
        // torch than no puzzle in the room at all.
        for (const ok of [clean, free]) {
            if (ok(piece.at.x, piece.at.z)) {
                taken.add(`${piece.at.x},${piece.at.z}`);
                return true;
            }
            for (let r = 1; r <= 3; r++) {
                for (let dx = -r; dx <= r; dx++) {
                    for (let dz = -r; dz <= r; dz++) {
                        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                        const nx = piece.at.x + dx;
                        const nz = piece.at.z + dz;
                        if (!ok(nx, nz)) continue;
                        piece.at = { x: nx, z: nz };
                        taken.add(`${nx},${nz}`);
                        return true;
                    }
                }
            }
        }
        return false;
    };

    for (const b of out) {
        if (!b.at || !TARGETS.has(b.type)) continue;
        if (!place(b)) return [];
    }
    for (const b of out) {
        if (!b.at || TARGETS.has(b.type) || b.type === 'pushable') continue;
        if (!place(b)) return [];
    }
    // Where each pushable has to END UP, which is not always the target.
    //
    // A block fills the socket or holds the plate, so its destination is that
    // piece's own cell. A MIRROR's is not: the mirror has to stand where the
    // beam's row crosses the lens's column, and the lens is where the beam goes
    // afterwards. Reading it off the settled source and lens rather than off the
    // authored coordinates matters, because either of them may have just moved.
    const source = out.find((q) => q.type === 'beam_source' && q.at);
    const lens = out.find((q) => q.type === 'beam_target' && q.at);
    const target = out.find((q) => q.at && TARGETS.has(q.type) && q.type !== 'switch');
    for (const b of out) {
        if (b.type !== 'pushable' || !b.at) continue;
        if (!place(b)) return [];
        const dest = b.mirror
            ? (source && lens ? { x: lens.at.x, z: source.at.z } : null)
            : (target ? target.at : null);
        if (!dest) continue;
        // The block may pass over its destination's cell and its own start cell
        // on the way; everything else it must go around.
        const reachable = canPush(b.at, dest,
            (x, z) => free(x, z)
                || (x === dest.x && z === dest.z)
                || (x === b.at.x && z === b.at.z));
        if (!reachable) return [];
        // And for a mirror, the light has to be able to GET there and leave
        // again. A prop standing in either leg of the beam is a puzzle whose
        // pieces all fit and which cannot be solved.
        if (b.mirror && !clearRun(source.at, dest, free)) return [];
        if (b.mirror && !clearRun(dest, lens.at, free)) return [];
    }
    return out;
}

/**
 * Build the blocker defs for one room's puzzle beat.
 *
 * Two passes: choose a corner for the vault, then settle every loose piece
 * against what the room actually contains. Returns `[]` when the room is too
 * small, is the boss room, is not one of the named theme rooms, or when the
 * beat cannot be laid out honestly — so this is safe to call for every room.
 */
export function puzzleFor(
    def, roomId, room, beatNo, isBlocked = () => false, isSoft = () => false
) {
    // The corner search answers to BOTH, because the vault it chooses a corner
    // for is real walls, and the first version of this system sealed a small key
    // and a scar suture inside them.
    const out = layoutPuzzle(def, roomId, room, beatNo,
        (x, z) => isBlocked(x, z) || isSoft(x, z));
    if (!out.length) return out;
    return settle(out, { half: room.half || 0, isBlocked, isSoft });
}

/** Every puzzle beat in a dungeon, for specs and for counting. */
export function puzzlesForDungeon(def, beatNo) {
    const out = [];
    for (const [roomId, room] of Object.entries(def.rooms || {})) {
        const p = puzzleFor(def, roomId, room, beatNo);
        if (p.length) out.push({ roomId, blockers: p });
    }
    return out;
}
