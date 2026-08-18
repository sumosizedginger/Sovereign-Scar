// @ts-check
// src/game/combat/combo.js — the melee string.
//
// WHAT THIS ADDS AND WHY IT IS SHAPED THIS WAY. The player had one attack
// button and one swing per weapon: press it, get the same 60-degree sweep,
// press it again, get the same one. Enemies in this game have wind-ups,
// telegraphs, recoveries and committed moves; the player had a verb. That
// asymmetry is `ROAD-TO-AAA` item 8 and it is the largest remaining gap in the
// combat kit.
//
// DERIVED FROM THE WEAPON, NOT AUTHORED PER WEAPON. Four melee weapons times
// three steps is twelve moves to hand-tune, twelve sets of numbers to keep in
// agreement with twelve smears, and one more table to go stale the first time
// anyone edits a weapon. Every step here is a multiplier on the weapon's OWN
// authored reach, arc, damage and cooldown, so a weapon tuned in `weapons.js`
// carries its whole string with it and a weapon added later gets one for free.
//
// The three steps are a sentence, not three copies of a swing:
//
//   0  OPENER     what the weapon has always been. Unchanged, on purpose: the
//                 first press of every weapon must still feel like the weapon.
//   1  BACKHAND   the return stroke. Same reach, wider arc, swept the other
//                 way — it catches the second enemy the opener turned you past.
//   2  FINISHER   committed. Longer reach, narrower arc, real damage and
//                 knockback, and it CARRIES THE PLAYER FORWARD, which is what
//                 makes it a decision rather than a third tap: it closes
//                 distance you may not want closed, and it costs recovery.
//
// The cost is in the recovery. Steps get cheaper to reach and more expensive to
// leave, so mashing to the finisher is a commitment and not free damage.

/**
 * How long after a swing a press CHAINS rather than starting a new string.
 *
 * Longer than `INPUT_BUFFER` (0.15) by design — the buffer is about forgiving a
 * press that arrives slightly early, this is about how long the string stays
 * open once you are in it. Shorter than the slowest weapon's cooldown times
 * two, so a string cannot be held open indefinitely by a very slow weapon.
 */
export const COMBO_WINDOW = 0.45;

/**
 * How soon after a swing a chain press is accepted.
 *
 * A swing's own strike lasts 0.12s, and a press inside that is the player
 * mashing through an attack that has not happened yet. It also keeps the string
 * out of the hands of anything that calls `tryAttack` twice without advancing a
 * clock — several probes in this repo drive attacks in a tight loop with the
 * cooldown forced to zero, and a string that advanced on those would report
 * finisher reach for an opener.
 */
export const COMBO_OPEN = 0.1;

/** Steps in a full string. */
export const COMBO_STEPS = 3;

/**
 * Per-step multipliers on the weapon's own numbers.
 *
 * `push` is world units of forward carry, and it is the only entry that is an
 * absolute rather than a multiple: it is a distance across the ROOM, not a
 * property of the weapon, and a mallet finisher should not lunge further than a
 * dagger finisher merely because it hits harder.
 */
export const COMBO_SHAPE = [
    { range: 1, arc: 1, damage: 1, knockback: 1, cooldown: 1, push: 0 },
    { range: 1, arc: 1.3, damage: 1, knockback: 1.1, cooldown: 0.85, push: 0 },
    { range: 1.3, arc: 0.75, damage: 1.8, knockback: 2.2, cooldown: 1.7, push: 1.9 },
];

/** Human-readable step names, used by the animator and the sound bank. */
export const COMBO_NAMES = ['opener', 'backhand', 'finisher'];

/**
 * The move for step `n` of `weapon`'s string.
 *
 * Returns a NEW object every call and never mutates the weapon: the weapon
 * table is module-level shared state, and a step that wrote its multiplier back
 * into it would make the second swing of the game permanently wider than the
 * first. `depthTolerance` is recomputed from the derived range and arc rather
 * than scaled, because it is not an independent number — it is
 * `range * sin(arc/2)`, and scaling it separately is how a picture and a
 * hitbox come to disagree.
 */
export function comboMove(weapon, n) {
    const step = COMBO_SHAPE[Math.max(0, Math.min(COMBO_SHAPE.length - 1, n | 0))];
    if (!weapon) return null;
    if (!n || !weapon.arcRad) return weapon;      // openers and rays are untouched
    const range = (weapon.range || 1.8) * step.range;
    const arcRad = weapon.arcRad * step.arc;
    return {
        ...weapon,
        id: `${weapon.id}_${COMBO_NAMES[n] || n}`,
        comboStep: n,
        range,
        arcRad,
        depthTolerance: range * Math.sin(arcRad / 2),
        damage: (weapon.damage != null ? weapon.damage : 1) * step.damage,
        knockback: (weapon.knockback || 0) * step.knockback,
        cooldown: (weapon.cooldown || 0.3) * step.cooldown,
        push: step.push,
        // The return stroke is swept the OTHER WAY. Without it the string is
        // three identical pictures at different sizes, and the player learns
        // the rhythm from the sound alone.
        sweep: n % 2 === 1 ? -1 : 1,
    };
}

/**
 * Is a press at `sinceSwing` seconds after the last one a chain, or a new
 * string?
 *
 * Both ends are closed for a reason. Too early is a mash through a swing that
 * has not resolved; too late is a player who stopped, and a string that
 * resumed after a second of standing still would let them carry a finisher
 * around the room and open with it.
 */
export function chains(sinceSwing) {
    return sinceSwing >= COMBO_OPEN && sinceSwing <= COMBO_WINDOW;
}
