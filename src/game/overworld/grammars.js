// Regional overworld grammars (Ticket E / Priority 3).
//
// The old buildTerrain scattered the same random slabs + single pillars for
// every region and only swapped the palette. This registry replaces that with
// eight distinct shape grammars. Each screen now gets, per the audit budget:
//   - one dominant landmark / directional mass (macro);
//   - three to six middle-scale structures forming paths and negative space;
//   - twenty to forty decorative instances (micro);
//   - one region-specific ground pattern;
//   - genuinely different geometry in Crust vs Abyss, not merely a recolor.
//
// A screen is baked three times onto one voxel map: the 'shared' phase carries
// the region's identity into BOTH states; 'crust' and 'abyss' add state-only
// geometry with different silhouettes. Every solid placement routes through
// g.box(), which refuses any footprint overlapping a protected cell — spawn,
// door corridors, entrances, monoliths, blockers, and secret spots — so routes
// and gating puzzles survive the denser dressing.

import { CRUST_COLORS as C, ABYSS_COLORS as A } from '../assets/palettes.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const IN = (v, lo, hi) => v >= lo && v <= hi;

/**
 * Build a predicate marking cells that decoration must not occupy. Reads the
 * screen's live edges/entrances/monolith/blockers plus any passed feature
 * anchors (secret/suture/chain spots). Called at bake time, so s.edges is
 * fully populated even though the grammar closure was created earlier.
 */
export function makeProtector(s, features, half) {
    const circles = [{ x: 0, z: 0, r: 6 }]; // spawn + screen centre
    for (const en of s.entrances || []) circles.push({ x: en.x, z: en.z, r: 5 });
    if (s.monolith) circles.push({ x: s.monolith.x, z: s.monolith.z, r: 4 });
    for (const f of features || []) if (f) circles.push({ x: f.x, z: f.z, r: 4 });
    const rects = [];
    for (const b of s.blockers || []) {
        if (b.rect) rects.push({
            x0: b.rect.x0 - 2, x1: b.rect.x1 + 2, z0: b.rect.z0 - 2, z1: b.rect.z1 + 2,
        });
        if (b.at) circles.push({ x: b.at.x, z: b.at.z, r: (b.w || 2) + 3 });
        if (b.anchor) circles.push({ x: b.anchor.x, z: b.anchor.z, r: 3 });
    }
    // Door corridors: a straight lane from centre to each open edge gap, on the
    // half that faces that edge, so a clear route always exists between doors.
    const lanes = [];
    for (const e of s.edges || []) {
        const at = e.at || 0;
        if (e.side === 'E') lanes.push({ axis: 'x', sign: 1, at });
        else if (e.side === 'W') lanes.push({ axis: 'x', sign: -1, at });
        else if (e.side === 'S') lanes.push({ axis: 'z', sign: 1, at });
        else if (e.side === 'N') lanes.push({ axis: 'z', sign: -1, at });
    }
    return function protectedAt(x, z) {
        for (const c of circles) {
            const dx = x - c.x, dz = z - c.z;
            if (dx * dx + dz * dz < c.r * c.r) return true;
        }
        for (const r of rects) if (IN(x, r.x0, r.x1) && IN(z, r.z0, r.z1)) return true;
        for (const l of lanes) {
            if (l.axis === 'x') {
                if (Math.abs(z - l.at) <= 3 && (l.sign > 0 ? x >= -2 : x <= 2)) return true;
            } else if (Math.abs(x - l.at) <= 3 && (l.sign > 0 ? z >= -2 : z <= 2)) return true;
        }
        return false;
    };
}

