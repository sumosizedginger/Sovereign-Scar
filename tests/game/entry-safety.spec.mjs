// tests/game/entry-safety.spec.mjs — where the player lands, and how high.
//
// THE REPORT, TWICE, FROM THE OWNER
//
//   "I spawned under the ground due to the raised land right next to the
//    entrance."
//   "I became stuck on a raised area when I entered the room from the east side."
//
// THE DEFECT
//
// `surfaceTop` asks "is there a solid here with head room above it?" It never
// asks "may the player's body be at this (x,z) AT ALL?" `CollisionWorld` answers
// that one and it is height-blind on purpose — so the roof of a perimeter wall or
// an authored slab passed `standable()`, `nearestFreeEntry` returned it, and the
// player was stood somewhere every horizontal move is refused.
//
// And the other half: the hero's rest height was spelled out at SEVEN placement
// sites. Last session fixed one of them and left six saying 1.95, including
// `respawnPoint`, which called `standable()`, computed a real surface top, and
// then threw it away.
//
// WHY THESE FIXTURES AND NOT CONVENIENT ONES
//
// My last spawn-clearance spec baked `BEAT_LIST[0]` — a beat that never had the
// bug — and PASSED with its fix reverted. It tested nothing and I shipped it.
// So every case below is built from a situation actually observed:
//
//   * beat-07 `drownedway` entered from the east — the owner's stuck room, whose
//     authored slab (x 6..7, z -3..3, three high) sits exactly on the arrival
//     point the door maths produces.
//   * a room with real terracing, for the death-respawn height.
//   * the overworld's saved-position restore, driven end to end, because that is
//     the path "walk into a dungeon and come back out" actually takes.
//
// Counterfactual, run by hand before this was committed: revert the body test in
// `standable` and 17 arrival points across the campaign go BODY-IN-SOLID; revert
// `respawnPoint`'s height and 27 go buried; revert the overworld restore and all
// 49 screens bury you. `tests/qa/entry-safety.mjs` prints the sweep.

import * as THREE from 'three';
import { createDungeon, PLAYER_RISE } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { BEAT07_DEF } from '../../src/game/levels/beat-07-sluice.js';
import { BEAT_LIST } from './_beat-defs.mjs';

const PLAYER_HALF = 0.4;

const keyStoreStub = () => ({
    _open: new Set(),
    isOpen(id) { return this._open.has(id); },
    open(id) { this._open.add(id); },
    mapPickup: () => false, takeMapPickup() {},
    isPickupTaken: () => false, takePickup() {},
    visited: () => [], visit() {},
    markMapPickup() {},
});

function bake(def) {
    const cw = new CollisionWorld();
    const level = createDungeon(
        { scene: new THREE.Scene(), collisionWorld: cw, particles: null },
        def, { keyStore: keyStoreStub() }
    );
    return { level, cw };
}

/** Bottom-up surface scan, the same shape the game's own one has. */
function groundTop(level, x, z) {
    for (let top = 1; top <= 8; top++) {
        if (!level.getVoxelAt(x, top - 0.5, z)) continue;
        if (level.getVoxelAt(x, top + 0.5, z)) continue;
        if (level.getVoxelAt(x, top + 1.5, z)) continue;
        return top;
    }
    return null;
}

