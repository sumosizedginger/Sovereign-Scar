// A hint delivered at the moment of confusion, exactly once.
//
// Dungeon theme hints (Z6) fire on entering a room, which teaches the player
// who reads a toast before they meet the mechanic. It does nothing for the
// player who wandered in later, or came back post-campaign, or simply looked
// away — and that player is the one who ends up swinging at an armoured plate
// forever, concluding the game is broken rather than that they are standing in
// the wrong place. A mechanic that can silently refuse input has to be able to
// say so when it refuses.
//
// Deliberately a module singleton with an injected sink: combat code (enemy,
// combat-sweeper) has no handle on `game` or the HUD, and threading one down
// to every hit resolution to deliver a string would be a worse trade than this.

/** Ids already spoken this session. */
const spoken = new Set();
let sink = null;

/** Point the coach at a HUD. `null` detaches (tests, teardown). */
export function setCoachSink(fn) {
    sink = typeof fn === 'function' ? fn : null;
}

/**
 * Say `text` if `id` has not been said yet. Returns whether it was emitted, so
 * callers can pair the line with a one-off sound without double-tracking.
 */
export function coach(id, text, ms = 4200) {
    if (!id || spoken.has(id)) return false;
    spoken.add(id);
    if (!sink) return false;
    sink(text, ms);
    return true;
}

/** Has this hint already been spoken? */
export function coachSpoken(id) {
    return spoken.has(id);
}

/** Forget everything — a fresh save should get its hints again. */
export function resetCoach() {
    spoken.clear();
}
