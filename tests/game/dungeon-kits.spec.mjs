// tests/game/dungeon-kits.spec.mjs
// Ticket G / Priority 4 — every beat has a complete, distinct visual kit, and
// applying a kit stamps a floor inlay + wall cap by ONLY recolouring existing
// voxels brighter (no added solids → no collision/nav change; brighter-only →
// a room can never be pushed below its luminance-band floor).

import { KITS, KIT_COUNT, FLOOR_PATTERNS, applyKit } from '../../src/game/levels/dungeon-kits.js';
import { fillBox, shadeHex } from '../../src/voxel/helpers.js';

const BEATS = [
    'beat-01-crypt', 'beat-02-spindle', 'beat-03-sink', 'beat-04-sky', 'beat-05-citadel',
    'beat-06-quarry', 'beat-07-sluice', 'beat-08-bone', 'beat-09-town', 'beat-10-cryo',
    'beat-11-mire', 'beat-12-pyre', 'beat-13-gumoi', 'beat-14-leviathan',
];

function lum(hex) {
    return 0.299 * ((hex >> 16) & 255) + 0.587 * ((hex >> 8) & 255) + 0.114 * (hex & 255);
}

export function run(t) {
    // --- completeness ---
    t.ok('fourteen authored kits', KIT_COUNT === 14, `count=${KIT_COUNT}`);
    let complete = 0;
    for (const id of BEATS) {
        const k = KITS[id];
        if (!k) { t.ok(`kit exists: ${id}`, false); continue; }
        const ok = FLOOR_PATTERNS[k.floorPattern]
            && typeof k.capShade === 'number'
            && typeof k.accent === 'number'
            && Array.isArray(k.structural) && k.structural.length === 2
            && Array.isArray(k.dressing) && k.dressing.length === 2
            && k.emissive && k.atmosphere && k.bossRule;
        if (ok) complete++;
    }
    t.ok('every beat kit is complete', complete === 14, `complete=${complete}/14`);

    // --- distinct floor language ---
    const patterns = new Set(BEATS.map((id) => KITS[id].floorPattern));
    t.ok('floor patterns are varied (≥8 distinct)', patterns.size >= 8, `distinct=${patterns.size}`);

    // Each pattern covers a sane fraction of a room (visible, not overwhelming).
    let coverageOk = 0;
    for (const [name, fn] of Object.entries(FLOOR_PATTERNS)) {
        let hits = 0, total = 0;
        for (let x = -20; x <= 20; x++) for (let z = -20; z <= 20; z++) { total++; if (fn(x, z)) hits++; }
        const frac = hits / total;
        if (frac >= 0.03 && frac <= 0.6) coverageOk++;
        else t.ok(`pattern coverage sane: ${name}`, false, `frac=${frac.toFixed(3)}`);
    }
    t.ok('all floor patterns have sane coverage', coverageOk === Object.keys(FLOOR_PATTERNS).length);

    // --- applyKit only recolours brighter, adds no voxels ---
    function sampleMap() {
        const m = new Map();
        fillBox(m, -12, 12, 0, 0, -12, 12, 0x606060);       // floor
        fillBox(m, -12, 12, 1, 4, -12, -12, 0x505050);       // one wall (y 1..4)
        return m;
    }
    const room = { half: 13, wallH: 4 };
    const base = sampleMap();
    const before = new Map(base);
    applyKit(base, KITS['beat-05-citadel'], room);

    // Same key set (no added/removed voxels).
    t.ok('applyKit adds no voxels', base.size === before.size, `after=${base.size} before=${before.size}`);
    let solidsChanged = false, capBrighter = 0, inlayBrighter = 0, dimmed = 0;
    for (const [k, after] of base) {
        const [x, y] = k.split(',').map(Number);
        const bef = before.get(k);
        if (y >= 1 && y < 4 && after !== bef) solidsChanged = true; // mid-wall untouched
        if (after !== bef) {
            if (lum(after) < lum(bef) - 0.5) dimmed++;
            if (y === 0 && lum(after) > lum(bef)) inlayBrighter++;
            if (y === 4 && lum(after) > lum(bef)) capBrighter++;
        }
    }
    t.ok('mid-wall voxels are untouched', !solidsChanged);
    t.ok('floor inlay cells brightened', inlayBrighter > 0, `n=${inlayBrighter}`);
    t.ok('wall-cap course brightened', capBrighter > 0, `n=${capBrighter}`);
    t.ok('no recoloured cell is dimmed', dimmed === 0, `dimmed=${dimmed}`);

    // Determinism.
    const a = sampleMap(); const b = sampleMap();
    applyKit(a, KITS['beat-10-cryo'], room);
    applyKit(b, KITS['beat-10-cryo'], room);
    let identical = true;
    for (const [k, v] of a) if (b.get(k) !== v) identical = false;
    t.ok('applyKit is deterministic', identical);

    // No-op safety.
    const untouched = sampleMap();
    const snap = new Map(untouched);
    applyKit(untouched, undefined, room);
    let same = untouched.size === snap.size;
    for (const [k, v] of untouched) if (snap.get(k) !== v) same = false;
    t.ok('applyKit no-ops without a kit', same);

    void shadeHex; // (imported to document the brightening primitive kits use)
}
