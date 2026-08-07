// tests/game/puzzle-kit.spec.mjs — Phase E1.
//
// THE PROBLEM
//
// All four blocker types the game shipped with ask the same question: *do you
// have the item?* That is a LOCK. A lock's answer is your inventory; a puzzle's
// answer is a plan. Fourteen dungeons, 1.5 blockers each, and not one of them
// could be reasoned about.
//
// WHAT MATTERS MOST HERE
//
// Not that the puzzles work — that they cannot BREAK. A pushable block is the
// single most reliable way to kill a Zelda-like: shove it into a corner and the
// room is dead. This project has already shipped two softlocks (the seal, the
// door bounce), so the standing rule is that **every pushable needs a reset**,
// and the reset has to be a rule rather than a special case for the corners
// somebody thought of.
//
// The second thing that matters is that the authored pass cannot bury the
// campaign's own contents. It already tried: the first version's vault walls
// closed over a small key in beat 13 and a scar suture in beat 14, because it
// chose its corner before `onBake` had placed them.

import * as THREE from 'three';
import {
    SignalBus, plateHeld, socketFilled, traceBeam, isRecoverable, within,
} from '../../src/game/world/puzzle-kit.js';
import {
    puzzleFor, puzzlesForDungeon, SLOTS, MIN_HALF, flavourFor,
} from '../../src/game/world/puzzles.js';
import {
    GATE_HOLD, PUZZLE_RESET_AT, createBlockerRuntime,
} from '../../src/game/world/blockers.js';
import { Player } from '../../src/game/player.js';
import { WEAPONS, getWeapon } from '../../src/game/combat/weapons.js';
import { createDungeon } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { PushableBlock } from '../../src/game/world/pushable-block.js';
import { BEAT_LIST } from './_beat-defs.mjs';

const beatNoOf = (def) => Number(String(def.id).match(/beat-(\d+)/)?.[1] || 0);

const keyStoreStub = () => ({
    _open: new Set(),
    isOpen(id) { return this._open.has(id); },
    open(id) { this._open.add(id); },
    mapPickup: () => false, takeMapPickup() {},
    isPickupTaken: () => false, takePickup() {},
});

