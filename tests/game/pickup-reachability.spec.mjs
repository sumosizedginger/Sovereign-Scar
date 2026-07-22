// tests/game/pickup-reachability.spec.mjs
// Every pickup in every dungeon must sit in open air ON something — never
// embedded inside solid geometry.
//
// Regression guard for a whole class of progression bug found by hand:
//   - Beat 10's boss key spawned at local z -7.5 in a half-8 room, i.e. cell -8
//     (the north wall row) at the side-N boss door — so it materialised INSIDE
//     the locked boss-door plug. You needed the key to open the door that
//     contained the key: an unwinnable run.
//   - Beat 01's boss key and Beat 02's cache were buried inside their own
//     pedestals; Beat 03's and Beat 12's caches were inside a wall and a
//     basalt fan.
// Levels bake headlessly (no GL needed for BufferGeometry), so this is a fast
// unit check rather than an e2e.

import * as THREE from 'three';
import { CollisionWorld } from '../../src/engine/collision.js';
import { LEVELS } from '../../src/game/levels/registry.js';

function buildLevel(meta) {
    return meta.load({
        scene: new THREE.Scene(),
        collisionWorld: new CollisionWorld(),
        particles: { spawn() {}, burst() {}, update() {} },
        player: { root: { position: { x: 0, y: 0, z: 0 } } },
        camera: new THREE.PerspectiveCamera(),
        renderer: null,
    });
}

export function run(t) {
    const beats = LEVELS.filter((l) => /^beat-/.test(l.id));
    t.ok('all fourteen beats present', beats.length === 14, `n=${beats.length}`);

    let checked = 0;
    const buried = [];
    const floating = [];

    for (const meta of beats) {
        let level;
        try {
            level = buildLevel(meta);
        } catch (e) {
            t.ok(`${meta.id} bakes headlessly`, false, e.message);
            continue;
        }
        for (const p of level.pickups || []) {
            const pos = (p.mesh || p).position;
            if (!pos) continue;
            checked++;
            const label = `${meta.id}:${p.label || 'pickup'}`;
            // Not embedded in geometry.
            if (level.getVoxelAt(pos.x, pos.y, pos.z)) {
                buried.push(`${label}@y${pos.y}`);
            }
            // Resting on something within a few cells (never adrift over void).
            let supported = false;
            for (let d = 0.5; d <= 3; d += 0.5) {
                if (level.getVoxelAt(pos.x, pos.y - d, pos.z)) { supported = true; break; }
            }
            if (!supported) floating.push(`${label}@y${pos.y}`);
        }
    }

    t.ok('every dungeon exposed pickups to check', checked >= 60, `checked=${checked}`);
    t.ok('no pickup is buried inside solid geometry', buried.length === 0, buried.join(' '));
    t.ok('no pickup floats unsupported over void', floating.length === 0, floating.join(' '));
}
