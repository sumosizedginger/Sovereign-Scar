// Code-generated surface detail (Ticket G / Change 6.3).
//
// Without image textures, flat vertex-colored voxel faces read as plastic.
// mottleColors() adds deterministic per-vertex brightness variation so stone,
// bone, and metal gain a tactile grain. The noise is symmetric and quantized
// per voxel cell, so it is:
//   - deterministic (same map → same grain, independent of position jitter);
//   - mean-preserving (as many vertices brighten as darken), so it never moves
//     a room's average luminance out of the certification band;
//   - sub-navigational (small amplitude), so it never competes with the
//     hazard / interactable contrast the gameplay read depends on.

/** Integer hash of a voxel cell → [0,1). */
function hashCell(x, y, z) {
    let h = (Math.round(x) * 374761393 + Math.round(y) * 668265263 + Math.round(z) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/**
 * Multiply each vertex colour by 1 ± amount using a symmetric, quantized noise.
 * Requires a `color` + `position` attribute (present on vertex-coloured voxel
 * geometry); no-ops gracefully otherwise. Returns the same geometry.
 */
export function mottleColors(geo, amount = 0.06) {
    const color = geo && geo.getAttribute && geo.getAttribute('color');
    const pos = geo && geo.getAttribute && geo.getAttribute('position');
    if (!color || !pos || amount <= 0) return geo;
    const n = color.count;
    for (let i = 0; i < n; i++) {
        // Quantize to the voxel cell so tiny position jitter never changes the
        // grain, and map the hash to a symmetric factor centred on 1.
        const noise = hashCell(pos.getX(i), pos.getY(i), pos.getZ(i)) * 2 - 1;
        const f = 1 + amount * noise;
        color.setXYZ(i,
            clamp01(color.getX(i) * f),
            clamp01(color.getY(i) * f),
            clamp01(color.getZ(i) * f));
    }
    color.needsUpdate = true;
    return geo;
}
