// tests/game/seal-holds.spec.mjs — a sealed room actually holds the player.
//
// `room-seal.spec.mjs` asks, twenty-six times over, whether a sealed room can
// be CLEARED: does it have enemies, are they reachable, is there a valve if the
// fight deadlocks, is there a ceiling under the valve. Every one of those is
// about the player getting OUT. Not one of them asks whether the room can keep
// the player IN, and the answer was no — in all 26 rooms, on every door.
//
// The seal had no geometry behind it. A locked door bakes a solid plug into its
// gap; a sealed door bakes nothing, so the entire barrier was `refuseDoor`
// shoving the player 1.1 units back and then going quiet for 0.7 seconds. At a
// walk speed of 5.5 that is four times the time needed to cover the 1.1 and
// step through the hole. Measured in the running game on beat-01 `antechamber`,
// holding south into its `open` door: seven shoves in five seconds, ending 14
// units past the wall at y = -29.34, `currentRoomId()` still `antechamber` the
// whole way. Past the wall there is no floor — the neighbouring room is 47
// units away and is not baked until you transition — so the player fell until
// `index.js` fired its `y < -12` void kill.
//
// That is what the owner reported as dying to the room bumping them back, and
// the shove they could feel was the only part of it the game meant to happen.
//
// So this file drives the fixed rule the other file never states: walk at a
// sealed door for five seconds and you do not get through it. It is written
// against the WALL PLANE rather than against "did you reach the next room",
// because the failure was never a transition — the room never changed. It was
// the player walking out of the world through a hole the seal was pretending to
// cover.

import * as THREE from 'three';
import { createDungeon, doorCells } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { Player } from '../../src/game/player.js';
import { BEAT_LIST } from './_beat-defs.mjs';

// Walking a door for five seconds crosses whatever the room has lying on the
// floor, so this store sees more traffic than the one in `room-seal.spec.mjs`
// — pickups, map fragments, visit marks. Unknown methods no-op rather than
// throw, because a missing stub method must not read as a held seal.
const keyStoreStub = () => new Proxy({
    _open: new Set(),
    isOpen(id) { return this._open.has(id); },
    open(id) { this._open.add(id); },
    mapPickup: () => false,
    isPickupTaken: () => false,
    visited: () => [],
}, {
    get(target, prop) {
        if (prop in target) return target[prop];
        return () => false;
    },
});

// Room systems (altars, blockers) read `game.input` every tick. Nothing here
// presses anything: the point is that walking alone gets you out, so any input
// this stub invented would be a way for the fixture to help.
const inputStub = () => new Proxy({
    moveVector: () => ({ x: 0, z: 0 }),
    guardHeld: () => false,
    attackHeld: () => false,
    keys: new Set(),
    mouse: { x: 0, y: 0 },
    padActive: false,
    padAim: { x: 0, z: 0 },
    padMove: { x: 0, z: 0 },
}, {
    get(target, prop) {
        if (prop in target) return target[prop];
        return () => false; // every consume*/poll* the game may add later
    },
});

/** Walk speed the player actually has — `Player.speed`. */
const WALK = 5.5;
const DT = 1 / 60;
const SECONDS = 5;

/** Outward unit normal for a door side, and which axis it moves. */
const OUT = {
    N: { axis: 'z', sign: -1 },
    S: { axis: 'z', sign: 1 },
    W: { axis: 'x', sign: -1 },
    E: { axis: 'x', sign: 1 },
};

function doorCentre(room, door, origin) {
    const cells = doorCells(room, door);
    const cx = cells.reduce((s, c) => s + c.x, 0) / cells.length;
    const cz = cells.reduce((s, c) => s + c.z, 0) / cells.length;
    return { x: origin.x + cx + 0.5, z: origin.z + cz + 0.5 };
}

/** The perimeter plane the door is cut through, in world units. */
function wallPlane(room, door, origin) {
    if (door.side === 'N') return origin.z - room.half + 0.5;
    if (door.side === 'S') return origin.z + room.half + 0.5;
    if (door.side === 'W') return origin.x - room.half + 0.5;
    return origin.x + room.half + 0.5;
}

