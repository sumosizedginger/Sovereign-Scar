// Boss geometry, in the same material the rest of the game is made of.
//
// Everything in Sovereign Scar is voxels: the world, the props, the hero, the
// enemies, the held weapons. `assets/weapon-models.js` states the reason in its
// header — "everything else in this game is voxels and a smooth sword in a
// blocky world reads as a bug" — and then the boss roster was built from
// twelve `SphereGeometry`, seven `BoxGeometry`, three `IcosahedronGeometry`, a
// `TorusGeometry`, two `DodecahedronGeometry` and two `ConeGeometry`. Fourteen
// smooth analytic solids sitting in a blocky world, including a final boss that
// is a plain pink ball on a grey plinth.
//
// These builders take the same arguments as the three.js primitives they
// replace, so the roster's constructors keep their shape and — critically —
// every `this.core`, `this.ring`, `this.frost`, `this.legs` reference the
// fourteen `tickAI` implementations animate keeps working. The swap is
// geometry only.
//
// ── Scale is in WORLD UNITS, always ─────────────────────────────────────────
//
// Each builder takes a world-space radius and derives the voxel resolution from
// it, rather than taking a cell count. A boss authored as "radius 1.1" is 1.1
// units of radius no matter how many voxels that turns out to be, so the body
// and the `hitRadius` the fight resolves against cannot drift apart — which is
// the one thing that must never happen to a boss.

import * as THREE from 'three';
import { buildVoxelGeo } from '../../voxel/core.js';
import { fillBox, fillEllipsoid } from '../../voxel/helpers.js';

/**
 * How many voxels across one world unit.
 *
 * 6 is chosen, not guessed: the hero's rig is built at meshScale 0.39 against a
 * voxel size S of 0.09, i.e. ~0.035 units per voxel over a body about 24 cells
 * tall. Matching that on a boss two metres across would be ~57 cells per axis
 * and hundreds of thousands of faces for no visible gain, because the camera is
 * 17.5 units up. At 6/unit a 2.2-radius boss is ~26 cells across — the same
 * apparent blockiness as the architecture it stands on, which is the read we
 * actually want. The whole campaign runs at ~24k triangles; this is affordable.
 */
export const VOX_PER_UNIT = 6;

/**
 * Resolution for THIN parts — limbs, blades, antennae, anything whose job is to
 * be a line rather than a mass.
 *
 * ## The floor these builders have, which is not obvious and has already cost a
 * ## boss redesign
 *
 * `cells()` rounds to whole voxels and clamps at 1, and `voxBox` takes a HALF
 * extent, so the thinnest box `VOX_PER_UNIT = 6` can express is 3 cells —
 * **0.5 world units** — and the next size up is 0.833. Measured, every one of
 * `0.12 · 0.14 · 0.15 · 0.19 · 0.22 · 0.26 · 0.34` comes out at exactly 0.500.
 *
 * That is a silent quantisation: the number in the source is not the number in
 * the world, and nothing complains. The Obsidian Arachnid's legs are authored
 * `voxBox(0.15, 0.15, 1.8)` and have always been **0.5 thick, 3.3x what they
 * say** — times its 1.70 presence scale, 0.85 units of leg on a spider whose
 * span its own flank rule caps near 3.5. Eight limbs that thick cannot have air
 * between them, and air between the legs is the whole of what makes a spider
 * legible. Three separate attempts to "thin the legs" were literal no-ops
 * before anyone measured the builder rather than trusting its arguments.
 *
 * 18 is chosen, not guessed: it is 3x the body resolution, so a limb can be
 * one-third of the old floor (0.167) and still land on a whole number of cells,
 * and it keeps the cell GRID commensurate — a limb built at 18 shares corners
 * with a body built at 6, so the two do not visibly disagree where they meet.
 * Bodies stay at `VOX_PER_UNIT`, deliberately: the blockiness of the masses is
 * what matches the architecture, and this is not a licence to smooth the game
 * out one boss at a time.
 */
export const LIMB_VOX_PER_UNIT = 18;

