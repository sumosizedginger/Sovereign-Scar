// tests/qa/rise-reach.mjs — can the player stand on the ground they can see?
//
//   node tests/qa/rise-reach.mjs [level-id]
//
// Print-only, no browser. Bakes every level, computes the surface height of
// every cell, floods from the room's centre with the body's REAL step limit,
// and reports raised ground that is cut off from the rest of the room.
//
// WHY THIS EXISTS. Reported from play, on the overworld: *"if these pieces of
// land are of equal height, shouldn't I be able to walk on them? I can't as of
// now."* Measured on the start screen: 2025 standable cells, 2006 reachable,
// **19 raised cells cut off** — two flat-topped masses at heights 3 and 4 on a
// floor at height 1.
//
// They were grammar masses (`g.box(x, x+2, 2, 3, ...)`), not terraces, and they
// predate the relief pass. That is exactly why this is worth a probe rather
// than a one-off fix: a two-cell mass with a flat top, in the same rock as the
// ground, at a height the eye reads as a step, is a thing a player walks up to
// and tries to stand on — and nothing in the suite was asking.
//
// THE DIFFERENCE FROM `door-reach` AND FRIENDS. Those ask whether the ROUTE
// works: can you get from this door to that one, is the key reachable, is the
// spawn safe. All of them can be perfectly green while a third of the visible
// ground is scenery you bounce off. This one asks about the ground itself.
//
// It is not a gate and it should not become one without a decision: some
// unreachable height is legitimate — a cliff, a tower, the top of a wall. What
// it is for is noticing when that number MOVES.

import * as THREE from 'three';
import { CollisionWorld } from '../../src/engine/collision.js';
import { createDungeon, ROOM_STRIDE } from '../../src/game/world/room-graph.js';
import { LEVELS } from '../../src/game/levels/registry.js';
import { BEAT_LIST } from '../game/_beat-defs.mjs';

/** `MAX_STEP_HEIGHT` in voxel-physics-body.js — how high the body climbs. */
const WALK_STEP = 1;
const ONLY = process.argv[2] || null;

function keyStoreStub() {
    const open = new Set();
    return {
        isOpen: (id) => open.has(id), open: (id) => open.add(id),
        mapPickup: () => false, takeMapPickup() {},
        isPickupTaken: () => false, takePickup() {},
        visited: () => [], visit() {},
    };
}

/**
 * Reachability of the standable surface of one room.
 *
 * Bottom-up per column, matching `walkableCells`: the lowest surface with a
 * body's worth of room above it is the floor you stand on, not the highest
 * thing in the column. Getting that backwards makes every roof look like floor.
 */
function auditRoom(level, ox, oz, half, room) {
    const surf = (x, z) => {
        for (let y = 1; y <= 10; y++) {
            if (!level.getVoxelAt(x, y - 0.5, z)) continue;
            if (level.getVoxelAt(x, y + 0.5, z)) continue;
            if (level.getVoxelAt(x, y + 1.5, z)) continue;
            return y;
        }
        return null;
    };
    const H = half - 1;
    const height = new Map();
    for (let dx = -H; dx <= H; dx++) {
        for (let dz = -H; dz <= H; dz++) {
            const y = surf(ox + dx + 0.5, oz + dz + 0.5);
            if (y != null) height.set(`${dx},${dz}`, y);
        }
    }
    if (!height.size) return null;

    // SEEDED WHERE THE PLAYER ACTUALLY ARRIVES — the spawn and every door
    // threshold — not at the room's centre.
    //
    // The first version of this seeded (0,0) and reported 2130 cut-off cells
    // across the campaign, which was mostly its own fault: in a small dungeon
    // room the centre can be inside a prop or a vault, so the flood started
    // nowhere and called the whole room unreachable. `ashgallery` came back
    // "25 of 225 reached", which is not a room anybody has ever played.
    //
    // Merging every seed is right HERE and would be wrong for a connectivity
    // question. The question this probe asks is "can the player get onto this
    // ground", and the player may arrive through any of the room's doors — so
    // every door is a legitimate start. Asking instead whether the doors reach
    // EACH OTHER is a different question, and one that must never merge its
    // seeds, because each door trivially reaches itself.
    const seeds = [];
    const push = (x, z) => {
        const k = `${Math.round(x)},${Math.round(z)}`;
        if (height.has(k)) seeds.push(k);
    };
    if (room?.spawn) push(room.spawn.x || 0, room.spawn.z || 0);
    for (const door of room?.doors || []) {
        const w = door.width || 2;
        for (let i = 0; i < w; i++) {
            const c = door.at - Math.floor(w / 2) + i;
            const inward = door.side === 'N' ? { x: c, z: -half + 2 }
                : door.side === 'S' ? { x: c, z: half - 2 }
                    : door.side === 'W' ? { x: -half + 2, z: c } : { x: half - 2, z: c };
            push(inward.x, inward.z);
        }
    }
    push(0, 0);
    if (!seeds.length) {
        let best = Infinity, k0 = null;
        for (const k of height.keys()) {
            const p = k.split(',');
            const d = Math.hypot(+p[0], +p[1]);
            if (d < best) { best = d; k0 = k; }
        }
        if (k0) seeds.push(k0);
    }
    if (!seeds.length) return null;
    const seen = new Set(seeds);
    const q = [...seeds];
    while (q.length) {
        const k = q.pop();
        const p = k.split(',');
        const x = +p[0], z = +p[1], y = height.get(k);
        for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nk = `${x + d[0]},${z + d[1]}`;
            if (seen.has(nk) || !height.has(nk)) continue;
            if (Math.abs(height.get(nk) - y) > WALK_STEP) continue;
            seen.add(nk);
            q.push(nk);
        }
    }
    let raised = 0, cut = 0;
    const worst = new Map();
    for (const [k, y] of height) {
        if (y <= 1) continue;
        raised++;
        if (seen.has(k)) continue;
        cut++;
        worst.set(`h=${y}`, (worst.get(`h=${y}`) || 0) + 1);
    }
    return { cells: height.size, reached: seen.size, raised, cut, worst };
}

