// tests/qa/overhead-mass.mjs — Z1 probe.
//
// Reports contiguous overhead mass sitting above standable floor, per room.
// Run: node tests/qa/overhead-mass.mjs [--all]
//
// The camera rig sits at height 17.5 looking down. Anything solid above the
// play space lands between the lens and the fight. A pillar is fine — you see
// past it. A roof is not.

import * as THREE from 'three';
import { CollisionWorld } from '../../src/engine/collision.js';
import { LEVELS } from '../../src/game/levels/registry.js';
import { BEAT_LIST } from '../game/_beat-defs.mjs';
import { overheadClusters, CEILING_Y, MAX_CANOPY } from '../game/camera-contract.spec.mjs';

const showAll = process.argv.includes('--all');
let worst = 0;

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
        const clusters = overheadClusters(level, room);
        if (!clusters.length) continue;
        const biggest = clusters[0];
        worst = Math.max(worst, biggest.size);
        if (showAll || biggest.size > MAX_CANOPY) {
            const flag = biggest.size > MAX_CANOPY ? 'CANOPY' : 'ok';
            console.log(
                `${flag.padEnd(7)} ${def.id}:${rid}`.padEnd(46),
                `clusters=${clusters.length}`,
                `largest=${biggest.size}`,
                `topY=${biggest.topY}`
            );
        }
    }
}

console.log(`\nceiling y=${CEILING_Y}  max canopy=${MAX_CANOPY}  worst cluster seen=${worst}`);
