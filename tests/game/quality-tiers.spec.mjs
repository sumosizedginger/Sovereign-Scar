// tests/game/quality-tiers.spec.mjs — a higher tier has to look better.
//
// THE BUG THIS EXISTS TO PIN, reported from play: **the player model looked
// worse on ULTRA than on LOW.** Ultra was identical to high except for one
// flag, `aberration: true`, and that flag was the whole difference.
//
// `RGBShiftShader` samples red at `vUv + amount` and blue at `vUv - amount`, so
// the red-to-blue separation on screen is `2 * amount * frameWidth`. At the
// shipped 0.0012 that is 3.07 px across a 1280-wide frame — and the hero is
// **34 px wide** at the gameplay camera (`tests/qa/aberration-cost.mjs`). Nine
// percent of the character, on a figure whose arms are a few pixels across.
//
// `renderer.js` had already written the warning ("even at a small amount it
// reads as a distracting fringe on high-contrast edges") and disabled the pass
// by default. Nothing stopped a tier turning it back on.
//
// SO THE GUARD IS ON THE BUDGET, NOT ON THE FLAG. Whether a tier wants a CRT
// cue is a look decision and belongs to the owner. Whether it may be turned up
// to where it eats the player is not, and that is what is held here.
//
// The tier table moved into its own DOM-free module to make this possible at
// all: `quality.js` imports `renderer.js`, which reads `window.innerWidth` at
// module scope, so nothing under `tests/game/` could ever load it.

import fs from 'node:fs';
import {
    TIERS, TIER_ORDER, ABERRATION_AMOUNT,
    MAX_ABERRATION_SPLIT_PX, BUDGET_FRAME_WIDTH, aberrationSplitPx,
} from '../../src/engine/quality-tiers.js';

/** Measured with `tests/qa/aberration-cost.mjs`, overworld, gameplay camera. */
const HERO_WIDTH_PX = 34;

