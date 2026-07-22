// Campaign HP scaling — the one lever that keeps a fight worth having.
//
// THE PROBLEM THIS EXISTS TO FIX
//
// Authored enemy HP is nearly flat across the campaign: beat 02 spawns things
// with 4 HP, beat 14 spawns things with 5. The player is not flat. They start
// with the Anchor Link at 1 damage, pick up the Tectonic Wedge at 2 in beat 05,
// and can carry two Edge upgrades worth +50% on top. Best-weapon damage triples
// while enemy HP moves 25%.
//
// Measured (tests/qa/time-to-kill.mjs), that means every ordinary enemy from
// beat 05 to beat 14 dies to fewer than two landed hits, in about six tenths of
// a second, for ten dungeons in a row. The campaign's back half is mechanically
// SOFTER than its front half even though the enemies in it are nominally
// harder.
//
// The cost is not that the game is easy. The cost is that the bestiary stops
// working. A bulwark asks "are you willing to move?" — but if two swings delete
// it, walking around it is strictly slower than standing still and mashing, so
// the question is never put. Same for the lancer's lane, the mote's altitude,
// the brood's split. Z5 built four kinds that ask four different questions, and
// the damage curve answers all of them with "no need".
//
// THE SHAPE
//
// Not a flat multiplier. A new weapon has to FEEL like a new weapon, so beat 05
// — where the Wedge arrives — is deliberately the softest point in the back
// half: the player gets a dungeon to enjoy the power spike. The curve then
// closes the gap over the following beats and ends above the early game, so the
// finale's elites survive long enough for their behaviour to run more than one
// cycle.
//
// Everything here is expressed in LANDED HITS, because that is the unit the
// player experiences, and it is the unit that decides whether a mechanic has
// time to happen.

/** Best melee damage the player can reasonably field while playing beat N. */
export function playerDamageAt(beat) {
    const base = beat <= 4 ? 1.0 : 2.0;         // Anchor Link → Tectonic Wedge (b05)
    const edge = beat >= 9 ? 1.5 : (beat >= 5 ? 1.25 : 1.0); // Edge tiers I / II
    return base * edge;
}

/**
 * Landed hits an average enemy in beat N should survive.
 *
 * Beats 1-4 are left exactly as authored — the early game was already tuned
 * against a 1-damage weapon and plays correctly. From beat 5 the curve takes
 * over: a dip for the Wedge, then a climb past the early-game figure.
 */
const TARGET_HITS = {
    5: 2.2,  // the reward beat — the Wedge is supposed to feel enormous
    6: 2.6,
    7: 2.8,
    8: 3.0,  // back to early-game durability, against much harder kinds
    9: 3.1,
    10: 3.2,
    11: 3.4,
    12: 3.5,
    13: 3.7,
    14: 4.0, // the finale's elites get to run their mechanic twice
};

/** Average authored HP per beat, so relative differences inside a beat survive. */
const AUTHORED_BASELINE = 4;

/**
 * Scale one authored HP value for the beat it is spawned in.
 *
 * `authored` keeps its meaning as a RELATIVE weight within its room — an enemy
 * written at 5 stays tougher than one written at 3 — while the absolute figure
 * is set by the curve. Beats outside the campaign (the overworld, sandboxes,
 * anything without a beat number) pass through untouched.
 */
export function scaleEnemyHp(authored, beat) {
    const hp = Number.isFinite(authored) ? authored : 3;
    const target = TARGET_HITS[beat];
    if (!target) return hp;
    const scaled = (hp / AUTHORED_BASELINE) * target * playerDamageAt(beat);
    // Half-HP granularity: fine enough that relative weights survive rounding,
    // coarse enough that the number in a debug overlay is readable.
    return Math.max(1, Math.round(scaled * 2) / 2);
}

/** Beat number from a level id, or 0 for anything that is not a campaign beat. */
export function beatNumberOf(levelId) {
    return Number(String(levelId).match(/^beat-(\d+)/)?.[1] || 0);
}

// --- bosses ----------------------------------------------------------------
//
// Bosses were inverted harder than their dungeons. Authored boss HP is 12-18
// across the entire campaign with no progression in it at all, so measured in
// landed hits the fights ran:
//
//   Crypt Warden (beat 01) .... 8 hits      <- the tutorial boss
//   Sand Spur    (beat 03) ... 14 hits
//   Phantasm     (beat 09) .... 4 hits      <- half the tutorial boss
//   nine of fourteen bosses ... 4-6 hits
//
// After the trash curve above, beat 13's ORDINARY ENEMIES take 4.6 hits — more
// than nine of the game's bosses. A climax the player kills faster than the
// corridor leading to it is not a climax.
//
// Phase thresholds are fractions of maxHp (bosses/base.js), so scaling HP moves
// the phase boundaries with it and a multi-phase fight keeps its shape exactly.
const BOSS_TARGET_HITS = {
    5: 9, 6: 10, 7: 10, 8: 11, 9: 12, 10: 12, 11: 13, 12: 14, 13: 15,
    14: 18, // the Leviathan should be the longest fight in the game
};

/**
 * Unlike enemy HP, the authored figure is discarded rather than kept as a
 * relative weight. Ordinary enemies are written 3/4/5 within a room and those
 * differences mean something. Boss HP is 12, 14, 12, 16, 14, 15, 14, 12, 16,
 * 18, 16, 18, 28 in campaign order — that is not a progression anyone authored,
 * it is noise, and preserving it only drags the curve back out of shape.
 */
export function scaleBossHp(authoredMaxHp, beat) {
    const target = BOSS_TARGET_HITS[beat];
    if (!target) return Number.isFinite(authoredMaxHp) ? authoredMaxHp : 15;
    return Math.max(1, Math.round(target * playerDamageAt(beat)));
}

/**
 * Apply the boss curve in place, after the level's boss factory has run.
 *
 * Multi-core bosses (the Tri-Compiler) expose `maxHp` as a getter summing their
 * cores, so the ratio is computed from the aggregate and applied to each core —
 * which scales the total by exactly that ratio and never assigns to the getter.
 */
export function applyBossCurve(boss, beat) {
    if (!boss || !BOSS_TARGET_HITS[beat]) return boss;
    const total = boss.maxHp;
    if (!Number.isFinite(total) || total <= 0) return boss;
    const ratio = scaleBossHp(total, beat) / total;
    if (!Number.isFinite(ratio) || ratio === 1) return boss;
    const parts = boss.cores?.length ? boss.cores : [boss];
    for (const part of parts) {
        if (!Number.isFinite(part.maxHp)) continue;
        const scaled = Math.max(1, Math.round(part.maxHp * ratio));
        part.maxHp = scaled;
        part.hp = scaled;
    }
    return boss;
}
