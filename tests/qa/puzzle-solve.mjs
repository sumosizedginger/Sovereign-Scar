// Can the player STAND, SHOVE, and WALK IN? Measured with real bodies, on real
// ground.
//
//   node tests/qa/puzzle-solve.mjs [--rooms]
//
// The owner's report, twice now:
//
//   "YOU NEED TO MAKE SURE THERE IS ROOM FOR THE PLAYER TO ENTER THE ROOM,
//    MOVE THE BLOCK ONTO THE PAD, AND ENTER THE SPACE WITHOUT ISSUE!
//    Right now there are too many areas where they are too close."
//
// Every other probe here counts CELLS. `puzzle-placement.mjs` asks whether a
// cell is occupied; `puzzle-reach.mjs` floods cells at the hero's step height.
// Both were green while the alcove mouth was a 1.0 gap around a 0.8 body.
//
// THE TWO THINGS THIS ONE HAS TO GET RIGHT, both of which it got wrong first:
//
//   1. WIDTH. Ask the collision world the question the game asks every frame --
//      `blocked(x, z, half)` -- and drive the REAL PushableBlock through the
//      REAL tryPush, which moves 0.9 units per shove in continuous space and
//      resolves at half-extent 0.7. The grid model in `settle()` (1-cell steps,
//      cells free or not) is not the thing that runs.
//
//   2. GROUND. The collision world holds XZ solids only. A CHASM IS NOT A
//      SOLID. The first version of this probe was width-only and cheerfully
//      walked the hero across the three-wide gap that splits beat 07's
//      `weepinghall` in half, then reported every puzzle in the campaign
//      solvable. A probe that cannot see a hole cannot answer "can the player
//      get there".
//
// So a point is standable only if a body fits AND there is ground under it, and
// a step between neighbours is legal only if the climb is within the hero's one
// cell. Falls are free, which is the asymmetry that makes one-way drops possible.
//
// Three questions per puzzle, in the order the player meets them:
//
//   1. STAND  -- can the player reach a spot to shove the block from?
//   2. SHOVE  -- driving the real block, does it come to rest on the target?
//   3. ENTER  -- gate open, block wherever the solve left it, can a 0.4 body get
//                from the room floor into the vault -- and back out again?
//
// Print-only. Not a gate.

import * as THREE from 'three';
import { createDungeon, ROOM_STRIDE, doorCells } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { BEAT_LIST } from '../game/_beat-defs.mjs';
import { PUSH_STEP } from '../../src/game/world/blockers.js';

/** The hero's collision half-extent, straight off `player.js`. */
const BODY = 0.4;
/** Lattice for the walk flood. Below the body's full width, so nothing tunnels. */
const STEP = 0.25;
/** The hero climbs one cell. `voxel-physics-body.js`'s MAX_STEP_HEIGHT. */
const CLIMB = 1;
const MAX_Y = 8;

// THE HALF-CELL.
//
// `level-builder.js` registers voxel cell (x,z) as the box [x, x+1] x [z, z+1],
// so a cell's CENTRE is at (x + 0.5, z + 0.5). `blockers.js` knows this for
// rectangles -- `rectW` maps cells x0..x1 to world [x0, x1 + 1] -- and does NOT
// know it for points: `W(local)` is `origin + local`, which lands an entity on a
// cell's minimum CORNER. Sampling a row at `origin + z` therefore samples the
// SEAM between two rows, which is how the first run of this probe reported every
// doorway in the campaign as 0.25 wide while also reporting the player could get
// through it. Two measurements disagreeing is the tell.
const MID = 0.5;

function keyStoreStub() {
    const open = new Set();
    return {
        isOpen: (id) => open.has(id),
        open: (id) => open.add(id),
        mapPickup: () => false, takeMapPickup() {},
        isPickupTaken: () => false, takePickup() {},
        visited: () => [], visit() {},
    };
}

const overlaps = (x, z, h, s) =>
    x + h > s.minX && x - h < s.maxX && z + h > s.minZ && z - h < s.maxZ;