export function run(t) {
    let roomsDriven = 0;
    let doorsDriven = 0;
    let worstOvershoot = -Infinity;
    let worstWhere = '';

    for (const def of BEAT_LIST) {
        const sealed = Object.entries(def.rooms).filter(([, r]) => r.seal);
        if (!sealed.length) continue;

        for (const [rid, room] of sealed) {
            const scene = new THREE.Scene();
            const cw = new CollisionWorld();
            // A real camera: beat 09 builds walls that are solid only inside
            // the frustum, and reads its matrices at bake time.
            const camera = new THREE.PerspectiveCamera(65, 1.6, 0.1, 400);
            camera.position.set(0, 18, 12);
            camera.updateMatrixWorld();
            const level = createDungeon(
                { scene, collisionWorld: cw, particles: null, camera },
                def, { keyStore: keyStoreStub() }
            );
            const player = new Player(scene, cw, (x, y) => y < 1);
            const game = {
                player, camera, hud: { toast() {} }, input: inputStub(),
            };
            level.enterRoom(rid, game);
            for (let i = 0; i < 30; i++) level.update(DT, game); // settle the pan

            const where = `${def.id}:${rid}`;
            t.ok(`${where}: starts sealed`, !!level.sealState(),
                'the fixture must have the seal on, or it cannot fail');
            if (!level.sealState()) { level.dispose?.(); continue; }
            roomsDriven++;

            const origin = level.currentRoomOrigin();

            for (const door of room.doors || []) {
                const out = OUT[door.side];
                if (!out) continue;
                doorsDriven++;

                const c = doorCentre(room, door, origin);
                const plane = wallPlane(room, door, origin);
                const p = player.rig.position;

                // Line the player up on the door, three units inside the wall,
                // and walk them straight at it. Position is stepped directly
                // rather than through `Player.update` so the test measures the
                // level's hold and nothing else — the doorway is an open gap,
                // so collision never stopped the player here anyway. Confirmed
                // in the running game with real physics and real gravity.
                p.set(c.x, 1.95, c.z);
                p[out.axis] = plane - out.sign * 3;

                let overshoot = -Infinity;
                for (let i = 0; i < SECONDS / DT; i++) {
                    p[out.axis] += out.sign * WALK * DT;
                    level.update(DT, game);
                    // How far past the wall plane, in the outward direction.
                    overshoot = Math.max(overshoot, (p[out.axis] - plane) * out.sign);
                }

                if (overshoot > worstOvershoot) {
                    worstOvershoot = overshoot;
                    worstWhere = `${where} ${door.side}:${door.type || 'open'}`;
                }

                // Standing IN the doorway is allowed and wanted — that is where
                // the "Sealed — N still standing" toast fires from. Passing
                // THROUGH it is the bug.
                t.ok(`${where}: ${door.side}:${door.type || 'open'} door holds a 5s push`,
                    overshoot <= 0.01,
                    `reached ${overshoot.toFixed(2)} past the wall plane at ${plane.toFixed(1)}`);

                // And it must not have quietly let them into the next room by
                // another route — the original bug left the room id unchanged
                // while the player was 14 units outside it, so neither signal
                // is sufficient alone.
                t.ok(`${where}: ${door.side} door did not transition while sealed`,
                    level.currentRoomId() === rid,
                    `now in ${level.currentRoomId()}`);
                t.ok(`${where}: ${door.side} door still sealed after the push`,
                    !!level.sealState(),
                    'five seconds of walking must not count as clearing the room');
            }

            level.dispose?.();
        }
    }

    // Coverage. A sweep that drives nothing reports clean, and this project has
    // shipped one that drove 0 of 188 doors.
    // Counted from the defs, not written down. A literal here has to be
    // hand-edited whenever the campaign gains a sealed room, and the tempting
    // edit is to change it to whatever just ran — which turns a coverage guard
    // into a rubber stamp. Derived, it still fails loudly if the sweep skips a
    // room, and needs no maintenance when one is authored.
    const expectedSealed = BEAT_LIST.reduce(
        (n, d) => n + Object.values(d.rooms || {}).filter((r) => r && r.seal === true).length,
        0,
    );
    t.ok('the campaign has sealed rooms to drive', expectedSealed > 0, `${expectedSealed}`);
    t.ok('the sweep actually drove every sealed room', roomsDriven === expectedSealed,
        `${roomsDriven} of ${expectedSealed} rooms, ${doorsDriven} doors`);
    t.ok('and every door in them', doorsDriven >= 60, `${doorsDriven} doors`);
    t.ok('worst case is inside the doorway, not past it', worstOvershoot <= 0.01,
        `worst ${worstOvershoot.toFixed(3)} at ${worstWhere}`);
}
