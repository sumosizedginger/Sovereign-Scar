// tests/qa/easter-eggs.mjs — did the props land somewhere a player can use?
//
//   node tests/qa/easter-eggs.mjs
//
// Print-only, no browser. Bakes each of the three screens that carry a relic or
// an easter egg and asks three questions about the world that was actually
// built — not about the table that says where things should go.
//
// WHY A PROBE AND NOT ONLY A SPEC
//
// A spec can hold the placement table against its own rules all day: offsets
// inside the protected radius, a real skin id, a screen in the right region.
// None of that is the question. The question is what the GRAMMAR did around the
// prop after the table was read, and the grammar is seeded per screen, runs
// before `onBake`, and does not know the prop exists except through the feature
// anchor it was handed.
//
// This repository's most expensive recurring bug is a survey that measured the
// wrong thing (`docs/EASTER-EGGS.md` and the memory index both carry the list).
// Three of the specific traps apply here and each has its own column below:
//
//   BURIED — dressing placed into a finished room has buried a small key, a
//   boss key and a suture before. The feature anchor is supposed to stop that.
//   `mass` counts terrain cells standing inside the prop's own footprint.
//
//   UNREACHABLE — "a free cell is not a body that fits", and separately "ground
//   is not permission". `reach` floods from the screen spawn with the body's
//   real step limit and reports whether the interact radius is inside it. A
//   dragon you can see and cannot walk to is a screenshot.
//
//   TOO LOW TO WALK UNDER — the dragon's ribs arch over the road on purpose, so
//   the arch is a claim about clearance. `head` measures the actual gap under
//   the ribcage against the hero's real standing height.
//
// None of these are gates. What they are for is noticing when a number moves.

import * as THREE from 'three';
import { CollisionWorld } from '../../src/engine/collision.js';
import { LEVELS } from '../../src/game/levels/registry.js';
import { patchOverworld } from '../../src/game/world/keys.js';
import {
    placedRelics, RELIC_REACH, RELIC_MAX_OFFSET, RIBCAGE_X,
} from '../../src/game/world/relics.js';
import {
    WELL_SCREEN, MINER_SCREEN, WELL_AT, MINER_AT, WELL_REACH,
} from '../../src/game/world/easter-eggs.js';

/** `MAX_STEP_HEIGHT` in voxel-physics-body.js. */
const WALK_STEP = 1;
/** The hero stands 1.95. Anything lower than this is a duck, and there is no duck. */
const HERO_HEIGHT = 1.95;

function keyStoreStub() {
    const open = new Set();
    return {
        isOpen: (id) => open.has(id), open: (id) => open.add(id),
        mapPickup: () => false, takeMapPickup() {},
        isPickupTaken: () => false, takePickup() {},
        visited: () => [], visit() {},
    };
}

/** Bake one overworld screen by telling the save that is where we are. */
function bakeScreen(screen) {
    patchOverworld({ pos: { world: 'overworld', screen, x: 0, z: 0 }, visited: [screen] });
    const scene = new THREE.Scene();
    const entry = LEVELS.find((l) => l.id === 'overworld');
    const level = entry.load(
        { scene, collisionWorld: new CollisionWorld(), particles: null },
        { keyStore: keyStoreStub() },
    );
    return { level, scene, origin: level.currentRoomOrigin() };
}

/** Surface height of a cell, bottom-up — the floor you stand on, not the roof. */
function surfaceAt(level, x, z) {
    for (let y = 1; y <= 10; y++) {
        if (!level.getVoxelAt(x, y - 0.5, z)) continue;
        if (level.getVoxelAt(x, y + 0.5, z)) continue;
        if (level.getVoxelAt(x, y + 1.5, z)) continue;
        return y;
    }
    return null;
}

/** Cells inside `r` of (cx,cz) that carry terrain above the floor. */
function massWithin(level, origin, cx, cz, r) {
    let n = 0;
    const R = Math.ceil(r);
    for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
            if (Math.hypot(dx, dz) > r) continue;
            const y = surfaceAt(level, origin.x + cx + dx + 0.5, origin.z + cz + dz + 0.5);
            if (y != null && y > 1) n++;
        }
    }
    return n;
}

