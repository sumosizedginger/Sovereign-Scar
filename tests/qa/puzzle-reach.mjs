// Can the player actually WALK to every puzzle piece, and out of every vault?
//
//   node tests/qa/puzzle-reach.mjs
//
// The previous probe (`puzzle-placement.mjs`) asked whether a piece's cell was
// free. That is not the question the owner hit. Two of their reports are about
// geometry that is free and still unusable:
//
//   "Still can't trigger all switches properly, this one is too close to what
//    we are unlocking to be able to get in."
//   "you have a room where you spawn inside the locked place and can't get out"
//
// A cell can be empty and unreachable, empty and walled off behind the very gate
// it opens, or empty and occupied by the player's own spawn. So this one floods
// the room from where the player actually starts and reports what that flood can
// and cannot touch.
//
// Print-only. Not a gate.

import * as THREE from 'three';
import { createDungeon, ROOM_STRIDE, walkableCells } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { BEAT_LIST } from '../game/_beat-defs.mjs';



function keyStoreStub() {
    const open = new Set();
    return {
        isOpen: (id) => open.has(id),
        open: (id) => open.add(id),
        mapPickup: () => false, takeMapPickup() {},
        isPickupTaken: () => false, takePickup() {},
        visited: () => [],
        visit() {},
    };
}

const rows = [];
let nUnstandable = 0, nUnreachable = 0, nSpawnTrapped = 0, nVaultSealed = 0;
let nTightMouth = 0;

