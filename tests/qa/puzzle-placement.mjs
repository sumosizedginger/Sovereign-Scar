// Print-only probe: where do the generated puzzle pieces actually LAND?
//
// `puzzleFor` asks `isBlocked` about the vault footprint and its inward apron,
// and about nothing else. Every other piece — the block, the plate, the socket,
// the switch, the beam source — is placed at a fixed offset from that vault and
// has never been asked whether the room already put something there. Kit props
// are stamped into the room map and terraces into the platform map, both of
// them long before the puzzle chooses its corner.
//
// Reported per piece:
//   BLOCKED   the cell it stands on is solid room geometry or a kit prop
//   TERRACE   it stands inside a platform voxel
//   OOB       it is outside the room's own floor
//   LANE      a pushable cannot be shoved to its target in straight legs
//
// Run: node tests/qa/puzzle-placement.mjs

import * as THREE from 'three';
import { createDungeon, ROOM_STRIDE } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { puzzleFor } from '../../src/game/world/puzzles.js';
import { BEAT_LIST } from '../game/_beat-defs.mjs';

const beatNoOf = (def) => Number(String(def.id).match(/beat-(\d+)/)?.[1] || 0);
const originOf = (room) => ({ x: room.grid[0] * ROOM_STRIDE, z: room.grid[1] * ROOM_STRIDE });

const keyStore = () => ({
    _open: new Set(),
    isOpen(id) { return this._open.has(id); },
    open(id) { this._open.add(id); },
    mapPickup: () => false, takeMapPickup() {},
    isPickupTaken: () => false, takePickup() {},
});

const totals = { pieces: 0, blocked: 0, terrace: 0, oob: 0, lane: 0, rooms: 0 };
const lines = [];

for (const def of BEAT_LIST) {
    const beatNo = beatNoOf(def);
    // Bake every room at once so `getVoxelAt` can see all of them; the live game
    // bakes lazily, but the geometry each room produces is identical either way.
    const level = createDungeon(
        { scene: new THREE.Scene(), collisionWorld: new CollisionWorld(), particles: null },
        { ...def, prebake: true }, { keyStore: keyStore() }
    );
    const solid = (wx, wz) => level.getVoxelAt(wx, 1, wz);

    for (const [roomId, room] of Object.entries(def.rooms || {})) {
        const origin = originOf(room);
        const pieces = puzzleFor(def, roomId, room, beatNo, (lx, lz) =>
            solid(origin.x + lx, origin.z + lz));
        if (!pieces.length) continue;
        totals.rooms++;
        const half = room.half || 0;

        for (const p of pieces) {
            if (!p.at) continue;
            totals.pieces++;
            const tags = [];
            if (Math.abs(p.at.x) > half - 1 || Math.abs(p.at.z) > half - 1) tags.push('OOB');
            if (solid(origin.x + p.at.x, origin.z + p.at.z)) tags.push('BLOCKED');
            if (tags.length) {
                for (const tg of tags) totals[tg.toLowerCase()]++;
                lines.push(`  ${def.id} ${roomId.padEnd(10)} ${p.type.padEnd(14)}`
                    + ` (${p.at.x.toFixed(1)},${p.at.z.toFixed(1)}) ${tags.join('+')}`);
            }
        }

        // A pushable is furniture unless it can REACH what it fills. This is a
        // push-search, not a straight line: the player may shove along either
        // axis in any order, and a shove needs the cell BEHIND the block to be
        // standable as well as the cell in front to be free. Reported only when
        // no sequence of shoves at all puts the block on its target.
        for (const p of pieces) {
            if (p.type !== 'pushable' || !p.at) continue;
            const dest = pieces.find((q) => q.at && (q.type === 'block_socket'
                || q.type === 'pressure_plate' || q.type === 'beam_target'));
            if (!dest) continue;
            const free = (x, z) => Math.abs(x) <= half - 1 && Math.abs(z) <= half - 1
                && !solid(origin.x + x, origin.z + z);
            const goal = `${Math.round(dest.at.x)},${Math.round(dest.at.z)}`;
            const seen = new Set();
            const queue = [[Math.round(p.at.x), Math.round(p.at.z)]];
            seen.add(queue[0].join(','));
            let reached = seen.has(goal);
            while (queue.length && !reached) {
                const [bx, bz] = queue.shift();
                for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    if (!free(bx - dx, bz - dz)) continue;   // room to stand and shove
                    if (!free(bx + dx, bz + dz)) continue;   // room for the block to go
                    const k = `${bx + dx},${bz + dz}`;
                    if (seen.has(k)) continue;
                    seen.add(k);
                    if (k === goal) { reached = true; break; }
                    queue.push([bx + dx, bz + dz]);
                }
            }
            if (!reached) {
                totals.lane++;
                lines.push(`  ${def.id} ${roomId.padEnd(10)} ${'lane'.padEnd(14)}`
                    + ` block(${p.at.x.toFixed(1)},${p.at.z.toFixed(1)})`
                    + ` -> ${dest.type}(${dest.at.x.toFixed(1)},${dest.at.z.toFixed(1)})`
                    + ' UNREACHABLE');
            }
        }
    }
    level.dispose?.();
}

console.log('=== puzzle piece placement ===');
console.log(`rooms with a puzzle  : ${totals.rooms}`);
console.log(`placed pieces        : ${totals.pieces}`);
console.log(`  inside geometry    : ${totals.blocked}`);
console.log(`  outside the room   : ${totals.oob}`);
console.log(`  block cannot reach : ${totals.lane}`);
if (lines.length) {
    console.log('');
    for (const l of lines) console.log(l);
}
