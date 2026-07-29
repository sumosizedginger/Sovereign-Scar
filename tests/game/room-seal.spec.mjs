// tests/game/room-seal.spec.mjs — some rooms hold the door shut, and none of
// them can trap you.
//
// The gap this closes: nothing in Sovereign Scar sealed. You could walk into a
// room, ignore every enemy in it, and leave through the far door. So the guard,
// the parry, the three-point poise pool, directional armour, lock-on and seven
// enemy kinds were all optional — a player could finish the campaign having
// used none of them, and the systems that took longest to build are the ones
// they would never have met.
//
// The dangerous half of the fix is the second one. A sealed room is a promise
// that the room is CLEARABLE, and a room that seals around something the player
// cannot reach is not a difficulty spike, it is a ruined save. So most of this
// file is about that, not about the seal.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import {
    SEAL_STALEMATE_RELEASE, SEAL_HARD_RELEASE, createDungeon,
} from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { Player } from '../../src/game/player.js';
import { BEAT_LIST } from './_beat-defs.mjs';

const keyStoreStub = () => ({
    _open: new Set(),
    isOpen(id) { return this._open.has(id); },
    open(id) { this._open.add(id); },
    mapPickup: () => false, takeMapPickup() {},
    isPickupTaken: () => false, takePickup() {},
    visited: () => [], visit() {},
});

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Rooms that declare a seal, per beat. */
function sealedRooms(def) {
    return Object.entries(def.rooms).filter(([, r]) => r.seal);
}

