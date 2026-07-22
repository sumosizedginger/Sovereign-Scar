// tests/game/overworld-grammar.spec.mjs
// Ticket E — regional overworld reconstruction. Bakes every generated screen's
// terrain (both mirror states) onto a bare voxel map and proves:
//   - each region has a distinct grayscale silhouette signature (height/mass);
//   - Crust and Abyss differ in spatial FORM, not merely palette;
//   - every screen keeps a clear route from spawn to each connected door;
//   - spawn, entrances, and secret/suture/chain anchors stay unbuilt;
//   - decorative richness lands in a sane band (draw/triangle budget proxy).

import {
    WORLD7, regionOf, SECRETS, OVERWORLD_SUTURES, CHAIN_PROPS,
} from '../../src/game/overworld/world7.js';
import { fillBox } from '../../src/voxel/helpers.js';
import { CRUST_COLORS, ABYSS_COLORS } from '../../src/game/assets/palettes.js';

const HALF = 23;
const LIM = HALF - 2;
const H = { fillBox, CRUST_COLORS, ABYSS_COLORS, half: HALF };
const HAND = new Set(['scarfield', 'ridge', 'flats', 'sink']);

// Bake `shared` then the state-only phase onto one fresh map.
function bake(s, state) {
    const map = new Map();
    if (s.build) s.build(map, H);
    const variant = state === 'abyss' ? s.abyss : s.crust;
    if (variant?.build) variant.build(map, H);
    return map;
}

// Column height map, solid voxel set, and ground-cell count from a voxel map.
function analyze(map) {
    const colH = new Map();       // "x,z" -> tallest solid y (y>=1)
    const solidKeys = new Set();  // "x,y,z" for y>=1 (full built massing)
    let ground = 0;
    for (const key of map.keys()) {
        const [x, y, z] = key.split(',').map(Number);
        if (y === 0) { ground++; continue; }
        solidKeys.add(key);
        const ck = x + ',' + z;
        if (y > (colH.get(ck) || 0)) colH.set(ck, y);
    }
    let maxH = 0;
    for (const h of colH.values()) if (h > maxH) maxH = h;
    // Isolated spires: a tall (≥5) column whose orthogonal neighbours are almost
    // all short (≤2 tall). This isolates a pylon forest (spindle) from a broad
    // tall block (a mausoleum, a gate, a terraced peak), which share raw height.
    let spires = 0;
    for (const [ck, h] of colH) {
        if (h < 5) continue;
        const [x, z] = ck.split(',').map(Number);
        let tallN = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if ((colH.get((x + dx) + ',' + (z + dz)) || 0) >= 3) tallN++;
        }
        if (tallN <= 1) spires++;
    }
    return { colH, solidKeys, solidCols: colH.size, maxH, spires, ground };
}

// Solid at footprint (x,z)? (any y>=1)
function solidAt(colH, x, z) { return colH.has(x + ',' + z); }

// BFS over walkable footprint cells in [-LIM,LIM]; returns the reachable set.
function reachable(colH, sx, sz) {
    const seen = new Set();
    const q = [[sx, sz]];
    seen.add(sx + ',' + sz);
    while (q.length) {
        const [x, z] = q.pop();
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx < -LIM || nx > LIM || nz < -LIM || nz > LIM) continue;
            const k = nx + ',' + nz;
            if (seen.has(k) || solidAt(colH, nx, nz)) continue;
            seen.add(k);
            q.push([nx, nz]);
        }
    }
    return seen;
}

// The interior cell facing each open edge (just inside the border gap).
function doorCells(s) {
    const out = [];
    for (const e of s.edges || []) {
        const at = e.at || 0;
        if (e.side === 'E') out.push([LIM, at]);
        else if (e.side === 'W') out.push([-LIM, at]);
        else if (e.side === 'S') out.push([at, LIM]);
        else if (e.side === 'N') out.push([at, -LIM]);
    }
    return out;
}

function symDiff(aCols, bCols) {
    let d = 0;
    for (const k of aCols.keys()) if (!bCols.has(k)) d++;
    for (const k of bCols.keys()) if (!aCols.has(k)) d++;
    return d;
}