/**
 * A room's walkable ground, as a height per lattice point.
 *
 * `statics` is the room's own solids, pre-filtered -- `cw.blocked` walks every
 * solid in the whole prebaked dungeon, which is thousands of boxes per query and
 * far too slow to recompute a field for every place the block comes to rest.
 */
function heightField(level, ox, oz, half) {
    const lo = -half;
    const n = Math.round((2 * half + 1) / STEP);
    const h = new Int16Array((n + 1) * (n + 1)).fill(-1);
    for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n; j++) {
            const x = ox + lo + i * STEP;
            const z = oz + lo + j * STEP;
            // Bottom-up: beat 08's `gravecanopy` has floor, a gap you walk
            // through, and a canopy overhead. Top-down finds the roof.
            for (let top = 1; top <= MAX_Y; top++) {
                if (!level.getVoxelAt(x, top - 0.5, z)) continue;
                if (level.getVoxelAt(x, top + 0.5, z)) continue;   // head room,
                if (level.getVoxelAt(x, top + 1.5, z)) continue;   // ~1.9 tall
                h[i * (n + 1) + j] = top;
                break;
            }
        }
    }
    return { h, n, lo };
}

/**
 * Flood the ground a body of `body` half-extent can actually walk.
 *
 * `seeds` is a LIST, because a room is not only entered at its spawn. Beat 07's
 * `weepinghall` is split end to end by a grapple chasm with the puzzle on the
 * far bank and a door in the north wall: flooding from the spawn alone calls a
 * working room broken. That mistake was made once already, by
 * `puzzle-reach.mjs`, against this same room -- so `walkableCells` seeds from
 * the spawn and every door, and so does this.
 */
function walkField(hf, statics, extra, ox, oz, body, seeds) {
    const { h, n, lo } = hf;
    const at = (i, j) => i * (n + 1) + j;
    const seen = new Uint8Array((n + 1) * (n + 1));
    const ok = (i, j) => {
        if (h[at(i, j)] < 0) return false;                  // no ground: a hole
        const x = ox + lo + i * STEP;
        const z = oz + lo + j * STEP;
        for (const s of statics) if (overlaps(x, z, body, s)) return false;
        if (extra && overlaps(x, z, body, extra)) return false;
        return true;
    };
    const q = [];
    let seed = -1;
    const seedIdx = [];
    for (const [fromX, fromZ] of seeds) {
        let si = Math.max(0, Math.min(n, Math.round((fromX - ox - lo) / STEP)));
        let sj = Math.max(0, Math.min(n, Math.round((fromZ - oz - lo) / STEP)));
        if (!ok(si, sj)) {
            // A spawn or door threshold is an entity coordinate and lands on a
            // cell corner; take the nearest standable point instead of dropping
            // the seed entirely.
            let best = null, bestD = Infinity;
            for (let i = 0; i <= n; i++) {
                for (let j = 0; j <= n; j++) {
                    if (!ok(i, j)) continue;
                    const d = (i - si) ** 2 + (j - sj) ** 2;
                    if (d < bestD && d <= 64) { bestD = d; best = [i, j]; }
                }
            }
            if (!best) continue;
            [si, sj] = best;
        }
        if (seen[at(si, sj)]) continue;
        if (seed < 0) seed = at(si, sj);
        seedIdx.push(at(si, sj));
        seen[at(si, sj)] = 1;
        q.push([si, sj]);
    }
    if (!q.length) return { seen, n, lo, empty: true, seed: -1, seedIdx };
    while (q.length) {
        const [i, j] = q.pop();
        const y = h[at(i, j)];
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ni = i + di, nj = j + dj;
            if (ni < 0 || nj < 0 || ni > n || nj > n) continue;
            if (seen[at(ni, nj)] || !ok(ni, nj)) continue;
            if (h[at(ni, nj)] - y > CLIMB) continue;        // too high to climb
            seen[at(ni, nj)] = 1;
            q.push([ni, nj]);
        }
    }
    return { seen, n, lo, seed, seedIdx };
}

const canWalk = (f, ox, oz, x, z) => {
    const i = Math.round((x - ox - f.lo) / STEP);
    const j = Math.round((z - oz - f.lo) / STEP);
    if (i < 0 || j < 0 || i > f.n || j > f.n) return false;
    return !!f.seen[i * (f.n + 1) + j];
};