/** Can the player walk from the screen spawn to within `reach` of (cx,cz)? */
function reachable(level, origin, half, cx, cz, reach) {
    const height = new Map();
    const H = half - 1;
    for (let dx = -H; dx <= H; dx++) {
        for (let dz = -H; dz <= H; dz++) {
            const y = surfaceAt(level, origin.x + dx + 0.5, origin.z + dz + 0.5);
            if (y != null) height.set(`${dx},${dz}`, y);
        }
    }
    const sx = Math.round((level.spawn?.x ?? origin.x) - origin.x);
    const sz = Math.round((level.spawn?.z ?? origin.z) - origin.z);
    let seed = `${sx},${sz}`;
    if (!height.has(seed)) {
        // The spawn can land on a cell the surface scan refuses. Fall back to
        // the nearest cell that exists rather than reporting the whole screen
        // unreachable, which is a statement about the probe, not the world.
        let best = Infinity;
        for (const k of height.keys()) {
            const [a, b] = k.split(',').map(Number);
            const d = Math.hypot(a - sx, b - sz);
            if (d < best) { best = d; seed = k; }
        }
    }
    const seen = new Set([seed]);
    const q = [seed];
    while (q.length) {
        const k = q.pop();
        const [x, z] = k.split(',').map(Number);
        const y = height.get(k);
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nk = `${x + ox},${z + oz}`;
            if (seen.has(nk) || !height.has(nk)) continue;
            if (Math.abs(height.get(nk) - y) > WALK_STEP) continue;
            seen.add(nk);
            q.push(nk);
        }
    }
    let best = Infinity;
    for (const k of seen) {
        const [x, z] = k.split(',').map(Number);
        best = Math.min(best, Math.hypot(x - cx, z - cz));
    }
    return { nearest: best, ok: best <= reach };
}

/**
 * Lowest point of the prop's mesh above the floor, sampled along the walk line.
 *
 * Measured off the REAL meshes rather than off the numbers that placed them.
 * A rib whose arch is computed one way and drawn another is exactly the failure
 * this repository has shipped five times, and reading the source geometry is
 * the only thing that catches it.
 */
function headroomUnder(group, span = RIBCAGE_X) {
    if (!group) return null;
    const box = new THREE.Box3();
    let lowestOverhead = Infinity;
    group.updateMatrixWorld(true);
    // WORLD BOXES, LOCAL QUESTIONS. `setFromObject` returns world coordinates,
    // and the prop stands at a screen origin thousands of units from zero — so
    // testing `box.min.z > 0.5` against a world z of -24 silently rejected
    // every rib and the function returned null. The prop's own position is the
    // frame every one of these tests actually means.
    const o0 = group.position;
    group.traverse((o) => {
        if (!o.isMesh) return;
        box.setFromObject(o);
        const zMin = box.min.z - o0.z, zMax = box.max.z - o0.z;
        const xMid = (box.min.x + box.max.x) / 2 - o0.x;
        const yMin = box.min.y - o0.y;
        // Only pieces that actually span the walk line matter — a rib that
        // stops beside the road is not something you walk under.
        if (zMin > 0.5 || zMax < -0.5) return;
        // ONLY ACROSS THE RIBCAGE, and the span comes from the model rather
        // than from a number typed here. The first version swept the whole
        // prop and reported 1.18 — which was the TAIL, a thing lying on the
        // ground that nobody walks under. Measuring the wrong span turns a
        // correct arch into a defect report, which is the mirror of the bug
        // this file exists to catch.
        if (xMid < span.from - 0.6 || xMid > span.to + 0.6) return;
        // A piece resting ON the ground is not overhead; it is scenery beside
        // you. Only count what has clear air beneath it.
        if (yMin < 0.6) return;
        lowestOverhead = Math.min(lowestOverhead, yMin);
    });
    return Number.isFinite(lowestOverhead) ? lowestOverhead : null;
}

const rows = [];
const notes = [];

/**
 * The radius `world7.js` publishes as the relic's feature anchor.
 *
 * `mass` inside RELIC_MAX_OFFSET asks whether the PROP is buried. This asks the
 * different and stricter question the anchor exists to answer: is the ground
 * the player walks up to the thing across actually clear? Terracing and the
 * grammar are both supposed to refuse inside it.
 */
const ANCHOR_R = 7;

