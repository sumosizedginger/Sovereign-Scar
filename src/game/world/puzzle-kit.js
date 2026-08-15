// @ts-check
// Phase E1 — the puzzle primitives, as pure logic.
//
// WHY THIS FILE EXISTS SEPARATELY FROM `blockers.js`
//
// All four blocker types the game shipped with ask the same question: *do you
// have the item?* That is a LOCK. A lock's answer is your inventory; a puzzle's
// answer is a plan. The difference is not difficulty, it is whether the room
// can be reasoned about.
//
// Everything here is arithmetic over plain objects — no THREE, no scene, no
// collision world — because the important claim about a puzzle is not what it
// looks like, it is that **no sequence of actions can make it unsolvable**. A
// block shoved into a corner is a softlock, and this project has already
// shipped two of those. Claims like that are only cheap to test if the logic
// they are about is separable, so it is.
//
// THE SIGNAL BUS
//
// Pieces talk through named signals rather than pointing at each other. A plate
// does not know what it opens; a gate does not know what holds it. That is the
// whole reason the combinations work — plate + timed gate + pushable block is a
// complete Zelda puzzle (*the plate needs weight, you need to be elsewhere, so
// the block has to hold it*) and none of the three pieces knows the other two
// exist.

/** A per-dungeon name → boolean bus with a latch for one-way signals. */
export class SignalBus {
    constructor() {
        this._on = new Set();
        this._latched = new Set();
        this._holders = new Map();
    }

    get(name) {
        return this._on.has(name) || this._latched.has(name);
    }

    /**
     * Turn a signal on or off on behalf of one SOURCE.
     *
     * The source argument is the whole point and it was not there. Two pieces
     * may legitimately hold the same signal — the switch-led `develop` beat is
     * built out of exactly that, a switch on a four-second fuse and a plate a
     * block can hold, either of which should open the gate. Both wrote the same
     * name every frame with a plain assignment, so the LAST one to update won:
     * the plate ran after the switch, wrote `false` because nothing was standing
     * on it, and the switch did nothing at all in seven of the fourteen
     * dungeons.
     *
     * A signal is on while ANY source holds it. The default source keeps every
     * single-writer piece behaving exactly as before.
     */
    set(name, on, source = 'default') {
        let holders = this._holders.get(name);
        if (!holders) {
            holders = new Set();
            this._holders.set(name, holders);
        }
        if (on) holders.add(source);
        else holders.delete(source);
        if (holders.size) this._on.add(name);
        else this._on.delete(name);
    }

    /**
     * Turn a signal on for good.
     *
     * A latched signal is the softlock escape hatch, and it is why sockets latch
     * and plates do not: once a block is in its socket the door it opened can
     * never close again, no matter what happens to the block afterwards. A gate
     * that re-shuts behind you because something drifted off a plate is the
     * failure this project has already shipped twice.
     */
    latch(name) {
        this._latched.add(name);
    }

    /** Every signal currently readable, for specs and for save state. */
    active() {
        return [...new Set([...this._on, ...this._latched])].sort();
    }

    latched() {
        return [...this._latched].sort();
    }
}

/** Is `p` within `r` of `at`, in XZ? */
export function within(p, at, r) {
    if (!p || !at) return false;
    return Math.hypot(p.x - at.x, p.z - at.z) <= r;
}

/**
 * Is a pressure plate held down?
 *
 * Three things can hold one, and which ones are allowed is the puzzle:
 *
 *   the PLAYER    — trivial, and the reason `holdsWhileYouLeave` puzzles exist
 *                   at all: standing on it is obviously the first thing anyone
 *                   tries, and discovering that it stops working the moment you
 *                   walk away IS the teaching moment.
 *   a BLOCK       — the answer to that discovery.
 *   an ENEMY      — the third answer, and the only one that turns a fight into
 *                   a puzzle: lure something heavy onto it.
 *
 * `accepts` narrows it. A plate that only a block can hold is a plate that has
 * told the player what it wants.
 */
/**
 * @param {{ at: {x:number,z:number}, r?: number, accepts?: string }} plate
 * @param {{ player?: {x:number,z:number}, blocks?: any[], enemies?: any[] }} [world]
 */