const rows = [];
let nStranded = 0, nNoStand = 0, nNoSolve = 0, nNoEnter = 0, nNoExit = 0, nPuzzles = 0;
const squeeze = [];

for (const def of BEAT_LIST) {
    let level, cw;
    try {
        cw = new CollisionWorld();
        level = createDungeon(
            { scene: new THREE.Scene(), collisionWorld: cw, particles: null },
            { ...def, prebake: true }, { keyStore: keyStoreStub() }
        );
    } catch (e) {
        rows.push(`${def.id}: BAKE FAILED ${e}`);
        continue;
    }

    for (const [roomId, room] of Object.entries(def.rooms || {})) {
        const pieces = level.puzzleDefs(roomId);
        if (!pieces.length) continue;
        const vault = pieces.find((p) => p.type === 'vault');
        if (!vault) continue;
        nPuzzles++;
        const half = room.half || 0;
        const ox = (room.grid?.[0] || 0) * ROOM_STRIDE;
        const oz = (room.grid?.[1] || 0) * ROOM_STRIDE;
        const gate = pieces.find((p) => p.type === 'timed_gate');
        const push = pieces.find((p) => p.type === 'pushable');
        const target = pieces.find((p) => p.at
            && ['pressure_plate', 'block_socket', 'beam_target'].includes(p.type));
        const spawn = { x: ox + (room.spawn?.x || 0), z: oz + (room.spawn?.z || 0) };
        // Spawn AND every door, at cell centres.
        const seeds = [[spawn.x + MID, spawn.z + MID]];
        for (const door of room.doors || []) {
            for (const c of doorCells(room, door)) {
                seeds.push([ox + c.x + MID, oz + c.z + MID]);
                // One cell inward: the threshold sits in the wall line.
                const ix = Math.abs(c.x) === half ? c.x - Math.sign(c.x) : c.x;
                const iz = Math.abs(c.z) === half ? c.z - Math.sign(c.z) : c.z;
                seeds.push([ox + ix + MID, oz + iz + MID]);
            }
        }
        const notes = [];

        const block = push
            ? (level.puzzleBlocks || []).find((b) => b.id === `blk:${push.id}`)
            : null;
        const blockBox = () => block ? {
            minX: block.position.x - block.half, maxX: block.position.x + block.half,
            minZ: block.position.z - block.half, maxZ: block.position.z + block.half,
        } : null;

        // Only this room's solids, and never the block -- it is passed separately
        // because it moves.
        const bounds = {
            x0: ox - half - 1, x1: ox + half + 2,
            z0: oz - half - 1, z1: oz + half + 2,
        };
        const near = (s) => s.maxX > bounds.x0 && s.minX < bounds.x1
            && s.maxZ > bounds.z0 && s.minZ < bounds.z1;
        const gateId = gate ? `blk:${gate.id}:gate` : null;
        const statics = cw.solids.filter((s) =>
            near(s) && (!block || s.id !== block.id));
        const staticsOpen = statics.filter((s) => !gateId || !String(s.id).startsWith(gateId));

        const hf = heightField(level, ox, oz, half);
        // With the gate raised, its row reads as ground at y3 (you would be
        // standing on the gate). Dropping it restores the floor beneath, which
        // is what the vault interior sits at.
        const hfOpen = { h: Int16Array.from(hf.h), n: hf.n, lo: hf.lo };
        if (gate) {
            let floorY = -1;
            for (let i = 0; i <= hf.n; i++) {
                for (let j = 0; j <= hf.n; j++) {
                    const x = hf.lo + i * STEP, z = hf.lo + j * STEP;
                    const inV = x >= vault.rect.x0 && x <= vault.rect.x1 + 1
                        && z >= vault.rect.z0 && z <= vault.rect.z1 + 1;
                    if (inV && hf.h[i * (hf.n + 1) + j] > 0) {
                        const y = hf.h[i * (hf.n + 1) + j];
                        if (floorY < 0 || y < floorY) floorY = y;
                    }
                }
            }
            for (let i = 0; i <= hf.n; i++) {
                for (let j = 0; j <= hf.n; j++) {
                    const x = hf.lo + i * STEP, z = hf.lo + j * STEP;
                    const inG = x >= gate.rect.x0 && x <= gate.rect.x1 + 1
                        && z >= gate.rect.z0 && z <= gate.rect.z1 + 1;
                    if (inG && floorY > 0) hfOpen.h[i * (hf.n + 1) + j] = floorY;
                }
            }
        }

        // ── 1 & 2. STAND, then SHOVE ──────────────────────────────────────
        let solved = false, everPushed = false, reachedBlock = false;
        if (block && target) {
            const tw = { x: ox + target.at.x, z: oz + target.at.z };
            const tr = target.type === 'block_socket' ? 1.0 : 1.1;
            const start = { x: block.position.x, z: block.position.z };
            const q = [start];
            const seenPos = new Set([`${start.x.toFixed(2)},${start.z.toFixed(2)}`]);
            let guard = 0;
            while (q.length && !solved && guard++ < 300) {
                const cur = q.shift();
                block.position.x = cur.x;
                block.position.z = cur.z;
                block._registerSolid();
                if (Math.hypot(cur.x - tw.x, cur.z - tw.z) < tr) { solved = true; break; }
                const field = walkField(hf, statics, blockBox(), ox, oz, BODY, seeds);
                for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    // A BAND of stances, not one point: `tryPush` accepts the
                    // player anywhere out to half + 0.9. Testing only the closest
                    // (1.15) put the sample 0.05 clear of the block and the 0.25
                    // lattice rounded it 0.05 INSIDE, so 25 of 38 puzzles looked
                    // unshovable. The probe was standing in the crate.
                    let stance = null;
                    for (const d of [1.2, 1.35, 1.5, 1.55]) {
                        const sx = cur.x - dx * d, sz = cur.z - dz * d;
                        if (canWalk(field, ox, oz, sx, sz)) { stance = { x: sx, z: sz }; break; }
                    }
                    if (!stance) continue;
                    reachedBlock = true;
                    block.position.x = cur.x;
                    block.position.z = cur.z;
                    block._registerSolid();
                    if (!block.tryPush(stance, { x: dx, z: dz }, PUSH_STEP)) continue;
                    everPushed = true;
                    const k = `${block.position.x.toFixed(2)},${block.position.z.toFixed(2)}`;
                    if (!seenPos.has(k)) {
                        seenPos.add(k);
                        q.push({ x: block.position.x, z: block.position.z });
                    }
                }
            }
            if (!reachedBlock) {
                notes.push('CANNOT REACH THE BLOCK — no standable ground beside it on any side');
                nStranded++;
            } else if (!everPushed) {
                notes.push('BLOCK CANNOT BE SHOVED AT ALL');
                nNoStand++;
            } else if (!solved) {
                notes.push(`BLOCK CANNOT REACH ${target.type} — ${seenPos.size} resting places, none within ${tr}`);
                nNoSolve++;
            }
            if (!solved) { block.position.x = start.x; block.position.z = start.z; }
            block._registerSolid();
        }

        // ── 3. ENTER, and get out again ───────────────────────────────────
        const fOpen = walkField(hfOpen, staticsOpen, blockBox(), ox, oz, BODY, seeds);
        let inside = 0, insideFree = 0;
        const insidePts = [];
        // THE POCKET, not the rect plus a margin.
        //
        // Sampling `z0 .. z1 + 1` reaches a full cell PAST the alcove, out into
        // the open room, and reaching open floor is not getting in. It also
        // included the gate row itself — standing in the doorway is not being
        // inside either, and it is exactly where a block parked on a plate too
        // close to the gate would let the probe declare success. The reward sits
        // in the rows behind the gate; those are the rows that count.
        const gz = gate ? (gate.rect.z0 === gate.rect.z1 ? gate.rect.z0 : null) : null;
        const gx = gate && gate.rect.x0 === gate.rect.x1 ? gate.rect.x0 : null;
        for (let x = vault.rect.x0; x <= vault.rect.x1 + 1 - STEP; x += STEP) {
            for (let z = vault.rect.z0; z <= vault.rect.z1 + 1 - STEP; z += STEP) {
                // Skip the doorway row/column.
                if (gz != null && z >= gz && z < gz + 1) continue;
                if (gx != null && x >= gx && x < gx + 1) continue;
                const wx = ox + x, wz = oz + z;
                const i = Math.round((wx - ox - hfOpen.lo) / STEP);
                const j = Math.round((wz - oz - hfOpen.lo) / STEP);
                if (i < 0 || j < 0 || i > hfOpen.n || j > hfOpen.n) continue;
                if (hfOpen.h[i * (hfOpen.n + 1) + j] < 0) continue;
                let hit = false;
                for (const s of staticsOpen) if (overlaps(wx, wz, BODY, s)) { hit = true; break; }
                if (hit) continue;
                insideFree++;
                if (canWalk(fOpen, ox, oz, wx, wz)) { inside++; insidePts.push([wx, wz]); }
            }
        }
        if (insideFree === 0) notes.push('VAULT INTERIOR HAS NO ROOM FOR A BODY AT ALL');
        else if (inside === 0) {
            notes.push('CANNOT GET INTO THE VAULT — gate open, and no route a 0.4 body fits through');
            nNoEnter++;
        } else {
            // Standing in there, can they walk back out? Falls are free, so a
            // vault entered by dropping is a box with no exit.
            // Back to the very lattice point the forward flood started from --
            // not to the raw spawn coordinate. The forward flood SNAPS its seed
            // to the nearest standable point (the spawn is an entity coordinate
            // and lands on a cell corner), so testing the unsnapped point asks a
            // different question than the one that was answered going in.
            const back = walkField(hfOpen, staticsOpen, blockBox(), ox, oz, BODY,
                [insidePts[0]]);
            const gotOut = fOpen.seedIdx.some((s) => back.seen[s]);
            if (fOpen.seedIdx.length && !gotOut) {
                notes.push('TRAPPED — the vault is enterable and there is no way back to any entrance');
                nNoExit++;
            }
            // How tight is the best route? Widen the body until it stops fitting.
            let lo2 = BODY, hi2 = 2.0;
            for (let it = 0; it < 6; it++) {
                const mid = (lo2 + hi2) / 2;
                const f2 = walkField(hfOpen, staticsOpen, blockBox(), ox, oz, mid, seeds);
                let ok2 = false;
                for (const [wx, wz] of insidePts) {
                    if (canWalk(f2, ox, oz, wx, wz)) { ok2 = true; break; }
                }
                if (ok2) lo2 = mid; else hi2 = mid;
            }
            squeeze.push({ id: `${def.id}/${roomId}`, w: lo2 * 2 });
            if (lo2 * 2 < 1.1) {
                notes.push(`TIGHT ROUTE IN — widest body the best route admits is ${(lo2 * 2).toFixed(2)}; the hero is 0.80`);
            }
        }

        if (notes.length) {
            rows.push(`${def.id}/${roomId} half=${half} spawn=${room.spawn?.x || 0},${room.spawn?.z || 0} `
                + `vault=${vault.rect.x0}..${vault.rect.x1},${vault.rect.z0}..${vault.rect.z1}`
                + (block ? ` block=${(block.position.x - ox).toFixed(1)},${(block.position.z - oz).toFixed(1)}` : '')
                + (target ? ` ${target.type}=${target.at.x},${target.at.z}` : ''));
            for (const n of notes) rows.push(`    ${n}`);
        }
    }
}

for (const r of rows) console.log(r);
console.log('');
squeeze.sort((a, b) => a.w - b.w);
console.log('tightest ROUTES into the vault (widest body the best route admits; hero is 0.80):');
for (const s of squeeze.slice(0, 8)) console.log(`    ${s.w.toFixed(2)}  ${s.id}`);
console.log('');
console.log(`puzzles ${nPuzzles}  block-unreachable ${nStranded}  unshovable ${nNoStand}  `
    + `unsolvable ${nNoSolve}  cannot-enter ${nNoEnter}  trapped ${nNoExit}`);
