// You walk in through a door. Can you get OUT of the doorway into the room?
//
//   node tests/qa/door-reach.mjs
//
// The owner, third report, in capitals: "I AM LOCKED IN WHEN I ENTER THE ROOM.
// YOU NEED TO MAKE SURE YOUR HIDDEN SPOTS GIVE ROOM TO GET IN AND GIVE ROOM TO
// ENTER THE ROOM AND NOT GET STUCK."
//
// Every probe before this asked whether the player could reach the PUZZLE. None
// asked whether they could get off the doormat. And `puzzle-solve.mjs` actively
// hid it: it seeded one flood from the spawn AND every door and merged them, so
// a door sealed off by the alcove built in front of it became its own little
// island that still counted as "reachable". Merging the seeds destroyed the only
// question worth asking -- is every door connected to the room?
//
// The reward alcove is placed hard against the room's perimeter (`x0` is
// `-half + 1`), and the perimeter is exactly where the doors are. Its footprint
// is three by three, its gate is raised the moment the room bakes, and nothing
// in the corner search has ever looked at a door.
//
// Measured with the real body (0.4), the real ground (bottom-up surface, one-cell
// climb, free fall) and the real baked solids, gate up, blocks where they spawn.
//
// Print-only. Not a gate.

import * as THREE from 'three';
import { createDungeon, ROOM_STRIDE, doorCells } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { BEAT_LIST } from '../game/_beat-defs.mjs';

const BODY = 0.4;
const STEP = 0.25;
const CLIMB = 1;
const MAX_Y = 8;
const MID = 0.5;

function keyStoreStub() {
    const open = new Set();
    return {
        isOpen: (id) => open.has(id), open: (id) => open.add(id),
        mapPickup: () => false, takeMapPickup() {},
        isPickupTaken: () => false, takePickup() {},
        visited: () => [], visit() {},
    };
}

const overlaps = (x, z, h, s) =>
    x + h > s.minX && x - h < s.maxX && z + h > s.minZ && z - h < s.maxZ;

function heightField(level, ox, oz, half) {
    const lo = -half - 1;
    const n = Math.round((2 * half + 3) / STEP);
    const h = new Int16Array((n + 1) * (n + 1)).fill(-1);
    for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n; j++) {
            const x = ox + lo + i * STEP;
            const z = oz + lo + j * STEP;
            for (let top = 1; top <= MAX_Y; top++) {
                if (!level.getVoxelAt(x, top - 0.5, z)) continue;
                if (level.getVoxelAt(x, top + 0.5, z)) continue;
                if (level.getVoxelAt(x, top + 1.5, z)) continue;
                h[i * (n + 1) + j] = top;
                break;
            }
        }
    }
    return { h, n, lo };
}

/** Flood from ONE seed. Deliberately one — merging seeds is what hid the bug. */
function flood(hf, statics, ox, oz, body, fromX, fromZ) {
    const { h, n, lo } = hf;
    const at = (i, j) => i * (n + 1) + j;
    const seen = new Uint8Array((n + 1) * (n + 1));
    const ok = (i, j) => {
        if (h[at(i, j)] < 0) return false;
        const x = ox + lo + i * STEP;
        const z = oz + lo + j * STEP;
        for (const s of statics) if (overlaps(x, z, body, s)) return false;
        return true;
    };
    let si = Math.round((fromX - ox - lo) / STEP);
    let sj = Math.round((fromZ - oz - lo) / STEP);
    if (si < 0 || sj < 0 || si > n || sj > n) return { seen, n, lo, seeded: false };
    if (!ok(si, sj)) {
        // Nearest standable point within one cell — a threshold coordinate can
        // land in the wall line itself.
        let best = null, bestD = Infinity;
        const r = Math.ceil(1.5 / STEP);
        for (let di = -r; di <= r; di++) {
            for (let dj = -r; dj <= r; dj++) {
                const i = si + di, j = sj + dj;
                if (i < 0 || j < 0 || i > n || j > n || !ok(i, j)) continue;
                const d = di * di + dj * dj;
                if (d < bestD) { bestD = d; best = [i, j]; }
            }
        }
        if (!best) return { seen, n, lo, seeded: false };
        [si, sj] = best;
    }
    const q = [[si, sj]];
    seen[at(si, sj)] = 1;
    let count = 1;
    while (q.length) {
        const [i, j] = q.pop();
        const y = h[at(i, j)];
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ni = i + di, nj = j + dj;
            if (ni < 0 || nj < 0 || ni > n || nj > n) continue;
            if (seen[at(ni, nj)] || !ok(ni, nj)) continue;
            if (h[at(ni, nj)] - y > CLIMB) continue;
            seen[at(ni, nj)] = 1;
            count++;
            q.push([ni, nj]);
        }
    }
    return { seen, n, lo, seeded: true, count, seedIdx: at(si, sj) };
}

const hit = (f, ox, oz, x, z) => {
    const i = Math.round((x - ox - f.lo) / STEP);
    const j = Math.round((z - oz - f.lo) / STEP);
    if (i < 0 || j < 0 || i > f.n || j > f.n) return false;
    return !!f.seen[i * (f.n + 1) + j];
};

