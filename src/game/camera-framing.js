// @ts-check
// src/game/camera-framing.js
// The numbers that decide how much of a fight fits on screen.
//
// WHY THIS IS A SEPARATE FILE FROM `camera-rig.js`. That module imports
// `renderer.js`, which reads `window.innerWidth` at module scope, so nothing
// headless can load it — which meant these constants could not be asserted on
// by any spec under `tests/game/`, nor read by a print-only probe. They are
// pure numbers with no dependencies. This is the same split, for the same
// reason, as `quality-tiers.js` out of `quality.js`.
//
// ── THE ARENA WIDEN, AND WHY IT IS A WIDEN ─────────────────────────────────
//
// The plan this was built from said "a sealed arena pushes IN when it seals".
// Measuring the frame first (`tests/qa/arena-frame.mjs`) said the opposite, and
// the measurement won.
//
// At the shipped rig — height 17.5, back 6.125, fov 40 — the frame covers only
// **6.80 up-screen and 6.18 down-screen** on the plane the characters stand on.
// That is a 13-unit-deep window. The 28 sealed arenas are 17 to 23 units
// across. The camera already cannot show a whole arena in Z, and the ranged
// kinds fight from beyond the edge of it: a lancer's `attackRange` is 7, a
// censer bursts at 9 and a Weaver acts at 11. All three are already attacking
// from off-screen.
//
// So a sustained push-in would have made a real problem worse — it would have
// bought drama by hiding more of the fight. What the arenas actually need is
// for the frame to OPEN while the fight is spread out, and close again when it
// comes back to knife range.
//
// THE CAP IS THE HERO. On-screen size goes as 1/distance, and the hero measures
// 34 px wide at 1280 — the scarcest resource in this game, and the thing every
// readability finding in the project turns out to be downstream of. So the
// widen is capped by what it costs that number rather than by feel:
//
//     widen   height   frame area   hero px
//     +0.0     17.50        +0%       34.0     the shipped rig
//     +2.0     19.50       +27%       30.5     <- ARENA_WIDEN_MAX
//     +4.0     21.50       +58%       27.7
//     +7.0     24.50      +115%       24.3     the boss framing's cap
//
// Past +2 the trade stops being worth it. The boss channel is allowed to go
// further because a boss fight has one subject that must not leave frame and
// the alternative is fighting something you cannot see at all.

/**
 * Most the arena may open the frame, in world units of camera height.
 *
 * Buys 27% more frame area for 10% of the hero. See the table above.
 */
export const ARENA_WIDEN_MAX = 2.0;

/**
 * Threat separation, in world units, that costs nothing.
 *
 * Matches the boss framing's own free distance so the two channels agree about
 * what "spread out" means. Below this the fight is at knife range, the hero is
 * the only thing that matters, and they stay full size.
 */
export const ARENA_WIDEN_FREE = 6;

/** Widen per unit of separation past `ARENA_WIDEN_FREE`. Matches the boss framing's. */
export const ARENA_WIDEN_RATE = 0.5;

/**
 * How fast the widen tracks the fight, per second.
 *
 * Slower than the boss framing's 4, deliberately. A boss is one body whose
 * distance changes smoothly; an arena's widest threat is a `max()` over up to
 * six of them, so it JUMPS the moment the outermost one dies or a brood splits.
 * At 4 that reads as the camera twitching on every kill. At 1.6 the frame is
 * still settling while the next enemy closes, which is the point — it is
 * breathing, not tracking.
 */
export const ARENA_WIDEN_LERP = 1.6;

/**
 * The boss framing's widen cap (Ticket D), unchanged and named here so the two
 * channels can be compared in one place — and so the rule that the arena is the
 * cheaper of the two is visible rather than coincidental.
 */
export const SECOND_WIDEN_MAX = 7;

/** Seconds of the seal's flinch, and how far in it dips. */
export const SEAL_PUNCH_DURATION = 0.5;
export const SEAL_PUNCH_DEPTH = 1.2;

/**
 * The widen a fight of a given spread asks for, before smoothing.
 *
 * Exported so the probe and the spec compute it the same way the rig does,
 * rather than each restating the arithmetic and drifting.
 */
export function arenaWiden(furthestThreat) {
    if (!(furthestThreat > 0)) return 0;
    return Math.min(
        ARENA_WIDEN_MAX,
        Math.max(0, furthestThreat - ARENA_WIDEN_FREE) * ARENA_WIDEN_RATE,
    );
}
