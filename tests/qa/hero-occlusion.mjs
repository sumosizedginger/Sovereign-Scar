// tests/qa/hero-occlusion.mjs — how often is the hero behind something?
//
//   node tests/qa/hero-occlusion.mjs [beat-id]
//
// Print-only census, no browser. For every cell the player can stand on, in
// every room of every dungeon, it walks the sight line from the lens to the
// hero's head through the voxel field and asks whether anything is in the way.
//
// WHY THIS IS WORTH A FILE. The camera is fixed-yaw — `camera-rig.js` never
// rotates about Y — so one of a room's four walls is permanently between the
// lens and the player, and nothing in the codebase had ever said which or asked
// what it costs. `tests/qa/wall-height-probe.mjs` found the answer by
// photographing one room: the hero standing at beat 01's south wall was hidden
// behind a trim merlon. This counts the same thing everywhere, so a change to
// wall heights can be judged on the whole campaign rather than on one picture.
//
// THE LENS IS UNCLAMPED HERE, and that is a deliberate simplification stated
// rather than hidden. `CameraRig._clampToBounds` pulls the look target away
// from a room's edges, which STEEPENS the line to a hero at the south wall and
// SHALLOWS it for one at the north. Modelling the clamp would mean importing
// the rig, which needs a GL context. The unclamped line is the honest middle:
// it is the geometry the rig converges on in any room bigger than the frame,
// which is most of them, and the number it produces is comparable across two
// builds — which is the only thing this census is for.

import * as THREE from 'three';
import { createDungeon, ROOM_STRIDE } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { BEAT_LIST } from '../game/_beat-defs.mjs';

const ONLY = process.argv[2] || null;

// The rig, from index.js. Restated with its source named, because a probe that
// invents its own camera measures a game nobody plays.
const CAM_HEIGHT = 17.5;          // index.js CAM_HEIGHT
const CAM_BACK = CAM_HEIGHT * 0.35;
const HEAD_UP = 0.95;             // head above the rig root, which sits at chest
const ROOT_Y = 1.95;              // respawn height — level.groundY's rest value
const STEP = 0.18;                // march along the sight line, in world units

function keyStoreStub() {
    const open = new Set();
    return {
        isOpen: (id) => open.has(id), open: (id) => open.add(id),
        mapPickup: () => false, takeMapPickup() {},
        isPickupTaken: () => false, takePickup() {},
        visited: () => [], visit() {},
    };
}

let totalCells = 0, totalHidden = 0;
const worst = [];

for (const def of BEAT_LIST) {
    if (ONLY && def.id !== ONLY) continue;
    const cw = new CollisionWorld();
    let level;
    try {
        level = createDungeon({ scene: new THREE.Scene(), collisionWorld: cw, particles: null },
            { ...def, prebake: true }, { keyStore: keyStoreStub() });
    } catch (e) { console.log(`${def.id}: BAKE FAILED ${e.message}`); continue; }

    let dCells = 0, dHidden = 0;
    for (const [rid, room] of Object.entries(def.rooms)) {
        const half = room.half;
        const ox = (room.grid?.[0] || 0) * ROOM_STRIDE;
        const oz = (room.grid?.[1] || 0) * ROOM_STRIDE;
        let cells = 0, hidden = 0;

        for (let lx = -half + 1; lx <= half - 1; lx++) {
            for (let lz = -half + 1; lz <= half - 1; lz++) {
                const wx = ox + lx + 0.5;
                const wz = oz + lz + 0.5;
                // Standable: ground under the feet, and the body band clear.
                if (!level.getVoxelAt(wx, 0.5, wz)) continue;
                if (level.getVoxelAt(wx, 1.5, wz) || level.getVoxelAt(wx, 2.5, wz)) continue;
                cells++;
                const hy = ROOT_Y + HEAD_UP;
                // Lens sits above and BEHIND (+z). March from the head out to
                // the lens; the first solid cell on the way is what hides them.
                const dy = (ROOT_Y + CAM_HEIGHT) - hy;
                const dz = CAM_BACK;
                const len = Math.hypot(dy, dz);
                let blocked = false;
                for (let t = STEP; t < len; t += STEP) {
                    const f = t / len;
                    if (level.getVoxelAt(wx, hy + dy * f, wz + dz * f)) { blocked = true; break; }
                }
                if (blocked) hidden++;
            }
        }
        dCells += cells; dHidden += hidden;
        if (cells && hidden / cells > 0.02) {
            worst.push([`${def.id}/${rid}`, hidden, cells, hidden / cells]);
        }
    }
    level.dispose?.();
    totalCells += dCells; totalHidden += dHidden;
    const pct = dCells ? (100 * dHidden / dCells).toFixed(1) : '—';
    console.log(`${def.id.padEnd(20)} ${String(dHidden).padStart(5)} / ${String(dCells).padStart(5)} standable cells hide the hero  (${pct}%)`);
}

console.log(`\nTOTAL ${totalHidden} / ${totalCells} = ${(100 * totalHidden / totalCells).toFixed(2)}%`);
worst.sort((a, b) => b[3] - a[3]);
if (worst.length) {
    console.log('\nworst rooms:');
    for (const [id, h, c, f] of worst.slice(0, 12)) {
        console.log(`  ${id.padEnd(34)} ${String(h).padStart(4)} / ${String(c).padStart(4)}  ${(100 * f).toFixed(1)}%`);
    }
}
