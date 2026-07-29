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

/** Ids already spoken. Persisted — see `setCoachStore`. */
const spoken = new Set();
let sink = null;
let store = null;

/** Point the coach at a HUD. `null` detaches (tests, teardown). */
export function setCoachSink(fn) {
    sink = typeof fn === 'function' ? fn : null;
}

/**
 * Phase G — give the coach somewhere to remember.
 *
 * `spoken` was an in-memory singleton and nothing ever wrote it down, so every
 * reload re-taught the whole game: guard, poise, guard-break, lock-on,
 * target-switching, the grapple, the boot, the wedge, the caster, mirror
 * travel, vials and dust — eighteen hints, at a returning player who has been
 * playing for six hours. A hint delivered at the moment of confusion is good
 * design; the same hint delivered on the fiftieth launch is noise, and noise is
 * what teaches players to dismiss toasts without reading them.
 *
 * `sovereignProgress.hintsSeen` has existed in the save schema since it was
 * written and was read and written by nothing at all.
 *
 * @param {{load:() => string[], save:(ids:string[]) => void}|null} s
 */
export function setCoachStore(s) {
    store = s && typeof s.load === 'function' ? s : null;
    if (!store) return;
    for (const id of store.load() || []) spoken.add(id);
}

/**
 * Say `text` if `id` has not been said yet. Returns whether it was emitted, so
 * callers can pair the line with a one-off sound without double-tracking.
 */
export function coach(id, text, ms = 4200) {
    if (!id || spoken.has(id)) return false;
    spoken.add(id);
    // Recorded whether or not a HUD was listening. A hint that fired into a
    // detached sink still happened as far as the player is concerned — and if
    // it did not, the alternative is a hint that re-fires forever because
    // nobody was attached the first time.
    try { store?.save([...spoken]); } catch (_) { /* storage is optional */ }
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
    try { store?.save([]); } catch (_) { /* storage is optional */ }
}
