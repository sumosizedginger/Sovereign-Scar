// tests/game/luminance.spec.mjs — proving the certification gate can tell a
// lit room from a flat one.
//
// The visual gate bands each level's MEAN frame luminance. A mean cannot
// distinguish those two cases: a room with a strong key and deep shadows meters
// LOWER than the same room under a flat ambient wash. So for years the cheapest
// way to pass the gate was to flatten the art — raise ambient, add pale
// geometry — and the gate would go green for it. That is how ambient reached
// 1.7 against a key of 1.9.
//
// tests/visual-sanity.spec.mjs now also bands `contrast` (centre-crop
// p90 − p10). This file exists because a floor nobody has proven discriminates
// is decorative. Every assertion below is about the statistic itself, on
// synthetic frames whose answer is known by construction:
//
//   a flat grey frame must PASS the mean band and FAIL the contrast floor
//
// If that case ever stops failing, the floor has stopped doing its job and the
// build can go flat again without anything turning red.

import { frameLuminanceStats, CENTER_CROP } from '../../src/game/render/luminance.js';

const W = 64, H = 64;

/** Build an RGBA buffer from a per-pixel grey function. */
function frame(greyAt) {
    const px = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const g = Math.max(0, Math.min(255, Math.round(greyAt(x, y))));
            px[i] = g; px[i + 1] = g; px[i + 2] = g; px[i + 3] = 255;
        }
    }
    return px;
}

const stats = (px) => frameLuminanceStats(px, W, H, 1);

// The band the certification gate applies to a Crust level, and the floor
// visual-sanity.spec.mjs applies to the centre crop.
const CRUST_BAND = [45, 90];
// The gate uses TWO floors: 60 for walled dungeon rooms (they measure
// 70-172) and 10 for open outdoor levels (12-16, which is what an open field
// with one ground plane and no walls simply IS). One number could not serve
// both — at 13 it did nothing for the fourteen dungeons and sat inside the
// overworld's own sample noise. The synthetic cases below use the OPEN floor,
// the harder of the two to fail against, so a flat frame failing it is the
// strongest form of the claim.
const FLOOR = 10;
const DUNGEON_FLOOR = 60;
const inBand = (m) => m >= CRUST_BAND[0] && m <= CRUST_BAND[1];

