// Is any enemy standing INSIDE the floor it is supposed to be standing on?
//
//   node tests/qa/enemy-ground.mjs
//
// The owner's report: "Enemies do not step up onto terrain like the player
// does, this can cause them to be hidden in the blocks."
//
// They were right, and the cause was that enemies had no Y at all. `_move`
// resolved X and Z against the collision world and nothing ever wrote
// `rig.position.y` after the spawn set it to a flat 1.0 — while Phase E2 put
// terraces in every room, in the PLATFORM map, which is meshed deliberately
// without XZ solids so a step is standable and can never wall anything off.
// So the one kind of geometry an enemy could walk into was also the one kind
// its mover could not see.
//
// Print-only. Reports bodies that are submerged where they SPAWN, and bodies
// that submerge after being driven across the room.

import * as THREE from 'three';
import { createDungeon } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { BEAT_LIST } from '../game/_beat-defs.mjs';

function keyStoreStub() {
    const open = new Set();
    return {
        isOpen: (id) => open.has(id), open: (id) => open.add(id),
        mapPickup: () => false, takeMapPickup() {},
        isPickupTaken: () => false, takePickup() {},
        visited: () => [], visit() {},
    };
}

let spawned = 0, buriedAtSpawn = 0, buriedAfterWalk = 0;
const examples = [];

for (const def of BEAT_LIST) {
    let level;
    try {
        level = createDungeon(
            { scene: new THREE.Scene(), collisionWorld: new CollisionWorld(), particles: null },
            { ...def, prebake: true }, { keyStore: keyStoreStub() }
        );
    } catch (e) {
        console.log(`${def.id}: BAKE FAILED ${e.message}`);
        continue;
    }

    // Submerged = there is solid voxel where the body's chest is.
    const submerged = (e) => {
        const p = e.rig.position;
        return !!level.getVoxelAt(p.x, p.y + 0.5, p.z);
    };

    for (const e of level.enemies || []) {
        if (!e?.rig || e.hover) continue;
        spawned++;
        if (submerged(e)) {
            buriedAtSpawn++;
            if (examples.length < 8) {
                examples.push(`spawn  ${def.id} ${e.kind || '?'} `
                    + `@${e.rig.position.x.toFixed(1)},${e.rig.position.y.toFixed(1)},${e.rig.position.z.toFixed(1)}`);
            }
        }
    }

    // Drive each body a long way in eight directions and see where it ends up.
    // A chaser crosses the whole room over a fight; the interesting cell is
    // never the one it started on.
    for (const e of level.enemies || []) {
        if (!e?.rig || e.hover || !e._move) continue;
        const home = { ...e.rig.position };
        let bad = false;
        for (let a = 0; a < 8 && !bad; a++) {
            e.rig.position.set(home.x, home.y, home.z);
            const dx = Math.cos((a / 8) * Math.PI * 2);
            const dz = Math.sin((a / 8) * Math.PI * 2);
            for (let step = 0; step < 60; step++) {
                e._move(dx, dz, 1, 0.25);
                if (submerged(e)) {
                    bad = true;
                    if (examples.length < 8) {
                        examples.push(`walked ${def.id} ${e.kind || '?'} `
                            + `@${e.rig.position.x.toFixed(1)},${e.rig.position.y.toFixed(1)},${e.rig.position.z.toFixed(1)}`);
                    }
                    break;
                }
            }
        }
        e.rig.position.set(home.x, home.y, home.z);
        if (bad) buriedAfterWalk++;
    }
}

console.log(`walking enemies       : ${spawned}`);
console.log(`  buried at spawn     : ${buriedAtSpawn}`);
console.log(`  buried after walking: ${buriedAfterWalk}`);
for (const e of examples) console.log(`    ${e}`);