/** Shared material for a voxel boss part. Vertex-coloured, like the world. */
function bossMaterial(emissive, ei, extras) {
    return new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: emissive || 0x000000,
        emissiveIntensity: ei || 0,
        roughness: 0.62,
        metalness: 0.22,
        ...extras,
    });
}

/**
 * Turn a voxel map into a mesh scaled so one cell is 1/VOX_PER_UNIT units, and
 * centred on its own bounding box so the mesh's origin behaves like a primitive's.
 */
function meshFromMap(map, emissive, ei, extras, res = VOX_PER_UNIT) {
    const geo = buildVoxelGeo(map);
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    // Centre the geometry, then bake the cell→world scale into it.
    //
    // Into the GEOMETRY, not into `mesh.scale`. These are drop-in replacements
    // for three.js primitives, and callers already do things like
    // `mesh.scale.setScalar(3.1)` immediately afterwards (sand-spur segments,
    // tri-compiler cores). A builder that parks its own factor in `mesh.scale`
    // has that factor silently overwritten by the next line, and the boss comes
    // out six times too big with nothing to indicate why.
    geo.translate(
        -(b.max.x + b.min.x) / 2,
        -(b.max.y + b.min.y) / 2,
        -(b.max.z + b.min.z) / 2
    );
    geo.scale(1 / res, 1 / res, 1 / res);
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, bossMaterial(emissive, ei, extras));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

const cells = (u, res = VOX_PER_UNIT) => Math.max(1, Math.round(u * res));

/** Voxel stand-in for SphereGeometry(radius). */
export function voxSphere(radius, color, emissive, ei, extras, res = VOX_PER_UNIT) {
    const m = new Map();
    const r = cells(radius, res);
    fillEllipsoid(m, 0, 0, 0, r, r, r, color);
    return meshFromMap(m, emissive, ei, extras, res);
}

/**
 * Voxel stand-in for BoxGeometry(w, h, d).
 *
 * Pass `LIMB_VOX_PER_UNIT` as `res` for anything meant to read as a LINE rather
 * than a mass — below ~0.34 units the default resolution silently rounds every
 * width up to 0.5. See the note on `LIMB_VOX_PER_UNIT`.
 */
export function voxBox(w, h, d, color, emissive, ei, extras, res = VOX_PER_UNIT) {
    const m = new Map();
    const hx = cells(w / 2, res), hy = cells(h / 2, res), hz = cells(d / 2, res);
    fillBox(m, -hx, hx, -hy, hy, -hz, hz, color);
    return meshFromMap(m, emissive, ei, extras, res);
}

/**
 * Voxel stand-in for an ellipsoid — the shape most of the smooth boss parts
 * actually wanted (Dodecahedron / Icosahedron / squashed Sphere all read the
 * same from 17.5 units up, which is to say: as a blob).
 */
export function voxBlob(rx, ry, rz, color, emissive, ei, extras) {
    const m = new Map();
    fillEllipsoid(m, 0, 0, 0, cells(rx), cells(ry), cells(rz), color);
    return meshFromMap(m, emissive, ei, extras);
}

/**
 * Voxel stand-in for TorusGeometry(radius, tube) — a flat ring lying in the XZ
 * plane rather than standing in XY.
 *
 * The orientation change is deliberate and is the whole reason this is not a
 * drop-in. A torus standing upright is a ring you see edge-on from a top-down
 * camera, i.e. a bar. Lying flat it is a ring, which is what "ring" was for.
 */
export function voxRing(radius, tube, color, emissive, ei, extras) {
    const m = new Map();
    const R = cells(radius), T = Math.max(1, cells(tube));
    const h = Math.max(1, Math.round(T * 0.8));
    for (let y = -h; y <= h; y++) {
        for (let x = -R - T; x <= R + T; x++) {
            for (let z = -R - T; z <= R + T; z++) {
                const d = Math.hypot(x, z);
                if (d >= R - T && d <= R + T) m.set(`${x},${y},${z}`, color);
            }
        }
    }
    return meshFromMap(m, emissive, ei, extras);
}

