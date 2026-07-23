// Frame luminance statistics for the certification gate.
//
// This is a pure function over a pixel buffer, deliberately kept out of the
// frame loop in index.js so it can be unit-tested against synthetic frames.
// The gate it feeds is only trustworthy if the statistic itself is proven to
// discriminate — see tests/game/luminance.spec.mjs, which asserts that a flat
// grey frame passes the mean band and FAILS the contrast floor. Without that
// case the floor is decorative.
//
// Why a contrast floor exists at all:
//
// The gate used to band the *mean* frame luminance and nothing else. A mean
// cannot tell a well-lit room from a flat one — a room with a strong key and
// deep shadows meters LOWER than the same room under a flat ambient wash. So
// every time a room failed the band on the low side, the cheapest legal fix was
// to raise ambient or add pale geometry, both of which flatten it. That is how
// ambient reached 1.7 against a key of 1.9, and why Beat 01's tomb grew
// decorative gold-leaf seams (the level file says so).
//
// Why the contrast is measured on a centre crop:
//
// Measured over the whole frame, p90 − p10 reads 58–160 across the campaign and
// would pass any floor worth setting. That is not contrast in the world; `p10`
// comes out at 0 nearly everywhere and the zero is the VIGNETTE crushing the
// corners. Vignette strength does not move when the lighting does, so a
// full-frame spread is mostly a constant with the answer buried in it. Cropping
// to the middle half in each axis — where the room is, and where no post effect
// is clamping values — turns the same statistic into one that ranges 14 to 166
// across the campaign and separates the flat levels from the lit ones.

/** Rec. 709 luma weights. */
const LR = 0.2126, LG = 0.7152, LB = 0.0722;

/** Fraction of the frame kept, per axis, for the contrast measurement. */
export const CENTER_CROP = 0.5;

/** Read a percentile out of a 256-bin histogram. */
function pct(hist, total, q) {
    const want = q * total;
    let seen = 0;
    for (let b = 0; b < 256; b++) {
        seen += hist[b];
        if (seen >= want) return b;
    }
    return 255;
}

/**
 * Luminance distribution of an RGBA framebuffer readback.
 *
 * @param {Uint8Array|Uint8ClampedArray|number[]} px RGBA bytes, length w*h*4
 * @param {number} w drawing buffer width
 * @param {number} h drawing buffer height
 * @param {number} stride sample every Nth pixel (1 = every pixel)
 * @returns {{mean:number,p10:number,p50:number,p90:number,spread:number,
 *            centerMean:number,centerP10:number,centerP90:number,
 *            contrast:number,samples:number}}
 */
export function frameLuminanceStats(px, w, h, stride = 16) {
    const hist = new Uint32Array(256);
    const cHist = new Uint32Array(256);
    const m = (1 - CENTER_CROP) / 2; // 0.25 for a half-width crop
    const cx0 = (w * m) | 0, cx1 = (w * (1 - m)) | 0;
    const cy0 = (h * m) | 0, cy1 = (h * (1 - m)) | 0;
    let sum = 0, n = 0, cSum = 0, cN = 0;

    for (let p = 0; p < w * h; p += stride) {
        const i = p * 4;
        const y = LR * px[i] + LG * px[i + 1] + LB * px[i + 2];
        const b = y < 0 ? 0 : y > 255 ? 255 : Math.round(y);
        sum += y; hist[b]++; n++;
        const x = p % w, row = (p / w) | 0;
        if (x >= cx0 && x < cx1 && row >= cy0 && row < cy1) {
            cSum += y; cHist[b]++; cN++;
        }
    }

    const p10 = pct(hist, n, 0.10), p90 = pct(hist, n, 0.90);
    const cp10 = pct(cHist, cN, 0.10), cp90 = pct(cHist, cN, 0.90);
    return {
        mean: n ? sum / n : 0,
        p10,
        p50: pct(hist, n, 0.50),
        p90,
        spread: p90 - p10,
        centerMean: cN ? cSum / cN : 0,
        centerP10: cp10,
        centerP90: cp90,
        contrast: cp90 - cp10,
        samples: n,
    };
}