export function run(t) {
    // ── The signal bus ─────────────────────────────────────────────────────
    {
        const bus = new SignalBus();
        t.ok('an unknown signal is off', bus.get('nope') === false);
        bus.set('a', true);
        t.ok('a set signal is on', bus.get('a') === true);
        bus.set('a', false);
        t.ok('and can be turned off again', bus.get('a') === false);

        bus.latch('b');
        t.ok('a latched signal is on', bus.get('b') === true);
        bus.set('b', false);
        t.ok('and CANNOT be turned off',
            bus.get('b') === true,
            'a reward you have already earned must not be taken back by the furniture');
        t.ok('the bus can list what it holds',
            bus.active().join(',') === 'b' && bus.latched().join(',') === 'b');
    }

    // ── Two pieces holding one signal ──────────────────────────────────────
    //
    // The `develop` beat of every switch-led dungeon is built out of exactly
    // this: a switch on a fuse and a plate a block can hold, EITHER of which
    // should open the gate. Both wrote the same name every frame, and the bus
    // stored a bare boolean, so the last writer of the frame won — the plate
    // ran after the switch and wrote `false` because nobody was standing on
    // it, and the switch did nothing at all in seven of the fourteen dungeons.
    //
    // Stated in both directions, because "any source turns it on" and "one
    // source releasing does not turn it off" are two different claims and only
    // the first of them is the obvious one.
    {
        const bus = new SignalBus();
        bus.set('gate', true, 'switch:1');
        bus.set('gate', false, 'plate:1');
        t.ok('one source cannot cancel another\'s hold',
            bus.get('gate') === true,
            'the plate reporting empty must not undo the switch that was just struck');

        bus.set('gate', true, 'plate:1');
        bus.set('gate', false, 'switch:1');
        t.ok('and the survivor keeps it up',
            bus.get('gate') === true,
            'the switch timing out must not undo the block sitting on the plate');

        bus.set('gate', false, 'plate:1');
        t.ok('it falls only when the last holder lets go', bus.get('gate') === false);

        // The default source is what every single-writer piece uses, and it
        // must behave exactly as a bare assignment always did.
        bus.set('solo', true);
        bus.set('solo', false);
        t.ok('a lone writer still toggles freely', bus.get('solo') === false);

        // Re-asserting is not a second hold — a plate held for 300 frames is
        // one holder, and must release on the first frame it is stepped off.
        bus.set('dup', true, 'plate:2');
        bus.set('dup', true, 'plate:2');
        bus.set('dup', false, 'plate:2');
        t.ok('holding for many frames is still one hold',
            bus.get('dup') === false,
            'a refcount instead of a holder set would need as many releases as frames');
    }

    // ── Pressure plates ────────────────────────────────────────────────────
    {
        const at = { x: 0, z: 0 };
        const plate = { at, r: 1.1 };
        t.ok('an empty plate is up', plateHeld(plate, {}) === false);
        t.ok('a player on it holds it', plateHeld(plate, { player: { x: 0.5, z: 0 } }));
        t.ok('a player beside it does not',
            plateHeld(plate, { player: { x: 3, z: 0 } }) === false);
        t.ok('a block on it holds it',
            plateHeld(plate, { blocks: [{ position: { x: 0, z: 0.4 } }] }));
        t.ok('a living enemy on it holds it',
            plateHeld(plate, {
                enemies: [{ rig: { position: { x: 0, z: 0 } }, state: { current: 'IDLE' } }],
            }),
            'luring something heavy onto a plate is the one place a fight IS the solution');
        t.ok('a dead one does not',
            plateHeld(plate, {
                enemies: [{ rig: { position: { x: 0, z: 0 } }, state: { current: 'DEAD' } }],
            }) === false);

        // `accepts` is what tells the player what the plate wants.
        const heavy = { at, r: 1.1, accepts: 'block' };
        t.ok('a block-only plate refuses a person',
            plateHeld(heavy, { player: { x: 0, z: 0 } }) === false,
            'that refusal IS the twist in every develop room');
        t.ok('but takes the block',
            plateHeld(heavy, { blocks: [{ position: { x: 0, z: 0 } }] }));
    }

    // ── Sockets ────────────────────────────────────────────────────────────
    {
        const socket = { at: { x: 5, z: 5 }, r: 1.0 };
        t.ok('an empty socket is empty', socketFilled(socket, []) === false);
        t.ok('a block in it fills it',
            socketFilled(socket, [{ position: { x: 5.3, z: 4.8 } }]));
        t.ok('a block near it does not',
            socketFilled(socket, [{ position: { x: 8, z: 5 } }]) === false);
        const keyed = { at: { x: 5, z: 5 }, r: 1.0, blockId: 'blk:the-one' };
        t.ok('a keyed socket refuses the wrong block',
            socketFilled(keyed, [{ id: 'blk:other', position: { x: 5, z: 5 } }]) === false);
        t.ok('and takes the right one',
            socketFilled(keyed, [{ id: 'blk:the-one', position: { x: 5, z: 5 } }]));
    }

    // ── Beams and mirrors ──────────────────────────────────────────────────
    //
    // Every claim in world space (trap 1): where the beam ENDS UP, never the
    // sign of a turn.
    {
        const src = { at: { x: 0, z: 0 }, dir: { x: 1, z: 0 } };
        const target = { at: { x: 10, z: 0 }, r: 0.9 };

        let r = traceBeam(src, { targets: [target] });
        t.ok('a clear beam reaches its target', r.hit === target);
        t.ok('and did not bounce on the way', r.bounces === 0);

        r = traceBeam(src, { targets: [target], isSolid: (x) => x > 5 });
        t.ok('a wall stops it', r.hit === null);

        // A mirror at (6,0) turns +X into -Z or +Z depending on which diagonal
        // it is. Either way, the target dead ahead is no longer hit.
        const mirror = { position: { x: 6, z: 0 }, spin: 0 };
        r = traceBeam(src, { mirrors: [mirror], targets: [target] });
        t.ok('a mirror in the way turns the beam off it', r.hit === null);
        t.ok('and it did bounce', r.bounces === 1);
        const end = r.path[r.path.length - 1];
        t.ok('the beam left along Z, not X',
            Math.abs(end.x - 6) < 1.0 && Math.abs(end.z) > 5,
            `ended at (${end.x.toFixed(1)}, ${end.z.toFixed(1)})`);

        // Put a target where the turned beam actually goes, and it lights.
        const offAxis = { at: { x: 6, z: -8 }, r: 0.9 };
        r = traceBeam(src, { mirrors: [mirror], targets: [target, offAxis] });
        t.ok('a target on the reflected line lights instead', r.hit === offAxis,
            'where you PUSH the mirror is the whole puzzle');

        // The other diagonal sends it the other way — same mirror, one push of
        // the spin, opposite answer.
        r = traceBeam(src, {
            mirrors: [{ position: { x: 6, z: 0 }, spin: 1 }],
            targets: [offAxis, { at: { x: 6, z: 8 }, r: 0.9 }],
        });
        t.ok('the other diagonal sends it the opposite way',
            r.hit && r.hit.at.z > 0);

        // TWO MIRRORS FACING EACH OTHER. A player can build this by accident in
        // about four seconds, and an unbounded trace would hang the frame.
        let hung = false;
        const timer = Date.now();
        r = traceBeam(src, {
            mirrors: [
                { position: { x: 4, z: 0 }, spin: 0 },
                { position: { x: 4, z: -4 }, spin: 1 },
                { position: { x: 0, z: -4 }, spin: 0 },
                { position: { x: 0, z: 0 }, spin: 1 },
            ],
            targets: [],
        });
        if (Date.now() - timer > 1000) hung = true;
        t.ok('a loop of mirrors terminates', !hung && r.bounces <= 7,
            `${r.bounces} bounces`);
    }

    // ── The softlock claim ─────────────────────────────────────────────────
    {
        t.ok('a puzzle with no blocks is trivially fine', isRecoverable({}));
        t.ok('a block that can be reset is recoverable',
            isRecoverable({ blocks: [{ canReset: true, spawn: { x: 0, z: 0 } }] }));
        t.ok('a block with no spawn to return to is NOT',
            isRecoverable({ blocks: [{ canReset: true }] }) === false,
            'a reset with nowhere to reset to is a comment, not a mechanic');
        t.ok('nor is one that refuses to reset',
            isRecoverable({ blocks: [{ canReset: false, spawn: { x: 0, z: 0 } }] }) === false);
        t.ok('the reset trigger is outside the room, not inside it',
            PUZZLE_RESET_AT > 0,
            'leaving is the one action a stuck player can always take');
    }

    // ── The authored pass ──────────────────────────────────────────────────
    {
        let placed = 0;
        const perDungeon = [];
        for (const def of BEAT_LIST) {
            const n = beatNoOf(def);
            const beats = puzzlesForDungeon(def, n);
            perDungeon.push(beats.length);
            placed += beats.length;
        }
        t.ok('every dungeon gets puzzle beats',
            perDungeon.every((c) => c > 0), perDungeon.join(','));
        t.ok('three per dungeon, up from the campaign-wide 1.5',
            placed === 42, `${placed} beats across 14 dungeons`);
        t.ok('the exam room is not the boss room',
            !SLOTS.includes('test'),
            'measured: theme.test IS the boss room in all fourteen dungeons');
        t.ok('the shapes alternate across the campaign',
            flavourFor(1) !== flavourFor(2) && flavourFor(1) === flavourFor(3));
        t.ok('the size floor matches the rooms that exist', MIN_HALF <= 7);
        t.ok('a timed gate is long enough to cross a room', GATE_HOLD >= 4);
    }

    // No puzzle is ever placed in a boss room, and every one has both halves of
    // the pair it needs — a gate with no signal source is a wall.
    {
        let bad = null;
        for (const def of BEAT_LIST) {
            const n = beatNoOf(def);
            for (const { roomId, blockers } of puzzlesForDungeon(def, n)) {
                if (def.rooms[roomId].boss) { bad = `${def.id}/${roomId} is a boss room`; break; }
                const gates = blockers.filter((b) => b.type === 'timed_gate');
                const sources = blockers.filter((b) => ['pressure_plate', 'switch', 'block_socket', 'beam_target'].includes(b.type));
                if (gates.length !== 1) { bad = `${def.id}/${roomId}: ${gates.length} gates`; break; }
                if (!sources.length) { bad = `${def.id}/${roomId}: gate with nothing to open it`; break; }
                if (!sources.some((s) => s.signal === gates[0].signal)) {
                    bad = `${def.id}/${roomId}: nothing publishes ${gates[0].signal}`;
                    break;
                }
                // Anything that needs a block must come with one.
                const needsBlock = blockers.some((b) =>
                    b.type === 'block_socket'
                    || (b.type === 'pressure_plate' && b.accepts === 'block'));
                if (needsBlock && !blockers.some((b) => b.type === 'pushable')) {
                    bad = `${def.id}/${roomId}: needs a block, has none`;
                    break;
                }
                // Beams need a lens AND something to bend with.
                if (blockers.some((b) => b.type === 'beam_source')) {
                    if (!blockers.some((b) => b.type === 'beam_target')
                        || !blockers.some((b) => b.mirror)) {
                        bad = `${def.id}/${roomId}: beam with no lens or no mirror`;
                        break;
                    }
                }
            }
            if (bad) break;
        }
        t.ok('every authored puzzle is complete and solvable on its face',
            bad === null, bad || '');
    }

    // A blocked corner moves the puzzle instead of building over the room.
    {
        const def = BEAT_LIST[0];
        const n = beatNoOf(def);
        const roomId = def.theme.teach;
        const room = def.rooms[roomId];
        const free = puzzleFor(def, roomId, room, n);
        const vaultFree = free.find((b) => b.type === 'vault');
        t.ok('the unobstructed case picks the slot corner',
            vaultFree.rect.x0 < 0 && vaultFree.rect.z0 < 0);

        const moved = puzzleFor(def, roomId, room, n,
            (x, z) => x <= 0 && z <= 0);
        const vaultMoved = moved.find((b) => b.type === 'vault');
        t.ok('an occupied corner is given up', !!vaultMoved
            && !(vaultMoved.rect.x0 < 0 && vaultMoved.rect.z0 < 0),
            JSON.stringify(vaultMoved?.rect));

        t.ok('and when every corner is taken, no puzzle is built',
            puzzleFor(def, roomId, room, n, () => true).length === 0,
            'missing a beat is a cost; walling a key into the scenery is a broken run');

        // ── it does not build across a door ────────────────────────────────
        //
        // The alcove is placed hard against the room's perimeter, and the
        // perimeter is where the doors are. The apron that would have caught this
        // is INWARD-only — an outward apron of solid-geometry tests hits the
        // perimeter wall and disqualifies every corner in every room — so the
        // footprint could land beside a threshold with nothing looking.
        //
        // `tearwell` shipped that way: the alcove sat at gap 0 from the east door,
        // and walking in from `weepinghall` put the player in a pocket of FIVE
        // lattice points beside a raised gate. Three play reports of "locked in
        // when I enter the room". `tests/qa/door-reach.mjs` is the sweep, and it
        // floods from one seed at a time — the older probe merged the spawn and
        // every door into one flood, which is what turned a sealed doorway into a
        // "reachable" island.
        const doorAt = (dx, dz) => (x, z) =>
            Math.abs(x - dx) <= 0 && Math.abs(z - dz) <= 0;
        const slot = puzzleFor(def, roomId, room, n).find((b) => b.type === 'vault');
        // Put a door on the corner the slot prefers, one cell outside its own
        // footprint, and it must give that corner up.
        const dodged = puzzleFor(def, roomId, room, n, () => false, () => false,
            doorAt(slot.rect.x0, slot.rect.z0 - 1));
        const vd = dodged.find((b) => b.type === 'vault');
        t.ok('a corner with a door beside it is given up',
            !!vd && !(vd.rect.x0 === slot.rect.x0 && vd.rect.z0 === slot.rect.z0),
            `door beside ${slot.rect.x0},${slot.rect.z0 - 1} -> ${JSON.stringify(vd?.rect)}`);

        // Two cells of clearance, not one: one cell is not room to turn around.
        const dodged2 = puzzleFor(def, roomId, room, n, () => false, () => false,
            doorAt(slot.rect.x0, slot.rect.z0 - 2));
        const vd2 = dodged2.find((b) => b.type === 'vault');
        t.ok('and a door two cells out is still given room',
            !!vd2 && !(vd2.rect.x0 === slot.rect.x0 && vd2.rect.z0 === slot.rect.z0),
            JSON.stringify(vd2?.rect));

        // A door far from every corner changes nothing.
        const untouched = puzzleFor(def, roomId, room, n, () => false, () => false,
            doorAt(0, 0));
        const vu = untouched.find((b) => b.type === 'vault');
        t.ok('a door nowhere near a corner costs no puzzle',
            !!vu && vu.rect.x0 === slot.rect.x0 && vu.rect.z0 === slot.rect.z0,
            JSON.stringify(vu?.rect));
    }

    // ── The whole campaign, baked ──────────────────────────────────────────
    //
    // Everything above this point measures the TABLE. The counterfactual sweep
    // caught what that misses: widening the corner check by one cell on the
    // outward side makes it collide with the room's own perimeter wall, every
    // corner is refused in every room, and the campaign bakes ZERO puzzles
    // while the table still cheerfully reports forty-two. That is exactly the
    // shape of bug this project keeps finding — the thing being measured is the
    // one place that was fine.
    {
        let caches = 0;
        const perDungeon = [];
        let err = null;
        // Every pushable block the campaign actually builds, and whether the
        // ground it stands on exists.
        let blocksTotal = 0;
        const buried = [];
        const stuck = [];
        for (const def of BEAT_LIST) {
            let level = null;
            try {
                level = createDungeon(
                    {
                        scene: new THREE.Scene(),
                        collisionWorld: new CollisionWorld(),
                        particles: null,
                    },
                    // Prebaked so every room's puzzle is built, not just the
                    // two the player happens to be standing between.
                    { ...def, prebake: true }, { keyStore: keyStoreStub() }
                );
            } catch (e) { err = `${def.id}: ${e.message}`; break; }
            const n = (level.pickups || []).filter((p) => p.label === 'Sealed cache').length;
            perDungeon.push(n);
            caches += n;

            for (const blk of level.puzzleBlocks || []) {
                blocksTotal++;
                const p = blk.position;
                // A block baked inside geometry cannot be shoved a single cell:
                // `resolveMove` clamps it against the thing it is already in,
                // every frame, forever. Two of these shipped.
                if (level.getVoxelAt(p.x, p.y, p.z)) {
                    buried.push(`${def.id} (${p.x.toFixed(1)},${p.z.toFixed(1)})`);
                    continue;
                }
                // And it must have somewhere to go. One legal shove needs the
                // cell behind it to stand in and the cell in front to be clear.
                const canMove = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) =>
                    !level.getVoxelAt(p.x + dx * 1.4, p.y, p.z + dz * 1.4)
                    && !level.getVoxelAt(p.x - dx * 1.4, p.y, p.z - dz * 1.4));
                if (!canMove) stuck.push(`${def.id} (${p.x.toFixed(1)},${p.z.toFixed(1)})`);
            }
            level.dispose?.();
        }
        t.ok('every dungeon bakes with its puzzles in it', err === null, err || '');
        t.ok('and the campaign actually contains them', caches >= 38,
            `${caches} sealed caches baked — the table claims 42, and a handful `
            + 'give up their corner to something the room already put there');
        t.ok('with none of the fourteen left empty',
            perDungeon.length === 14 && perDungeon.every((c) => c >= 2),
            perDungeon.join(','));

        // THE BAKE, NOT THE TABLE.
        //
        // `puzzleFor` only ever asked whether the VAULT's corner was clear. The
        // block, the plate, the socket and the switch were placed at fixed
        // offsets from it and never asked anything at all — and kit props go
        // into the room map and terraces into the platform map long before the
        // puzzle picks its corner. A sweep of all fourteen dungeons found four
        // pieces standing inside solid geometry, two of them pushable blocks
        // that could not move in any direction. Nothing in the suite noticed,
        // because everything in the suite was reading the table.
        t.ok('the campaign builds its blocks', blocksTotal >= 20, `${blocksTotal} blocks`);
        t.ok('and not one of them is baked inside the scenery',
            buried.length === 0, buried.join(', '));
        t.ok('and every one of them can be shoved somewhere',
            stuck.length === 0, stuck.join(', '));
    }

    // ── A shove that moves nothing is not a shove ──────────────────────────
    //
    // `tryPush` used to return true the moment the reach and facing gates
    // passed, whether or not the block had travelled a millimetre. The caller
    // reads that as "pushed": it burns the 0.18s push cooldown and plays the
    // heave. So a block wedged against a wall had the game grunting with effort
    // five times a second while nothing happened, which is a worse signal than
    // silence — it says "keep trying".
    //
    // And the `blocked` predicate is the terrace answer. Phase E2 puts raised
    // ground in the PLATFORM map, meshed deliberately without XZ solids so that
    // a step is standable and can never wall anything off. `resolveMove` only
    // knows XZ solids, so before this there was nothing at all stopping a block
    // being shoved into a ledge to sit half-buried inside it.
    {
        const cw = new CollisionWorld();
        cw.addSolid({ id: 'wall', minX: 2, maxX: 6, minZ: -6, maxZ: 6 });
        // Spawned already flush against the wall (half-extent 0.7, wall at x=2),
        // so there is genuinely nowhere for a +X shove to go.
        const block = new PushableBlock(
            { x: 1.3, y: 1, z: 0 }, 1.4, cw, new THREE.Scene(), { id: 'blk:test' }
        );
        const before = block.position.x;
        const pushed = block.tryPush({ x: 0.1, z: 0 }, { x: 1, z: 0 }, 0.9);
        t.ok('a block against a wall does not move',
            Math.abs(block.position.x - before) < 0.05,
            `moved to ${block.position.x.toFixed(2)}`);
        t.ok('and the push reports that it did not', pushed === false,
            'the caller pays a cooldown and plays a heave for a true');

        // The same block, pushed the other way into open floor.
        const moved = block.tryPush({ x: 2.4, z: 0 }, { x: -1, z: 0 }, 0.9);
        t.ok('a block with room to go does move', moved === true,
            `x ${block.position.x.toFixed(2)}`);

        // Now put a terrace in its path — invisible to the collision world.
        const at = { x: block.position.x - 0.9, z: 0 };
        block.blocked = (x, z) => Math.hypot(x - at.x, z - at.z) < 0.5;
        const x0 = block.position.x;
        const intoTerrace = block.tryPush({ x: block.position.x + 1.4, z: 0 }, { x: -1, z: 0 }, 0.9);
        t.ok('a block is not shoved into a terrace', intoTerrace === false);
        t.ok('and it stayed where it was', Math.abs(block.position.x - x0) < 1e-6);
        block.dispose();
    }

    // ── And something actually hands the block that predicate ──────────────
    //
    // Everything above installs `blocked` BY HAND, so it proves PushableBlock
    // honours the rule and proves nothing whatsoever about anyone giving it one.
    // The counterfactual deleted the single line in `blockers.js` that does, and
    // the suite stayed green while every block in the shipped game forgot
    // terraces existed. An alarm wired to the demo is not wired to the building.
    {
        const sampledY = [];
        const signals = new SignalBus();
        const rt = createBlockerRuntime(
            { scene: new THREE.Scene(), collisionWorld: new CollisionWorld() },
            {
                signals, destructibles: [],
                addVoxelQuery: () => () => {},
                // A terrace running along +X, and only at the block's own body
                // height — floor and headroom are clear.
                getVoxelAt: (x, y) => { sampledY.push(y); return y === 1.0 && x > 0.5; },
                keyStore: keyStoreStub(),
            },
            { type: 'pushable', id: 'p-test', at: { x: 0, z: 0 }, size: 1.4 },
            { x: 0, y: 0, z: 0 }
        );
        const blk = rt.block;
        t.ok('the runtime builds a block', !!blk);
        t.ok('and tells it how to ask about terraces', typeof blk?.blocked === 'function',
            'without this the platform map is invisible to every pushable in the game');

        const x0 = blk.position.x;
        const into = blk.tryPush({ x: blk.position.x - 1.0, z: 0 }, { x: 1, z: 0 }, 0.9);
        t.ok('so a real block will not go into raised ground', into === false);
        t.ok('and it did not move', Math.abs(blk.position.x - x0) < 1e-6);
        t.ok('and it asked at its own body height, not the floor',
            sampledY.length > 0 && sampledY.every((y) => y === 1.0),
            `sampled at y ${[...new Set(sampledY)].join(', ')}`);

        // The other direction, so the claim is not satisfied by a block that
        // refuses every shove.
        const moved = blk.tryPush({ x: blk.position.x + 1.0, z: 0 }, { x: -1, z: 0 }, 0.9);
        t.ok('and open floor still takes one', moved === true);
        blk.dispose?.();
    }

    // ── Hostile geometry never gets a layout it should have refused ────────
    //
    // The counterfactual reported `settle`'s two `return []` refusals as
    // UNCAUGHT, so I went looking for a room that would fire them. There is not
    // one, and the search is worth writing down because three plausible ideas
    // all failed for different reasons:
    //
    //   - Walling the room in half does nothing. `puzzleFor` hands the same
    //     predicate to the corner search, so the vault simply picks a different
    //     corner and the beat is solvable again. That is correct behaviour.
    //   - Salt-and-pepper at 28% is not hostile: `place` searches a ring out to
    //     radius 3 and there is always a cell free in it.
    //   - Density 0.62, a blob centred on each piece, and blocking the whole
    //     interior all go too far — the CORNER SEARCH fails first, so the beat
    //     drops upstream of `settle` and the refusals still never run.
    //
    // Across 1680 random rooms, 170 blobs and 168 interior-blocked rooms,
    // deleting both refusals changes nothing at all. They are unreachable
    // insurance on this content, and nobody should read them as tested.
    //
    // What DOES do the work — and what actually fixed the four pieces that baked
    // inside scenery — is `place` relocating pieces. So that is what this
    // guards, as an invariant over hostile input rather than as a line of code:
    // whatever geometry you hand it, a layout it KEEPS must be one every piece
    // can stand in and every block can finish. Bypassing `settle` puts eight
    // violations on the board.
    {
        const reaches = (from, to, free) => {
            if (from.x === to.x && from.z === to.z) return true;
            const seen = new Set([`${from.x},${from.z}`]);
            const q = [[from.x, from.z]];
            while (q.length) {
                const [bx, bz] = q.shift();
                for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    // A shove needs the cell BEHIND the block to stand in and
                    // the cell in front to move into. Sokoban, not pathfinding.
                    if (!free(bx - dx, bz - dz)) continue;
                    if (!free(bx + dx, bz + dz)) continue;
                    const k = `${bx + dx},${bz + dz}`;
                    if (seen.has(k)) continue;
                    if (k === `${to.x},${to.z}`) return true;
                    seen.add(k);
                    q.push([bx + dx, bz + dz]);
                }
            }
            return false;
        };
        const TGT = new Set(['pressure_plate', 'block_socket', 'switch', 'beam_target']);

        let cases = 0, kept = 0;
        const bad = [];
        for (const def of BEAT_LIST) {
            const beatNo = beatNoOf(def);
            for (const [roomId, room] of Object.entries(def.rooms || {})) {
                const base = puzzleFor(def, roomId, room, beatNo);
                if (!base.length) continue;
                const half = room.half || 0;
                for (const aim of base.filter((b) => b.at && b.type !== 'vault').map((b) => b.at)) {
                    for (const r of [3, 4]) {
                        const isBlocked = (x, z) =>
                            Math.abs(x - aim.x) <= r && Math.abs(z - aim.z) <= r;
                        cases++;
                        const out = puzzleFor(def, roomId, room, beatNo, isBlocked);
                        if (!out.length) continue;
                        kept++;

                        const taken = new Set();
                        const vault = out.find((b) => b.type === 'vault');
                        if (vault) {
                            for (let x = vault.rect.x0; x <= vault.rect.x1; x++) {
                                for (let z = vault.rect.z0; z <= vault.rect.z1; z++) taken.add(`${x},${z}`);
                            }
                        }
                        for (const b of out) if (b.at) taken.add(`${b.at.x},${b.at.z}`);

                        for (const b of out) {
                            if (!b.at) continue;
                            if (isBlocked(b.at.x, b.at.z)) {
                                bad.push(`${def.id}/${roomId}: ${b.type} buried at ${b.at.x},${b.at.z}`);
                            } else if (Math.abs(b.at.x) > half - 1 || Math.abs(b.at.z) > half - 1) {
                                bad.push(`${def.id}/${roomId}: ${b.type} outside the room`);
                            }
                        }

                        const src = out.find((q) => q.type === 'beam_source' && q.at);
                        const lens = out.find((q) => q.type === 'beam_target' && q.at);
                        const tgt = out.find((q) => q.at && TGT.has(q.type) && q.type !== 'switch');
                        for (const b of out) {
                            if (b.type !== 'pushable' || !b.at) continue;
                            const dest = b.mirror
                                ? (src && lens ? { x: lens.at.x, z: src.at.z } : null)
                                : (tgt ? tgt.at : null);
                            if (!dest) continue;
                            const free = (x, z) => Math.abs(x) <= half - 1 && Math.abs(z) <= half - 1
                                && !isBlocked(x, z)
                                && (!taken.has(`${x},${z}`)
                                    || (x === dest.x && z === dest.z)
                                    || (x === b.at.x && z === b.at.z));
                            if (!reaches(b.at, dest, free)) {
                                bad.push(`${def.id}/${roomId}: block ${b.at.x},${b.at.z} cannot reach ${dest.x},${dest.z}`);
                            }
                        }
                    }
                }
            }
        }
        // Both halves stated, so this cannot be satisfied by a settle() that
        // refuses everything — an empty campaign has no violations either.
        t.ok('hostile rooms are still mostly laid out', kept > cases * 0.5,
            `kept ${kept} of ${cases}`);
        t.ok('and not one kept layout buries a piece or strands a block',
            bad.length === 0,
            bad.slice(0, 3).join('; '));
    }

    // ── You can actually walk into the side room ───────────────────────────
    //
    // The owner, on a second play: "the side rooms" are "too close to what we
    // are unlocking to be able to get in".
    //
    // Every cell-level check in the puzzle probes passed throughout — each cell
    // in that doorway WAS empty, standable and reachable. None of them asked how
    // much room a BODY has. The alcove's side walls ran its full depth, met the
    // open face and pinched the mouth down to one cell: a 1.0 gap for a hero
    // whose collision half-extent is 0.4, i.e. 0.10 of clearance per side, on
    // every reward alcove in the campaign.
    //
    // Measured off the walls the vault runtime actually builds, in all four
    // orientations, because the mouth is derived per-side and getting three of
    // them right is this project's most repeated bug.
    {
        const mouthOf = (open) => {
            const queries = [];
            createBlockerRuntime(
                { scene: new THREE.Scene(), collisionWorld: new CollisionWorld() },
                {
                    signals: new SignalBus(), destructibles: [], keyStore: keyStoreStub(),
                    addVoxelQuery: (fn) => { queries.push(fn); return () => {}; },
                    getVoxelAt: () => false,
                },
                { type: 'vault', id: 'v', rect: { x0: -1, x1: 1, z0: -1, z1: 1 }, open },
                { x: 0, y: 0, z: 0 }
            );
            const solid = (x, z) => queries.some((q) => q(x, 1.5, z));
            const face = [];
            for (let i = -1; i <= 1; i++) {
                if (open === 'S') face.push([i, 1]);
                else if (open === 'N') face.push([i, -1]);
                else if (open === 'E') face.push([1, i]);
                else face.push([-1, i]);
            }
            return {
                open: face.filter(([x, z]) => !solid(x, z)).length,
                solid,
            };
        };

        const tight = [];
        for (const open of ['N', 'S', 'E', 'W']) {
            const m = mouthOf(open);
            if (m.open < 3) tight.push(`${open}:${m.open}`);
        }
        t.ok('a reward alcove opens its whole face, not one cell',
            tight.length === 0,
            `${tight.join(' ')} — a 0.4 body needs more than 0.10 of clearance`);

        // And it is still an alcove: three walls, one way in.
        const s = mouthOf('S');
        t.ok('the back wall is still there', s.solid(0, -1));
        t.ok('and both sides are still walled', s.solid(-1, 0) && s.solid(1, 0));

        // ── and the room behind the door is not a slot ─────────────────────
        //
        // Widening the mouth last time fixed the DOOR. The side walls stand on
        // the outermost columns, so a three-wide alcove still enclosed a
        // one-cell interior: a 1.0 space around a 0.8 body, 0.10 of clearance a
        // side — the very number that made the doorway unusable, moved one step
        // further in. `flush` names the side already backed by the room's own
        // perimeter wall, one cell outside the footprint; the vault wall there
        // seals nothing and costs the whole interior.
        const flushed = (open, flush) => {
            const queries = [];
            createBlockerRuntime(
                { scene: new THREE.Scene(), collisionWorld: new CollisionWorld() },
                {
                    signals: new SignalBus(), destructibles: [], keyStore: keyStoreStub(),
                    addVoxelQuery: (fn) => { queries.push(fn); return () => {}; },
                    getVoxelAt: () => false,
                },
                { type: 'vault', id: 'v', rect: { x0: -1, x1: 1, z0: -1, z1: 1 }, open, flush },
                { x: 0, y: 0, z: 0 }
            );
            return (x, z) => queries.some((q) => q(x, 1.5, z));
        };

        for (const [flush, gone, kept] of [['E', 1, -1], ['W', -1, 1]]) {
            const f = flushed('S', flush);
            t.ok(`the ${flush} wall is not built when the room's own wall is already there`,
                !f(gone, 0), `flush ${flush}`);
            t.ok('the other side is still walled', f(kept, 0), `flush ${flush}`);
            t.ok('and the back wall still is too', f(0, -1), `flush ${flush}`);
            // Two cells of interior, not one: the open column plus the middle.
            const interior = [-1, 0, 1].filter((x) => !f(x, 0)).length;
            t.ok('the alcove interior is two cells across, not one', interior === 2,
                `flush ${flush} — ${interior} free of 3`);
        }

        // The gate spans the whole face, so a closed vault is exactly as closed
        // as it was before the mouth was widened — otherwise this "fix" would
        // have quietly deleted the puzzle.
        const gate = [];
        createBlockerRuntime(
            { scene: new THREE.Scene(), collisionWorld: new CollisionWorld() },
            {
                signals: new SignalBus(), destructibles: [], keyStore: keyStoreStub(),
                addVoxelQuery: (fn) => { gate.push(fn); return () => {}; },
                getVoxelAt: () => false,
            },
            {
                type: 'timed_gate', id: 'g', signal: 'sig',
                rect: { x0: -1, x1: 1, z0: 1, z1: 1 },
                clear: { x0: -1, x1: 1, z0: -1, z1: 1 },
            },
            { x: 0, y: 0, z: 0 }
        );
        const gateSolid = (x, z) => gate.some((q) => q(x, 1.5, z));
        let sealed = 0;
        for (let x = -1; x <= 1; x++) if (gateSolid(x, 1)) sealed++;
        t.ok('and the gate still seals every cell of that wider face',
            sealed === 3, `${sealed}/3 sealed`);
    }

    // ── Every weapon can work a switch ─────────────────────────────────────
    //
    // The switch rides the destructible list on the stated assumption that it is
    // "the one channel every weapon already routes a swing through". It is not.
    // The player-side loop is gated on `weapon.shatter`, which is true of the
    // Tectonic Wedge and the Heavy Mallet and of nothing else — so a player
    // holding the Anchor Link, the Bare Strike or the Light Caster could not
    // work a switch at all. Switches are the entire puzzle vocabulary of the
    // seven even-numbered dungeons, and this shipped.
    //
    // Driven through the real `tryAttack`, against the switch the RUNTIME
    // BUILDS, and read out through the signal it is supposed to raise.
    //
    // The first version of this section built its own switch literal — and
    // hard-coded into that literal the very `struckByAnything: true` the real
    // switch was missing. So it proved every weapon swings correctly at a switch
    // that has already been fixed, and the defect it exists to catch was
    // invisible to it: the counterfactual flipped the runtime's flag to false
    // and this stayed green. Test the bake, not the table.
    {
        const buildSwitch = () => {
            const signals = new SignalBus();
            const destructibles = [];
            const rt = createBlockerRuntime(
                { scene: new THREE.Scene(), collisionWorld: new CollisionWorld() },
                {
                    signals, destructibles,
                    addVoxelQuery: () => () => {},
                    getVoxelAt: () => false,
                    keyStore: keyStoreStub(),
                },
                { type: 'switch', id: 'sw-test', signal: 'sig', at: { x: 1.4, z: 0 } },
                { x: 0, y: 0, z: 0 }
            );
            return { rt, signals, destructibles };
        };
        // The opt-in itself, stated once and directly, so that if it ever goes
        // the failure names the cause instead of ten weapons.
        {
            const { destructibles } = buildSwitch();
            t.ok('the runtime puts its switch on the destructible list',
                destructibles.length === 1);
            t.ok('and the switch opts in to being struck by anything',
                destructibles[0]?.struckByAnything === true,
                'without this only the Wedge and the Mallet reach it');
        }

        const missed = [];
        for (const id of Object.keys(WEAPONS)) {
            const w = getWeapon(id);
            if (!w.damage) continue;
            const { rt, signals, destructibles } = buildSwitch();
            const player = new Player(new THREE.Scene(), new CollisionWorld(), (x, y) => y < 1);
            player.rig.position.set(0, 1.95, 0);
            player.inventory.activeWeapon = id;
            player.state.facingVec = { x: 1, z: 0 };
            player.state.facing = 1;
            player.attackCd = 0;
            player.tryAttack([], destructibles);
            // The signal is the actual deliverable — a switch that lights up and
            // opens nothing is not a switch.
            rt.update(0.016, { player });
            if (!signals.get('sig')) missed.push(id);
        }
        t.ok('every weapon in the game can set off a switch',
            missed.length === 0,
            `${missed.join(', ')} cannot — and the switch dungeons are half the campaign`);

        // Ore is NOT struck by anything, and that is the point of the gating:
        // breaking rock is what the Wedge and the Mallet are for.
        const ore = {
            hits: 0,
            shatterAtWorld() { this.hits++; return 1; },
        };
        const light = new Player(new THREE.Scene(), new CollisionWorld(), (x, y) => y < 1);
        light.rig.position.set(0, 1.95, 0);
        light.inventory.activeWeapon = 'anchor_link';
        light.state.facingVec = { x: 1, z: 0 };
        light.attackCd = 0;
        light.tryAttack([], [ore]);
        t.ok('and the link still cannot break ore', ore.hits === 0,
            'the shatter gating is a reward for carrying the heavy weapons');
    }

    // ── A spin reaches behind you ──────────────────────────────────────────
    //
    // `_strike` samples ALONG a reach, which is right for everything that has a
    // front. A radial move does not have one — the Mallet's charge is a 360°
    // spin, and its whole identity is that it does not care which way you are
    // pointing. Sampled forward like the rest, a spin would sweep straight
    // through a switch at its back and leave it unstruck, which is precisely
    // the move a player reaches for when things are on both sides of them.
    //
    // Asserted in WORLD SPACE and in every direction, not as an angle: put the
    // switch at each of the four compass points around a player who is facing
    // east, and demand all four.
    {
        const dirs = [
            ['ahead', 1, 0], ['behind', -1, 0], ['left', 0, -1], ['right', 0, 1],
        ];
        const mallet = Object.entries(WEAPONS)
            .find(([, w]) => w.charge?.radial);
        t.ok('some weapon charges into a spin', !!mallet,
            'if the radial charge is gone this section is testing nothing');
        if (mallet) {
            const [id, w] = mallet;
            const unreached = [];
            for (const [label, dx, dz] of dirs) {
                const at = { x: dx * (w.charge.range * 0.5), z: dz * (w.charge.range * 0.5) };
                let struck = 0;
                const sw = {
                    struckByAnything: true,
                    shatterAtWorld(x, y, z, r) {
                        if (Math.hypot(x - at.x, z - at.z) > (r || 0)) return 0;
                        struck++;
                        return 1;
                    },
                };
                const p = new Player(new THREE.Scene(), new CollisionWorld(), (x, y) => y < 1);
                p.rig.position.set(0, 1.95, 0);
                p.inventory.activeWeapon = id;
                p.state.facingVec = { x: 1, z: 0 };
                p._resolveCharge({ weapon: w, charge: w.charge }, [], [sw]);
                if (!struck) unreached.push(label);
            }
            t.ok('the spin sets off a switch on every side of the player',
                unreached.length === 0,
                `${unreached.join(', ')} went unstruck by a move that turns all the way round`);
        }

        // And the committed lunge is a BODY, not a reach: it is lethal where it
        // is, so it too is sampled at the player rather than in front of them.
        //
        // Asserted by recording WHERE it sampled, not by whether a switch at the
        // origin happened to be caught. The first version of this asked "was
        // something at (0,0) struck, within r" — and a lunge sampled forward in
        // steps of `radius` puts its first sample at exactly `radius`, which
        // sits precisely ON that boundary and passed. The counterfactual caught
        // it: the whole fix could be reverted with this claim still green. A
        // claim about a position should read the position.
        {
            const sampled = [];
            const sw = {
                struckByAnything: true,
                shatterAtWorld(x, y, z) { sampled.push({ x, z }); return 0; },
            };
            const p = new Player(new THREE.Scene(), new CollisionWorld(), (x, y) => y < 1);
            p.rig.position.set(0, 1.95, 0);
            p.state.facingVec = { x: 1, z: 0 };
            p.dashAttackT = 0.1;
            p._dashAttackHit = new Set();
            p._tickDashAttack(0.016, [], [sw]);
            t.ok('the lunging body samples somewhere', sampled.length > 0);
            const off = sampled
                .map((s) => Math.hypot(s.x, s.z))
                .filter((d) => d > 1e-9);
            t.ok('and it samples where the player IS, not ahead of them',
                sampled.length > 0 && off.length === 0,
                `sampled ${off.map((d) => d.toFixed(2)).join(', ')} units in front`);
        }
    }

    // ── The gate does not close on the player ──────────────────────────────
    //
    // The vault behind a timed gate is a one-cell alcove with three permanent
    // walls. A gate that re-raises while the player is standing in it seals them
    // into a box with no exit, no way to re-trigger the switch outside, and no
    // reset — the block reset only fires when you LEAVE the room, which you now
    // cannot. On every even-numbered dungeon the sequence that produces it is
    // "hit the switch, walk in, take the cache, wait six seconds", which is
    // simply what taking a cache looks like.
    {
        const rt = createBlockerRuntime(
            {
                scene: new THREE.Scene(),
                collisionWorld: new CollisionWorld(),
            },
            {
                signals: new SignalBus(),
                destructibles: [],
                addVoxelQuery: () => () => {},
                getVoxelAt: () => false,
                keyStore: keyStoreStub(),
            },
            {
                type: 'timed_gate', id: 'gate-test', signal: 'sig',
                rect: { x0: -1, x1: 1, z0: 2, z1: 2 },
                clear: { x0: -1, x1: 1, z0: 2, z1: 4 },
            },
            { x: 0, y: 0, z: 0 }
        );
        t.ok('a gate starts closed', rt.raised === true);

        const at = (x, z) => ({ player: { root: { position: { x, y: 1.95, z } } } });
        rt.update(0.016, at(0, 20));
        t.ok('and stays closed with the signal off and nobody near',
            rt.raised === true);

        rt.update(0.016, at(0, 8));
        t.ok('still closed until the signal says otherwise', rt.raised === true);

        // A player INSIDE the footprint with the signal off is not a puzzle
        // state, it is a trapped player, so the gate opens for them. This
        // assertion used to read `raised === true` and was describing a sealed
        // box: signal off and player inside ran neither branch, so the gate
        // simply stayed up for good.
        rt.update(0.016, at(0, 3));
        t.ok('but a player sealed inside the footprint is let out',
            rt.raised === false, 'signal off + player inside used to do nothing');

        const bus = new SignalBus();
        bus.set('sig', true);
        const rt2 = createBlockerRuntime(
            { scene: new THREE.Scene(), collisionWorld: new CollisionWorld() },
            {
                signals: bus, destructibles: [], addVoxelQuery: () => () => {},
                getVoxelAt: () => false, keyStore: keyStoreStub(),
            },
            {
                type: 'timed_gate', id: 'gate-test-2', signal: 'sig',
                rect: { x0: -1, x1: 1, z0: 2, z1: 2 },
                clear: { x0: -1, x1: 1, z0: 2, z1: 4 },
            },
            { x: 0, y: 0, z: 0 }
        );
        rt2.update(0.016, at(0, 3));
        t.ok('an open gate is open', rt2.raised === false);
        bus.set('sig', false);
        rt2.update(0.016, at(0, 3));
        t.ok('and does NOT shut on a player standing in the alcove',
            rt2.raised === false, 'this is a sealed box with no way out');
        rt2.update(0.016, at(0, 2));
        t.ok('nor on one standing in the doorway itself', rt2.raised === false);
        rt2.update(0.016, at(0, -8));
        t.ok('but shuts the moment they are clear', rt2.raised === true);
        rt.dispose(); rt2.dispose();

        // ── the gate on the OTHER edge, which is the one that lifted people ──
        //
        // Both fixtures above hang the gate on the clear rect's LOW edge, and the
        // old margin (`z0 - 1`) was a full cell there. The campaign hangs it on
        // the HIGH edge for two of every three slots — `CORNER.teach` and
        // `CORNER.develop` are both `sz: -1`, so `gateZ` is `z1` — and on that
        // side the old test read `lz <= clear.z1 + 1`, which is the footprint's
        // exact world edge with NO room for a body at all. So this geometry, not
        // the geometry above, is what shipped, and it is where the bug lived.
        //
        // A hero 0.2 short of the gate's own cell still overlaps it by 0.2. The
        // gate came up underneath them, lifted them two cells onto its roof, and
        // they slid off the inner side into an alcove whose walls are two high
        // against a one-cell step, with the plate outside. Reproduced live in
        // `tearwell` before this was written: feet at y 2.99 on a gate topped at
        // y 3, grounded false, falling in.
        const bus3 = new SignalBus();
        const rt3 = createBlockerRuntime(
            { scene: new THREE.Scene(), collisionWorld: new CollisionWorld() },
            {
                signals: bus3, destructibles: [], addVoxelQuery: () => () => {},
                getVoxelAt: () => false, keyStore: keyStoreStub(),
            },
            {
                type: 'timed_gate', id: 'gate-test-3', signal: 'sig',
                rect: { x0: -1, x1: 1, z0: 0, z1: 0 },
                clear: { x0: -1, x1: 1, z0: -2, z1: 0 },
            },
            { x: 0, y: 0, z: 0 }
        );
        // Open it first — a gate is built raised, and "does not rise through a
        // body" is only a claim about a gate that is currently down.
        bus3.set('sig', true);
        rt3.update(0.016, at(0, 6));
        t.ok('the far-edge gate opens on its signal', rt3.raised === false);
        bus3.set('sig', false);

        // The gate's cell spans world z 0..1. A hero at 1.2 reaches back to 0.8.
        rt3.update(0.016, at(0, 1.2));
        t.ok('a gate does not rise through a body standing against its far face',
            rt3.raised === false,
            'it lifts them onto its roof and drops them in the alcove');
        rt3.update(0.016, at(0, 6));
        t.ok('and does close once nothing is touching it', rt3.raised === true);

        // The net: whoever is behind a shut gate gets let out.
        rt3.update(0.016, at(0, -1));
        t.ok('a closed gate opens for a player sealed behind it',
            rt3.raised === false, 'signal off + player inside used to do nothing at all');
        rt3.update(0.016, at(0, 6));
        t.ok('and shuts again behind them', rt3.raised === true);
        rt3.dispose();
    }

    // ── The mirror turns the beam toward the lens, in world space ──────────
    //
    // HANDOFF trap 1, and it applies to reflections as much as to swings: this
    // is stated as "the light arrives at the lens", never as a spin value. The
    // spin was hard-coded to 1, which is correct for the corner the `combine`
    // slot prefers and wrong for the other three — and a puzzle only falls back
    // to another corner when the room has already filled the first one, so the
    // broken case is precisely the one nobody would ever have played.
    {
        const def = BEAT_LIST.find((d) => d.id === 'beat-12-pyre');
        const roomId = def.theme.combine;
        const room = def.rooms[roomId];

        // Drive all four corners by refusing the ones before it in the order.
        const refusedCorners = [];
        for (let skip = 0; skip < 4; skip++) {
            const half = room.half;
            const corners = [
                { sx: -1, sz: 1 }, { sx: -1, sz: -1 }, { sx: 1, sz: -1 }, { sx: 1, sz: 1 },
            ];
            const dead = new Set();
            for (let i = 0; i < skip; i++) {
                const c = corners[i];
                const bx = c.sx > 0 ? half - 3 : -half + 1;
                const bz = c.sz > 0 ? half - 3 : -half + 1;
                dead.add(`${bx + 1},${bz + 1}`);
            }
            const pieces = puzzleFor(def, roomId, room, 12, (x, z) => dead.has(`${x},${z}`));
            if (!pieces.length) { refusedCorners.push(`skip${skip}: no beat`); continue; }
            const src = pieces.find((p) => p.type === 'beam_source');
            const lens = pieces.find((p) => p.type === 'beam_target');
            const mirror = pieces.find((p) => p.mirror);
            if (!src || !lens || !mirror) { refusedCorners.push(`skip${skip}: missing piece`); continue; }
            // Put the mirror where the puzzle wants it — the beam's row, the
            // lens's column — and ask whether the light gets there.
            const res = traceBeam(src, {
                mirrors: [{ position: { x: lens.at.x, z: src.at.z }, spin: mirror.spin }],
                targets: [{ at: lens.at, r: 0.9, signal: 'x' }],
                isSolid: () => false,
            });
            if (!res.hit) refusedCorners.push(`skip${skip}: beam missed the lens`);
        }
        t.ok('the mirror lights the lens from every corner the vault can take',
            refusedCorners.length === 0, refusedCorners.join('; '));
    }

    // ── Settling: a piece with nowhere to stand moves, or the beat is cut ───
    //
    // Pure logic, driven by a predicate rather than a room, because the claim is
    // about the ALGORITHM: given a room that has already filled a cell, does the
    // piece that wanted it end up somewhere legal? The campaign sweep above says
    // the answer is currently yes everywhere; this says it is yes *because the
    // code looks*, and would still be checked if the campaign changed shape.
    {
        const def = BEAT_LIST[0];
        const roomId = def.theme.teach;
        const room = def.rooms[roomId];
        const beatNo = 1;

        const base = puzzleFor(def, roomId, room, beatNo);
        const loose = base.filter((b) => b.at);
        t.ok('the reference beat places loose pieces', loose.length >= 2,
            `${loose.length}`);

        // Block the exact cells the pieces wanted. Every one of them has to move.
        const wanted = new Set(loose.map((b) => `${b.at.x},${b.at.z}`));
        const moved = puzzleFor(def, roomId, room, beatNo,
            (x, z) => wanted.has(`${x},${z}`));
        t.ok('a beat whose furniture is in the way still gets built',
            moved.length > 0, 'nudging beats declining');
        t.ok('and nothing was left standing in it',
            moved.filter((b) => b.at).every((b) => !wanted.has(`${b.at.x},${b.at.z}`)),
            moved.filter((b) => b.at).map((b) => `${b.type}@${b.at.x},${b.at.z}`).join(' '));

        // And two pieces never settle onto the same cell as each other.
        const cells = moved.filter((b) => b.at).map((b) => `${b.at.x},${b.at.z}`);
        t.ok('two pieces never share a cell', new Set(cells).size === cells.length,
            cells.join(' '));

        // A room that is solid everywhere gets no puzzle rather than a broken
        // one. Showing the player a puzzle that cannot be solved is worse than
        // showing them an empty room, and this file already takes that trade
        // once for the corner search.
        t.ok('a room with no free ground declines the beat',
            puzzleFor(def, roomId, room, beatNo, () => true).length === 0);
    }

    // ── End to end: a real dungeon, with real pieces in it ─────────────────
    {
        const def = BEAT_LIST[0];
        let level = null;
        let err = null;
        try {
            level = createDungeon(
                { scene: new THREE.Scene(), collisionWorld: new CollisionWorld(), particles: null },
                def, { keyStore: keyStoreStub() }
            );
        } catch (e) { err = e; }
        t.ok('a dungeon with puzzles in it bakes', !err && !!level,
            err ? String(err.message) : '');
        if (level) {
            t.ok('the level exposes a signal bus', level.signals instanceof SignalBus);
            t.ok('and blocks are registered where every piece can see them',
                Array.isArray(level.puzzleBlocks));
            const blocks = level.puzzleBlocks;
            t.ok('the start room baked its block', blocks.length >= 1,
                `${blocks.length}`);
            for (const b of blocks) {
                t.ok('every placed block knows where it started',
                    !!b.spawn && b.canReset === true);
            }
            // The reward exists and is behind the gate.
            const cache = (level.pickups || []).filter((p) => p.label === 'Sealed cache');
            t.ok('each vault has something worth opening it for', cache.length >= 1,
                `${cache.length} caches`);
            t.ok('and the cache is not buried',
                cache.every((p) => !level.getVoxelAt(
                    p.mesh.position.x, p.mesh.position.y, p.mesh.position.z)),
                'the cache sits in the interior its walls do not fill');

            // ── nothing stands where the player arrives ────────────────────
            //
            // The soft-occupancy predicate accounted for pickups and enemy
            // spawns and never for the hero. The `develop` switch is authored
            // five units diagonally out from the vault, which in a half-7 room
            // lands on exactly 0,0 — `gravecanopy` and `slagworks` both put a
            // switch INSIDE the player's body on entry, and eight more pieces sat
            // a diagonal step away. A switch you are standing in reads as
            // scenery: the owner's report was "the other room does not even have
            // a switch".
            //
            // Asserted against the BAKE, not the table, because the predicate
            // that fixes it lives in `room-graph` and the authored offsets are
            // unchanged. `tests/qa/switch-works.mjs` sweeps all fourteen.
            // ON A DUNGEON THAT ACTUALLY HAD THE BUG.
            //
            // The first version of this assertion ran on `BEAT_LIST[0]`, which
            // never had a piece on its spawn — so it passed with the fix reverted
            // and tested nothing. The offenders were the switch-flavoured beats:
            // beat 08's `gravecanopy` and beat 12's `slagworks` sat at exactly
            // 0,0. Pick a fixture that fails without the fix.
            const onSpawn = [];
            for (const beat of ['beat-08-bone', 'beat-02-spindle']) {
                const d2 = BEAT_LIST.find((b) => b.id === beat);
                if (!d2) continue;
                let lv2 = null;
                try {
                    lv2 = createDungeon(
                        { scene: new THREE.Scene(), collisionWorld: new CollisionWorld(), particles: null },
                        { ...d2, prebake: true }, { keyStore: keyStoreStub() }
                    );
                } catch (e) { onSpawn.push(`${beat}: bake failed ${e.message}`); continue; }
                for (const [rid, r] of Object.entries(d2.rooms || {})) {
                    for (const p of lv2.puzzleDefs(rid)) {
                        if (!p.at) continue;
                        const dd = Math.hypot(p.at.x - (r.spawn?.x || 0),
                            p.at.z - (r.spawn?.z || 0));
                        if (dd < 2.0) {
                            onSpawn.push(`${beat}/${rid}:${p.type}@${p.at.x},${p.at.z} (${dd.toFixed(2)})`);
                        }
                    }
                }
                lv2.dispose?.();
            }
            t.ok('no puzzle piece stands on the spot the player arrives at',
                onSpawn.length === 0, onSpawn.join('  '));
            level.dispose?.();
        }
    }
}
