// src/voxel/core.js
// Purpose: Voxel geometry core — map keys, AO tables, buildVoxelGeo.
// Dependencies: three

import * as THREE from 'three';

/** The voxel-map key format: integer coordinates joined as `"x,y,z"`. */
export function vkey(x, y, z) {
    return x + ',' + y + ',' + z;
}

/** Deterministic pseudo-random [0,1) from a position — for stable jitter/speckling, not Math.random(). */
export function hash3(x, y, z) {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return s - Math.floor(s);
}

// Face tables: u × v = n (CCW winding from outside)
export const FACES = [
    { n: [ 1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [ 0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
    { n: [ 0,-1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [ 0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [ 0, 0,-1], u: [0, 1, 0], v: [1, 0, 0] }
];

// Deepest level was 0.5 while AO lived in the albedo channel (lights washed
// it out, so deeper looked muddy rather than solid). Now AO rides its own
// attribute and multiplies only the indirect term — 0.35 is genuine contact.
export const AO_LEVELS = [1.0, 0.78, 0.55, 0.35];
export const CORNER_SIGNS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * Convert a voxel Map into a single BufferGeometry with position, normal,
 * color (albedo ONLY), and aoLevel (per-vertex ambient occlusion).
 *
 * Graphics overhaul ticket 1: AO used to be multiplied into vertex colour.
 * That put contact darkening in the albedo channel, so (a) lights washed it
 * out and (b) the material classifier that reads vColor flipped 10 of 11
 * palette families purely from sitting in a corner. Colour is clean albedo
 * now; the shader applies aoLevel to indirect light only.
 */
export function buildVoxelGeo(map, jitterAmt) {
    if (jitterAmt === undefined) jitterAmt = 0.06;
    const pos = [], nrm = [], col = [], aoAttr = [];
    const has = (x, y, z) => map.has(vkey(x, y, z));
    const c = new THREE.Color();

    for (const [k, cv] of map) {
        const p = k.split(',');
        const x = +p[0], y = +p[1], z = +p[2];
        c.setHex(cv);
        // Tiny deterministic jitter stays on albedo as pre-shader grain.
        // Amplitude is half what mottleColors used, because the shader now
        // owns the larger surface-detail term (ticket 3).
        const j = 1 + (hash3(x, y, z) - 0.5) * jitterAmt;
        const cr = Math.min(1, c.r * j), cg = Math.min(1, c.g * j), cb = Math.min(1, c.b * j);

        for (const f of FACES) {
            const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
            if (has(nx, ny, nz)) continue;

            const ao = [], corn = [];
            for (let i = 0; i < 4; i++) {
                const su = CORNER_SIGNS[i][0], sv = CORNER_SIGNS[i][1];
                const s1 = has(nx + f.u[0] * su, ny + f.u[1] * su, nz + f.u[2] * su) ? 1 : 0;
                const s2 = has(nx + f.v[0] * sv, ny + f.v[1] * sv, nz + f.v[2] * sv) ? 1 : 0;
                const cc = has(
                    nx + f.u[0] * su + f.v[0] * sv,
                    ny + f.u[1] * su + f.v[1] * sv,
                    nz + f.u[2] * su + f.v[2] * sv
                ) ? 1 : 0;
                ao.push(AO_LEVELS[(s1 && s2) ? 3 : (s1 + s2 + cc)]);
                corn.push([
                    x + f.n[0] * 0.5 + f.u[0] * su * 0.5 + f.v[0] * sv * 0.5,
                    y + f.n[1] * 0.5 + f.u[1] * su * 0.5 + f.v[1] * sv * 0.5,
                    z + f.n[2] * 0.5 + f.u[2] * su * 0.5 + f.v[2] * sv * 0.5
                ]);
            }
            const order = (ao[0] + ao[2] >= ao[1] + ao[3]) ? [0, 1, 2, 0, 2, 3] : [1, 2, 3, 1, 3, 0];
            for (const ti of order) {
                pos.push(corn[ti][0], corn[ti][1], corn[ti][2]);
                nrm.push(f.n[0], f.n[1], f.n[2]);
                // Albedo only — no AO multiply.
                col.push(cr, cg, cb);
                aoAttr.push(ao[ti]);
            }
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aoLevel', new THREE.Float32BufferAttribute(aoAttr, 1));
    return g;
}
