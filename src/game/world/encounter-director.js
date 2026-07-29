// Phase D1 — the encounter director.
//
// THE PROBLEM IT EXISTS FOR
//
// There was no coordination layer at all. Every enemy committed the moment its
// own cooldown allowed, which produced exactly two failure modes and nothing in
// between:
//
//   SIMULTANEOUS COMMITS — three enemies wind up at once, three rings overlap,
//   and there is no ground the player can stand on. The game's central promise
//   ("every attack is dodgeable") is silently false, and it is false in the
//   rooms with the most enemies, which is to say the ones that matter.
//
//   THE CONGA LINE — the opposite roll of the same dice. Cooldowns drift apart,
//   enemies attack one at a time in sequence, and a five-enemy room is the same
//   one-on-one fight five times.
//
// A token is the fix for both. `N` enemies may be COMMITTED at once; the rest
// keep pressuring — closing, circling, holding a firing line — so the threat is
// real and continuous while the number of things you must dodge stays bounded.
//
// WHY IT IS LEVEL-SCOPED AND NOT ROOM-SCOPED
//
// The plan called for one director per room, built in `bakeRoom`. It is one per
// LEVEL instead, and the reason is that the question the director answers is
// "how many things are attacking the player right now" — and the player is in
// exactly one room. Both of this project's update loops (`room-graph.js` and
// `levels/_common.js`) iterate a flat, level-wide enemy list, so a level-scoped
// director needs one line in each of them instead of plumbing a record through
// four spawn sites. An enemy in a neighbouring baked room can only take a token
// by being within its own aggro range of the player, which means it is in the
// fight. The token budget is fixed per dungeon anyway, so nothing is lost.
//
// WHY IT ADOPTS INSTEAD OF BEING WIRED AT THE SPAWN SITES
//
// Trap 5 — sweep every place. Enemies are constructed at four sites across two
// files, and brood children are spawned mid-fight from a fifth. Wiring
// `enemy.director` at each of them is five chances to miss one, and a missed
// one is an enemy with an unlimited attack licence that nothing would ever
// report. `update` adopts whatever is in the list, so there is exactly one
// place and it cannot be forgotten.

/** How many enemies may be committed to an attack at the same time. */
export function tokensForBeat(beatNo) {
    const n = Number(beatNo) || 0;
    if (n >= 11) return 3;
    if (n >= 5) return 2;
    return 1;
}

/**
 * Bodies stop overlapping at this multiple of their combined radii. Deliberately
 * only just over 1: this is a nudge that makes a group read as a group, not a
 * physics system. Anything stronger and enemies shove each other out of the
 * player's swing.
 */
export const SEPARATION_SLACK = 1.2;
/** Metres per second of separation push. Weak on purpose. */
export const SEPARATION_SPEED = 1.6;

/**
 * How long a queue place survives without a fresh refusal. Comfortably longer
 * than the gap between an enemy's retries (`DENIED_RETRY` 0.3s) so a waiting
 * enemy never loses its place, and short enough that one that has genuinely
 * left the fight stops blocking the enemies behind it.
 */
export const QUEUE_TTL = 2.0;

export class EncounterDirector {
    /**
     * @param {number} tokens how many enemies may commit at once
     * @param {function} getEnemies () => Enemy[] — the level's live list
     */
    constructor(tokens = 1, getEnemies = () => []) {
        this.tokens = Math.max(1, tokens | 0);
        this._getEnemies = getEnemies;
        this._holders = new Set();
        // FAIRNESS. Without it the cap is not a queue, it is a race, and the
        // race has a stable winner: whichever enemies happen to sit earliest in
        // the list with the luckiest cooldown phase take the token every time
        // it frees. Measured on a five-enemy room at one token over twenty
        // seconds, two enemies attacked twenty-nine times between them and two
        // others never attacked at all. That is not pacing — from the chair it
        // is two enemies fighting you and two standing around, which is the
        // conga line wearing a different coat.
        //
        // `_queue` stamps an enemy the first time it is refused and clears when
        // it is granted, so "who has waited longest" is answerable. Each entry
        // carries `since` (the claim) and `seen` (the liveness).
        //
        // `seen` and not the enemy's own pressure flag, and that distinction is
        // the whole fix: the first version expired a queue entry the moment the
        // enemy stopped pressuring, and enemies stop pressuring at exactly the
        // instant a token frees — so the queue was wiped clean one frame before
        // everybody asked, and the race was back.
        this._queue = new Map();
        this._clock = 0;
        // Telemetry the specs read instead of re-deriving.
        this.peakConcurrency = 0;
        this.grants = 0;
        this.denials = 0;
    }

    /** How many enemies are committed to an attack this instant. */
    get concurrency() {
        return this._holders.size;
    }

    /** Would `enemy` be allowed to commit right now? Does not take the token. */
    canCommit(enemy) {
        return this._holders.has(enemy) || this._holders.size < this.tokens;
    }