export function plateHeld(plate, { player, blocks = [], enemies = [] } = {}) {
    const at = plate.at;
    const r = plate.r != null ? plate.r : 1.1;
    const accepts = plate.accepts || 'any';
    if ((accepts === 'any' || accepts === 'player') && player
        && within(player, at, r)) return true;
    if (accepts === 'any' || accepts === 'block') {
        for (const b of blocks) if (within(b.position || b, at, r)) return true;
    }
    if (accepts === 'any' || accepts === 'enemy') {
        for (const e of enemies) {
            if (!e || e.state?.current === 'DEAD') continue;
            const p = e.rig?.position || e.root?.position;
            if (p && within(p, at, r)) return true;
        }
    }
    return false;
}

/** Is a block seated in its socket? Sockets are generous — this is not darts. */
export function socketFilled(socket, blocks = []) {
    const r = socket.r != null ? socket.r : 1.0;
    for (const b of blocks) {
        if (socket.blockId && b.id !== socket.blockId) continue;
        if (within(b.position || b, socket.at, r)) return true;
    }
    return false;
}

/**
 * Trace an axis-aligned beam from `source` until it stops.
 *
 * Returns the polyline it travelled, plus whichever target it lit. The whole
 * mirror puzzle is this function: a mirror turns the beam ninety degrees, so
 * where you PUSH the mirror decides where the beam ends up, and that is a plan
 * rather than an inventory check.
 *
 * `isSolid(x, z)` reports walls. `mirrors` are `{ position, spin }` where spin
 * is 0..3 — the four ways to sit a diagonal in a square.
 *
 * Bounded three ways, and each bound is load-bearing: total distance, number of
 * bounces, and a set of already-used mirrors. Two mirrors facing each other are
 * an infinite loop, and a player can build that arrangement by accident in
 * about four seconds.
 */
/**
 * @param {{ at: {x:number,z:number}, dir: {x:number,z:number} }} source
 * @param {{ mirrors?: any[], targets?: any[],
 *           isSolid?: (x: number, z: number) => boolean,
 *           maxDist?: number, maxBounces?: number,
 *           step?: number, radius?: number }} [world]
 */
export function traceBeam(source, {
    mirrors = [], targets = [], isSolid = () => false,
    maxDist = 40, maxBounces = 6, step = 0.25, radius = 0.6,
} = {}) {
    let x = source.at.x;
    let z = source.at.z;
    let dx = Math.sign(source.dir.x) || 0;
    let dz = Math.sign(source.dir.z) || 0;
    if (!dx && !dz) return { path: [], hit: null, bounces: 0 };
    const path = [{ x, z }];
    const used = new Set();
    let travelled = 0;
    let bounces = 0;
    let hit = null;

    while (travelled < maxDist) {
        x += dx * step;
        z += dz * step;
        travelled += step;
        if (isSolid(x, z)) break;

        let turned = false;
        for (const m of mirrors) {
            if (used.has(m)) continue;
            const p = m.position || m;
            if (!within({ x, z }, p, radius)) continue;
            // Spin picks which pair of headings the diagonal connects.
            //   0 and 2 are the "/" mirror, 1 and 3 are the "\" mirror.
            const slash = (m.spin || 0) % 2 === 0;
            const ndx = slash ? -dz : dz;
            const ndz = slash ? -dx : dx;
            dx = ndx; dz = ndz;
            used.add(m);
            bounces++;
            path.push({ x, z });
            turned = true;
            break;
        }
        if (turned) {
            if (bounces > maxBounces) break;
            continue;
        }

        for (const tg of targets) {
            if (within({ x, z }, tg.at, tg.r != null ? tg.r : 0.9)) {
                hit = tg;
                break;
            }
        }
        if (hit) break;
    }
    path.push({ x, z });
    return { path, hit, bounces };
}

/**
 * Can this puzzle still be solved from where everything currently is?
 *
 * This is the claim the whole file exists for. A pushable block is the single
 * most reliable way to break a Zelda-like: shove it into a corner, or into the
 * gap it was meant to bridge from the wrong side, and the room is dead. The
 * project's own rule is that **every pushable needs a reset**, so the honest
 * answer here is not "can the block still reach the socket" — it is "is there
 * ALWAYS a way back to a solvable state", and the only way to guarantee that
 * for arbitrary room geometry is for the reset to exist and be reachable.
 *
 * So: a puzzle is solvable if every block in it can be returned to its spawn.
 * `canReset` is what the runtime promises; this states the dependency in one
 * place so the spec can hold the two together.
 */
export function isRecoverable(puzzle) {
    const blocks = puzzle.blocks || [];
    if (!blocks.length) return true;
    return blocks.every((b) => b.canReset !== false && b.spawn);
}
