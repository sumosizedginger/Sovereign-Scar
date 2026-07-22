// tests/game/room-transition-entry.spec.mjs
// A room transition drops the player at a FIXED point 2.5 units in from the
// door gap. Whatever dressing a room happens to place there — a magma vent, a
// plinth, a basalt shelf — used to swallow the player on arrival: you walked
// out of a room and materialised inside a wall. Found by hand leaving Beat 12's
// boss area; the sweep showed 18 such landings across the game, including three
// boss-room exits (witnesscrown, moothall, prayerhollow).
//
// room-graph now ring-searches for the nearest cell that fits the body. This
// spec reproduces the landing formula and asserts that for EVERY transition a
// body-clear cell exists within the search radius, so no exit can strand the
// player.

import * as THREE from 'three';
import { CollisionWorld } from '../../src/engine/collision.js';
import { LEVELS } from '../../src/game/levels/registry.js';
import { doorCells } from '../../src/game/world/room-graph.js';
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

const SIDE_NORMAL = { N: { x: 0, z: -1 }, S: { x: 0, z: 1 }, W: { x: -1, z: 0 }, E: { x: 1, z: 0 } };
const DEFS = [
    BEAT01_DEF, BEAT02_DEF, BEAT03_DEF, BEAT04_DEF, BEAT05_DEF, BEAT06_DEF, BEAT07_DEF,
    BEAT08_DEF, BEAT09_DEF, BEAT10_DEF, BEAT11_DEF, BEAT12_DEF, BEAT13_DEF, BEAT14_DEF,
];

export function run(t) {
    let transitions = 0, corrected = 0;
    const unresolvable = [];

    for (const def of DEFS) {
        const meta = LEVELS.find((l) => l.id === def.id);
        const level = meta.load({
            scene: new THREE.Scene(),
            collisionWorld: new CollisionWorld(),
            particles: { spawn() {}, burst() {}, update() {} },
            player: { root: { position: { x: 0, y: 0, z: 0 } } },
            camera: new THREE.PerspectiveCamera(),
            renderer: null,
        });

        // The hero spans cells 1 and 2 above a floor whose top is y=1.
        const clearForBody = (x, z) => level.getVoxelAt(x, 0.5, z)
            && !level.getVoxelAt(x, 1.5, z)
            && !level.getVoxelAt(x, 2.5, z);

        for (const [fromId, room] of Object.entries(def.rooms)) {
            for (const d of room.doors || []) {
                const to = def.rooms[d.to];
                if (!to) continue;
                const back = (to.doors || []).find((b) => b.to === fromId);
                if (!back) continue;
                transitions++;

                const o = { x: to.grid[0] * 64, z: to.grid[1] * 64 };
                const cells = doorCells(to, back);
                const cx = cells.reduce((s, c) => s + c.x, 0) / cells.length;
                const cz = cells.reduce((s, c) => s + c.z, 0) / cells.length;
                const n = SIDE_NORMAL[back.side];
                const e = { x: o.x + cx + 0.5 - n.x * 2.5, z: o.z + cz + 0.5 - n.z * 2.5 };

                // Relocating a landing must not park the player inside one of
                // the destination's own door triggers, or the door re-fires on
                // arrival and bounces them straight back — the GUMOI boss room
                // became inescapable exactly this way.
                const inTrigger = (x, z) => {
                    const reach = 1.7;
                    for (const door of to.doors || []) {
                        const w = (door.width || 2) / 2 + 0.5;
                        const dc = doorCells(to, door);
                        const dcx = o.x + dc.reduce((s, c) => s + c.x, 0) / dc.length + 0.5;
                        const dcz = o.z + dc.reduce((s, c) => s + c.z, 0) / dc.length + 0.5;
                        if (door.side === 'N' || door.side === 'S') {
                            const wallZ = door.side === 'N'
                                ? o.z - to.half + 0.5 : o.z + to.half + 0.5;
                            const outward = door.side === 'N'
                                ? z < wallZ + reach : z > wallZ - reach;
                            if (outward && Math.abs(x - dcx) < w) return true;
                        } else {
                            const wallX = door.side === 'W'
                                ? o.x - to.half + 0.5 : o.x + to.half + 0.5;
                            const outward = door.side === 'W'
                                ? x < wallX + reach : x > wallX - reach;
                            if (outward && Math.abs(z - dcz) < w) return true;
                        }
                    }
                    return false;
                };
                const usable = (x, z) => clearForBody(x, z) && !inTrigger(x, z);

                if (usable(e.x, e.z)) continue;
                corrected++;
                // room-graph's ring search must find somewhere that fits AND
                // does not sit in a door trigger.
                const maxR = Math.max(6, to.half);
                let found = false;
                for (let r = 1; r <= maxR && !found; r++) {
                    for (let dx = -r; dx <= r && !found; dx++) {
                        for (let dz = -r; dz <= r && !found; dz++) {
                            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                            if (usable(e.x + dx, e.z + dz)) found = true;
                        }
                    }
                }
                if (!found) unresolvable.push(`${def.id}:${fromId}->${d.to}`);
            }
        }
    }

    t.ok('swept every room transition', transitions >= 80, `n=${transitions}`);
    t.ok('every transition lands somewhere that fits the body AND cannot re-fire a door',
        unresolvable.length === 0, unresolvable.join(' '));
    // Informational: how many raw landings the ring search has to rescue.
    t.ok('raw landing spots needing correction are known',
        corrected >= 0, `corrected=${corrected}/${transitions}`);
}