// A COFFIN IS NOT A BANK, and the island's size is how you tell them apart.
//
// `tearwell`'s sealed doorway was an island of FIVE lattice points — a third of a
// square unit, nowhere to stand, let alone fight. Beat 07's `weepinghall` reports
// islands of 2161 because a grapple chasm splits it end to end and every door
// opens on the far bank; the room's own hint is "Cross on the anchors". Both are
// "not connected to the spawn by walking", and only one is a bug.
//
// 100 lattice points is 6.25 square units, about a two-by-two of cells: below
// that a body has no room to do anything.
const COFFIN = 100;

let nRooms = 0, nDoors = 0, nCut = 0, nNoSeed = 0, nBank = 0;
const rows = [];
const banks = [];

for (const def of BEAT_LIST) {
    let level, cw;
    try {
        cw = new CollisionWorld();
        level = createDungeon(
            { scene: new THREE.Scene(), collisionWorld: cw, particles: null },
            { ...def, prebake: true }, { keyStore: keyStoreStub() }
        );
    } catch (e) { rows.push(`${def.id}: BAKE FAILED ${e}`); continue; }

    for (const [roomId, room] of Object.entries(def.rooms || {})) {
        const half = room.half || 0;
        if (!half) continue;
        nRooms++;
        const ox = (room.grid?.[0] || 0) * ROOM_STRIDE;
        const oz = (room.grid?.[1] || 0) * ROOM_STRIDE;
        const bounds = {
            x0: ox - half - 2, x1: ox + half + 3,
            z0: oz - half - 2, z1: oz + half + 3,
        };
        const statics = cw.solids.filter((s) => s.maxX > bounds.x0 && s.minX < bounds.x1
            && s.maxZ > bounds.z0 && s.minZ < bounds.z1);
        const hf = heightField(level, ox, oz, half);
        const puzzle = level.puzzleDefs ? level.puzzleDefs(roomId) : [];
        const vault = puzzle.find((p) => p.type === 'vault');

        // The room's own body, flooded from the SPAWN alone.
        const sx = ox + (room.spawn?.x || 0) + MID;
        const sz = oz + (room.spawn?.z || 0) + MID;
        const fromSpawn = flood(hf, statics, ox, oz, BODY, sx, sz);
        if (!fromSpawn.seeded) {
            rows.push(`${def.id}/${roomId}: SPAWN NOT STANDABLE`);
            continue;
        }

        for (const door of room.doors || []) {
            const cells = doorCells(room, door);
            nDoors++;
            // Where the player is standing once they are through: the threshold,
            // and the first cell inside the room.
            let anyConnected = false;
            let anySeeded = false;
            let biggest = 0;
            const detail = [];
            for (const c of cells) {
                const ix = Math.abs(c.x) === half ? c.x - Math.sign(c.x) : c.x;
                const iz = Math.abs(c.z) === half ? c.z - Math.sign(c.z) : c.z;
                for (const [lx, lz] of [[c.x, c.z], [ix, iz]]) {
                    const wx = ox + lx + MID, wz = oz + lz + MID;
                    const f = flood(hf, statics, ox, oz, BODY, wx, wz);
                    if (!f.seeded) { detail.push(`${lx},${lz}:nostand`); continue; }
                    anySeeded = true;
                    const connected = hit(fromSpawn, ox, oz, wx, wz)
                        || f.seen[fromSpawn.seedIdx];
                    if (connected) anyConnected = true;
                    else {
                        detail.push(`${lx},${lz}:island(${f.count})`);
                        if (f.count > biggest) biggest = f.count;
                    }
                }
            }
            if (!anySeeded) { nNoSeed++; continue; }
            if (!anyConnected && biggest >= COFFIN) {
                // Cut off by walking, but into somewhere with room in it. A
                // grapple chasm looks exactly like this and is not a bug.
                nBank++;
                banks.push(`${def.id}/${roomId} door ${door.side}@${door.at} -> ${door.to}`
                    + `  island ${biggest} pts (${(biggest * STEP * STEP).toFixed(1)} sq units)`);
            } else if (!anyConnected) {
                nCut++;
                // How close is the alcove to this door? That is the suspect.
                let near = '';
                if (vault) {
                    const c = cells[Math.floor(cells.length / 2)];
                    const dx = Math.max(vault.rect.x0 - c.x, 0, c.x - (vault.rect.x1 + 1));
                    const dz = Math.max(vault.rect.z0 - c.z, 0, c.z - (vault.rect.z1 + 1));
                    near = `  vault=${vault.rect.x0}..${vault.rect.x1},${vault.rect.z0}..${vault.rect.z1} `
                        + `gap=${Math.max(dx, dz)}`;
                }
                rows.push(`LOCKED IN  ${def.id}/${roomId}  door ${door.side}@${door.at} -> ${door.to}`
                    + `  half=${half}${near}`);
                rows.push(`    ${detail.join('  ')}`);
            }
        }
    }
}

for (const r of rows) console.log(r);
console.log('');
if (banks.length) {
    console.log('cut off by walking, but into open ground — a traversal (grapple, anchors)');
    console.log('is the intended way across. Check each against the room\'s own hint:');
    for (const b of banks) console.log(`    ${b}`);
    console.log('');
}
console.log(`rooms ${nRooms}  doors ${nDoors}  DOORS THAT LOCK YOU IN ${nCut}`
    + `  (needs a traversal ${nBank}, unstandable thresholds ${nNoSeed})`);