/** Grammar context: guarded placement + a seeded RNG + running tallies. */
export function makeGrammarCtx(map, h, rand, s, features) {
    const half = h.half || 23;
    const lim = half - 2;
    const protectedAt = makeProtector(s, features, half);
    const ctx = {
        map, h, rand, half, lim, protectedAt,
        counts: { solid: 0, ground: 0, struct: 0, macro: 0 },
        rint(a, b) { return a + Math.floor(rand() * (b - a + 1)); },
        pick(arr) { return arr[Math.floor(rand() * arr.length)]; },
        /** Guarded solid box (y ≥ 1). Refused whole if any footprint cell is protected. */
        box(x0, x1, y0, y1, z0, z1, color) {
            x0 = clamp(x0, -lim, lim); x1 = clamp(x1, -lim, lim);
            z0 = clamp(z0, -lim, lim); z1 = clamp(z1, -lim, lim);
            if (x1 < x0 || z1 < z0 || y1 < y0) return false;
            for (let x = x0; x <= x1; x++)
                for (let z = z0; z <= z1; z++)
                    if (protectedAt(x, z)) return false;
            h.fillBox(map, x0, x1, y0, y1, z0, z1, color);
            ctx.counts.solid += (x1 - x0 + 1) * (z1 - z0 + 1);
            return true;
        },
        pillar(x, z, hgt, color) { return ctx.box(x, x, 1, hgt, z, z, color); },
        /** Ground pattern paint at y = 0 (never collides); still skips door lanes. */
        ground(x0, x1, z0, z1, color) {
            x0 = clamp(x0, -lim, lim); x1 = clamp(x1, -lim, lim);
            z0 = clamp(z0, -lim, lim); z1 = clamp(z1, -lim, lim);
            for (let x = x0; x <= x1; x++)
                for (let z = z0; z <= z1; z++)
                    if (!protectedAt(x, z)) {
                        h.fillBox(map, x, x, 0, 0, z, z, color);
                        ctx.counts.ground++;
                    }
        },
        /** Count one middle-scale structure iff its placement added solid. */
        struct(fn) {
            const before = ctx.counts.solid;
            fn();
            if (ctx.counts.solid > before) ctx.counts.struct++;
        },
        /**
         * Retry a randomized placement until `target` of them actually add solid
         * (bounded), so a screen ringed by door corridors and feature guards
         * still receives its full decorative budget rather than bald patches.
         */
        repeat(target, fn) {
            let ok = 0;
            for (let guard = 0; ok < target && guard < target * 8; guard++) {
                const before = ctx.counts.solid;
                fn();
                if (ctx.counts.solid > before) { ctx.counts.struct++; ok++; }
            }
            return ok;
        },
        /** Count the dominant mass iff it placed. */
        macro(fn) {
            const before = ctx.counts.solid;
            fn();
            if (ctx.counts.solid > before) ctx.counts.macro++;
        },
    };
    return ctx;
}

// ---------------------------------------------------------------------------
// Region grammars. Silhouette identity comes from the height/mass profile:
//   pyre      — one tall central peak (the tallest mass on the map)
//   spindle   — a forest of tall thin pylons (the most tall verticals)
//   sinklands — a shallow basin: raised edge banks, near-flat interior (lowest)
//   bonetown  — a dense rectilinear street grid (the widest footprint)
//   tombfields— processional rows of medium memorial slabs
//   citadel   — long axial roads and repeated facade walls
//   quarry    — stepped excavation terraces
//   cryomire  — flat frozen pools with sparse ice shards
// ---------------------------------------------------------------------------

