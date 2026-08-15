// You come through a door. Are you standing somewhere you can stand?
//
//   node tests/qa/entry-safety.mjs
//
// The owner, fourth report, on the same class of bug: "I spawned under the
// ground due to the raised land right next to the entrance" and "I became stuck
// on a raised area when I entered the room from the east side."
//
// WHY THE LAST FIX WAS NOT ENOUGH
//
// `surfaceTop` answers "is there a solid here with head room above it?" It never
// asks "may the player's body be at this (x,z) AT ALL?" `CollisionWorld` answers
// that one, and it is height-blind by design — `blocked()` has no Y anywhere. So
// a column registered as an XZ solid stops the body at EVERY height, and the top
// of a perimeter wall or an authored slab sails through `standable()`,
// `nearestFreeEntry` returns it, and the player is stood on a roof they can
// never walk off.
//
// Terraces are not implicated: `terraceRoom` writes into the PLATFORM map, which
// `bakeRoom` meshes with a null collision world, so no terrace of any height is
// ever a solid. This probe must keep reporting them clean.
//
// It also sweeps the OTHER HALF. Last session fixed the height at exactly one of
// seven placement sites; `respawnPoint()` still calls `standable()`, computes a
// real surface top, and then returns a hardcoded 1.95.
//
// All 14 dungeons AND the overworld, because the overworld is a room-graph level
// too and the owner's first report was on one of its screens.
//
// Print-only. Not a gate.

import * as THREE from 'three';
import { createDungeon, ROOM_STRIDE } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { BEAT_LIST } from '../game/_beat-defs.mjs';

const BODY = 0.4;      // player half-extent (player.js: extents.x)
const RISE = 0.95;     // player half-height; rig.y = surfaceTop + RISE
const HEAD = 1.9;      // full body height

// A copy of room-graph's `SIDE_NORMAL` used to live here, under a comment
// warning that the two must never disagree. Both were left behind when this
// probe stopped deriving arrival points and started asking `level.arrivalPoint`
// for them (see the note further down) — so the constant was dead and the
// warning described a calculation the probe no longer does. Found by the
// linter. A comment about code that isn't there is worse than no comment.

function keyStoreStub() {
    const open = new Set();
    return {
        isOpen: (id) => open.has(id), open: (id) => open.add(id),
        mapPickup: () => false, takeMapPickup() {},
        isPickupTaken: () => false, takePickup() {},
        visited: () => [], visit() {},
        markMapPickup() {},
    };
}

/** The game's own scan, copied so the probe can run it on any point. */
function surfaceTop(level, x, z) {
    for (let top = 1; top <= 8; top++) {
        if (!level.getVoxelAt(x, top - 0.5, z)) continue;
        if (level.getVoxelAt(x, top + 0.5, z)) continue;
        if (level.getVoxelAt(x, top + 1.5, z)) continue;
        return top;
    }
    return null;
}

/**
 * Verdict on one arrival point, judged the way the player experiences it.
 *
 * `blocked` is the important one and it is deliberately the collision world's
 * own answer, at the real body width — not a voxel sample. A point test cannot
 * see that a body centred on a cell seam overlaps the solid in the NEXT cell,
 * and every door in the game lands on a seam.
 */
function judge(level, cw, x, z, y) {
    const feet = y - RISE;
    const flags = [];
    if (cw.blocked(x, z, BODY)) flags.push('BODY-IN-SOLID');
    for (const dy of [0.5, 1.5]) {
        if (feet + dy < feet + HEAD && level.getVoxelAt(x, feet + dy, z)) {
            flags.push('BURIED'); break;
        }
    }
    const top = surfaceTop(level, x, z);
    if (top == null) flags.push('NO-GROUND');
    else if (Math.abs(feet - top) > 0.01) flags.push(`WRONG-HEIGHT(feet ${feet.toFixed(2)} vs ground ${top})`);
    const seamX = Math.abs(x - Math.floor(x) - 0.5) > 1e-6;
    const seamZ = Math.abs(z - Math.floor(z) - 0.5) > 1e-6;
    if (seamX || seamZ) flags.push('SEAM');
    return flags;
}

// The arrival point comes from `level.arrivalPoint` — the function the game
// itself calls — and NOT from a copy of its arithmetic living here. The first
// draft of this probe re-derived it, and a probe that reimplements the code it
// is checking only ever proves it agrees with itself: it would have skipped
// `nearestFreeEntry` entirely and reported points the player never lands on.

const buckets = new Map();
const rows = [];
let nPoints = 0, nBad = 0;

function record(label, level, cw, x, z, y) {
    nPoints++;
    const flags = judge(level, cw, x, z, y);
    const real = flags.filter((f) => f !== 'SEAM');
    for (const f of flags) {
        const k = f.startsWith('WRONG-HEIGHT') ? 'WRONG-HEIGHT' : f;
        buckets.set(k, (buckets.get(k) || 0) + 1);
    }
    if (!real.length) return;
    nBad++;
    rows.push(`${label}\n    at (${x.toFixed(1)}, ${y.toFixed(2)}, ${z.toFixed(1)})  ${flags.join('  ')}`);
}

// A probe that drives nothing reports zero problems. Last session I wrote one
// that fired on 0 of 188 real transitions and would have said "clean". Count
// what was actually visited, per level, and print it whether it is good news
// or not.
const coverage = [];