    /**
     * Take a token, if one is free. Prunes first, so a token held by something
     * that has since died or finished swinging cannot deadlock the room.
     *
     * A LEAKED TOKEN IS A SILENT DIFFICULTY CLIFF: the room quietly drops to
     * N-1 concurrent attackers and stays there for the rest of the fight, and
     * nothing anywhere would report it. That is why the prune is here, at the
     * only place a token is ever taken, rather than somewhere a caller has to
     * remember to run.
     */
    request(enemy) {
        this.prune();
        if (this._holders.has(enemy)) return true;
        if (this._holders.size >= this.tokens) return this._deny(enemy);
        // There is room — but not necessarily for THIS one. Anybody still
        // queued who has been waiting longer goes first.
        const mine = this._queue.has(enemy) ? this._queue.get(enemy).since : this._clock;
        for (const [other, q] of this._queue) {
            if (other === enemy || this._holders.has(other)) continue;
            if (q.since < mine - 1e-6) return this._deny(enemy);
        }
        this._queue.delete(enemy);
        this._holders.add(enemy);
        this.grants++;
        if (this._holders.size > this.peakConcurrency) {
            this.peakConcurrency = this._holders.size;
        }
        return true;
    }

    /** Refuse, and start (or preserve) this enemy's place in the queue. */
    _deny(enemy) {
        this.denials++;
        const q = this._queue.get(enemy);
        if (q) q.seen = this._clock;
        else this._queue.set(enemy, { since: this._clock, seen: this._clock });
        return false;
    }

    release(enemy) {
        this._holders.delete(enemy);
    }

    /**
     * The room's live list. The Censer needs it — a support enemy has to be
     * able to find the things it supports, and the director is already the only
     * object in the game that knows who is in the fight.
     */
    peers() {
        return this._getEnemies() || [];
    }

    /**
     * A token is only ever held by something that is alive and actually mid
     * wind-up. Stating the invariant this way — rather than trusting every
     * release path to fire — means a token cannot be leaked by any code path
     * that exists or any code path anyone writes later.
     */
    prune() {
        for (const e of [...this._holders]) {
            if (!e || e.state?.current === 'DEAD' || e.defeated) {
                this._holders.delete(e);
            } else if (!(e._windupT > 0)) {
                this._holders.delete(e);
            }
        }
        // Leaving the queue. An enemy that has died, or that has simply stopped
        // asking — walked out of aggro range, been parried across the room —
        // must drop its place, or it blocks everyone behind it forever while
        // never taking its turn.
        for (const [e, q] of [...this._queue]) {
            if (!e || e.state?.current === 'DEAD' || e.defeated
                || this._clock - q.seen > QUEUE_TTL) {
                this._queue.delete(e);
            }
        }
    }

    /**
     * Run once per frame, BEFORE the enemies update: adopt anything new, drop
     * stale tokens, and push overlapping bodies apart.
     */
    update(dt) {
        this._clock += dt;
        const list = this._getEnemies() || [];
        for (const e of list) {
            if (e && e.director !== this && !e.defeated) e.director = this;
        }
        this.prune();
        this.separate(list, dt);
    }

    /**
     * Soft mutual repulsion. Costs almost nothing at these counts (the busiest
     * room in the game holds five) and does two jobs at once: a pile of enemies
     * reads as several enemies instead of one, and the bearing maths every
     * directional rule depends on stops collapsing when two bodies occupy the
     * same square metre.
     *
     * A committed enemy PUSHES but is never PUSHED. Its telegraph is a promise
     * about a piece of ground, and while the strike now resolves against the
     * remembered mark rather than the body, a body sliding out from under its
     * own ring is a picture that lies to the player about where the danger is.
     */
    separate(list, dt) {
        if (!list || list.length < 2 || !(dt > 0)) return;
        for (let i = 0; i < list.length; i++) {
            const a = list[i];
            if (!a?.rig || a.state?.current === 'DEAD') continue;
            for (let j = i + 1; j < list.length; j++) {
                const b = list[j];
                if (!b?.rig || b.state?.current === 'DEAD') continue;
                const want = ((a.hitRadius || 0.5) + (b.hitRadius || 0.5)) * SEPARATION_SLACK;
                let dx = a.rig.position.x - b.rig.position.x;
                let dz = a.rig.position.z - b.rig.position.z;
                let d = Math.hypot(dx, dz);
                if (d >= want) continue;
                if (d < 1e-4) {
                    // Exactly co-located: any axis will do, but it has to be
                    // the SAME one every frame or they jitter instead of parting.
                    dx = 1; dz = 0; d = 1;
                }
                // Three things make a body immovable here, and each of them
                // still PUSHES:
                //   - no `_move` at all (dummy targets, and bosses, which are
                //     pushed into `level.enemies` by `attachBoss`). Calling it
                //     would throw; skipping the pair entirely would let a
                //     minion stand inside a boss.
                //   - a boss, which owns its own arena movement outright.
                //   - anything mid wind-up, whose telegraph is a promise about
                //     a piece of ground. A body sliding out from under its own
                //     ring is a picture that lies about where the danger is.
                const movable = (e) => typeof e._move === 'function'
                    && !e.bossId && !(e._windupT > 0);
                const aMove = movable(a);
                const bMove = movable(b);
                if (!aMove && !bMove) continue;
                const overlap = want - d;
                const step = Math.min(overlap, SEPARATION_SPEED * dt);
                // Whoever can move takes the whole correction; if both can, they
                // split it.
                const share = (aMove && bMove) ? step * 0.5 : step;
                if (aMove) a._move(dx, dz, d, share);
                if (bMove) b._move(-dx, -dz, d, share);
            }
        }
    }
}