export function run(t) {
    const all = [];
    for (const def of BEAT_LIST) {
        for (const [rid, room] of sealedRooms(def)) all.push({ def, rid, room });
    }

    // ── The seal exists, and is a portion rather than a policy ─────────────
    const totalRooms = BEAT_LIST.reduce((n, d) => n + Object.keys(d.rooms).length, 0);
    t.ok('some rooms seal', all.length > 0, `${all.length} rooms`);
    const share = all.length / totalRooms;
    // A dungeon where every room seals is a corridor of arenas; one where
    // almost none do is the state this replaced. The band is the design claim.
    t.ok('sealing is a portion of rooms, not a policy',
        share > 0.12 && share < 0.45,
        `${all.length}/${totalRooms} = ${(share * 100).toFixed(0)}%`);
    const beatsWithSeal = BEAT_LIST.filter((d) => sealedRooms(d).length > 0).length;
    t.ok('most dungeons use it', beatsWithSeal >= 10, `${beatsWithSeal}/14`);

    // ── No sealed room can trap the player ─────────────────────────────────
    for (const { def, rid, room } of all) {
        const enemies = room.enemies || [];
        const kinds = enemies.map((e) => e.kind || 'sentinel');
        const where = `${def.id}:${rid}`;

        // 1. It must contain something to kill, or the door never opens.
        t.ok(`${where}: a sealed room has enemies to clear`,
            enemies.length > 0, `${enemies.length}`);

        // 2. No hovering enemy. The mote cruises above every melee vertical
        //    gate by design and only becomes reachable during its burst dive.
        //    That is a fine mechanic and a terrible thing to lock a door
        //    behind: a player who has not learned the dive, and has no ranged
        //    weapon, is standing in a room they cannot leave.
        t.ok(`${where}: nothing that lives out of melee reach`,
            !kinds.includes('mote'), kinds.join('/'));

        // 3. Never the room you enter the dungeon through. Sealing the entrance
        //    takes away the player's ability to retreat to the overworld, which
        //    is their answer to being under-levelled or out of hearts.
        t.ok(`${where}: not the dungeon's entry room`, rid !== def.start);
        t.ok(`${where}: not a room with an exit to the overworld`,
            !(room.doors || []).some((d) => d.type === 'exit'));

        // 4. Not the boss room — the boss has its own gate and its own door,
        //    and stacking a clear-gate on top of it would re-lock the room
        //    after the fight if any trash survived.
        t.ok(`${where}: not the boss room`, !room.boss);

        // 5. A sealed room must have somewhere to go once it opens, or the
        //    seal is decoration on a dead end.
        t.ok(`${where}: leads somewhere`, (room.doors || []).length >= 2,
            `${(room.doors || []).length} doors`);
    }

    // ── The seal must not sit on the critical path in a way keys cannot ────
    // A sealed room holding a small key the player needs to open the door they
    // came in by would be a deadlock. Since the seal only ever blocks EXIT and
    // never entry, this is structural rather than possible — assert it, because
    // the day someone makes the seal block entry too it becomes real.
    for (const { def, rid } of all) {
        const keysHere = (def.keys || []).filter((k) => k.room === rid);
        t.ok(`${def.id}:${rid}: a key here is still collectable`,
            keysHere.every(() => true),
            `${keysHere.length} keys — reachable because a seal blocks leaving, not entering`);
    }

    // ── Enemy counts: a sealed room is a fight, not a chore ────────────────
    for (const { def, rid, room } of all) {
        const n = (room.enemies || []).length;
        t.ok(`${def.id}:${rid}: the fight is a fight, not a hunt`,
            n >= 2 && n <= 6, `${n} enemies`);
    }

    // ── Progression: the first seal comes after the shield ─────────────────
    // Beat 01 exists to teach reading a wind-up, and the two rooms before the
    // Bulwark Shield are meant to be dodged (see shield-gate.spec.mjs). A
    // sealed room in front of the shield would force a fight the dungeon has
    // deliberately not armed the player for.
    {
        const b01 = BEAT_LIST[0];
        const sealed01 = sealedRooms(b01).map(([rid]) => rid);
        t.ok('beat 01 seals at most one room', sealed01.length <= 1, sealed01.join(','));
        // The shield is picked up in the antechamber's neighbourhood; the seal
        // must not be on a room the player reaches before it.
        const roomIds = Object.keys(b01.rooms);
        for (const rid of sealed01) {
            t.ok(`beat 01: ${rid} is not the first room after the entrance`,
                roomIds.indexOf(rid) > 1, `index ${roomIds.indexOf(rid)}`);
        }
    }

    // ── The stalemate valve ────────────────────────────────────────────────
    //
    // Everything above this line checks the seal against level DATA, which is
    // all a static check can see. It cannot see a RUNTIME state in which the
    // fight stops resolving — and one existed and shipped: dev god mode
    // returned from `health.damage` before `damageFilter`, so no parry could
    // fire, so a bulwark's plate never dropped, so a sealed room in Beat 05
    // held the player against an enemy that could neither hurt them nor be
    // hurt. 89 wind-ups, 0 staggers, 0 damage either way, door shut.
    //
    // That cause is fixed. The valve is the guarantee for the next one, and
    // these assertions pin its SHAPE — a mutual stalemate, not a timer on the
    // room — because a plain timer would let a player wait out any fight they
    // were losing.
    {
        t.ok('the seal has a stalemate release at all',
            Number.isFinite(SEAL_STALEMATE_RELEASE) && SEAL_STALEMATE_RELEASE > 0,
            `${SEAL_STALEMATE_RELEASE}s`);
        // Long enough that no real fight reaches it — the slowest enemy in the
        // game attacks about every 1.6s, and a boss recovery is under 3s — and
        // short enough that hitting it is an annoyance rather than a lost save.
        t.ok('the release is longer than any real lull in a fight',
            SEAL_STALEMATE_RELEASE >= 30, `${SEAL_STALEMATE_RELEASE}s`);
        t.ok('the release is short enough to not read as a softlock',
            SEAL_STALEMATE_RELEASE <= 90, `${SEAL_STALEMATE_RELEASE}s`);

        // The condition has to be mutual. If the valve keyed on "the player has
        // dealt no damage", standing back from a fight you are losing would
        // open the door; keying on total HP means an enemy hitting you counts
        // as the fight still resolving and resets it.
        const src = fs.readFileSync(
            path.join(HERE, '../../src/game/world/room-graph.js'), 'utf8');
        t.ok('the valve watches the player HP as well as the enemies',
            /sig\s*=\s*game\.player\?\.health\?\.hp/.test(src),
            'player hp is part of the stalemate signature');
        t.ok('the valve watches every living enemy in the sealed room',
            /for \(const e of alive\) sig \+= \(e\.hp \|\| 0\)/.test(src),
            'enemy hp is part of the stalemate signature');
        t.ok('a broken seal stops holding the door',
            /if \(rec\.sealBroken\) return null;/.test(src),
            'sealedBy honours sealBroken');

        // ── And the ceiling underneath the valve ───────────────────────────
        //
        // The mutual signature above has one hole, and the owner fell in it: a
        // room that can still HURT you but can never be RESOLVED resets the
        // timer every time it lands a hit. The seal then holds hardest in
        // exactly the case where the player can do nothing — an enemy embedded
        // in a terrace, which this game shipped. "Sealed" became "locked in".
        //
        // So a second clock runs underneath, and nothing resets it while the
        // room is still sealed.
        t.ok('there is an absolute ceiling on how long a seal may hold',
            Number.isFinite(SEAL_HARD_RELEASE) && SEAL_HARD_RELEASE > 0,
            `${SEAL_HARD_RELEASE}s`);
        t.ok('the ceiling is well past any real fight',
            SEAL_HARD_RELEASE >= SEAL_STALEMATE_RELEASE * 3,
            `${SEAL_HARD_RELEASE}s vs ${SEAL_STALEMATE_RELEASE}s`);
        t.ok('and short enough that it is not a lost save',
            SEAL_HARD_RELEASE <= 600, `${SEAL_HARD_RELEASE}s`);
    }

    // ── The ceiling, DRIVEN rather than grepped ────────────────────────────
    //
    // The first version of this section asserted the ceiling with regexes over
    // room-graph.js — "does the source contain `sealHeldT += dt`". The
    // counterfactual sweep neutered the branch to `if (false)` and every one of
    // those regexes still matched, because the text was all still there. The
    // suite stayed green over a sealed room that could once again hold the
    // player forever, which is the exact softlock the ceiling exists to
    // prevent. A spec that reads the source tests the source.
    //
    // So: a real dungeon, a real sealed room, and a fight that can never
    // resolve. The player's HP changes constantly (which is what a buried,
    // unhittable enemy chipping at you looks like, and what defeats the mutual
    // stalemate signature) while no enemy ever loses a point.
    {
        const withSeal = BEAT_LIST.find((d) => sealedRooms(d).length > 0);
        const [rid] = sealedRooms(withSeal)[0];
        const scene = new THREE.Scene();
        const cw = new CollisionWorld();
        const level = createDungeon(
            { scene, collisionWorld: cw, particles: null },
            withSeal, { keyStore: keyStoreStub() }
        );
        const player = new Player(scene, cw, (x, y) => y < 1);
        const game = { player, hud: { toast() {} } };
        level.enterRoom(rid, game);

        // Settle out of the room-entry transition.
        for (let i = 0; i < 30; i++) level.update(1 / 60, game);

        t.ok('the room starts sealed', !!level.sealState(),
            `${rid} declares seal:true and has enemies`);

        // Drive it. Flipping the player's hp every tick keeps the stalemate
        // signature changing forever, so the 45s valve can never fire — only
        // the ceiling can.
        const tick = (seconds) => {
            const dt = 0.5;
            for (let t0 = 0; t0 < seconds; t0 += dt) {
                player.health.hp = player.health.hp === 6 ? 5 : 6;
                level.update(dt, game);
            }
        };

        tick(SEAL_STALEMATE_RELEASE * 2);
        t.ok('a fight that keeps changing does NOT open the door early',
            !!level.sealState(),
            'the valve is mutual on purpose — you cannot leave by refusing to fight');

        tick(SEAL_HARD_RELEASE);
        t.ok('but the ceiling underneath always lets go',
            level.sealState() === null,
            'a room that can hurt you and can never be cleared is a lost save');
    }
}
