// tests/game/camera-contract.spec.mjs — Z1.
//
// The camera and the level geometry were in an unresolved argument. The rig
// sits at height 17.5 looking down; the levels kept building upward. Three
// separate hand-found bugs came out of that one disagreement in a single
// session — a ten-cell spiral that eclipsed a boss arena, arch lintels that
// swallow the player walking under them, and staged platforms nobody could
// see past.
//
// A Link to the Past screen is essentially flat: elevation exists as ledges
// you drop off, never as mass between the lens and the player. This spec is
// that rule with a number attached.
//
// THE CONTRACT
//   Over any cell the player can stand on, solid voxels at or above CEILING_Y
//   form a "canopy". Canopies up to MAX_CANOPY cells are pillars, arch
//   uprights, crystals — thin verticals you see around. Anything larger is a
//   roof, and a roof over the play space is a bug no matter how pretty.

import * as THREE from 'three';
import { CollisionWorld } from '../../src/engine/collision.js';
import { LEVELS } from '../../src/game/levels/registry.js';
import { BEAT_LIST } from './_beat-defs.mjs';

/** Player rig is ~1.9 tall on a floor whose top is y=1, so it occupies 1–2. */
export const CEILING_Y = 3;
/** Largest contiguous overhead footprint still readable as a vertical, in cells. */
export const MAX_CANOPY = 4;

/**
 * Connected clusters of overhead mass above standable floor, largest first.
 * Exported so the qa probe can report the same numbers the spec enforces.
 */
export function overheadClusters(level, room) {
    const ox = room.grid[0] * 64, oz = room.grid[1] * 64;
    const H = room.half - 1;

    // A cell counts only if the player could actually be underneath it: floor
    // to stand on, and a clear body column. Overhead mass above a solid wall
    // is just a wall, and blocks nothing the player was going to see.
    const overhead = new Set();
    for (let lx = -H; lx <= H; lx++) {
        for (let lz = -H; lz <= H; lz++) {
            const x = ox + lx, z = oz + lz;
            if (!level.getVoxelAt(x, 0.5, z)) continue;
            if (level.getVoxelAt(x, 1.5, z) || level.getVoxelAt(x, 2.5, z)) continue;
            for (let y = CEILING_Y + 0.5; y < 16; y += 1) {
                if (level.getVoxelAt(x, y, z)) { overhead.add(`${lx},${lz}`); break; }
            }
        }
    }

    const clusters = [];
    const seen = new Set();
    for (const key of overhead) {
        if (seen.has(key)) continue;
        const cells = [];
        const queue = [key];
        seen.add(key);
        while (queue.length) {
            const k = queue.pop();
            cells.push(k);
            const [cx, cz] = k.split(',').map(Number);
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nk = `${cx + dx},${cz + dz}`;
                if (overhead.has(nk) && !seen.has(nk)) { seen.add(nk); queue.push(nk); }
            }
        }
        let topY = 0;
        for (const k of cells) {
            const [cx, cz] = k.split(',').map(Number);
            for (let y = CEILING_Y + 0.5; y < 16; y += 1) {
                if (level.getVoxelAt(ox + cx, y, oz + cz)) topY = Math.max(topY, Math.floor(y) + 1);
            }
        }
        clusters.push({ size: cells.length, cells, topY });
    }
    clusters.sort((a, b) => b.size - a.size);
    return clusters;
}

export function run(t) {
    const offenders = [];
    let rooms = 0, clustersSeen = 0, largest = 0;

    for (const def of BEAT_LIST) {
        const level = LEVELS.find((l) => l.id === def.id).load({
            scene: new THREE.Scene(),
            collisionWorld: new CollisionWorld(),
            particles: { spawn() {}, burst() {}, update() {} },
            player: { root: { position: { x: 0, y: 0, z: 0 } } },
            camera: new THREE.PerspectiveCamera(),
            renderer: null,
        });

        for (const [rid, room] of Object.entries(def.rooms)) {
            rooms++;
            for (const c of overheadClusters(level, room)) {
                clustersSeen++;
                largest = Math.max(largest, c.size);
                if (c.size > MAX_CANOPY) {
                    offenders.push(`${def.id}:${rid}(${c.size}cells@y${c.topY})`);
                }
            }
        }
    }

    t.ok('swept every room in the campaign', rooms >= 100, `rooms=${rooms}`);
    t.ok('the sweep actually found overhead geometry to judge',
        clustersSeen > 0, `clusters=${clustersSeen}`);
    t.ok('no room roofs its own play space',
        offenders.length === 0,
        `${offenders.length} canopies: ${offenders.slice(0, 8).join(' ')}`);
    t.ok('the largest overhead cluster still reads as a vertical',
        largest <= MAX_CANOPY, `largest=${largest}`);
}