function sweep(name, level, cw, def) {
    const before = nPoints;
    let rooms = 0;
    // The level's own start spawn — index.js feeds this straight to setSpawn.
    if (level.spawn) {
        record(`${name}  api.spawn (room ${def.start})`,
            level, cw, level.spawn.x, level.spawn.z, level.spawn.y);
    }
    for (const [roomId, room] of Object.entries(def.rooms || {})) {
        if (!room.half) continue;
        try { level.enterRoom(roomId, null); } catch (e) {
            rows.push(`${name}/${roomId}: ENTER FAILED ${e.message}`); continue;
        }
        rooms++;
        // Death sends you here.
        const rp = level.respawnPoint?.();
        if (rp) record(`${name}/${roomId}  respawnPoint()`, level, cw, rp.x, rp.z, rp.y);

        // And every door that leads INTO this room.
        for (const [fromId, fromRoom] of Object.entries(def.rooms || {})) {
            if (fromId === roomId) continue;
            for (const d of fromRoom.doors || []) {
                if (d.to !== roomId) continue;
                const e = level.arrivalPoint(roomId, fromId);
                record(`${name}/${roomId}  arriving from ${fromId} (door ${d.side}@${d.at})`,
                    level, cw, e.x, e.z, e.y);
            }
        }
    }
    coverage.push(`${name.padEnd(18)} rooms ${String(rooms).padStart(3)}`
        + `  points ${String(nPoints - before).padStart(4)}`);
}

for (const def of BEAT_LIST) {
    const cw = new CollisionWorld();
    let level;
    try {
        level = createDungeon(
            { scene: new THREE.Scene(), collisionWorld: cw, particles: null },
            def, { keyStore: keyStoreStub() }
        );
    } catch (e) { rows.push(`${def.id}: BAKE FAILED ${e.message}`); continue; }
    sweep(def.id, level, cw, def);
}

// The overworld is a room-graph level too, and the owner's first report was on
// one of its screens. It needs storage, which node does not have.
if (!globalThis.localStorage) {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
    };
}
try {
    const { createOverworld } = await import('../../src/game/overworld/overworld.js');
    const { WORLD7 } = await import('../../src/game/overworld/world7.js');
    const cw = new CollisionWorld();
    const level = createOverworld(
        { scene: new THREE.Scene(), collisionWorld: cw, particles: null },
        WORLD7, { keyStore: keyStoreStub(), world: WORLD7 }
    );
    sweep('overworld', level, cw, level.def);

    // THE OWNER'S FIRST REPORT, MEASURED DIRECTLY.
    //
    // "I spawned under the ground due to the raised land right next to the
    // entrance." Walking between screens is covered above and is clean. The path
    // that is NOT is coming BACK from a dungeon: overworld.js restores your saved
    // x/z and forces y to 1.95, and its only guard asks whether cell 1 is solid —
    // so any ground whose top is not exactly 1 buries you on return, and standing
    // next to a dungeon entrance is precisely when you leave.
    // Driven through the REAL restore: save a position on raised ground, rebuild
    // the overworld the way returning from a dungeon does, and read where
    // `level.spawn` put you. Inlining overworld.js's one line here instead would
    // let that line change without this ever noticing.
    const { patchOverworld } = await import('../../src/game/world/keys.js');
    const screens = Object.entries(level.def.rooms || {})
        .filter(([, r]) => r.half);

    // One raised standable cell per screen — the spot you were standing on when
    // you walked into the dungeon.
    const cases = [];
    for (const [roomId, room] of screens) {
        const half = room.half;
        level.enterRoom(roomId, null);
        const ox = (room.grid?.[0] || 0) * ROOM_STRIDE;
        const oz = (room.grid?.[1] || 0) * ROOM_STRIDE;
        let found = null;
        for (let x = -half + 1; x <= half - 1 && !found; x++) {
            for (let z = -half + 1; z <= half - 1; z++) {
                const wx = ox + x + 0.5, wz = oz + z + 0.5;
                if (cw.blocked(wx, wz, BODY)) continue;
                const top = surfaceTop(level, wx, wz);
                if (top == null || top === 1) continue;
                found = { x: x + 0.5, z: z + 0.5, top }; break;
            }
        }
        if (found) cases.push([roomId, found]);
    }

    let bad = 0;
    const badScreens = [];
    for (const [roomId, cell] of cases) {
        patchOverworld({ pos: { world: 'overworld', screen: roomId, x: cell.x, z: cell.z } });
        const cw2 = new CollisionWorld();
        const lv = createOverworld(
            { scene: new THREE.Scene(), collisionWorld: cw2, particles: null },
            WORLD7, { keyStore: keyStoreStub(), world: WORLD7 }
        );
        const s = lv.spawn;
        const flags = judge(lv, cw2, s.x, s.z, s.y);
        if (flags.length) {
            bad++;
            badScreens.push(`${roomId}(ground ${cell.top}, put at ${s.y.toFixed(2)})`);
        }
    }
    patchOverworld({ pos: null });
    console.log('SAVE-AND-RETURN — stand on raised ground, enter a dungeon, come back out');
    console.log(`    screens with raised ground ${cases.length} of ${screens.length}`
        + `  BURIED ON RETURN ${bad}`);
    if (badScreens.length) console.log(`    ${badScreens.join('  ')}`);
    console.log('');
} catch (e) {
    rows.push(`overworld: BAKE FAILED ${e.message}`);
}

for (const r of rows) console.log(r);
console.log('');
for (const c of coverage) console.log(c);
console.log('');
const order = ['BODY-IN-SOLID', 'BURIED', 'NO-GROUND', 'WRONG-HEIGHT', 'SEAM'];
console.log(order.map((k) => `${k} ${buckets.get(k) || 0}`).join('  '));
console.log(`arrival points ${nPoints}  BAD ${nBad}`);