export function run(t) {
    // ── 1. The arithmetic the budget rests on ──────────────────────────────
    //
    // Written out rather than taken on trust, because the whole defect is that
    // `amount` does not mean what it looks like it means: it is a fraction of
    // the FRAME, applied in two opposite directions, so the visible separation
    // is twice the number in the source.
    {
        t.ok('the split is twice the amount, across the frame',
            Math.abs(aberrationSplitPx(0.001, 1000) - 2) < 1e-9,
            `${aberrationSplitPx(0.001, 1000)}`);
        t.ok('…and scales with the frame width',
            Math.abs(aberrationSplitPx(0.001, 2000) - 4) < 1e-9);
        // The shipped-and-reverted value, kept as the thing being guarded
        // against rather than as a memory of it.
        const wasShipped = aberrationSplitPx(0.0012, BUDGET_FRAME_WIDTH);
        t.ok('the value that caused the report is over budget',
            wasShipped > MAX_ABERRATION_SPLIT_PX,
            `0.0012 => ${wasShipped.toFixed(2)}px, budget ${MAX_ABERRATION_SPLIT_PX}px`);
        t.ok('…and was a large fraction of the hero',
            wasShipped / HERO_WIDTH_PX > 0.08,
            `${(100 * wasShipped / HERO_WIDTH_PX).toFixed(1)}% of a ${HERO_WIDTH_PX}px hero`);
    }

    // ── 2. THE BUDGET ──────────────────────────────────────────────────────
    {
        const split = aberrationSplitPx(ABERRATION_AMOUNT, BUDGET_FRAME_WIDTH);
        t.ok('the shipped aberration amount is inside the budget',
            split <= MAX_ABERRATION_SPLIT_PX,
            `${split.toFixed(2)}px vs ${MAX_ABERRATION_SPLIT_PX}px`);
        t.ok('…which is a small fraction of the hero, not a large one',
            split / HERO_WIDTH_PX < 0.05,
            `${(100 * split / HERO_WIDTH_PX).toFixed(1)}% of a ${HERO_WIDTH_PX}px hero`);
        // And the budget itself has to be worth something. A budget wide enough
        // to admit the value that caused the report is not a budget.
        t.ok('the budget is tighter than the defect it exists to stop',
            MAX_ABERRATION_SPLIT_PX < aberrationSplitPx(0.0012, BUDGET_FRAME_WIDTH));
    }

    // ── 3. `renderer.js` uses the constant, rather than its own copy ───────
    //
    // The amount and the budget living in different files is exactly how the
    // first one went stale. Read from source: `renderer.js` cannot be imported
    // here, and a number it hard-codes would be invisible to every assertion
    // above.
    {
        const src = fs.readFileSync('src/engine/renderer.js', 'utf8');
        t.ok('renderer.js imports the aberration amount',
            /import \{[^}]*ABERRATION_AMOUNT[^}]*\} from '\.\/quality-tiers\.js'/.test(src));
        t.ok('…and assigns it to the pass',
            /rgbShiftPass\.uniforms\.amount\.value = ABERRATION_AMOUNT;/.test(src));
        t.ok('…keeping no hard-coded amount of its own',
            !/rgbShiftPass\.uniforms\.amount\.value = 0?\.\d+/.test(src));
    }

    // ── 4. Every tier is inside the budget ─────────────────────────────────
    //
    // Per tier, so a future table that gives one tier its own amount is still
    // covered.
    for (const name of TIER_ORDER) {
        const tier = TIERS[name];
        t.ok(`${name} is a real tier`, !!tier);
        if (!tier) continue;
        const amount = tier.aberrationAmount != null ? tier.aberrationAmount : ABERRATION_AMOUNT;
        const split = tier.aberration ? aberrationSplitPx(amount, BUDGET_FRAME_WIDTH) : 0;
        t.ok(`${name} does not spend more aberration than the hero can pay`,
            split <= MAX_ABERRATION_SPLIT_PX,
            `${split.toFixed(2)}px vs ${MAX_ABERRATION_SPLIT_PX}px`);
    }

    // ── 5. A higher tier does not take things away ─────────────────────────
    //
    // The shape of the original report: ULTRA was LOW plus one effect that
    // subtracted. Nothing here says a tier must add — `med` deliberately skips
    // `postExtras` — but a knob may not go BACKWARDS as the tier goes up, and
    // an effect that only the top tier has is exactly where an unpriced one
    // hides, because almost nobody plays there.
    {
        let ok = true;
        const trail = [];
        let prev = null;
        for (const name of TIER_ORDER) {
            const tier = TIERS[name];
            trail.push(`${name}: pr=${tier.pixelRatio} sm=${tier.shadowMap} bloom=${tier.bloomStrength}`);
            if (prev) {
                if (tier.pixelRatio < prev.pixelRatio) ok = false;
                if (tier.shadowMap < prev.shadowMap) ok = false;
                if (tier.bloomStrength < prev.bloomStrength) ok = false;
                if (prev.postExtras && !tier.postExtras) ok = false;
            }
            prev = tier;
        }
        t.ok('no knob goes backwards as the tier goes up', ok, trail.join(' | '));

        // Anything the TOP tier alone turns on gets named, so it cannot be
        // added quietly. `aberration` was the only one, and it was the bug.
        const soloTop = [];
        const top = TIERS[TIER_ORDER[TIER_ORDER.length - 1]];
        const below = TIERS[TIER_ORDER[TIER_ORDER.length - 2]];
        for (const k of Object.keys(top)) {
            if (typeof top[k] !== 'boolean') continue;
            if (top[k] && !below[k]) soloTop.push(k);
        }
        t.ok('the top tier turns nothing on that the tier below does not have',
            soloTop.length === 0,
            soloTop.length ? `only-on-ultra: ${soloTop.join(', ')}` : 'none');
    }

    // ── 6. The table still describes four usable tiers ─────────────────────
    {
        t.ok('there are four tiers', TIER_ORDER.length === 4);
        t.ok('…and the table holds exactly those', Object.keys(TIERS).length === 4
            && TIER_ORDER.every((n) => n in TIERS), Object.keys(TIERS).join(','));
        t.ok('the top tier is still better than the bottom in some way',
            TIERS.ultra.pixelRatio > TIERS.low.pixelRatio
            && TIERS.ultra.shadowMap > TIERS.low.shadowMap
            && TIERS.ultra.bloomStrength > TIERS.low.bloomStrength);
        t.ok('and the lowest tier really is cheap',
            TIERS.low.pixelRatio === 1 && TIERS.low.bloom === false);
    }
}