for (const relic of placedRelics()) {
    const { level, scene, origin } = bakeScreen(relic.screen);
    const group = scene.getObjectByName(relic.id);
    const half = level.halfSize || 23;
    const mass = massWithin(level, origin, relic.x, relic.z, RELIC_MAX_OFFSET);
    const anchorMass = massWithin(level, origin, relic.x, relic.z, ANCHOR_R);
    const reach = reachable(level, origin, half, relic.x, relic.z, RELIC_REACH);
    // ONLY PROPS THAT CLAIM AN ARCH GET MEASURED FOR ONE.
    //
    // `headroomUnder` was written for the dragon and defaults to the dragon's
    // own ribcage span. Run over every relic it dutifully reported that a
    // throne, a house and a block of ice all "fail" to clear a standing hero,
    // which is true and meaningless: nobody is meant to walk under a chair.
    // A claim nobody made cannot be broken, and a probe that invents claims
    // teaches people to ignore it.
    const head = relic.walkUnder ? headroomUnder(group, relic.walkUnder) : null;
    rows.push({
        what: `relic ${relic.region}`, screen: relic.screen, built: !!group,
        offset: Math.hypot(relic.x, relic.z), mass, anchorMass, reach, head,
    });
    if (!group) notes.push(`relic ${relic.id}: NOT IN THE SCENE`);
    if (head != null && head < HERO_HEIGHT) {
        notes.push(`relic ${relic.id}: arch clears ${head.toFixed(2)} — the hero is ${HERO_HEIGHT}`);
    }
    if (anchorMass > 0) {
        notes.push(`relic ${relic.id}: ${anchorMass} raised cell(s) inside the radius-${ANCHOR_R} anchor`);
    }
}

for (const [what, screen, at, reachR] of [
    ['the dry well', WELL_SCREEN, WELL_AT, WELL_REACH],
    ['the miner', MINER_SCREEN, MINER_AT, 2.4],
]) {
    const { level, scene, origin } = bakeScreen(screen);
    const name = what === 'the dry well' ? 'egg:well' : 'egg:miner';
    const group = scene.getObjectByName(name);
    const half = level.halfSize || 23;
    rows.push({
        what, screen, built: !!group,
        offset: Math.hypot(at.x, at.z),
        mass: massWithin(level, origin, at.x, at.z, 2.5),
        anchorMass: null,
        reach: reachable(level, origin, half, at.x, at.z, reachR),
        head: null,
    });
    if (!group) notes.push(`${what}: NOT IN THE SCENE`);
}

console.log('what                screen   built  offset   mass  anchor  nearest-walkable  headroom');
console.log('-'.repeat(88));
for (const r of rows) {
    console.log(
        r.what.padEnd(19)
        + ` ${r.screen.padEnd(8)}`
        + ` ${(r.built ? 'yes' : 'NO ').padEnd(6)}`
        + ` ${r.offset.toFixed(2).padStart(6)}`
        + ` ${String(r.mass).padStart(6)}`
        + ` ${(r.anchorMass == null ? '—' : String(r.anchorMass)).padStart(6)}`
        + ` ${(r.reach.ok ? r.reach.nearest.toFixed(2) : `${r.reach.nearest.toFixed(2)} CUT OFF`).padStart(17)}`
        + ` ${(r.head == null ? '—' : r.head.toFixed(2)).padStart(9)}`,
    );
}
console.log('-'.repeat(88));
for (const r of rows) {
    if (!r.reach.ok) notes.push(`${r.what}: nearest walkable cell is ${r.reach.nearest.toFixed(2)} away`);
    if (r.offset > RELIC_MAX_OFFSET) notes.push(`${r.what}: sits ${r.offset.toFixed(2)} from centre, past ${RELIC_MAX_OFFSET}`);
}
if (notes.length) {
    console.log('\nPROBLEMS');
    for (const n of notes) console.log(`  ${n}`);
} else {
    console.log('\nEvery prop is in the scene, standing in clear ground, and walkable to.');
}
console.log('\n`mass` counts terrain cells raised above the floor inside the prop\'s');
console.log('footprint — the feature anchor in world7.js is what keeps it at zero.');
console.log('`headroom` is measured off the built meshes, never off the numbers');
console.log('that placed them: the arch is a claim about clearance and this is the');
console.log('only thing that checks the claim against the geometry.');