export function run(t) {
    // Region aggregates for the cross-region silhouette discriminators.
    const reg = {}; // region -> { maxH, minMaxH, tallCols, solidCols }
    let screens = 0;
    let routeFails = 0, spawnFails = 0, featureFails = 0, formSame = 0;
    let richFloor = 0, richCeil = 0, groundFail = 0;
    let worstDiff = Infinity, minRich = Infinity, maxRich = 0;

    for (const [sid, s] of Object.entries(WORLD7.screens)) {
        if (HAND.has(sid) || !s.crust?.build) continue; // skip hand-authored gates
        const m = /^r(\d+)c(\d+)$/.exec(sid);
        const region = m ? regionOf(+m[1], +m[2]) : 'sinklands';
        screens++;

        const crust = analyze(bake(s, 'crust'));
        const abyss = analyze(bake(s, 'abyss'));

        // Decorative richness band (per state) — draw/triangle budget proxy.
        for (const a of [crust, abyss]) {
            minRich = Math.min(minRich, a.solidCols);
            maxRich = Math.max(maxRich, a.solidCols);
            if (a.solidCols < 18) richFloor++;
            if (a.solidCols > 480) richCeil++;
            if (a.ground < 15) groundFail++;
        }

        // Spawn stays walkable.
        if (solidAt(crust.colH, 0, 0) || solidAt(abyss.colH, 0, 0)) spawnFails++;

        // Every connected door reachable from spawn (both states).
        for (const a of [crust, abyss]) {
            const seen = reachable(a.colH, 0, 0);
            for (const [dx, dz] of doorCells(s)) {
                if (!seen.has(dx + ',' + dz)) routeFails++;
            }
        }

        // Feature anchors (secret/suture/chain) must stay unbuilt so the pickup
        // or prop the onBake hook drops there is never buried in terrain.
        for (const table of [SECRETS, OVERWORLD_SUTURES, CHAIN_PROPS]) {
            const f = table[sid];
            if (!f) continue;
            if (solidAt(crust.colH, f.x, f.z) || solidAt(abyss.colH, f.x, f.z)) featureFails++;
        }

        // Crust vs Abyss must differ in FORM — compare the full solid voxel sets
        // (massing + height), not just which columns are occupied.
        const d = symDiff(crust.solidKeys, abyss.solidKeys);
        worstDiff = Math.min(worstDiff, d);
        if (d < 6) formSame++;

        // Aggregate silhouette signature per region (use the crust bake).
        const r = reg[region] || (reg[region] = { maxH: 0, minMaxH: Infinity, spires: 0, solidCols: 0 });
        r.maxH = Math.max(r.maxH, crust.maxH);
        r.minMaxH = Math.min(r.minMaxH, crust.maxH);
        r.spires = Math.max(r.spires, crust.spires);
        r.solidCols = Math.max(r.solidCols, crust.solidCols);
    }

    t.ok('generated every non-hand screen', screens >= 40, `screens=${screens}`);
    t.ok('spawn cell always walkable', spawnFails === 0, `fails=${spawnFails}`);
    t.ok('every connected door reachable from spawn', routeFails === 0, `fails=${routeFails}`);
    t.ok('secret/suture/chain anchors stay unbuilt', featureFails === 0, `fails=${featureFails}`);
    t.ok('decorative richness floor met (≥18 cols)', richFloor === 0, `under=${richFloor}, min=${minRich}`);
    t.ok('decorative richness ceiling held (≤480 cols)', richCeil === 0, `over=${richCeil}, max=${maxRich}`);
    t.ok('ground pattern present on every screen', groundFail === 0, `fails=${groundFail}`);
    t.ok('Crust and Abyss differ in form on every screen', formSame === 0,
        `same=${formSame}, worstDiff=${worstDiff}`);

    // --- cross-region silhouette identity ---
    const R = reg;
    const regions = Object.keys(R);
    t.ok('all eight regions represented', regions.length === 8, regions.join(','));

    const maxHOf = (name) => R[name]?.maxH ?? 0;
    const others = (name) => regions.filter((k) => k !== name);

    // Pyre owns the single tallest mass.
    t.ok('pyre has the tallest silhouette (peak ≥ 8)', maxHOf('pyre') >= 8, `h=${maxHOf('pyre')}`);
    t.ok('pyre is strictly taller than every other region',
        others('pyre').every((k) => maxHOf('pyre') > maxHOf(k)),
        others('pyre').map((k) => `${k}=${maxHOf(k)}`).join(' '));

    // Sinklands is the flattest region.
    t.ok('sinklands reads as a shallow basin (≤ 2)', R.sinklands.minMaxH <= 2,
        `minMaxH=${R.sinklands.minMaxH}`);
    t.ok('every other region rises above the sinklands basin',
        others('sinklands').every((k) => R[k].maxH >= 3),
        others('sinklands').map((k) => `${k}=${R[k].maxH}`).join(' '));

    // Spindle is the most vertical — a forest of isolated pylons.
    t.ok('spindle has the most isolated pylons',
        others('spindle').every((k) => R.spindle.spires > R[k].spires),
        `spindle=${R.spindle.spires} ` + others('spindle').map((k) => `${k}=${R[k].spires}`).join(' '));

    // Bonetown is the densest footprint (street grid).
    t.ok('bonetown has the widest footprint',
        others('bonetown').every((k) => R.bonetown.solidCols > R[k].solidCols),
        `bonetown=${R.bonetown.solidCols} ` + others('bonetown').map((k) => `${k}=${R[k].solidCols}`).join(' '));
}