export const REGION_GRAMMARS = {
    tombfields(g, v) {
        if (v === 'shared') {
            g.macro(() => {
                const mx = g.pick([-15, 15]);
                g.box(mx - 3, mx + 3, 1, 5, -17, -14, C.limestone); // distant mausoleum
                g.box(mx - 4, mx + 4, 1, 2, -18, -13, C.slate);
            });
            for (let lane = 0; lane < 5; lane++) g.struct(() => { // processional lanes
                const lz = -14 + lane * 7;
                for (let x = -18; x <= 18; x += 3) {
                    if (Math.abs(x) < 6) continue;
                    g.box(x, x + 1, 1, 2 + g.rint(0, 1), lz, lz, C.limestone); // leaning slabs
                }
            });
            g.repeat(26, () => // memorial stubs
                g.pillar(g.rint(-19, 19), g.rint(-19, 19), 2 + g.rint(0, 1), C.slate));
            for (let z = -18; z <= 18; z += 4) g.ground(-20, 20, z, z, C.tombMoss); // grave rows
        } else if (v === 'crust') {
            g.repeat(3, () => { // low rib vaults
                const x = g.rint(-14, 14), z = g.rint(-14, 14);
                g.box(x - 1, x + 1, 2, 2, z, z, C.limestone);
                g.pillar(x - 1, z, 2, C.limestone); g.pillar(x + 1, z, 2, C.limestone);
            });
        } else {
            g.repeat(6, () => { // lifted shelves + gold seams
                const x = g.rint(-16, 14), z = g.rint(-16, 14);
                g.box(x, x + 2, 2, 3, z, z + 1, A.charcoal);
                g.ground(x - 1, x + 3, z - 1, z, A.goldVein);
            });
        }
    },

    spindle(g, v) {
        if (v === 'shared') {
            g.macro(() => { // central machine foundation with a tall stack
                g.box(-4, 4, 1, 1, -12, -8, C.iron);
                g.box(-2, 2, 1, 4, -11, -9, C.slate);
            });
            g.repeat(12, () => // pylon forest — the tall vertical read
                g.pillar(g.rint(-19, 19), g.rint(-19, 19), 5 + g.rint(0, 1), C.iron));
            g.repeat(4, () => { // broken gear-tooth rails
                const z = g.rint(-16, 16);
                for (let x = -16; x <= 16; x += 4) g.box(x, x + 1, 1, 2, z, z, C.slate);
            });
            g.repeat(20, () => // cable-trench studs
                g.pillar(g.rint(-19, 19), g.rint(-19, 19), 2, C.slateDark));
            for (let x = -18; x <= 18; x += 6) g.ground(x, x, -20, 20, C.iron); // axial cable lines
        } else if (v === 'crust') {
            g.repeat(3, () => { // stepped foundations
                const x = g.rint(-15, 13), z = g.rint(-15, 13);
                g.box(x, x + 2, 1, 2, z, z + 2, C.slate);
                g.box(x, x + 1, 1, 3, z, z + 1, C.iron);
            });
        } else {
            g.repeat(10, () => { // misregistered duplicate pylons (phase-shifted)
                const x = g.rint(-19, 17), z = g.rint(-19, 17);
                g.pillar(x, z, 4 + g.rint(0, 2), A.violet);
                g.pillar(x + 2, z + 1, 3, A.violetHot); // the duplicate, offset
            });
            for (let x = -16; x <= 16; x += 8) g.box(x, x + 6, 4, 4, 0, 0, A.goldVein); // suspended bars
        }
    },

    sinklands(g, v) {
        if (v === 'shared') {
            g.macro(() => { // raised bank ring — a broad, LOW directional mass
                for (let a = 0; a < 360; a += 15) {
                    const x = Math.round(Math.cos(a * Math.PI / 180) * 17);
                    const z = Math.round(Math.sin(a * Math.PI / 180) * 17);
                    g.box(x - 1, x + 1, 1, 2, z - 1, z + 1, C.clayDark);
                }
            });
            g.repeat(4, () => { // sediment shelves (single course)
                const x = g.rint(-14, 10), z = g.rint(-14, 10);
                g.box(x, x + 4, 1, 2, z, z + 2, C.clay);
            });
            g.repeat(24, () => // dead brush + drainage studs
                g.pillar(g.rint(-18, 18), g.rint(-18, 18), 2, C.rust));
            for (let r = 6; r <= 16; r += 3) { // concentric drainage rings on the ground
                for (let a = 0; a < 360; a += 20) {
                    const x = Math.round(Math.cos(a * Math.PI / 180) * r);
                    const z = Math.round(Math.sin(a * Math.PI / 180) * r);
                    g.ground(x, x, z, z, C.clayField);
                }
            }
        } else if (v === 'crust') {
            g.repeat(4, () => { // wind-carved ribs (short segments — never span a lane)
                const x = g.rint(-16, 8), z = g.rint(-16, 16);
                g.box(x, x + 7, 1, 2, z, z, C.clayDark);
            });
        } else {
            g.repeat(5, () => { // black glass basins + gold contours
                const x = g.rint(-15, 11), z = g.rint(-15, 11);
                g.ground(x, x + 4, z, z + 3, A.basalt);
                g.ground(x, x + 4, z, z, A.goldVein);
                g.box(x, x, 1, 2, z + 3, z + 3, A.charcoal);
            });
        }
    },

    citadel(g, v) {
        if (v === 'shared') {
            g.macro(() => { // grand gate fragment straddling the axis
                g.box(-8, -6, 1, 5, -14, -12, C.floor);
                g.box(6, 8, 1, 5, -14, -12, C.floor);
                g.box(-8, 8, 5, 5, -14, -12, C.goldLeaf);
            });
            g.repeat(3, () => { // repeated facade walls (with a gap)
                const z = g.pick([-16, 14, 16]);
                for (let x = -18; x <= 18; x += 2) {
                    if (Math.abs(x) < 4) continue; // doorway gap keeps the proportion
                    g.box(x, x, 1, 4, z, z, C.floor);
                }
            });
            g.repeat(22, () => // rubble + buttress studs
                g.pillar(g.rint(-19, 19), g.rint(-19, 19), 2 + g.rint(0, 1), C.slate));
            for (let x = -18; x <= 18; x += 9) g.ground(x, x, -20, 20, C.goldLeaf); // gold seams
            g.ground(-20, 20, 0, 0, C.goldLeaf); // the axial road
        } else if (v === 'crust') {
            g.repeat(3, () => { // collapsed facade slabs
                const x = g.rint(-14, 10);
                g.box(x, x + 3, 1, 2, g.rint(-12, 12), 0, C.limestone);
            });
        } else {
            g.repeat(6, () => { // facades hovering in courses
                const x = g.rint(-16, 12), z = g.rint(-16, 12);
                g.box(x, x + 3, 3, 3, z, z, A.charcoal);
                g.box(x, x + 3, 5, 5, z, z, A.violet);
            });
        }
    },

    quarry(g, v) {
        if (v === 'shared') {
            g.macro(() => { // the great stepped cut — nested rims rising outward
                for (let s2 = 0; s2 < 3; s2++) {
                    const e = 15 - s2 * 5, hgt = 2 + s2; // shrinking rim, rising step
                    for (let x = -e; x <= e; x += 1) {
                        g.box(x, x, 1, hgt, -e, -e, C.slate);
                        g.box(x, x, 1, hgt, e, e, C.slate);
                    }
                    for (let z = -e + 1; z < e; z += 1) {
                        g.box(-e, -e, 1, hgt, z, z, C.slate);
                        g.box(e, e, 1, hgt, z, z, C.slate);
                    }
                }
            });
            g.repeat(4, () => { // spoil banks + braces
                const x = g.rint(4, 12), z = g.rint(-12, 12);
                g.box(x, x + 2, 1, 2 + g.rint(0, 1), z, z + 1, C.slateDark);
            });
            g.repeat(22, () => { // fractured boulders
                const x = g.rint(-18, 18), z = g.rint(-18, 18);
                g.box(x, x, 1, 2 + g.rint(0, 1), z, z, C.slate);
            });
            for (let z = -16; z <= 16; z += 5) g.ground(-20, 20, z, z, C.rust); // material bands
        } else if (v === 'crust') {
            g.repeat(4, () => { // rails + hooks (short segments — never span a lane)
                const x = g.rint(-16, 8), z = g.rint(-14, 14);
                g.box(x, x + 7, 1, 2, z, z, C.iron);
            });
        } else {
            g.repeat(5, () => { // cantilevered basalt shelves + red seams
                const x = g.rint(-16, 10), z = g.rint(-14, 12);
                g.box(x, x + 3, 3, 3, z, z + 1, A.basalt);
                g.ground(x, x + 3, z, z + 1, A.magma);
            });
        }
    },

    bonetown(g, v) {
        if (v === 'shared') {
            g.macro(() => { // a great bone arch spanning the main street
                g.box(-2, -2, 1, 5, -14, -12, C.limestone);
                g.box(2, 2, 1, 5, -14, -12, C.limestone);
                g.box(-2, 2, 5, 5, -14, -12, C.ash);
            });
            // Dense street grid of roofless shells — the widest footprint read.
            for (let bx = -18; bx <= 12; bx += 10) g.struct(() => {
                for (let bz = -18; bz <= 12; bz += 10) {
                    g.box(bx, bx + 6, 1, 2, bz, bz, C.ash);         // north wall
                    g.box(bx, bx + 6, 1, 2, bz + 6, bz + 6, C.ash); // south wall
                    g.box(bx, bx, 1, 2, bz, bz + 6, C.ash);         // west wall (east open — doorway)
                }
            });
            g.repeat(20, () => // fences, carts, signage studs
                g.pillar(g.rint(-19, 19), g.rint(-19, 19), 2, C.tombMoss));
            for (let x = -18; x <= 18; x += 3) g.ground(x, x, -20, 20, C.ash); // cobbled streets
        } else if (v === 'crust') {
            g.repeat(3, () => { // bone-arch canopies over streets
                const x = g.rint(-12, 8);
                g.box(x, x + 4, 3, 3, g.rint(-12, 12), 0, C.limestone);
            });
        } else {
            g.repeat(4, () => { // vertebral towers + bone lattice
                const x = g.rint(-16, 14), z = g.rint(-16, 14);
                g.pillar(x, z, 4 + g.rint(0, 1), A.bone);
                g.box(x - 1, x + 1, 4, 4, z, z, A.bone);
            });
        }
    },

    cryomire(g, v) {
        if (v === 'shared') {
            g.macro(() => { // half-buried machine hulk, low and broad
                g.box(-12, -4, 1, 2, 8, 14, A.iceDark);
                g.box(-10, -6, 1, 3, 10, 12, C.iron);
            });
            g.repeat(5, () => { // frozen pools (flat sheets) + reeds
                const x = g.rint(-16, 10), z = g.rint(-16, 10);
                g.ground(x, x + 5, z, z + 4, A.ice);
                g.pillar(x + 1, z + 1, 2, A.iceDark); // reed
            });
            g.repeat(16, () => // sparse ice shards (the only real verticals)
                g.pillar(g.rint(-18, 18), g.rint(-18, 18), 2 + g.rint(0, 1), A.ice));
            for (let i = 0; i < 6; i++) g.ground(-18, 18, g.rint(-16, 16), 0, A.iceDark); // cracks
        } else if (v === 'crust') {
            g.repeat(3, () => { // pipes + half-buried machinery
                const x = g.rint(-14, 10);
                g.box(x, x + 4, 1, 2, g.rint(-12, 12), 0, C.iron);
            });
        } else {
            g.repeat(5, () => { // shattered suspended ice
                const x = g.rint(-15, 13), z = g.rint(-15, 13);
                g.box(x, x + 1, 3, 4, z, z + 1, A.ice);
                g.ground(x, x + 2, z, z + 2, A.sludge);
            });
        }
    },

    pyre(g, v) {
        if (v === 'shared') {
            g.macro(() => { // the single dominant peak — the tallest mass on any screen
                const px = g.pick([-12, 12]), pz = g.pick([-12, 12]);
                for (let s2 = 0; s2 < 5; s2++) {
                    g.box(px - (4 - s2), px + (4 - s2), 1 + s2, 1 + s2, pz - (4 - s2), pz + (4 - s2), C.clayDark);
                }
                g.box(px, px, 6, 9, pz, pz, C.rust); // the summit spire (height 9)
            });
            g.repeat(4, () => { // ascending ridge terraces
                const z = g.rint(-14, 14);
                g.box(-14, 14, 1, 1 + g.rint(1, 2), z, z, C.clayDark);
            });
            g.repeat(22, () => // scattered scoria
                g.pillar(g.rint(-18, 18), g.rint(-18, 18), 2 + g.rint(0, 1), C.rust));
            for (let x = -16; x <= 16; x += 4) g.ground(x, x, -20, 20, C.rust); // magma vein channels
        } else if (v === 'crust') {
            g.repeat(3, () => // vent chimneys
                g.pillar(g.rint(-14, 14), g.rint(-14, 14), 3 + g.rint(0, 1), C.clayDark));
        } else {
            g.repeat(6, () => { // floating embers + broken ascent
                const x = g.rint(-16, 14), z = g.rint(-16, 14);
                g.box(x, x + 1, 3, 3, z, z, A.magma);
                g.ground(x - 1, x + 2, z - 1, z + 1, A.pyre);
            });
        }
    },
};

/** Bake one grammar phase onto `map`. `rand` is a seeded 0..1 generator. */
export function runGrammar(region, variant, rand, s, features, map, h) {
    const g = makeGrammarCtx(map, h, rand, s, features);
    (REGION_GRAMMARS[region] || REGION_GRAMMARS.sinklands)(g, variant);
    return g;
}