for (const def of BEAT_LIST) {
    let level;
    try {
        level = createDungeon(
            { scene: new THREE.Scene(), collisionWorld: new CollisionWorld(), particles: null },
            { ...def, prebake: true }, { keyStore: keyStoreStub() }
        );
    } catch (e) {
        rows.push(`${def.id}: BAKE FAILED ${e}`);
        continue;
    }

    for (const [roomId, room] of Object.entries(def.rooms || {})) {
        // The BAKED layout, not the authored one. `puzzleFor(def, room, ...)`
        // with no predicates returns the table — the offsets the beat starts
        // from before `settle` moves anything — and auditing those means
        // auditing coordinates the game never used. The first run of this probe
        // did exactly that and accused two rooms of a bug that was not there.
        const pieces = level.puzzleDefs(roomId);
        if (!pieces.length) continue;
        const half = room.half || 0;
        // `room.grid` is a TUPLE, not an object. Reading `.x` off it gives NaN,
        // which samples the voxel field outside every room and reports the whole
        // campaign as unstandable — including the spawn, which is the tell.
        const ox = (room.grid?.[0] || 0) * ROOM_STRIDE;
        const oz = (room.grid?.[1] || 0) * ROOM_STRIDE;

        // Height-aware, because Phase E2 put terraces in every room. A flat
        // "is there floor at y=1" test calls the top of a step unstandable and
        // then reports the room's own spawn as unreachable, which is how the
        // first run of this probe accused twelve rooms of nothing.
        //
        // Returns the Y the hero's feet would rest at, or null.
        //
        // Scanned from the BOTTOM UP, which is not a detail. Beat 08 is called
        // `gravecanopy` and its column at (2,0) reads `#...##...` — floor, a gap
        // you walk through, and a canopy overhead. Searching top-down finds the
        // canopy roof at y6, calls the block unreachable, and is wrong: the
        // player walks underneath it on the floor. The lowest surface with a
        // body's worth of room above it is the one they are standing on.
        const MAX_Y = 8;
        const surfaceY = (lx, lz) => {
            const x = ox + lx, z = oz + lz;
            for (let top = 1; top <= MAX_Y; top++) {
                if (!level.getVoxelAt(x, top - 0.5, z)) continue;
                // Head room: the hero is ~1.9 tall, so both cells above the
                // surface have to be clear or this is a crawlspace.
                if (level.getVoxelAt(x, top + 0.5, z)) continue;
                if (level.getVoxelAt(x, top + 1.5, z)) continue;
                return top;
            }
            return null;
        };
        const standable = (lx, lz) => surfaceY(lx, lz) != null;

        // Where the player is when the room starts.
        const sx = Math.round(room.spawn?.x || 0);
        const sz = Math.round(room.spawn?.z || 0);

        // The game's own walkability, seeded from the spawn AND every door.
        //
        // Flooding from the spawn alone was wrong, and wrong in an instructive
        // way: beat 07's `weepinghall` is split by a chasm the player is MEANT
        // to cross — it is a `grapple_gap` with anchors on both rims and the
        // room's own hint says "Cross on the anchors" — so a spawn-only flood
        // calls the entire far half unreachable and reports a working room as
        // broken. Doors are the other way in, and the north door lands the
        // player on the far rim.
        const seen = walkableCells(room, { x: ox, z: oz }, (x, y, z) =>
            !!level.getVoxelAt(x, y, z));
        const start = seen.size > 0;

        const vault = pieces.find((p) => p.type === 'vault');
        const gate = pieces.find((p) => p.type === 'timed_gate');
        const inVault = (x, z) => vault && x >= vault.rect.x0 && x <= vault.rect.x1
            && z >= vault.rect.z0 && z <= vault.rect.z1;

        const notes = [];

        // 1. The spawn itself must not be inside the vault.
        if (inVault(sx, sz)) {
            notes.push(`SPAWN INSIDE VAULT at ${sx},${sz}`);
            nSpawnTrapped++;
        }
        if (!start) notes.push(`spawn ${sx},${sz} is not standable`);

        // 2. Every loose piece must be standable and walk-reachable.
        for (const p of pieces) {
            if (!p.at) continue;
            const k = `${p.at.x},${p.at.z}`;
            const st = standable(p.at.x, p.at.z);
            if (!st) { notes.push(`${p.type} NOT STANDABLE @${k}`); nUnstandable++; continue; }
            if (start && !seen.has(k)) {
                // Why, not just that. A cell is cut off either because every
                // neighbour is a hole, or because the only neighbours that are
                // standable are more than one step above it.
                const why = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => {
                    const ny = surfaceY(p.at.x + dx, p.at.z + dz);
                    const r = seen.has(`${p.at.x + dx},${p.at.z + dz}`) ? 'reached' : 'cut';
                    return ny == null ? 'void' : `y${ny}/${r}`;
                }).join(' ');
                notes.push(`${p.type} UNREACHABLE @${k} (self y${surfaceY(p.at.x, p.at.z)}; E/W/S/N ${why})`);
                nUnreachable++;
            }
            // 3. Clearance from the thing it opens. A trigger jammed against the
            //    vault it unlocks is the owner's exact complaint.
            if (vault) {
                const dx = Math.max(vault.rect.x0 - p.at.x, 0, p.at.x - vault.rect.x1);
                const dz = Math.max(vault.rect.z0 - p.at.z, 0, p.at.z - vault.rect.z1);
                const gap = Math.max(dx, dz);
                if (gap <= 1) notes.push(`${p.type} only ${gap} from the vault @${k}`);
            }
        }

        // 3b. A block and the thing it fills must be on the SAME level.
        //
        // `settle`'s push-search is two-dimensional — it asks whether a route of
        // free cells exists and never asks what height they are. A block on the
        // floor and a socket on top of a two-high terrace have a perfectly good
        // route between them and cannot be solved, because a shove does not lift.
        {
            const push = pieces.find((p) => p.type === 'pushable' && p.at);
            const dest = pieces.find((p) => p.at && p.type !== 'pushable'
                && ['pressure_plate', 'block_socket', 'beam_target'].includes(p.type));
            if (push && dest) {
                const yb = surfaceY(push.at.x, push.at.z);
                const yd = surfaceY(dest.at.x, dest.at.z);
                if (yb != null && yd != null && yb !== yd) {
                    notes.push(`block at y${yb} must reach ${dest.type} at y${yd} — a shove does not lift`);
                }
            }
        }

        // 3c. How WIDE is the way in?
        //
        // The owner's words were "the side rooms" — the reward alcoves — and
        // "this one is too close to what we are unlocking to be able to get in".
        // Every cell-level check above passes and the alcove is still a problem,
        // because the question none of them asks is how much room the doorway
        // leaves for a body. The hero's collision half-extent is 0.4, so a
        // one-cell mouth is a 1.0 gap with 0.1 of clearance per side.
        if (vault && gate) {
            const horiz = gate.rect.z0 === gate.rect.z1;
            let open = 0;
            if (horiz) {
                for (let x = gate.rect.x0; x <= gate.rect.x1; x++) {
                    if (surfaceY(x, gate.rect.z0) != null) open++;
                }
            } else {
                for (let z = gate.rect.z0; z <= gate.rect.z1; z++) {
                    if (surfaceY(gate.rect.x0, z) != null) open++;
                }
            }
            const clearance = (open * 1.0 - 0.8) / 2;
            if (open <= 1) {
                notes.push(`MOUTH ${open} cell wide — ${clearance.toFixed(2)} clearance per side for a 0.4 body`);
                nTightMouth++;
            }
        }

        // 4. With the gate open, the vault interior has to be enterable from the
        //    floor the player is standing on — and leavable again.
        if (vault && gate && start) {
            let anyOpenCell = false, touchesFloor = false;
            for (let x = vault.rect.x0; x <= vault.rect.x1; x++) {
                for (let z = vault.rect.z0; z <= vault.rect.z1; z++) {
                    if (!standable(x, z)) continue;
                    anyOpenCell = true;
                    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        if (seen.has(`${x + dx},${z + dz}`)) touchesFloor = true;
                    }
                }
            }
            if (anyOpenCell && !touchesFloor) {
                notes.push('VAULT INTERIOR TOUCHES NO REACHABLE FLOOR');
                nVaultSealed++;
            }
        }

        if (notes.length) {
            rows.push(`${def.id}/${roomId} half=${half} spawn=${sx},${sz} `
                + `vault=${vault ? `${vault.rect.x0}..${vault.rect.x1},${vault.rect.z0}..${vault.rect.z1}` : '-'}`);
            for (const n of notes) rows.push(`    ${n}`);

            // A picture of the room, because a list of coordinates has never
            // once explained WHY a cell is cut off.
            //   #  no surface at all        1-8 surface height (1 = floor)
            //   .  reachable from spawn     @ spawn   V vault   g gate
            //   P plate  S switch  K socket  B block  L lens  R beam source
            if (process.argv.includes('--map')) {
                const mark = new Map();
                if (vault) {
                    for (let x = vault.rect.x0; x <= vault.rect.x1; x++) {
                        for (let z = vault.rect.z0; z <= vault.rect.z1; z++) mark.set(`${x},${z}`, 'V');
                    }
                }
                if (gate) {
                    for (let x = gate.rect.x0; x <= gate.rect.x1; x++) {
                        for (let z = gate.rect.z0; z <= gate.rect.z1; z++) mark.set(`${x},${z}`, 'g');
                    }
                }
                const glyph = {
                    pressure_plate: 'P', switch: 'S', block_socket: 'K',
                    pushable: 'B', beam_target: 'L', beam_source: 'R',
                };
                for (const p of pieces) {
                    if (p.at && glyph[p.type]) mark.set(`${p.at.x},${p.at.z}`, glyph[p.type]);
                }
                mark.set(`${sx},${sz}`, '@');
                rows.push(`      z\\x ${Array.from({ length: 2 * half + 1 },
                    (_, i) => Math.abs((i - half) % 10)).join('')}`);
                for (let z = -half; z <= half; z++) {
                    let line = '';
                    for (let x = -half; x <= half; x++) {
                        const k = `${x},${z}`;
                        const m = mark.get(k);
                        if (m) { line += m; continue; }
                        const y = surfaceY(x, z);
                        if (y == null) line += '#';
                        else line += seen.has(k) ? (y > 1 ? String(y) : '.') : 'x';
                    }
                    rows.push(`      ${String(z).padStart(3)} ${line}`);
                }
                rows.push('      (x = standable but CUT OFF from the spawn)');
            }
        }
    }
}

for (const r of rows) console.log(r);
console.log('');
console.log(`unstandable ${nUnstandable}  unreachable ${nUnreachable}  `
    + `spawn-in-vault ${nSpawnTrapped}  sealed vaults ${nVaultSealed}  `
    + `one-cell mouths ${nTightMouth}`);