/**
 * A tapered spike lying along +Z — the replacement for ConeGeometry on the
 * parts that are supposed to read as a point (mantis head, wyrm snout).
 *
 * Along Z, not Y, for the same reason `voxRing` lies flat: a cone standing on
 * its base is a circle from above and says nothing. Pointing forward, it says
 * which way the thing is facing, from the only angle the player ever has.
 */
export function voxSpike(length, baseRadius, color, emissive, ei, extras, res = VOX_PER_UNIT) {
    const m = new Map();
    const L = cells(length, res), R = cells(baseRadius, res);
    for (let z = 0; z <= L; z++) {
        const t = 1 - z / L;
        const r = Math.max(0, R * t);
        if (r < 0.5) { m.set(`0,0,${z}`, color); continue; }
        for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
            for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
                if (x * x + y * y <= r * r + 0.5) m.set(`${x},${y},${z}`, color);
            }
        }
    }
    return meshFromMap(m, emissive, ei, extras, res);
}

/**
 * A blade: long in Z, thin in X, with a widened cutting edge. Replaces the
 * vertical `BoxGeometry(0.2, 2.2, 0.35)` slabs the roster used for weapons,
 * which from above were a two-pixel line.
 */
export function voxBlade(length, width, thickness, color, emissive, ei, extras) {
    const m = new Map();
    const L = cells(length), W = cells(width), T = Math.max(1, cells(thickness));
    for (let z = 0; z <= L; z++) {
        const t = z / L;
        // Narrow at the haft, widest two-thirds along, tapering to the point.
        const w = Math.max(1, Math.round(W * (0.35 + 0.65 * Math.sin(t * Math.PI * 0.9))));
        fillBox(m, -w, w, -T, T, z, z, color);
    }
    return meshFromMap(m, emissive, ei, extras);
}

/**
 * Radial legs/arms around a body, lying in the plane — the read that makes a
 * spider look like a spider from directly above.
 */
export function voxRadial(count, innerR, outerR, thickness, color, emissive, ei, extras) {
    const m = new Map();
    const T = Math.max(1, cells(thickness));
    for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const steps = cells(outerR - innerR);
        for (let s = 0; s <= steps; s++) {
            const r = cells(innerR) + s;
            // Legs arch: up out of the body, then down to the floor.
            const t = s / Math.max(1, steps);
            const y = Math.round(Math.sin(t * Math.PI) * T * 2.2);
            const x = Math.round(ca * r), z = Math.round(sa * r);
            fillBox(m, x - T, x + T, y - T, y + T, z - T, z + T, color);
        }
    }
    return meshFromMap(m, emissive, ei, extras);
}

/**
 * Measure a boss body's world-space footprint radius.
 *
 * NOT USED BY THE BOSSES. This used to claim "bosses derive `hitRadius` from
 * this rather than carrying a hand-written number" — they never have. Every
 * boss carries a hand-written number, and the claim survived long enough to be
 * quoted in a plan as though it were the mechanism.
 *
 * The job it was written for is done, better, somewhere else:
 * `tests/game/boss-bodies.spec.mjs` asserts that every boss's hitRadius
 * describes its body, and it does so with a **p85** horizontal radius measured
 * after ticking the boss for two seconds. Both of those beat this function for
 * the purpose. `Box3` takes the outermost part, so one long thin scythe or a
 * trailing tail segment sets the whole radius; the p85 ignores that. And a
 * body measured cold is not the body anyone fights — the Hydroid Cloud builds
 * its twelve orbs AT THE ORIGIN and only flies them apart on the first tick,
 * so a bounding box taken at construction reports a third of its real size.
 *
 * Kept because it is the right primitive for a whole-silhouette question, which
 * is what `tests/qa/boss-silhouette.mjs` asks: that probe prints cold-vs-peak
 * extents to show which bosses change size at runtime — useful before phase B
 * starts adding actions that scale and reposition them.
 */
export function measureBody(root) {
    const box = new THREE.Box3().setFromObject(root);
    if (!isFinite(box.min.x)) return { radius: 1.2, height: 2 };
    return {
        radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2,
        height: box.max.y - box.min.y,
    };
}
