// Hit the switch. Does the gate open?
//
//   node tests/qa/switch-works.mjs
//
// The owner, on beat 08: "Switch does not work in one room, the other room does
// not even have a switch."
//
// Two questions, and no probe has asked either:
//
//   1. WIRING. Does every `timed_gate` have something in its own room that can
//      drive its signal? A gate with no driver is a sealed reward with no puzzle
//      — "the other room does not even have a switch".
//   2. REACH AND EFFECT. A switch is STRUCK: it rides `level.destructibles` and
//      `shatterAtWorld` refuses anything further than 2.0 away. So it has to be
//      standable-adjacent AND the strike has to actually drop the gate. Every
//      earlier probe checked that the switch's cell was free and stopped there.
//
// This drives the real runtime: enter the room, find the switch's own
// destructible, strike it at its own position, tick the level, and read the gate
// out of the voxel field.
//
// Print-only. Not a gate.

import * as THREE from 'three';
import { createDungeon, ROOM_STRIDE } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { BEAT_LIST } from '../game/_beat-defs.mjs';

const MID = 0.5;
const BODY = 0.4;
const DRIVERS = new Set(['switch', 'pressure_plate', 'block_socket', 'beam_target']);

// Ticking the real level runs the real rooms, and beat 04 reaches for parts of
// the key store the read-only stubs elsewhere never needed.
function keyStoreStub() {
    const open = new Set();
    return {
        isOpen: (id) => open.has(id), open: (id) => open.add(id),
        mapPickup: () => false, takeMapPickup() {}, markMapPickup() {},
        isPickupTaken: () => false, takePickup() {}, markPickup() {},
        visited: () => [], visit() {},
        hasMap: () => false, giveMap() {},
    };
}

const rows = [];
let nGates = 0, nUnwired = 0, nSwitches = 0, nDead = 0, nUnreachable = 0, nOnSpawn = 0;