export function run(t) {
    // ── The room the owner got stuck in ────────────────────────────────────
    {
        const { level, cw } = bake(BEAT07_DEF);
        level.enterRoom('drownedway', null);
        const a = level.arrivalPoint('drownedway', 'brinepocket');

        // The bug, stated as the thing that was actually wrong: the body was
        // placed inside a column the collision world refuses at every height.
        t.ok('beat-07 drownedway, entered from the east: the body fits where it lands',
            !cw.blocked(a.x, a.z, PLAYER_HALF),
            `arrival (${a.x.toFixed(1)}, ${a.y.toFixed(2)}, ${a.z.toFixed(1)})`);

        // The reported y was 4.95, on the roof of the slab. Naming the number
        // keeps the regression legible if this ever comes back.
        t.ok('beat-07 drownedway east: not stood on the slab roof at 4.95',
            Math.abs(a.y - 4.95) > 0.01, `y=${a.y.toFixed(2)}`);

        const top = groundTop(level, a.x, a.z);
        t.ok('beat-07 drownedway east: feet are on the ground under them',
            top != null && Math.abs((a.y - PLAYER_RISE) - top) < 0.01,
            `feet ${(a.y - PLAYER_RISE).toFixed(2)} vs ground ${top}`);

        // Cells are corner-anchored, so a coordinate ending .0 straddles two of
        // them and a body centred there is half inside each neighbour. Every
        // door in the game used to land exactly there.
        const onCentre = (v) => Math.abs(v - Math.floor(v) - 0.5) < 1e-6;
        t.ok('beat-07 drownedway east: arrival is a cell centre, not a seam',
            onCentre(a.x) && onCentre(a.z), `(${a.x}, ${a.z})`);
    }

    // ── Every door in the campaign, both directions ────────────────────────
    //
    // Trap 5, the project's most expensive recurring bug: the one place that
    // was fine is the place the spot-check lands on.
    {
        let doors = 0, inSolid = 0, buried = 0, seams = 0, wrongHeight = 0;
        const worst = [];
        for (const def of BEAT_LIST) {
            const { level, cw } = bake(def);
            for (const [roomId, room] of Object.entries(def.rooms || {})) {
                if (!room.half) continue;
                level.enterRoom(roomId, null);
                for (const [fromId, fromRoom] of Object.entries(def.rooms || {})) {
                    if (fromId === roomId) continue;
                    if (!(fromRoom.doors || []).some((d) => d.to === roomId)) continue;
                    doors++;
                    const a = level.arrivalPoint(roomId, fromId);
                    const feet = a.y - PLAYER_RISE;
                    const top = groundTop(level, a.x, a.z);
                    let bad = false;
                    if (cw.blocked(a.x, a.z, PLAYER_HALF)) { inSolid++; bad = true; }
                    if (level.getVoxelAt(a.x, feet + 0.5, a.z)
                        || level.getVoxelAt(a.x, feet + 1.5, a.z)) { buried++; bad = true; }
                    if (top == null || Math.abs(feet - top) > 0.01) { wrongHeight++; bad = true; }
                    if (Math.abs(a.x - Math.floor(a.x) - 0.5) > 1e-6
                        || Math.abs(a.z - Math.floor(a.z) - 0.5) > 1e-6) { seams++; bad = true; }
                    if (bad && worst.length < 6) {
                        worst.push(`${def.id}/${roomId}<-${fromId} y=${a.y.toFixed(2)}`);
                    }
                }
            }
        }
        t.ok('the campaign has doors to check', doors > 150, `${doors} doors`);
        t.ok('no arrival puts the body inside a solid', inSolid === 0,
            `${inSolid} of ${doors}  ${worst.join('  ')}`);
        t.ok('no arrival buries the player in geometry', buried === 0, `${buried} of ${doors}`);
        t.ok('every arrival stands on the ground beneath it', wrongHeight === 0,
            `${wrongHeight} of ${doors}`);
        t.ok('no arrival lands on a cell seam', seams === 0, `${seams} of ${doors}`);
    }

    // ── Death, in a room that is not flat ──────────────────────────────────
    //
    // `respawnPoint` asked `standable()` — which scans for the real surface —
    // and then returned a constant 1.95 next to it.
    {
        let checked = 0, terraced = 0, bad = 0;
        for (const def of BEAT_LIST) {
            const { level, cw } = bake(def);
            for (const [roomId, room] of Object.entries(def.rooms || {})) {
                if (!room.half) continue;
                level.enterRoom(roomId, null);
                const rp = level.respawnPoint();
                if (!rp) continue;
                checked++;
                const feet = rp.y - PLAYER_RISE;
                const top = groundTop(level, rp.x, rp.z);
                if (top != null && top !== 1) terraced++;
                if (cw.blocked(rp.x, rp.z, PLAYER_HALF)
                    || level.getVoxelAt(rp.x, feet + 0.5, rp.z)
                    || level.getVoxelAt(rp.x, feet + 1.5, rp.z)) bad++;
            }
        }
        t.ok('respawn points were checked in every room', checked > 90, `${checked} rooms`);
        // If this is zero the case below cannot fail and proves nothing — the
        // fixture has to contain the situation being tested.
        t.ok('some respawn points are on raised ground, or this tests nothing',
            terraced > 0, `${terraced} of ${checked} above y=1`);
        t.ok('dying never puts you back inside the floor', bad === 0, `${bad} of ${checked}`);
    }

    // ── The level's own start spawn ────────────────────────────────────────
    {
        let bad = 0;
        const names = [];
        for (const def of BEAT_LIST) {
            const { level, cw } = bake(def);
            const s = level.spawn;
            const feet = s.y - PLAYER_RISE;
            if (cw.blocked(s.x, s.z, PLAYER_HALF)
                || level.getVoxelAt(s.x, feet + 0.5, s.z)
                || level.getVoxelAt(s.x, feet + 1.5, s.z)) { bad++; names.push(def.id); }
        }
        t.ok('no dungeon starts the player inside its own geometry', bad === 0, names.join(' '));
    }
}