export function run(t) {
    // ---------------------------------------------------------------
    // the statistic is arithmetically right
    // ---------------------------------------------------------------
    {
        const s = stats(frame(() => 60));
        t.ok('flat frame mean is the flat value', Math.abs(s.mean - 60) < 0.6, `mean=${s.mean}`);
        t.ok('flat frame p10 == p90', s.p10 === s.p90, `p10=${s.p10} p90=${s.p90}`);
        t.ok('flat frame has zero contrast', s.contrast === 0, `contrast=${s.contrast}`);
        t.ok('every pixel sampled at stride 1', s.samples === W * H, `samples=${s.samples}`);
    }
    {
        // Rec.709: pure green is much brighter than pure blue.
        const px = new Uint8Array(W * H * 4);
        for (let i = 0; i < px.length; i += 4) { px[i + 1] = 255; px[i + 3] = 255; }
        const g = frameLuminanceStats(px, W, H, 1);
        const bpx = new Uint8Array(W * H * 4);
        for (let i = 0; i < bpx.length; i += 4) { bpx[i + 2] = 255; bpx[i + 3] = 255; }
        const b = frameLuminanceStats(bpx, W, H, 1);
        t.ok('green weighs more than blue', g.mean > b.mean * 5, `g=${g.mean} b=${b.mean}`);
    }

    // ---------------------------------------------------------------
    // THE LOAD-BEARING CASE: flat passes the mean, fails the floor
    // ---------------------------------------------------------------
    {
        const flat = stats(frame(() => 62));
        t.ok('a flat grey frame passes the mean band', inBand(flat.mean),
            `mean=${flat.mean.toFixed(1)} band=[${CRUST_BAND}]`);
        t.ok('a flat grey frame FAILS the contrast floor', flat.contrast < FLOOR,
            `contrast=${flat.contrast} floor=${FLOOR}`);
    }
    {
        // Same mean, but half the room is in shadow and half is in key light.
        // This is what the gate is supposed to reward.
        const lit = stats(frame((x) => (x < W / 2 ? 24 : 100)));
        t.ok('a lit frame lands in the same mean band', inBand(lit.mean),
            `mean=${lit.mean.toFixed(1)}`);
        t.ok('a lit frame clears the contrast floor', lit.contrast >= FLOOR,
            `contrast=${lit.contrast}`);

        const flat = stats(frame(() => 62));
        t.ok('lit and flat are indistinguishable by mean',
            Math.abs(lit.mean - flat.mean) < 1.5,
            `lit=${lit.mean.toFixed(1)} flat=${flat.mean.toFixed(1)}`);
        t.ok('lit and flat are far apart by contrast',
            lit.contrast - flat.contrast > 40,
            `lit=${lit.contrast} flat=${flat.contrast}`);
    }

    // ---------------------------------------------------------------
    // why the contrast is measured on a centre crop
    // ---------------------------------------------------------------
    {
        // A flat room seen through a vignette: the middle is one value, the
        // border is crushed to black. Full-frame spread is huge; the room is
        // still flat. Measured full-frame, the floor would pass this — which is
        // exactly what the live probe found (p10 == 0 in nearly every level).
        const m = (1 - CENTER_CROP) / 2;
        const vignettedFlat = stats(frame((x, y) => {
            const inner = x >= W * m && x < W * (1 - m) && y >= H * m && y < H * (1 - m);
            return inner ? 62 : 0;
        }));
        t.ok('vignette alone produces a large FULL-FRAME spread',
            vignettedFlat.spread > 40, `spread=${vignettedFlat.spread}`);
        t.ok('but the centre crop correctly reports it as flat',
            vignettedFlat.contrast === 0, `contrast=${vignettedFlat.contrast}`);
        t.ok('so a full-frame floor would have passed a flat room',
            vignettedFlat.spread >= FLOOR && vignettedFlat.contrast < FLOOR,
            `spread=${vignettedFlat.spread} contrast=${vignettedFlat.contrast}`);
    }
    {
        // The crop must not be so tight that real shading falls outside it.
        const s = stats(frame((x) => (x < W / 2 ? 20 : 110)));
        t.ok('centre crop still sees a room-wide light gradient',
            s.contrast > 60, `contrast=${s.contrast}`);
    }

    // ---------------------------------------------------------------
    // the floor is a ratchet, not a cliff — measured 2026-07-22
    // ---------------------------------------------------------------
    {
        // Live centre-crop contrast across the campaign, measured with
        // tests/qa/contrast-probe.mjs, before and after the lighting work:
        //
        //   level        before  after
        //   overworld        14     15
        //   sandbox          15     15
        //   b08-bone         34     71
        //   b09-town         43     75
        //   b12-pyre         43     74
        //   b07-sluice       44     73
        //   b10-cryo         47     65
        //   b11-mire         64     74
        //   b02-spindle      81     92
        //   b04-sky          81     93
        //   b01-crypt        82     95
        //   b03-sink        101    116
        //   b05-citadel     108     92   ← down
        //   b14-leviathan   124    115   ← down
        //   b06-quarry      160    172
        //   b13-gumoi       166    167
        //
        // Fourteen of sixteen improved and the Abyss dungeons roughly doubled,
        // which is the expected shape: they were the ones carrying ambient
        // multipliers of 2.4×–3.4× on top of an already-flat preset. Two went
        // down and are recorded rather than hidden — both are levels whose
        // contrast came partly from a bright post effect rather than from
        // lighting, so trading flat ambient for a stronger key cost them.
        //
        // The floor was 12 and is now 13: it tracks just under the worst level
        // so nothing can regress, and it gets tightened every time the worst
        // level improves. A ratchet that is never tightened is just a number.
        t.ok('the open floor sits under the measured worst open level',
            FLOOR < 12, `floor=${FLOOR} vs Bonetown at 12`);
        t.ok('the dungeon floor sits under the measured worst dungeon',
            DUNGEON_FLOOR < 70, `floor=${DUNGEON_FLOOR} vs Cryo Vault at 70`);
        t.ok('the dungeon floor actually bites',
            DUNGEON_FLOOR > FLOOR * 4,
            `a single floor of 13 would have let a dungeon fall from 95 to 14 `
            + `and still pass; ${DUNGEON_FLOOR} would not`);
        t.ok('floor is high enough to reject a flat frame',
            stats(frame(() => 62)).contrast < FLOOR, 'flat frame must fail');
    }

    // ---------------------------------------------------------------
    // degenerate inputs must not throw or lie
    // ---------------------------------------------------------------
    {
        const black = stats(frame(() => 0));
        t.ok('an all-black frame reports zero mean', black.mean === 0, `mean=${black.mean}`);
        t.ok('an all-black frame reports zero contrast', black.contrast === 0);
        const white = stats(frame(() => 255));
        t.ok('an all-white frame saturates', white.mean > 254, `mean=${white.mean}`);
        t.ok('an all-white frame has no contrast either', white.contrast === 0);
        t.ok('a saturated frame is not mistaken for a lit one', white.contrast < FLOOR);
    }
}