for (const def of BEAT_LIST) {
    let level, cw;
    try {
        cw = new CollisionWorld();
        level = createDungeon(
            { scene: new THREE.Scene(), collisionWorld: cw, particles: null },
            { ...def, prebake: true }, { keyStore: keyStoreStub() }
        );
    } catch (e) { rows.push(`${def.id}: BAKE FAILED ${e}`); continue; }

    for (const [roomId, room] of Object.entries(def.rooms || {})) {
        const defs = level.puzzleDefs ? level.puzzleDefs(roomId) : [];
        if (!defs.length) continue;
        const ox = (room.grid?.[0] || 0) * ROOM_STRIDE;
        const oz = (room.grid?.[1] || 0) * ROOM_STRIDE;
        const gates = defs.filter((d) => d.type === 'timed_gate');
        const drivers = defs.filter((d) => DRIVERS.has(d.type));
        const notes = [];

        // ── 0. is a piece standing on the player's own spawn? ──────────────
        //
        // `settle` treats pickups and enemy spawns as soft occupancy and has
        // never known where the PLAYER arrives. The develop switch is authored
        // five units diagonally out from the vault, which in a half-7 room lands
        // exactly on 0,0 — `gravecanopy` puts its switch inside the hero's own
        // body on entry, which is not a switch you find, it is scenery you are
        // standing in.
        const spx = Math.round(room.spawn?.x || 0);
        const spz = Math.round(room.spawn?.z || 0);
        for (const d of defs) {
            if (!d.at) continue;
            const dist = Math.hypot(d.at.x - spx, d.at.z - spz);
            if (dist < 1.5) {
                nOnSpawn++;
                notes.push(`${d.type}@${d.at.x},${d.at.z} IS ON THE PLAYER'S SPAWN `
                    + `(${spx},${spz}, ${dist.toFixed(2)} away) — they arrive standing in it`);
            }
        }

        // ── 1. wiring ──────────────────────────────────────────────────────
        for (const g of gates) {
            nGates++;
            const driven = drivers.filter((d) => d.signal === g.signal);
            if (!driven.length) {
                nUnwired++;
                notes.push(`GATE WITH NO DRIVER — signal "${g.signal}" is set by nothing in this room`
                    + `  (pieces: ${defs.map((d) => d.type).join(',')})`);
            }
        }

        // ── 2. does striking the switch open it? ───────────────────────────
        const switches = defs.filter((d) => d.type === 'switch' && d.at);
        if (switches.length) {
            level.enterRoom(roomId, null);
            for (const s of switches) {
                nSwitches++;
                const at = { x: ox + s.at.x, z: oz + s.at.z };
                const g = gates.find((q) => q.signal === s.signal);
                const cellSolid = (lx, lz) =>
                    !!level.getVoxelAt(ox + lx + MID, 1.5, oz + lz + MID);
                const gateShut = () => {
                    if (!g) return null;
                    for (let x = g.rect.x0; x <= g.rect.x1; x++) {
                        for (let z = g.rect.z0; z <= g.rect.z1; z++) {
                            if (cellSolid(x, z)) return true;
                        }
                    }
                    return false;
                };
                // Can a body even stand next to it? `shatterAtWorld` refuses
                // beyond 2.0, so the hero has to get within that of the post.
                let stand = null;
                for (let r = 0.6; r <= 1.8 && !stand; r += 0.2) {
                    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const px = at.x + dx * r, pz = at.z + dz * r;
                        if (cw.blocked(px, pz, BODY)) continue;
                        if (!level.getVoxelAt(px, 0.5, pz)) continue;   // ground
                        if (level.getVoxelAt(px, 1.5, pz)) continue;    // body room
                        stand = { x: px, z: pz, r };
                        break;
                    }
                }
                if (!stand) {
                    nUnreachable++;
                    notes.push(`SWITCH@${s.at.x},${s.at.z} HAS NOWHERE TO STAND within 1.8 — it cannot be struck`);
                    continue;
                }
                const shut0 = gateShut();
                // Strike it the way a WEAPON does, from where a body can stand.
                //
                // The first version called `shatterAtWorld` at the switch's own
                // coordinates — distance zero, which always passes the 2.0 gate
                // and tests nothing the player experiences. `_strike` projects the
                // hit 1.2 ahead of the hero along their facing, so the honest
                // question is whether a strike thrown from standable ground lands
                // inside the post's radius.
                const dirx = (at.x - stand.x), dirz = (at.z - stand.z);
                const dlen = Math.hypot(dirx, dirz) || 1;
                const hx = stand.x + (dirx / dlen) * 1.2;
                const hz = stand.z + (dirz / dlen) * 1.2;
                let took = 0;
                for (const d of level.destructibles || []) {
                    if (!d?.struckByAnything || typeof d.shatterAtWorld !== 'function') continue;
                    took += d.shatterAtWorld(hx, 1.6, hz, 2.0) || 0;
                }
                const pos = { x: stand.x, y: 1.95, z: stand.z };
                const gameStub = {
                    player: {
                        root: { position: pos },
                        rig: { position: pos },
                        grapple: { active: false },
                        dashTimer: 0,
                        health: { hp: 10, max: 10 },
                        state: { current: 'IDLE', facingVec: { x: 0, z: 1 } },
                        inventory: { has: () => true, hasItem: () => true },
                    },
                    input: { moveVector: () => ({ x: 0, z: 0 }) },
                };
                for (let i = 0; i < 6; i++) level.update(1 / 60, gameStub);
                const shut1 = gateShut();
                if (!took) {
                    nDead++;
                    notes.push(`SWITCH@${s.at.x},${s.at.z} IS NOT ON THE DESTRUCTIBLE LIST — a strike cannot reach it`);
                } else if (g && shut0 === true && shut1 === true) {
                    nDead++;
                    notes.push(`SWITCH@${s.at.x},${s.at.z} STRUCK (${took}) AND THE GATE STAYED SHUT`
                        + `  signal="${s.signal}" hold=${s.hold ?? 'default'}`);
                } else if (g && shut0 === false) {
                    notes.push(`(switch@${s.at.x},${s.at.z}: gate was already open before the strike)`);
                }
            }
        }

        if (notes.length) {
            rows.push(`${def.id}/${roomId}  pieces: ${defs.map((d) =>
                `${d.type}${d.at ? `@${d.at.x},${d.at.z}` : ''}`).join(' ')}`);
            for (const n of notes) rows.push(`    ${n}`);
        }
    }
}

for (const r of rows) console.log(r);
console.log('');
console.log(`gates ${nGates}  GATES WITH NO DRIVER ${nUnwired}  |  `
    + `switches ${nSwitches}  DEAD ${nDead}  UNREACHABLE ${nUnreachable}  |  `
    + `PIECES ON THE PLAYER'S SPAWN ${nOnSpawn}`);
