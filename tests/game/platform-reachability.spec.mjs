// tests/game/platform-reachability.spec.mjs
// Geometry declared in a room's platforms() is walkable staging by contract —
// it carries no XZ collision precisely because the player is meant to STAND on
// it. So every platform cell must be reachable from the floor by the physics'
// one-cell step-up.
//
// Regression guard for the GUMOI crown: its arena stacked five slabs TWO cells
// apart (tops 2/4/6/8/10). The step climbs one cell, so everything above the
// first slab was scenery the player could never stand on — and the Witness
// perched on the topmost one. Found by hand ("there are useless platforms in
// this room").
//
// build() geometry is deliberately NOT checked: that is walls and shelving,
// which is supposed to be unclimbable.

import * as THREE from 'three';
import { CollisionWorld } from '../../src/engine/collision.js';
import { LEVELS } from '../../src/game/levels/registry.js';
import { fillBox } from '../../src/voxel/helpers.js';
import { stampMap } from '../../src/game/assets/props.js';
import { CRUST_COLORS, ABYSS_COLORS } from '../../src/game/assets/palettes.js';
import { BEAT01_DEF } from '../../src/game/levels/beat-01-crypt.js';
import { BEAT02_DEF } from '../../src/game/levels/beat-02-spindle.js';
import { BEAT03_DEF } from '../../src/game/levels/beat-03-sink.js';
import { BEAT04_DEF } from '../../src/game/levels/beat-04-sky.js';
import { BEAT05_DEF } from '../../src/game/levels/beat-05-citadel.js';
import { BEAT06_DEF } from '../../src/game/levels/beat-06-quarry.js';
import { BEAT07_DEF } from '../../src/game/levels/beat-07-sluice.js';
import { BEAT08_DEF } from '../../src/game/levels/beat-08-bone.js';
import { BEAT09_DEF } from '../../src/game/levels/beat-09-town.js';
import { BEAT10_DEF } from '../../src/game/levels/beat-10-cryo.js';
import { BEAT11_DEF } from '../../src/game/levels/beat-11-mire.js';
import { BEAT12_DEF } from '../../src/game/levels/beat-12-pyre.js';
import { BEAT13_DEF } from '../../src/game/levels/beat-13-gumoi.js';
import { BEAT14_DEF } from '../../src/game/levels/beat-14-leviathan.js';

const DEFS = [
    BEAT01_DEF, BEAT02_DEF, BEAT03_DEF, BEAT04_DEF, BEAT05_DEF, BEAT06_DEF, BEAT07_DEF,
    BEAT08_DEF, BEAT09_DEF, BEAT10_DEF, BEAT11_DEF, BEAT12_DEF, BEAT13_DEF, BEAT14_DEF,
];
const STEP = 1; // VoxelPhysicsBody MAX_STEP_HEIGHT, in cells

export function run(t) {
    let rooms = 0, platformCells = 0;
    const stranded = [];

    for (const def of DEFS) {
        const level = LEVELS.find((l) => l.id === def.id).load({
            scene: new THREE.Scene(),
            collisionWorld: new CollisionWorld(),
            particles: { spawn() {}, burst() {}, update() {} },
            player: { root: { position: { x: 0, y: 0, z: 0 } } },
            camera: new THREE.PerspectiveCamera(),
            renderer: null,
        });

        for (const [rid, room] of Object.entries(def.rooms)) {
            if (!room.platforms) continue;
            rooms++;

            // Which columns does platforms() actually contribute?
            const pmap = new Map();
            room.platforms(pmap, {
                fillBox, stampMap, CRUST_COLORS, ABYSS_COLORS, half: room.half,
            });
            const platformCols = new Set();
            for (const k of pmap.keys()) {
                const [x, , z] = k.split(',').map(Number);
                platformCols.add(x + ',' + z);
            }

            // Surface height per column over the FULL baked room.
            const ox = room.grid[0] * 64, oz = room.grid[1] * 64, H = room.half - 1;
            const tops = new Map();
            for (let lx = -H; lx <= H; lx++) {
                for (let lz = -H; lz <= H; lz++) {
                    let top = 0;
                    for (let y = 0.5; y < 14; y += 1) {
                        if (level.getVoxelAt(ox + lx, y, oz + lz)) top = Math.floor(y) + 1;
                    }
                    tops.set(lx + ',' + lz, top || 1);
                }
            }

            // Flood fill from floor level, climbing at most STEP per move.
            const reach = new Set();
            const queue = [];
            for (const [k, top] of tops) if (top === 1) { reach.add(k); queue.push(k); }
            while (queue.length) {
                const k = queue.pop();
                const [lx, lz] = k.split(',').map(Number);
                const cur = tops.get(k);
                for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nk = (lx + dx) + ',' + (lz + dz);
                    if (!tops.has(nk) || reach.has(nk)) continue;
                    if (tops.get(nk) - cur <= STEP) { reach.add(nk); queue.push(nk); }
                }
            }

            for (const k of platformCols) {
                if (!tops.has(k)) continue; // outside the sampled interior
                platformCells++;
                if (!reach.has(k)) stranded.push(`${def.id}:${rid}@${k}`);
            }
        }
    }

    t.ok('swept every room that declares platforms()', rooms >= 15, `rooms=${rooms}`);
    t.ok('platform staging was actually sampled', platformCells >= 100, `cells=${platformCells}`);
    t.ok('no platforms() cell is stranded above the step height',
        stranded.length === 0, `${stranded.length} stranded: ${stranded.slice(0, 6).join(' ')}`);
}
