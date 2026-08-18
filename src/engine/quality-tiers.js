// @ts-check
// src/engine/quality-tiers.js
// The quality tier TABLE, and the one post-processing constant that has to be
// judged against the size of what it is applied to.
//
// WHY THIS IS A SEPARATE FILE FROM `quality.js`. That module imports
// `renderer.js`, which reads `window.innerWidth` at module scope, so nothing
// headless can load it — which meant the tier table could not be asserted on by
// any spec in `tests/game/`. It is pure data with no dependencies; the only
// reason it lived next to a WebGL context was habit.
//
// ── The aberration budget ───────────────────────────────────────────────────
//
// The owner reported the player model looking worse on ULTRA than on LOW, and
// isolating each ultra-only effect in turn (`tests/qa/quality-hero.mjs`)
// pointed at exactly one of them: the RGB shift.
//
// `RGBShiftShader` samples red at `vUv + amount` and blue at `vUv - amount`, so
// the red-to-blue separation on screen is TWICE the amount, as a fraction of
// the frame's width:
//
//     split_px = 2 * amount * frameWidth
//
// At the shipped 0.0012 that is 3.07 px across a 1280-wide frame. Measured with
// `tests/qa/aberration-cost.mjs`, the hero is **34 px wide** at the gameplay
// camera — so the split was **9% of the whole character**, on a figure whose
// arms are a few pixels across. That is the white fringe and the pink tunic in
// the owner's screenshot.
//
//     amount    split     % of hero width
//     0.0000    0.00px     0.0%
//     0.0002    0.51px     1.5%
//     0.0004    1.02px     3.0%     <- still reads as a red tunic
//     0.0008    2.05px     6.0%
//     0.0012    3.07px     9.1%     <- shipped; a magenta smear
//
// A full-screen constant is a subtle rim on a 400 px character and a smear on a
// 34 px one, and the effect cannot tell which it is on. This is the same class
// of error as the actor outline that was pulled: an effect priced for a
// character several times this game's size.
//
// `renderer.js` had already written the warning — "even at a small amount it
// reads as a distracting fringe on high-contrast edges" — and disabled the pass
// by default. The ultra tier then turned it on anyway, which is the whole bug.

/**
 * Red-to-blue separation, in pixels at a 1280-wide frame, that a tier may
 * spend. Derived from the measured 34 px hero: 1.2 px is 3.5% of them, just
 * inside the 3.0% that still read as a character in the sweep above.
 *
 * The guard is on the BUDGET, not on the flag. Whether a tier wants the effect
 * is a look decision and belongs to the owner; whether it may be turned up to
 * where it eats the player is not.
 */
export const MAX_ABERRATION_SPLIT_PX = 1.2;

/** The frame width the budget above is quoted at. */
export const BUDGET_FRAME_WIDTH = 1280;

/**
 * Chromatic aberration strength, as `RGBShiftShader` means it: 1 is the width
 * of the input. Lowered from 0.0012 at the same time the ultra tier stopped
 * enabling it, so that turning the flag back on cannot reproduce the original
 * defect by itself.
 */
export const ABERRATION_AMOUNT = 0.0004;

/** Red-to-blue separation in pixels, for a frame `frameWidth` px across. */
export function aberrationSplitPx(amount = ABERRATION_AMOUNT, frameWidth = BUDGET_FRAME_WIDTH) {
    return 2 * amount * frameWidth;
}

export const TIERS = {
    low: {
        pixelRatio: 1, bloom: false, bloomStrength: 0, shadowMap: 1024,
        postExtras: false, aberration: false,
    },
    med: {
        pixelRatio: 1.5, bloom: true, bloomStrength: 0.7, shadowMap: 2048,
        postExtras: false, aberration: false,
    },
    high: {
        // 4096: 2048 across a ±30 frustum is 2048/60 = ~34 texels per world
        // unit, not the ~68 an earlier version of this comment claimed — the
        // arithmetic dropped the factor of two on the frustum's full span. Thin
        // either way for blocky geometry (graphics overhaul ticket 2), and the
        // penumbra is derived from this number, so it had to be right.
        pixelRatio: 2, bloom: true, bloomStrength: 0.9, shadowMap: 4096,
        postExtras: true, aberration: false,
    },
    ultra: {
        // ABERRATION IS OFF, and that is the whole difference this tier used to
        // have over `high`. See the budget note at the top of this file: it was
        // costing 9% of the hero's width to buy a CRT cue, which made ULTRA the
        // worst tier to look at the player on. Ultra is now high with a
        // stronger bloom, which is a tier that is better than the one below it.
        pixelRatio: 2, bloom: true, bloomStrength: 1.2, shadowMap: 4096,
        postExtras: true, aberration: false,
    },
};

/** Tier names, weakest first. The order the table is meant to be read in. */
export const TIER_ORDER = ['low', 'med', 'high', 'ultra'];