const targets = [];
for (const def of BEAT_LIST) targets.push({ id: def.id, def });
const owEntry = LEVELS.find((l) => l.id === 'overworld');

console.log('level                room            cells  reached  raised   CUT OFF  heights');
console.log('-'.repeat(84));
let totalCut = 0, totalRaised = 0;

for (const { id, def } of targets) {
    if (ONLY && id !== ONLY) continue;
    let level;
    try {
        level = createDungeon(
            { scene: new THREE.Scene(), collisionWorld: new CollisionWorld(), particles: null },
            { ...def, prebake: true }, { keyStore: keyStoreStub() },
        );
    } catch (e) { console.log(`${id}: BAKE FAILED ${e.message}`); continue; }
    for (const [rid, room] of Object.entries(def.rooms)) {
        const r = auditRoom(level, (room.grid?.[0] || 0) * ROOM_STRIDE,
            (room.grid?.[1] || 0) * ROOM_STRIDE, room.half, room);
        if (!r) continue;
        totalCut += r.cut;
        totalRaised += r.raised;
        if (!r.cut) continue;
        console.log(`${id.replace('beat-', '').padEnd(20)} ${rid.padEnd(15)} `
            + `${String(r.cells).padStart(5)} ${String(r.reached).padStart(8)} `
            + `${String(r.raised).padStart(7)} ${String(r.cut).padStart(9)}   `
            + [...r.worst.entries()].map(([h, n]) => `${h}x${n}`).join(' '));
    }
}

if (!ONLY || ONLY === 'overworld') {
    try {
        const level = owEntry.load(
            { scene: new THREE.Scene(), collisionWorld: new CollisionWorld(), particles: null },
            { keyStore: keyStoreStub() },
        );
        const o = level.currentRoomOrigin();
        const r = auditRoom(level, o.x, o.z, level.halfSize || 23, null);
        if (r) {
            totalCut += r.cut;
            totalRaised += r.raised;
            console.log(`${'overworld'.padEnd(20)} ${'(start screen)'.padEnd(15)} `
                + `${String(r.cells).padStart(5)} ${String(r.reached).padStart(8)} `
                + `${String(r.raised).padStart(7)} ${String(r.cut).padStart(9)}   `
                + [...r.worst.entries()].map(([h, n]) => `${h}x${n}`).join(' '));
        }
    } catch (e) { console.log(`overworld: BAKE FAILED ${e.message}`); }
}

console.log('-'.repeat(84));
console.log(`raised cells ${totalRaised}   CUT OFF ${totalCut}`);
console.log('\nOnly rooms with cut-off ground are listed. The overworld samples the');
console.log('START screen only — the other 48 bake per visit and cannot be reached');
console.log('headlessly; `tests/qa/overworld-lum.mjs` drives those through a browser.');
