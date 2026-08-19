// @ts-check
// Did the player get through that boss without being hit?
//
// WHY THIS IS ITS OWN FILE
//
// `index.js` already carried `game._bossPhaseDamaged`, a flag cleared at every
// phase change so the witness score can award `flawless_phase`. Reusing it for
// a whole fight would have been one word of work and permanently wrong: a flag
// that resets three times during the thing it is measuring cannot answer a
// question about the thing as a whole.
//
// The rest of it is bookkeeping that is easy to get subtly wrong and impossible
// to test inside the render loop — a retry after dying must not inherit a clean
// sheet, and leaving the arena and coming back must not either. So it is thirty
// lines with no imports, and `gear-skins.spec.mjs` drives it directly.
//
// WHAT IT IS FOR
//
// The one source in `docs/WARDROBE.md` that costs no prop. Every other outfit
// in the game is somewhere you walk to; this one is something you do. It is
// deliberately a SINGLE SLOT — see the rule that document settles: region
// relics are full sets because they are the payoff for exploring, behaviour
// unlocks are standouts, and a wardrobe of nothing but matching sets has
// nothing in it to mix.

/**
 * Watches one boss fight at a time.
 *
 * The contract is deliberately blunt: `enter` is safe to call every frame,
 * `hit` is safe to call whenever the player takes damage whether or not a boss
 * is up, and `leave` must be called on death and on level change.
 */
export class FlawlessWatch {
    constructor() {
        /** @type {string|null} */
        this.bossId = null;
        this.damaged = false;
    }

    /**
     * The fight that is happening. Cheap to call every frame.
     *
     * Only a CHANGE of id starts a new sheet. Calling this repeatedly with the
     * same boss must not clear the record, or the flag would reset every frame
     * and every fight would be flawless.
     */
    enter(bossId) {
        if (!bossId || bossId === this.bossId) return false;
        this.bossId = bossId;
        this.damaged = false;
        return true;
    }

    /**
     * The player took damage. Safe to call at any time.
     *
     * THIS USED TO GUARD ON `bossId` AND THE GUARD WAS DEAD CODE. A
     * counterfactual removed it and every assertion stayed green, which is the
     * signal that a branch is unreachable rather than untested: `enter` clears
     * `damaged` whenever a fight starts, so damage taken outside one cannot
     * survive into the next fight no matter what this method does.
     *
     * One place owns the invariant now, and it is `enter`. Two places both
     * trying to own it is how they drift apart.
     */
    hit() {
        this.damaged = true;
    }

    /**
     * Death, or leaving the level.
     *
     * THIS IS THE PART THAT MATTERS AND THE PART THAT IS EASY TO FORGET. Dying
     * to a boss and retrying re-enters the SAME id, and `enter` deliberately
     * ignores that — so without an explicit reset the second attempt would
     * begin with the first attempt's clean sheet, and a player who died four
     * times would be handed a reward for never being hit.
     */
    leave() {
        this.bossId = null;
        this.damaged = false;
    }

    /** True only inside a live fight in which nothing has landed. */
    get flawless() {
        return !!this.bossId && !this.damaged;
    }
}
