// Draw a room the way the player meets it: what is solid, what a BODY fits in.
//
//   node tests/qa/room-map.mjs beat-07-sluice weepinghall
//
// This one exists because looking at the room found what four numeric probes
// could not. The two maps disagree on purpose: the first is the voxel field
// (heights, holes, pieces), the second is the collision world asked whether a
// 0.4 body fits at each cell CENTRE. Where they disagree, something is wrong —
// a chasm reads as walkable in the second because a hole is not a solid, and an
// alcove reads as three cells wide in the first while admitting a body to only
// one. Both of this session's findings showed up as a disagreement between
// these two pictures before they showed up as a number.
//
// Print-only. Not a gate.
import * as THREE from 'three';
import { createDungeon, ROOM_STRIDE } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { BEAT_LIST } from '../game/_beat-defs.mjs';

const BEAT = process.argv[2] || 'beat-07-sluice';
const ONLY = process.argv[3] || null;
const BODY = 0.4;

function keyStoreStub() {
    const open = new Set();
    return {
        isOpen: (id) => open.has(id), open: (id) => open.add(id),
        mapPickup: () => false, takeMapPickup() {},
        isPickupTaken: () => false, takePickup() {},
        visited: () => [], visit() {},
    };
}

const def = BEAT_LIST.find((d) => d.id === BEAT);
const cw = new CollisionWorld();
const level = createDungeon(
    { scene: new THREE.Scene(), collisionWorld: cw, particles: null },
    { ...def, prebake: true }, { keyStore: keyStoreStub() }
);

for (const [roomId, room] of Object.entries(def.rooms || {})) {
    if (ONLY && roomId !== ONLY) continue;
    const pieces = level.puzzleDefs(roomId);
    if (!pieces.length) continue;
    const half = room.half || 0;
    const ox = (room.grid?.[0] || 0) * ROOM_STRIDE;
    const oz = (room.grid?.[1] || 0) * ROOM_STRIDE;
    const vault = pieces.find((p) => p.type === 'vault');
    const gate = pieces.find((p) => p.type === 'timed_gate');

    console.log(`\n=== ${BEAT}/${roomId}  half=${half} origin=${ox},${oz} ===`);
    console.log(`hint: ${room.hint || '-'}`);
    console.log(pieces.map((p) => `${p.type}${p.at ? `@${p.at.x},${p.at.z}` : ''}`).join('  '));

    const surfaceY = (lx, lz) => {
        for (let top = 1; top <= 8; top++) {
            if (!level.getVoxelAt(ox + lx, top - 0.5, oz + lz)) continue;
            if (level.getVoxelAt(ox + lx, top + 0.5, oz + lz)) continue;
            if (level.getVoxelAt(ox + lx, top + 1.5, oz + lz)) continue;
            return top;
        }
        return null;
    };

    const mark = new Map();
    if (vault) for (let x = vault.rect.x0; x <= vault.rect.x1; x++) for (let z = vault.rect.z0; z <= vault.rect.z1; z++) mark.set(`${x},${z}`, 'V');
    if (gate) for (let x = gate.rect.x0; x <= gate.rect.x1; x++) for (let z = gate.rect.z0; z <= gate.rect.z1; z++) mark.set(`${x},${z}`, 'g');
    const glyph = { pressure_plate: 'P', switch: 'S', block_socket: 'K', pushable: 'B', beam_target: 'L', beam_source: 'R' };
    for (const p of pieces) if (p.at && glyph[p.type]) mark.set(`${p.at.x},${p.at.z}`, glyph[p.type]);
    mark.set(`${Math.round(room.spawn?.x || 0)},${Math.round(room.spawn?.z || 0)}`, '@');

    console.log('\n-- cells: height, # = no surface, letters = pieces --');
    console.log(`     ${Array.from({ length: 2 * half + 1 }, (_, i) => Math.abs((i - half) % 10)).join('')}`);
    for (let z = -half; z <= half; z++) {
        let line = '';
        for (let x = -half; x <= half; x++) {
            const m = mark.get(`${x},${z}`);
            if (m) { line += m; continue; }
            const y = surfaceY(x, z);
            line += y == null ? '#' : (y > 1 ? String(y) : '.');
        }
        console.log(`${String(z).padStart(4)} ${line}`);
    }

    // Where can a 0.4 BODY actually stand? Sampled at cell centres, which is
    // where a cell really is: cell (x,z) spans world [x,x+1].
    console.log('\n-- a 0.4 body at each cell CENTRE: . fits, X does not --');
    console.log(`     ${Array.from({ length: 2 * half + 1 }, (_, i) => Math.abs((i - half) % 10)).join('')}`);
    for (let z = -half; z <= half; z++) {
        let line = '';
        for (let x = -half; x <= half; x++) {
            line += cw.blocked(ox + x + 0.5, oz + z + 0.5, BODY) ? 'X' : '.';
        }
        console.log(`${String(z).padStart(4)} ${line}`);
    }

    // And where each puzzle piece's ENTITY point lands relative to that grid.
    for (const p of pieces) {
        if (!p.at) continue;
        const bx = cw.blocked(ox + p.at.x, oz + p.at.z, BODY);
        console.log(`  ${p.type} entity point ${p.at.x},${p.at.z} -> body blocked? ${bx}`
            + `   (cell centre would be ${p.at.x + 0.5},${p.at.z + 0.5})`);
    }
}
